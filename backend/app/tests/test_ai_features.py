from __future__ import annotations

import os
import tempfile
import unittest
from datetime import date as dt_date
from sqlalchemy.orm import Session, sessionmaker

from app.database.base import Base, import_all_models
from app.database.connection import create_app_engine
from app.core.security import hash_password
from app.models.budget import Budget
from app.models.savings import SavingsContribution, SavingsGoal
from app.models.transaction import Transaction
from app.models.user import User
from app.services.ai_copilot_service import process_copilot_chat
from app.services.auth_service import to_paise
from app.services.prediction_service import calculate_expense_predictions
from app.services.savings_coach_service import generate_savings_coach_plan
from app.services.voice_parser_service import parse_voice_command


class AIFeaturesDirectTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp_dir = tempfile.TemporaryDirectory()
        db_path = os.path.join(self._tmp_dir.name, "test_ai_direct.db")
        self.engine = create_app_engine(f"sqlite:///{db_path}")
        import_all_models()
        Base.metadata.create_all(bind=self.engine)
        self.TestingSessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=self.engine,
            class_=Session,
            expire_on_commit=False,
        )
        self.db = self.TestingSessionLocal()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        self._tmp_dir.cleanup()

    def _create_user(self, name: str = "Aarav Sharma") -> User:
        user = User(
            name=name,
            email=f"{name.lower().replace(' ', '_')}@finora.test",
            hashed_password=hash_password("FinoraDev#2026"),
            currency="INR",
            monthly_income_target_paise=to_paise(75000.0),
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def test_copilot_chat_deterministic_engine(self) -> None:
        user = self._create_user("Aarav Sharma")
        today_str = dt_date.today().isoformat()

        # Add genuine transactions
        salary_tx = Transaction(
            user_id=user.id,
            title="Tech Salary",
            amount_paise=to_paise(85000.0),
            type="income",
            category="Salary",
            date=today_str,
            payment_method="Bank Transfer",
            description="Monthly paycheck",
            status="completed",
        )
        dining_tx = Transaction(
            user_id=user.id,
            title="Swiggy Delivery",
            amount_paise=to_paise(3200.0),
            type="expense",
            category="Food",
            date=today_str,
            payment_method="UPI",
            description="Dinner order",
            status="completed",
        )
        self.db.add_all([salary_tx, dining_tx])
        self.db.commit()

        # 1. Ask balance
        res = process_copilot_chat(self.db, user.id, "What is my current balance?")
        self.assertFalse(res.is_generative)  # Rule engine flag
        self.assertIn("FINORA Rule Engine", res.model_used)
        self.assertIn("81,800", res.reply)  # 85,000 - 3,200
        self.assertTrue(len(res.suggested_prompts) > 0)

        # 2. Ask highest spending
        res_spend = process_copilot_chat(self.db, user.id, "Where did I spend my money?")
        self.assertIn("Food", res_spend.reply)
        self.assertIn("3,200", res_spend.reply)

    def test_expense_prediction_burn_rate_and_overrun(self) -> None:
        user = self._create_user("Priya Verma")
        today = dt_date.today()
        today_str = today.isoformat()
        current_month = today.strftime("%Y-%m")

        # Create budget for Food: ₹4,000
        budget = Budget(
            user_id=user.id,
            category="Food",
            limit_paise=to_paise(4000.0),
            month=current_month,
            alert_threshold=80,
            notes="Food budget",
        )
        # Add Food expense of ₹3,500 early in the month
        tx = Transaction(
            user_id=user.id,
            title="Restaurant outing",
            amount_paise=to_paise(3500.0),
            type="expense",
            category="Food",
            date=today_str,
            payment_method="Credit Card",
            description="Dinner",
            status="completed",
        )
        self.db.add_all([budget, tx])
        self.db.commit()

        preds = calculate_expense_predictions(self.db, user.id, target_date=today)
        self.assertEqual(preds.current_month, current_month)
        self.assertEqual(preds.current_spent, 3500.0)
        self.assertGreaterEqual(preds.predicted_total_spend, 3500.0)

        food_cat = next((c for c in preds.categories if c.category == "Food"), None)
        self.assertIsNotNone(food_cat)
        self.assertEqual(food_cat.current_month_spent, 3500.0)
        self.assertEqual(food_cat.budget_limit, 4000.0)

        # Methodology handles insufficient history honestly
        self.assertFalse(preds.has_sufficient_history)
        self.assertIn("burn-rate", preds.methodology_note.lower())

    def test_savings_coach_plan_strict_safety(self) -> None:
        user = self._create_user("Karan Patel")
        today = dt_date.today()
        today_str = today.isoformat()
        target_date = dt_date(today.year + 1, today.month, 1).isoformat()

        # Create active goal: ₹30,000 target, ₹5,000 current
        goal = SavingsGoal(
            user_id=user.id,
            name="Emergency Fund",
            category="Emergency",
            target_amount_paise=to_paise(30000.0),
            current_amount_paise=to_paise(5000.0),
            target_date=target_date,
            priority="high",
        )
        # Add discretionary spending in Shopping: ₹8,000
        shopping_tx = Transaction(
            user_id=user.id,
            title="Clothes shopping",
            amount_paise=to_paise(8000.0),
            type="expense",
            category="Shopping",
            date=today_str,
            payment_method="Credit Card",
            description="Wardrobe update",
            status="completed",
        )
        self.db.add_all([goal, shopping_tx])
        self.db.commit()

        # Run Coach
        plan = generate_savings_coach_plan(self.db, user.id)
        self.assertGreater(plan.total_potential_monthly_savings, 0.0)
        self.assertEqual(plan.active_goals_count, 1)

        shopping_rec = next((r for r in plan.recommendations if r.category == "Shopping"), None)
        self.assertIsNotNone(shopping_rec)
        self.assertEqual(shopping_rec.associated_goal_id, goal.id)
        self.assertGreater(shopping_rec.days_accelerated, 0)
        self.assertGreater(shopping_rec.suggested_deposit_amount, 0.0)

        # STRICT SAFETY CHECK: verify database goal and balances are 100% UNTOUCHED
        self.db.refresh(goal)
        self.assertEqual(goal.current_amount_paise, to_paise(5000.0))
        contrib_count = len(goal.contributions)
        self.assertEqual(contrib_count, 0)

    def test_voice_command_parser(self) -> None:
        user = self._create_user("Meera Nair")

        # 1. Parse Voice Transaction
        transcript = "Spent 750 rupees on dinner at Dominos via UPI"
        res = parse_voice_command(self.db, user.id, transcript)
        self.assertEqual(res.intent, "add_transaction")
        self.assertTrue(res.requires_confirmation)  # Strict safety requirement
        self.assertIsNotNone(res.parsed_transaction)
        self.assertEqual(res.parsed_transaction.amount, 750.0)
        self.assertEqual(res.parsed_transaction.category, "Food")
        self.assertEqual(res.parsed_transaction.payment_method, "UPI")
        self.assertEqual(res.parsed_transaction.type, "expense")
        self.assertIn("750", res.spoken_feedback)

        # 2. Parse Voice Query
        q_res = parse_voice_command(self.db, user.id, "What is my current balance?")
        self.assertEqual(q_res.intent, "query_balance")
        self.assertFalse(q_res.requires_confirmation)
        self.assertIn("Net Balance", q_res.spoken_feedback)


if __name__ == "__main__":
    unittest.main()

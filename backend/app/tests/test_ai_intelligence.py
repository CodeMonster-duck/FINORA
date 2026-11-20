from __future__ import annotations

import os
import tempfile
import unittest
from datetime import date as dt_date, timedelta
from sqlalchemy.orm import Session, sessionmaker

from app.database.base import Base, import_all_models
from app.database.connection import create_app_engine
from app.core.security import hash_password
from app.models.budget import Budget
from app.models.savings import SavingsGoal
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.ai import CopilotChatMessage
from app.services.ai_copilot_service import process_copilot_chat, _detect_query_language
from app.services.auth_service import to_paise


class AIIntelligenceTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp_dir = tempfile.TemporaryDirectory()
        db_path = os.path.join(self._tmp_dir.name, "test_intelligence.db")
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
        self._seed_test_accounts()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        self._tmp_dir.cleanup()

    def _seed_test_accounts(self) -> None:
        today = dt_date.today()
        today_str = today.isoformat()
        yesterday_str = (today - timedelta(days=1)).isoformat()
        
        # Last month prefix and sample date
        first_of_this_month = today.replace(day=1)
        last_day_of_last_month = first_of_this_month - timedelta(days=1)
        last_month_str = last_day_of_last_month.isoformat()
        current_month_prefix = today.strftime("%Y-%m")

        # ACCOUNT A (Aarav Sharma): Income ₹50,000, Expenses ₹9,500 (Rent ₹9,000, Food ₹100, Shopping ₹400)
        user_a = User(
            name="Aarav Sharma",
            email="aarav@finora.test",
            hashed_password=hash_password("Aarav#2026"),
            currency="INR",
            monthly_income_target_paise=to_paise(50000.0),
        )
        self.db.add(user_a)
        self.db.commit()
        self.db.refresh(user_a)
        self.user_a_id = user_a.id

        tx_a_inc = Transaction(
            user_id=user_a.id,
            title="Monthly Salary",
            amount_paise=to_paise(50000.0),
            type="income",
            category="Salary",
            date=today_str,
            payment_method="Bank Transfer",
            status="completed",
        )
        tx_a_rent = Transaction(
            user_id=user_a.id,
            title="Apartment Rent",
            amount_paise=to_paise(9000.0),
            type="expense",
            category="Rent",
            date=today_str,
            payment_method="Net Banking",
            status="completed",
        )
        tx_a_food = Transaction(
            user_id=user_a.id,
            title="Coffee & Snacks",
            amount_paise=to_paise(100.0),
            type="expense",
            category="Food",
            date=today_str,
            payment_method="UPI",
            status="completed",
        )
        tx_a_shop = Transaction(
            user_id=user_a.id,
            title="Online Books",
            amount_paise=to_paise(400.0),
            type="expense",
            category="Shopping",
            date=today_str,
            payment_method="Credit Card",
            status="completed",
        )
        # Account A Last month transactions (to test monthly comparison and balance)
        tx_a_last_inc = Transaction(
            user_id=user_a.id,
            title="Previous Salary",
            amount_paise=to_paise(12000.0),
            type="income",
            category="Salary",
            date=last_month_str,
            payment_method="Bank Transfer",
            status="completed",
        )
        tx_a_last = Transaction(
            user_id=user_a.id,
            title="Previous Month Living",
            amount_paise=to_paise(12000.0),
            type="expense",
            category="Rent",
            date=last_month_str,
            payment_method="Net Banking",
            status="completed",
        )
        # Account A Active Budget: Rent ₹10,000, Food ₹5,000
        budget_a_rent = Budget(
            user_id=user_a.id,
            category="Rent",
            limit_paise=to_paise(10000.0),
            month=current_month_prefix,
        )
        budget_a_food = Budget(
            user_id=user_a.id,
            category="Food",
            limit_paise=to_paise(5000.0),
            month=current_month_prefix,
        )
        # Account A Savings Goal
        goal_a = SavingsGoal(
            user_id=user_a.id,
            name="Emergency Fund",
            target_amount_paise=to_paise(100000.0),
            current_amount_paise=to_paise(40000.0),
            target_date="2026-12-31",
            category="Emergency",
            priority="high",
        )
        self.db.add_all([tx_a_inc, tx_a_rent, tx_a_food, tx_a_shop, tx_a_last_inc, tx_a_last, budget_a_rent, budget_a_food, goal_a])

        # ACCOUNT B (Priya Patel): Income ₹80,000, Expenses ₹25,000 (Food ₹8,000, Transport ₹2,000, Entertainment ₹15,000)
        user_b = User(
            name="Priya Patel",
            email="priya@finora.test",
            hashed_password=hash_password("Priya#2026"),
            currency="INR",
            monthly_income_target_paise=to_paise(80000.0),
        )
        self.db.add(user_b)
        self.db.commit()
        self.db.refresh(user_b)
        self.user_b_id = user_b.id

        tx_b_inc = Transaction(
            user_id=user_b.id,
            title="Tech Consulting",
            amount_paise=to_paise(80000.0),
            type="income",
            category="Salary",
            date=today_str,
            payment_method="Bank Transfer",
            status="completed",
        )
        tx_b_food = Transaction(
            user_id=user_b.id,
            title="Fine Dining & Grocery",
            amount_paise=to_paise(8000.0),
            type="expense",
            category="Food",
            date=today_str,
            payment_method="Credit Card",
            status="completed",
        )
        tx_b_trans = Transaction(
            user_id=user_b.id,
            title="Cab & Metro Pass",
            amount_paise=to_paise(2000.0),
            type="expense",
            category="Transport",
            date=today_str,
            payment_method="UPI",
            status="completed",
        )
        tx_b_ent = Transaction(
            user_id=user_b.id,
            title="Concert Tickets",
            amount_paise=to_paise(15000.0),
            type="expense",
            category="Entertainment",
            date=yesterday_str,  # Recorded yesterday
            payment_method="Credit Card",
            status="completed",
        )
        # Account B Budget: Food ₹5,000 (Exceeded since spent is ₹8,000)
        budget_b_food = Budget(
            user_id=user_b.id,
            category="Food",
            limit_paise=to_paise(5000.0),
            month=current_month_prefix,
        )
        self.db.add_all([tx_b_inc, tx_b_food, tx_b_trans, tx_b_ent, budget_b_food])

        # ACCOUNT C (Empty User with 0 transactions)
        user_c = User(
            name="New User",
            email="newuser@finora.test",
            hashed_password=hash_password("NewUser#2026"),
            currency="INR",
            monthly_income_target_paise=0,
        )
        self.db.add(user_c)
        self.db.commit()
        self.db.refresh(user_c)
        self.user_c_id = user_c.id

    def test_account_isolation_and_personalization(self) -> None:
        """Requirement 4 & 11: Multi-user personalization and account isolation."""
        # 1. Highest Spending:
        # Account A highest spending is Rent (₹9,000)
        res_a = process_copilot_chat(self.db, self.user_a_id, "Where did I spend the most?")
        self.assertIn("Rent", res_a.reply)
        self.assertIn("9,000", res_a.reply)
        self.assertNotIn("Entertainment", res_a.reply)
        self.assertNotIn("15,000", res_a.reply)

        # Account B highest spending is Entertainment (₹15,000)
        res_b = process_copilot_chat(self.db, self.user_b_id, "Where did I spend the most?")
        self.assertIn("Entertainment", res_b.reply)
        self.assertIn("15,000", res_b.reply)
        self.assertNotIn("Rent", res_b.reply)
        self.assertNotIn("9,000", res_b.reply)

        # Account C (Empty) should report no transactions recorded
        res_c = process_copilot_chat(self.db, self.user_c_id, "Where did I spend the most?")
        self.assertIn("no transactions recorded", res_c.reply.lower())

    def test_question_1_where_did_i_spend_the_most(self) -> None:
        """Question 1: 'Where did I spend the most?' in EN, HI, HL."""
        # English
        res_en = process_copilot_chat(self.db, self.user_a_id, "Where did I spend the most?")
        self.assertIn("Rent", res_en.reply)
        self.assertIn("9,000", res_en.reply)

        # Hindi
        res_hi = process_copilot_chat(self.db, self.user_a_id, "इस महीने सबसे ज्यादा खर्च कहाँ हुआ?")
        self.assertIn("Rent", res_hi.reply)
        self.assertIn("9,000", res_hi.reply)

        # Hinglish
        res_hl = process_copilot_chat(self.db, self.user_a_id, "Sabse jyada kharcha kahan hua?")
        self.assertIn("Rent", res_hl.reply)
        self.assertIn("9,000", res_hl.reply)

    def test_question_2_how_much_did_i_spend_on_food(self) -> None:
        """Question 2: 'How much did I spend on Food?' in EN, HI, HL."""
        # Account A spent ₹100 on Food
        res_a_en = process_copilot_chat(self.db, self.user_a_id, "How much did I spend on Food?")
        self.assertIn("100", res_a_en.reply)
        self.assertIn("Food", res_a_en.reply)

        res_a_hi = process_copilot_chat(self.db, self.user_a_id, "Food पर कितना खर्च हुआ?")
        self.assertIn("100", res_a_hi.reply)

        res_a_hl = process_copilot_chat(self.db, self.user_a_id, "Food par kitna kharcha hua?")
        self.assertIn("100", res_a_hl.reply)

        # Account B spent ₹8,000 on Food
        res_b = process_copilot_chat(self.db, self.user_b_id, "How much did I spend on Food?")
        self.assertIn("8,000", res_b.reply)

    def test_question_3_mera_current_balance_kitna_hai(self) -> None:
        """Question 3: 'Mera current balance kitna hai?'."""
        # Account A balance: 50,000 - 9,500 = 40,500
        res_a = process_copilot_chat(self.db, self.user_a_id, "Mera current balance kitna hai?")
        self.assertIn("40,500", res_a.reply)
        self.assertIn("balance", res_a.reply.lower())

        # English equivalent
        res_en = process_copilot_chat(self.db, self.user_a_id, "What is my current net balance?")
        self.assertIn("40,500", res_en.reply)

    def test_question_4_is_mahine_kitna_kharcha_hua(self) -> None:
        """Question 4: 'Is mahine kitna kharcha hua?'."""
        # Account A monthly expense: ₹9,500 (Income: ₹50,000)
        res_a = process_copilot_chat(self.db, self.user_a_id, "Is mahine kitna kharcha hua?")
        self.assertIn("9,500", res_a.reply)

        # English
        res_en = process_copilot_chat(self.db, self.user_a_id, "How much did I spend this month?")
        self.assertIn("9,500", res_en.reply)

    def test_question_5_am_i_over_budget(self) -> None:
        """Question 5: 'Am I over budget?'."""
        # Account A has Rent (₹9,000 / ₹10,000) and Food (₹100 / ₹5,000) -> NOT over budget
        res_a = process_copilot_chat(self.db, self.user_a_id, "Am I over budget?")
        self.assertIn("within limits", res_a.reply.lower())

        # Account B has Food (₹8,000 / ₹5,000) -> OVER budget!
        res_b = process_copilot_chat(self.db, self.user_b_id, "Am I over budget?")
        self.assertTrue("yes" in res_b.reply.lower() or "exceeded" in res_b.reply.lower())
        self.assertIn("Food", res_b.reply)

    def test_question_6_what_did_i_spend_on_yesterday(self) -> None:
        """Question 6: 'What did I spend on yesterday?'."""
        # Account A had no expenses yesterday
        res_a = process_copilot_chat(self.db, self.user_a_id, "What did I spend on yesterday?")
        self.assertIn("no expenses recorded yesterday", res_a.reply.lower())

        # Account B had Entertainment ₹15,000 yesterday
        res_b = process_copilot_chat(self.db, self.user_b_id, "What did I spend on yesterday?")
        self.assertIn("15,000", res_b.reply)
        self.assertIn("Concert", res_b.reply)

    def test_question_7_compare_this_month_with_last_month(self) -> None:
        """Question 7: 'Compare this month with last month.'."""
        # Account A: This month ₹9,500 vs Last month ₹12,000 (down by ₹2,500 or 20.8%)
        res_a = process_copilot_chat(self.db, self.user_a_id, "Compare this month with last month.")
        self.assertIn("9,500", res_a.reply)
        self.assertIn("12,000", res_a.reply)
        self.assertIn("2,500", res_a.reply)

    def test_question_8_how_much_can_i_save_this_month(self) -> None:
        """Question 8: 'How much can I save this month?'."""
        # Account A: Income 50,000 - 9,500 = 40,500 (81.0% savings rate)
        res_a = process_copilot_chat(self.db, self.user_a_id, "How much can I save this month?")
        self.assertIn("40,500", res_a.reply)
        self.assertIn("50,000", res_a.reply)

    def test_question_9_follow_up_what_about_transport(self) -> None:
        """Question 9: 'What about Transport?' as a follow-up."""
        # Previous turn was about spending on Account B
        history = [
            CopilotChatMessage(role="user", content="Where did I spend the most?"),
            CopilotChatMessage(role="assistant", content="Your highest spending category this month is Entertainment, at ₹15,000."),
        ]
        res_b = process_copilot_chat(self.db, self.user_b_id, "What about Transport?", history)
        self.assertIn("Transport", res_b.reply)
        self.assertIn("2,000", res_b.reply)

    def test_question_10_why_is_my_spending_increasing(self) -> None:
        """Question 10: 'Why is my spending increasing?'."""
        # Account A: Rent forms 94.7% of total expenses
        res_a = process_copilot_chat(self.db, self.user_a_id, "Why is my spending increasing?")
        self.assertIn("Rent", res_a.reply)
        self.assertIn("9,000", res_a.reply)

    def test_question_11_give_me_a_complete_financial_summary(self) -> None:
        """Question 11: 'Give me a complete financial summary.' ONLY returns full snapshot here."""
        res_a = process_copilot_chat(self.db, self.user_a_id, "Give me a complete financial summary.")
        self.assertIn("Net Balance", res_a.reply)
        self.assertIn("40,500", res_a.reply)
        self.assertIn("Income", res_a.reply)
        self.assertIn("50,000", res_a.reply)
        self.assertIn("Expenses", res_a.reply)
        self.assertIn("9,500", res_a.reply)

    def test_question_12_unrelated_questions(self) -> None:
        """Question 12: Ask an unrelated question that cannot be answered from financial records."""
        res_en = process_copilot_chat(self.db, self.user_a_id, "What is the capital of France?")
        self.assertIn("personal finance", res_en.reply.lower())
        self.assertNotIn("40,500", res_en.reply)

        res_hl = process_copilot_chat(self.db, self.user_a_id, "Delhi me mausam kaisa hai?")
        self.assertIn("personal finance", res_hl.reply.lower())


if __name__ == "__main__":
    unittest.main()

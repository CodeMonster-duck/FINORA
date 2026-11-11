from __future__ import annotations

import os
import tempfile
import unittest
import uuid
from datetime import date as dt_date
from datetime import timedelta

from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.database.base import Base, import_all_models
from app.database.connection import create_app_engine, get_db
from app.main import create_application
from app.tests.asgi_client import SimpleASGIClient


class FinoraBackendTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp_dir = tempfile.TemporaryDirectory()
        db_path = os.path.join(self._tmp_dir.name, "test_finora.db")
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

        self.app = create_application()

        def override_get_db():
            db = self.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[get_db] = override_get_db
        self.client = SimpleASGIClient(self.app)
        self.prefix = settings.api_v1_prefix

    def tearDown(self) -> None:
        self.app.dependency_overrides.clear()
        self.engine.dispose()
        self._tmp_dir.cleanup()

    def _register_and_headers(
        self, email: str | None = None, name: str = "Riya Verma"
    ) -> dict[str, str]:
        target_email = email or f"unit_{uuid.uuid4().hex[:8]}@example.com"
        target_password = f"UnitPass!{uuid.uuid4().hex[:10]}"
        resp = self.client.post(
            f"{self.prefix}/auth/register",
            json_body={
                "name": name,
                "email": target_email,
                "password": target_password,
                "role": "Engineering Student",
                "monthly_income_target": 50000,
            },
        )
        self.assertEqual(resp.status_code, 201, resp.text)
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_health_and_demo_login_disabled_by_default(self) -> None:
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["status"], "healthy")

        demo_resp = self.client.post(f"{self.prefix}/auth/demo-login")
        self.assertEqual(demo_resp.status_code, 403, demo_resp.text)

    def test_auth_protection_and_user_isolation(self) -> None:
        unauth = self.client.get(f"{self.prefix}/transactions")
        self.assertEqual(unauth.status_code, 401)

        user1_headers = self._register_and_headers("u1@example.com", "User One")
        user2_headers = self._register_and_headers("u2@example.com", "User Two")

        today_str = dt_date.today().isoformat()
        created = self.client.post(
            f"{self.prefix}/transactions",
            headers=user1_headers,
            json_body={
                "title": "Internship Stipend",
                "amount": 25000,
                "type": "income",
                "category": "Salary",
                "date": today_str,
                "payment_method": "Bank Transfer",
                "description": "Monthly stipend",
            },
        )
        self.assertEqual(created.status_code, 201)
        tx_id = created.json()["id"]

        # User 2 cannot read or delete User 1's transaction
        forbidden_get = self.client.get(
            f"{self.prefix}/transactions/{tx_id}", headers=user2_headers
        )
        self.assertEqual(forbidden_get.status_code, 404)

    def test_transactions_crud_integer_paise_and_csv_export(self) -> None:
        headers = self._register_and_headers()
        today_str = dt_date.today().isoformat()

        # 0.1 + 0.2 paise test + real amounts
        self.client.post(
            f"{self.prefix}/transactions",
            headers=headers,
            json_body={
                "title": "Freelance Micro Payment 1",
                "amount": 0.1,
                "type": "income",
                "category": "Freelancing",
                "date": today_str,
                "payment_method": "UPI",
            },
        )
        self.client.post(
            f"{self.prefix}/transactions",
            headers=headers,
            json_body={
                "title": "Freelance Micro Payment 2",
                "amount": 0.2,
                "type": "income",
                "category": "Freelancing",
                "date": today_str,
                "payment_method": "UPI",
            },
        )
        exp = self.client.post(
            f"{self.prefix}/transactions",
            headers=headers,
            json_body={
                "title": "Swiggy Lunch",
                "amount": 420.5,
                "type": "expense",
                "category": "Food",
                "date": today_str,
                "payment_method": "UPI",
            },
        )
        self.assertEqual(exp.status_code, 201)
        exp_id = exp.json()["id"]

        # Invalid category for income rejected
        invalid = self.client.post(
            f"{self.prefix}/transactions",
            headers=headers,
            json_body={
                "title": "Bad Type Category",
                "amount": 500,
                "type": "income",
                "category": "Food",
                "date": today_str,
                "payment_method": "UPI",
            },
        )
        self.assertEqual(invalid.status_code, 422)

        # Update expense amount
        upd = self.client.put(
            f"{self.prefix}/transactions/{exp_id}",
            headers=headers,
            json_body={
                "title": "Swiggy Dinner",
                "amount": 250.0,
                "type": "expense",
                "category": "Food",
                "date": today_str,
                "payment_method": "UPI",
            },
        )
        self.assertEqual(upd.status_code, 200)
        self.assertEqual(upd.json()["amount"], 250.0)

        listing = self.client.get(f"{self.prefix}/transactions", headers=headers)
        self.assertEqual(listing.status_code, 200)
        body = listing.json()
        self.assertEqual(body["total_income"], 0.3)
        self.assertEqual(body["total_expenses"], 250.0)

        csv_resp = self.client.get(
            f"{self.prefix}/transactions/export/csv", headers=headers
        )
        self.assertEqual(csv_resp.status_code, 200)
        self.assertIn("Swiggy Dinner", csv_resp.text)

        del_resp = self.client.delete(
            f"{self.prefix}/transactions/{exp_id}", headers=headers
        )
        self.assertEqual(del_resp.status_code, 204)

    def test_budgets_exclude_income_and_track_exceeded(self) -> None:
        headers = self._register_and_headers()
        today = dt_date.today()
        month_str = today.strftime("%Y-%m")
        today_str = today.isoformat()

        bgt = self.client.post(
            f"{self.prefix}/budgets",
            headers=headers,
            json_body={
                "category": "Food",
                "limit": 1000,
                "month": month_str,
                "alert_threshold": 80,
            },
        )
        self.assertEqual(bgt.status_code, 201)

        # Duplicate budget in same month rejected
        dup = self.client.post(
            f"{self.prefix}/budgets",
            headers=headers,
            json_body={
                "category": "Food",
                "limit": 2000,
                "month": month_str,
                "alert_threshold": 80,
            },
        )
        self.assertEqual(dup.status_code, 409)

        # Add income + exceeded expense
        self.client.post(
            f"{self.prefix}/transactions",
            headers=headers,
            json_body={
                "title": "Monthly Salary",
                "amount": 40000,
                "type": "income",
                "category": "Salary",
                "date": today_str,
                "payment_method": "Bank Transfer",
            },
        )
        self.client.post(
            f"{self.prefix}/transactions",
            headers=headers,
            json_body={
                "title": "Weekend Dinner",
                "amount": 1200,
                "type": "expense",
                "category": "Food",
                "date": today_str,
                "payment_method": "UPI",
            },
        )

        summary = self.client.get(
            f"{self.prefix}/budgets",
            headers=headers,
            params={"month": month_str},
        ).json()
        self.assertEqual(summary["total_spent"], 1200.0)
        self.assertEqual(summary["exceeded_count"], 1)
        self.assertEqual(summary["items"][0]["status"], "exceeded")

        # Notifications auto-sync should detect exceeded budget
        notifs = self.client.get(
            f"{self.prefix}/notifications", headers=headers
        ).json()
        self.assertGreaterEqual(notifs["unread_count"], 1)
        first_id = notifs["items"][0]["id"]
        mark_one = self.client.patch(
            f"{self.prefix}/notifications/{first_id}/read", headers=headers
        )
        self.assertEqual(mark_one.status_code, 200)
        self.assertTrue(mark_one.json()["is_read"])

    def test_savings_goals_contributions_and_analytics(self) -> None:
        headers = self._register_and_headers()
        today = dt_date.today()
        target_str = (today + timedelta(days=60)).isoformat()

        goal_resp = self.client.post(
            f"{self.prefix}/savings",
            headers=headers,
            json_body={
                "name": "Emergency Buffer",
                "category": "Emergency",
                "target_amount": 10000,
                "current_amount": 4000,
                "target_date": target_str,
                "priority": "high",
            },
        )
        self.assertEqual(goal_resp.status_code, 201)
        goal_id = goal_resp.json()["id"]
        self.assertEqual(goal_resp.json()["progress_percentage"], 40.0)

        # Contribute remaining 6000 to complete goal
        contrib_resp = self.client.post(
            f"{self.prefix}/savings/{goal_id}/contributions",
            headers=headers,
            json_body={"amount": 6000, "note": "Final deposit"},
        )
        self.assertEqual(contrib_resp.status_code, 201)
        self.assertTrue(contrib_resp.json()["is_completed"])
        self.assertEqual(contrib_resp.json()["progress_percentage"], 100.0)

        # Further contributions to completed goal must be rejected
        over_contrib = self.client.post(
            f"{self.prefix}/savings/{goal_id}/contributions",
            headers=headers,
            json_body={"amount": 500},
        )
        self.assertEqual(over_contrib.status_code, 400)

        # Analytics endpoints work cleanly
        overview = self.client.get(
            f"{self.prefix}/analytics/overview", headers=headers
        )
        health = self.client.get(
            f"{self.prefix}/analytics/health-score", headers=headers
        )
        insights = self.client.get(
            f"{self.prefix}/analytics/insights", headers=headers
        )
        self.assertEqual(overview.status_code, 200)
        self.assertEqual(health.status_code, 200)
        self.assertEqual(len(health.json()["factors"]), 4)
        self.assertEqual(insights.status_code, 200)


if __name__ == "__main__":
    unittest.main()

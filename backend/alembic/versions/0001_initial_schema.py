"""Initial FINORA schema: users, transactions, budgets, savings, notifications.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-11
"""
from __future__ import annotations

import sqlalchemy as sa

try:
    from alembic import op
except ImportError:  # pragma: no cover
    op = None  # type: ignore[assignment]

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=120), nullable=False),
        sa.Column("monthly_income_target_paise", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("date_format", sa.String(length=20), nullable=False),
        sa.Column("theme", sa.String(length=16), nullable=False),
        sa.Column("compact_numbers", sa.Boolean(), nullable=False),
        sa.Column("show_health_score_breakdown", sa.Boolean(), nullable=False),
        sa.Column("budget_alerts_enabled", sa.Boolean(), nullable=False),
        sa.Column("goal_milestones_enabled", sa.Boolean(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("category", sa.String(length=48), nullable=False),
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("payment_method", sa.String(length=32), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_transactions_id", "transactions", ["id"], unique=False)
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"], unique=False)
    op.create_index("ix_transactions_user_date", "transactions", ["user_id", "date"], unique=False)
    op.create_index("ix_transactions_user_type", "transactions", ["user_id", "type"], unique=False)

    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(length=48), nullable=False),
        sa.Column("limit_paise", sa.BigInteger(), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("alert_threshold", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "category", "month", name="uq_budgets_user_category_month"),
    )
    op.create_index("ix_budgets_id", "budgets", ["id"], unique=False)
    op.create_index("ix_budgets_user_id", "budgets", ["user_id"], unique=False)
    op.create_index("ix_budgets_month", "budgets", ["month"], unique=False)

    op.create_table(
        "savings_goals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("target_amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("current_amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("target_date", sa.String(length=10), nullable=False),
        sa.Column("priority", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_savings_goals_id", "savings_goals", ["id"], unique=False)
    op.create_index("ix_savings_goals_user_id", "savings_goals", ["user_id"], unique=False)

    op.create_table(
        "savings_contributions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("goal_id", sa.Integer(), sa.ForeignKey("savings_goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_savings_contributions_id", "savings_contributions", ["id"], unique=False)
    op.create_index("ix_savings_contributions_goal_id", "savings_contributions", ["goal_id"], unique=False)

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("tone", sa.String(length=16), nullable=False),
        sa.Column("route", sa.String(length=64), nullable=False),
        sa.Column("source_key", sa.String(length=120), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_notifications_id", "notifications", ["id"], unique=False)
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"], unique=False)
    op.create_index("ix_notifications_source_key", "notifications", ["source_key"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notifications_source_key", table_name="notifications")
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_index("ix_notifications_id", table_name="notifications")
    op.drop_table("notifications")

    op.drop_index("ix_savings_contributions_goal_id", table_name="savings_contributions")
    op.drop_index("ix_savings_contributions_id", table_name="savings_contributions")
    op.drop_table("savings_contributions")

    op.drop_index("ix_savings_goals_user_id", table_name="savings_goals")
    op.drop_index("ix_savings_goals_id", table_name="savings_goals")
    op.drop_table("savings_goals")

    op.drop_index("ix_budgets_month", table_name="budgets")
    op.drop_index("ix_budgets_user_id", table_name="budgets")
    op.drop_index("ix_budgets_id", table_name="budgets")
    op.drop_table("budgets")

    op.drop_index("ix_transactions_user_type", table_name="transactions")
    op.drop_index("ix_transactions_user_date", table_name="transactions")
    op.drop_index("ix_transactions_user_id", table_name="transactions")
    op.drop_index("ix_transactions_id", table_name="transactions")
    op.drop_table("transactions")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")

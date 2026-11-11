from __future__ import annotations

from datetime import date as dt_date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.budget import Budget
from app.models.notification import Notification
from app.models.savings import SavingsGoal
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationOut
from app.services.auth_service import from_paise
from app.services.finance_service import compute_budget_utilization


def serialize_notification(notif: Notification) -> NotificationOut:
    return NotificationOut(
        id=notif.id,
        user_id=notif.user_id,
        title=notif.title,
        message=notif.message,
        tone=notif.tone,  # type: ignore[arg-type]
        route=notif.route,
        is_read=notif.is_read,
        created_at=notif.created_at,
    )


def sync_dynamic_notifications(db: Session, user: User) -> None:
    """Create persistent alert notifications when budgets cross thresholds or goals complete."""
    month_key = dt_date.today().strftime("%Y-%m")
    existing_keys = set(
        db.scalars(
            select(Notification.source_key).where(
                Notification.user_id == user.id,
                Notification.source_key.is_not(None),
            )
        ).all()
    )

    created_any = False

    if user.budget_alerts_enabled:
        budgets = list(
            db.scalars(
                select(Budget).where(
                    Budget.user_id == user.id,
                    Budget.month == month_key,
                )
            ).all()
        )
        month_expenses = list(
            db.scalars(
                select(Transaction).where(
                    Transaction.user_id == user.id,
                    Transaction.type == "expense",
                    Transaction.date.like(f"{month_key}%"),
                )
            ).all()
        )
        for budget in budgets:
            util = compute_budget_utilization(budget, month_expenses)
            if util.status == "exceeded":
                key = f"budget-exceeded-{budget.id}-{month_key}"
                if key not in existing_keys:
                    db.add(
                        Notification(
                            user_id=user.id,
                            title=f"{budget.category} budget exceeded",
                            message=(
                                f"Spent ₹{util.spent:,.0f} of ₹{util.budget.limit:,.0f} "
                                f"({util.utilization_percentage:.0f}%)."
                            ),
                            tone="danger",
                            route="/budgets",
                            source_key=key,
                        )
                    )
                    created_any = True
            elif util.status == "approaching":
                key = f"budget-approaching-{budget.id}-{month_key}"
                if key not in existing_keys:
                    db.add(
                        Notification(
                            user_id=user.id,
                            title=f"{budget.category} approaching limit",
                            message=(
                                f"₹{util.remaining:,.0f} remaining "
                                f"({util.utilization_percentage:.0f}% utilized)."
                            ),
                            tone="warning",
                            route="/budgets",
                            source_key=key,
                        )
                    )
                    created_any = True

    if user.goal_milestones_enabled:
        goals = list(
            db.scalars(
                select(SavingsGoal).where(SavingsGoal.user_id == user.id)
            ).all()
        )
        for goal in goals:
            if goal.target_amount_paise <= 0:
                continue
            pct = (goal.current_amount_paise / goal.target_amount_paise) * 100
            if pct >= 100:
                key = f"goal-completed-{goal.id}"
                if key not in existing_keys:
                    db.add(
                        Notification(
                            user_id=user.id,
                            title=f"Goal achieved: {goal.name}",
                            message=f"Reached 100% of your ₹{from_paise(goal.target_amount_paise):,.0f} target.",
                            tone="positive",
                            route="/savings",
                            source_key=key,
                        )
                    )
                    created_any = True

    if created_any:
        db.commit()


def list_notifications(db: Session, user: User) -> NotificationListResponse:
    sync_dynamic_notifications(db, user)
    items = list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
        ).all()
    )
    unread = sum(1 for item in items if not item.is_read)
    return NotificationListResponse(
        items=[serialize_notification(n) for n in items],
        unread_count=unread,
    )


def mark_notification_read(
    db: Session, user_id: int, notification_id: int
) -> Notification:
    notif = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    notif.is_read = True
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


def mark_all_notifications_read(db: Session, user_id: int) -> int:
    unread_items = list(
        db.scalars(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.is_read.is_(False),
            )
        ).all()
    )
    for item in unread_items:
        item.is_read = True
        db.add(item)
    db.commit()
    return len(unread_items)

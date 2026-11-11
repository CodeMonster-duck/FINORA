from __future__ import annotations

import calendar
import os
import secrets
from datetime import date as dt_date
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.budget import Budget
from app.models.notification import Notification
from app.models.savings import SavingsContribution, SavingsGoal
from app.models.transaction import Transaction
from app.models.user import User
from app.services.auth_service import to_paise

DEMO_USER_EMAIL = os.getenv("DEMO_USER_EMAIL", "aarav.sharma@finora.demo")


def _resolve_demo_password() -> str:
    env_password = os.getenv("DEMO_USER_PASSWORD", "").strip()
    if env_password:
        return env_password
    return secrets.token_urlsafe(24)


def _month_day(months_ago: int, day: int, ref: dt_date) -> str:
    total = ref.year * 12 + (ref.month - 1) - months_ago
    year, month_zero = divmod(total, 12)
    month = month_zero + 1
    max_day = calendar.monthrange(year, month)[1]
    clamped = min(day, max_day)
    if months_ago == 0:
        clamped = min(clamped, ref.day)
    return dt_date(year, month, clamped).isoformat()


def ensure_demo_user(db: Session) -> User:
    existing = db.scalar(select(User).where(User.email == DEMO_USER_EMAIL))
    if existing:
        return existing

    demo_user = User(
        name="Aarav Sharma",
        email=DEMO_USER_EMAIL,
        hashed_password=hash_password(_resolve_demo_password()),
        role="CS Student & Product Freelancer",
        monthly_income_target_paise=to_paise(85000),
        currency="INR",
        date_format="DD MMM YYYY",
        theme="dark",
        is_demo=True,
    )
    db.add(demo_user)
    db.commit()
    db.refresh(demo_user)
    return demo_user


def seed_demo_database(db: Session, force_if_empty_only: bool = True) -> User:
    """Populate realistic Indian personal finance demo records idempotently (dev only)."""
    if settings.is_production:
        raise RuntimeError("Demo database seeding is forbidden in production.")
    user = ensure_demo_user(db)
    has_tx = db.scalar(select(Transaction.id).where(Transaction.user_id == user.id))
    if force_if_empty_only and has_tx is not None:
        return user

    ref = dt_date.today()
    current_month = ref.strftime("%Y-%m")

    demo_transactions = [
        ("TechCorp Monthly Salary", 68000, "income", "Salary", _month_day(0, 1, ref), "Bank Transfer", "Monthly net salary credit", "Includes HRA allowance"),
        ("React UI Freelance Sprint", 18500, "income", "Freelancing", _month_day(0, 6, ref), "UPI", "Dashboard redesign milestone", "Invoice #FIN-204"),
        ("Nifty 50 Index Dividend", 2400, "income", "Investment income", _month_day(0, 9, ref), "Bank Transfer", "Quarterly ETF dividend payout", None),
        ("Apartment Rent — Koramangala", 14500, "expense", "Rent", _month_day(0, 2, ref), "Bank Transfer", "Monthly shared 2BHK apartment rent", None),
        ("NPTEL & Cloud Certification Fee", 3200, "expense", "Education", _month_day(0, 3, ref), "Net Banking", "Semester exam registration & study modules", None),
        ("Zepto Weekly Groceries", 2150, "expense", "Groceries", _month_day(0, 4, ref), "UPI", "Fresh vegetables, dairy, grains & coffee", None),
        ("Swiggy Dinner & Chai Point", 1420, "expense", "Food", _month_day(0, 5, ref), "UPI", "Weeknight meals and team snacks", None),
        ("Metro Smart Card & Uber Auto", 940, "expense", "Transport", _month_day(0, 6, ref), "UPI", "Daily metro commute and last-mile rides", None),
        ("JioFiber Broadband & BESCOM Bill", 1890, "expense", "Bills", _month_day(0, 7, ref), "UPI", "300 Mbps fiber plan + electricity", None),
        ("Myntra Winter Jacket & Sneakers", 3350, "expense", "Shopping", _month_day(0, 8, ref), "Credit Card", "Seasonal wardrobe essentials on sale", None),
        ("Zomato Weekend Brunch & Cafe", 2780, "expense", "Food", _month_day(0, 9, ref), "UPI", "South Indian breakfast & weekend outing", None),
        ("BookMyShow IMAX & Bowling", 1280, "expense", "Entertainment", _month_day(0, 10, ref), "Debit Card", "Weekend movie tickets & snacks", None),
        ("Spotify, iCloud & Notion Plus", 760, "expense", "Subscriptions", _month_day(0, 10, ref), "Credit Card", "Recurring digital subscriptions", None),
        ("Apollo Pharmacy & Vitamin D3", 640, "expense", "Healthcare", _month_day(0, 11, ref), "UPI", "Routine wellness supplements", None),
        ("DMart Monthly Pantry Restock", 1680, "expense", "Groceries", _month_day(0, 11, ref), "Debit Card", "Pulses, olive oil & household supplies", None),
        # 1 month ago
        ("TechCorp Monthly Salary", 68000, "income", "Salary", _month_day(1, 1, ref), "Bank Transfer", "Monthly net salary credit", None),
        ("UI Audit Consulting", 12000, "income", "Freelancing", _month_day(1, 14, ref), "Bank Transfer", "Design system review for FinTech MVP", None),
        ("Apartment Rent — Koramangala", 14500, "expense", "Rent", _month_day(1, 2, ref), "Bank Transfer", "Monthly apartment rent", None),
        ("Blinkit & BigBasket Groceries", 4120, "expense", "Groceries", _month_day(1, 7, ref), "UPI", "Monthly staples & produce", None),
        ("Swiggy, Zomato & Canteen", 3550, "expense", "Food", _month_day(1, 12, ref), "UPI", "Dining out and food deliveries", None),
        ("Metro & Petrol Refill", 1850, "expense", "Transport", _month_day(1, 16, ref), "UPI", "Commute and two-wheeler fuel", None),
        ("Amazon Electronics Accessories", 2650, "expense", "Shopping", _month_day(1, 19, ref), "Credit Card", "USB-C hub & ergonomic stand", None),
        ("College Textbooks & Courseware", 2400, "expense", "Education", _month_day(1, 21, ref), "Debit Card", "System Design reference books", None),
        # 2 months ago
        ("TechCorp Monthly Salary", 65000, "income", "Salary", _month_day(2, 1, ref), "Bank Transfer", "Monthly salary credit", None),
        ("Freelance Landing Page Build", 15000, "income", "Freelancing", _month_day(2, 15, ref), "Bank Transfer", "React + Vite marketing site", None),
        ("Apartment Rent — Koramangala", 14500, "expense", "Rent", _month_day(2, 2, ref), "Bank Transfer", "Monthly apartment rent", None),
        ("Groceries & Fresh Produce", 3980, "expense", "Groceries", _month_day(2, 8, ref), "UPI", "Monthly groceries", None),
        ("Dining & Coffee Shops", 4100, "expense", "Food", _month_day(2, 14, ref), "UPI", "Third Wave Coffee & lunches", None),
    ]

    for title, amt, tx_type, cat, dt_str, pm, desc, notes in demo_transactions:
        db.add(
            Transaction(
                user_id=user.id,
                title=title,
                amount_paise=to_paise(amt),
                type=tx_type,
                category=cat,
                date=dt_str,
                payment_method=pm,
                description=desc,
                notes=notes,
                status="completed",
            )
        )

    demo_budgets = [
        ("Food", 5000, 80, "Dining out, Swiggy, Zomato & cafes"),
        ("Groceries", 4500, 80, "DMart, Zepto & fresh produce"),
        ("Transport", 2000, 80, "Metro card, fuel & cab rides"),
        ("Shopping", 3000, 80, "Apparel, gadgets & lifestyle purchases"),
        ("Entertainment", 1500, 80, "Movies, events & weekend leisure"),
        ("Education", 4000, 80, "Certifications, exam fees & books"),
    ]
    for cat, limit_amt, threshold, notes in demo_budgets:
        db.add(
            Budget(
                user_id=user.id,
                category=cat,
                limit_paise=to_paise(limit_amt),
                month=current_month,
                alert_threshold=threshold,
                notes=notes,
            )
        )

    goals_seed = [
        (
            "Emergency Fund (6 Months)",
            "Emergency",
            100000,
            84000,
            (ref + timedelta(days=90)).isoformat(),
            "high",
            [
                (50000, _month_day(2, 5, ref), "Initial liquid fund transfer"),
                (20000, _month_day(1, 4, ref), "Monthly automated SIP top-up"),
                (14000, _month_day(0, 5, ref), "Salary surplus allocation"),
            ],
        ),
        (
            "New Developer Laptop",
            "Tech",
            95000,
            62500,
            (ref + timedelta(days=140)).isoformat(),
            "high",
            [
                (40000, _month_day(2, 16, ref), "Freelance sprint payout saved"),
                (22500, _month_day(0, 7, ref), "UI consulting bonus"),
            ],
        ),
        (
            "Konkan & Goa Road Trip",
            "Travel",
            28000,
            15500,
            (ref + timedelta(days=75)).isoformat(),
            "medium",
            [
                (10000, _month_day(2, 20, ref), "Initial travel jar"),
                (5500, _month_day(1, 10, ref), "Weekend savings boost"),
            ],
        ),
        (
            "Higher Education & Exam Fund",
            "Education",
            30000,
            30000,
            (ref + timedelta(days=30)).isoformat(),
            "medium",
            [
                (18000, _month_day(2, 8, ref), "Semester savings deposit"),
                (12000, _month_day(1, 18, ref), "Goal milestone completed"),
            ],
        ),
    ]

    for name, cat, target, current, target_dt, priority, contribs in goals_seed:
        goal = SavingsGoal(
            user_id=user.id,
            name=name,
            category=cat,
            target_amount_paise=to_paise(target),
            current_amount_paise=to_paise(current),
            target_date=target_dt,
            priority=priority,
        )
        db.add(goal)
        db.flush()
        for c_amt, c_date, c_note in contribs:
            db.add(
                SavingsContribution(
                    goal_id=goal.id,
                    amount_paise=to_paise(c_amt),
                    date=c_date,
                    note=c_note,
                )
            )

    db.add(
        Notification(
            user_id=user.id,
            title="Welcome to FINORA API",
            message="Demo database seeded with realistic Indian personal finance records.",
            tone="info",
            route="/",
            source_key="welcome-demo",
        )
    )
    db.commit()
    return user

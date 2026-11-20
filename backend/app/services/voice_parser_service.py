from __future__ import annotations

import re
from datetime import date as dt_date
from sqlalchemy.orm import Session

from app.schemas.ai import VoiceParseResponse, VoiceParsedTransactionOut
from app.services.ai_copilot_service import process_copilot_chat


CATEGORY_KEYWORDS: dict[str, list[str]] = {
    # Income
    "Salary": ["salary", "paycheck", "wages", "payroll"],
    "Freelancing": ["freelance", "contract", "client payout", "consulting", "gig"],
    "Business": ["business revenue", "sales", "merchant", "customer payment"],
    "Investment income": ["dividend", "stocks", "mutual fund", "interest", "crypto gain"],
    "Other income": ["cashback", "refund", "gift received", "bonus"],
    # Expense
    "Food": ["food", "dinner", "lunch", "breakfast", "snacks", "coffee", "restaurant", "cafe", "dominos", "swiggy", "zomato", "burger", "pizza"],
    "Groceries": ["groceries", "grocery", "supermarket", "vegetables", "fruits", "milk", "blinkit", "zepto", "instamart"],
    "Transport": ["transport", "cab", "uber", "ola", "auto", "metro", "bus", "petrol", "diesel", "fuel", "train ticket", "flight"],
    "Shopping": ["shopping", "clothes", "amazon", "flipkart", "shoes", "electronics", "mall", "myntra"],
    "Entertainment": ["entertainment", "movie", "cinema", "netflix", "concert", "game", "party", "theatre"],
    "Bills": ["electricity", "water", "gas bill", "wifi", "internet", "broadband", "mobile recharge", "bill", "utility"],
    "Subscriptions": ["subscription", "prime", "spotify", "youtube premium", "gym membership"],
    "Rent": ["rent", "maintenance", "landlord"],
    "Healthcare": ["medicine", "doctor", "hospital", "pharmacy", "medical", "clinic", "health"],
    "Education": ["tuition", "books", "course", "udemy", "college fee", "school fee"],
    "Other": ["miscellaneous", "cash withdrawal", "fees", "fine"],
}

PAYMENT_METHOD_KEYWORDS: dict[str, list[str]] = {
    "UPI": ["upi", "gpay", "google pay", "phonepe", "paytm", "qr code"],
    "Credit Card": ["credit card", "credit"],
    "Debit Card": ["debit card", "debit", "atm card"],
    "Cash": ["cash"],
    "Net Banking": ["net banking", "internet banking"],
    "Bank Transfer": ["bank transfer", "neft", "rtgs", "imps", "wire"],
    "Wallet": ["wallet"],
}


def parse_voice_command(db: Session, user_id: int, transcript: str) -> VoiceParseResponse:
    """
    Parses spoken natural language commands into structured financial intents.
    For any transaction extraction, requires_confirmation is strictly enforced as True.
    """
    text = transcript.strip()
    lower = text.lower()

    # 1. Check for Query intents
    if any(k in lower for k in ["what is my balance", "check balance", "current balance", "how much money do i have"]):
        copilot_res = process_copilot_chat(db, user_id, "What is my current net balance?")
        return VoiceParseResponse(
            intent="query_balance",
            confidence=0.95,
            parsed_transaction=None,
            requires_confirmation=False,
            spoken_feedback=copilot_res.reply,
            direct_reply=copilot_res.reply,
        )

    if any(k in lower for k in ["how much did i spend", "total spending", "where did my money go", "highest expense"]):
        copilot_res = process_copilot_chat(db, user_id, "Where did I spend my money this month?")
        return VoiceParseResponse(
            intent="query_spending",
            confidence=0.92,
            parsed_transaction=None,
            requires_confirmation=False,
            spoken_feedback=copilot_res.reply,
            direct_reply=copilot_res.reply,
        )

    if any(k in lower for k in ["check budget", "budget status", "how is my budget", "am i over budget"]):
        copilot_res = process_copilot_chat(db, user_id, "Check my budget status.")
        return VoiceParseResponse(
            intent="query_budget",
            confidence=0.90,
            parsed_transaction=None,
            requires_confirmation=False,
            spoken_feedback=copilot_res.reply,
            direct_reply=copilot_res.reply,
        )

    if any(k in lower for k in ["savings goal", "how are my savings", "savings progress"]):
        copilot_res = process_copilot_chat(db, user_id, "What is my savings goal progress?")
        return VoiceParseResponse(
            intent="query_savings",
            confidence=0.90,
            parsed_transaction=None,
            requires_confirmation=False,
            spoken_feedback=copilot_res.reply,
            direct_reply=copilot_res.reply,
        )

    # 2. Extract numeric amount
    # Matches: ₹500, Rs. 500, 500 rupees, 500rs, 1.5k, 500
    amount: float | None = None
    amount_match = re.search(r'(?:₹|rs\.?|inr)?\s*(\d+(?:[.,]\d+)?)\s*(?:k|thousand|rupees?|rs)?', lower)
    if amount_match:
        raw_num = amount_match.group(1).replace(",", "")
        try:
            val = float(raw_num)
            if "k" in amount_match.group(0).lower() or "thousand" in amount_match.group(0).lower():
                val *= 1000
            if val > 0:
                amount = round(val, 2)
        except ValueError:
            amount = None

    # Determine type: income vs expense
    is_income = any(w in lower for w in ["received", "got", "income", "earned", "salary", "credited", "freelance payout"])
    tx_type = "income" if is_income else "expense"

    # Match Category
    matched_category: str | None = None
    for cat, kws in CATEGORY_KEYWORDS.items():
        if any(w in lower for w in kws):
            matched_category = cat
            break
    if not matched_category:
        matched_category = "Other income" if is_income else "Other"

    # Match Payment Method
    matched_payment: str = "UPI"  # Default
    for method, kws in PAYMENT_METHOD_KEYWORDS.items():
        if any(w in lower for w in kws):
            matched_payment = method
            break

    # If amount was found, create parsed transaction
    if amount is not None and amount > 0:
        # Build a readable title
        # Clean transcript from filler words
        clean_title = re.sub(r'\b(spent|paid|add|record|received|got|rupees|rs|via|using|for|on|with|through)\b', '', text, flags=re.IGNORECASE)
        clean_title = re.sub(r'[\d₹,.]+', '', clean_title).strip()
        if not clean_title or len(clean_title) < 2:
            clean_title = f"{matched_category} {'Income' if is_income else 'Expense'}"

        parsed_tx = VoiceParsedTransactionOut(
            title=clean_title.title(),
            amount=amount,
            type=tx_type,  # type: ignore[arg-type]
            category=matched_category,
            payment_method=matched_payment,
            date=dt_date.today().isoformat(),
            description=f"Voice command: \"{text}\"",
        )

        spoken = (
            f"I identified an {tx_type} of ₹{amount:,.0f} for {matched_category} via {matched_payment}. "
            f"Please review and confirm to save this transaction."
        )

        return VoiceParseResponse(
            intent="add_transaction",
            confidence=0.88,
            parsed_transaction=parsed_tx,
            requires_confirmation=True,
            spoken_feedback=spoken,
            direct_reply=spoken,
        )

    # 3. Fallback to general copilot interpretation
    copilot_res = process_copilot_chat(db, user_id, text)
    return VoiceParseResponse(
        intent="general",
        confidence=0.75,
        parsed_transaction=None,
        requires_confirmation=False,
        spoken_feedback=copilot_res.reply,
        direct_reply=copilot_res.reply,
    )

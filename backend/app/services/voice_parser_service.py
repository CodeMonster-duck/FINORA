from __future__ import annotations

import re
from datetime import date as dt_date
from sqlalchemy.orm import Session

from app.schemas.ai import VoiceParseResponse, VoiceParsedTransactionOut
from app.services.ai_copilot_service import _detect_query_language, process_copilot_chat


CATEGORY_KEYWORDS: dict[str, list[str]] = {
    # Income
    "Salary": ["salary", "paycheck", "wages", "payroll", "tankhwah", "vetan", "वेतन"],
    "Freelancing": ["freelance", "contract", "client payout", "consulting", "gig"],
    "Business": ["business revenue", "sales", "merchant", "customer payment", "vyapar"],
    "Investment income": ["dividend", "stocks", "mutual fund", "interest", "crypto gain", "byaj"],
    "Other income": ["cashback", "refund", "gift received", "bonus", "inam"],
    # Expense
    "Food": ["food", "dinner", "lunch", "breakfast", "snacks", "coffee", "restaurant", "cafe", "dominos", "swiggy", "zomato", "burger", "pizza", "khana", "nashta", "chai", "खाना"],
    "Groceries": ["groceries", "grocery", "supermarket", "vegetables", "fruits", "milk", "blinkit", "zepto", "instamart", "rashan", "sabzi", "दूध", "राशन"],
    "Transport": ["transport", "cab", "uber", "ola", "auto", "metro", "bus", "petrol", "diesel", "fuel", "train ticket", "flight", "kiraya"],
    "Shopping": ["shopping", "clothes", "amazon", "flipkart", "shoes", "electronics", "mall", "myntra", "kapde", "खरीदारी"],
    "Entertainment": ["entertainment", "movie", "cinema", "netflix", "concert", "game", "party", "theatre", "film"],
    "Bills": ["electricity", "water", "gas bill", "wifi", "internet", "broadband", "mobile recharge", "bill", "utility", "bijli"],
    "Subscriptions": ["subscription", "prime", "spotify", "youtube premium", "gym membership"],
    "Rent": ["rent", "maintenance", "landlord", "kamre ka kiraya"],
    "Healthcare": ["medicine", "doctor", "hospital", "pharmacy", "medical", "clinic", "health", "dawa", "दवाई"],
    "Education": ["tuition", "books", "course", "udemy", "college fee", "school fee", "kitabein", "padhai"],
    "Other": ["miscellaneous", "cash withdrawal", "fees", "fine"],
}

PAYMENT_METHOD_KEYWORDS: dict[str, list[str]] = {
    "UPI": ["upi", "gpay", "google pay", "phonepe", "paytm", "qr code"],
    "Credit Card": ["credit card", "credit"],
    "Debit Card": ["debit card", "debit", "atm card"],
    "Cash": ["cash", "nagad", "नकद"],
    "Net Banking": ["net banking", "internet banking"],
    "Bank Transfer": ["bank transfer", "neft", "rtgs", "imps", "wire"],
    "Wallet": ["wallet"],
}


def parse_voice_command(db: Session, user_id: int, transcript: str) -> VoiceParseResponse:
    """
    Parses spoken natural language commands into structured financial intents.
    Supports English, Hindi, and Hinglish.
    For any transaction extraction, requires_confirmation is strictly enforced as True.
    """
    text = transcript.strip()
    lower = text.lower()
    lang = _detect_query_language(text)

    # 1. Check for Query intents
    balance_triggers = [
        "what is my balance", "check balance", "current balance", "how much money do i have",
        "mera balance", "balance kitna", "kitna paisa", "kitne paise", "khate me kitna",
        "खाता शेष", "बैलेंस कितना", "कुल शेष"
    ]
    if any(k in lower for k in balance_triggers):
        copilot_res = process_copilot_chat(db, user_id, text)
        return VoiceParseResponse(
            intent="query_balance",
            confidence=0.95,
            parsed_transaction=None,
            requires_confirmation=False,
            spoken_feedback=copilot_res.reply,
            direct_reply=copilot_res.reply,
        )

    spend_triggers = [
        "how much did i spend", "total spending", "where did my money go", "highest expense",
        "kharcha kitna", "kitna kharcha", "kahan kharch kiya", "kahan gaya paisa",
        "खर्च कितना", "कहाँ खर्च"
    ]
    if any(k in lower for k in spend_triggers):
        copilot_res = process_copilot_chat(db, user_id, text)
        return VoiceParseResponse(
            intent="query_spending",
            confidence=0.92,
            parsed_transaction=None,
            requires_confirmation=False,
            spoken_feedback=copilot_res.reply,
            direct_reply=copilot_res.reply,
        )

    budget_triggers = [
        "check budget", "budget status", "how is my budget", "am i over budget",
        "budget kitna", "budget paar", "बजट कितना", "बजट स्थिति"
    ]
    if any(k in lower for k in budget_triggers):
        copilot_res = process_copilot_chat(db, user_id, text)
        return VoiceParseResponse(
            intent="query_budget",
            confidence=0.90,
            parsed_transaction=None,
            requires_confirmation=False,
            spoken_feedback=copilot_res.reply,
            direct_reply=copilot_res.reply,
        )

    savings_triggers = [
        "savings goal", "how are my savings", "savings progress",
        "bachat kitni", "savings kitni", "बचत लक्ष्य", "बचत कितनी"
    ]
    if any(k in lower for k in savings_triggers):
        copilot_res = process_copilot_chat(db, user_id, text)
        return VoiceParseResponse(
            intent="query_savings",
            confidence=0.90,
            parsed_transaction=None,
            requires_confirmation=False,
            spoken_feedback=copilot_res.reply,
            direct_reply=copilot_res.reply,
        )

    # 2. Extract numeric amount
    # Matches: ₹500, Rs. 500, 500 rupees, 500rs, 1.5k, 500 rupaye, रु 500
    amount: float | None = None
    amount_match = re.search(r'(?:₹|rs\.?|inr|रु\.?|रुपये)?\s*(\d+(?:[.,]\d+)?)\s*(?:k|thousand|rupees?|rs|rupaye|rupayee|हज़ार|रुपये)?', lower)
    if amount_match:
        raw_num = amount_match.group(1).replace(",", "")
        try:
            val = float(raw_num)
            matched_str = amount_match.group(0).lower()
            if "k" in matched_str or "thousand" in matched_str or "हज़ार" in matched_str:
                val *= 1000
            if val > 0:
                amount = round(val, 2)
        except ValueError:
            amount = None

    # Determine type: income vs expense
    income_indicators = [
        "received", "got", "income", "earned", "salary", "credited", "freelance payout",
        "mila", "mile", "kamaya", "aaye", "aayi", "vetan", "वेतन", "मिला"
    ]
    is_income = any(w in lower for w in income_indicators)
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
        # Clean title from filler words in EN/HI/Hinglish
        clean_title = re.sub(
            r'\b(spent|paid|add|record|received|got|rupees|rs|via|using|for|on|with|through|kharcha|kharch|diye|rupaye|rupayee|par|se|ka|ki|ko)\b',
            '',
            text,
            flags=re.IGNORECASE,
        )
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

        if lang == "hindi":
            spoken = (
                f"मैंने {matched_category} के लिए {matched_payment} द्वारा ₹{amount:,.0f} का {tx_type} पहचाना है। "
                f"कृपया सुरक्षित करने से पहले विवरण की पुष्टि करें।"
            )
        elif lang == "hinglish":
            spoken = (
                f"Maine ₹{amount:,.0f} ka {tx_type} identify kiya hai ({matched_category} via {matched_payment}). "
                f"Please verify karke confirm karein."
            )
        else:
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

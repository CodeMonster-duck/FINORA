from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request
from typing import Any
from sqlalchemy.orm import Session

from app.schemas.ai import CopilotChatMessage, CopilotChatResponse
from app.services.ai_context_service import format_context_for_prompt, get_user_financial_context

logger = logging.getLogger(__name__)

# Category synonyms and alias matching (English, Hindi transliterated, Devanagari)
CATEGORY_ALIASES: dict[str, list[str]] = {
    "Rent": ["rent", "room rent", "house rent", "flat rent", "makan kiraya", "kamre ka kiraya", "किराया", "मकान किराया"],
    "Food": ["food", "dinner", "lunch", "breakfast", "nashta", "restaurant", "cafe", "swiggy", "zomato", "dominos", "pizza", "burger", "khana", "खाना", "नाश्ता", "भोजन"],
    "Groceries": ["groceries", "grocery", "rashan", "sabzi", "sabji", "supermarket", "doodh", "milk", "zepto", "blinkit", "instamart", "राशन", "सब्जी"],
    "Transport": ["transport", "cab", "uber", "ola", "auto", "metro", "bus", "petrol", "diesel", "fuel", "travel", "flight", "train", "yatayat", "यातायात", "सफर"],
    "Shopping": ["shopping", "clothes", "amazon", "flipkart", "myntra", "shoes", "kapde", "kharidari", "खरीदारी", "कपड़े"],
    "Entertainment": ["entertainment", "movie", "cinema", "netflix", "theatre", "film", "concert", "party", "मनोरंजन", "फिल्म"],
    "Bills": ["bills", "bill", "electricity", "water", "gas bill", "wifi", "internet", "broadband", "mobile recharge", "bijli", "बिजली", "बिल"],
    "Subscriptions": ["subscriptions", "subscription", "prime", "spotify", "youtube premium", "gym membership"],
    "Healthcare": ["healthcare", "health", "medicine", "doctor", "hospital", "pharmacy", "medical", "clinic", "dawa", "dawai", "दवा", "दवाई", "इलाज"],
    "Education": ["education", "tuition", "books", "course", "udemy", "college fee", "school fee", "fees", "kitabein", "padhai", "शिक्षा", "पढ़ाई", "किताबें"],
    "Salary": ["salary", "paycheck", "wages", "payroll", "tankhwah", "vetan", "वेतन", "तनख्वाह"],
    "Freelancing": ["freelance", "freelancing", "contract", "client payout", "gig"],
    "Business": ["business", "revenue", "sales", "merchant", "vyapar", "व्यापार"],
    "Investment income": ["investment", "dividend", "stocks", "mutual fund", "interest", "crypto", "byaj", "ब्याज"],
    "Other": ["other", "miscellaneous", "cash withdrawal"],
}

UNRELATED_TRIGGERS = [
    "capital of", "president of", "prime minister", "who is", "weather in", "weather today",
    "tell me a joke", "write a poem", "python code", "how to code", "recipe for", "bake a cake",
    "photosynthesis", "solar system", "speed of light", "mount everest", "fifa", "cricket score",
    "mausam kaisa", "chutkula sunao", "joke sunao", "pm kaun hai", "raashtrapati", "मौसम"
]


def _detect_query_language(text: str) -> str:
    """Detects whether user query is 'hindi', 'hinglish', or 'english'."""
    # Check for Devanagari characters
    if re.search(r"[\u0900-\u097f]", text):
        return "hindi"

    hinglish_markers = {
        "mera", "meri", "mere", "kharcha", "kharch", "bachat", "paisa", "paise",
        "kitna", "kitni", "kitne", "kahan", "batao", "aaya", "aaye", "aayi",
        "bache", "baki", "kya", "hai", "hain", "kaise", "karo", "kare", "mahine",
        "rupaye", "rupayee", "kamaya", "diye", "dekhna", "dikhao", "bataiye",
        "pichle", "pichla", "sabse", "jyada", "hua", "huve", "tha", "thi",
        "raha", "rahi", "rahe", "badh", "kyu", "kyun", "kab", "kisko", "unka",
        "aamdani", "kamai", "kiraya", "rashan", "dawai", "bijli"
    }
    tokens = set(re.findall(r"\b\w+\b", text.lower()))
    if tokens & hinglish_markers:
        return "hinglish"

    # Multi-word Hinglish phrases
    lower_text = text.lower()
    if any(phrase in lower_text for phrase in ["is mahine", "khate me", "paise bache", "bachat hui"]):
        return "hinglish"

    return "english"


def _fmt_curr(val: float, curr: str = "INR") -> str:
    """Formats amount with appropriate currency symbol (₹ for INR)."""
    sym = "₹" if curr.upper() == "INR" else f"{curr} "
    if val.is_integer():
        return f"{sym}{int(val):,}"
    return f"{sym}{val:,.2f}"


def _extract_category_and_period(
    query: str,
    history: list[CopilotChatMessage] | None,
) -> tuple[str | None, str]:
    """
    Extracts category and period from current query or conversational memory.
    Supports follow-ups like 'What about Food?' or 'And last month?'.
    """
    q = query.lower()

    # Determine period
    period = "current_month"
    if any(k in q for k in ["yesterday", "kal", "बीता कल", "बीता हुआ कल"]):
        period = "yesterday"
    elif any(k in q for k in ["last month", "previous month", "pichle mahine", "pichla mahina", "पिछला महीना", "पिछले महीने"]):
        period = "last_month"
    elif any(k in q for k in ["all time", "kul", "hamesha", "ab tak"]):
        period = "all_time"

    # Match category in current query
    matched_cat: str | None = None
    for cat_name, aliases in CATEGORY_ALIASES.items():
        for alias in aliases:
            pattern = r"\b" + re.escape(alias) + r"\b"
            if re.search(pattern, q):
                matched_cat = cat_name
                break
        if matched_cat:
            break

    # If no category in current query, check recent conversation history for follow-ups
    if not matched_cat and history:
        for prev in reversed(history[-4:]):
            prev_text = prev.content.lower()
            for cat_name, aliases in CATEGORY_ALIASES.items():
                for alias in aliases:
                    if re.search(r"\b" + re.escape(alias) + r"\b", prev_text):
                        matched_cat = cat_name
                        break
                if matched_cat:
                    break
            if matched_cat:
                break

    return matched_cat, period


def _generate_specific_response(
    query: str,
    history: list[CopilotChatMessage] | None,
    ctx: dict[str, Any],
) -> tuple[str, list[str]]:
    """
    Genuine question-understanding & specific financial response engine.
    Follows: Understand -> Identify Intent -> Retrieve Records -> Calculate -> Answer Directly.
    Provides concise, non-repetitive answers in English, Hindi, and Hinglish.
    """
    q = query.lower().strip()
    lang = _detect_query_language(query)
    curr = ctx.get("currency", "INR")
    has_tx = ctx.get("has_transactions", False)

    category, period = _extract_category_and_period(query, history)

    # 1. Unrelated / Out-of-Domain Questions
    if any(k in q for k in UNRELATED_TRIGGERS):
        if lang == "hindi":
            return (
                "मैं आपका FINORA व्यक्तिगत वित्तीय सहायक हूँ। मैं केवल आपके वित्तीय रिकॉर्ड, खर्च, बजट और बचत लक्ष्यों से संबंधित प्रश्नों के उत्तर दे सकता हूँ।",
                ["मेरा बैलेंस कितना है?", "इस महीने का खर्च कितना है?", "बजट स्थिति देखें"]
            )
        elif lang == "hinglish":
            return (
                "Main aapka FINORA finance assistant hoon. Main sirf aapke personal finances, kharch, budgets aur savings goals me madad kar sakta hoon.",
                ["Mera balance kitna hai?", "Is mahine kitna kharcha hua?", "Budget status dikhao"]
            )
        return (
            "I am your FINORA personal finance assistant. I can only assist with your personal finances, spending, budgets, and savings goals.",
            ["What is my current balance?", "Where did I spend the most?", "Am I over budget?"]
        )

    # 2. Empty Account Handling (user has 0 transactions)
    if not has_tx:
        # If user asks for balance on empty account, answer that current Net Balance is 0
        is_balance_q = any(k in q for k in [
            "balance", "net balance", "current balance", "account balance", "net worth", "how much money do i have",
            "mera balance", "balance kitna", "kitna paisa", "kitne paise", "khate me kitna", "कुल बैलेंस", "शेष राशि"
        ])
        if is_balance_q:
            if lang == "hindi":
                return f"आपका वर्तमान कुल शेष (Net Balance) {_fmt_curr(0.0, curr)} है।", ["नया लेनदेन कैसे जोड़ें?"]
            elif lang == "hinglish":
                return f"Aapka current Net Balance {_fmt_curr(0.0, curr)} hai.", ["Transaction kaise add karein?"]
            return f"Your current Net Balance is {_fmt_curr(0.0, curr)}.", ["How to add a transaction?"]

        if lang == "hindi":
            return (
                "आपके FINORA खाते में अभी तक कोई लेन-देन दर्ज नहीं है। वित्तीय विश्लेषण देखने के लिए कृपया अपना पहला खर्च या आय जोड़ें।",
                ["नया लेनदेन कैसे जोड़ें?", "बजट कैसे बनाएं?"]
            )
        elif lang == "hinglish":
            return (
                "Aapke FINORA account me abhi tak koi transaction record nahi hai. Insights dekhne ke liye please apna pehla transaction add karein.",
                ["Transaction kaise add karein?", "Budget kaise set karein?"]
            )
        return (
            "You have no transactions recorded in FINORA yet. Please add your first income or expense to see insights.",
            ["How to add a transaction?", "How to create a budget?"]
        )

    # 3. Overall / Complete Summary (ONLY when explicitly asked)
    if any(k in q for k in ["complete summary", "full summary", "overall summary", "financial summary", "pura summary", "complete financial summary", "sampurna vivaran", "संपूर्ण सारांश", "पूरा विवरण"]):
        net_bal = _fmt_curr(ctx.get("net_balance", 0.0), curr)
        inc = _fmt_curr(ctx.get("month_income", 0.0), curr)
        exp = _fmt_curr(ctx.get("month_expense", 0.0), curr)
        sav = _fmt_curr(ctx.get("monthly_savings", 0.0), curr)
        sav_pct = ctx.get("savings_rate_pct", 0.0)
        high = ctx.get("highest_spending")
        high_str = f"{high['category']} ({_fmt_curr(high['spent'], curr)})" if high else "None"
        budgets = ctx.get("budgets", [])
        exceeded = ctx.get("exceeded_budgets", [])
        goals = ctx.get("savings_goals", [])

        if lang == "hindi":
            reply = (
                f"यहाँ आपका संपूर्ण वित्तीय सारांश है:\n"
                f"• कुल शेष (Net Balance): {net_bal}\n"
                f"• इस महीने की आय: {inc}\n"
                f"• इस महीने का खर्च: {exp} (शुद्ध बचत: {sav}, {sav_pct}%)\n"
                f"• मुख्य खर्च श्रेणी: {high_str}\n"
                f"• सक्रिय बजट: {len(budgets)} ({len(exceeded)} सीमा पार)\n"
                f"• बचत लक्ष्य: {len(goals)} सक्रिय"
            )
        elif lang == "hinglish":
            reply = (
                f"Yeh raha aapka complete financial summary:\n"
                f"• Net Balance: {net_bal}\n"
                f"• This Month Income: {inc}\n"
                f"• This Month Expenses: {exp} (Savings: {sav}, {sav_pct}%)\n"
                f"• Top Category: {high_str}\n"
                f"• Active Budgets: {len(budgets)} ({len(exceeded)} exceeded)\n"
                f"• Savings Goals: {len(goals)} active"
            )
        else:
            reply = (
                f"Here is your complete financial summary for this month:\n"
                f"• Net Balance: {net_bal}\n"
                f"• Income: {inc}\n"
                f"• Expenses: {exp} (Net Savings: {sav}, {sav_pct}%)\n"
                f"• Top Category: {high_str}\n"
                f"• Active Budgets: {len(budgets)} ({len(exceeded)} exceeded)\n"
                f"• Savings Goals: {len(goals)} active"
            )
        return reply, ["Where did I spend the most?", "How much did I spend on Food?", "Am I over budget?"]

    # 4. Highest Spending Category & Where money went
    if any(k in q for k in [
        "spend the most", "highest spending", "highest expense", "most expensive", "sabse jyada kharcha",
        "kahan kharcha sabse jyada", "sabse bada kharch", "kahan kharcha hua sabse", "sabse jyada kharch",
        "sabse bada kharcha", "where did i spend my money", "where did my money go", "where did i spend",
        "where did all my money go", "kahan gaya paisa", "kahan kharcha kiya", "kahan kharch hua",
        "पैसा कहाँ गया", "कहाँ खर्च किया", "सबसे ज्यादा खर्च", "अधिकतम खर्च", "सबसे बड़ा खर्च"
    ]):
        high = ctx.get("highest_spending")
        if not high:
            if lang == "hindi":
                return "इस महीने कोई खर्च दर्ज नहीं है।", ["मेरा बैलेंस कितना है?"]
            elif lang == "hinglish":
                return "Is mahine koi expense record nahi hua hai.", ["Mera balance kitna hai?"]
            return "You have no expenses recorded for this month.", ["What is my current balance?"]

        cat = high["category"]
        amt = _fmt_curr(high["spent"], curr)
        if lang == "hindi":
            return f"इस महीने आपका सबसे बड़ा खर्च {cat} में हुआ है ({amt})।", [f"How much did I spend on {cat}?", "Am I over budget?"]
        elif lang == "hinglish":
            return f"Is mahine aapka sabse jyada kharcha {cat} par hua hai ({amt}).", [f"{cat} ka budget kitna hai?", "Mera balance kitna hai?"]
        return f"Your highest spending category this month is {cat}, at {amt}.", [f"How much did I spend on {cat}?", "Am I over budget?"]

    # 5. Lowest Spending Category
    if any(k in q for k in ["spend the least", "lowest spending", "lowest expense", "least spent", "sabse kam kharcha", "sabse kam kharch", "सबसे कम खर्च"]):
        low = ctx.get("lowest_spending")
        if not low:
            return ("You have no expenses recorded for this month.", ["What is my current balance?"])
        cat = low["category"]
        amt = _fmt_curr(low["spent"], curr)
        if lang == "hindi":
            return f"इस महीने आपका सबसे कम खर्च {cat} में हुआ है ({amt})।", ["सबसे ज्यादा खर्च कहाँ हुआ?"]
        elif lang == "hinglish":
            return f"Is mahine aapka sabse kam kharcha {cat} par hua hai ({amt}).", ["Sabse jyada kharcha kahan hua?"]
        return f"Your lowest spending category this month is {cat}, at {amt}.", ["Where did I spend the most?"]

    # 6. Current Balance & Net Cash Flow
    if any(k in q for k in [
        "balance", "net balance", "current balance", "account balance", "net worth", "how much money do i have",
        "mera balance", "balance kitna", "kitna paisa", "kitne paise", "khate me kitna", "rupaye bache",
        "कुल बैलेंस", "शेष राशि", "खाते में कितना"
    ]):
        net_bal = _fmt_curr(ctx.get("net_balance", 0.0), curr)
        if lang == "hindi":
            return f"आपका वर्तमान कुल शेष (Net Balance) {net_bal} है।", ["इस महीने कितना खर्च हुआ?", "सबसे ज्यादा खर्च कहाँ हुआ?"]
        elif lang == "hinglish":
            return f"Aapka current Net Balance {net_bal} hai.", ["Is mahine kitna kharcha hua?", "Sabse jyada kharcha kahan hua?"]
        return f"Your current Net Balance is {net_bal}.", ["Where did I spend the most?", "How much did I spend on Food?"]

    # 7. Category-Specific Spending (e.g. "How much did I spend on Food?", "What about Transport?", "Rent ka kharcha")
    if category:
        cat_map = ctx.get("category_spending_map", {})
        last_cat_map = ctx.get("last_month_category_spending_map", {})
        budget_map = ctx.get("budget_by_category_map", {})
        
        is_asking_spending = any(k in q for k in ["how much", "spend", "spent", "expense", "kharcha", "kharch", "kitna", "what about", "and", "kya", "खर्च", "कितना"]) or len(q.split()) <= 3

        if is_asking_spending:
            target_spent = last_cat_map.get(category.lower(), 0.0) if period == "last_month" else cat_map.get(category.lower(), 0.0)
            amt_str = _fmt_curr(target_spent, curr)
            period_label = "last month" if period == "last_month" else "this month"
            period_label_hl = "pichle mahine" if period == "last_month" else "is mahine"
            period_label_hi = "पिछले महीने" if period == "last_month" else "इस महीने"

            # Check if budget exists for this category
            b_info = budget_map.get(category.lower())
            budget_note = ""
            if b_info and period != "last_month":
                b_limit = _fmt_curr(b_info["limit"], curr)
                b_util = b_info["utilization_pct"]
                if b_info["status"] == "exceeded":
                    over = _fmt_curr(b_info["spent"] - b_info["limit"], curr)
                    budget_note = f" (Exceeded {b_limit} budget by {over})"
                else:
                    budget_note = f" (Budget: {b_limit}, {b_util}% used)"

            if lang == "hindi":
                reply = f"आपने {period_label_hi} {category} पर {amt_str} खर्च किए हैं{budget_note}।"
            elif lang == "hinglish":
                reply = f"Aapne {period_label_hl} {category} par {amt_str} kharch kiye hain{budget_note}."
            else:
                reply = f"You spent {amt_str} on {category} {period_label}{budget_note}."

            return reply, ["Where did I spend the most?", "Am I over budget?", "What is my current balance?"]

    # 8. Budget Utilization & Overspending ("Am I over budget?", "Kya mera budget cross hua?")
    if any(k in q for k in [
        "over budget", "budget cross", "budget exceeded", "am i over budget", "kya budget cross hua",
        "budget paar", "check budget", "budget limit", "are any budgets exceeded", "बजट पार", "बजट सीमा"
    ]):
        exceeded = ctx.get("exceeded_budgets", [])
        budgets = ctx.get("budgets", [])

        if not budgets:
            if lang == "hindi":
                return "वर्तमान महीने के लिए कोई बजट निर्धारित नहीं है।", ["नया बजट कैसे बनाएं?"]
            elif lang == "hinglish":
                return "Is mahine ke liye koi active budget configured nahi hai.", ["Budget kaise banayein?"]
            return "You do not have any active budgets configured for this month.", ["How to set a budget?"]

        if exceeded:
            details = ", ".join([f"{b['category']} ({_fmt_curr(b['spent'], curr)} of {_fmt_curr(b['limit'], curr)} limit, {_fmt_curr(b['overrun'], curr)} over)" for b in exceeded])
            if lang == "hindi":
                return f"हाँ, आपका बजट पार हो चुका है: {details}।", ["मैं खर्च कैसे कम करूँ?"]
            elif lang == "hinglish":
                return f"Haan, aapka budget exceed ho gaya hai: {details}.", ["Kharcha control kaise karein?"]
            return f"Yes, you have exceeded budget limits: {details}.", ["How can I reduce spending?"]
        else:
            if lang == "hindi":
                return "नहीं, आपके सभी सक्रिय बजट सीमा के भीतर हैं।", ["बजट उपयोग विवरण देखें"]
            elif lang == "hinglish":
                return "Nahi, aapke sabhi active budgets limits ke andar hain.", ["Sabse jyada kharcha kahan hua?"]
            return "No, all your active budgets are within limits.", ["Where did I spend the most?"]

    # 9. Yesterday's Spending ("What did I spend on yesterday?", "Kal kya kharcha hua?")
    if any(k in q for k in ["yesterday", "kal kya kharcha", "kal kitna kharch", "kal ke transactions", "कल क्या खर्च", "कल का खर्च"]):
        y_txs = ctx.get("yesterday_transactions", [])
        y_total = _fmt_curr(ctx.get("yesterday_expense", 0.0), curr)

        if not y_txs:
            if lang == "hindi":
                return "कल आपका कोई खर्च दर्ज नहीं हुआ।", ["इस महीने कितना खर्च हुआ?"]
            elif lang == "hinglish":
                return "Kal aapka koi kharcha record nahi hua.", ["Is mahine kitna kharcha hua?"]
            return "You had no expenses recorded yesterday.", ["How much did I spend this month?"]

        tx_items = ", ".join([f"{t['title']} ({_fmt_curr(t['amount'], curr)} via {t['payment_method']})" for t in y_txs])
        if lang == "hindi":
            return f"कल आपने {y_total} खर्च किए: {tx_items}।", ["इस महीने कितना खर्च हुआ?"]
        elif lang == "hinglish":
            return f"Kal aapka total kharcha {y_total} hua: {tx_items}.", ["Is mahine kitna kharcha hua?"]
        return f"Yesterday you spent {y_total} across {len(y_txs)} transaction(s): {tx_items}.", ["Where did I spend the most?"]

    # 10. Monthly Period Comparisons ("Compare this month with last month", "Last month vs this month")
    if any(k in q for k in [
        "compare this month with last month", "this month vs last month", "compare last month",
        "pichle mahine se tulna", "pichle mahine aur is mahine", "pichle mahine se compare",
        "comparison", "तुलना", "पिछले महीने से तुलना"
    ]):
        if not ctx.get("has_last_month_data"):
            if lang == "hindi":
                return "तुलना करने के लिए पिछले महीने का कोई लेन-देन रिकॉर्ड उपलब्ध नहीं है।", ["इस महीने का खर्च कितना है?"]
            elif lang == "hinglish":
                return "Pichle mahine ke transaction records available nahi hain compare karne ke liye.", ["Is mahine kitna kharcha hua?"]
            return "There are no transaction records for the previous month to compare with.", ["How much did I spend this month?"]

        curr_exp = ctx.get("month_expense", 0.0)
        last_exp = ctx.get("last_month_expense", 0.0)
        diff = curr_exp - last_exp
        curr_str = _fmt_curr(curr_exp, curr)
        last_str = _fmt_curr(last_exp, curr)
        diff_str = _fmt_curr(abs(diff), curr)

        if diff < 0:
            pct = round((abs(diff) / last_exp) * 100, 1) if last_exp > 0 else 0
            if lang == "hindi":
                return f"इस महीने आपका खर्च {curr_str} है जबकि पिछले महीने {last_str} था (खर्च में {diff_str} या {pct}% की कमी आई है)।", ["सबसे ज्यादा खर्च कहाँ हुआ?"]
            elif lang == "hinglish":
                return f"Is mahine aapka kharcha {curr_str} hai jabki pichle mahine {last_str} tha (kharcha {diff_str} ya {pct}% kam hua hai).", ["Sabse jyada kharcha kahan hua?"]
            return f"This month you spent {curr_str} compared to {last_str} last month (spending is down by {diff_str} or {pct}%).", ["Where did I spend the most?"]
        elif diff > 0:
            pct = round((diff / last_exp) * 100, 1) if last_exp > 0 else 0
            if lang == "hindi":
                return f"इस महीने आपका खर्च {curr_str} है जबकि पिछले महीने {last_str} था (खर्च में {diff_str} या {pct}% की वृद्धि हुई है)।", ["खर्च क्यों बढ़ रहा है?"]
            elif lang == "hinglish":
                return f"Is mahine aapka kharcha {curr_str} hai jabki pichle mahine {last_str} tha (kharcha {diff_str} ya {pct}% badh gaya hai).", ["Spending badh kyu rahi hai?"]
            return f"This month you spent {curr_str} compared to {last_str} last month (spending is up by {diff_str} or {pct}%).", ["Why is my spending increasing?"]
        else:
            return f"Your spending this month ({curr_str}) is exactly the same as last month ({last_str}).", ["Where did I spend the most?"]

    # 11. Savings Potential ("How much can I save this month?", "Is mahine kitni bachat ho sakti hai?")
    if any(k in q for k in [
        "how much can i save", "can i save this month", "savings rate", "kitni bachat ho sakti",
        "kitna bacha sakta", "kitni bachat kar", "bachat ki sambhavna", "कितनी बचत कर सकता हूँ", "बचत दर"
    ]):
        inc = _fmt_curr(ctx.get("month_income", 0.0), curr)
        exp = _fmt_curr(ctx.get("month_expense", 0.0), curr)
        sav = _fmt_curr(ctx.get("monthly_savings", 0.0), curr)
        pct = ctx.get("savings_rate_pct", 0.0)

        if lang == "hindi":
            return f"आपकी आय {inc} और वर्तमान व्यय {exp} के अनुसार, आप इस महीने {sav} बचा सकते हैं (बचत दर: {pct}%)।", ["मेरे बचत लक्ष्य कैसे चल रहे हैं?"]
        elif lang == "hinglish":
            return f"Aapki income {inc} aur expenses {exp} ke hisaab se, is mahine aap lagbhag {sav} bacha sakte hain (savings rate: {pct}%).", ["Savings goals ka status dikhao"]
        return f"Based on your income of {inc} and current expenses of {exp}, your potential net savings this month is {sav} (savings rate: {pct}%).", ["How are my savings goals progressing?"]

    # 12. Spending Increase Driver / "Why is my spending increasing?" / "Am I spending too much?"
    if any(k in q for k in [
        "spending increasing", "spending badh kyu rahi", "why is my spending increasing", "spending kyu badh",
        "spending too much", "kharch kyu badh raha", "jyada kharch ho raha", "is my spending increasing",
        "खर्च क्यों बढ़ रहा है", "क्या मैं ज्यादा खर्च कर रहा हूँ"
    ]):
        high = ctx.get("highest_spending")
        month_exp = ctx.get("month_expense", 0.0)
        last_exp = ctx.get("last_month_expense", 0.0)

        if not ctx.get("has_last_month_data") and month_exp > 0 and high:
            pct = round((high["spent"] / month_exp) * 100, 1)
            cat = high["category"]
            amt = _fmt_curr(high["spent"], curr)
            if lang == "hindi":
                return f"आपका खर्च मुख्य रूप से {cat} ({amt}) के कारण है, जो आपके कुल मासिक खर्च का {pct}% है।", ["बजट सीमा जांचें"]
            elif lang == "hinglish":
                return f"Aapka kharcha mukhya roop se {cat} ({amt}) ki wajah se hai, jo is mahine ke total expenses ka {pct}% hai.", ["Budget status check karein"]
            return f"Your spending is driven primarily by {cat} ({amt}), which accounts for {pct}% of your total expenses this month.", ["Am I over budget?"]

        if not ctx.get("has_last_month_data"):
            if lang == "hindi":
                return "खर्च के रुझान का विश्लेषण करने के लिए पर्याप्त ऐतिहासिक डेटा उपलब्ध नहीं है।", ["इस महीने कितना खर्च हुआ?"]
            elif lang == "hinglish":
                return "Spending trends analyze karne ke liye historical data uplabdh nahi hai.", ["Is mahine kitna kharcha hua?"]
            return "There is insufficient historical transaction data to analyze spending increase trends.", ["How much did I spend this month?"]

        # When last month data exists:
        if month_exp <= last_exp and high:
            pct = round((high["spent"] / month_exp) * 100, 1) if month_exp > 0 else 0.0
            cat = high["category"]
            amt = _fmt_curr(high["spent"], curr)
            curr_str = _fmt_curr(month_exp, curr)
            last_str = _fmt_curr(last_exp, curr)
            if lang == "hindi":
                return f"कुल मिलाकर इस महीने आपका खर्च ({curr_str}) पिछले महीने ({last_str}) से कम है। आपका मुख्य खर्च {cat} ({amt}) है, जो कुल का {pct}% है।", ["खर्च की तुलना देखें"]
            elif lang == "hinglish":
                return f"Overall aapka is mahine ka kharcha ({curr_str}) pichle mahine ({last_str}) se kam hai. Aapka main expense {cat} ({amt}) hai, jo total ka {pct}% hai.", ["Compare with last month"]
            return f"Overall, your spending this month ({curr_str}) is lower than last month ({last_str}). Your primary expense remains {cat} ({amt}), accounting for {pct}% of total spending.", ["Compare this month with last month"]

        # If overall spending grew, find biggest increased category
        curr_cat_map = ctx.get("category_spending_map", {})
        last_cat_map = ctx.get("last_month_category_spending_map", {})
        biggest_diff_cat = None
        biggest_diff_val = 0.0

        for cat_k, curr_val in curr_cat_map.items():
            last_val = last_cat_map.get(cat_k, 0.0)
            diff_val = curr_val - last_val
            if diff_val > biggest_diff_val:
                biggest_diff_val = diff_val
                biggest_diff_cat = cat_k

        if biggest_diff_cat and biggest_diff_val > 0:
            cat_display = biggest_diff_cat.capitalize()
            diff_amt = _fmt_curr(biggest_diff_val, curr)
            if lang == "hindi":
                return f"आपके खर्च में वृद्धि का मुख्य कारण {cat_display} है (पिछले महीने की तुलना में {diff_amt} अधिक)।", [f"{cat_display} पर कितना खर्च हुआ?"]
            elif lang == "hinglish":
                return f"Aapke kharche me badhotri ka main reason {cat_display} hai (pichle mahine se {diff_amt} jyada).", [f"{cat_display} par kitna kharcha hua?"]
            return f"Your spending increase is mainly driven by {cat_display} ({diff_amt} higher than last month).", [f"How much did I spend on {cat_display}?"]

        return "Your overall spending is currently lower or steady compared to last month.", ["Compare this month with last month"]

    # 13. Month Expenses Total ("Is mahine kitna kharcha hua?", "How much did I spend this month?")
    if any(k in q for k in [
        "is mahine kitna kharcha", "kitna kharcha hua", "total expenses this month", "how much did i spend this month",
        "kul kharcha kitna", "this month spending", "this month expenses", "is mahine ka kharcha", "कुल खर्च कितना है", "इस महीने कितना खर्च हुआ"
    ]):
        exp = _fmt_curr(ctx.get("month_expense", 0.0), curr)
        inc = _fmt_curr(ctx.get("month_income", 0.0), curr)
        if lang == "hindi":
            return f"इस महीने आपका कुल खर्च {exp} है (आय: {inc})।", ["सबसे ज्यादा खर्च कहाँ हुआ?", "क्या कोई बजट सीमा पार हुई?"]
        elif lang == "hinglish":
            return f"Is mahine aapka kul kharcha {exp} hai (Income: {inc}).", ["Sabse jyada kharcha kahan hua?", "Am I over budget?"]
        return f"Your total spending this month is {exp} (Income: {inc}).", ["Where did I spend the most?", "Am I over budget?"]

    # 14. Month Income Total
    if any(k in q for k in ["how much did i earn", "income this month", "this month income", "kamai kitni", "aamdani kitni", "kul aay", "कुल आय"]):
        inc = _fmt_curr(ctx.get("month_income", 0.0), curr)
        if lang == "hindi":
            return f"इस महीने आपकी दर्ज आय {inc} है।", ["इस महीने कितना खर्च हुआ?", "मेरा बैलेंस कितना है?"]
        elif lang == "hinglish":
            return f"Is mahine aapki recorded income {inc} hai.", ["Is mahine kitna kharcha hua?", "Mera balance kitna hai?"]
        return f"Your recorded income this month is {inc}.", ["How much did I spend this month?", "What is my current balance?"]

    # 15. Savings Goals Status
    if any(k in q for k in ["savings goal", "savings goals", "bachat lakshya", "goals status", "लक्ष्य की स्थिति", "बचत लक्ष्य"]):
        goals = ctx.get("savings_goals", [])
        if not goals:
            if lang == "hindi":
                return "वर्तमान में कोई सक्रिय बचत लक्ष्य निर्धारित नहीं है।", ["बचत लक्ष्य कैसे बनाएं?"]
            elif lang == "hinglish":
                return "Abhi koi active savings goal set nahi hai.", ["Goal kaise create karein?"]
            return "You have no active savings goals set up currently.", ["How to create a savings goal?"]

        goal_lines = []
        for g in goals[:3]:
            c_val = _fmt_curr(g["current"], curr)
            t_val = _fmt_curr(g["target"], curr)
            goal_lines.append(f"{g['name']}: {c_val} of {t_val} ({g['progress_pct']}%)")
        summary_str = "; ".join(goal_lines)

        if lang == "hindi":
            return f"आपके सक्रिय बचत लक्ष्य: {summary_str}।", ["मैं तेजी से बचत कैसे करूँ?"]
        elif lang == "hinglish":
            return f"Aapke active savings goals: {summary_str}.", ["Bachat badhane ke tips"]
        return f"Your active savings goals: {summary_str}.", ["How much can I save this month?"]

    # 16. Expense Predictions / Month-End Forecast
    if any(k in q for k in ["predict my expenses", "forecast", "month end forecast", "mahine ke ant", "पूर्वानुमान", "खर्च का अनुमान"]):
        pred = _fmt_curr(ctx.get("predicted_month_end_expense", 0.0), curr)
        burn = _fmt_curr(ctx.get("daily_burn_rate", 0.0), curr)
        if lang == "hindi":
            return f"आपके दैनिक औसत खर्च ({burn}/दिन) के आधार पर, इस महीने के अंत तक अनुमानित खर्च {pred} होगा।", ["बजट स्थिति देखें"]
        elif lang == "hinglish":
            return f"Aapke daily spending rate ({burn}/day) ke basis par, month-end projected kharcha {pred} hoga.", ["Budget status dekhein"]
        return f"Based on your daily spending of {burn}/day, your predicted month-end expenditure is {pred}.", ["Am I over budget?"]

    # 17. Financial Health Score
    if any(k in q for k in ["health score", "financial health", "score kitna", "स्वास्थ्य स्कोर"]):
        h = ctx.get("health_score", {})
        score = h.get("score", 75)
        rating = h.get("rating", "Good")
        if lang == "hindi":
            return f"आपका वित्तीय स्वास्थ्य स्कोर 100 में से {score} ({rating}) है।", ["स्कोर कैसे सुधारें?"]
        elif lang == "hinglish":
            return f"Aapka financial health score 100 me se {score} ({rating}) hai.", ["Score kaise improve karein?"]
        return f"Your financial health score is {score}/100 ({rating}).", ["How can I improve my score?"]

    # 18. Recent Transactions
    if any(k in q for k in ["recent transactions", "last transactions", "len den", "haal ke", "हाल के लेनदेन"]):
        txs = ctx.get("recent_transactions", [])
        if not txs:
            return ("No recent transactions recorded.", ["How to add a transaction?"])
        items = [f"{t['title']} ({_fmt_curr(t['amount'], curr)} {t['category']})" for t in txs[:3]]
        items_str = ", ".join(items)
        if lang == "hindi":
            return f"हाल के लेनदेन: {items_str}।", ["मेरा बैलेंस कितना है?"]
        elif lang == "hinglish":
            return f"Recent transactions: {items_str}.", ["Mera balance kitna hai?"]
        return f"Recent transactions: {items_str}.", ["What is my current balance?"]

    # 19. Clarification Question (ambiguous/unrecognized queries - NEVER dump generic snapshot)
    if lang == "hindi":
        return (
            "क्या आप स्पष्ट कर सकते हैं कि आपको कौन सी वित्तीय जानकारी चाहिए? आप अपने बैलेंस, खर्च, किसी विशेष श्रेणी, या बजट के बारे में पूछ सकते हैं।",
            ["मेरा बैलेंस कितना है?", "इस महीने सबसे ज्यादा खर्च कहाँ हुआ?", "बजट स्थिति क्या है?"]
        )
    elif lang == "hinglish":
        return (
            "Kya aap clarify kar sakte hain aapko kaunsi financial information chahiye? Aap balance, expenses, kisi specific category ya budget ke baare me pooch sakte hain.",
            ["Mera current balance kitna hai?", "Sabse jyada kharcha kahan hua?", "Am I over budget?"]
        )
    return (
        "Could you clarify what financial information you need? You can ask about your balance, expenses, a specific category, or budgets.",
        ["What is my current balance?", "Where did I spend the most?", "Am I over budget?"]
    )


def _call_gemini_api(api_key: str, prompt: str) -> str | None:
    """Invokes Google Gemini 2.0 Flash via standard REST API with timeout."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 600,
        },
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            if response.status == 200:
                body = json.loads(response.read().decode("utf-8"))
                candidates = body.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        return str(parts[0]["text"]).strip()
    except Exception as exc:
        logger.warning("Gemini API call failed (%s). Falling back to deterministic rule engine.", exc)
        return None

    return None


def process_copilot_chat(
    db: Session,
    user_id: int,
    user_message: str,
    conversation_history: list[CopilotChatMessage] | None = None,
) -> CopilotChatResponse:
    """
    Processes chat requests using Gemini 2.0 Flash when GEMINI_API_KEY is configured,
    or smoothly falls back to the deterministic question-understanding engine.
    Strictly isolated to authenticated tenant data.
    Provides targeted, concise answers without generic boilerplate or repetitive snapshots.
    """
    ctx = get_user_financial_context(db, user_id)
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    if api_key:
        ledger_context = format_context_for_prompt(ctx)
        system_instruction = (
            "You are FINORA AI Financial Copilot, an expert, concise, and mathematically accurate personal finance assistant.\n"
            "CRITICAL RESPONSE INSTRUCTIONS:\n"
            "1. DIRECT ANSWERS ONLY: Answer strictly and directly to the user's specific question. "
            "NEVER return a full financial snapshot or multi-metric breakdown unless the user explicitly asks for a complete summary.\n"
            "   - If asked 'Where did I spend the most?', reply directly with the top category and amount (e.g. 'Your highest spending category this month is Rent, at ₹9,000.').\n"
            "   - If asked 'How much did I spend on Food?', reply directly with that category's spending (e.g. 'You spent ₹100 on Food this month.').\n"
            "   - If asked 'Mera balance kitna hai?', answer directly (e.g. 'Aapka current balance ₹40,500 hai.').\n"
            "2. NO REPETITIVE BOILERPLATE: Do not include greetings ('Hello User!'), polite preamble, or generic closing statements ('Ask me anything else!'). Keep it short, factual, and crisp.\n"
            "3. UNRELATED QUESTIONS: If asked a question unrelated to personal finance (e.g. geography, trivia, weather, jokes), politely state that you can only help with personal finances.\n"
            "4. MULTILINGUAL: Automatically detect the query language (English, Hindi, or Hinglish) and respond in the EXACT SAME LANGUAGE and tone.\n"
            "5. NO FABRICATION: Never invent numbers, balances, or transactions. Every metric must match the authentic ledger context.\n\n"
            f"{ledger_context}\n"
        )

        history_lines = []
        if conversation_history:
            for m in conversation_history[-6:]:
                role_label = "User" if m.role == "user" else "Assistant"
                history_lines.append(f"{role_label}: {m.content}")

        history_block = ("\nRecent Chat History:\n" + "\n".join(history_lines)) if history_lines else ""
        full_prompt = f"{system_instruction}{history_block}\n\nUser: {user_message}\nAssistant:"

        gemini_reply = _call_gemini_api(api_key, full_prompt)
        if gemini_reply:
            return CopilotChatResponse(
                reply=gemini_reply,
                is_generative=True,
                model_used="Gemini 2.0 Flash",
                suggested_prompts=[
                    "Where did I spend the most?",
                    "How much did I spend on Food?",
                    "Am I over budget?",
                ],
                referenced_metrics={
                    "net_balance": ctx.get("net_balance"),
                    "month_income": ctx.get("month_income"),
                    "month_expense": ctx.get("month_expense"),
                },
            )

    # Deterministic intelligent fallback engine
    rule_reply, suggested = _generate_specific_response(user_message, conversation_history, ctx)
    return CopilotChatResponse(
        reply=rule_reply,
        is_generative=False,
        model_used="FINORA Rule Engine (Deterministic Targeted Retrieval)",
        suggested_prompts=suggested,
        referenced_metrics={
            "net_balance": ctx.get("net_balance"),
            "month_income": ctx.get("month_income"),
            "month_expense": ctx.get("month_expense"),
        },
    )

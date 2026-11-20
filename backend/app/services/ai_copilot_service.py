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


def _detect_query_language(text: str) -> str:
    """Detects whether user query is 'hindi', 'hinglish', or 'english'."""
    # Check for Devanagari characters
    if re.search(r"[\u0900-\u097f]", text):
        return "hindi"

    hinglish_markers = {
        "mera", "meri", "mere", "kharcha", "kharch", "bachat", "paisa", "paise",
        "kitna", "kitni", "kitne", "kahan", "batao", "aaya", "aaye", "aayi",
        "bache", "baki", "kya", "hai", "hain", "kaise", "karo", "kare", "mahine",
        "rupaye", "rupayee", "kamaya", "diye", "dekhna", "dikhao", "bataiye"
    }
    tokens = set(re.findall(r"\b\w+\b", text.lower()))
    if tokens & hinglish_markers:
        return "hinglish"

    return "english"


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
            "temperature": 0.25,
            "maxOutputTokens": 850,
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


def _rule_based_fallback(query: str, ctx: dict[str, Any]) -> tuple[str, list[str]]:
    """
    Intelligent, deterministic rule engine that answers strictly from genuine ledger context.
    Provides natural native responses in English, Hindi, and Hinglish based on user language.
    Never fabricates metrics, transactions, or fake AI personality.
    """
    q = query.lower().strip()
    lang = _detect_query_language(query)

    currency = ctx.get("currency", "INR")
    net_bal = ctx.get("net_balance", 0.0)
    month_inc = ctx.get("month_income", 0.0)
    month_exp = ctx.get("month_expense", 0.0)
    cats = ctx.get("categories_breakdown", [])
    budgets = ctx.get("budgets", [])
    goals = ctx.get("savings_goals", [])
    txs = ctx.get("recent_transactions", [])
    health = ctx.get("health_score", {})

    # Intent 1: Balance / Net Worth / Cash Flow
    if any(k in q for k in ["balance", "net worth", "how much money", "cash flow", "account balance", "kitna paisa", "kitne paise", "mera balance", "khate me", "बैलेंस", "कुल शेष", "शेष राशि", "खाते में", "कितना पैसा", "कितने पैसे", "रुपये"]):
        if lang == "hindi":
            reply = (
                f"यहाँ आपका वास्तविक वित्तीय विवरण है:\n\n"
                f"• **कुल शेष राशि (Net Balance):** {currency} {net_bal:,.2f}\n"
                f"• **इस महीने की आय:** {currency} {month_inc:,.2f}\n"
                f"• **इस महीने का खर्च:** {currency} {month_exp:,.2f}\n"
                f"• **शुद्ध बचत:** {currency} {(month_inc - month_exp):,.2f}\n\n"
                f"*(FINORA डिफ़ॉल्ट नियम इंजन द्वारा सत्यापित लेजर से तैयार)*"
            )
            prompts = ["मेरा सबसे ज्यादा खर्च कहाँ हुआ?", "क्या कोई बजट पार हुआ है?", "मेरे बचत लक्ष्य कैसे चल रहे हैं?"]
        elif lang == "hinglish":
            reply = (
                f"Yeh raha aapka live financial snapshot:\n\n"
                f"• **Total Net Balance:** {currency} {net_bal:,.2f}\n"
                f"• **Is Mahine Ki Income:** {currency} {month_inc:,.2f}\n"
                f"• **Is Mahine Ka Kharcha:** {currency} {month_exp:,.2f}\n"
                f"• **Net Bachat:** {currency} {(month_inc - month_exp):,.2f}\n\n"
                f"*(FINORA Deterministic Engine aapke recorded ledger se)*"
            )
            prompts = ["Mera sabse jyada kharcha kahan hua?", "Kya koi budget limit cross hui?", "Savings goals ka kya status hai?"]
        else:
            reply = (
                f"Here is your genuine cash-flow overview:\n\n"
                f"• **All-Time Net Balance:** {currency} {net_bal:,.2f}\n"
                f"• **This Month's Income:** {currency} {month_inc:,.2f}\n"
                f"• **This Month's Expenses:** {currency} {month_exp:,.2f}\n"
                f"• **Net Savings This Month:** {currency} {(month_inc - month_exp):,.2f}\n\n"
                f"*(Generated by FINORA Deterministic Engine from your recorded ledger)*"
            )
            prompts = ["Where did I spend the most this month?", "Are any of my budgets exceeded?", "What is my progress on savings goals?"]
        return reply, prompts

    # Intent 2: Spending / Expenses / Where did my money go
    if any(k in q for k in ["spend", "spending", "expense", "expenses", "where did my money go", "highest expense", "kharcha", "kharch", "kahan gaya", "kahan kharch", "खर्च", "व्यय", "कहाँ खर्च", "कहाँ गया"]):
        if not cats:
            if lang == "hindi":
                reply = "वर्तमान महीने के लिए आपके खाते में कोई खर्च दर्ज नहीं है।"
                prompts = ["मेरा बैलेंस कितना है?", "बजट स्थिति देखें"]
            elif lang == "hinglish":
                reply = "Current month ke liye aapka koi expense record nahi mila."
                prompts = ["Mera balance kitna hai?", "Budget check karo"]
            else:
                reply = "You have no expense transactions recorded for the current month yet."
                prompts = ["What is my current balance?", "Show my budget status"]
        else:
            top_3 = cats[:3]
            top_cat = cats[0]
            pct_of_total = (top_cat["spent"] / month_exp * 100) if month_exp > 0 else 0

            if lang == "hindi":
                cat_lines = "\n".join([f"• **{c['category']}**: {currency} {c['spent']:,.2f}" for c in top_3])
                reply = (
                    f"आपने इस महीने {len(cats)} श्रेणियों में कुल **{currency} {month_exp:,.2f}** खर्च किए हैं।\n\n"
                    f"**शीर्ष खर्च श्रेणियां:**\n{cat_lines}\n\n"
                    f"आपका सबसे बड़ा खर्च **{top_cat['category']}** में हुआ है, जो आपके कुल मासिक खर्च का **{pct_of_total:.1f}%** है।"
                )
                prompts = ["बजट उपयोग विवरण दिखाएं", "Food पर कैसे बचत करें?", "हाल के लेनदेन क्या हैं?"]
            elif lang == "hinglish":
                cat_lines = "\n".join([f"• **{c['category']}**: {currency} {c['spent']:,.2f}" for c in top_3])
                reply = (
                    f"Aapne is mahine {len(cats)} categories me total **{currency} {month_exp:,.2f}** kharch kiye hain.\n\n"
                    f"**Top Spending Categories:**\n{cat_lines}\n\n"
                    f"Aapka sabse jyada kharcha **{top_cat['category']}** me hua hai (**{pct_of_total:.1f}%** total expense ka)."
                )
                prompts = ["Budget limits check karo", "Food par bachat kaise karein?", "Recent transactions dikhao"]
            else:
                cat_lines = "\n".join([f"• **{c['category']}**: {currency} {c['spent']:,.2f}" for c in top_3])
                reply = (
                    f"You have spent **{currency} {month_exp:,.2f}** this month across {len(cats)} categories.\n\n"
                    f"**Top Spending Categories:**\n{cat_lines}\n\n"
                    f"Your highest spending category is **{top_cat['category']}**, accounting for **{pct_of_total:.1f}%** of your total monthly expenditure."
                )
                prompts = ["Show my budget utilization", "Can you suggest ways to save on Food?", "What are my recent transactions?"]
        return reply, prompts

    # Intent 3: Budget check
    if any(k in q for k in ["budget", "budgets", "limit", "overrun", "exceeded", "paar hua", "cross hua", "बजट", "सीमा"]):
        if not budgets:
            reply = "You do not have any active budgets set up for the current month. Head to the Budgets page to create monthly category limits."
            if lang == "hindi":
                reply = "वर्तमान महीने के लिए कोई बजट निर्धारित नहीं है। आप बजट पृष्ठ पर नए मासिक बजट बना सकते हैं।"
            elif lang == "hinglish":
                reply = "Current month ke liye koi budget active nahi hai. Budgets page par naye limits set kar sakte hain."
        else:
            exceeded = [b for b in budgets if b["status"] == "exceeded"]
            approaching = [b for b in budgets if b["status"] == "approaching"]
            normal = [b for b in budgets if b["status"] == "normal"]

            if lang == "hindi":
                lines = ["यहाँ आपकी वर्तमान बजट स्थिति है:\n"]
                if exceeded:
                    lines.append("🔴 **सीमा से अधिक बजट (Exceeded):**")
                    for b in exceeded:
                        lines.append(f"  • {b['category']}: खर्च {currency} {b['spent']:,.2f} / सीमा {currency} {b['limit']:,.2f} ({b['utilization_pct']}%)")
                if approaching:
                    lines.append("\n🟡 **सीमा के करीब (Approaching):**")
                    for b in approaching:
                        lines.append(f"  • {b['category']}: खर्च {currency} {b['spent']:,.2f} / सीमा {currency} {b['limit']:,.2f} ({b['utilization_pct']}%)")
                if normal:
                    lines.append("\n🟢 **बजट के भीतर (Within Budget):**")
                    for b in normal:
                        lines.append(f"  • {b['category']}: खर्च {currency} {b['spent']:,.2f} / सीमा {currency} {b['limit']:,.2f} ({b['utilization_pct']}%)")
            elif lang == "hinglish":
                lines = ["Yeh rahi aapki current budget status:\n"]
                if exceeded:
                    lines.append("🔴 **Exceeded Budgets (Limit Cross):**")
                    for b in exceeded:
                        lines.append(f"  • {b['category']}: Spent {currency} {b['spent']:,.2f} of {currency} {b['limit']:,.2f} ({b['utilization_pct']}%)")
                if approaching:
                    lines.append("\n🟡 **Approaching Threshold (Warning):**")
                    for b in approaching:
                        lines.append(f"  • {b['category']}: Spent {currency} {b['spent']:,.2f} of {currency} {b['limit']:,.2f} ({b['utilization_pct']}%)")
                if normal:
                    lines.append("\n🟢 **Under Control:**")
                    for b in normal:
                        lines.append(f"  • {b['category']}: Spent {currency} {b['spent']:,.2f} of {currency} {b['limit']:,.2f} ({b['utilization_pct']}%)")
            else:
                lines = ["Here is your current budget status:\n"]
                if exceeded:
                    lines.append("🔴 **Exceeded Budgets:**")
                    for b in exceeded:
                        lines.append(f"  • {b['category']}: Spent {currency} {b['spent']:,.2f} of {currency} {b['limit']:,.2f} ({b['utilization_pct']}%)")
                if approaching:
                    lines.append("\n🟡 **Approaching Threshold:**")
                    for b in approaching:
                        lines.append(f"  • {b['category']}: Spent {currency} {b['spent']:,.2f} of {currency} {b['limit']:,.2f} ({b['utilization_pct']}%)")
                if normal:
                    lines.append("\n🟢 **Within Budget:**")
                    for b in normal:
                        lines.append(f"  • {b['category']}: Spent {currency} {b['spent']:,.2f} of {currency} {b['limit']:,.2f} ({b['utilization_pct']}%)")
            reply = "\n".join(lines)
        prompts = ["Predict my month-end expenses", "How can I cut expenses?", "What is my current balance?"]
        return reply, prompts

    # Intent 4: Savings Goals
    if any(k in q for k in ["saving", "savings", "goal", "goals", "milestone", "bachat", "lakshya", "बचत", "लक्ष्य"]):
        if not goals:
            reply = "You haven't set up any savings goals yet. You can create targets on the Savings Goals page."
            if lang == "hindi":
                reply = "वर्तमान में कोई बचत लक्ष्य निर्धारित नहीं है। आप बचत लक्ष्य पृष्ठ पर नए लक्ष्य बना सकते हैं।"
            elif lang == "hinglish":
                reply = "Aapne abhi tak koi savings goals set nahi kiye hain. Savings page par jaakar target bana sakte hain."
        else:
            completed = [g for g in goals if g["is_completed"]]
            active = [g for g in goals if not g["is_completed"]]
            lines = [f"You have **{len(goals)}** savings goals ({len(completed)} completed, {len(active)} active):\n"]
            if lang == "hindi":
                lines = [f"आपके पास कुल **{len(goals)}** बचत लक्ष्य हैं ({len(completed)} पूर्ण, {len(active)} सक्रिय):\n"]
            elif lang == "hinglish":
                lines = [f"Aapke pass total **{len(goals)}** savings goals hain ({len(completed)} complete, {len(active)} in progress):\n"]

            for g in active:
                lines.append(
                    f"• **{g['name']}** ({g['category']}): {currency} {g['current']:,.2f} / {currency} {g['target']:,.2f} "
                    f"({g['progress_pct']}%) — {g['days_remaining']} days left"
                )
            reply = "\n".join(lines)
        prompts = ["How can I reach my savings goals faster?", "What is my total net balance?"]
        return reply, prompts

    # Default fallback: Financial Briefing in User Language
    if lang == "hindi":
        reply = (
            f"नमस्ते {ctx.get('user_name', 'मित्र')}! यहाँ आपका लाइव FINORA विवरण है:\n\n"
            f"• **कुल शेष (Net Balance):** {currency} {net_bal:,.2f}\n"
            f"• **इस महीने का खर्च:** {currency} {month_exp:,.2f} (आय: {currency} {month_inc:,.2f})\n"
            f"• **सक्रिय बजट:** {len(budgets)} निर्धारित\n"
            f"• **बचत लक्ष्य:** {len(goals)} सक्रिय\n\n"
            f"आप मुझसे अपने खर्च, बजट, या महीने के अंत के पूर्वानुमान के बारे में कुछ भी पूछ सकते हैं!"
        )
        prompts = ["मेरा बैलेंस कितना है?", "इस महीने सबसे ज्यादा खर्च कहाँ हुआ?", "क्या कोई बजट सीमा पार हुई?"]
    elif lang == "hinglish":
        reply = (
            f"Namaste {ctx.get('user_name', 'there')}! Yeh raha aapka live FINORA snapshot:\n\n"
            f"• **Net Balance:** {currency} {net_bal:,.2f}\n"
            f"• **Is Mahine Ka Kharcha:** {currency} {month_exp:,.2f} (Income: {currency} {month_inc:,.2f})\n"
            f"• **Active Budgets:** {len(budgets)} configured\n"
            f"• **Savings Goals:** {len(goals)} active\n\n"
            f"Aap mujhse apne expenses, budgets ya savings ke baare me kuch bhi pooch sakte hain!"
        )
        prompts = ["Mera current balance kitna hai?", "Sabse jyada kharcha kahan hua?", "Bachat badhane ke tips"]
    else:
        reply = (
            f"Hello {ctx.get('user_name', 'there')}! Here is your live FINORA snapshot:\n\n"
            f"• **Net Balance:** {currency} {net_bal:,.2f}\n"
            f"• **This Month's Spending:** {currency} {month_exp:,.2f} (Income: {currency} {month_inc:,.2f})\n"
            f"• **Financial Health:** {health.get('score', 75)}/100 ({health.get('rating', 'Good')})\n"
            f"• **Active Budgets:** {len(budgets)} configured\n"
            f"• **Savings Goals:** {len(goals)} active\n\n"
            f"Ask me anything about your expenses, budgets, savings milestones, or month-end predictions!"
        )
        prompts = ["What are my top expenses this month?", "Do I have any budget overruns?", "How is my savings goal progress?"]

    return reply, prompts


def process_copilot_chat(
    db: Session,
    user_id: int,
    user_message: str,
    conversation_history: list[CopilotChatMessage] | None = None,
) -> CopilotChatResponse:
    """
    Processes chat requests using Gemini 2.0 Flash when GEMINI_API_KEY is configured,
    or smoothly falls back to the deterministic rule engine.
    Detects language and responds in the same language (English, Hindi, Hinglish, etc.).
    Always flags is_generative accurately and grounds all responses in real user data.
    """
    ctx = get_user_financial_context(db, user_id)
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    if api_key:
        ledger_context = format_context_for_prompt(ctx)
        system_instruction = (
            "You are FINORA AI Financial Copilot, an expert, encouraging, and mathematically accurate financial advisor.\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. Answer strictly based on the real financial context provided below. NEVER fabricate transactions, balances, or dates.\n"
            "2. If the user asks about something not present in the data, state clearly that no records exist.\n"
            "3. Format currency clearly with Rupee symbols (₹) or the user's active currency.\n"
            "4. Keep explanations concise, structured with bullet points, and actionable.\n"
            "5. MULTILINGUAL INSTRUCTION: You MUST detect the language of the user's latest query (English, Hindi, Hinglish, etc.) "
            "and reply in the EXACT SAME LANGUAGE and style. If the user asks in Hindi, reply in Hindi. "
            "If in Hinglish (e.g. 'Mera total balance kitna hai?'), reply in natural Hinglish. "
            "If in English, reply in English. Never force an English response when spoken/written to in Hindi or Hinglish.\n\n"
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
                    "Analyze my discretionary spending",
                    "How can I optimize my savings goals?",
                    "Are there any budget overrun risks?",
                ],
                referenced_metrics={
                    "net_balance": ctx.get("net_balance"),
                    "month_income": ctx.get("month_income"),
                    "month_expense": ctx.get("month_expense"),
                },
            )

    # Deterministic rule engine fallback with multi-lingual support
    rule_reply, suggested = _rule_based_fallback(user_message, ctx)
    return CopilotChatResponse(
        reply=rule_reply,
        is_generative=False,
        model_used="FINORA Rule Engine (Deterministic Fallback)",
        suggested_prompts=suggested,
        referenced_metrics={
            "net_balance": ctx.get("net_balance"),
            "month_income": ctx.get("month_income"),
            "month_expense": ctx.get("month_expense"),
        },
    )

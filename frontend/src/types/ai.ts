import type { TransactionCategory, PaymentMethod, TransactionType } from './index';

export interface CopilotChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CopilotChatResponse {
  reply: string;
  is_generative: boolean;
  model_used: string;
  suggested_prompts: string[];
  referenced_metrics?: Record<string, unknown>;
}

export interface ExpensePredictionCategory {
  category: string;
  current_month_spent: number;
  historical_monthly_avg: number;
  predicted_month_end: number;
  budget_limit: number | null;
  is_overrun_projected: boolean;
  overrun_amount: number | null;
}

export interface ExpensePredictionResponse {
  current_month: string;
  days_elapsed: number;
  days_in_month: number;
  current_spent: number;
  predicted_total_spend: number;
  daily_burn_rate: number;
  has_sufficient_history: boolean;
  methodology_note: string;
  categories: ExpensePredictionCategory[];
  budget_overrun_warnings: string[];
}

export interface SavingsCoachRecommendation {
  id: string;
  title: string;
  category: string;
  current_monthly_spend: number;
  target_reduction_pct: number;
  monthly_potential_savings: number;
  impact_summary: string;
  associated_goal_id: number | null;
  associated_goal_name: string | null;
  days_accelerated: number;
  suggested_deposit_amount: number;
}

export interface SavingsCoachPlan {
  monthly_discretionary_spend: number;
  total_potential_monthly_savings: number;
  active_goals_count: number;
  recommendations: SavingsCoachRecommendation[];
  disclaimer: string;
}

export interface VoiceParsedTransaction {
  title: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  payment_method: PaymentMethod;
  date: string;
  description: string;
}

export interface VoiceParseResponse {
  intent: 'add_transaction' | 'query_balance' | 'query_spending' | 'query_budget' | 'query_savings' | 'general';
  confidence: number;
  parsed_transaction: VoiceParsedTransaction | null;
  requires_confirmation: boolean;
  spoken_feedback: string;
  direct_reply: string | null;
}

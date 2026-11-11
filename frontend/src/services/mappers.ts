import { formatDistanceToNow, isValid, parseISO } from 'date-fns';
import type {
  AppNotification,
  Budget,
  BudgetInput,
  BudgetStatus,
  BudgetUtilization,
  CurrencyCode,
  DateFormatOption,
  ExpenseCategory,
  FinancialHealthScore,
  GoalPriority,
  MonthlyComparison,
  MonthlyTrendPoint,
  PaymentMethod,
  SavingsContribution,
  SavingsGoal,
  SavingsGoalCategory,
  SavingsGoalInput,
  SavingsProgress,
  SpendingInsight,
  ThemeMode,
  Transaction,
  TransactionCategory,
  TransactionInput,
  TransactionStatus,
  TransactionType,
  UserSettings,
  WeeklySpendingPoint,
} from '../types';
import type { LocalUiPreferences } from './storageService';

export interface ApiUserOut {
  id: number;
  name: string;
  email: string;
  role: string;
  monthly_income_target: number;
  currency: CurrencyCode;
  date_format: DateFormatOption;
  theme: ThemeMode;
  compact_numbers: boolean;
  show_health_score_breakdown: boolean;
  budget_alerts_enabled: boolean;
  goal_milestones_enabled: boolean;
  is_demo: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ApiTokenResponse {
  access_token: string;
  token_type: string;
  user: ApiUserOut;
}

export interface ApiTransactionOut {
  id: number;
  user_id: number;
  title: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  date: string;
  payment_method: PaymentMethod;
  description: string;
  notes: string | null;
  status: TransactionStatus;
  created_at: string;
  updated_at: string;
}

export interface ApiTransactionListResponse {
  items: ApiTransactionOut[];
  total_count: number;
  page: number;
  page_size: number;
  total_income: number;
  total_expenses: number;
  net_balance: number;
}

export interface ApiBudgetOut {
  id: number;
  user_id: number;
  category: ExpenseCategory;
  limit: number;
  month: string;
  alert_threshold: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiBudgetUtilizationOut {
  budget: ApiBudgetOut;
  spent: number;
  remaining: number;
  utilization_percentage: number;
  status: BudgetStatus;
  transaction_count: number;
}

export interface ApiBudgetSummaryResponse {
  month: string;
  items: ApiBudgetUtilizationOut[];
  total_limit: number;
  total_spent: number;
  total_remaining: number;
  overall_percentage: number;
  on_track_count: number;
  approaching_count: number;
  exceeded_count: number;
}

export interface ApiContributionOut {
  id: number;
  goal_id: number;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
}

export interface ApiSavingsGoalOut {
  id: number;
  user_id: number;
  name: string;
  category: SavingsGoalCategory;
  target_amount: number;
  current_amount: number;
  remaining_amount: number;
  progress_percentage: number;
  is_completed: boolean;
  days_remaining: number;
  target_date: string;
  priority: GoalPriority;
  contributions: ApiContributionOut[];
  created_at: string;
  updated_at: string;
}

export interface ApiSavingsSummaryResponse {
  items: ApiSavingsGoalOut[];
  total_saved: number;
  total_target: number;
  total_remaining: number;
  overall_percentage: number;
  completed_count: number;
  active_count: number;
}

export interface ApiCategoryExpenseOut {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface ApiMonthlyTrendOut {
  month_key: string;
  label: string;
  income: number;
  expenses: number;
  savings: number;
  savings_rate: number;
}

export interface ApiWeeklySpendingOut {
  week_label: string;
  amount: number;
  transaction_count: number;
}

export interface ApiMonthlyComparisonOut {
  current_month_key: string;
  previous_month_key: string;
  current_income: number;
  previous_income: number;
  income_change_pct: number;
  current_expenses: number;
  previous_expenses: number;
  expense_change_pct: number;
  current_savings: number;
  previous_savings: number;
  savings_change_pct: number;
  current_savings_rate: number;
  previous_savings_rate: number;
}

export interface ApiAnalyticsOverviewOut {
  total_balance: number;
  total_income_all_time: number;
  total_expenses_all_time: number;
  monthly_income: number;
  monthly_expenses: number;
  monthly_savings: number;
  monthly_savings_rate: number;
  comparison: ApiMonthlyComparisonOut;
  top_expense_category: ApiCategoryExpenseOut | null;
  average_monthly_expenses: number;
  average_monthly_income: number;
}

export interface ApiHealthScoreOut {
  total_score: number;
  grade: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
  summary: string;
  disclaimer: string;
  factors: Array<{
    id: string;
    label: string;
    score: number;
    max_score: number;
    metric_display: string;
    explanation: string;
    status: 'strong' | 'moderate' | 'needs-attention';
  }>;
}

export interface ApiInsightOut {
  id: string;
  title: string;
  description: string;
  tone: 'positive' | 'warning' | 'info' | 'danger';
  metric: string | null;
  action_route: string | null;
  action_label: string | null;
}

export interface ApiNotificationOut {
  id: number;
  user_id: number;
  title: string;
  message: string;
  tone: 'positive' | 'warning' | 'info' | 'danger';
  route: string;
  is_read: boolean;
  created_at: string;
}

export interface ApiNotificationListResponse {
  items: ApiNotificationOut[];
  unread_count: number;
}

export function mapApiUserToSettings(
  user: ApiUserOut,
  localUi: LocalUiPreferences,
): UserSettings {
  return {
    profile: {
      name: user.name,
      email: user.email,
      role: user.role,
      monthlyIncomeTarget: user.monthly_income_target,
      isDemoSession: user.is_demo,
    },
    preferences: {
      currency: user.currency,
      dateFormat: user.date_format,
      compactNumbers: user.compact_numbers,
      showHealthScoreBreakdown: user.show_health_score_breakdown,
      defaultPeriod: localUi.defaultPeriod,
    },
    appearance: {
      theme: user.theme,
      sidebarCollapsed: localUi.sidebarCollapsed,
    },
    notifications: {
      budgetAlerts: user.budget_alerts_enabled,
      goalMilestones: user.goal_milestones_enabled,
      largeExpenseAlerts: true,
    },
  };
}

export function mapApiTransaction(tx: ApiTransactionOut): Transaction {
  return {
    id: String(tx.id),
    title: tx.title,
    amount: tx.amount,
    type: tx.type,
    category: tx.category,
    date: tx.date,
    paymentMethod: tx.payment_method,
    description: tx.description,
    notes: tx.notes ?? undefined,
    status: tx.status,
    createdAt: tx.created_at,
    updatedAt: tx.updated_at,
  };
}

export function mapTransactionInputToApi(input: TransactionInput) {
  return {
    title: input.title.trim(),
    amount: Number(input.amount),
    type: input.type,
    category: input.category,
    date: input.date,
    payment_method: input.paymentMethod,
    description: input.description.trim() || input.title.trim(),
    notes: input.notes?.trim() || null,
    status: input.status,
  };
}

export function mapApiBudget(budget: ApiBudgetOut): Budget {
  return {
    id: String(budget.id),
    category: budget.category,
    limit: budget.limit,
    month: budget.month,
    alertThreshold: budget.alert_threshold,
    notes: budget.notes ?? undefined,
    createdAt: budget.created_at,
    updatedAt: budget.updated_at,
  };
}

export function mapApiBudgetUtilization(
  item: ApiBudgetUtilizationOut,
): BudgetUtilization {
  return {
    budget: mapApiBudget(item.budget),
    spent: item.spent,
    remaining: item.remaining,
    utilizationPercentage: item.utilization_percentage,
    status: item.status,
    transactionCount: item.transaction_count,
  };
}

export function mapBudgetInputToApi(input: BudgetInput) {
  return {
    category: input.category,
    limit: Number(input.limit),
    month: input.month,
    alert_threshold: Math.round(input.alertThreshold),
    notes: input.notes?.trim() || null,
  };
}

export function mapApiContribution(c: ApiContributionOut): SavingsContribution {
  return {
    id: String(c.id),
    amount: c.amount,
    date: c.date,
    note: c.note ?? undefined,
  };
}

export function mapApiSavingsGoal(goal: ApiSavingsGoalOut): {
  goal: SavingsGoal;
  progress: SavingsProgress;
} {
  return {
    goal: {
      id: String(goal.id),
      name: goal.name,
      category: goal.category,
      targetAmount: goal.target_amount,
      currentAmount: goal.current_amount,
      targetDate: goal.target_date,
      priority: goal.priority,
      contributions: goal.contributions.map(mapApiContribution),
      createdAt: goal.created_at,
      updatedAt: goal.updated_at,
    },
    progress: {
      currentAmount: goal.current_amount,
      targetAmount: goal.target_amount,
      remainingAmount: goal.remaining_amount,
      percentage: goal.progress_percentage,
      isCompleted: goal.is_completed,
      daysRemaining: goal.days_remaining,
    },
  };
}

export function mapSavingsGoalInputToApi(input: SavingsGoalInput) {
  return {
    name: input.name.trim(),
    category: input.category,
    target_amount: Number(input.targetAmount),
    current_amount: Number(input.currentAmount || 0),
    target_date: input.targetDate,
    priority: input.priority,
  };
}

export function mapApiMonthlyTrend(t: ApiMonthlyTrendOut): MonthlyTrendPoint {
  return {
    monthKey: t.month_key,
    label: t.label,
    income: t.income,
    expenses: t.expenses,
    savings: t.savings,
    savingsRate: t.savings_rate,
  };
}

export function mapApiWeeklySpending(w: ApiWeeklySpendingOut): WeeklySpendingPoint {
  return {
    weekLabel: w.week_label,
    amount: w.amount,
    transactionCount: w.transaction_count,
  };
}

export function mapApiMonthlyComparison(
  c: ApiMonthlyComparisonOut,
): MonthlyComparison {
  return {
    currentMonthKey: c.current_month_key,
    previousMonthKey: c.previous_month_key,
    currentIncome: c.current_income,
    previousIncome: c.previous_income,
    incomeChangePct: c.income_change_pct,
    currentExpenses: c.current_expenses,
    previousExpenses: c.previous_expenses,
    expenseChangePct: c.expense_change_pct,
    currentSavings: c.current_savings,
    previousSavings: c.previous_savings,
    savingsChangePct: c.savings_change_pct,
    currentSavingsRate: c.current_savings_rate,
    previousSavingsRate: c.previous_savings_rate,
  };
}

export function mapApiHealthScore(h: ApiHealthScoreOut): FinancialHealthScore {
  return {
    totalScore: h.total_score,
    grade: h.grade,
    summary: h.summary,
    disclaimer: h.disclaimer,
    factors: h.factors.map((f) => ({
      id: f.id,
      label: f.label,
      score: f.score,
      maxScore: f.max_score,
      metricDisplay: f.metric_display,
      explanation: f.explanation,
      status: f.status,
    })),
  };
}

export function mapApiInsight(i: ApiInsightOut): SpendingInsight {
  return {
    id: i.id,
    title: i.title,
    description: i.description,
    tone: i.tone,
    metric: i.metric ?? undefined,
    actionRoute: i.action_route ?? undefined,
    actionLabel: i.action_label ?? undefined,
  };
}

export function mapApiNotification(n: ApiNotificationOut): AppNotification {
  let timestamp = 'Recent';
  const parsed = parseISO(n.created_at);
  if (isValid(parsed)) {
    timestamp = formatDistanceToNow(parsed, { addSuffix: true });
  }
  return {
    id: String(n.id),
    title: n.title,
    message: n.message,
    tone: n.tone,
    timestamp,
    route: n.route,
    read: n.is_read,
  };
}

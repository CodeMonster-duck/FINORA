export type TransactionType = 'income' | 'expense';

export type IncomeCategory =
  | 'Salary'
  | 'Freelancing'
  | 'Business'
  | 'Investment income'
  | 'Other income';

export type ExpenseCategory =
  | 'Food'
  | 'Groceries'
  | 'Transport'
  | 'Shopping'
  | 'Education'
  | 'Healthcare'
  | 'Entertainment'
  | 'Rent'
  | 'Bills'
  | 'Subscriptions'
  | 'Other';

export type TransactionCategory = IncomeCategory | ExpenseCategory;

export type PaymentMethod =
  | 'UPI'
  | 'Bank Transfer'
  | 'Debit Card'
  | 'Credit Card'
  | 'Cash'
  | 'Net Banking'
  | 'Wallet';

export type TransactionStatus = 'completed' | 'pending';

export interface Transaction {
  id: string;
  title: string;
  amount: number; // Stored in rupees with 2-decimal precision; math uses integer paise
  type: TransactionType;
  category: TransactionCategory;
  date: string; // ISO YYYY-MM-DD
  paymentMethod: PaymentMethod;
  description: string;
  notes?: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionInput {
  title: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  date: string;
  paymentMethod: PaymentMethod;
  description: string;
  notes?: string;
  status: TransactionStatus;
}

export interface Budget {
  id: string;
  category: ExpenseCategory;
  limit: number;
  month: string; // YYYY-MM or 'monthly'
  alertThreshold: number; // 10 - 100 percentage
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetInput {
  category: ExpenseCategory;
  limit: number;
  month: string;
  alertThreshold: number;
  notes?: string;
}

export type BudgetStatus = 'normal' | 'approaching' | 'exceeded';

export interface BudgetUtilization {
  budget: Budget;
  spent: number;
  remaining: number;
  utilizationPercentage: number;
  status: BudgetStatus;
  transactionCount: number;
}

export type SavingsGoalCategory =
  | 'Tech'
  | 'Emergency'
  | 'Travel'
  | 'Education'
  | 'Lifestyle'
  | 'Investment'
  | 'Other';

export type GoalPriority = 'high' | 'medium' | 'low';

export interface SavingsContribution {
  id: string;
  amount: number;
  date: string;
  note?: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  category: SavingsGoalCategory;
  targetAmount: number;
  currentAmount: number;
  targetDate: string; // YYYY-MM-DD
  priority: GoalPriority;
  contributions: SavingsContribution[];
  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoalInput {
  name: string;
  category: SavingsGoalCategory;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  priority: GoalPriority;
}

export interface SavingsProgress {
  currentAmount: number;
  targetAmount: number;
  remainingAmount: number;
  percentage: number;
  isCompleted: boolean;
  daysRemaining: number;
}

export type CurrencyCode = 'INR' | 'USD' | 'EUR';
export type DateFormatOption = 'DD/MM/YYYY' | 'DD MMM YYYY' | 'YYYY-MM-DD';
export type ThemeMode = 'dark' | 'light';
export type AnalyticsPeriod = '3M' | '6M' | '12M' | 'ALL';

export interface UserSettings {
  profile: {
    name: string;
    email: string;
    role: string;
    monthlyIncomeTarget: number;
    isDemoSession: boolean;
  };
  preferences: {
    currency: CurrencyCode;
    dateFormat: DateFormatOption;
    compactNumbers: boolean;
    showHealthScoreBreakdown: boolean;
    defaultPeriod: AnalyticsPeriod;
  };
  appearance: {
    theme: ThemeMode;
    sidebarCollapsed: boolean;
  };
  notifications: {
    budgetAlerts: boolean;
    goalMilestones: boolean;
    largeExpenseAlerts: boolean;
  };
}

export interface CategoryExpenseSummary {
  category: ExpenseCategory;
  amount: number;
  percentage: number;
  count: number;
  color: string;
}

export interface MonthlyTrendPoint {
  monthKey: string; // YYYY-MM
  label: string; // e.g. "Nov 26"
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
}

export interface WeeklySpendingPoint {
  weekLabel: string;
  amount: number;
  transactionCount: number;
}

export interface MonthlyComparison {
  currentMonthKey: string;
  previousMonthKey: string;
  currentIncome: number;
  previousIncome: number;
  incomeChangePct: number;
  currentExpenses: number;
  previousExpenses: number;
  expenseChangePct: number;
  currentSavings: number;
  previousSavings: number;
  savingsChangePct: number;
  currentSavingsRate: number;
  previousSavingsRate: number;
}

export interface HealthScoreFactor {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  metricDisplay: string;
  explanation: string;
  status: 'strong' | 'moderate' | 'needs-attention';
}

export interface FinancialHealthScore {
  totalScore: number;
  grade: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
  summary: string;
  disclaimer: string;
  factors: HealthScoreFactor[];
}

export type InsightTone = 'positive' | 'warning' | 'info' | 'danger';

export interface SpendingInsight {
  id: string;
  title: string;
  description: string;
  tone: InsightTone;
  metric?: string;
  actionRoute?: string;
  actionLabel?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  tone: InsightTone;
  timestamp: string;
  route: string;
  read: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export const INCOME_CATEGORIES: readonly IncomeCategory[] = [
  'Salary',
  'Freelancing',
  'Business',
  'Investment income',
  'Other income',
] as const;

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'Food',
  'Groceries',
  'Transport',
  'Shopping',
  'Education',
  'Healthcare',
  'Entertainment',
  'Rent',
  'Bills',
  'Subscriptions',
  'Other',
] as const;

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'UPI',
  'Bank Transfer',
  'Debit Card',
  'Credit Card',
  'Net Banking',
  'Wallet',
  'Cash',
] as const;

export const SAVINGS_GOAL_CATEGORIES: readonly SavingsGoalCategory[] = [
  'Emergency',
  'Tech',
  'Education',
  'Travel',
  'Lifestyle',
  'Investment',
  'Other',
] as const;

export * from './ai';

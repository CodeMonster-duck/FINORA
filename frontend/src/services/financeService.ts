import { format } from 'date-fns';
import type {
  AppNotification,
  Budget,
  BudgetInput,
  BudgetUtilization,
  CategoryExpenseSummary,
  FinancialHealthScore,
  MonthlyComparison,
  MonthlyTrendPoint,
  SavingsGoal,
  SavingsGoalInput,
  SavingsProgress,
  SpendingInsight,
  Transaction,
  TransactionInput,
  UserSettings,
  WeeklySpendingPoint,
} from '../types';
import { getMonthKey } from '../utils/calculations';
import { getCategoryColor } from '../utils/formatters';
import { apiClient } from './api';
import { authService } from './authService';
import type {
  ApiAnalyticsOverviewOut,
  ApiBudgetOut,
  ApiBudgetSummaryResponse,
  ApiCategoryExpenseOut,
  ApiHealthScoreOut,
  ApiInsightOut,
  ApiMonthlyTrendOut,
  ApiNotificationListResponse,
  ApiNotificationOut,
  ApiSavingsGoalOut,
  ApiSavingsSummaryResponse,
  ApiTransactionListResponse,
  ApiTransactionOut,
  ApiWeeklySpendingOut,
} from './mappers';
import {
  mapApiBudget,
  mapApiBudgetUtilization,
  mapApiHealthScore,
  mapApiInsight,
  mapApiMonthlyComparison,
  mapApiMonthlyTrend,
  mapApiNotification,
  mapApiSavingsGoal,
  mapApiTransaction,
  mapApiUserToSettings,
  mapApiWeeklySpending,
  mapBudgetInputToApi,
  mapSavingsGoalInputToApi,
  mapTransactionInputToApi,
} from './mappers';
import { getLocalUiPreferences, saveLocalUiPreferences } from './storageService';

export interface BackendBudgetSnapshot {
  month: string;
  utilizations: BudgetUtilization[];
  totalLimit: number;
  totalSpent: number;
  totalRemaining: number;
  overallPercentage: number;
  onTrackCount: number;
  approachingCount: number;
  exceededCount: number;
}

export interface BackendSavingsSnapshot {
  items: Array<{ goal: SavingsGoal; progress: SavingsProgress }>;
  totalSaved: number;
  totalTarget: number;
  totalRemaining: number;
  overallPercentage: number;
  completedCount: number;
  activeCount: number;
}

export interface BackendAnalyticsSnapshot {
  overview: {
    totalBalance: number;
    totalIncomeAllTime: number;
    totalExpensesAllTime: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlySavings: number;
    monthlySavingsRate: number;
    comparison: MonthlyComparison;
    averageMonthlyExpenses: number;
    averageMonthlyIncome: number;
  };
  trends: MonthlyTrendPoint[];
  categories: CategoryExpenseSummary[];
  weekly: WeeklySpendingPoint[];
  healthScore: FinancialHealthScore;
  insights: SpendingInsight[];
}

export interface WorkspaceSnapshot {
  settings: UserSettings;
  transactions: Transaction[];
  budgetSnapshot: BackendBudgetSnapshot;
  savingsSnapshot: BackendSavingsSnapshot;
  analytics: BackendAnalyticsSnapshot;
  notifications: AppNotification[];
  unreadNotificationCount: number;
}

async function fetchAllTransactionsFromApi(): Promise<Transaction[]> {
  const pageSize = 200;
  const first = await apiClient.get<ApiTransactionListResponse>('/transactions', {
    params: { page: 1, page_size: pageSize, sort_by: 'date-desc' },
  });

  const collected = [...first.data.items.map(mapApiTransaction)];
  const totalCount = first.data.total_count;
  const totalPages = Math.ceil(totalCount / pageSize);

  for (let p = 2; p <= totalPages; p += 1) {
    const next = await apiClient.get<ApiTransactionListResponse>('/transactions', {
      params: { page: p, page_size: pageSize, sort_by: 'date-desc' },
    });
    collected.push(...next.data.items.map(mapApiTransaction));
  }

  return collected;
}

async function fetchBudgetsSnapshotFromApi(
  monthKey: string,
): Promise<BackendBudgetSnapshot> {
  const { data } = await apiClient.get<ApiBudgetSummaryResponse>('/budgets', {
    params: { month: monthKey },
  });

  return {
    month: data.month,
    utilizations: data.items.map(mapApiBudgetUtilization),
    totalLimit: data.total_limit,
    totalSpent: data.total_spent,
    totalRemaining: data.total_remaining,
    overallPercentage: data.overall_percentage,
    onTrackCount: data.on_track_count,
    approachingCount: data.approaching_count,
    exceededCount: data.exceeded_count,
  };
}

async function fetchSavingsSnapshotFromApi(): Promise<BackendSavingsSnapshot> {
  const { data } = await apiClient.get<ApiSavingsSummaryResponse>('/savings');
  return {
    items: data.items.map(mapApiSavingsGoal),
    totalSaved: data.total_saved,
    totalTarget: data.total_target,
    totalRemaining: data.total_remaining,
    overallPercentage: data.overall_percentage,
    completedCount: data.completed_count,
    activeCount: data.active_count,
  };
}

async function fetchAnalyticsSnapshotFromApi(
  months = 12,
  monthKey?: string,
): Promise<BackendAnalyticsSnapshot> {
  const targetMonth = monthKey ?? getMonthKey();
  const [ovRes, trRes, catRes, wkRes, hsRes, inRes] = await Promise.all([
    apiClient.get<ApiAnalyticsOverviewOut>('/analytics/overview', {
      params: { months },
    }),
    apiClient.get<ApiMonthlyTrendOut[]>('/analytics/trends', {
      params: { months },
    }),
    apiClient.get<ApiCategoryExpenseOut[]>('/analytics/categories', {
      params: { month: targetMonth },
    }),
    apiClient.get<ApiWeeklySpendingOut[]>('/analytics/weekly', {
      params: { weeks: 8 },
    }),
    apiClient.get<ApiHealthScoreOut>('/analytics/health-score'),
    apiClient.get<ApiInsightOut[]>('/analytics/insights'),
  ]);

  const ov = ovRes.data;
  return {
    overview: {
      totalBalance: ov.total_balance,
      totalIncomeAllTime: ov.total_income_all_time,
      totalExpensesAllTime: ov.total_expenses_all_time,
      monthlyIncome: ov.monthly_income,
      monthlyExpenses: ov.monthly_expenses,
      monthlySavings: ov.monthly_savings,
      monthlySavingsRate: ov.monthly_savings_rate,
      comparison: mapApiMonthlyComparison(ov.comparison),
      averageMonthlyExpenses: ov.average_monthly_expenses,
      averageMonthlyIncome: ov.average_monthly_income,
    },
    trends: trRes.data.map(mapApiMonthlyTrend),
    categories: catRes.data.map((c) => ({
      category: c.category as CategoryExpenseSummary['category'],
      amount: c.amount,
      percentage: c.percentage,
      count: c.count,
      color: getCategoryColor(c.category as CategoryExpenseSummary['category']),
    })),
    weekly: wkRes.data.map(mapApiWeeklySpending),
    healthScore: mapApiHealthScore(hsRes.data),
    insights: inRes.data.map(mapApiInsight),
  };
}

async function fetchNotificationsFromApi(): Promise<{
  notifications: AppNotification[];
  unreadCount: number;
}> {
  const { data } =
    await apiClient.get<ApiNotificationListResponse>('/notifications');
  return {
    notifications: data.items.map(mapApiNotification),
    unreadCount: data.unread_count,
  };
}

export const financeService = {
  async loadWorkspace(budgetMonth?: string): Promise<WorkspaceSnapshot> {
    const activeMonth = budgetMonth ?? getMonthKey();
    const localUi = getLocalUiPreferences();

    const [
      user,
      transactions,
      budgetSnapshot,
      savingsSnapshot,
      analytics,
      notifData,
    ] = await Promise.all([
      authService.getMe(),
      fetchAllTransactionsFromApi(),
      fetchBudgetsSnapshotFromApi(activeMonth),
      fetchSavingsSnapshotFromApi(),
      fetchAnalyticsSnapshotFromApi(12, activeMonth),
      fetchNotificationsFromApi(),
    ]);

    return {
      settings: mapApiUserToSettings(user, localUi),
      transactions,
      budgetSnapshot,
      savingsSnapshot,
      analytics,
      notifications: notifData.notifications,
      unreadNotificationCount: notifData.unreadCount,
    };
  },

  // ---------------- Transactions ----------------
  async createTransaction(input: TransactionInput): Promise<Transaction> {
    const { data } = await apiClient.post<ApiTransactionOut>(
      '/transactions',
      mapTransactionInputToApi(input),
    );
    return mapApiTransaction(data);
  },

  async updateTransaction(
    id: string,
    input: TransactionInput,
  ): Promise<Transaction> {
    const { data } = await apiClient.put<ApiTransactionOut>(
      `/transactions/${id}`,
      mapTransactionInputToApi(input),
    );
    return mapApiTransaction(data);
  },

  async deleteTransaction(id: string): Promise<void> {
    await apiClient.delete(`/transactions/${id}`);
  },

  async downloadTransactionsCsv(params?: {
    type?: 'income' | 'expense';
    category?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<void> {
    const response = await apiClient.get<Blob>('/transactions/export/csv', {
      params: {
        type: params?.type,
        category: params?.category,
        start_date: params?.startDate,
        end_date: params?.endDate,
      },
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `finora-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // ---------------- Budgets ----------------
  async fetchBudgetsForMonth(month: string): Promise<BackendBudgetSnapshot> {
    return fetchBudgetsSnapshotFromApi(month);
  },

  async createBudget(input: BudgetInput): Promise<Budget> {
    const { data } = await apiClient.post<ApiBudgetOut>(
      '/budgets',
      mapBudgetInputToApi(input),
    );
    return mapApiBudget(data);
  },

  async updateBudget(id: string, input: BudgetInput): Promise<Budget> {
    const { data } = await apiClient.put<ApiBudgetOut>(
      `/budgets/${id}`,
      mapBudgetInputToApi(input),
    );
    return mapApiBudget(data);
  },

  async deleteBudget(id: string): Promise<void> {
    await apiClient.delete(`/budgets/${id}`);
  },

  // ---------------- Savings Goals ----------------
  async createSavingsGoal(input: SavingsGoalInput): Promise<SavingsGoal> {
    const { data } = await apiClient.post<ApiSavingsGoalOut>(
      '/savings',
      mapSavingsGoalInputToApi(input),
    );
    return mapApiSavingsGoal(data).goal;
  },

  async updateSavingsGoal(
    id: string,
    input: SavingsGoalInput,
  ): Promise<SavingsGoal> {
    const { data } = await apiClient.put<ApiSavingsGoalOut>(
      `/savings/${id}`,
      mapSavingsGoalInputToApi(input),
    );
    return mapApiSavingsGoal(data).goal;
  },

  async addGoalContribution(
    goalId: string,
    amount: number,
    note?: string,
  ): Promise<SavingsGoal> {
    const { data } = await apiClient.post<ApiSavingsGoalOut>(
      `/savings/${goalId}/contributions`,
      {
        amount: Number(amount),
        note: note?.trim() || undefined,
      },
    );
    return mapApiSavingsGoal(data).goal;
  },

  async deleteSavingsGoal(id: string): Promise<void> {
    await apiClient.delete(`/savings/${id}`);
  },

  // ---------------- Notifications ----------------
  async markNotificationRead(id: string): Promise<AppNotification> {
    const { data } = await apiClient.patch<ApiNotificationOut>(
      `/notifications/${id}/read`,
    );
    return mapApiNotification(data);
  },

  async markAllNotificationsRead(): Promise<number> {
    const { data } = await apiClient.patch<{ marked_read: number }>(
      '/notifications/read-all',
    );
    return data.marked_read;
  },

  // ---------------- Settings ----------------
  async saveSettings(next: UserSettings): Promise<UserSettings> {
    saveLocalUiPreferences({
      defaultPeriod: next.preferences.defaultPeriod,
      sidebarCollapsed: next.appearance.sidebarCollapsed,
    });

    await authService.updateProfile({
      name: next.profile.name,
      email: next.profile.email,
      role: next.profile.role,
      monthly_income_target: Number(next.profile.monthlyIncomeTarget || 0),
    });

    const updatedUser = await authService.updatePreferences({
      currency: next.preferences.currency,
      date_format: next.preferences.dateFormat,
      theme: next.appearance.theme,
      compact_numbers: next.preferences.compactNumbers,
      show_health_score_breakdown: next.preferences.showHealthScoreBreakdown,
      budget_alerts_enabled: next.notifications.budgetAlerts,
      goal_milestones_enabled: next.notifications.goalMilestones,
    });

    return mapApiUserToSettings(updatedUser, getLocalUiPreferences());
  },

  async savePreferencesOnly(next: UserSettings): Promise<UserSettings> {
    saveLocalUiPreferences({
      defaultPeriod: next.preferences.defaultPeriod,
      sidebarCollapsed: next.appearance.sidebarCollapsed,
    });

    const updatedUser = await authService.updatePreferences({
      currency: next.preferences.currency,
      date_format: next.preferences.dateFormat,
      theme: next.appearance.theme,
      compact_numbers: next.preferences.compactNumbers,
      show_health_score_breakdown: next.preferences.showHealthScoreBreakdown,
      budget_alerts_enabled: next.notifications.budgetAlerts,
      goal_milestones_enabled: next.notifications.goalMilestones,
    });

    return mapApiUserToSettings(updatedUser, getLocalUiPreferences());
  },
};

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { extractApiError, registerUnauthorizedHandler } from '../services/api';
import { authService } from '../services/authService';
import type { RegisterPayload } from '../services/authService';
import {
  financeService,
  type BackendAnalyticsSnapshot,
  type BackendBudgetSnapshot,
  type BackendSavingsSnapshot,
  type WorkspaceSnapshot,
} from '../services/financeService';
import { mapApiUserToSettings } from '../services/mappers';
import {
  getAuthToken,
  getLocalUiPreferences,
  saveLocalUiPreferences,
} from '../services/storageService';
import type {
  AppNotification,
  BudgetInput,
  SavingsGoalInput,
  Transaction,
  TransactionInput,
  UserSettings,
} from '../types';
import { getMonthKey } from '../utils/calculations';
import { formatCurrency } from '../utils/formatters';
import {
  FinanceContext,
  type FinanceContextValue,
  type QuickModalState,
} from './financeStore';

function createEmptySettings(): UserSettings {
  const ui = getLocalUiPreferences();
  return {
    profile: {
      name: '',
      email: '',
      role: 'Personal Finance Member',
      monthlyIncomeTarget: 0,
      isDemoSession: false,
    },
    preferences: {
      currency: 'INR',
      dateFormat: 'DD MMM YYYY',
      compactNumbers: false,
      showHealthScoreBreakdown: true,
      defaultPeriod: ui.defaultPeriod,
    },
    appearance: {
      theme: 'dark',
      sidebarCollapsed: ui.sidebarCollapsed,
    },
    notifications: {
      budgetAlerts: true,
      goalMilestones: true,
      largeExpenseAlerts: true,
    },
  };
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const initialHasToken = Boolean(getAuthToken());

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(initialHasToken);
  const [authSubmitting, setAuthSubmitting] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetMonth, setBudgetMonthState] = useState<string>(getMonthKey());
  const [budgetSnapshot, setBudgetSnapshot] =
    useState<BackendBudgetSnapshot | null>(null);
  const [savingsSnapshot, setSavingsSnapshot] =
    useState<BackendSavingsSnapshot | null>(null);
  const [analytics, setAnalytics] = useState<BackendAnalyticsSnapshot | null>(null);
  const [settings, setSettings] = useState<UserSettings>(createEmptySettings);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(initialHasToken);
  const [error, setError] = useState<string | null>(null);
  const [quickModal, setQuickModal] = useState<QuickModalState>({ kind: 'none' });

  const applyWorkspaceSnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    setTransactions(snapshot.transactions);
    setBudgetSnapshot(snapshot.budgetSnapshot);
    setSavingsSnapshot(snapshot.savingsSnapshot);
    setAnalytics(snapshot.analytics);
    setSettings(snapshot.settings);
    setNotifications(snapshot.notifications);
    setError(null);
  }, []);

  const clearWorkspaceState = useCallback(() => {
    setTransactions([]);
    setBudgetSnapshot(null);
    setSavingsSnapshot(null);
    setAnalytics(null);
    setNotifications([]);
    setQuickModal({ kind: 'none' });
    setError(null);
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setIsAuthenticated(false);
    clearWorkspaceState();
  }, [clearWorkspaceState]);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      clearWorkspaceState();
      setLoading(false);
      toast.error('Session expired. Please sign in again.');
    });
  }, [clearWorkspaceState]);

  useEffect(() => {
    if (!initialHasToken) return;
    let active = true;
    financeService
      .loadWorkspace(getMonthKey())
      .then((snapshot) => {
        if (!active) return;
        applyWorkspaceSnapshot(snapshot);
        setIsAuthenticated(true);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const parsed = extractApiError(err);
        if (parsed.status !== 401) {
          setError(parsed.message);
          toast.error(parsed.message);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialHasToken, applyWorkspaceSnapshot]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.appearance.theme);
  }, [settings.appearance.theme]);

  const refreshWorkspace = useCallback(
    async (targetMonth?: string) => {
      const monthToLoad = targetMonth ?? budgetMonth;
      const snapshot = await financeService.loadWorkspace(monthToLoad);
      applyWorkspaceSnapshot(snapshot);
    },
    [budgetMonth, applyWorkspaceSnapshot],
  );

  const reloadData = useCallback(async () => {
    if (!getAuthToken()) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await refreshWorkspace();
    } catch (err) {
      const msg = extractApiError(err).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [refreshWorkspace]);

  const login = useCallback(
    async (email: string, password: string) => {
      setAuthSubmitting(true);
      setError(null);
      try {
        await authService.login({ email, password });
        setIsAuthenticated(true);
        setLoading(true);
        await refreshWorkspace();
        toast.success('Signed in to FINORA.');
      } catch (err) {
        const msg = extractApiError(err).message;
        toast.error(msg);
        throw new Error(msg, { cause: err });
      } finally {
        setAuthSubmitting(false);
        setLoading(false);
      }
    },
    [refreshWorkspace],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      setAuthSubmitting(true);
      setError(null);
      try {
        await authService.register(payload);
        setIsAuthenticated(true);
        setLoading(true);
        await refreshWorkspace();
        toast.success('Account created and signed in.');
      } catch (err) {
        const msg = extractApiError(err).message;
        toast.error(msg);
        throw new Error(msg, { cause: err });
      } finally {
        setAuthSubmitting(false);
        setLoading(false);
      }
    },
    [refreshWorkspace],
  );

  const addTransaction = useCallback(
    async (input: TransactionInput): Promise<boolean> => {
      try {
        await financeService.createTransaction(input);
        await refreshWorkspace();
        toast.success(
          `${input.type === 'income' ? 'Income' : 'Expense'} "${input.title.trim()}" saved.`,
        );
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [refreshWorkspace],
  );

  const editTransaction = useCallback(
    async (id: string, input: TransactionInput): Promise<boolean> => {
      try {
        await financeService.updateTransaction(id, input);
        await refreshWorkspace();
        toast.success(`Updated "${input.title.trim()}".`);
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [refreshWorkspace],
  );

  const removeTransaction = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const target = transactions.find((t) => t.id === id);
        await financeService.deleteTransaction(id);
        await refreshWorkspace();
        toast.success(
          target ? `Deleted "${target.title}".` : 'Transaction removed.',
        );
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [transactions, refreshWorkspace],
  );

  const setBudgetMonth = useCallback(async (month: string) => {
    setBudgetMonthState(month);
    try {
      const nextSnapshot = await financeService.fetchBudgetsForMonth(month);
      setBudgetSnapshot(nextSnapshot);
    } catch (err) {
      toast.error(extractApiError(err).message);
    }
  }, []);

  const addBudget = useCallback(
    async (input: BudgetInput): Promise<boolean> => {
      try {
        await financeService.createBudget(input);
        setBudgetMonthState(input.month);
        await refreshWorkspace(input.month);
        toast.success(`Budget created for ${input.category}.`);
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [refreshWorkspace],
  );

  const editBudget = useCallback(
    async (id: string, input: BudgetInput): Promise<boolean> => {
      try {
        await financeService.updateBudget(id, input);
        setBudgetMonthState(input.month);
        await refreshWorkspace(input.month);
        toast.success(`Updated ${input.category} budget.`);
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [refreshWorkspace],
  );

  const removeBudget = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const target = budgetSnapshot?.utilizations.find((u) => u.budget.id === id);
        await financeService.deleteBudget(id);
        await refreshWorkspace();
        toast.success(
          target ? `Removed ${target.budget.category} budget.` : 'Budget deleted.',
        );
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [budgetSnapshot, refreshWorkspace],
  );

  const addSavingsGoal = useCallback(
    async (input: SavingsGoalInput): Promise<boolean> => {
      try {
        await financeService.createSavingsGoal(input);
        await refreshWorkspace();
        toast.success(`Savings goal "${input.name.trim()}" created.`);
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [refreshWorkspace],
  );

  const editSavingsGoal = useCallback(
    async (id: string, input: SavingsGoalInput): Promise<boolean> => {
      try {
        await financeService.updateSavingsGoal(id, input);
        await refreshWorkspace();
        toast.success(`Updated goal "${input.name.trim()}".`);
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [refreshWorkspace],
  );

  const contributeToGoal = useCallback(
    async (goalId: string, amount: number, note?: string): Promise<boolean> => {
      try {
        const updatedGoal = await financeService.addGoalContribution(
          goalId,
          amount,
          note,
        );
        await refreshWorkspace();
        if (updatedGoal.currentAmount >= updatedGoal.targetAmount) {
          toast.success(`Milestone reached! "${updatedGoal.name}" is 100% funded.`);
        } else {
          toast.success(
            `Added ${formatCurrency(amount, settings.preferences.currency)} to ${updatedGoal.name}.`,
          );
        }
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [refreshWorkspace, settings.preferences.currency],
  );

  const removeSavingsGoal = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const target = savingsSnapshot?.items.find((i) => i.goal.id === id);
        await financeService.deleteSavingsGoal(id);
        await refreshWorkspace();
        toast.success(
          target ? `Deleted goal "${target.goal.name}".` : 'Savings goal removed.',
        );
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [savingsSnapshot, refreshWorkspace],
  );

  const updateProfileSettings = useCallback(
    async (profile: UserSettings['profile']): Promise<boolean> => {
      try {
        const updatedUser = await authService.updateProfile({
          name: profile.name,
          email: profile.email,
          role: profile.role,
          monthly_income_target: Number(profile.monthlyIncomeTarget || 0),
        });
        setSettings(mapApiUserToSettings(updatedUser, getLocalUiPreferences()));
        toast.success('Profile updated.');
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [],
  );

  const updatePreferencesSettings = useCallback(
    async (next: UserSettings): Promise<boolean> => {
      try {
        const saved = await financeService.savePreferencesOnly(next);
        setSettings(saved);
        toast.success('Preferences saved.');
        return true;
      } catch (err) {
        toast.error(extractApiError(err).message);
        return false;
      }
    },
    [],
  );

  const toggleTheme = useCallback(() => {
    const nextTheme = settings.appearance.theme === 'dark' ? 'light' : 'dark';
    const next: UserSettings = {
      ...settings,
      appearance: { ...settings.appearance, theme: nextTheme },
    };
    void updatePreferencesSettings(next);
  }, [settings, updatePreferencesSettings]);

  const toggleSidebarCollapsed = useCallback(() => {
    const nextCollapsed = !settings.appearance.sidebarCollapsed;
    saveLocalUiPreferences({
      defaultPeriod: settings.preferences.defaultPeriod,
      sidebarCollapsed: nextCollapsed,
    });
    setSettings((prev) => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        sidebarCollapsed: nextCollapsed,
      },
    }));
  }, [settings.appearance.sidebarCollapsed, settings.preferences.defaultPeriod]);

  const markNotificationRead = useCallback(
    async (id: string) => {
      const target = notifications.find((n) => n.id === id);
      if (!target || target.read) return;
      try {
        const updated = await financeService.markNotificationRead(id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? updated : n)),
        );
      } catch (err) {
        toast.error(extractApiError(err).message);
      }
    },
    [notifications],
  );

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await financeService.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success('All notifications marked as read.');
    } catch (err) {
      toast.error(extractApiError(err).message);
    }
  }, []);

  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const budgets = useMemo(
    () => budgetSnapshot?.utilizations.map((u) => u.budget) ?? [],
    [budgetSnapshot],
  );
  const savingsGoals = useMemo(
    () => savingsSnapshot?.items.map((i) => i.goal) ?? [],
    [savingsSnapshot],
  );

  const value: FinanceContextValue = {
    isAuthenticated,
    authSubmitting,
    transactions,
    budgets,
    budgetMonth,
    budgetSnapshot,
    savingsGoals,
    savingsSnapshot,
    analytics,
    settings,
    notifications,
    unreadNotificationCount,
    loading,
    error,
    quickModal,
    setQuickModal,
    login,
    register,
    logout,
    addTransaction,
    editTransaction,
    removeTransaction,
    setBudgetMonth,
    addBudget,
    editBudget,
    removeBudget,
    addSavingsGoal,
    editSavingsGoal,
    contributeToGoal,
    removeSavingsGoal,
    updateProfileSettings,
    updatePreferencesSettings,
    toggleTheme,
    toggleSidebarCollapsed,
    markNotificationRead,
    markAllNotificationsRead,
    reloadData,
  };

  return (
    <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
  );
}

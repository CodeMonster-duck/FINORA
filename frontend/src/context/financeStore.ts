import { createContext, useContext } from 'react';
import type {
  BackendAnalyticsSnapshot,
  BackendBudgetSnapshot,
  BackendSavingsSnapshot,
} from '../services/financeService';
import type { RegisterPayload } from '../services/authService';
import type {
  AppNotification,
  Budget,
  BudgetInput,
  SavingsGoal,
  SavingsGoalInput,
  Transaction,
  TransactionInput,
  TransactionType,
  UserSettings,
} from '../types';

export type QuickModalState =
  | { kind: 'none' }
  | { kind: 'transaction'; defaultType: TransactionType; editing?: Transaction }
  | { kind: 'budget'; editing?: Budget }
  | { kind: 'savings-goal'; editing?: SavingsGoal }
  | { kind: 'help' };

export interface FinanceContextValue {
  isAuthenticated: boolean;
  authSubmitting: boolean;
  transactions: Transaction[];
  budgets: Budget[];
  budgetMonth: string;
  budgetSnapshot: BackendBudgetSnapshot | null;
  savingsGoals: SavingsGoal[];
  savingsSnapshot: BackendSavingsSnapshot | null;
  analytics: BackendAnalyticsSnapshot | null;
  settings: UserSettings;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  loading: boolean;
  error: string | null;
  quickModal: QuickModalState;
  setQuickModal: (modal: QuickModalState) => void;

  // Auth
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;

  // Transaction CRUD
  addTransaction: (input: TransactionInput) => Promise<boolean>;
  editTransaction: (id: string, input: TransactionInput) => Promise<boolean>;
  removeTransaction: (id: string) => Promise<boolean>;

  // Budget CRUD
  setBudgetMonth: (month: string) => Promise<void>;
  addBudget: (input: BudgetInput) => Promise<boolean>;
  editBudget: (id: string, input: BudgetInput) => Promise<boolean>;
  removeBudget: (id: string) => Promise<boolean>;

  // Savings Goal CRUD
  addSavingsGoal: (input: SavingsGoalInput) => Promise<boolean>;
  editSavingsGoal: (id: string, input: SavingsGoalInput) => Promise<boolean>;
  contributeToGoal: (
    goalId: string,
    amount: number,
    note?: string,
  ) => Promise<boolean>;
  removeSavingsGoal: (id: string) => Promise<boolean>;

  // Settings & Notifications
  updateProfileSettings: (
    profile: UserSettings['profile'],
  ) => Promise<boolean>;
  updatePreferencesSettings: (next: UserSettings) => Promise<boolean>;
  toggleTheme: () => void;
  toggleSidebarCollapsed: () => void;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  reloadData: () => Promise<void>;
}

export const FinanceContext = createContext<FinanceContextValue | null>(null);

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) {
    throw new Error('useFinance must be used inside FinanceProvider');
  }
  return ctx;
}

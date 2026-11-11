import { isValid, parseISO } from 'date-fns';
import type {
  Budget,
  BudgetInput,
  SavingsGoal,
  SavingsGoalInput,
  TransactionInput,
  UserSettings,
  ValidationResult,
} from '../types';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
} from '../types';

const MAX_MONETARY_AMOUNT = 100_000_000; // ₹10 Cr practical upper guardrail

export function validateTransactionInput(
  input: Partial<TransactionInput>,
): ValidationResult {
  const errors: Record<string, string> = {};

  const title = (input.title ?? '').trim();
  if (!title) {
    errors.title = 'Transaction title is required.';
  } else if (title.length < 2) {
    errors.title = 'Title must be at least 2 characters.';
  } else if (title.length > 100) {
    errors.title = 'Title cannot exceed 100 characters.';
  }

  const amount = Number(input.amount);
  if (input.amount === undefined || input.amount === null || Number.isNaN(amount)) {
    errors.amount = 'Enter a valid monetary amount.';
  } else if (amount <= 0) {
    errors.amount = 'Amount must be greater than zero.';
  } else if (amount > MAX_MONETARY_AMOUNT) {
    errors.amount = 'Amount exceeds the ₹10,00,00,000 single-entry limit.';
  }

  if (input.type !== 'income' && input.type !== 'expense') {
    errors.type = 'Select either Income or Expense.';
  }

  if (!input.category) {
    errors.category = 'Category is required.';
  } else if (
    input.type === 'income' &&
    !INCOME_CATEGORIES.includes(input.category as (typeof INCOME_CATEGORIES)[number])
  ) {
    errors.category = 'Select a valid income category.';
  } else if (
    input.type === 'expense' &&
    !EXPENSE_CATEGORIES.includes(input.category as (typeof EXPENSE_CATEGORIES)[number])
  ) {
    errors.category = 'Select a valid expense category.';
  }

  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.date = 'Select a valid date.';
  } else {
    const parsed = parseISO(input.date);
    if (!isValid(parsed)) {
      errors.date = 'Provided date is invalid.';
    }
  }

  if (
    !input.paymentMethod ||
    !PAYMENT_METHODS.includes(input.paymentMethod)
  ) {
    errors.paymentMethod = 'Select a valid payment method.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateBudgetInput(
  input: Partial<BudgetInput>,
  existingBudgets: readonly Budget[],
  editingBudgetId?: string,
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.category) {
    errors.category = 'Expense category is required.';
  } else {
    const duplicate = existingBudgets.find(
      (b) =>
        b.category === input.category &&
        b.month === (input.month ?? b.month) &&
        b.id !== editingBudgetId,
    );
    if (duplicate) {
      errors.category = `A budget for ${input.category} already exists for this period.`;
    }
  }

  const limit = Number(input.limit);
  if (input.limit === undefined || Number.isNaN(limit) || limit <= 0) {
    errors.limit = 'Budget limit must be greater than zero.';
  } else if (limit > MAX_MONETARY_AMOUNT) {
    errors.limit = 'Budget limit is unrealistically high.';
  }

  const threshold = Number(input.alertThreshold ?? 80);
  if (Number.isNaN(threshold) || threshold < 10 || threshold > 100) {
    errors.alertThreshold = 'Alert threshold must be between 10% and 100%.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateSavingsGoalInput(
  input: Partial<SavingsGoalInput>,
): ValidationResult {
  const errors: Record<string, string> = {};

  const name = (input.name ?? '').trim();
  if (!name) {
    errors.name = 'Goal name is required.';
  } else if (name.length < 2) {
    errors.name = 'Goal name must be at least 2 characters.';
  }

  const target = Number(input.targetAmount);
  if (input.targetAmount === undefined || Number.isNaN(target) || target <= 0) {
    errors.targetAmount = 'Target amount must be greater than zero.';
  } else if (target > MAX_MONETARY_AMOUNT) {
    errors.targetAmount = 'Target amount exceeds ₹10,00,00,000 limit.';
  }

  const current = Number(input.currentAmount ?? 0);
  if (Number.isNaN(current) || current < 0) {
    errors.currentAmount = 'Current savings cannot be negative.';
  }

  if (!input.targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) {
    errors.targetDate = 'Select a valid target date.';
  } else if (!isValid(parseISO(input.targetDate))) {
    errors.targetDate = 'Provided target date is invalid.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateGoalContribution(
  amount: number,
  goal: SavingsGoal,
): ValidationResult {
  const errors: Record<string, string> = {};

  if (goal.currentAmount >= goal.targetAmount) {
    errors.amount = 'This savings goal is already 100% completed.';
    return { isValid: false, errors };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Contribution amount must be greater than zero.';
  } else if (amount > MAX_MONETARY_AMOUNT) {
    errors.amount = 'Contribution amount exceeds permitted maximum.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateProfileSettings(
  profile: UserSettings['profile'],
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!profile.name.trim() || profile.name.trim().length < 2) {
    errors.name = 'Display name must be at least 2 characters.';
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(profile.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (
    Number.isNaN(profile.monthlyIncomeTarget) ||
    profile.monthlyIncomeTarget < 0
  ) {
    errors.monthlyIncomeTarget = 'Monthly income target cannot be negative.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

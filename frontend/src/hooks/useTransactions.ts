import { useMemo } from 'react';
import { useFinance } from '../context/financeStore';
import {
  getCategoryExpenses,
  getCurrentBalance,
  getMonthKey,
  getMonthlyComparison,
  getMonthlyTrends,
  getSavingsRate,
  getTotalExpenses,
  getTotalIncome,
} from '../utils/calculations';

export function useTransactions() {
  const {
    transactions,
    analytics,
    loading,
    error,
    addTransaction,
    editTransaction,
    removeTransaction,
    reloadData,
  } = useFinance();

  const currentMonthKey = getMonthKey();

  const summary = useMemo(() => {
    if (analytics) {
      return {
        totalBalance: analytics.overview.totalBalance,
        totalIncomeAllTime: analytics.overview.totalIncomeAllTime,
        totalExpensesAllTime: analytics.overview.totalExpensesAllTime,
        monthlyIncome: analytics.overview.monthlyIncome,
        monthlyExpenses: analytics.overview.monthlyExpenses,
        monthlySavings: analytics.overview.monthlySavings,
        monthlySavingsRate: analytics.overview.monthlySavingsRate,
        comparison: analytics.overview.comparison,
        categoryExpenses: analytics.categories,
        monthlyTrends: analytics.trends,
      };
    }

    const totalBalance = getCurrentBalance(transactions);
    const totalIncomeAllTime = getTotalIncome(transactions);
    const totalExpensesAllTime = getTotalExpenses(transactions);
    const monthlyIncome = getTotalIncome(transactions, currentMonthKey);
    const monthlyExpenses = getTotalExpenses(transactions, currentMonthKey);
    const monthlySavings = monthlyIncome - monthlyExpenses;
    const monthlySavingsRate = getSavingsRate(monthlyIncome, monthlyExpenses);
    const comparison = getMonthlyComparison(transactions);
    const categoryExpenses = getCategoryExpenses(transactions, currentMonthKey);
    const monthlyTrends = getMonthlyTrends(transactions, 6);

    return {
      totalBalance,
      totalIncomeAllTime,
      totalExpensesAllTime,
      monthlyIncome,
      monthlyExpenses,
      monthlySavings,
      monthlySavingsRate,
      comparison,
      categoryExpenses,
      monthlyTrends,
    };
  }, [analytics, transactions, currentMonthKey]);

  return {
    transactions,
    loading,
    error,
    summary,
    addTransaction,
    editTransaction,
    removeTransaction,
    reloadData,
  };
}

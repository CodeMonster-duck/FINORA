import { useMemo } from 'react';
import { useFinance } from '../context/financeStore';

export function useBudgets() {
  const {
    budgets,
    budgetMonth,
    budgetSnapshot,
    loading,
    error,
    setBudgetMonth,
    addBudget,
    editBudget,
    removeBudget,
  } = useFinance();

  const utilizations = useMemo(
    () => budgetSnapshot?.utilizations ?? [],
    [budgetSnapshot],
  );

  const totals = useMemo(() => {
    if (!budgetSnapshot) {
      return {
        totalLimit: 0,
        totalSpent: 0,
        totalRemaining: 0,
        overallPercentage: 0,
        approachingCount: 0,
        exceededCount: 0,
        onTrackCount: 0,
      };
    }

    return {
      totalLimit: budgetSnapshot.totalLimit,
      totalSpent: budgetSnapshot.totalSpent,
      totalRemaining: budgetSnapshot.totalRemaining,
      overallPercentage: budgetSnapshot.overallPercentage,
      approachingCount: budgetSnapshot.approachingCount,
      exceededCount: budgetSnapshot.exceededCount,
      onTrackCount: budgetSnapshot.onTrackCount,
    };
  }, [budgetSnapshot]);

  return {
    budgets,
    utilizations,
    totals,
    targetMonth: budgetMonth,
    setBudgetMonth,
    loading,
    error,
    addBudget,
    editBudget,
    removeBudget,
  };
}

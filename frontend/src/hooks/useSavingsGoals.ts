import { useMemo } from 'react';
import { useFinance } from '../context/financeStore';

export function useSavingsGoals() {
  const {
    savingsGoals,
    savingsSnapshot,
    loading,
    error,
    addSavingsGoal,
    editSavingsGoal,
    contributeToGoal,
    removeSavingsGoal,
  } = useFinance();

  const goalsWithProgress = useMemo(
    () => savingsSnapshot?.items ?? [],
    [savingsSnapshot],
  );

  const totals = useMemo(() => {
    if (!savingsSnapshot) {
      return {
        totalSaved: 0,
        totalTarget: 0,
        totalRemaining: 0,
        overallPercentage: 0,
        completedCount: 0,
        activeCount: 0,
      };
    }

    return {
      totalSaved: savingsSnapshot.totalSaved,
      totalTarget: savingsSnapshot.totalTarget,
      totalRemaining: savingsSnapshot.totalRemaining,
      overallPercentage: savingsSnapshot.overallPercentage,
      completedCount: savingsSnapshot.completedCount,
      activeCount: savingsSnapshot.activeCount,
    };
  }, [savingsSnapshot]);

  return {
    savingsGoals,
    goalsWithProgress,
    totals,
    loading,
    error,
    addSavingsGoal,
    editSavingsGoal,
    contributeToGoal,
    removeSavingsGoal,
  };
}

import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import type {
  Budget,
  BudgetStatus,
  BudgetUtilization,
  CategoryExpenseSummary,
  ExpenseCategory,
  FinancialHealthScore,
  HealthScoreFactor,
  MonthlyComparison,
  MonthlyTrendPoint,
  SavingsGoal,
  SavingsProgress,
  SpendingInsight,
  Transaction,
  WeeklySpendingPoint,
} from '../types';
import { EXPENSE_CATEGORIES } from '../types';
import { formatCurrency, getCategoryColor } from './formatters';

/**
 * Integer-paise conversion prevents IEEE-754 floating-point drift in financial sums.
 */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  if (!Number.isFinite(paise)) return 0;
  return Math.round(paise) / 100;
}

export function roundCurrency(rupees: number): number {
  return fromPaise(toPaise(rupees));
}

export function getMonthKey(dateInput: Date | string = new Date()): string {
  if (typeof dateInput === 'string') {
    if (/^\d{4}-\d{2}/.test(dateInput)) {
      return dateInput.slice(0, 7);
    }
    const parsed = parseISO(dateInput);
    return isValid(parsed) ? format(parsed, 'yyyy-MM') : format(new Date(), 'yyyy-MM');
  }
  return format(dateInput, 'yyyy-MM');
}

export function filterTransactionsByMonth(
  transactions: readonly Transaction[],
  monthKey?: string,
): Transaction[] {
  if (!monthKey) return [...transactions];
  return transactions.filter((tx) => tx.date.startsWith(monthKey));
}

export function getTotalIncome(
  transactions: readonly Transaction[],
  monthKey?: string,
): number {
  const scoped = filterTransactionsByMonth(transactions, monthKey);
  const totalPaise = scoped.reduce((acc, tx) => {
    if (tx.type !== 'income') return acc;
    return acc + toPaise(Math.max(0, tx.amount));
  }, 0);
  return fromPaise(totalPaise);
}

export function getTotalExpenses(
  transactions: readonly Transaction[],
  monthKey?: string,
): number {
  const scoped = filterTransactionsByMonth(transactions, monthKey);
  const totalPaise = scoped.reduce((acc, tx) => {
    if (tx.type !== 'expense') return acc;
    return acc + toPaise(Math.max(0, tx.amount));
  }, 0);
  return fromPaise(totalPaise);
}

export function getCurrentBalance(
  transactions: readonly Transaction[],
  monthKey?: string,
): number {
  const scoped = filterTransactionsByMonth(transactions, monthKey);
  const balancePaise = scoped.reduce((acc, tx) => {
    const amountPaise = toPaise(Math.max(0, tx.amount));
    return tx.type === 'income' ? acc + amountPaise : acc - amountPaise;
  }, 0);
  return fromPaise(balancePaise);
}

export function getSavingsRate(income: number, expenses: number): number {
  const incomePaise = toPaise(Math.max(0, income));
  if (incomePaise <= 0) return 0;
  const expensePaise = toPaise(Math.max(0, expenses));
  const savedPaise = incomePaise - expensePaise;
  const rawPct = (savedPaise / incomePaise) * 100;
  return Math.round(rawPct * 10) / 10;
}

export function getCategoryExpenses(
  transactions: readonly Transaction[],
  monthKey?: string,
): CategoryExpenseSummary[] {
  const scoped = filterTransactionsByMonth(transactions, monthKey).filter(
    (tx) => tx.type === 'expense',
  );

  const totalsPaise = new Map<ExpenseCategory, { paise: number; count: number }>();
  let grandTotalPaise = 0;

  for (const tx of scoped) {
    const cat = (EXPENSE_CATEGORIES.includes(tx.category as ExpenseCategory)
      ? tx.category
      : 'Other') as ExpenseCategory;
    const txPaise = toPaise(Math.max(0, tx.amount));
    grandTotalPaise += txPaise;
    const prev = totalsPaise.get(cat) ?? { paise: 0, count: 0 };
    totalsPaise.set(cat, { paise: prev.paise + txPaise, count: prev.count + 1 });
  }

  const result: CategoryExpenseSummary[] = [];
  totalsPaise.forEach((entry, category) => {
    const pct =
      grandTotalPaise > 0
        ? Math.round((entry.paise / grandTotalPaise) * 1000) / 10
        : 0;
    result.push({
      category,
      amount: fromPaise(entry.paise),
      percentage: pct,
      count: entry.count,
      color: getCategoryColor(category),
    });
  });

  return result.sort((a, b) => b.amount - a.amount);
}

export function getRemainingBudget(
  budget: Budget,
  transactions: readonly Transaction[],
  monthKey?: string,
): number {
  const targetMonth = monthKey ?? (budget.month === 'monthly' ? getMonthKey() : budget.month);
  const spentPaise = transactions.reduce((acc, tx) => {
    if (
      tx.type === 'expense' &&
      tx.category === budget.category &&
      tx.date.startsWith(targetMonth)
    ) {
      return acc + toPaise(Math.max(0, tx.amount));
    }
    return acc;
  }, 0);

  return fromPaise(toPaise(Math.max(0, budget.limit)) - spentPaise);
}

export function getBudgetUtilization(
  budget: Budget,
  transactions: readonly Transaction[],
  monthKey?: string,
): BudgetUtilization {
  const targetMonth = monthKey ?? (budget.month === 'monthly' ? getMonthKey() : budget.month);
  let spentPaise = 0;
  let count = 0;

  for (const tx of transactions) {
    if (
      tx.type === 'expense' &&
      tx.category === budget.category &&
      tx.date.startsWith(targetMonth)
    ) {
      spentPaise += toPaise(Math.max(0, tx.amount));
      count += 1;
    }
  }

  const limitPaise = toPaise(Math.max(0, budget.limit));
  const spent = fromPaise(spentPaise);
  const remaining = fromPaise(limitPaise - spentPaise);
  const utilizationPercentage =
    limitPaise > 0 ? Math.round((spentPaise / limitPaise) * 1000) / 10 : 0;

  let status: BudgetStatus = 'normal';
  if (utilizationPercentage > 100) {
    status = 'exceeded';
  } else if (utilizationPercentage >= budget.alertThreshold) {
    status = 'approaching';
  }

  return {
    budget,
    spent,
    remaining,
    utilizationPercentage,
    status,
    transactionCount: count,
  };
}

export function getSavingsProgress(
  goal: SavingsGoal,
  referenceDate: Date = new Date(),
): SavingsProgress {
  const currentPaise = toPaise(Math.max(0, goal.currentAmount));
  const targetPaise = toPaise(Math.max(0, goal.targetAmount));
  const remainingPaise = Math.max(0, targetPaise - currentPaise);

  const rawPct =
    targetPaise > 0 ? Math.min(100, Math.round((currentPaise / targetPaise) * 1000) / 10) : 0;

  const parsedTarget = parseISO(goal.targetDate);
  const daysRemaining = isValid(parsedTarget)
    ? differenceInCalendarDays(parsedTarget, referenceDate)
    : 0;

  return {
    currentAmount: fromPaise(currentPaise),
    targetAmount: fromPaise(targetPaise),
    remainingAmount: fromPaise(remainingPaise),
    percentage: rawPct,
    isCompleted: targetPaise > 0 && currentPaise >= targetPaise,
    daysRemaining,
  };
}

function calcDeltaPct(current: number, previous: number): number {
  const currPaise = toPaise(current);
  const prevPaise = toPaise(previous);
  if (prevPaise === 0) {
    return currPaise === 0 ? 0 : 100;
  }
  return Math.round(((currPaise - prevPaise) / Math.abs(prevPaise)) * 1000) / 10;
}

export function getMonthlyComparison(
  transactions: readonly Transaction[],
  referenceDate: Date = new Date(),
): MonthlyComparison {
  const currentMonthKey = format(referenceDate, 'yyyy-MM');
  const previousMonthKey = format(subMonths(referenceDate, 1), 'yyyy-MM');

  const currentIncome = getTotalIncome(transactions, currentMonthKey);
  const previousIncome = getTotalIncome(transactions, previousMonthKey);

  const currentExpenses = getTotalExpenses(transactions, currentMonthKey);
  const previousExpenses = getTotalExpenses(transactions, previousMonthKey);

  const currentSavings = fromPaise(
    toPaise(currentIncome) - toPaise(currentExpenses),
  );
  const previousSavings = fromPaise(
    toPaise(previousIncome) - toPaise(previousExpenses),
  );

  return {
    currentMonthKey,
    previousMonthKey,
    currentIncome,
    previousIncome,
    incomeChangePct: calcDeltaPct(currentIncome, previousIncome),
    currentExpenses,
    previousExpenses,
    expenseChangePct: calcDeltaPct(currentExpenses, previousExpenses),
    currentSavings,
    previousSavings,
    savingsChangePct: calcDeltaPct(currentSavings, previousSavings),
    currentSavingsRate: getSavingsRate(currentIncome, currentExpenses),
    previousSavingsRate: getSavingsRate(previousIncome, previousExpenses),
  };
}

export function getMonthlyTrends(
  transactions: readonly Transaction[],
  monthsCount = 6,
  referenceDate: Date = new Date(),
): MonthlyTrendPoint[] {
  const points: MonthlyTrendPoint[] = [];

  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    const monthDate = subMonths(referenceDate, i);
    const monthKey = format(monthDate, 'yyyy-MM');
    const label = format(monthDate, 'MMM yy');
    const income = getTotalIncome(transactions, monthKey);
    const expenses = getTotalExpenses(transactions, monthKey);
    const savings = fromPaise(toPaise(income) - toPaise(expenses));
    const savingsRate = getSavingsRate(income, expenses);

    points.push({
      monthKey,
      label,
      income,
      expenses,
      savings,
      savingsRate,
    });
  }

  return points;
}

export function getWeeklySpending(
  transactions: readonly Transaction[],
  weeksCount = 6,
  referenceDate: Date = new Date(),
): WeeklySpendingPoint[] {
  const result: WeeklySpendingPoint[] = [];

  for (let i = weeksCount - 1; i >= 0; i -= 1) {
    const anchor = subWeeks(referenceDate, i);
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = endOfWeek(anchor, { weekStartsOn: 1 });
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    let paise = 0;
    let count = 0;

    for (const tx of transactions) {
      if (tx.type === 'expense' && tx.date >= startStr && tx.date <= endStr) {
        paise += toPaise(Math.max(0, tx.amount));
        count += 1;
      }
    }

    result.push({
      weekLabel: format(start, 'dd MMM'),
      amount: fromPaise(paise),
      transactionCount: count,
    });
  }

  return result;
}

export function getFinancialHealthScore(
  transactions: readonly Transaction[],
  budgets: readonly Budget[],
  goals: readonly SavingsGoal[],
  referenceDate: Date = new Date(),
): FinancialHealthScore {
  const currentMonthKey = format(referenceDate, 'yyyy-MM');
  const income = getTotalIncome(transactions, currentMonthKey);
  const expenses = getTotalExpenses(transactions, currentMonthKey);
  const savingsRate = getSavingsRate(income, expenses);

  // 1. Savings Rate Pillar (Max 35 pts)
  let savingsScore = 0;
  if (income > 0) {
    if (savingsRate >= 30) savingsScore = 35;
    else if (savingsRate >= 20) savingsScore = 28 + Math.round(((savingsRate - 20) / 10) * 7);
    else if (savingsRate >= 10) savingsScore = 18 + Math.round(((savingsRate - 10) / 10) * 10);
    else if (savingsRate > 0) savingsScore = Math.max(6, Math.round((savingsRate / 10) * 18));
    else savingsScore = 2;
  }

  const savingsFactor: HealthScoreFactor = {
    id: 'savings-rate',
    label: 'Savings Rate',
    score: savingsScore,
    maxScore: 35,
    metricDisplay: income > 0 ? `${Math.max(0, savingsRate).toFixed(1)}%` : 'No income yet',
    explanation:
      income <= 0
        ? 'Add monthly income transactions to evaluate your savings cushion.'
        : savingsRate >= 25
          ? 'Saving at least 25% of monthly income builds a resilient buffer.'
          : savingsRate >= 10
            ? 'Healthy positive savings; raising toward 25% unlocks top-tier score.'
            : 'Expenses consume nearly all monthly income this month.',
    status:
      savingsScore >= 26 ? 'strong' : savingsScore >= 16 ? 'moderate' : 'needs-attention',
  };

  // 2. Budget Adherence Pillar (Max 30 pts)
  let budgetScore = 18;
  let budgetMetric = 'No budgets set';
  let budgetExplanation =
    'Create category budgets to track limits and earn full budget adherence points.';

  if (budgets.length > 0) {
    const utilizations = budgets.map((b) =>
      getBudgetUtilization(b, transactions, currentMonthKey),
    );
    const exceededCount = utilizations.filter((u) => u.status === 'exceeded').length;
    const approachingCount = utilizations.filter((u) => u.status === 'approaching').length;
    const onTrackCount = utilizations.length - exceededCount;

    const avgUtil =
      utilizations.reduce((acc, u) => acc + Math.min(u.utilizationPercentage, 140), 0) /
      utilizations.length;

    const baseRatio = onTrackCount / utilizations.length;
    budgetScore = Math.max(
      4,
      Math.min(
        30,
        Math.round(baseRatio * 26 + (approachingCount === 0 ? 4 : 2) - exceededCount * 4),
      ),
    );
    budgetMetric = `${onTrackCount}/${utilizations.length} within limit`;
    budgetExplanation =
      exceededCount === 0
        ? `All ${utilizations.length} category budgets are within cap (${avgUtil.toFixed(0)}% avg used).`
        : `${exceededCount} budget${exceededCount > 1 ? 's' : ''} exceeded this month; trimming discretionary spend will raise this score.`;
  }

  const budgetFactor: HealthScoreFactor = {
    id: 'budget-adherence',
    label: 'Budget Adherence',
    score: budgetScore,
    maxScore: 30,
    metricDisplay: budgetMetric,
    explanation: budgetExplanation,
    status:
      budgetScore >= 23 ? 'strong' : budgetScore >= 15 ? 'moderate' : 'needs-attention',
  };

  // 3. Spending Consistency Pillar (Max 20 pts)
  const trends = getMonthlyTrends(transactions, 3, referenceDate).filter(
    (m) => m.expenses > 0 || m.income > 0,
  );
  let consistencyScore = 10;
  let consistencyMetric = 'Limited history';
  let consistencyExplanation =
    'Track expenses across multiple months to measure spending stability.';

  if (trends.length >= 2) {
    const expensesArr = trends.map((t) => t.expenses);
    const avgExp =
      expensesArr.reduce((acc, v) => acc + v, 0) / Math.max(1, expensesArr.length);
    if (avgExp > 0) {
      const variance =
        expensesArr.reduce((acc, v) => acc + (v - avgExp) ** 2, 0) /
        expensesArr.length;
      const cv = Math.sqrt(variance) / avgExp; // Coefficient of variation
      if (cv <= 0.12) consistencyScore = 20;
      else if (cv <= 0.25) consistencyScore = 16;
      else if (cv <= 0.4) consistencyScore = 12;
      else consistencyScore = 7;

      consistencyMetric =
        cv <= 0.15 ? 'Steady pattern' : cv <= 0.3 ? 'Moderate variance' : 'High swing';
      consistencyExplanation =
        cv <= 0.2
          ? `Monthly expenses stay within ±${Math.round(cv * 100)}% of your 3-month average.`
          : `Monthly spending fluctuated by ~${Math.round(cv * 100)}% across recent months.`;
    }
  } else if (transactions.length > 0) {
    consistencyScore = 13;
    consistencyMetric = '1 month active';
    consistencyExplanation =
      'Current month tracking is active; consistency refines over 2+ months.';
  }

  const consistencyFactor: HealthScoreFactor = {
    id: 'spending-consistency',
    label: 'Spending Consistency',
    score: consistencyScore,
    maxScore: 20,
    metricDisplay: consistencyMetric,
    explanation: consistencyExplanation,
    status:
      consistencyScore >= 16
        ? 'strong'
        : consistencyScore >= 11
          ? 'moderate'
          : 'needs-attention',
  };

  // 4. Savings Goal Progress Pillar (Max 15 pts)
  let goalsScore = 6;
  let goalsMetric = 'No goals set';
  let goalsExplanation = 'Set at least one savings goal to track targeted wealth progress.';

  if (goals.length > 0) {
    const progresses = goals.map((g) => getSavingsProgress(g, referenceDate));
    const avgPct =
      progresses.reduce((acc, p) => acc + p.percentage, 0) / progresses.length;
    const completed = progresses.filter((p) => p.isCompleted).length;
    goalsScore = Math.max(4, Math.min(15, Math.round((avgPct / 100) * 12) + (completed > 0 ? 3 : 2)));
    goalsMetric = `${avgPct.toFixed(0)}% avg progress`;
    goalsExplanation = `${goals.length} active goal${goals.length > 1 ? 's' : ''} averaging ${avgPct.toFixed(0)}% funded${completed > 0 ? ` (${completed} completed)` : ''}.`;
  }

  const goalsFactor: HealthScoreFactor = {
    id: 'goal-progress',
    label: 'Savings Goal Progress',
    score: goalsScore,
    maxScore: 15,
    metricDisplay: goalsMetric,
    explanation: goalsExplanation,
    status: goalsScore >= 12 ? 'strong' : goalsScore >= 8 ? 'moderate' : 'needs-attention',
  };

  const factors = [savingsFactor, budgetFactor, consistencyFactor, goalsFactor];
  const totalScore = Math.max(
    0,
    Math.min(
      100,
      factors.reduce((sum, f) => sum + f.score, 0),
    ),
  );

  let grade: FinancialHealthScore['grade'] = 'Needs Attention';
  let summary =
    'Your spending currently outpaces your budget guardrails. Focus on tightening top expense categories.';

  if (totalScore >= 82) {
    grade = 'Excellent';
    summary =
      'Strong cash-flow discipline, healthy savings rate, and consistent budget execution.';
  } else if (totalScore >= 65) {
    grade = 'Good';
    summary =
      'Solid financial footing with manageable expenses and steady progress toward savings goals.';
  } else if (totalScore >= 45) {
    grade = 'Fair';
    summary =
      'Moderate balance overall. Reviewing approaching budgets and boosting savings rate will help.';
  }

  return {
    totalScore,
    grade,
    summary,
    disclaimer:
      'Rule-based personal wellness metric computed strictly from your tracked transactions, budgets, and goals — not a certified financial assessment.',
    factors,
  };
}

export function getSmartInsights(
  transactions: readonly Transaction[],
  budgets: readonly Budget[],
  goals: readonly SavingsGoal[],
  referenceDate: Date = new Date(),
  currency: 'INR' | 'USD' | 'EUR' = 'INR',
): SpendingInsight[] {
  const insights: SpendingInsight[] = [];
  const currentMonthKey = format(referenceDate, 'yyyy-MM');
  const previousMonthKey = format(subMonths(referenceDate, 1), 'yyyy-MM');

  const currentCats = getCategoryExpenses(transactions, currentMonthKey);
  const previousCats = getCategoryExpenses(transactions, previousMonthKey);

  // 1. Category MoM comparison insight
  if (currentCats.length > 0) {
    let biggestShift: {
      category: ExpenseCategory;
      pctChange: number;
      currentAmount: number;
    } | null = null;

    for (const curr of currentCats) {
      const prev = previousCats.find((p) => p.category === curr.category);
      if (prev && prev.amount > 0) {
        const pctChange = Math.round(((curr.amount - prev.amount) / prev.amount) * 100);
        if (
          !biggestShift ||
          Math.abs(pctChange) > Math.abs(biggestShift.pctChange)
        ) {
          biggestShift = {
            category: curr.category,
            pctChange,
            currentAmount: curr.amount,
          };
        }
      }
    }

    if (biggestShift && Math.abs(biggestShift.pctChange) >= 5) {
      const increased = biggestShift.pctChange > 0;
      insights.push({
        id: 'insight-mom-category',
        title: `${biggestShift.category} ${increased ? 'spend uptick' : 'savings win'}`,
        description: `You spent ${Math.abs(biggestShift.pctChange)}% ${increased ? 'more' : 'less'} on ${biggestShift.category} (${formatCurrency(biggestShift.currentAmount, currency)}) compared with last month.`,
        tone: increased ? 'warning' : 'positive',
        metric: `${increased ? '+' : '-'}${Math.abs(biggestShift.pctChange)}%`,
        actionRoute: '/analytics',
        actionLabel: 'View trends',
      });
    } else {
      const top = currentCats[0];
      insights.push({
        id: 'insight-top-category',
        title: `Top spend: ${top.category}`,
        description: `${top.category} accounts for ${top.percentage}% (${formatCurrency(top.amount, currency)}) of your current month expenses.`,
        tone: 'info',
        metric: `${top.percentage}%`,
        actionRoute: '/transactions',
        actionLabel: 'Inspect entries',
      });
    }
  }

  // 2. Budget headroom / overrun insight
  if (budgets.length > 0) {
    const utilizations = budgets
      .map((b) => getBudgetUtilization(b, transactions, currentMonthKey))
      .sort((a, b) => b.utilizationPercentage - a.utilizationPercentage);

    const exceeded = utilizations.find((u) => u.status === 'exceeded');
    const approaching = utilizations.find((u) => u.status === 'approaching');
    const healthiest = [...utilizations].sort(
      (a, b) => a.utilizationPercentage - b.utilizationPercentage,
    )[0];

    if (exceeded) {
      insights.push({
        id: 'insight-budget-exceeded',
        title: `${exceeded.budget.category} budget exceeded`,
        description: `Spent ${formatCurrency(exceeded.spent, currency)} against a ${formatCurrency(exceeded.budget.limit, currency)} cap (${exceeded.utilizationPercentage.toFixed(0)}% used).`,
        tone: 'danger',
        metric: `${exceeded.utilizationPercentage.toFixed(0)}%`,
        actionRoute: '/budgets',
        actionLabel: 'Review budget',
      });
    } else if (approaching) {
      insights.push({
        id: 'insight-budget-approaching',
        title: `${approaching.budget.category} nearing limit`,
        description: `${formatCurrency(approaching.remaining, currency)} remaining in your ${approaching.budget.category} monthly budget (${approaching.utilizationPercentage.toFixed(0)}% utilized).`,
        tone: 'warning',
        metric: `${approaching.utilizationPercentage.toFixed(0)}%`,
        actionRoute: '/budgets',
        actionLabel: 'Adjust limit',
      });
    } else if (healthiest) {
      insights.push({
        id: 'insight-budget-healthy',
        title: `${healthiest.budget.category} well within budget`,
        description: `Your ${healthiest.budget.category} spending is at ${healthiest.utilizationPercentage.toFixed(0)}% of its ${formatCurrency(healthiest.budget.limit, currency)} monthly limit.`,
        tone: 'positive',
        metric: `${healthiest.utilizationPercentage.toFixed(0)}%`,
        actionRoute: '/budgets',
        actionLabel: 'View budgets',
      });
    }
  }

  // 3. Nearest savings goal insight
  const activeGoals = goals
    .map((g) => ({ goal: g, progress: getSavingsProgress(g, referenceDate) }))
    .filter((item) => !item.progress.isCompleted)
    .sort((a, b) => b.progress.percentage - a.progress.percentage);

  if (activeGoals.length > 0) {
    const nearest = activeGoals[0];
    insights.push({
      id: 'insight-nearest-goal',
      title: `${nearest.goal.name} at ${nearest.progress.percentage.toFixed(0)}%`,
      description: `You're ${nearest.progress.percentage >= 75 ? 'very close to achieving' : 'making steady progress toward'} ${nearest.goal.name} — ${formatCurrency(nearest.progress.remainingAmount, currency)} left to target.`,
      tone: nearest.progress.percentage >= 75 ? 'positive' : 'info',
      metric: `${nearest.progress.percentage.toFixed(0)}%`,
      actionRoute: '/savings',
      actionLabel: 'Add money',
    });
  } else if (goals.length > 0) {
    insights.push({
      id: 'insight-all-goals-done',
      title: 'All active savings goals achieved',
      description: `Every tracked savings goal has reached 100% of its target. Consider setting your next milestone.`,
      tone: 'positive',
      metric: '100%',
      actionRoute: '/savings',
      actionLabel: 'New goal',
    });
  }

  // 4. Overall savings rate insight
  const comparison = getMonthlyComparison(transactions, referenceDate);
  if (comparison.currentIncome > 0) {
    const rate = comparison.currentSavingsRate;
    insights.push({
      id: 'insight-savings-rate',
      title:
        rate >= 20
          ? 'Strong monthly savings momentum'
          : rate > 0
            ? 'Positive net cash flow'
            : 'Monthly expenses exceed income',
      description:
        rate >= 0
          ? `You have retained ${formatCurrency(comparison.currentSavings, currency)} (${rate.toFixed(1)}% of monthly income) so far this month.`
          : `Expenses exceed monthly income by ${formatCurrency(Math.abs(comparison.currentSavings), currency)} this month.`,
      tone: rate >= 20 ? 'positive' : rate >= 0 ? 'info' : 'danger',
      metric: `${rate.toFixed(1)}%`,
      actionRoute: '/reports',
      actionLabel: 'Monthly report',
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'insight-empty',
      title: 'Ready for your financial activity',
      description:
        'Add income, expenses, budgets, or savings goals to unlock personalized rupee insights.',
      tone: 'info',
      actionRoute: '/transactions',
      actionLabel: 'Add transaction',
    });
  }

  return insights.slice(0, 4);
}

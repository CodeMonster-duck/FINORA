import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  PiggyBank,
  Wallet,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BudgetProgress } from '../components/BudgetProgress';
import { ChartCard } from '../components/ChartCard';
import { ChartTooltip } from '../components/ChartTooltip';
import { EmptyState } from '../components/EmptyState';
import { ExpenseForecastCard } from '../components/ExpenseForecastCard';
import { FinancialHealthCard } from '../components/FinancialHealthCard';
import { PageHeader } from '../components/PageHeader';
import { QuickActions } from '../components/QuickActions';
import { SmartInsightsCard } from '../components/SmartInsightsCard';
import { StatCard } from '../components/StatCard';
import { TransactionTable } from '../components/TransactionTable';
import { useFinance } from '../context/financeStore';
import { useBudgets } from '../hooks/useBudgets';
import { useSavingsGoals } from '../hooks/useSavingsGoals';
import { useTransactions } from '../hooks/useTransactions';
import {
  getFinancialHealthScore,
  getMonthlyTrends,
  getSmartInsights,
} from '../utils/calculations';
import { formatCurrency, getGreeting } from '../utils/formatters';

export function Dashboard() {
  const { settings, analytics } = useFinance();
  const { transactions, summary, loading } = useTransactions();
  const { utilizations, totals: budgetTotals } = useBudgets();
  const { savingsGoals } = useSavingsGoals();

  const [chartMonths, setChartMonths] = useState<3 | 6 | 12>(
    settings.preferences.defaultPeriod === '3M'
      ? 3
      : settings.preferences.defaultPeriod === '12M'
        ? 12
        : 6,
  );
  const [chartStyle, setChartStyle] = useState<'area' | 'bar'>('area');

  const currency = settings.preferences.currency;
  const compact = settings.preferences.compactNumbers;
  const firstName =
    settings.profile.name.split(/\s+/)[0] || settings.profile.name || 'there';
  const greeting = getGreeting();
  const todayReadable = format(new Date(), 'EEEE, dd MMMM yyyy');

  const trendData = useMemo(
    () =>
      analytics
        ? analytics.trends.slice(-chartMonths)
        : getMonthlyTrends(transactions, chartMonths),
    [analytics, transactions, chartMonths],
  );

  const healthScore = useMemo(
    () =>
      analytics?.healthScore ??
      getFinancialHealthScore(
        transactions,
        utilizations.map((u) => u.budget),
        savingsGoals,
      ),
    [analytics, transactions, utilizations, savingsGoals],
  );

  const insights = useMemo(
    () =>
      analytics?.insights ??
      getSmartInsights(
        transactions,
        utilizations.map((u) => u.budget),
        savingsGoals,
        new Date(),
        currency,
      ),
    [analytics, transactions, utilizations, savingsGoals, currency],
  );

  const recentTransactions = useMemo(() => transactions.slice(0, 6), [transactions]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="skeleton-box" style={{ height: '64px' }} />
        <div className="grid-4">
          <div className="skeleton-box" style={{ height: '140px' }} />
          <div className="skeleton-box" style={{ height: '140px' }} />
          <div className="skeleton-box" style={{ height: '140px' }} />
          <div className="skeleton-box" style={{ height: '140px' }} />
        </div>
        <div className="skeleton-box" style={{ height: '320px' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* A. Welcome Section */}
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle="Here's your financial overview. Take control of your money and understand every rupee."
        badge={<span className="badge badge-purple">Live Account</span>}
        actions={
          <div className="topbar-date-pill">
            <Calendar size={14} style={{ color: 'var(--accent-lavender)' }} />
            <span>{todayReadable}</span>
          </div>
        }
      />

      {/* B. Financial Summary Cards */}
      <section className="grid-4" aria-label="Financial Summary">
        <StatCard
          label="Total Balance"
          value={formatCurrency(summary.totalBalance, currency, { compact })}
          icon={<Wallet size={19} />}
          accentColor="var(--accent-lavender)"
          accentBg="var(--accent-soft)"
          trendPct={summary.comparison.savingsChangePct}
          trendLabel={`Net cash flow vs last month (${formatCurrency(summary.comparison.currentSavings, currency, { compact: true })})`}
        />

        <StatCard
          label="Monthly Income"
          value={formatCurrency(summary.monthlyIncome, currency, { compact })}
          icon={<ArrowDownLeft size={19} />}
          accentColor="var(--success)"
          accentBg="var(--success-soft)"
          trendPct={summary.comparison.incomeChangePct}
          trendLabel={`Prev month: ${formatCurrency(summary.comparison.previousIncome, currency, { compact: true })}`}
        />

        <StatCard
          label="Monthly Expenses"
          value={formatCurrency(summary.monthlyExpenses, currency, { compact })}
          icon={<ArrowUpRight size={19} />}
          accentColor="var(--danger)"
          accentBg="var(--danger-soft)"
          trendPct={summary.comparison.expenseChangePct}
          invertTrendColor
          trendLabel={`Prev month: ${formatCurrency(summary.comparison.previousExpenses, currency, { compact: true })}`}
        />

        <StatCard
          label="Savings Rate"
          value={`${summary.monthlySavingsRate.toFixed(1)}%`}
          icon={<PiggyBank size={19} />}
          accentColor="var(--info)"
          accentBg="var(--info-soft)"
          trendLabel={`${formatCurrency(summary.monthlySavings, currency, { compact })} saved this month`}
          footer={
            <div className="progress-track" style={{ height: '6px' }}>
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(100, Math.max(0, summary.monthlySavingsRate))}%`,
                  background:
                    summary.monthlySavingsRate >= 20
                      ? 'var(--success)'
                      : 'var(--accent-primary)',
                }}
              />
            </div>
          }
        />
      </section>

      {/* I. Quick Actions */}
      <QuickActions />

      {/* C & D. Financial Analytics & Spending Category Donut */}
      <section className="grid-dashboard-charts">
        <ChartCard
          title="Income vs Expenses"
          subtitle={`Cash flow comparison across the last ${chartMonths} months`}
          headerRight={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div className="segmented-control">
                {([3, 6, 12] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`segmented-btn ${chartMonths === m ? 'segmented-btn--active' : ''}`}
                    onClick={() => setChartMonths(m)}
                  >
                    {m}M
                  </button>
                ))}
              </div>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn ${chartStyle === 'area' ? 'segmented-btn--active' : ''}`}
                  onClick={() => setChartStyle('area')}
                >
                  Area
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${chartStyle === 'bar' ? 'segmented-btn--active' : ''}`}
                  onClick={() => setChartStyle('bar')}
                >
                  Bar
                </button>
              </div>
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={295}>
            {chartStyle === 'area' ? (
              <AreaChart
                data={trendData}
                margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="finoraIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.34} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="finoraExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.36} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="label"
                  stroke="var(--chart-axis)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--chart-axis)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    formatCurrency(Number(v), currency, { compact: true })
                  }
                />
                <Tooltip content={<ChartTooltip currency={currency} />} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Income"
                  stroke="#22C55E"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#finoraIncomeGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke="#8B5CF6"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#finoraExpenseGrad)"
                />
              </AreaChart>
            ) : (
              <BarChart
                data={trendData}
                margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="label"
                  stroke="var(--chart-axis)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--chart-axis)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    formatCurrency(Number(v), currency, { compact: true })
                  }
                />
                <Tooltip content={<ChartTooltip currency={currency} />} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar
                  dataKey="income"
                  name="Income"
                  fill="#22C55E"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="expenses"
                  name="Expenses"
                  fill="#8B5CF6"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Spending by Category"
          subtitle="Current month expense distribution"
        >
          {summary.categoryExpenses.length === 0 ? (
            <EmptyState
              icon={<Wallet size={20} />}
              title="No expenses this month"
              description="Add an expense transaction to visualize category breakdowns."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ position: 'relative', height: '205px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.categoryExpenses}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {summary.categoryExpenses.map((entry) => (
                        <Cell key={entry.category} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip currency={currency} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Month Spend
                  </span>
                  <strong className="tabular-nums" style={{ fontSize: '16px' }}>
                    {formatCurrency(summary.monthlyExpenses, currency, {
                      compact: true,
                    })}
                  </strong>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  paddingRight: '4px',
                }}
              >
                {summary.categoryExpenses.slice(0, 6).map((cat) => (
                  <div
                    key={cat.category}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12.5px',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span
                        style={{
                          width: '9px',
                          height: '9px',
                          borderRadius: '999px',
                          backgroundColor: cat.color,
                        }}
                      />
                      {cat.category}
                    </span>
                    <span className="tabular-nums" style={{ fontWeight: 600 }}>
                      {formatCurrency(cat.amount, currency)}{' '}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                        ({cat.percentage}%)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </section>

      {/* AI Expense Prediction & Burn-Rate Forecast */}
      <ExpenseForecastCard currency={currency} compact={compact} />

      {/* E & F. Recent Transactions & Budget Overview */}
      <section className="grid-dashboard-bottom">
        <section className="card card-purple-border">
          <div className="card-header">
            <div>
              <h2 className="card-title">Recent Transactions</h2>
              <p className="card-subtitle">
                Latest income credits and expense debits
              </p>
            </div>
            <Link to="/transactions" className="btn btn-ghost btn-sm">
              View all <ArrowRight size={14} />
            </Link>
          </div>

          <TransactionTable
            transactions={recentTransactions}
            currency={currency}
            dateFormat={settings.preferences.dateFormat}
            compact
          />
        </section>

        <section className="card card-purple-border">
          <div className="card-header">
            <div>
              <h2 className="card-title">Budget Overview</h2>
              <p className="card-subtitle">
                Current month utilization across configured categories
              </p>
            </div>
            <Link to="/budgets" className="btn btn-ghost btn-sm">
              Manage <ArrowRight size={14} />
            </Link>
          </div>

          {utilizations.length === 0 ? (
            <EmptyState
              icon={<Wallet size={20} />}
              title="No budgets configured"
              description="Create monthly category budgets to monitor spending thresholds."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: '10px',
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'var(--bg-secondary-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Total Budget
                  </span>
                  <div className="tabular-nums" style={{ fontWeight: 700, fontSize: '14px' }}>
                    {formatCurrency(budgetTotals.totalLimit, currency)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Spent
                  </span>
                  <div className="tabular-nums" style={{ fontWeight: 700, fontSize: '14px' }}>
                    {formatCurrency(budgetTotals.totalSpent, currency)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Remaining
                  </span>
                  <div
                    className="tabular-nums"
                    style={{
                      fontWeight: 700,
                      fontSize: '14px',
                      color:
                        budgetTotals.totalRemaining >= 0
                          ? 'var(--success)'
                          : 'var(--danger)',
                    }}
                  >
                    {formatCurrency(budgetTotals.totalRemaining, currency)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {utilizations.slice(0, 5).map((u) => (
                  <BudgetProgress
                    key={u.budget.id}
                    utilization={u}
                    currency={currency}
                    compact
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </section>

      {/* G & H. Financial Health Score & Smart Spending Insights */}
      <section className="grid-2">
        <FinancialHealthCard
          health={healthScore}
          showBreakdown={settings.preferences.showHealthScoreBreakdown}
        />
        <SmartInsightsCard insights={insights} />
      </section>
    </div>
  );
}

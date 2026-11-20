import { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CreditCard,
  Flame,
  PiggyBank,
  TrendingUp,
} from 'lucide-react';
import { format, parseISO, subMonths } from 'date-fns';
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
import { ChartCard } from '../components/ChartCard';
import { ChartTooltip } from '../components/ChartTooltip';
import { EmptyState } from '../components/EmptyState';
import { ExpenseForecastCard } from '../components/ExpenseForecastCard';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { useFinance } from '../context/financeStore';
import { useTransactions } from '../hooks/useTransactions';
import type { AnalyticsPeriod } from '../types';
import {
  fromPaise,
  getCategoryExpenses,
  getMonthlyTrends,
  getSavingsRate,
  getTotalExpenses,
  getTotalIncome,
  getWeeklySpending,
  toPaise,
} from '../utils/calculations';
import { formatCurrency } from '../utils/formatters';

export function Analytics() {
  const { settings, analytics } = useFinance();
  const { transactions } = useTransactions();
  const [period, setPeriod] = useState<AnalyticsPeriod>(
    settings.preferences.defaultPeriod,
  );

  const currency = settings.preferences.currency;
  const monthsCount =
    period === '3M' ? 3 : period === '6M' ? 6 : period === '12M' ? 12 : 12;

  const scopedTransactions = useMemo(() => {
    if (period === 'ALL') return transactions;
    const monthsBack = period === '3M' ? 3 : period === '6M' ? 6 : 12;
    const cutoff = format(subMonths(new Date(), monthsBack - 1), 'yyyy-MM-01');
    return transactions.filter((tx) => tx.date >= cutoff);
  }, [transactions, period]);

  const trends = useMemo(() => {
    if (period === 'ALL') {
      return getMonthlyTrends(transactions, 12);
    }
    return analytics
      ? analytics.trends.slice(-monthsCount)
      : getMonthlyTrends(transactions, monthsCount);
  }, [analytics, transactions, monthsCount, period]);

  const activeMonths = useMemo(() => {
    if (period === 'ALL') {
      const uniqueMonths = new Set(
        scopedTransactions.map((tx) => tx.date.slice(0, 7)),
      );
      return Array.from(uniqueMonths);
    }
    return trends.filter((m) => m.income > 0 || m.expenses > 0);
  }, [period, scopedTransactions, trends]);

  const categorySummary = useMemo(
    () => getCategoryExpenses(scopedTransactions),
    [scopedTransactions],
  );

  const weeklySpending = useMemo(
    () => analytics?.weekly ?? getWeeklySpending(transactions, 8),
    [analytics, transactions],
  );

  const stats = useMemo(() => {
    const totalIncome = getTotalIncome(scopedTransactions);
    const totalExpenses = getTotalExpenses(scopedTransactions);
    const savingsRate = getSavingsRate(totalIncome, totalExpenses);
    const divisor = Math.max(1, activeMonths.length);
    const avgMonthlyExpense = fromPaise(
      Math.round(toPaise(totalExpenses) / divisor),
    );
    const avgMonthlyIncome = fromPaise(
      Math.round(toPaise(totalIncome) / divisor),
    );
    const topCategory = categorySummary[0] ?? null;

    return {
      totalIncome,
      totalExpenses,
      savingsRate,
      avgMonthlyExpense,
      avgMonthlyIncome,
      topCategory,
    };
  }, [scopedTransactions, activeMonths.length, categorySummary]);

  const paymentMethodPatterns = useMemo(() => {
    const map = new Map<string, { paise: number; count: number }>();
    let weekdayPaise = 0;
    let weekendPaise = 0;

    for (const tx of scopedTransactions) {
      if (tx.type !== 'expense') continue;
      const p = toPaise(tx.amount);
      const prev = map.get(tx.paymentMethod) ?? { paise: 0, count: 0 };
      map.set(tx.paymentMethod, { paise: prev.paise + p, count: prev.count + 1 });

      const d = parseISO(tx.date);
      const day = d.getDay();
      if (day === 0 || day === 6) weekendPaise += p;
      else weekdayPaise += p;
    }

    const methods = Array.from(map.entries())
      .map(([method, data]) => ({
        method,
        amount: fromPaise(data.paise),
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    const totalWeekday = fromPaise(weekdayPaise);
    const totalWeekend = fromPaise(weekendPaise);

    return { methods, totalWeekday, totalWeekend };
  }, [scopedTransactions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <PageHeader
        title="Financial Analytics"
        subtitle="Deep trend analysis across income velocity, category allocation, and weekly habits."
        actions={
          <div className="segmented-control" role="group" aria-label="Analytics period">
            {(['3M', '6M', '12M', 'ALL'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`segmented-btn ${period === p ? 'segmented-btn--active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p === 'ALL' ? 'All Time' : p}
              </button>
            ))}
          </div>
        }
      />

      {/* Highlight KPI Cards */}
      <section className="grid-4">
        <StatCard
          label="Highest Spend Category"
          value={stats.topCategory ? stats.topCategory.category : '—'}
          icon={<Flame size={19} />}
          accentColor="var(--danger)"
          accentBg="var(--danger-soft)"
          trendLabel={
            stats.topCategory
              ? `${formatCurrency(stats.topCategory.amount, currency)} (${stats.topCategory.percentage}% of spend)`
              : 'No expenses recorded'
          }
        />

        <StatCard
          label="Avg Monthly Expenses"
          value={formatCurrency(stats.avgMonthlyExpense, currency)}
          icon={<Activity size={19} />}
          accentColor="var(--accent-lavender)"
          accentBg="var(--accent-soft)"
          trendLabel={`Across ${activeMonths.length || 1} active month(s)`}
        />

        <StatCard
          label="Avg Monthly Income"
          value={formatCurrency(stats.avgMonthlyIncome, currency)}
          icon={<TrendingUp size={19} />}
          accentColor="var(--success)"
          accentBg="var(--success-soft)"
          trendLabel={`Total period: ${formatCurrency(stats.totalIncome, currency, { compact: true })}`}
        />

        <StatCard
          label="Period Savings Rate"
          value={`${stats.savingsRate.toFixed(1)}%`}
          icon={<PiggyBank size={19} />}
          accentColor="var(--info)"
          accentBg="var(--info-soft)"
          trendLabel={`Retained: ${formatCurrency(stats.totalIncome - stats.totalExpenses, currency, { compact: true })}`}
        />
      </section>

      {transactions.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={22} />}
          title="No analytics data available yet"
          description="Record income and expense transactions to generate trend charts and spending pattern insights."
        />
      ) : (
        <>
          {/* Row 1: Monthly Income & Expense Trends + Monthly Comparison */}
          <section className="grid-2">
            <ChartCard
              title="Monthly Income & Expense Trends"
              subtitle="Trajectory of inflows vs outflows over time"
            >
              <ResponsiveContainer width="100%" height={290}>
                <AreaChart data={trends}>
                  <defs>
                    <linearGradient id="anaIncGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="anaExpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F87171" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#F87171" stopOpacity={0} />
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
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area
                    type="monotone"
                    dataKey="income"
                    name="Income"
                    stroke="#22C55E"
                    strokeWidth={2.5}
                    fill="url(#anaIncGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="#F87171"
                    strokeWidth={2.5}
                    fill="url(#anaExpGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Monthly Comparison"
              subtitle="Income vs Expenses vs Net Savings per month"
            >
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={trends}>
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
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    dataKey="income"
                    name="Income"
                    fill="#22C55E"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={22}
                  />
                  <Bar
                    dataKey="expenses"
                    name="Expenses"
                    fill="#8B5CF6"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={22}
                  />
                  <Bar
                    dataKey="savings"
                    name="Net Savings"
                    fill="#38BDF8"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>

          {/* Row 2: Weekly Spending + Category Distribution */}
          <section className="grid-2">
            <ChartCard
              title="Weekly Spending Velocity"
              subtitle="Total expenses across the past 8 weeks"
            >
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={weeklySpending}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="weekLabel"
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
                  <Bar
                    dataKey="amount"
                    name="Weekly Spend"
                    fill="#A855F7"
                    radius={[7, 7, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Category Distribution"
              subtitle={`Ranked expense share for selected period (${period})`}
            >
              {categorySummary.length === 0 ? (
                <EmptyState
                  icon={<BarChart3 size={20} />}
                  title="No expenses in range"
                  description="Switch to a wider period to examine category share."
                />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(160px, 0.85fr) minmax(0, 1.15fr)',
                    gap: '14px',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ height: '240px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categorySummary}
                          dataKey="amount"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={78}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {categorySummary.map((entry) => (
                            <Cell key={entry.category} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip currency={currency} />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      maxHeight: '250px',
                      overflowY: 'auto',
                      paddingRight: '4px',
                    }}
                  >
                    {categorySummary.map((cat) => (
                      <div key={cat.category}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '12.5px',
                            marginBottom: '4px',
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{cat.category}</span>
                          <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                            {formatCurrency(cat.amount, currency)} ({cat.percentage}%)
                          </span>
                        </div>
                        <div className="progress-track" style={{ height: '6px' }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${cat.percentage}%`,
                              backgroundColor: cat.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>
          </section>

          {/* Row 3: Spending Patterns (Payment Channels & Weekday vs Weekend) */}
          <section className="grid-2">
            <section className="card card-purple-border">
              <div className="card-header">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CreditCard size={17} style={{ color: 'var(--accent-lavender)' }} />
                    <h2 className="card-title">Payment Channel Mix</h2>
                  </div>
                  <p className="card-subtitle">
                    Expense distribution across UPI, Cards, Bank Transfer &amp; Cash
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {paymentMethodPatterns.methods.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    No expense payments recorded in this period.
                  </p>
                ) : (
                  paymentMethodPatterns.methods.map((pm) => {
                    const share =
                      stats.totalExpenses > 0
                        ? Math.round((pm.amount / stats.totalExpenses) * 1000) / 10
                        : 0;
                    return (
                      <div key={pm.method}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '13px',
                            marginBottom: '5px',
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            {pm.method}{' '}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                              ({pm.count} tx)
                            </span>
                          </span>
                          <span className="tabular-nums" style={{ fontWeight: 700 }}>
                            {formatCurrency(pm.amount, currency)} · {share}%
                          </span>
                        </div>
                        <div className="progress-track" style={{ height: '7px' }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${share}%`,
                              backgroundColor: 'var(--accent-primary)',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="card card-purple-border">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Weekday vs Weekend Spending Pattern</h2>
                  <p className="card-subtitle">
                    Compare routine Mon–Fri expenses against Sat–Sun discretionary spend
                  </p>
                </div>
              </div>

              {(() => {
                const total =
                  paymentMethodPatterns.totalWeekday +
                  paymentMethodPatterns.totalWeekend;
                const weekdayPct =
                  total > 0
                    ? Math.round(
                        (paymentMethodPatterns.totalWeekday / total) * 1000,
                      ) / 10
                    : 0;
                const weekendPct =
                  total > 0 ? Math.round((100 - weekdayPct) * 10) / 10 : 0;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="grid-2">
                      <div
                        style={{
                          padding: '14px',
                          borderRadius: '12px',
                          background: 'var(--bg-secondary-surface)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Weekdays (Mon–Fri)
                        </span>
                        <div
                          className="tabular-nums"
                          style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px' }}
                        >
                          {formatCurrency(paymentMethodPatterns.totalWeekday, currency)}
                        </div>
                        <span className="badge badge-purple" style={{ marginTop: '6px' }}>
                          {weekdayPct}% of spend
                        </span>
                      </div>

                      <div
                        style={{
                          padding: '14px',
                          borderRadius: '12px',
                          background: 'var(--bg-secondary-surface)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Weekends (Sat–Sun)
                        </span>
                        <div
                          className="tabular-nums"
                          style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px' }}
                        >
                          {formatCurrency(paymentMethodPatterns.totalWeekend, currency)}
                        </div>
                        <span className="badge badge-info" style={{ marginTop: '6px' }}>
                          {weekendPct}% of spend
                        </span>
                      </div>
                    </div>

                    <div className="progress-track" style={{ height: '12px', display: 'flex' }}>
                      <div
                        style={{
                          width: `${weekdayPct}%`,
                          backgroundColor: 'var(--accent-primary)',
                          height: '100%',
                        }}
                      />
                      <div
                        style={{
                          width: `${weekendPct}%`,
                          backgroundColor: 'var(--info)',
                          height: '100%',
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </section>
          </section>

          {/* AI Expense Prediction & Burn-Rate Forecast */}
          <ExpenseForecastCard currency={currency} />
        </>
      )}
    </div>
  );
}

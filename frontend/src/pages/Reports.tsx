import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Filter } from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';
import toast from 'react-hot-toast';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { TransactionTable } from '../components/TransactionTable';
import { useFinance } from '../context/financeStore';
import { useSavingsGoals } from '../hooks/useSavingsGoals';
import { useTransactions } from '../hooks/useTransactions';
import { extractApiError } from '../services/api';
import { financeService } from '../services/financeService';
import type { TransactionCategory } from '../types';
import {
  fromPaise,
  getCategoryExpenses,
  getCurrentBalance,
  getSavingsRate,
  getTotalExpenses,
  getTotalIncome,
  toPaise,
} from '../utils/calculations';
import { downloadCsvFile, formatCurrency } from '../utils/formatters';

type ReportRangePreset =
  | 'this-month'
  | 'last-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'all'
  | 'custom';

type ReportTab = 'summary' | 'income' | 'expenses' | 'savings' | 'history';

export function Reports() {
  const { settings } = useFinance();
  const { transactions } = useTransactions();
  const { goalsWithProgress, totals: goalTotals } = useSavingsGoals();

  const [rangePreset, setRangePreset] = useState<ReportRangePreset>('this-month');
  const [customStart, setCustomStart] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  );
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeTab, setActiveTab] = useState<ReportTab>('summary');

  const currency = settings.preferences.currency;
  const dateFormat = settings.preferences.dateFormat;

  const scopedTransactions = useMemo(() => {
    const today = new Date();
    const thisMonthPrefix = format(today, 'yyyy-MM');
    const lastMonthPrefix = format(subMonths(today, 1), 'yyyy-MM');
    const threeMonthsStart = format(subMonths(startOfMonth(today), 2), 'yyyy-MM-dd');
    const sixMonthsStart = format(subMonths(startOfMonth(today), 5), 'yyyy-MM-dd');

    return transactions.filter((tx) => {
      switch (rangePreset) {
        case 'this-month':
          return tx.date.startsWith(thisMonthPrefix);
        case 'last-month':
          return tx.date.startsWith(lastMonthPrefix);
        case 'last-3-months':
          return tx.date >= threeMonthsStart;
        case 'last-6-months':
          return tx.date >= sixMonthsStart;
        case 'custom':
          if (customStart && tx.date < customStart) return false;
          if (customEnd && tx.date > customEnd) return false;
          return true;
        case 'all':
        default:
          return true;
      }
    });
  }, [transactions, rangePreset, customStart, customEnd]);

  const totalIncome = useMemo(
    () => getTotalIncome(scopedTransactions),
    [scopedTransactions],
  );
  const totalExpenses = useMemo(
    () => getTotalExpenses(scopedTransactions),
    [scopedTransactions],
  );
  const netBalance = useMemo(
    () => getCurrentBalance(scopedTransactions),
    [scopedTransactions],
  );
  const savingsRate = useMemo(
    () => getSavingsRate(totalIncome, totalExpenses),
    [totalIncome, totalExpenses],
  );

  const incomeByCategory = useMemo(() => {
    const map = new Map<TransactionCategory, { paise: number; count: number }>();
    let totalPaise = 0;
    for (const tx of scopedTransactions) {
      if (tx.type !== 'income') continue;
      const p = toPaise(tx.amount);
      totalPaise += p;
      const prev = map.get(tx.category) ?? { paise: 0, count: 0 };
      map.set(tx.category, { paise: prev.paise + p, count: prev.count + 1 });
    }
    return Array.from(map.entries())
      .map(([category, v]) => ({
        category,
        amount: fromPaise(v.paise),
        count: v.count,
        share: totalPaise > 0 ? Math.round((v.paise / totalPaise) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [scopedTransactions]);

  const expenseByCategory = useMemo(
    () => getCategoryExpenses(scopedTransactions),
    [scopedTransactions],
  );

  const [exportingCsv, setExportingCsv] = useState(false);

  const dateBounds = useMemo(() => {
    const today = new Date();
    switch (rangePreset) {
      case 'this-month':
        return {
          startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd'),
        };
      case 'last-month': {
        const lm = subMonths(today, 1);
        const lmStart = format(startOfMonth(lm), 'yyyy-MM-dd');
        const lmEnd = format(
          new Date(lm.getFullYear(), lm.getMonth() + 1, 0),
          'yyyy-MM-dd',
        );
        return { startDate: lmStart, endDate: lmEnd };
      }
      case 'last-3-months':
        return {
          startDate: format(subMonths(startOfMonth(today), 2), 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd'),
        };
      case 'last-6-months':
        return {
          startDate: format(subMonths(startOfMonth(today), 5), 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd'),
        };
      case 'custom':
        return {
          startDate: customStart || undefined,
          endDate: customEnd || undefined,
        };
      case 'all':
      default:
        return { startDate: undefined, endDate: undefined };
    }
  }, [rangePreset, customStart, customEnd]);

  const handleExportTransactionsCsv = async () => {
    if (scopedTransactions.length === 0) {
      toast.error('No transactions in the selected date range to export.');
      return;
    }

    setExportingCsv(true);
    try {
      await financeService.downloadTransactionsCsv(dateBounds);
      toast.success(
        `Exported ${scopedTransactions.length} transaction(s) from backend CSV report.`,
      );
    } catch (err) {
      toast.error(extractApiError(err).message);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportCategorySummaryCsv = () => {
    if (expenseByCategory.length === 0 && incomeByCategory.length === 0) {
      toast.error('No category records available to export.');
      return;
    }

    const header = ['Flow Type', 'Category', 'Transactions Count', 'Total Amount', 'Currency', 'Share (%)'];
    const incomeRows = incomeByCategory.map((item) => [
      'Income',
      item.category,
      String(item.count),
      item.amount.toFixed(2),
      currency,
      item.share.toFixed(1),
    ]);
    const expenseRows = expenseByCategory.map((item) => [
      'Expense',
      item.category,
      String(item.count),
      item.amount.toFixed(2),
      currency,
      item.percentage.toFixed(1),
    ]);

    const fileName = `finora-category-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    downloadCsvFile(fileName, [header, ...incomeRows, ...expenseRows]);
    toast.success(`Downloaded ${fileName}.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <PageHeader
        title="Financial Reports"
        subtitle="Audit income, expenses, category share, savings progress, and export clean CSV statements."
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCategorySummaryCsv}
            >
              <Download size={15} />
              Export Category CSV
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={exportingCsv}
              onClick={() => void handleExportTransactionsCsv()}
            >
              <Download size={15} />
              {exportingCsv ? 'Exporting...' : 'Export Transactions CSV'}
            </button>
          </>
        }
      />

      {/* Date Range Filter */}
      <section className="card card-purple-border">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} style={{ color: 'var(--accent-lavender)' }} />
            <span style={{ fontWeight: 700, fontSize: '14px' }}>Report Period</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <div className="segmented-control">
              {(
                [
                  { id: 'this-month', label: 'This Month' },
                  { id: 'last-month', label: 'Last Month' },
                  { id: 'last-3-months', label: '3M' },
                  { id: 'last-6-months', label: '6M' },
                  { id: 'all', label: 'All Time' },
                  { id: 'custom', label: 'Custom' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`segmented-btn ${
                    rangePreset === item.id ? 'segmented-btn--active' : ''
                  }`}
                  onClick={() => setRangePreset(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {rangePreset === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: 'auto', padding: '6px 10px' }}
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  aria-label="Report start date"
                />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: 'auto', padding: '6px 10px' }}
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  aria-label="Report end date"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Financial Statement Summary */}
      <section className="grid-4">
        <div className="card card-purple-border">
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Income</span>
          <div
            className="tabular-nums"
            style={{ fontSize: '23px', fontWeight: 800, color: 'var(--success)', marginTop: '5px' }}
          >
            {formatCurrency(totalIncome, currency)}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {scopedTransactions.filter((t) => t.type === 'income').length} credit entries
          </span>
        </div>

        <div className="card card-purple-border">
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Expenses</span>
          <div
            className="tabular-nums"
            style={{ fontSize: '23px', fontWeight: 800, color: 'var(--danger)', marginTop: '5px' }}
          >
            {formatCurrency(totalExpenses, currency)}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {scopedTransactions.filter((t) => t.type === 'expense').length} debit entries
          </span>
        </div>

        <div className="card card-purple-border">
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Net Surplus</span>
          <div
            className="tabular-nums"
            style={{
              fontSize: '23px',
              fontWeight: 800,
              color: netBalance >= 0 ? 'var(--accent-lavender)' : 'var(--danger)',
              marginTop: '5px',
            }}
          >
            {formatCurrency(netBalance, currency, { showSign: true })}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Savings rate: {savingsRate.toFixed(1)}%
          </span>
        </div>

        <div className="card card-purple-border">
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Goal Corpus</span>
          <div
            className="tabular-nums"
            style={{ fontSize: '23px', fontWeight: 800, color: 'var(--info)', marginTop: '5px' }}
          >
            {formatCurrency(goalTotals.totalSaved, currency)}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {goalTotals.overallPercentage.toFixed(1)}% of {formatCurrency(goalTotals.totalTarget, currency)}
          </span>
        </div>
      </section>

      {/* Report Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {(
          [
            { id: 'summary', label: 'Category-wise Report' },
            { id: 'income', label: 'Income Report' },
            { id: 'expenses', label: 'Expense Report' },
            { id: 'savings', label: 'Savings Summary' },
            { id: 'history', label: `Transaction History (${scopedTransactions.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`btn btn-sm ${
              activeTab === tab.id ? 'btn-primary' : 'btn-secondary'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report Body */}
      {activeTab === 'summary' && (
        <section className="grid-2">
          <div className="card card-purple-border">
            <div className="card-header">
              <div>
                <h2 className="card-title">Income Breakdown</h2>
                <p className="card-subtitle">Sources of funds in selected period</p>
              </div>
            </div>
            {incomeByCategory.length === 0 ? (
              <EmptyState
                icon={<FileSpreadsheet size={20} />}
                title="No income in this range"
                description="Try selecting a wider date window."
              />
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Entries</th>
                      <th>Share</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomeByCategory.map((item) => (
                      <tr key={item.category}>
                        <td style={{ fontWeight: 600 }}>{item.category}</td>
                        <td>{item.count}</td>
                        <td className="tabular-nums">{item.share}%</td>
                        <td
                          className="tabular-nums"
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: 'var(--success)',
                          }}
                        >
                          {formatCurrency(item.amount, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card card-purple-border">
            <div className="card-header">
              <div>
                <h2 className="card-title">Expense Breakdown</h2>
                <p className="card-subtitle">Category spend allocation in selected period</p>
              </div>
            </div>
            {expenseByCategory.length === 0 ? (
              <EmptyState
                icon={<FileSpreadsheet size={20} />}
                title="No expenses in this range"
                description="Try selecting a wider date window."
              />
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Entries</th>
                      <th>Share</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseByCategory.map((item) => (
                      <tr key={item.category}>
                        <td style={{ fontWeight: 600 }}>{item.category}</td>
                        <td>{item.count}</td>
                        <td className="tabular-nums">{item.percentage}%</td>
                        <td
                          className="tabular-nums"
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: 'var(--danger)',
                          }}
                        >
                          {formatCurrency(item.amount, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'income' && (
        <section className="card card-purple-border">
          <div className="card-header">
            <div>
              <h2 className="card-title">Income Ledger Report</h2>
              <p className="card-subtitle">
                All income credits recorded in the selected date range
              </p>
            </div>
          </div>
          <TransactionTable
            transactions={scopedTransactions.filter((tx) => tx.type === 'income')}
            currency={currency}
            dateFormat={dateFormat}
            compact
            emptyTitle="No income entries in range"
            emptyDescription="Adjust the report date range or record an income transaction."
          />
        </section>
      )}

      {activeTab === 'expenses' && (
        <section className="card card-purple-border">
          <div className="card-header">
            <div>
              <h2 className="card-title">Expense Ledger Report</h2>
              <p className="card-subtitle">
                All expense debits recorded in the selected date range
              </p>
            </div>
          </div>
          <TransactionTable
            transactions={scopedTransactions.filter((tx) => tx.type === 'expense')}
            currency={currency}
            dateFormat={dateFormat}
            compact
            emptyTitle="No expense entries in range"
            emptyDescription="Adjust the report date range or record an expense transaction."
          />
        </section>
      )}

      {activeTab === 'savings' && (
        <section className="card card-purple-border">
          <div className="card-header">
            <div>
              <h2 className="card-title">Savings Goals Statement</h2>
              <p className="card-subtitle">
                Status and progress across every savings milestone
              </p>
            </div>
          </div>
          {goalsWithProgress.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet size={20} />}
              title="No savings goals recorded"
              description="Create a savings goal to include it in your savings summary."
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Goal</th>
                    <th>Category</th>
                    <th>Saved</th>
                    <th>Target</th>
                    <th>Remaining</th>
                    <th style={{ textAlign: 'right' }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {goalsWithProgress.map(({ goal, progress }) => (
                    <tr key={goal.id}>
                      <td style={{ fontWeight: 600 }}>{goal.name}</td>
                      <td>
                        <span className="badge badge-neutral">{goal.category}</span>
                      </td>
                      <td className="tabular-nums" style={{ color: 'var(--success)', fontWeight: 600 }}>
                        {formatCurrency(progress.currentAmount, currency)}
                      </td>
                      <td className="tabular-nums">
                        {formatCurrency(progress.targetAmount, currency)}
                      </td>
                      <td className="tabular-nums">
                        {formatCurrency(progress.remainingAmount, currency)}
                      </td>
                      <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 700 }}>
                        {progress.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'history' && (
        <section className="card card-purple-border">
          <div className="card-header">
            <div>
              <h2 className="card-title">Export Preview — Transaction History</h2>
              <p className="card-subtitle">
                Exact records included when you click &ldquo;Export Transactions CSV&rdquo;
              </p>
            </div>
          </div>
          <TransactionTable
            transactions={scopedTransactions}
            currency={currency}
            dateFormat={dateFormat}
            compact
            emptyTitle="No transactions in selected period"
            emptyDescription="Choose a broader date preset to inspect historical rows."
          />
        </section>
      )}
    </div>
  );
}

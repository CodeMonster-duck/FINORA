import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { format, startOfMonth, subDays, subMonths } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { CategoryBadgeIcon } from '../components/CategoryIcon';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { TransactionFormModal } from '../components/TransactionFormModal';
import { TransactionTable } from '../components/TransactionTable';
import { useFinance } from '../context/financeStore';
import { useTransactions } from '../hooks/useTransactions';
import type { Transaction, TransactionType } from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../types';
import { getCurrentBalance, getTotalExpenses, getTotalIncome } from '../utils/calculations';
import { formatCurrency, formatDate } from '../utils/formatters';

type DatePreset = 'all' | 'this-month' | 'last-month' | 'last-30' | 'custom';
type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

const PAGE_SIZE = 10;

export function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useFinance();
  const { transactions, addTransaction, editTransaction, removeTransaction } =
    useTransactions();

  const searchQuery = searchParams.get('q') ?? '';
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('date-desc');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [formDefaultType, setFormDefaultType] = useState<TransactionType>('expense');
  const [editingTx, setEditingTx] = useState<Transaction | undefined>(undefined);
  const [viewingTx, setViewingTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  const setSearchQuery = (nextValue: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextValue) {
      nextParams.set('q', nextValue);
    } else {
      nextParams.delete('q');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const currency = settings.preferences.currency;
  const dateFormat = settings.preferences.dateFormat;

  const availableCategoryOptions = useMemo(() => {
    if (typeFilter === 'income') return [...INCOME_CATEGORIES];
    if (typeFilter === 'expense') return [...EXPENSE_CATEGORIES];
    return [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
  }, [typeFilter]);

  const filteredTransactions = useMemo(() => {
    const today = new Date();
    const thisMonthPrefix = format(today, 'yyyy-MM');
    const lastMonthPrefix = format(subMonths(today, 1), 'yyyy-MM');
    const last30Start = format(subDays(today, 30), 'yyyy-MM-dd');
    const q = searchQuery.trim().toLowerCase();

    const matched = transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;

      if (datePreset === 'this-month' && !tx.date.startsWith(thisMonthPrefix)) {
        return false;
      }
      if (datePreset === 'last-month' && !tx.date.startsWith(lastMonthPrefix)) {
        return false;
      }
      if (datePreset === 'last-30' && tx.date < last30Start) {
        return false;
      }
      if (datePreset === 'custom') {
        if (customStart && tx.date < customStart) return false;
        if (customEnd && tx.date > customEnd) return false;
      }

      if (q) {
        const hay = `${tx.title} ${tx.category} ${tx.description} ${tx.paymentMethod} ${tx.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    return [...matched].sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':
          return a.date.localeCompare(b.date);
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        case 'date-desc':
        default: {
          const d = b.date.localeCompare(a.date);
          return d !== 0 ? d : b.createdAt.localeCompare(a.createdAt);
        }
      }
    });
  }, [
    transactions,
    typeFilter,
    categoryFilter,
    datePreset,
    customStart,
    customEnd,
    searchQuery,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedTransactions = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, safePage]);

  const filteredIncome = useMemo(
    () => getTotalIncome(filteredTransactions),
    [filteredTransactions],
  );
  const filteredExpenses = useMemo(
    () => getTotalExpenses(filteredTransactions),
    [filteredTransactions],
  );
  const filteredNet = useMemo(
    () => getCurrentBalance(filteredTransactions),
    [filteredTransactions],
  );

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    typeFilter !== 'all' ||
    categoryFilter !== 'all' ||
    datePreset !== 'all';

  const clearAllFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setDatePreset('all');
    setCustomStart('');
    setCustomEnd('');
    setPage(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Transactions"
        subtitle="Manage every rupee earned and spent with instant search, filtering, and recalculation."
        actions={
          <>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => {
                setEditingTx(undefined);
                setFormDefaultType('income');
                setFormOpen(true);
              }}
            >
              <Plus size={16} />
              Add Income
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditingTx(undefined);
                setFormDefaultType('expense');
                setFormOpen(true);
              }}
            >
              <Plus size={16} />
              Add Expense
            </button>
          </>
        }
      />

      {/* Filtered Summary Strip */}
      <section className="grid-4">
        <div className="card" style={{ padding: '16px 18px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Matching Entries
          </span>
          <div className="tabular-nums" style={{ fontSize: '21px', fontWeight: 800, marginTop: '4px' }}>
            {filteredTransactions.length}
          </div>
        </div>
        <div className="card" style={{ padding: '16px 18px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Filtered Income
          </span>
          <div
            className="tabular-nums"
            style={{ fontSize: '21px', fontWeight: 800, marginTop: '4px', color: 'var(--success)' }}
          >
            {formatCurrency(filteredIncome, currency)}
          </div>
        </div>
        <div className="card" style={{ padding: '16px 18px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Filtered Expenses
          </span>
          <div
            className="tabular-nums"
            style={{ fontSize: '21px', fontWeight: 800, marginTop: '4px', color: 'var(--danger)' }}
          >
            {formatCurrency(filteredExpenses, currency)}
          </div>
        </div>
        <div className="card" style={{ padding: '16px 18px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Net Cash Flow
          </span>
          <div
            className="tabular-nums"
            style={{
              fontSize: '21px',
              fontWeight: 800,
              marginTop: '4px',
              color: filteredNet >= 0 ? 'var(--accent-lavender)' : 'var(--danger)',
            }}
          >
            {formatCurrency(filteredNet, currency, { showSign: true })}
          </div>
        </div>
      </section>

      {/* Filters & Sorting Toolbar */}
      <section className="card card-purple-border">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: '12px',
            alignItems: 'end',
          }}
        >
          <div className="form-field">
            <label className="form-label" htmlFor="tx-filter-search">
              Search Ledger
            </label>
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                id="tx-filter-search"
                type="search"
                className="form-input"
                style={{ paddingLeft: '36px' }}
                placeholder="Title, UPI, notes..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="tx-filter-type">
              Type
            </label>
            <select
              id="tx-filter-type"
              className="form-select"
              value={typeFilter}
              onChange={(e) => {
                const nextType = e.target.value as 'all' | TransactionType;
                setTypeFilter(nextType);
                setCategoryFilter('all');
                setPage(1);
              }}
            >
              <option value="all">All Types</option>
              <option value="income">Income Only</option>
              <option value="expense">Expense Only</option>
            </select>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="tx-filter-category">
              Category
            </label>
            <select
              id="tx-filter-category"
              className="form-select"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Categories</option>
              {availableCategoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="tx-filter-date">
              Date Range
            </label>
            <select
              id="tx-filter-date"
              className="form-select"
              value={datePreset}
              onChange={(e) => {
                const next = e.target.value as DatePreset;
                setDatePreset(next);
                if (next === 'custom' && !customStart) {
                  setCustomStart(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                  setCustomEnd(format(new Date(), 'yyyy-MM-dd'));
                }
                setPage(1);
              }}
            >
              <option value="all">All Time</option>
              <option value="this-month">This Month</option>
              <option value="last-month">Last Month</option>
              <option value="last-30">Last 30 Days</option>
              <option value="custom">Custom Dates</option>
            </select>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="tx-sort">
              Sort By
            </label>
            <div style={{ position: 'relative' }}>
              <ArrowUpDown
                size={14}
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <select
                id="tx-sort"
                className="form-select"
                style={{ paddingLeft: '32px' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
              >
                <option value="date-desc">Date (Newest first)</option>
                <option value="date-asc">Date (Oldest first)</option>
                <option value="amount-desc">Amount (High to low)</option>
                <option value="amount-asc">Amount (Low to high)</option>
              </select>
            </div>
          </div>
        </div>

        {datePreset === 'custom' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '14px',
              flexWrap: 'wrap',
            }}
          >
            <div className="form-field" style={{ minWidth: '170px' }}>
              <label className="form-label" htmlFor="tx-custom-start">
                From Date
              </label>
              <input
                id="tx-custom-start"
                type="date"
                className="form-input"
                value={customStart}
                onChange={(e) => {
                  setCustomStart(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="form-field" style={{ minWidth: '170px' }}>
              <label className="form-label" htmlFor="tx-custom-end">
                To Date
              </label>
              <input
                id="tx-custom-end"
                type="date"
                className="form-input"
                value={customEnd}
                onChange={(e) => {
                  setCustomEnd(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        )}

        {hasActiveFilters && (
          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={clearAllFilters}
            >
              <X size={14} /> Clear filters
            </button>
          </div>
        )}
      </section>

      {/* Main Transaction Table */}
      <section className="card card-purple-border">
        <TransactionTable
          transactions={paginatedTransactions}
          currency={currency}
          dateFormat={dateFormat}
          onView={(tx) => setViewingTx(tx)}
          onEdit={(tx) => {
            setEditingTx(tx);
            setFormDefaultType(tx.type);
            setFormOpen(true);
          }}
          onDelete={(tx) => setDeletingTx(tx)}
          emptyTitle={
            hasActiveFilters ? 'No matching transactions' : 'No transactions recorded'
          }
          emptyDescription={
            hasActiveFilters
              ? 'Try loosening your search query, category filter, or date range.'
              : 'Start tracking your finances by adding your first income or expense.'
          }
          emptyActionLabel={hasActiveFilters ? 'Clear filters' : 'Add Transaction'}
          onEmptyAction={
            hasActiveFilters
              ? clearAllFilters
              : () => {
                  setEditingTx(undefined);
                  setFormDefaultType('expense');
                  setFormOpen(true);
                }
          }
        />

        {filteredTransactions.length > PAGE_SIZE && (
          <div
            style={{
              marginTop: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredTransactions.length)} of{' '}
              {filteredTransactions.length} entries
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={15} /> Prev
              </button>
              <span
                className="tabular-nums"
                style={{ fontSize: '13px', fontWeight: 600, padding: '0 6px' }}
              >
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Add / Edit Transaction Modal */}
      <TransactionFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingTx(undefined);
        }}
        defaultType={formDefaultType}
        editingTransaction={editingTx}
        onSubmit={(input) =>
          editingTx
            ? editTransaction(editingTx.id, input)
            : addTransaction(input)
        }
      />

      {/* Transaction Details Modal */}
      <Modal
        isOpen={Boolean(viewingTx)}
        onClose={() => setViewingTx(null)}
        title="Transaction Details"
        subtitle="Full ledger entry audit view"
      >
        {viewingTx && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '16px',
                borderRadius: '14px',
                background: 'var(--bg-secondary-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CategoryBadgeIcon category={viewingTx.category} size={20} />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>{viewingTx.title}</h3>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    {viewingTx.category} · {viewingTx.paymentMethod}
                  </span>
                </div>
              </div>
              <div
                className="tabular-nums"
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color:
                    viewingTx.type === 'income' ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {viewingTx.type === 'income' ? '+' : '-'}
                {formatCurrency(viewingTx.amount, currency)}
              </div>
            </div>

            <div className="form-grid" style={{ gap: '12px' }}>
              <div>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Date</span>
                <div style={{ fontWeight: 600 }}>{formatDate(viewingTx.date, dateFormat)}</div>
              </div>
              <div>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Status</span>
                <div style={{ marginTop: '2px' }}>
                  <span
                    className={`badge ${
                      viewingTx.status === 'completed' ? 'badge-purple' : 'badge-warning'
                    }`}
                  >
                    {viewingTx.status}
                  </span>
                </div>
              </div>
              <div className="form-field--full">
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Description
                </span>
                <div style={{ color: 'var(--text-primary)' }}>
                  {viewingTx.description || '—'}
                </div>
              </div>
              {viewingTx.notes && (
                <div className="form-field--full">
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Notes
                  </span>
                  <div style={{ color: 'var(--text-secondary)' }}>{viewingTx.notes}</div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const tx = viewingTx;
                  setViewingTx(null);
                  setEditingTx(tx);
                  setFormDefaultType(tx.type);
                  setFormOpen(true);
                }}
              >
                Edit Entry
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setViewingTx(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingTx)}
        onClose={() => setDeletingTx(null)}
        title="Delete Transaction?"
        subtitle="Balances, analytics, and category budgets will recalculate immediately."
      >
        {deletingTx && (
          <>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Are you sure you want to delete{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {deletingTx.title}
              </strong>{' '}
              ({formatCurrency(deletingTx.amount, currency)})?
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeletingTx(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  await removeTransaction(deletingTx.id);
                  setDeletingTx(null);
                }}
              >
                Delete Transaction
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

import { Edit3, Eye, ReceiptText, Trash2 } from 'lucide-react';
import type { CurrencyCode, DateFormatOption, Transaction } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { CategoryBadgeIcon } from './CategoryIcon';
import { EmptyState } from './EmptyState';

interface TransactionTableProps {
  transactions: readonly Transaction[];
  currency?: CurrencyCode;
  dateFormat?: DateFormatOption;
  compact?: boolean;
  onEdit?: (tx: Transaction) => void;
  onDelete?: (tx: Transaction) => void;
  onView?: (tx: Transaction) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

export function TransactionTable({
  transactions,
  currency = 'INR',
  dateFormat = 'DD MMM YYYY',
  compact = false,
  onEdit,
  onDelete,
  onView,
  emptyTitle = 'No transactions found',
  emptyDescription = 'Record an income or expense entry to see your transaction ledger here.',
  emptyActionLabel,
  onEmptyAction,
}: TransactionTableProps) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptText size={22} />}
        title={emptyTitle}
        description={emptyDescription}
        action={
          emptyActionLabel && onEmptyAction ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onEmptyAction}
            >
              {emptyActionLabel}
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Category</th>
            <th>Date</th>
            <th>Type</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
            <th>Status</th>
            {!compact && <th style={{ textAlign: 'right' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const isIncome = tx.type === 'income';
            return (
              <tr key={tx.id}>
                <td>
                  <div className="tx-cell-main">
                    <CategoryBadgeIcon category={tx.category} />
                    <div style={{ minWidth: 0 }}>
                      <div className="tx-title-text">{tx.title}</div>
                      <div className="tx-sub-text">
                        {tx.paymentMethod}
                        {!compact && tx.description ? ` · ${tx.description.slice(0, 40)}${tx.description.length > 40 ? '…' : ''}` : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="badge badge-neutral">{tx.category}</span>
                </td>
                <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {formatDate(tx.date, dateFormat)}
                </td>
                <td>
                  <span
                    className={`badge ${isIncome ? 'badge-success' : 'badge-danger'}`}
                  >
                    {isIncome ? 'Income' : 'Expense'}
                  </span>
                </td>
                <td
                  className="tabular-nums"
                  style={{
                    textAlign: 'right',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    color: isIncome ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {isIncome ? '+' : '-'}
                  {formatCurrency(tx.amount, currency)}
                </td>
                <td>
                  <span
                    className={`badge ${
                      tx.status === 'completed' ? 'badge-purple' : 'badge-warning'
                    }`}
                  >
                    {tx.status === 'completed' ? 'Completed' : 'Pending'}
                  </span>
                </td>
                {!compact && (
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {onView && (
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: '32px', height: '32px' }}
                          onClick={() => onView(tx)}
                          aria-label={`View details for ${tx.title}`}
                          title="View details"
                        >
                          <Eye size={14} />
                        </button>
                      )}
                      {onEdit && (
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: '32px', height: '32px' }}
                          onClick={() => onEdit(tx)}
                          aria-label={`Edit ${tx.title}`}
                          title="Edit"
                        >
                          <Edit3 size={14} />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          className="icon-btn"
                          style={{
                            width: '32px',
                            height: '32px',
                            color: 'var(--danger)',
                          }}
                          onClick={() => onDelete(tx)}
                          aria-label={`Delete ${tx.title}`}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

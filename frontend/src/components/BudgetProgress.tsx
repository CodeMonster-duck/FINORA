import { AlertTriangle, CheckCircle2, Edit3, Flame, Trash2 } from 'lucide-react';
import type { BudgetUtilization, CurrencyCode } from '../types';
import { formatCurrency } from '../utils/formatters';
import { CategoryBadgeIcon } from './CategoryIcon';

interface BudgetProgressProps {
  utilization: BudgetUtilization;
  currency?: CurrencyCode;
  compact?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function BudgetProgress({
  utilization,
  currency = 'INR',
  compact = false,
  onEdit,
  onDelete,
}: BudgetProgressProps) {
  const { budget, spent, remaining, utilizationPercentage, status, transactionCount } =
    utilization;

  const clampedWidth = Math.min(100, Math.max(0, utilizationPercentage));

  const barColor =
    status === 'exceeded'
      ? 'var(--danger)'
      : status === 'approaching'
        ? 'var(--warning)'
        : 'var(--accent-primary)';

  const badge =
    status === 'exceeded' ? (
      <span className="badge badge-danger">
        <Flame size={12} /> Exceeded
      </span>
    ) : status === 'approaching' ? (
      <span className="badge badge-warning">
        <AlertTriangle size={12} /> Approaching
      </span>
    ) : (
      <span className="badge badge-success">
        <CheckCircle2 size={12} /> On Track
      </span>
    );

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '13.5px' }}>
              {budget.category}
            </span>
            {badge}
          </div>
          <span
            className="tabular-nums"
            style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}
          >
            <strong style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(spent, currency)}
            </strong>{' '}
            / {formatCurrency(budget.limit, currency)}
          </span>
        </div>

        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${clampedWidth}%`, backgroundColor: barColor }}
          />
        </div>
      </div>
    );
  }

  return (
    <article className="card card-purple-border card-interactive">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CategoryBadgeIcon category={budget.category} />
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 700 }}>{budget.category}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {transactionCount} expense{transactionCount === 1 ? '' : 's'} · Alert at{' '}
              {budget.alertThreshold}%
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {badge}
          {onEdit && (
            <button
              type="button"
              className="icon-btn"
              style={{ width: '32px', height: '32px' }}
              onClick={onEdit}
              aria-label={`Edit ${budget.category} budget`}
            >
              <Edit3 size={14} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="icon-btn"
              style={{ width: '32px', height: '32px', color: 'var(--danger)' }}
              onClick={onDelete}
              aria-label={`Delete ${budget.category} budget`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: '18px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '8px',
          }}
        >
          <span
            className="tabular-nums"
            style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}
          >
            {formatCurrency(spent, currency)}
            <span
              style={{
                fontSize: '12.5px',
                fontWeight: 500,
                color: 'var(--text-muted)',
                marginLeft: '6px',
              }}
            >
              of {formatCurrency(budget.limit, currency)}
            </span>
          </span>
          <span
            className="tabular-nums"
            style={{ fontSize: '13.5px', fontWeight: 700, color: barColor }}
          >
            {utilizationPercentage.toFixed(1)}%
          </span>
        </div>

        <div className="progress-track" style={{ height: '10px' }}>
          <div
            className="progress-fill"
            style={{ width: `${clampedWidth}%`, backgroundColor: barColor }}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: '14px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          fontSize: '12.5px',
        }}
      >
        <span style={{ color: 'var(--text-secondary)' }}>
          {remaining >= 0 ? 'Remaining' : 'Over budget by'}
        </span>
        <span
          className="tabular-nums"
          style={{
            fontWeight: 700,
            color: remaining >= 0 ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {formatCurrency(Math.abs(remaining), currency)}
        </span>
      </div>

      {budget.notes && (
        <p
          style={{
            marginTop: '8px',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          {budget.notes}
        </p>
      )}
    </article>
  );
}

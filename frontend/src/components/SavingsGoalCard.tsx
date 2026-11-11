import {
  Calendar,
  CheckCircle2,
  Edit3,
  History,
  Plus,
  Trash2,
} from 'lucide-react';
import type { CurrencyCode, DateFormatOption, SavingsGoal, SavingsProgress } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { CategoryIcon } from './CategoryIcon';

interface SavingsGoalCardProps {
  goal: SavingsGoal;
  progress: SavingsProgress;
  currency?: CurrencyCode;
  dateFormat?: DateFormatOption;
  onAddMoney: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
}

export function SavingsGoalCard({
  goal,
  progress,
  currency = 'INR',
  dateFormat = 'DD MMM YYYY',
  onAddMoney,
  onEdit,
  onDelete,
  onViewHistory,
}: SavingsGoalCardProps) {
  const priorityTone =
    goal.priority === 'high'
      ? 'badge-purple'
      : goal.priority === 'medium'
        ? 'badge-info'
        : 'badge-neutral';

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
          <span
            className="tx-cat-icon-box"
            style={{
              backgroundColor: progress.isCompleted
                ? 'var(--success-soft)'
                : 'var(--accent-soft)',
              color: progress.isCompleted
                ? 'var(--success)'
                : 'var(--accent-lavender)',
            }}
          >
            <CategoryIcon category={goal.category} size={18} />
          </span>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>{goal.name}</h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '4px',
                flexWrap: 'wrap',
              }}
            >
              <span className={`badge ${priorityTone}`}>
                {goal.priority.charAt(0).toUpperCase() + goal.priority.slice(1)} priority
              </span>
              {progress.isCompleted && (
                <span className="badge badge-success">
                  <CheckCircle2 size={12} /> Completed
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            className="icon-btn"
            style={{ width: '32px', height: '32px' }}
            onClick={onViewHistory}
            aria-label={`Contribution history for ${goal.name}`}
            title="Contribution history"
          >
            <History size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            style={{ width: '32px', height: '32px' }}
            onClick={onEdit}
            aria-label={`Edit ${goal.name}`}
          >
            <Edit3 size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            style={{ width: '32px', height: '32px', color: 'var(--danger)' }}
            onClick={onDelete}
            aria-label={`Delete ${goal.name}`}
          >
            <Trash2 size={14} />
          </button>
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
            style={{ fontSize: '21px', fontWeight: 800, color: 'var(--text-primary)' }}
          >
            {formatCurrency(progress.currentAmount, currency)}
            <span
              style={{
                fontSize: '12.5px',
                fontWeight: 500,
                color: 'var(--text-muted)',
                marginLeft: '6px',
              }}
            >
              / {formatCurrency(progress.targetAmount, currency)}
            </span>
          </span>
          <span
            className="tabular-nums"
            style={{
              fontSize: '13.5px',
              fontWeight: 700,
              color: progress.isCompleted
                ? 'var(--success)'
                : 'var(--accent-lavender)',
            }}
          >
            {progress.percentage.toFixed(1)}%
          </span>
        </div>

        <div className="progress-track" style={{ height: '10px' }}>
          <div
            className="progress-fill"
            style={{
              width: `${progress.percentage}%`,
              background: progress.isCompleted
                ? 'var(--success)'
                : 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
            }}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: '14px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px',
          padding: '10px 12px',
          borderRadius: '11px',
          background: 'var(--bg-secondary-surface)',
          fontSize: '12.5px',
        }}
      >
        <div>
          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>
            Remaining
          </span>
          <strong className="tabular-nums">
            {progress.isCompleted
              ? 'Target reached'
              : formatCurrency(progress.remainingAmount, currency)}
          </strong>
        </div>

        <div>
          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>
            Target Date
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontWeight: 600,
            }}
          >
            <Calendar size={12} style={{ color: 'var(--accent-lavender)' }} />
            {formatDate(goal.targetDate, dateFormat)}
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {progress.isCompleted
            ? `${goal.contributions.length} contribution(s) logged`
            : progress.daysRemaining >= 0
              ? `${progress.daysRemaining} days left`
              : `${Math.abs(progress.daysRemaining)} days past target`}
        </span>

        <button
          type="button"
          className={`btn btn-sm ${progress.isCompleted ? 'btn-secondary' : 'btn-primary'}`}
          onClick={onAddMoney}
          disabled={progress.isCompleted}
        >
          <Plus size={14} />
          {progress.isCompleted ? 'Goal Completed' : 'Add Money'}
        </button>
      </div>
    </article>
  );
}

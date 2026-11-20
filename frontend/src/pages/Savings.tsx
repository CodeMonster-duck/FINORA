import { useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Target } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SavingsCoachSection } from '../components/SavingsCoachSection';
import { SavingsGoalCard } from '../components/SavingsGoalCard';
import { SavingsGoalModal } from '../components/SavingsGoalModal';
import { useFinance } from '../context/financeStore';
import { useSavingsGoals } from '../hooks/useSavingsGoals';
import type { SavingsGoal } from '../types';
import { getSavingsProgress } from '../utils/calculations';
import { formatCurrency, formatDate } from '../utils/formatters';
import { validateGoalContribution } from '../utils/validators';

export function Savings() {
  const { settings } = useFinance();
  const {
    goalsWithProgress,
    totals,
    addSavingsGoal,
    editSavingsGoal,
    contributeToGoal,
    removeSavingsGoal,
  } = useSavingsGoals();

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | undefined>(undefined);
  const [contributingGoal, setContributingGoal] = useState<SavingsGoal | null>(null);
  const [historyGoal, setHistoryGoal] = useState<SavingsGoal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<SavingsGoal | null>(null);

  const [contribAmount, setContribAmount] = useState('');
  const [contribNote, setContribNote] = useState('');
  const [contribError, setContribError] = useState('');
  const [submittingContrib, setSubmittingContrib] = useState(false);

  const currency = settings.preferences.currency;
  const dateFormat = settings.preferences.dateFormat;

  const openContributeModal = (
    goal: SavingsGoal,
    initialAmount?: number,
    initialNote?: string,
  ) => {
    setContributingGoal(goal);
    setContribAmount(initialAmount ? String(initialAmount) : '');
    setContribNote(initialNote || '');
    setContribError('');
  };

  const handleApplyCoachRecommendation = (
    goalId: number | null,
    suggestedAmount: number,
    note: string,
  ) => {
    const targetGoal =
      (goalId ? goalsWithProgress.find((g) => Number(g.goal.id) === goalId) : null) ||
      goalsWithProgress.find((g) => !g.progress.isCompleted) ||
      goalsWithProgress[0];

    if (targetGoal) {
      openContributeModal(targetGoal.goal, suggestedAmount, note);
    } else {
      setGoalModalOpen(true);
    }
  };

  const handleContributionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!contributingGoal) return;
    const numeric = Number(contribAmount);
    const validation = validateGoalContribution(numeric, contributingGoal);
    if (!validation.isValid) {
      setContribError(validation.errors.amount ?? 'Enter a valid amount.');
      return;
    }

    setSubmittingContrib(true);
    const ok = await contributeToGoal(contributingGoal.id, numeric, contribNote);
    setSubmittingContrib(false);
    if (ok) {
      setContributingGoal(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <PageHeader
        title="Savings Goals"
        subtitle="Build dedicated rupee milestones for emergencies, tech upgrades, travel, and education."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditingGoal(undefined);
              setGoalModalOpen(true);
            }}
          >
            <Plus size={16} />
            Create Goal
          </button>
        }
      />

      {/* Summary Cards */}
      <section className="grid-4">
        <div className="card card-purple-border">
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Total Saved in Goals
          </span>
          <div
            className="tabular-nums"
            style={{ fontSize: '24px', fontWeight: 800, marginTop: '6px', color: 'var(--success)' }}
          >
            {formatCurrency(totals.totalSaved, currency)}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Across {goalsWithProgress.length} savings goals
          </span>
        </div>

        <div className="card card-purple-border">
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Combined Target
          </span>
          <div className="tabular-nums" style={{ fontSize: '24px', fontWeight: 800, marginTop: '6px' }}>
            {formatCurrency(totals.totalTarget, currency)}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {formatCurrency(totals.totalRemaining, currency)} left to fund
          </span>
        </div>

        <div className="card card-purple-border">
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Overall Completion
          </span>
          <div
            className="tabular-nums"
            style={{ fontSize: '24px', fontWeight: 800, marginTop: '6px', color: 'var(--accent-lavender)' }}
          >
            {totals.overallPercentage.toFixed(1)}%
          </div>
          <div className="progress-track" style={{ height: '6px', marginTop: '8px' }}>
            <div
              className="progress-fill"
              style={{
                width: `${totals.overallPercentage}%`,
                background: 'var(--accent-primary)',
              }}
            />
          </div>
        </div>

        <div className="card card-purple-border">
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Milestones Status
          </span>
          <div className="tabular-nums" style={{ fontSize: '24px', fontWeight: 800, marginTop: '6px' }}>
            {totals.completedCount} / {goalsWithProgress.length}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {totals.activeCount} active in progress
          </span>
        </div>
      </section>

      {/* AI Savings Coach */}
      <SavingsCoachSection
        currency={currency}
        onApplyRecommendation={handleApplyCoachRecommendation}
      />

      {/* Goals Grid */}
      {goalsWithProgress.length === 0 ? (
        <EmptyState
          icon={<Target size={22} />}
          title="No savings goals created"
          description="Set a target amount and deadline for your Emergency Fund, New Laptop, or upcoming trip."
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditingGoal(undefined);
                setGoalModalOpen(true);
              }}
            >
              <Plus size={16} /> Create First Goal
            </button>
          }
        />
      ) : (
        <section className="grid-2">
          {goalsWithProgress.map(({ goal, progress }) => (
            <SavingsGoalCard
              key={goal.id}
              goal={goal}
              progress={progress}
              currency={currency}
              dateFormat={dateFormat}
              onAddMoney={() => openContributeModal(goal)}
              onEdit={() => {
                setEditingGoal(goal);
                setGoalModalOpen(true);
              }}
              onDelete={() => setDeletingGoal(goal)}
              onViewHistory={() => setHistoryGoal(goal)}
            />
          ))}
        </section>
      )}

      {/* Create / Edit Goal Modal */}
      <SavingsGoalModal
        isOpen={goalModalOpen}
        onClose={() => {
          setGoalModalOpen(false);
          setEditingGoal(undefined);
        }}
        editingGoal={editingGoal}
        onSubmit={(input) =>
          editingGoal
            ? editSavingsGoal(editingGoal.id, input)
            : addSavingsGoal(input)
        }
      />

      {/* Contribute Money Modal */}
      <Modal
        isOpen={Boolean(contributingGoal)}
        onClose={() => setContributingGoal(null)}
        title={`Add Money to ${contributingGoal?.name ?? ''}`}
        subtitle="Record a deposit toward this savings milestone."
      >
        {contributingGoal && (() => {
          const progress = getSavingsProgress(contributingGoal);
          const presets = [500, 1000, 2500, 5000];
          return (
            <form onSubmit={handleContributionSubmit} noValidate>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: 'var(--bg-secondary-surface)',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Remaining to Target
                  </span>
                  <div className="tabular-nums" style={{ fontWeight: 700, fontSize: '16px' }}>
                    {formatCurrency(progress.remainingAmount, currency)}
                  </div>
                </div>
                <span className="badge badge-purple">
                  {progress.percentage.toFixed(1)}% saved
                </span>
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="contrib-amount">
                  Contribution Amount (₹) *
                </label>
                <input
                  id="contrib-amount"
                  type="number"
                  min="1"
                  step="50"
                  className={`form-input tabular-nums ${contribError ? 'form-input--error' : ''}`}
                  placeholder="Enter amount"
                  value={contribAmount}
                  onChange={(e) => {
                    setContribAmount(e.target.value);
                    if (contribError) setContribError('');
                  }}
                />
                {contribError && (
                  <span className="form-error-text">{contribError}</span>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: '10px',
                }}
              >
                {presets.map((val) => (
                  <button
                    key={val}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setContribAmount(String(val));
                      setContribError('');
                    }}
                  >
                    +{formatCurrency(val, currency)}
                  </button>
                ))}
                {progress.remainingAmount > 0 && (
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={() => {
                      setContribAmount(String(progress.remainingAmount));
                      setContribError('');
                    }}
                  >
                    Complete ({formatCurrency(progress.remainingAmount, currency)})
                  </button>
                )}
              </div>

              <div className="form-field" style={{ marginTop: '14px' }}>
                <label className="form-label" htmlFor="contrib-note">
                  Note (optional)
                </label>
                <input
                  id="contrib-note"
                  type="text"
                  className="form-input"
                  placeholder="e.g., Monthly SIP transfer or freelance bonus"
                  value={contribNote}
                  onChange={(e) => setContribNote(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setContributingGoal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingContrib || progress.isCompleted}
                >
                  {submittingContrib ? 'Adding...' : 'Confirm Deposit'}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* Contribution History Modal */}
      <Modal
        isOpen={Boolean(historyGoal)}
        onClose={() => setHistoryGoal(null)}
        title={`Contribution History — ${historyGoal?.name ?? ''}`}
        subtitle="Logged deposits toward this savings goal"
      >
        {historyGoal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {historyGoal.contributions.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>
                No contributions logged yet.
              </p>
            ) : (
              historyGoal.contributions.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 14px',
                    borderRadius: '11px',
                    background: 'var(--bg-secondary-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                      {entry.note || 'Deposit'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {formatDate(entry.date, dateFormat)}
                    </div>
                  </div>
                  <span
                    className="tabular-nums"
                    style={{ fontWeight: 700, color: 'var(--success)' }}
                  >
                    +{formatCurrency(entry.amount, currency)}
                  </span>
                </div>
              ))
            )}
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setHistoryGoal(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Goal Modal */}
      <Modal
        isOpen={Boolean(deletingGoal)}
        onClose={() => setDeletingGoal(null)}
        title="Delete Savings Goal?"
        subtitle="This removes the goal and its local contribution log."
      >
        {deletingGoal && (
          <>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Delete{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {deletingGoal.name}
              </strong>{' '}
              ({formatCurrency(deletingGoal.currentAmount, currency)} saved)?
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeletingGoal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  await removeSavingsGoal(deletingGoal.id);
                  setDeletingGoal(null);
                }}
              >
                Delete Goal
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

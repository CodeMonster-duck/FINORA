import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Flame, PieChart, Plus } from 'lucide-react';
import { BudgetFormModal } from '../components/BudgetFormModal';
import { BudgetProgress } from '../components/BudgetProgress';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useFinance } from '../context/financeStore';
import { useBudgets } from '../hooks/useBudgets';
import type { Budget } from '../types';
import { getMonthKey } from '../utils/calculations';
import { formatCurrency, formatMonthLabel } from '../utils/formatters';

export function Budgets() {
  const { settings } = useFinance();
  const {
    budgets,
    utilizations,
    totals,
    targetMonth: selectedMonth,
    setBudgetMonth,
    addBudget,
    editBudget,
    removeBudget,
  } = useBudgets();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | undefined>(undefined);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);

  const currency = settings.preferences.currency;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <PageHeader
        title="Budgets"
        subtitle="Define monthly category caps and monitor expense utilization without counting income."
        actions={
          <>
            <input
              type="month"
              className="form-input"
              style={{ width: 'auto' }}
              value={selectedMonth}
              onChange={(e) => void setBudgetMonth(e.target.value || getMonthKey())}
              aria-label="Filter budget tracking month"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditingBudget(undefined);
                setModalOpen(true);
              }}
            >
              <Plus size={16} />
              Create Budget
            </button>
          </>
        }
      />

      {/* Summary Banner */}
      <section className="grid-4">
        <div className="card card-purple-border">
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Total Monthly Cap
          </span>
          <div className="tabular-nums" style={{ fontSize: '24px', fontWeight: 800, marginTop: '6px' }}>
            {formatCurrency(totals.totalLimit, currency)}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            For {formatMonthLabel(selectedMonth)}
          </span>
        </div>

        <div className="card card-purple-border">
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Actual Budgeted Spend
          </span>
          <div className="tabular-nums" style={{ fontSize: '24px', fontWeight: 800, marginTop: '6px' }}>
            {formatCurrency(totals.totalSpent, currency)}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {totals.overallPercentage.toFixed(1)}% of total limit used
          </span>
        </div>

        <div className="card card-purple-border">
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Remaining Headroom
          </span>
          <div
            className="tabular-nums"
            style={{
              fontSize: '24px',
              fontWeight: 800,
              marginTop: '6px',
              color: totals.totalRemaining >= 0 ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {formatCurrency(totals.totalRemaining, currency)}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Across {utilizations.length} category caps
          </span>
        </div>

        <div className="card card-purple-border">
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Budget Health Status
          </span>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginTop: '10px',
            }}
          >
            <span className="badge badge-success">
              <CheckCircle2 size={12} /> {totals.onTrackCount} On Track
            </span>
            <span className="badge badge-warning">
              <AlertTriangle size={12} /> {totals.approachingCount} Approaching
            </span>
            <span className="badge badge-danger">
              <Flame size={12} /> {totals.exceededCount} Exceeded
            </span>
          </div>
        </div>
      </section>

      {/* Budget Cards Grid */}
      {utilizations.length === 0 ? (
        <EmptyState
          icon={<PieChart size={22} />}
          title="No category budgets yet"
          description="Create monthly category limits (e.g., Food ₹5,000, Transport ₹2,000) to get real-time overspending alerts."
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditingBudget(undefined);
                setModalOpen(true);
              }}
            >
              <Plus size={16} /> Create First Budget
            </button>
          }
        />
      ) : (
        <section className="grid-3">
          {utilizations.map((util) => (
            <BudgetProgress
              key={util.budget.id}
              utilization={util}
              currency={currency}
              onEdit={() => {
                setEditingBudget(util.budget);
                setModalOpen(true);
              }}
              onDelete={() => setDeletingBudget(util.budget)}
            />
          ))}
        </section>
      )}

      <BudgetFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingBudget(undefined);
        }}
        existingBudgets={budgets}
        editingBudget={editingBudget}
        onSubmit={(input) =>
          editingBudget
            ? editBudget(editingBudget.id, input)
            : addBudget(input)
        }
      />

      <Modal
        isOpen={Boolean(deletingBudget)}
        onClose={() => setDeletingBudget(null)}
        title="Delete Budget?"
        subtitle="Your transactions stay intact; only this spending limit will be removed."
      >
        {deletingBudget && (
          <>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Remove the{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {deletingBudget.category}
              </strong>{' '}
              monthly budget ({formatCurrency(deletingBudget.limit, currency)})?
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeletingBudget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  await removeBudget(deletingBudget.id);
                  setDeletingBudget(null);
                }}
              >
                Delete Budget
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

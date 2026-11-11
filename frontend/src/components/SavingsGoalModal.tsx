import { useState } from 'react';
import type { FormEvent } from 'react';
import { addMonths, format } from 'date-fns';
import type {
  GoalPriority,
  SavingsGoal,
  SavingsGoalCategory,
  SavingsGoalInput,
} from '../types';
import { SAVINGS_GOAL_CATEGORIES } from '../types';
import { validateSavingsGoalInput } from '../utils/validators';
import { Modal } from './Modal';

interface SavingsGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: SavingsGoalInput) => Promise<boolean>;
  editingGoal?: SavingsGoal;
}

interface SavingsGoalFormBodyProps {
  onClose: () => void;
  onSubmit: (input: SavingsGoalInput) => Promise<boolean>;
  editingGoal?: SavingsGoal;
}

function SavingsGoalFormBody({
  onClose,
  onSubmit,
  editingGoal,
}: SavingsGoalFormBodyProps) {
  const defaultTargetDate = format(addMonths(new Date(), 6), 'yyyy-MM-dd');

  const [name, setName] = useState(editingGoal?.name ?? '');
  const [category, setCategory] = useState<SavingsGoalCategory>(
    editingGoal?.category ?? 'Emergency',
  );
  const [targetAmount, setTargetAmount] = useState(
    editingGoal ? String(editingGoal.targetAmount) : '',
  );
  const [currentAmount, setCurrentAmount] = useState(
    editingGoal ? String(editingGoal.currentAmount) : '0',
  );
  const [targetDate, setTargetDate] = useState(
    editingGoal?.targetDate ?? defaultTargetDate,
  );
  const [priority, setPriority] = useState<GoalPriority>(
    editingGoal?.priority ?? 'high',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload: SavingsGoalInput = {
      name: name.trim(),
      category,
      targetAmount: Number(targetAmount),
      currentAmount: Number(currentAmount || 0),
      targetDate,
      priority,
    };

    const validation = validateSavingsGoalInput(payload);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    const ok = await onSubmit(payload);
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <div className="form-field form-field--full">
          <label className="form-label" htmlFor="goal-name">
            Goal Name *
          </label>
          <input
            id="goal-name"
            type="text"
            className={`form-input ${errors.name ? 'form-input--error' : ''}`}
            placeholder="e.g., Emergency Fund, MacBook Air, Higher Education"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
            }}
          />
          {errors.name && <span className="form-error-text">{errors.name}</span>}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="goal-category">
            Category
          </label>
          <select
            id="goal-category"
            className="form-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as SavingsGoalCategory)}
          >
            {SAVINGS_GOAL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="goal-priority">
            Priority
          </label>
          <select
            id="goal-priority"
            className="form-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as GoalPriority)}
          >
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="goal-target">
            Target Amount (₹) *
          </label>
          <input
            id="goal-target"
            type="number"
            min="1"
            step="100"
            className={`form-input tabular-nums ${errors.targetAmount ? 'form-input--error' : ''}`}
            placeholder="e.g., 100000"
            value={targetAmount}
            onChange={(e) => {
              setTargetAmount(e.target.value);
              if (errors.targetAmount) {
                setErrors((prev) => ({ ...prev, targetAmount: '' }));
              }
            }}
          />
          {errors.targetAmount && (
            <span className="form-error-text">{errors.targetAmount}</span>
          )}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="goal-current">
            {editingGoal ? 'Current Saved (₹)' : 'Starting Saved (₹)'}
          </label>
          <input
            id="goal-current"
            type="number"
            min="0"
            step="100"
            className={`form-input tabular-nums ${errors.currentAmount ? 'form-input--error' : ''}`}
            value={currentAmount}
            onChange={(e) => {
              setCurrentAmount(e.target.value);
              if (errors.currentAmount) {
                setErrors((prev) => ({ ...prev, currentAmount: '' }));
              }
            }}
          />
          {errors.currentAmount && (
            <span className="form-error-text">{errors.currentAmount}</span>
          )}
        </div>

        <div className="form-field form-field--full">
          <label className="form-label" htmlFor="goal-date">
            Target Date *
          </label>
          <input
            id="goal-date"
            type="date"
            className={`form-input ${errors.targetDate ? 'form-input--error' : ''}`}
            value={targetDate}
            onChange={(e) => {
              setTargetDate(e.target.value);
              if (errors.targetDate) {
                setErrors((prev) => ({ ...prev, targetDate: '' }));
              }
            }}
          />
          {errors.targetDate && (
            <span className="form-error-text">{errors.targetDate}</span>
          )}
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting
            ? 'Saving...'
            : editingGoal
              ? 'Update Goal'
              : 'Create Goal'}
        </button>
      </div>
    </form>
  );
}

export function SavingsGoalModal({
  isOpen,
  onClose,
  onSubmit,
  editingGoal,
}: SavingsGoalModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingGoal ? `Edit "${editingGoal.name}"` : 'Create Savings Goal'}
      subtitle="Define a clear rupee milestone and track contributions until completion."
    >
      {isOpen && (
        <SavingsGoalFormBody
          key={editingGoal?.id ?? 'new-goal'}
          onClose={onClose}
          onSubmit={onSubmit}
          editingGoal={editingGoal}
        />
      )}
    </Modal>
  );
}

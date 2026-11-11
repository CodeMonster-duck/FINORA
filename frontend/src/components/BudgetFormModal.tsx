import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Budget, BudgetInput, ExpenseCategory } from '../types';
import { EXPENSE_CATEGORIES } from '../types';
import { getMonthKey } from '../utils/calculations';
import { validateBudgetInput } from '../utils/validators';
import { Modal } from './Modal';

interface BudgetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: BudgetInput) => Promise<boolean>;
  existingBudgets: readonly Budget[];
  editingBudget?: Budget;
}

interface BudgetFormBodyProps {
  onClose: () => void;
  onSubmit: (input: BudgetInput) => Promise<boolean>;
  existingBudgets: readonly Budget[];
  editingBudget?: Budget;
}

function BudgetFormBody({
  onClose,
  onSubmit,
  existingBudgets,
  editingBudget,
}: BudgetFormBodyProps) {
  const currentMonth = getMonthKey();
  const usedCategories = new Set(existingBudgets.map((b) => b.category));
  const firstAvailable =
    EXPENSE_CATEGORIES.find((cat) => !usedCategories.has(cat)) ?? 'Food';

  const [category, setCategory] = useState<ExpenseCategory>(
    editingBudget?.category ?? firstAvailable,
  );
  const [limit, setLimit] = useState(
    editingBudget ? String(editingBudget.limit) : '',
  );
  const [month, setMonth] = useState(editingBudget?.month ?? currentMonth);
  const [alertThreshold, setAlertThreshold] = useState(
    editingBudget ? String(editingBudget.alertThreshold) : '80',
  );
  const [notes, setNotes] = useState(editingBudget?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload: BudgetInput = {
      category,
      limit: Number(limit),
      month,
      alertThreshold: Number(alertThreshold),
      notes: notes.trim() || undefined,
    };

    const validation = validateBudgetInput(
      payload,
      existingBudgets,
      editingBudget?.id,
    );
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
        <div className="form-field">
          <label className="form-label" htmlFor="bgt-category">
            Expense Category *
          </label>
          <select
            id="bgt-category"
            className={`form-select ${errors.category ? 'form-select--error' : ''}`}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ExpenseCategory);
              if (errors.category) setErrors((prev) => ({ ...prev, category: '' }));
            }}
          >
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {errors.category && (
            <span className="form-error-text">{errors.category}</span>
          )}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="bgt-limit">
            Monthly Limit (₹) *
          </label>
          <input
            id="bgt-limit"
            type="number"
            min="1"
            step="50"
            className={`form-input tabular-nums ${errors.limit ? 'form-input--error' : ''}`}
            placeholder="e.g., 5000"
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              if (errors.limit) setErrors((prev) => ({ ...prev, limit: '' }));
            }}
          />
          {errors.limit && <span className="form-error-text">{errors.limit}</span>}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="bgt-month">
            Budget Month
          </label>
          <input
            id="bgt-month"
            type="month"
            className="form-input"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="bgt-threshold">
            Warning Threshold (%)
          </label>
          <input
            id="bgt-threshold"
            type="number"
            min="10"
            max="100"
            className={`form-input tabular-nums ${errors.alertThreshold ? 'form-input--error' : ''}`}
            value={alertThreshold}
            onChange={(e) => {
              setAlertThreshold(e.target.value);
              if (errors.alertThreshold) {
                setErrors((prev) => ({ ...prev, alertThreshold: '' }));
              }
            }}
          />
          {errors.alertThreshold && (
            <span className="form-error-text">{errors.alertThreshold}</span>
          )}
        </div>

        <div className="form-field form-field--full">
          <label className="form-label" htmlFor="bgt-notes">
            Notes (optional)
          </label>
          <input
            id="bgt-notes"
            type="text"
            className="form-input"
            placeholder="e.g., Includes weekend dining & campus snacks"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting
            ? 'Saving...'
            : editingBudget
              ? 'Update Budget'
              : 'Create Budget'}
        </button>
      </div>
    </form>
  );
}

export function BudgetFormModal({
  isOpen,
  onClose,
  onSubmit,
  existingBudgets,
  editingBudget,
}: BudgetFormModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        editingBudget
          ? `Edit ${editingBudget.category} Budget`
          : 'Create Monthly Budget'
      }
      subtitle="Set a monthly expense ceiling; FINORA tracks actual expenses against this cap."
    >
      {isOpen && (
        <BudgetFormBody
          key={editingBudget?.id ?? 'new-budget'}
          onClose={onClose}
          onSubmit={onSubmit}
          existingBudgets={existingBudgets}
          editingBudget={editingBudget}
        />
      )}
    </Modal>
  );
}

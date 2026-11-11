import { useState } from 'react';
import type { FormEvent } from 'react';
import { format } from 'date-fns';
import type {
  PaymentMethod,
  Transaction,
  TransactionCategory,
  TransactionInput,
  TransactionStatus,
  TransactionType,
} from '../types';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
} from '../types';
import { validateTransactionInput } from '../utils/validators';
import { Modal } from './Modal';

interface TransactionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: TransactionInput) => Promise<boolean>;
  defaultType?: TransactionType;
  editingTransaction?: Transaction;
}

interface TransactionFormBodyProps {
  onClose: () => void;
  onSubmit: (input: TransactionInput) => Promise<boolean>;
  defaultType: TransactionType;
  editingTransaction?: Transaction;
}

function TransactionFormBody({
  onClose,
  onSubmit,
  defaultType,
  editingTransaction,
}: TransactionFormBodyProps) {
  const initialType = editingTransaction?.type ?? defaultType;
  const initialCategory: TransactionCategory =
    editingTransaction?.category ??
    (initialType === 'income' ? 'Salary' : 'Food');

  const [title, setTitle] = useState(editingTransaction?.title ?? '');
  const [amount, setAmount] = useState(
    editingTransaction ? String(editingTransaction.amount) : '',
  );
  const [type, setType] = useState<TransactionType>(initialType);
  const [category, setCategory] = useState<TransactionCategory>(initialCategory);
  const [date, setDate] = useState(
    editingTransaction?.date ?? format(new Date(), 'yyyy-MM-dd'),
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    editingTransaction?.paymentMethod ??
      (initialType === 'income' ? 'Bank Transfer' : 'UPI'),
  );
  const [description, setDescription] = useState(
    editingTransaction?.description ?? '',
  );
  const [notes, setNotes] = useState(editingTransaction?.notes ?? '');
  const [status, setStatus] = useState<TransactionStatus>(
    editingTransaction?.status ?? 'completed',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const availableCategories =
    type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    const validNext =
      nextType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!validNext.includes(category as never)) {
      setCategory(validNext[0]);
    }
    setErrors((prev) => ({ ...prev, type: '', category: '' }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload: TransactionInput = {
      title: title.trim(),
      amount: Number(amount),
      type,
      category,
      date,
      paymentMethod,
      description: description.trim() || title.trim(),
      notes: notes.trim() || undefined,
      status,
    };

    const validation = validateTransactionInput(payload);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    const ok = await onSubmit(payload);
    setSubmitting(false);
    if (ok) {
      onClose();
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <div className="form-field form-field--full">
          <span className="form-label">Transaction Type</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              className={`btn ${type === 'expense' ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => handleTypeChange('expense')}
            >
              Expense (Debit)
            </button>
            <button
              type="button"
              className={`btn ${type === 'income' ? 'btn-success' : 'btn-secondary'}`}
              onClick={() => handleTypeChange('income')}
            >
              Income (Credit)
            </button>
          </div>
          {errors.type && <span className="form-error-text">{errors.type}</span>}
        </div>

        <div className="form-field form-field--full">
          <label className="form-label" htmlFor="tx-title">
            Title *
          </label>
          <input
            id="tx-title"
            type="text"
            className={`form-input ${errors.title ? 'form-input--error' : ''}`}
            placeholder={
              type === 'income'
                ? 'e.g., Monthly Stipend or Freelance UI Sprint'
                : 'e.g., Swiggy Lunch, Metro Recharge, PG Rent'
            }
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
            }}
          />
          {errors.title && <span className="form-error-text">{errors.title}</span>}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="tx-amount">
            Amount (₹) *
          </label>
          <input
            id="tx-amount"
            type="number"
            step="0.01"
            min="0.01"
            className={`form-input tabular-nums ${errors.amount ? 'form-input--error' : ''}`}
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (errors.amount) setErrors((prev) => ({ ...prev, amount: '' }));
            }}
          />
          {errors.amount && <span className="form-error-text">{errors.amount}</span>}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="tx-date">
            Date *
          </label>
          <input
            id="tx-date"
            type="date"
            className={`form-input ${errors.date ? 'form-input--error' : ''}`}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (errors.date) setErrors((prev) => ({ ...prev, date: '' }));
            }}
          />
          {errors.date && <span className="form-error-text">{errors.date}</span>}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="tx-category">
            Category *
          </label>
          <select
            id="tx-category"
            className={`form-select ${errors.category ? 'form-select--error' : ''}`}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as TransactionCategory);
              if (errors.category) setErrors((prev) => ({ ...prev, category: '' }));
            }}
          >
            {availableCategories.map((cat) => (
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
          <label className="form-label" htmlFor="tx-payment">
            Payment Method *
          </label>
          <select
            id="tx-payment"
            className="form-select"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm} value={pm}>
                {pm}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="tx-status">
            Status
          </label>
          <select
            id="tx-status"
            className="form-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as TransactionStatus)}
          >
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="tx-description">
            Description
          </label>
          <input
            id="tx-description"
            type="text"
            className="form-input"
            placeholder="Short summary for statements"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="form-field form-field--full">
          <label className="form-label" htmlFor="tx-notes">
            Optional Notes
          </label>
          <textarea
            id="tx-notes"
            rows={2}
            className="form-textarea"
            placeholder="Invoice reference, merchant info, or personal reminder..."
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
            : editingTransaction
              ? 'Save Changes'
              : type === 'income'
                ? 'Add Income'
                : 'Add Expense'}
        </button>
      </div>
    </form>
  );
}

export function TransactionFormModal({
  isOpen,
  onClose,
  onSubmit,
  defaultType = 'expense',
  editingTransaction,
}: TransactionFormModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}
      subtitle={
        editingTransaction
          ? 'Update transaction details; all balances and budgets recalculate automatically.'
          : 'Record an income credit or expense debit in your FINORA ledger.'
      }
    >
      {isOpen && (
        <TransactionFormBody
          key={`${editingTransaction?.id ?? 'new'}-${defaultType}`}
          onClose={onClose}
          onSubmit={onSubmit}
          defaultType={defaultType}
          editingTransaction={editingTransaction}
        />
      )}
    </Modal>
  );
}

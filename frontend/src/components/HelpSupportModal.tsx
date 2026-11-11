import { BookOpen, Calculator, Database, HelpCircle, Keyboard } from 'lucide-react';
import { Modal } from './Modal';

interface HelpSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpSupportModal({ isOpen, onClose }: HelpSupportModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="FINORA Help & Documentation"
      subtitle="Architecture overview, calculation transparency, and workspace guide"
      wide
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'var(--bg-secondary-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Calculator size={16} style={{ color: 'var(--accent-lavender)' }} />
            <strong style={{ fontSize: '14px' }}>Financial Calculation Rules</strong>
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: '18px',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <li>
              All totals convert rupee values into integer paise before summing to eliminate floating-point rounding errors.
            </li>
            <li>
              <strong>Monthly Budgets</strong> only track Expense transactions within the active month; Income never reduces or offsets expense limits.
            </li>
            <li>
              <strong>Financial Health Score (0–100)</strong> combines Savings Rate (35 pts), Budget Adherence (30 pts), Spending Consistency (20 pts), and Goal Progress (15 pts).
            </li>
          </ul>
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'var(--bg-secondary-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Database size={16} style={{ color: 'var(--info)' }} />
            <strong style={{ fontSize: '14px' }}>Real-Time Backend Persistence &amp; Account Isolation</strong>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Your transactions, budgets, savings goals, notifications, and settings are persisted in the FastAPI + SQLite database and strictly scoped to your authenticated JWT account.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
              <Keyboard size={15} style={{ color: 'var(--accent-lavender)' }} />
              <strong style={{ fontSize: '13px' }}>Shortcuts</strong>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Press <code>Ctrl + K</code> (or <code>/</code>) anywhere to focus Global Search. Press <code>Esc</code> to close dialogs.
            </p>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
              <BookOpen size={15} style={{ color: 'var(--success)' }} />
              <strong style={{ fontSize: '13px' }}>CSV Export</strong>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Visit <strong>Reports</strong> to filter by date range and download UTF-8 CSV statements compatible with Excel & Google Sheets.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          <HelpCircle size={14} />
          <span>FINORA Capstone v1.0 · Smart Personal Finance Platform</span>
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </Modal>
  );
}

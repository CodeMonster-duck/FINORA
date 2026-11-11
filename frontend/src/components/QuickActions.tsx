import { ArrowDownCircle, ArrowUpCircle, PieChart, Target } from 'lucide-react';
import { useFinance } from '../context/financeStore';

export function QuickActions() {
  const { setQuickModal } = useFinance();

  return (
    <section className="card card-purple-border">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div>
          <h2 className="card-title">Quick Actions</h2>
          <p className="card-subtitle">
            Record money movement or configure financial guardrails in one click.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-success"
            onClick={() =>
              setQuickModal({ kind: 'transaction', defaultType: 'income' })
            }
          >
            <ArrowDownCircle size={16} />
            Add Income
          </button>

          <button
            type="button"
            className="btn btn-danger"
            onClick={() =>
              setQuickModal({ kind: 'transaction', defaultType: 'expense' })
            }
          >
            <ArrowUpCircle size={16} />
            Add Expense
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setQuickModal({ kind: 'budget' })}
          >
            <PieChart size={16} />
            Create Budget
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setQuickModal({ kind: 'savings-goal' })}
          >
            <Target size={16} />
            Create Savings Goal
          </button>
        </div>
      </div>
    </section>
  );
}

import { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, Info, Calendar, Flame, RefreshCw } from 'lucide-react';
import { financeService } from '../services/financeService';
import type { CurrencyCode, ExpensePredictionResponse } from '../types';
import { formatCurrency } from '../utils/formatters';

interface ExpenseForecastCardProps {
  currency: CurrencyCode;
  compact?: boolean;
}

export function ExpenseForecastCard({ currency, compact = false }: ExpenseForecastCardProps) {
  const [data, setData] = useState<ExpensePredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleRecalculate = async () => {
    setRefreshing(true);
    try {
      const res = await financeService.getExpensePredictions();
      setData(res);
    } catch {
      // Graceful fallback
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    void financeService
      .getExpensePredictions()
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="card card-purple-border" style={{ padding: '24px' }}>
        <div className="skeleton-box" style={{ height: '24px', width: '220px', marginBottom: '12px' }} />
        <div className="skeleton-box" style={{ height: '90px', width: '100%' }} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <article className="card card-purple-border" aria-label="Expense Prediction">
      <div className="card-header" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <TrendingUp size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 className="card-title" style={{ margin: 0 }}>
                AI Expense Prediction
              </h2>
              <span className="badge badge-purple" style={{ fontSize: '10.5px' }}>
                Burn-Rate + EWMA
              </span>
            </div>
            <p className="card-subtitle" style={{ margin: '2px 0 0 0' }}>
              Month-end forecast based on velocity and historical spending patterns
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void handleRecalculate()}
          disabled={refreshing}
          title="Refresh forecast"
        >
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
          <span style={{ fontSize: '12px' }}>Recalculate</span>
        </button>
      </div>

      {/* Top Velocity Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '18px',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Calendar size={12} />
            Actual Spend (Day {data.days_elapsed}/{data.days_in_month})
          </div>
          <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>
            {formatCurrency(data.current_spent, currency, { compact })}
          </div>
        </div>

        <div
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Flame size={12} style={{ color: '#F97316' }} />
            Daily Burn Rate
          </div>
          <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#FB923C' }}>
            {formatCurrency(data.daily_burn_rate, currency, { compact })}/day
          </div>
        </div>

        <div
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: 'rgba(139, 92, 246, 0.12)',
            border: '1px solid rgba(139, 92, 246, 0.35)',
          }}
        >
          <div style={{ fontSize: '11px', color: '#DDD6FE', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <TrendingUp size={12} style={{ color: '#A78BFA' }} />
            Predicted Month-End
          </div>
          <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#A78BFA' }}>
            {formatCurrency(data.predicted_total_spend, currency, { compact })}
          </div>
        </div>
      </div>

      {/* Budget Overrun Warnings */}
      {data.budget_overrun_warnings.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            marginBottom: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} style={{ color: '#F87171' }} />
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#FCA5A5' }}>
              Projected Budget Overrun Alerts
            </span>
          </div>
          {data.budget_overrun_warnings.map((warn, i) => (
            <div key={i} style={{ fontSize: '12px', color: '#F87171', paddingLeft: '23px' }}>
              {warn}
            </div>
          ))}
        </div>
      )}

      {/* Top Category Projections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Category Predictions vs. Budgets
        </div>
        {data.categories.slice(0, 5).map((cat) => {
          const pctOfPred = data.predicted_total_spend > 0
            ? Math.round((cat.predicted_month_end / data.predicted_total_spend) * 100)
            : 0;
          return (
            <div
              key={cat.category}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor: 'rgba(23, 21, 46, 0.5)',
                border: cat.is_overrun_projected
                  ? '1px solid rgba(239, 68, 68, 0.3)'
                  : '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {cat.category}
                  </span>
                  {cat.is_overrun_projected && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        color: '#F87171',
                      }}
                    >
                      Overrun Projected
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Spent {formatCurrency(cat.current_month_spent, currency)} • {pctOfPred}% of projected total
                  {cat.budget_limit ? ` • Budget: ${formatCurrency(cat.budget_limit, currency)}` : ''}
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tabular-nums" style={{ fontSize: '13.5px', fontWeight: 700, color: cat.is_overrun_projected ? '#F87171' : 'var(--accent-lavender)' }}>
                  {formatCurrency(cat.predicted_month_end, currency)}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  projected
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Methodology Disclaimer */}
      <div
        style={{
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          lineHeight: '1.45',
        }}
      >
        <Info size={13} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-lavender)' }} />
        <span>{data.methodology_note}</span>
      </div>
    </article>
  );
}

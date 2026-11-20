import { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Target, RefreshCw } from 'lucide-react';
import { financeService } from '../services/financeService';
import type { CurrencyCode, SavingsCoachPlan } from '../types';
import { formatCurrency } from '../utils/formatters';

interface SavingsCoachSectionProps {
  currency: CurrencyCode;
  onApplyRecommendation: (goalId: number | null, suggestedAmount: number, note: string) => void;
}

export function SavingsCoachSection({ currency, onApplyRecommendation }: SavingsCoachSectionProps) {
  const [plan, setPlan] = useState<SavingsCoachPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleRecalculate = async () => {
    setRefreshing(true);
    try {
      const res = await financeService.getSavingsCoachPlan();
      setPlan(res);
    } catch {
      // Graceful fallback
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    void financeService
      .getSavingsCoachPlan()
      .then((res) => {
        if (active) {
          setPlan(res);
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

  if (!plan) return null;

  return (
    <section className="card card-purple-border" aria-label="AI Savings Coach">
      <div className="card-header" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #10B981 0%, #6366F1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 className="card-title" style={{ margin: 0 }}>
                AI Savings Coach
              </h2>
              <span className="badge badge-success" style={{ fontSize: '10.5px' }}>
                Algorithmic Simulation
              </span>
            </div>
            <p className="card-subtitle" style={{ margin: '2px 0 0 0' }}>
              Actionable leak optimization targeting discretionary spending
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void handleRecalculate()}
          disabled={refreshing}
          title="Recalculate savings opportunities"
        >
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
          <span style={{ fontSize: '12px' }}>Recalculate</span>
        </button>
      </div>

      {/* Discretionary Outlay Banner */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Tracked Discretionary Outlay
          </div>
          <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#F87171' }}>
            {formatCurrency(plan.monthly_discretionary_spend, currency)}
          </div>
        </div>

        <div
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.35)',
          }}
        >
          <div style={{ fontSize: '11px', color: '#86EFAC' }}>
            Potential Monthly Savings
          </div>
          <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#4ADE80' }}>
            +{formatCurrency(plan.total_potential_monthly_savings, currency)}/mo
          </div>
        </div>
      </div>

      {/* Recommendations Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        {plan.recommendations.map((rec) => (
          <div
            key={rec.id}
            style={{
              padding: '16px',
              borderRadius: '14px',
              backgroundColor: 'rgba(23, 21, 46, 0.6)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {rec.title}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ADE80',
                  }}
                >
                  Save {formatCurrency(rec.monthly_potential_savings, currency)}/mo
                </span>
              </div>

              <p style={{ fontSize: '12px', color: '#CBD5E1', margin: '8px 0 0 0', lineHeight: '1.45' }}>
                {rec.impact_summary}
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {rec.associated_goal_name ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#DDD6FE' }}>
                    <Target size={12} />
                    {rec.associated_goal_name}
                  </span>
                ) : (
                  'General safety habit'
                )}
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  onApplyRecommendation(
                    rec.associated_goal_id,
                    rec.suggested_deposit_amount,
                    `Savings Coach: ${rec.title}`,
                  )
                }
                title="Review and deposit to this goal"
                style={{ fontSize: '11.5px', padding: '6px 12px' }}
              >
                Apply Recommendation
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Safety Notice */}
      <div
        style={{
          marginTop: '16px',
          padding: '10px 14px',
          borderRadius: '10px',
          backgroundColor: 'rgba(15, 14, 30, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)',
        }}
      >
        <ShieldCheck size={14} style={{ color: '#22C55E', flexShrink: 0 }} />
        <span>{plan.disclaimer}</span>
      </div>
    </section>
  );
}

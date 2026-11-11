import { AlertTriangle, ArrowRight, CheckCircle2, Info, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SpendingInsight } from '../types';

interface SmartInsightsCardProps {
  insights: SpendingInsight[];
}

export function SmartInsightsCard({ insights }: SmartInsightsCardProps) {
  return (
    <section className="card card-purple-border">
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--accent-lavender)' }} />
            <h2 className="card-title">Smart Spending Insights</h2>
          </div>
          <p className="card-subtitle">
            Automated rupee observations derived directly from your active records
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {insights.map((insight) => {
          const palette =
            insight.tone === 'positive'
              ? {
                  bg: 'var(--success-soft)',
                  color: 'var(--success)',
                  border: 'rgba(34, 197, 94, 0.25)',
                }
              : insight.tone === 'warning'
                ? {
                    bg: 'var(--warning-soft)',
                    color: 'var(--warning)',
                    border: 'rgba(245, 158, 11, 0.25)',
                  }
                : insight.tone === 'danger'
                  ? {
                      bg: 'var(--danger-soft)',
                      color: 'var(--danger)',
                      border: 'rgba(248, 113, 113, 0.25)',
                    }
                  : {
                      bg: 'var(--info-soft)',
                      color: 'var(--info)',
                      border: 'rgba(56, 189, 248, 0.25)',
                    };

          return (
            <div
              key={insight.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '13px 14px',
                borderRadius: '13px',
                background: 'var(--bg-secondary-surface)',
                border: `1px solid ${palette.border}`,
              }}
            >
              <span
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '9px',
                  backgroundColor: palette.bg,
                  color: palette.color,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '1px',
                }}
              >
                {insight.tone === 'positive' ? (
                  <CheckCircle2 size={16} />
                ) : insight.tone === 'warning' || insight.tone === 'danger' ? (
                  <AlertTriangle size={16} />
                ) : (
                  <Info size={16} />
                )}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '13.5px', fontWeight: 700 }}>
                    {insight.title}
                  </span>
                  {insight.metric && (
                    <span
                      className="tabular-nums"
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: palette.color,
                      }}
                    >
                      {insight.metric}
                    </span>
                  )}
                </div>
                <p
                  style={{
                    fontSize: '12.5px',
                    color: 'var(--text-secondary)',
                    marginTop: '4px',
                    lineHeight: 1.45,
                  }}
                >
                  {insight.description}
                </p>

                {insight.actionRoute && insight.actionLabel && (
                  <Link
                    to={insight.actionRoute}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      marginTop: '7px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--accent-lavender)',
                    }}
                  >
                    {insight.actionLabel}
                    <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

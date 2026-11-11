import { Info, ShieldCheck } from 'lucide-react';
import type { FinancialHealthScore } from '../types';

interface FinancialHealthCardProps {
  health: FinancialHealthScore;
  showBreakdown?: boolean;
}

export function FinancialHealthCard({
  health,
  showBreakdown = true,
}: FinancialHealthCardProps) {
  const scoreColor =
    health.totalScore >= 82
      ? 'var(--success)'
      : health.totalScore >= 65
        ? 'var(--accent-primary)'
        : health.totalScore >= 45
          ? 'var(--warning)'
          : 'var(--danger)';

  const badgeClass =
    health.totalScore >= 82
      ? 'badge-success'
      : health.totalScore >= 65
        ? 'badge-purple'
        : health.totalScore >= 45
          ? 'badge-warning'
          : 'badge-danger';

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (Math.min(100, Math.max(0, health.totalScore)) / 100) * circumference;

  return (
    <section className="card card-purple-border">
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} style={{ color: 'var(--accent-lavender)' }} />
            <h2 className="card-title">Financial Health Score</h2>
          </div>
          <p className="card-subtitle">
            Transparent score calculated from your live savings, budgets & habits
          </p>
        </div>
        <span className={`badge ${badgeClass}`}>{health.grade}</span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
          padding: '12px 14px',
          borderRadius: '14px',
          background: 'var(--bg-secondary-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '108px',
            height: '108px',
            flexShrink: 0,
          }}
        >
          <svg width="108" height="108" viewBox="0 0 108 108">
            <circle
              cx="54"
              cy="54"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="9"
            />
            <circle
              cx="54"
              cy="54"
              r={radius}
              fill="none"
              stroke={scoreColor}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 54 54)"
              style={{ transition: 'stroke-dashoffset 450ms ease' }}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              className="tabular-nums"
              style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1 }}
            >
              {health.totalScore}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/ 100</span>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <p style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {health.summary}
          </p>
          <p
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              marginTop: '8px',
              fontSize: '11.5px',
              color: 'var(--text-muted)',
              lineHeight: 1.4,
            }}
          >
            <Info size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{health.disclaimer}</span>
          </p>
        </div>
      </div>

      {showBreakdown && (
        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {health.factors.map((factor) => {
            const pct = Math.round((factor.score / factor.maxScore) * 100);
            const barColor =
              factor.status === 'strong'
                ? 'var(--success)'
                : factor.status === 'moderate'
                  ? 'var(--accent-primary)'
                  : 'var(--warning)';

            return (
              <div key={factor.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    marginBottom: '5px',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>
                    {factor.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      {factor.metricDisplay}
                    </span>
                    <span
                      className="tabular-nums"
                      style={{ fontSize: '12px', fontWeight: 700, color: barColor }}
                    >
                      {factor.score}/{factor.maxScore}
                    </span>
                  </div>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div
                    className="progress-fill"
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                  />
                </div>
                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {factor.explanation}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

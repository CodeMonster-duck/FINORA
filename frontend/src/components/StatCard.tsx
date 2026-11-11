import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  accentColor?: string;
  accentBg?: string;
  trendPct?: number;
  trendLabel?: string;
  invertTrendColor?: boolean; // e.g. for Expenses, lower is positive!
  footer?: ReactNode;
}

export function StatCard({
  label,
  value,
  icon,
  accentColor = 'var(--accent-lavender)',
  accentBg = 'var(--accent-soft)',
  trendPct,
  trendLabel,
  invertTrendColor = false,
  footer,
}: StatCardProps) {
  const hasTrend = trendPct !== undefined && Number.isFinite(trendPct);
  const isPositiveDelta = (trendPct ?? 0) > 0;
  const isZeroDelta = Math.abs(trendPct ?? 0) < 0.05;

  let badgeClass = 'badge-neutral';
  if (!isZeroDelta && hasTrend) {
    const isGood = invertTrendColor ? !isPositiveDelta : isPositiveDelta;
    badgeClass = isGood ? 'badge-success' : 'badge-danger';
  }

  return (
    <article className="card card-purple-border card-interactive stat-card">
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        <span
          className="stat-card-icon"
          style={{
            backgroundColor: accentBg,
            color: accentColor,
          }}
        >
          {icon}
        </span>
      </div>

      <div className="stat-card-value tabular-nums">{value}</div>

      <div className="stat-card-footer">
        {hasTrend && (
          <span className={`badge ${badgeClass} tabular-nums`}>
            {isZeroDelta ? (
              <Minus size={12} />
            ) : isPositiveDelta ? (
              <ArrowUpRight size={13} />
            ) : (
              <ArrowDownRight size={13} />
            )}
            {isZeroDelta
              ? '0.0%'
              : `${isPositiveDelta ? '+' : ''}${trendPct?.toFixed(1)}%`}
          </span>
        )}
        {trendLabel && <span className="stat-card-context">{trendLabel}</span>}
      </div>

      {footer}
    </article>
  );
}

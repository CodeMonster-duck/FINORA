import type { CurrencyCode } from '../types';
import { formatCurrency } from '../utils/formatters';

interface ChartTooltipItem {
  name?: string | number;
  value?: number | string | ReadonlyArray<string | number>;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<ChartTooltipItem>;
  label?: string | number;
  currency?: CurrencyCode;
}

export function ChartTooltip({
  active,
  payload,
  label,
  currency = 'INR',
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="chart-tooltip">
      {label !== undefined && label !== '' && (
        <div className="chart-tooltip-label">{String(label)}</div>
      )}
      {payload.map((entry, idx) => {
        const numericVal =
          typeof entry.value === 'number'
            ? entry.value
            : Number(Array.isArray(entry.value) ? entry.value[0] : entry.value ?? 0);

        return (
          <div key={`${String(entry.name)}-${idx}`} className="chart-tooltip-row">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--text-secondary)',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '999px',
                  backgroundColor: entry.color ?? '#8B5CF6',
                }}
              />
              {String(entry.name ?? '')}
            </span>
            <span
              className="tabular-nums"
              style={{ fontWeight: 700, color: 'var(--text-primary)' }}
            >
              {formatCurrency(Number.isFinite(numericVal) ? numericVal : 0, currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  minHeight?: number;
}

export function ChartCard({
  title,
  subtitle,
  headerRight,
  children,
  minHeight = 290,
}: ChartCardProps) {
  return (
    <section className="card card-purple-border">
      <div className="card-header">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {headerRight && <div>{headerRight}</div>}
      </div>
      <div style={{ width: '100%', minHeight }}>{children}</div>
    </section>
  );
}

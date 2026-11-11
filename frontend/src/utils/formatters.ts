import { format, isValid, parseISO } from 'date-fns';
import type {
  CurrencyCode,
  DateFormatOption,
  ExpenseCategory,
  IncomeCategory,
  TransactionCategory,
} from '../types';

const CURRENCY_CONFIG: Record<
  CurrencyCode,
  { locale: string; currency: string; symbol: string }
> = {
  INR: { locale: 'en-IN', currency: 'INR', symbol: '₹' },
  USD: { locale: 'en-US', currency: 'USD', symbol: '$' },
  EUR: { locale: 'en-IE', currency: 'EUR', symbol: '€' },
};

export const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  // Income
  Salary: '#22C55E',
  Freelancing: '#10B981',
  Business: '#34D399',
  'Investment income': '#38BDF8',
  'Other income': '#60A5FA',
  // Expenses
  Food: '#8B5CF6',
  Groceries: '#A855F7',
  Transport: '#38BDF8',
  Shopping: '#EC4899',
  Education: '#6366F1',
  Healthcare: '#14B8A6',
  Entertainment: '#F59E0B',
  Rent: '#F87171',
  Bills: '#FB923C',
  Subscriptions: '#C4B5FD',
  Other: '#94A3B8',
};

export function getCategoryColor(category: TransactionCategory): string {
  return CATEGORY_COLORS[category] ?? '#8B5CF6';
}

export function isExpenseCategory(
  category: TransactionCategory,
): category is ExpenseCategory {
  return ![
    'Salary',
    'Freelancing',
    'Business',
    'Investment income',
    'Other income',
  ].includes(category);
}

export function isIncomeCategory(
  category: TransactionCategory,
): category is IncomeCategory {
  return !isExpenseCategory(category);
}

export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'INR',
  options?: {
    compact?: boolean;
    showDecimals?: boolean;
    showSign?: boolean;
  },
): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const config = CURRENCY_CONFIG[currency] ?? CURRENCY_CONFIG.INR;
  const isNegative = safeAmount < 0;
  const absVal = Math.abs(safeAmount);

  if (options?.compact) {
    if (currency === 'INR') {
      let compactStr: string;
      if (absVal >= 1_00_00_000) {
        compactStr = `${config.symbol}${(absVal / 1_00_00_000).toFixed(2).replace(/\.00$/, '')}Cr`;
      } else if (absVal >= 1_00_000) {
        compactStr = `${config.symbol}${(absVal / 1_00_000).toFixed(2).replace(/\.00$/, '')}L`;
      } else if (absVal >= 1_000) {
        compactStr = `${config.symbol}${(absVal / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
      } else {
        compactStr = `${config.symbol}${Math.round(absVal)}`;
      }
      if (isNegative) return `-${compactStr}`;
      return options?.showSign && absVal > 0 ? `+${compactStr}` : compactStr;
    }

    const formattedCompact = new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(absVal);

    if (isNegative) return `-${formattedCompact}`;
    return options?.showSign && absVal > 0
      ? `+${formattedCompact}`
      : formattedCompact;
  }

  const hasFraction = Math.round(absVal * 100) % 100 !== 0;
  const useDecimals = options?.showDecimals ?? hasFraction;

  const formatted = new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: useDecimals ? 2 : 0,
    maximumFractionDigits: useDecimals ? 2 : 0,
  }).format(absVal);

  if (isNegative) return `-${formatted}`;
  if (options?.showSign && absVal > 0) return `+${formatted}`;
  return formatted;
}

export function formatIndianNumber(value: number): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(safeVal);
}

export function formatDate(
  dateString: string,
  preference: DateFormatOption = 'DD MMM YYYY',
): string {
  if (!dateString) return '—';
  const parsed = parseISO(dateString);
  if (!isValid(parsed)) return dateString;

  switch (preference) {
    case 'DD/MM/YYYY':
      return format(parsed, 'dd/MM/yyyy');
    case 'YYYY-MM-DD':
      return format(parsed, 'yyyy-MM-dd');
    case 'DD MMM YYYY':
    default:
      return format(parsed, 'dd MMM yyyy');
  }
}

export function formatShortDate(dateString: string): string {
  if (!dateString) return '—';
  const parsed = parseISO(dateString);
  if (!isValid(parsed)) return dateString;
  return format(parsed, 'dd MMM');
}

export function formatMonthLabel(monthKey: string): string {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const parsed = parseISO(`${monthKey}-01`);
  if (!isValid(parsed)) return monthKey;
  return format(parsed, 'MMM yyyy');
}

export function formatPercentage(value: number, decimals = 1): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  return `${safeVal.toFixed(decimals).replace(/\.0$/, '')}%`;
}

export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'FN';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function escapeCsvCell(value: string | number | undefined | null): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsvFile(filename: string, rows: string[][]): void {
  const csvContent =
    '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

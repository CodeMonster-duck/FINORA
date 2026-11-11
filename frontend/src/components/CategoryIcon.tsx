import {
  Briefcase,
  Building2,
  Car,
  Film,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  Plane,
  Receipt,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  TrendingUp,
  Utensils,
  Wallet,
} from 'lucide-react';
import type { SavingsGoalCategory, TransactionCategory } from '../types';
import { getCategoryColor } from '../utils/formatters';

export function CategoryIcon({
  category,
  size = 17,
}: {
  category: TransactionCategory | SavingsGoalCategory;
  size?: number;
}) {
  switch (category) {
    case 'Salary':
      return <Briefcase size={size} />;
    case 'Freelancing':
      return <Laptop size={size} />;
    case 'Business':
      return <Building2 size={size} />;
    case 'Investment income':
    case 'Investment':
      return <TrendingUp size={size} />;
    case 'Other income':
      return <Wallet size={size} />;
    case 'Food':
      return <Utensils size={size} />;
    case 'Groceries':
      return <ShoppingBasket size={size} />;
    case 'Transport':
      return <Car size={size} />;
    case 'Shopping':
      return <ShoppingBag size={size} />;
    case 'Education':
      return <GraduationCap size={size} />;
    case 'Healthcare':
      return <HeartPulse size={size} />;
    case 'Entertainment':
      return <Film size={size} />;
    case 'Rent':
      return <Home size={size} />;
    case 'Bills':
      return <Receipt size={size} />;
    case 'Subscriptions':
      return <Repeat size={size} />;
    case 'Emergency':
      return <ShieldCheck size={size} />;
    case 'Tech':
      return <Laptop size={size} />;
    case 'Travel':
      return <Plane size={size} />;
    case 'Lifestyle':
      return <Sparkles size={size} />;
    default:
      return <Wallet size={size} />;
  }
}

export function CategoryBadgeIcon({
  category,
  size = 17,
}: {
  category: TransactionCategory;
  size?: number;
}) {
  const color = getCategoryColor(category);
  return (
    <span
      className="tx-cat-icon-box"
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}35`,
      }}
    >
      <CategoryIcon category={category} size={size} />
    </span>
  );
}

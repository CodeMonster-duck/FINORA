import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Calendar,
  HelpCircle,
  Menu,
  Mic,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react';
import { format } from 'date-fns';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFinance } from '../context/financeStore';
import { formatCurrency, getInitials } from '../utils/formatters';
import { NotificationPanel } from './NotificationPanel';

interface TopbarProps {
  onOpenMobileMenu: () => void;
  onOpenCopilot?: () => void;
  onOpenVoice?: () => void;
}

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/transactions': 'Transactions',
  '/budgets': 'Budgets',
  '/savings': 'Savings Goals',
  '/analytics': 'Analytics',
  '/reports': 'Reports & Exports',
  '/settings': 'Settings',
};

export function Topbar({
  onOpenMobileMenu,
  onOpenCopilot,
  onOpenVoice,
}: TopbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    transactions,
    budgets,
    savingsGoals,
    settings,
    unreadNotificationCount,
    setQuickModal,
    toggleTheme,
  } = useFinance();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const notifContainerRef = useRef<HTMLDivElement>(null);
  const profileContainerRef = useRef<HTMLDivElement>(null);

  const currentPageTitle = ROUTE_TITLES[location.pathname] ?? 'FINORA';
  const todayLabel = format(new Date(), 'EEE, dd MMM yyyy');
  const initials = getInitials(settings.profile.name);
  const currency = settings.preferences.currency;

  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        notifContainerRef.current &&
        !notifContainerRef.current.contains(target)
      ) {
        setNotifOpen(false);
      }
      if (
        profileContainerRef.current &&
        !profileContainerRef.current.contains(target)
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const txMatches = transactions
      .filter(
        (tx) =>
          tx.title.toLowerCase().includes(q) ||
          tx.category.toLowerCase().includes(q) ||
          tx.paymentMethod.toLowerCase().includes(q),
      )
      .slice(0, 4)
      .map((tx) => ({
        id: tx.id,
        label: tx.title,
        meta: `${tx.category} · ${tx.date}`,
        amount: `${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.amount, currency)}`,
        tone: tx.type === 'income' ? 'var(--success)' : 'var(--danger)',
        route: `/transactions?q=${encodeURIComponent(tx.title)}`,
      }));

    const budgetMatches = budgets
      .filter((b) => b.category.toLowerCase().includes(q))
      .slice(0, 2)
      .map((b) => ({
        id: b.id,
        label: `${b.category} Budget`,
        meta: `Monthly Limit`,
        amount: formatCurrency(b.limit, currency),
        tone: 'var(--accent-lavender)',
        route: '/budgets',
      }));

    const goalMatches = savingsGoals
      .filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.category.toLowerCase().includes(q),
      )
      .slice(0, 2)
      .map((g) => ({
        id: g.id,
        label: g.name,
        meta: `Savings Goal · ${g.category}`,
        amount: formatCurrency(g.targetAmount, currency),
        tone: 'var(--info)',
        route: '/savings',
      }));

    return [...txMatches, ...budgetMatches, ...goalMatches];
  }, [searchQuery, transactions, budgets, savingsGoals, currency]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
        >
          <Menu size={19} />
        </button>

        <div className="topbar-breadcrumb">
          <span className="topbar-crumb-trail">FINORA / {currentPageTitle}</span>
          <span className="topbar-page-title">{currentPageTitle}</span>
        </div>
      </div>

      <div className="topbar-search-wrap">
        <div className="topbar-search-input-box">
          <Search size={15} className="topbar-search-icon" />
          <input
            ref={searchInputRef}
            type="search"
            className="topbar-search-input"
            placeholder="Search transactions, categories, goals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              window.setTimeout(() => setSearchFocused(false), 160);
            }}
            aria-label="Global financial search"
          />
          <button
            type="button"
            className="icon-btn"
            style={{ width: '28px', height: '28px', color: '#A78BFA', padding: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenVoice?.();
            }}
            title="Voice Finance Assistant (Speak transactions or questions)"
            aria-label="Voice Finance Assistant"
          >
            <Mic size={15} />
          </button>
          <span className="topbar-search-kbd">Ctrl K</span>
        </div>

        {searchFocused && searchQuery.trim().length > 0 && (
          <div className="search-results-dropdown">
            {searchResults.length === 0 ? (
              <div
                style={{
                  padding: '14px 10px',
                  textAlign: 'center',
                  fontSize: '12.5px',
                  color: 'var(--text-secondary)',
                }}
              >
                No matches for &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="search-result-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    navigate(item.route);
                    setSearchQuery('');
                    setSearchFocused(false);
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.label}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {item.meta}
                    </div>
                  </div>
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: item.tone,
                      flexShrink: 0,
                    }}
                  >
                    {item.amount}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="topbar-right">
        <div className="topbar-date-pill" title="Current Date">
          <Calendar size={14} style={{ color: 'var(--accent-lavender)' }} />
          <span>{todayLabel}</span>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)',
            borderColor: 'rgba(236, 72, 153, 0.35)',
            color: '#F472B6',
          }}
          onClick={onOpenVoice}
          title="Open AI Voice Assistant (Ctrl+M)"
        >
          <Mic size={14} style={{ color: '#F472B6' }} />
          <span className="topbar-quick-label">Voice AI</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(139, 92, 246, 0.15)',
            borderColor: 'rgba(139, 92, 246, 0.35)',
            color: '#DDD6FE',
          }}
          onClick={onOpenCopilot}
          title="Open AI Financial Copilot"
        >
          <Sparkles size={14} style={{ color: '#A78BFA' }} />
          <span className="topbar-quick-label">AI Copilot</span>
        </button>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() =>
            setQuickModal({ kind: 'transaction', defaultType: 'expense' })
          }
          title="Quick-add transaction"
        >
          <Plus size={15} />
          <span className="topbar-quick-label">Quick Add</span>
        </button>

        <div ref={notifContainerRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setNotifOpen((prev) => !prev);
              setProfileMenuOpen(false);
            }}
            aria-label="Open notifications"
          >
            <Bell size={17} />
            {unreadNotificationCount > 0 && (
              <span className="notif-badge-dot">{unreadNotificationCount}</span>
            )}
          </button>

          <NotificationPanel
            isOpen={notifOpen}
            onClose={() => setNotifOpen(false)}
          />
        </div>

        <div ref={profileContainerRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => {
              setProfileMenuOpen((prev) => !prev);
              setNotifOpen(false);
            }}
            aria-label="Open profile menu"
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <span className="avatar-circle">{initials}</span>
          </button>

          {profileMenuOpen && (
            <div
              className="dropdown-panel"
              style={{ width: '240px', padding: '8px' }}
            >
              <div
                style={{
                  padding: '10px 10px 12px',
                  borderBottom: '1px solid var(--border-subtle)',
                  marginBottom: '6px',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '13.5px' }}>
                  {settings.profile.name}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  {settings.profile.email}
                </div>
                <span
                  className="badge badge-purple"
                  style={{ marginTop: '6px' }}
                >
                  Active Account
                </span>
              </div>

              <button
                type="button"
                className="nav-item"
                onClick={() => {
                  toggleTheme();
                  setProfileMenuOpen(false);
                }}
              >
                {settings.appearance.theme === 'dark' ? (
                  <Sun size={16} />
                ) : (
                  <Moon size={16} />
                )}
                <span>
                  {settings.appearance.theme === 'dark'
                    ? 'Switch to Light Mode'
                    : 'Switch to Dark Mode'}
                </span>
              </button>

              <button
                type="button"
                className="nav-item"
                onClick={() => {
                  navigate('/settings');
                  setProfileMenuOpen(false);
                }}
              >
                <Settings size={16} />
                <span>Preferences &amp; Settings</span>
              </button>

              <button
                type="button"
                className="nav-item"
                onClick={() => {
                  setQuickModal({ kind: 'help' });
                  setProfileMenuOpen(false);
                }}
              >
                <HelpCircle size={16} />
                <span>Help &amp; Architecture</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

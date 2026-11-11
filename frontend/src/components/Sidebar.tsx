import { useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  PieChart,
  Settings,
  Target,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useFinance } from '../context/financeStore';
import { getInitials } from '../utils/formatters';
import { Modal } from './Modal';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const MAIN_NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: PieChart },
  { to: '/savings', label: 'Savings Goals', icon: Target },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileSpreadsheet },
] as const;

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { settings, toggleSidebarCollapsed, setQuickModal, logout } =
    useFinance();

  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const collapsed = settings.appearance.sidebarCollapsed;
  const initials = getInitials(settings.profile.name || 'FINORA');

  return (
    <>
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'sidebar-backdrop--open' : ''}`}
        onClick={onCloseMobile}
        aria-hidden={!mobileOpen}
      />

      <aside
        className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${
          mobileOpen ? 'sidebar--mobile-open' : ''
        }`}
        aria-label="Primary Navigation"
      >
        <div className="sidebar-top">
          <div className="sidebar-brand-row">
            <NavLink
              to="/"
              className="brand-mark"
              onClick={onCloseMobile}
              title="FINORA Dashboard"
            >
              <div className="brand-logo-box">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 6.5C5 5.67 5.67 5 6.5 5H19V8.5H8.5V11H16V14.5H8.5V19H5V6.5Z"
                    fill="#FFFFFF"
                  />
                  <circle cx="17.5" cy="16.5" r="2.5" fill="#C4B5FD" />
                </svg>
              </div>
              {!collapsed && (
                <div className="brand-text-group">
                  <span className="brand-name">FINORA</span>
                  <span className="brand-tagline">Personal Finance</span>
                </div>
              )}
            </NavLink>

            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={toggleSidebarCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            </button>

            {mobileOpen && (
              <button
                type="button"
                className="icon-btn"
                style={{ width: '32px', height: '32px' }}
                onClick={onCloseMobile}
                aria-label="Close navigation menu"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div>
            {!collapsed && <div className="sidebar-section-label">Workspace</div>}
            <nav className="sidebar-nav">
              {MAIN_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={'end' in item ? item.end : false}
                    onClick={onCloseMobile}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `nav-item ${isActive ? 'nav-item--active' : ''}`
                    }
                  >
                    <Icon size={18} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="sidebar-bottom">
          <NavLink
            to="/settings"
            onClick={onCloseMobile}
            title={collapsed ? 'Settings' : undefined}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'nav-item--active' : ''}`
            }
          >
            <Settings size={18} />
            {!collapsed && <span>Settings</span>}
          </NavLink>

          <button
            type="button"
            className="nav-item"
            title={collapsed ? 'Help & Support' : undefined}
            onClick={() => {
              onCloseMobile();
              setQuickModal({ kind: 'help' });
            }}
          >
            <HelpCircle size={18} />
            {!collapsed && <span>Help &amp; Support</span>}
          </button>

          <div className="sidebar-user-card" title={settings.profile.name}>
            <span className="avatar-circle">{initials}</span>
            {!collapsed && (
              <div className="sidebar-user-meta">
                <div className="sidebar-user-name">
                  {settings.profile.name || 'Member'}
                </div>
                <div className="sidebar-user-badge">
                  Authenticated
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="nav-item"
            style={{ color: 'var(--danger)' }}
            title={collapsed ? 'Sign Out' : undefined}
            onClick={() => setConfirmLogoutOpen(true)}
          >
            <LogOut size={17} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      <Modal
        isOpen={confirmLogoutOpen}
        onClose={() => setConfirmLogoutOpen(false)}
        title="Sign Out of FINORA?"
        subtitle="Your financial data stays saved securely in the backend database."
      >
        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Signing out clears your active session token from this browser and returns you to the sign-in screen.
        </p>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirmLogoutOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setConfirmLogoutOpen(false);
              onCloseMobile();
              logout();
            }}
          >
            Sign Out
          </button>
        </div>
      </Modal>
    </>
  );
}

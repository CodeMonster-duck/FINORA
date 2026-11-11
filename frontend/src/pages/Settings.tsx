import { useState } from 'react';
import type { FormEvent } from 'react';
import { format } from 'date-fns';
import {
  CheckCircle2,
  Database,
  Download,
  Info,
  LogOut,
  Moon,
  RefreshCw,
  Save,
  Sun,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../components/PageHeader';
import { useFinance } from '../context/financeStore';
import { extractApiError } from '../services/api';
import { financeService } from '../services/financeService';
import { saveLocalUiPreferences } from '../services/storageService';
import type {
  AnalyticsPeriod,
  CurrencyCode,
  DateFormatOption,
  ThemeMode,
  UserSettings,
} from '../types';
import { validateProfileSettings } from '../utils/validators';

interface ProfileFormProps {
  profile: UserSettings['profile'];
  onSave: (nextProfile: UserSettings['profile']) => Promise<boolean>;
}

function ProfileForm({ profile, onSave }: ProfileFormProps) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [role, setRole] = useState(profile.role);
  const [incomeTarget, setIncomeTarget] = useState(
    String(profile.monthlyIncomeTarget),
  );
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextProfile: UserSettings['profile'] = {
      ...profile,
      name: name.trim(),
      email: email.trim(),
      role: role.trim(),
      monthlyIncomeTarget: Number(incomeTarget || 0),
    };

    const validation = validateProfileSettings(nextProfile);
    if (!validation.isValid) {
      setProfileErrors(validation.errors);
      return;
    }

    setProfileErrors({});
    setSaving(true);
    await onSave(nextProfile);
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <div className="form-field form-field--full">
          <label className="form-label" htmlFor="set-name">
            Display Name *
          </label>
          <input
            id="set-name"
            type="text"
            className={`form-input ${profileErrors.name ? 'form-input--error' : ''}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (profileErrors.name) {
                setProfileErrors((prev) => ({ ...prev, name: '' }));
              }
            }}
          />
          {profileErrors.name && (
            <span className="form-error-text">{profileErrors.name}</span>
          )}
        </div>

        <div className="form-field form-field--full">
          <label className="form-label" htmlFor="set-email">
            Contact Email *
          </label>
          <input
            id="set-email"
            type="email"
            className={`form-input ${profileErrors.email ? 'form-input--error' : ''}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (profileErrors.email) {
                setProfileErrors((prev) => ({ ...prev, email: '' }));
              }
            }}
          />
          {profileErrors.email && (
            <span className="form-error-text">{profileErrors.email}</span>
          )}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="set-role">
            Profile Role / Persona
          </label>
          <input
            id="set-role"
            type="text"
            className="form-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="set-income-target">
            Monthly Income Target (₹)
          </label>
          <input
            id="set-income-target"
            type="number"
            min="0"
            step="500"
            className={`form-input tabular-nums ${
              profileErrors.monthlyIncomeTarget ? 'form-input--error' : ''
            }`}
            value={incomeTarget}
            onChange={(e) => setIncomeTarget(e.target.value)}
          />
        </div>
      </div>

      <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Save size={15} /> {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </form>
  );
}

export function Settings() {
  const {
    transactions,
    budgets,
    savingsGoals,
    settings,
    updateProfileSettings,
    updatePreferencesSettings,
    reloadData,
    logout,
  } = useFinance();

  const [refreshing, setRefreshing] = useState(false);

  const handlePreferenceChange = async (
    patch: Partial<UserSettings['preferences']>,
  ) => {
    const nextPrefs = { ...settings.preferences, ...patch };
    saveLocalUiPreferences({
      defaultPeriod: nextPrefs.defaultPeriod,
      sidebarCollapsed: settings.appearance.sidebarCollapsed,
    });

    await updatePreferencesSettings({
      ...settings,
      preferences: nextPrefs,
    });
  };

  const handleThemeSelect = async (theme: ThemeMode) => {
    await updatePreferencesSettings({
      ...settings,
      appearance: { ...settings.appearance, theme },
    });
  };

  const handleNotificationToggle = async (
    key: keyof UserSettings['notifications'],
  ) => {
    await updatePreferencesSettings({
      ...settings,
      notifications: {
        ...settings.notifications,
        [key]: !settings.notifications[key],
      },
    });
  };

  const handleExportJsonBackup = () => {
    const payload = {
      app: 'FINORA',
      exportedAt: new Date().toISOString(),
      mode: 'authenticated-account',
      transactions,
      budgets,
      savingsGoals,
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finora-snapshot-${format(new Date(), 'yyyy-MM-dd')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Downloaded JSON workspace snapshot.');
  };

  const handleExportCsvBackup = async () => {
    try {
      await financeService.downloadTransactionsCsv();
      toast.success('Exported transactions CSV from backend.');
    } catch (err) {
      toast.error(extractApiError(err).message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, currency & date preferences, theme, and active backend session."
        badge={<span className="badge badge-purple">Authenticated Account</span>}
      />

      <section
        className="card"
        style={{
          background:
            'linear-gradient(135deg, rgba(139, 92, 246, 0.14), rgba(56, 189, 248, 0.06))',
          borderColor: 'var(--accent-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Info
            size={19}
            style={{ color: 'var(--accent-lavender)', marginTop: '2px', flexShrink: 0 }}
          />
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700 }}>
              Authenticated Personal Account
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginTop: '4px',
                lineHeight: 1.5,
              }}
            >
              Your transactions, budgets, savings goals, notifications, and profile preferences
              are stored in the FastAPI + SQLite database and isolated to your signed-in account
              via JWT Bearer authentication.
            </p>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="card card-purple-border">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} style={{ color: 'var(--accent-lavender)' }} />
              <div>
                <h2 className="card-title">Account Profile</h2>
                <p className="card-subtitle">
                  Updates your stored user record via PATCH /api/v1/auth/me
                </p>
              </div>
            </div>
          </div>

          <ProfileForm
            key={`${settings.profile.name}-${settings.profile.email}-${settings.profile.monthlyIncomeTarget}`}
            profile={settings.profile}
            onSave={updateProfileSettings}
          />
        </section>

        <section className="card card-purple-border">
          <div className="card-header">
            <div>
              <h2 className="card-title">Preferences &amp; Appearance</h2>
              <p className="card-subtitle">
                Synced to your backend profile via PATCH /api/v1/auth/me/preferences
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label" htmlFor="set-currency">
                  Display Currency
                </label>
                <select
                  id="set-currency"
                  className="form-select"
                  value={settings.preferences.currency}
                  onChange={(e) =>
                    void handlePreferenceChange({
                      currency: e.target.value as CurrencyCode,
                    })
                  }
                >
                  <option value="INR">INR (₹) — Indian Rupee</option>
                  <option value="USD">USD ($) — US Dollar</option>
                  <option value="EUR">EUR (€) — Euro</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="set-date-format">
                  Date Format
                </label>
                <select
                  id="set-date-format"
                  className="form-select"
                  value={settings.preferences.dateFormat}
                  onChange={(e) =>
                    void handlePreferenceChange({
                      dateFormat: e.target.value as DateFormatOption,
                    })
                  }
                >
                  <option value="DD MMM YYYY">11 Nov 2026</option>
                  <option value="DD/MM/YYYY">11/11/2026</option>
                  <option value="YYYY-MM-DD">2026-11-11</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="set-period">
                  Default Chart Period
                </label>
                <select
                  id="set-period"
                  className="form-select"
                  value={settings.preferences.defaultPeriod}
                  onChange={(e) =>
                    void handlePreferenceChange({
                      defaultPeriod: e.target.value as AnalyticsPeriod,
                    })
                  }
                >
                  <option value="3M">3 Months</option>
                  <option value="6M">6 Months</option>
                  <option value="12M">12 Months</option>
                </select>
              </div>

              <div className="form-field">
                <span className="form-label">Interface Theme</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${
                      settings.appearance.theme === 'dark'
                        ? 'btn-primary'
                        : 'btn-secondary'
                    }`}
                    onClick={() => void handleThemeSelect('dark')}
                  >
                    <Moon size={14} /> Dark
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${
                      settings.appearance.theme === 'light'
                        ? 'btn-primary'
                        : 'btn-secondary'
                    }`}
                    onClick={() => void handleThemeSelect('light')}
                  >
                    <Sun size={14} /> Light
                  </button>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                }}
              >
                <span>Compact KPI values (e.g., ₹1.2L instead of ₹1,20,000)</span>
                <input
                  type="checkbox"
                  checked={settings.preferences.compactNumbers}
                  onChange={(e) =>
                    void handlePreferenceChange({ compactNumbers: e.target.checked })
                  }
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                }}
              >
                <span>Show Financial Health Score 4-factor breakdown</span>
                <input
                  type="checkbox"
                  checked={settings.preferences.showHealthScoreBreakdown}
                  onChange={(e) =>
                    void handlePreferenceChange({
                      showHealthScoreBreakdown: e.target.checked,
                    })
                  }
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                }}
              >
                <span>Budget threshold &amp; overspending alerts</span>
                <input
                  type="checkbox"
                  checked={settings.notifications.budgetAlerts}
                  onChange={() => void handleNotificationToggle('budgetAlerts')}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                }}
              >
                <span>Savings goal milestone alerts</span>
                <input
                  type="checkbox"
                  checked={settings.notifications.goalMilestones}
                  onChange={() => void handleNotificationToggle('goalMilestones')}
                />
              </label>
            </div>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card card-purple-border">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} style={{ color: 'var(--info)' }} />
              <div>
                <h2 className="card-title">Workspace Data &amp; Session</h2>
                <p className="card-subtitle">
                  Live record counts synced from FastAPI &amp; export utilities
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '10px',
              padding: '12px',
              borderRadius: '12px',
              background: 'var(--bg-secondary-surface)',
              marginBottom: '18px',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Transactions
              </span>
              <div className="tabular-nums" style={{ fontWeight: 700, fontSize: '16px' }}>
                {transactions.length}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Budgets</span>
              <div className="tabular-nums" style={{ fontWeight: 700, fontSize: '16px' }}>
                {budgets.length}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Goals</span>
              <div className="tabular-nums" style={{ fontWeight: 700, fontSize: '16px' }}>
                {savingsGoals.length}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await reloadData();
                setRefreshing(false);
                toast.success('Synced with backend.');
              }}
            >
              <RefreshCw size={15} />
              {refreshing ? 'Syncing...' : 'Refresh Workspace'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleExportCsvBackup()}
            >
              <Download size={15} />
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportJsonBackup}
            >
              <Download size={15} />
              Export JSON
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={logout}
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </section>

        <section className="card card-purple-border">
          <div className="card-header">
            <div>
              <h2 className="card-title">About FINORA</h2>
              <p className="card-subtitle">
                Smart Personal Finance &amp; Expense Management Platform
              </p>
            </div>
            <span className="badge badge-success">
              <CheckCircle2 size={12} /> FastAPI Connected
            </span>
          </div>

          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong>&ldquo;Take control of your money. Understand every rupee.&rdquo;</strong>
            <br />
            Full-stack personal finance platform powered by React 19, TypeScript, Vite,
            Recharts, FastAPI, SQLAlchemy, and SQLite with JWT authentication and
            integer-paise financial accuracy.
          </p>

          <div
            style={{
              marginTop: '14px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span className="badge badge-purple">JWT Authenticated</span>
            <span className="badge badge-neutral">Integer-Paise Math</span>
            <span className="badge badge-neutral">Indian INR (₹) Formatting</span>
            <span className="badge badge-neutral">FastAPI + SQLite</span>
          </div>
        </section>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useFinance } from '../context/financeStore';

export function AuthScreen() {
  const { login, register, authSubmitting } = useFinance();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Personal Finance Member');
  const [monthlyIncomeTarget, setMonthlyIncomeTarget] = useState('50000');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (mode === 'register') {
      if (name.trim().length < 2) {
        setFormError('Full name must be at least 2 characters.');
        return;
      }
      if (password.length < 6) {
        setFormError('Password must be at least 6 characters.');
        return;
      }
    }

    if (!email.trim() || !password) {
      setFormError('Email and password are required.');
      return;
    }

    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          role: role.trim() || 'Personal Finance Member',
          monthly_income_target: Number(monthlyIncomeTarget || 0),
        });
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Authentication failed.',
      );
    }
  };

  return (
    <div
      className="app-shell"
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="card card-purple-border"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '32px 28px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            className="brand-logo-box"
            style={{ width: '50px', height: '50px', margin: '0 auto 14px' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 6.5C5 5.67 5.67 5 6.5 5H19V8.5H8.5V11H16V14.5H8.5V19H5V6.5Z"
                fill="#FFFFFF"
              />
              <circle cx="17.5" cy="16.5" r="2.5" fill="#C4B5FD" />
            </svg>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>FINORA</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Take control of your money. Understand every rupee.
          </p>
        </div>

        <div
          className="segmented-control"
          style={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            marginBottom: '20px',
          }}
        >
          <button
            type="button"
            className={`segmented-btn ${mode === 'login' ? 'segmented-btn--active' : ''}`}
            style={{ padding: '8px 12px' }}
            onClick={() => {
              setMode('login');
              setFormError(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`segmented-btn ${mode === 'register' ? 'segmented-btn--active' : ''}`}
            style={{ padding: '8px 12px' }}
            onClick={() => {
              setMode('register');
              setFormError(null);
            }}
          >
            Create Account
          </button>
        </div>

        {formError && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'var(--danger-soft)',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              color: 'var(--danger)',
              fontSize: '12.5px',
              marginBottom: '14px',
            }}
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mode === 'register' && (
              <div className="form-field">
                <label className="form-label" htmlFor="auth-name">
                  Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <User
                    size={15}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                    }}
                  />
                  <input
                    id="auth-name"
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: '36px' }}
                    placeholder="e.g., Aarav Sharma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="form-field">
              <label className="form-label" htmlFor="auth-email">
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  id="auth-email"
                  type="email"
                  className="form-input"
                  style={{ paddingLeft: '36px' }}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="auth-password">
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  id="auth-password"
                  type="password"
                  className="form-input"
                  style={{ paddingLeft: '36px' }}
                  placeholder={mode === 'register' ? 'Minimum 6 characters' : 'Enter password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                />
              </div>
            </div>

            {mode === 'register' && (
              <div className="form-grid">
                <div className="form-field">
                  <label className="form-label" htmlFor="auth-role">
                    Profile Role
                  </label>
                  <input
                    id="auth-role"
                    type="text"
                    className="form-input"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="auth-target">
                    Monthly Target (₹)
                  </label>
                  <input
                    id="auth-target"
                    type="number"
                    min="0"
                    step="500"
                    className="form-input tabular-nums"
                    value={monthlyIncomeTarget}
                    onChange={(e) => setMonthlyIncomeTarget(e.target.value)}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '4px' }}
              disabled={authSubmitting}
            >
              {authSubmitting
                ? 'Authenticating...'
                : mode === 'login'
                  ? 'Sign In to FINORA'
                  : 'Create Account'}
            </button>
          </div>
        </form>

        <div
          style={{
            marginTop: '18px',
            paddingTop: '14px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '11.5px',
            color: 'var(--text-muted)',
          }}
        >
          <ShieldCheck size={13} />
          <span>Secured with JWT authentication &amp; encrypted password hashing</span>
        </div>
      </div>
    </div>
  );
}

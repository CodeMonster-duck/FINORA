import { AlertTriangle, Bell, CheckCheck, Info, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '../context/financeStore';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const navigate = useNavigate();
  const {
    notifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useFinance();

  if (!isOpen) return null;

  return (
    <div
      className="dropdown-panel"
      role="region"
      aria-label="Notifications"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} style={{ color: 'var(--accent-lavender)' }} />
          <span style={{ fontWeight: 700, fontSize: '14px' }}>Notifications</span>
          {unreadNotificationCount > 0 && (
            <span className="badge badge-purple">{unreadNotificationCount} new</span>
          )}
        </div>

        {unreadNotificationCount > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={markAllNotificationsRead}
          >
            <CheckCheck size={14} />
            Mark read
          </button>
        )}
      </div>

      <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            All caught up! No active alerts right now.
          </div>
        ) : (
          notifications.map((item) => {
            const iconBg =
              item.tone === 'danger'
                ? 'var(--danger-soft)'
                : item.tone === 'warning'
                  ? 'var(--warning-soft)'
                  : item.tone === 'positive'
                    ? 'var(--success-soft)'
                    : 'var(--info-soft)';

            const iconColor =
              item.tone === 'danger'
                ? 'var(--danger)'
                : item.tone === 'warning'
                  ? 'var(--warning)'
                  : item.tone === 'positive'
                    ? 'var(--success)'
                    : 'var(--info)';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  markNotificationRead(item.id);
                  navigate(item.route);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  width: '100%',
                  padding: '13px 16px',
                  border: 'none',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: item.read ? 'transparent' : 'rgba(139, 92, 246, 0.05)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '9px',
                    backgroundColor: iconBg,
                    color: iconColor,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {item.tone === 'danger' || item.tone === 'warning' ? (
                    <AlertTriangle size={15} />
                  ) : item.tone === 'positive' ? (
                    <Sparkles size={15} />
                  ) : (
                    <Info size={15} />
                  )}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: item.read ? 500 : 700,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {item.title}
                    </span>
                    {!item.read && (
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '999px',
                          backgroundColor: 'var(--accent-primary)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginTop: '3px',
                      lineHeight: 1.4,
                    }}
                  >
                    {item.message}
                  </p>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      marginTop: '4px',
                      display: 'inline-block',
                    }}
                  >
                    {item.timestamp}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

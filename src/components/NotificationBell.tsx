import React, { useRef, useEffect } from 'react';
import { Bell, CheckCheck, MessageSquare, CheckCircle2, FileText, GitPullRequestArrow, Clock, AlertTriangle, Wrench } from 'lucide-react';
import { AppNotification, NotifyEvent } from '../types';
import { UseNotificationsResult } from '../hooks/useNotifications';

// ── Type → visual mapping ─────────────────────────────────────────────────────

interface NotifStyle { icon: React.ReactNode; color: string; bg: string; }

function getNotifStyle(type: NotifyEvent): NotifStyle {
  switch (type) {
    case 'dot_comments':   return { icon: <MessageSquare size={13} />, color: '#EF4444', bg: 'rgba(239,68,68,0.1)' };
    case 'status_change':  return { icon: <GitPullRequestArrow size={13} />, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' };
    case 'plan_approved':  return { icon: <CheckCircle2 size={13} />,   color: '#10B981', bg: 'rgba(16,185,129,0.1)' };
    case 'plan_expired':   return { icon: <Clock size={13} />,          color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' };
    case 'comment':        return { icon: <MessageSquare size={13} />,  color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' };
    case 'doc_uploaded':   return { icon: <FileText size={13} />,       color: '#06B6D4', bg: 'rgba(6,182,212,0.1)' };
    case 'window_expiring':return { icon: <Clock size={13} />,          color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' };
    case 'nv_expiring':       return { icon: <AlertTriangle size={13} />, color: '#7C3AED', bg: 'rgba(124,58,237,0.1)' };
    case 'feedback_updated':  return { icon: <Wrench size={13} />,        color: '#10B981', bg: 'rgba(16,185,129,0.1)' };
    case 'feedback_comment':  return { icon: <MessageSquare size={13} />, color: '#6366F1', bg: 'rgba(99,102,241,0.1)' };
    default:                  return { icon: <Bell size={13} />,          color: '#64748B', bg: 'rgba(100,116,139,0.1)' };
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface NotificationBellProps {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: UseNotificationsResult['markRead'];
  markAllRead: UseNotificationsResult['markAllRead'];
  open: boolean;
  setOpen: (open: boolean) => void;
  onNavigate: (n: AppNotification) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications, unreadCount, markRead, markAllRead, open, setOpen, onNavigate,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setOpen]);

  const handleItemClick = (n: AppNotification) => {
    if (!n.read) markRead(n.id);
    onNavigate(n);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        title="Notifications"
        style={{
          position: 'relative',
          background: 'none', border: 'none', cursor: 'pointer',
          color: open ? 'var(--text-primary)' : 'var(--text-secondary)',
          padding: 6, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 1, right: 1,
            minWidth: 16, height: 16, borderRadius: 8,
            background: '#EF4444', color: '#fff',
            fontSize: 9, fontWeight: 700, lineHeight: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px',
            border: '1.5px solid var(--bg-surface)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 340,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '11px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Notifications</span>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: '#EF4444', color: '#fff',
                  padding: '1px 7px', borderRadius: 10,
                }}>{unreadCount} new</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, color: '#3B82F6',
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontFamily: 'inherit', padding: '3px 6px', borderRadius: 6,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          {/* Items */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '32px 16px', textAlign: 'center',
                color: 'var(--text-secondary)', fontSize: 13,
              }}>
                <Bell size={24} style={{ opacity: 0.3, marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
                No notifications yet
              </div>
            ) : (
              notifications.map(n => {
                const style = getNotifStyle(n.type);
                return (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      cursor: 'pointer',
                      background: n.read ? 'transparent' : 'rgba(59,130,246,0.03)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(59,130,246,0.03)')}
                  >
                    {/* Unread dot */}
                    <div style={{ paddingTop: 5, flexShrink: 0, width: 8, display: 'flex', justifyContent: 'center' }}>
                      {!n.read && (
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3B82F6' }} />
                      )}
                    </div>

                    {/* Icon badge */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: style.bg, color: style.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {style.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: n.read ? 500 : 700, color: 'var(--text-primary)' }}>
                          {n.title}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 8 }}>
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      {(n.planLoc || n.location) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          {n.planLoc && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace',
                              color: style.color, background: style.bg,
                              padding: '1px 5px', borderRadius: 4, flexShrink: 0,
                            }}>{n.planLoc}</span>
                          )}
                          {n.location && (
                            <span style={{
                              fontSize: 11, color: 'var(--text-secondary)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{n.location}</span>
                          )}
                        </div>
                      )}
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {n.body}
                      </p>
                    </div>
                    {/* Navigate arrow */}
                    <div style={{ paddingTop: 6, flexShrink: 0, color: 'var(--text-secondary)', opacity: 0.4, fontSize: 11 }}>›</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

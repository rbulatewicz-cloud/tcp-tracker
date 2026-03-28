import React, { useState } from 'react';
import { Bell, X, CheckCheck, AlertTriangle, Clock, CheckCircle2, FileText, MessageSquare, ChevronRight, MapPin } from 'lucide-react';

// ─── Mock data ───────────────────────────────────────────────────────────────
const MOCK_NOTIFICATIONS = [
  {
    id: '1', read: false,
    type: 'dot_comments',
    icon: <MessageSquare size={14} />,
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.1)',
    title: 'DOT Comments Received',
    plan: 'LOC-32',
    location: 'Oxnard St / Victory Blvd',
    body: 'DOT returned 3 comments. Review and respond.',
    time: '2 hours ago',
  },
  {
    id: '2', read: false,
    type: 'window_expiring',
    icon: <Clock size={14} />,
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.1)',
    title: 'Window Expiring Soon',
    plan: 'LOC-15',
    location: '5th St / Harbor Blvd',
    body: 'Construction window closes in 6 days.',
    time: 'Yesterday',
  },
  {
    id: '3', read: false,
    type: 'lead_assigned',
    icon: <CheckCircle2 size={14} />,
    color: '#3B82F6',
    bg: 'rgba(59,130,246,0.1)',
    title: 'You were assigned as Lead',
    plan: 'LOC-41',
    location: 'Sepulveda Blvd / Roscoe Blvd',
    body: 'Mike Basso assigned you as the plan lead.',
    time: 'Yesterday',
  },
  {
    id: '4', read: true,
    type: 'plan_approved',
    icon: <CheckCircle2 size={14} />,
    color: '#10B981',
    bg: 'rgba(16,185,129,0.1)',
    title: 'Plan Approved',
    plan: 'LOC-28',
    location: 'Main St / 3rd St',
    body: 'LOC is active. Construction window: Apr 1–Apr 15.',
    time: 'Mar 22',
  },
];

// ─── In-App Bell Dropdown ─────────────────────────────────────────────────────
const InAppDemo: React.FC = () => {
  const [open, setOpen] = useState(true);
  const unread = MOCK_NOTIFICATIONS.filter(n => !n.read).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
      {/* Simulated header bar */}
      <div style={{
        width: 360,
        background: 'var(--bg-surface)',
        borderRadius: '12px 12px 0 0',
        border: '1px solid var(--border)',
        borderBottom: 'none',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>TCP Tracker</span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', padding: 6, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Bell size={18} />
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2,
              width: 16, height: 16, borderRadius: '50%',
              background: '#EF4444', color: '#fff',
              fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{unread}</span>
          )}
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          width: 360,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '0 0 12px 12px',
          boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Notifications</span>
              {unread > 0 && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 700,
                  background: '#EF4444', color: '#fff',
                  padding: '2px 7px', borderRadius: 10,
                }}>{unread} new</span>
              )}
            </div>
            <button style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: '#3B82F6',
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'inherit',
            }}>
              <CheckCheck size={12} /> Mark all read
            </button>
          </div>

          {/* Items */}
          {MOCK_NOTIFICATIONS.map(n => (
            <div key={n.id} style={{
              padding: '11px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer',
              background: n.read ? 'transparent' : 'rgba(59,130,246,0.03)',
              transition: 'background 0.1s',
            }}>
              {/* Unread dot */}
              <div style={{ paddingTop: 4, flexShrink: 0, width: 8, display: 'flex', justifyContent: 'center' }}>
                {!n.read && (
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3B82F6' }} />
                )}
              </div>

              {/* Icon badge */}
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: n.bg, color: n.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {n.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: n.read ? 500 : 700, color: 'var(--text-primary)' }}>
                    {n.title}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 8 }}>
                    {n.time}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace',
                    color: n.color, background: n.bg,
                    padding: '1px 6px', borderRadius: 4,
                  }}>{n.plan}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.location}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {n.body}
                </p>
              </div>
            </div>
          ))}

          {/* Footer */}
          <div style={{
            padding: '10px 16px',
            display: 'flex', justifyContent: 'center',
          }}>
            <button style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: '#3B82F6',
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'inherit',
            }}>
              View all notifications <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Email Preview ─────────────────────────────────────────────────────────────
const EmailDemo: React.FC = () => (
  <div style={{
    width: 480,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    background: '#F8FAFC',
    borderRadius: 12,
    border: '1px solid #E2E8F0',
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
  }}>
    {/* Email client chrome */}
    <div style={{ background: '#E2E8F0', padding: '8px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }} />
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
      <span style={{ marginLeft: 8, fontSize: 11, color: '#64748B' }}>
        From: TCP Tracker &lt;noreply@tcptracker.app&gt; · To: garrett@sftc.com
      </span>
    </div>

    {/* Email body */}
    <div style={{ background: '#fff', padding: '32px 36px' }}>

      {/* Header */}
      <div style={{ borderBottom: '2px solid #F1F5F9', paddingBottom: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'linear-gradient(135deg, #F97316, #EA580C)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle2 size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>TCP Tracker</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>ESFV LRT — San Fernando Transit Constructors</div>
          </div>
        </div>
      </div>

      {/* Alert banner */}
      <div style={{
        background: '#FEF2F2', border: '1px solid #FECACA',
        borderLeft: '4px solid #EF4444',
        borderRadius: 8, padding: '12px 14px',
        display: 'flex', gap: 10, alignItems: 'flex-start',
        marginBottom: 20,
      }}>
        <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#991B1B', marginBottom: 2 }}>
            DOT Comments Received
          </div>
          <div style={{ fontSize: 11, color: '#B91C1C' }}>
            Action required — review and respond to keep your plan on track.
          </div>
        </div>
      </div>

      {/* Body text */}
      <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, margin: '0 0 20px' }}>
        Hi <strong>Garrett</strong>, DOT has returned the submission package for{' '}
        <strong>LOC-32</strong> with comments. You're receiving this because you submitted this request.
      </p>

      {/* Plan info card */}
      <div style={{
        background: '#F8FAFC', border: '1px solid #E2E8F0',
        borderRadius: 10, padding: '14px 16px', marginBottom: 24,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
          {[
            ['LOC #', 'LOC-32'],
            ['Stage', 'DOT Review Cycle #1'],
            ['Location', 'Oxnard St / Victory Blvd'],
            ['Lead', 'Mike Basso'],
            ['Submitted', 'Mar 20, 2026'],
            ['Priority', 'High'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                {label}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <a href="#" style={{
          display: 'inline-block',
          background: 'linear-gradient(135deg, #F97316, #EA580C)',
          color: '#fff', textDecoration: 'none',
          padding: '11px 28px', borderRadius: 8,
          fontSize: 13, fontWeight: 700,
          boxShadow: '0 2px 8px rgba(249,115,22,0.35)',
        }}>
          View Plan &amp; Comments →
        </a>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid #F1F5F9', paddingTop: 16,
        fontSize: 10, color: '#94A3B8', lineHeight: 1.6, textAlign: 'center',
      }}>
        You're receiving this because you requested LOC-32.<br />
        <a href="#" style={{ color: '#3B82F6', textDecoration: 'none' }}>Manage preferences</a>
        {' · '}
        <a href="#" style={{ color: '#3B82F6', textDecoration: 'none' }}>Unsubscribe</a>
      </div>
    </div>
  </div>
);

// ─── Main export ──────────────────────────────────────────────────────────────
export const NotificationPreviews: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 9998,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24, gap: 40, flexWrap: 'wrap',
  }}>
    <button onClick={onClose} style={{
      position: 'absolute', top: 20, right: 20,
      background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
      color: '#fff', cursor: 'pointer', padding: 8, display: 'flex',
    }}>
      <X size={18} />
    </button>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' }}>
        In-App · Bell Dropdown
      </span>
      <InAppDemo />
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' }}>
        Email Notification
      </span>
      <EmailDemo />
    </div>
  </div>
);

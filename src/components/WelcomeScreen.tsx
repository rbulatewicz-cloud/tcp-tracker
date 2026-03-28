import React, { useState } from 'react';
import { Bell, UserCircle, Mail, CheckCircle2, Zap, Clock, VolumeX, BookmarkCheck } from 'lucide-react';
import { User, NotificationPrefs, NotifyEvent, NotifyFrequency } from '../types';
import { SEGMENTS } from '../constants';

interface WelcomeScreenProps {
  user: User;
  onComplete: (data: NotificationPrefs) => Promise<void>;
}

const NOTIFY_OPTIONS: { key: NotifyEvent; label: string; description: string }[] = [
  { key: 'status_change',    label: 'Status Changes',       description: 'When a plan moves to a new stage' },
  { key: 'comment',          label: 'Comments & Notes',     description: 'When MOT or team adds a note' },
  { key: 'doc_uploaded',     label: 'Documents Uploaded',   description: 'When a TCP drawing or LOC is attached' },
  { key: 'window_expiring',  label: 'Window Expiring Soon', description: '7 days before an implementation window closes' },
];

const FREQ_OPTIONS: { key: NotifyFrequency; label: string; icon: React.ReactNode; description: string }[] = [
  { key: 'immediate',    label: 'Immediate',    icon: <Zap size={14} />,     description: 'Send as it happens' },
  { key: 'daily_digest', label: 'Daily Digest', icon: <Clock size={14} />,   description: 'One email each morning' },
  { key: 'off',          label: 'Off',          icon: <VolumeX size={14} />, description: 'No emails for now' },
];

const AUTO_FOLLOW_TOGGLES: { key: 'myRequests' | 'myLeads' | 'onComment'; label: string; description: string; defaultOn: boolean }[] = [
  { key: 'myRequests', label: 'Plans I request',           description: 'Auto-follow any plan you submit',                   defaultOn: true  },
  { key: 'myLeads',    label: 'Plans assigned to me',      description: 'Auto-follow plans where you\'re the assigned lead', defaultOn: true  },
  { key: 'onComment',  label: 'Plans I comment on',        description: 'Auto-follow any plan you add a note or log entry to', defaultOn: false },
];

const CheckRow: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
  accentColor: string;
}> = ({ checked, onChange, label, description, accentColor }) => (
  <label style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${checked ? accentColor : 'var(--border)'}`,
    background: checked ? `${accentColor}12` : 'var(--bg-surface-2)',
    transition: 'all 0.15s',
  }}>
    <input
      type="checkbox" checked={checked} onChange={onChange}
      style={{ accentColor, width: 14, height: 14, flexShrink: 0 }}
    />
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{description}</div>
    </div>
  </label>
);

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ user, onComplete }) => {
  const [displayName, setDisplayName]   = useState(user.name || '');
  const [title, setTitle]               = useState('');
  const [notificationEmail, setNotificationEmail] = useState(user.email || '');
  const [notifyOn, setNotifyOn]         = useState<NotifyEvent[]>(['status_change', 'window_expiring']);
  const [frequency, setFrequency]       = useState<NotifyFrequency>('daily_digest');
  const [autoFollow, setAutoFollow]     = useState({ myRequests: true, myLeads: true, onComment: false });
  const [followSegments, setFollowSegments] = useState<string[]>([]);
  const [saving, setSaving]             = useState(false);

  const toggleNotify = (key: NotifyEvent) => {
    setNotifyOn(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const toggleSegment = (seg: string) => {
    setFollowSegments(prev => prev.includes(seg) ? prev.filter(s => s !== seg) : [...prev, seg]);
  };

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    await onComplete({
      displayName, title, notificationEmail, notifyOn,
      notificationFrequency: frequency,
      autoFollow: { ...autoFollow, segments: followSegments },
    });
    setSaving(false);
  };

  const inp: React.CSSProperties = {
    background: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 13px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const lbl: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 5,
    display: 'block',
  };

  const sectionHeader = (icon: React.ReactNode, label: string, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );


  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        width: '100%',
        maxWidth: 560,
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ padding: '32px 32px 24px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg, #F97316, #EA580C)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 4px 14px rgba(249,115,22,0.35)',
          }}>
            <CheckCircle2 size={28} color="#fff" />
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            Welcome to TCP Tracker
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Let's set up your profile so your team can identify you<br />
            and you receive the right notifications.
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* ── Identity ── */}
          <div>
            {sectionHeader(<UserCircle size={15} color="#F97316" />, 'Your Identity', '#F97316')}
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Your display name appears in activity logs and comments across all plans.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Display Name *</label>
                <input style={inp} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Mike Basso" />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>Shown in activity logs</span>
              </div>
              <div>
                <label style={lbl}>Job Title</label>
                <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. MOT Coordinator" />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>Helps your team identify your role</span>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* ── Auto-Follow ── */}
          <div>
            {sectionHeader(<BookmarkCheck size={15} color="#10B981" />, 'Auto-Follow Plans', '#10B981')}
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Automatically subscribe to plans based on your involvement — you'll receive notifications for anything you follow.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {AUTO_FOLLOW_TOGGLES.map(opt => (
                <CheckRow
                  key={opt.key}
                  checked={autoFollow[opt.key]}
                  onChange={() => setAutoFollow(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                  label={opt.label}
                  description={opt.description}
                  accentColor="#10B981"
                />
              ))}
            </div>

            {/* Segment follow */}
            <div>
              <label style={lbl}>Also follow all plans in these segments</label>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                Good for leads who own a segment — you'll be subscribed to every plan in it.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SEGMENTS.map(seg => (
                  <button
                    key={seg}
                    onClick={() => toggleSegment(seg)}
                    style={{
                      padding: '5px 13px',
                      borderRadius: 20,
                      border: `1.5px solid ${followSegments.includes(seg) ? '#10B981' : 'var(--border)'}`,
                      background: followSegments.includes(seg) ? 'rgba(16,185,129,0.1)' : 'var(--bg-surface-2)',
                      color: followSegments.includes(seg) ? '#10B981' : 'var(--text-secondary)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.15s', fontFamily: 'inherit',
                    }}
                  >
                    {seg}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* ── Notifications ── */}
          <div>
            {sectionHeader(<Bell size={15} color="#3B82F6" />, 'Notifications', '#3B82F6')}
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
              We'll send notifications to this email for the plans you follow — use your work address for company-wide visibility.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>
                <Mail size={10} style={{ display: 'inline', marginRight: 4 }} />
                Notification Email
              </label>
              <input style={inp} type="email" value={notificationEmail} onChange={e => setNotificationEmail(e.target.value)} placeholder="you@company.com" />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                Can be different from your Google login — use your company email here
              </span>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Notify me when</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {NOTIFY_OPTIONS.map(opt => (
                  <CheckRow
                    key={opt.key}
                    checked={notifyOn.includes(opt.key)}
                    onChange={() => toggleNotify(opt.key)}
                    label={opt.label}
                    description={opt.description}
                    accentColor="#3B82F6"
                  />
                ))}
              </div>
            </div>

            <div>
              <label style={lbl}>Delivery Frequency</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {FREQ_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setFrequency(opt.key)}
                    style={{
                      padding: '10px 8px', borderRadius: 8, border: 'none',
                      outline: `1.5px solid ${frequency === opt.key ? '#3B82F6' : 'var(--border)'}`,
                      background: frequency === opt.key ? 'rgba(59,130,246,0.1)' : 'var(--bg-surface-2)',
                      color: frequency === opt.key ? '#3B82F6' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      transition: 'all 0.15s', fontFamily: 'inherit',
                    }}
                  >
                    {opt.icon}
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{opt.label}</span>
                    <span style={{ fontSize: 10, opacity: 0.75 }}>{opt.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 32px 28px',
          display: 'flex', alignItems: 'center', gap: 10,
          borderTop: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 'auto' }}>
            You can update this anytime in your profile settings
          </span>
          <button
            onClick={handleSave}
            disabled={!displayName.trim() || saving}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: !displayName.trim() ? 'var(--border)' : 'linear-gradient(135deg, #F97316, #EA580C)',
              color: !displayName.trim() ? 'var(--text-secondary)' : '#fff',
              fontSize: 13, fontWeight: 700,
              cursor: !displayName.trim() ? 'not-allowed' : 'pointer',
              boxShadow: displayName.trim() ? '0 2px 8px rgba(249,115,22,0.3)' : 'none',
              transition: 'all 0.15s', fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving…' : 'Get Started →'}
          </button>
        </div>
      </div>
    </div>
  );
};

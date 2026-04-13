import React, { useState, useEffect } from 'react';
import { X, UserCircle, Bell, Zap, Clock, VolumeX, BookmarkCheck, Save, Loader, Mail } from 'lucide-react';
import { User, NotificationPrefs, NotifyEvent, NotifyFrequency, EmailDelivery, EmailDeliveryPrefs } from '../types';
import { SEGMENTS } from '../constants';
import * as authService from '../services/authService';
import { showToast } from '../lib/toast';

interface ProfileModalProps {
  user: User;
  initialTab?: 'profile' | 'notifications';
  onClose: () => void;
  onSaved: (updated: Partial<User>) => void;
}

const NOTIFY_OPTIONS: { key: NotifyEvent; label: string; description: string }[] = [
  { key: 'status_change',   label: 'Status Changes',          description: 'When a plan moves to a new stage' },
  { key: 'comment',         label: 'Comments & Notes',        description: 'When MOT or team adds a note' },
  { key: 'doc_uploaded',    label: 'Documents Uploaded',      description: 'When a TCP drawing or LOC is attached' },
  { key: 'window_expiring', label: 'Window Expiring Soon',    description: '7 days before an implementation window closes' },
  { key: 'nv_expiring',     label: 'Noise Variance Expiring', description: 'When a linked variance is expiring in 30 or 7 days' },
];

const FREQ_OPTIONS: { key: NotifyFrequency; label: string; icon: React.ReactNode; description: string }[] = [
  { key: 'immediate',    label: 'Immediate',    icon: <Zap size={13} />,     description: 'Send as it happens' },
  { key: 'daily_digest', label: 'Daily Digest', icon: <Clock size={13} />,   description: 'One email each morning' },
  { key: 'off',          label: 'Off',          icon: <VolumeX size={13} />, description: 'No emails for now' },
];

const AUTO_FOLLOW_TOGGLES: { key: 'myRequests' | 'myLeads' | 'onComment'; label: string; description: string }[] = [
  { key: 'myRequests', label: 'Plans I request',      description: 'Auto-follow any plan you submit' },
  { key: 'myLeads',    label: 'Plans assigned to me', description: 'Auto-follow plans where you\'re the assigned lead' },
  { key: 'onComment',  label: 'Plans I comment on',   description: 'Auto-follow any plan you add a note or log entry to' },
];

const CheckRow: React.FC<{
  checked: boolean; onChange: () => void;
  label: string; description: string; accentColor: string;
}> = ({ checked, onChange, label, description, accentColor }) => (
  <label style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 11px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${checked ? accentColor : 'var(--border)'}`,
    background: checked ? `${accentColor}12` : 'var(--bg-surface-2)',
    transition: 'all 0.15s',
  }}>
    <input type="checkbox" checked={checked} onChange={onChange}
      style={{ accentColor, width: 13, height: 13, flexShrink: 0 }} />
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{description}</div>
    </div>
  </label>
);

export const ProfileModal: React.FC<ProfileModalProps> = ({ user, initialTab = 'profile', onClose, onSaved }) => {
  const [tab, setTab]             = useState<'profile' | 'notifications'>(initialTab);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  // Form state
  const [displayName, setDisplayName]             = useState('');
  const [title, setTitle]                         = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [notifyOn, setNotifyOn]                   = useState<NotifyEvent[]>(['status_change', 'window_expiring']);
  const [frequency, setFrequency]                 = useState<NotifyFrequency>('daily_digest');
  const [autoFollow, setAutoFollow]               = useState({ myRequests: true, myLeads: true, onComment: false });
  const [followSegments, setFollowSegments]       = useState<string[]>([]);
  const [emailDelivery, setEmailDelivery]         = useState<EmailDeliveryPrefs>({});

  // Load current profile from Firestore
  useEffect(() => {
    authService.fetchUserProfile(user.email).then(data => {
      setDisplayName(data.displayName || user.name || '');
      setTitle(data.title || '');
      setNotificationEmail(data.notificationEmail || user.email || '');
      setNotifyOn(data.notifyOn || ['status_change', 'window_expiring']);
      setFrequency(data.notificationFrequency || 'daily_digest');
      setAutoFollow({
        myRequests: data.autoFollow?.myRequests ?? true,
        myLeads:    data.autoFollow?.myLeads    ?? true,
        onComment:  data.autoFollow?.onComment  ?? false,
      });
      setFollowSegments(data.autoFollow?.segments || []);
      setEmailDelivery(data.emailDelivery || {});
      setLoading(false);
    });
  }, [user.email]);

  const toggleNotify   = (key: NotifyEvent)                  => setNotifyOn(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  const toggleSegment  = (seg: string)                       => setFollowSegments(prev => prev.includes(seg) ? prev.filter(s => s !== seg) : [...prev, seg]);

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const data: NotificationPrefs = {
        displayName, title, notificationEmail, notifyOn,
        notificationFrequency: frequency,
        autoFollow: { ...autoFollow, segments: followSegments },
        emailDelivery,
      };
      await authService.saveUserProfile(user.email, data);
      onSaved({ name: displayName, displayName, title, notificationEmail });
      showToast('Profile saved', 'success');
      onClose();
    } catch {
      showToast('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inp: React.CSSProperties = {
    background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', borderRadius: 8,
    padding: '9px 12px', fontSize: 13, width: '100%',
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5, display: 'block',
  };

  const initials = (displayName || user.name || '?')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        width: '100%', maxWidth: 520, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 22, flexShrink: 0,
            background: 'linear-gradient(135deg, #F97316, #EA580C)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 800, color: '#fff',
          }}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {displayName || user.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {user.role}{title ? ` · ${title}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', padding: 6, borderRadius: 8,
            display: 'flex', alignItems: 'center',
          }}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
          padding: '0 24px',
        }}>
          {([['profile', <UserCircle size={13} />, 'Profile'] as const,
             ['notifications', <Bell size={13} />, 'Notifications'] as const]).map(([key, icon, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '11px 14px', fontSize: 12, fontWeight: tab === key ? 700 : 500,
              color: tab === key ? '#F97316' : 'var(--text-secondary)',
              borderBottom: `2px solid ${tab === key ? '#F97316' : 'transparent'}`,
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit', transition: 'color 0.15s', marginBottom: -1,
            }}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Loader size={20} color="#F97316" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : tab === 'profile' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Display Name *</label>
                  <input style={inp} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Mike Basso" />
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>Shown in activity logs</span>
                </div>
                <div>
                  <label style={lbl}>Job Title</label>
                  <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. MOT Coordinator" />
                </div>
              </div>
              <div>
                <label style={lbl}>Login Email</label>
                <input style={{ ...inp, opacity: 0.6, cursor: 'not-allowed' }} value={user.email} readOnly />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                  Login email cannot be changed here — use your Google account settings
                </span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Notification email */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                  <Bell size={13} color="#3B82F6" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#3B82F6', letterSpacing: 1, textTransform: 'uppercase' }}>
                    Notification Email
                  </span>
                </div>
                <input style={inp} type="email" value={notificationEmail}
                  onChange={e => setNotificationEmail(e.target.value)} placeholder="you@company.com" />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                  Can differ from your Google login — use your company email for work notifications
                </span>
              </div>

              <div style={{ borderTop: '1px solid var(--border)' }} />

              {/* Auto-follow */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                  <BookmarkCheck size={13} color="#10B981" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', letterSpacing: 1, textTransform: 'uppercase' }}>
                    Auto-Follow Plans
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
                  {AUTO_FOLLOW_TOGGLES.map(opt => (
                    <CheckRow key={opt.key}
                      checked={autoFollow[opt.key]}
                      onChange={() => setAutoFollow(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                      label={opt.label} description={opt.description} accentColor="#10B981"
                    />
                  ))}
                </div>
                <label style={{ ...lbl, marginBottom: 8 }}>Also follow all plans in these segments</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SEGMENTS.map(seg => (
                    <button key={seg} onClick={() => toggleSegment(seg)} style={{
                      padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                      border: `1.5px solid ${followSegments.includes(seg) ? '#10B981' : 'var(--border)'}`,
                      background: followSegments.includes(seg) ? 'rgba(16,185,129,0.1)' : 'var(--bg-surface-2)',
                      color: followSegments.includes(seg) ? '#10B981' : 'var(--text-secondary)',
                      fontSize: 11, fontWeight: 600, transition: 'all 0.15s', fontFamily: 'inherit',
                    }}>{seg}</button>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)' }} />

              {/* Notify on */}
              <div>
                <label style={{ ...lbl, marginBottom: 8 }}>Notify me when</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {NOTIFY_OPTIONS.map(opt => (
                    <CheckRow key={opt.key}
                      checked={notifyOn.includes(opt.key)}
                      onChange={() => toggleNotify(opt.key)}
                      label={opt.label} description={opt.description} accentColor="#3B82F6"
                    />
                  ))}
                </div>
              </div>

              {/* Email delivery per event */}
              {notifyOn.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                    <Mail size={13} color="#7C3AED" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', letterSpacing: 1, textTransform: 'uppercase' }}>
                      Email Delivery
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
                    Choose how each notification reaches you. "Both" sends to the app bell and your email.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {NOTIFY_OPTIONS.filter(o => notifyOn.includes(o.key)).map(opt => {
                      const current: EmailDelivery = emailDelivery[opt.key] ?? 'in_app';
                      const options: { value: EmailDelivery; label: string }[] = [
                        { value: 'in_app', label: '🔔 App only' },
                        { value: 'email',  label: '📧 Email only' },
                        { value: 'both',   label: '✉️ Both' },
                        { value: 'none',   label: '🔕 Off' },
                      ];
                      return (
                        <div key={opt.key} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                          borderRadius: 8, padding: '7px 11px',
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {options.map(o => (
                              <button key={o.value} onClick={() => setEmailDelivery(prev => ({ ...prev, [opt.key]: o.value }))}
                                style={{
                                  padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                  cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                                  background: current === o.value ? '#7C3AED' : 'var(--bg-surface)',
                                  color: current === o.value ? '#fff' : 'var(--text-secondary)',
                                  outline: current === o.value ? 'none' : '1px solid var(--border)',
                                  transition: 'all 0.15s',
                                }}>
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Frequency */}
              <div>
                <label style={{ ...lbl, marginBottom: 8 }}>Delivery Frequency</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {FREQ_OPTIONS.map(opt => (
                    <button key={opt.key} onClick={() => setFrequency(opt.key)} style={{
                      padding: '9px 6px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      outline: `1.5px solid ${frequency === opt.key ? '#3B82F6' : 'var(--border)'}`,
                      background: frequency === opt.key ? 'rgba(59,130,246,0.1)' : 'var(--bg-surface-2)',
                      color: frequency === opt.key ? '#3B82F6' : 'var(--text-secondary)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      transition: 'all 0.15s', fontFamily: 'inherit',
                    }}>
                      {opt.icon}
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{opt.label}</span>
                      <span style={{ fontSize: 10, opacity: 0.75 }}>{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={!displayName.trim() || saving} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: !displayName.trim() ? 'var(--border)' : 'linear-gradient(135deg, #F97316, #EA580C)',
            color: !displayName.trim() ? 'var(--text-secondary)' : '#fff',
            fontSize: 12, fontWeight: 700, cursor: !displayName.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}>
            {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

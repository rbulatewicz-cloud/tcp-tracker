import React, { useState, useRef, useEffect } from 'react';
import { UserCircle, Bell, LogOut } from 'lucide-react';

interface UserProfileProps {
  currentUser: any;
  handleLogout: () => void;
  setShowLogin: (show: boolean) => void;
  setCurrentUser: (user: any) => void;
  onOpenProfile: (tab: 'profile' | 'notifications') => void;
}

const ROLE_COLOR: Record<string, string> = {
  ADMIN: '#EF4444',
  MOT:   '#F97316',
  SFTC:  '#3B82F6',
  CR:    '#8B5CF6',
  GUEST: '#64748B',
};

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

export const UserProfile: React.FC<UserProfileProps> = ({
  currentUser, handleLogout, setShowLogin, onOpenProfile,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!currentUser) {
    return (
      <button onClick={() => setShowLogin(true)} style={{
        background: '#F59E0B', color: '#000', border: 'none',
        padding: '8px 16px', borderRadius: 8, fontSize: 11,
        fontWeight: 700, cursor: 'pointer', marginLeft: 8,
      }}>Sign In</button>
    );
  }

  const initials   = getInitials(currentUser.displayName || currentUser.name || '');
  const roleColor  = ROLE_COLOR[currentUser.role] || '#64748B';
  const accentRing = `0 0 0 2px var(--bg-surface), 0 0 0 4px ${roleColor}`;

  return (
    <div ref={ref} style={{ position: 'relative', marginLeft: 8 }}>
      {/* Avatar button */}
      <button onClick={() => setOpen(o => !o)} style={{
        width: 34, height: 34, borderRadius: '50%',
        background: `linear-gradient(135deg, ${roleColor}cc, ${roleColor})`,
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, color: '#fff',
        boxShadow: open ? accentRing : 'none',
        transition: 'box-shadow 0.15s',
        fontFamily: 'inherit',
      }}>
        {initials}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          minWidth: 200, zIndex: 1000,
          overflow: 'hidden',
        }}>
          {/* User info header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg, ${roleColor}cc, ${roleColor})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#fff',
            }}>{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.displayName || currentUser.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                  color: roleColor, background: `${roleColor}18`,
                  padding: '1px 6px', borderRadius: 4,
                }}>{currentUser.role}</span>
                {currentUser.title && (
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentUser.title}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: '6px 0' }}>
            {[
              { icon: <UserCircle size={14} />, label: 'Edit Profile',            action: () => { onOpenProfile('profile');       setOpen(false); } },
              { icon: <Bell size={14} />,       label: 'Notification Settings',   action: () => { onOpenProfile('notifications'); setOpen(false); } },
            ].map(item => (
              <button key={item.label} onClick={item.action} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500,
                textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                {item.icon}{item.label}
              </button>
            ))}

            <div style={{ margin: '6px 0', borderTop: '1px solid var(--border)' }} />

            <button onClick={() => { handleLogout(); setOpen(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#EF4444', fontSize: 12, fontWeight: 600,
              textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <LogOut size={14} />Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

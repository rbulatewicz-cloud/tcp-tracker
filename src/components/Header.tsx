import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Ticket, Map as MapIcon, Calendar as CalendarIcon, Users, BarChart3, FileText, Menu, X, ShieldCheck, HelpCircle, FileWarning, BookOpen, CalendarRange, FileBarChart, ChevronDown, Inbox, ParkingSquare } from 'lucide-react';
import { NavTab } from './NavTab';
import { User, AppConfig, AppNotification } from '../types';
import { SearchInput } from '../features/search/SearchInput';
import { NewRequestButton } from '../features/actions/NewRequestButton';
import { UserProfile } from '../features/userProfile/UserProfile';
import { NotificationBell } from './NotificationBell';
import { UseNotificationsResult } from '../hooks/useNotifications';

interface HeaderProps {
  view: string;
  setView: (view: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  handleLogout: () => void;
  setShowLogin: (show: boolean) => void;
  canViewTickets: boolean;
  canViewMetrics: boolean;
  canViewLogs: boolean;
  canManageUsers: boolean;
  canManageApp: boolean;
  canViewCompliance: boolean;
  canViewCRHub: boolean;
  canViewMotHub: boolean;
  canViewTab: (key: string) => boolean;
  canCreateRequest: boolean;
  canRequestAppChange: boolean;
  onOpenHelp: () => void;
  setShowForm: (show: boolean) => void;
  setShowAppRequestModal: (show: boolean) => void;
  setShowAppRequestSidebar: (show: boolean) => void;
  appConfig?: AppConfig;
  isDark?: boolean;
  toggleDark?: () => void;
  onOpenProfile: (tab: 'profile' | 'notifications') => void;
  onOpenMyRequests?: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  markRead: UseNotificationsResult['markRead'];
  markAllRead: UseNotificationsResult['markAllRead'];
  notifOpen: boolean;
  setNotifOpen: (open: boolean) => void;
  onNotifNavigate: (n: AppNotification) => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  view, setView,
  searchQuery, setSearchQuery,
  currentUser, setCurrentUser,
  handleLogout,
  setShowLogin,
  canViewTickets, canViewMetrics, canViewLogs, canManageUsers, canManageApp, canViewCompliance, canViewCRHub, canViewMotHub, canViewTab, canCreateRequest, canRequestAppChange,
  onOpenHelp, setShowForm, setShowAppRequestModal, setShowAppRequestSidebar, appConfig, isDark, toggleDark, onOpenProfile, onOpenMyRequests,
  notifications, unreadCount, markRead, markAllRead, notifOpen, setNotifOpen, onNotifNavigate,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close "More" dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  // Primary tabs — always visible
  const primaryItems = [
    { label: 'Dashboard', icon: BarChart3,     view: 'metrics',       show: canViewMetrics },
    { label: 'Plans',     icon: LayoutGrid,    view: 'table',         show: true },
    { label: 'Map',       icon: MapIcon,       view: 'corridor',      show: true },
    { label: 'Calendar',  icon: CalendarIcon,  view: 'calendar',      show: true },
    { label: 'Requests',  icon: Ticket,        view: 'plan_requests', show: canViewTickets },
  ].filter(item => item.show);

  // Overflow groups — shown in "More ▾" dropdown
  const overflowGroups = [
    {
      label: 'Analysis',
      items: [
        { label: 'Timeline', icon: CalendarRange, view: 'timeline',  show: canViewTab('timeline') },
        { label: 'Reports',  icon: FileBarChart,  view: 'reports',   show: canViewTab('reports') },
      ],
    },
    {
      label: 'Compliance',
      items: [
        { label: 'CR Hub',     icon: Inbox,         view: 'cr_hub',    show: canViewCRHub },
        { label: 'MOT Hub',    icon: ParkingSquare, view: 'mot_hub',   show: canViewMotHub },
        { label: 'Compliance', icon: ShieldCheck, view: 'compliance', show: canViewCompliance },
        { label: 'Library',    icon: FileWarning, view: 'variances', show: canViewTab('variances') },
        { label: 'Reference',  icon: BookOpen,    view: 'reference', show: canViewTab('reference') },
      ],
    },
    {
      label: 'Admin',
      items: [
        { label: 'System Log', icon: FileText, view: 'log',   show: canViewLogs },
        { label: 'Team',       icon: Users,    view: 'users', show: canManageUsers },
      ],
    },
  ].map(g => ({ ...g, items: g.items.filter(i => i.show) }))
   .filter(g => g.items.length > 0);

  // All items flat (for mobile menu)
  const allItems = [
    ...primaryItems,
    ...overflowGroups.flatMap(g => g.items),
  ];

  // Is the active view in the overflow?
  const activeOverflowItem = overflowGroups.flatMap(g => g.items).find(i => i.view === view);

  const handleNavClick = (v: string) => {
    setView(v);
    setMobileMenuOpen(false);
    setMoreOpen(false);
  };

  return (
    <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>

      {/* Row 1: Branding + Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px' }}>
        {/* Logo + App name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {appConfig?.logoUrl ? (
            <img src={appConfig.logoUrl} alt="App logo" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 8 }} />
          ) : (
            <div style={{ width: 32, height: 32, background: `linear-gradient(135deg,${appConfig?.primaryColor || '#F59E0B'},${appConfig?.primaryColor || '#D97706'})`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0 }}>T</div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {appConfig?.appName || 'ESFV LRT — TCP Tracker'}
            </div>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
              {appConfig?.appSubtitle || 'San Fernando Transit Constructors'}
            </div>
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Help button */}
          <button
            onClick={onOpenHelp}
            title="How To Guide"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
          >
            <HelpCircle size={15} />
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
          >
            {isDark ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>

          {currentUser && (
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              markRead={markRead}
              markAllRead={markAllRead}
              open={notifOpen}
              setOpen={setNotifOpen}
              onNavigate={onNotifNavigate}
            />
          )}

<NewRequestButton canCreateRequest={canCreateRequest} onClick={() => setShowForm(true)} />

          <UserProfile
            currentUser={currentUser}
            handleLogout={handleLogout}
            setShowLogin={setShowLogin}
            setCurrentUser={setCurrentUser}
            onOpenProfile={onOpenProfile}
          />
        </div>
      </div>

      {/* Row 2: Search + Nav (collapses to hamburger) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px 8px', borderTop: '1px solid var(--border-subtle)' }}>
        <SearchInput view={view} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

        {/* Desktop nav — hidden below lg */}
        <div className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg ml-auto flex-shrink-0" style={{ position: 'relative' }}>
          {/* Primary tabs */}
          {primaryItems.map(item => (
            <NavTab
              key={item.view}
              active={view === item.view}
              onClick={() => handleNavClick(item.view)}
              icon={item.icon}
              label={item.label}
            />
          ))}

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

          {/* More ▾ button */}
          <div ref={moreRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMoreOpen(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 6,
                border: 'none',
                background: activeOverflowItem ? 'var(--bg-surface)' : 'transparent',
                color: activeOverflowItem ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: activeOverflowItem ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
                boxShadow: activeOverflowItem ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {activeOverflowItem ? activeOverflowItem.label : 'More'}
              <ChevronDown size={12} style={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {/* Dropdown */}
            {moreOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                width: 200,
                padding: 6,
                zIndex: 200,
              }}>
                {overflowGroups.map((group, gi) => (
                  <div key={group.label}>
                    {gi > 0 && <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />}
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', padding: '4px 10px 2px' }}>
                      {group.label}
                    </div>
                    {group.items.map(item => {
                      const Icon = item.icon;
                      const isActive = view === item.view;
                      return (
                        <button
                          key={item.view}
                          onClick={() => handleNavClick(item.view)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '7px 10px',
                            borderRadius: 6,
                            border: 'none',
                            background: isActive ? 'var(--bg-surface-2)' : 'transparent',
                            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: isActive ? 700 : 500,
                            fontSize: 12,
                            cursor: 'pointer',
                            width: '100%',
                            textAlign: 'left',
                            transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface-2)'; }}
                          onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                        >
                          <Icon size={13} strokeWidth={isActive ? 2.5 : 2} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Hamburger button — visible below lg */}
        <button
          onClick={() => setMobileMenuOpen(prev => !prev)}
          className="lg:hidden ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 font-semibold text-xs transition-colors flex-shrink-0"
        >
          {mobileMenuOpen ? <X size={15} /> : <Menu size={15} />}
          Menu
        </button>
      </div>

      {/* Mobile dropdown — slides in/out — shows all items */}
      <div
        style={{
          maxHeight: mobileMenuOpen ? '500px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.25s ease',
        }}
        className="lg:hidden"
      >
        <div style={{ padding: '8px 24px 12px', display: 'flex', flexDirection: 'column', gap: 2, borderTop: '1px solid var(--border-subtle)' }}>
          {allItems.map(item => {
            const Icon = item.icon;
            const isActive = view === item.view;
            return (
              <button
                key={item.view}
                onClick={() => handleNavClick(item.view)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: isActive ? 'var(--bg-surface-2)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.15s',
                }}
              >
                <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const Header = React.memo(HeaderComponent);

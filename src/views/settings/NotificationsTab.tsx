/**
 * NotificationsTab.tsx
 *
 * Admin view of all users' notification and email delivery preferences.
 * Shows a grid: rows = users, columns = notification categories.
 * Cell values show the delivery mode (none / in_app / email / both).
 * Admins can also see and edit each user's notification email address.
 */

import React, { useState, useEffect } from 'react';
import {
  collection, getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Mail, Bell, RefreshCw, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react';
import type {
  NotifyEvent, EmailDelivery, EmailDeliveryPrefs,
} from '../../types';
import {
  updateUserNotificationEmail,
} from '../../services/userService';
import { showToast } from '../../lib/toast';

// ── Event category groups ─────────────────────────────────────────────────────

const EVENT_GROUPS: { label: string; events: { key: NotifyEvent; label: string }[] }[] = [
  {
    label: 'Plan Lifecycle',
    events: [
      { key: 'status_change',  label: 'Status Change' },
      { key: 'plan_assigned',  label: 'Plan Assigned' },
      { key: 'plan_approved',  label: 'Plan Approved' },
      { key: 'plan_expired',   label: 'Plan Expired' },
    ],
  },
  {
    label: 'Compliance',
    events: [
      { key: 'nv_expiring',      label: 'NV Expiring' },
      { key: 'phe_deadline',     label: 'PHE Deadline' },
      { key: 'cd_overdue',       label: 'CD Overdue' },
      { key: 'window_expiring',  label: 'Window Expiring' },
    ],
  },
  {
    label: 'Activity',
    events: [
      { key: 'comment',       label: 'Comment' },
      { key: 'mention',       label: 'Mention' },
      { key: 'doc_uploaded',  label: 'Doc Uploaded' },
    ],
  },
  {
    label: 'CR Hub',
    events: [
      { key: 'cr_issue_assigned',   label: 'Issue Assigned' },
      { key: 'cr_issue_updated',    label: 'Issue Updated' },
      { key: 'cr_issue_escalation', label: 'Issue Escalated' },
      { key: 'queue_item',          label: 'Queue Item' },
    ],
  },
];

// Flat list of all tracked events (used for summary column counting)
const ALL_EVENTS = EVENT_GROUPS.flatMap(g => g.events);

// ── Delivery badge ────────────────────────────────────────────────────────────

const DELIVERY_STYLES: Record<EmailDelivery, string> = {
  none:    'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500',
  in_app:  'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300',
  email:   'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300',
  both:    'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const DELIVERY_LABELS: Record<EmailDelivery, string> = {
  none:   'Off',
  in_app: 'App',
  email:  'Email',
  both:   'Both',
};

function DeliveryBadge({ mode }: { mode: EmailDelivery }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${DELIVERY_STYLES[mode]}`}>
      {DELIVERY_LABELS[mode]}
    </span>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserRow {
  email: string;
  name: string;
  role: string;
  notifyOn: NotifyEvent[];
  emailDelivery: EmailDeliveryPrefs;
  notificationEmail: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const NotificationsTab: React.FC = () => {
  const [users, setUsers]         = useState<UserRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  // Inline edit state for notification email
  const [editingEmail, setEditingEmail]   = useState<string | null>(null); // which user
  const [editEmailVal, setEditEmailVal]   = useState('');
  const [savingEmail, setSavingEmail]     = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────

  const load = async (fresh = false) => {
    if (fresh) setRefreshing(true); else setLoading(true);
    try {
      const [pubSnap, privSnap] = await Promise.all([
        getDocs(collection(db, 'users_public')),
        getDocs(collection(db, 'users_private')),
      ]);

      const privMap: Record<string, any> = {};
      privSnap.docs.forEach(d => { privMap[d.id] = d.data(); });

      const rows: UserRow[] = pubSnap.docs.map(d => {
        const pub  = d.data();
        const priv = privMap[d.id] ?? {};
        return {
          email:             pub.email ?? d.id,
          name:              pub.displayName || pub.name || pub.email || d.id,
          role:              priv.role ?? '—',
          notifyOn:          priv.notifyOn ?? [],
          emailDelivery:     priv.emailDelivery ?? {},
          notificationEmail: pub.notificationEmail ?? priv.notificationEmail ?? pub.email ?? d.id,
        };
      });

      rows.sort((a, b) => a.name.localeCompare(b.name));
      setUsers(rows);
    } catch (err) {
      console.error('Failed to load user notifications', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Get effective delivery mode for a user + event */
  function getDelivery(user: UserRow, event: NotifyEvent): EmailDelivery {
    // If event not in notifyOn, they've opted out of in-app too
    if (user.notifyOn.length > 0 && !user.notifyOn.includes(event)) return 'none';
    return user.emailDelivery[event] ?? 'in_app';
  }

  /** Count events with email delivery (email or both) */
  function emailEnabledCount(user: UserRow): number {
    return ALL_EVENTS.filter(e => {
      const d = getDelivery(user, e.key);
      return d === 'email' || d === 'both';
    }).length;
  }

  // ── Save notification email ───────────────────────────────────────────────

  const saveNotificationEmail = async (userEmail: string) => {
    setSavingEmail(true);
    try {
      await updateUserNotificationEmail(userEmail, editEmailVal.trim());
      setUsers(prev => prev.map(u =>
        u.email === userEmail ? { ...u, notificationEmail: editEmailVal.trim() } : u
      ));
      showToast('Notification email updated', 'success');
      setEditingEmail(null);
    } catch {
      showToast('Failed to update email', 'error');
    } finally {
      setSavingEmail(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <RefreshCw size={20} className="animate-spin mr-2" />
        Loading preferences…
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">Notification Preferences</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Team members' delivery settings for each notification category
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Delivery modes:</span>
        {(Object.entries(DELIVERY_LABELS) as [EmailDelivery, string][]).map(([mode, label]) => (
          <div key={mode} className="flex items-center gap-1.5">
            <DeliveryBadge mode={mode} />
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {mode === 'none'   ? '— opted out' :
               mode === 'in_app' ? '— app only' :
               mode === 'email'  ? '— email only' :
                                   '— app + email'}
            </span>
          </div>
        ))}
      </div>

      {/* User list */}
      {users.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Bell size={32} className="text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No users found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(user => {
            const isExpanded = expandedEmail === user.email;
            const emailCount = emailEnabledCount(user);
            const isEditingThisEmail = editingEmail === user.email;

            return (
              <div
                key={user.email}
                className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
              >
                {/* User row header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                  onClick={() => setExpandedEmail(isExpanded ? null : user.email)}
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0 text-sm font-bold text-slate-600 dark:text-slate-300">
                    {user.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Name + email */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{user.name}</span>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{user.role}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{user.email}</div>
                  </div>

                  {/* Summary chips */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {emailCount > 0 ? (
                      <div className="flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400 font-semibold">
                        <Mail size={11} />
                        {emailCount} email{emailCount !== 1 ? 's' : ''}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">App only</span>
                    )}
                    {isExpanded
                      ? <ChevronUp size={14} className="text-slate-400" />
                      : <ChevronDown size={14} className="text-slate-400" />
                    }
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 px-4 py-4 space-y-4">

                    {/* Notification email address */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
                          Notification Email
                        </div>
                        {isEditingThisEmail ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="email"
                              value={editEmailVal}
                              onChange={e => setEditEmailVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveNotificationEmail(user.email);
                                if (e.key === 'Escape') setEditingEmail(null);
                              }}
                              autoFocus
                              className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                            <button
                              onClick={() => saveNotificationEmail(user.email)}
                              disabled={savingEmail}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingEmail(null)}
                              className="p-1.5 text-slate-400 hover:text-slate-600"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-700 dark:text-slate-300">{user.notificationEmail}</span>
                            {user.notificationEmail !== user.email && (
                              <span className="text-[10px] text-amber-500 font-semibold">(custom)</span>
                            )}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setEditingEmail(user.email);
                                setEditEmailVal(user.notificationEmail);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            >
                              <Pencil size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Delivery grid */}
                    <div className="space-y-3">
                      {EVENT_GROUPS.map(group => (
                        <div key={group.label}>
                          <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                            {group.label}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {group.events.map(({ key, label }) => {
                              const mode = getDelivery(user, key);
                              return (
                                <div
                                  key={key}
                                  className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2"
                                >
                                  <span className="text-[11px] text-slate-600 dark:text-slate-300">{label}</span>
                                  <DeliveryBadge mode={mode} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Note if user has notifyOn set */}
                    {user.notifyOn.length > 0 && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                        User has {user.notifyOn.length} event{user.notifyOn.length !== 1 ? 's' : ''} opted in for in-app notifications.
                        Categories not in their list show as "Off".
                      </p>
                    )}
                    {user.notifyOn.length === 0 && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                        User has not configured notification preferences — all events default to "App" delivery.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { User, UserRole, Plan } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { showToast } from '../lib/toast';

interface UserManagementViewProps {
  users: User[];
  currentUser: User | null;
  role: UserRole;
  plans: Plan[];
}

const ROLE_META: Record<string, { label: string; bg: string; text: string; border: string }> = {
  [UserRole.ADMIN]: { label: 'Admin',             bg: 'bg-slate-900',    text: 'text-white',        border: 'border-slate-700' },
  [UserRole.MOT]:   { label: 'MOT Team',          bg: 'bg-blue-100',     text: 'text-blue-800',     border: 'border-blue-200' },
  [UserRole.SFTC]:  { label: 'SFTC Team',         bg: 'bg-emerald-100',  text: 'text-emerald-800',  border: 'border-emerald-200' },
  [UserRole.CR]:    { label: 'Community Rel.',     bg: 'bg-purple-100',   text: 'text-purple-800',   border: 'border-purple-200' },
  [UserRole.GUEST]: { label: 'Guest / Viewer',     bg: 'bg-slate-100',    text: 'text-slate-500',    border: 'border-slate-200' },
};

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const meta = ROLE_META[role] ?? ROLE_META[UserRole.GUEST];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${meta.bg} ${meta.text} ${meta.border}`}>
      {meta.label}
    </span>
  );
};

const formatLastActive = (lastLogin?: string): string => {
  if (!lastLogin) return 'Never';
  const diff = Math.floor((Date.now() - new Date(lastLogin).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400 / 7)}w ago`;
  return `${Math.floor(diff / 86400 / 30)}mo ago`;
};

const getActivityColor = (lastLogin?: string): string => {
  if (!lastLogin) return 'text-slate-300';
  const days = (Date.now() - new Date(lastLogin).getTime()) / 86400000;
  if (days < 1) return 'text-emerald-500';
  if (days < 7) return 'text-blue-500';
  if (days < 30) return 'text-amber-500';
  return 'text-red-400';
};

const EMPTY_FORM = { name: '', email: '', role: UserRole.SFTC as UserRole };

export const UserManagementView: React.FC<UserManagementViewProps> = ({ users, currentUser, role, plans }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Deduplicate by email
  const dedupedUsers = useMemo(() => {
    const seen = new Set<string>();
    return users.filter(u => {
      const key = (u.email || '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [users]);

  const filtered = useMemo(() => {
    if (!search) return dedupedUsers;
    const q = search.toLowerCase();
    return dedupedUsers.filter(u =>
      u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  }, [dedupedUsers, search]);

  // Count active LOCs per lead name
  const locCountByLead = useMemo(() => {
    const counts: Record<string, number> = {};
    plans.forEach(p => {
      if (p.lead && !['plan_approved', 'approved', 'expired', 'closed'].includes(p.stage)) {
        counts[p.lead] = (counts[p.lead] || 0) + 1;
      }
    });
    return counts;
  }, [plans]);

  const openAdd = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setForm({ name: u.name || '', email: u.email || '', role: u.role || UserRole.SFTC });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.email || !form.name) { showToast('Name and email are required.', 'warning'); return; }
    if (form.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
      showToast('Only Admins can grant the Admin role.', 'error'); return;
    }
    setSaving(true);
    try {
      const emailId = form.email.toLowerCase();
      const uid = editingUser?.uid || Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'users_public', emailId), { uid, name: form.name, email: form.email });
      await setDoc(doc(db, 'users_private', emailId), { uid, role: form.role });
      showToast(editingUser ? 'Member updated.' : 'Member added.', 'success');
      setShowForm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users_public');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: User) => {
    if (u.email.toLowerCase() === currentUser?.email.toLowerCase()) {
      showToast('You cannot delete yourself.', 'error'); return;
    }
    if (u.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
      showToast('Only Admins can delete other Admins.', 'error'); return;
    }
    if (!window.confirm(`Remove ${u.name} (${u.email}) from the team?`)) return;
    try {
      await deleteDoc(doc(db, 'users_public', u.email.toLowerCase()));
      await deleteDoc(doc(db, 'users_private', u.email.toLowerCase()));
      showToast(`${u.name} removed.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users_public/${u.email}`);
    }
  };

  const handleCopyInvite = (u: User) => {
    const url = window.location.origin;
    const text = `Hi ${u.name},\n\nYou've been added to the ESFV LRT TCP Tracker as ${ROLE_META[u.role]?.label ?? u.role}.\n\nSign in with your Google account at:\n${url}\n\nThanks,\nSFTC MOT Team`;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Invite message copied to clipboard.', 'success');
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">Team Management</div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {dedupedUsers.length} member{dedupedUsers.length !== 1 ? 's' : ''} · Manage access and roles
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search members…"
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 w-48 outline-none focus:border-blue-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <button
            onClick={openAdd}
            className="px-4 py-2 text-xs font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-700 transition-colors"
          >
            + Add Member
          </button>
        </div>
      </div>

      {/* Role legend */}
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.entries(ROLE_META).map(([key, meta]) => (
          <span key={key} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${meta.bg} ${meta.text} ${meta.border}`}>
            {meta.label}
          </span>
        ))}
      </div>

      {/* Member cards */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-400 dark:text-slate-500">
            {search ? 'No members match your search.' : 'No team members yet. Add one above.'}
          </div>
        )}
        {filtered.map(u => {
          const activeLOCs = locCountByLead[u.name] ?? 0;
          const isMe = u.email?.toLowerCase() === currentUser?.email?.toLowerCase();
          return (
            <div key={u.email} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-sm flex-shrink-0">
                {(u.name || '?')[0].toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{u.name}</span>
                  {isMe && <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">(you)</span>}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{u.email}</div>
              </div>

              {/* Last Active */}
              <div className="text-center flex-shrink-0 hidden sm:block">
                <div className={`text-sm font-bold ${getActivityColor((u as any).lastLogin)}`}>
                  {formatLastActive((u as any).lastLogin)}
                </div>
                <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">Last Active</div>
              </div>

              {/* Login Count */}
              {(u as any).loginCount > 0 && (
                <div className="text-center flex-shrink-0 hidden sm:block">
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{(u as any).loginCount}</div>
                  <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">Logins</div>
                </div>
              )}

              {/* Active LOCs */}
              {activeLOCs > 0 && (
                <div className="text-center flex-shrink-0">
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{activeLOCs}</div>
                  <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">Active LOCs</div>
                </div>
              )}

              {/* Role badge */}
              <div className="flex-shrink-0">
                <RoleBadge role={u.role} />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleCopyInvite(u)}
                  title="Copy invite message"
                  className="px-3 py-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  Copy Invite
                </button>
                <button
                  onClick={() => openEdit(u)}
                  className="px-3 py-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Edit
                </button>
                {!isMe && (
                  <button
                    onClick={() => handleDelete(u)}
                    className="px-3 py-1.5 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-5"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-5">
              {editingUser ? 'Edit Team Member' : 'Add Team Member'}
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Full Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Smith"
                  className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-blue-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Google Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@gmail.com"
                  disabled={!!editingUser}
                  className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                />
                {!editingUser && (
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Must match their Google account — this is how they sign in.</div>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                  className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-blue-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value={UserRole.GUEST}>Guest / Viewer — read only</option>
                  <option value={UserRole.SFTC}>SFTC Team — submit requests</option>
                  <option value={UserRole.MOT}>MOT Team — manage plans</option>
                  <option value={UserRole.CR}>Community Relations</option>
                  {role === UserRole.ADMIN && (
                    <option value={UserRole.ADMIN}>Admin — full access</option>
                  )}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-40"
              >
                {saving ? 'Saving…' : editingUser ? 'Save Changes' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

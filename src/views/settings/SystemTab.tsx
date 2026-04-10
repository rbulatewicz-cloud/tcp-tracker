import React, { useState, useEffect } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { showToast } from '../../lib/toast';

interface SystemTabProps {
  users: any[];
}

export const SystemTab: React.FC<SystemTabProps> = ({ users }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiKeySaving, setGeminiKeySaving] = useState(false);
  const [geminiKeyLoaded, setGeminiKeyLoaded] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'aiConfig')).then(snap => {
      if (snap.exists()) setGeminiKey(snap.data().geminiApiKey ?? '');
      setGeminiKeyLoaded(true);
    }).catch(() => setGeminiKeyLoaded(true));
  }, []);

  const saveGeminiKey = async () => {
    setGeminiKeySaving(true);
    try {
      await setDoc(doc(db, 'settings', 'aiConfig'), { geminiApiKey: geminiKey.trim() }, { merge: true });
      showToast('AI API key saved', 'success');
    } catch {
      showToast('Failed to save AI key', 'error');
    } finally {
      setGeminiKeySaving(false);
    }
  };

  const now = Date.now();
  const active7  = users.filter(u => u.lastLogin && (now - new Date(u.lastLogin).getTime()) < 7  * 86400000).length;
  const active30 = users.filter(u => u.lastLogin && (now - new Date(u.lastLogin).getTime()) < 30 * 86400000).length;
  const never    = users.filter(u => !u.lastLogin).length;
  const topUser  = [...users].sort((a, b) => (b.loginCount || 0) - (a.loginCount || 0))[0];

  return (
    <div className="space-y-6">

      {/* Usage Stats */}
      <div>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4">Usage</h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: 'Active (7d)',     value: active7,      color: 'text-emerald-600' },
            { label: 'Active (30d)',    value: active30,     color: 'text-blue-600'    },
            { label: 'Total Members',   value: users.length, color: 'text-slate-800'   },
            { label: 'Never Logged In', value: never,        color: never > 0 ? 'text-amber-500' : 'text-slate-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-100 dark:border-slate-600">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        {topUser?.loginCount > 0 && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-100 dark:border-slate-600 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">Most Active Member</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{topUser.name}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">{topUser.email}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-indigo-600">{topUser.loginCount}</div>
              <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Logins</div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4">App Info</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'App Version',      value: '0.2.0' },
            { label: 'Firebase Project', value: 'gen-lang-client-0122413243' },
            { label: 'Hosting URL',      value: 'gen-lang-client-0122413243.web.app' },
            { label: 'Environment',      value: 'Production' },
          ].map(row => (
            <div key={row.label} className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-100 dark:border-slate-600">
              <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">{row.label}</div>
              <div className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Configuration */}
      <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">AI Configuration</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Used to scan uploaded documents and generate driveway notice content. Get a key from{' '}
          <span className="font-mono text-indigo-600">aistudio.google.com</span>.
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Gemini API Key</label>
            <input
              type="password"
              placeholder={geminiKeyLoaded ? (geminiKey ? '••••••••••••••••' : 'Paste key here…') : 'Loading…'}
              value={geminiKey}
              onChange={e => setGeminiKey(e.target.value)}
              disabled={!geminiKeyLoaded}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400 disabled:opacity-50"
            />
          </div>
          <button
            onClick={saveGeminiKey}
            disabled={geminiKeySaving || !geminiKey.trim()}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors disabled:opacity-40"
          >
            {geminiKeySaving ? 'Saving…' : 'Save Key'}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
          The key is stored securely in Firestore and never exposed in client code.
        </p>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-3">Changelog</h2>
        <div className="space-y-3 text-sm">
          {[
            {
              version: 'v0.2.0',
              date: 'Apr 9 2026',
              notes: 'CR Queue: AI-powered driveway letter drafting — auto-fills from plan card and generates EN/ES body using past approved letters as style examples. Add driveway addresses directly from queue with property library autocomplete. Link, unlink, and delete address entries from queue. Inline plan details panel per queue card. Re-issue Needed tier resurfaces plans when work dates shift after notices were sent. Plan card driveway status now derived from live Library letter data (no manual dropdown). Post-approval implementation window editor. Approval confirm requires dates when window is mandatory. Settings → Compliance: Driveway Letter pre-fill section for CR contact and default work hours.',
            },
            {
              version: 'v0.1.0',
              date: 'Mar 31 2026',
              notes: 'Reference tab with interactive workflow guide and document library; Corridor Map showing NB/SB plan coverage along Van Nuys Blvd; turnaround stats on new request form; per-day shift selection (mixed mode); login counter fix.',
            },
            {
              version: 'v0.0.3',
              date: 'Mar 28 2026',
              notes: 'Compliance tracks: PHE application pre-fill, noise variance workflow, driveway impact notices with lead-time alerts. Email notifications for status changes and review cycles. LOC document management with approval history. Status workflow improvements: review cycle tracking, transition notes, attachment uploads per stage transition.',
            },
            {
              version: 'v0.0.2',
              date: 'Mar 24 2026',
              notes: 'LOC-centric redesign, guided import wizard, branding settings, workflow clock targets.',
            },
            {
              version: 'v0.0.1',
              date: 'Mar 2026',
              notes: 'Initial release — SFTC plan tracking, team management, activity log.',
            },
          ].map(entry => (
            <div key={entry.version} className="flex gap-4">
              <span className="font-mono text-xs text-indigo-600 font-bold w-14 shrink-0 mt-0.5">{entry.version}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 w-20 shrink-0 mt-0.5">{entry.date}</span>
              <span className="text-slate-600 dark:text-slate-400">{entry.notes}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

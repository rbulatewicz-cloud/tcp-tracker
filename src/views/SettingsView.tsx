import React, { useState, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { showToast } from '../lib/toast';
import { AppConfig } from '../types';
import { DEFAULT_APP_CONFIG, CLOCK_TARGETS } from '../constants';

interface SettingsViewProps {
  appConfig: AppConfig;
  setAppConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  role: string;
  setClearPlansConfirm: (show: boolean) => void;
  onOpenImport: () => void;
  onExportCSV: () => void;
}

type Tab = 'branding' | 'workflow' | 'data' | 'system';

const PHASES: { key: string; label: string }[] = [
  { key: 'drafting',         label: 'Drafting' },
  { key: 'dot_review',       label: 'DOT Review (1st)' },
  { key: 'team_response',    label: 'Team Response' },
  { key: 'dot_review_final', label: 'DOT Review (Final)' },
  { key: 'loc_review',       label: 'LOC Review (Engineered only)' },
];

const PLAN_TYPE_COLS = ['WATCH', 'Standard', 'Engineered'];

const COLOR_SWATCHES = [
  { label: 'Amber',   value: '#F59E0B' },
  { label: 'Blue',    value: '#3B82F6' },
  { label: 'Indigo',  value: '#6366F1' },
  { label: 'Green',   value: '#10B981' },
  { label: 'Rose',    value: '#F43F5E' },
  { label: 'Slate',   value: '#475569' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  appConfig, setAppConfig, role, setClearPlansConfirm, onOpenImport, onExportCSV,
}) => {
  const [tab, setTab] = useState<Tab>('branding');
  const [form, setForm] = useState<AppConfig>({ ...DEFAULT_APP_CONFIG, ...appConfig });
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'appConfig'), form);
      setAppConfig(form);
      showToast('Settings saved', 'success');
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const storageRef = ref(storage, 'branding/app-logo');
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm(p => ({ ...p, logoUrl: url }));
      showToast('Logo uploaded — save settings to apply', 'success');
    } catch {
      showToast('Logo upload failed', 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const setClockTarget = (planType: string, phase: string, field: 'target' | 'warning', value: number) => {
    setForm(p => {
      const existing = (p.clockTargets[planType] || {})[phase] || { target: 1, warning: 1 };
      return {
        ...p,
        clockTargets: {
          ...p.clockTargets,
          [planType]: {
            ...p.clockTargets[planType],
            [phase]: { target: existing.target, warning: existing.warning, [field]: value },
          },
        },
      } as AppConfig;
    });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'branding',  label: 'Branding' },
    { key: 'workflow',  label: 'Workflow Rules' },
    { key: 'data',      label: 'Data' },
    { key: 'system',    label: 'System' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your app configuration, workflow rules, and data.</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">

        {/* ── BRANDING ── */}
        {tab === 'branding' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-4">App Logo</h2>
              <div className="flex items-start gap-6">
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors overflow-hidden bg-slate-50"
                >
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="App logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="text-center text-slate-400 text-xs p-2">
                      <div className="text-2xl mb-1">🖼</div>
                      Click to upload
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                    className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    {logoUploading ? 'Uploading...' : 'Upload PNG / JPG'}
                  </button>
                  {form.logoUrl && (
                    <button
                      onClick={() => setForm(p => ({ ...p, logoUrl: null }))}
                      className="px-4 py-2 text-sm font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Remove Logo
                    </button>
                  )}
                  <p className="text-xs text-slate-400">Appears in the header and future exports.<br />Recommended: PNG with transparent background.</p>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }}
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h2 className="text-base font-bold text-slate-800 mb-4">App Identity</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">App Name</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.appName}
                    onChange={e => setForm(p => ({ ...p, appName: e.target.value }))}
                    placeholder="ESFV LRT — TCP Tracker"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Subtitle</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.appSubtitle}
                    onChange={e => setForm(p => ({ ...p, appSubtitle: e.target.value }))}
                    placeholder="San Fernando Transit Constructors"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Browser Tab Title</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.pageTitle}
                    onChange={e => setForm(p => ({ ...p, pageTitle: e.target.value }))}
                    placeholder="ESFV LRT — TCP Tracker"
                  />
                  <p className="text-xs text-slate-400 mt-1">Text shown in the browser tab and bookmark name.</p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h2 className="text-base font-bold text-slate-800 mb-3">Primary Color</h2>
              <div className="flex gap-3">
                {COLOR_SWATCHES.map(s => (
                  <button
                    key={s.value}
                    title={s.label}
                    onClick={() => setForm(p => ({ ...p, primaryColor: s.value }))}
                    className={`w-9 h-9 rounded-full border-4 transition-all ${
                      form.primaryColor === s.value ? 'border-slate-900 scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ background: s.value }}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Accent color used for buttons, badges, and highlights.</p>
            </div>
          </div>
        )}

        {/* ── WORKFLOW RULES ── */}
        {tab === 'workflow' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-1">Alert Thresholds</h2>
              <p className="text-xs text-slate-500 mb-4">Controls when plans are flagged as "At Risk" or "Overdue" in the table view.</p>
              <div className="flex gap-6">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">At Risk Window (days)</label>
                  <input
                    type="number" min={1}
                    className="w-28 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-sm font-semibold text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={form.atRiskDays}
                    onChange={e => setForm(p => ({ ...p, atRiskDays: parseInt(e.target.value) || 14 }))}
                  />
                  <p className="text-xs text-slate-400 mt-1">Plans due within this many days turn amber.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Overdue Threshold (days)</label>
                  <input
                    type="number" min={0}
                    className="w-28 border border-red-300 bg-red-50 rounded-lg px-3 py-2 text-sm font-semibold text-red-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                    value={form.overdueDays}
                    onChange={e => setForm(p => ({ ...p, overdueDays: parseInt(e.target.value) || 7 }))}
                  />
                  <p className="text-xs text-slate-400 mt-1">Plans past due by this many days turn red.</p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h2 className="text-base font-bold text-slate-800 mb-1">Clock Targets by Phase</h2>
              <p className="text-xs text-slate-500 mb-4">
                Target and warning day counts per review phase per plan type. These drive the color coding in Progression History.
                <span className="ml-2 text-emerald-600 font-semibold">Green = on track</span>
                <span className="ml-2 text-amber-600 font-semibold">Amber = approaching warning</span>
                <span className="ml-2 text-red-600 font-semibold">Red = over target</span>
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-2 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wide w-40">Phase</th>
                      {PLAN_TYPE_COLS.map(pt => (
                        <th key={pt} colSpan={2} className="text-center py-2 px-2 text-xs font-bold text-slate-700 uppercase tracking-wide border-l border-slate-100">
                          {pt}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-slate-100">
                      <th />
                      {PLAN_TYPE_COLS.map(pt => (
                        <React.Fragment key={pt}>
                          <th className="text-center py-1 px-2 text-xs font-semibold text-emerald-600 border-l border-slate-100">Target d</th>
                          <th className="text-center py-1 px-2 text-xs font-semibold text-amber-600">Warning d</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PHASES.map(phase => (
                      <tr key={phase.key} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-4 text-xs font-semibold text-slate-700">{phase.label}</td>
                        {PLAN_TYPE_COLS.map(pt => {
                          const cell = (form.clockTargets?.[pt] || CLOCK_TARGETS[pt] || {})[phase.key];
                          const isNA = pt !== 'Engineered' && phase.key === 'loc_review';
                          return (
                            <React.Fragment key={pt}>
                              <td className="py-1 px-2 text-center border-l border-slate-100">
                                {isNA ? (
                                  <span className="text-slate-300 text-xs">—</span>
                                ) : (
                                  <input
                                    type="number" min={1}
                                    className="w-16 text-center border border-slate-200 rounded px-1 py-1 text-sm font-semibold text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                    value={cell?.target ?? ''}
                                    onChange={e => setClockTarget(pt, phase.key, 'target', parseInt(e.target.value) || 1)}
                                  />
                                )}
                              </td>
                              <td className="py-1 px-2 text-center">
                                {isNA ? (
                                  <span className="text-slate-300 text-xs">—</span>
                                ) : (
                                  <input
                                    type="number" min={1}
                                    className="w-16 text-center border border-slate-200 rounded px-1 py-1 text-sm font-semibold text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                    value={cell?.warning ?? ''}
                                    onChange={e => setClockTarget(pt, phase.key, 'warning', parseInt(e.target.value) || 1)}
                                  />
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => setForm(p => ({ ...p, clockTargets: { ...CLOCK_TARGETS } }))}
                className="mt-3 text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}

        {/* ── DATA ── */}
        {tab === 'data' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-1">Import & Export</h2>
              <p className="text-xs text-slate-500 mb-4">Bulk import plans from Excel or export all current data to CSV.</p>
              <div className="flex gap-3">
                <button
                  onClick={onOpenImport}
                  className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Import Master File
                </button>
                <button
                  onClick={onExportCSV}
                  className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Export All to CSV
                </button>
              </div>
            </div>

            {role === 'ADMIN' && (
              <div className="border-t border-slate-100 pt-6">
                <h2 className="text-base font-bold text-red-600 mb-1">Danger Zone</h2>
                <p className="text-xs text-slate-500 mb-4">These actions are permanent and cannot be undone.</p>
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-red-800">Wipe All Plans</div>
                    <div className="text-xs text-red-600 mt-0.5">Permanently deletes all LOC records, logs, and associated data.</div>
                  </div>
                  <button
                    onClick={() => setClearPlansConfirm(true)}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    Clear All Plans
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SYSTEM ── */}
        {tab === 'system' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-4">App Info</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'App Version',        value: '0.0.0' },
                  { label: 'Firebase Project',   value: 'gen-lang-client-0122413243' },
                  { label: 'Hosting URL',        value: 'gen-lang-client-0122413243.web.app' },
                  { label: 'Environment',        value: 'Production' },
                ].map(row => (
                  <div key={row.label} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{row.label}</div>
                    <div className="text-sm font-mono font-semibold text-slate-800">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h2 className="text-base font-bold text-slate-800 mb-3">Changelog</h2>
              <div className="space-y-3 text-sm">
                {[
                  { version: 'v0.0.2', date: 'Mar 24 2026', notes: 'LOC-centric redesign, guided import wizard, branding settings, workflow clock targets.' },
                  { version: 'v0.0.1', date: 'Mar 2026',    notes: 'Initial release — SFTC plan tracking, team management, activity log.' },
                ].map(entry => (
                  <div key={entry.version} className="flex gap-4">
                    <span className="font-mono text-xs text-indigo-600 font-bold w-14 shrink-0 mt-0.5">{entry.version}</span>
                    <span className="text-xs text-slate-400 w-20 shrink-0 mt-0.5">{entry.date}</span>
                    <span className="text-slate-600">{entry.notes}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Save Button (not shown on system tab) */}
        {tab !== 'system' && tab !== 'data' && (
          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

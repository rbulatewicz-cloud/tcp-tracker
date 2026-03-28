import React, { useState, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { showToast } from '../lib/toast';
import { AppConfig } from '../types';
import { DEFAULT_APP_CONFIG, CLOCK_TARGETS, SCOPES, LEADS, PLAN_TYPES } from '../constants';

interface SettingsViewProps {
  appConfig: AppConfig;
  setAppConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  role: string;
  users: any[];
  setClearPlansConfirm: (show: boolean) => void;
  onOpenImport: () => void;
  onExportCSV: () => void;
}

type Tab = 'branding' | 'workflow' | 'lists' | 'data' | 'compliance' | 'system';

// ── Editable list component ──────────────────────────────────────────────────
const EditableList: React.FC<{
  title: string;
  description: string;
  items: string[];
  defaults: string[];
  onChange: (items: string[]) => void;
}> = ({ title, description, items, defaults, onChange }) => {
  const [newItem, setNewItem] = useState('');

  const add = () => {
    const v = newItem.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setNewItem('');
  };

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const reset = () => onChange([...defaults]);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</h3>
        <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline">
          Reset to defaults
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{description}</p>

      <ul className="space-y-1 mb-4">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 group">
            <span className="flex-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md px-3 py-1.5">
              {item}
            </span>
            <button
              onClick={() => remove(i)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all text-xs font-bold px-1"
              title="Remove"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="New item..."
          className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
        />
        <button
          onClick={add}
          disabled={!newItem.trim()}
          className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-bold rounded-lg hover:bg-slate-700 dark:hover:bg-slate-300 disabled:opacity-40 transition-colors"
        >
          + Add
        </button>
      </div>
    </div>
  );
};

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
  appConfig, setAppConfig, role, users, setClearPlansConfirm, onOpenImport, onExportCSV,
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
    { key: 'branding',   label: 'Branding' },
    { key: 'workflow',   label: 'Workflow Rules' },
    { key: 'lists',      label: 'Managed Lists' },
    { key: 'data',       label: 'Data' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'system',     label: 'System' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your app configuration, workflow rules, and data.</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">

        {/* ── BRANDING ── */}
        {tab === 'branding' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4">App Logo</h2>
              <div className="flex items-start gap-6">
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors overflow-hidden bg-slate-50 dark:bg-slate-700"
                >
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="App logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="text-center text-slate-400 dark:text-slate-500 text-xs p-2">
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
                  <p className="text-xs text-slate-400 dark:text-slate-500">Appears in the header and future exports.<br />Recommended: PNG with transparent background.</p>
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

            <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4">App Identity</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">App Name</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    value={form.appName}
                    onChange={e => setForm(p => ({ ...p, appName: e.target.value }))}
                    placeholder="ESFV LRT — TCP Tracker"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Subtitle</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    value={form.appSubtitle}
                    onChange={e => setForm(p => ({ ...p, appSubtitle: e.target.value }))}
                    placeholder="San Fernando Transit Constructors"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Browser Tab Title</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    value={form.pageTitle}
                    onChange={e => setForm(p => ({ ...p, pageTitle: e.target.value }))}
                    placeholder="ESFV LRT — TCP Tracker"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Text shown in the browser tab and bookmark name.</p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-3">Primary Color</h2>
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
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Accent color used for buttons, badges, and highlights.</p>
            </div>
          </div>
        )}

        {/* ── WORKFLOW RULES ── */}
        {tab === 'workflow' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">Alert Thresholds</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Controls when plans are flagged as "At Risk" or "Overdue" in the table view.</p>
              <div className="flex gap-6">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">At Risk Window (days)</label>
                  <input
                    type="number" min={1}
                    className="w-28 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-sm font-semibold text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={form.atRiskDays}
                    onChange={e => setForm(p => ({ ...p, atRiskDays: parseInt(e.target.value) || 14 }))}
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Plans due within this many days turn amber.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Overdue Threshold (days)</label>
                  <input
                    type="number" min={0}
                    className="w-28 border border-red-300 bg-red-50 rounded-lg px-3 py-2 text-sm font-semibold text-red-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                    value={form.overdueDays}
                    onChange={e => setForm(p => ({ ...p, overdueDays: parseInt(e.target.value) || 7 }))}
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Plans past due by this many days turn red.</p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">Clock Targets by Phase</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Target and warning day counts per review phase per plan type. These drive the color coding in Progression History.
                <span className="ml-2 text-emerald-600 font-semibold">Green = on track</span>
                <span className="ml-2 text-amber-600 font-semibold">Amber = approaching warning</span>
                <span className="ml-2 text-red-600 font-semibold">Red = over target</span>
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                      <th className="text-left py-2 pr-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide w-40">Phase</th>
                      {PLAN_TYPE_COLS.map(pt => (
                        <th key={pt} colSpan={2} className="text-center py-2 px-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide border-l border-slate-100 dark:border-slate-700">
                          {pt}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      <th />
                      {PLAN_TYPE_COLS.map(pt => (
                        <React.Fragment key={pt}>
                          <th className="text-center py-1 px-2 text-xs font-semibold text-emerald-600 border-l border-slate-100 dark:border-slate-700">Target d</th>
                          <th className="text-center py-1 px-2 text-xs font-semibold text-amber-600">Warning d</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PHASES.map(phase => (
                      <tr key={phase.key} className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                        <td className="py-2 pr-4 text-xs font-semibold text-slate-700 dark:text-slate-300">{phase.label}</td>
                        {PLAN_TYPE_COLS.map(pt => {
                          const cell = (form.clockTargets?.[pt] || CLOCK_TARGETS[pt] || {})[phase.key];
                          const isNA = pt !== 'Engineered' && phase.key === 'loc_review';
                          return (
                            <React.Fragment key={pt}>
                              <td className="py-1 px-2 text-center border-l border-slate-100 dark:border-slate-700">
                                {isNA ? (
                                  <span className="text-slate-300 text-xs">—</span>
                                ) : (
                                  <input
                                    type="number" min={1}
                                    className="w-16 text-center border border-slate-200 dark:border-slate-600 rounded px-1 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white dark:bg-slate-700"
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
                                    className="w-16 text-center border border-slate-200 dark:border-slate-600 rounded px-1 py-1 text-sm font-semibold text-amber-700 dark:text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white dark:bg-slate-700"
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
                className="mt-3 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 underline"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}

        {/* ── MANAGED LISTS ── */}
        {tab === 'lists' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">Managed Lists</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Control the dropdown options available to all users when creating or editing plans.
                Only admins can modify these lists — changes take effect immediately for everyone.
              </p>
              <div className="space-y-5">
                <EditableList
                  title="Scope Types"
                  description="Shown in the Scope dropdown on new requests and plan cards."
                  items={form.lists?.scopes ?? SCOPES}
                  defaults={SCOPES}
                  onChange={items => setForm(p => ({ ...p, lists: { ...p.lists, scopes: items } }))}
                />
                <EditableList
                  title="SFTC Leads"
                  description="Team members shown in the Lead dropdown. Shown in table filters and plan assignments."
                  items={form.lists?.leads ?? LEADS}
                  defaults={LEADS}
                  onChange={items => setForm(p => ({ ...p, lists: { ...p.lists, leads: items } }))}
                />
                <EditableList
                  title="Plan Types"
                  description="Determines the review workflow and compliance rules. Add new types cautiously — they affect compliance trigger logic."
                  items={form.lists?.planTypes ?? PLAN_TYPES}
                  defaults={PLAN_TYPES}
                  onChange={items => setForm(p => ({ ...p, lists: { ...p.lists, planTypes: items } }))}
                />
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Lists'}
              </button>
            </div>
          </div>
        )}

        {/* ── DATA ── */}
        {tab === 'data' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">Import & Export</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Bulk import plans from Excel or export all current data to CSV.</p>
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
              <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
                <h2 className="text-base font-bold text-red-600 mb-1">Danger Zone</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">These actions are permanent and cannot be undone.</p>
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
        {/* ── COMPLIANCE ── */}
        {tab === 'compliance' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">PHE Application Pre-fill</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">These values auto-populate the Peak Hour Exemption form. Fill in once — they apply to all plans.</p>

              {/* Project & Business */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'phe_projectName',   label: 'Project Name' },
                    { key: 'phe_businessName',  label: 'Business / Company Name' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{f.label}</label>
                      <input
                        value={(form as any)[f.key] || ''}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-400"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Business Address</label>
                  <input
                    value={form.phe_address || ''}
                    onChange={e => setForm(p => ({ ...p, phe_address: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-400"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {[
                    { key: 'phe_contactName',  label: 'Authorized Contact Name' },
                    { key: 'phe_contactPhone', label: 'Contact Phone' },
                    { key: 'phe_contactEmail', label: 'Contact Email' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{f.label}</label>
                      <input
                        value={(form as any)[f.key] || ''}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-400"
                      />
                    </div>
                  ))}
                </div>

                {/* Subcontractor toggle */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-4">
                  <label className="flex items-center gap-3 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={!!form.phe_isSubcontractor}
                      onChange={e => setForm(p => ({ ...p, phe_isSubcontractor: e.target.checked }))}
                      className="rounded border-slate-300"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Authorized person is a subcontractor</span>
                  </label>
                  {form.phe_isSubcontractor && (
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-700">
                      {[
                        { key: 'phe_primeContractorName', label: 'Prime Contractor Name' },
                        { key: 'phe_primeContactName',    label: 'Prime Contact Name' },
                        { key: 'phe_primePhone',          label: 'Prime Phone' },
                        { key: 'phe_primeEmail',          label: 'Prime Email' },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{f.label}</label>
                          <input
                            value={(form as any)[f.key] || ''}
                            onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-400"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Default permit type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Default BOE Permit Type</label>
                  <div className="flex gap-2">
                    {(['A', 'B', 'E', 'U', 'S'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setForm(p => ({ ...p, phe_defaultPermitType: t }))}
                        className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${
                          form.phe_defaultPermitType === t
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                        }`}
                      >
                        {t} Permit
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-bold hover:bg-slate-700 dark:hover:bg-slate-300 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        {tab === 'system' && (
          <div className="space-y-6">

            {/* Usage Stats */}
            {(() => {
              const now = Date.now();
              const active7  = users.filter(u => u.lastLogin && (now - new Date(u.lastLogin).getTime()) < 7  * 86400000).length;
              const active30 = users.filter(u => u.lastLogin && (now - new Date(u.lastLogin).getTime()) < 30 * 86400000).length;
              const never    = users.filter(u => !u.lastLogin).length;
              const topUser  = [...users].sort((a, b) => (b.loginCount || 0) - (a.loginCount || 0))[0];
              return (
                <div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4">Usage</h2>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      { label: 'Active (7d)',  value: active7,        color: 'text-emerald-600' },
                      { label: 'Active (30d)', value: active30,       color: 'text-blue-600'    },
                      { label: 'Total Members',value: users.length,   color: 'text-slate-800'   },
                      { label: 'Never Logged In', value: never,       color: never > 0 ? 'text-amber-500' : 'text-slate-400' },
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
              );
            })()}

            <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4">App Info</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'App Version',        value: '0.0.2' },
                  { label: 'Firebase Project',   value: 'gen-lang-client-0122413243' },
                  { label: 'Hosting URL',        value: 'gen-lang-client-0122413243.web.app' },
                  { label: 'Environment',        value: 'Production' },
                ].map(row => (
                  <div key={row.label} className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-100 dark:border-slate-600">
                    <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">{row.label}</div>
                    <div className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-3">Changelog</h2>
              <div className="space-y-3 text-sm">
                {[
                  { version: 'v0.0.2', date: 'Mar 24 2026', notes: 'LOC-centric redesign, guided import wizard, branding settings, workflow clock targets.' },
                  { version: 'v0.0.1', date: 'Mar 2026',    notes: 'Initial release — SFTC plan tracking, team management, activity log.' },
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
        )}

        {/* Save Button (not shown on system tab) */}
        {tab !== 'system' && tab !== 'data' && tab !== 'lists' && (
          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 flex justify-end">
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

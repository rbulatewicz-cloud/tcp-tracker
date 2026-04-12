import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { AppConfig } from '../../types';

// ── All navigable tabs, grouped ───────────────────────────────────────────────

export const ALL_NAV_TABS = [
  { key: 'table',         label: 'Plans',      group: 'Main' },
  { key: 'corridor',      label: 'Map',        group: 'Main' },
  { key: 'calendar',      label: 'Calendar',   group: 'Main' },
  { key: 'metrics',       label: 'Dashboard',  group: 'Main' },
  { key: 'plan_requests', label: 'Requests',   group: 'Main' },
  { key: 'timeline',      label: 'Timeline',   group: 'Analysis' },
  { key: 'reports',       label: 'Reports',    group: 'Analysis' },
  { key: 'cr_hub',        label: 'CR Hub',     group: 'Compliance' },
  { key: 'compliance',    label: 'Compliance', group: 'Compliance' },
  { key: 'variances',     label: 'Library',    group: 'Compliance' },
  { key: 'reference',     label: 'Reference',  group: 'Compliance' },
  { key: 'users',         label: 'Team',       group: 'Admin' },
  { key: 'log',           label: 'System Log', group: 'Admin' },
] as const;

// ── Default visibility per role (used when tabVisibility not yet configured) ──

export const DEFAULT_TAB_VISIBILITY: Record<string, string[]> = {
  GUEST:  ['table', 'corridor', 'calendar'],
  SFTC:   ['table', 'corridor', 'calendar', 'metrics', 'plan_requests', 'timeline', 'reports', 'compliance', 'variances', 'reference'],
  MOT:    ['table', 'corridor', 'calendar', 'metrics', 'plan_requests', 'timeline', 'reports', 'compliance', 'variances', 'reference', 'users', 'log'],
  CR:     ['table', 'corridor', 'calendar', 'cr_hub', 'compliance', 'variances', 'reference'],
  DOT:    ['table', 'corridor', 'calendar', 'variances', 'reference'],
  METRO:  ['table', 'corridor', 'calendar', 'compliance', 'variances', 'reference'],
  ADMIN:  ALL_NAV_TABS.map(t => t.key as string),
};

// ── Roles shown in the matrix (ADMIN is always full-access, locked) ───────────

const MANAGEABLE_ROLES = [
  { key: 'GUEST',  label: 'Guest',  description: 'Read-only observers' },
  { key: 'SFTC',   label: 'SFTC',   description: 'Main contractor team' },
  { key: 'MOT',    label: 'MOT',    description: 'Management of Traffic' },
  { key: 'CR',     label: 'CR',     description: 'Community Relations' },
  { key: 'DOT',    label: 'DOT',    description: 'Dept. of Transportation' },
  { key: 'METRO',  label: 'Metro',  description: 'Metro oversight team' },
];

const TAB_GROUPS = ['Main', 'Analysis', 'Compliance', 'Admin'] as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface AccessTabProps {
  form: AppConfig;
  setForm: React.Dispatch<React.SetStateAction<AppConfig>>;
}

export function AccessTab({ form, setForm }: AccessTabProps) {
  // Resolve current visibility: use saved config or fall back to defaults
  const visibility: Record<string, string[]> = {};
  for (const r of [...MANAGEABLE_ROLES, { key: 'ADMIN', label: 'Admin', description: '' }]) {
    visibility[r.key] = form.tabVisibility?.[r.key] ?? DEFAULT_TAB_VISIBILITY[r.key] ?? [];
  }

  const toggle = (role: string, tabKey: string) => {
    const current = visibility[role] ?? [];
    const next = current.includes(tabKey)
      ? current.filter(k => k !== tabKey)
      : [...current, tabKey];
    setForm(f => ({
      ...f,
      tabVisibility: {
        ...DEFAULT_TAB_VISIBILITY,          // seed all roles with defaults first
        ...(f.tabVisibility ?? {}),          // overlay any previously saved overrides
        [role]: next,
      },
    }));
  };

  const resetToDefaults = () => {
    setForm(f => ({ ...f, tabVisibility: { ...DEFAULT_TAB_VISIBILITY } }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Team Access Control</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Choose which navigation tabs each role can see. ADMIN always has full access.
          </p>
        </div>
        <button
          onClick={resetToDefaults}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          Reset to defaults
        </button>
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            {/* Group header row */}
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 w-40 sticky left-0 bg-slate-50 dark:bg-slate-800/50">
                Role
              </th>
              {TAB_GROUPS.map(group => {
                const groupTabs = ALL_NAV_TABS.filter(t => t.group === group);
                return (
                  <th
                    key={group}
                    colSpan={groupTabs.length}
                    className="text-center px-2 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-l border-slate-200 dark:border-slate-600"
                  >
                    {group}
                  </th>
                );
              })}
            </tr>
            {/* Tab name row */}
            <tr className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <th className="sticky left-0 bg-white dark:bg-slate-800 px-4 py-2" />
              {ALL_NAV_TABS.map((tab, i) => {
                const isFirstInGroup = i === 0 || ALL_NAV_TABS[i - 1].group !== tab.group;
                return (
                  <th
                    key={tab.key}
                    className={`text-center px-2 py-2 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap ${isFirstInGroup ? 'border-l border-slate-200 dark:border-slate-600' : ''}`}
                  >
                    {tab.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {/* Manageable roles */}
            {MANAGEABLE_ROLES.map(role => (
              <tr key={role.key} className="bg-white dark:bg-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                <td className="sticky left-0 bg-white dark:bg-slate-800 px-4 py-3 hover:bg-slate-50/50">
                  <div className="font-bold text-slate-800 dark:text-slate-200">{role.label}</div>
                  <div className="text-[10px] text-slate-400 leading-tight">{role.description}</div>
                </td>
                {ALL_NAV_TABS.map((tab, i) => {
                  const isFirstInGroup = i === 0 || ALL_NAV_TABS[i - 1].group !== tab.group;
                  const checked = visibility[role.key]?.includes(tab.key) ?? false;
                  return (
                    <td
                      key={tab.key}
                      className={`text-center px-2 py-3 ${isFirstInGroup ? 'border-l border-slate-100 dark:border-slate-700' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(role.key, tab.key)}
                        className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* ADMIN — locked, always full access */}
            <tr className="bg-slate-50/80 dark:bg-slate-700/20">
              <td className="sticky left-0 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                <div className="flex items-center gap-1.5 font-bold text-slate-500 dark:text-slate-400">
                  <ShieldCheck size={11} className="text-indigo-400" />
                  Admin
                </div>
                <div className="text-[10px] text-slate-400 leading-tight">Full access — always</div>
              </td>
              {ALL_NAV_TABS.map((tab, i) => {
                const isFirstInGroup = i === 0 || ALL_NAV_TABS[i - 1].group !== tab.group;
                return (
                  <td
                    key={tab.key}
                    className={`text-center px-2 py-3 ${isFirstInGroup ? 'border-l border-slate-100 dark:border-slate-700' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="w-3.5 h-3.5 rounded accent-indigo-400 opacity-40 cursor-not-allowed"
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400">
        Changes take effect after saving. Users currently logged in will see updated tabs on their next page load.
      </p>
    </div>
  );
}

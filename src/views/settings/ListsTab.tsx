import React, { useState } from 'react';
import { AppConfig } from '../../types';
import { SCOPES, LEADS, PLAN_TYPES } from '../../constants';

// ── Editable list component ───────────────────────────────────────────────────

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

// ── Lists tab ─────────────────────────────────────────────────────────────────

interface ListsTabProps {
  form: AppConfig;
  setForm: React.Dispatch<React.SetStateAction<AppConfig>>;
  saving: boolean;
  handleSave: () => Promise<void>;
}

export const ListsTab: React.FC<ListsTabProps> = ({ form, setForm, saving, handleSave }) => (
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
);

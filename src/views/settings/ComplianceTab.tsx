import React from 'react';
import { AppConfig } from '../../types';

interface ComplianceTabProps {
  form: AppConfig;
  setForm: React.Dispatch<React.SetStateAction<AppConfig>>;
  saving: boolean;
  handleSave: () => Promise<void>;
}

export const ComplianceTab: React.FC<ComplianceTabProps> = ({ form, setForm, saving, handleSave }) => (
  <div className="space-y-8">
    <div>
      <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">PHE Application Pre-fill</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">These values auto-populate the Peak Hour Exemption form. Fill in once — they apply to all plans.</p>

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
            { key: 'phe_contactTitle', label: 'Contact Title' },
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
);

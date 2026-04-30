import React from 'react';
import { AppConfig, TansatContact, TansatSettings } from '../../types';
import { DEFAULT_TANSAT_SETTINGS } from '../../constants';

interface TansatTabProps {
  form: AppConfig;
  setForm: React.Dispatch<React.SetStateAction<AppConfig>>;
}

type GroupKey = 'dot' | 'internal' | 'client';

// Defensive read — covers older AppConfig docs that predate this tab.
function readSettings(form: AppConfig): TansatSettings {
  return (form.tansatSettings ?? DEFAULT_TANSAT_SETTINGS) as TansatSettings;
}

export const TansatTab: React.FC<TansatTabProps> = ({ form, setForm }) => {
  const s = readSettings(form);

  const update = (mut: (draft: TansatSettings) => TansatSettings) => {
    setForm(p => ({ ...p, tansatSettings: mut(readSettings(p)) }));
  };

  const setField = <K extends keyof TansatSettings>(key: K, value: TansatSettings[K]) =>
    update(d => ({ ...d, [key]: value }));

  const setThreshold = <K extends keyof TansatSettings['thresholds']>(
    key: K, value: number,
  ) => update(d => ({ ...d, thresholds: { ...d.thresholds, [key]: value } }));

  const updateContact = (group: GroupKey, idx: number, patch: Partial<TansatContact>) =>
    update(d => ({
      ...d,
      ccGroups: {
        ...d.ccGroups,
        [group]: {
          ...d.ccGroups[group],
          contacts: d.ccGroups[group].contacts.map((c, i) => i === idx ? { ...c, ...patch } : c),
        },
      },
    }));

  const addContact = (group: GroupKey) =>
    update(d => ({
      ...d,
      ccGroups: {
        ...d.ccGroups,
        [group]: {
          ...d.ccGroups[group],
          contacts: [...d.ccGroups[group].contacts, { name: '', email: '', defaultIncluded: true }],
        },
      },
    }));

  const removeContact = (group: GroupKey, idx: number) =>
    update(d => ({
      ...d,
      ccGroups: {
        ...d.ccGroups,
        [group]: {
          ...d.ccGroups[group],
          contacts: d.ccGroups[group].contacts.filter((_, i) => i !== idx),
        },
      },
    }));

  return (
    <div className="space-y-8">
      {/* ── Primary recipients ───────────────────────────── */}
      <section>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">Primary Recipients</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Reggie Pilotin at LADOT is the canonical TANSAT contact. The default customer name appears on every LADOT invoice
          and should match the contractor name LADOT has on file.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">
              Reggie's Email (To:)
            </label>
            <input
              type="email"
              className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={s.reggieEmail}
              onChange={e => setField('reggieEmail', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">
              Default Customer Name (on invoice)
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={s.defaultCustomerName}
              onChange={e => setField('defaultCustomerName', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">
              From Address (Phase 2 only)
            </label>
            <input
              type="email"
              placeholder="awaiting IT provisioning…"
              className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={s.fromAddress ?? ''}
              onChange={e => setField('fromAddress', e.target.value)}
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Populates after IT provisions a company-domain email. Phase 1 (mailto handoff) ignores this field.
            </p>
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-400"
                checked={s.aiExtractionEnabled}
                onChange={e => setField('aiExtractionEnabled', e.target.checked)}
              />
              AI invoice extraction (Gemini)
              <span className="text-[10px] font-normal text-slate-400 ml-2">
                Re-uses the API key from System tab.
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* ── CC groups ────────────────────────────────────── */}
      <section className="border-t border-slate-100 dark:border-slate-700 pt-6">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">CC Groups</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Recipients organized by audience. The "Default" toggle pre-checks the recipient when MOT composes a TANSAT email.
          MOT can still add or drop individuals per send.
        </p>
        <div className="space-y-4">
          {(['dot', 'internal', 'client'] as GroupKey[]).map(key => {
            const group = s.ccGroups[key];
            return (
              <div key={key} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-900/40">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{group.name}</div>
                  <button
                    type="button"
                    onClick={() => addContact(key)}
                    className="text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline"
                  >
                    + Add contact
                  </button>
                </div>
                {group.contacts.length === 0 && (
                  <div className="text-xs text-slate-400 italic">No contacts yet — click "+ Add contact" to add one.</div>
                )}
                <div className="space-y-2">
                  {group.contacts.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Name"
                        className="w-40 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={c.name}
                        onChange={e => updateContact(key, idx, { name: e.target.value })}
                      />
                      <input
                        type="email"
                        placeholder="email@example.com"
                        className="flex-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={c.email}
                        onChange={e => updateContact(key, idx, { email: e.target.value })}
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded text-blue-600"
                          checked={c.defaultIncluded}
                          onChange={e => updateContact(key, idx, { defaultIncluded: e.target.checked })}
                        />
                        Default
                      </label>
                      <button
                        type="button"
                        onClick={() => removeContact(key, idx)}
                        title="Remove contact"
                        className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-lg leading-none px-2 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── SLA thresholds ───────────────────────────────── */}
      <section className="border-t border-slate-100 dark:border-slate-700 pt-6">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">SLA Notification Thresholds</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Days that drive the in-app and email alerts surfaced in the MOT Hub and dashboard. Lower values = earlier warnings.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ThresholdField
            label="Needs Packet"
            value={s.thresholds.needsPacketDays}
            help="Notify when a phase starts within N days and no TANSAT request has been built yet."
            unit="days before phase start"
            onChange={v => setThreshold('needsPacketDays', v)}
          />
          <ThresholdField
            label="Awaiting Invoice"
            value={s.thresholds.awaitingInvoiceDays}
            help="Notify when MOT emailed Reggie N days ago and no LOG # has been received."
            unit="days after email sent"
            onChange={v => setThreshold('awaitingInvoiceDays', v)}
          />
          <ThresholdField
            label="Payment Due"
            value={s.thresholds.paymentDueDays}
            help="Notify when an invoice is unpaid and the LADOT due date is within N days."
            unit="days before due date"
            onChange={v => setThreshold('paymentDueDays', v)}
          />
          <ThresholdField
            label="Extension Window"
            value={s.thresholds.extensionWindowBusinessDays}
            help="LADOT requires extension requests N business days before the original phase end. Reminder fires inside that window."
            unit="business days before phase end"
            onChange={v => setThreshold('extensionWindowBusinessDays', v)}
          />
          <ThresholdField
            label="Meter Duration Limit"
            value={s.thresholds.metersAffectedMaxDays}
            help="Show Bureau of Parking Management referral warning when meter-affected work exceeds N days."
            unit="days (referral threshold)"
            onChange={v => setThreshold('metersAffectedMaxDays', v)}
          />
        </div>
      </section>

      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 p-4 text-xs text-blue-900 dark:text-blue-200">
        <b>Save</b> using the global "Save Settings" button at the bottom — this tab uses the shared save flow.
      </div>
    </div>
  );
};

interface ThresholdFieldProps {
  label: string;
  value: number;
  help: string;
  unit: string;
  onChange: (v: number) => void;
}

const ThresholdField: React.FC<ThresholdFieldProps> = ({ label, value, help, unit, onChange }) => (
  <div>
    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">
      {label}
    </label>
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        className="w-24 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={value}
        onChange={e => onChange(parseInt(e.target.value) || 0)}
      />
      <span className="text-xs text-slate-500 dark:text-slate-400">{unit}</span>
    </div>
    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{help}</p>
  </div>
);

import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { showToast } from '../lib/toast';
import { AppConfig } from '../types';
import { DEFAULT_APP_CONFIG } from '../constants';
import { BrandingTab }       from './settings/BrandingTab';
import { WorkflowTab }       from './settings/WorkflowTab';
import { ListsTab }          from './settings/ListsTab';
import { DataTab }           from './settings/DataTab';
import { ComplianceTab }     from './settings/ComplianceTab';
import { SystemTab }         from './settings/SystemTab';
import { AccessTab }         from './settings/AccessTab';
import { EmailTemplatesTab } from './settings/EmailTemplatesTab';
import { EmailAuditTab }     from './settings/EmailAuditTab';
import { NotificationsTab }  from './settings/NotificationsTab';
import { TansatTab }         from './settings/TansatTab';

interface SettingsViewProps {
  appConfig: AppConfig;
  setAppConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  role: string;
  users: any[];
  setClearPlansConfirm: (show: boolean) => void;
  onOpenImport: () => void;
  onExportCSV: () => void;
  currentUserEmail?: string;
  notificationEmail?: string;
}

type Tab = 'branding' | 'workflow' | 'lists' | 'data' | 'compliance' | 'system' | 'access'
         | 'email_templates' | 'email_audit' | 'notifications' | 'tansat';

const TABS: { key: Tab; label: string; group?: string }[] = [
  { key: 'branding',         label: 'Branding' },
  { key: 'workflow',         label: 'Workflow Rules' },
  { key: 'lists',            label: 'Managed Lists' },
  { key: 'data',             label: 'Data' },
  { key: 'compliance',       label: 'Compliance' },
  { key: 'tansat',           label: 'TANSAT' },
  { key: 'access',           label: 'Team Access' },
  { key: 'system',           label: 'System' },
  { key: 'email_templates',  label: 'Email Templates',  group: 'email' },
  { key: 'email_audit',      label: 'Email Audit Log',  group: 'email' },
  { key: 'notifications',    label: 'Notifications',    group: 'email' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  appConfig, setAppConfig, role, users, setClearPlansConfirm, onOpenImport, onExportCSV,
  currentUserEmail, notificationEmail,
}) => {
  const [tab, setTab] = useState<Tab>('branding');
  const [form, setForm] = useState<AppConfig>({ ...DEFAULT_APP_CONFIG, ...appConfig });
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your app configuration, workflow rules, and data.</p>
      </div>

      {/* Tab Bar */}
      <div className="space-y-2 mb-6">
        {/* Main tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit flex-wrap">
          {TABS.filter(t => !t.group).map(t => (
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
        {/* Email / Notifications sub-group */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Email</span>
          <div className="flex gap-1 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40 p-1 rounded-xl w-fit">
            {TABS.filter(t => t.group === 'email').map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  tab === t.key
                    ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-sm'
                    : 'text-violet-500 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
        {/* Version badge */}
        <div className="flex justify-end mb-6 -mt-2">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-widest uppercase bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full">
            v2.0.0
          </span>
        </div>
        {tab === 'branding'        && <BrandingTab       form={form} setForm={setForm} />}
        {tab === 'workflow'        && <WorkflowTab       form={form} setForm={setForm} />}
        {tab === 'lists'           && <ListsTab          form={form} setForm={setForm} saving={saving} handleSave={handleSave} />}
        {tab === 'data'            && <DataTab           role={role} setClearPlansConfirm={setClearPlansConfirm} onOpenImport={onOpenImport} onExportCSV={onExportCSV} />}
        {tab === 'compliance'      && <ComplianceTab     form={form} setForm={setForm} saving={saving} handleSave={handleSave} />}
        {tab === 'tansat'          && <TansatTab         form={form} setForm={setForm} />}
        {tab === 'access'          && <AccessTab         form={form} setForm={setForm} />}
        {tab === 'system'          && <SystemTab         users={users} />}
        {tab === 'email_templates' && <EmailTemplatesTab currentUserEmail={currentUserEmail} notificationEmail={notificationEmail} />}
        {tab === 'email_audit'     && <EmailAuditTab />}
        {tab === 'notifications'   && <NotificationsTab />}

        {/* Shared save button for tabs that don't have their own */}
        {(tab === 'branding' || tab === 'workflow' || tab === 'access' || tab === 'tansat') && (
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

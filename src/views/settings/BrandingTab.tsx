import React, { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase';
import { showToast } from '../../lib/toast';
import { AppConfig } from '../../types';

const COLOR_SWATCHES = [
  { label: 'Amber',   value: '#F59E0B' },
  { label: 'Blue',    value: '#3B82F6' },
  { label: 'Indigo',  value: '#6366F1' },
  { label: 'Green',   value: '#10B981' },
  { label: 'Rose',    value: '#F43F5E' },
  { label: 'Slate',   value: '#475569' },
];

interface BrandingTabProps {
  form: AppConfig;
  setForm: React.Dispatch<React.SetStateAction<AppConfig>>;
}

export const BrandingTab: React.FC<BrandingTabProps> = ({ form, setForm }) => {
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  return (
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
  );
};

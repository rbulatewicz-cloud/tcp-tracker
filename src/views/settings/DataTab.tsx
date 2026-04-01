import React from 'react';

interface DataTabProps {
  role: string;
  setClearPlansConfirm: (show: boolean) => void;
  onOpenImport: () => void;
  onExportCSV: () => void;
}

export const DataTab: React.FC<DataTabProps> = ({ role, setClearPlansConfirm, onOpenImport, onExportCSV }) => (
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
);

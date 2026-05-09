import React, { useState } from 'react';
import { showToast } from '../../lib/toast';
import { deleteTestData } from '../../services/testDataCleanup';

interface DataTabProps {
  role: string;
  setClearPlansConfirm: (show: boolean) => void;
  onOpenImport: () => void;
  onExportCSV: () => void;
}

export const DataTab: React.FC<DataTabProps> = ({
  role,
  setClearPlansConfirm,
  onOpenImport,
  onExportCSV,
}) => {
  const [cleaningTestData, setCleaningTestData] = useState(false);
  const [showTestDataConfirm, setShowTestDataConfirm] = useState(false);

  const handleCleanupTestData = async () => {
    setCleaningTestData(true);
    try {
      const result = await deleteTestData();
      if (result.count === 0) {
        showToast('No test data found', 'info');
      } else {
        showToast(
          `Deleted ${result.count} test record${result.count !== 1 ? 's' : ''}`,
          'success'
        );
      }
    } catch (error) {
      showToast('Failed to clean up test data', 'error');
      console.error(error);
    } finally {
      setCleaningTestData(false);
      setShowTestDataConfirm(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
          Import & Export
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Bulk import plans from Excel or export all current data to CSV.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onOpenImport}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Import Master File
          </button>
          <button
            onClick={onExportCSV}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export All to CSV
          </button>
        </div>
      </div>

      {role === 'ADMIN' && (
        <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
          <h2 className="text-base font-bold text-red-600 mb-1">Danger Zone</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            These actions are permanent and cannot be undone.
          </p>
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-amber-800">Clean Up Test Data</div>
                <div className="text-xs text-amber-600 mt-0.5">
                  Removes all test records (LOC-TEST, 1234 abc st, etc.) from the database.
                </div>
              </div>
              <button
                onClick={() => setShowTestDataConfirm(true)}
                disabled={cleaningTestData}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cleaningTestData ? 'Cleaning...' : 'Clean Up'}
              </button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-red-800">Wipe All Plans</div>
                <div className="text-xs text-red-600 mt-0.5">
                  Permanently deletes all LOC records, logs, and associated data.
                </div>
              </div>
              <button
                onClick={() => setClearPlansConfirm(true)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
              >
                Clear All Plans
              </button>
            </div>
          </div>
        </div>
      )}

      {showTestDataConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[5000] p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Clean Up Test Data?</h3>
            <p className="text-sm text-slate-600 mb-6">
              This will permanently delete all test records including LOC-TEST, LOC-test2,
              and related properties. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTestDataConfirm(false)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCleanupTestData}
                disabled={cleaningTestData}
                className="flex-1 px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cleaningTestData ? 'Cleaning...' : 'Confirm Cleanup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

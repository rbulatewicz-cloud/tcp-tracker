import React, { useEffect, useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { showToast } from '../../lib/toast';
import { parseXer, P6Activity } from '../../services/xerParser';
import {
  getCurrentScheduleMeta,
  uploadP6Activities,
  P6ScheduleMeta,
} from '../../services/p6ActivityService';
import { invalidateP6ActivityCache } from '../../components/P6ActivityPicker';

interface P6ScheduleTabProps {
  role: string;
  currentUserEmail?: string;
}

type Stage = 'idle' | 'reading' | 'parsing' | 'uploading' | 'done' | 'error';

export const P6ScheduleTab: React.FC<P6ScheduleTabProps> = ({ role, currentUserEmail }) => {
  const isAdmin = role === 'ADMIN';
  const inputRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<P6ScheduleMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [previewName, setPreviewName] = useState<string>('');
  const [previewCount, setPreviewCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    getCurrentScheduleMeta().then(m => {
      if (!cancelled) {
        setMeta(m);
        setMetaLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const handleFile = async (file: File) => {
    if (!file) return;
    if (!currentUserEmail) {
      showToast('You must be signed in to upload', 'error');
      return;
    }
    setErrorMsg('');
    setPreviewName(file.name);

    let text: string;
    try {
      setStage('reading');
      text = await file.text();
    } catch (e) {
      setStage('error');
      setErrorMsg('Could not read the file.');
      return;
    }

    let parsed: { projectName: string; activities: P6Activity[] };
    try {
      setStage('parsing');
      parsed = parseXer(text);
      setPreviewCount(parsed.activities.length);
    } catch (e) {
      setStage('error');
      setErrorMsg(e instanceof Error ? e.message : 'Failed to parse XER file.');
      return;
    }

    try {
      setStage('uploading');
      const { written } = await uploadP6Activities(parsed.activities, {
        fileName: file.name,
        projectName: parsed.projectName,
        uploadedBy: currentUserEmail,
      });
      setStage('done');
      showToast(`Uploaded ${written.toLocaleString()} activities`, 'success');
      invalidateP6ActivityCache();
      const fresh = await getCurrentScheduleMeta();
      setMeta(fresh);
    } catch (e) {
      setStage('error');
      setErrorMsg(e instanceof Error ? e.message : 'Upload failed.');
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ''; // allow re-picking the same file
  };

  if (!isAdmin) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400">
        Admin only. Contact an administrator to upload P6 schedule files.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
          P6 Schedule Phonebook
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Upload the latest Primavera P6 .xer export. We extract only activity IDs, names, and
          WBS paths — no dates or status. The list powers the schedule activity picker on TCP
          requests so engineers can search by description instead of memorizing IDs.
        </p>
      </div>

      {/* Current snapshot */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          Current Snapshot
        </div>
        {metaLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : meta ? (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-slate-400" />
              <span className="font-semibold text-slate-800 dark:text-slate-200">{meta.fileName}</span>
            </div>
            {meta.projectName && (
              <div className="text-xs text-slate-500">Project: {meta.projectName}</div>
            )}
            <div className="text-xs text-slate-500">
              {meta.activityCount.toLocaleString()} activities · uploaded by {meta.uploadedBy}
              {meta.uploadedAt && typeof meta.uploadedAt.toDate === 'function' && (
                <> · {meta.uploadedAt.toDate().toLocaleString()}</>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              No schedule loaded yet. New TCP requests will be blocked from submitting until you
              upload a .xer file. Existing plans are unaffected.
            </div>
          </div>
        )}
      </div>

      {/* Upload */}
      <div>
        <label
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm font-semibold transition-all ${
            stage === 'uploading' || stage === 'parsing' || stage === 'reading'
              ? 'border-slate-300 text-slate-400 cursor-wait'
              : 'border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'
          }`}
        >
          {stage === 'reading' && <><Loader2 size={16} className="animate-spin" /> Reading file…</>}
          {stage === 'parsing' && <><Loader2 size={16} className="animate-spin" /> Parsing XER…</>}
          {stage === 'uploading' && <><Loader2 size={16} className="animate-spin" /> Uploading {previewCount.toLocaleString()} activities…</>}
          {(stage === 'idle' || stage === 'done' || stage === 'error') && (
            <>
              <Upload size={16} />
              {meta ? 'Upload a new .xer to refresh / merge' : 'Upload .xer to seed the phonebook'}
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xer"
            onChange={onPick}
            disabled={stage === 'reading' || stage === 'parsing' || stage === 'uploading'}
            className="hidden"
          />
        </label>

        {stage === 'done' && (
          <div className="mt-3 flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              {previewName} processed — {previewCount.toLocaleString()} activities merged into the
              phonebook.
            </div>
          </div>
        )}
        {stage === 'error' && errorMsg && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <div>{errorMsg}</div>
          </div>
        )}

        <p className="mt-3 text-[10px] text-slate-400">
          Merge behaviour: new activities are added, existing IDs are refreshed with the latest
          name/WBS path. Activities removed from the latest export are NOT deleted so existing
          plan links keep displaying.
        </p>
      </div>
    </div>
  );
};

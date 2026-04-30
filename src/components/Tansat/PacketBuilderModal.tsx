import React, { useEffect, useMemo, useState } from 'react';
import type {
  Plan, PlanTansatPhase, NoiseVariance, TansatActivity, TansatRequest,
  TansatSide, TansatDayPattern, TansatSettings,
} from '../../types';
import {
  createTansatRequest, updateTansatRequest, uploadTansatAttachment,
} from '../../services/tansatService';
import { subscribeToVariances } from '../../services/varianceService';
import { ACTIVITY_LABELS } from '../PlanCardSections/tansat/tansatShared';
import { getActualPostingDate } from '../../utils/tansatSpend';
import { fmtDate } from '../../utils/plans';
import { showToast } from '../../lib/toast';
import { EmailComposerModal } from './EmailComposerModal';

interface PacketBuilderModalProps {
  plan: Plan;
  appConfig?: { tansatSettings?: TansatSettings };
  currentUserName: string;
  // Optional: pre-load an existing draft request to continue editing
  existingRequest?: TansatRequest;
  onClose: () => void;
}

type Tab = 'activity' | 'workArea' | 'mapNv' | 'review';

const TABS: { key: Tab; label: string }[] = [
  { key: 'activity',  label: '1. Activity & Phases' },
  { key: 'workArea',  label: '2. Work Area & Schedule' },
  { key: 'mapNv',     label: '3. Map & NV' },
  { key: 'review',    label: '4. Review' },
];

const ACTIVITY_KEYS: TansatActivity[] = [
  'potholing','paving','paving_restoration','restoration','conduit_work',
  'asbestos_pipe','sawcutting','vault_conduit','krail_delivery',
  'krail_implementation','pile_installation','demo','building_demo',
  'implementation','utility_support','median_removal','tree_planting',
  'tree_removal','temp_street_light','inside_out','other',
];

const SIDE_OPTIONS: { value: TansatSide; label: string }[] = [
  { value: 'N',    label: 'Northside' },
  { value: 'S',    label: 'Southside' },
  { value: 'E',    label: 'Eastside' },
  { value: 'W',    label: 'Westside' },
  { value: 'NB',   label: 'Northbound' },
  { value: 'SB',   label: 'Southbound' },
  { value: 'EB',   label: 'Eastbound' },
  { value: 'WB',   label: 'Westbound' },
  { value: 'BOTH', label: 'Both sides' },
];

const DAY_PATTERN_OPTIONS: { value: TansatDayPattern; label: string }[] = [
  { value: 'daily',    label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays only' },
  { value: 'weekends', label: 'Weekends only' },
  { value: 'custom',   label: 'Custom' },
];

const DOW_LABELS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ─────────────────────────────────────────────────────────────────────────────

export const PacketBuilderModal: React.FC<PacketBuilderModalProps> = ({
  plan, appConfig, currentUserName, existingRequest, onClose,
}) => {
  const [tab, setTab] = useState<Tab>('activity');
  const [draft, setDraft] = useState(() => emptyDraft(plan, existingRequest));
  const [variances, setVariances] = useState<NoiseVariance[]>([]);
  const [selectedNvIds, setSelectedNvIds] = useState<string[]>(existingRequest?.attachedVarianceIds ?? []);
  const [mapFile, setMapFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | undefined>(existingRequest?.id);

  // Subscribe to noise variances for the multi-select
  useEffect(() => {
    const unsub = subscribeToVariances(setVariances);
    return () => unsub();
  }, []);

  // Pre-select NVs whose validity window overlaps the schedule dates
  // (only if user hasn't manually picked anything yet)
  useEffect(() => {
    if (selectedNvIds.length > 0) return;
    if (!draft.startDate || !draft.endDate) return;
    const overlapping = variances.filter(nv =>
      nv.validFrom && nv.validThrough
      && nv.validFrom <= draft.endDate
      && nv.validThrough >= draft.startDate
    );
    if (overlapping.length > 0) {
      setSelectedNvIds(overlapping.map(v => v.id));
    }
  }, [variances, draft.startDate, draft.endDate, selectedNvIds.length]);

  // ── Derived state ────────────────────────────────────────────────────────
  const activePhases = useMemo(
    () => (plan.tansatPhases ?? []).filter(p => p.needsTansat),
    [plan.tansatPhases],
  );
  const planHasNvCompliance = !!plan.compliance?.noiseVariance
    && plan.compliance.noiseVariance.status !== 'not_started';
  const nvHardBlock = planHasNvCompliance && selectedNvIds.length === 0;

  const validationByTab: Record<Tab, string | null> = {
    activity: !draft.activity ? 'Choose an activity' :
              draft.activity === 'other' && !draft.activityOther ? 'Describe the activity' :
              draft.phaseNumbers.length === 0 ? 'Select at least one phase' : null,
    workArea: !draft.street ? 'Street name required' :
              !draft.fromLimit ? 'From limit required' :
              !draft.toLimit ? 'To limit required' :
              !draft.startDate || !draft.endDate ? 'Schedule dates required' :
              !draft.startTime || !draft.endTime ? 'Schedule times required' : null,
    mapNv: !mapFile && !existingRequest?.mapScreenshot ? 'Upload a map screenshot' :
           nvHardBlock ? 'Attach at least one Noise Variance (plan has active NV compliance)' : null,
    review: null,
  };

  const activeError = validationByTab[tab];

  // ── Save / submit ────────────────────────────────────────────────────────
  async function persistDraft(opts: { advanceTo?: Tab; openEmail?: boolean } = {}) {
    setSaving(true);
    try {
      let id = requestId;
      if (!id) {
        id = await createTansatRequest({
          planId: plan.id,
          phaseNumbers: draft.phaseNumbers,
          activity: draft.activity,
          activityOther: draft.activityOther || undefined,
          workArea: {
            side: draft.side, street: draft.street,
            fromLimit: draft.fromLimit, toLimit: draft.toLimit,
          },
          schedule: {
            dayPattern: draft.dayPattern,
            startDate: draft.startDate, startTime: draft.startTime,
            endDate: draft.endDate, endTime: draft.endTime,
          },
          notes: draft.notes,
          createdBy: currentUserName || 'unknown',
        });
        setRequestId(id);
      } else {
        await updateTansatRequest(id, {
          phaseNumbers: draft.phaseNumbers,
          activity: draft.activity,
          activityOther: draft.activityOther || undefined,
          workArea: {
            side: draft.side, street: draft.street,
            fromLimit: draft.fromLimit, toLimit: draft.toLimit,
          },
          schedule: {
            dayPattern: draft.dayPattern,
            startDate: draft.startDate, startTime: draft.startTime,
            endDate: draft.endDate, endTime: draft.endTime,
          },
          notes: draft.notes,
          attachedVarianceIds: selectedNvIds,
        });
      }
      // Upload map if newly selected
      if (mapFile) {
        const att = await uploadTansatAttachment(id, mapFile, 'map', currentUserName || 'unknown');
        await updateTansatRequest(id, { mapScreenshot: att });
        setMapFile(null);  // mark as uploaded
      }
      // Status: leave at draft until packet_ready transition (Review tab)
      if (opts.advanceTo) setTab(opts.advanceTo);
      if (opts.openEmail) {
        await updateTansatRequest(id, { status: 'packet_ready' });
        setEmailComposerOpen(true);
      } else {
        showToast('Draft saved', 'success');
      }
    } catch (err) {
      console.error('Failed to save TANSAT draft:', err);
      showToast('Failed to save draft', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Body text preview (for the right pane on tab 2 & 4) ─────────────────
  const previewBody = useMemo(() => buildEmailBody(draft), [draft]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold">Build TANSAT Packet</h3>
            <p className="text-xs text-slate-500">
              Plan <span className="font-mono font-bold">{plan.loc || plan.id}</span> · {plan.street1}{plan.street2 ? ` / ${plan.street2}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-6 pt-3 pb-1 border-b border-slate-100 overflow-x-auto">
          {TABS.map(t => {
            const isActive = t.key === tab;
            const tErr = validationByTab[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`text-xs font-bold px-3 py-1.5 rounded-t whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : tErr
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-6">
          {tab === 'activity' && (
            <ActivityTab
              draft={draft}
              setDraft={setDraft}
              activePhases={activePhases}
              allPhases={plan.tansatPhases ?? []}
            />
          )}
          {tab === 'workArea' && (
            <WorkAreaScheduleTab draft={draft} setDraft={setDraft} previewBody={previewBody} />
          )}
          {tab === 'mapNv' && (
            <MapNvTab
              draft={draft}
              mapFile={mapFile}
              setMapFile={setMapFile}
              existingMap={existingRequest?.mapScreenshot}
              variances={variances}
              selectedNvIds={selectedNvIds}
              setSelectedNvIds={setSelectedNvIds}
              planHasNvCompliance={planHasNvCompliance}
              nvHardBlock={nvHardBlock}
            />
          )}
          {tab === 'review' && (
            <ReviewTab
              draft={draft}
              previewBody={previewBody}
              variances={variances}
              selectedNvIds={selectedNvIds}
              mapFile={mapFile}
              existingMapName={existingRequest?.mapScreenshot?.name}
              validationByTab={validationByTab}
              setTab={setTab}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <div className="text-xs text-slate-500">
            {activeError ? (
              <span className="text-amber-700"><b>⚠</b> {activeError}</span>
            ) : (
              <span className="text-emerald-700">✓ Looks good</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => persistDraft()}
              disabled={saving}
              className="text-xs font-bold px-4 py-2 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            {tab !== 'review' ? (
              <button
                type="button"
                onClick={() => {
                  const order: Tab[] = ['activity', 'workArea', 'mapNv', 'review'];
                  const next = order[order.indexOf(tab) + 1];
                  if (next) setTab(next);
                }}
                className="text-xs font-bold px-4 py-2 rounded bg-slate-900 text-white hover:bg-slate-700"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => persistDraft({ openEmail: true })}
                disabled={saving || !!validationByTab.activity || !!validationByTab.workArea || !!validationByTab.mapNv}
                title={
                  validationByTab.activity || validationByTab.workArea || validationByTab.mapNv ||
                  'Open the email composer to send this packet to Reggie'
                }
                className="text-xs font-bold px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : '📨 Open Email Composer →'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Email composer (T-2.3a) */}
      {emailComposerOpen && requestId && (
        <EmailComposerModal
          requestId={requestId}
          plan={plan}
          appConfig={appConfig}
          draftBody={previewBody}
          subject={buildSubject(draft, plan)}
          mapAttachmentName={mapFile?.name ?? existingRequest?.mapScreenshot?.name}
          attachedVariances={variances.filter(v => selectedNvIds.includes(v.id))}
          onClose={() => {
            setEmailComposerOpen(false);
            onClose();  // close the whole flow once email handoff completes
          }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1 — Activity & Phases
// ─────────────────────────────────────────────────────────────────────────────

const ActivityTab: React.FC<{
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  activePhases: PlanTansatPhase[];
  allPhases: PlanTansatPhase[];
}> = ({ draft, setDraft, activePhases, allPhases }) => {
  const togglePhase = (n: number) =>
    setDraft(d => ({
      ...d,
      phaseNumbers: d.phaseNumbers.includes(n)
        ? d.phaseNumbers.filter(x => x !== n)
        : [...d.phaseNumbers, n].sort((a, b) => a - b),
    }));

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Activity</label>
        <select
          className="w-full md:w-80 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={draft.activity}
          onChange={e => setDraft(d => ({ ...d, activity: e.target.value as TansatActivity }))}
        >
          {ACTIVITY_KEYS.map(k => (
            <option key={k} value={k}>{ACTIVITY_LABELS[k]}</option>
          ))}
        </select>
        {draft.activity === 'other' && (
          <input
            type="text"
            placeholder="Describe the activity"
            value={draft.activityOther}
            onChange={e => setDraft(d => ({ ...d, activityOther: e.target.value }))}
            className="ml-3 w-72 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
          Phases covered ({draft.phaseNumbers.length} selected)
        </label>
        {allPhases.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No phases defined on this plan. Close this modal and use "Edit phases" on the plan card to add some.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allPhases.map(phase => {
              const selected = draft.phaseNumbers.includes(phase.phaseNumber);
              const inactive = !phase.needsTansat;
              return (
                <button
                  key={phase.phaseNumber}
                  type="button"
                  onClick={() => togglePhase(phase.phaseNumber)}
                  disabled={inactive}
                  className={`text-xs font-bold px-3 py-1.5 rounded border transition-all ${
                    selected
                      ? 'bg-blue-600 text-white border-blue-700'
                      : inactive
                        ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'
                  }`}
                  title={inactive ? 'This phase is marked Skip TANSAT' : ''}
                >
                  P{phase.phaseNumber}
                  {phase.label ? ` · ${phase.label}` : ''}
                  {inactive && ' (Skip)'}
                </button>
              );
            })}
          </div>
        )}
        {activePhases.length > 0 && draft.phaseNumbers.length === 0 && (
          <p className="text-[11px] text-amber-700 mt-2">
            Select at least one phase that this TANSAT request will cover.
          </p>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2 — Work Area + Schedule (table-style mirroring the email format)
// ─────────────────────────────────────────────────────────────────────────────

const WorkAreaScheduleTab: React.FC<{
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  previewBody: string;
}> = ({ draft, setDraft, previewBody }) => {
  const startDay = computeDayName(draft.startDate);
  const endDay = computeDayName(draft.endDate);
  const actualPosting = draft.startDate ? getActualPostingDate(draft.startDate) : '';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* LEFT: fill-in-the-blank tables */}
      <div className="space-y-6">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
            📍 Work Area
          </label>
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <FieldRow label="Side">
              <select
                className="w-full md:w-56 border border-slate-300 rounded px-2 py-1 text-sm"
                value={draft.side}
                onChange={e => setDraft(d => ({ ...d, side: e.target.value as TansatSide }))}
              >
                {SIDE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FieldRow>
            <Connector text="of" />
            <FieldRow label="Street">
              <input
                type="text"
                value={draft.street}
                onChange={e => setDraft(d => ({ ...d, street: e.target.value }))}
                placeholder="e.g. Calvert St"
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
              />
            </FieldRow>
            <FieldRow label="From Limit">
              <input
                type="text"
                value={draft.fromLimit}
                onChange={e => setDraft(d => ({ ...d, fromLimit: e.target.value }))}
                placeholder="e.g. 100' East of Vesper Ave"
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
              />
            </FieldRow>
            <Connector text="to" />
            <FieldRow label="To Limit" lastRow>
              <input
                type="text"
                value={draft.toLimit}
                onChange={e => setDraft(d => ({ ...d, toLimit: e.target.value }))}
                placeholder="e.g. Van Nuys Blvd"
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
              />
            </FieldRow>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
            ⏱ Schedule
          </label>
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <FieldRow label="Day Pattern">
              <select
                className="w-full md:w-56 border border-slate-300 rounded px-2 py-1 text-sm"
                value={draft.dayPattern}
                onChange={e => setDraft(d => ({ ...d, dayPattern: e.target.value as TansatDayPattern }))}
              >
                {DAY_PATTERN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Day">
              <span className="text-sm text-slate-600 italic">
                {startDay || '—'} <span className="text-[10px] text-slate-400 ml-1">(auto)</span>
              </span>
            </FieldRow>
            <FieldRow label="Date">
              <input
                type="date"
                value={draft.startDate}
                onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))}
                className="w-44 border border-slate-300 rounded px-2 py-1 text-sm"
              />
            </FieldRow>
            <FieldRow label="Time">
              <input
                type="time"
                value={draft.startTime}
                onChange={e => setDraft(d => ({ ...d, startTime: e.target.value }))}
                className="w-32 border border-slate-300 rounded px-2 py-1 text-sm"
              />
            </FieldRow>
            <Connector text="through" bold />
            <FieldRow label="Day Pattern">
              <select
                className="w-full md:w-56 border border-slate-300 rounded px-2 py-1 text-sm"
                value={draft.dayPattern}
                onChange={e => setDraft(d => ({ ...d, dayPattern: e.target.value as TansatDayPattern }))}
              >
                {DAY_PATTERN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Day">
              <span className="text-sm text-slate-600 italic">
                {endDay || '—'} <span className="text-[10px] text-slate-400 ml-1">(auto)</span>
              </span>
            </FieldRow>
            <FieldRow label="Date">
              <input
                type="date"
                value={draft.endDate}
                onChange={e => setDraft(d => ({ ...d, endDate: e.target.value }))}
                className="w-44 border border-slate-300 rounded px-2 py-1 text-sm"
              />
            </FieldRow>
            <FieldRow label="Time" lastRow>
              <input
                type="time"
                value={draft.endTime}
                onChange={e => setDraft(d => ({ ...d, endTime: e.target.value }))}
                className="w-32 border border-slate-300 rounded px-2 py-1 text-sm"
              />
            </FieldRow>
          </div>
          {actualPosting && (
            <p className="text-[11px] text-slate-500 italic mt-2">
              Actual posting (computed): <b>{computeDayName(actualPosting)} {fmtDate(actualPosting)}</b>
              {' '}<span className="text-slate-400">— LADOT posts 2 days prior, except Sun/Mon/Tue starts post the previous Friday.</span>
            </p>
          )}
        </div>
      </div>

      {/* RIGHT: live email preview */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
          📨 Live Email Preview <span className="font-normal text-slate-400">(updates as you type)</span>
        </label>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-slate-800 font-sans whitespace-pre-line min-h-[300px]">
          {previewBody}
        </div>
        <p className="text-[11px] text-slate-500 mt-2 bg-emerald-50 border border-emerald-200 rounded p-2">
          <b>Why the table layout:</b> Dale's existing Outlook template uses one token per line. The form mirrors
          that exactly so what you fill in IS what Reggie sees — no translation step.
        </p>
      </div>
    </div>
  );
};

// Sub-component: aligned label/value row inside a fill-in-the-blank table
const FieldRow: React.FC<{ label: string; lastRow?: boolean; children: React.ReactNode }> = ({ label, lastRow, children }) => (
  <div className={`grid grid-cols-[110px_1fr] items-center ${lastRow ? '' : 'border-b border-slate-100'}`}>
    <div className="px-2 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100">
      {label}
    </div>
    <div className="px-2 py-1">{children}</div>
  </div>
);

const Connector: React.FC<{ text: string; bold?: boolean }> = ({ text, bold }) => (
  <div className={`text-center py-1 text-[11px] italic text-slate-400 bg-slate-50/50 border-b border-slate-100 ${bold ? 'font-semibold text-slate-500' : ''}`}>
    {text}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3 — Map upload + NV multi-select
// ─────────────────────────────────────────────────────────────────────────────

const MapNvTab: React.FC<{
  draft: Draft;
  mapFile: File | null;
  setMapFile: (f: File | null) => void;
  existingMap?: { name: string };
  variances: NoiseVariance[];
  selectedNvIds: string[];
  setSelectedNvIds: (ids: string[]) => void;
  planHasNvCompliance: boolean;
  nvHardBlock: boolean;
}> = ({ draft, mapFile, setMapFile, existingMap, variances, selectedNvIds, setSelectedNvIds, planHasNvCompliance, nvHardBlock }) => {
  const overlapping = useMemo(() => {
    if (!draft.startDate || !draft.endDate) return new Set<string>();
    return new Set(
      variances
        .filter(v => v.validFrom && v.validThrough && v.validFrom <= draft.endDate && v.validThrough >= draft.startDate)
        .map(v => v.id)
    );
  }, [variances, draft.startDate, draft.endDate]);

  const toggleNv = (id: string) => {
    setSelectedNvIds(selectedNvIds.includes(id)
      ? selectedNvIds.filter(x => x !== id)
      : [...selectedNvIds, id]);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Map upload */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
          🗺️ Map Screenshot <span className="text-red-600 font-bold">required</span>
        </label>
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          {mapFile ? (
            <div>
              <div className="text-2xl">📸</div>
              <div className="text-sm font-semibold mt-2">{mapFile.name}</div>
              <div className="text-[10px] text-slate-500">{(mapFile.size / 1024).toFixed(0)} KB · pending upload</div>
              <button onClick={() => setMapFile(null)} className="mt-2 text-[10px] text-red-600 hover:underline">Remove</button>
            </div>
          ) : existingMap ? (
            <div>
              <div className="text-2xl">📸</div>
              <div className="text-sm font-semibold mt-2">{existingMap.name}</div>
              <div className="text-[10px] text-slate-500">already uploaded</div>
              <label className="mt-2 inline-block text-[10px] text-blue-600 hover:underline cursor-pointer">
                Replace
                <input type="file" accept="image/*,.pdf" hidden onChange={e => setMapFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          ) : (
            <label className="cursor-pointer block">
              <div className="text-3xl opacity-40">🗺️</div>
              <div className="text-sm font-semibold mt-2 text-slate-600">Drop or click to upload</div>
              <div className="text-[10px] text-slate-400">PNG / JPG / PDF — Google Maps screenshot of the work area</div>
              <input type="file" accept="image/*,.pdf" hidden onChange={e => setMapFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>
      </div>

      {/* NV multi-select */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
          🔇 Noise Variance(s)
          {planHasNvCompliance && <span className="text-red-600 font-bold ml-1">required (active NV)</span>}
        </label>
        {variances.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No noise variances in the library yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-white">
            {variances.map(nv => {
              const selected = selectedNvIds.includes(nv.id);
              const isOverlap = overlapping.has(nv.id);
              return (
                <label
                  key={nv.id}
                  className={`flex items-start gap-2 cursor-pointer rounded p-2 border transition-colors ${
                    selected ? 'border-violet-300 bg-violet-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleNv(nv.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs">{nv.title || nv.permitNumber || 'Untitled NV'}</span>
                      {isOverlap && (
                        <span className="text-[9px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">
                          ✨ matches schedule
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {nv.validFrom ? `${fmtDate(nv.validFrom)} → ${fmtDate(nv.validThrough)}` : 'no dates'}
                      {nv.permitNumber ? ` · #${nv.permitNumber}` : ''}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        {nvHardBlock && (
          <p className="text-[11px] text-red-600 mt-2 font-semibold">
            ⛔ Plan has active NV compliance. Attach at least one NV before sending.
          </p>
        )}
        {!planHasNvCompliance && (
          <p className="text-[11px] text-slate-400 italic mt-2">
            This plan has no NV compliance triggered — attaching is optional.
          </p>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab 4 — Review
// ─────────────────────────────────────────────────────────────────────────────

const ReviewTab: React.FC<{
  draft: Draft;
  previewBody: string;
  variances: NoiseVariance[];
  selectedNvIds: string[];
  mapFile: File | null;
  existingMapName?: string;
  validationByTab: Record<Tab, string | null>;
  setTab: (t: Tab) => void;
}> = ({ draft, previewBody, variances, selectedNvIds, mapFile, existingMapName, validationByTab, setTab }) => {
  const blockers = (Object.entries(validationByTab) as [Tab, string | null][])
    .filter(([key, msg]) => key !== 'review' && !!msg);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Summary</div>
        <SummaryRow label="Activity" value={draft.activity === 'other' ? draft.activityOther : ACTIVITY_LABELS[draft.activity]} />
        <SummaryRow label="Phases" value={draft.phaseNumbers.map(n => `P${n}`).join(', ') || '—'} />
        <SummaryRow label="Work area" value={`${draft.side ? sideLabel(draft.side) : ''} of ${draft.street || '—'}, ${draft.fromLimit || '—'} to ${draft.toLimit || '—'}`} />
        <SummaryRow label="Schedule" value={`${draft.dayPattern} · ${fmtDate(draft.startDate)} ${draft.startTime} → ${fmtDate(draft.endDate)} ${draft.endTime}`} />
        <SummaryRow label="Map" value={mapFile?.name ?? existingMapName ?? '—'} />
        <SummaryRow label="Noise Variances" value={
          selectedNvIds.length === 0 ? '—' :
          variances.filter(v => selectedNvIds.includes(v.id)).map(v => v.title || v.permitNumber || v.id).join(', ')
        } />

        {blockers.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <div className="text-xs font-bold text-amber-800 mb-1">Resolve before sending:</div>
            <ul className="space-y-1">
              {blockers.map(([key, msg]) => (
                <li key={key} className="text-[11px]">
                  <button onClick={() => setTab(key)} className="text-amber-700 hover:underline">
                    {TABS.find(t => t.key === key)?.label}: {msg}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Email preview</div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs whitespace-pre-line min-h-[300px]">
          {previewBody}
        </div>
      </div>
    </div>
  );
};

const SummaryRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="grid grid-cols-[100px_1fr] gap-2 items-start text-xs">
    <div className="font-semibold text-slate-500">{label}</div>
    <div className="text-slate-800">{value}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface Draft {
  phaseNumbers: number[];
  activity: TansatActivity;
  activityOther: string;
  side: TansatSide;
  street: string;
  fromLimit: string;
  toLimit: string;
  dayPattern: TansatDayPattern;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  notes: string;
}

function emptyDraft(plan: Plan, existing?: TansatRequest): Draft {
  if (existing) {
    return {
      phaseNumbers: existing.phaseNumbers ?? [],
      activity: existing.activity,
      activityOther: existing.activityOther ?? '',
      side: existing.workArea.side,
      street: existing.workArea.street,
      fromLimit: existing.workArea.fromLimit,
      toLimit: existing.workArea.toLimit,
      dayPattern: existing.schedule.dayPattern,
      startDate: existing.schedule.startDate,
      startTime: existing.schedule.startTime,
      endDate: existing.schedule.endDate,
      endTime: existing.schedule.endTime,
      notes: existing.notes ?? '',
    };
  }
  // Pre-seed schedule from the plan's earliest active phase if available
  const firstActive = (plan.tansatPhases ?? []).find(p => p.needsTansat);
  return {
    phaseNumbers: firstActive ? [firstActive.phaseNumber] : [],
    activity: 'potholing',
    activityOther: '',
    side: 'BOTH',
    street: plan.street1 || '',
    fromLimit: '',
    toLimit: '',
    dayPattern: 'daily',
    startDate: firstActive?.anticipatedStart ?? '',
    startTime: '06:00',
    endDate: firstActive?.anticipatedEnd ?? '',
    endTime: '18:00',
    notes: '',
  };
}

function sideLabel(side: TansatSide): string {
  return SIDE_OPTIONS.find(o => o.value === side)?.label ?? side;
}

function computeDayName(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(iso + 'T00:00:00');
  return DOW_LABELS[d.getDay()];
}

/**
 * Build the TANSAT email body, mirroring the format Dale's been sending to
 * Reggie. One token per line so what's typed is what gets sent.
 */
function buildEmailBody(d: Draft): string {
  const dayLabel = (k: TansatDayPattern) =>
    k === 'daily' ? 'Daily' : k === 'weekdays' ? 'Weekdays' : k === 'weekends' ? 'Weekends' : 'Custom';
  const fmt = (iso: string) => iso ? fmtDate(iso) : '—';

  return [
    'Reggie,',
    '',
    'Please find the below TANSAT request, as a part of the continued METRO SFTC project:',
    '',
    sideLabel(d.side),
    'of',
    d.street || '—',
    d.fromLimit || '—',
    'to',
    d.toLimit || '—',
    '',
    dayLabel(d.dayPattern),
    computeDayName(d.startDate) || '—',
    fmt(d.startDate),
    d.startTime || '—',
    'through',
    dayLabel(d.dayPattern),
    computeDayName(d.endDate) || '—',
    fmt(d.endDate),
    d.endTime || '—',
    '',
    '[Map attached]',
    '[Noise Variance(s) attached if applicable]',
  ].join('\n');
}

function buildSubject(d: Draft, plan: Plan): string {
  const phaseLabel = d.phaseNumbers.length > 0 ? `Phase ${d.phaseNumbers.join(',')}` : '';
  const activity = d.activity === 'other' ? d.activityOther : ACTIVITY_LABELS[d.activity];
  return `TANSAT Request — Plan ${plan.loc || plan.id}${activity ? ` — ${activity}` : ''}${phaseLabel ? ` — ${phaseLabel}` : ''}`;
}

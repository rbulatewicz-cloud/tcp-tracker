import React, { useState, useEffect } from 'react';
import {
  PlanCompliance, NoiseVariance, DrivewayAddress, DrivewayNoticeStatus, DrivewayLetter,
  UserRole,
} from '../../types';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import {
  detectComplianceTriggers, initializeComplianceTracks,
  pheProgress, cdProgress, overallComplianceProgress,
  DRIVEWAY_STATUS_LABELS,
} from '../../utils/compliance';
import { generatePHEPacket } from '../../services/phePacketService';
import { subscribeToVariances } from '../../services/varianceService';
import { subscribeToDrivewayLetters } from '../../services/drivewayLetterService';
import { useApp } from '../../hooks/useApp';
import { VarianceLetterModal } from '../VarianceLetterModal';
import { DrivewayNoticeModal } from '../DrivewayNoticeModal';
import { SectionHeader } from './compliance/complianceShared';
import { PHEPanel } from './compliance/PHEPanel';
import { NVPanel } from './compliance/NVPanel';
import { CDPanel } from './compliance/CDPanel';
import { DrivewayNoticesPanel } from './compliance/DrivewayNoticesPanel';

const DRIVEWAY_STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-500',
  in_progress: 'bg-blue-100 text-blue-700',
  sent:        'bg-amber-100 text-amber-700',
  completed:   'bg-emerald-100 text-emerald-700',
  na:          'bg-slate-50 text-slate-400',
};

// ── Main ComplianceSection ────────────────────────────────────────────────────
export const ComplianceSection: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updatePlanField } = usePlanActions();
  const { canEditFields, currentUser } = usePlanPermissions();
  const { firestoreData } = useApp();
  const appConfig = firestoreData.appConfig;
  const [libraryVariances, setLibraryVariances] = useState<NoiseVariance[]>([]);
  const [libraryLetters, setLibraryLetters] = useState<DrivewayLetter[]>([]);
  useEffect(() => subscribeToVariances(setLibraryVariances), []);
  useEffect(() => subscribeToDrivewayLetters(setLibraryLetters), []);

  const canLink = currentUser?.role === UserRole.MOT
    || currentUser?.role === UserRole.CR
    || currentUser?.role === UserRole.ADMIN;

  const [expandedTrack, setExpandedTrack] = useState<string | null>(null);
  const [localCompliance, setLocalCompliance] = useState<PlanCompliance | null>(null);
  const [dirty, setDirty] = useState(false);
  const [generatingPacket, setGeneratingPacket] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [letterModalOpen, setLetterModalOpen] = useState(false);
  const [draftNoticeAddress, setDraftNoticeAddress] = useState<DrivewayAddress | null>(null);

  const triggers = detectComplianceTriggers(selectedPlan);
  const hasAnyTrigger = triggers.phe || triggers.noiseVariance || triggers.cdConcurrence || triggers.drivewayNotices;

  // Derive compliance — use local draft if editing, else plan data
  const compliance: PlanCompliance = localCompliance
    ?? initializeComplianceTracks(triggers, selectedPlan.compliance);

  const overall = overallComplianceProgress(compliance);

  const updateCompliance = (patch: Partial<PlanCompliance>) => {
    const next = { ...compliance, ...patch };
    setLocalCompliance(next);
    setDirty(true);
  };

  const saveCompliance = () => {
    updatePlanField(selectedPlan.id, 'compliance', compliance);
    setDirty(false);
  };

  const removeTrack = (track: 'phe' | 'noiseVariance' | 'cdConcurrence' | 'drivewayNotices') => {
    const updated = { ...compliance, [track]: undefined };
    setLocalCompliance(updated);
    updatePlanField(selectedPlan.id, 'compliance', updated);
    setDirty(false);
    setRemoveConfirm(null);
    if (expandedTrack === track) setExpandedTrack(null);
  };

  const toggle = (key: string) =>
    setExpandedTrack(prev => (prev === key ? null : key));

  if (!hasAnyTrigger) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center">
        <p className="text-[11px] text-slate-400">No compliance tracks triggered for this plan.</p>
        <p className="text-[10px] text-slate-300 mt-0.5">Tracks auto-generate when PHE, night work, or closure conditions are met.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {/* Overall progress bar */}
      {overall.total > 0 && (
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overall.pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${overall.pct}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-slate-500 flex-shrink-0">
            {overall.pct}% complete
          </span>
        </div>
      )}

      {/* PHE Track */}
      {compliance.phe && (
        <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
          <SectionHeader
            icon="🏛️" title="Peak Hour Exemption (BOE)"
            status={compliance.phe.status}
            progress={pheProgress(compliance.phe)}
            canEdit={canEditFields}
            onEditStatus={s => updateCompliance({ phe: { ...compliance.phe!, status: s } })}
            expanded={expandedTrack === 'phe'}
            onToggle={() => toggle('phe')}
          />
          {expandedTrack === 'phe' && (
            <div className="border-t border-amber-100">
              <PHEPanel
                phe={compliance.phe}
                canEdit={canEditFields}
                onChange={p => updateCompliance({ phe: p })}
                planId={selectedPlan.id}
                approvedTCPs={selectedPlan.approvedTCPs ?? []}
                cdConcurrence={compliance.cdConcurrence}
              />
              {canEditFields && (
                <div className="px-3 pb-3">
                  <button
                    onClick={async () => {
                      setGeneratingPacket(true);
                      try { await generatePHEPacket(selectedPlan); }
                      finally { setGeneratingPacket(false); }
                    }}
                    disabled={generatingPacket}
                    className="w-full py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-bold hover:bg-amber-100 transition-colors disabled:opacity-50"
                  >
                    {generatingPacket ? '⏳ Assembling packet…' : '📄 Generate PHE Application Packet'}
                  </button>
                </div>
              )}
            </div>
          )}
          {canEditFields && (
            <div className="border-t border-amber-100 px-3 py-1.5 flex justify-end">
              {removeConfirm === 'phe' ? (
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="text-red-600 font-semibold">Remove PHE track?</span>
                  <button onClick={() => removeTrack('phe')} className="text-red-600 font-bold hover:underline">Yes, remove</button>
                  <button onClick={() => setRemoveConfirm(null)} className="text-slate-400 hover:underline">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setRemoveConfirm('phe')} className="text-[10px] text-slate-300 hover:text-red-400 transition-colors">✕ Remove track</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Noise Variance Track */}
      {compliance.noiseVariance && (
        <div className="rounded-xl border border-violet-200 bg-white overflow-hidden">
          <SectionHeader
            icon="🔊" title="Noise Variance (Police Commission)"
            status={compliance.noiseVariance.status}
            canEdit={canEditFields}
            onEditStatus={s => updateCompliance({ noiseVariance: { ...compliance.noiseVariance!, status: s } })}
            expanded={expandedTrack === 'nv'}
            onToggle={() => toggle('nv')}
          />
          {expandedTrack === 'nv' && (
            <div className="border-t border-violet-100">
              <NVPanel
                nv={compliance.noiseVariance}
                canEdit={canEditFields}
                onChange={n => updateCompliance({ noiseVariance: n })}
                variances={libraryVariances}
                planSegment={selectedPlan.segment}
                onDraftLetter={() => setLetterModalOpen(true)}
              />
            </div>
          )}
          {canEditFields && (
            <div className="border-t border-violet-100 px-3 py-1.5 flex justify-end">
              {removeConfirm === 'nv' ? (
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="text-red-600 font-semibold">Remove NV track?</span>
                  <button onClick={() => removeTrack('noiseVariance')} className="text-red-600 font-bold hover:underline">Yes, remove</button>
                  <button onClick={() => setRemoveConfirm(null)} className="text-slate-400 hover:underline">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setRemoveConfirm('nv')} className="text-[10px] text-slate-300 hover:text-red-400 transition-colors">✕ Remove track</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* CD Concurrence Track */}
      {compliance.cdConcurrence && (
        <div className="rounded-xl border border-blue-200 bg-white overflow-hidden">
          <SectionHeader
            icon="🏙️" title="CD Concurrence (CD2 · CD6 · CD7)"
            status={compliance.cdConcurrence.status}
            progress={cdProgress(compliance.cdConcurrence.cds)}
            canEdit={canEditFields}
            onEditStatus={s => updateCompliance({ cdConcurrence: { ...compliance.cdConcurrence!, status: s } })}
            expanded={expandedTrack === 'cd'}
            onToggle={() => toggle('cd')}
          />
          {expandedTrack === 'cd' && (
            <div className="border-t border-blue-100">
              <CDPanel
                cd={compliance.cdConcurrence}
                canEdit={canEditFields}
                onChange={c => updateCompliance({ cdConcurrence: c })}
              />
            </div>
          )}
          {canEditFields && (
            <div className="border-t border-blue-100 px-3 py-1.5 flex justify-end">
              {removeConfirm === 'cd' ? (
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="text-red-600 font-semibold">Remove CD track?</span>
                  <button onClick={() => removeTrack('cdConcurrence')} className="text-red-600 font-bold hover:underline">Yes, remove</button>
                  <button onClick={() => setRemoveConfirm(null)} className="text-slate-400 hover:underline">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setRemoveConfirm('cd')} className="text-[10px] text-slate-300 hover:text-red-400 transition-colors">✕ Remove track</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Driveway Notices Track */}
      {compliance.drivewayNotices && (
        <div className="rounded-xl border border-green-200 bg-white overflow-hidden">
          {/* Custom header for driveway (has extra status values) */}
          <div
            className="flex items-center gap-3 cursor-pointer select-none py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors"
            onClick={() => toggle('driveway')}
          >
            <span className="text-base">🏠</span>
            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-bold text-slate-800">Driveway Impact Notices</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${DRIVEWAY_STATUS_COLORS[compliance.drivewayNotices.status] ?? 'bg-slate-100 text-slate-500'}`}>
                {DRIVEWAY_STATUS_LABELS[compliance.drivewayNotices.status] ?? compliance.drivewayNotices.status}
              </span>
            </div>
            {canEditFields && (
              <select
                value={compliance.drivewayNotices.status}
                onChange={e => { e.stopPropagation(); updateCompliance({ drivewayNotices: { ...compliance.drivewayNotices!, status: e.target.value as DrivewayNoticeStatus } }); }}
                onClick={e => e.stopPropagation()}
                className="text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-green-400"
              >
                {Object.entries(DRIVEWAY_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            )}
            <span className={`text-slate-400 text-xs transition-transform ${expandedTrack === 'driveway' ? 'rotate-180' : ''}`}>▾</span>
          </div>
          {expandedTrack === 'driveway' && (
            <div className="border-t border-green-100">
              <DrivewayNoticesPanel
                dn={compliance.drivewayNotices}
                canEdit={canEditFields}
                canLink={canLink}
                onChange={d => updateCompliance({ drivewayNotices: d })}
                plan={selectedPlan}
                appConfig={appConfig}
                onDraftNotice={addr => setDraftNoticeAddress(addr)}
                libraryLetters={libraryLetters}
              />
            </div>
          )}
          {canEditFields && (
            <div className="border-t border-green-100 px-3 py-1.5 flex justify-end">
              {removeConfirm === 'driveway' ? (
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="text-red-600 font-semibold">Remove driveway notices track?</span>
                  <button onClick={() => removeTrack('drivewayNotices')} className="text-red-600 font-bold hover:underline">Yes, remove</button>
                  <button onClick={() => setRemoveConfirm(null)} className="text-slate-400 hover:underline">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setRemoveConfirm('driveway')} className="text-[10px] text-slate-300 hover:text-red-400 transition-colors">✕ Remove track</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      {dirty && canEditFields && (
        <div className="flex justify-end pt-1">
          <button
            onClick={saveCompliance}
            className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-[12px] font-bold hover:bg-slate-700 transition-colors"
          >
            Save Compliance
          </button>
        </div>
      )}

      {/* Variance Letter Modal */}
      {letterModalOpen && compliance.noiseVariance && (
        <VarianceLetterModal
          plan={selectedPlan}
          appConfig={appConfig}
          linkedVariance={
            compliance.noiseVariance.linkedVarianceId
              ? libraryVariances.find(v => v.id === compliance.noiseVariance!.linkedVarianceId || (v.parentVarianceId ?? v.id) === compliance.noiseVariance!.linkedVarianceId) ?? null
              : null
          }
          onClose={() => setLetterModalOpen(false)}
        />
      )}

      {/* Driveway Notice Modal */}
      {draftNoticeAddress && (
        <DrivewayNoticeModal
          plan={selectedPlan}
          appConfig={appConfig}
          address={draftNoticeAddress}
          existingLetter={
            draftNoticeAddress.letterId
              ? libraryLetters.find(l => l.id === draftNoticeAddress.letterId) ?? null
              : null
          }
          libraryLetters={libraryLetters}
          currentUser={currentUser}
          onClose={() => setDraftNoticeAddress(null)}
          onLetterSaved={(letterId) => {
            if (compliance.drivewayNotices) {
              const letter = libraryLetters.find(l => l.id === letterId);
              const updated = {
                ...compliance.drivewayNotices,
                addresses: compliance.drivewayNotices.addresses.map(a =>
                  a.id === draftNoticeAddress.id
                    ? { ...a, letterId, letterStatus: letter?.status ?? 'draft' }
                    : a
                ),
              };
              updateCompliance({ drivewayNotices: updated });
            }
          }}
          onMarkSent={(id) => {
            if (compliance.drivewayNotices) {
              const updated = {
                ...compliance.drivewayNotices,
                addresses: compliance.drivewayNotices.addresses.map(a =>
                  a.id === id ? { ...a, noticeSent: true, sentDate: new Date().toISOString().slice(0, 10) } : a
                ),
              };
              updateCompliance({ drivewayNotices: updated });
            }
          }}
        />
      )}
    </div>
  );
});

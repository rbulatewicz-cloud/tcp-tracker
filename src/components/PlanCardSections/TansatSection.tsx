import React, { useEffect, useState } from 'react';
import type { PlanTansatPhase, TansatRequest } from '../../types';
import { usePlanData, usePlanPermissions, usePlanActions } from '../PlanCardContext';
import { subscribeToTansatRequestsForPlan } from '../../services/tansatService';
import { getTotalPaid } from '../../utils/tansatSpend';
import { fmtDate } from '../../utils/plans';
import { TansatStatusPill, ACTIVITY_LABELS, fmtMoney, PhaseChips } from './tansat/tansatShared';
import { TansatPhasePlanner } from '../NewRequestModal/TansatPhasePlanner';
import { PacketBuilderModal } from '../Tansat/PacketBuilderModal';
import { InvoiceIntakeModal } from '../Tansat/InvoiceIntakeModal';
import { MarkPaidModal } from '../Tansat/MarkPaidModal';
import { ExtensionRequestModal } from '../Tansat/ExtensionRequestModal';
import { useApp } from '../../hooks/useApp';
import { createRenewal } from '../../services/tansatService';
import { showToast } from '../../lib/toast';

/**
 * Plan card → TANSAT track. Mirrors the visual language of the compliance
 * tracks (PHE/NV/CD) but lives outside ComplianceSection because TANSAT is
 * conceptually distinct (LADOT parking-removal posting, not a compliance
 * review).
 *
 * Renders only when `impact_transit` is true OR there are existing requests.
 * Surfaces:
 *   - Summary header (request count + total paid)
 *   - Phase coverage list (which phases need a packet vs are covered)
 *   - Request log (one row per TansatRequest)
 *   - "+ New TANSAT Request" — opens packet builder (T-2.2)
 *   - "Edit phases" — inline phase editor reusing TansatPhasePlanner
 */
export const TansatSection: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { canEditFields, currentUser } = usePlanPermissions();
  const { updatePlanField } = usePlanActions();
  const { firestoreData } = useApp();

  const [requests, setRequests] = useState<TansatRequest[]>([]);
  const [phaseEditorOpen, setPhaseEditorOpen] = useState(false);
  const [packetBuilderOpen, setPacketBuilderOpen] = useState(false);
  const [invoiceIntakeFor, setInvoiceIntakeFor] = useState<TansatRequest | null>(null);
  const [markPaidFor, setMarkPaidFor] = useState<TansatRequest | null>(null);
  const [extensionFor, setExtensionFor] = useState<TansatRequest | null>(null);
  const [renewing, setRenewing] = useState<string | null>(null);

  // Subscribe to all TANSAT requests for this plan
  useEffect(() => {
    if (!selectedPlan?.id) return;
    const unsub = subscribeToTansatRequestsForPlan(selectedPlan.id, setRequests);
    return () => unsub();
  }, [selectedPlan?.id]);

  // Determine whether to render the section at all
  const isFlagged = !!selectedPlan?.impact_transit;
  const hasRequests = requests.length > 0;
  if (!isFlagged && !hasRequests) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center">
        <p className="text-[11px] text-slate-400">
          TANSAT not flagged for this plan. Check "TANSAT Needed" in Impacts to enable.
        </p>
      </div>
    );
  }

  // Compute rollups
  const phases = selectedPlan.tansatPhases ?? [];
  const totalPaid = getTotalPaid(requests);
  const phaseStatuses = computePhaseStatuses(phases, requests);
  const noPhasesYet = phases.length === 0;

  return (
    <div className="mt-4 space-y-3">
      {/* Header summary */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-base">🅿️</span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">TANSAT</span>
          <span className="text-xs text-slate-500">
            · {requests.length} request{requests.length === 1 ? '' : 's'}
            {totalPaid > 0 && (
              <> · <b className="text-emerald-700">{fmtMoney(totalPaid)} paid</b></>
            )}
          </span>
        </div>
        {canEditFields && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPhaseEditorOpen(o => !o)}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 hover:underline"
            >
              {phaseEditorOpen ? 'Done editing phases' : 'Edit phases'}
            </button>
            <button
              type="button"
              onClick={() => setPacketBuilderOpen(true)}
              disabled={noPhasesYet}
              className="text-[11px] font-bold bg-slate-900 text-white px-3 py-1 rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={noPhasesYet ? 'Define at least one phase before creating a TANSAT request' : ''}
            >
              + New TANSAT Request
            </button>
          </div>
        )}
      </div>

      {/* Empty-phases banner */}
      {isFlagged && noPhasesYet && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          ⚠ No phases defined yet. Click <b>Edit phases</b> to plan the work — MOT can't create
          TANSAT requests until at least one phase exists.
        </div>
      )}

      {/* Inline phase editor — uses updatePlanField so the local plan card
          state refreshes immediately. Writing to Firestore directly bypasses
          the React state update, which is why edits felt "stuck" until the
          card was reopened. */}
      {phaseEditorOpen && canEditFields && (
        <TansatPhasePlanner
          phases={phases}
          onChange={next => {
            updatePlanField(selectedPlan.id, 'tansatPhases', next, false);
          }}
        />
      )}

      {/* Phase coverage summary */}
      {phases.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phases</div>
          {phases.map(phase => {
            const ps = phaseStatuses.get(phase.phaseNumber);
            return (
              <PhaseRow key={phase.phaseNumber} phase={phase} statusPill={ps} />
            );
          })}
        </div>
      )}

      {/* Request log */}
      {requests.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Requests ({requests.length})
          </div>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-[9px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-2 py-1.5 font-bold">Log #</th>
                  <th className="text-left px-2 py-1.5 font-bold">Activity</th>
                  <th className="text-left px-2 py-1.5 font-bold">Phases</th>
                  <th className="text-left px-2 py-1.5 font-bold">Schedule</th>
                  <th className="text-right px-2 py-1.5 font-bold">Amount</th>
                  <th className="text-right px-2 py-1.5 font-bold">Status</th>
                  {canEditFields && <th className="text-right px-2 py-1.5 font-bold">Action</th>}
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <React.Fragment key={r.id}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-1.5 font-mono font-bold text-slate-700">
                      {r.logNumber || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.activity === 'other' && r.activityOther
                        ? r.activityOther
                        : ACTIVITY_LABELS[r.activity] ?? r.activity}
                    </td>
                    <td className="px-2 py-1.5"><PhaseChips numbers={r.phaseNumbers ?? []} /></td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-slate-600 whitespace-nowrap">
                      {r.schedule?.startDate
                        ? `${fmtDate(r.schedule.startDate)} → ${fmtDate(r.schedule.endDate)}`
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold">
                      {r.paidAmount != null ? fmtMoney(r.paidAmount) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <TansatStatusPill status={r.status} />
                    </td>
                    {canEditFields && (
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        {r.status === 'emailed' && (
                          <button
                            onClick={() => setInvoiceIntakeFor(r)}
                            className="text-[10px] font-bold text-violet-700 hover:underline"
                          >
                            Log Invoice →
                          </button>
                        )}
                        {r.status === 'invoice_received' && (
                          <button
                            onClick={() => setMarkPaidFor(r)}
                            className="text-[10px] font-bold text-emerald-700 hover:underline"
                          >
                            Mark Paid →
                          </button>
                        )}
                        {(r.status === 'paid' || r.status === 'posted' || r.status === 'active') && (
                          <button
                            onClick={() => setExtensionFor(r)}
                            className="text-[10px] font-bold text-blue-700 hover:underline"
                            title="Free email reply to Reggie with new end date"
                          >
                            Request Extension →
                          </button>
                        )}
                        {r.status === 'expired' && (
                          <button
                            onClick={async () => {
                              setRenewing(r.id);
                              try {
                                const newId = await createRenewal(
                                  r.id,
                                  currentUser?.name ?? currentUser?.email ?? 'unknown',
                                );
                                showToast(`Renewal created — new draft request opens for editing (${newId.slice(-6)})`, 'success');
                              } catch (err) {
                                console.error('Renewal failed:', err);
                                showToast('Failed to create renewal', 'error');
                              } finally {
                                setRenewing(null);
                              }
                            }}
                            disabled={renewing === r.id}
                            className="text-[10px] font-bold text-orange-700 hover:underline disabled:opacity-50"
                            title="Log # has expired. Renewal creates a new TANSAT request — full workflow + new payment required."
                          >
                            {renewing === r.id ? 'Renewing…' : 'Renew →'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {/* Extension log — sub-rows shown when extensions exist */}
                  {(r.extensions?.length ?? 0) > 0 && (
                    <tr className="border-t border-slate-100 bg-blue-50/30">
                      <td colSpan={canEditFields ? 7 : 6} className="px-3 py-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1">
                          Extensions ({r.extensions!.length})
                        </div>
                        <div className="space-y-0.5">
                          {r.extensions!.map(ext => (
                            <div key={ext.id} className="text-[11px] text-slate-700 flex items-center gap-3">
                              <span className="font-mono text-blue-700">+ ext</span>
                              <span>new end <b>{fmtDate(ext.newEndDate)}</b></span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-500">filed {fmtDate(ext.requestedAt.slice(0, 10))}</span>
                              {ext.notes && <span className="text-slate-400 italic truncate">— {ext.notes}</span>}
                              <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                ext.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                                ext.status === 'sent'      ? 'bg-blue-100 text-blue-700' :
                                                             'bg-slate-100 text-slate-500'
                              }`}>
                                {ext.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Packet builder modal — T-2.2 */}
      {packetBuilderOpen && (
        <PacketBuilderModal
          plan={selectedPlan}
          appConfig={firestoreData?.appConfig}
          currentUserName={currentUser?.name ?? currentUser?.email ?? 'unknown'}
          onClose={() => setPacketBuilderOpen(false)}
        />
      )}

      {/* Invoice intake modal — T-3.1 */}
      {invoiceIntakeFor && (
        <InvoiceIntakeModal
          request={invoiceIntakeFor}
          plan={selectedPlan}
          appConfig={firestoreData?.appConfig}
          currentUserName={currentUser?.name ?? currentUser?.email ?? 'unknown'}
          onClose={() => setInvoiceIntakeFor(null)}
        />
      )}

      {/* Mark Paid modal — T-3.3 */}
      {markPaidFor && (
        <MarkPaidModal
          request={markPaidFor}
          plan={selectedPlan}
          currentUserName={currentUser?.name ?? currentUser?.email ?? 'unknown'}
          onClose={() => setMarkPaidFor(null)}
        />
      )}

      {/* Extension request modal — T-4.1 */}
      {extensionFor && (
        <ExtensionRequestModal
          request={extensionFor}
          plan={selectedPlan}
          appConfig={firestoreData?.appConfig}
          onClose={() => setExtensionFor(null)}
        />
      )}
    </div>
  );
});

// ── PhaseRow — one row per defined phase showing coverage status ────────────
interface PhaseRowProps {
  phase: PlanTansatPhase;
  statusPill: PhaseStatus | undefined;
}

const PhaseRow: React.FC<PhaseRowProps> = ({ phase, statusPill }) => {
  const dateRange = phase.anticipatedStart && phase.anticipatedEnd
    ? `${fmtDate(phase.anticipatedStart)} → ${fmtDate(phase.anticipatedEnd)}`
    : phase.anticipatedStart
      ? `from ${fmtDate(phase.anticipatedStart)}`
      : <span className="text-slate-400 italic">no dates yet</span>;

  return (
    <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
        {phase.phaseNumber}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-slate-700">
          {phase.label || `Phase ${phase.phaseNumber}`}
        </span>
        <span className="ml-2 text-[10px] text-slate-500 font-mono">{dateRange}</span>
      </div>
      <PhaseStatusPill status={statusPill} />
    </div>
  );
};

// ── Phase coverage status logic ─────────────────────────────────────────────
type PhaseStatus =
  | { kind: 'covered'; logNumber?: string }
  | { kind: 'in_progress' }
  | { kind: 'needs_packet' }
  | { kind: 'skip' };

function computePhaseStatuses(
  phases: PlanTansatPhase[],
  requests: TansatRequest[],
): Map<number, PhaseStatus> {
  const out = new Map<number, PhaseStatus>();
  for (const phase of phases) {
    if (!phase.needsTansat) {
      out.set(phase.phaseNumber, { kind: 'skip' });
      continue;
    }
    // Scan active requests covering this phase
    const covering = requests.filter(r =>
      (r.phaseNumbers ?? []).includes(phase.phaseNumber)
      && r.status !== 'cancelled' && r.status !== 'expired'
    );
    if (covering.some(r => r.status === 'paid' || r.status === 'posted' || r.status === 'active' || r.status === 'closed')) {
      const winner = covering.find(r => r.status === 'paid' || r.status === 'posted' || r.status === 'active' || r.status === 'closed');
      out.set(phase.phaseNumber, { kind: 'covered', logNumber: winner?.logNumber });
    } else if (covering.length > 0) {
      out.set(phase.phaseNumber, { kind: 'in_progress' });
    } else {
      out.set(phase.phaseNumber, { kind: 'needs_packet' });
    }
  }
  return out;
}

const PhaseStatusPill: React.FC<{ status?: PhaseStatus }> = ({ status }) => {
  if (!status) return null;
  switch (status.kind) {
    case 'covered':
      return (
        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 whitespace-nowrap">
          ✓ Covered{status.logNumber ? ` (LOG #${status.logNumber})` : ''}
        </span>
      );
    case 'in_progress':
      return (
        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 whitespace-nowrap">
          📨 In progress
        </span>
      );
    case 'needs_packet':
      return (
        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5 whitespace-nowrap">
          ⚠ Needs packet
        </span>
      );
    case 'skip':
      return (
        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 whitespace-nowrap">
          Skip
        </span>
      );
  }
};


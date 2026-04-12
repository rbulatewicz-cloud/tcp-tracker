import { useEffect, useRef, useState } from 'react';
import {
  Users, Plus, Download, CheckCircle, Clock, ChevronDown, ChevronUp,
  Trash2, Upload, FileText, AlertTriangle, X, Calendar, RefreshCw,
} from 'lucide-react';
import {
  subscribeToCDMeetings, createCDMeeting, updateCDMeeting,
  deleteCDMeeting, uploadCombinedDeck, uploadCDSlide, uploadConcurrenceLetter,
} from '../../services/cdMeetingService';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { CDMeeting, CDEntry, CDStatus, Plan, User } from '../../types';
import { CD_STATUS_LABELS } from '../../utils/compliance';
import { CD_STATUS_COLORS } from '../../components/PlanCardSections/compliance/complianceShared';

// ── Helpers ────────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CD_STATUS_OPTIONS: { value: CDStatus; label: string }[] = [
  { value: 'pending',            label: 'Pending' },
  { value: 'presentation_sent',  label: 'Presentation Sent' },
  { value: 'meeting_scheduled',  label: 'Meeting Scheduled' },
  { value: 'follow_up_sent',     label: 'Follow-Up Sent' },
  { value: 'concurred',          label: 'Concurred ✓' },
  { value: 'declined',           label: 'Declined ✗' },
  { value: 'na',                 label: 'N/A — Not in section' },
];

const MEETING_STATUS_LABELS: Record<CDMeeting['status'], string> = {
  draft:             'Draft',
  presented:         'Presented',
  awaiting_response: 'Awaiting Response',
  closed:            'Closed',
};
const MEETING_STATUS_COLORS: Record<CDMeeting['status'], string> = {
  draft:             'bg-slate-100 text-slate-600',
  presented:         'bg-blue-100 text-blue-700',
  awaiting_response: 'bg-amber-100 text-amber-700 border border-amber-200',
  closed:            'bg-emerald-100 text-emerald-700',
};

const CD_OPTIONS = ['CD2', 'CD6', 'CD7'] as const;

// ── Plan summary helpers ───────────────────────────────────────────────────────

interface PlanCDSummary {
  planId: string;
  loc: string;
  street1: string;
  street2?: string;
  slideUrl?: string;
  slideName?: string;
  slideUploadedAt?: string;
  cds: CDEntry[];
  pendingCDs: string[];
}

function buildPlanSummaries(plans: Plan[]): PlanCDSummary[] {
  return plans
    .filter(p => p.compliance?.cdConcurrence)
    .map(p => {
      const track = p.compliance!.cdConcurrence!;
      const pendingCDs = track.cds
        .filter(c => c.applicable && c.status !== 'concurred' && c.status !== 'na' && c.status !== 'declined')
        .map(c => c.cd);
      return {
        planId:          p.id,
        loc:             p.loc || p.id,
        street1:         p.street1 ?? '',
        street2:         p.street2 ?? '',
        slideUrl:        track.presentationAttachment?.url,
        slideName:       track.presentationAttachment?.name,
        slideUploadedAt: track.presentationAttachment?.uploadedAt,
        cds:             track.cds,
        pendingCDs,
      };
    })
    .sort((a, b) => a.loc.localeCompare(b.loc));
}

// ── Plan Tracker (main hub) ────────────────────────────────────────────────────

type TrackerFilter = 'active' | 'all' | 'closed';

function PlanTrackerPanel({ plans, currentUser }: { plans: Plan[]; currentUser: User | null }) {
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [uploading, setUploading]           = useState<string | null>(null);
  const [saving, setSaving]                 = useState<string | null>(null);
  const [filter, setFilter]                 = useState<TrackerFilter>('active');
  const slideInputRefs  = useRef<Record<string, HTMLInputElement | null>>({});
  const letterInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const allSummaries = buildPlanSummaries(plans);
  const activeCount  = allSummaries.filter(s => s.pendingCDs.length > 0 || !s.slideUrl).length;
  const closedCount  = allSummaries.filter(s => s.pendingCDs.length === 0 && !!s.slideUrl).length;

  const filtered = filter === 'all'    ? allSummaries :
                   filter === 'active' ? allSummaries.filter(s => s.pendingCDs.length > 0 || !s.slideUrl) :
                                         allSummaries.filter(s => s.pendingCDs.length === 0 && !!s.slideUrl);

  // ── Firestore helpers ──────────────────────────────────────────────────────

  const writeCDs = async (planId: string, cds: CDEntry[]) => {
    setSaving(planId);
    try {
      await updateDoc(doc(db, 'plans', planId), {
        'compliance.cdConcurrence.cds': cds,
      });
    } finally {
      setSaving(null);
    }
  };

  const updateCDField = async (planId: string, cdName: string, patch: Partial<CDEntry>) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan?.compliance?.cdConcurrence) return;
    const updated = plan.compliance.cdConcurrence.cds.map(c =>
      c.cd === cdName ? { ...c, ...patch } : c
    );
    await writeCDs(planId, updated);
  };

  const handleSlideUpload = async (planId: string, file: File) => {
    setUploading(`slide-${planId}`);
    try {
      const att = await uploadCDSlide(planId, file, currentUser?.email ?? 'unknown');
      await updateDoc(doc(db, 'plans', planId), {
        'compliance.cdConcurrence.presentationAttachment': att,
      });
    } finally {
      setUploading(null);
    }
  };

  const handleLetterUpload = async (planId: string, cdName: string, file: File) => {
    const key = `letter-${planId}-${cdName}`;
    setUploading(key);
    try {
      const att = await uploadConcurrenceLetter(planId, cdName, file, currentUser?.email ?? 'unknown');
      const plan = plans.find(p => p.id === planId);
      if (!plan?.compliance?.cdConcurrence) return;
      const updated = plan.compliance.cdConcurrence.cds.map(c =>
        c.cd === cdName ? { ...c, concurrenceLetter: att, status: 'concurred' as const } : c
      );
      await writeCDs(planId, updated);
    } finally {
      setUploading(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (allSummaries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
        <CheckCircle size={24} className="mx-auto text-emerald-400 mb-2" />
        <p className="text-[13px] text-slate-500">No plans have CD concurrence triggered.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([
          { key: 'active', label: 'Needs Action', count: activeCount },
          { key: 'all',    label: 'All',           count: allSummaries.length },
          { key: 'closed', label: 'Complete',      count: closedCount },
        ] as { key: TrackerFilter; label: string; count: number }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
              filter === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              filter === tab.key ? 'bg-slate-100 text-slate-600' : 'bg-white text-slate-400'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center">
          <p className="text-[13px] text-slate-400">No plans in this category.</p>
        </div>
      )}

      {filtered.map(s => {
        const isExpanded = expandedPlanId === s.planId;
        const noSlide = !s.slideUrl;
        const maxWait = s.cds
          .filter(c => ['presentation_sent', 'meeting_scheduled', 'follow_up_sent'].includes(c.status))
          .map(c => daysSince(c.sentDate ?? c.meetingDate) ?? 0)
          .reduce((a, b) => Math.max(a, b), -1);
        const overdue = maxWait >= 21;
        const warn    = maxWait >= 10 && !overdue;

        return (
          <div
            key={s.planId}
            className={`rounded-xl border bg-white overflow-hidden ${
              noSlide   ? 'border-amber-200' :
              overdue   ? 'border-red-200'   :
              warn      ? 'border-amber-100' :
                          'border-slate-200'
            }`}
          >
            {/* ── Plan header row ─────────────────────────────────────────── */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
              onClick={() => setExpandedPlanId(prev => prev === s.planId ? null : s.planId)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[13px] text-slate-800">{s.loc}</span>
                  <span className="text-[11px] text-slate-500 truncate">
                    {s.street1}{s.street2 ? ` / ${s.street2}` : ''}
                  </span>
                  {maxWait >= 10 && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      <Clock size={9} />
                      {maxWait}d waiting
                    </span>
                  )}
                  {saving === s.planId && (
                    <span className="text-[10px] text-slate-400">Saving…</span>
                  )}
                </div>

                {/* Per-CD status pills */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {s.cds.filter(c => c.applicable && c.status !== 'na').map(c => {
                    const waitDays = ['presentation_sent', 'meeting_scheduled', 'follow_up_sent'].includes(c.status)
                      ? daysSince(c.sentDate ?? c.meetingDate) : null;
                    return (
                      <span
                        key={c.cd}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${CD_STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-500'}`}
                      >
                        {c.cd}: {CD_STATUS_LABELS[c.status]}
                        {waitDays !== null && <span className="opacity-70">· {waitDays}d</span>}
                        {c.concurrenceLetter && <CheckCircle size={9} />}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Slide quick-access */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {s.slideUrl ? (
                  <a
                    href={s.slideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-[11px] text-blue-700 font-semibold hover:underline"
                  >
                    <FileText size={12} />
                    Slide
                  </a>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); slideInputRefs.current[s.planId]?.click(); }}
                    disabled={!!uploading}
                    className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold hover:text-blue-700"
                  >
                    {uploading === `slide-${s.planId}` ? 'Uploading…' : <><Upload size={11} /> Upload slide</>}
                  </button>
                )}
                <input
                  ref={el => { slideInputRefs.current[s.planId] = el; }}
                  type="file"
                  accept=".ppt,.pptx,.pdf"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleSlideUpload(s.planId, f);
                    e.target.value = '';
                  }}
                />
                {isExpanded
                  ? <ChevronUp size={15} className="text-slate-400" />
                  : <ChevronDown size={15} className="text-slate-400" />
                }
              </div>
            </div>

            {/* ── Expanded: full CD management ────────────────────────────── */}
            {isExpanded && (
              <div className="border-t border-slate-100 px-4 py-4 space-y-4">

                {/* Slide section */}
                {s.slideUrl ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={s.slideUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-700 font-semibold hover:bg-blue-100 flex-1 min-w-0"
                    >
                      <FileText size={13} className="flex-shrink-0" />
                      <span className="truncate">{s.slideName ?? 'CD Presentation'}</span>
                      {s.slideUploadedAt && (
                        <span className="font-normal text-blue-500 ml-1 flex-shrink-0">
                          · uploaded {new Date(s.slideUploadedAt).toLocaleDateString()}
                        </span>
                      )}
                    </a>
                    <button
                      onClick={() => slideInputRefs.current[s.planId]?.click()}
                      className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] text-slate-500 hover:text-blue-600 hover:border-blue-300 flex-shrink-0"
                    >
                      <RefreshCw size={11} />
                      Replace
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-amber-200 bg-amber-50 px-3 py-3 flex items-center gap-2">
                    <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
                    <span className="text-[11px] text-amber-700 font-semibold flex-1">No CD presentation slide uploaded yet.</span>
                    <button
                      onClick={() => slideInputRefs.current[s.planId]?.click()}
                      disabled={!!uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-semibold hover:bg-amber-700 flex-shrink-0"
                    >
                      {uploading === `slide-${s.planId}` ? 'Uploading…' : <><Upload size={11} /> Upload Slide</>}
                    </button>
                  </div>
                )}

                {/* Per-CD management */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Council Districts</span>
                    <span className="text-[10px] text-slate-400">
                      {s.cds.filter(c => c.applicable && c.status === 'concurred').length} /
                      {s.cds.filter(c => c.applicable && c.status !== 'na').length} concurred
                    </span>
                  </div>

                  <div className="space-y-2">
                    {s.cds.map(entry => {
                      if (!entry.applicable) return null;

                      const waitDays = ['presentation_sent', 'meeting_scheduled', 'follow_up_sent'].includes(entry.status)
                        ? daysSince(entry.sentDate ?? entry.meetingDate) : null;

                      // Duration: days from sentDate to concurrence letter upload
                      let concurredInDays: number | null = null;
                      if (entry.status === 'concurred' && entry.sentDate && entry.concurrenceLetter?.uploadedAt) {
                        const diff = Math.floor(
                          (new Date(entry.concurrenceLetter.uploadedAt).getTime() - new Date(entry.sentDate).getTime())
                          / (1000 * 60 * 60 * 24)
                        );
                        if (diff >= 0) concurredInDays = diff;
                      }

                      return (
                        <div
                          key={entry.cd}
                          className={`rounded-lg border px-3 py-3 space-y-2.5 ${
                            entry.status === 'na'             ? 'border-slate-100 bg-slate-50 opacity-60' :
                            entry.status === 'concurred'      ? 'border-emerald-200 bg-emerald-50' :
                            entry.status === 'declined'       ? 'border-red-200 bg-red-50' :
                            entry.status === 'follow_up_sent' ? 'border-amber-200 bg-amber-50' :
                                                                'border-slate-200 bg-white'
                          }`}
                        >
                          {/* Row 1: label, status, timing, actions */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-bold text-slate-800 w-10 flex-shrink-0">{entry.cd}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${CD_STATUS_COLORS[entry.status] ?? 'bg-slate-100 text-slate-500'}`}>
                              {CD_STATUS_LABELS[entry.status]}
                            </span>

                            {/* Aging badge */}
                            {waitDays !== null && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                waitDays >= 21 ? 'bg-red-100 text-red-700' :
                                waitDays >= 10 ? 'bg-amber-100 text-amber-700' :
                                                 'bg-sky-100 text-sky-700'
                              }`}>
                                <Clock size={9} />
                                {waitDays}d waiting
                              </span>
                            )}

                            {/* Duration if concurred */}
                            {concurredInDays !== null && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                                <CheckCircle size={9} />
                                {concurredInDays}d to concur
                              </span>
                            )}

                            {/* Status dropdown */}
                            {entry.status !== 'na' ? (
                              <select
                                value={entry.status}
                                onChange={e => updateCDField(s.planId, entry.cd, { status: e.target.value as CDStatus })}
                                className="ml-auto text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-blue-400"
                              >
                                {CD_STATUS_OPTIONS.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                onClick={() => updateCDField(s.planId, entry.cd, { applicable: true, status: 'pending' })}
                                className="ml-auto text-[10px] text-slate-400 hover:text-blue-600"
                              >
                                Mark applicable
                              </button>
                            )}
                          </div>

                          {/* Row 2: date fields */}
                          {entry.status !== 'na' && (
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-0.5">Sent</label>
                                <input
                                  type="date"
                                  value={entry.sentDate || ''}
                                  onChange={e => updateCDField(s.planId, entry.cd, { sentDate: e.target.value || undefined })}
                                  className="w-full text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-blue-400"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-0.5">Meeting</label>
                                <input
                                  type="date"
                                  value={entry.meetingDate || ''}
                                  onChange={e => updateCDField(s.planId, entry.cd, { meetingDate: e.target.value || undefined })}
                                  className="w-full text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-blue-400"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-0.5">Follow-Up</label>
                                <input
                                  type="date"
                                  value={entry.followUpDate || ''}
                                  onChange={e => updateCDField(s.planId, entry.cd, { followUpDate: e.target.value || undefined })}
                                  className="w-full text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-blue-400"
                                />
                              </div>
                            </div>
                          )}

                          {/* Row 3: concurrence letter */}
                          {entry.status !== 'na' && (
                            <div>
                              {entry.concurrenceLetter ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <a
                                    href={entry.concurrenceLetter.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold hover:underline"
                                  >
                                    <CheckCircle size={11} />
                                    Concurrence Letter
                                  </a>
                                  <span className="text-[10px] text-slate-400">
                                    · received {new Date(entry.concurrenceLetter.uploadedAt).toLocaleDateString()}
                                  </span>
                                  <button
                                    onClick={() => letterInputRefs.current[`${s.planId}-${entry.cd}`]?.click()}
                                    className="text-[10px] text-slate-400 hover:text-blue-600"
                                  >
                                    Replace
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => letterInputRefs.current[`${s.planId}-${entry.cd}`]?.click()}
                                  disabled={!!uploading}
                                  className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-emerald-700 transition-colors"
                                >
                                  {uploading === `letter-${s.planId}-${entry.cd}` ? (
                                    <span className="text-blue-600">Uploading…</span>
                                  ) : (
                                    <><Upload size={11} /> Upload Concurrence Letter</>
                                  )}
                                </button>
                              )}
                              <input
                                ref={el => { letterInputRefs.current[`${s.planId}-${entry.cd}`] = el; }}
                                type="file"
                                accept=".pdf,.doc,.docx"
                                className="hidden"
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  if (f) handleLetterUpload(s.planId, entry.cd, f);
                                  e.target.value = '';
                                }}
                              />
                            </div>
                          )}

                          {/* Decline notes */}
                          {entry.status === 'declined' && (
                            <input
                              value={entry.notes || ''}
                              onChange={e => updateCDField(s.planId, entry.cd, { notes: e.target.value })}
                              placeholder="Note reason for decline…"
                              className="w-full rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] outline-none focus:border-red-400"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── New Meeting Modal ──────────────────────────────────────────────────────────

interface NewMeetingFormProps {
  currentUser: User | null;
  plans: Plan[];
  onSave: () => void;
  onCancel: () => void;
}

function NewMeetingForm({ currentUser, plans, onSave, onCancel }: NewMeetingFormProps) {
  const [name, setName]                       = useState('');
  const [meetingDate, setMeetingDate]         = useState(TODAY);
  const [districts, setDistricts]             = useState<Set<'CD2' | 'CD6' | 'CD7'>>(new Set());
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
  const [saving, setSaving]                   = useState(false);

  const summaries = buildPlanSummaries(plans);

  const toggleDistrict = (cd: 'CD2' | 'CD6' | 'CD7') => {
    setDistricts(prev => {
      const next = new Set(prev);
      next.has(cd) ? next.delete(cd) : next.add(cd);
      return next;
    });
  };

  const togglePlan = (id: string) => {
    setSelectedPlanIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim() || !meetingDate || districts.size === 0) return;
    setSaving(true);
    try {
      await createCDMeeting({
        name: name.trim(),
        meetingDate,
        councilDistricts: Array.from(districts),
        planIds: Array.from(selectedPlanIds),
        status: 'draft',
      }, currentUser?.email ?? 'unknown');
      onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">New CD Meeting</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Meeting Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. CD 6 Biweekly – April 14, 2026"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Meeting Date</label>
            <input
              type="date"
              value={meetingDate}
              onChange={e => setMeetingDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Council Districts</label>
            <div className="flex gap-2">
              {CD_OPTIONS.map(cd => (
                <button
                  key={cd}
                  onClick={() => toggleDistrict(cd)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border transition-colors ${
                    districts.has(cd)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {cd}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Include Plans ({selectedPlanIds.size} selected)
            </label>
            <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {summaries.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-3">No plans with CD concurrence triggered</p>
              )}
              {summaries.map(s => (
                <label key={s.planId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPlanIds.has(s.planId)}
                    onChange={() => togglePlan(s.planId)}
                    className="rounded"
                  />
                  <span className="text-[12px] font-semibold text-slate-700">{s.loc}</span>
                  <span className="text-[11px] text-slate-400 truncate">{s.street1}</span>
                  {s.slideUrl ? (
                    <span className="ml-auto text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                      <FileText size={9} /> Slide ready
                    </span>
                  ) : (
                    <span className="ml-auto text-[10px] text-amber-500 font-semibold">No slide</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onCancel} className="px-4 py-2 text-[13px] text-slate-600 hover:text-slate-800">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !meetingDate || districts.size === 0}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating…' : 'Create Meeting'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Meeting Card ───────────────────────────────────────────────────────────────

interface MeetingCardProps {
  meeting: CDMeeting;
  plans: Plan[];
  currentUser: User | null;
  onDelete: () => void;
}

function MeetingCard({ meeting, plans, currentUser, onDelete }: MeetingCardProps) {
  const [expanded, setExpanded]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [uploadingDeck, setUploadingDeck] = useState(false);
  const [uploadingSlide, setUploadingSlide] = useState<string | null>(null);
  const deckInputRef    = useRef<HTMLInputElement>(null);
  const slideInputRefs  = useRef<Record<string, HTMLInputElement | null>>({});

  const includedPlans  = plans.filter(p => meeting.planIds.includes(p.id));
  const summaries      = buildPlanSummaries(includedPlans);
  const pendingCount   = summaries.filter(s => s.pendingCDs.length > 0).length;
  const daysSinceMeeting = meeting.status !== 'draft' ? daysSince(meeting.meetingDate) : null;

  const patch = async (updates: Partial<Omit<CDMeeting, 'id'>>) => {
    setSaving(true);
    try { await updateCDMeeting(meeting.id, updates); }
    finally { setSaving(false); }
  };

  const handleMarkPresented = async () => {
    setSaving(true);
    try {
      await updateCDMeeting(meeting.id, { status: 'awaiting_response' });
      for (const plan of includedPlans) {
        const track = plan.compliance?.cdConcurrence;
        if (!track) continue;
        const updatedCds = track.cds.map(entry => {
          if (!entry.applicable || entry.status === 'concurred' || entry.status === 'na') return entry;
          if (!meeting.councilDistricts.includes(entry.cd)) return entry;
          return {
            ...entry,
            status: 'presentation_sent' as const,
            sentDate:    meeting.meetingDate,
            meetingDate: meeting.meetingDate,
          };
        });
        await updateDoc(doc(db, 'plans', plan.id), {
          'compliance.cdConcurrence.cds': updatedCds,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeckUpload = async (file: File) => {
    setUploadingDeck(true);
    try {
      const { url, name } = await uploadCombinedDeck(meeting.id, file, currentUser?.email ?? 'unknown');
      await updateCDMeeting(meeting.id, { combinedDeckUrl: url, combinedDeckName: name });
    } finally {
      setUploadingDeck(false);
    }
  };

  const handleSlideUpload = async (planId: string, file: File) => {
    setUploadingSlide(planId);
    try {
      const att = await uploadCDSlide(planId, file, currentUser?.email ?? 'unknown');
      await updateDoc(doc(db, 'plans', planId), {
        'compliance.cdConcurrence.presentationAttachment': att,
      });
    } finally {
      setUploadingSlide(null);
    }
  };

  const handleDownloadAll = () => {
    summaries.forEach(s => {
      if (s.slideUrl) {
        const a = document.createElement('a');
        a.href = s.slideUrl;
        a.target = '_blank';
        a.download = s.slideName ?? `${s.loc}_cd_slide.pptx`;
        a.click();
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[13px] text-slate-800">{meeting.name}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${MEETING_STATUS_COLORS[meeting.status]}`}>
              {MEETING_STATUS_LABELS[meeting.status]}
            </span>
            {meeting.councilDistricts.map(cd => (
              <span key={cd} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">{cd}</span>
            ))}
            {meeting.status === 'awaiting_response' && daysSinceMeeting !== null && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                daysSinceMeeting >= 21 ? 'bg-red-100 text-red-700' :
                daysSinceMeeting >= 10 ? 'bg-amber-100 text-amber-700' :
                'bg-sky-100 text-sky-700'
              }`}>
                <Clock size={9} />
                {daysSinceMeeting}d waiting
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-slate-400">
              <Calendar size={10} className="inline mr-0.5" />
              {fmtDate(meeting.meetingDate)}
            </span>
            <span className="text-[11px] text-slate-400">{meeting.planIds.length} plans</span>
            {pendingCount > 0 && (
              <span className="text-[11px] text-amber-600 font-semibold">{pendingCount} pending response</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saving && <span className="text-[10px] text-slate-400">Saving…</span>}
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4">

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <select
              value={meeting.status}
              onChange={e => patch({ status: e.target.value as CDMeeting['status'] })}
              className="text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 outline-none focus:border-blue-400"
            >
              {(Object.keys(MEETING_STATUS_LABELS) as CDMeeting['status'][]).map(s => (
                <option key={s} value={s}>{MEETING_STATUS_LABELS[s]}</option>
              ))}
            </select>

            <input
              type="date"
              value={meeting.meetingDate}
              onChange={e => patch({ meetingDate: e.target.value })}
              title="Update meeting date"
              className="text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 outline-none focus:border-blue-400"
            />

            {meeting.status === 'draft' && (
              <button
                onClick={handleMarkPresented}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckCircle size={13} />
                Mark Presented
              </button>
            )}

            {summaries.some(s => s.slideUrl) && (
              <button
                onClick={handleDownloadAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[12px] font-semibold hover:bg-slate-50"
              >
                <Download size={13} />
                Download All Slides
              </button>
            )}

            <button
              onClick={() => deckInputRef.current?.click()}
              disabled={uploadingDeck}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[12px] font-semibold hover:bg-slate-50"
            >
              <Upload size={13} />
              {uploadingDeck ? 'Uploading…' : meeting.combinedDeckUrl ? 'Replace Combined Deck' : 'Upload Combined Deck'}
            </button>
            <input
              ref={deckInputRef}
              type="file"
              accept=".ppt,.pptx,.pdf"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleDeckUpload(f);
                e.target.value = '';
              }}
            />

            <button
              onClick={onDelete}
              className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-500 hover:bg-red-50 text-[12px]"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {meeting.combinedDeckUrl && (
            <a
              href={meeting.combinedDeckUrl}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[12px] text-indigo-700 font-semibold hover:bg-indigo-100"
            >
              <FileText size={13} />
              {meeting.combinedDeckName ?? 'Combined Presentation Deck'}
            </a>
          )}

          <textarea
            value={meeting.notes ?? ''}
            onChange={e => patch({ notes: e.target.value })}
            rows={2}
            placeholder="Meeting notes…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] outline-none focus:border-blue-400 resize-none"
          />

          {/* Plans in meeting */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Plans in this meeting</div>
            <div className="space-y-2">
              {summaries.length === 0 && (
                <p className="text-[12px] text-slate-400 italic">No plans added to this meeting.</p>
              )}
              {summaries.map(s => (
                <div key={s.planId} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[13px] text-slate-800">{s.loc}</span>
                        <span className="text-[11px] text-slate-500 truncate">
                          {s.street1}{s.street2 ? ` / ${s.street2}` : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {s.cds.filter(c => c.applicable && c.status !== 'na').map(c => {
                          const waitDays = (['presentation_sent', 'meeting_scheduled', 'follow_up_sent'].includes(c.status))
                            ? daysSince(c.sentDate ?? c.meetingDate) : null;
                          return (
                            <span key={c.cd} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${CD_STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-500'}`}>
                              {c.cd}: {CD_STATUS_LABELS[c.status]}
                              {waitDays !== null && <span className="opacity-70">· {waitDays}d</span>}
                              {c.concurrenceLetter && <CheckCircle size={9} />}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {s.slideUrl ? (
                        <div className="flex items-center gap-2">
                          <a
                            href={s.slideUrl}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-blue-700 font-semibold hover:underline"
                          >
                            <FileText size={11} />
                            Slide
                          </a>
                          <button
                            onClick={() => slideInputRefs.current[s.planId]?.click()}
                            className="text-[10px] text-slate-400 hover:text-blue-600"
                          >
                            <RefreshCw size={10} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => slideInputRefs.current[s.planId]?.click()}
                          disabled={!!uploadingSlide}
                          className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold hover:text-blue-700"
                        >
                          {uploadingSlide === s.planId ? 'Uploading…' : <><Upload size={11} /> Upload slide</>}
                        </button>
                      )}
                      <input
                        ref={el => { slideInputRefs.current[s.planId] = el; }}
                        type="file"
                        accept=".ppt,.pptx,.pdf"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) handleSlideUpload(s.planId, f);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main section ───────────────────────────────────────────────────────────────

interface CDConcurrenceSectionProps {
  currentUser: User | null;
  plans: Plan[];
}

export function CDConcurrenceSection({ currentUser, plans }: CDConcurrenceSectionProps) {
  const [meetings, setMeetings]     = useState<CDMeeting[]>([]);
  const [subTab, setSubTab]         = useState<'tracker' | 'meetings'>('tracker');
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => subscribeToCDMeetings(setMeetings), []);

  const allSummaries  = buildPlanSummaries(plans);
  const activeCount   = allSummaries.filter(s => s.pendingCDs.length > 0 || !s.slideUrl).length;
  const openMeetings  = meetings.filter(m => m.status !== 'closed').length;

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setSubTab('tracker')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
            subTab === 'tracker' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertTriangle size={12} />
          Plan Tracker
          {activeCount > 0 && (
            <span className="ml-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              {activeCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab('meetings')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
            subTab === 'meetings' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={12} />
          Meetings
          {openMeetings > 0 && (
            <span className="ml-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {openMeetings}
            </span>
          )}
        </button>
      </div>

      {/* Tracker tab */}
      {subTab === 'tracker' && (
        <PlanTrackerPanel plans={plans} currentUser={currentUser} />
      )}

      {/* Meetings tab */}
      {subTab === 'meetings' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-[12px] text-slate-500">
              {meetings.length === 0
                ? 'No meetings yet. Create one to bundle plans for a biweekly CD presentation.'
                : `${meetings.length} meeting${meetings.length !== 1 ? 's' : ''}`}
            </p>
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700"
            >
              <Plus size={13} />
              New Meeting
            </button>
          </div>

          {meetings.map(m => (
            <MeetingCard
              key={m.id}
              meeting={m}
              plans={plans}
              currentUser={currentUser}
              onDelete={() => deleteCDMeeting(m.id)}
            />
          ))}
        </div>
      )}

      {showNewForm && (
        <NewMeetingForm
          currentUser={currentUser}
          plans={plans}
          onSave={() => setShowNewForm(false)}
          onCancel={() => setShowNewForm(false)}
        />
      )}
    </div>
  );
}

import { useEffect, useState, useRef } from 'react';
import {
  Mail, CheckCircle, Clock, Send, Download, ExternalLink,
  Trash2, ChevronDown, ChevronUp, Filter, Upload, Loader,
  AlertTriangle, MessageSquare, RefreshCw, Paperclip, X,
} from 'lucide-react';
import {
  subscribeToDrivewayLetters,
  approveDrivewayLetter,
  markDrivewayLetterSent,
  deleteDrivewayLetter,
  uploadFinalLetter,
  uploadAndScanDrivewayLetter,
  updateDrivewayLetter,
  submitLetterToMetro,
  metroApproveLetter,
  metroRequestRevision,
  resubmitLetterToMetro,
  revertDrivewayLetterStatus,
  addMetroComment,
  rescanDrivewayLetterFromUrl,
} from '../../services/drivewayLetterService';
import { createDrivewayProperty } from '../../services/drivewayPropertyService';
import { buildNoticeDocx, downloadNoticeDocx } from '../../services/drivewayNoticeService';
import { AppConfig, DrivewayLetter, DrivewayLetterStatus, DrivewayProperty, User, UserRole } from '../../types';
import { subscribeToDrivewayProperties } from '../../services/drivewayPropertyService';
import type { DrivewayNoticeFields } from '../../services/drivewayNoticeService';
import { fmtDate as fmt } from '../../utils/plans';
import { showToast } from '../../lib/toast';

interface DrivewayLettersSectionProps {
  currentUser: User | null;
  appConfig: AppConfig;
  allLetters?: DrivewayLetter[];
  planFilter?: { id: string; loc: string } | null;
  onClearPlanFilter?: () => void;
}

// ── Status display maps ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<DrivewayLetterStatus, string> = {
  not_drafted:              'Not Drafted',
  draft:                    'Draft',
  submitted_to_metro:       'With Metro',
  metro_revision_requested: 'Metro: Revise',
  approved:                 'Metro Approved',
  sent:                     'Sent',
};

const STATUS_COLORS: Record<DrivewayLetterStatus, string> = {
  not_drafted:              'bg-slate-100 text-slate-500',
  draft:                    'bg-amber-50 text-amber-700 border border-amber-200',
  submitted_to_metro:       'bg-indigo-50 text-indigo-700 border border-indigo-200',
  metro_revision_requested: 'bg-orange-50 text-orange-700 border border-orange-200',
  approved:                 'bg-blue-50 text-blue-700 border border-blue-200',
  sent:                     'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

function StatusBadge({ status }: { status: DrivewayLetterStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[status]}`}>
      {status === 'sent'                     && <Send size={9} />}
      {status === 'approved'                 && <CheckCircle size={9} />}
      {status === 'draft'                    && <Clock size={9} />}
      {status === 'not_drafted'              && <Mail size={9} />}
      {status === 'submitted_to_metro'       && <RefreshCw size={9} />}
      {status === 'metro_revision_requested' && <AlertTriangle size={9} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Metro review timer ─────────────────────────────────────────────────────────

function daysElapsed(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function MetroTimerBadge({
  submittedAt, slaDays, warnDays,
}: { submittedAt: string; slaDays: number; warnDays: number }) {
  const days = daysElapsed(submittedAt);
  const cls = days >= slaDays
    ? 'text-red-700 bg-red-50 border-red-200'
    : days >= warnDays
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-emerald-700 bg-emerald-50 border-emerald-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      <Clock size={9} />
      Metro: {days}d
      {days >= slaDays && ' ⚠'}
    </span>
  );
}

// ── Scan status cards ──────────────────────────────────────────────────────────

function ScanningCard({ letter, onDelete }: { letter: DrivewayLetter; onDelete: () => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-3">
      <Loader size={16} className="text-blue-500 animate-spin flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-700 truncate">{letter.address}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">Rafi is reading your doc…</div>
      </div>
      <button onClick={onDelete} className="p-1.5 text-slate-300 hover:text-red-400 transition-colors rounded">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function ErrorCard({ letter, onDelete }: { letter: DrivewayLetter; onDelete: () => void }) {
  return (
    <div className="bg-white border border-red-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-700 truncate">{letter.address}</div>
          <div className="text-[11px] text-red-600 mt-0.5 leading-relaxed">{letter.scanError || 'Scan failed'}</div>
        </div>
        <button onClick={onDelete} className="p-1.5 text-slate-300 hover:text-red-400 transition-colors rounded">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Scanned review form ───────────────────────────────────────────────────────

function normalizeAddr(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function ScannedReviewCard({
  letter, onConfirm, onDelete, properties, currentUserEmail,
}: {
  letter: DrivewayLetter;
  onConfirm: (fields: DrivewayNoticeFields, address: string, segment: string, saveToLibrary: boolean, existingPropertyId?: string) => Promise<void>;
  onDelete: () => void;
  properties: DrivewayProperty[];
  currentUserEmail: string;
}) {
  const [fields, setFields] = useState<DrivewayNoticeFields>({ ...letter.fields });
  const [segment, setSegment] = useState(letter.segment);
  const [saving, setSaving] = useState(false);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const set = (k: keyof DrivewayNoticeFields, v: string | boolean) =>
    setFields(f => ({ ...f, [k]: v }));

  const inputCls = 'w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none focus:border-blue-400 focus:bg-white';

  // Check if driveway impact address already exists in property library
  const impactAddr = (fields.drivewayImpactAddress ?? fields.recipientAddress ?? '').trim();
  const existingProp = impactAddr
    ? properties.find(p => normalizeAddr(p.address) === normalizeAddr(impactAddr))
    : undefined;

  return (
    <div className="bg-white border-2 border-blue-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
        <CheckCircle size={14} className="text-blue-600 flex-shrink-0" />
        <span className="text-[11px] font-bold text-blue-800">Rafi extracted — review and confirm</span>
        <span className="ml-auto text-[10px] text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full font-semibold">Uploaded</span>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        {/* Impacted driveway address — this becomes the letter's primary identifier */}
        <div className="col-span-2">
          <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide block mb-1">
            ✦ Impacted Driveway Address
            <span className="ml-1 font-normal text-slate-400 normal-case">— the physical driveway being blocked</span>
          </label>
          <input
            value={fields.drivewayImpactAddress ?? fields.recipientAddress}
            onChange={e => set('drivewayImpactAddress', e.target.value)}
            placeholder="Address of the driveway being impacted"
            className="w-full rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] outline-none focus:border-emerald-500 focus:bg-white"
          />
        </div>

        {/* Property library status */}
        {impactAddr && (
          <div className="col-span-2">
            {existingProp ? (
              <div className="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
                <span className="text-base leading-none">🏠</span>
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-semibold text-indigo-800">{existingProp.address}</span>
                  {existingProp.ownerName && (
                    <span className="text-[10px] text-indigo-500 ml-1.5">· {existingProp.ownerName}</span>
                  )}
                </div>
                <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full flex-shrink-0">
                  ✓ In property library — will be linked
                </span>
              </div>
            ) : (
              <label className="flex items-start gap-2.5 cursor-pointer rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2.5 hover:bg-indigo-100 transition-colors">
                <input
                  type="checkbox"
                  checked={saveToLibrary}
                  onChange={e => setSaveToLibrary(e.target.checked)}
                  className="mt-0.5 accent-indigo-600 w-3.5 h-3.5 flex-shrink-0"
                />
                <div>
                  <span className="text-[11px] font-semibold text-indigo-700">
                    🏠 Add to property library
                  </span>
                  <p className="text-[10px] text-indigo-400 mt-0.5">
                    Creates a property record for this address and links it to the letter for future reference.
                  </p>
                </div>
              </label>
            )}
          </div>
        )}

        {/* Recipient mailing address — may differ (e.g. property mgmt company) */}
        <div className="col-span-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
            Recipient Mailing Address
            <span className="ml-1 font-normal text-slate-400 normal-case">— where the letter is sent</span>
          </label>
          <input value={fields.recipientAddress} onChange={e => set('recipientAddress', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Segment</label>
          <input value={segment} onChange={e => setSegment(e.target.value)} placeholder="e.g. C1" className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Letter Date</label>
          <input type="date" value={fields.letterDate} onChange={e => set('letterDate', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Recipient Name</label>
          <input value={fields.recipientName} onChange={e => set('recipientName', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Work Dates</label>
          <input value={fields.workDates} onChange={e => set('workDates', e.target.value)} className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Work Hours</label>
          <input value={fields.workHoursDescription} onChange={e => set('workHoursDescription', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Contractor</label>
          <input value={fields.businessName} onChange={e => set('businessName', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Contact Name</label>
          <input value={fields.contactName} onChange={e => set('contactName', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Phone</label>
          <input value={fields.contactPhone} onChange={e => set('contactPhone', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Email</label>
          <input value={fields.contactEmail} onChange={e => set('contactEmail', e.target.value)} className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Letter Body (EN)</label>
          <textarea
            value={fields.bodyParagraph}
            onChange={e => set('bodyParagraph', e.target.value)}
            rows={3}
            className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none focus:border-blue-400 resize-none"
          />
        </div>
        {fields.bodyParagraphEs && (
          <div className="col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Letter Body (ES)</label>
            <textarea
              value={fields.bodyParagraphEs}
              onChange={e => set('bodyParagraphEs', e.target.value)}
              rows={3}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none focus:border-blue-400 resize-none"
            />
          </div>
        )}
      </div>
      <div className="px-4 pb-4 flex items-center gap-2">
        <button
          onClick={async () => {
            setSaving(true);
            try {
              await onConfirm(
                fields,
                fields.drivewayImpactAddress || fields.recipientAddress || '',
                segment,
                saveToLibrary,
                existingProp?.id,
              );
            } finally { setSaving(false); }
          }}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : '✓ Confirm & Save'}
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-500 hover:text-red-500 hover:border-red-200 transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// ── Letter card (confirmed/complete) ─────────────────────────────────────────

interface LetterCardProps {
  letter: DrivewayLetter;
  canApprove: boolean;
  currentUserEmail: string;
  metroSLADays: number;
  metroWarnDays: number;
  parentLetter?: DrivewayLetter;  // Prior letter this is a re-notice of (for display only)
  onSubmitToMetro: (date: string) => void;
  onMetroApprove: (date: string) => void;
  onMetroRevision: (comment: string, files?: File[]) => void;
  onResubmit: (date: string) => void;
  onDirectApprove: () => void;
  onMarkSent: (date: string) => void;
  onRevert: (toStatus: DrivewayLetterStatus) => void;
  onEditSentDate: (dateStr: string) => void;
  onDelete: () => void;
  onDownload: () => void;
  onAddMetroComment: (text: string, files?: File[]) => void;
  onRescan?: () => void;
  properties: DrivewayProperty[];
  onLinkProperty: (propertyId: string) => void;
  onUnlinkProperty: () => void;
  downloading: boolean;
  deleteConfirmId: string | null;
  onDeleteClick: () => void;
}

// Reusable confirm-on-click hook for a single card
function useActionConfirm() {
  const [armed, setArmed] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function trigger(key: string, cb: () => void) {
    if (armed === key) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setArmed(null);
      cb();
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setArmed(key);
      timerRef.current = setTimeout(() => setArmed(null), 15000);
    }
  }

  function isArmed(key: string) { return armed === key; }
  function cancel() { setArmed(null); }

  return { trigger, isArmed, cancel };
}

function LetterCard({
  letter, canApprove, currentUserEmail,
  metroSLADays, metroWarnDays, parentLetter,
  onSubmitToMetro, onMetroApprove, onMetroRevision, onResubmit,
  onDirectApprove, onMarkSent, onRevert, onEditSentDate, onDelete, onDownload, onAddMetroComment,
  onRescan, properties, onLinkProperty, onUnlinkProperty,
  downloading, deleteConfirmId, onDeleteClick,
}: LetterCardProps) {
  const [expanded, setExpanded] = useState(false);
  // Inline revision feedback input
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [revisionText, setRevisionText] = useState('');
  const [revisionFiles, setRevisionFiles] = useState<File[]>([]);
  const revisionFileInputRef = useRef<HTMLInputElement>(null);
  // Inline metro note input (expanded panel)
  const [noteText, setNoteText] = useState('');
  const [noteFiles, setNoteFiles] = useState<File[]>([]);
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingComment, setUploadingComment] = useState(false);
  // Editable sent date (for historical backfilling)
  const [editingSentDate, setEditingSentDate] = useState(false);
  const [draftSentDate, setDraftSentDate] = useState('');
  // Date confirmation for status transitions
  const [actionDate, setActionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { trigger, isArmed, cancel } = useActionConfirm();

  // Date-requiring actions: shown when any of these are armed
  const DATE_ACTIONS = ['submit_metro', 'metro_approve', 'mark_sent', 'resubmit'];
  const anyDateActionArmed = DATE_ACTIONS.some(k => isArmed(k));
  const f = letter.fields;

  const isMetroActive = letter.status === 'submitted_to_metro' || letter.status === 'metro_revision_requested';
  const hasMetroComments = (letter.metroComments?.length ?? 0) > 0;

  // Confirm-aware button helper
  function ConfirmBtn({
    actionKey, label, confirmLabel, onClick, className,
  }: { actionKey: string; label: string; confirmLabel?: string; onClick: () => void; className: string }) {
    const armed = isArmed(actionKey);
    return (
      <button
        onClick={() => trigger(actionKey, onClick)}
        className={`px-2.5 py-1.5 text-[11px] font-semibold rounded transition-colors ${
          armed ? 'bg-amber-500 text-white animate-pulse' : className
        }`}
        title={armed ? 'Click again to confirm' : undefined}
      >
        {armed ? (confirmLabel ?? 'Confirm?') : label}
      </button>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-slate-800 text-sm truncate">
              {letter.address}
              {letter.ownerName && (
                <span className="ml-1.5 font-normal text-slate-400 text-xs">· {letter.ownerName}</span>
              )}
            </span>
            <StatusBadge status={letter.status} />
            {letter.segment && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                Seg {letter.segment}
              </span>
            )}
            {letter.source === 'uploaded' && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-600 border border-violet-200">
                Uploaded
              </span>
            )}
            {/* Metro timer chip */}
            {isMetroActive && letter.metroSubmittedAt && (
              <MetroTimerBadge
                submittedAt={letter.metroSubmittedAt}
                slaDays={metroSLADays}
                warnDays={metroWarnDays}
              />
            )}
            {/* Revision count badge */}
            {(letter.metroRevisionCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-50 text-orange-600 border border-orange-200">
                Rev ×{letter.metroRevisionCount}
              </span>
            )}
            {/* Attachment count — sum across all Metro comments */}
            {(() => {
              const attachCount = (letter.metroComments ?? []).reduce(
                (n, c) => n + (c.attachments?.length ?? 0), 0
              );
              if (attachCount === 0) return null;
              return (
                <button
                  onClick={() => setExpanded(true)}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors"
                  title={`${attachCount} Metro attachment${attachCount === 1 ? '' : 's'} — click to view`}
                >
                  <Paperclip size={9} />
                  {attachCount}
                </button>
              );
            })()}
            {/* Re-notice chain badge */}
            {letter.parentLetterId && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-50 text-teal-700 border border-teal-200"
                title={parentLetter ? `Re-notice of ${parentLetter.planLoc} letter` : 'Re-notice of a prior plan'}
              >
                ↻ Re-notice{parentLetter ? ` · ${parentLetter.planLoc}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
            {letter.planLoc && <span>Plan: <span className="font-medium text-slate-700">{letter.planLoc}</span></span>}
            <span>Added {fmt(letter.createdAt)}</span>
            {letter.metroSubmittedAt && <span>Metro: {fmt(letter.metroSubmittedAt)}</span>}
            {letter.approvedAt && <span>Approved {fmt(letter.approvedAt)}</span>}
            {/* Sent date — editable for backfilling */}
            {letter.sentAt && !editingSentDate && (
              <span className="flex items-center gap-1">
                Sent {fmt(letter.sentAt)}
                {canApprove && (
                  <button
                    onClick={() => { setDraftSentDate(letter.sentAt!.slice(0, 10)); setEditingSentDate(true); }}
                    className="text-slate-300 hover:text-blue-500 transition-colors"
                    title="Edit sent date"
                  >
                    ✏
                  </button>
                )}
              </span>
            )}
            {editingSentDate && (
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">Sent</span>
                <input
                  type="date"
                  value={draftSentDate}
                  onChange={e => setDraftSentDate(e.target.value)}
                  className="border border-blue-300 rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-blue-500 bg-white"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (draftSentDate) onEditSentDate(draftSentDate);
                    setEditingSentDate(false);
                  }}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingSentDate(false)}
                  className="text-[10px] text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </span>
            )}
            {/* No sentAt yet but sent status — allow setting date retroactively */}
            {!letter.sentAt && letter.status === 'sent' && canApprove && !editingSentDate && (
              <button
                onClick={() => { setDraftSentDate(new Date().toISOString().slice(0, 10)); setEditingSentDate(true); }}
                className="text-[11px] text-slate-400 hover:text-blue-600 italic transition-colors"
              >
                + Set sent date
              </button>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {/* Draft actions */}
          {letter.status === 'draft' && canApprove && !showRevisionInput && (
            <>
              <ConfirmBtn actionKey="submit_metro" label="Submit to Metro" onClick={() => onSubmitToMetro(actionDate)} className="bg-indigo-600 text-white hover:bg-indigo-700" />
              <ConfirmBtn actionKey="direct_approve" label="Approve" onClick={onDirectApprove} className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-50" />
            </>
          )}
          {/* With Metro actions */}
          {letter.status === 'submitted_to_metro' && canApprove && !showRevisionInput && (
            <>
              <ConfirmBtn actionKey="metro_approve" label="Metro Approved" onClick={() => onMetroApprove(actionDate)} className="bg-blue-600 text-white hover:bg-blue-700" />
              <button
                onClick={() => { setShowRevisionInput(true); setExpanded(true); }}
                className="px-2.5 py-1.5 text-[11px] font-semibold bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
              >
                Revision Needed
              </button>
            </>
          )}
          {/* Revision requested — resubmit */}
          {letter.status === 'metro_revision_requested' && canApprove && !showRevisionInput && (
            <ConfirmBtn actionKey="resubmit" label="Resubmit to Metro" onClick={() => onResubmit(actionDate)} className="bg-indigo-600 text-white hover:bg-indigo-700" />
          )}
          {/* Approved — mark sent */}
          {letter.status === 'approved' && (
            <ConfirmBtn actionKey="mark_sent" label="Mark Sent" onClick={() => onMarkSent(actionDate)} className="bg-emerald-600 text-white hover:bg-emerald-700" />
          )}

          {/* Re-scan from stored PDF — only for uploaded letters with a saved URL */}
          {onRescan && letter.source === 'uploaded' && letter.letterUrl && (
            <button
              onClick={onRescan}
              className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded transition-colors"
              title="Re-scan with updated AI prompt (no re-upload needed)"
            >
              <RefreshCw size={14} />
            </button>
          )}
          <button
            onClick={onDownload}
            disabled={downloading}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-40"
            title="Download .docx"
          >
            {downloading ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
          </button>
          {letter.letterUrl && (
            <a
              href={letter.letterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="View file"
            >
              <ExternalLink size={14} />
            </a>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={onDeleteClick}
            className={`p-1.5 rounded transition-colors ${
              deleteConfirmId === letter.id
                ? 'text-red-600 bg-red-50'
                : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
            }`}
            title={deleteConfirmId === letter.id ? 'Click again to confirm' : 'Delete'}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Date confirmation bar — shown when a date-requiring action is armed */}
      {anyDateActionArmed && (
        <div className="flex items-center gap-2 px-4 pb-2.5 -mt-1 bg-amber-50 border-t border-amber-100 py-2">
          <span className="text-[11px] font-semibold text-amber-700">Confirm date:</span>
          <input
            type="date"
            value={actionDate}
            onChange={e => setActionDate(e.target.value)}
            className="border border-amber-300 rounded px-2 py-0.5 text-[11px] bg-white outline-none focus:border-amber-500 font-medium text-slate-800"
          />
          <span className="text-[10px] text-amber-600">← adjust if needed, then click the button again</span>
          <button onClick={() => cancel()} className="ml-auto text-[10px] text-slate-400 hover:text-slate-600">Cancel</button>
        </div>
      )}

      {/* Revert row — shown when there's a meaningful state to go back to */}
      {canApprove && (
        <div className="flex items-center gap-3 px-4 pb-2.5 -mt-1">
          {letter.status === 'submitted_to_metro' && (
            <button
              onClick={() => trigger('revert_draft', () => onRevert('draft'))}
              className={`text-[10px] font-semibold transition-colors ${isArmed('revert_draft') ? 'text-amber-600 animate-pulse' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {isArmed('revert_draft') ? '↩ Confirm revert to Draft?' : '↩ Undo: Back to Draft'}
            </button>
          )}
          {letter.status === 'metro_revision_requested' && (
            <button
              onClick={() => trigger('revert_metro', () => onRevert('submitted_to_metro'))}
              className={`text-[10px] font-semibold transition-colors ${isArmed('revert_metro') ? 'text-amber-600 animate-pulse' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {isArmed('revert_metro') ? '↩ Confirm revert to With Metro?' : '↩ Undo: Back to With Metro'}
            </button>
          )}
          {letter.status === 'approved' && (
            <button
              onClick={() => trigger('revert_approved', () => onRevert(letter.metroSubmittedAt ? 'submitted_to_metro' : 'draft'))}
              className={`text-[10px] font-semibold transition-colors ${isArmed('revert_approved') ? 'text-amber-600 animate-pulse' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {isArmed('revert_approved') ? '↩ Confirm revert?' : `↩ Undo: Back to ${letter.metroSubmittedAt ? 'With Metro' : 'Draft'}`}
            </button>
          )}
          {letter.status === 'sent' && (
            <button
              onClick={() => trigger('revert_sent', () => onRevert('approved'))}
              className={`text-[10px] font-semibold transition-colors ${isArmed('revert_sent') ? 'text-amber-600 animate-pulse' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {isArmed('revert_sent') ? '↩ Confirm revert to Approved?' : '↩ Undo: Back to Approved'}
            </button>
          )}
        </div>
      )}

      {/* Inline revision feedback input */}
      {showRevisionInput && (
        <div className="border-t border-orange-100 bg-orange-50 px-4 py-3">
          <div className="text-[11px] font-bold text-orange-700 mb-1.5">Metro feedback / revision notes</div>
          <textarea
            autoFocus
            value={revisionText}
            onChange={e => setRevisionText(e.target.value)}
            placeholder="What did Metro ask to change? (optional — you can add notes later)"
            rows={2}
            className="w-full rounded border border-orange-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-orange-400 resize-none"
          />
          {/* Attached file chips */}
          {revisionFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {revisionFiles.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-orange-200 text-[11px] text-slate-700 max-w-[200px]">
                  <Paperclip size={10} className="text-orange-500 shrink-0" />
                  <span className="truncate" title={f.name}>{f.name}</span>
                  <button
                    onClick={() => setRevisionFiles(files => files.filter((_, j) => j !== i))}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                    title="Remove file"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={revisionFileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              const list = Array.from(e.target.files || []);
              if (list.length) setRevisionFiles(prev => [...prev, ...list]);
              if (e.target) e.target.value = '';
            }}
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={async () => {
                setUploadingComment(true);
                try {
                  await onMetroRevision(revisionText.trim(), revisionFiles.length ? revisionFiles : undefined);
                  setRevisionText('');
                  setRevisionFiles([]);
                  setShowRevisionInput(false);
                } finally {
                  setUploadingComment(false);
                }
              }}
              disabled={uploadingComment}
              className="px-3 py-1.5 rounded bg-orange-600 text-white text-[11px] font-bold hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {uploadingComment && <Loader size={11} className="animate-spin" />}
              Confirm Revision Request
            </button>
            <button
              onClick={() => revisionFileInputRef.current?.click()}
              disabled={uploadingComment}
              className="px-2.5 py-1.5 rounded border border-orange-200 bg-white text-[11px] text-orange-700 font-semibold hover:bg-orange-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              title="Attach Metro's response documents"
            >
              <Paperclip size={12} />
              Attach
            </button>
            <button
              onClick={() => { setRevisionText(''); setRevisionFiles([]); setShowRevisionInput(false); }}
              disabled={uploadingComment}
              className="px-3 py-1.5 rounded border border-slate-200 text-[11px] text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[11px]">
            <div><span className="text-slate-500">Work dates: </span><span className="text-slate-800">{f.workDates || '—'}</span></div>
            <div><span className="text-slate-500">Work hours: </span><span className="text-slate-800">{f.workHoursDescription || '—'}</span></div>
            <div><span className="text-slate-500">Location: </span><span className="text-slate-800">{f.street1}{f.street2 ? ` / ${f.street2}` : ''}</span></div>
            <div><span className="text-slate-500">Contact: </span><span className="text-slate-800">{f.contactName}{f.contactTitle ? ` · ${f.contactTitle}` : ''}</span></div>
            <div><span className="text-slate-500">Phone: </span><span className="text-slate-800">{f.contactPhone || '—'}</span></div>
            <div><span className="text-slate-500">Email: </span><span className="text-slate-800">{f.contactEmail || '—'}</span></div>
            {/* Linked property */}
            <div className="col-span-2">
              <span className="text-slate-500 mr-2">Property:</span>
              {letter.propertyId ? (() => {
                const prop = properties.find(p => p.id === letter.propertyId);
                return prop ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-700 font-semibold">
                    {prop.address}
                    {prop.ownerName && <span className="font-normal opacity-70">· {prop.ownerName}</span>}
                    <button onClick={onUnlinkProperty} className="ml-0.5 text-indigo-400 hover:text-red-500 transition-colors" title="Unlink property">✕</button>
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px] italic">Property deleted</span>
                );
              })() : (
                <select
                  defaultValue=""
                  onChange={e => { if (e.target.value) onLinkProperty(e.target.value); }}
                  className="text-[11px] border border-slate-200 rounded px-2 py-0.5 text-slate-600 bg-white outline-none focus:border-indigo-400"
                >
                  <option value="">— Link to property —</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.address}{p.ownerName ? ` (${p.ownerName})` : ''}</option>
                  ))}
                </select>
              )}
            </div>
            {letter.exhibitImageUrl && (
              <div className="col-span-2 mt-1">
                <span className="text-slate-500 block mb-1">Exhibit 1:</span>
                <a href={letter.exhibitImageUrl} target="_blank" rel="noopener noreferrer">
                  <img src={letter.exhibitImageUrl} alt="Exhibit 1" className="h-24 rounded border border-slate-200 object-cover cursor-zoom-in hover:opacity-90" />
                </a>
              </div>
            )}
            {f.bodyParagraph && (
              <div className="col-span-2 mt-1">
                <span className="text-slate-500 block mb-1">Body (EN):</span>
                <p className="text-slate-700 leading-relaxed bg-white border border-slate-200 rounded p-2.5">{f.bodyParagraph}</p>
              </div>
            )}
            {f.bodyParagraphEs && (
              <div className="col-span-2 mt-1">
                <span className="text-slate-500 block mb-1">Body (ES):</span>
                <p className="text-slate-700 leading-relaxed bg-white border border-slate-200 rounded p-2.5">{f.bodyParagraphEs}</p>
              </div>
            )}
            <div className="col-span-2 mt-1"><span className="text-slate-500">Added by: </span><span className="text-slate-800">{letter.createdBy}</span></div>
          </div>

          {/* Metro review thread */}
          {(hasMetroComments || isMetroActive || canApprove) && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="flex items-center gap-1.5 mb-2">
                <MessageSquare size={12} className="text-indigo-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Metro Review Notes</span>
              </div>

              {/* Comments list */}
              {(letter.metroComments ?? []).length > 0 ? (
                <div className="space-y-1.5 mb-2">
                  {letter.metroComments!.map(c => (
                    <div
                      key={c.id}
                      className={`rounded-md px-2.5 py-2 text-[11px] leading-relaxed ${
                        c.isRevisionRequest
                          ? 'bg-orange-50 border border-orange-200 text-orange-900'
                          : 'bg-indigo-50 border border-indigo-100 text-indigo-900'
                      }`}
                    >
                      {c.isRevisionRequest && (
                        <span className="font-bold text-orange-700 mr-1">⚠ Revision:</span>
                      )}
                      {c.text}
                      <span className="text-[10px] text-slate-400 ml-2">
                        {fmt(c.addedAt)} · {c.addedBy}
                      </span>
                      {/* Attachments */}
                      {c.attachments && c.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {c.attachments.map(a => (
                            <a
                              key={a.id}
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border text-[10px] font-medium max-w-[220px] transition-colors ${
                                c.isRevisionRequest
                                  ? 'border-orange-200 text-orange-800 hover:bg-orange-100'
                                  : 'border-indigo-200 text-indigo-800 hover:bg-indigo-100'
                              }`}
                              title={a.name}
                            >
                              <Paperclip size={9} className="shrink-0" />
                              <span className="truncate">{a.name}</span>
                              <Download size={9} className="shrink-0 opacity-60" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic mb-2">No Metro notes yet.</p>
              )}

              {/* Add note input */}
              {canApprove && (
                <div className="space-y-1.5">
                  {/* File chip preview */}
                  {noteFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {noteFiles.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-800 max-w-[220px]">
                          <Paperclip size={10} className="text-indigo-500 shrink-0" />
                          <span className="truncate" title={f.name}>{f.name}</span>
                          <button
                            onClick={() => setNoteFiles(files => files.filter((_, j) => j !== i))}
                            className="text-indigo-300 hover:text-red-500 transition-colors"
                            title="Remove file"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    ref={noteFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => {
                      const list = Array.from(e.target.files || []);
                      if (list.length) setNoteFiles(prev => [...prev, ...list]);
                      if (e.target) e.target.value = '';
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => noteFileInputRef.current?.click()}
                      disabled={uploadingComment}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-40"
                      title="Attach file"
                    >
                      <Paperclip size={14} />
                    </button>
                    <input
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter' && (noteText.trim() || noteFiles.length) && !uploadingComment) {
                          setUploadingComment(true);
                          try {
                            await onAddMetroComment(noteText.trim(), noteFiles.length ? noteFiles : undefined);
                            setNoteText('');
                            setNoteFiles([]);
                          } finally {
                            setUploadingComment(false);
                          }
                        }
                      }}
                      disabled={uploadingComment}
                      placeholder="Add Metro note… (Enter to save)"
                      className="flex-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] outline-none focus:border-indigo-400 disabled:opacity-60"
                    />
                    <button
                      onClick={async () => {
                        if ((!noteText.trim() && !noteFiles.length) || uploadingComment) return;
                        setUploadingComment(true);
                        try {
                          await onAddMetroComment(noteText.trim(), noteFiles.length ? noteFiles : undefined);
                          setNoteText('');
                          setNoteFiles([]);
                        } finally {
                          setUploadingComment(false);
                        }
                      }}
                      disabled={(!noteText.trim() && !noteFiles.length) || uploadingComment}
                      className="px-2.5 py-1.5 rounded bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                    >
                      {uploadingComment && <Loader size={11} className="animate-spin" />}
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

const STATUS_FILTERS: { value: DrivewayLetterStatus | 'all'; label: string }[] = [
  { value: 'all',                    label: 'All' },
  { value: 'draft',                  label: 'Draft' },
  { value: 'submitted_to_metro',     label: 'With Metro' },
  { value: 'metro_revision_requested', label: 'Revision' },
  { value: 'approved',               label: 'Approved' },
  { value: 'sent',                   label: 'Sent' },
];

export function DrivewayLettersSection({ currentUser, appConfig, allLetters, planFilter, onClearPlanFilter }: DrivewayLettersSectionProps) {
  const [letters, setLetters] = useState<DrivewayLetter[]>(allLetters ?? []);
  const [statusFilter, setStatusFilter] = useState<DrivewayLetterStatus | 'all'>('all');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [properties, setProperties] = useState<DrivewayProperty[]>([]);
  useEffect(() => subscribeToDrivewayProperties(setProperties), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canApprove = currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.CR;
  const currentUserEmail = currentUser?.email ?? 'Unknown';

  const metroSLADays  = appConfig.driveway_metroSLADays  ?? 5;
  const metroWarnDays = appConfig.driveway_metroWarnDays ?? 3;

  useEffect(() => {
    if (allLetters !== undefined) return;
    return subscribeToDrivewayLetters(setLetters);
  }, [allLetters]);

  useEffect(() => {
    if (allLetters !== undefined) setLetters(allLetters);
  }, [allLetters]);

  // Apply plan filter if set
  const visibleLetters = planFilter
    ? letters.filter(l => l.planId === planFilter.id)
    : letters;

  const segments = Array.from(new Set(visibleLetters.map(l => l.segment).filter(Boolean))).sort();

  // Split: scanning/error/pending-review vs confirmed
  const scanningLetters = visibleLetters.filter(l => l.scanStatus === 'scanning');
  const errorLetters    = visibleLetters.filter(l => l.scanStatus === 'error');
  const reviewLetters   = visibleLetters.filter(l => l.scanStatus === 'needs_review');

  const confirmedLetters = visibleLetters.filter(
    l => !scanningLetters.includes(l) && !errorLetters.includes(l) && !reviewLetters.includes(l)
  );

  const filtered = confirmedLetters.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (segmentFilter !== 'all' && l.segment !== segmentFilter) return false;
    return true;
  });

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const uploadedBy = currentUser?.email ?? 'Unknown';
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.type.includes('pdf')) {
          await uploadAndScanDrivewayLetter(file, uploadedBy);
        }
      }
    } catch (e) {
      showToast(`Upload failed: ${(e as Error).message}`, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmReview(
    letter: DrivewayLetter,
    fields: DrivewayNoticeFields,
    address: string,
    segment: string,
    saveToLibrary: boolean,
    existingPropertyId?: string,
  ) {
    // Resolve propertyId: use existing match, or create a new record if opted in
    let propertyId: string | undefined = existingPropertyId;
    if (!propertyId && saveToLibrary && address.trim()) {
      try {
        propertyId = await createDrivewayProperty(
          {
            address: address.trim(),
            ownerName: fields.recipientName || '',
            segment,
          },
          currentUserEmail
        );
      } catch {
        // Non-fatal — letter still saves without property link
      }
    }

    await updateDrivewayLetter(letter.id, {
      fields,
      address: address || fields.drivewayImpactAddress || fields.recipientAddress || letter.address,
      ownerName: fields.recipientName || letter.ownerName || '',
      segment,
      scanStatus: 'complete',
      ...(propertyId ? { propertyId } : {}),
    });
  }

  async function handleDownload(letter: DrivewayLetter) {
    setDownloading(d => ({ ...d, [letter.id]: true }));
    try {
      await downloadNoticeDocx(
        letter.fields,
        `driveway-letter-${letter.planLoc || letter.address.replace(/\s+/g, '_')}.docx`,
        letter.exhibitImageUrl
      );
    } catch (e) {
      showToast(`Download failed: ${(e as Error).message}`, 'error');
    } finally {
      setDownloading(d => ({ ...d, [letter.id]: false }));
    }
  }

  async function handleDirectApprove(letter: DrivewayLetter) {
    try {
      const blob = await buildNoticeDocx(letter.fields, letter.exhibitImageUrl);
      await approveDrivewayLetter(letter.id, letter.address);
      await uploadFinalLetter(
        letter.id,
        blob,
        `driveway-letter-${(letter.planLoc || letter.address).replace(/\s+/g, '_')}.docx`
      );
    } catch (e) {
      showToast(`Approve failed: ${(e as Error).message}`, 'error');
    }
  }

  async function handleSubmitToMetro(id: string, date: string, address?: string) {
    try { await submitLetterToMetro(id, date, address); }
    catch (e) { showToast(`Submit failed: ${(e as Error).message}`, 'error'); }
  }

  async function handleMetroApprove(letter: DrivewayLetter, date: string) {
    try {
      const blob = await buildNoticeDocx(letter.fields, letter.exhibitImageUrl);
      await metroApproveLetter(letter.id, date, letter.address);
      await uploadFinalLetter(
        letter.id,
        blob,
        `driveway-letter-${(letter.planLoc || letter.address).replace(/\s+/g, '_')}.docx`
      );
    } catch (e) {
      showToast(`Metro approve failed: ${(e as Error).message}`, 'error');
    }
  }

  async function handleMetroRevision(id: string, comment: string, files?: File[]) {
    try { await metroRequestRevision(id, comment || '(no notes)', currentUserEmail, files); }
    catch (e) { showToast(`Revision request failed: ${(e as Error).message}`, 'error'); }
  }

  async function handleResubmit(id: string, date: string) {
    try { await resubmitLetterToMetro(id, date); }
    catch (e) { showToast(`Resubmit failed: ${(e as Error).message}`, 'error'); }
  }

  async function handleMarkSent(letter: DrivewayLetter, date: string) {
    try { await markDrivewayLetterSent(letter.id, date, letter.address); }
    catch (e) { showToast(`Update failed: ${(e as Error).message}`, 'error'); }
  }

  async function handleAddMetroComment(id: string, text: string, files?: File[]) {
    try { await addMetroComment(id, text, currentUserEmail, files); }
    catch (e) { showToast(`Comment failed: ${(e as Error).message}`, 'error'); }
  }

  async function handleRevert(id: string, toStatus: DrivewayLetterStatus) {
    try { await revertDrivewayLetterStatus(id, toStatus); }
    catch (e) { showToast(`Revert failed: ${(e as Error).message}`, 'error'); }
  }

  async function handleEditSentDate(id: string, dateStr: string) {
    // Accept YYYY-MM-DD and store as ISO midnight UTC
    try { await updateDrivewayLetter(id, { sentAt: dateStr + 'T00:00:00.000Z' }); }
    catch (e) { showToast(`Update failed: ${(e as Error).message}`, 'error'); }
  }

  async function handleRescan(letter: DrivewayLetter) {
    if (!letter.letterUrl) return;
    try { await rescanDrivewayLetterFromUrl(letter.id, letter.letterUrl); }
    catch (e) { showToast(`Rescan failed: ${(e as Error).message}`, 'error'); }
  }

  async function handleLinkProperty(letterId: string, propertyId: string) {
    try { await updateDrivewayLetter(letterId, { propertyId }); }
    catch (e) { showToast(`Link failed: ${(e as Error).message}`, 'error'); }
  }

  async function handleUnlinkProperty(letterId: string) {
    try { await updateDrivewayLetter(letterId, { propertyId: '' }); }
    catch (e) { showToast(`Unlink failed: ${(e as Error).message}`, 'error'); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDrivewayLetter(id);
      setDeleteConfirm(null);
    } catch (e) {
      showToast(`Delete failed: ${(e as Error).message}`, 'error');
    }
  }

  function handleDeleteClick(id: string) {
    if (deleteConfirm === id) {
      handleDelete(id);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(c => c === id ? null : c), 3000);
    }
  }

  const draftCount    = confirmedLetters.filter(l => l.status === 'draft').length;
  const metroCount    = confirmedLetters.filter(l => l.status === 'submitted_to_metro' || l.status === 'metro_revision_requested').length;
  const approvedCount = confirmedLetters.filter(l => l.status === 'approved').length;
  const sentCount     = confirmedLetters.filter(l => l.status === 'sent').length;

  return (
    <div>
      {/* Plan filter banner */}
      {planFilter && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <span className="text-[12px] font-semibold text-blue-700">
            Filtering letters for plan <span className="font-bold">{planFilter.loc}</span>
          </span>
          {confirmedLetters.length === 0 && visibleLetters.length === 0 && (
            <span className="text-[11px] text-blue-500 italic">— no letters linked to this plan yet</span>
          )}
          <button
            onClick={onClearPlanFilter}
            className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-700 transition-colors"
          >
            × Clear filter
          </button>
        </div>
      )}

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
        className={`mb-6 border-2 border-dashed rounded-xl px-6 py-6 text-center transition-colors ${
          dragOver ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={e => handleUpload(e.target.files)}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-blue-600">
            <Loader size={18} className="animate-spin" />
            <span className="text-sm font-medium">Uploading…</span>
          </div>
        ) : (
          <>
            <Upload size={22} className="mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-medium text-slate-600">Drop existing driveway letters here</p>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-3">Rafi extracts recipient, work dates, hours, and contact info automatically</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-[12px] font-semibold hover:bg-slate-100 transition-colors shadow-sm"
            >
              <Upload size={13} /> Upload Letter PDF
            </button>
          </>
        )}
      </div>

      {/* Scan queue (scanning / error / pending review) */}
      {(scanningLetters.length > 0 || errorLetters.length > 0 || reviewLetters.length > 0) && (
        <div className="mb-5 space-y-2">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
            Processing ({scanningLetters.length + errorLetters.length + reviewLetters.length})
          </div>
          {scanningLetters.map(l => (
            <ScanningCard key={l.id} letter={l} onDelete={() => handleDelete(l.id)} />
          ))}
          {errorLetters.map(l => (
            <ErrorCard key={l.id} letter={l} onDelete={() => handleDelete(l.id)} />
          ))}
          {reviewLetters.map(l => (
            <ScannedReviewCard
              key={l.id}
              letter={l}
              onConfirm={(fields, address, segment, saveToLibrary, existingPropertyId) =>
                handleConfirmReview(l, fields, address, segment, saveToLibrary, existingPropertyId)
              }
              onDelete={() => handleDelete(l.id)}
              properties={properties}
              currentUserEmail={currentUserEmail}
            />
          ))}
        </div>
      )}

      {/* Stats */}
      {confirmedLetters.length > 0 && (
        <div className="flex gap-3 mb-5 flex-wrap">
          {[
            { label: 'Draft',    count: draftCount,    color: 'border-amber-200 bg-amber-50' },
            { label: 'With Metro', count: metroCount,  color: 'border-indigo-200 bg-indigo-50' },
            { label: 'Approved', count: approvedCount, color: 'border-blue-200 bg-blue-50' },
            { label: 'Sent',     count: sentCount,     color: 'border-emerald-200 bg-emerald-50' },
          ].map(s => (
            <div key={s.label} className={`border rounded-lg px-4 py-2.5 text-center ${s.color}`}>
              <div className="text-xl font-bold text-slate-800">{s.count}</div>
              <div className="text-[11px] text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {confirmedLetters.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <Filter size={13} className="text-slate-400" />
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2.5 py-1 text-[11px] rounded-full font-medium border transition-colors ${
                  statusFilter === f.value
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                {f.label}
                {f.value !== 'all' && (
                  <span className="ml-1 opacity-70">
                    ({confirmedLetters.filter(l => l.status === f.value).length})
                  </span>
                )}
              </button>
            ))}
          </div>
          {segments.length > 1 && (
            <select
              value={segmentFilter}
              onChange={e => setSegmentFilter(e.target.value)}
              className="ml-2 text-[11px] border border-slate-200 rounded px-2 py-1 text-slate-700 bg-white"
            >
              <option value="all">All Segments</option>
              {segments.map(s => <option key={s} value={s}>Segment {s}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Letter list */}
      {confirmedLetters.length === 0 && scanningLetters.length === 0 && errorLetters.length === 0 && reviewLetters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Mail size={36} className="text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No driveway letters yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Upload existing letters above, or draft new ones from the Compliance tab on any plan with driveway impact.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-8">No letters match the current filters.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(letter => (
            <LetterCard
              key={letter.id}
              letter={letter}
              parentLetter={letter.parentLetterId ? letters.find(l => l.id === letter.parentLetterId) : undefined}
              canApprove={canApprove}
              currentUserEmail={currentUserEmail}
              metroSLADays={metroSLADays}
              metroWarnDays={metroWarnDays}
              downloading={!!downloading[letter.id]}
              deleteConfirmId={deleteConfirm}
              onSubmitToMetro={date => handleSubmitToMetro(letter.id, date, letter.address)}
              onMetroApprove={date => handleMetroApprove(letter, date)}
              onMetroRevision={(comment, files) => handleMetroRevision(letter.id, comment, files)}
              onResubmit={date => handleResubmit(letter.id, date)}
              onDirectApprove={() => handleDirectApprove(letter)}
              onMarkSent={date => handleMarkSent(letter, date)}
              onRevert={toStatus => handleRevert(letter.id, toStatus)}
              onEditSentDate={dateStr => handleEditSentDate(letter.id, dateStr)}
              onRescan={letter.letterUrl ? () => handleRescan(letter) : undefined}
              onDeleteClick={() => handleDeleteClick(letter.id)}
              onDelete={() => handleDelete(letter.id)}
              onDownload={() => handleDownload(letter)}
              onAddMetroComment={(text, files) => handleAddMetroComment(letter.id, text, files)}
              properties={properties}
              onLinkProperty={propId => handleLinkProperty(letter.id, propId)}
              onUnlinkProperty={() => handleUnlinkProperty(letter.id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirm hint */}
      {deleteConfirm && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg z-50">
          Click Delete again to confirm — this cannot be undone.
        </div>
      )}
    </div>
  );
}

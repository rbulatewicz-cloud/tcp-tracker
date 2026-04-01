import { useEffect, useState, useRef } from 'react';
import {
  Mail, CheckCircle, Clock, Send, Download, ExternalLink,
  Trash2, ChevronDown, ChevronUp, Filter, Upload, Loader,
  AlertTriangle,
} from 'lucide-react';
import {
  subscribeToDrivewayLetters,
  approveDrivewayLetter,
  markDrivewayLetterSent,
  deleteDrivewayLetter,
  uploadFinalLetter,
  uploadAndScanDrivewayLetter,
  updateDrivewayLetter,
} from '../../services/drivewayLetterService';
import { buildNoticeDocx, downloadNoticeDocx } from '../../services/drivewayNoticeService';
import { DrivewayLetter, DrivewayLetterStatus, User, UserRole } from '../../types';
import type { DrivewayNoticeFields } from '../../services/drivewayNoticeService';

interface DrivewayLettersSectionProps {
  currentUser: User | null;
  allLetters?: DrivewayLetter[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABEL: Record<DrivewayLetterStatus, string> = {
  not_drafted: 'Not Drafted',
  draft:       'Draft',
  approved:    'Approved',
  sent:        'Sent',
};

const STATUS_COLORS: Record<DrivewayLetterStatus, string> = {
  not_drafted: 'bg-slate-100 text-slate-500',
  draft:       'bg-amber-50 text-amber-700 border border-amber-200',
  approved:    'bg-blue-50 text-blue-700 border border-blue-200',
  sent:        'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

function StatusBadge({ status }: { status: DrivewayLetterStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[status]}`}>
      {status === 'sent'     && <Send size={9} />}
      {status === 'approved' && <CheckCircle size={9} />}
      {status === 'draft'    && <Clock size={9} />}
      {status === 'not_drafted' && <Mail size={9} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Scan status card ──────────────────────────────────────────────────────────

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

function ScannedReviewCard({
  letter, onConfirm, onDelete,
}: {
  letter: DrivewayLetter;
  onConfirm: (fields: DrivewayNoticeFields, address: string, segment: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [fields, setFields] = useState<DrivewayNoticeFields>({ ...letter.fields });
  const [address, setAddress] = useState(letter.address);
  const [segment, setSegment] = useState(letter.segment);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof DrivewayNoticeFields, v: string | boolean) =>
    setFields(f => ({ ...f, [k]: v }));

  const inputCls = 'w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none focus:border-blue-400 focus:bg-white';

  return (
    <div className="bg-white border-2 border-blue-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
        <CheckCircle size={14} className="text-blue-600 flex-shrink-0" />
        <span className="text-[11px] font-bold text-blue-800">Rafi extracted — review and confirm</span>
        <span className="ml-auto text-[10px] text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full font-semibold">Uploaded</span>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Recipient Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
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
            try { await onConfirm(fields, address, segment); }
            finally { setSaving(false); }
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
  onApprove: () => void;
  onMarkSent: () => void;
  onDelete: () => void;
  onDownload: () => void;
  downloading: boolean;
  deleteConfirmId: string | null;
  onDeleteClick: () => void;
}

function LetterCard({
  letter, canApprove, onApprove, onMarkSent, onDelete, onDownload, downloading,
  deleteConfirmId, onDeleteClick,
}: LetterCardProps) {
  const [expanded, setExpanded] = useState(false);
  const f = letter.fields;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-slate-800 text-sm truncate">{letter.address}</span>
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
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
            {letter.planLoc && <span>Plan: <span className="font-medium text-slate-700">{letter.planLoc}</span></span>}
            {letter.ownerName && <span>Owner: <span className="font-medium text-slate-700">{letter.ownerName}</span></span>}
            <span>Added {fmt(letter.createdAt)}</span>
            {letter.approvedAt && <span>Approved {fmt(letter.approvedAt)}</span>}
            {letter.sentAt && <span>Sent {fmt(letter.sentAt)}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {letter.status === 'draft' && canApprove && (
            <button
              onClick={onApprove}
              className="px-2.5 py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Approve
            </button>
          )}
          {letter.status === 'approved' && (
            <button
              onClick={onMarkSent}
              className="px-2.5 py-1.5 text-[11px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
            >
              Mark Sent
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

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-1.5 text-[11px]">
          <div><span className="text-slate-500">Work dates: </span><span className="text-slate-800">{f.workDates || '—'}</span></div>
          <div><span className="text-slate-500">Work hours: </span><span className="text-slate-800">{f.workHoursDescription || '—'}</span></div>
          <div><span className="text-slate-500">Location: </span><span className="text-slate-800">{f.street1}{f.street2 ? ` / ${f.street2}` : ''}</span></div>
          <div><span className="text-slate-500">Contact: </span><span className="text-slate-800">{f.contactName}{f.contactTitle ? ` · ${f.contactTitle}` : ''}</span></div>
          <div><span className="text-slate-500">Phone: </span><span className="text-slate-800">{f.contactPhone || '—'}</span></div>
          <div><span className="text-slate-500">Email: </span><span className="text-slate-800">{f.contactEmail || '—'}</span></div>
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
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

const STATUS_FILTERS: { value: DrivewayLetterStatus | 'all'; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'draft',    label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent',     label: 'Sent' },
];

export function DrivewayLettersSection({ currentUser, allLetters }: DrivewayLettersSectionProps) {
  const [letters, setLetters] = useState<DrivewayLetter[]>(allLetters ?? []);
  const [statusFilter, setStatusFilter] = useState<DrivewayLetterStatus | 'all'>('all');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canApprove = currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN;

  useEffect(() => {
    if (allLetters !== undefined) return;
    return subscribeToDrivewayLetters(setLetters);
  }, [allLetters]);

  useEffect(() => {
    if (allLetters !== undefined) setLetters(allLetters);
  }, [allLetters]);

  const segments = Array.from(new Set(letters.map(l => l.segment).filter(Boolean))).sort();

  // Split: scanning/error/pending-review vs confirmed
  const scanningLetters = letters.filter(l => l.scanStatus === 'scanning');
  const errorLetters    = letters.filter(l => l.scanStatus === 'error');
  const reviewLetters   = letters.filter(l => l.scanStatus === 'needs_review');

  const confirmedLetters = letters.filter(
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
      alert(`Upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmReview(
    letter: DrivewayLetter,
    fields: DrivewayNoticeFields,
    address: string,
    segment: string
  ) {
    await updateDrivewayLetter(letter.id, {
      fields,
      address: address || fields.recipientAddress || letter.address,
      segment,
      scanStatus: 'complete',
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
      alert(`Download failed: ${(e as Error).message}`);
    } finally {
      setDownloading(d => ({ ...d, [letter.id]: false }));
    }
  }

  async function handleApprove(letter: DrivewayLetter) {
    try {
      const blob = await buildNoticeDocx(letter.fields, letter.exhibitImageUrl);
      await approveDrivewayLetter(letter.id);
      await uploadFinalLetter(
        letter.id,
        blob,
        `driveway-letter-${(letter.planLoc || letter.address).replace(/\s+/g, '_')}.docx`
      );
    } catch (e) {
      alert(`Approve failed: ${(e as Error).message}`);
    }
  }

  async function handleMarkSent(letter: DrivewayLetter) {
    try { await markDrivewayLetterSent(letter.id); }
    catch (e) { alert(`Update failed: ${(e as Error).message}`); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDrivewayLetter(id);
      setDeleteConfirm(null);
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
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
  const approvedCount = confirmedLetters.filter(l => l.status === 'approved').length;
  const sentCount     = confirmedLetters.filter(l => l.status === 'sent').length;

  return (
    <div>
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
              onConfirm={(fields, address, segment) => handleConfirmReview(l, fields, address, segment)}
              onDelete={() => handleDelete(l.id)}
            />
          ))}
        </div>
      )}

      {/* Stats */}
      {confirmedLetters.length > 0 && (
        <div className="flex gap-3 mb-5">
          {[
            { label: 'Draft',    count: draftCount,    color: 'border-amber-200 bg-amber-50' },
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
          <div className="flex gap-1">
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
              canApprove={canApprove}
              downloading={!!downloading[letter.id]}
              deleteConfirmId={deleteConfirm}
              onApprove={() => handleApprove(letter)}
              onMarkSent={() => handleMarkSent(letter)}
              onDeleteClick={() => handleDeleteClick(letter.id)}
              onDelete={() => handleDelete(letter.id)}
              onDownload={() => handleDownload(letter)}
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

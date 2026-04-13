import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, Upload, Trash2, ExternalLink, Search, Plus, FileText,
} from 'lucide-react';
import { ReferenceDoc, ReferenceDocCategory, User, UserRole } from '../../types';
import {
  subscribeReferenceDocs, uploadReferenceDoc, deleteReferenceDoc,
} from '../../services/referenceService';
import { fmtDate } from '../../utils/plans';
import { showToast } from '../../lib/toast';

// ── constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: ReferenceDocCategory[] = [
  'BOE', 'LADOT', 'LAMC', 'Police Commission', 'Internal', 'Other',
];

const CATEGORY_COLORS: Record<ReferenceDocCategory, string> = {
  'BOE':              'bg-blue-50 text-blue-700 border border-blue-200',
  'LADOT':            'bg-violet-50 text-violet-700 border border-violet-200',
  'LAMC':             'bg-amber-50 text-amber-700 border border-amber-200',
  'Police Commission':'bg-red-50 text-red-700 border border-red-200',
  'Internal':         'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'Other':            'bg-slate-100 text-slate-500',
};

const BLANK_FORM = {
  title: '',
  category: 'BOE' as ReferenceDocCategory,
  description: '',
};

// ── component ─────────────────────────────────────────────────────────────────

interface ReferenceLibrarySectionProps {
  currentUser: User | null;
}

export function ReferenceLibrarySection({ currentUser }: ReferenceLibrarySectionProps) {
  const [docs, setDocs] = useState<(ReferenceDoc & { _fid: string })[]>([]);
  useEffect(() => subscribeReferenceDocs(setDocs), []);

  const canManage = currentUser?.role === UserRole.MOT
    || currentUser?.role === UserRole.ADMIN
    || currentUser?.role === UserRole.SFTC;

  // ── filters ──────────────────────────────────────────────────────────────
  const [catFilter, setCatFilter] = useState<ReferenceDocCategory | 'all'>('all');
  const [searchQ, setSearchQ] = useState('');

  // ── upload form ──────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── delete confirm ───────────────────────────────────────────────────────
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── filtered list ────────────────────────────────────────────────────────
  const filtered = docs.filter(d => {
    if (catFilter !== 'all' && d.category !== catFilter) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !(d.description ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── handlers ─────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file || !form.title.trim()) return;
    setUploading(true);
    try {
      await uploadReferenceDoc(
        file,
        form.title.trim(),
        form.category,
        form.description.trim(),
        currentUser?.displayName || currentUser?.name || currentUser?.email || 'Unknown'
      );
      setForm(BLANK_FORM);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setShowForm(false);
      showToast('Document uploaded', 'success');
    } catch {
      showToast('Upload failed — please try again', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: ReferenceDoc & { _fid: string }) => {
    setDeleting(true);
    try {
      await deleteReferenceDoc(doc._fid, doc.storagePath);
      setDeleteConfirmId(null);
      showToast('Document removed', 'success');
    } catch {
      showToast('Delete failed — please try again', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            Reference Library
            <span className="ml-2 text-sm font-normal text-slate-400">({docs.length})</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            BOE guidelines, LAMC, LADOT circulars, and internal reference documents
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => { setShowForm(v => !v); setForm(BLANK_FORM); setFile(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-700 transition-colors"
          >
            <Plus size={13} />
            Upload Document
          </button>
        )}
      </div>

      {/* ── Upload form ─────────────────────────────────────────────────── */}
      {showForm && canManage && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">New Reference Document</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Document title *"
              className="col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
            />
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as ReferenceDocCategory }))}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Short description (optional)"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
            />
          </div>
          <div
            className="rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-5 text-center cursor-pointer hover:border-slate-400 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {file ? (
              <p className="text-[12px] font-semibold text-slate-700">📎 {file.name}</p>
            ) : (
              <>
                <Upload size={20} className="text-slate-400 mx-auto mb-1" />
                <p className="text-[12px] text-slate-500">Click to select a PDF or document</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={uploading || !file || !form.title.trim()}
              className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* Category pills */}
        {(['all', ...CATEGORIES] as const).map(c => (
          <button
            key={c}
            onClick={() => setCatFilter(c as ReferenceDocCategory | 'all')}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              catFilter === c
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {c === 'all' ? `All (${docs.length})` : c}
          </button>
        ))}
        {/* Search */}
        <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
          <Search size={12} className="text-slate-400" />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search…"
            className="text-[12px] outline-none bg-transparent w-36"
          />
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen size={40} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">
            {docs.length === 0 ? 'No documents uploaded yet' : 'No documents match your filters'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
            {docs.length === 0
              ? 'Upload BOE guidelines, LAMC sections, or internal reference docs for the team.'
              : 'Try a different category or clear the search.'}
          </p>
        </div>
      )}

      {/* ── Document list ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {filtered.map(doc => (
          <div
            key={doc._fid}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <FileText size={18} className="text-slate-400 flex-shrink-0" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-bold text-slate-800 truncate">{doc.title}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[doc.category]}`}>
                  {doc.category}
                </span>
              </div>
              {doc.description && (
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">{doc.description}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-0.5">
                {doc.fileName} · Uploaded {fmtDate(doc.uploadedAt)} by {doc.uploadedBy}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors"
              >
                <ExternalLink size={11} /> Open
              </a>
              {canManage && (
                deleteConfirmId === doc._fid ? (
                  <span className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-red-600 font-semibold">Remove?</span>
                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={deleting}
                      className="text-red-600 font-bold hover:underline"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="text-slate-400 hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(doc._fid)}
                    className="text-slate-300 hover:text-red-400 transition-colors"
                    title="Remove document"
                  >
                    <Trash2 size={14} />
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

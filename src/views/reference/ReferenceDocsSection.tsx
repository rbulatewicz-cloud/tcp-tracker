import React, { useEffect, useState, useRef } from 'react';
import { Upload, Trash2, ExternalLink, Download, FileText, Loader2 } from 'lucide-react';
import { ReferenceDoc, ReferenceDocCategory } from '../../types';
import {
  subscribeReferenceDocs,
  uploadReferenceDoc,
  deleteReferenceDoc,
} from '../../services/referenceService';
import { showToast } from '../../lib/toast';
import { fmtDate as formatDate } from '../../utils/plans';

interface Props {
  canUpload: boolean;
  uploadedBy: string;
}

type CategoryFilter = 'All' | ReferenceDocCategory;

const ALL_CATEGORIES: ReferenceDocCategory[] = [
  'BOE', 'LADOT', 'LAMC', 'Police Commission', 'Internal', 'Other',
];

const CATEGORY_BADGE: Record<ReferenceDocCategory, string> = {
  'BOE':               'bg-amber-100 text-amber-700',
  'LADOT':             'bg-blue-100 text-blue-700',
  'LAMC':              'bg-purple-100 text-purple-700',
  'Police Commission': 'bg-red-100 text-red-700',
  'Internal':          'bg-green-100 text-green-700',
  'Other':             'bg-slate-100 text-slate-600',
};


export default function ReferenceDocsSection({ canUpload, uploadedBy }: Props) {
  const [docs, setDocs] = useState<(ReferenceDoc & { _fid: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Upload modal state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<ReferenceDocCategory>('BOE');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribeReferenceDocs(snapshot => {
      setDocs(snapshot);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = activeCategory === 'All'
    ? docs
    : docs.filter(d => d.category === activeCategory);

  function resetModal() {
    setUploadFile(null);
    setUploadTitle('');
    setUploadCategory('BOE');
    setUploadDesc('');
    setShowUploadModal(false);
  }

  async function handleUpload() {
    if (!uploadFile || !uploadTitle.trim()) return;
    setUploading(true);
    try {
      await uploadReferenceDoc(uploadFile, uploadTitle.trim(), uploadCategory, uploadDesc, uploadedBy);
      showToast('Document uploaded successfully.', 'success');
      resetModal();
    } catch (e) {
      console.error(e);
      showToast('Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(d: ReferenceDoc & { _fid: string }) {
    if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    try {
      await deleteReferenceDoc(d._fid, d.storagePath);
      showToast('Document deleted.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Delete failed.', 'error');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') {
      showToast('Only PDF files are accepted.', 'error');
      return;
    }
    setUploadFile(f);
    if (!uploadTitle) setUploadTitle(f.name.replace(/\.pdf$/i, ''));
  }

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Category filter pills */}
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {(['All', ...ALL_CATEGORIES] as CategoryFilter[]).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Upload button */}
        {canUpload && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            <Upload size={14} />
            Upload
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          <span className="text-sm">Loading documents…</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText size={36} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">No documents found</p>
          {activeCategory !== 'All' && (
            <p className="text-xs text-slate-400 mt-1">Try selecting a different category.</p>
          )}
          {canUpload && activeCategory === 'All' && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Upload size={14} />
              Upload your first document
            </button>
          )}
        </div>
      )}

      {/* Doc grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(d => (
            <div
              key={d._fid}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2 hover:shadow-sm transition-shadow"
            >
              {/* Category badge + title */}
              <div className="flex items-start gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${CATEGORY_BADGE[d.category]}`}>
                  {d.category}
                </span>
              </div>
              <div className="font-bold text-slate-800 text-sm leading-snug">{d.title}</div>
              {d.description && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{d.description}</p>
              )}

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-auto">
                <span className="truncate max-w-[140px]" title={d.fileName}>{d.fileName}</span>
                <span>·</span>
                <span>{formatDate(d.uploadedAt)}</span>
                <span>·</span>
                <span className="truncate max-w-[100px]" title={d.uploadedBy}>{d.uploadedBy}</span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100 mt-1">
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <ExternalLink size={12} />
                  View
                </a>
                <a
                  href={d.fileUrl}
                  download={d.fileName}
                  className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
                >
                  <Download size={12} />
                  Download
                </a>
                {canUpload && (
                  <button
                    onClick={() => handleDelete(d)}
                    className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700 transition-colors ml-auto"
                    title="Delete document"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-800 mb-4">Upload Reference Document</h3>

            {/* File picker */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-lg p-5 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors mb-4"
            >
              {uploadFile ? (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
                  <FileText size={16} className="text-blue-500" />
                  <span className="font-medium truncate max-w-[260px]">{uploadFile.name}</span>
                </div>
              ) : (
                <>
                  <Upload size={20} className="mx-auto text-slate-400 mb-1" />
                  <p className="text-sm text-slate-500">Click to select a PDF</p>
                  <p className="text-xs text-slate-400 mt-0.5">PDF only</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Title */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                placeholder="e.g. BOE Noise Ordinance Summary"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Category */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={uploadCategory}
                onChange={e => setUploadCategory(e.target.value as ReferenceDocCategory)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {ALL_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Description <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={uploadDesc}
                onChange={e => setUploadDesc(e.target.value)}
                rows={3}
                placeholder="Brief description of this document…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-2">
              <button
                onClick={resetModal}
                disabled={uploading}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadFile || !uploadTitle.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {uploading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

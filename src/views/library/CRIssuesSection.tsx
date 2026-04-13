import { useState, useMemo, useRef } from 'react';
import {
  AlertTriangle, Plus, ChevronDown, ChevronUp, CheckCircle2,
  Clock, MessageSquare, Tag, User, Phone, Mail, Building2,
  Paperclip, ExternalLink, X, Sparkles,
} from 'lucide-react';
import {
  CRIssue, CRIssueCategory, CRIssuePriority, CRIssueStatus,
  CRIssueLogMethod, DrivewayProperty, Plan, User as AppUser, UserRole,
} from '../../types';
import {
  createCRIssue, updateCRIssue, resolveCRIssue,
  addCRIssueNote, deleteCRIssue,
  addCRIssueAttachment, removeCRIssueAttachment,
  parseIssueFromText,
} from '../../services/crIssueService';
import { fmtDate } from '../../utils/plans';
import { showToast } from '../../lib/toast';

// ── constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<CRIssueStatus, { label: string; color: string; dot: string }> = {
  open:        { label: 'Open',        color: 'bg-red-100 text-red-700 border border-red-200',       dot: 'bg-red-500' },
  in_progress: { label: 'In Progress', color: 'bg-amber-50 text-amber-700 border border-amber-200',  dot: 'bg-amber-500' },
  resolved:    { label: 'Resolved',    color: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  closed:      { label: 'Closed',      color: 'bg-slate-100 text-slate-500',                         dot: 'bg-slate-400' },
};

const PRIORITY_META: Record<CRIssuePriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'text-slate-500' },
  medium: { label: 'Medium', color: 'text-amber-600' },
  high:   { label: 'High',   color: 'text-orange-600' },
  urgent: { label: 'Urgent', color: 'text-red-600 font-bold' },
};

const CATEGORY_LABELS: Record<CRIssueCategory, string> = {
  noise_complaint:   'Noise Complaint',
  access_blocked:    'Access Blocked',
  safety_concern:    'Safety Concern',
  property_damage:   'Property Damage',
  communication:     'Communication',
  schedule_conflict: 'Schedule Conflict',
  other:             'Other',
};

const CATEGORY_ICONS: Record<CRIssueCategory, string> = {
  noise_complaint:   '🔊',
  access_blocked:    '🚧',
  safety_concern:    '⚠️',
  property_damage:   '🏚️',
  communication:     '💬',
  schedule_conflict: '📅',
  other:             '📌',
};

const LOG_METHOD_LABELS: Record<CRIssueLogMethod, string> = {
  phone_call:   '📞 Phone Call',
  email:        '📧 Email',
  in_person:    '🤝 In Person',
  walk_in:      '🚶 Walk-in',
  online_form:  '💻 Online Form',
  social_media: '📱 Social Media',
  other:        '📌 Other',
};

const BLANK_FORM = {
  title: '',
  description: '',
  category: 'other' as CRIssueCategory,
  priority: 'medium' as CRIssuePriority,
  reportedByName: '',
  reportedByPhone: '',
  reportedByEmail: '',
  propertyId: '',
  planLoc: '',
  assignedTo: '',
  loggedVia: '' as CRIssueLogMethod | '',
};

// ── helpers ───────────────────────────────────────────────────────────────────

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── component ─────────────────────────────────────────────────────────────────

interface CRIssuesSectionProps {
  issues: CRIssue[];
  currentUser: AppUser | null;
  properties: DrivewayProperty[];
  plans: Plan[];
  initialPropertyId?: string;
  setSelectedPlan?: (plan: Plan | null) => void;
  /** Called when user wants to add a property (e.g. address not found in CRM) */
  onAddProperty?: (address?: string) => void;
}

type StatusFilter = CRIssueStatus | 'all';

export function CRIssuesSection({ issues, currentUser, properties, plans, initialPropertyId, setSelectedPlan, onAddProperty }: CRIssuesSectionProps) {
  const canManage = currentUser?.role === UserRole.MOT
    || currentUser?.role === UserRole.ADMIN
    || currentUser?.role === UserRole.CR;

  // ── filters ──────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [priorityFilter, setPriorityFilter] = useState<CRIssuePriority | 'all'>('all');
  const [searchQ, setSearchQ] = useState('');

  // ── create form ──────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM, propertyId: initialPropertyId ?? '' });
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── AI parse panel ───────────────────────────────────────────────────────
  const [showParsePanel, setShowParsePanel] = useState(false);
  const [parseText, setParseText]           = useState('');
  const [parseFiles, setParseFiles]         = useState<File[]>([]);
  const [parsing, setParsing]               = useState(false);
  const [parsedAddress, setParsedAddress]   = useState('');
  const parseFileRef                        = useRef<HTMLInputElement>(null);

  // ── expanded issue ───────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachFileRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ── filtered list ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchQ.toLowerCase();
    return issues.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
      if (q && !i.title.toLowerCase().includes(q)
            && !i.reportedByName.toLowerCase().includes(q)
            && !(i.propertyAddress ?? '').toLowerCase().includes(q)
            && !(i.planLoc ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [issues, statusFilter, priorityFilter, searchQ]);

  // ── counts for status pills ──────────────────────────────────────────────
  const openCount       = issues.filter(i => i.status === 'open').length;
  const inProgCount     = issues.filter(i => i.status === 'in_progress').length;
  const resolvedCount   = issues.filter(i => i.status === 'resolved').length;

  // ── handlers ─────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.title.trim() || !form.reportedByName.trim()) return;
    setSaving(true);
    try {
      const linkedPlan = form.planLoc ? plans.find(p => p.loc === form.planLoc || p.id === form.planLoc) : undefined;
      const linkedProp = form.propertyId ? properties.find(p => p.id === form.propertyId) : undefined;
      const newId = await createCRIssue({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
        status: 'open',
        reportedByName: form.reportedByName.trim(),
        reportedByPhone: form.reportedByPhone.trim() || undefined,
        reportedByEmail: form.reportedByEmail.trim() || undefined,
        loggedVia: (form.loggedVia as CRIssueLogMethod) || undefined,
        propertyId: linkedProp?.id,
        propertyAddress: linkedProp?.address,
        planId: linkedPlan?.id,
        planLoc: linkedPlan?.loc || form.planLoc.trim() || undefined,
        assignedTo: form.assignedTo.trim() || undefined,
      }, currentUser?.email ?? 'Unknown');
      // Upload any pending attachments
      const uploaderName = currentUser?.displayName || currentUser?.name || currentUser?.email || 'Unknown';
      await Promise.all(pendingFiles.map(f => addCRIssueAttachment(newId, f, uploaderName)));
      setForm({ ...BLANK_FORM, propertyId: initialPropertyId ?? '' });
      setPendingFiles([]);
      setShowForm(false);
      showToast('Issue logged', 'success');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (issue: CRIssue, newStatus: CRIssueStatus) => {
    if (newStatus === 'resolved') {
      await resolveCRIssue(issue.id, currentUser?.email ?? 'Unknown');
      showToast('Issue marked resolved ✓', 'success');
    } else {
      await updateCRIssue(issue.id, { status: newStatus }, currentUser?.email ?? '');
      showToast(`Status updated to ${STATUS_META[newStatus].label}`, 'success');
    }
  };

  const handleAddNote = async (issue: CRIssue) => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await addCRIssueNote(issue.id, {
        text: noteText.trim(),
        addedAt: new Date().toISOString(),
        addedBy: currentUser?.displayName || currentUser?.name || currentUser?.email || 'Unknown',
      });
      setNoteText('');
    } finally {
      setAddingNote(false);
    }
  };

  const handleAddAttachment = async (issue: CRIssue, file: File) => {
    setUploadingAttachment(true);
    try {
      const uploaderName = currentUser?.displayName || currentUser?.name || currentUser?.email || 'Unknown';
      await addCRIssueAttachment(issue.id, file, uploaderName);
      showToast('Attachment added', 'success');
    } catch {
      showToast('Upload failed — please try again', 'error');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = async (issue: CRIssue, attId: string) => {
    const att = issue.attachments?.find(a => a.id === attId);
    if (!att) return;
    await removeCRIssueAttachment(issue.id, att, issue.attachments ?? []);
    showToast('Attachment removed', 'success');
  };

  const handleDelete = async (id: string) => {
    await deleteCRIssue(id);
    setDeleteConfirmId(null);
    if (expandedId === id) setExpandedId(null);
    showToast('Issue deleted', 'success');
  };

  // ── AI parse ─────────────────────────────────────────────────────────────
  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve((e.target?.result as string) ?? '');
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    });

  const handleParse = async () => {
    const hasContent = parseText.trim() || parseFiles.length > 0;
    if (!hasContent) return;
    setParsing(true);
    try {
      const fileTexts = await Promise.all(parseFiles.map(readFileAsText));
      const combined  = [parseText, ...fileTexts].filter(Boolean).join('\n\n---\n\n');
      const parsed    = await parseIssueFromText(combined);

      // Try to auto-match property by address
      let matchedPropertyId = '';
      if (parsed.propertyAddress) {
        const addr = parsed.propertyAddress.toLowerCase();
        const match = properties.find(
          p => p.address.toLowerCase().includes(addr) || addr.includes(p.address.toLowerCase())
        );
        matchedPropertyId = match?.id ?? '';
      }

      setForm(f => ({
        ...f,
        title:           parsed.title           ?? f.title,
        description:     parsed.description     ?? f.description,
        category:        parsed.category        ?? f.category,
        priority:        parsed.priority        ?? f.priority,
        reportedByName:  parsed.reportedByName  ?? f.reportedByName,
        reportedByPhone: parsed.reportedByPhone ?? f.reportedByPhone,
        reportedByEmail: parsed.reportedByEmail ?? f.reportedByEmail,
        loggedVia:       parsed.loggedVia       ?? f.loggedVia,
        planLoc:         parsed.planLoc         ?? f.planLoc,
        propertyId:      matchedPropertyId      || f.propertyId,
      }));

      setParsedAddress(parsed.propertyAddress ?? '');
      setShowParsePanel(false);
      setParseText('');
      setParseFiles([]);
      showToast('Issue extracted — review and confirm before saving', 'success');
    } catch (err) {
      showToast(`AI parse failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setParsing(false);
    }
  };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            Issue Tracker
            <span className="ml-2 text-sm font-normal text-slate-400">({issues.length})</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Complaints, safety concerns, and follow-up items from constituents</p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setShowForm(v => !v);
              setShowParsePanel(false);
              setForm({ ...BLANK_FORM, propertyId: initialPropertyId ?? '' });
              setParsedAddress('');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 transition-colors"
          >
            <Plus size={13} />
            Log Issue
          </button>
        )}
      </div>

      {/* ── Status summary chips ─────────────────────────────────────────── */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {([ 'all', 'open', 'in_progress', 'resolved', 'closed'] as const).map(s => {
          const count = s === 'all' ? issues.length
            : s === 'open' ? openCount
            : s === 'in_progress' ? inProgCount
            : s === 'resolved' ? resolvedCount
            : issues.filter(i => i.status === 'closed').length;
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                active
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {s !== 'all' && <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : STATUS_META[s].dot}`} />}
              {s === 'all' ? 'All' : STATUS_META[s].label}
              <span className={`text-[10px] ${active ? 'text-slate-300' : 'text-slate-400'}`}>{count}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value as CRIssuePriority | 'all')}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 outline-none focus:border-slate-400"
          >
            <option value="all">All priorities</option>
            {(['urgent', 'high', 'medium', 'low'] as CRIssuePriority[]).map(p => (
              <option key={p} value={p}>{PRIORITY_META[p].label}</option>
            ))}
          </select>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search issues…"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] outline-none focus:border-slate-400 w-44"
          />
        </div>
      </div>

      {/* ── New issue form ───────────────────────────────────────────────── */}
      {showForm && canManage && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-3">
          {/* Form header + AI parse toggle */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wide">New Issue</p>
            <button
              type="button"
              onClick={() => setShowParsePanel(v => !v)}
              className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                showParsePanel ? 'text-violet-700' : 'text-violet-500 hover:text-violet-700'
              }`}
            >
              <Sparkles size={12} />
              {showParsePanel ? 'Hide AI parse' : 'Parse from email / chat'}
            </button>
          </div>

          {/* ── Inline AI parse section ──────────────────────────────────── */}
          {showParsePanel && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2">
              <textarea
                value={parseText}
                onChange={e => setParseText(e.target.value)}
                placeholder="Paste email chain, chat log, or complaint description here…"
                rows={5}
                className="w-full rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-[12px] outline-none focus:border-violet-400 resize-none"
              />
              <div className="flex items-center gap-2 flex-wrap">
                {parseFiles.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 text-[11px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                    <Paperclip size={10} /> {f.name}
                    <button onClick={() => setParseFiles(fs => fs.filter((_, j) => j !== i))} className="ml-0.5 hover:text-red-600"><X size={9} /></button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => parseFileRef.current?.click()}
                  className="flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 font-semibold"
                >
                  <Paperclip size={12} /> Attach .txt or .eml
                </button>
                <input
                  ref={parseFileRef}
                  type="file"
                  accept=".txt,.eml,.text"
                  multiple
                  className="hidden"
                  onChange={e => { setParseFiles(fs => [...fs, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }}
                />
              </div>
              <button
                onClick={handleParse}
                disabled={parsing || (!parseText.trim() && parseFiles.length === 0)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                <Sparkles size={12} />
                {parsing ? 'Extracting…' : 'Extract & pre-fill'}
              </button>
            </div>
          )}

          {/* Title + category */}
          <div className="grid grid-cols-3 gap-2">
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Issue title *"
              className="col-span-2 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-rose-400"
            />
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as CRIssueCategory }))}
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-rose-400"
            >
              {(Object.keys(CATEGORY_LABELS) as CRIssueCategory[]).map(c => (
                <option key={c} value={c}>{CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Describe the issue…"
            rows={2}
            className="w-full rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-rose-400 resize-none"
          />

          {/* Reporter + priority */}
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.reportedByName}
              onChange={e => setForm(f => ({ ...f, reportedByName: e.target.value }))}
              placeholder="Reported by (name) *"
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-rose-400"
            />
            <select
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value as CRIssuePriority }))}
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-rose-400"
            >
              {(['urgent', 'high', 'medium', 'low'] as CRIssuePriority[]).map(p => (
                <option key={p} value={p}>{PRIORITY_META[p].label}</option>
              ))}
            </select>
            <input
              value={form.reportedByPhone}
              onChange={e => setForm(f => ({ ...f, reportedByPhone: e.target.value }))}
              placeholder="Phone"
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-rose-400"
            />
            <input
              value={form.reportedByEmail}
              onChange={e => setForm(f => ({ ...f, reportedByEmail: e.target.value }))}
              placeholder="Email"
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-rose-400"
            />
          </div>

          {/* How logged + linkages */}
          <div className="grid grid-cols-3 gap-2">
            <select
              value={form.loggedVia}
              onChange={e => setForm(f => ({ ...f, loggedVia: e.target.value as CRIssueLogMethod | '' }))}
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-rose-400"
            >
              <option value="">How was this logged?</option>
              {(Object.keys(LOG_METHOD_LABELS) as CRIssueLogMethod[]).map(m => (
                <option key={m} value={m}>{LOG_METHOD_LABELS[m]}</option>
              ))}
            </select>
            <select
              value={form.propertyId}
              onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-rose-400"
            >
              <option value="">No property linked</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.address}{p.ownerName ? ` (${p.ownerName})` : ''}</option>
              ))}
            </select>
            <input
              value={form.planLoc}
              onChange={e => setForm(f => ({ ...f, planLoc: e.target.value }))}
              placeholder="Plan LOC (e.g. LOC-042)"
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-rose-400"
            />
          </div>

          {/* No-property hint */}
          {form.propertyId === '' && (
            <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle size={11} className="flex-shrink-0" />
              <span>
                {parsedAddress
                  ? <>No property matched for <strong>{parsedAddress}</strong>.</>
                  : 'No property linked.'}
              </span>
              {onAddProperty && (
                <button
                  type="button"
                  onClick={() => onAddProperty(parsedAddress || undefined)}
                  className="ml-auto font-bold text-amber-800 hover:underline flex-shrink-0"
                >
                  + Add property record →
                </button>
              )}
            </div>
          )}

          {/* Attachments */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {pendingFiles.map((f, i) => (
                <span key={i} className="flex items-center gap-1 text-[11px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                  <Paperclip size={10} /> {f.name}
                  <button onClick={() => setPendingFiles(fs => fs.filter((_, j) => j !== i))} className="ml-0.5 hover:text-red-800">
                    <X size={9} />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-800 font-semibold"
              >
                <Paperclip size={12} /> Attach files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files ?? []);
                  setPendingFiles(f => [...f, ...files]);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={saving || !form.title.trim() || !form.reportedByName.trim()}
              className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Log Issue'}
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

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 size={40} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">
            {issues.length === 0 ? 'No issues logged yet' : 'No issues match your filters'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
            {issues.length === 0
              ? 'Use "Log Issue" to record a constituent complaint or concern.'
              : 'Try adjusting the status or priority filter.'}
          </p>
        </div>
      )}

      {/* ── Issue list ───────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {filtered.map(issue => {
          const sm = STATUS_META[issue.status];
          const pm = PRIORITY_META[issue.priority];
          const isExpanded = expandedId === issue.id;
          const age = daysSince(issue.createdAt);

          return (
            <div key={issue.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Row */}
              <div className="px-4 py-3 flex items-start gap-3">
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${sm.dot}`} />

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-slate-800 leading-tight">
                      {CATEGORY_ICONS[issue.category]} {issue.title}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sm.color}`}>
                      {sm.label}
                    </span>
                    <span className={`text-[10px] font-semibold ${pm.color}`}>
                      {pm.label}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <User size={10} /> {issue.reportedByName}
                    </span>
                    {issue.propertyAddress && (
                      <span className="flex items-center gap-1">
                        <Building2 size={10} /> {issue.propertyAddress}
                      </span>
                    )}
                    {issue.planLoc && (
                      <span className="flex items-center gap-1">
                        <Tag size={10} /> {issue.planLoc}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> {age === 0 ? 'Today' : `${age}d ago`}
                    </span>
                    {(issue.notes?.length ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare size={10} /> {issue.notes!.length} note{issue.notes!.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canManage && issue.status !== 'resolved' && issue.status !== 'closed' && (
                    <select
                      value={issue.status}
                      onChange={e => handleStatusChange(issue, e.target.value as CRIssueStatus)}
                      className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 outline-none focus:border-slate-400 cursor-pointer"
                      onClick={e => e.stopPropagation()}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  )}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
                  {/* Description */}
                  {issue.description && (
                    <p className="text-[12px] text-slate-700">{issue.description}</p>
                  )}

                  {/* Contact info + metadata */}
                  <div className="flex gap-4 flex-wrap">
                    {issue.loggedVia && (
                      <span className="text-[11px] text-slate-500 font-semibold">
                        {LOG_METHOD_LABELS[issue.loggedVia]}
                      </span>
                    )}
                    {issue.reportedByPhone && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Phone size={10} /> {issue.reportedByPhone}
                      </span>
                    )}
                    {issue.reportedByEmail && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Mail size={10} /> {issue.reportedByEmail}
                      </span>
                    )}
                    {issue.planLoc && (() => {
                      const plan = plans.find(p => p.loc === issue.planLoc || p.id === issue.planLoc);
                      return (
                        <button
                          onClick={() => plan && setSelectedPlan?.(plan)}
                          className={`flex items-center gap-1 text-[11px] font-semibold ${plan && setSelectedPlan ? 'text-blue-600 hover:underline cursor-pointer' : 'text-slate-500'}`}
                        >
                          <ExternalLink size={10} /> {issue.planLoc}
                          {!plan && <span className="text-slate-400 font-normal">(plan not found)</span>}
                        </button>
                      );
                    })()}
                    {issue.assignedTo && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <User size={10} /> Assigned: {issue.assignedTo}
                      </span>
                    )}
                    {issue.resolvedAt && (
                      <span className="text-[11px] text-emerald-600 font-semibold">
                        ✓ Resolved {fmtDate(issue.resolvedAt)}
                      </span>
                    )}
                  </div>

                  {/* Attachments */}
                  {((issue.attachments?.length ?? 0) > 0 || canManage) && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
                        Attachments {issue.attachments?.length ? `(${issue.attachments.length})` : ''}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {issue.attachments?.map(att => (
                          <div key={att.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]">
                            <Paperclip size={10} className="text-slate-400" />
                            <a href={att.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline max-w-[160px] truncate">
                              {att.name}
                            </a>
                            <span className="text-slate-400">{fmtDate(att.uploadedAt)}</span>
                            {canManage && (
                              <button
                                onClick={() => handleRemoveAttachment(issue, att.id)}
                                className="text-slate-300 hover:text-red-400 transition-colors ml-0.5"
                                title="Remove"
                              >
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        ))}
                        {canManage && (
                          <>
                            <button
                              onClick={() => attachFileRef.current?.click()}
                              disabled={uploadingAttachment}
                              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 border border-dashed border-slate-300 rounded-lg px-2.5 py-1.5 hover:border-slate-400 transition-colors disabled:opacity-50"
                            >
                              <Paperclip size={10} />
                              {uploadingAttachment ? 'Uploading…' : 'Add file'}
                            </button>
                            <input
                              ref={attachFileRef}
                              type="file"
                              className="hidden"
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) handleAddAttachment(issue, f);
                                e.target.value = '';
                              }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes thread */}
                  {(issue.notes?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Notes</p>
                      {issue.notes!.map(note => (
                        <div key={note.id} className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                          <p className="text-[12px] text-slate-700">{note.text}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {note.addedBy} · {fmtDate(note.addedAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add note */}
                  {canManage && (
                    <div className="flex gap-2">
                      <input
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(issue); } }}
                        placeholder="Add a note… (Enter to save)"
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
                      />
                      <button
                        onClick={() => handleAddNote(issue)}
                        disabled={addingNote || !noteText.trim()}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-bold hover:bg-slate-700 disabled:opacity-50 transition-colors"
                      >
                        {addingNote ? '…' : 'Add'}
                      </button>
                    </div>
                  )}

                  {/* Delete */}
                  {canManage && (
                    <div className="pt-1 border-t border-slate-200 flex items-center gap-3">
                      {deleteConfirmId === issue.id ? (
                        <>
                          <span className="text-[11px] text-red-600 font-semibold">Delete this issue?</span>
                          <button
                            onClick={() => handleDelete(issue.id)}
                            className="text-[11px] text-red-600 font-bold hover:underline"
                          >Yes</button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-[11px] text-slate-400 hover:underline"
                          >Cancel</button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(issue.id)}
                          className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                        >
                          Delete issue
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

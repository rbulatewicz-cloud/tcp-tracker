import { useEffect, useState } from 'react';
import {
  Building2, Plus, Phone, Mail, Edit2, Trash2, ChevronDown, ChevronUp, ExternalLink,
  Tag, AlertCircle,
} from 'lucide-react';
import {
  DrivewayProperty, DrivewayLetter, Plan, User, UserRole,
  StakeholderType, LanguagePreference, DeliveryPreference, CRIssue,
} from '../../types';
import {
  subscribeToDrivewayProperties,
  createDrivewayProperty,
  updateDrivewayProperty,
  deleteDrivewayProperty,
} from '../../services/drivewayPropertyService';
import { fmtDate } from '../../utils/plans';
import { updateDrivewayLetter } from '../../services/drivewayLetterService';

interface DrivewayPropertiesSectionProps {
  currentUser: User | null;
  allLetters: DrivewayLetter[];
  setSelectedPlan: (plan: Plan | null) => void;
  plans: Plan[];
  allIssues?: CRIssue[];
  onOpenIssues?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  not_drafted:              'bg-slate-100 text-slate-500',
  draft:                    'bg-amber-50 text-amber-700 border border-amber-200',
  submitted_to_metro:       'bg-indigo-50 text-indigo-700 border border-indigo-200',
  metro_revision_requested: 'bg-orange-50 text-orange-700 border border-orange-200',
  approved:                 'bg-blue-50 text-blue-700 border border-blue-200',
  sent:                     'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

const STATUS_LABEL: Record<string, string> = {
  not_drafted:              'Not Drafted',
  draft:                    'Draft',
  submitted_to_metro:       'With Metro',
  metro_revision_requested: 'Metro: Revise',
  approved:                 'Metro Approved',
  sent:                     'Sent',
};

// ── Property 360 option maps ──────────────────────────────────────────────────
const STAKEHOLDER_LABELS: Record<StakeholderType, string> = {
  resident:  'Resident',
  business:  'Business',
  landlord:  'Landlord',
  tenant:    'Tenant',
  hoa:       'HOA',
  other:     'Other',
};

const LANGUAGE_LABELS: Record<LanguagePreference, string> = {
  english:  'English',
  spanish:  'Spanish',
  armenian: 'Armenian',
  korean:   'Korean',
  chinese:  'Chinese',
  tagalog:  'Tagalog',
  other:    'Other',
};

const DELIVERY_LABELS: Record<DeliveryPreference, string> = {
  email:     'Email',
  mail:      'Physical mail',
  phone:     'Phone call',
  in_person: 'In person',
  none:      'No preference',
};

const BLANK_FORM = {
  address: '', ownerName: '', ownerPhone: '', ownerEmail: '', segment: '',
  // 360 fields
  stakeholderType: '' as StakeholderType | '',
  languagePreference: '' as LanguagePreference | '',
  deliveryPreference: '' as DeliveryPreference | '',
  contactNotes: '',
  doNotContact: false,
  tags: '',
};

export function DrivewayPropertiesSection({
  currentUser, allLetters, setSelectedPlan, plans, allIssues = [], onOpenIssues,
}: DrivewayPropertiesSectionProps) {
  const [properties, setProperties] = useState<DrivewayProperty[]>([]);
  useEffect(() => subscribeToDrivewayProperties(setProperties), []);

  const canManage = currentUser?.role === UserRole.MOT
    || currentUser?.role === UserRole.ADMIN
    || currentUser?.role === UserRole.CR;

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(BLANK_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [linkPickerPropId, setLinkPickerPropId] = useState<string | null>(null);
  const [letterSearch, setLetterSearch] = useState('');

  // Per-property UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<DrivewayProperty>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleAdd = async () => {
    if (!addForm.address.trim()) return;
    setAddSaving(true);
    try {
      await createDrivewayProperty(
        {
          address: addForm.address.trim(),
          ownerName: addForm.ownerName.trim() || undefined,
          ownerPhone: addForm.ownerPhone.trim() || undefined,
          ownerEmail: addForm.ownerEmail.trim() || undefined,
          segment: addForm.segment.trim() || undefined,
          stakeholderType: (addForm.stakeholderType as StakeholderType) || undefined,
          languagePreference: (addForm.languagePreference as LanguagePreference) || undefined,
          deliveryPreference: (addForm.deliveryPreference as DeliveryPreference) || undefined,
          contactNotes: addForm.contactNotes.trim() || undefined,
          doNotContact: addForm.doNotContact || undefined,
          tags: addForm.tags.trim() ? addForm.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        },
        currentUser?.email ?? 'Unknown'
      );
      setAddForm(BLANK_FORM);
      setShowAddForm(false);
    } finally {
      setAddSaving(false);
    }
  };

  const handleEditSave = async (propId: string) => {
    setEditSaving(true);
    try {
      await updateDrivewayProperty(propId, editDraft);
      setEditId(null);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (propId: string) => {
    setDeleting(true);
    try {
      await deleteDrivewayProperty(propId);
      setDeleteConfirmId(null);
      if (expandedId === propId) setExpandedId(null);
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (prop: DrivewayProperty) => {
    setEditId(prop.id);
    setEditDraft({
      ownerName: prop.ownerName,
      ownerPhone: prop.ownerPhone,
      ownerEmail: prop.ownerEmail,
      notes: prop.notes,
      segment: prop.segment,
      stakeholderType: prop.stakeholderType,
      languagePreference: prop.languagePreference,
      deliveryPreference: prop.deliveryPreference,
      contactNotes: prop.contactNotes,
      doNotContact: prop.doNotContact,
      tags: prop.tags,
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            Property Records
            <span className="ml-2 text-sm font-normal text-slate-400">({properties.length})</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Persistent owner/contact info across multiple plans</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setShowAddForm(v => !v); setAddForm(BLANK_FORM); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 transition-colors"
          >
            <Plus size={13} />
            Add Property
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && canManage && (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-2">
          <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">New Property</p>
          <input
            value={addForm.address}
            onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))}
            placeholder="Street address *"
            className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={addForm.ownerName}
              onChange={e => setAddForm(f => ({ ...f, ownerName: e.target.value }))}
              placeholder="Owner / contact name"
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
            />
            <input
              value={addForm.segment}
              onChange={e => setAddForm(f => ({ ...f, segment: e.target.value }))}
              placeholder="Segment (e.g. A1)"
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
            />
            <input
              value={addForm.ownerPhone}
              onChange={e => setAddForm(f => ({ ...f, ownerPhone: e.target.value }))}
              placeholder="Phone"
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
            />
            <input
              value={addForm.ownerEmail}
              onChange={e => setAddForm(f => ({ ...f, ownerEmail: e.target.value }))}
              placeholder="Email"
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
            />
            <select
              value={addForm.stakeholderType}
              onChange={e => setAddForm(f => ({ ...f, stakeholderType: e.target.value as StakeholderType | '' }))}
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
            >
              <option value="">Stakeholder type…</option>
              {(Object.keys(STAKEHOLDER_LABELS) as StakeholderType[]).map(k => (
                <option key={k} value={k}>{STAKEHOLDER_LABELS[k]}</option>
              ))}
            </select>
            <select
              value={addForm.languagePreference}
              onChange={e => setAddForm(f => ({ ...f, languagePreference: e.target.value as LanguagePreference | '' }))}
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
            >
              <option value="">Language preference…</option>
              {(Object.keys(LANGUAGE_LABELS) as LanguagePreference[]).map(k => (
                <option key={k} value={k}>{LANGUAGE_LABELS[k]}</option>
              ))}
            </select>
            <select
              value={addForm.deliveryPreference}
              onChange={e => setAddForm(f => ({ ...f, deliveryPreference: e.target.value as DeliveryPreference | '' }))}
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
            >
              <option value="">Delivery preference…</option>
              {(Object.keys(DELIVERY_LABELS) as DeliveryPreference[]).map(k => (
                <option key={k} value={k}>{DELIVERY_LABELS[k]}</option>
              ))}
            </select>
            <input
              value={addForm.tags}
              onChange={e => setAddForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="Tags (comma-separated)"
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
            />
          </div>
          <input
            value={addForm.contactNotes}
            onChange={e => setAddForm(f => ({ ...f, contactNotes: e.target.value }))}
            placeholder="CR contact notes (e.g. prefers morning calls)"
            className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
          />
          <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={addForm.doNotContact}
              onChange={e => setAddForm(f => ({ ...f, doNotContact: e.target.checked }))}
              className="rounded"
            />
            <span className="font-semibold text-red-600">Do Not Contact</span>
            <span className="text-slate-400">(suppress outreach)</span>
          </label>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={addSaving || !addForm.address.trim()}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {addSaving ? 'Saving…' : 'Save Property'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {properties.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 size={40} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No properties yet</p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
            Add properties from the compliance panel on a plan card, or use the Add Property button above.
          </p>
        </div>
      )}

      {/* Property cards */}
      <div className="space-y-3">
        {properties.map(prop => {
          const propLetters = allLetters.filter(l => l.propertyId === prop.id);
          const lastSent = propLetters.filter(l => l.sentAt).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0];
          const propOpenIssues = allIssues.filter(i => i.propertyId === prop.id && (i.status === 'open' || i.status === 'in_progress'));
          const isExpanded = expandedId === prop.id;
          const isEditing = editId === prop.id;

          return (
            <div key={prop.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Card header */}
              <div className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <Building2 size={16} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-slate-800">{prop.address}</span>
                      {prop.segment && (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          Seg {prop.segment}
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-1.5">
                        <input
                          value={editDraft.ownerName ?? ''}
                          onChange={e => setEditDraft(d => ({ ...d, ownerName: e.target.value }))}
                          placeholder="Owner / contact name"
                          className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            value={editDraft.ownerPhone ?? ''}
                            onChange={e => setEditDraft(d => ({ ...d, ownerPhone: e.target.value }))}
                            placeholder="Phone"
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                          />
                          <input
                            value={editDraft.ownerEmail ?? ''}
                            onChange={e => setEditDraft(d => ({ ...d, ownerEmail: e.target.value }))}
                            placeholder="Email"
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                          />
                          <select
                            value={editDraft.stakeholderType ?? ''}
                            onChange={e => setEditDraft(d => ({ ...d, stakeholderType: e.target.value as StakeholderType || undefined }))}
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                          >
                            <option value="">Stakeholder type…</option>
                            {(Object.keys(STAKEHOLDER_LABELS) as StakeholderType[]).map(k => (
                              <option key={k} value={k}>{STAKEHOLDER_LABELS[k]}</option>
                            ))}
                          </select>
                          <select
                            value={editDraft.languagePreference ?? ''}
                            onChange={e => setEditDraft(d => ({ ...d, languagePreference: e.target.value as LanguagePreference || undefined }))}
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                          >
                            <option value="">Language pref…</option>
                            {(Object.keys(LANGUAGE_LABELS) as LanguagePreference[]).map(k => (
                              <option key={k} value={k}>{LANGUAGE_LABELS[k]}</option>
                            ))}
                          </select>
                          <select
                            value={editDraft.deliveryPreference ?? ''}
                            onChange={e => setEditDraft(d => ({ ...d, deliveryPreference: e.target.value as DeliveryPreference || undefined }))}
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                          >
                            <option value="">Delivery pref…</option>
                            {(Object.keys(DELIVERY_LABELS) as DeliveryPreference[]).map(k => (
                              <option key={k} value={k}>{DELIVERY_LABELS[k]}</option>
                            ))}
                          </select>
                          <input
                            value={editDraft.segment ?? ''}
                            onChange={e => setEditDraft(d => ({ ...d, segment: e.target.value }))}
                            placeholder="Segment"
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                          />
                        </div>
                        <input
                          value={editDraft.notes ?? ''}
                          onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))}
                          placeholder="General notes"
                          className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                        />
                        <input
                          value={editDraft.contactNotes ?? ''}
                          onChange={e => setEditDraft(d => ({ ...d, contactNotes: e.target.value }))}
                          placeholder="CR contact notes (e.g. prefers morning calls)"
                          className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                        />
                        <input
                          value={editDraft.tags?.join(', ') ?? ''}
                          onChange={e => setEditDraft(d => ({ ...d, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                          placeholder="Tags (comma-separated, e.g. vocal, priority)"
                          className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                        />
                        <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editDraft.doNotContact ?? false}
                            onChange={e => setEditDraft(d => ({ ...d, doNotContact: e.target.checked }))}
                            className="rounded"
                          />
                          <span className="font-semibold text-red-600">Do Not Contact</span>
                        </label>
                        <div className="flex gap-2 pt-0.5">
                          <button
                            onClick={() => handleEditSave(prop.id)}
                            disabled={editSaving}
                            className="px-3 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                          >
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="px-3 py-1 rounded border border-slate-200 text-[10px] text-slate-500 hover:text-slate-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 space-y-0.5">
                        {prop.doNotContact && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5 w-fit mb-1">
                            <AlertCircle size={10} /> Do Not Contact
                          </div>
                        )}
                        {prop.ownerName && <div className="text-[12px] font-semibold text-slate-700">{prop.ownerName}</div>}
                        <div className="flex items-center gap-2 flex-wrap">
                          {prop.stakeholderType && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                              {STAKEHOLDER_LABELS[prop.stakeholderType]}
                            </span>
                          )}
                          {prop.languagePreference && prop.languagePreference !== 'english' && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                              🌐 {LANGUAGE_LABELS[prop.languagePreference]}
                            </span>
                          )}
                          {prop.deliveryPreference && (
                            <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-medium">
                              {DELIVERY_LABELS[prop.deliveryPreference]}
                            </span>
                          )}
                        </div>
                        {prop.ownerPhone && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Phone size={10} /> {prop.ownerPhone}
                          </div>
                        )}
                        {prop.ownerEmail && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Mail size={10} /> {prop.ownerEmail}
                          </div>
                        )}
                        {prop.contactNotes && (
                          <div className="text-[11px] text-indigo-700 bg-indigo-50 rounded px-2 py-0.5 mt-0.5">
                            📋 {prop.contactNotes}
                          </div>
                        )}
                        {prop.notes && (
                          <div className="text-[10px] text-slate-400 italic mt-0.5">{prop.notes}</div>
                        )}
                        {prop.tags && prop.tags.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                            <Tag size={10} className="text-slate-400" />
                            {prop.tags.map(t => (
                              <span key={t} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Letter count & last sent & issues */}
                    {!isEditing && (
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : prop.id)}
                          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 transition-colors"
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {propLetters.length} letter{propLetters.length !== 1 ? 's' : ''}
                        </button>
                        {lastSent?.sentAt && (
                          <span className="text-[10px] text-slate-400">
                            Last sent {fmtDate(lastSent.sentAt)}
                          </span>
                        )}
                        {propOpenIssues.length > 0 && (
                          <button
                            onClick={() => onOpenIssues?.()}
                            className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 hover:bg-red-100 transition-colors"
                            title="Open issues for this property"
                          >
                            <AlertCircle size={9} />
                            {propOpenIssues.length} open issue{propOpenIssues.length !== 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {canManage && !isEditing && (
                      <button
                        onClick={() => startEdit(prop)}
                        className="text-slate-300 hover:text-indigo-500 transition-colors"
                        title="Edit property"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}
                    {canManage && (
                      deleteConfirmId === prop.id ? (
                        <span className="flex items-center gap-1.5 text-[10px]">
                          <span className="text-red-600 font-semibold">Delete?</span>
                          <button
                            onClick={() => handleDelete(prop.id)}
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
                          onClick={() => setDeleteConfirmId(prop.id)}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                          title="Delete property"
                        >
                          <Trash2 size={13} />
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded letter history */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Letter History</p>
                  {propLetters.length === 0 ? (
                    <p className="text-[11px] text-slate-400">No letters linked to this property yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {propLetters.map(letter => {
                        const plan = plans.find(p => p.id === letter.planId);
                        return (
                          <div key={letter.id} className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-semibold text-slate-700">
                                {letter.address || letter.planLoc || 'Untitled letter'}
                                {plan && (
                                  <span className="ml-1.5 font-normal text-slate-400">
                                    · {plan.loc || plan.id}{plan.street1 ? ` (${plan.street1}${plan.street2 ? ` & ${plan.street2}` : ''})` : ''}
                                  </span>
                                )}
                              </div>
                              {letter.sentAt && (
                                <div className="text-[10px] text-slate-400">Sent {fmtDate(letter.sentAt)}</div>
                              )}
                            </div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[letter.status] ?? 'bg-slate-100 text-slate-500'}`}>
                              {STATUS_LABEL[letter.status] ?? letter.status}
                            </span>
                            {canManage && (
                              <button
                                onClick={async () => { await updateDrivewayLetter(letter.id, { propertyId: '' }); }}
                                className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                                title="Unlink from property"
                              >
                                ✕
                              </button>
                            )}
                            {plan && (
                              <button
                                onClick={() => setSelectedPlan(plan)}
                                className="text-slate-300 hover:text-indigo-500 transition-colors flex-shrink-0"
                                title="Open plan"
                              >
                                <ExternalLink size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Link a letter */}
                  {canManage && (
                    <div className="mt-3 pt-2 border-t border-slate-200">
                      {linkPickerPropId === prop.id ? (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Link a Letter</span>
                            <button onClick={() => { setLinkPickerPropId(null); setLetterSearch(''); }} className="ml-auto text-[10px] text-slate-400 hover:text-slate-600">✕ Close</button>
                          </div>
                          <input
                            value={letterSearch}
                            onChange={e => setLetterSearch(e.target.value)}
                            placeholder="Search by address or plan…"
                            className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] mb-2 outline-none focus:border-indigo-400"
                            autoFocus
                          />
                          {(() => {
                            const q = letterSearch.toLowerCase();
                            const candidates = allLetters.filter(l => {
                              if (l.propertyId && l.propertyId !== prop.id) return false; // already linked elsewhere
                              if (propLetters.some(pl => pl.id === l.id)) return false; // already linked here
                              if (q && !l.address.toLowerCase().includes(q) && !l.planLoc?.toLowerCase().includes(q)) return false;
                              return true;
                            }).sort((a, b) => {
                              // Segment matches first
                              const aMatch = prop.segment && a.segment === prop.segment ? 0 : 1;
                              const bMatch = prop.segment && b.segment === prop.segment ? 0 : 1;
                              return aMatch - bMatch;
                            });
                            if (candidates.length === 0) return <p className="text-[11px] text-slate-400 italic">No unlinked letters found.</p>;
                            return (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {candidates.map(l => (
                                  <button
                                    key={l.id}
                                    onClick={async () => {
                                      await updateDrivewayLetter(l.id, { propertyId: prop.id });
                                      setLinkPickerPropId(null);
                                      setLetterSearch('');
                                    }}
                                    className="w-full text-left rounded border border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 px-2.5 py-1.5 transition-colors"
                                  >
                                    <span className="text-[11px] font-semibold text-slate-700 block truncate">{l.address}</span>
                                    <span className="text-[10px] text-slate-400">{l.planLoc || 'No plan'}{l.segment ? ` · Seg ${l.segment}` : ''} · {STATUS_LABEL[l.status] ?? l.status}</span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <button
                          onClick={() => setLinkPickerPropId(prop.id)}
                          className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                        >
                          + Link a Letter
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

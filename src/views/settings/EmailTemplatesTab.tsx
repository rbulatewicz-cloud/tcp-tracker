import { useState, useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Eye, EyeOff, Plus, Save, Trash2, Send } from 'lucide-react';
import {
  subscribeEmailTemplates, updateEmailTemplate,
  createEmailTemplate, deleteEmailTemplate, seedDefaultEmailTemplates,
} from '../../services/emailTemplateService';
import { sendEmail } from '../../services/emailService';
import { showToast } from '../../lib/toast';
import type { EmailTemplate, EmailBarColor, EmailTier } from '../../types';

// ── Sample tokens used for test sends ────────────────────────────────────────

const SAMPLE_TOKENS: Record<string, string> = {
  loc:             'LOC-042',
  location:        'Van Nuys Blvd & Sherman Way',
  nv_number:       'NV-2024-0031',
  expiry_date:     'May 15, 2026',
  days_until:      '7',
  due_date:        'May 15, 2026',
  planId:          'test-plan-id',
  issue_ref:       'ISS007',
  issue_title:     'Noise complaint — nighttime drilling',
  reporter_name:   'Jane Smith',
  days_open:       '8',
  priority:        'high',
  assigned_by:     'Rafi Bulatewicz',
  new_stage:       'DOT Review',
  old_stage:       'Submitted',
  stage:           'DOT Review',
  mentioned_by:    'Mike Basso',
  note_excerpt:    'Please review the updated NV dates before submission.',
  updated_by:      'Paula Maldonado',
  new_status:      'In Progress',
  property_address:'14225 Van Nuys Blvd',
};

// ── Constants ──────────────────────────────────────────────────────────────────

const BAR_COLOR_OPTIONS: { value: EmailBarColor; label: string; hex: string }[] = [
  { value: 'red',     label: 'Red — Urgent / Alert',    hex: '#ef4444' },
  { value: 'amber',   label: 'Amber — Warning',          hex: '#f59e0b' },
  { value: 'blue',    label: 'Blue — Update / Info',     hex: '#3b82f6' },
  { value: 'green',   label: 'Green — Resolved / Good',  hex: '#10b981' },
  { value: 'neutral', label: 'Neutral — External / FYI', hex: '#e2e8f0' },
];

const TIER_LABELS: Record<EmailTier, string> = {
  A: 'A — Alert',
  B: 'B — Update',
  C: 'C — Constituent',
  D: 'D — Digest',
  E: 'E — Doc Delivery',
  F: 'F — CD Workflow',
  G: 'G — Broadcast',
};

const TIER_COLORS: Record<EmailTier, string> = {
  A: 'bg-red-100 text-red-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-slate-100 text-slate-600',
  D: 'bg-violet-100 text-violet-700',
  E: 'bg-emerald-100 text-emerald-700',
  F: 'bg-amber-100 text-amber-700',
  G: 'bg-orange-100 text-orange-700',
};

const TOKEN_HELP = [
  '{{loc}}', '{{planId}}', '{{location}}', '{{stage}}', '{{old_stage}}', '{{new_stage}}',
  '{{nv_number}}', '{{expiry_date}}', '{{days_until}}', '{{due_date}}',
  '{{issue_ref}}', '{{issue_title}}', '{{reporter_name}}', '{{priority}}', '{{days_open}}',
  '{{assigned_by}}', '{{updated_by}}', '{{mentioned_by}}', '{{note_excerpt}}',
  '{{property_address}}', '{{new_status}}',
];

const BLANK_TEMPLATE: Omit<EmailTemplate, 'id'> = {
  name: '', event: '', tier: 'B', subject: '', body: '',
  barColor: 'blue', ctaLabel: 'View →', ctaPath: '/',
  active: true, updatedAt: '', updatedBy: '',
};

// ── Email preview ──────────────────────────────────────────────────────────────

const BAR_HEX: Record<EmailBarColor, string> = {
  red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', green: '#10b981', neutral: '#e2e8f0',
};

function EmailPreview({ template }: { template: Partial<EmailTemplate> }) {
  const bar = BAR_HEX[template.barColor ?? 'blue'];
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden text-[12px]" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ height: 4, background: bar }} />
      <div className="bg-white p-5 space-y-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TCP Tracker</p>
        <p className="text-[15px] font-bold text-slate-900 leading-tight">{template.subject || 'Subject line…'}</p>
        <p className="text-[12px] text-slate-600 leading-relaxed">{template.body || 'Body text…'}</p>
        <div className="pt-2">
          <span className="inline-block px-4 py-2 rounded-lg bg-slate-900 text-white text-[11px] font-semibold">
            {template.ctaLabel || 'View →'}
          </span>
        </div>
        <div className="pt-2 border-t border-slate-100">
          <p className="text-[10px] text-slate-400">
            You're receiving this because you have notifications enabled.{' '}
            <span className="underline">Manage notification preferences</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface EmailTemplatesTabProps {
  currentUserEmail?: string;
  notificationEmail?: string;  // where to send test emails
}

export function EmailTemplatesTab({ currentUserEmail = 'admin', notificationEmail }: EmailTemplatesTabProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [editForm, setEditForm]       = useState<Omit<EmailTemplate, 'id'>>(BLANK_TEMPLATE);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [creating, setCreating]       = useState(false);
  const [seeding, setSeeding]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testSending, setTestSending] = useState<string | null>(null); // template id being tested

  useEffect(() => subscribeEmailTemplates(setTemplates), []);

  const openTemplate = (t: EmailTemplate) => {
    if (expandedId === t.id) { setExpandedId(null); return; }
    setExpandedId(t.id);
    setEditForm({ ...t });
    setShowPreview(false);
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    try {
      await updateEmailTemplate(id, { ...editForm, updatedAt: new Date().toISOString(), updatedBy: currentUserEmail });
      showToast('Template saved', 'success');
      setExpandedId(null);
    } catch { showToast('Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleCreate = async () => {
    if (!editForm.name.trim() || !editForm.subject.trim()) return;
    setCreating(true);
    try {
      await createEmailTemplate({ ...editForm, updatedAt: new Date().toISOString(), updatedBy: currentUserEmail });
      setEditForm(BLANK_TEMPLATE);
      showToast('Template created', 'success');
    } catch { showToast('Create failed', 'error'); }
    finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    await deleteEmailTemplate(id);
    setDeleteConfirm(null);
    if (expandedId === id) setExpandedId(null);
    showToast('Template deleted', 'success');
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDefaultEmailTemplates(currentUserEmail);
      showToast('Default templates loaded', 'success');
    } catch { showToast('Seed failed', 'error'); }
    finally { setSeeding(false); }
  };

  const handleTestSend = async (t: EmailTemplate) => {
    const to = notificationEmail || currentUserEmail;
    if (!to || to === 'admin') {
      showToast('No notification email configured — set one in your profile first', 'error');
      return;
    }
    setTestSending(t.id);
    try {
      await sendEmail({
        to,
        toName:       currentUserEmail,
        template:     t,
        tokens:       SAMPLE_TOKENS,
        contextLine:  'Test send — sample data only',
        reason:       'you requested a test send from the admin panel',
        triggerEvent: 'test_send',
        relatedId:    t.id,
        sentBy:       currentUserEmail,
        skipDedup:    true,
      });
      showToast(`Test email sent to ${to}`, 'success');
    } catch { showToast('Test send failed', 'error'); }
    finally { setTestSending(null); }
  };

  const grouped = templates.reduce<Record<string, EmailTemplate[]>>((acc, t) => {
    (acc[t.tier] = acc[t.tier] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Email Templates</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Edit subject lines, body copy, and call-to-action labels. Tokens like{' '}
            <code className="bg-slate-100 px-1 rounded text-[10px]">{'{{loc}}'}</code> are resolved at send time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {templates.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-[11px] font-bold hover:bg-violet-100 disabled:opacity-50 transition-colors"
            >
              <Sparkles size={12} />
              {seeding ? 'Loading…' : 'Load Default Templates'}
            </button>
          )}
          <button
            onClick={() => { setExpandedId('__new__'); setEditForm(BLANK_TEMPLATE); setShowPreview(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-bold hover:bg-slate-700 transition-colors"
          >
            <Plus size={12} /> New Template
          </button>
        </div>
      </div>

      {/* New template form */}
      {expandedId === '__new__' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">New Template</p>
          <TemplateEditForm
            form={editForm}
            setForm={setEditForm}
            showPreview={showPreview}
            setShowPreview={setShowPreview}
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={creating || !editForm.name.trim() || !editForm.subject.trim()}
              className="px-4 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-bold hover:bg-slate-700 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create Template'}
            </button>
            <button onClick={() => setExpandedId(null)} className="px-3 py-1.5 rounded-lg border text-[11px] text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Token reference */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Available Tokens</p>
        <div className="flex flex-wrap gap-1">
          {TOKEN_HELP.map(t => (
            <code key={t} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">{t}</code>
          ))}
        </div>
      </div>

      {/* Template list grouped by tier */}
      {templates.length === 0 && expandedId !== '__new__' && (
        <div className="text-center py-12 text-slate-400 text-[12px]">
          No templates yet — click "Load Default Templates" to get started.
        </div>
      )}

      {(Object.keys(TIER_LABELS) as EmailTier[]).map(tier => {
        const group = grouped[tier];
        if (!group?.length) return null;
        return (
          <div key={tier} className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Tier {tier} — {TIER_LABELS[tier].split(' — ')[1]}
            </p>
            {group.map(t => (
              <div key={t.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {/* Row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => openTemplate(t)}
                >
                  {/* Bar color dot */}
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: BAR_HEX[t.barColor] }} />
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-bold text-slate-800">{t.name}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TIER_COLORS[t.tier]}`}>
                        {t.tier}
                      </span>
                      {!t.active && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{t.subject}</p>
                  </div>
                  {/* Test send button */}
                  <button
                    onClick={e => { e.stopPropagation(); handleTestSend(t); }}
                    disabled={testSending === t.id}
                    title="Send test email to yourself"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-violet-600 hover:bg-violet-50 disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    <Send size={11} />
                    {testSending === t.id ? 'Sending…' : 'Test'}
                  </button>
                  {expandedId === t.id ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />}
                </div>

                {/* Edit form */}
                {expandedId === t.id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-3">
                    <TemplateEditForm
                      form={editForm}
                      setForm={setEditForm}
                      showPreview={showPreview}
                      setShowPreview={setShowPreview}
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleSave(t.id)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-bold hover:bg-slate-700 disabled:opacity-50"
                      >
                        <Save size={11} /> {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button onClick={() => setExpandedId(null)} className="px-3 py-1.5 rounded-lg border text-[11px] text-slate-500 hover:text-slate-700">
                        Cancel
                      </button>
                      <div className="ml-auto">
                        {deleteConfirm === t.id ? (
                          <span className="flex items-center gap-2 text-[11px]">
                            <span className="text-red-600 font-semibold">Delete this template?</span>
                            <button onClick={() => handleDelete(t.id)} className="text-red-600 font-bold hover:underline">Yes</button>
                            <button onClick={() => setDeleteConfirm(null)} className="text-slate-400 hover:underline">Cancel</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(t.id)}
                            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={10} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared edit form ──────────────────────────────────────────────────────────

function TemplateEditForm({
  form, setForm, showPreview, setShowPreview,
}: {
  form: Omit<EmailTemplate, 'id'>;
  setForm: (f: Omit<EmailTemplate, 'id'>) => void;
  showPreview: boolean;
  setShowPreview: (v: boolean) => void;
}) {
  const inp = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400 w-full';
  return (
    <div className="space-y-2.5">
      {/* Row 1: name, tier, active */}
      <div className="grid grid-cols-3 gap-2">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          placeholder="Template name *" className={`col-span-2 ${inp}`} />
        <select value={form.tier} onChange={e => setForm({ ...form, tier: e.target.value as EmailTier })} className={inp}>
          {(Object.keys(TIER_LABELS) as EmailTier[]).map(t => (
            <option key={t} value={t}>{TIER_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Row 2: event, bar color, active toggle */}
      <div className="grid grid-cols-3 gap-2">
        <input value={form.event} onChange={e => setForm({ ...form, event: e.target.value })}
          placeholder="Event key (e.g. nv_expiring)" className={`col-span-2 ${inp}`} />
        <select value={form.barColor} onChange={e => setForm({ ...form, barColor: e.target.value as EmailBarColor })} className={inp}>
          {BAR_COLOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Subject */}
      <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
        placeholder="Subject line * — use {{tokens}}" className={inp} />

      {/* Body */}
      <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
        placeholder="Body text (1-2 sentences) — use {{tokens}}"
        rows={2} className={`${inp} resize-none`} />

      {/* CTA + active */}
      <div className="grid grid-cols-3 gap-2 items-center">
        <input value={form.ctaLabel} onChange={e => setForm({ ...form, ctaLabel: e.target.value })}
          placeholder="Button label" className={inp} />
        <input value={form.ctaPath} onChange={e => setForm({ ...form, ctaPath: e.target.value })}
          placeholder="CTA path (e.g. /?plan={{planId}})" className={inp} />
        <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer px-2">
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })}
            className="rounded" />
          Active
        </label>
      </div>

      {/* Preview toggle */}
      <button
        type="button"
        onClick={() => setShowPreview(!showPreview)}
        className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 font-semibold"
      >
        {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
        {showPreview ? 'Hide preview' : 'Show preview'}
      </button>

      {showPreview && <EmailPreview template={form} />}
    </div>
  );
}

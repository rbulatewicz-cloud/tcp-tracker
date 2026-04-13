/**
 * emailTemplateService.ts
 *
 * CRUD for email templates stored in the `email_templates` Firestore collection.
 * Templates are editable by admins in Settings → Email Templates.
 * A seed function populates sensible defaults on first use.
 */

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, getDoc, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { EmailTemplate, EmailTier, EmailBarColor, NotifyEvent } from '../types';

const COL = 'email_templates';

// ── Subscribe ─────────────────────────────────────────────────────────────────

export function subscribeEmailTemplates(cb: (templates: EmailTemplate[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('tier'), orderBy('name'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as EmailTemplate)));
  });
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getEmailTemplate(id: string): Promise<EmailTemplate | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as EmailTemplate) : null;
}

/** Get a template by its event key — returns the first active match */
export async function getTemplateByEvent(event: string): Promise<EmailTemplate | null> {
  const snap = await getDocs(collection(db, COL));
  const match = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as EmailTemplate))
    .find(t => t.event === event && t.active);
  return match ?? null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createEmailTemplate(
  data: Omit<EmailTemplate, 'id'>,
): Promise<string> {
  const ref = await addDoc(collection(db, COL), data);
  return ref.id;
}

export async function updateEmailTemplate(
  id: string,
  patch: Partial<Omit<EmailTemplate, 'id'>>,
): Promise<void> {
  await updateDoc(doc(db, COL, id), patch);
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

// ── Default templates ─────────────────────────────────────────────────────────

interface DefaultTemplate {
  name: string;
  event: NotifyEvent | string;
  tier: EmailTier;
  subject: string;
  body: string;
  barColor: EmailBarColor;
  ctaLabel: string;
  ctaPath: string;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
}

const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  // ── Tier A — Alerts ────────────────────────────────────────────────────
  {
    name:      'NV Expiring — 30 Days',
    event:     'nv_expiring',
    tier:      'A',
    subject:   '{{loc}} — Noise Variance Expires in 30 Days',
    body:      'NV #{{nv_number}} for {{loc}} at {{location}} expires on {{expiry_date}}. A renewal application must be submitted before work can continue.',
    barColor:  'amber',
    ctaLabel:  'View Plan',
    ctaPath:   '/?plan={{planId}}',
    active:    true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    name:      'NV Expiring — 7 Days',
    event:     'nv_expiring',
    tier:      'A',
    subject:   '{{loc}} — Noise Variance Expires in 7 Days',
    body:      'NV #{{nv_number}} for {{loc}} expires on {{expiry_date}}. Immediate action required — submit your renewal application now.',
    barColor:  'red',
    ctaLabel:  'View Plan',
    ctaPath:   '/?plan={{planId}}',
    active:    true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    name:      'PHE Deadline Approaching',
    event:     'phe_deadline',
    tier:      'A',
    subject:   '{{loc}} — PHE Submission Due in {{days_until}} Days',
    body:      'The Peak Hour Exemption submission for {{loc}} is due by {{due_date}}. Review the plan and submit your BOE packet.',
    barColor:  'amber',
    ctaLabel:  'View Plan',
    ctaPath:   '/?plan={{planId}}',
    active:    true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    name:      'CR Issue Escalation',
    event:     'cr_issue_escalation',
    tier:      'A',
    subject:   'Issue #{{issue_ref}} Has Been Open for {{days_open}} Days',
    body:      '"{{issue_title}}" reported by {{reporter_name}} has had no update in {{days_open}} days. This issue is marked {{priority}} priority.',
    barColor:  'red',
    ctaLabel:  'View Issue',
    ctaPath:   '/?view=cr&tab=issues',
    active:    true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },

  // ── Tier B — Updates ───────────────────────────────────────────────────
  {
    name:      'Plan Assigned to You',
    event:     'plan_assigned',
    tier:      'B',
    subject:   'You\'ve Been Assigned to {{loc}}',
    body:      '{{assigned_by}} has assigned you as lead on {{loc}} at {{location}}. The plan is currently in the {{stage}} stage.',
    barColor:  'blue',
    ctaLabel:  'View Plan',
    ctaPath:   '/?plan={{planId}}',
    active:    true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    name:      'CR Issue Assigned to You',
    event:     'cr_issue_assigned',
    tier:      'B',
    subject:   'CR Issue Assigned — {{issue_title}}',
    body:      '{{assigned_by}} has assigned you to issue #{{issue_ref}} reported by {{reporter_name}}. Priority: {{priority}}.',
    barColor:  'blue',
    ctaLabel:  'View Issue',
    ctaPath:   '/?view=cr&tab=issues',
    active:    true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    name:      'CR Issue Status Updated',
    event:     'cr_issue_updated',
    tier:      'B',
    subject:   'Issue #{{issue_ref}} Updated to {{new_status}}',
    body:      '"{{issue_title}}" has been moved to {{new_status}} by {{updated_by}}.',
    barColor:  'blue',
    ctaLabel:  'View Issue',
    ctaPath:   '/?view=cr&tab=issues',
    active:    true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    name:      'Plan Status Change',
    event:     'status_change',
    tier:      'B',
    subject:   '{{loc}} Moved to {{new_stage}}',
    body:      '{{loc}} at {{location}} has moved from {{old_stage}} to {{new_stage}}.',
    barColor:  'blue',
    ctaLabel:  'View Plan',
    ctaPath:   '/?plan={{planId}}',
    active:    true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    name:      'Mentioned in a Note',
    event:     'mention',
    tier:      'B',
    subject:   '{{mentioned_by}} Mentioned You on {{loc}}',
    body:      '"{{note_excerpt}}"',
    barColor:  'blue',
    ctaLabel:  'View Note',
    ctaPath:   '/?plan={{planId}}',
    active:    true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },

  // ── Tier C — Constituent acknowledgment ────────────────────────────────
  {
    name:      'Constituent Issue Acknowledgment',
    event:     'constituent_ack',
    tier:      'C',
    subject:   'We Received Your Concern — Reference #{{issue_ref}}',
    body:      'Thank you for reaching out regarding {{property_address}}. Our community relations team will follow up with you within 3 business days.',
    barColor:  'neutral',
    ctaLabel:  'No action required',
    ctaPath:   '',
    active:    true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    name:      'Constituent Issue Resolved',
    event:     'cr_issue_updated',
    tier:      'C',
    subject:   'Update on Your Concern — Reference #{{issue_ref}}',
    body:      'We wanted to let you know that your concern regarding {{property_address}} has been resolved. Thank you for bringing this to our attention.',
    barColor:  'green',
    ctaLabel:  'No action required',
    ctaPath:   '',
    active:    false, // disabled by default — enable when ready to use
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
];

/**
 * Seeds the `email_templates` collection with default templates.
 * Safe to call multiple times — skips if templates already exist.
 */
export async function seedDefaultEmailTemplates(adminEmail: string): Promise<void> {
  const snap = await getDocs(collection(db, COL));
  if (!snap.empty) return; // already seeded

  const now = new Date().toISOString();
  await Promise.all(
    DEFAULT_TEMPLATES.map(t =>
      addDoc(collection(db, COL), { ...t, updatedAt: now, updatedBy: adminEmail })
    )
  );
}

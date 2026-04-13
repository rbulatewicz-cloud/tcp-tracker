/**
 * emailTriggerService.ts
 *
 * Phase 3 — Tier A automated email triggers.
 * Called once per session on app load (after data is ready).
 * Dedup is handled by emailService (24-hour window per recipient+event+relatedId).
 *
 * Triggers:
 *   • NV expiring          — 30 days and 7 days before variance expiry
 *   • PHE deadline         — 14, 7, and 3 days before plan needByDate (if PHE not yet submitted)
 *   • CR issue escalation  — issue open with no update for > ESCALATION_DAYS
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type {
  Plan, NoiseVariance, CRIssue,
  NotifyEvent, EmailDeliveryPrefs,
} from '../types';
import { getTemplateByEvent } from './emailTemplateService';
import { sendEmail } from './emailService';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Days before NV expiry at which we send email alerts */
const NV_THRESHOLDS = [30, 7];

/** Days before PHE needByDate at which we send email alerts */
const PHE_THRESHOLDS = [14, 7, 3];

/** Days since last update before a CR issue is escalated */
const ESCALATION_DAYS = 7;

// ── User prefs cache ──────────────────────────────────────────────────────────

export interface UserEmailPrefs {
  notifyOn: NotifyEvent[];
  emailDelivery: EmailDeliveryPrefs;
  notificationEmail: string;      // where to actually send the email
  displayName: string;
}

/**
 * Fetches email delivery preferences and notification addresses for all users.
 * Returns a map keyed by login email (lowercase).
 * Exported so Phase 4/5 trigger functions (emailTriggerActions.ts) can reuse it.
 */
export async function loadAllUserEmailPrefs(): Promise<Map<string, UserEmailPrefs>> {
  const [pubSnap, privSnap] = await Promise.all([
    getDocs(collection(db, 'users_public')),
    getDocs(collection(db, 'users_private')),
  ]);

  const privMap: Record<string, any> = {};
  privSnap.docs.forEach(d => { privMap[d.id] = d.data(); });

  const result = new Map<string, UserEmailPrefs>();
  pubSnap.docs.forEach(d => {
    const pub  = d.data();
    const priv = privMap[d.id] ?? {};
    const loginEmail = (pub.email || d.id).toLowerCase();
    result.set(loginEmail, {
      notifyOn:          priv.notifyOn          ?? [],
      emailDelivery:     priv.emailDelivery      ?? {},
      notificationEmail: pub.notificationEmail   || pub.email || loginEmail,
      displayName:       pub.displayName || pub.name || loginEmail,
    });
  });
  return result;
}

// ── Recipient filtering ───────────────────────────────────────────────────────

/**
 * Returns the list of recipients who should receive an email for a given event.
 * A recipient qualifies if:
 *   1. Their emailDelivery for this event is 'email' or 'both'
 *   2. Either their notifyOn is empty (default-all) OR includes this event
 *   3. They have a notificationEmail address
 * Exported so Phase 4/5 trigger functions (emailTriggerActions.ts) can reuse it.
 */
export function getEmailRecipients(
  candidateEmails: string[],
  event: NotifyEvent,
  userPrefs: Map<string, UserEmailPrefs>,
): Array<{ email: string; name: string }> {
  return candidateEmails.flatMap(loginEmail => {
    const prefs = userPrefs.get(loginEmail.toLowerCase());
    if (!prefs) return [];

    // Check delivery mode
    const delivery = prefs.emailDelivery[event] ?? 'in_app';
    if (delivery !== 'email' && delivery !== 'both') return [];

    // Check opted-in (empty notifyOn = not yet configured = default allow)
    if (prefs.notifyOn.length > 0 && !prefs.notifyOn.includes(event)) return [];

    return [{ email: prefs.notificationEmail, name: prefs.displayName }];
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function planLocation(plan: Plan): string {
  const parts = [plan.street1, plan.street2].filter(Boolean);
  return parts.join(' & ') || plan.scope || plan.loc;
}

function fmtIsoDate(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso.includes('T') ? fromIso : fromIso + 'T00:00:00');
  const b = new Date(toIso.includes('T') ? toIso : toIso + 'T00:00:00');
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── NV Expiry ─────────────────────────────────────────────────────────────────

/**
 * Sends email alerts for plans whose linked noise variance expires in 30 or 7 days.
 * Skips if already expired (daysLeft <= 0).
 * Respects per-user email delivery preferences.
 */
export async function triggerNVExpiryEmails(
  plans: Plan[],
  varianceMap: Map<string, NoiseVariance>,
  userPrefs: Map<string, UserEmailPrefs>,
): Promise<void> {
  const template = await getTemplateByEvent('nv_expiring');
  if (!template) return; // no active template — skip silently

  const todayStr = today();

  for (const plan of plans) {
    const nv = plan.compliance?.noiseVariance;
    if (!nv?.linkedVarianceId && !nv?.linkedVarianceIds?.length) continue;

    // Use first linked variance for expiry check
    const linkedId = nv.linkedVarianceIds?.[0] ?? nv.linkedVarianceId ?? '';
    const variance = linkedId ? varianceMap.get(linkedId) : undefined;
    if (!variance?.validThrough) continue;

    const daysLeft = daysBetween(todayStr, variance.validThrough);
    if (!NV_THRESHOLDS.includes(daysLeft)) continue;

    const subscribers = plan.subscribers ?? [];
    if (subscribers.length === 0) continue;

    const recipients = getEmailRecipients(subscribers, 'nv_expiring', userPrefs);
    if (recipients.length === 0) continue;

    const tokens = {
      loc:         plan.loc,
      location:    planLocation(plan),
      nv_number:   variance.permitNumber || linkedId,
      expiry_date: fmtIsoDate(variance.validThrough),
      planId:      plan.id,
    };

    await Promise.all(
      recipients.map(r =>
        sendEmail({
          to:           r.email,
          toName:       r.name,
          template,
          tokens,
          contextLine:  `${plan.loc} · ${planLocation(plan)}`,
          reason:       `you are subscribed to ${plan.loc}`,
          triggerEvent: 'nv_expiring',
          relatedId:    plan.id,
          sentBy:       'system',
        })
      )
    );
  }
}

// ── PHE Deadline ──────────────────────────────────────────────────────────────

/**
 * Sends email alerts when a plan's PHE is not yet submitted and the
 * needByDate is approaching (14 / 7 / 3 days out).
 */
export async function triggerPHEDeadlineEmails(
  plans: Plan[],
  userPrefs: Map<string, UserEmailPrefs>,
): Promise<void> {
  const template = await getTemplateByEvent('phe_deadline');
  if (!template) return;

  const todayStr = today();

  for (const plan of plans) {
    const phe = plan.compliance?.phe;
    if (!phe) continue;

    // Only alert if PHE is required but not yet submitted/approved
    const actionableStatuses = ['not_started', 'in_progress'];
    if (!actionableStatuses.includes(phe.status)) continue;

    // Need a needByDate to calculate deadline
    if (!plan.needByDate) continue;

    const daysUntil = daysBetween(todayStr, plan.needByDate);
    if (!PHE_THRESHOLDS.includes(daysUntil)) continue;

    const subscribers = plan.subscribers ?? [];
    if (subscribers.length === 0) continue;

    const recipients = getEmailRecipients(subscribers, 'phe_deadline', userPrefs);
    if (recipients.length === 0) continue;

    const tokens = {
      loc:         plan.loc,
      location:    planLocation(plan),
      due_date:    fmtIsoDate(plan.needByDate),
      days_until:  daysUntil.toString(),
      planId:      plan.id,
    };

    await Promise.all(
      recipients.map(r =>
        sendEmail({
          to:           r.email,
          toName:       r.name,
          template,
          tokens,
          contextLine:  `${plan.loc} · ${planLocation(plan)}`,
          reason:       `you are subscribed to ${plan.loc}`,
          triggerEvent: 'phe_deadline',
          relatedId:    plan.id,
          sentBy:       'system',
        })
      )
    );
  }
}

// ── CR Issue Escalation ───────────────────────────────────────────────────────

/**
 * Sends escalation emails for CR issues that have been open (or in-progress)
 * with no update for more than ESCALATION_DAYS.
 *
 * Recipients:
 *   1. The assigned user (if any) — uses cr_issue_escalation delivery pref
 *   2. Any other user who has cr_issue_escalation email delivery enabled
 */
export async function triggerCRIssueEscalationEmails(
  issues: CRIssue[],
  userPrefs: Map<string, UserEmailPrefs>,
): Promise<void> {
  const template = await getTemplateByEvent('cr_issue_escalation');
  if (!template) return;

  const todayStr = today();
  const activeStatuses: CRIssue['status'][] = ['open', 'in_progress'];

  for (const issue of issues) {
    if (!activeStatuses.includes(issue.status)) continue;

    // Check days since last activity (updatedAt, or createdAt if never updated)
    const lastActivity = issue.updatedAt || issue.createdAt;
    const daysSince = daysBetween(lastActivity.slice(0, 10), todayStr);
    if (daysSince < ESCALATION_DAYS) continue;

    // Build recipient list: assignedTo + any user with email delivery for this event
    const candidateEmails = new Set<string>();
    if (issue.assignedTo) candidateEmails.add(issue.assignedTo.toLowerCase());

    // Add any user who has email delivery for cr_issue_escalation explicitly set
    userPrefs.forEach((prefs, email) => {
      const delivery = prefs.emailDelivery['cr_issue_escalation'];
      if (delivery === 'email' || delivery === 'both') candidateEmails.add(email);
    });

    const recipients = getEmailRecipients(
      Array.from(candidateEmails),
      'cr_issue_escalation',
      userPrefs,
    );
    if (recipients.length === 0) continue;

    // Short display reference (last 6 chars of ID, uppercased)
    const issueRef = issue.id.slice(-6).toUpperCase();

    const tokens = {
      issue_ref:     issueRef,
      issue_title:   issue.title,
      reporter_name: issue.reportedByName,
      days_open:     daysSince.toString(),
      priority:      issue.priority,
    };

    await Promise.all(
      recipients.map(r =>
        sendEmail({
          to:           r.email,
          toName:       r.name,
          template,
          tokens,
          contextLine:  `Issue #${issueRef} · ${issue.priority} priority`,
          reason:       `you are assigned to or monitoring CR issues`,
          triggerEvent: 'cr_issue_escalation',
          relatedId:    issue.id,
          sentBy:       'system',
        })
      )
    );
  }
}

// ── Master trigger runner ─────────────────────────────────────────────────────

/**
 * Run all Tier A email triggers once per session.
 * Called from AppProvider after plans, variances, and users are loaded.
 * CR issues are fetched internally so AppProvider doesn't need to load them.
 */
export async function runTierAEmailTriggers(
  plans: Plan[],
  varianceMap: Map<string, NoiseVariance>,
): Promise<void> {
  try {
    // Load user prefs once for all triggers
    const userPrefs = await loadAllUserEmailPrefs();

    // Load CR issues for escalation check
    const crSnap = await getDocs(collection(db, 'cr_issues'));
    const issues = crSnap.docs.map(d => ({ id: d.id, ...d.data() } as CRIssue));

    // Run all three triggers in parallel
    await Promise.all([
      triggerNVExpiryEmails(plans, varianceMap, userPrefs),
      triggerPHEDeadlineEmails(plans, userPrefs),
      triggerCRIssueEscalationEmails(issues, userPrefs),
    ]);
  } catch (err) {
    // Non-fatal — log but don't break the app
    console.warn('[EmailTrigger] Tier A check failed:', err);
  }
}

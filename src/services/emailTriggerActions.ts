/**
 * emailTriggerActions.ts
 *
 * Phase 4 (Tier B) and Phase 5 (Tier C) email trigger functions.
 * Each function is called from the relevant action (service or provider) and
 * fires non-fatally — errors are caught and logged, never surfaced to the user.
 *
 * Phase 4 — Tier B: Team workflow triggers
 *   4A  status_change        — plan subscribers when a plan stage changes
 *   4B  plan_assigned        — newly assigned lead when plan.lead is changed
 *   4C  cr_issue_assigned    — newly assigned user when issue.assignedTo is set
 *   4D  cr_issue_updated     — creator + assignee when issue status changes
 *   4E  mention              — @-mentioned users in plan notes
 *
 * Phase 5 — Tier C: Constituent emails
 *   5A  constituent_ack      — reporter email on issue creation
 *   5B  constituent_resolved — reporter email when issue is resolved
 */

import { getTemplateByEvent } from './emailTemplateService';
import { sendEmail } from './emailService';
import type { Plan, CRIssue, NotifyEvent } from '../types';
import { loadAllUserEmailPrefs, getEmailRecipients } from './emailTriggerService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function planLocation(plan: Plan): string {
  const parts = [plan.street1, plan.street2].filter(Boolean);
  return parts.join(' & ') || plan.scope || plan.loc;
}

// ── 4A: Status Change ─────────────────────────────────────────────────────────

/**
 * Sends a status_change email to all plan subscribers (except the actor).
 * Called alongside writeNotificationsForPlanEvent in AppProvider.handleStageNotify.
 */
export async function sendStatusChangeEmail(
  plan: Plan,
  oldStage: string,
  newStage: string,
  actorEmail: string,
): Promise<void> {
  try {
    const template = await getTemplateByEvent('status_change');
    if (!template) return;

    const subscribers = (plan.subscribers ?? []).filter(
      e => e.toLowerCase() !== actorEmail.toLowerCase(),
    );
    if (subscribers.length === 0) return;

    const userPrefs = await loadAllUserEmailPrefs();
    const recipients = getEmailRecipients(subscribers, 'status_change', userPrefs);
    if (recipients.length === 0) return;

    const tokens: Record<string, string> = {
      loc:       plan.loc,
      location:  planLocation(plan),
      old_stage: oldStage,
      new_stage: newStage,
      planId:    plan.id,
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
          triggerEvent: 'status_change',
          relatedId:    plan.id,
          sentBy:       actorEmail,
          skipDedup:    false,
        }).catch(console.warn),
      ),
    );
  } catch (err) {
    console.warn('[EmailTrigger] status_change email failed:', err);
  }
}

// ── 4B: Plan Assigned ─────────────────────────────────────────────────────────

/**
 * Sends a plan_assigned email to the newly assigned lead.
 * The lead field on a plan is a display name (e.g. "Justin"), not an email, so
 * we match against displayName in the user prefs map.
 * The actor (assigner) does NOT receive the email.
 */
export async function sendPlanAssignedEmail(
  plan: Plan,
  newLeadName: string,
  actorEmail: string,
): Promise<void> {
  try {
    const template = await getTemplateByEvent('plan_assigned');
    if (!template) return;

    const userPrefs = await loadAllUserEmailPrefs();

    // Find the user whose displayName matches the new lead name (case-insensitive)
    let recipientEmail: string | null = null;
    let recipientName: string | null = null;
    userPrefs.forEach((prefs, loginEmail) => {
      if (
        prefs.displayName.toLowerCase() === newLeadName.toLowerCase() &&
        loginEmail.toLowerCase() !== actorEmail.toLowerCase()
      ) {
        recipientEmail = prefs.notificationEmail;
        recipientName  = prefs.displayName;
      }
    });

    if (!recipientEmail) return; // No matching user found

    // Check delivery prefs for this user
    const event: NotifyEvent = 'plan_assigned';
    const matched = getEmailRecipients([
      [...userPrefs.entries()].find(([, p]) => p.notificationEmail === recipientEmail)?.[0] ?? '',
    ], event, userPrefs);
    if (matched.length === 0) return;

    // Look up actor display name
    const actorPrefs = userPrefs.get(actorEmail.toLowerCase());
    const assignedBy = actorPrefs?.displayName || actorEmail;

    const tokens: Record<string, string> = {
      loc:         plan.loc,
      location:    planLocation(plan),
      assigned_by: assignedBy,
      stage:       plan.stage,
      planId:      plan.id,
    };

    await sendEmail({
      to:           recipientEmail,
      toName:       recipientName ?? undefined,
      template,
      tokens,
      contextLine:  `${plan.loc} · ${planLocation(plan)}`,
      reason:       `you have been assigned as lead on ${plan.loc}`,
      triggerEvent: 'plan_assigned',
      relatedId:    plan.id,
      sentBy:       actorEmail,
      skipDedup:    false,
    }).catch(console.warn);
  } catch (err) {
    console.warn('[EmailTrigger] plan_assigned email failed:', err);
  }
}

// ── 4C: CR Issue Assigned ─────────────────────────────────────────────────────

/**
 * Sends a cr_issue_assigned email to the newly assigned user.
 * The actor (assigner) does NOT receive the email.
 */
export async function sendCRIssueAssignedEmail(
  issue: CRIssue,
  assignedByEmail: string,
): Promise<void> {
  try {
    if (!issue.assignedTo) return;

    const template = await getTemplateByEvent('cr_issue_assigned');
    if (!template) return;

    const userPrefs = await loadAllUserEmailPrefs();
    const recipients = getEmailRecipients(
      [issue.assignedTo],
      'cr_issue_assigned',
      userPrefs,
    );
    if (recipients.length === 0) return;

    const actorPrefs  = userPrefs.get(assignedByEmail.toLowerCase());
    const assignedBy  = actorPrefs?.displayName || assignedByEmail;
    const issueRef    = issue.id.slice(-6).toUpperCase();

    const tokens: Record<string, string> = {
      issue_ref:     issueRef,
      issue_title:   issue.title,
      assigned_by:   assignedBy,
      reporter_name: issue.reportedByName,
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
          reason:       `you have been assigned to this CR issue`,
          triggerEvent: 'cr_issue_assigned',
          relatedId:    issue.id,
          sentBy:       assignedByEmail,
          skipDedup:    false,
        }).catch(console.warn),
      ),
    );
  } catch (err) {
    console.warn('[EmailTrigger] cr_issue_assigned email failed:', err);
  }
}

// ── 4D: CR Issue Updated ──────────────────────────────────────────────────────

/**
 * Sends a cr_issue_updated email to issue.createdBy and issue.assignedTo.
 * Skips self-sends (updater does not receive their own action email).
 */
export async function sendCRIssueUpdatedEmail(
  issue: CRIssue,
  newStatus: string,
  updatedByEmail: string,
): Promise<void> {
  try {
    const template = await getTemplateByEvent('cr_issue_updated');
    if (!template) return;

    // Build unique candidate set: creator + assignee, minus the updater
    const candidates = new Set<string>();
    if (issue.createdBy) candidates.add(issue.createdBy.toLowerCase());
    if (issue.assignedTo) candidates.add(issue.assignedTo.toLowerCase());
    candidates.delete(updatedByEmail.toLowerCase());

    if (candidates.size === 0) return;

    const userPrefs  = await loadAllUserEmailPrefs();
    const recipients = getEmailRecipients(
      Array.from(candidates),
      'cr_issue_updated',
      userPrefs,
    );
    if (recipients.length === 0) return;

    const actorPrefs  = userPrefs.get(updatedByEmail.toLowerCase());
    const updatedBy   = actorPrefs?.displayName || updatedByEmail;
    const issueRef    = issue.id.slice(-6).toUpperCase();

    const tokens: Record<string, string> = {
      issue_ref:   issueRef,
      issue_title: issue.title,
      new_status:  newStatus,
      updated_by:  updatedBy,
    };

    await Promise.all(
      recipients.map(r =>
        sendEmail({
          to:           r.email,
          toName:       r.name,
          template,
          tokens,
          contextLine:  `Issue #${issueRef}`,
          reason:       `you are the creator or assignee of this CR issue`,
          triggerEvent: 'cr_issue_updated',
          relatedId:    issue.id,
          sentBy:       updatedByEmail,
          skipDedup:    false,
        }).catch(console.warn),
      ),
    );
  } catch (err) {
    console.warn('[EmailTrigger] cr_issue_updated email failed:', err);
  }
}

// ── 4E: @Mention in note ─────────────────────────────────────────────────────

/**
 * Parses @mentions from a note body and sends a mention email to each
 * mentioned user (matched by displayName or email prefix).
 * The actor (author) does NOT receive the email.
 */
export async function sendMentionEmails(
  plan: Plan,
  noteText: string,
  actorEmail: string,
): Promise<void> {
  try {
    // Extract @word tokens from the note
    const mentionTokens = (noteText.match(/@([\w.+-]+)/g) ?? []).map(m => m.slice(1).toLowerCase());
    if (mentionTokens.length === 0) return;

    const template = await getTemplateByEvent('mention');
    if (!template) return;

    const userPrefs  = await loadAllUserEmailPrefs();
    const actorPrefs = userPrefs.get(actorEmail.toLowerCase());
    const mentionedBy = actorPrefs?.displayName || actorEmail;

    // Build excerpt (first 120 chars)
    const noteExcerpt = noteText.slice(0, 120) + (noteText.length > 120 ? '…' : '');

    // Resolve mentioned users: match displayName prefix or email prefix
    const mentionedEmails = new Set<string>();
    userPrefs.forEach((prefs, loginEmail) => {
      if (loginEmail.toLowerCase() === actorEmail.toLowerCase()) return;
      const nameLower = prefs.displayName.toLowerCase();
      if (mentionTokens.some(t => nameLower.startsWith(t) || loginEmail.startsWith(t))) {
        mentionedEmails.add(loginEmail);
      }
    });

    if (mentionedEmails.size === 0) return;

    const recipients = getEmailRecipients(
      Array.from(mentionedEmails),
      'mention',
      userPrefs,
    );
    if (recipients.length === 0) return;

    const tokens: Record<string, string> = {
      loc:          plan.loc,
      location:     planLocation(plan),
      mentioned_by: mentionedBy,
      note_excerpt: noteExcerpt,
      planId:       plan.id,
    };

    await Promise.all(
      recipients.map(r =>
        sendEmail({
          to:           r.email,
          toName:       r.name,
          template,
          tokens,
          contextLine:  `${plan.loc} · ${planLocation(plan)}`,
          reason:       `you were mentioned in a note`,
          triggerEvent: 'mention',
          relatedId:    plan.id,
          sentBy:       actorEmail,
          skipDedup:    false,
        }).catch(console.warn),
      ),
    );
  } catch (err) {
    console.warn('[EmailTrigger] mention email failed:', err);
  }
}

// ── 5A: Constituent Acknowledgment ───────────────────────────────────────────

/**
 * Sends a constituent acknowledgment email to issue.reportedByEmail.
 * Uses the Tier C template (neutral bar, external constituent).
 * Safe to call unconditionally — skips silently if no reporter email.
 */
export async function sendConstituentAckEmail(issue: CRIssue): Promise<void> {
  try {
    if (!issue.reportedByEmail) return;

    const template = await getTemplateByEvent('constituent_ack');
    if (!template) return;

    const issueRef = issue.id.slice(-6).toUpperCase();

    const tokens: Record<string, string> = {
      issue_ref:        issueRef,
      property_address: issue.propertyAddress || 'your property',
    };

    await sendEmail({
      to:           issue.reportedByEmail,
      toName:       issue.reportedByName || undefined,
      template,
      tokens,
      contextLine:  `Reference #${issueRef}`,
      reason:       `you submitted a concern to our community relations team`,
      triggerEvent: 'constituent_ack',
      relatedId:    issue.id,
      sentBy:       'system',
      skipDedup:    false,
    }).catch(console.warn);
  } catch (err) {
    console.warn('[EmailTrigger] constituent_ack email failed:', err);
  }
}

// ── 5B: Constituent Resolved ──────────────────────────────────────────────────

/**
 * Sends a constituent resolved email to issue.reportedByEmail when the
 * issue status changes TO 'resolved'.
 * Looks for an active template with tier='C' and event='cr_issue_updated'.
 * Uses a dedicated event key 'constituent_resolved' if available, otherwise
 * falls back to the Tier C cr_issue_updated template.
 */
export async function sendConstituentResolvedEmail(issue: CRIssue): Promise<void> {
  try {
    if (!issue.reportedByEmail) return;

    // Try constituent_resolved first, then fall back to tier C cr_issue_updated
    let template = await getTemplateByEvent('constituent_resolved');
    if (!template) {
      // Fall back: look for active Tier C template with event cr_issue_updated
      // The emailTemplateService getTemplateByEvent returns the first active match —
      // but Tier C templates for cr_issue_updated are inactive by default, so we
      // use a direct collection scan here to find the Tier C variant even if inactive.
      // However, following the spec: only send if an active template exists.
      // Since the default 'Constituent Issue Resolved' template has active:false,
      // this function is a no-op by default until an admin enables it.
      template = await getTemplateByEvent('cr_issue_updated');
      // If the only cr_issue_updated template is Tier B, skip constituent send
      if (!template || template.tier !== 'C') return;
    }

    const issueRef = issue.id.slice(-6).toUpperCase();

    const tokens: Record<string, string> = {
      issue_ref:        issueRef,
      property_address: issue.propertyAddress || 'your property',
    };

    await sendEmail({
      to:           issue.reportedByEmail,
      toName:       issue.reportedByName || undefined,
      template,
      tokens,
      contextLine:  `Reference #${issueRef}`,
      reason:       `you submitted a concern to our community relations team`,
      triggerEvent: 'constituent_resolved',
      relatedId:    issue.id,
      sentBy:       'system',
      skipDedup:    false,
    }).catch(console.warn);
  } catch (err) {
    console.warn('[EmailTrigger] constituent_resolved email failed:', err);
  }
}

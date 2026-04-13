/**
 * emailService.ts
 *
 * Core email sending infrastructure for TCP Tracker.
 * Sends emails by writing to the `mail` Firestore collection, which the
 * "Trigger Email from Firestore" Firebase extension picks up and delivers
 * via SendGrid.
 *
 * Also writes every send to `mail_log` for the admin audit trail.
 */

import {
  collection, addDoc, query, where, getDocs,
  Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { EmailTemplate, MailLogEntry, EmailBarColor } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────────

const APP_URL = 'https://gen-lang-client-0122413243.web.app';
const MAIL_COL = 'mail';
const LOG_COL  = 'mail_log';

/** How long (ms) to suppress duplicate alerts for the same recipient + event + item */
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Bar colours (inline CSS for email clients) ─────────────────────────────────

const BAR_COLORS: Record<EmailBarColor, string> = {
  red:     '#ef4444',
  amber:   '#f59e0b',
  blue:    '#3b82f6',
  green:   '#10b981',
  neutral: '#e2e8f0',
};

// ── Token resolution ──────────────────────────────────────────────────────────

/** Replace {{token}} placeholders in a string with values from the tokens map */
export function resolveTokens(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => tokens[key] ?? `{{${key}}}`);
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildEmailHtml(params: {
  subject: string;
  contextLine?: string;
  body: string;
  barColor: EmailBarColor;
  ctaLabel: string;
  ctaUrl: string;
  reason: string;
  prefsUrl: string;
}): string {
  const bar = BAR_COLORS[params.barColor];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${params.subject}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:560px;width:100%;">

        <!-- Accent bar -->
        <tr><td style="height:4px;background:${bar};line-height:4px;font-size:4px;">&nbsp;</td></tr>

        <!-- App label -->
        <tr><td style="padding:24px 32px 0 32px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">TCP Tracker</p>
        </td></tr>

        <!-- Title -->
        <tr><td style="padding:10px 32px 0 32px;">
          <h1 style="margin:0;font-size:19px;font-weight:700;color:#0f172a;line-height:1.3;">${params.subject}</h1>
        </td></tr>

        ${params.contextLine ? `
        <!-- Context -->
        <tr><td style="padding:6px 32px 0 32px;">
          <p style="margin:0;font-size:12px;color:#64748b;font-weight:500;">${params.contextLine}</p>
        </td></tr>` : ''}

        <!-- Body -->
        <tr><td style="padding:14px 32px 0 32px;">
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.65;">${params.body}</p>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:24px 32px 28px 32px;">
          <a href="${params.ctaUrl}"
            style="display:inline-block;padding:11px 24px;background:#0f172a;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">
            ${params.ctaLabel}
          </a>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px;">
          <div style="height:1px;background:#f1f5f9;"></div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px 32px;">
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
            You're receiving this because ${params.reason}.<br>
            <a href="${params.prefsUrl}" style="color:#94a3b8;text-decoration:underline;">Manage notification preferences</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Build plain-text fallback for email clients that don't render HTML */
function buildEmailText(subject: string, body: string, ctaUrl: string): string {
  return `${subject}\n\n${body}\n\n${ctaUrl}`;
}

// ── Dedup check ───────────────────────────────────────────────────────────────

/**
 * Returns true if an email with the same recipient + event + relatedId was
 * already sent within the dedup window (default 24 hours).
 */
async function isDuplicate(
  to: string,
  triggerEvent: string,
  relatedId: string | undefined,
): Promise<boolean> {
  if (!triggerEvent) return false;
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const q = query(
    collection(db, LOG_COL),
    where('to', '==', to),
    where('triggerEvent', '==', triggerEvent),
    ...(relatedId ? [where('relatedId', '==', relatedId)] : []),
    where('sentAt', '>=', cutoff),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

// ── Send params ───────────────────────────────────────────────────────────────

export interface SendEmailParams {
  /** Recipient email address */
  to: string;
  /** Recipient display name (for log only) */
  toName?: string;
  /** Resolved EmailTemplate object */
  template: EmailTemplate;
  /** Token values — e.g. { loc: 'LOC-042', days_until: '7' } */
  tokens: Record<string, string>;
  /** Optional second context line below the title (plan ref, issue ref) */
  contextLine?: string;
  /** Reason shown in footer — e.g. "you are assigned to LOC-042" */
  reason?: string;
  /** Which event triggered this send (used for dedup + audit) */
  triggerEvent?: string;
  /** ID of the related document (planId, issueId) — used for dedup */
  relatedId?: string;
  /** Who/what triggered the send — user email or 'system' */
  sentBy?: string;
  /** Skip dedup check (e.g. for manual test sends) */
  skipDedup?: boolean;
}

// ── Main send function ────────────────────────────────────────────────────────

/**
 * Send a single email via the Firebase "Trigger Email from Firestore" extension.
 * Writes to `mail` (picked up by extension) and `mail_log` (our audit trail).
 * Returns the mail_log document ID, or null if skipped by dedup.
 */
export async function sendEmail(params: SendEmailParams): Promise<string | null> {
  const {
    to, toName, template, tokens, contextLine,
    triggerEvent, relatedId, sentBy = 'system', skipDedup = false,
  } = params;

  // ── Dedup check ─────────────────────────────────────────────────────────
  if (!skipDedup && triggerEvent) {
    const dup = await isDuplicate(to, triggerEvent, relatedId);
    if (dup) return null; // silently skip
  }

  // ── Resolve tokens ───────────────────────────────────────────────────────
  const resolvedSubject = resolveTokens(template.subject, tokens);
  const resolvedBody    = resolveTokens(template.body, tokens);
  const resolvedPath    = resolveTokens(template.ctaPath, tokens);
  const ctaUrl          = resolvedPath.startsWith('http')
    ? resolvedPath
    : `${APP_URL}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`;
  const prefsUrl        = `${APP_URL}/?settings=notifications`;
  const reason          = params.reason ?? `you have email notifications enabled for this event`;

  // ── Build HTML ───────────────────────────────────────────────────────────
  const html = buildEmailHtml({
    subject: resolvedSubject,
    contextLine,
    body: resolvedBody,
    barColor: template.barColor,
    ctaLabel: resolveTokens(template.ctaLabel, tokens),
    ctaUrl,
    reason,
    prefsUrl,
  });

  const text = buildEmailText(resolvedSubject, resolvedBody, ctaUrl);

  // ── Write to `mail` collection (extension sends it) ──────────────────────
  await addDoc(collection(db, MAIL_COL), {
    to,
    message: {
      subject: resolvedSubject,
      html,
      text,
    },
    createdAt: serverTimestamp(),
  });

  // ── Write to `mail_log` (our audit trail) ────────────────────────────────
  const logEntry: Omit<MailLogEntry, 'id'> = {
    to,
    toName,
    subject: resolvedSubject,
    templateId: template.id,
    templateName: template.name,
    tokens,
    sentAt: new Date().toISOString(),
    status: 'sent',
    triggerEvent,
    relatedId,
    sentBy,
  };

  const logDoc = await addDoc(collection(db, LOG_COL), {
    ...logEntry,
    _ts: serverTimestamp(),
  });

  return logDoc.id;
}

// ── Batch send ────────────────────────────────────────────────────────────────

/**
 * Send the same email to multiple recipients.
 * Each recipient is checked for dedup independently.
 * Returns array of mail_log IDs (null entries = skipped by dedup).
 */
export async function sendEmailToMany(
  recipients: Array<{ to: string; toName?: string; tokens: Record<string, string>; reason?: string }>,
  template: EmailTemplate,
  shared: Omit<SendEmailParams, 'to' | 'toName' | 'tokens' | 'reason' | 'template'>,
): Promise<(string | null)[]> {
  return Promise.all(
    recipients.map(r =>
      sendEmail({ ...shared, template, to: r.to, toName: r.toName, tokens: r.tokens, reason: r.reason })
    )
  );
}

// ── Audit log helpers ─────────────────────────────────────────────────────────

export { LOG_COL as MAIL_LOG_COLLECTION };
export { MAIL_COL as MAIL_COLLECTION };
export { Timestamp as FirestoreTimestamp };

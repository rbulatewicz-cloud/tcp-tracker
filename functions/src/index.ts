/**
 * TCP Tracker — Firebase Cloud Functions
 *
 * Scheduled daily compliance-reminder function.
 * Runs every morning at 8:00 AM Pacific Time.
 *
 * Checks:
 *  1. CD overdue  — any CD waiting >21 days since sentDate (re-alerts every 3 days)
 *  2. CD warning  — any CD waiting 10–21 days since sentDate (re-alerts every 7 days)
 *  3. PHE deadline — active PHE track with needByDate within 14 days and not yet approved
 *  4. Missing CD slide — plan has CD applicable with status != 'pending'/'na' but no slide uploaded (>48h after needByDate creation)
 *
 * Recipients: all users with role 'ADMIN' or 'MOT' (stored in users_private collection).
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ── Init ─────────────────────────────────────────────────────────────────────

initializeApp();

const DATABASE_ID = 'ai-studio-9153c9e2-8066-4a49-996e-75268af5f0e2';
const db = getFirestore(DATABASE_ID);

// ── Types (mirrors src/types.ts — kept minimal for bundle size) ───────────────

type CDStatus =
  | 'pending'
  | 'presentation_sent'
  | 'meeting_scheduled'
  | 'follow_up_sent'
  | 'concurred'
  | 'declined'
  | 'na';

type ComplianceStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'expired';

interface CDEntry {
  cd: 'CD2' | 'CD6' | 'CD7';
  applicable: boolean;
  status: CDStatus;
  sentDate?: string;
  meetingDate?: string;
  followUpDate?: string;
  concurrenceLetter?: { url: string; name: string; uploadedAt?: string };
  notes?: string;
}

interface CDConcurrenceTrack {
  status: ComplianceStatus;
  triggeredBy: string[];
  presentationAttachment?: { url: string; name: string };
  cds: CDEntry[];
  notes?: string;
}

interface PHETrack {
  status: ComplianceStatus;
  triggeredBy: string[];
  approvalDate?: string;
}

interface PlanCompliance {
  cdConcurrence?: CDConcurrenceTrack;
  phe?: PHETrack;
}

interface Plan {
  id: string;
  loc: string;
  street1: string;
  street2: string;
  needByDate: string;
  status?: string;
  compliance?: PlanCompliance;
  createdAt?: string;
}

type NotifyEvent =
  | 'status_change'
  | 'comment'
  | 'doc_uploaded'
  | 'window_expiring'
  | 'dot_comments'
  | 'plan_approved'
  | 'plan_expired'
  | 'nv_expiring'
  | 'feedback_updated'
  | 'feedback_comment'
  | 'cd_overdue'
  | 'cd_warning'
  | 'phe_deadline'
  | 'missing_slide';

interface AppNotification {
  userId: string;
  type: NotifyEvent;
  planId?: string;
  planLoc?: string;
  location?: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.floor(ms / 86_400_000);
}

function daysUntil(isoDate: string): number {
  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function planLocation(plan: Plan): string {
  return [plan.street1, plan.street2].filter(Boolean).join(' & ');
}

/** Write a single in-app notification document */
async function writeNotification(notif: AppNotification): Promise<void> {
  await db.collection('notifications').add({
    ...notif,
    createdAt: new Date().toISOString(),
    read: false,
  });
}

/**
 * Check deduplication state. Returns true if the alert should fire.
 * @param alertKey  e.g. "LOC-366_cd_CD6_overdue"
 * @param cooldownDays  minimum days between re-alerts
 */
async function shouldAlert(alertKey: string, cooldownDays: number): Promise<boolean> {
  const ref = db.collection('compliance_alert_state').doc(alertKey);
  const snap = await ref.get();
  if (!snap.exists) return true;
  const data = snap.data() as { lastSent: Timestamp };
  const lastSentMs = data.lastSent?.toMillis?.() ?? 0;
  const daysSinceLast = Math.floor((Date.now() - lastSentMs) / 86_400_000);
  return daysSinceLast >= cooldownDays;
}

/** Mark an alert as sent now */
async function markAlertSent(alertKey: string): Promise<void> {
  await db.collection('compliance_alert_state').doc(alertKey).set(
    { lastSent: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

// ── Main scheduled function ───────────────────────────────────────────────────

export const dailyComplianceAlerts = onSchedule(
  {
    schedule: '0 8 * * *',      // 8:00 AM every day
    timeZone: 'America/Los_Angeles',
    region: 'us-central1',
    memory: '256MiB',
  },
  async () => {
    // 1. Load recipient users (ADMIN + MOT roles)
    const usersSnap = await db.collection('users_private').get();
    const recipientEmails: string[] = [];
    usersSnap.forEach(doc => {
      const data = doc.data() as { role?: string };
      if (data.role === 'ADMIN' || data.role === 'MOT') {
        recipientEmails.push(doc.id); // doc ID = email
      }
    });

    if (recipientEmails.length === 0) {
      console.log('No ADMIN/MOT users found — nothing to notify.');
      return;
    }

    // 2. Load active plans (skip archived/expired)
    const plansSnap = await db.collection('plans').get();
    const plans: Plan[] = [];
    plansSnap.forEach(doc => {
      const data = doc.data() as Plan;
      // Skip fully expired/completed plans
      if (data.status === 'expired' || data.status === 'archived') return;
      plans.push({ ...data, id: doc.id });
    });

    console.log(`Checking ${plans.length} active plans for ${recipientEmails.length} recipients`);

    const writes: Promise<void>[] = [];

    for (const plan of plans) {
      const cd = plan.compliance?.cdConcurrence;
      const phe = plan.compliance?.phe;
      const loc = plan.loc || plan.id;
      const location = planLocation(plan);

      // ── CD overdue / warning ──────────────────────────────────────────────
      if (cd && Array.isArray(cd.cds)) {
        for (const entry of cd.cds) {
          if (!entry.applicable) continue;
          if (entry.status === 'concurred' || entry.status === 'declined' || entry.status === 'na') continue;
          if (!entry.sentDate) continue;

          const age = daysSince(entry.sentDate);

          if (age > 21) {
            // OVERDUE — re-alert every 3 days
            const alertKey = `${plan.id}_cd_${entry.cd}_overdue`;
            const fire = await shouldAlert(alertKey, 3);
            if (fire) {
              for (const email of recipientEmails) {
                writes.push(writeNotification({
                  userId: email,
                  type: 'cd_overdue',
                  planId: plan.id,
                  planLoc: loc,
                  location,
                  title: `${entry.cd} Overdue — ${loc}`,
                  body: `${entry.cd} concurrence has been waiting ${age} days (sent ${entry.sentDate}). No response received.`,
                  read: false,
                  createdAt: new Date().toISOString(),
                }));
              }
              writes.push(markAlertSent(alertKey));
              console.log(`CD overdue alert: ${alertKey} (${age}d)`);
            }
          } else if (age >= 10) {
            // WARNING — re-alert every 7 days
            const alertKey = `${plan.id}_cd_${entry.cd}_warning`;
            const fire = await shouldAlert(alertKey, 7);
            if (fire) {
              for (const email of recipientEmails) {
                writes.push(writeNotification({
                  userId: email,
                  type: 'cd_warning',
                  planId: plan.id,
                  planLoc: loc,
                  location,
                  title: `${entry.cd} Awaiting Response — ${loc}`,
                  body: `${entry.cd} concurrence sent ${age} days ago with no response. Follow up recommended.`,
                  read: false,
                  createdAt: new Date().toISOString(),
                }));
              }
              writes.push(markAlertSent(alertKey));
              console.log(`CD warning alert: ${alertKey} (${age}d)`);
            }
          }
        }

        // ── Missing CD slide ────────────────────────────────────────────────
        // Plan has active CD track but no presentation slide uploaded,
        // and the plan was created >48 hours ago
        const hasActiveCDs = cd.cds.some(
          e => e.applicable && e.status !== 'na' && e.status !== 'pending'
        );
        const hasSlide = !!cd.presentationAttachment?.url;
        const planAge = plan.createdAt ? daysSince(plan.createdAt) : 0;

        if (hasActiveCDs && !hasSlide && planAge >= 2) {
          const alertKey = `${plan.id}_cd_missing_slide`;
          const fire = await shouldAlert(alertKey, 7); // remind weekly
          if (fire) {
            for (const email of recipientEmails) {
              writes.push(writeNotification({
                userId: email,
                type: 'missing_slide',
                planId: plan.id,
                planLoc: loc,
                location,
                title: `CD Slide Missing — ${loc}`,
                body: `Plan ${loc} has active CD concurrence items but no presentation slide has been uploaded.`,
                read: false,
                createdAt: new Date().toISOString(),
              }));
            }
            writes.push(markAlertSent(alertKey));
            console.log(`Missing slide alert: ${alertKey}`);
          }
        }
      }

      // ── PHE deadline approaching ──────────────────────────────────────────
      if (
        phe &&
        phe.status !== 'approved' &&
        phe.status !== 'expired' &&
        plan.needByDate
      ) {
        const daysLeft = daysUntil(plan.needByDate);
        if (daysLeft >= 0 && daysLeft <= 14) {
          const alertKey = `${plan.id}_phe_deadline`;
          const fire = await shouldAlert(alertKey, 3); // re-alert every 3 days in final stretch
          if (fire) {
            for (const email of recipientEmails) {
              writes.push(writeNotification({
                userId: email,
                type: 'phe_deadline',
                planId: plan.id,
                planLoc: loc,
                location,
                title: `PHE Deadline in ${daysLeft}d — ${loc}`,
                body: `Plan ${loc} needs PHE approval by ${plan.needByDate}. Current status: ${phe.status}.`,
                read: false,
                createdAt: new Date().toISOString(),
              }));
            }
            writes.push(markAlertSent(alertKey));
            console.log(`PHE deadline alert: ${alertKey} (${daysLeft}d left)`);
          }
        }
      }
    }

    // 3. Flush all writes
    await Promise.all(writes);
    console.log(`Compliance alert run complete. ${writes.length} operations queued.`);
  }
);

// ── Custom claims sync ────────────────────────────────────────────────────────
//
// Whenever a `users_private/{email}` doc is written, mirror the `role` field
// into the Firebase Auth user's custom claims. Firestore rules can then gate
// writes on `request.auth.token.role` — which the client cannot spoof, unlike
// a role read from a doc the client also writes.
//
// Bootstrap admin: `r.bulatewicz@gmail.com` is always granted ADMIN, even if
// its `users_private` doc hasn't been created yet or says otherwise. This
// mirrors the client-side override in `src/hooks/useAuth.ts` so the two agree.

const BOOTSTRAP_ADMIN_EMAIL = 'r.bulatewicz@gmail.com';
const VALID_ROLES = ['GUEST', 'SFTC', 'MOT', 'CR', 'DOT', 'METRO', 'ADMIN'] as const;
type Role = typeof VALID_ROLES[number];

function normalizeRole(raw: unknown, email: string): Role {
  if (email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL) return 'ADMIN';
  const s = typeof raw === 'string' ? raw.toUpperCase() : '';
  return (VALID_ROLES as readonly string[]).includes(s) ? (s as Role) : 'GUEST';
}

/** Apply claims for one user. Looks up the Auth user by email, sets { role }, bumps claimsUpdatedAt. */
async function applyClaimsForEmail(email: string, role: Role): Promise<void> {
  const auth = getAuth();
  let uid: string;
  try {
    const rec = await auth.getUserByEmail(email);
    uid = rec.uid;
  } catch (e) {
    // User hasn't signed in yet — no Auth record to attach claims to.
    // Claims will be set next time their users_private doc is written after login.
    console.log(`[claims] no Auth user for ${email} yet; skipping`);
    return;
  }
  await auth.setCustomUserClaims(uid, { role });
  // Bump a server timestamp so the client can detect "claims changed" and force token refresh.
  await db.collection('users_private').doc(email).set(
    { claimsUpdatedAt: FieldValue.serverTimestamp(), claimsRole: role },
    { merge: true }
  );
  console.log(`[claims] ${email} → ${role}`);
}

/**
 * Trigger: syncs role claim when a `users_private/{email}` doc is written.
 * Deletes clear claims; creates/updates set them.
 */
export const syncUserClaims = onDocumentWritten(
  {
    document: 'users_private/{email}',
    database: DATABASE_ID,
    region: 'us-central1',
  },
  async (event) => {
    const email = event.params.email;
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();

    // Delete case — clear claims on the Auth user (if any).
    if (!after) {
      try {
        const rec = await getAuth().getUserByEmail(email);
        await getAuth().setCustomUserClaims(rec.uid, null);
        console.log(`[claims] cleared for ${email} (doc deleted)`);
      } catch {
        // No auth user — nothing to do.
      }
      return;
    }

    const nextRole = normalizeRole(after.role, email);
    const prevRole = before ? normalizeRole(before.role, email) : null;

    // Skip if role unchanged AND we aren't creating initial claims.
    // (Detect "initial claims" via missing claimsUpdatedAt — this also guards against
    // infinite loops, since this trigger writes claimsUpdatedAt itself on the same doc.)
    if (prevRole === nextRole && after.claimsUpdatedAt) return;

    await applyClaimsForEmail(email, nextRole);
  }
);

/**
 * Callable: admin-only one-shot backfill. Iterates every users_private doc
 * and re-applies custom claims. Run this once before deploying the new rules
 * so every existing user has a valid `role` claim on their next token refresh.
 *
 * Also ensures the bootstrap admin email is claimed even if no doc exists yet.
 *
 * Invoke from the app (dev console) or a quick Node script:
 *   const fn = httpsCallable(functions, 'backfillAllClaims');
 *   await fn();
 */
export const backfillAllClaims = onCall(
  { region: 'us-central1' },
  async (request) => {
    const caller = request.auth;
    if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');

    // Allow the caller if they're already ADMIN via claim, OR if they're the
    // bootstrap admin (needed for the very first run, before any claims exist).
    const callerEmail = (caller.token.email || '').toLowerCase();
    const isCallerAdmin =
      caller.token.role === 'ADMIN' || callerEmail === BOOTSTRAP_ADMIN_EMAIL;
    if (!isCallerAdmin) {
      throw new HttpsError('permission-denied', 'Admin only.');
    }

    const snap = await db.collection('users_private').get();
    let count = 0;
    for (const d of snap.docs) {
      const role = normalizeRole(d.data().role, d.id);
      await applyClaimsForEmail(d.id, role);
      count++;
    }

    // Guarantee bootstrap admin has a doc + claim even if missing.
    const bootstrapSnap = await db.collection('users_private').doc(BOOTSTRAP_ADMIN_EMAIL).get();
    if (!bootstrapSnap.exists) {
      await db.collection('users_private').doc(BOOTSTRAP_ADMIN_EMAIL).set(
        { role: 'ADMIN', uid: '', createdBy: 'backfillAllClaims' },
        { merge: true }
      );
      await applyClaimsForEmail(BOOTSTRAP_ADMIN_EMAIL, 'ADMIN');
      count++;
    }

    console.log(`[backfill] processed ${count} users`);
    return { processed: count };
  }
);

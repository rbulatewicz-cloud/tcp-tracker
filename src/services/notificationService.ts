import {
  collection, doc, addDoc, updateDoc, writeBatch,
  query, where, getDocs,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { AppNotification, NotifyEvent, Plan, User } from '../types';

const COL = 'notifications';

// ── Helpers ──────────────────────────────────────────────────────────────────

function planLabel(plan: Plan): string {
  const parts = [plan.street1, plan.street2].filter(Boolean);
  return parts.join(' & ') || plan.scope || plan.loc;
}

function buildNotification(
  userId: string,
  type: NotifyEvent,
  plan: Plan,
  title: string,
  body: string,
): Omit<AppNotification, 'id'> {
  return {
    userId,
    type,
    planId: plan.id,
    planLoc: plan.loc,
    location: planLabel(plan),
    title,
    body,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

// ── Subscribe helpers ─────────────────────────────────────────────────────────

/** Add a subscriber email to a plan (idempotent). */
export async function addPlanSubscriber(planId: string, email: string): Promise<void> {
  try {
    const ref = doc(db, 'plans', planId);
    // Use arrayUnion-style update — import arrayUnion from firestore
    const { updateDoc: upd, arrayUnion } = await import('firebase/firestore');
    await upd(ref, { subscribers: arrayUnion(email) });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${planId}`);
  }
}

/** Remove a subscriber email from a plan. */
export async function removePlanSubscriber(planId: string, email: string): Promise<void> {
  try {
    const { updateDoc: upd, arrayRemove } = await import('firebase/firestore');
    await upd(doc(db, 'plans', planId), { subscribers: arrayRemove(email) });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${planId}`);
  }
}

// ── Write notifications ───────────────────────────────────────────────────────

/** Writes one notification per subscriber who has opted in to this event type. */
export async function writeNotificationsForPlanEvent(
  plan: Plan,
  type: NotifyEvent,
  actorEmail: string,    // person who triggered the event (skip notifying them)
  subscribers: User[],   // full User objects so we can check their prefs
  title: string,
  body: string,
): Promise<void> {
  const eligibleEmails = subscribers
    .filter(u => {
      if (u.email === actorEmail) return false;                // don't notify the actor
      const prefs = u.notifyOn ?? ['status_change', 'window_expiring'];
      return prefs.includes(type);
    })
    .map(u => u.email);

  if (eligibleEmails.length === 0) return;

  const batch = writeBatch(db);
  for (const email of eligibleEmails) {
    const newRef = doc(collection(db, COL));
    const notif = buildNotification(email, type, plan, title, body);
    batch.set(newRef, notif);
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, COL);
  }
}

/** Simple single-recipient write (used internally or for system events). */
export async function writeNotification(
  userId: string,
  type: NotifyEvent,
  plan: Plan,
  title: string,
  body: string,
): Promise<void> {
  try {
    await addDoc(collection(db, COL), buildNotification(userId, type, plan, title, body));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, COL);
  }
}

// ── Mark read ────────────────────────────────────────────────────────────────

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, COL, notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${COL}/${notificationId}`);
  }
}

export async function markAllNotificationsRead(userEmail: string): Promise<void> {
  try {
    const q = query(
      collection(db, COL),
      where('userId', '==', userEmail),
      where('read', '==', false),
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, COL);
  }
}

// ── Event-specific convenience builders ──────────────────────────────────────

export function buildStatusChangeNotif(plan: Plan, newStage: string, stageLabel: string) {
  return {
    title: `Status updated → ${stageLabel}`,
    body: `${plan.loc} · ${planLabel(plan)}`,
    type: 'status_change' as NotifyEvent,
  };
}

export function buildCommentNotif(plan: Plan, actorName: string) {
  return {
    title: `New note on ${plan.loc}`,
    body: `${actorName} added a comment · ${planLabel(plan)}`,
    type: 'comment' as NotifyEvent,
  };
}

export function buildDocUploadedNotif(plan: Plan, docName: string) {
  return {
    title: `Document attached to ${plan.loc}`,
    body: `${docName} · ${planLabel(plan)}`,
    type: 'doc_uploaded' as NotifyEvent,
  };
}

export function buildPlanApprovedNotif(plan: Plan) {
  return {
    title: `${plan.loc} approved`,
    body: `Plan approved · ${planLabel(plan)}`,
    type: 'plan_approved' as NotifyEvent,
  };
}

export function buildDotCommentsNotif(plan: Plan, cycleNum: number) {
  return {
    title: `DOT comments received — ${plan.loc}`,
    body: `Cycle ${cycleNum} · ${planLabel(plan)}`,
    type: 'dot_comments' as NotifyEvent,
  };
}

export function buildNVExpiryNotif(plan: Plan, daysLeft: number, expiryDate: string) {
  const urgency = daysLeft <= 0 ? 'EXPIRED' : daysLeft <= 7 ? `${daysLeft}d left` : `${daysLeft} days left`;
  return {
    title: `Noise Variance expiring — ${plan.loc}`,
    body: `${urgency} · Expires ${expiryDate} · ${planLabel(plan)}`,
    type: 'nv_expiring' as NotifyEvent,
  };
}

/**
 * Check all plans for NV expiry and write notifications for subscribers.
 * Should be called once on app load (after plans and users are loaded).
 * Notifies at 30-day and 7-day thresholds (and at expiry).
 */
export async function checkAndNotifyNVExpiry(
  plans: Plan[],
  users: { email: string; notifyOn?: NotifyEvent[] }[],
  getVarianceDaysLeft: (linkedVarianceId: string) => number | null,
): Promise<void> {
  const THRESHOLDS = [30, 7, 0];
  const today = new Date().toISOString().slice(0, 10);

  for (const plan of plans) {
    const nv = plan.compliance?.noiseVariance;
    if (!nv?.linkedVarianceId || !plan.subscribers?.length) continue;

    const days = getVarianceDaysLeft(nv.linkedVarianceId);
    if (days === null) continue;

    // Only notify at threshold days (30, 7, 0 = expiry day)
    if (!THRESHOLDS.includes(days)) continue;

    // Dedupe: check if a notification was already sent today for this plan + threshold
    const dedupeKey = `nv_expiry_${plan.id}_${days}_${today}`;
    if (sessionStorage.getItem(dedupeKey)) continue;
    sessionStorage.setItem(dedupeKey, '1');

    // Find expiry date from a rough calculation
    const expiryDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const { title, body, type } = buildNVExpiryNotif(plan, days, expiryDate);

    const subscriberUsers = (plan.subscribers || [])
      .map(email => users.find(u => u.email === email) ?? { email, notifyOn: ['nv_expiring'] as NotifyEvent[] });

    await writeNotificationsForPlanEvent(plan, type, '', subscriberUsers as any, title, body);
  }
}

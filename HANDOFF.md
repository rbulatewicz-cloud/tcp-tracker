# TCP Tracker — Handoff Document
_Last updated: 2026-04-16_

---

## What This App Is

**TCP Tracker** is an internal operations tool for **San Fernando Transit Constructors (SFTC)** used to manage Traffic Control Plan (TCP) requests along the ESFV LRT corridor in the San Fernando Valley. It tracks the full lifecycle of each plan — from initial request through DOT submission, review cycles, approval, and LOC issuance — with compliance tracking (Peak Hour Exemptions, Noise Variances, CD Concurrences, Driveway Notices) and a document library.

---

## Live Deployment

| Item | Value |
|---|---|
| **Hosting URL** | https://gen-lang-client-0122413243.web.app |
| **Firebase project** | `gen-lang-client-0122413243` |
| **Firestore database ID** | `ai-studio-9153c9e2-8066-4a49-996e-75268af5f0e2` (named, not default) |
| **GitHub repo** | https://github.com/rbulatewicz-cloud/tcp-tracker |

### Deploy commands
```bash
npm run build                            # compile to dist/
firebase deploy --only hosting           # push to live URL
firebase deploy --only firestore         # push rules (separate — easy to forget)
```

---

## Tech Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Firebase (Firestore, Auth, Storage, Hosting)
- **Cloud Functions:** Firebase Functions v2 (scheduled compliance reminders)
- **Icons:** lucide-react
- **PDF generation:** jsPDF + html2canvas (custom `pdfService.ts`)

---

## Architecture Notes

### Authentication & Roles
- Google Sign-In via Firebase Auth
- `r.bulatewicz@gmail.com` is hardcoded as ADMIN bootstrap in `useAuth.ts`
- **Dev bypass:** local dev (`localhost`) always runs as Admin — auth does not run locally, so role/permission logic cannot be tested there
- Roles (stored as uppercase strings in `users_private`): `GUEST`, `SFTC`, `MOT`, `CR`, `ADMIN`
- `users_private` document ID = **email (lowercase)**, not Firebase UID
- Role changes in Team Management reflect immediately — `useAuth.ts` uses `onSnapshot`

### Firestore
- `plan.log` is an **array field on the plan document**, not a sub-collection — code that queries `plans/{id}/logs` will silently fail
- `users_private` keyed by email, not UID
- Active collections: `plans`, `locs`, `settings`, `users_public`, `users_private`, `app_feedback`, `app_todos`, `counters`, `variances`, `driveway_letters`, `notifications`
- Legacy/unused: `app_requests`, `tickets`, `users`

### Plan IDs
- Plans are stored in Firestore with the LOC number as the document ID (e.g. `plans/LOC-490`)
- Older/imported plans may have a different Firestore doc ID with `loc` field set separately — the popout view (`?plan=LOC-xxx`) handles this with a fallback query by `loc` field

### Renewal Families
- Renewals use dot versioning: `LOC-345` → `LOC-345.1` → `LOC-345.6`
- The base LOC is parsed by stripping the `.N` suffix
- In plan list sort, the entire family sorts by the **highest-revision member's need-by date** (not the original plan's date)

### Compliance Tracks
- Tracks (`phe`, `noiseVariance`, `cdConcurrence`, `drivewayNotices`) live under `plan.compliance`
- Auto-detected by `detectComplianceTriggers()` in `src/utils/compliance.ts`
- `null` on a track field = **intentionally removed by user** — `initializeComplianceTracks` will not recreate it
- `undefined` (field absent) = never set — will be auto-created if triggered
- Removing a track writes `null` via dot-notation `updateDoc` (`compliance.cdConcurrence: null`)

---

## Recently Completed Work

### This session (2026-04-16)
| Area | What was done |
|---|---|
| **Plan popout** | Pop-out button on plan card header opens a lightweight single-plan view at `?plan=LOC-xxx`. Auth-gated (Google sign-in). Shows all sections: stage progression, details, traffic impacts, hours of work, compliance, notes, all documents with tags, review cycles, scrollable activity log. |
| **Popout ID fallback** | For older plans whose Firestore doc ID ≠ LOC number, popout falls back to a `where('loc', '==', locId)` query. Fixes LOC-490 and similar imported plans. |
| **Compliance track removal** | Fixed two-layer bug: (1) `deleteField()` → now writes `null` as persistent sentinel; (2) `initializeComplianceTracks` now uses `=== undefined` check so `null` tracks are never auto-recreated on remount. |
| **Renewal sort** | Renewal families now sort by the highest-revision member's need-by date in both default sort and explicit "Need By" column sort. |
| **Code cleanup** | Extracted duplicate `daysUntil()` and `formatDate()` helpers into `src/utils/plans.ts`. Removed copies from `DrivewayNoticesPanel`, `CRQueueSection`, `varianceService`, `ReferenceDocsSection`. |
| **Settings Access tab** | Added missing Save button to the Team Access Control tab in Settings. |
| **@mention dropdown** | Fixed dropdown clipping behind `overflow:hidden` ancestors using `ReactDOM.createPortal` at `document.body`. Added viewport flip logic (renders above textarea when near bottom of screen). |

### Recent prior sessions
| Area | What was done |
|---|---|
| **Duplicate/similarity detection** | New request modal scans existing plans by location. Exact match = amber hard-block requiring acknowledgment. Near match = blue info panel. Expired plan = "Request Renewal" pre-fills dot-versioned LOC. Active plan = "Use This Plan" navigates to it. |
| **Request comment threads** | @mention autocomplete in comment textarea. Notifications written to `notifications` collection on submit. |
| **Bulk Link (CR Hub)** | Two-panel master/detail with LOC↔Notice mode toggle for linking driveway notices to plans in bulk. |

---

## Open Threads & Next Steps

### Ready to build (clear scope)
- **PHE Permits sub-section in Library** — same upload + AI scan pattern as Noise Variances
- **CD Concurrences sub-section in Library** — third sub-section alongside Noise Variances
- **Reporting Phase 2** — plan snapshot image on PDF title page, stage attachments with dividers, user-configurable include/exclude toggles
- **Plan snapshot image** — upload widget on plan card header (`snapshotUrl` field already reserved on Plan type)

### Needs a design conversation first
- **Submission Quality Scoring** — score/rank engineer submission quality over time; data model TBD (field on Plan vs. separate `scores` collection)
- **TANSAT submittal workflow** — `impact_transit` checkbox is placeholder; full submittal process needs to be defined
- **Holiday compliance rules** — holidays follow same LAMC 41.40 rules as Saturday; need LA City holiday list before building
- **Bus stop structured input** — `impact_busStop` currently a checkbox; future: list with bus line + stop number per entry
- **Driveway addresses structured input** — `impact_driveway` currently a checkbox; future: structured address list feeding CR notices

### Bigger efforts (multi-day)
- **Metro role + permissions** — new role distinct from ADMIN/SFTC with scoped read/approve access to Library; touches auth, role enum, Firestore rules, permission checks throughout, and a simplified Metro-facing view
- **Team Management redesign** — current `UserManagementView.tsx` works but was flagged for rethink
- **Custom domain** — `tcptracker.sftcllc.com` desired; domain not yet registered

### Needs activation only (no code)
- **Email notifications** — `writeRequestCommentNotification` already writes to the `mail` collection. Just needs the Firebase Trigger Email extension installed in Firebase Console → Extensions, pointed at `mail`, with SMTP (SendGrid or Gmail)

### Deferred (do not build until asked)
- Noise Variance letter auto-generation
- PHE PDF assembly (pre-fill BOE form from plan data)
- LOC renewal UI (separate from the existing dot-versioning logic)

---

## Key Files

| File | Purpose |
|---|---|
| `src/main.tsx` | Entry point — intercepts `?plan=` to render lightweight popout before full app mounts |
| `src/App.tsx` | Main app shell, routing, global state, sorting logic (~1,490 lines) |
| `src/types.ts` | All TypeScript interfaces — `Plan`, `PlanForm`, `PlanCompliance`, roles, etc. |
| `src/services/planService.ts` | Firestore reads/writes for plans, `updatePlanField`, `submitPlan` |
| `src/services/firestoreService.ts` | `onSnapshot` subscription for plans (maps to `{ ...doc.data(), id: doc.id }`) |
| `src/utils/compliance.ts` | `detectComplianceTriggers`, `initializeComplianceTracks` |
| `src/utils/plans.ts` | Shared date/time helpers: `fmtDate`, `daysUntil`, `daysBetween`, `calcMetrics` |
| `src/utils/corridor.ts` | Street normalization and corridor segment lookup |
| `src/views/PlanPopoutView.tsx` | Lightweight read-only plan view for `?plan=` popout |
| `src/views/TableView.tsx` | Plan list table with renewal family grouping logic |
| `src/components/PlanCardSections/ComplianceSection.tsx` | Compliance tracks UI and `removeTrack` |
| `functions/src/index.ts` | Firebase Cloud Function — daily 8 AM PT compliance reminder |
| `firestore.rules` | Security rules (deploy separately with `--only firestore`) |

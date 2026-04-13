# Changelog

All notable changes to TCP Tracker are documented here.

---

## [2.0.0] — 2026-04-12

### 🚀 Major Feature: Email Notification System

Complete end-to-end email infrastructure built on Firebase "Trigger Email" extension + SendGrid.

#### Infrastructure
- `emailService.ts` — `sendEmail()` / `sendEmailToMany()` with 24-hour dedup, `mail` + `mail_log` Firestore collections
- `emailTemplateService.ts` — full CRUD for templates, token resolution system (`{{loc}}`, `{{days_until}}`, etc.), 11 seeded default templates
- New types: `EmailTemplate`, `MailLogEntry`, `EmailDelivery`, `EmailDeliveryPrefs`, `MailStatus`, `EmailTier`, `EmailBarColor`

#### Admin UI (Settings → Email)
- **Email Templates tab** — edit subject/body/CTA, live preview, color-coded tier badges, per-template "Send test" button
- **Email Audit Log tab** — paginated table of every email sent; filterable by status, event, and free text; expand rows to inspect token values
- **Notifications tab** — admin view of all users' per-event delivery preferences with inline notification email editor

#### User preferences
- Profile modal → Notifications tab now includes an **Email Delivery** section
- Per-event selector: App only / Email only / Both / Off
- Saved to `users_private.emailDelivery`

#### Tier A — Automated compliance alerts (fires on app load)
- **NV Expiring** — 30-day and 7-day warnings for plans with linked noise variances
- **PHE Deadline** — 14, 7, and 3-day warnings when PHE is not yet submitted
- **CR Issue Escalation** — alert when an open issue has had no update for 7+ days

#### Tier B — Team workflow triggers (fires on user actions)
- **Status Change** — plan subscribers emailed when a plan moves to a new stage
- **Plan Assigned** — newly assigned lead emailed when `lead` field changes
- **CR Issue Assigned** — assignee emailed when an issue is assigned to them
- **CR Issue Updated** — creator and assignee emailed when issue status changes
- **@Mention** — mentioned users emailed when `@name` appears in a plan note

#### Tier C — Constituent emails
- **Issue Acknowledgment** — reporter emailed automatically when a CR issue is created with their email
- **Issue Resolved** — reporter emailed when issue is marked resolved (admin-activatable template)

---

## [1.4.0] — 2026-03-xx

### CR Hub & Issues
- CR Issues section with full CRUD, priority/category/status management
- AI Parse — extract issue fields from pasted email or chat text (Gemini)
- Driveway Linker — link CR issues to driveway properties
- CR Queue driveway notice workflow

### Library
- Noise Variance library with AI-assisted PDF scan, revision tracking, multi-corridor smart linking
- PHE linker with checklist workflow
- CD Concurrence tracker (CD2, CD6, CD7) with meeting management
- Driveway notice letters (English + Spanish) with Metro approval workflow
- Reference library

---

## [1.3.0] — 2026-02-xx

### Compliance & Workflow
- PHE (Peak Hour Exception) compliance track
- Noise Variance compliance track with expiry alerts
- CD Concurrence track
- Implementation window tracking
- LOC renewal workflow

### Notifications
- In-app notification bell with per-event opt-in
- Auto-follow plans (by request, lead assignment, or comment)
- Notification preferences in profile modal

---

## [1.2.0] — 2026-01-xx

### Planning & Tracking
- Plan card with full field editing, stage workflow, document management
- DOT review cycle tracking (submitted → comments → resubmission)
- Status history and accountability clocks
- Segment-based auto-follow

### Views
- Calendar view
- Timeline / Gantt view
- Metrics dashboard
- Reports

---

## [1.1.0] — 2025-xx-xx

### Foundation
- Firebase Auth (Google SSO) with role-based access (ADMIN, MOT, SFTC, CR, DOT, METRO, GUEST)
- Plan table with filtering, sorting, bulk actions
- Map / corridor view
- Activity log per plan
- Admin settings (branding, workflow rules, managed lists, team access)
- Dark mode

---

## [1.0.0] — 2025-xx-xx

### Initial Release
- Core plan tracking (LOC numbers, stages, segments)
- Basic plan card
- User management
- Import / export

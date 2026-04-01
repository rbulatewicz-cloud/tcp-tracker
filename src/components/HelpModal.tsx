import React, { useState } from 'react';
import { X, ChevronDown, ChevronRight, BookOpen, Table2, FilePlus, Layout, ShieldCheck, Paperclip, Bell, BookMarked } from 'lucide-react';
import { UserRole, User } from '../types';

interface HelpModalProps {
  onClose: () => void;
  currentUser: User | null;
}

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  roles: UserRole[] | 'all';
  content: React.ReactNode;
}

const roleConfig: Record<string, { label: string; color: string; bg: string; description: string }> = {
  [UserRole.ADMIN]: {
    label: 'System Admin',
    color: '#7C3AED',
    bg: '#EDE9FE',
    description: 'Full access — manage users, configure the app, and oversee all plans and compliance.',
  },
  [UserRole.MOT]: {
    label: 'MOT Coordinator',
    color: '#0369A1',
    bg: '#E0F2FE',
    description: 'Manage the full TCP plan workflow — from drafting to approval and compliance tracking.',
  },
  [UserRole.CR]: {
    label: 'Community Relations',
    color: '#065F46',
    bg: '#D1FAE5',
    description: 'Track driveway impact notices and community outreach for active plans. Access the Compliance view → Community Notices section.',
  },
  [UserRole.SFTC]: {
    label: 'SFTC Requestor',
    color: '#92400E',
    bg: '#FEF3C7',
    description: 'Submit plan requests, track status updates, and communicate with the MOT team.',
  },
  [UserRole.GUEST]: {
    label: 'Guest',
    color: '#475569',
    bg: '#F1F5F9',
    description: 'View active plans and status updates. Contact your MOT coordinator to request access.',
  },
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid #F1F5F9' }}>
    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', minWidth: 110, flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>{value}</span>
  </div>
);

const Pill: React.FC<{ label: string; bg: string; color: string }> = ({ label, bg, color }) => (
  <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 4, background: bg, color, fontSize: 10, fontWeight: 700, marginRight: 4 }}>{label}</span>
);

export const HelpModal: React.FC<HelpModalProps> = ({ onClose, currentUser }) => {
  const role = currentUser?.role as UserRole | undefined;
  const rc = role ? (roleConfig[role] ?? roleConfig[UserRole.GUEST]) : roleConfig[UserRole.GUEST];
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['role', 'table', 'submit', 'card', 'compliance', 'docs', 'follow', 'glossary'])
  );

  const toggle = (id: string) =>
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const sections: Section[] = [
    {
      id: 'role',
      icon: <BookOpen size={14} />,
      title: 'Your Role',
      roles: 'all',
      content: (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: rc.bg, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: rc.color, letterSpacing: 0.3 }}>{rc.label}</span>
            <span style={{ fontSize: 12, color: rc.color, opacity: 0.85 }}>— {rc.description}</span>
          </div>
          <p style={{ fontSize: 12, color: '#475569', margin: 0, lineHeight: 1.6 }}>
            Your role controls which views you can access and what actions you can take. Roles are assigned by a System Admin.
            If you need additional access, contact your MOT coordinator.
          </p>
        </div>
      ),
    },
    {
      id: 'table',
      icon: <Table2 size={14} />,
      title: 'Reading the Plans Table',
      roles: 'all',
      content: (
        <div>
          <p style={{ fontSize: 12, color: '#475569', margin: '0 0 12px', lineHeight: 1.6 }}>
            Each row in the table is a Traffic Control Plan. Here's what each column means:
          </p>
          <Row label="LOC #" value="Unique plan identifier (e.g. 365.2). Click any row to open the full plan card." />
          <Row label="Type" value={<><Pill label="WATCH" bg="#DBEAFE" color="#1D4ED8" /><Pill label="Standard" bg="#D1FAE5" color="#065F46" /><Pill label="Engineered" bg="#EDE9FE" color="#7C3AED" /> — determines required review time.</>} />
          <Row label="Location" value="Primary street with scope and segment tags shown below." />
          <Row label="Hours" value={<><Pill label="DAY" bg="#FFFBEB" color="#D97706" /><Pill label="NGT" bg="#EFF6FF" color="#1D4ED8" /><Pill label="BOTH" bg="#FDF4FF" color="#A21CAF" /><Pill label="24/7" bg="#F5F3FF" color="#7C3AED" /> — work shift type.</>} />
          <Row label="Impacts" value="Color-coded pills for NB/SB/DIR/SS (directions), K (Krail), FC (full closure), DW (driveway), BS (bus stop), TN (TANSAT)." />
          <Row label="Lead" value="Assigned MOT coordinator responsible for this plan." />
          <Row label="Priority" value={<><Pill label="Critical" bg="#FEE2E2" color="#DC2626" /><Pill label="High" bg="#FEF3C7" color="#D97706" /><Pill label="Medium" bg="#E0F2FE" color="#0369A1" /><Pill label="Low" bg="#F1F5F9" color="#64748B" /></>} />
          <Row label="Compliance" value="Required permits auto-detected from the plan. PHE = Peak Hour Exemption, NV = Noise Variance, CD = Council District." />
          <Row label="Status" value="Current workflow stage — Requested → Drafting → Submitted → In Review → Approved → Implemented." />
          <Row label="Need By" value="Client deadline. Plans approaching or past deadline are highlighted." />
          <Row label="Wait" value="Days waiting since submission (active plans) or total review time (completed plans)." />
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '12px 0 0', lineHeight: 1.5 }}>
            You can show/hide columns using the column picker (top-right of the table). Your layout is saved automatically.
          </p>
        </div>
      ),
    },
    {
      id: 'submit',
      icon: <FilePlus size={14} />,
      title: 'Submitting a Request',
      roles: 'all',
      content: (
        <div>
          <p style={{ fontSize: 12, color: '#475569', margin: '0 0 12px', lineHeight: 1.6 }}>
            Click <strong>New Request</strong> in the top-right to open the form. Fill out each section in order:
          </p>
          <Row label="Plan Identification" value="LOC # (auto-assigned for admins), who is requesting, and Plan Type. Type determines the review workflow." />
          <Row label="Scope & Location" value="Streets, scope of work, and the project segment. This drives routing and community outreach." />
          <Row label="Work Conditions" value="Hours of Work — set your shift type and the days/times you'll be working." />
          <Row label="Traffic Impacts" value="Check all that apply: directional closures, Krail, full closure, driveway/bus stop impacts. These auto-trigger compliance requirements." />
          <Row label="Compliance Preview" value="Automatically shows which permits (PHE, Noise Variance, CD Concurrence) are required based on your inputs. No manual selection needed." />
          <Row label="Documents" value="Attach any existing TCPs, LOCs, or permits upfront. You can add more later from the plan card." />
          <Row label="Notes" value="Any special instructions or context for the MOT team." />
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '12px 0 0', lineHeight: 1.5 }}>
            After submission you'll receive a queue position and plan ID. You can find your plan in the table immediately.
          </p>
        </div>
      ),
    },
    {
      id: 'card',
      icon: <Layout size={14} />,
      title: 'Reading a Plan Card',
      roles: 'all',
      content: (
        <div>
          <p style={{ fontSize: 12, color: '#475569', margin: '0 0 12px', lineHeight: 1.6 }}>
            Click any row in the table to open the plan card. The header stays locked so you always know which plan you're in.
          </p>
          <Row label="Status" value="Current stage with available actions for your role. Status changes are logged automatically." />
          <Row label="Progression" value="Collapsed history of every stage transition with timestamps." />
          <Row label="Scope & Location" value="Streets, scope, and segment — editable by MOT/Admin." />
          <Row label="Hours of Work" value="Shift schedule with days and times." />
          <Row label="Impacts & Requirements" value="All traffic impact flags and special requirements for this plan." />
          <Row label="Compliance" value="Live tracker for PHE, Noise Variance, CD Concurrence, and Driveway Impact Notices. Each track auto-generates from the plan's work hours and impact flags." />
          <Row label="Notes" value="Log entries visible to the whole team. Good for DOT comments, internal decisions, or status context." />
          <Row label="Documents" value="All attached files — TCPs, LOCs, permits. MOT/Admin can upload directly." />
          <Row label="Activity Log" value="Full audit trail — every change, upload, and comment ever made on this plan." />
        </div>
      ),
    },
    {
      id: 'compliance',
      icon: <ShieldCheck size={14} />,
      title: 'Compliance Flags',
      roles: [UserRole.MOT, UserRole.ADMIN, UserRole.SFTC],
      content: (
        <div>
          <p style={{ fontSize: 12, color: '#475569', margin: '0 0 12px', lineHeight: 1.6 }}>
            Compliance requirements are detected automatically from the plan's work hours and impact selections. You don't pick them manually.
          </p>
          <Row
            label="PHE"
            value={
              <>
                <strong>Peak Hour Exemption</strong> — Required when weekday work overlaps peak traffic hours (Mon–Fri 6–9 AM or 3:30–7 PM).
                Submitted through the BOE Customer Service Portal. Fee applies (LAMC 62.61(b).3).
              </>
            }
          />
          <Row
            label="Noise Variance"
            value={
              <>
                <strong>Noise Variance</strong> — Required for nighttime construction noise (LAMC 41.40).
                Triggered when work falls between 9 PM–7 AM weekdays, before 8 AM or after 6 PM Saturdays, or any time Sundays.
                Applied through the Police Commission.
              </>
            }
          />
          <Row
            label="CD Concurrence"
            value={
              <>
                <strong>Council District Concurrence</strong> — Sign-off from affected City Council District(s).
                Triggered for directional closures, full closures, or whenever PHE is required.
                Tracked per district (CD2, CD6, CD7).
              </>
            }
          />
          <Row
            label="Driveway Notices"
            value={
              <>
                <strong>Driveway Impact Notices</strong> — Triggered when the plan flags a driveway impact.
                Add each affected property address, then use <strong>✉ Draft</strong> to generate a formal Word notice letter (one per address) via AI.
                Mark each address as sent when delivered.
              </>
            }
          />
          <Row
            label="Noise Variance Letter"
            value="Once an NV track exists, use ✉ Draft Letter inside the Noise Variance panel (or from the Compliance view) to generate a Word document application letter to the LA Police Commission. AI fills in the scope, equipment list, and subject line — you review and download."
          />
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <p style={{ fontSize: 11, color: '#166534', margin: 0, lineHeight: 1.5 }}>
              The TCP/WTCP checklist item auto-links to the plan's approved TCP documents. The CD Communication item auto-links to the CD Concurrence section — no double entry needed.
              The Compliance Action Items view (Compliance tab) shows all plans with unresolved tracks, including a Community Notices table for driveway and bus stop impacts.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'docs',
      icon: <Paperclip size={14} />,
      title: 'Documents & Notes',
      roles: 'all',
      content: (
        <div>
          <p style={{ fontSize: 12, color: '#475569', margin: '0 0 12px', lineHeight: 1.6 }}>
            Each plan has two separate places for written content:
          </p>
          <Row label="Documents" value="File attachments — TCP drawings, LOC PDFs, permit approvals, etc. Uploaded files are stored permanently and accessible to the whole team." />
          <Row label="Notes" value="Log entries with a timestamp and your name. Use these for DOT comments received, internal decisions, or context about a status change." />
          <Row label="Compliance Attachments" value="Documents attached directly to individual PHE checklist items (e.g. the signed TCP, fee confirmation). These live inside the Compliance section." />
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '12px 0 0', lineHeight: 1.5 }}>
            Documents uploaded during the initial request are preserved on the plan. MOT/Admin can add more at any stage.
          </p>
        </div>
      ),
    },
    {
      id: 'follow',
      icon: <Bell size={14} />,
      title: 'Following a Plan',
      roles: 'all',
      content: (
        <div>
          <p style={{ fontSize: 12, color: '#475569', margin: '0 0 12px', lineHeight: 1.6 }}>
            Following a plan means you receive notifications when something changes.
          </p>
          <Row label="Manual follow" value="Click the bell icon in the plan card header to follow or unfollow any plan. You'll see a confirmation toast." />
          <Row label="Auto-follow" value="In your profile settings you can configure auto-follow rules: plans you request, plans assigned to you as lead, or plans you comment on." />
          <Row label="Notifications" value="Sent to your notification email (set in profile — can be different from your Google login). You can choose immediate delivery or a daily digest." />
          <Row label="Notification Bell" value="The bell icon in the top header shows unread in-app notifications. Click it to see recent activity across your followed plans." />
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '12px 0 0', lineHeight: 1.5 }}>
            You can update your notification preferences anytime via your profile (click your avatar in the top-right).
          </p>
        </div>
      ),
    },
    {
      id: 'glossary',
      icon: <BookMarked size={14} />,
      title: 'Glossary',
      roles: 'all',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
          {[
            ['LOC', 'Letter of Commitment — the plan\'s unique record number'],
            ['TCP', 'Traffic Control Plan'],
            ['WTCP', 'WATCH Traffic Control Plan — simplified version for low-impact work'],
            ['PHE', 'Peak Hour Exemption — BOE permit for work during peak traffic hours'],
            ['NV', 'Noise Variance — Police Commission permit for nighttime construction noise'],
            ['CD', 'Council District — City Council member\'s office'],
            ['CD Concurrence', 'Approval from affected Council District(s) before work begins'],
            ['BOE', 'Bureau of Engineering (Board of Public Works)'],
            ['MOT', 'Maintenance of Traffic — the team managing TCP approvals'],
            ['LADOT', 'Los Angeles Department of Transportation'],
            ['LAMC 41.40', 'City ordinance governing nighttime construction noise'],
            ['TANSAT', 'Traffic Analysis and Signal Assessment Tool'],
            ['Krail', 'Concrete barrier (Jersey barrier) used to redirect traffic'],
            ['DIR', 'Directional closure — lane or road segment closed to through traffic'],
            ['FC', 'Full Closure — entire street closed to all traffic'],
            ['DW', 'Driveway impact — construction affects access to a driveway; triggers a Driveway Notices compliance track'],
            ['BS', 'Bus Stop impact — a bus stop must be temporarily relocated'],
            ['Driveway Notice', 'Formal advance notice letter sent to property owners at affected driveway addresses'],
            ['SS', 'Side Street — intersecting street impacted by the closure'],
          ].map(([term, def]) => (
            <div key={term} style={{ padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#334155' }}>{term}</div>
              <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.4, marginTop: 2 }}>{def}</div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  const visibleSections = sections.filter(s =>
    s.roles === 'all' || (role && s.roles.includes(role))
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: 'rgba(15,23,42,0.4)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 520, zIndex: 901,
        background: 'var(--bg-surface)',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0,
          background: 'var(--bg-surface)',
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <BookOpen size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>How To Guide</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: 0.3 }}>TCP Tracker — Team Reference</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Role badge */}
            <span style={{
              fontSize: 10, fontWeight: 700,
              padding: '3px 10px', borderRadius: 20,
              background: rc.bg, color: rc.color,
              letterSpacing: 0.4,
            }}>
              {rc.label}
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: 6, borderRadius: 6,
                color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Sections */}
        <div style={{ padding: '12px 0 32px' }}>
          {visibleSections.map((section, i) => {
            const isOpen = openSections.has(section.id);
            return (
              <div key={section.id} style={{ borderBottom: i < visibleSections.length - 1 ? '1px solid var(--border)' : 'none' }}>
                {/* Section header */}
                <button
                  onClick={() => toggle(section.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '13px 24px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#F59E0B' }}>{section.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{section.title}</span>
                  </div>
                  <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </button>

                {/* Section body */}
                {isOpen && (
                  <div style={{ padding: '0 24px 18px' }}>
                    {section.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 'auto',
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          position: 'sticky', bottom: 0,
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>
            You can reopen this guide anytime using the <strong>?</strong> button in the header.
          </p>
        </div>
      </div>
    </>
  );
};

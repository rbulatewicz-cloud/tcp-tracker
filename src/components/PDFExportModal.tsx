import React, { useState, useEffect } from 'react';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import type { Plan, NoiseVariance, PDFExportOptions, StageAttachment } from '../types';

interface Props {
  plan: Plan;
  libraryVariances: NoiseVariance[];
  onGenerate: (options: PDFExportOptions) => void;
  onClose: () => void;
}

function fileName(url: string, fallback: string): string {
  try {
    const decoded = decodeURIComponent(url.split('?')[0]);
    const part = decoded.split('/').pop() || fallback;
    return part.replace(/^\d+_/, '');
  } catch {
    return fallback;
  }
}

function fmtStageLabel(stage: string): string {
  return stage
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bDot\b/, 'DOT')
    .replace(/\bLoc\b/, 'LOC');
}

const DOC_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  tcp_drawings:      { label: 'TCP',      color: '#6366F1' },
  loc_draft:         { label: 'LOC',      color: '#0EA5E9' },
  loc_signed:        { label: 'LOC',      color: '#0EA5E9' },
  dot_comments:      { label: 'DOT',      color: '#EF4444' },
  revision_package:  { label: 'Rev Pkg',  color: '#F59E0B' },
  approval_letter:   { label: 'Approval', color: '#10B981' },
  other:             { label: 'Doc',      color: '#64748B' },
};

export const PDFExportModal: React.FC<Props> = ({ plan, libraryVariances, onGenerate, onClose }) => {
  const comp = plan.compliance;
  const hasCompliance = !!(comp && (comp.phe || comp.noiseVariance || comp.cdConcurrence || comp.drivewayNotices));
  const hasScopeNotes = !!(plan.scope || plan.notes);
  const hasWorkHours  = !!plan.work_hours;
  const hasImpacts    = !!(plan.impact_krail || plan.impact_driveway || plan.impact_fullClosure || plan.impact_busStop || plan.impact_transit);
  const hasLog        = !!(plan.log && plan.log.length > 0);

  const tcps  = plan.approvedTCPs  || [];
  const locs  = plan.approvedLOCs  || [];
  const stageAttachments: StageAttachment[] = plan.stageAttachments || [];

  const linkedVariance = libraryVariances.find(v =>
    v.id === plan.compliance?.noiseVariance?.linkedVarianceId ||
    (v.parentVarianceId ?? v.id) === plan.compliance?.noiseVariance?.linkedVarianceId
  );

  // Group stage attachments by stage for display
  const stageGroups: { stage: string; attachments: StageAttachment[] }[] = [];
  stageAttachments.forEach(att => {
    const group = stageGroups.find(g => g.stage === att.stage);
    if (group) group.attachments.push(att);
    else stageGroups.push({ stage: att.stage, attachments: [att] });
  });

  const [docsOpen, setDocsOpen] = useState(true);

  const [opts, setOpts] = useState<PDFExportOptions>({
    includeMetadata:               true,
    includeScopeNotes:             hasScopeNotes,
    includeWorkHours:              hasWorkHours,
    includeImpacts:                hasImpacts,
    includeCompliance:             hasCompliance,
    includeActivityLog:            hasLog,
    includedTCPUrls:               tcps.map((f: any) => f.url),
    includedLOCUrls:               locs.map((f: any) => f.url),
    includeNoiseVariance:          !!linkedVariance?.fileUrl,
    includedStageAttachmentUrls:   stageAttachments.map(f => f.url),
  });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggle = (key: keyof PDFExportOptions) => {
    setOpts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTCP = (url: string) => {
    setOpts(prev => ({
      ...prev,
      includedTCPUrls: prev.includedTCPUrls.includes(url)
        ? prev.includedTCPUrls.filter(u => u !== url)
        : [...prev.includedTCPUrls, url],
    }));
  };

  const toggleLOC = (url: string) => {
    setOpts(prev => ({
      ...prev,
      includedLOCUrls: prev.includedLOCUrls.includes(url)
        ? prev.includedLOCUrls.filter(u => u !== url)
        : [...prev.includedLOCUrls, url],
    }));
  };

  const toggleStageAttachment = (url: string) => {
    setOpts(prev => ({
      ...prev,
      includedStageAttachmentUrls: prev.includedStageAttachmentUrls.includes(url)
        ? prev.includedStageAttachmentUrls.filter(u => u !== url)
        : [...prev.includedStageAttachmentUrls, url],
    }));
  };

  const hasAnyDoc = tcps.length > 0 || locs.length > 0 || stageAttachments.length > 0 || !!linkedVariance?.fileUrl;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, padding: 20,
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 14,
        width: '100%', maxWidth: 460,
        boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <FileText size={15} style={{ color: '#64748B' }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Export PDF</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {plan.loc || plan.id} · {plan.street1}{plan.street2 ? ` / ${plan.street2}` : ''}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px' }}>

          {/* Plan Sections */}
          <div style={{ paddingTop: 16, paddingBottom: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 10 }}>
              Plan Sections
            </div>

            <Row
              label="Plan Identification"
              sublabel="LOC #, location, stage badge"
              checked={true}
              disabled={true}
            />
            <Row
              label="Metadata & Dates"
              sublabel="Type, priority, lead, all key dates"
              checked={opts.includeMetadata}
              onChange={() => toggle('includeMetadata')}
            />
            <Row
              label="Scope & Notes"
              checked={opts.includeScopeNotes}
              onChange={() => toggle('includeScopeNotes')}
              disabled={!hasScopeNotes}
              emptyNote={!hasScopeNotes ? 'No scope or notes on this plan' : undefined}
            />
            <Row
              label="Work Hours"
              checked={opts.includeWorkHours}
              onChange={() => toggle('includeWorkHours')}
              disabled={!hasWorkHours}
              emptyNote={!hasWorkHours ? 'No work hours set' : undefined}
            />
            <Row
              label="Impacts & Requirements"
              checked={opts.includeImpacts}
              onChange={() => toggle('includeImpacts')}
              disabled={!hasImpacts}
              emptyNote={!hasImpacts ? 'No impacts flagged' : undefined}
            />
            <Row
              label="Compliance Summary"
              sublabel={hasCompliance ? [comp?.phe && 'PHE', comp?.noiseVariance && 'NV', comp?.cdConcurrence && 'CD', comp?.drivewayNotices && 'Driveway'].filter(Boolean).join(' · ') : undefined}
              checked={opts.includeCompliance}
              onChange={() => toggle('includeCompliance')}
              disabled={!hasCompliance}
              emptyNote={!hasCompliance ? 'No compliance tracks' : undefined}
            />
            <Row
              label="Activity Log"
              sublabel={hasLog ? `${plan.log!.length} entries` : undefined}
              checked={opts.includeActivityLog}
              onChange={() => toggle('includeActivityLog')}
              disabled={!hasLog}
              emptyNote={!hasLog ? 'No activity recorded' : undefined}
            />
          </div>

          {/* Documents */}
          {hasAnyDoc && (
            <div style={{ paddingTop: 8, paddingBottom: 16 }}>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginBottom: 10 }}>
                <button
                  onClick={() => setDocsOpen(o => !o)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: '#94A3B8', textTransform: 'uppercase' }}>
                    Documents
                  </span>
                  {docsOpen ? <ChevronUp size={13} color="#94A3B8" /> : <ChevronDown size={13} color="#94A3B8" />}
                </button>
              </div>

              {docsOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                  {/* Approved TCPs */}
                  {tcps.length > 0 && (
                    <>
                      <SectionLabel label="Approved TCP Drawings" />
                      {tcps.map((f: any, i: number) => (
                        <DocRow
                          key={f.url}
                          name={f.name ? f.name.replace(/^\d+_/, '') : fileName(f.url, `TCP Drawing ${i + 1}`)}
                          badge="TCP"
                          badgeColor="#6366F1"
                          meta={`Rev ${f.version ?? '—'}`}
                          checked={opts.includedTCPUrls.includes(f.url)}
                          onChange={() => toggleTCP(f.url)}
                        />
                      ))}
                    </>
                  )}

                  {/* Approved LOCs */}
                  {locs.length > 0 && (
                    <>
                      <SectionLabel label="Approved LOC / TCP Package" />
                      {locs.map((f: any, i: number) => (
                        <DocRow
                          key={f.url}
                          name={f.name ? f.name.replace(/^\d+_/, '') : fileName(f.url, `Letter of Concurrence ${i + 1}`)}
                          badge="LOC"
                          badgeColor="#0EA5E9"
                          meta={`Rev ${f.version ?? '—'}`}
                          checked={opts.includedLOCUrls.includes(f.url)}
                          onChange={() => toggleLOC(f.url)}
                        />
                      ))}
                    </>
                  )}

                  {/* Stage / submission attachments */}
                  {stageGroups.length > 0 && (
                    <>
                      <SectionLabel label="Submission Documents" />
                      {stageGroups.map(group => (
                        <React.Fragment key={group.stage}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', letterSpacing: 0.4, padding: '4px 8px 2px', textTransform: 'uppercase' }}>
                            {fmtStageLabel(group.stage)}
                          </div>
                          {group.attachments.map((att, i) => {
                            const bt = DOC_TYPE_BADGE[att.documentType] ?? { label: 'Doc', color: '#64748B' };
                            return (
                              <DocRow
                                key={att.url}
                                name={att.name ? att.name.replace(/^\d+_/, '') : fileName(att.url, `Document ${i + 1}`)}
                                badge={bt.label}
                                badgeColor={bt.color}
                                meta={fmtStageLabel(att.documentType).replace(/ /g, '\u00A0')}
                                checked={opts.includedStageAttachmentUrls.includes(att.url)}
                                onChange={() => toggleStageAttachment(att.url)}
                              />
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </>
                  )}

                  {/* Noise Variance */}
                  {linkedVariance?.fileUrl && (
                    <>
                      <SectionLabel label="Noise Variance" />
                      <DocRow
                        name={linkedVariance.title || linkedVariance.fileName}
                        badge="NV"
                        badgeColor="#7C3AED"
                        meta={linkedVariance.permitNumber || ''}
                        checked={opts.includeNoiseVariance}
                        onChange={() => toggle('includeNoiseVariance')}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', fontSize: 12, fontWeight: 600,
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onGenerate(opts); onClose(); }}
            style={{
              padding: '7px 18px', borderRadius: 8, border: 'none',
              background: '#0F172A', color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <FileText size={13} /> Generate PDF
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <div style={{
    fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: '#CBD5E1',
    textTransform: 'uppercase', padding: '6px 2px 3px',
    borderBottom: '1px solid var(--border-subtle, #F1F5F9)',
    marginBottom: 2,
  }}>
    {label}
  </div>
);

interface RowProps {
  label: string;
  sublabel?: string;
  checked: boolean;
  disabled?: boolean;
  emptyNote?: string;
  onChange?: () => void;
}

const Row: React.FC<RowProps> = ({ label, sublabel, checked, disabled, emptyNote, onChange }) => (
  <label style={{
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '7px 0',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    borderBottom: '1px solid var(--border-subtle, #F1F5F9)',
  }}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      style={{ marginTop: 2, cursor: disabled ? 'default' : 'pointer', accentColor: '#0F172A' }}
    />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
      {(sublabel || emptyNote) && (
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>
          {emptyNote || sublabel}
        </div>
      )}
    </div>
  </label>
);

interface DocRowProps {
  name: string;
  badge: string;
  badgeColor: string;
  meta: string;
  checked: boolean;
  onChange: () => void;
}

const DocRow: React.FC<DocRowProps> = ({ name, badge, badgeColor, meta, checked, onChange }) => (
  <label style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
    background: checked ? `${badgeColor}08` : 'transparent',
    border: `1px solid ${checked ? badgeColor + '30' : 'transparent'}`,
    transition: 'background 0.1s, border-color 0.1s',
  }}>
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      style={{ cursor: 'pointer', accentColor: badgeColor }}
    />
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: 0.4,
      padding: '2px 5px', borderRadius: 4,
      background: badgeColor + '18', color: badgeColor,
      flexShrink: 0,
    }}>
      {badge}
    </span>
    <span style={{
      fontSize: 11, fontWeight: 500, color: 'var(--text-primary)',
      flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {name}
    </span>
    {meta && (
      <span style={{ fontSize: 10, color: '#94A3B8', flexShrink: 0 }}>{meta}</span>
    )}
  </label>
);

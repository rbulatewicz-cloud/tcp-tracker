import { useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle, XCircle, ChevronDown, X, AlertTriangle } from 'lucide-react';
import { doc, updateDoc, onSnapshot, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plan, DrivewayLetter, DrivewayLetterStatus, DrivewayAddress } from '../../types';
import {
  uploadAndScanDrivewayLetter,
  linkDrivewayLetterToPlan,
  updateDrivewayLetter,
} from '../../services/drivewayLetterService';
import { Spinner } from '../../components/Spinner';

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanPhase = 'drop' | 'processing' | 'review' | 'committing' | 'done';

interface WizardEntry {
  clientId: string;
  file: File;
  uploadStatus: 'uploading' | 'uploaded' | 'error';
  letterId?: string;
  letter?: DrivewayLetter;
  scanStatus: 'uploading' | 'scanning' | 'ready' | 'error';
  selectedPlanId: string;
  commitStatus: DrivewayLetterStatus;
  error?: string;
}

interface Props {
  onClose: () => void;
  plans: Plan[];
  currentUser: { email?: string; name?: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClientId() {
  return `wiz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function suggestPlan(letter: DrivewayLetter, plans: Plan[]): string {
  if (!letter.segment && !letter.address) return '';
  const addrLower = (letter.address || '').toLowerCase();
  for (const p of plans) {
    const segMatch = letter.segment && p.segment === letter.segment;
    const street1Match = p.street1 && addrLower.includes(p.street1.toLowerCase());
    const street2Match = p.street2 && addrLower.includes(p.street2.toLowerCase());
    if (segMatch && (street1Match || street2Match)) return p.id;
  }
  return '';
}

// ── LOC Picker subcomponent ───────────────────────────────────────────────────

function LOCPicker({
  value,
  plans,
  onChange,
}: {
  value: string;
  plans: Plan[];
  onChange: (planId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedPlan = plans.find(p => p.id === value);

  const filtered = query.trim().length === 0
    ? []
    : plans
        .filter(p => {
          const q = query.toLowerCase();
          return (
            p.loc?.toLowerCase().includes(q) ||
            p.street1?.toLowerCase().includes(q) ||
            p.street2?.toLowerCase().includes(q)
          );
        })
        .slice(0, 6);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 180 }}>
      {selectedPlan ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            background: '#DBEAFE', color: '#1D4ED8', borderRadius: 6,
            padding: '2px 8px', fontSize: 12, fontWeight: 600,
          }}>
            {selectedPlan.loc}
          </span>
          <button
            onClick={() => onChange('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0, lineHeight: 1 }}
            title="Clear"
          >
            <X size={13} />
          </button>
          <button
            onClick={() => { setQuery(''); setOpen(true); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0, lineHeight: 1 }}
            title="Change"
          >
            <ChevronDown size={13} />
          </button>
        </div>
      ) : (
        <div>
          <input
            type="text"
            placeholder="Search LOC…"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            style={{
              border: '1px solid #CBD5E1', borderRadius: 6, padding: '3px 8px',
              fontSize: 12, width: 150, outline: 'none',
            }}
          />
          {open && filtered.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 200,
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 220,
              marginTop: 2, maxHeight: 220, overflowY: 'auto',
            }}>
              {filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onChange(p.id); setQuery(''); setOpen(false); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 12px', border: 'none', background: 'none',
                    cursor: 'pointer', fontSize: 12,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontWeight: 600, color: '#1D4ED8' }}>{p.loc}</span>
                  <span style={{ color: '#64748B', marginLeft: 6 }}>
                    {[p.street1, p.street2].filter(Boolean).join(' @ ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

export function BulkNoticeUploadWizard({ onClose, plans, currentUser }: Props) {
  const [phase, setPhase] = useState<ScanPhase>('drop');
  const [entries, setEntries] = useState<WizardEntry[]>([]);
  const [commitProgress, setCommitProgress] = useState(0);
  const [doneLinked, setDoneLinked] = useState(0);
  const [doneUnlinked, setDoneUnlinked] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [applyAllOpen, setApplyAllOpen] = useState(false);
  const [applyAllPlanId, setApplyAllPlanId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const unsubscribesRef = useRef<Map<string, () => void>>(new Map());

  // Clean up all Firestore subscriptions on unmount
  useEffect(() => {
    return () => {
      unsubscribesRef.current.forEach(unsub => unsub());
    };
  }, []);

  function subscribeToLetter(clientId: string, letterId: string) {
    const unsub = onSnapshot(doc(db, 'driveway_letters', letterId), snap => {
      if (!snap.exists()) return;
      const data = { id: snap.id, ...snap.data() } as DrivewayLetter;
      setEntries(prev => prev.map(e => {
        if (e.clientId !== clientId) return e;
        const scanStatus: WizardEntry['scanStatus'] =
          data.scanStatus === 'needs_review' || data.scanStatus === 'complete'
            ? 'ready'
            : data.scanStatus === 'error'
            ? 'error'
            : 'scanning';
        const updatedEntry: WizardEntry = { ...e, letter: data, scanStatus };
        // Auto-suggest a plan once we have scan results
        if (scanStatus === 'ready' && !e.selectedPlanId) {
          updatedEntry.selectedPlanId = suggestPlan(data, plans);
        }
        return updatedEntry;
      }));
    });
    unsubscribesRef.current.set(clientId, unsub);
  }

  async function startUploads(files: File[]) {
    const uploadedBy = currentUser?.email ?? 'Unknown';
    const initial: WizardEntry[] = files.map(file => ({
      clientId: makeClientId(),
      file,
      uploadStatus: 'uploading',
      scanStatus: 'uploading',
      selectedPlanId: '',
      commitStatus: 'sent' as DrivewayLetterStatus,
    }));
    setEntries(initial);
    setPhase('processing');

    // Upload all simultaneously
    await Promise.all(initial.map(async entry => {
      try {
        const letterId = await uploadAndScanDrivewayLetter(entry.file, uploadedBy);
        setEntries(prev => prev.map(e =>
          e.clientId === entry.clientId
            ? { ...e, uploadStatus: 'uploaded', letterId, scanStatus: 'scanning' }
            : e
        ));
        subscribeToLetter(entry.clientId, letterId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setEntries(prev => prev.map(e =>
          e.clientId === entry.clientId
            ? { ...e, uploadStatus: 'error', scanStatus: 'error', error: msg }
            : e
        ));
      }
    }));
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const pdfs = Array.from(files).filter(f => f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) return;
    startUploads(pdfs);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  const readyCount = entries.filter(e => e.scanStatus === 'ready').length;
  const stillUploading = entries.some(e => e.scanStatus === 'uploading' || e.scanStatus === 'scanning');
  const linkedCount = entries.filter(e => e.selectedPlanId).length;
  const unlinkedCount = entries.length - linkedCount;

  async function handleCommit() {
    setPhase('committing');
    setCommitProgress(0);
    let linked = 0;
    let unlinked = 0;

    const readyEntries = entries.filter(e => e.scanStatus === 'ready' && e.letter);

    for (let i = 0; i < readyEntries.length; i++) {
      const entry = readyEntries[i];
      const letter = entry.letter!;
      const selectedPlan = entry.selectedPlanId ? plans.find(p => p.id === entry.selectedPlanId) : null;

      try {
        // 1. Update letter status
        await updateDrivewayLetter(letter.id, {
          status: entry.commitStatus,
          scanStatus: 'complete',
        });

        // 2. Link to plan if selected
        if (selectedPlan) {
          await linkDrivewayLetterToPlan(letter, selectedPlan);

          // 3. Add/update DrivewayAddress on the plan.
          //    CRITICAL: we must NOT rely on the `selectedPlan` prop snapshot for
          //    `existingAddresses` — this handler processes N entries in sequence, each
          //    `updateDoc` is async, and the parent's `plans` prop doesn't refresh
          //    inside the running loop. A previous bug used a full-array replacement
          //    built from the stale snapshot, so sequential iterations overwrote each
          //    other and all-but-the-last bulk-linked address was lost. We use
          //    Firestore `arrayUnion` for atomic appends, and re-read the plan doc
          //    fresh when we need to inspect the current address list (to dedupe or
          //    update an existing entry).
          const planRef = doc(db, 'plans', selectedPlan.id);
          const freshSnap = await getDoc(planRef);
          const freshPlan = freshSnap.data() as Plan | undefined;
          const freshAddresses = freshPlan?.compliance?.drivewayNotices?.addresses ?? [];

          const addrText = letter.address || '';
          const existingMatch = addrText
            ? freshAddresses.find(a =>
                a.address.toLowerCase() === addrText.toLowerCase() ||
                (a.letterId && a.letterId === letter.id)
              )
            : null;

          const sentDate = letter.fields?.letterDate || new Date().toISOString().slice(0, 10);

          if (!existingMatch) {
            const newAddr: DrivewayAddress = {
              id: `da_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              address: addrText || 'Unknown',
              ownerName: letter.ownerName || letter.fields?.recipientName || '',
              noticeSent: true,
              sentDate,
              letterId: letter.id,
              letterStatus: entry.commitStatus,
            };

            if (!freshPlan?.compliance?.drivewayNotices) {
              // Track doesn't exist yet — create it with this one address.
              await updateDoc(planRef, {
                'compliance.drivewayNotices': {
                  status: 'in_progress',
                  triggeredBy: ['impact_driveway'],
                  addresses: [newAddr],
                  notes: '',
                },
              });
            } else {
              // Track exists — atomic append so concurrent loop iterations can't clobber each other.
              await updateDoc(planRef, {
                'compliance.drivewayNotices.addresses': arrayUnion(newAddr),
              });
            }
          } else {
            // Update existing address entry. A full array replacement is still safe
            // here because we just re-read `freshAddresses` from the server above.
            const updatedAddresses = freshAddresses.map(a =>
              a.id === existingMatch.id
                ? { ...a, noticeSent: true, sentDate, letterId: letter.id, letterStatus: entry.commitStatus }
                : a
            );
            await updateDoc(planRef, {
              'compliance.drivewayNotices.addresses': updatedAddresses,
            });
          }
          linked++;
        } else {
          unlinked++;
        }
      } catch (err) {
        console.error('Commit error for entry', entry.clientId, err);
        unlinked++;
      }

      setCommitProgress(i + 1);
    }

    setDoneLinked(linked);
    setDoneUnlinked(unlinked);
    setPhase('done');
  }

  function applyLOCToAll() {
    if (!applyAllPlanId) return;
    setEntries(prev => prev.map(e =>
      e.selectedPlanId ? e : { ...e, selectedPlanId: applyAllPlanId }
    ));
    setApplyAllOpen(false);
    setApplyAllPlanId('');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 16, padding: 28,
          maxWidth: 900, width: '100%', maxHeight: '85vh',
          overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0F172A' }}>
              Bulk Notice Upload
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
              Upload multiple driveway notices at once — AI extracts address and owner automatically
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#94A3B8', padding: 4, borderRadius: 6,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Phase: DROP */}
        {phase === 'drop' && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#1D4ED8' : '#CBD5E1'}`,
              borderRadius: 12,
              padding: '56px 32px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', gap: 12,
              background: dragOver ? '#EFF6FF' : '#F8FAFC',
              transition: 'all 0.15s',
            }}
          >
            <Upload size={40} color={dragOver ? '#1D4ED8' : '#94A3B8'} />
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: dragOver ? '#1D4ED8' : '#475569' }}>
              Drop PDFs here or click to browse
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>
              Supports multiple files — AI will extract address and owner from each
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={e => handleFiles(e.target.files)}
            />
          </div>
        )}

        {/* Phase: PROCESSING */}
        {phase === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#334155' }}>
              Uploading &amp; scanning {entries.length} file{entries.length !== 1 ? 's' : ''}…
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entries.map(entry => (
                <ProcessingCard key={entry.clientId} entry={entry} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
              <button
                disabled={readyCount === 0 || stillUploading}
                onClick={() => setPhase('review')}
                style={{
                  background: readyCount > 0 && !stillUploading ? '#1D4ED8' : '#CBD5E1',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '9px 20px', fontWeight: 600, fontSize: 14,
                  cursor: readyCount > 0 && !stillUploading ? 'pointer' : 'not-allowed',
                }}
              >
                {stillUploading
                  ? `Scanning… (${readyCount} ready)`
                  : `Review ${readyCount} ready`}
              </button>
            </div>
          </div>
        )}

        {/* Phase: REVIEW */}
        {phase === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                Review &amp; Link ({entries.filter(e => e.scanStatus === 'ready').length} notices)
              </h3>
              <span style={{ fontSize: 12, color: '#64748B' }}>
                <span style={{ color: '#10B981', fontWeight: 600 }}>{linkedCount} linked</span>
                {' · '}
                <span style={{ color: '#94A3B8' }}>{unlinkedCount} unlinked</span>
              </span>
            </div>

            {/* Review table */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11 }}>FILE / ADDRESS</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11 }}>SEGMENT</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11 }}>LINK TO LOC</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11 }}>STATUS</th>
                    <th style={{ padding: '10px 4px', width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {entries.filter(e => e.scanStatus === 'ready').map((entry, idx) => (
                    <ReviewRow
                      key={entry.clientId}
                      entry={entry}
                      plans={plans}
                      isLast={idx === entries.filter(e => e.scanStatus === 'ready').length - 1}
                      onChange={(patch) =>
                        setEntries(prev => prev.map(e =>
                          e.clientId === entry.clientId ? { ...e, ...patch } : e
                        ))
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Apply to all */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {applyAllOpen ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LOCPicker
                    value={applyAllPlanId}
                    plans={plans}
                    onChange={id => setApplyAllPlanId(id)}
                  />
                  <button
                    onClick={applyLOCToAll}
                    disabled={!applyAllPlanId}
                    style={{
                      background: applyAllPlanId ? '#1D4ED8' : '#CBD5E1',
                      color: '#fff', border: 'none', borderRadius: 6,
                      padding: '5px 12px', fontSize: 12, fontWeight: 600,
                      cursor: applyAllPlanId ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => { setApplyAllOpen(false); setApplyAllPlanId(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 12 }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setApplyAllOpen(true)}
                  style={{
                    background: '#F1F5F9', border: '1px solid #E2E8F0',
                    borderRadius: 7, padding: '6px 14px', fontSize: 12,
                    fontWeight: 500, color: '#475569', cursor: 'pointer',
                  }}
                >
                  Apply LOC to all unlinked
                </button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
              {unlinkedCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto' }}>
                  <AlertTriangle size={14} color="#F59E0B" />
                  <span style={{ fontSize: 12, color: '#92400E' }}>
                    {unlinkedCount} notice{unlinkedCount !== 1 ? 's' : ''} will be saved to library only (no LOC link)
                  </span>
                </div>
              )}
              <button
                onClick={() => setPhase('processing')}
                style={{
                  background: '#fff', border: '1px solid #CBD5E1', borderRadius: 8,
                  padding: '9px 18px', fontWeight: 500, fontSize: 14,
                  color: '#475569', cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                onClick={handleCommit}
                style={{
                  background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '9px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                Commit {entries.filter(e => e.scanStatus === 'ready').length} notices
              </button>
            </div>
          </div>
        )}

        {/* Phase: COMMITTING */}
        {phase === 'committing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '24px 0' }}>
            <Spinner size={32} color="#1D4ED8" />
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#334155' }}>
              Committing {entries.filter(e => e.scanStatus === 'ready').length} notices…
            </p>
            <div style={{ width: '100%', maxWidth: 480 }}>
              <div style={{ background: '#F1F5F9', borderRadius: 8, height: 10, overflow: 'hidden' }}>
                <div
                  style={{
                    background: '#1D4ED8', height: '100%', borderRadius: 8,
                    width: `${(commitProgress / Math.max(1, entries.filter(e => e.scanStatus === 'ready').length)) * 100}%`,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
                {commitProgress} / {entries.filter(e => e.scanStatus === 'ready').length}
              </p>
            </div>
          </div>
        )}

        {/* Phase: DONE */}
        {phase === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '24px 0' }}>
            <CheckCircle size={48} color="#10B981" />
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
              All done! {doneLinked + doneUnlinked} notice{doneLinked + doneUnlinked !== 1 ? 's' : ''} uploaded.
            </p>
            <div style={{ display: 'flex', gap: 24, fontSize: 14, color: '#475569' }}>
              <span>
                <span style={{ fontWeight: 700, color: '#10B981' }}>{doneLinked}</span> linked to plans
              </span>
              <span>
                <span style={{ fontWeight: 700, color: '#94A3B8' }}>{doneUnlinked}</span> saved to library only
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 28px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                marginTop: 8,
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Processing Card ───────────────────────────────────────────────────────────

function ProcessingCard({ entry }: { entry: WizardEntry }) {
  const { scanStatus, file, letter, error } = entry;

  const badge = (() => {
    switch (scanStatus) {
      case 'uploading': return { label: 'Uploading', bg: '#FEF3C7', color: '#92400E' };
      case 'scanning':  return { label: 'Scanning',  bg: '#DBEAFE', color: '#1D4ED8' };
      case 'ready':     return { label: 'Ready',     bg: '#D1FAE5', color: '#065F46' };
      case 'error':     return { label: 'Error',     bg: '#FEE2E2', color: '#991B1B' };
    }
  })();

  return (
    <div style={{
      border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      background: scanStatus === 'ready' ? '#F0FDF4' : '#fff',
    }}>
      {scanStatus === 'scanning' || scanStatus === 'uploading' ? (
        <Spinner size={16} color="#1D4ED8" />
      ) : scanStatus === 'ready' ? (
        <CheckCircle size={16} color="#10B981" />
      ) : (
        <XCircle size={16} color="#EF4444" />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </div>
        {scanStatus === 'ready' && letter && (
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
            {letter.address || '—'} {letter.ownerName ? `· ${letter.ownerName}` : ''}
          </div>
        )}
        {scanStatus === 'error' && error && (
          <div style={{ fontSize: 11, color: '#EF4444', marginTop: 2 }}>{error}</div>
        )}
      </div>
      <span style={{
        background: badge.bg, color: badge.color,
        borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      }}>
        {badge.label}
      </span>
    </div>
  );
}

// ── Review Row ────────────────────────────────────────────────────────────────

const COMMIT_STATUS_OPTIONS: { value: DrivewayLetterStatus; label: string }[] = [
  { value: 'sent',             label: 'Sent' },
  { value: 'approved',         label: 'Approved' },
  { value: 'submitted_to_metro', label: 'With Metro' },
  { value: 'draft',            label: 'Draft' },
];

function ReviewRow({
  entry,
  plans,
  isLast,
  onChange,
}: {
  entry: WizardEntry;
  plans: Plan[];
  isLast: boolean;
  onChange: (patch: Partial<WizardEntry>) => void;
}) {
  const { letter, selectedPlanId, commitStatus } = entry;
  const borderBottom = isLast ? 'none' : '1px solid #F1F5F9';

  return (
    <tr style={{ borderBottom }}>
      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
          {letter?.address || entry.file.name}
        </div>
        {letter?.ownerName && (
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            {letter.ownerName}
          </div>
        )}
      </td>
      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
        {letter?.segment ? (
          <span style={{
            background: '#ECFEFF', color: '#0E7490', border: '1px solid #A5F3FC',
            borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
          }}>
            {letter.segment}
          </span>
        ) : (
          <span style={{ color: '#CBD5E1', fontSize: 11 }}>—</span>
        )}
      </td>
      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
        <LOCPicker
          value={selectedPlanId}
          plans={plans}
          onChange={id => onChange({ selectedPlanId: id })}
        />
      </td>
      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
        <select
          value={commitStatus}
          onChange={e => onChange({ commitStatus: e.target.value as DrivewayLetterStatus })}
          style={{
            border: '1px solid #CBD5E1', borderRadius: 6, padding: '4px 8px',
            fontSize: 12, color: '#334155', background: '#fff', cursor: 'pointer',
          }}
        >
          {COMMIT_STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: '12px 4px', textAlign: 'center', verticalAlign: 'middle' }}>
        {selectedPlanId && <CheckCircle size={16} color="#10B981" />}
      </td>
    </tr>
  );
}

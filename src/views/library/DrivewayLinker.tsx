import React, { useState, useMemo } from 'react';
import { Link2, FileText, ChevronRight, CheckCircle, SkipForward, AlertCircle, Image, Map } from 'lucide-react';
import { Plan, DrivewayLetter, PlanDocument, StageAttachment } from '../../types';
import { linkDrivewayLetterToPlan } from '../../services/drivewayLetterService';
import { showToast } from '../../lib/toast';

interface DrivewayLinkerProps {
  plans: Plan[];
  letters: DrivewayLetter[];
}

// ── Scoring ──────────────────────────────────────────────────────────────────

const INACTIVE_STAGES = new Set([
  'plan_approved', 'approved', 'expired', 'closed', 'withdrawn', 'cancelled', 'implemented',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 3);
}

function scorePlanForLetter(plan: Plan, letter: DrivewayLetter): number {
  let score = 0;

  // 1. Segment match — strongest single signal (+40)
  const letterSeg = (letter.fields?.segment || letter.segment || '').toUpperCase();
  const planSeg   = (plan.segment || '').toUpperCase();
  if (letterSeg && planSeg && letterSeg === planSeg) score += 40;

  // 2. Street matching — all available letter text vs plan street fields
  const letterText = [
    letter.address,
    letter.fields?.street1,
    letter.fields?.street2,
    letter.fields?.drivewayImpactAddress,
    letter.fields?.recipientAddress,
  ].filter(Boolean).join(' ').toLowerCase();

  const planStreet1 = (plan.street1 || '').toLowerCase().trim();
  const planStreet2 = (plan.street2 || '').toLowerCase().trim();

  // Exact primary street match
  if (planStreet1 && letter.fields?.street1?.toLowerCase().trim() === planStreet1) {
    score += 35;
  } else if (planStreet1 && letterText.includes(planStreet1)) {
    // Street name appears anywhere in letter text
    score += 22;
  } else if (planStreet1) {
    // Partial token match
    const planTokens = tokenize(planStreet1);
    const letterTokens = tokenize(letterText);
    const shared = planTokens.filter(t => letterTokens.includes(t));
    score += Math.min(15, shared.length * 6);
  }

  // 3. Cross-street corroboration (+15)
  if (planStreet2 && letter.fields?.street2) {
    const ls2 = letter.fields.street2.toLowerCase();
    if (ls2.includes(planStreet2) || planStreet2.includes(ls2)) score += 15;
    else {
      const shared = tokenize(planStreet2).filter(t => tokenize(ls2).includes(t));
      if (shared.length > 0) score += 7;
    }
  }

  // 4. Active plan bonus (+10)
  if (!INACTIVE_STAGES.has(plan.stage)) score += 10;

  return Math.min(100, score);
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

interface DrawingDoc {
  label: string;
  url: string;
  docType: string;
  renderAs?: 'pdf' | 'image' | 'map';  // default = 'pdf'
}

function getPlanDrawings(plan: Plan): DrawingDoc[] {
  const docs: DrawingDoc[] = [];

  (plan.approvedLOCs || []).forEach((d: PlanDocument, i: number) => {
    docs.push({ label: `LOC Rev.${d.version ?? i + 1}`, url: d.url, docType: 'loc' });
  });

  (plan.approvedTCPs || []).forEach((d: PlanDocument, i: number) => {
    docs.push({ label: `TCP Rev.${d.version ?? i + 1}`, url: d.url, docType: 'tcp' });
  });

  const SHOW_TYPES = new Set(['loc_draft', 'loc_signed', 'tcp_drawings']);
  const TYPE_LABELS: Record<string, string> = {
    loc_draft:    'LOC Draft',
    loc_signed:   'LOC Signed',
    tcp_drawings: 'TCP',
  };
  (plan.stageAttachments || []).forEach((a: StageAttachment) => {
    if (SHOW_TYPES.has(a.documentType)) {
      docs.push({ label: TYPE_LABELS[a.documentType] ?? a.documentType, url: a.url, docType: a.documentType });
    }
  });

  return docs;
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-400' : 'bg-red-400';
  const text  = score >= 70 ? 'text-emerald-700' : score >= 40 ? 'text-amber-700' : 'text-red-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[10px] font-bold w-8 text-right ${text}`}>{score}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DrivewayLinker({ plans, letters }: DrivewayLinkerProps) {
  const [selectedLetter, setSelectedLetter] = useState<DrivewayLetter | null>(null);
  const [reviewPlan, setReviewPlan]         = useState<Plan | null>(null);
  const [viewerDoc, setViewerDoc]           = useState<DrawingDoc | null>(null);
  const [linking, setLinking]               = useState(false);

  // Track locally which plan locs have been linked during this session
  // (Firestore subscription will eventually update letters[], but we want instant feedback)
  const [sessionLinks, setSessionLinks] = useState<Record<string, string[]>>({});

  // Only surface letters with no linked plans at all
  const unlinked = useMemo(
    () => letters
      .filter(l => !(l.linkedPlanLocs?.length) && !l.planLoc)
      .sort((a, b) => (a.address || '').localeCompare(b.address || '')),
    [letters]
  );

  // Merged linked locs for selected letter: Firestore data + session additions
  const currentLinkedLocs = useMemo(() => {
    if (!selectedLetter) return [];
    const fromFirestore = selectedLetter.linkedPlanLocs || (selectedLetter.planLoc ? [selectedLetter.planLoc] : []);
    const fromSession   = sessionLinks[selectedLetter.id] || [];
    return [...new Set([...fromFirestore, ...fromSession])];
  }, [selectedLetter, sessionLinks]);

  // Score all active plans against the selected letter
  const candidates = useMemo(() => {
    if (!selectedLetter) return [];
    return plans
      .map(p => ({ plan: p, score: scorePlanForLetter(p, selectedLetter) }))
      .filter(c => c.score >= 25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
  }, [selectedLetter, plans]);

  const drawings = useMemo(() => reviewPlan ? getPlanDrawings(reviewPlan) : [], [reviewPlan]);

  const handleSelectLetter = (letter: DrivewayLetter) => {
    setSelectedLetter(letter);
    setReviewPlan(null);
    // If the letter has an exhibit image, pre-select it so the user sees something immediately
    if (letter.exhibitImageUrl) {
      setViewerDoc({ label: 'Exhibit', url: letter.exhibitImageUrl, docType: 'exhibit', renderAs: 'image' });
    } else {
      setViewerDoc(null);
    }
  };

  const handleSelectPlan = (plan: Plan) => {
    setReviewPlan(plan);
    const docs = getPlanDrawings(plan);
    setViewerDoc(docs[0] ?? null);
  };

  // Drawing panel tabs — plan docs + exhibit image (map is its own permanent panel now)
  const allViewerDocs = useMemo((): DrawingDoc[] => {
    const docs = reviewPlan ? getPlanDrawings(reviewPlan) : [];
    if (selectedLetter?.exhibitImageUrl) {
      docs.push({ label: 'Exhibit', url: selectedLetter.exhibitImageUrl, docType: 'exhibit', renderAs: 'image' });
    }
    return docs;
  }, [reviewPlan, selectedLetter]);

  const mapEmbedUrl = useMemo(() => {
    if (!selectedLetter?.address) return null;
    const q = encodeURIComponent(`${selectedLetter.address}, Los Angeles, CA`);
    return `https://maps.google.com/maps?q=${q}&output=embed`;
  }, [selectedLetter?.address]);

  const mapOpenUrl = useMemo(() => {
    if (!selectedLetter?.address) return null;
    const q = encodeURIComponent(`${selectedLetter.address}, Los Angeles, CA`);
    return `https://maps.google.com/maps?q=${q}`;
  }, [selectedLetter?.address]);

  const handleLink = async () => {
    if (!selectedLetter || !reviewPlan) return;
    setLinking(true);
    try {
      await linkDrivewayLetterToPlan(selectedLetter, reviewPlan);
      // Record in session state for instant UI feedback (Firestore sub catches up async)
      setSessionLinks(prev => ({
        ...prev,
        [selectedLetter.id]: [...(prev[selectedLetter.id] || []), reviewPlan.loc],
      }));
      showToast(`Linked to ${reviewPlan.loc}`, 'success');
      // Clear the plan selection so user can optionally pick another plan
      setReviewPlan(null);
      setViewerDoc(null);
    } catch (err: any) {
      showToast(`Failed to link: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setLinking(false);
    }
  };

  const handleDone = () => {
    if (!selectedLetter) return;
    // Advance to next unlinked letter
    const remaining = unlinked.filter(l => l.id !== selectedLetter.id);
    const next = remaining[0] ?? null;
    setSelectedLetter(next);
    setReviewPlan(null);
    setViewerDoc(null);
    if (next?.exhibitImageUrl) {
      setViewerDoc({ label: 'Exhibit', url: next.exhibitImageUrl, docType: 'exhibit', renderAs: 'image' });
    }
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (unlinked.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CheckCircle size={40} className="text-emerald-500 mb-3" />
        <div className="text-base font-bold text-slate-700 dark:text-slate-200">All notices are linked</div>
        <div className="text-sm text-slate-400 mt-1">Every driveway notice has a plan LOC assigned.</div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-full">

      {/* ── Left: Unlinked letters ──────────────────────────────────────���───── */}
      <div className="w-64 flex-shrink-0 flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Link2 size={13} />
            Unlinked Notices
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{unlinked.length} need a plan LOC</div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
          {unlinked.map(l => (
            <button
              key={l.id}
              onClick={() => handleSelectLetter(l)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${
                selectedLetter?.id === l.id
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500'
                  : ''
              }`}
            >
              <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                {l.address || 'Unknown address'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[9px] font-bold">
                  {l.fields?.segment || l.segment || '—'}
                </span>
                <span className="capitalize">{l.status}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: Review panel ────────────────────────────────────────────── */}
      {selectedLetter ? (
        <div className="flex-1 flex flex-col gap-3 min-w-0">

          {/* Letter summary strip */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white dark:bg-slate-800 flex-shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {selectedLetter.address || 'Unknown address'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-3">
                  <span><span className="font-semibold text-slate-600 dark:text-slate-300">Segment:</span> {selectedLetter.fields?.segment || selectedLetter.segment || '—'}</span>
                  <span><span className="font-semibold text-slate-600 dark:text-slate-300">Street:</span> {selectedLetter.fields?.street1 || '—'}</span>
                  <span><span className="font-semibold text-slate-600 dark:text-slate-300">Cross:</span> {selectedLetter.fields?.street2 || '—'}</span>
                  <span><span className="font-semibold text-slate-600 dark:text-slate-300">Dates:</span> {selectedLetter.fields?.workDates || '—'}</span>
                </div>
                {/* Linked LOC chips */}
                {currentLinkedLocs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {currentLinkedLocs.map(loc => (
                      <span key={loc} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <CheckCircle size={9} />
                        {loc}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedLetter.letterUrl && (
                  <a
                    href={selectedLetter.letterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                  >
                    <FileText size={13} />
                    View letter
                  </a>
                )}
                {currentLinkedLocs.length > 0 && (
                  <button
                    onClick={handleDone}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-white bg-slate-700 hover:bg-slate-900 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-lg transition-colors"
                  >
                    Done →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Candidates · [Map / Drawing stacked] */}
          <div className="flex gap-3 flex-1 min-h-0">

            {/* ── Candidate plans ─────────────────────────────────────────── */}
            <div className="w-48 flex-shrink-0 flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Candidate Plans
              </div>
              {candidates.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
                  <AlertCircle size={20} className="text-slate-300" />
                  <div className="text-xs text-slate-400">No strong matches.<br />Check segment + street.</div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
                  {candidates.map(({ plan, score }) => (
                    <button
                      key={plan.id}
                      onClick={() => handleSelectPlan(plan)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${
                        reviewPlan?.id === plan.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold font-mono text-slate-800 dark:text-slate-100">{plan.loc}</span>
                        <ChevronRight size={12} className="text-slate-300" />
                      </div>
                      <ScoreBar score={score} />
                      <div className="text-[10px] text-slate-400 mt-1 truncate">{plan.street1}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Right column: Map (top) + Drawing (bottom) ──────────────── */}
            <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">

            {/* ── Street Map ─────────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 min-w-0 min-h-0">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <Map size={11} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Street Map</span>
                <span className="text-[10px] text-slate-400 truncate">{selectedLetter.address}</span>
                {mapOpenUrl && (
                  <a
                    href={mapOpenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-[10px] font-semibold text-blue-500 hover:text-blue-700 flex-shrink-0"
                  >
                    Open ↗
                  </a>
                )}
              </div>
              {mapEmbedUrl ? (
                <iframe
                  key={mapEmbedUrl}
                  src={mapEmbedUrl}
                  className="flex-1 w-full border-0"
                  title="Street map"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400">No address available</div>
              )}
            </div>

            {/* ── Drawing viewer ──────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 min-w-0 min-h-0">
              {reviewPlan ? (
                <>
                  {/* Plan header + doc tabs */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 flex-wrap flex-shrink-0">
                    <span className="text-[11px] font-bold font-mono text-slate-800 dark:text-slate-100">{reviewPlan.loc}</span>
                    <span className="text-[10px] text-slate-400">Seg {reviewPlan.segment}</span>
                    <div className="ml-auto flex flex-wrap gap-1">
                      {allViewerDocs.length === 0 ? (
                        <span className="text-[10px] text-slate-400 italic">No docs</span>
                      ) : allViewerDocs.map((d, i) => (
                        <button
                          key={i}
                          onClick={() => setViewerDoc(d)}
                          className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${
                            viewerDoc?.url === d.url
                              ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          {d.renderAs === 'image' ? <Image size={10} /> : <FileText size={10} />}
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Content */}
                  {viewerDoc ? (
                    viewerDoc.renderAs === 'image' ? (
                      <div className="flex-1 overflow-auto flex items-start justify-center p-4 bg-slate-50 dark:bg-slate-900">
                        <img src={viewerDoc.url} alt="Exhibit" className="max-w-full rounded-lg shadow-md border border-slate-200 dark:border-slate-700" />
                      </div>
                    ) : (
                      <iframe key={viewerDoc.url} src={viewerDoc.url} className="flex-1 w-full border-0" title={`${reviewPlan.loc} — ${viewerDoc.label}`} />
                    )
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500 text-center p-4">
                      {allViewerDocs.length > 0 ? 'Select a document above' : 'No drawings attached to this plan.'}
                    </div>
                  )}

                  {/* Link / Skip footer */}
                  <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between flex-shrink-0">
                    <button
                      onClick={() => { setReviewPlan(null); setViewerDoc(null); }}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      <SkipForward size={13} />
                      {currentLinkedLocs.length > 0 ? 'Pick another plan' : 'Skip plan'}
                    </button>
                    <button
                      onClick={handleLink}
                      disabled={linking || currentLinkedLocs.includes(reviewPlan.loc)}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg transition-colors"
                    >
                      <Link2 size={13} />
                      {linking ? 'Linking…' : currentLinkedLocs.includes(reviewPlan.loc) ? `Already linked` : `Link to ${reviewPlan.loc}`}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-6">
                  <FileText size={28} className="text-slate-200 dark:text-slate-600" />
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    Select a candidate plan<br />to preview its drawings
                  </div>
                </div>
              )}
            </div>
            </div>{/* end right column */}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <Link2 size={28} className="text-slate-200 dark:text-slate-600" />
          <div className="text-sm text-slate-400 dark:text-slate-500">
            Select an unlinked notice on the left to begin
          </div>
        </div>
      )}
    </div>
  );
}

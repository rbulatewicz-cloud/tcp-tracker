import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, CheckCircle, FileText, ExternalLink, RefreshCw, Wand2, Upload, Plus, ChevronDown, ChevronUp, X, Link2, Search, Trash2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plan, AppConfig, DrivewayLetter, DrivewayAddress, DrivewayLetterStatus, DrivewayProperty, User } from '../../types';
import { subscribeToDrivewayLetters, updateDrivewayLetter } from '../../services/drivewayLetterService';
import { subscribeToDrivewayProperties } from '../../services/drivewayPropertyService';
import { fmtDate as fmt } from '../../utils/plans';
import { DraftLetterModal } from './DraftLetterModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00');
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function refDate(plan: Plan): string | null {
  return plan.softImplementationWindow?.startDate || plan.needByDate || null;
}

/**
 * How many days have the plan's work dates shifted since a notice was sent?
 * Returns 0 if the address wasn't sent, has no sentWindowStart, or was dismissed.
 */
function dateShiftDays(addr: DrivewayAddress, plan: Plan): number {
  if (!addr.noticeSent || !addr.sentWindowStart || addr.dateShiftDismissed) return 0;
  const currentRef = plan.implementationWindow?.startDate ?? plan.softImplementationWindow?.startDate;
  if (!currentRef) return 0;
  const sentMs    = new Date(addr.sentWindowStart + 'T00:00:00').getTime();
  const currentMs = new Date(currentRef           + 'T00:00:00').getTime();
  return Math.abs(Math.round((currentMs - sentMs) / (1000 * 60 * 60 * 24)));
}

/** Adds a new DrivewayAddress directly to the plan's drivewayNotices track in Firestore */
async function addAddressToPlan(plan: Plan, newAddr: DrivewayAddress): Promise<void> {
  const planRef = doc(db, 'plans', plan.id);
  const existing = plan.compliance?.drivewayNotices?.addresses ?? [];
  if (!plan.compliance?.drivewayNotices) {
    // Initialize the track if it doesn't exist yet
    await updateDoc(planRef, {
      'compliance.drivewayNotices': {
        status: 'not_started',
        triggeredBy: ['impact_driveway'],
        addresses: [newAddr],
        notes: '',
      },
    });
  } else {
    await updateDoc(planRef, {
      'compliance.drivewayNotices.addresses': [...existing, newAddr],
    });
  }
}

/** Removes the letter link from a DrivewayAddress (clears letterId + letterStatus) */
async function unlinkLetterFromAddress(plan: Plan, addrId: string): Promise<void> {
  const planRef = doc(db, 'plans', plan.id);
  const existing = plan.compliance?.drivewayNotices?.addresses ?? [];
  const updated = existing.map(a => {
    if (a.id !== addrId) return a;
    // Strip letter-link fields cleanly
    const { letterId: _l, letterStatus: _ls, ...rest } = a;
    return rest as DrivewayAddress;
  });
  await updateDoc(planRef, { 'compliance.drivewayNotices.addresses': updated });
}

/** Removes a DrivewayAddress from the plan's drivewayNotices track */
async function removeAddressFromPlan(plan: Plan, addrId: string): Promise<void> {
  const planRef = doc(db, 'plans', plan.id);
  const existing = plan.compliance?.drivewayNotices?.addresses ?? [];
  await updateDoc(planRef, {
    'compliance.drivewayNotices.addresses': existing.filter(a => a.id !== addrId),
  });
}

/**
 * Links an existing Library letter to a specific driveway address on the plan.
 * Updates the address record on the plan (letterId + letterStatus) and back-fills
 * the letter's addressId / planId if not already set.
 */
async function linkLetterToAddress(
  plan: Plan,
  addr: DrivewayAddress,
  letter: DrivewayLetter,
): Promise<void> {
  // 1. Update the address entry on the plan
  const planRef  = doc(db, 'plans', plan.id);
  const existing = plan.compliance?.drivewayNotices?.addresses ?? [];
  const updated  = existing.map(a =>
    a.id === addr.id
      ? { ...a, letterId: letter.id, letterStatus: letter.status }
      : a
  );
  await updateDoc(planRef, { 'compliance.drivewayNotices.addresses': updated });

  // 2. Back-fill the letter's address link if it isn't set already
  if (!letter.addressId) {
    await updateDrivewayLetter(letter.id, {
      addressId: addr.id,
      planId:    plan.id,
      planLoc:   plan.loc || plan.id,
    });
  }
}

type Tier = 'overdue' | 'tight' | 'reissue_needed' | 'with_metro' | 'needs_attention';

interface QueueItem {
  plan: Plan;
  ref: string | null;
  daysLeft: number | null;
  addresses: DrivewayAddress[];
  planLetters: DrivewayLetter[];
  tier: Tier;
  maxShiftDays: number;
}

const TIER_ORDER: Tier[] = ['overdue', 'tight', 'reissue_needed', 'with_metro', 'needs_attention'];

const TIER_META: Record<Tier, { label: string; color: string; dot: string; icon: React.ReactNode }> = {
  overdue:         { label: 'Overdue',           color: 'text-red-700',    dot: 'bg-red-500',    icon: <AlertTriangle size={13} className="text-red-500" /> },
  tight:           { label: 'Tight Lead Time',   color: 'text-amber-700',  dot: 'bg-amber-500',  icon: <Clock size={13} className="text-amber-500" /> },
  reissue_needed:  { label: 'Re-issue Needed',   color: 'text-orange-700', dot: 'bg-orange-500', icon: <RefreshCw size={13} className="text-orange-500" /> },
  with_metro:      { label: 'With Metro',         color: 'text-indigo-700', dot: 'bg-indigo-500', icon: <FileText size={13} className="text-indigo-500" /> },
  needs_attention: { label: 'Needs Attention',   color: 'text-slate-600',  dot: 'bg-slate-400',  icon: <FileText size={13} className="text-slate-400" /> },
};

const STATUS_BADGE: Record<DrivewayLetterStatus, { label: string; cls: string }> = {
  not_drafted:              { label: 'Not Drafted',   cls: 'bg-slate-100 text-slate-500' },
  draft:                    { label: 'Draft',          cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  submitted_to_metro:       { label: 'With Metro',    cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  metro_revision_requested: { label: 'Metro: Revise', cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  approved:                 { label: 'Approved',      cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  sent:                     { label: 'Sent',           cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
};

// ── Queue row ─────────────────────────────────────────────────────────────────

/** Wraps the matched portion of text in a highlight span */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-yellow-800 rounded-sm px-0.5 not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/**
 * Finds the most recent sent/approved letter for this address on a *different* plan.
 * Used to detect LOC renewal scenarios (e.g. 362.1 → 362.2) and offer Re-notice pre-fill.
 * Matches by propertyId (preferred) or normalised address string.
 */
function findPriorLetter(
  addr: DrivewayAddress,
  allLetters: DrivewayLetter[],
  currentPlanId: string,
): DrivewayLetter | null {
  const MATURE: DrivewayLetterStatus[] = ['sent', 'approved'];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    allLetters
      .filter(l => {
        if (l.planId === currentPlanId) return false;
        if (!MATURE.includes(l.status)) return false;
        if (addr.propertyId && l.propertyId === addr.propertyId) return true;
        if (addr.address && l.address && norm(l.address) === norm(addr.address)) return true;
        return false;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null
  );
}

/** Returns true when the address still needs a new letter drafted/uploaded */
function needsNewLetter(
  addr: DrivewayAddress,
  planLetters: DrivewayLetter[],
  isReissue: boolean,
): boolean {
  if (isReissue) return true; // dates shifted — all addresses need fresh notices
  const letter = addr.letterId ? planLetters.find(l => l.id === addr.letterId) : null;
  const status: DrivewayLetterStatus = letter?.status ?? addr.letterStatus ?? 'not_drafted';
  return status === 'not_drafted';
}

function QueueRow({
  item,
  onOpen,
  onDraftLetter,
  canDraft,
  properties,
  allLetters,
}: {
  item: QueueItem;
  onOpen: () => void;
  onDraftLetter: (addr: DrivewayAddress, parentLetter?: DrivewayLetter) => void;
  canDraft: boolean;
  properties: DrivewayProperty[];
  allLetters: DrivewayLetter[];
}) {
  const { plan, ref, daysLeft, addresses, planLetters, tier, maxShiftDays } = item;
  const dn = plan.compliance?.drivewayNotices;

  const [showDetails,        setShowDetails]        = useState(false);
  const [addingAddress,      setAddingAddress]      = useState(false);
  const [newAddrText,        setNewAddrText]        = useState('');
  const [newOwnerName,       setNewOwnerName]       = useState('');
  const [addingSaving,       setAddingSaving]       = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(undefined);
  const [showSuggestions,    setShowSuggestions]    = useState(false);

  // Link-existing state
  const [linkingForAddrId, setLinkingForAddrId] = useState<string | null>(null);
  const [linkSearch,       setLinkSearch]       = useState('');
  const [linkSaving,       setLinkSaving]       = useState(false);

  // Delete / unlink state
  const [deletingAddrId,  setDeletingAddrId]  = useState<string | null>(null);
  const [unlinkingAddrId, setUnlinkingAddrId] = useState<string | null>(null);

  // Filter property library suggestions as the user types
  const suggestions: DrivewayProperty[] = newAddrText.trim().length >= 1
    ? properties
        .filter(p => p.address.toLowerCase().includes(newAddrText.toLowerCase()))
        .slice(0, 6)
    : [];

  // Effective letter status per address (prefer fresh library data)
  const addrStatuses: DrivewayLetterStatus[] = addresses.map(addr => {
    if (addr.letterId) {
      const lib = planLetters.find(l => l.id === addr.letterId);
      if (lib) return lib.status;
    }
    return addr.letterStatus ?? 'not_drafted';
  });

  const sentCount    = addrStatuses.filter(s => s === 'sent').length;
  const metroCount   = addrStatuses.filter(s => s === 'submitted_to_metro' || s === 'metro_revision_requested').length;
  const draftCount   = addrStatuses.filter(s => s === 'draft' || s === 'approved').length;
  const missingCount = addrStatuses.filter(s => s === 'not_drafted').length;

  const actionableAddrs = addresses.filter(a =>  needsNewLetter(a, planLetters, tier === 'reissue_needed'));
  // Addresses already linked to a letter but not needing a new one — show unlink/delete controls
  const managedAddrs    = addresses.filter(a => !actionableAddrs.includes(a));

  const daysColor = daysLeft === null ? 'text-slate-400'
    : daysLeft < 0  ? 'text-red-600 font-bold'
    : daysLeft < 7  ? 'text-red-600 font-semibold'
    : daysLeft < 14 ? 'text-amber-600 font-semibold'
    : 'text-slate-500';

  const usingSoftWindow = !!plan.softImplementationWindow?.startDate;
  const isReissue = tier === 'reissue_needed';

  const win = plan.implementationWindow;

  /** Letters visible in the link picker for a given address */
  function getLinkableLetters(addr: DrivewayAddress): DrivewayLetter[] {
    const q = linkSearch.toLowerCase().trim();
    return allLetters
      .filter(l => {
        // Exclude letters already linked to a different address on this plan
        if (l.addressId && l.addressId !== addr.id) return false;
        // Primary: any letter for this plan
        const onThisPlan = l.planId === plan.id;
        // Secondary: letter whose address partially matches
        const addrMatch  = addr.address && l.address?.toLowerCase().includes(addr.address.toLowerCase());
        if (!onThisPlan && !addrMatch) return false;
        // Apply search filter
        if (q) {
          const haystack = [l.address, l.planLoc, l.ownerName, l.fields?.recipientName, l.status]
            .filter(Boolean).join(' ').toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .slice(0, 8);
  }

  const handleLinkLetter = async (addr: DrivewayAddress, letter: DrivewayLetter) => {
    setLinkSaving(true);
    try {
      await linkLetterToAddress(plan, addr, letter);
      setLinkingForAddrId(null);
      setLinkSearch('');
    } catch {
      // non-fatal
    } finally {
      setLinkSaving(false);
    }
  };

  const handleAddAddress = async () => {
    if (!newAddrText.trim()) return;
    setAddingSaving(true);
    try {
      const newAddr: DrivewayAddress = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        address: newAddrText.trim(),
        ...(newOwnerName.trim()    ? { ownerName:   newOwnerName.trim()  } : {}),
        ...(selectedPropertyId     ? { propertyId:  selectedPropertyId   } : {}),
      };
      await addAddressToPlan(plan, newAddr);
      setNewAddrText('');
      setNewOwnerName('');
      setSelectedPropertyId(undefined);
      setAddingAddress(false);
    } catch {
      // error is non-fatal — user can retry
    } finally {
      setAddingSaving(false);
    }
  };

  return (
    <div className={`bg-white border rounded-lg px-4 py-3 transition-colors ${
      isReissue ? 'border-orange-200 hover:border-orange-300' : 'border-slate-200 hover:border-slate-300'
    }`}>

      {/* ── Top row: header + Open button ── */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Plan ID + meta chips */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-slate-800 text-sm">{plan.loc || plan.id}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{plan.type}</span>
            {plan.segment && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Seg {plan.segment}</span>
            )}
            {ref && (
              <span className={`text-[11px] ${daysColor}`}>
                {daysLeft === null ? ''
                  : daysLeft < 0  ? `${Math.abs(daysLeft)}d overdue`
                  : daysLeft === 0 ? 'Due today'
                  : `${daysLeft}d left`}
                {' · '}{usingSoftWindow ? 'est.' : 'need-by'} {fmt(ref)}
              </span>
            )}
            {!ref && <span className="text-[11px] text-slate-400 italic">No date set</span>}
          </div>

          {/* Location */}
          <div className="text-[12px] text-slate-600 mb-1.5 truncate">
            {[plan.street1, plan.street2].filter(Boolean).join(' / ') || plan.scope || '—'}
          </div>

          {/* Address status badges */}
          {addresses.length === 0 ? (
            <div className="text-[11px] text-slate-400 italic">No addresses added yet</div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-500 mr-1">
                {addresses.length} address{addresses.length !== 1 ? 'es' : ''}:
              </span>
              {addrStatuses.map((s, i) => (
                <span
                  key={i}
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[s].cls}`}
                  title={addresses[i]?.address || `Address ${i + 1}`}
                >
                  {STATUS_BADGE[s].label}
                </span>
              ))}
            </div>
          )}

          {/* Progress summary */}
          {addresses.length > 0 && !isReissue && (
            <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-400">
              {sentCount > 0    && <span className="text-emerald-600 font-semibold">✓ {sentCount} sent</span>}
              {metroCount > 0   && <span className="text-indigo-600 font-semibold">↻ {metroCount} with Metro</span>}
              {draftCount > 0   && <span className="text-amber-600 font-semibold">✎ {draftCount} in progress</span>}
              {missingCount > 0 && <span className="text-slate-500">○ {missingCount} not started</span>}
            </div>
          )}

          {/* Re-issue banner */}
          {isReissue && maxShiftDays > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-orange-50 border border-orange-200 px-2.5 py-1.5">
              <RefreshCw size={11} className="text-orange-500 flex-shrink-0" />
              <p className="text-[11px] text-orange-700 font-semibold">
                Work dates shifted <span className="font-bold">{maxShiftDays} day{maxShiftDays !== 1 ? 's' : ''}</span> since notices were sent
                — new notices may need to go out.
              </p>
            </div>
          )}

          {dn?.notes && (
            <div className="mt-1 text-[10px] text-slate-400 italic truncate">{dn.notes}</div>
          )}
        </div>

        {/* Action buttons (top-right) */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 mt-0.5">
          <button
            onClick={onOpen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Open All Letters for this plan (upload zone included)"
          >
            <ExternalLink size={12} />
            Open
          </button>
          <button
            onClick={() => setShowDetails(v => !v)}
            className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showDetails ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {showDetails ? 'Hide details' : 'Plan details'}
          </button>
        </div>
      </div>

      {/* ── Collapsible plan details ── */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
          <div>
            <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wide block mb-0.5">Implementation Window</span>
            {win ? (
              <span className="text-slate-700 font-semibold">{win.startDate} → {win.endDate}</span>
            ) : (
              <span className="text-amber-600 font-semibold italic">⚠ No dates set</span>
            )}
          </div>
          <div>
            <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wide block mb-0.5">Lead Engineer</span>
            <span className="text-slate-700">{plan.lead || '—'}</span>
          </div>
          {plan.scope && (
            <div className="col-span-2">
              <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wide block mb-0.5">Scope</span>
              <span className="text-slate-600 leading-snug">{plan.scope}</span>
            </div>
          )}
          {plan.notes && (
            <div className="col-span-2">
              <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wide block mb-0.5">Notes</span>
              <span className="text-slate-500 italic leading-snug">{plan.notes}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Per-address draft actions ── */}
      {actionableAddrs.length > 0 && (
        <div className={`mt-3 pt-3 border-t space-y-2 ${isReissue ? 'border-orange-100' : 'border-slate-100'}`}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
            {isReissue ? 'New notices needed' : 'Start a notice'}
          </p>
          {actionableAddrs.map(addr => {
            const isLinking     = linkingForAddrId === addr.id;
            const linkable      = isLinking ? getLinkableLetters(addr) : [];

            return (
              <div key={addr.id} className="space-y-2">
                {/* Action buttons row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-slate-600 flex-1 min-w-0 truncate" title={addr.address}>
                    {addr.address || `Address ${addresses.indexOf(addr) + 1}`}
                  </span>
                  {canDraft && (() => {
                    const prior = findPriorLetter(addr, allLetters, plan.id);
                    return prior ? (
                      <>
                        <button
                          onClick={() => onDraftLetter(addr, prior)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[10px] font-bold hover:bg-teal-700 transition-colors flex-shrink-0"
                          title={`Re-notice based on prior letter from ${prior.planLoc}`}
                        >
                          <RefreshCw size={10} />
                          Re-notice ↻
                        </button>
                        <button
                          onClick={() => onDraftLetter(addr)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 text-[10px] font-semibold hover:bg-blue-50 transition-colors flex-shrink-0"
                          title="Draft a brand-new letter from scratch"
                        >
                          <Wand2 size={10} />
                          New draft
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onDraftLetter(addr)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-700 transition-colors flex-shrink-0"
                      >
                        <Wand2 size={10} />
                        Draft with AI
                      </button>
                    );
                  })()}
                  <button
                    onClick={onOpen}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-[10px] font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors flex-shrink-0"
                    title="Go to All Letters to upload a previous notice"
                  >
                    <Upload size={10} />
                    Upload
                  </button>
                  <button
                    onClick={() => {
                      setLinkingForAddrId(isLinking ? null : addr.id);
                      setLinkSearch('');
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-colors flex-shrink-0 ${
                      isLinking
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                    title="Link a letter that already exists in the Library"
                  >
                    <Link2 size={10} />
                    Link existing
                  </button>

                  {/* Delete address */}
                  <button
                    onClick={async () => {
                      setDeletingAddrId(addr.id);
                      try { await removeAddressFromPlan(plan, addr.id); }
                      finally { setDeletingAddrId(null); }
                    }}
                    disabled={deletingAddrId === addr.id}
                    className="flex items-center justify-center w-6 h-6 rounded border border-slate-200 text-slate-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors flex-shrink-0"
                    title="Remove this address"
                  >
                    {deletingAddrId === addr.id ? '…' : <Trash2 size={10} />}
                  </button>
                </div>

                {/* Link picker (inline, expands below buttons) */}
                {isLinking && (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2.5 space-y-2">
                    {/* Search input */}
                    <div className="relative">
                      <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={linkSearch}
                        onChange={e => setLinkSearch(e.target.value)}
                        placeholder="Search letters by address, plan, or status…"
                        autoFocus
                        className="w-full pl-7 pr-3 py-1.5 rounded border border-indigo-200 bg-white text-[11px] outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                    </div>

                    {/* Results list */}
                    {linkable.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic px-1">
                        {linkSearch ? 'No letters match that search.' : 'No letters found for this plan or address.'}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {linkable.map(letter => (
                          <div key={letter.id} className="flex items-center gap-2 bg-white rounded border border-slate-200 px-2.5 py-1.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[letter.status].cls}`}>
                                  {STATUS_BADGE[letter.status].label}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-700 truncate">{letter.address}</span>
                                {letter.planId !== plan.id && (
                                  <span className="text-[9px] text-slate-400">{letter.planLoc}</span>
                                )}
                              </div>
                              {letter.ownerName && (
                                <p className="text-[10px] text-slate-400 mt-0.5">{letter.ownerName}</p>
                              )}
                              <p className="text-[9px] text-slate-300 mt-0.5">Created {fmt(letter.createdAt)}</p>
                            </div>
                            <button
                              onClick={() => handleLinkLetter(addr, letter)}
                              disabled={linkSaving}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex-shrink-0"
                            >
                              <Link2 size={10} />
                              {linkSaving ? '…' : 'Link'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[9px] text-indigo-500 px-0.5">
                      Showing letters for this plan + any letter matching this address.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Linked / in-progress addresses (management) ── */}
      {managedAddrs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Linked notices</p>
          {managedAddrs.map(addr => {
            const s = addrStatuses[addresses.indexOf(addr)] ?? 'not_drafted';
            return (
              <div key={addr.id} className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[s].cls}`}>
                  {STATUS_BADGE[s].label}
                </span>
                <span className="text-[11px] text-slate-600 flex-1 min-w-0 truncate" title={addr.address}>
                  {addr.address}
                </span>

                {/* Unlink letter */}
                {addr.letterId && (
                  <button
                    onClick={async () => {
                      setUnlinkingAddrId(addr.id);
                      try { await unlinkLetterFromAddress(plan, addr.id); }
                      finally { setUnlinkingAddrId(null); }
                    }}
                    disabled={unlinkingAddrId === addr.id}
                    className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-semibold text-slate-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-40 transition-colors flex-shrink-0"
                    title="Remove the letter link from this address"
                  >
                    <Link2 size={10} />
                    {unlinkingAddrId === addr.id ? '…' : 'Unlink'}
                  </button>
                )}

                {/* Delete address */}
                <button
                  onClick={async () => {
                    setDeletingAddrId(addr.id);
                    try { await removeAddressFromPlan(plan, addr.id); }
                    finally { setDeletingAddrId(null); }
                  }}
                  disabled={deletingAddrId === addr.id}
                  className="flex items-center justify-center w-6 h-6 rounded border border-slate-200 text-slate-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors flex-shrink-0"
                  title="Remove this address"
                >
                  {deletingAddrId === addr.id ? '…' : <Trash2 size={10} />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add address section ── */}
      <div className={`mt-3 pt-3 border-t ${isReissue ? 'border-orange-100' : 'border-slate-100'}`}>
        {!addingAddress ? (
          <button
            onClick={() => setAddingAddress(true)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-blue-600 transition-colors"
          >
            <Plus size={12} />
            {addresses.length === 0 ? 'Add address to start notice' : 'Add another address'}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Add Driveway Address</p>
            <div className="flex gap-2 flex-wrap">
              {/* Address input with property library autocomplete */}
              <div className="flex-1 min-w-[180px] relative">
                <input
                  type="text"
                  value={newAddrText}
                  onChange={e => {
                    setNewAddrText(e.target.value);
                    setSelectedPropertyId(undefined); // clear link if user edits manually
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  handleAddAddress();
                    if (e.key === 'Escape') { setAddingAddress(false); setNewAddrText(''); setNewOwnerName(''); setSelectedPropertyId(undefined); }
                  }}
                  placeholder="e.g. 1234 Van Nuys Blvd"
                  autoFocus
                  className={`w-full rounded border px-2.5 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-blue-300 ${
                    selectedPropertyId ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'
                  }`}
                />
                {/* Linked property indicator */}
                {selectedPropertyId && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full pointer-events-none">
                    📚 Library
                  </span>
                )}
                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                    {suggestions.map(prop => (
                      <button
                        key={prop.id}
                        onMouseDown={() => {
                          setNewAddrText(prop.address);
                          setNewOwnerName(prop.ownerName || '');
                          setSelectedPropertyId(prop.id);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-0 flex items-baseline gap-2 transition-colors"
                      >
                        <span className="text-[12px] text-slate-800 font-medium flex-1 min-w-0 truncate">
                          <HighlightMatch text={prop.address} query={newAddrText} />
                        </span>
                        {prop.ownerName && (
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{prop.ownerName}</span>
                        )}
                      </button>
                    ))}
                    <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100">
                      <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">From property library</span>
                    </div>
                  </div>
                )}
              </div>
              <input
                type="text"
                value={newOwnerName}
                onChange={e => setNewOwnerName(e.target.value)}
                placeholder="Owner name (optional)"
                className="w-44 rounded border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-blue-300"
              />
              <button
                onClick={handleAddAddress}
                disabled={!newAddrText.trim() || addingSaving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors flex-shrink-0"
              >
                {addingSaving ? '…' : 'Add'}
              </button>
              <button
                onClick={() => { setAddingAddress(false); setNewAddrText(''); setNewOwnerName(''); }}
                className="flex items-center justify-center w-7 h-7 rounded border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors flex-shrink-0"
              >
                <X size={12} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              Address will be added to this plan's driveway notices. You can then draft or upload a letter for it.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

interface CRQueueSectionProps {
  plans: Plan[];
  appConfig: AppConfig;
  onOpenPlanLetters: (plan: Plan) => void;
  currentUser: User | null;
}

export function CRQueueSection({ plans, appConfig, onOpenPlanLetters, currentUser }: CRQueueSectionProps) {
  const [letters,    setLetters]    = useState<DrivewayLetter[]>([]);
  const [properties, setProperties] = useState<DrivewayProperty[]>([]);
  const [draftTarget, setDraftTarget] = useState<{ plan: Plan; addr: DrivewayAddress; parentLetter?: DrivewayLetter } | null>(null);
  useEffect(() => subscribeToDrivewayLetters(setLetters), []);
  useEffect(() => subscribeToDrivewayProperties(setProperties), []);

  const leadTimeDays = appConfig.driveway_leadTimeDays ?? 10;
  const reissueDays  = appConfig.driveway_reissueDays  ?? 5;

  // Build queue items from all plans with driveway impact that aren't complete
  const DONE_STAGES  = new Set(['closed', 'cancelled']);
  const DONE_STATUSES = new Set(['completed', 'na']);

  const items: QueueItem[] = plans
    .filter(p => {
      if (!p.impact_driveway) return false;
      if (p.isHistorical) return false;
      if (DONE_STAGES.has(p.stage)) return false;
      const dn = p.compliance?.drivewayNotices;
      if (!dn) return true; // triggered but no track yet
      if (DONE_STATUSES.has(dn.status)) return false;
      const addrs = dn.addresses ?? [];
      if (addrs.length > 0) {
        const allSent = addrs.every(a => {
          if (a.letterId) {
            const lib = letters.find(l => l.id === a.letterId);
            return lib ? lib.status === 'sent' : a.letterStatus === 'sent';
          }
          return a.letterStatus === 'sent' || a.noticeSent;
        });
        if (allSent) {
          // Re-surface if work dates have shifted enough since notices went out
          const needsReissue = addrs.some(a => dateShiftDays(a, p) >= reissueDays);
          return needsReissue;
        }
      }
      return true;
    })
    .map(plan => {
      const rd        = refDate(plan);
      const dl        = rd ? daysUntil(rd) : null;
      const addrs     = plan.compliance?.drivewayNotices?.addresses ?? [];
      const planLetters = letters.filter(l => l.planId === plan.id);

      // Max shift days across all addresses (for re-issue display)
      const maxShift = addrs.length > 0
        ? Math.max(0, ...addrs.map(a => dateShiftDays(a, plan)))
        : 0;

      // Is every address already sent?
      const allSent = addrs.length > 0 && addrs.every(a => {
        if (a.letterId) {
          const lib = planLetters.find(l => l.id === a.letterId);
          return lib ? lib.status === 'sent' : a.letterStatus === 'sent';
        }
        return a.letterStatus === 'sent' || a.noticeSent;
      });

      // Determine tier
      let tier: Tier = 'needs_attention';
      if (allSent && maxShift >= reissueDays) {
        // All notices sent but dates have moved — re-issue needed
        tier = 'reissue_needed';
      } else if (dl !== null && dl < 0) {
        tier = 'overdue';
      } else if (dl !== null && dl < leadTimeDays) {
        tier = 'tight';
      } else {
        const hasMetro = addrs.some(a => {
          if (a.letterId) {
            const lib = planLetters.find(l => l.id === a.letterId);
            if (lib) return lib.status === 'submitted_to_metro' || lib.status === 'metro_revision_requested';
          }
          return a.letterStatus === 'submitted_to_metro' || a.letterStatus === 'metro_revision_requested';
        });
        if (hasMetro) tier = 'with_metro';
      }

      return { plan, ref: rd, daysLeft: dl, addresses: addrs, planLetters, tier, maxShiftDays: maxShift };
    })
    .sort((a, b) => {
      const tierDiff = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
      if (tierDiff !== 0) return tierDiff;
      // For re-issue tier, sort by largest shift first (most stale = most urgent)
      if (a.tier === 'reissue_needed' && b.tier === 'reissue_needed') {
        return b.maxShiftDays - a.maxShiftDays;
      }
      // Then by days left ascending (most urgent first), nulls last
      if (a.daysLeft === null && b.daysLeft === null) return 0;
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    });

  const byTier = TIER_ORDER.reduce<Record<Tier, QueueItem[]>>((acc, t) => {
    acc[t] = items.filter(i => i.tier === t);
    return acc;
  }, {} as Record<Tier, QueueItem[]>);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle size={40} className="text-emerald-400 mb-3" />
        <p className="text-slate-600 font-semibold text-base">All caught up</p>
        <p className="text-slate-400 text-sm mt-1">
          No active plans with outstanding driveway notices.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex gap-3 flex-wrap">
        {TIER_ORDER.filter(t => byTier[t].length > 0).map(t => {
          const meta = TIER_META[t];
          return (
            <div key={t} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5">
              {meta.icon}
              <span className="text-xl font-bold text-slate-800">{byTier[t].length}</span>
              <span className={`text-[11px] ${meta.color} font-semibold`}>{meta.label}</span>
            </div>
          );
        })}
      </div>

      {/* Grouped lists */}
      {TIER_ORDER.map(tier => {
        const group = byTier[tier];
        if (group.length === 0) return null;
        const meta = TIER_META[tier];
        return (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
              <span className={`text-[11px] font-bold uppercase tracking-wide ${meta.color}`}>
                {meta.label} ({group.length})
              </span>
              {tier === 'reissue_needed' && (
                <span className="text-[10px] text-orange-500 italic">
                  — notices were sent for old dates; work window has since moved
                </span>
              )}
            </div>
            <div className="space-y-2">
              {group.map(item => (
                <QueueRow
                  key={item.plan.id}
                  item={item}
                  onOpen={() => onOpenPlanLetters(item.plan)}
                  onDraftLetter={(addr, parentLetter) => setDraftTarget({ plan: item.plan, addr, parentLetter })}
                  canDraft={!!currentUser}
                  properties={properties}
                  allLetters={letters}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Footer note */}
      <p className="text-[11px] text-slate-400 text-center pt-2">
        Showing plans with <code className="bg-slate-100 px-1 rounded">impact_driveway</code> flagged and at least one unsent or stale notice.
        Plans marked N/A or Completed are excluded.
      </p>

      {/* AI Draft modal */}
      {draftTarget && currentUser && (
        <DraftLetterModal
          plan={draftTarget.plan}
          addr={draftTarget.addr}
          appConfig={appConfig}
          allLetters={letters}
          currentUser={currentUser}
          parentLetter={draftTarget.parentLetter}
          onClose={() => setDraftTarget(null)}
          onCreated={() => {
            setDraftTarget(null);
            onOpenPlanLetters(draftTarget.plan);
          }}
        />
      )}
    </div>
  );
}

// Export count helper for the tab badge
export function crQueueCount(
  plans: Plan[],
  letters: DrivewayLetter[],
  leadTimeDays: number,
  reissueDays = 5
): number {
  const DONE_STAGES  = new Set(['closed', 'cancelled']);
  const DONE_STATUSES = new Set(['completed', 'na']);
  return plans.filter(p => {
    if (!p.impact_driveway || p.isHistorical) return false;
    if (DONE_STAGES.has(p.stage)) return false;
    const dn = p.compliance?.drivewayNotices;
    if (dn && DONE_STATUSES.has(dn.status)) return false;
    const addrs = dn?.addresses ?? [];
    if (addrs.length > 0) {
      const allSent = addrs.every(a => {
        if (a.letterId) {
          const lib = letters.find(l => l.id === a.letterId);
          return lib ? lib.status === 'sent' : a.letterStatus === 'sent';
        }
        return a.letterStatus === 'sent' || a.noticeSent;
      });
      if (allSent) {
        // Still count if re-issue is needed
        return addrs.some(a => dateShiftDays(a, p) >= reissueDays);
      }
    }
    return true;
  }).length;
}

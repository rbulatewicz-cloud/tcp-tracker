import { CheckCircle, Link2, AlertTriangle, Clock, Tag, MapPin, Calendar } from 'lucide-react';
import { daysUntilExpiry, getVarianceExpiryStatus } from '../../../services/varianceService';
import { fmtDate as fmt } from '../../../utils/plans';
import { sortStreetsByCorridorOrder, findGapsInCoverage, findExtrasOutsideCorridors } from '../../../utils/corridor';
import { MatchResult, confidenceLabel } from './scoring';
import { SignalBadge } from './SignalBadge';

/**
 * A single variance "match" card shown in the Link tab's suggestion list.
 * Displays score + confidence tier, permit + expiry, coverage (corridor
 * range + street chips color-coded by verified/in-range/extra/gap), the
 * six signal badges, and a Link button.
 *
 * Pure presentational — linking state + click handler come in via props so
 * Firestore writes stay in the parent.
 */
export function VarianceCard({
  result,
  onLink,
  linking,
}: {
  result: MatchResult;
  onLink: () => void;
  linking: boolean;
}) {
  const { variance, score, signals } = result;
  const conf = confidenceLabel(score);
  const expiryStatus = getVarianceExpiryStatus(variance);
  const expiryDays = daysUntilExpiry(variance);
  const isExpired = expiryStatus === 'expired';

  return (
    <div className={`border rounded-lg p-3 transition-all ${
      score >= 10 ? 'border-emerald-200 bg-emerald-50/30' :
      score >= 6  ? 'border-amber-200 bg-amber-50/20' :
                    'border-slate-200 bg-white'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Top row: score + permit + expiry */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: conf.bg, color: conf.color }}
            >
              {score}pt — {conf.label}
            </span>
            <span className="text-[11px] font-semibold text-slate-700">{variance.permitNumber || variance.title || 'Untitled'}</span>
            {isExpired ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Expired</span>
            ) : (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {expiryDays !== null ? `${expiryDays}d left` : fmt(variance.validThrough)}
              </span>
            )}
          </div>

          {/* Segments + date range */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mb-1.5">
            <span className="flex items-center gap-1">
              <MapPin size={10} />
              {variance.isGeneric ? 'All segments' : (variance.coveredSegments.join(', ') || '—')}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {fmt(variance.validFrom)} – {fmt(variance.validThrough)}
            </span>
            {variance.isGeneric && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">Generic</span>
            )}
          </div>

          {/* Street limits — four-way: verified (green) / in-range (blue) / extra (violet) / gap (amber) */}
          {((variance.corridors ?? []).length > 0 || (variance.coveredStreets ?? []).length > 0 || (variance.verifiedStreets ?? []).length > 0) && (() => {
            const rawStreets = variance.coveredStreets ?? [];
            const corridors  = variance.corridors ?? [];
            const hasCorridors = corridors.length > 0;
            const verifiedSet = new Set((variance.verifiedStreets ?? []).map(s => s.toLowerCase()));
            const verifiedList = sortStreetsByCorridorOrder(variance.verifiedStreets ?? []);

            const allGaps   = findGapsInCoverage(corridors, rawStreets);
            const allExtras = findExtrasOutsideCorridors(corridors, rawStreets);
            const extraSet  = new Set(allExtras.map(s => s.toLowerCase()));

            // Exclude verified streets from unresolved gaps/extras
            const gaps        = allGaps.filter(s => !verifiedSet.has(s.toLowerCase()));
            const extrasSorted = sortStreetsByCorridorOrder(allExtras.filter(s => !verifiedSet.has(s.toLowerCase())));
            const inRange     = sortStreetsByCorridorOrder(rawStreets.filter(s => !extraSet.has(s.toLowerCase()) && !verifiedSet.has(s.toLowerCase())));

            return (
              <div className="mb-1.5">
                {/* Corridor range label */}
                {hasCorridors && (
                  <div className="flex flex-col gap-0.5 mb-1">
                    {corridors.map((c, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px]">
                        <MapPin size={8} className="text-sky-500 flex-shrink-0" />
                        <span className="font-bold text-sky-700">{c.mainStreet}</span>
                        <span className="text-slate-400">from</span>
                        <span className="font-semibold text-sky-600">{c.from}</span>
                        <span className="text-slate-400">to</span>
                        <span className="font-semibold text-sky-600">{c.to}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Street chips */}
                {(verifiedList.length > 0 || inRange.length > 0 || extrasSorted.length > 0 || gaps.length > 0) && (
                  <div className="flex flex-wrap gap-1 items-center">
                    {/* Green: manually verified from PDF */}
                    {verifiedList.map((st, i) => (
                      <span key={`v-${i}`}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300"
                        title="Verified from PDF">
                        <CheckCircle size={8} className="flex-shrink-0 text-emerald-500" />
                        {st}
                      </span>
                    ))}
                    {/* Blue: within stated corridor range */}
                    {inRange.map((st, i) => (
                      <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                        {st}
                      </span>
                    ))}
                    {/* Violet dashed: outside stated range — possible AI over-extraction */}
                    {hasCorridors && extrasSorted.map((st, i) => (
                      <span key={`extra-${i}`}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-600 border border-dashed border-violet-300"
                        title="Outside stated corridor range — verify in PDF">
                        <AlertTriangle size={8} className="opacity-60 flex-shrink-0" />
                        {st}
                      </span>
                    ))}
                    {/* Amber dashed: missing from range — possible AI under-extraction */}
                    {gaps.map((st, i) => (
                      <span key={`gap-${i}`}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-dashed border-amber-300"
                        title="Within stated range but not extracted — verify in PDF">
                        <AlertTriangle size={8} className="flex-shrink-0" />
                        {st}
                      </span>
                    ))}
                    {(extrasSorted.length > 0 || gaps.length > 0) && (
                      <span className="text-[9px] font-semibold text-slate-400 flex items-center gap-0.5 ml-0.5">
                        {extrasSorted.length > 0 && <span className="text-violet-500">{extrasSorted.length} outside range</span>}
                        {extrasSorted.length > 0 && gaps.length > 0 && <span className="mx-0.5">·</span>}
                        {gaps.length > 0 && <span className="text-amber-500">{gaps.length} possible gap{gaps.length !== 1 ? 's' : ''}</span>}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Signal badges */}
          <div className="flex flex-wrap gap-1">
            <SignalBadge active={signals.segment}  label="Segment"  icon={<MapPin size={9} />} />
            <SignalBadge active={signals.scope}    label="Scope"    icon={<Tag size={9} />} />
            <SignalBadge active={signals.date}     label="Date"     icon={<Calendar size={9} />} />
            <SignalBadge active={signals.hours}    label="Hours"    icon={<Clock size={9} />} />
            <SignalBadge active={signals.streets}  label="Streets"  icon={<MapPin size={9} />} />
            {!signals.streets && (
              <SignalBadge active={signals.location} label="Text match" icon={<MapPin size={9} />} />
            )}
          </div>
        </div>

        <button
          onClick={onLink}
          disabled={linking}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
            linking
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-slate-900 text-white hover:bg-slate-700 cursor-pointer'
          }`}
        >
          <Link2 size={11} />
          {linking ? 'Linking…' : 'Link'}
        </button>
      </div>
    </div>
  );
}

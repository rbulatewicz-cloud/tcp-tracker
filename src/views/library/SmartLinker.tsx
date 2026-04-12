import React, { useState } from 'react';
import { ShieldCheck, Gauge, Mail } from 'lucide-react';
import { Plan, DrivewayLetter } from '../../types';
import { NVSmartLinker } from './NVSmartLinker';
import { PHELinkerSection } from './PHELinkerSection';
import { DrivewayLinkerSection } from './DrivewayLinkerSection';
import { COMPLETED_STAGES } from '../../constants';

type DocType = 'nv' | 'phe' | 'driveway';

export function SmartLinker({
  plans,
  setSelectedPlan,
  letters,
}: {
  plans: Plan[];
  setSelectedPlan: (p: Plan | null) => void;
  letters: DrivewayLetter[];
}) {
  const [docType, setDocType] = useState<DocType>('nv');

  // ── Badges ──────────────────────────────────────────────────────────────────

  const nvUnlinked = plans.filter(p => {
    const track = p.compliance?.noiseVariance;
    if (!track || COMPLETED_STAGES.includes(p.stage)) return false;
    const ids = track.linkedVarianceIds?.length ? track.linkedVarianceIds : track.linkedVarianceId ? [track.linkedVarianceId] : [];
    return ids.length === 0;
  }).length;

  const phePending = plans.filter(p =>
    p.compliance?.phe &&
    !['approved', 'linked_existing', 'na', 'expired'].includes(p.compliance.phe.status) &&
    !COMPLETED_STAGES.includes(p.stage)
  ).length;

  const dwayNeedsAction = plans.filter(p => {
    if (!p.impact_driveway || COMPLETED_STAGES.includes(p.stage)) return false;
    const s = p.compliance?.drivewayNotices?.status;
    return !s || s === 'not_started' || s === 'in_progress';
  }).length;

  const DOC_TYPES: { id: DocType; label: string; icon: React.ReactNode; badge: number }[] = [
    { id: 'nv',       label: 'Noise Variances',  icon: <ShieldCheck size={13} />, badge: nvUnlinked },
    { id: 'phe',      label: 'PHE Permits',       icon: <Gauge size={13} />,       badge: phePending },
    { id: 'driveway', label: 'Driveway Notices',  icon: <Mail size={13} />,        badge: dwayNeedsAction },
  ];

  return (
    <div>
      {/* Doc-type switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-6">
        {DOC_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setDocType(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
              docType === t.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge > 0 && (
              <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                docType === t.id ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Section content */}
      {docType === 'nv' && (
        <NVSmartLinker plans={plans} setSelectedPlan={setSelectedPlan} />
      )}
      {docType === 'phe' && (
        <PHELinkerSection plans={plans} setSelectedPlan={setSelectedPlan} />
      )}
      {docType === 'driveway' && (
        <DrivewayLinkerSection plans={plans} setSelectedPlan={setSelectedPlan} letters={letters} />
      )}
    </div>
  );
}

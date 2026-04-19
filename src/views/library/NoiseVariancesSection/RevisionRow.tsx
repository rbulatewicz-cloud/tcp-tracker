import { ExternalLink } from 'lucide-react';
import type { NoiseVariance } from '../../../types';
import { fmtDate as fmt } from '../../../utils/plans';

/**
 * A single row in a variance family's collapsed revision history. Shows the
 * revision number, validity dates, upload date, and a link to the PDF.
 * Used under each `VarianceCard` when the family is expanded.
 */
export function RevisionRow({ v }: { v: NoiseVariance }) {
  return (
    <div className="flex items-center gap-3 py-1.5 pl-3 pr-2">
      <div className="w-px h-4 bg-slate-200 flex-shrink-0" />
      <span className="text-[10px] font-mono font-bold text-slate-400 w-8 flex-shrink-0">
        Rev {v.revisionNumber}
      </span>
      <span className="text-[10px] text-slate-500 flex-1 truncate">
        {v.validFrom ? `${fmt(v.validFrom)} – ${fmt(v.validThrough)}` : fmt(v.validThrough)}
      </span>
      <span className="text-[10px] text-slate-400 flex-shrink-0">
        {fmt(v.uploadedAt.slice(0, 10))}
      </span>
      <a href={v.fileUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700 flex-shrink-0">
        <ExternalLink size={9} /> PDF
      </a>
    </div>
  );
}

import { useState } from 'react';
import { GitBranch, FileText } from 'lucide-react';
import { UserRole } from '../types';
import WorkflowGuideSection from './reference/WorkflowGuideSection';
import ReferenceDocsSection from './reference/ReferenceDocsSection';

type RefTab = 'workflow' | 'documents';

interface Props {
  role: string | null;
  uploadedBy: string;
}

export default function ReferenceView({ role, uploadedBy }: Props) {
  const [tab, setTab] = useState<RefTab>('workflow');
  const canUpload = role === UserRole.ADMIN || role === UserRole.MOT;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Reference</h1>
        <p className="text-sm text-slate-500 mt-0.5">Approval workflow guide and regulatory reference documents</p>
      </div>

      {/* Sub-tab bar — same pattern as Library */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {[
          { id: 'workflow'  as RefTab, label: 'Workflow Guide',      icon: <GitBranch size={14} /> },
          { id: 'documents' as RefTab, label: 'Reference Documents', icon: <FileText  size={14} /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'workflow'   && <WorkflowGuideSection />}
      {tab === 'documents'  && <ReferenceDocsSection canUpload={canUpload} uploadedBy={uploadedBy} />}
    </div>
  );
}

import React, { useState } from 'react';
import { ShieldCheck, Mail } from 'lucide-react';
import { User, AppConfig } from '../types';
import { NoiseVariancesSection } from './library/NoiseVariancesSection';
import { DrivewayLettersSection } from './library/DrivewayLettersSection';

interface VarianceLibraryViewProps {
  currentUser: User | null;
  appConfig: AppConfig;
}

type LibTab = 'noise_variances' | 'driveway_letters';

const TABS: { id: LibTab; label: string; icon: React.ReactNode }[] = [
  { id: 'noise_variances',  label: 'Noise Variances',   icon: <ShieldCheck size={14} /> },
  { id: 'driveway_letters', label: 'Driveway Letters',  icon: <Mail size={14} /> },
];

export default function VarianceLibraryView({ currentUser, appConfig }: VarianceLibraryViewProps) {
  const [tab, setTab] = useState<LibTab>('noise_variances');

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Library</h1>
        <p className="text-sm text-slate-500 mt-0.5">Permits, notices, and compliance documents</p>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map(t => (
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

      {/* Section content */}
      {tab === 'noise_variances' && (
        <NoiseVariancesSection currentUser={currentUser} appConfig={appConfig} />
      )}
      {tab === 'driveway_letters' && (
        <DrivewayLettersSection currentUser={currentUser} />
      )}
    </div>
  );
}

import { useState } from 'react';
import { DEFAULT_MAIN_COLUMNS, DEFAULT_TEAM_COLUMNS, DEFAULT_COMMUNITY_COLUMNS, DEFAULT_LOC_COLUMNS, DEFAULT_LOG_COLUMNS } from '../constants';

/** Loads saved column order from localStorage, falling back to defaults. O(1) lookup via Map. */
function loadSavedColumns<T extends { id: string }>(key: string, defaults: T[]): T[] {
  const saved = localStorage.getItem(key);
  if (!saved) return defaults;
  try {
    const ids: string[] = JSON.parse(saved);
    const colMap = new Map(defaults.map(c => [c.id, c]));
    return ids.map(id => colMap.get(id)).filter(Boolean) as T[];
  } catch {
    return defaults;
  }
}

export const useTableState = () => {
  const [mainCols, setMainCols] = useState(() => loadSavedColumns("mainCols", DEFAULT_MAIN_COLUMNS));
  const [teamCols, setTeamCols] = useState(() => loadSavedColumns("teamCols", DEFAULT_TEAM_COLUMNS));
  const [communityCols, setCommunityCols] = useState(() => loadSavedColumns("communityCols", DEFAULT_COMMUNITY_COLUMNS));
  const [locCols, setLocCols] = useState(() => loadSavedColumns("locCols", DEFAULT_LOC_COLUMNS));
  const [logCols, setLogCols] = useState(() => loadSavedColumns("logCols", DEFAULT_LOG_COLUMNS));

  const [locSortConfig, setLocSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [communitySortConfig, setCommunitySortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [teamSortConfig, setTeamSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  return {
    mainCols, setMainCols,
    teamCols, setTeamCols,
    communityCols, setCommunityCols,
    locCols, setLocCols,
    logCols, setLogCols,
    locSortConfig, setLocSortConfig,
    communitySortConfig, setCommunitySortConfig,
    teamSortConfig, setTeamSortConfig,
    searchQuery, setSearchQuery
  };
};

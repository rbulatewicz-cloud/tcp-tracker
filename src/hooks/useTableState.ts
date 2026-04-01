import { useState } from 'react';
import { DEFAULT_MAIN_COLUMNS, DEFAULT_TEAM_COLUMNS, DEFAULT_LOC_COLUMNS, DEFAULT_LOG_COLUMNS } from '../constants';

// Bump this when DEFAULT_*_COLUMNS change significantly — resets saved preferences to new defaults
const COL_VERSION = 2;

/** Loads saved column order from localStorage.
 *  Resets to defaults on version bump; otherwise appends any new columns. */
function loadSavedColumns<T extends { id: string }>(key: string, defaults: T[]): T[] {
  const versionKey = `${key}_v`;
  const savedVersion = Number(localStorage.getItem(versionKey) ?? '0');
  if (savedVersion < COL_VERSION) {
    localStorage.setItem(versionKey, String(COL_VERSION));
    localStorage.removeItem(key);
    return defaults;
  }
  const saved = localStorage.getItem(key);
  if (!saved) return defaults;
  try {
    const ids: string[] = JSON.parse(saved);
    const colMap = new Map(defaults.map(c => [c.id, c]));
    const savedCols = ids.map(id => colMap.get(id)).filter(Boolean) as T[];
    const savedIds = new Set(ids);
    const newCols = defaults.filter(c => !savedIds.has(c.id));
    return [...savedCols, ...newCols];
  } catch {
    return defaults;
  }
}

export const useTableState = () => {
  const [mainCols, setMainCols] = useState(() => loadSavedColumns("mainCols", DEFAULT_MAIN_COLUMNS));
  const [teamCols, setTeamCols] = useState(() => loadSavedColumns("teamCols", DEFAULT_TEAM_COLUMNS));
  const [locCols, setLocCols] = useState(() => loadSavedColumns("locCols", DEFAULT_LOC_COLUMNS));
  const [logCols, setLogCols] = useState(() => loadSavedColumns("logCols", DEFAULT_LOG_COLUMNS));

  const [locSortConfig, setLocSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [teamSortConfig, setTeamSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  return {
    mainCols, setMainCols,
    teamCols, setTeamCols,
    locCols, setLocCols,
    logCols, setLogCols,
    locSortConfig, setLocSortConfig,
    teamSortConfig, setTeamSortConfig,
    searchQuery, setSearchQuery
  };
};

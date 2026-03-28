import React, { createContext, useContext, ReactNode } from 'react';
import { PLAN_TYPES, SCOPES, LEADS } from '../constants';
import { AppConfig } from '../types';

interface AppLists {
  scopes: string[];
  leads: string[];
  planTypes: string[];
}

const AppListsContext = createContext<AppLists>({
  scopes: SCOPES,
  leads: LEADS,
  planTypes: PLAN_TYPES,
});

export const useAppLists = () => useContext(AppListsContext);

export const AppListsProvider: React.FC<{ appConfig: AppConfig; children: ReactNode }> = ({
  appConfig,
  children,
}) => {
  const value: AppLists = {
    scopes:    appConfig.lists?.scopes?.length    ? appConfig.lists.scopes    : SCOPES,
    leads:     appConfig.lists?.leads?.length     ? appConfig.lists.leads     : LEADS,
    planTypes: appConfig.lists?.planTypes?.length ? appConfig.lists.planTypes : PLAN_TYPES,
  };
  return <AppListsContext.Provider value={value}>{children}</AppListsContext.Provider>;
};

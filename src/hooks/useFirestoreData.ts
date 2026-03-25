import { useState, useEffect } from 'react';
import { User, UserRole, ReportTemplate, AppConfig } from '../types';
import { generateDefaultLogo } from '../utils/logo';
import * as firestoreService from '../services/firestoreService';
import { DEFAULT_REPORT_TEMPLATE, DEFAULT_APP_CONFIG } from '../constants';

const DEFAULT_LOGO = generateDefaultLogo();

export function useFirestoreData(currentUser: User | null, role: UserRole, canManageApp: boolean) {
  const [plans, setPlans] = useState<any[]>([]);
  const [locs, setLocs] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [appRequests, setAppRequests] = useState<any[]>([]);
  const [appTodos, setAppTodos] = useState<any[]>([]);
  const [reportTemplate, setReportTemplate] = useState<ReportTemplate>({
    ...DEFAULT_REPORT_TEMPLATE,
    logo: DEFAULT_LOGO
  });
  const [appConfig, setAppConfig] = useState<AppConfig>({ ...DEFAULT_APP_CONFIG });

  useEffect(() => {
    let unsubUsers = () => {};
    let unsubAppRequests = () => {};
    let unsubAppTodos = () => {};
    let unsubSettings = () => {};

    // Plans and LOCs are visible to all users, including unauthenticated guests
    const unsubPlans = firestoreService.subscribeToPlans(setPlans);
    const unsubLocs = firestoreService.subscribeToLocs(setLocs);

    if (currentUser) {
      unsubUsers = firestoreService.subscribeToUsers(role, setUsers);

      if (canManageApp) {
        unsubAppRequests = firestoreService.subscribeToAppFeedback(setAppRequests);
        unsubAppTodos = firestoreService.subscribeToAppTodos(setAppTodos);
      }

      unsubSettings = firestoreService.subscribeToReportTemplate(setReportTemplate);
      firestoreService.subscribeToAppConfig((data) => setAppConfig(prev => ({ ...DEFAULT_APP_CONFIG, ...prev, ...data })));
    }

    return () => {
      unsubPlans();
      unsubLocs();
      unsubUsers();
      unsubSettings();
      unsubAppRequests();
      unsubAppTodos();
    };
  }, [currentUser, canManageApp, role]);

  return {
    plans, setPlans,
    locs, setLocs,
    users, setUsers,
    appRequests, setAppRequests,
    appTodos, setAppTodos,
    reportTemplate, setReportTemplate,
    appConfig, setAppConfig,
  };
}

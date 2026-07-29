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

  // Plans and LOCs are public (visible to all users, including unauthenticated
  // guests) and never depend on identity, so subscribe ONCE for the app's
  // lifetime. Keeping them out of the identity-scoped effect below prevents a
  // full re-read of both entire collections on every auth/role change.
  useEffect(() => {
    const unsubPlans = firestoreService.subscribeToPlans(setPlans);
    const unsubLocs = firestoreService.subscribeToLocs(setLocs);
    return () => {
      unsubPlans();
      unsubLocs();
    };
  }, []);

  // Identity-scoped listeners. Keyed off primitives (email/role/canManageApp)
  // rather than the currentUser object so an unchanged identity that merely got
  // a new object reference does not tear down and re-subscribe everything.
  const email = currentUser?.email ?? null;
  useEffect(() => {
    if (!email) return;

    const unsubUsers = firestoreService.subscribeToUsers(role, setUsers);

    let unsubAppRequests = () => {};
    let unsubAppTodos = () => {};
    if (canManageApp) {
      unsubAppRequests = firestoreService.subscribeToAppFeedback(setAppRequests);
      unsubAppTodos = firestoreService.subscribeToAppTodos(setAppTodos);
    }

    const unsubSettings = firestoreService.subscribeToReportTemplate(setReportTemplate);
    const unsubAppConfig = firestoreService.subscribeToAppConfig(
      (data) => setAppConfig(prev => ({ ...DEFAULT_APP_CONFIG, ...prev, ...data }))
    );

    return () => {
      unsubUsers();
      unsubSettings();
      unsubAppConfig();
      unsubAppRequests();
      unsubAppTodos();
    };
  }, [email, canManageApp, role]);

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

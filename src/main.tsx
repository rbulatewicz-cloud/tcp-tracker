import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PermissionProvider } from './permissions/PermissionContext';
import { AppProvider } from './context/AppProvider';
import { PlanPopoutView } from './views/PlanPopoutView.tsx';

const planParam = new URLSearchParams(window.location.search).get('plan');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {planParam ? (
        <PlanPopoutView locId={planParam} />
      ) : (
        <PermissionProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </PermissionProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
);

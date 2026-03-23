import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

import { PermissionProvider } from './permissions/PermissionContext';
import { AppProvider } from './context/AppProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PermissionProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </PermissionProvider>
    </ErrorBoundary>
  </StrictMode>,
);

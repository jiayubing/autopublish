import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import WorkspaceBootstrapGate from './components/WorkspaceBootstrapGate';
import AuthGate from './components/AuthGate';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate><WorkspaceBootstrapGate /></AuthGate>
  </StrictMode>,
);

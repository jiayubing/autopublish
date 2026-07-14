import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import WorkspaceBootstrapGate from './components/WorkspaceBootstrapGate';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspaceBootstrapGate />
  </StrictMode>,
);

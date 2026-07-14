import React, { useEffect, useRef, useState } from 'react';
import App from '../App';
import { getWorkspaceBootstrapState } from '../electron-api';
import { WorkspaceBootstrapState } from '../types';
import { createBootstrapGateController, getBootstrapView } from '../workspace-ui-logic.js';
import WorkspaceWelcome from './WorkspaceWelcome';

export default function WorkspaceBootstrapGate() {
  const controllerRef = useRef<ReturnType<typeof createBootstrapGateController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createBootstrapGateController({ getBootstrapState: getWorkspaceBootstrapState });
  }
  const controller = controllerRef.current;
  const [state, setState] = useState<WorkspaceBootstrapState>(controller.getState());

  useEffect(() => {
    let active = true;
    controller.start().then((nextState) => {
      if (active) setState(nextState);
    });
    return () => {
      active = false;
    };
  }, [controller]);

  const view = getBootstrapView(state);
  if (view.kind === 'checking') {
    return <div className="min-h-screen flex items-center justify-center text-slate-600">{view.text}</div>;
  }

  if (view.kind === 'app') return <App />;

  return <WorkspaceWelcome state={state} onStateChange={setState} />;
}

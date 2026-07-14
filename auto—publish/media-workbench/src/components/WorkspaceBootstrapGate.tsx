import React, { useEffect, useState } from 'react';
import App from '../App';
import { getWorkspaceBootstrapState } from '../electron-api';
import { WorkspaceBootstrapState } from '../types';
import WorkspaceWelcome from './WorkspaceWelcome';

const CHECKING_STATE: WorkspaceBootstrapState = {
  state: 'checking',
  workspacePath: null,
  envOverride: false,
};

export default function WorkspaceBootstrapGate() {
  const [state, setState] = useState<WorkspaceBootstrapState>(CHECKING_STATE);

  useEffect(() => {
    let active = true;
    getWorkspaceBootstrapState()
      .then((nextState) => {
        if (active) setState(nextState);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : '工作区状态检查失败';
        setState({
          state: 'invalid',
          workspacePath: null,
          envOverride: false,
          error: { code: 'WORKSPACE_BOOTSTRAP_FAILED', message },
        });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.state === 'checking') {
    return <div className="min-h-screen flex items-center justify-center text-slate-600">正在检查工作区…</div>;
  }

  if (state.state === 'ready') return <App />;

  return <WorkspaceWelcome state={state} onStateChange={setState} />;
}

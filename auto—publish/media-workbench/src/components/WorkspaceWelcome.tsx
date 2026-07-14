import React from 'react';
import {
  cancelWorkspaceSelection,
  chooseWorkspaceDirectory,
  confirmWorkspaceSelection,
} from '../electron-api';
import { WorkspaceBootstrapState } from '../types';
import WorkspaceSelectionPanel from './WorkspaceSelectionPanel';

interface WorkspaceWelcomeProps {
  state: WorkspaceBootstrapState;
  onStateChange: (state: WorkspaceBootstrapState) => void;
}

export default function WorkspaceWelcome({ state, onStateChange }: WorkspaceWelcomeProps) {
  return (
    <WorkspaceSelectionPanel
      state={state}
      onChooseDirectory={chooseWorkspaceDirectory}
      onConfirmSelection={confirmWorkspaceSelection}
      onCancelSelection={cancelWorkspaceSelection}
      onStateChange={onStateChange}
      title="选择工作区"
      description="请选择一个工作区后继续使用应用。工作区用于保存本地业务数据和运行配置。"
      showAppName
    />
  );
}

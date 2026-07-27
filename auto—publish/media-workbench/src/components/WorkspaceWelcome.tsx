import React from "react";
import WorkspaceSelectionPanel from "./WorkspaceSelectionPanel";
import { useWorkspaceFeature } from "../features/workspace/workspace-feature-context";

export default function WorkspaceWelcome() {
  useWorkspaceFeature();
  return (
    <WorkspaceSelectionPanel
      mode="bootstrap"
      title="选择工作区"
      description="请选择一个工作区后继续使用应用。工作区用于保存本地业务数据和运行配置。"
      showAppName
    />
  );
}

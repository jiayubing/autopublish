import React from "react";
import App from "../App";
import { getBootstrapView } from "../workspace-ui-logic.js";
import { useWorkspaceFeature } from "../features/workspace/workspace-feature-context";
import WorkspaceWelcome from "./WorkspaceWelcome";

export default function WorkspaceBootstrapGate() {
  const { snapshot } = useWorkspaceFeature();
  const state = snapshot.bootstrap.data || { state: "checking" };
  const view = getBootstrapView(state);
  if (view.kind === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        {view.text}
      </div>
    );
  }

  if (view.kind === "app") return <App />;

  return <WorkspaceWelcome />;
}

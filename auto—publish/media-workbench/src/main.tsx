import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import WorkspaceBootstrapGate from "./components/WorkspaceBootstrapGate";
import App, { WorkspaceScopedConfirmationHost } from "./App";
import AuthGate from "./components/AuthGate";
import { WorkspaceFeatureProvider } from "./features/workspace/workspace-feature-context";
import { WorkspaceCoordinatorProvider } from "./features/workspace/workspace-coordinator-context";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>
      <WorkspaceCoordinatorProvider>
        <WorkspaceScopedConfirmationHost>
          <WorkspaceFeatureProvider>
            <WorkspaceBootstrapGate />
          </WorkspaceFeatureProvider>
        </WorkspaceScopedConfirmationHost>
      </WorkspaceCoordinatorProvider>
    </AuthGate>
  </StrictMode>,
);

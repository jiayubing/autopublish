import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import WorkspaceBootstrapGate from "./components/WorkspaceBootstrapGate";
import AuthGate from "./components/AuthGate";
import { WorkspaceFeatureProvider } from "./features/workspace/workspace-feature-context";
import ConfirmationHost from "./components/ConfirmationHost";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>
      <ConfirmationHost>
        <WorkspaceFeatureProvider>
          <WorkspaceBootstrapGate />
        </WorkspaceFeatureProvider>
      </ConfirmationHost>
    </AuthGate>
  </StrictMode>,
);

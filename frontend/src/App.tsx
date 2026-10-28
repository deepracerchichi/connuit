import { BrowserRouter, Routes, Route } from "react-router";
import LandingPage from "./pages/landingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import { PrivacyPage, TermsPage } from "./pages/LegalPage";
import DashboardLayout, { RequireAuth } from "./dashboard/DashboardLayout";
import OverviewPage from "./dashboard/pages/OverviewPage";
import WorkflowsPage from "./dashboard/pages/WorkflowsPage";
import RunsPage from "./dashboard/pages/RunsPage";
import RunDetailPage from "./dashboard/pages/RunDetailPage";
import CredentialsPage from "./dashboard/pages/CredentialsPage";
import WorkflowEditorPage from "./dashboard/editor/WorkflowEditorPage";
import NewWorkflowPage from "./dashboard/pages/NewWorkflowPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage/>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        {/* Only the canvas editor is full screen (no sidebar). One route on purpose:
            /dashboard/workflows/new/<template> (from the gallery) and /dashboard/workflows/<id>
            both match it, so when saving turns the first into the second the editor isn't
            rebuilt (an in-progress "Save & test" survives). The gallery at
            /dashboard/workflows/new still wins below: a fixed word outranks ":id". */}
        <Route path="/dashboard/workflows/:id/:template?" element={<RequireAuth><WorkflowEditorPage /></RequireAuth>} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          {/* The template gallery stays inside the normal dashboard */}
          <Route path="workflows/new" element={<NewWorkflowPage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="runs/:workflowId/:runId" element={<RunDetailPage />} />
          <Route path="credentials" element={<CredentialsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

import { BrowserRouter, Routes, Route } from "react-router";
import LandingPage from "./pages/landingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import DashboardLayout, { RequireAuth } from "./dashboard/DashboardLayout";
import OverviewPage from "./dashboard/pages/OverviewPage";
import WorkflowsPage from "./dashboard/pages/WorkflowsPage";
import RunsPage from "./dashboard/pages/RunsPage";
import RunDetailPage from "./dashboard/pages/RunDetailPage";
import CredentialsPage from "./dashboard/pages/CredentialsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage/>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
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
          <Route path="runs" element={<RunsPage />} />
          <Route path="runs/:workflowId/:runId" element={<RunDetailPage />} />
          <Route path="credentials" element={<CredentialsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

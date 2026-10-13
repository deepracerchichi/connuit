import { BrowserRouter, Routes, Route } from "react-router";
import LandingPage from "./pages/landingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage/>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/dashboard" element={<div>Dashboard placeholder</div>} />
      </Routes>
    </BrowserRouter>
  );
}

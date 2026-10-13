import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { apiFetch, setToken, ApiError } from "../api/client";
import { AuthLayout, ErrorBox, FloatingField, PasswordField, SubmitButton, SwitchLink } from "../components/auth/AuthLayout";

interface LoginResponse {
  token: string;
  user: { id: string; email: string };
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      tag="Log in"
      title="Welcome back."
      subtitle="Your workflows kept running while you were away."
      headline="Teach your workflows to make decisions."
      onSubmit={handleSubmit}
    >
      <ErrorBox message={error} />

      <div className="mt-8 flex flex-col gap-4">
        <FloatingField id="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <PasswordField autoComplete="current-password" value={password} onChange={setPassword} />
      </div>

      <SubmitButton loading={loading} label="Log in" loadingLabel="Logging in…" />
      <SwitchLink question="No account yet?" to="/signup" label="Create one" />
    </AuthLayout>
  );
}

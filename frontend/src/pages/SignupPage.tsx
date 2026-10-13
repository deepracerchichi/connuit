import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Check } from "lucide-react";
import { apiFetch, setSession, ApiError } from "../api/client";
import { cn } from "../lib/cn";
import { AuthLayout, ErrorBox, FloatingField, PasswordField, SubmitButton, SwitchLink } from "../components/auth/AuthLayout";

interface SignupResponse {
  token: string;
  user: { id: string; email: string };
}

// Must match the backend's signupSchema (password: z.string().min(8)).
const MIN_PASSWORD_LENGTH = 8;

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Catch the obvious problem here instead of waiting for a round trip.
    if (!passwordLongEnough) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<SignupResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      // Signup also logs you in: the backend returns a token straight away.
      setSession(data.token, data.user);
      navigate("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("Check your email address and use at least 8 characters for your password.");
      } else {
        // 409 arrives as "An account with that email already exists", which is already clear.
        setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      tag="Create account"
      title="Start automating."
      subtitle="Your first workflow is a few minutes away."
      headline="Connect any API. Let AI handle the judgment calls."
      onSubmit={handleSubmit}
    >
      <ErrorBox message={error} />

      <div className="mt-8 flex flex-col gap-4">
        <FloatingField id="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <PasswordField autoComplete="new-password" value={password} onChange={setPassword} />
      </div>

      {/* Live hint: turns into a tick once the password is long enough. */}
      <p
        className={cn(
          "js-auth-rise mt-3 flex items-center gap-2 text-sm transition-colors duration-200",
          passwordLongEnough ? "text-ink" : "text-ink/50",
        )}
      >
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full transition-colors duration-200",
            passwordLongEnough ? "bg-accent" : "border border-ink/25",
          )}
        >
          {passwordLongEnough && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
        At least {MIN_PASSWORD_LENGTH} characters
      </p>

      <SubmitButton loading={loading} label="Create account" loadingLabel="Creating account…" />
      <SwitchLink question="Already have an account?" to="/login" label="Log in" />
    </AuthLayout>
  );
}

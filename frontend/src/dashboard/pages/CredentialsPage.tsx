import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Lock, Mail, Plus, Trash2, X } from "lucide-react";
import { useSearchParams } from "react-router";
import { apiFetch } from "../../api/client";
import type { Credential } from "../../api/types";
import { ErrorBox, FloatingField } from "../../components/auth/AuthLayout";
import { cn } from "../../lib/cn";
import { errorMessage, useApi } from "../useApi";
import { ActionChip, actionChipClass, actionClass, EmptyState, ErrorState, LoadingBlock, PageHeader, timeAgo, useRise } from "../ui";

const PROVIDERS = ["Slack", "Discord", "Telegram", "OpenAI", "GitHub", "Other"];

// Where Google's "Allow" screen sends people back to: ?google=<outcome> (see backend routes/oauth.ts).
const GOOGLE_OUTCOMES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Gmail connected. Add a Send Gmail step to a workflow to use it." },
  cancelled: { ok: false, text: "Gmail wasn't connected: you cancelled on Google's screen." },
  "no-send-permission": { ok: false, text: "Gmail wasn't connected: leave “Send email on your behalf” ticked on Google's screen, or Conduit can't send." },
  expired: { ok: false, text: "That took too long, or the link was used twice. Try connecting again." },
  failed: { ok: false, text: "Google didn't complete the connection. Try again; if it keeps failing, check your account is a test user on the Google app." },
};

export default function CredentialsPage() {
  const { data, error, loading, reload } = useApi<Credential[]>("/credentials");
  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const outcome = GOOGLE_OUTCOMES[params.get("google") ?? ""];
  const ref = useRise<HTMLDivElement>(data !== null);

  // Google's screen can't be a plain link: the backend needs the login token to know who's connecting,
  // so ask it for the address first, then leave for Google.
  async function connectGmail() {
    setConnecting(true);
    setConnectError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/oauth/google/start", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      setConnectError(errorMessage(err));
      setConnecting(false);
    }
  }

  const addButton = (
    <button type="button" onClick={() => setAdding(true)} className={actionChipClass()}>
      Add credential <ActionChip icon={Plus} motion="spin" />
    </button>
  );
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={connectGmail} disabled={connecting} className={actionClass("secondary", "px-4")}>
        <Mail className="h-4 w-4" strokeWidth={1.75} /> {connecting ? "Opening Google…" : "Connect Gmail"}
      </button>
      {addButton}
    </div>
  );

  return (
    <div ref={ref}>
      <PageHeader
        tag="Credentials"
        title="Credentials."
        subtitle="Keys your workflows use. Encrypted when saved and never shown again."
        action={actions}
      />

      {(outcome || connectError) && (
        <div
          role="status"
          className={cn(
            "mt-8 flex items-center gap-3 rounded-xl px-4 py-3 text-sm",
            outcome?.ok && !connectError ? "bg-accent text-ink" : "border border-red-200 bg-red-50 text-red-700",
          )}
        >
          <span className="min-w-0 flex-1">{connectError ?? outcome?.text}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setConnectError(null);
              setParams({}, { replace: true });
            }}
            className="rounded-md p-1 opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}

      <div className="mt-10">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingBlock rows={3} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-5 w-5" strokeWidth={1.75} />}
            title="No credentials yet"
            body="Save an API key or webhook URL once, then any workflow step can use it."
            action={addButton}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.map((credential) => (
              <CredentialCard key={credential.id} credential={credential} onDeleted={reload} />
            ))}
          </div>
        )}
      </div>

      {adding && <AddCredentialModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function CredentialCard({ credential, onDeleted }: { credential: Credential; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    try {
      await apiFetch<void>(`/credentials/${credential.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <article className="js-rise flex flex-col rounded-2xl border border-ink/10 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint">
          <Lock className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="rounded-full bg-accent/60 px-2.5 py-1 text-xs">Encrypted</span>
      </div>

      <h2 className="mt-5 truncate text-xl tracking-tight">{credential.name}</h2>
      <p className="mt-1 text-sm text-ink/55">{credential.provider}</p>
      <p className="mt-4 font-mono text-xs tracking-widest text-ink/40">••••••••••••••••</p>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex items-center justify-between border-t border-ink/10 pt-4 text-sm">
        <span className="text-ink/45">Added {timeAgo(credential.createdAt)}</span>
        {confirming ? (
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setConfirming(false)} className={actionClass("ghost", "h-8 px-3")}>
              Keep
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className={actionClass("danger", "h-8 bg-red-600 px-3 text-white hover:bg-red-700 hover:text-white")}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${credential.name}`}
            className="rounded-md p-1.5 text-ink/40 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </article>
  );
}

function AddCredentialModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("Slack");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch("/credentials", { method: "POST", body: JSON.stringify({ name, provider, value }) });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-70 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add credential"
        className="w-full max-w-md rounded-3xl bg-paper p-6 shadow-[0_24px_60px_-12px_rgba(14,66,41,0.35)] md:p-8"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-3xl tracking-tight">Add credential</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink">
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <ErrorBox message={error} />

        <div className="mt-6 flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                provider === p ? "bg-ink text-white" : "bg-ink/5 hover:bg-ink/10",
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <FloatingField id="cred-name" label="Name, e.g. Team Slack" type="text" autoComplete="off" value={name} onChange={setName} />
          <FloatingField
            id="cred-value"
            label={provider === "Telegram" ? "Bot token from @BotFather" : "API key or webhook URL"}
            type="password"
            autoComplete="off"
            value={value}
            onChange={setValue}
          />
        </div>

        <p className="mt-4 flex items-start gap-2 text-sm text-ink/55">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          Encrypted with AES-256-GCM before it's stored. You won't be able to see it again.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={actionClass("ghost")}>Cancel</button>
          <button type="submit" disabled={saving} className={actionClass("primary", "px-6")}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

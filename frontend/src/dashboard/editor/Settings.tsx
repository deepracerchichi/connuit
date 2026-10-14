import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { ArrowLeft, Clock, Lock, Play, Plus, SlidersHorizontal, Sparkles, Webhook, X } from "lucide-react";
import type { Credential, Trigger } from "../../api/types";
import { cn } from "../../lib/cn";
import { describeCron, WebhookUrl } from "../ui";
import type { Block, Params } from "./blocks";
import { CREDENTIAL, hasBody, PREVIOUS, TOKEN_PATTERN, type EditorStep, type Method } from "./model";

/* ---------- Shared bits ---------- */

const inputClass =
  "w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none transition-[border-color,box-shadow] focus:border-ink focus:ring-4 focus:ring-accent/60";

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase text-ink/55">{label}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-ink/50">{hint}</span>}
    </div>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5">
      <p className="font-mono text-xs uppercase text-ink/45">{eyebrow}</p>
      <h2 className="mt-1 text-2xl tracking-tight">{title}</h2>
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </div>
  );
}

/* ---------- Placeholders: typed as chips, never as curly braces ---------- */

// The field you last clicked into, so a chip knows where to insert.
type ActiveField = { insert: (token: string) => void } | null;

function TokenInput({
  value,
  onChange,
  activeField,
  multiline = false,
  rows = 4,
  placeholder,
  mono = false,
}: {
  value: string;
  onChange: (value: string) => void;
  activeField: RefObject<ActiveField>;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // The insert function lives on after this render, so it reads the latest
  // text and handler from refs; otherwise it would undo anything typed since focusing.
  const latest = useRef({ value, onChange });
  useLayoutEffect(() => {
    latest.current = { value, onChange };
  });

  // Remember this field, and how to drop a placeholder in at the cursor.
  const register = () => {
    activeField.current = {
      insert: (token) => {
        const el = ref.current;
        const { value: current, onChange: change } = latest.current;
        const start = el?.selectionStart ?? current.length;
        const end = el?.selectionEnd ?? current.length;
        change(current.slice(0, start) + token + current.slice(end));
        requestAnimationFrame(() => {
          el?.focus();
          el?.setSelectionRange(start + token.length, start + token.length);
        });
      },
    };
  };

  const className = cn(inputClass, mono && "font-mono text-xs leading-relaxed");
  return (
    <>
      {multiline ? (
        <textarea
          ref={ref as RefObject<HTMLTextAreaElement>}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={register}
          spellCheck={false}
          className={className}
        />
      ) : (
        <input
          ref={ref as RefObject<HTMLInputElement>}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={register}
          spellCheck={false}
          className={className}
        />
      )}
      <TokenPreview text={value} />
    </>
  );
}

// Shows a field's text with its placeholders rendered as chips, so people see what they mean.
function TokenPreview({ text }: { text: string }) {
  if (!TOKEN_PATTERN.test(text)) return null;
  return (
    <p className="whitespace-pre-wrap break-all rounded-lg bg-paper px-3 py-2 text-xs leading-loose text-ink/70">
      {text.split(TOKEN_PATTERN).map((part, i) =>
        part === PREVIOUS ? (
          <Chip key={i} tone="lime">previous step's output</Chip>
        ) : part === CREDENTIAL ? (
          <Chip key={i} tone="ink">credential</Chip>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function Chip({ tone, children }: { tone: "lime" | "ink"; children: ReactNode }) {
  return (
    <span className={cn("mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans", tone === "lime" ? "bg-accent text-ink" : "bg-ink text-white")}>
      {tone === "ink" && <Lock className="h-3 w-3" strokeWidth={2} />}
      {children}
    </span>
  );
}

function InsertBar({ activeField, withCredential, fallback }: { activeField: RefObject<ActiveField>; withCredential: boolean; fallback: (token: string) => void }) {
  const insert = (token: string) => (activeField.current ? activeField.current.insert(token) : fallback(token));
  // onMouseDown preventDefault keeps focus (and the cursor) in the field being edited.
  const chipButton = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-transform hover:-translate-y-px";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-paper p-2.5">
      <span className="text-xs text-ink/55">Insert into the field you're editing:</span>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(PREVIOUS)} className={cn(chipButton, "bg-accent")}>
        <Plus className="h-3 w-3" strokeWidth={2.5} /> Previous step's output
      </button>
      {withCredential && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(CREDENTIAL)} className={cn(chipButton, "bg-ink text-white")}>
          <Lock className="h-3 w-3" strokeWidth={2} /> Credential
        </button>
      )}
    </div>
  );
}

/* ---------- Trigger ---------- */

const TRIGGER_OPTIONS = [
  { type: "manual", label: "By hand", description: "Only when you click Run", icon: Play },
  { type: "cron", label: "On a schedule", description: "Every hour, day or week", icon: Clock },
  { type: "webhook", label: "From another app", description: "When it calls a private URL", icon: Webhook },
] as const;

const SCHEDULES = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every day at 9:00", cron: "0 9 * * *" },
  { label: "Weekdays at 8:45", cron: "45 8 * * 1-5" },
  { label: "Mondays at 8:00", cron: "0 8 * * 1" },
];

export function TriggerSettings({ trigger, onChange, webhookUrl }: { trigger: Trigger; onChange: (trigger: Trigger) => void; webhookUrl: string | null }) {
  const choose = (type: Trigger["type"]) => {
    if (type === trigger.type) return;
    onChange(type === "cron" ? { type: "cron", schedule: "0 9 * * *" } : { type });
  };

  return (
    <Panel eyebrow="Trigger" title="When should it run?">
      <div className="grid gap-2">
        {TRIGGER_OPTIONS.map((option) => (
          <button
            key={option.type}
            type="button"
            onClick={() => choose(option.type)}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
              trigger.type === option.type ? "border-ink bg-mint/40 ring-1 ring-ink" : "border-ink/10 hover:border-ink/30",
            )}
          >
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", trigger.type === option.type ? "bg-ink text-accent" : "bg-paper")}>
              <option.icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-sm">{option.label}</span>
              <span className="block text-xs text-ink/50">{option.description}</span>
            </span>
          </button>
        ))}
      </div>

      {trigger.type === "cron" && (
        <>
          <div className="flex flex-wrap gap-2">
            {SCHEDULES.map((s) => (
              <button
                key={s.cron}
                type="button"
                onClick={() => onChange({ type: "cron", schedule: s.cron })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition-colors",
                  trigger.schedule === s.cron ? "bg-ink text-white" : "bg-ink/5 hover:bg-ink/10",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Field
            label="Cron expression"
            hint={
              <>
                minute · hour · day · month · weekday.{" "}
                {trigger.schedule.trim() && <span className="text-ink">Reads as: {describeCron(trigger.schedule)}</span>}
              </>
            }
          >
            <input
              value={trigger.schedule}
              onChange={(e) => onChange({ type: "cron", schedule: e.target.value })}
              spellCheck={false}
              className={cn(inputClass, "font-mono")}
            />
          </Field>
        </>
      )}

      {trigger.type === "webhook" && (
        <div className="flex flex-col gap-3">
          {webhookUrl ? (
            <WebhookUrl url={webhookUrl} />
          ) : (
            <p className="rounded-xl bg-paper p-3 text-sm text-ink/60">Save the workflow to get its private URL.</p>
          )}
          <p className="text-xs leading-relaxed text-ink/50">
            Whatever JSON the other app sends becomes the first step's <Chip tone="lime">previous step's output</Chip>.
          </p>
        </div>
      )}
    </Panel>
  );
}

/* ---------- Steps ---------- */

/* ---------- Friendly blocks: a few plain questions instead of URLs and JSON ---------- */

export function FriendlySettings({
  step,
  index,
  block,
  params,
  onChange,
  credentials,
  onAdvanced,
}: {
  step: EditorStep;
  index: number;
  block: Block;
  params: Params;
  onChange: (patch: Partial<EditorStep>) => void;
  credentials: Credential[];
  onAdvanced: () => void;
}) {
  // Answering a question rewrites the underlying request through the block.
  const answer = (name: string, value: string) => onChange(block.write({ ...params, [name]: value }));

  return (
    <Panel eyebrow={`Step ${index + 1} · ${block.label}`} title={step.name.trim() || "Untitled step"}>
      <Field label="Step name">
        <input value={step.name} onChange={(e) => onChange({ name: e.target.value })} className={inputClass} />
      </Field>

      {block.fields
        .filter((field) => !field.showIf || field.showIf(params))
        .map((field) => (
          <Field key={field.name} label={field.label} hint={field.kind === "credential" ? <CredentialHint credentials={credentials} text={field.hint} /> : field.hint}>
            {field.kind === "textarea" ? (
              <textarea
                rows={5}
                value={params[field.name] ?? ""}
                placeholder={field.placeholder}
                onChange={(e) => answer(field.name, e.target.value)}
                className={inputClass}
              />
            ) : field.kind === "select" ? (
              <select value={params[field.name] ?? ""} onChange={(e) => answer(field.name, e.target.value)} className={inputClass}>
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : field.kind === "credential" ? (
              <select value={params[field.name] ?? ""} onChange={(e) => answer(field.name, e.target.value)} className={inputClass}>
                <option value="">Choose a saved channel…</option>
                {credentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.provider})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={params[field.name] ?? ""}
                placeholder={field.placeholder}
                onChange={(e) => answer(field.name, e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        ))}

      <button type="button" onClick={onAdvanced} className="inline-flex w-fit items-center gap-1.5 text-sm text-ink/55 underline decoration-ink/20 underline-offset-4 hover:text-ink">
        <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} /> Advanced settings
      </button>
    </Panel>
  );
}

function CredentialHint({ credentials, text }: { credentials: Credential[]; text?: string }) {
  return (
    <>
      {text}{" "}
      <Link to="/dashboard/credentials" className="underline underline-offset-2">
        {credentials.length === 0 ? "Add your first one" : "Manage credentials"}
      </Link>
    </>
  );
}

/* ---------- Steps: the full form ---------- */

const METHODS: Method[] = ["GET", "POST", "PUT", "DELETE"];

export function StepSettings({
  step,
  index,
  onChange,
  credentials,
  onSimple,
}: {
  step: EditorStep;
  index: number;
  onChange: (patch: Partial<EditorStep>) => void;
  credentials: Credential[];
  onSimple?: () => void; // set when this step can also be shown as a friendly block
}) {
  const activeField = useRef<ActiveField>(null);
  const isAi = step.kind === "llm_call";

  const nameField = (
    <>
      {onSimple && (
        <button type="button" onClick={onSimple} className="inline-flex w-fit items-center gap-1.5 text-sm text-ink/55 underline decoration-ink/20 underline-offset-4 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} /> Simple view
        </button>
      )}
      <Field label="Step name">
        <input value={step.name} onChange={(e) => onChange({ name: e.target.value })} className={inputClass} />
      </Field>
    </>
  );

  if (isAi) {
    return (
      <Panel eyebrow={`Step ${index + 1} · AI`} title={step.name.trim() || "Untitled step"}>
        {nameField}
        <InsertBar activeField={activeField} withCredential={false} fallback={(t) => onChange({ prompt: step.prompt + t })} />
        <Field label="Prompt" hint="The AI only sees what you write here. Drop in the previous step's output where it should read it.">
          <TokenInput value={step.prompt} onChange={(prompt) => onChange({ prompt })} activeField={activeField} multiline rows={7} />
        </Field>
        <Field label="Instructions (optional)" hint="How the AI should behave, e.g. “Answer in one short paragraph.”">
          <TokenInput value={step.systemPrompt} onChange={(systemPrompt) => onChange({ systemPrompt })} activeField={activeField} multiline rows={3} />
        </Field>
        <p className="flex items-center gap-2 text-xs text-ink/45">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} /> Runs on the AI model configured on your server.
        </p>
      </Panel>
    );
  }

  return (
    <Panel eyebrow={`Step ${index + 1} · HTTP request`} title={step.name.trim() || "Untitled step"}>
      {nameField}

      <Field label="Method">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-paper p-1">
          {METHODS.map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => onChange({ method })}
              className={cn("rounded-lg py-2 font-mono text-xs transition-colors", step.method === method ? "bg-ink text-white" : "hover:bg-ink/5")}
            >
              {method}
            </button>
          ))}
        </div>
      </Field>

      <InsertBar activeField={activeField} withCredential fallback={(t) => onChange({ url: step.url + t })} />

      <Field label="URL">
        <TokenInput value={step.url} onChange={(url) => onChange({ url })} activeField={activeField} placeholder="https://api.example.com/data" mono />
      </Field>

      <Field
        label="Credential"
        hint={
          credentials.length === 0 ? (
            <>
              No credentials yet.{" "}
              <Link to="/dashboard/credentials" className="underline underline-offset-2">
                Add one
              </Link>
              , then use it with the Credential chip.
            </>
          ) : (
            "Its secret value replaces the Credential chip when the step runs."
          )
        }
      >
        <select value={step.credentialId} onChange={(e) => onChange({ credentialId: e.target.value })} className={inputClass}>
          <option value="">None</option>
          {credentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.provider})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Headers">
        <div className="flex flex-col gap-2">
          {step.headers.map((header, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
              <input
                value={header.key}
                placeholder="Header"
                onChange={(e) => onChange({ headers: step.headers.map((h, j) => (j === i ? { ...h, key: e.target.value } : h)) })}
                className={cn(inputClass, "font-mono text-xs")}
              />
              <div className="min-w-0">
                <TokenInput
                  value={header.value}
                  placeholder="Value"
                  onChange={(value) => onChange({ headers: step.headers.map((h, j) => (j === i ? { ...h, value } : h)) })}
                  activeField={activeField}
                  mono
                />
              </div>
              <button
                type="button"
                aria-label="Remove header"
                onClick={() => onChange({ headers: step.headers.filter((_, j) => j !== i) })}
                className="self-start rounded-md p-2.5 text-ink/45 hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ headers: [...step.headers, { key: "", value: "" }] })}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-ink/60 hover:bg-ink/5 hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add header
          </button>
        </div>
      </Field>

      {hasBody(step.method) && (
        <Field label="Body (JSON)" hint={<BodyStatus body={step.body} />}>
          <TokenInput
            value={step.body}
            onChange={(body) => onChange({ body })}
            activeField={activeField}
            multiline
            rows={6}
            placeholder={'{ "text": "Hello" }'}
            mono
          />
        </Field>
      )}
    </Panel>
  );
}

function BodyStatus({ body }: { body: string }) {
  if (!body.trim()) return <>Optional. Sent as JSON.</>;
  try {
    JSON.parse(body);
    return <span className="text-ink">Valid JSON.</span>;
  } catch {
    return <span className="text-red-700">Not valid JSON yet: check quotes and commas.</span>;
  }
}

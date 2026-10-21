import { CloudSun, Code, GitFork, Globe, Hash, MessageSquare, Newspaper, Mail, Send, Sparkles, type LucideIcon } from "lucide-react";
import { CREDENTIAL, makeStep, PREVIOUS, TOKEN_PATTERN, type EditorStep } from "./model";

// Friendly building blocks. The backend only has two step types (an HTTP request and an
// AI call), so a block is a *view* over one of them: `write` turns a few plain answers into
// a real step, and `read` recognises a step built that way so it can be shown simply again.
// If a step is edited (in Advanced settings) into something no block recognises, it simply
// shows up as a Custom request. Nothing extra is ever stored.

export type Params = Record<string, string>;

export interface BlockField {
  name: string;
  label: string;
  kind: "text" | "textarea" | "select" | "credential";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  provider?: string; // credential fields: only offer credentials saved under this provider
  showIf?: (params: Params) => boolean;
}

export interface Block {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  ai?: boolean;
  simpleOnly?: boolean; // no "Advanced settings": the friendly form is all there is
  fields: BlockField[];
  create: () => EditorStep;
  read: (step: EditorStep) => Params | null;
  write: (params: Params) => Partial<EditorStep>;
  summary: (params: Params, step: EditorStep) => string;
}

const isSimpleGet = (step: EditorStep) =>
  step.kind === "http_request" && step.method === "GET" && step.headers.length === 0 && !step.credentialId;

const bodyEquals = (step: EditorStep, expected: unknown) => {
  try {
    return JSON.stringify(JSON.parse(step.body)) === JSON.stringify(expected);
  } catch {
    return false;
  }
};

/* ---------- Hacker News (Algolia's free public API, no key needed) ---------- */

const HN_FRONT = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10";
const HN_SEARCH = "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=10&query=";

export const hackerNews: Block = {
  key: "hacker-news",
  label: "Hacker News",
  description: "Front page, or stories mentioning a word",
  icon: Newspaper,
  fields: [
    {
      name: "mode",
      label: "Which stories",
      kind: "select",
      options: [
        { value: "front", label: "What's on the front page" },
        { value: "search", label: "New stories that mention a word" },
      ],
    },
    { name: "query", label: "Word or name to look for", kind: "text", placeholder: "e.g. your product's name", showIf: (p) => p.mode === "search" },
  ],
  create: () => makeStep({ kind: "http_request", name: "Get Hacker News stories", method: "GET", url: HN_FRONT }),
  read: (step) => {
    if (!isSimpleGet(step)) return null;
    if (step.url === HN_FRONT) return { mode: "front", query: "" };
    if (step.url.startsWith(HN_SEARCH)) return { mode: "search", query: decodeURIComponent(step.url.slice(HN_SEARCH.length)) };
    return null;
  },
  write: (p) => ({ url: p.mode === "search" ? HN_SEARCH + encodeURIComponent(p.query ?? "") : HN_FRONT }),
  summary: (p) => (p.mode === "search" ? `New stories mentioning “${p.query || "…"}”` : "Front page stories"),
};

/* ---------- Weather (Open-Meteo, free, no key needed) ---------- */

const CITIES = [
  { value: "london", label: "London", lat: "51.51", lon: "-0.13" },
  { value: "lagos", label: "Lagos", lat: "6.52", lon: "3.38" },
  { value: "new-york", label: "New York", lat: "40.71", lon: "-74.01" },
  { value: "nairobi", label: "Nairobi", lat: "-1.29", lon: "36.82" },
  { value: "toronto", label: "Toronto", lat: "43.65", lon: "-79.38" },
  { value: "berlin", label: "Berlin", lat: "52.52", lon: "13.40" },
  { value: "san-francisco", label: "San Francisco", lat: "37.77", lon: "-122.42" },
];

const weatherUrl = (city: (typeof CITIES)[number]) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
  "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=1";

export const weather: Block = {
  key: "weather",
  label: "Weather",
  description: "Today's forecast for a city",
  icon: CloudSun,
  fields: [{ name: "city", label: "City", kind: "select", options: CITIES.map(({ value, label }) => ({ value, label })) }],
  create: () => makeStep({ kind: "http_request", name: "Get today's weather", method: "GET", url: weatherUrl(CITIES[0]) }),
  read: (step) => {
    if (!isSimpleGet(step)) return null;
    const city = CITIES.find((c) => weatherUrl(c) === step.url);
    return city ? { city: city.value } : null;
  },
  write: (p) => ({ url: weatherUrl(CITIES.find((c) => c.value === p.city) ?? CITIES[0]) }),
  summary: (p) => `Today's forecast for ${CITIES.find((c) => c.value === p.city)?.label ?? "a city"}`,
};

/* ---------- Any URL ---------- */

export const fetchUrl: Block = {
  key: "fetch",
  label: "Get a web page or API",
  description: "Fetch whatever a URL returns",
  icon: Globe,
  fields: [{ name: "url", label: "Address", kind: "text", placeholder: "https://api.example.com/data", hint: "Its response becomes the next step's input." }],
  create: () => makeStep({ kind: "http_request", name: "Get data", method: "GET" }),
  read: (step) => (isSimpleGet(step) && !TOKEN_PATTERN.test(step.url) ? { url: step.url } : null),
  write: (p) => ({ url: p.url }),
  summary: (p) => p.url.trim() || "No address yet",
};

/* ---------- AI ---------- */

const AI_SUFFIX = `\n\nHere is the data:\n\n${PREVIOUS}`;

export const askAi: Block = {
  key: "ask-ai",
  label: "Ask AI",
  description: "Read the previous step and decide",
  icon: Sparkles,
  ai: true,
  fields: [
    {
      name: "instruction",
      label: "What should the AI do with it?",
      kind: "textarea",
      placeholder: "e.g. Pick the 3 most interesting stories and summarize each in one sentence.",
      hint: "The previous step's output is handed to the AI along with this.",
    },
  ],
  create: () => makeStep({ kind: "llm_call", name: "Ask AI", prompt: `Summarize this in two sentences.${AI_SUFFIX}` }),
  read: (step) =>
    step.kind === "llm_call" && !step.systemPrompt.trim() && step.prompt.endsWith(AI_SUFFIX)
      ? { instruction: step.prompt.slice(0, -AI_SUFFIX.length) }
      : null,
  write: (p) => ({ prompt: (p.instruction ?? "") + AI_SUFFIX }), // no trimming: it would eat spaces mid-typing
  summary: (p) => p.instruction.trim() || "No instruction yet",
};

/* ---------- Chat apps: the credential holds the channel's webhook URL ---------- */

function chatBlock(key: string, label: string, icon: LucideIcon, field: "text" | "content"): Block {
  return {
    key,
    label: `Send to ${label}`,
    description: `Post the previous step's output to ${label}`,
    icon,
    fields: [
      {
        name: "credentialId",
        label: `${label} channel`,
        kind: "credential",
        hint: `Save the channel's incoming-webhook URL under Credentials, then pick it here.`,
      },
    ],
    create: () =>
      makeStep({ kind: "http_request", name: `Post to ${label}`, method: "POST", url: CREDENTIAL, body: JSON.stringify({ [field]: PREVIOUS }, null, 2) }),
    read: (step) =>
      step.kind === "http_request" && step.method === "POST" && step.url === CREDENTIAL && step.headers.length === 0 && bodyEquals(step, { [field]: PREVIOUS })
        ? { credentialId: step.credentialId }
        : null,
    write: (p) => ({ credentialId: p.credentialId }),
    summary: (p) => (p.credentialId ? `Posts the previous step's output` : "Pick a channel"),
  };
}

export const slack = chatBlock("slack", "Slack", Hash, "text");
export const discord = chatBlock("discord", "Discord", MessageSquare, "content");

/* ---------- Everything else ---------- */

export const custom: Block = {
  key: "custom",
  label: "Custom request",
  description: "Any method, headers and body",
  icon: Code,
  fields: [],
  create: () => makeStep({ kind: "http_request", name: "HTTP request", method: "POST" }),
  read: () => ({}),
  write: () => ({}),
  summary: (_p, step) =>
    step.kind === "llm_call" ? step.prompt.replace(/\s+/g, " ").trim() || "No prompt yet" : `${step.method} ${step.url.trim() || "no URL yet"}`,
};

/* ---------- If: the AI answers a yes/no question, and the workflow takes that path ---------- */

export const decide: Block = {
  key: "if",
  label: "If (AI decides)",
  description: "Take a Yes or No path",
  icon: GitFork,
  ai: true,
  simpleOnly: true,
  fields: [
    {
      name: "question",
      label: "Yes or no question",
      kind: "textarea",
      placeholder: "e.g. Is any of these stories about AI?",
      hint: "The AI reads the previous step's output and answers. Yes takes the top path, No the bottom one, then both carry on to the step after.",
    },
  ],
  create: () => makeStep({ kind: "condition", name: "Check", question: "" }),
  read: (step) => (step.kind === "condition" ? { question: step.question } : null),
  write: (p) => ({ question: p.question ?? "" }),
  summary: (p) => p.question.trim() || "No question yet",
};

/* ---------- Telegram: a message from your bot (the credential holds its token) ---------- */

export const telegram: Block = {
  key: "telegram",
  label: "Send to Telegram",
  description: "Message a chat from your bot",
  icon: Send,
  simpleOnly: true, // it's its own step type: there's no raw request to show
  fields: [
    {
      name: "credentialId",
      label: "Telegram bot",
      kind: "credential",
      provider: "telegram",
      placeholder: "Choose a saved bot…",
      hint: "Create a bot with @BotFather, save its token under Credentials (provider: Telegram), then pick it here.",
    },
    {
      name: "chatId",
      label: "Chat ID",
      kind: "text",
      placeholder: "e.g. 123456789",
      hint: "Message @userinfobot on Telegram to get yours, and start a chat with your bot first. Replying to the Telegram message that started this workflow? Use {{trigger.chatId}}.",
    },
    {
      name: "text",
      label: "Message",
      kind: "textarea",
      hint: "{{previousOutput}} sends the previous step's output. Telegram allows up to 4,096 characters.",
    },
  ],
  create: () => makeStep({ kind: "telegram_message", name: "Send to Telegram", text: PREVIOUS }),
  read: (step) => (step.kind === "telegram_message" ? { credentialId: step.credentialId, chatId: step.chatId, text: step.text } : null),
  write: (p) => ({ credentialId: p.credentialId ?? "", chatId: p.chatId ?? "", text: p.text ?? "" }), // no trimming mid-typing
  summary: (p) => (!p.credentialId ? "Pick a bot" : p.chatId.trim() ? `To chat ${p.chatId.trim()}` : "No chat ID yet"),
};

/* ---------- Gmail: an email from a connected Gmail account (OAuth, send-only) ---------- */

export const gmail: Block = {
  key: "gmail",
  label: "Send Gmail",
  description: "Email from your Gmail account",
  icon: Mail,
  simpleOnly: true, // its own step type: there's no raw request to show
  fields: [
    {
      name: "credentialId",
      label: "Send from",
      kind: "credential",
      provider: "google",
      placeholder: "Choose a connected Gmail…",
      hint: "Connect Gmail under Credentials first. While Connuit's Google app is in testing, a connection lasts 7 days; then reconnect.",
    },
    { name: "to", label: "To", kind: "text", placeholder: "name@company.com, or {{trigger.email}}", hint: "Several people? Separate them with commas." },
    { name: "subject", label: "Subject", kind: "text", placeholder: "e.g. Your weekly summary" },
    { name: "text", label: "Message", kind: "textarea", hint: "Plain text. {{previousOutput}} puts the previous step's output in the email." },
  ],
  create: () => makeStep({ kind: "gmail_send", name: "Send Gmail", text: PREVIOUS }),
  read: (step) =>
    step.kind === "gmail_send" ? { credentialId: step.credentialId, to: step.to, subject: step.subject, text: step.text } : null,
  write: (p) => ({ credentialId: p.credentialId ?? "", to: p.to ?? "", subject: p.subject ?? "", text: p.text ?? "" }), // no trimming mid-typing
  summary: (p) => (!p.credentialId ? "Pick a Gmail account" : p.to.trim() ? `To ${p.to.trim()}` : "No recipient yet"),
};

// Order matters: specific blocks first, the catch-all last.
// (Branches aren't a block: you add one from a step's free outlet.)
export const BLOCKS: Block[] = [hackerNews, weather, fetchUrl, askAi, decide, slack, discord, telegram, gmail, custom];

export function detectBlock(step: EditorStep): { block: Block; params: Params } {
  for (const block of BLOCKS) {
    const params = block.read(step);
    if (params) return { block, params };
  }
  return { block: custom, params: {} };
}

// A ready-made step from a block plus answers, e.g. for templates.
export function stepFrom(block: Block, params: Params = {}, name?: string): EditorStep {
  return { ...block.create(), ...block.write({ ...block.read(block.create()), ...params }), ...(name ? { name } : {}) };
}

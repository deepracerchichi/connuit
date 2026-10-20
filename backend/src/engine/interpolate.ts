// Fills {{placeholders}} in text that steps send (URLs, headers, bodies, prompts).
//
//   {{previousOutput}}                  the previous step's whole output
//   {{previousOutput.customer.email}}   a field inside it (also [0] for list items)
//   {{steps.Get news.headline}}         any earlier step that ran, by name, and fields inside it
//   {{trigger.chatId}}                  what started the run (a webhook's JSON, a Telegram message), from any step
//   {{credential}}                      this step's decrypted credential
//
// Anything else inside {{ }} is left as it is, so other services' own templates don't break.

export interface TemplateContext {
  previousOutput: unknown;
  credential?: string;
  steps: Map<string, unknown>; // step name -> output, for steps that ran before this one
  trigger?: unknown; // the data that started the run; undefined for manual and scheduled runs
}

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;
const LEAVE_ALONE = Symbol("leave alone");

export function interpolate(template: string, ctx: TemplateContext): string {
  return template.replace(PLACEHOLDER, (match, expression: string) => {
    const value = resolve(expression, ctx);
    if (value === LEAVE_ALONE) return match;
    if (value === undefined) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

function resolve(expression: string, ctx: TemplateContext): unknown {
  if (expression === "credential") {
    if (!ctx.credential) throw new Error("This step uses {{credential}} but has no credential selected.");
    return ctx.credential;
  }

  if (expression === "previousOutput" || /^previousOutput[.[]/.test(expression)) {
    return getPath(ctx.previousOutput, expression.slice("previousOutput".length), "previousOutput");
  }

  if (expression === "trigger" || /^trigger[.[]/.test(expression)) {
    if (ctx.trigger === undefined) {
      throw new Error("{{trigger}} only has data when a webhook or a Telegram message starts the run.");
    }
    return getPath(ctx.trigger, expression.slice("trigger".length), "trigger");
  }

  if (expression.startsWith("steps.")) {
    const rest = expression.slice("steps.".length);
    // Names can contain spaces and dots, so match the known names, longest first.
    const name = [...ctx.steps.keys()]
      .sort((a, b) => b.length - a.length)
      .find((n) => rest === n || rest.startsWith(n + ".") || rest.startsWith(n + "["));
    if (!name) throw new Error(`No step called "${rest}" ran before this one.`);
    return getPath(ctx.steps.get(name), rest.slice(name.length), `steps.${name}`);
  }

  return LEAVE_ALONE;
}

// Walks a path like ".customer.email" or ".items[0].title" into a value.
function getPath(value: unknown, path: string, label: string): unknown {
  const parts = [...path.matchAll(/\.([^.[\]]+)|\[(\d+)\]/g)].map((m) => m[1] ?? Number(m[2]));
  let current = value;
  let walked = label;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || !(part in current)) {
      throw new Error(`${walked} has no ${typeof part === "number" ? `item [${part}]` : `field "${part}"`}.`);
    }
    current = (current as Record<string | number, unknown>)[part];
    walked += typeof part === "number" ? `[${part}]` : `.${part}`;
  }
  return current;
}

// Same, for every string inside a JSON-like value (request bodies). Done before
// JSON.stringify so quotes and newlines in the filled-in text get escaped properly.
export function interpolateDeep(value: unknown, ctx: TemplateContext): unknown {
  if (typeof value === "string") return interpolate(value, ctx);
  if (Array.isArray(value)) return value.map((item) => interpolateDeep(item, ctx));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, interpolateDeep(inner, ctx)]));
  }
  return value;
}

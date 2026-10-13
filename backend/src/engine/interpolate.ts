export function interpolate(template: string, previousOutput: unknown, credentialValue?:string): string {
  let result = template;

  if (result.includes("{{previousOutput}}")) {
    const valueAsText = typeof previousOutput === "string" ? previousOutput : JSON.stringify(previousOutput);
    result = result.replaceAll("{{previousOutput}}", valueAsText);
  }

  if (result.includes("{{credential}}")) {
    if (!credentialValue) {
      throw new Error("This node references {{credential}} but no credential was resolved");
    }
    result = result.replaceAll("{{credential}}", credentialValue);
  }

  return result;
}

// Walks any JSON-like value and fills placeholders in every string inside it.
// Done before JSON.stringify so quotes/newlines in the output get escaped properly.
export function interpolateDeep(value: unknown, previousOutput: unknown, credentialValue?: string): unknown {
  if (typeof value === "string") {
    return interpolate(value, previousOutput, credentialValue);
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateDeep(item, previousOutput, credentialValue));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      result[key] = interpolateDeep(inner, previousOutput, credentialValue);
    }
    return result;
  }

  return value; // numbers, booleans, null: nothing to fill in
}


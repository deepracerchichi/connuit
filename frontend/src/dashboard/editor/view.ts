import type { Branch, Run, RunStep } from "../../api/types";
import { detectBlock } from "./blocks";
import { allSteps, type EditorStep } from "./model";

// Small display helpers shared by the desktop canvas and the phone list.

export const BRANCH_LABEL: Record<Branch, string> = { yes: "Yes", no: "No" };

// Each step's result, once the test-run pulse has delivered it (see usePulse).
export function deliveredResults(run: Run | null, reached: number) {
  return new Map((run?.steps.slice(0, reached) ?? []).map((step) => [step.nodeId, step]));
}

// Steps are numbered in reading order, paths included.
export const stepNumbers = (steps: EditorStep[]) => new Map(allSteps(steps).map((step, i) => [step.id, i + 1]));

// The small label above a step's name: its block, or AI/HTTP for hand-built ones.
export function kindLabel(step: EditorStep) {
  const { block } = detectBlock(step);
  return block.key === "custom" ? (step.kind === "llm_call" ? "AI" : "HTTP") : block.label;
}

// What a finished step shows: an If's answer in words, anything else a preview of its output.
export function resultText(result: RunStep) {
  return result.decision ? `The AI answered ${result.decision}: taking the “${BRANCH_LABEL[result.decision]}” path` : preview(result.output);
}

export function preview(output: unknown) {
  const text = typeof output === "string" ? output : JSON.stringify(output);
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

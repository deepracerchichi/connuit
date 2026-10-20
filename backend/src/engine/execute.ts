import { callLlm } from "./llm.js";
import type { WorkflowNode } from "../domain/workflow.js";
import { interpolate, interpolateDeep } from "./interpolate.js";


export async function executeNode(node: WorkflowNode, credentialValues: Map<string, string>, previousOutput: unknown, steps: Map<string, unknown>): Promise<unknown> {

    switch (node.config.type) {
        case "http_request":{
            const credentialValue = node.config.credentialId
                ? credentialValues.get(node.config.credentialId)
                : undefined;


            // Everything a {{placeholder}} in this step can refer to.
            const ctx = { previousOutput, credential: credentialValue, steps };

            const url = interpolate(node.config.url, ctx);
            const body = node.config.body !== undefined ? interpolateDeep(node.config.body, ctx) : undefined;

            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(node.config.headers ?? {})) {
                headers[key] = interpolate(value, ctx);
            }

            const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === "content-type");
            if (body !== undefined && !hasContentType) {
                headers["Content-Type"] = "application/json";
            }
            
            const response = await fetch(url, {
                method: node.config.method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
            });

            if (!response.ok) {
            throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get("content-type") ?? "";
            if (contentType.includes("application/json")) {
            return await response.json();
            }
            return await response.text();

         }
        
        case "llm_call": {
            const prompt = interpolate(node.config.prompt, { previousOutput, steps });

            return await callLlm(prompt, node.config.systemPrompt);
        }
                case "telegram_message": {
            const token = credentialValues.get(node.config.credentialId);
            if (!token) throw new Error("Telegram step needs a bot token credential.");

            const ctx = { previousOutput, steps };
            const chatId = interpolate(node.config.chatId, ctx);
            const text = interpolate(node.config.text, ctx);

            const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text }),
            });

            const result = (await response.json().catch(() => null)) as
                | { ok: boolean; description?: string; result?: { message_id: number } }
                | null;

            // Report Telegram's own reason, never the URL (it contains the token).
            if (!response.ok || !result?.ok) {
                throw new Error(`Telegram: ${result?.description ?? `request failed (${response.status})`}`);
            }
            return { messageId: result.result?.message_id };
        }
        case "condition":
            // If steps don't produce data; the run loop calls decide() for them instead.
            throw new Error("If steps are decided by the run loop, not executed here.");


        default: {
            const impossibleCase: never = node.config;
            throw new Error(`Unknown node type: ${JSON.stringify(impossibleCase)}`);
            }

    }
}
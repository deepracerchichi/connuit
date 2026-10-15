import { callLlm } from "./llm.js";
import type { WorkflowNode } from "../domain/workflow.js";
import { interpolate, interpolateDeep } from "./interpolate.js";


export async function executeNode(node: WorkflowNode, credentialValues: Map<string, string>, previousOutput?: unknown): Promise<unknown> {
    switch (node.config.type) {
        case "http_request":{
            const credentialValue = node.config.credentialId
                ? credentialValues.get(node.config.credentialId)
                : undefined;



            const url = interpolate(node.config.url, previousOutput, credentialValue);
const body = node.config.body !== undefined
    ? interpolateDeep(node.config.body, previousOutput, credentialValue)
    : undefined;


            const headers: Record<string, string> = {};

            for (const [key, value] of Object.entries(node.config.headers ?? {})) {
                headers[key] = interpolate(value, previousOutput, credentialValue);
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
            const prompt = interpolate(node.config.prompt, previousOutput);
            return await callLlm(prompt, node.config.systemPrompt);
        }

        default: {
            const impossibleCase: never = node.config;
            throw new Error(`Unknown node type: ${JSON.stringify(impossibleCase)}`);
            }

    }
}
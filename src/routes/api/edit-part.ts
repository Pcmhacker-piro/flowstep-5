import { createFileRoute } from "@tanstack/react-router";
import { createParser } from "eventsource-parser";
import { resolveDesignModel } from "@/lib/designModels";

// Rewrites a single element snippet inside a generated design.
// Body: { snippet: string, prompt: string, model?: string }
// Returns: streamed replacement snippet HTML (must preserve the same data-edit-id).
export const Route = createFileRoute("/api/edit-part")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          snippet?: string;
          prompt?: string;
          model?: string;
        };
        const snippet = (body.snippet ?? "").trim();
        const prompt = (body.prompt ?? "").trim();
        if (!snippet || !prompt) return new Response("Missing snippet or prompt", { status: 400 });
        const model = resolveDesignModel(body.model);

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const system = `You are a world-class senior product designer editing ONE element inside an existing UI. You will receive:
1. The current outer HTML of a single element (may include children).
2. A user instruction describing how to change ONLY that element.

STRICT RULES:
- Output ONLY the replacement HTML for that same element. No <!doctype>, no <html>, no <head>, no <body>, no markdown, no code fences, no commentary.
- The root tag of your output MUST be the same tag as the input's root and MUST keep the EXACT SAME \`data-edit-id\` attribute value. Do not add, remove, or change data-edit-id.
- Keep the element's outer size/role reasonable so it still fits its parent layout.
- You may freely rewrite children, classes, inline SVGs, text content, and colors to fulfil the instruction.
- Use Tailwind utility classes (Tailwind CDN is already loaded in the parent document). Inter font is available. Use inline SVGs for icons (lucide style, stroke-width 1.5). No <img> tags, no external URLs.
- Match the surrounding aesthetic: hairline borders (#E4E4E7), zinc/slate neutrals, tabular-nums for numbers, subtle shadows, rounded-xl. No purple-indigo gradients, no emoji, no round fake data.
- Realistic content only. No "Lorem", no "Placeholder".`;

        const userMessage = `Element to rewrite:\n\n${snippet}\n\nUser instruction:\n${prompt}\n\nReturn ONLY the replacement element HTML now.`;

        const { resolveUserKeysFromRequest } = await import("@/lib/userKeyLookup.server");
        const { pickProviderForModel, streamChatWithUserKey } = await import("@/lib/providerAdapters.server");
        const { keys: userKeys } = await resolveUserKeysFromRequest(request);
        const providerIds = new Set(Object.keys(userKeys) as Array<keyof typeof userKeys>);
        const picked = pickProviderForModel(model, providerIds as Set<never>);

        let upstream: Response;
        let usedProvider: string;
        if (picked && userKeys[picked] && model !== "openai/gpt-6-astra") {
          usedProvider = `byo:${picked}`;
          upstream = await streamChatWithUserKey({
            provider: picked,
            apiKey: userKeys[picked]!,
            model,
            systemPrompt: system,
            userPrompt: userMessage,
          });
        } else {
          usedProvider = "lovable";
          upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": key,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: "openai/gpt-6-astra",
              stream: true,
              reasoning: { effort: "low", summary: "concise" },
              input: [
                { role: "developer", content: [{ type: "input_text", text: system }] },
                { role: "user", content: [{ type: "input_text", text: userMessage }] },
              ],
            }),
          });
        }

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Edit generation failed", {
            status: upstream.status,
            headers: { "X-Edit-Provider": usedProvider },
          });
        }

        if (usedProvider === "lovable") {
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();
          let outputController: TransformStreamDefaultController<Uint8Array> | null = null;
          const parser = createParser({
            onEvent(message) {
              if (!outputController || !message.data || message.data === "[DONE]") return;
              try {
                const event = JSON.parse(message.data) as { type?: string; delta?: string; error?: { message?: string } };
                if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
                  outputController.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: event.delta } }] })}\n\n`));
                } else if (event.type === "error" || event.type === "response.failed") {
                  outputController.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: event.error?.message ?? "Edit failed" } })}\n\n`));
                } else if (event.type === "response.completed") {
                  outputController.enqueue(encoder.encode("data: [DONE]\n\n"));
                }
              } catch {
                // Ignore non-JSON heartbeat events.
              }
            },
          });
          const transformed = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              outputController = controller;
              parser.feed(decoder.decode(chunk, { stream: true }));
            },
          }));
          return new Response(transformed, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Edit-Provider": usedProvider,
            },
          });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Edit-Provider": usedProvider,
          },
        });
      },
    },
  },
});

import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "generate_design_brief",
  title: "Generate a Flowstep design brief",
  description:
    "Expand a short product idea into a structured Flowstep design brief (audience, tone, sections, visual direction) that the signed-in user can paste into the Flowstep canvas as a prompt.",
  inputSchema: {
    idea: z
      .string()
      .trim()
      .min(3)
      .max(2000)
      .describe("A short description of the product, page, or landing site to design."),
    audience: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Optional target audience (e.g. 'indie developers', 'HR leaders')."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ idea, audience }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        content: [{ type: "text", text: "AI is not configured on this app." }],
        isError: true,
      };
    }
    const systemPrompt =
      "You expand short product ideas into concise, opinionated design briefs for a landing-page generator called Flowstep. Return markdown with these sections: 1) One-line pitch, 2) Target audience, 3) Tone & voice (3 adjectives), 4) Page sections (bulleted, in order), 5) Visual direction (colors, typography, imagery). Keep total length under 400 words.";
    const userPrompt = audience
      ? `Idea: ${idea}\nAudience: ${audience}`
      : `Idea: ${idea}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      return {
        content: [{ type: "text", text: `AI request failed [${response.status}]: ${body}` }],
        isError: true,
      };
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const brief = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!brief) {
      return { content: [{ type: "text", text: "AI returned an empty brief." }], isError: true };
    }
    return {
      content: [{ type: "text", text: brief }],
      structuredContent: { brief },
    };
  },
});

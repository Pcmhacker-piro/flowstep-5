import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "update_my_profile",
  title: "Update my profile",
  description:
    "Update the signed-in Flowstep user's full name and/or avatar URL. Only provided fields are changed.",
  inputSchema: {
    full_name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe("New display name for the profile."),
    avatar_url: z
      .string()
      .url()
      .max(2048)
      .optional()
      .describe("Absolute https URL of an avatar image."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ full_name, avatar_url }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const patch: Record<string, string> = {};
    if (typeof full_name === "string") patch.full_name = full_name;
    if (typeof avatar_url === "string") patch.avatar_url = avatar_url;
    if (Object.keys(patch).length === 0) {
      return { content: [{ type: "text", text: "Nothing to update." }], isError: true };
    }
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", ctx.getUserId())
      .select("id, email, full_name, avatar_url, updated_at")
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Updated profile:\n${JSON.stringify(data, null, 2)}` }],
      structuredContent: { profile: data },
    };
  },
});

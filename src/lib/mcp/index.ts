import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getProfileTool from "./tools/get-profile";
import updateProfileTool from "./tools/update-profile";
import generateDesignBriefTool from "./tools/generate-design-brief";

// The OAuth issuer must be the direct Supabase host; the published SUPABASE_URL
// is rewritten to a proxy that mcp-js rejects (RFC 8414 issuer mismatch).
// VITE_SUPABASE_PROJECT_ID is inlined by Vite at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "flowstep-mcp",
  title: "Flowstep",
  version: "0.1.0",
  instructions:
    "Tools for the signed-in Flowstep user. Use `get_my_profile` to read the current account, `update_my_profile` to change the display name or avatar, and `generate_design_brief` to expand a short product idea into a Flowstep-ready design brief.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getProfileTool, updateProfileTool, generateDesignBriefTool],
});

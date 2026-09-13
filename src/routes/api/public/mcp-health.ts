import { createFileRoute } from "@tanstack/react-router";
import mcp from "@/lib/mcp";
import manifest from "../../../../.lovable/mcp/manifest.json" with { type: "json" };

// Unauthenticated liveness endpoint for the MCP server.
// Lives under /api/public/* so the platform's auth gate leaves it open to any
// caller (uptime checks, MCP clients probing before OAuth, curl). Returns only
// non-sensitive metadata: server name/version, transport path, auth mode, and
// the list of advertised tool names — never tokens, user data, or secrets.
export const Route = createFileRoute("/api/public/mcp-health")({
  server: {
    handlers: {
      GET: async () => {
        const tools = (manifest.mcp?.tools ?? []).map((t: { name: string; title?: string; description?: string; annotations?: unknown }) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          annotations: t.annotations,
        }));

        const body = {
          status: "ok" as const,
          server: {
            name: mcp.name,
            title: mcp.title,
            version: mcp.version,
          },
          transport: {
            path: manifest.path,
            protocol: "streamable-http",
          },
          auth: manifest.auth ?? { type: "none" },
          tools: {
            count: tools.length,
            available: tools.map((t) => t.name),
            details: tools,
          },
          checked_at: new Date().toISOString(),
        };

        return new Response(JSON.stringify(body, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
          },
        }),
    },
  },
});

// Server-only adapters for BYO-key AI providers.
// Each adapter can (1) validate an API key against the provider's `/models`
// endpoint and (2) build a streaming chat-completions request compatible with
// the OpenAI SSE format the client already parses.
import { type ProviderId } from "./providers";
export type { ProviderId } from "./providers";
export { PROVIDER_LABELS, PROVIDER_HELP, ALL_PROVIDERS } from "./providers";


interface ProviderConfig {
  validateUrl: string;
  chatUrl: string;
  headers: (key: string) => Record<string, string>;
  stripModelPrefix: boolean; // when true, remove `vendor/` before sending
  // Optional model translation. For Anthropic, OpenAI-compat requires the raw model id.
}

const CONFIGS: Record<ProviderId, ProviderConfig> = {
  openai: {
    validateUrl: "https://api.openai.com/v1/models",
    chatUrl: "https://api.openai.com/v1/chat/completions",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" }),
    stripModelPrefix: true,
  },
  gemini: {
    // Google's OpenAI-compatible endpoint.
    validateUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
    chatUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" }),
    stripModelPrefix: true,
  },
  openrouter: {
    validateUrl: "https://openrouter.ai/api/v1/key",
    chatUrl: "https://openrouter.ai/api/v1/chat/completions",
    headers: (k) => ({
      Authorization: `Bearer ${k}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://flowstep.app",
      "X-Title": "Flowstep",
    }),
    stripModelPrefix: false, // OpenRouter uses vendor/model natively
  },
  anthropic: {
    validateUrl: "https://api.anthropic.com/v1/models",
    chatUrl: "https://api.anthropic.com/v1/chat/completions",
    headers: (k) => ({
      "x-api-key": k,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    }),
    stripModelPrefix: true,
  },
  nvidia: {
    validateUrl: "https://integrate.api.nvidia.com/v1/models",
    chatUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" }),
    stripModelPrefix: false,
  },
  groq: {
    validateUrl: "https://api.groq.com/openai/v1/models",
    chatUrl: "https://api.groq.com/openai/v1/chat/completions",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" }),
    stripModelPrefix: true,
  },
};

/** Validate an API key by hitting the provider's models endpoint. */
export async function validateProviderKey(
  provider: ProviderId,
  apiKey: string,
): Promise<{ ok: boolean; status: number; message?: string }> {
  const cfg = CONFIGS[provider];
  try {
    const res = await fetch(cfg.validateUrl, { method: "GET", headers: cfg.headers(apiKey) });
    if (res.ok) return { ok: true, status: res.status };
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.text();
      const trimmed = body.slice(0, 300);
      if (trimmed) msg = trimmed;
    } catch {}
    return { ok: false, status: res.status, message: msg };
  } catch (err) {
    return { ok: false, status: 0, message: err instanceof Error ? err.message : "Network error" };
  }
}

/** Pick the best BYO provider for a given `vendor/model` string. */
export function pickProviderForModel(
  modelId: string,
  availableProviders: Set<ProviderId>,
): ProviderId | null {
  const vendor = modelId.split("/")[0]?.toLowerCase();
  if (vendor === "openai" && availableProviders.has("openai")) return "openai";
  if (vendor === "google" && availableProviders.has("gemini")) return "gemini";
  if (vendor === "anthropic" && availableProviders.has("anthropic")) return "anthropic";
  // Fallback: OpenRouter can route almost any vendor/model.
  if (availableProviders.has("openrouter")) return "openrouter";
  // Last-ditch — try direct vendor if we have their key.
  if (vendor === "openai" && availableProviders.has("openai")) return "openai";
  return null;
}

/** Map a Lovable-gateway `vendor/model` id to the model id the provider's own API expects. */
function mapModelForProvider(provider: ProviderId, modelId: string): string {
  const [, name = ""] = modelId.split("/");
  const lower = name.toLowerCase();
  if (provider === "gemini") {
    // Use Google's "-latest" aliases so retired versions don't 404 the request.
    if (lower.includes("pro")) return "gemini-pro-latest";
    if (lower.includes("flash-lite") || lower.includes("flash_lite")) return "gemini-flash-lite-latest";
    if (lower.includes("flash")) return "gemini-flash-latest";
    return "gemini-flash-latest";
  }
  if (provider === "openai") {
    // Lovable exposes future ids like gpt-5.5 that don't exist on OpenAI direct — fall back to a real strong model.
    if (lower.startsWith("gpt-5") || lower.startsWith("gpt-6") || lower.includes("sol") || lower.includes("terra") || lower.includes("luna"))
      return lower.includes("mini") || lower.includes("nano") ? "gpt-4o-mini" : "gpt-4o";
    return name || "gpt-4o";
  }
  if (provider === "anthropic") {
    if (lower.includes("haiku")) return "claude-3-5-haiku-latest";
    if (lower.includes("opus")) return "claude-opus-4-20250514";
    return "claude-sonnet-4-20250514";
  }
  if (provider === "openrouter") return modelId; // native vendor/model
  return name || modelId;
}

/** Kick off an upstream streaming chat completion using the user's key. */
export async function streamChatWithUserKey(params: {
  provider: ProviderId;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<Response> {
  const cfg = CONFIGS[params.provider];
  const model = params.provider === "openrouter"
    ? params.model
    : mapModelForProvider(params.provider, params.model);
  const body: Record<string, unknown> = {
    model,
    stream: true,
    // Design HTML can run 700+ lines — give the model room so output isn't truncated mid-document.
    max_tokens: 16384,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
  };
  // OpenAI's newer reasoning models reject sampling knobs but need generous completion budget.
  if (params.provider === "openai" && /^(o\d|gpt-5|gpt-6)/i.test(model)) {
    delete body.max_tokens;
    body.max_completion_tokens = 16384;
  }

  return fetch(cfg.chatUrl, {
    method: "POST",
    headers: cfg.headers(params.apiKey),
    body: JSON.stringify(body),
  });
}

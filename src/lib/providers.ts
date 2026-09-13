// Client-safe constants and types shared between the API-keys UI and the
// server-only provider adapters. This file must NOT import node built-ins.
export type ProviderId = "openai" | "gemini" | "openrouter" | "anthropic" | "nvidia" | "groq";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  anthropic: "Anthropic (Claude)",
  nvidia: "NVIDIA NIM",
  groq: "Groq",
};

export const PROVIDER_HELP: Record<ProviderId, { url: string; placeholder: string; prefix?: string }> = {
  openai: { url: "https://platform.openai.com/api-keys", placeholder: "sk-...", prefix: "sk-" },
  gemini: { url: "https://aistudio.google.com/apikey", placeholder: "AIza...", prefix: "AIza" },
  openrouter: { url: "https://openrouter.ai/keys", placeholder: "sk-or-v1-...", prefix: "sk-or-" },
  anthropic: { url: "https://console.anthropic.com/settings/keys", placeholder: "sk-ant-...", prefix: "sk-ant-" },
  nvidia: { url: "https://build.nvidia.com/", placeholder: "nvapi-...", prefix: "nvapi-" },
  groq: { url: "https://console.groq.com/keys", placeholder: "gsk_...", prefix: "gsk_" },
};

export const ALL_PROVIDERS: readonly ProviderId[] = [
  "openai",
  "gemini",
  "openrouter",
  "anthropic",
  "nvidia",
  "groq",
] as const;

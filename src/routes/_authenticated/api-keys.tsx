import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyApiKeys,
  saveMyApiKey,
  deleteMyApiKey,
  testMyApiKey,
  type StoredApiKey,
} from "@/lib/apiKeys.functions";
import { PROVIDER_HELP, PROVIDER_LABELS, type ProviderId } from "@/lib/providers";
import { ArrowLeft, CheckCircle2, ExternalLink, KeyRound, Loader2, Trash2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/api-keys")({
  component: ApiKeysPage,
  head: () => ({
    meta: [{ title: "API keys — Flowstep" }, { name: "robots", content: "noindex" }],
  }),
});

const PROVIDERS: ProviderId[] = ["openai", "gemini", "openrouter", "anthropic", "nvidia", "groq"];

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const diff = Date.now() - then;
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; msg: string }
  | { kind: "error"; msg: string };

function ApiKeysPage() {
  const listFn = useServerFn(listMyApiKeys);
  const saveFn = useServerFn(saveMyApiKey);
  const deleteFn = useServerFn(deleteMyApiKey);
  const testFn = useServerFn(testMyApiKey);

  const [keys, setKeys] = useState<StoredApiKey[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, Status>>({});
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [showKey, setShowKey] = useState<Partial<Record<ProviderId, boolean>>>({});

  async function refresh() {
    try {
      const rows = await listFn();
      setKeys(rows);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load keys");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  const setStatus = (p: ProviderId, s: Status) => setRowStatus((prev) => ({ ...prev, [p]: s }));

  async function handleSave(provider: ProviderId) {
    const apiKey = (drafts[provider] ?? "").trim();
    if (apiKey.length < 8) {
      setStatus(provider, { kind: "error", msg: "Key looks too short." });
      return;
    }
    setStatus(provider, { kind: "saving" });
    try {
      await saveFn({ data: { provider, apiKey } });
      setDrafts((d) => ({ ...d, [provider]: "" }));
      setStatus(provider, { kind: "success", msg: "Verified & saved." });
      await refresh();
    } catch (err) {
      setStatus(provider, { kind: "error", msg: err instanceof Error ? err.message : "Failed" });
    }
  }

  async function handleTest(provider: ProviderId) {
    setStatus(provider, { kind: "saving" });
    try {
      const res = await testFn({ data: { provider } });
      if (res.ok) {
        setStatus(provider, { kind: "success", msg: "Key is live." });
        await refresh();
      } else {
        setStatus(provider, {
          kind: "error",
          msg: `Failed (${res.status ?? "?"}): ${res.message ?? "provider rejected the key"}`,
        });
      }
    } catch (err) {
      setStatus(provider, { kind: "error", msg: err instanceof Error ? err.message : "Failed" });
    }
  }

  async function handleDelete(provider: ProviderId) {
    setStatus(provider, { kind: "saving" });
    try {
      await deleteFn({ data: { provider } });
      setStatus(provider, { kind: "idle" });
      await refresh();
    } catch (err) {
      setStatus(provider, { kind: "error", msg: err instanceof Error ? err.message : "Failed" });
    }
  }

  const savedByProvider = new Map<ProviderId, StoredApiKey>();
  (keys ?? []).forEach((k) => savedByProvider.set(k.provider, k));

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/account"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to account
        </Link>

        <div className="mb-8 flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-neutral-900 text-white">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Your API keys</h1>
            <p className="mt-1 max-w-xl text-sm text-neutral-500">
              Bring your own keys. When a saved key matches the model you pick, Flowstep calls the provider
              directly — bypassing Lovable credits. Keys are validated against the provider before saving and
              stored encrypted.
            </p>
          </div>
        </div>

        {loadError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        <div className="space-y-4">
          {PROVIDERS.map((provider) => {
            const saved = savedByProvider.get(provider);
            const status = rowStatus[provider] ?? { kind: "idle" };
            const help = PROVIDER_HELP[provider];
            const draft = drafts[provider] ?? "";
            return (
              <div
                key={provider}
                className="rounded-2xl border border-black/10 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-[15px] font-semibold text-neutral-900">
                        {PROVIDER_LABELS[provider]}
                      </h2>
                      {saved ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Connected · ••••{saved.key_last4}
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                          Not connected
                        </span>
                      )}
                    </div>
                    <a
                      href={help.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-neutral-900"
                    >
                      Get a key <ExternalLink className="h-3 w-3" />
                    </a>
                    {saved ? (
                      <div className="mt-1.5">
                        {status.kind === "error" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                            <XCircle className="h-3 w-3" /> Validation failed
                          </span>
                        ) : saved.last_verified_at ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> Validated · {formatRelative(saved.last_verified_at)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                            Not yet validated
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {saved ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTest(provider)}
                        disabled={status.kind === "saving"}
                        className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(provider)}
                        disabled={status.kind === "saving"}
                        className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <input
                      type={showKey[provider] ? "text" : "password"}
                      value={draft}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [provider]: e.target.value }))
                      }
                      placeholder={saved ? "Replace with a new key…" : help.placeholder}
                      spellCheck={false}
                      autoComplete="off"
                      className="w-full rounded-full border border-black/10 bg-white px-4 py-2 pr-16 text-[13px] font-mono text-neutral-900 outline-none focus:border-neutral-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((s) => ({ ...s, [provider]: !s[provider] }))}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-900"
                    >
                      {showKey[provider] ? "Hide" : "Show"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSave(provider)}
                    disabled={status.kind === "saving" || draft.trim().length < 8}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {status.kind === "saving" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…
                      </>
                    ) : saved ? (
                      "Replace & verify"
                    ) : (
                      "Verify & save"
                    )}
                  </button>
                </div>

                {status.kind === "success" ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {status.msg}
                  </p>
                ) : null}
                {status.kind === "error" ? (
                  <p className="mt-2 inline-flex items-start gap-1.5 text-[12px] text-red-600">
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="break-words">{status.msg}</span>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-[12px] text-neutral-500">
          Keys are encrypted at rest with AES-256-GCM and only decrypted server-side when you generate a design.
          They are never sent to your browser after saving.
        </p>
      </div>
    </div>
  );
}

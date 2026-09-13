import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import logoAsset from "@/assets/logo.png";

const NEXT_STORAGE_KEY = "flowstep:oauth_next";

function safeNext(raw: string | undefined): string | null {
  if (!raw) return null;
  // Only same-origin relative paths.
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign up — Flowstep" },
      { name: "description", content: "Create your Flowstep account or log in." },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img src={logoAsset} alt="Flowstep" className="h-7 w-7 rounded-lg" />
      <span className="text-lg font-semibold tracking-tight text-[#0b1220]">flowstep</span>
    </div>
  );
}


function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const nextPath = safeNext(search.next);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [updates, setUpdates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(true);

  function goNext() {
    if (nextPath) {
      window.location.href = nextPath;
      return;
    }
    navigate({ to: "/app", replace: true });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      // Honor a same-origin `next` stashed before Google OAuth returned to /auth.
      if (typeof window !== "undefined") {
        const stashed = safeNext(sessionStorage.getItem(NEXT_STORAGE_KEY) ?? undefined);
        if (stashed) {
          sessionStorage.removeItem(NEXT_STORAGE_KEY);
          window.location.href = stashed;
          return;
        }
      }
      if (nextPath) {
        window.location.href = nextPath;
        return;
      }
      navigate({ to: "/app", replace: true });
    });
  }, [navigate, nextPath]);

  async function handleGoogle() {
    setError(null);
    if (nextPath && typeof window !== "undefined") {
      sessionStorage.setItem(NEXT_STORAGE_KEY, nextPath);
    }
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw new Error(result.error.message ?? "Google sign-in failed");
      if (result.redirected) return;
      goNext();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      if (/not supported|not enabled|provider/i.test(message)) {
        setGoogleAvailable(false);
        setError("Google sign-in isn't available yet. Please use your email and password.");
        return;
      }
      setError(message);
    }
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: nextPath
              ? `${window.location.origin}${nextPath}`
              : `${window.location.origin}/app`,
            data: { marketing_opt_in: updates },
          },
        });
        if (error) throw error;
        goNext();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        goNext();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="min-h-screen bg-white">
      <header className="px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-6 pt-16 pb-24">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-[#0b1220]">
          {isSignup ? "Sign up" : "Log in"}
        </h1>
        <p className="mt-2 text-center text-sm text-[#0b1220]/70">
          {isSignup ? "Already have an account? " : "New to Flowstep? "}
          <button
            type="button"
            onClick={() => {
              setMode(isSignup ? "login" : "signup");
              setError(null);
            }}
            className="font-medium text-[#2b6bff] hover:underline"
          >
            {isSignup ? "Log in" : "Sign up"}
          </button>
        </p>

        {googleAvailable && (
          <>
            <button
              onClick={handleGoogle}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-lg bg-[#f4f4f5] px-4 py-3 text-sm font-medium text-[#0b1220] hover:bg-[#eaeaec]"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="my-6 flex items-center gap-3 text-xs text-[#0b1220]/40">
              <div className="h-px flex-1 bg-black/10" />
              <span>or</span>
              <div className="h-px flex-1 bg-black/10" />
            </div>
          </>
        )}
        {!googleAvailable && <div className="mt-8" />}


        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm text-[#0b1220]">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-[#f4f4f5] px-4 py-3 text-sm text-[#0b1220] outline-none ring-[#2b6bff] focus:ring-2"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-sm text-[#0b1220]">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-[#f4f4f5] px-4 py-3 text-sm text-[#0b1220] outline-none ring-[#2b6bff] focus:ring-2"
              required
            />
          </div>

          {isSignup && (
            <label className="flex items-center gap-2 pt-1 text-sm text-[#0b1220]/80">
              <input
                type="checkbox"
                checked={updates}
                onChange={(e) => setUpdates(e.target.checked)}
                className="h-4 w-4 accent-[#2b6bff]"
              />
              Keep me updated with Flowstep's news and offers
            </label>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-[#2b6bff] px-5 py-3 text-sm font-medium text-white hover:bg-[#1f57df] disabled:opacity-60"
          >
            {loading ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
          </button>

          {isSignup && (
            <p className="pt-2 text-xs text-[#0b1220]/50">
              By creating an account, you acknowledge that you have read, understood, and agree to
              our <a className="underline" href="#">Terms of Use</a> and{" "}
              <a className="underline" href="#">Privacy Policy</a>.
            </p>
          )}
        </form>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.5 2.2 2 6.7 2 12.1S6.5 22 12 22c6.9 0 11.5-4.9 11.5-11.7 0-.8-.1-1.4-.2-2H12z" />
    </svg>
  );
}

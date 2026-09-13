import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import { ArrowLeft, Loader2, LogOut, Trash2, User as UserIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account settings — Flowstep" }, { name: "robots", content: "noindex" }] }),
  component: AccountPage,
});

type Profile = {
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

function AccountPage() {
  const navigate = useNavigate();
  const deleteAccount = useServerFn(deleteMyAccount);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [originalEmail, setOriginalEmail] = useState<string>("");
  const [profile, setProfile] = useState<Profile>({ display_name: "", avatar_url: "", bio: "" });
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      setEmail(u.user.email ?? "");
      setOriginalEmail(u.user.email ?? "");
      const { data: p } = await (supabase as any)
        .from("profiles")
        .select("display_name, avatar_url, bio")
        .eq("id", u.user.id)
        .maybeSingle();
      if (p) setProfile({ display_name: p.display_name ?? "", avatar_url: p.avatar_url ?? "", bio: p.bio ?? "" });
      setLoading(false);
    })();
  }, []);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg(null), 4000);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSavingProfile(true);
    const { error } = await (supabase as any).from("profiles").upsert({
      id: userId,
      display_name: profile.display_name?.trim() || null,
      avatar_url: profile.avatar_url?.trim() || null,
      bio: profile.bio?.trim() || null,
    });
    setSavingProfile(false);
    flash(error ? "err" : "ok", error ? error.message : "Profile updated");
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (email === originalEmail) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email });
    setSavingEmail(false);
    if (error) flash("err", error.message);
    else flash("ok", "Check both inboxes for confirmation links to complete the change.");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return flash("err", "Password must be at least 8 characters.");
    if (password !== passwordConfirm) return flash("err", "Passwords don't match.");
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) flash("err", error.message);
    else {
      setPassword("");
      setPasswordConfirm("");
      flash("ok", "Password updated");
    }
  }

  async function handleDelete() {
    const confirmText = window.prompt('Type "DELETE" to permanently remove your account. This cannot be undone.');
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    try {
      await deleteAccount({ data: undefined });
      await supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    } catch (err) {
      setDeleting(false);
      flash("err", err instanceof Error ? err.message : "Failed to delete account");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f5f2]">
        <Loader2 className="h-6 w-6 animate-spin text-[#0b1220]/50" />
      </div>
    );
  }

  const initial = (profile.display_name?.trim() || email || "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-[#0b1220]">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link to="/app" className="inline-flex items-center gap-2 text-sm text-[#0b1220]/70 hover:text-[#0b1220]">
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Link>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm text-[#0b1220] hover:bg-black/5"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Account settings</h1>
        <p className="mt-1 text-sm text-[#0b1220]/60">Manage your profile, sign-in details, and account.</p>

        {msg && (
          <div
            className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
              msg.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Profile */}
        <section className="mt-8 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Profile</h2>
          <form onSubmit={saveProfile} className="mt-5 space-y-5">
            <div className="flex items-center gap-4">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover ring-1 ring-black/10"
                  onError={(e) => ((e.currentTarget.style.display = "none"))}
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0b1220] text-xl font-semibold text-white">
                  {initial}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-[#0b1220]/50">
                <UserIcon className="h-3.5 w-3.5" /> Paste an image URL below to update your avatar.
              </div>
            </div>

            <Field label="Display name">
              <input
                type="text"
                value={profile.display_name ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, display_name: e.target.value }))}
                placeholder="Your name"
                className="input"
              />
            </Field>
            <Field label="Avatar URL">
              <input
                type="url"
                value={profile.avatar_url ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, avatar_url: e.target.value }))}
                placeholder="https://…"
                className="input"
              />
            </Field>
            <Field label="Bio">
              <textarea
                value={profile.bio ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
                placeholder="A short bio"
                rows={3}
                className="input resize-none"
              />
            </Field>
            <div className="flex justify-end">
              <button type="submit" disabled={savingProfile} className="btn-primary">
                {savingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save profile
              </button>
            </div>
          </form>
        </section>

        {/* Email */}
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Email address</h2>
          <p className="mt-1 text-sm text-[#0b1220]/60">You'll receive a confirmation link at both addresses.</p>
          <form onSubmit={saveEmail} className="mt-5 space-y-4">
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
              />
            </Field>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingEmail || email === originalEmail || !email}
                className="btn-primary"
              >
                {savingEmail && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Update email
              </button>
            </div>
          </form>
        </section>

        {/* Password */}
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Password</h2>
          <form onSubmit={savePassword} className="mt-5 space-y-4">
            <Field label="New password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="input"
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="input"
              />
            </Field>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPassword || !password || password !== passwordConfirm}
                className="btn-primary"
              >
                {savingPassword && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Update password
              </button>
            </div>
          </form>
        </section>

        {/* API keys */}
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Your API keys</h2>
              <p className="mt-1 text-sm text-[#0b1220]/60">
                Bring your own OpenAI, Gemini, OpenRouter, Anthropic, NVIDIA, or Groq key. Flowstep will use it
                directly for matching models — bypassing Lovable credits.
              </p>
            </div>
            <Link
              to="/api-keys"
              className="shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Manage keys
            </Link>
          </div>
        </section>

        {/* Danger */}

        <section className="mt-6 rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-red-700">Delete account</h2>
          <p className="mt-1 text-sm text-[#0b1220]/60">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete my account
            </button>
          </div>
        </section>
      </main>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.625rem;
          border: 1px solid rgba(0,0,0,0.1);
          background: white;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          color: #0b1220;
          outline: none;
          transition: border-color 120ms, box-shadow 120ms;
        }
        .input:focus { border-color: #0b1220; box-shadow: 0 0 0 3px rgba(11,18,32,0.08); }
        .btn-primary {
          display: inline-flex; align-items: center; gap: 0.375rem;
          border-radius: 9999px; background: #0b1220; color: white;
          padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 500;
        }
        .btn-primary:hover:not(:disabled) { background: black; }
        .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#0b1220]/50">{label}</span>
      {children}
    </label>
  );
}

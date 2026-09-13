import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuthorizationDetails = {
  client?: { name?: string; redirect_uri?: string };
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};

type OAuthNamespace = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
};

function oauthClient(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthClient().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md px-6 py-16 text-[#0b1220]">
      <h1 className="text-2xl font-semibold">Authorization error</h1>
      <p className="mt-3 text-sm text-[#0b1220]/70">
        Could not load this authorization request: {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "an app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const call = approve ? oauthClient().approveAuthorization : oauthClient().denyAuthorization;
    const { data, error } = await call(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-[#0b1220]">
      <h1 className="text-2xl font-semibold tracking-tight">
        Connect {clientName} to your Flowstep account
      </h1>
      <p className="mt-3 text-sm text-[#0b1220]/70">
        {clientName} will be able to call Flowstep tools while you are signed in — read and update
        your profile, and generate design briefs on your behalf.
      </p>
      <p className="mt-3 text-xs text-[#0b1220]/50">
        This does not bypass Flowstep's permissions or backend policies. You can revoke access at
        any time.
      </p>
      {details?.client?.redirect_uri && (
        <p className="mt-4 rounded-md bg-[#f4f4f5] px-3 py-2 text-xs text-[#0b1220]/70 break-all">
          Redirect URI: {details.client.redirect_uri}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(true)}
          className="inline-flex items-center justify-center rounded-lg bg-[#2b6bff] px-5 py-3 text-sm font-medium text-white hover:bg-[#1f57df] disabled:opacity-60"
        >
          {busy ? "Please wait…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(false)}
          className="inline-flex items-center justify-center rounded-lg bg-[#f4f4f5] px-5 py-3 text-sm font-medium text-[#0b1220] hover:bg-[#eaeaec] disabled:opacity-60"
        >
          Deny
        </button>
      </div>
    </main>
  );
}

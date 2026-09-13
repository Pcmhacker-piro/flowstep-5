// Server-only helper: given a bearer token from a raw HTTP route, resolve the
// signed-in user's stored BYO provider keys.
import { createClient } from "@supabase/supabase-js";
import { decryptKey } from "./keyCrypto.server";
import type { ProviderId } from "./providerAdapters.server";

export type UserKeyMap = Partial<Record<ProviderId, string>>;

export async function resolveUserKeysFromRequest(request: Request): Promise<{
  userId: string | null;
  keys: UserKeyMap;
}> {
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) return { userId: null, keys: {} };
  const token = auth.slice(7).trim();
  if (!token) return { userId: null, keys: {} };

  const url = process.env.SUPABASE_URL;
  const pubKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !pubKey) return { userId: null, keys: {} };

  const supabase = createClient(url, pubKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (!user) return { userId: null, keys: {} };

  const { data, error } = await supabase
    .from("user_api_keys")
    .select("provider, key_ciphertext")
    .eq("user_id", user.id);
  if (error || !data) return { userId: user.id, keys: {} };

  const keys: UserKeyMap = {};
  for (const row of data) {
    try {
      keys[row.provider as ProviderId] = decryptKey(row.key_ciphertext);
    } catch {
      // ignore malformed row
    }
  }
  return { userId: user.id, keys };
}

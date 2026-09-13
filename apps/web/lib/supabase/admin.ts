import { createClient } from "@supabase/supabase-js";

/** Service-role client. Server only. Bypasses RLS. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    // never let Next.js cache these reads
    global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) },
  });
}

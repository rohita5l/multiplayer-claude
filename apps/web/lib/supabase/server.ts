import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** User-scoped client for Server Components, Server Actions and Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; proxy.ts refreshes sessions instead.
        }
      },
    },
  });
}

/** Returns the signed-in user's claims or null. */
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub as string,
    email: (claims.email as string | undefined) ?? null,
    isAnonymous: Boolean(claims.is_anonymous),
    displayName: ((claims.user_metadata as { display_name?: string } | undefined)?.display_name ?? null) as string | null,
  };
}

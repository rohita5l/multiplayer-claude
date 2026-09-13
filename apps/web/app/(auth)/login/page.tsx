"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn, type AuthResult } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthResult, FormData>(signIn, {});
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/";
  const email = sp.get("email") ?? "";
  return (
    <Card>
      <CardHeader><CardTitle>Sign in</CardTitle></CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" defaultValue={email} required /></div>
          <div className="space-y-1.5"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
          <p className="text-sm text-muted-foreground text-center">No account? <Link href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`} className="underline">Sign up</Link></p>
        </form>
      </CardContent>
    </Card>
  );
}

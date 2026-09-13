"use client";
import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUp, type AuthResult } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SignupPageInner() {
  const [state, action, pending] = useActionState<AuthResult, FormData>(signUp, {});
  const sp = useSearchParams();
  const next = sp.get("next") ?? "";
  const email = sp.get("email") ?? "";
  return (
    <Card>
      <CardHeader><CardTitle>Create your account</CardTitle></CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-1.5"><Label htmlFor="displayName">Name</Label><Input id="displayName" name="displayName" placeholder="Shown to collaborators" required /></div>
          <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" defaultValue={email} required /></div>
          <div className="space-y-1.5"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
          {!next.startsWith("/join/") && (
            <div className="space-y-1.5"><Label htmlFor="inviteCode">Invite code</Label><Input id="inviteCode" name="inviteCode" placeholder="Ask the team for a code" autoComplete="off" /></div>
          )}
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating…" : "Sign up"}</Button>
          <p className="text-sm text-muted-foreground text-center">Have an account? <Link href="/login" className="underline">Sign in</Link></p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

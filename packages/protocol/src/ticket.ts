import { createHmac, timingSafeEqual } from "node:crypto";
import type { Ticket } from "./index.js";

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64url");
}

/** Ticket format: base64url(json).base64url(hmacSha256(json, secret)) */
export function signTicket(ticket: Ticket, secret: string): string {
  const body = b64url(JSON.stringify(ticket));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyTicket(token: string, secret: string): Ticket | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Ticket;
    if (typeof t.exp !== "number" || t.exp * 1000 < Date.now()) return null;
    return t;
  } catch {
    return null;
  }
}

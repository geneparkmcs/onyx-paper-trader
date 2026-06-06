// Rolled auth: bcrypt password hashing + a JWT session in an httpOnly, SameSite=Lax
// cookie (DESIGN.md §2, §9). The user is ALWAYS derived from the session here — never
// from a request parameter — which is the app's authz boundary.

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // blocks cross-site POSTs -> CSRF mitigation for our same-origin API
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}

/** The authenticated user id from the session cookie, or null. */
export async function getUserId(): Promise<string | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export type SessionUser = {
  id: string;
  username: string;
  balanceCents: number;
  createdAt: Date;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const id = await getUserId();
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, balanceCents: true, createdAt: true },
  });
}

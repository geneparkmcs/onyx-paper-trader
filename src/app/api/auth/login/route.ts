import { NextRequest, NextResponse } from "next/server";
import { credentialsSchema } from "@/lib/validation";
import { verifyPassword, createSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  // Generic message either way -> no username enumeration.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "invalid username or password" }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({
    user: { id: user.id, username: user.username, balanceCents: user.balanceCents },
  });
}

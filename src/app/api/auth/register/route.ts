import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { credentialsSchema } from "@/lib/validation";
import { hashPassword, createSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { username, password } = parsed.data;
  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        balanceCents: config.seedBalanceCents,
      },
      select: { id: true, username: true, balanceCents: true },
    });
    await createSession(user.id);
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "username already taken" }, { status: 409 });
    }
    throw e;
  }
}

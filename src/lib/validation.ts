// Boundary validation (DESIGN.md §9). Every request body is parsed here before any
// money logic runs; malformed input is rejected, not coerced.

import { z } from "zod";

export const credentialsSchema = z.object({
  username: z.string().trim().min(3, "username must be at least 3 characters").max(32),
  password: z.string().min(8, "password must be at least 8 characters").max(200),
});

export const orderSchema = z.object({
  ticker: z.string().trim().min(1),
  side: z.enum(["YES", "NO"]),
  qty: z.number().int().positive().max(100_000),
  idempotencyKey: z.string().trim().min(8).max(200),
  // The price the user saw, in cents — used only for slippage protection, never as the fill price.
  expectedPriceCents: z.number().int().min(1).max(99).optional(),
});

export type OrderInput = z.infer<typeof orderSchema>;
export type Credentials = z.infer<typeof credentialsSchema>;

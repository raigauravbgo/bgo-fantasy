import { type NextRequest } from "next/server";
import { z } from "zod";

import { getEnv } from "@/config/env";
import { hashPassword } from "@/server/auth/password";
import { handleApiError, json, RequestError } from "@/server/api/http";
import { usersRepository } from "@/server/repositories/users";

const schema = z.object({
  name: z.string().min(2).default("BGO Admin"),
  email: z.email().default("admin@bgo.local"),
  password: z.string().min(8).default("ChangeMe123!")
});

export async function POST(request: NextRequest) {
  try {
    if (getEnv().APP_ENV === "production") {
      throw new RequestError("Dev seed is disabled in production", 404);
    }

    const input = schema.parse(await request.json().catch(() => ({})));
    const repo = usersRepository();
    const existing = await repo.findByEmail(input.email);

    if (existing) {
      return json({
        user: {
          id: existing.id,
          email: existing.email,
          role: existing.role
        },
        existed: true
      });
    }

    const user = await repo.create({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: "super_admin"
    });

    return json({
      user: { id: user.id, email: user.email, role: user.role },
      existed: false
    });
  } catch (error) {
    return handleApiError(error);
  }
}

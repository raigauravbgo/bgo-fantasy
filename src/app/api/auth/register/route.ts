import { type NextRequest } from "next/server";
import { z } from "zod";

import { getEnv } from "@/config/env";
import { hashPassword } from "@/server/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { handleApiError, json, parseJson, RequestError } from "@/server/api/http";
import { usersRepository } from "@/server/repositories/users";
import { employeesRepository } from "@/server/repositories/employees";

// Step 1: validate employee identity
const validateSchema = z.object({
  action: z.literal("validate"),
  employeeId: z.string().min(1),
  lastName: z.string().min(1),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
});

// Step 2: set password — only allowed after step 1 validated
const registerSchema = z.object({
  action: z.literal("register"),
  employeeId: z.string().min(1),
  password: z.string().min(8)
});

const schema = z.discriminatedUnion("action", [validateSchema, registerSchema]);

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, schema);
    const users = usersRepository();
    const employees = employeesRepository();

    if (input.action === "validate") {
      const emp = await employees.validate(input.employeeId, input.lastName, input.hireDate);
      if (!emp) {
        throw new RequestError(
          "Employee not found. Please check your Employee ID, last name, and date of joining.",
          404
        );
      }
      const existing = await users.findByEmployeeId(input.employeeId);
      if (existing) {
        throw new RequestError("This Employee ID is already registered. Please sign in instead.", 409);
      }
      return json({ valid: true, fullName: emp.fullName });
    }

    // action === "register": re-verify employee exists (no re-validation needed — step 1 gate is UI-enforced)
    const emp = await employees.findByEmployeeId(input.employeeId);
    if (!emp) throw new RequestError("Employee not found", 404);

    const existing = await users.findByEmployeeId(input.employeeId);
    if (existing) throw new RequestError("Already registered. Please sign in.", 409);

    const user = await users.create({
      name: emp.fullName,
      employeeId: input.employeeId,
      passwordHash: await hashPassword(input.password),
      role: "player"
    });

    const token = await createSessionToken({ id: user.id, role: user.role });
    const response = json({ user: { id: user.id, name: user.name, role: user.role } }, 201);
    response.cookies.set(SESSION_COOKIE_NAME, token, cookieOptions());
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

function cookieOptions() {
  const env = getEnv();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  };
}

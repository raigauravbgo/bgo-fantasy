import { type NextRequest } from "next/server";
import { z } from "zod";

import { getEnv } from "@/config/env";
import { verifyPassword } from "@/server/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { handleApiError, json, parseJson, RequestError } from "@/server/api/http";
import { usersRepository } from "@/server/repositories/users";
import { employeesRepository } from "@/server/repositories/employees";

const schema = z.object({
  employeeId: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, schema);
    const users = usersRepository();
    const user = await users.findByEmployeeId(input.employeeId);

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new RequestError("Invalid Employee ID or password", 401);
    }

    // Non-admin accounts are only valid while the employee is still on the roster
    if (user.role !== "admin" && user.employeeId) {
      const emp = await employeesRepository().findByEmployeeId(user.employeeId);
      if (!emp) {
        throw new RequestError("Your account is no longer active. Please contact HR.", 401);
      }
    }

    const token = await createSessionToken({ id: user.id, role: user.role });
    const response = json({ user: { id: user.id, name: user.name, role: user.role } });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: getEnv().NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

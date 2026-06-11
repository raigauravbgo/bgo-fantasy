import { type NextRequest } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/server/auth/password";
import { handleApiError, json, parseJson, RequestError } from "@/server/api/http";
import { employeesRepository } from "@/server/repositories/employees";
import { usersRepository } from "@/server/repositories/users";

const validateSchema = z.object({
  action: z.literal("validate"),
  employeeId: z.string().min(1),
  lastName: z.string().min(1),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
});

const resetSchema = z.object({
  action: z.literal("reset"),
  employeeId: z.string().min(1),
  lastName: z.string().min(1),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  newPassword: z.string().min(8, "Password must be at least 8 characters")
});

const schema = z.discriminatedUnion("action", [validateSchema, resetSchema]);

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, schema);
    const employees = employeesRepository();
    const users = usersRepository();

    // Verify identity against employee roster (same logic as registration)
    const emp = await employees.validate(input.employeeId, input.lastName, input.hireDate);
    if (!emp) {
      throw new RequestError("Details do not match our records. Check your Employee ID, last name, and date of joining.", 401);
    }

    if (input.action === "validate") {
      return json({ valid: true, fullName: emp.fullName });
    }

    // Reset — find the user account and update the password
    const user = await users.findByEmployeeId(input.employeeId);
    if (!user) {
      throw new RequestError("No account found for this Employee ID. Please register first.", 404);
    }

    await users.updatePassword(user.id, await hashPassword(input.newPassword));
    return json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

import { type NextRequest } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/server/auth/password";
import { handleApiError, json, parseJson, RequestError } from "@/server/api/http";
import { usersRepository } from "@/server/repositories/users";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8)
});

export async function GET() {
  try {
    const users = await usersRepository().list();
    const hasAdmin = users.some((u) => u.role === "admin" || u.role === "super_admin");
    return json({ setupRequired: !hasAdmin });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const repo = usersRepository();
    const users = await repo.list();
    const hasAdmin = users.some((u) => u.role === "admin" || u.role === "super_admin");
    if (hasAdmin) {
      throw new RequestError("Setup already complete", 403);
    }
    const input = await parseJson(request, schema);
    const user = await repo.create({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: "super_admin"
    });
    return json({ email: user.email, role: user.role });
  } catch (error) {
    return handleApiError(error);
  }
}

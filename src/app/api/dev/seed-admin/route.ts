import { hashPassword } from "@/server/auth/password";
import { handleApiError, json } from "@/server/api/http";
import { usersRepository } from "@/server/repositories/users";

const SEED_EMAIL = "admin@bgo.com";
const SEED_PASSWORD = "Admin1234!";
const SEED_NAME = "BGO Admin";

async function seed() {
  const repo = usersRepository();
  const existing = await repo.findByEmail(SEED_EMAIL);
  if (existing) {
    return json({ email: SEED_EMAIL, password: SEED_PASSWORD, existed: true });
  }
  await repo.create({
    name: SEED_NAME,
    email: SEED_EMAIL,
    passwordHash: await hashPassword(SEED_PASSWORD),
    role: "super_admin"
  });
  return json({ email: SEED_EMAIL, password: SEED_PASSWORD, existed: false });
}

export async function GET() {
  try {
    return await seed();
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    return await seed();
  } catch (error) {
    return handleApiError(error);
  }
}

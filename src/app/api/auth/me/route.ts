import { getSessionUser, getUserRecord, json } from "@/server/api/http";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return json({ user: null });

  const user = await getUserRecord(session.id);
  return json({
    user: user
      ? { id: user.id, name: user.name, email: user.email, role: user.role }
      : null
  });
}

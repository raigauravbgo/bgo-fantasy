export type UserRole = "player" | "admin" | "super_admin";

export type SessionUser = {
  id: string;
  email?: string | null;
  role: UserRole;
};

export type UserDocument = {
  _id: string;
  name: string;
  email?: string | null;
  employeeId?: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

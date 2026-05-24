export type UserRole = "player" | "admin" | "super_admin";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
};

export type UserDocument = {
  _id: string;
  name: string;
  email: string;
  employeeId?: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

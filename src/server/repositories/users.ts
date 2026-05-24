import type { User } from "@/domain/models";
import { newId } from "@/server/db/collection";
import { prisma } from "@/server/db/prisma";

export function usersRepository() {
  return {
    async findByEmail(email: string): Promise<User | null> {
      return prisma.user.findUnique({ where: { email: email.toLowerCase() } }) as Promise<User | null>;
    },
    async findById(id: string): Promise<User | null> {
      return prisma.user.findUnique({ where: { id } }) as Promise<User | null>;
    },
    async create(input: {
      name: string;
      email: string;
      employeeId?: string;
      passwordHash: string;
      role?: User["role"];
    }): Promise<User> {
      const now = new Date();
      return prisma.user.create({
        data: {
          id: newId(),
          name: input.name,
          email: input.email.toLowerCase(),
          employeeId: input.employeeId,
          passwordHash: input.passwordHash,
          role: input.role ?? "player",
          createdAt: now,
          updatedAt: now
        }
      }) as Promise<User>;
    },
    async list(): Promise<User[]> {
      return prisma.user.findMany({ orderBy: { createdAt: "desc" } }) as Promise<User[]>;
    }
  };
}

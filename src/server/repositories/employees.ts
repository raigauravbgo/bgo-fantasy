import { newId } from "@/server/db/collection";
import { prisma } from "@/server/db/prisma";

export type EmployeeRecord = {
  id: string;
  employeeId: string;
  lastName: string;
  firstName: string;
  fullName: string;
  hireDate: Date;
};

export function employeesRepository() {
  return {
    async findByEmployeeId(employeeId: string): Promise<EmployeeRecord | null> {
      return prisma.employee.findUnique({ where: { employeeId } }) as Promise<EmployeeRecord | null>;
    },

    async validate(employeeId: string, lastName: string, hireDate: string): Promise<EmployeeRecord | null> {
      const emp = await prisma.employee.findUnique({ where: { employeeId } });
      if (!emp) return null;
      if (emp.lastName.toLowerCase() !== lastName.trim().toLowerCase()) return null;
      // Compare date only (ignore time)
      const empDate = emp.hireDate.toISOString().slice(0, 10);
      if (empDate !== hireDate) return null;
      return emp as EmployeeRecord;
    },

    async bulkUpsert(records: Array<{ employeeId: string; lastName: string; firstName: string; fullName: string; hireDate: string }>) {
      const incomingIds = records.map((r) => r.employeeId);

      // Remove anyone no longer on the roster
      const { count: removed } = await prisma.employee.deleteMany({
        where: { employeeId: { notIn: incomingIds } }
      });

      // Upsert all incoming records in batches of 100
      const BATCH = 100;
      for (let i = 0; i < records.length; i += BATCH) {
        await Promise.all(
          records.slice(i, i + BATCH).map((r) =>
            prisma.employee.upsert({
              where: { employeeId: r.employeeId },
              update: { lastName: r.lastName, firstName: r.firstName, fullName: r.fullName, hireDate: new Date(r.hireDate) },
              create: { id: newId(), employeeId: r.employeeId, lastName: r.lastName, firstName: r.firstName, fullName: r.fullName, hireDate: new Date(r.hireDate) }
            })
          )
        );
      }

      return { upserted: records.length, removed };
    },

    async count(): Promise<number> {
      return prisma.employee.count();
    }
  };
}

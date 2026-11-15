import { catalogSummary, CatalogSummary } from "../core/catalog";
import { UsersEntity } from "../users/entities/users.entity";
import { EmployeeEntity } from "./entities/employee.entity";

export type AccountSummary = {
  id: string; name: string; email: string; phone: string | null; birthDate: string | null; nif: string | null;
  profilePictureUrl: string | null; isActive: boolean; description: string | null; notes: string | null; createdAt: Date; updatedAt: Date;
};

/** Explicit account projection: never includes the password hash. */
export function serializeAccount(user: UsersEntity): AccountSummary {
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone ?? null, birthDate: user.birthDate ?? null,
    nif: user.nif ?? null, profilePictureUrl: user.profilePictureUrl ?? null, isActive: user.isActive,
    description: user.description ?? null, notes: user.notes ?? null, createdAt: user.createdAt, updatedAt: user.updatedAt,
  };
}

export type EmployeeView = {
  id: string; userId: string; employeeNumber: string | null; licenseNumber: string | null; hireDate: string | null;
  terminationDate: string | null; isAvailableForBookings: boolean; description: string | null; notes: string | null;
  createdAt: Date; updatedAt: Date; jobTitles: CatalogSummary[]; user?: AccountSummary;
};

/** Employee projection with job titles; the account is included when its relation was loaded. */
export function serializeEmployee(employee: EmployeeEntity): EmployeeView {
  const view: EmployeeView = {
    id: employee.id, userId: employee.userId, employeeNumber: employee.employeeNumber, licenseNumber: employee.licenseNumber,
    hireDate: employee.hireDate, terminationDate: employee.terminationDate, isAvailableForBookings: employee.isAvailableForBookings,
    description: employee.description, notes: employee.notes, createdAt: employee.createdAt, updatedAt: employee.updatedAt,
    jobTitles: (employee.jobTitleLinks ?? []).filter(link => link.jobTitle).map(link => catalogSummary(link.jobTitle))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  if (employee.user) view.user = serializeAccount(employee.user);
  return view;
}

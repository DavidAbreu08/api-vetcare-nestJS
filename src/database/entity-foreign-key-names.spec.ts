import { join } from "path";
import { DataSource, EntityMetadata } from "typeorm";
import { AnimalEntity } from "../app/animal/entities/animal.entity";
import { AnimalMeasurementEntity } from "../app/animal-measurements/entities/animal-measurement.entity";
import { ClinicalVisitEntity } from "../app/clinical-visits/entities/clinical-visit.entity";
import { EmployeeJobTitleEntity } from "../app/employees/entities/employee-job-title.entity";
import { EmployeeEntity } from "../app/employees/entities/employee.entity";
import { ReservationHistoryEntity } from "../app/reservation-history/entities/reservation-history.entity";
import { UserRoleEntity } from "../app/roles/entities/user-role.entity";

/**
 * Real TypeORM metadata (no database connection). Every foreign key declared by an entity carries the name of its
 * migration: without foreignKeyConstraintName TypeORM generates FK_<hash>, and schema:log / migration:generate would
 * propose dropping and re-adding the constraint. Relations with createForeignKeyConstraints: false have no foreign key.
 */
describe("Entity foreign key names match the migrations", () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = new DataSource({ type: "mssql", entities: [join(__dirname, "../**/*.entity{.ts,.js}")] });
    await (ds as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  }, 30_000);

  /** Names of the foreign keys that use `column` as a join column (every key of this project is single-column). */
  const namesOn = (metadata: EntityMetadata, column: string) =>
    metadata.foreignKeys.filter(fk => fk.columnNames.includes(column)).map(fk => fk.name);

  it("gives every foreign key of every entity a fk_vc_ name", () => {
    const generated = ds.entityMetadatas.flatMap(metadata =>
      metadata.foreignKeys
        .filter(fk => !fk.name.startsWith("fk_vc_"))
        .map(fk => `${metadata.tableName}(${fk.columnNames.join(", ")}): ${fk.name}`));
    expect(generated).toEqual([]);
    expect(ds.entityMetadatas.flatMap(metadata => metadata.foreignKeys)).not.toHaveLength(0);
  });

  it("names the eight foreign keys of migrations 1795003200000 and 1795089600000 as the database does", () => {
    const declared = [
      { entity: UserRoleEntity, column: "user_id", name: "fk_vc_user_roles_user" },
      { entity: UserRoleEntity, column: "role_id", name: "fk_vc_user_roles_role" },
      { entity: UserRoleEntity, column: "assigned_by", name: "fk_vc_user_roles_assigned_by" },
      { entity: EmployeeEntity, column: "user_id", name: "fk_vc_employees_user" },
      { entity: EmployeeJobTitleEntity, column: "employee_id", name: "fk_vc_employee_job_titles_employee" },
      { entity: EmployeeJobTitleEntity, column: "job_title_id", name: "fk_vc_employee_job_titles_job_title" },
      { entity: ReservationHistoryEntity, column: "reservation_id", name: "fk_vc_reservation_history_reservation" },
      { entity: ReservationHistoryEntity, column: "changed_by", name: "fk_vc_reservation_history_changed_by" },
    ];
    const actual = declared.map(({ entity, column }) => `${entity.name}.${column} -> ${namesOn(ds.getMetadata(entity), column).join(", ")}`);
    expect(actual).toEqual(declared.map(({ entity, column, name }) => `${entity.name}.${column} -> ${name}`));
  });

  it("creates no foreign key for relations declared with createForeignKeyConstraints: false", () => {
    const unmanaged = [
      { entity: AnimalEntity, property: "breed", column: "breed_id" },
      { entity: ClinicalVisitEntity, property: "reservation", column: "reservation_id" },
      { entity: AnimalMeasurementEntity, property: "clinicalVisit", column: "clinical_visit_id" },
    ];
    for (const { entity, property, column } of unmanaged) {
      const metadata = ds.getMetadata(entity);
      expect(metadata.findRelationWithPropertyPath(property)).toMatchObject({ createForeignKeyConstraints: false });
      expect(namesOn(metadata, column)).toEqual([]);
    }
  });
});

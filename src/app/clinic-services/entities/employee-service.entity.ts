import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { EmployeeEntity } from "../../employees/entities/employee.entity";
import { ClinicServiceEntity } from "./clinic-service.entity";

/**
 * Qualification of an employee profile for a clinic service (vc_employee_services, composite key). Written only by
 * PUT /employees/:id/services with the employee profile locked; read by reservation flows after they lock the same
 * profile. Each relation has its own single join column.
 */
@Entity("vc_employee_services")
@Index("ix_vc_employee_services_service_id", ["serviceId"])
export class EmployeeServiceEntity {
  @PrimaryColumn({ name: "employee_id", type: "uniqueidentifier", primaryKeyConstraintName: "pk_vc_employee_services" }) employeeId: string;
  @PrimaryColumn({ name: "service_id", type: "uniqueidentifier", primaryKeyConstraintName: "pk_vc_employee_services" }) serviceId: string;
  @ManyToOne(() => EmployeeEntity, { nullable: false })
  @JoinColumn({ name: "employee_id", foreignKeyConstraintName: "fk_vc_employee_services_employee" }) employee: EmployeeEntity;
  @ManyToOne(() => ClinicServiceEntity, { nullable: false })
  @JoinColumn({ name: "service_id", foreignKeyConstraintName: "fk_vc_employee_services_service" }) service: ClinicServiceEntity;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
}

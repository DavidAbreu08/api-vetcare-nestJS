import { Actor } from "../core/authorization";
import { SystemSettingCode } from "../system-settings/enums/system-setting-code.enum";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { EmployeeJobTitleEntity } from "./entities/employee-job-title.entity";
import { EmployeeQualificationService } from "./employee-qualification.service";

const VET_TITLE = "30000000-0000-4000-8000-000000000001";
const RECEPTION_TITLE = "30000000-0000-4000-8000-000000000002";
const actor = (flags: Partial<Actor>): Actor => ({ id: "X", roleIds: [], isAdmin: false, isEmployee: false, isClient: false, employeeId: null, ...flags });
const assignments: Record<string, string[]> = { "E-VET": [VET_TITLE], "E-REC": [RECEPTION_TITLE] };
let inactiveTitles: string[] = [];

describe("EmployeeQualificationService (VETERINARIAN_JOB_TITLE_ID)", () => {
  let manager: any;
  /** Service reading the given setting value (undefined = setting row absent). */
  const withSetting = (value: string | null | undefined) => new EmployeeQualificationService({ manager } as any, new SystemSettingsService({
    loadAll: async () => (value === undefined ? [] : [{ code: SystemSettingCode.VETERINARIAN_JOB_TITLE_ID, value }]),
  } as any));

  beforeEach(() => {
    manager = {
      count: jest.fn(async (_entity: unknown, { where }: any) => Number((assignments[where.employeeId] ?? []).includes(where.jobTitleId)
        && !(where.jobTitle?.isActive === true && inactiveTitles.includes(where.jobTitleId)))),
    };
    inactiveTitles = [];
  });

  it("identifies veterinarians through the job title referenced by the setting (case-insensitive id)", async () => {
    const service = withSetting(VET_TITLE.toUpperCase());
    await expect(service.isVeterinarian(actor({ isEmployee: true, employeeId: "E-VET" }))).resolves.toBe(true);
    await expect(service.isVeterinarian(actor({ isEmployee: true, employeeId: "E-REC" }))).resolves.toBe(false);
    expect(manager.count).toHaveBeenCalledWith(EmployeeJobTitleEntity, { where: { employeeId: "E-VET", jobTitleId: VET_TITLE, jobTitle: { isActive: true } } });
  });

  it("fails closed when the referenced job title is inactive (stale cache or bypassed rules)", async () => {
    inactiveTitles = [VET_TITLE];
    await expect(withSetting(VET_TITLE).isVeterinarian(actor({ isEmployee: true, employeeId: "E-VET" }))).resolves.toBe(false);
  });

  it("follows the setting when it points to another job title", async () => {
    const service = withSetting(RECEPTION_TITLE);
    await expect(service.isVeterinarian(actor({ isEmployee: true, employeeId: "E-REC" }))).resolves.toBe(true);
    await expect(service.isVeterinarian(actor({ isEmployee: true, employeeId: "E-VET" }))).resolves.toBe(false);
  });

  it("treats a missing, empty or malformed setting as no veterinarian configured", async () => {
    for (const value of [undefined, null, "", "not-a-uuid"]) {
      await expect(withSetting(value).isVeterinarian(actor({ isEmployee: true, employeeId: "E-VET" }))).resolves.toBe(false);
    }
    expect(manager.count).not.toHaveBeenCalled();
  });

  it("never qualifies non-employees or employees without an active profile (administrators included)", async () => {
    const service = withSetting(VET_TITLE);
    await expect(service.isVeterinarian(actor({ isAdmin: true }))).resolves.toBe(false);
    await expect(service.isVeterinarian(actor({ isEmployee: false, employeeId: "E-VET" }))).resolves.toBe(false);
    expect(manager.count).not.toHaveBeenCalled();
  });
});

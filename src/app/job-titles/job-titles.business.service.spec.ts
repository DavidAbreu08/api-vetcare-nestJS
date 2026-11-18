import { ConflictException } from "@nestjs/common";
import { PersistenceService } from "../core/persistence/persistence.service";
import { EmployeeJobTitleEntity } from "../employees/entities/employee-job-title.entity";
import { SystemSettingEntity } from "../system-settings/entities/system-setting.entity";
import { SystemSettingCode } from "../system-settings/enums/system-setting-code.enum";
import { JobTitleEntity } from "./entities/job-title.entity";
import { JobTitlesBusinessService } from "./job-titles.business.service";

const VET_TITLE = "30000000-0000-4000-8000-000000000001";

describe("Job titles referenced by system settings", () => {
  let manager: any, settingRows: any[], assigned: number, business: JobTitlesBusinessService, row: any;

  beforeEach(() => {
    row = { id: VET_TITLE.toUpperCase(), code: "VETERINARIAN", name: "Veterinário", isActive: true };
    // Rows of vc_system_settings as read inside the transaction (the cache is never consulted).
    settingRows = [
      { code: SystemSettingCode.VETERINARIAN_JOB_TITLE_ID, value: ` ${VET_TITLE} ` },
      { code: SystemSettingCode.ADMIN_ROLE_ID, value: VET_TITLE },
    ];
    assigned = 0;
    manager = {
      findOne: jest.fn(async () => ({ ...row })),
      find: jest.fn(async (entity: unknown) => (entity === SystemSettingEntity ? settingRows : [])),
      count: jest.fn(async () => assigned),
      save: jest.fn(async (value: unknown) => value),
      remove: jest.fn(),
    };
    const dataSource = { transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) };
    business = new JobTitlesBusinessService({} as any, new PersistenceService(), dataSource as any);
  });

  it("refuses (409) to deactivate or delete the job title of VETERINARIAN_JOB_TITLE_ID, locking the row first", async () => {
    await expect(business.update(VET_TITLE, { isActive: false } as any)).rejects.toBeInstanceOf(ConflictException);
    await expect(business.delete(VET_TITLE)).rejects.toBeInstanceOf(ConflictException);
    expect(manager.findOne).toHaveBeenCalledWith(JobTitleEntity, { where: { id: VET_TITLE }, lock: { mode: "pessimistic_write" } });
    expect(manager.findOne.mock.invocationCallOrder[0]).toBeLessThan(manager.find.mock.invocationCallOrder[0]);
    expect(manager.find).toHaveBeenCalledWith(SystemSettingEntity, expect.anything());
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.remove).not.toHaveBeenCalled();
  });

  it("allows renaming it, and deactivating or deleting job titles no setting references", async () => {
    await expect(business.update(VET_TITLE, { name: "Médico veterinário" } as any)).resolves.toMatchObject({ name: "Médico veterinário", isActive: true });
    // Only *_JOB_TITLE_ID settings count: an unrelated setting with the same value does not block.
    settingRows = settingRows.filter(setting => setting.code !== SystemSettingCode.VETERINARIAN_JOB_TITLE_ID);
    await expect(business.update(VET_TITLE, { isActive: false } as any)).resolves.toMatchObject({ isActive: false });
    await business.delete(VET_TITLE);
    expect(manager.remove).toHaveBeenCalled();
  });

  it("treats an unset VETERINARIAN_JOB_TITLE_ID as no reference, and keeps assigned job titles (409)", async () => {
    settingRows = [{ code: SystemSettingCode.VETERINARIAN_JOB_TITLE_ID, value: null }];
    assigned = 2;
    await expect(business.delete(VET_TITLE)).rejects.toBeInstanceOf(ConflictException);
    expect(manager.count).toHaveBeenCalledWith(EmployeeJobTitleEntity, { where: { jobTitleId: row.id } });
    expect(manager.remove).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing job title", async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(business.delete(VET_TITLE)).rejects.toMatchObject({ status: 404 });
  });
});

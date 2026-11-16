import { SystemSettingCode } from "../../system-settings/enums/system-setting-code.enum";

/**
 * System roles referenced by authorization rules. Each value is the system-setting key whose
 * value holds the role id; role ids and role codes are never referenced by code.
 */
export const SystemRole = {
  ADMIN: SystemSettingCode.ADMIN_ROLE_ID,
  EMPLOYEE: SystemSettingCode.EMPLOYEE_ROLE_ID,
  CLIENT: SystemSettingCode.CLIENT_ROLE_ID,
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];

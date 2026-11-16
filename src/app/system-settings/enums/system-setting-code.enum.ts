/** Keys of vc_system_settings known to the application. Values are data; only keys live in code. */
export enum SystemSettingCode {
  ADMIN_ROLE_ID = "ADMIN_ROLE_ID",
  EMPLOYEE_ROLE_ID = "EMPLOYEE_ROLE_ID",
  CLIENT_ROLE_ID = "CLIENT_ROLE_ID",
}

/** Settings whose value must reference an existing, active role. */
export const ROLE_ID_SETTING_SUFFIX = "_ROLE_ID";

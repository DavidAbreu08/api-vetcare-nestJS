/** Keys of vc_system_settings known to the application. Values are data; only keys live in code. */
export enum SystemSettingCode {
  ADMIN_ROLE_ID = "ADMIN_ROLE_ID",
  EMPLOYEE_ROLE_ID = "EMPLOYEE_ROLE_ID",
  CLIENT_ROLE_ID = "CLIENT_ROLE_ID",
  RESERVATION_NO_SHOW_TOLERANCE_MINUTES = "RESERVATION_NO_SHOW_TOLERANCE_MINUTES",
  RESERVATION_BUFFER_MINUTES = "RESERVATION_BUFFER_MINUTES",
  /** vc_job_titles.id of the veterinarian job title (approves animal data); NULL = no veterinarian configured. */
  VETERINARIAN_JOB_TITLE_ID = "VETERINARIAN_JOB_TITLE_ID",
}

/** Settings whose value must reference an existing, active role. */
export const ROLE_ID_SETTING_SUFFIX = "_ROLE_ID";

/** Settings whose value must reference an existing, active job title. */
export const JOB_TITLE_ID_SETTING_SUFFIX = "_JOB_TITLE_ID";

/** Settings whose value must be a non-negative integer (minutes), within the SQL int range. */
export const NON_NEGATIVE_INTEGER_SETTINGS: readonly string[] = [
  SystemSettingCode.RESERVATION_NO_SHOW_TOLERANCE_MINUTES,
  SystemSettingCode.RESERVATION_BUFFER_MINUTES,
];

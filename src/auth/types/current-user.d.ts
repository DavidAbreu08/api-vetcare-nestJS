import { Role } from "src/app/core/enums/role.enum";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  nif?:number;
  dateBirth?: string;
  role: Role;
};

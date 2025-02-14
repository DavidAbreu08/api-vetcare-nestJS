import { Controller, Delete, Get, Post, Put } from "@nestjs/common";
import { UsersService } from "./users.service";

@Controller("api/v1/users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Get()
  index() {
    return null;
  }

  @Post()
  store() {
    return null;
  }

  @Get(":id")
  show() {
    return null;
  }

  @Put(":id")
  update() {
    return null;
  }

  @Delete(":id")
  destroy() {
    return null;
  }
}

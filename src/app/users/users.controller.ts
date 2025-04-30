import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../core/decorators/roles.decorator";
import { Role } from "../core/enums/role.enum";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { CreateEmployeesDto } from "./dto/create-employees.dto";

@Controller("api/users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Get()
  @UseGuards(AuthGuard('jwt'))
  async index() {
    return await this.usersService.findAll();
  }

  @Get('available/:date')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async getAvailableEmployees(@Param('date') date: Date) {
    return this.usersService.getAvailableEmployeesByDate(date);
  }

  @Get('clients')
  @UseGuards(AuthGuard('jwt'))
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  async getAllClients() {
    return this.usersService.findAllClients();
  }

  @Get('check-email')
  async checkEmail(@Query('email') email: string): Promise<boolean> {
    return this.usersService.checkEmailExists(email);
  }

  @Post()
  async store(@Body() body: CreateUserDto) {
    return await this.usersService.store(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('employees')
  async storeEmployees(@Body() body: CreateEmployeesDto){
    return await this.usersService.storeEmployees(body)
  }


  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async show(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.usersService.findOneOrFail({ id });
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateUserDto,
  ) {
    return await this.usersService.update(id, body);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @Delete(':id')
  async destroy(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.usersService.destroy(id);
  }

}

import { UsersMessages } from "./users.messages";
import { PersistenceService } from "../core/persistence/persistence.service";
import {
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { FindOptionsWhere, Repository } from "typeorm";
import { UsersEntity } from "./entities/users.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { HttpResponse } from "../core/interface/http-response.interface";
import { Role } from "../core/enums/role.enum";
import { CreateEmployeesDto } from "./dto/create-employees.dto";
import { generateRandomPassword } from "../core/generated/genarate-random.password";
import * as bcrypt from "bcrypt";
import { EmailService } from "src/email/email.service";
import { generateResetToken } from "../core/generated/generate-reset-token";
import { ResetTokenEntityRepository } from "src/auth/repository/reset-token.repository";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateFuncionarioDto } from "./dto/update-funcionario.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";

@Injectable()
export class UsersBusinessService {
  constructor(
    private readonly persistence: PersistenceService,
    @InjectRepository(UsersEntity)
    private readonly usersRepository: Repository<UsersEntity>,
    private readonly emailService: EmailService,
    private readonly resetTokenRepo: ResetTokenEntityRepository
  ) {}

  async getAll(query: ListUsersQueryDto = new ListUsersQueryDto()) {
    return await this.usersRepository.find({
      where: { role: query.role, email: query.email },
      select: ["id", "name", "email", "role", "isActive"],
      skip: query.skip,
      take: query.take,
      order: { id: "ASC" },
    });
  }

  async findAllClients(): Promise<UsersEntity[]> {
    return this.usersRepository.find({
      where: { role: Role.CLIENTE },
      select: [
        "id",
        "name",
        "email",
        "createdAt",
        "phone",
        "nif",
        "dateBirth",
      ],
    });
  }

  async findEmployees() {
    return await this.usersRepository.find({
      select: [
        "id",
        "name",
        "email",
        "createdAt",
        "phone",
        "function",
        "isActive",
        "nif",
      ],
      where: { role: Role.FUNCIONARIO },
    });
  }

  async getAvailableEmployeesByDate(date: Date): Promise<UsersEntity[]> {
    //TODO: Add logic to check availability by checking reservations or shifts
    return this.usersRepository.find({
      where: { role: Role.FUNCIONARIO },
    }); // For now, return all as available
  }

  async checkEmailExists(email: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { email } });
    return !!user;
  }

  async findForAuthentication(where: FindOptionsWhere<UsersEntity>) {
    return this.usersRepository.findOne({
      where,
      select: ["id", "name", "email", "password", "role", "isActive"],
    });
  }

  async findOneOrFail(
    where: FindOptionsWhere<UsersEntity> | FindOptionsWhere<UsersEntity>[]
  ) {
    const user = await this.usersRepository.findOne({ where });
    if (!user) {
      throw new NotFoundException(UsersMessages.USER_NOT_FOUND);
    }
    return user;
  }

  async create(data: CreateUserDto) {
    const user = this.usersRepository.create({ name: data.name, description: data.description, notes: data.notes, email: data.email, password: data.password, role: Role.CLIENTE });
    const saved = await this.persistence.execute(() => this.usersRepository.save(user));
    const { password, ...profile } = saved;
    return profile;
  }

  async createClient(data: CreateClientDto) {
    const existingUser = await this.usersRepository.findOne({
      where: [{ email: data.email }, { nif: data.nif }],
    });

    if (existingUser) {
      throw new UnauthorizedException(UsersMessages.EMAIL_OR_NIF_ALREADY_EXISTS);
    }

    const randomPassword = generateRandomPassword();

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(randomPassword, salt);

    const newClient = this.usersRepository.create({
      ...data,
      password: hashedPassword,
      role: Role.CLIENTE,
    });

    await this.persistence.execute(() => this.usersRepository.save(newClient));

    // Generate the reset token and expiration date
    const { token, expiresAt } = generateResetToken();

    // Save the token in the database
    const resetToken = this.resetTokenRepo.create({
      resetToken: token,
      user: newClient,
      expiresAt,
    });
    await this.persistence.execute(() => this.resetTokenRepo.save(resetToken));

    await this.emailService.sendClientWelcomeEmail(data.email, token);

    return {
      message:
        UsersMessages.CLIENT_CREATED,
      statusCode: HttpStatus.CREATED,
    };
  }

  async createEmployee(data: CreateEmployeesDto) {
    const existingUser = await this.usersRepository.findOne({
      where: [{ email: data.email }, { nif: data.nif }],
    });

    if (existingUser) {
      throw new UnauthorizedException(UsersMessages.EMAIL_OR_NIF_ALREADY_EXISTS);
    }

    const randomPassword = generateRandomPassword();

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(randomPassword, salt);


    const newEmployee = this.usersRepository.create({
      ...data,
      password: hashedPassword,
      role: Role.FUNCIONARIO,
    });

    await this.persistence.execute(() => this.usersRepository.save(newEmployee));

    // Generate the reset token and expiration date
    const { token, expiresAt } = generateResetToken();

    // Save the token in the database
    const resetToken = this.resetTokenRepo.create({
      resetToken: token,
      user: newEmployee,
      expiresAt,
    });
    await this.persistence.execute(() => this.resetTokenRepo.save(resetToken));

    await this.emailService.sendEmployeeWelcomeEmail(data.email, token);

    return {
      message:
        UsersMessages.EMPLOYEE_CREATED,
      statusCode: HttpStatus.CREATED,
    };
  }

  async update(id: string, data: UpdateUserDto): Promise<HttpResponse> {
    const user = await this.findOneOrFail({ id });
    this.usersRepository.merge(user, data);
    await this.persistence.execute(() => this.usersRepository.save(user));
    return {
      statusCode: HttpStatus.OK,
      message: UsersMessages.OK,
    };
  }

  async updateEmployee(id: string, data: UpdateFuncionarioDto): Promise<HttpResponse> {
    const user = await this.findOneOrFail({ id });

    if (data.email && data.email !== user.email) {
      const emailExists = await this.usersRepository.findOne({
        where: { email: data.email },
      });
      if (emailExists && emailExists.id !== id) {
        throw new UnauthorizedException(UsersMessages.EMAIL_ALREADY_IN_USE);
      }
    }

    if (data.nif && data.nif !== user.nif) {
      const nifExists = await this.usersRepository.findOne({
        where: { nif: data.nif },
      });
      if (nifExists && nifExists.id !== id) {
        throw new UnauthorizedException(UsersMessages.NIF_ALREADY_IN_USE);
      }
    }

    // Atualiza apenas os campos enviados
    this.usersRepository.merge(user, data);
    await this.persistence.execute(() => this.usersRepository.save(user));



    return {
      statusCode: HttpStatus.OK,
      message: UsersMessages.EMPLOYEE_UPDATED,
      // user: user, // Descomente se quiser retornar o usuário atualizado
    };
  }

  async delete(id: string) {
    await this.findOneOrFail({ id });
    // Se softDelete não estiver a funcionar, certificar se a entidade UsersEntity tem a coluna @DeleteDateColumn(). Caso contrário, usar remove em vez de softDelete.
    await this.persistence.execute(() => this.usersRepository.softDelete({ id }));
  }

  async save(user: UsersEntity) {
    return await this.persistence.execute(() => this.usersRepository.save(user));
  }
}

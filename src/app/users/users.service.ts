import { HttpStatus, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { FindOptionsWhere, Repository } from "typeorm";
import { UsersEntity } from "./entities/users.entity";
import { InjectRepository } from '@nestjs/typeorm';
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { HttpResponse } from "../core/interface/http-response.interface";
import { Role } from "../core/enums/role.enum";
import { CreateEmployeesDto } from "./dto/create-employees.dto";
import { generateRandomPassword } from "../core/generated/genarate-random.password";
import * as bcrypt from 'bcrypt';
import { EmailService } from "src/email/email.service";
import { generateResetToken } from "../core/generated/generate-reset-token";
import { ResetTokenEntityRepository } from "src/auth/repository/reset-token.repository";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UsersEntity)
    private readonly usersRepository: Repository<UsersEntity>,
    private readonly emailService: EmailService,
    private readonly resetTokenRepo: ResetTokenEntityRepository
  ) {}

  async findAll() {
    return await this.usersRepository.find({
      select: ["name", "email"],
    });
  }

  async findEmployees() {
    return await this.usersRepository.find({
      select: ["name" , "email","createdAt", "phone", "function", "isActive", "nif"],
      where: { role: Role.FUNCIONARIO }, 
    });
  }

  async checkEmailExists(email: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { email } });
    return !!user;
  }

  async findOneOrFail(
    where: FindOptionsWhere<UsersEntity> | FindOptionsWhere<UsersEntity>[],
  ) {
    const user = await this.usersRepository.findOne({ where });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }

  async store(data: CreateUserDto) {
    const user = this.usersRepository.create(data);
    return await this.usersRepository.save(user);
  }

  async storeEmployees(data: CreateEmployeesDto){
    const existingUser = await this.usersRepository.findOne({
      where: [{ email: data.email }, { nif: data.nif }],
    });

    if (existingUser) {
      throw new UnauthorizedException('Email or NIF already exists');
    }

    const randomPassword = generateRandomPassword();

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(randomPassword, salt);

    console.log(data);
    const newEmployee = this.usersRepository.create({
      ...data,
      password: hashedPassword,
      role: Role.FUNCIONARIO,
    });

    await this.usersRepository.save(newEmployee);

    // Generate the reset token and expiration date
    const { token, expiresAt } = generateResetToken();

    // Save the token in the database
    const resetToken = this.resetTokenRepo.create({
        resetToken: token,
        user: newEmployee,
        expiresAt,
    });
    await this.resetTokenRepo.save(resetToken);

    await this.emailService.sendEmployeeWelcomeEmail(data.email, token);

    return { message: 'Employee account created successfully. Temporary password sent via email.' };
  }


  async update(id: string, data: UpdateUserDto): Promise<HttpResponse> {
    const user = await this.findOneOrFail({ id });
    this.usersRepository.merge(user, data);
    return {
      statusCode: HttpStatus.ACCEPTED,
      message: "Updated!",
      user: await this.usersRepository.save(user),
    }
  }
  async destroy(id: string) {
    await this.findOneOrFail({ id });
    // Se softDelete não estiver a funcionar, certificar se a entidade UsersEntity tem a coluna @DeleteDateColumn(). Caso contrário, usar remove em vez de softDelete.
    this.usersRepository.softDelete({ id });
  }

  async save(user: UsersEntity) {
    return await this.usersRepository.save(user);
  }
}

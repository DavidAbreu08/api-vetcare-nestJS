import { HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { FindOptionsWhere, Repository } from "typeorm";
import { UsersEntity } from "./users.entity";
import { InjectRepository } from '@nestjs/typeorm';
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { HttpResponse } from "../core/interface/http-response.interface";
import { Role } from "../core/enums/role.enum";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UsersEntity)
    private readonly usersRepository: Repository<UsersEntity>,
  ) {}

  async findAll() {
    return await this.usersRepository.find({
      select: ["firstName", "lastName", "email"],
    });
  }

  async findEmployees() {
    return await this.usersRepository.find({
      select: ["firstName", "lastName", "email","createdAt", "phone", "function", "isActive", "nif"],
      where: { role: Role.FUNCIONARIO }, 
    });
  }

  async checkEmailExists(email: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { email } });
    return !!user; // Returns true if user exists, false otherwise
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
}

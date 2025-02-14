import { Injectable, NotFoundException } from "@nestjs/common";
import { FindOptionsWhere, Repository } from "typeorm";
import { UsersEntity } from "./users.entity";
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UsersEntity)
    private readonly usersRepository: Repository<UsersEntity>,
  ) {}

  async findAll() {
    return await this.usersRepository.find({
      select: ["id", "firstName", "lastName", "email"],
    });
  }
  async findOneOrFail(
    where: FindOptionsWhere<UsersEntity> | FindOptionsWhere<UsersEntity>[],
  ) {
    try {
      return await this.usersRepository.findOne({ where });
    } catch (error) {
      throw new NotFoundException(error);
    }
  }
  async update(id: string, user) {}
  async destroy(id: string) {}
}

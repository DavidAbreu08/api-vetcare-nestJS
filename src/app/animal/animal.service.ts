import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Actor, requireAnimalAccess } from "../core/authorization";
import { CreateAnimalDto } from "./dto/create-animal.dto";
import { Role } from "../core/enums/role.enum";
import { UsersEntity } from "../users/entities/users.entity";
import { Repository } from "typeorm";
import { AnimalEntity } from "./entities/animal.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { UpdateAnimalDto } from "./dto/update-animal.dto";

@Injectable()
export class AnimalService {
  constructor(
    @InjectRepository(AnimalEntity)
    private readonly animalRepository: Repository<AnimalEntity>,
    @InjectRepository(UsersEntity)
    private readonly userRepository: Repository<UsersEntity>
  ) {}

  async create(dto: CreateAnimalDto, actor: Actor) {
    requireAnimalAccess(actor, dto.ownerId);
    const owner = await this.userRepository.findOne({
      where: { id: dto.ownerId },
    });

    if (!owner || owner.role !== Role.CLIENTE) {
      throw new BadRequestException("Owner must be a client");
    }

    const confirmed =
      actor.role === Role.ADMIN || actor.role === Role.FUNCIONARIO;

    const animal = this.animalRepository.create({
      ...dto,
      owner,
      confirmed,
    });

    return this.animalRepository.save(animal);
  }

  async update(id: string, dto: UpdateAnimalDto, actor: Actor) {
    const animal = await this.animalRepository.findOne({ where: { id }, relations: ["owner"] });
    if (!animal) throw new NotFoundException("Animal not found");

    requireAnimalAccess(actor, animal.owner.id);
    const { ownerId, ...fields } = dto;
    if (ownerId && ownerId !== animal.owner.id) {
      requireAnimalAccess(actor, ownerId);
      const owner = await this.userRepository.findOne({ where: { id: ownerId } });
      if (!owner || owner.role !== Role.CLIENTE) throw new BadRequestException("Owner must be a client");
      animal.owner = owner;
    }
    Object.assign(animal, fields);
    return this.animalRepository.save(animal);
  }

  async confirm(id: string) {
    const animal = await this.animalRepository.findOne({ where: { id } });
    if (!animal) throw new NotFoundException("Animal not found");

    animal.confirmed = true;
    return this.animalRepository.save(animal);
  }

  async findAll() {
    return this.animalRepository.find({ relations: ["owner"] });
  }

  async findByOwner(ownerId: string, actor: Actor) {
    requireAnimalAccess(actor, ownerId);
    const owner = await this.userRepository.findOne({ where: { id: ownerId } });

    if (!owner || owner.role !== Role.CLIENTE) {
      throw new BadRequestException("Owner must be a client");
    }

    return this.animalRepository.find({
      where: { owner: { id: ownerId } },
      relations: ["owner"],
    });
  }

  async delete(id: string) {
    const animal = await this.animalRepository.findOne({ where: { id } });
    if (!animal) {
      throw new NotFoundException("Animal not found");
    }

    await this.animalRepository.remove(animal);
    return {
      statusCode: HttpStatus.OK,
      message: `Animal ${animal.name} deleted successfully`,
    };
  }
}

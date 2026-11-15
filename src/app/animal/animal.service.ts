import { BadRequestException, ForbiddenException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { Actor, requireAnimalAccess } from "../core/authorization";
import { CreateAnimalDto } from "./dto/create-animal.dto";
import { Role } from "../core/enums/role.enum";
import { UsersEntity } from "../users/entities/users.entity";
import { Repository } from "typeorm";
import { AnimalEntity } from "./entities/animal.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { UpdateAnimalDto } from "./dto/update-animal.dto";
import { TaxonomyService } from "./taxonomy.service";

@Injectable()
export class AnimalService {
  private readonly relations = ["owner", "species", "breed"];
  constructor(
    @InjectRepository(AnimalEntity) private readonly animalRepository: Repository<AnimalEntity>,
    @InjectRepository(UsersEntity) private readonly userRepository: Repository<UsersEntity>,
    private readonly taxonomy: TaxonomyService,
  ) {}

  private async owner(id: string) {
    const owner = await this.userRepository.findOne({ where: { id } });
    if (!owner || owner.role !== Role.CLIENTE) throw new BadRequestException("Owner must be a client");
    return owner;
  }
  private fields(dto: UpdateAnimalDto) {
    const fields: Partial<AnimalEntity> = {};
    for (const key of ["name", "color", "weight", "height", "sex", "gender", "speciesId", "ownerId", "type", "age"] as const) {
      if (dto[key] === null) throw new BadRequestException(`${key} cannot be null`);
    }
    for (const key of ["name", "color", "weight", "height", "description", "birthDate", "microchipNumber", "isNeutered"] as const) {
      if (dto[key] !== undefined) (fields as any)[key] = dto[key];
    }
    if (dto.birthDate && dto.birthDate > new Date().toISOString().slice(0, 10)) throw new BadRequestException("Birth date cannot be in the future");
    if (dto.sex !== undefined && dto.gender !== undefined && dto.sex !== dto.gender) throw new BadRequestException("sex conflicts with gender");
    if (dto.imageUrl !== undefined && dto.image !== undefined && dto.imageUrl !== dto.image) throw new BadRequestException("imageUrl conflicts with image");
    if (dto.sex !== undefined || dto.gender !== undefined) fields.sex = dto.sex ?? dto.gender;
    if (dto.imageUrl !== undefined || dto.image !== undefined) fields.imageUrl = dto.imageUrl !== undefined ? dto.imageUrl : dto.image;
    if (dto.type !== undefined) fields.legacyType = dto.type;
    if (dto.breed !== undefined) fields.legacyBreed = dto.breed;
    if (dto.age !== undefined) fields.legacyAge = dto.age;
    return fields;
  }
  // Legacy aliases remain readable while consumers adopt the structured catalog.
  private response(animal: AnimalEntity) {
    return { ...animal,
      breedDetails: animal.breed,
      breed: animal.breed?.name ?? animal.legacyBreed,
      type: animal.species?.name ?? animal.legacyType,
      age: animal.birthDate ? this.age(animal.birthDate) : animal.legacyAge,
      gender: animal.sex,
      image: animal.imageUrl,
      confirmed: animal.isVerified,
    };
  }
  private age(birthDate: string) {
    const today = new Date().toISOString().slice(0, 10);
    return Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
  }
  async create(dto: CreateAnimalDto, actor: Actor) {
    requireAnimalAccess(actor, dto.ownerId);
    const owner = await this.owner(dto.ownerId);
    const taxonomy = await this.taxonomy.resolve(dto.speciesId, dto.breedId, dto.type, dto.breed);
    const fields = this.fields(dto);
    const animal = this.animalRepository.create({
      ...fields, ...taxonomy, owner,
      isVerified: actor.role === Role.ADMIN || actor.role === Role.FUNCIONARIO,
    });
    return this.response(await this.animalRepository.save(animal));
  }
  async update(id: string, dto: UpdateAnimalDto, actor: Actor) {
    const animal = await this.animalRepository.findOne({ where: { id }, relations: this.relations });
    if (!animal) throw new NotFoundException("Animal not found");
    if (animal.owner) requireAnimalAccess(actor, animal.owner.id);
    else if (actor.role !== Role.ADMIN && actor.role !== Role.FUNCIONARIO) throw new ForbiddenException("Animal has no owner");
    if (dto.ownerId !== undefined) {
      requireAnimalAccess(actor, dto.ownerId);
      animal.owner = await this.owner(dto.ownerId);
    }
    const fields = this.fields(dto);
    if (dto.speciesId !== undefined || dto.type !== undefined || dto.breedId !== undefined || dto.breed !== undefined) {
      const speciesId = dto.speciesId ?? (dto.type !== undefined ? undefined : animal.speciesId);
      const breedId = dto.breedId !== undefined ? dto.breedId : dto.breed !== undefined ? undefined : animal.breedId;
      Object.assign(animal, await this.taxonomy.resolve(speciesId, breedId, dto.type, dto.breed));
    }
    Object.assign(animal, fields);
    return this.response(await this.animalRepository.save(animal));
  }
  async confirm(id: string) {
    const animal = await this.animalRepository.findOne({ where: { id }, relations: this.relations });
    if (!animal) throw new NotFoundException("Animal not found");
    animal.isVerified = true;
    return this.response(await this.animalRepository.save(animal));
  }
  async findAll() {
    return (await this.animalRepository.find({ relations: this.relations })).map(a => this.response(a));
  }
  async findByOwner(ownerId: string, actor: Actor) {
    requireAnimalAccess(actor, ownerId);
    await this.owner(ownerId);
    return (await this.animalRepository.find({ where: { owner: { id: ownerId } }, relations: this.relations })).map(a => this.response(a));
  }
  async delete(id: string) {
    const animal = await this.animalRepository.findOne({ where: { id } });
    if (!animal) throw new NotFoundException("Animal not found");
    await this.animalRepository.softRemove(animal);
    return { statusCode: HttpStatus.OK, message: `Animal ${animal.name} deleted successfully` };
  }
}

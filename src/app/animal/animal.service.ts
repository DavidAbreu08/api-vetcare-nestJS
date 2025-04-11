import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { Role } from '../core/enums/role.enum';
import { UsersEntity } from '../users/entities/users.entity';
import { Repository } from 'typeorm';
import { AnimalEntity } from './entities/animal.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UpdateAnimalDto } from './dto/update-animal.dto';

@Injectable()
export class AnimalService {

  constructor(
    @InjectRepository(AnimalEntity)
    private readonly animalRepository: Repository<AnimalEntity>,
    @InjectRepository(UsersEntity)
    private readonly userRepository: Repository<UsersEntity>,
  ) {}

  async create(dto: CreateAnimalDto, createdByRole: Role) {
    const owner = await this.userRepository.findOne({ where: { id: dto.ownerId } });
  
    if (!owner || owner.role !== Role.CLIENTE) {
      throw new BadRequestException('Owner must be a client');
    }
  
    const confirmed = createdByRole === Role.ADMIN || createdByRole === Role.FUNCIONARIO;
  
    const animal = this.animalRepository.create({
      ...dto,
      owner,
      confirmed,
    });
  
    return this.animalRepository.save(animal);
  }

  async update(id: string, dto: UpdateAnimalDto) {
    const animal = await this.animalRepository.findOne({ where: { id } });
    if (!animal) throw new NotFoundException('Animal not found');

    Object.assign(animal, dto);
    return this.animalRepository.save(animal);
  }

  async confirm(id: string) {
    const animal = await this.animalRepository.findOne({ where: { id } });
    if (!animal) throw new NotFoundException('Animal not found');

    animal.confirmed = true;
    return this.animalRepository.save(animal);
  }

  async findAll() {
    return this.animalRepository.find({ relations: ['owner'] });
  }
  
  async findByOwner(ownerId: string) {
    const owner = await this.userRepository.findOne({ where: { id: ownerId } });

    if (!owner || owner.role !== Role.CLIENTE) {
      throw new BadRequestException('Owner must be a client');
    }

    return this.animalRepository.find({
      where: { owner: { id: ownerId } },
      relations: ['owner'],
    });
  }

  async delete(id: string) {
    const animal = await this.animalRepository.findOne({ where: { id } });
    if (!animal) {
      throw new NotFoundException('Animal not found');
    }

    await this.animalRepository.remove(animal);
    return { 
      statusCode: HttpStatus.OK,
      message: `Animal ${animal.name} deleted successfully` 
    };
  }
}

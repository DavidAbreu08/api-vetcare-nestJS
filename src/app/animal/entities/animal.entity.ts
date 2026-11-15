import { UsersEntity } from "../../users/entities/users.entity";
import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { SpeciesEntity } from "./species.entity";
import { BreedEntity } from "./breed.entity";

@Entity("vc_animals")
export class AnimalEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @ManyToOne(() => UsersEntity, (user) => user.idAnimal, { nullable: true })
  @JoinColumn({ name: "owner_id" }) owner: UsersEntity | null;
  @Column() name: string;
  @Column({ name: "species_id", type: "uniqueidentifier" }) speciesId: string;
  @ManyToOne(() => SpeciesEntity, { nullable: false })
  @JoinColumn({ name: "species_id" }) species: SpeciesEntity;
  @Column({ name: "breed_id", type: "uniqueidentifier", nullable: true }) breedId: string | null;
  @ManyToOne(() => BreedEntity, { nullable: true })
  @JoinColumn([{ name: "breed_id", referencedColumnName: "id" }, { name: "species_id", referencedColumnName: "speciesId" }])
  breed: BreedEntity | null;
  @Column({ name: "birth_date", type: "date", nullable: true }) birthDate: string | null;
  @Column() color: string;
  @Column({ type: "decimal", precision: 13, scale: 3 }) weight: number;
  @Column({ type: "decimal", precision: 13, scale: 3 }) height: number;
  @Column({ nullable: true, type: "nvarchar", length: 255 }) description: string | null;
  @Column() sex: string;
  @Column({ name: "image_url", type: "nvarchar", length: "MAX", nullable: true }) imageUrl: string | null;
  @Column({ name: "is_verified", default: false }) isVerified: boolean;
  @Column({ name: "microchip_number", type: "nvarchar", length: 255, nullable: true }) microchipNumber: string | null;
  @Column({ name: "is_neutered", type: "bit", nullable: true }) isNeutered: boolean | null;
  @Column({ name: "legacy_type", type: "nvarchar", length: 255, nullable: true }) legacyType: string | null;
  @Column({ name: "legacy_breed", type: "nvarchar", length: 255, nullable: true }) legacyBreed: string | null;
  @Column({ name: "legacy_age", type: "int", nullable: true }) legacyAge: number | null;
  @CreateDateColumn({ name: "created_at" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at" }) updatedAt: Date;
  @DeleteDateColumn({ name: "deleted_at" }) deletedAt: Date | null;
}

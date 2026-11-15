import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UsersEntity } from "../../users/entities/users.entity";
import { SpeciesEntity } from "../../species/entities/species.entity";
import { BreedEntity } from "../../breeds/entities/breed.entity";

/**
 * Animal record with structured taxonomy; measurements are stored separately.
 * TypeScript/HTTP attributes remain camelCase; physical columns use snake_case.
 * Soft deletion preserves reservation history. Legacy owner references may be null.
 */
@Entity("vc_animals")
export class AnimalEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Identity and owner.
  @Column()
  name: string;

  @ManyToOne(() => UsersEntity, user => user.idAnimal, { nullable: true })
  @JoinColumn({ name: "owner_id" })
  owner: UsersEntity | null;

  // Taxonomy: the composite breed join enforces breed/species consistency in SQL.
  @Column({ name: "species_id", type: "uniqueidentifier" })
  speciesId: string;

  @ManyToOne(() => SpeciesEntity, { nullable: false })
  @JoinColumn({ name: "species_id" })
  species: SpeciesEntity;

  @Column({ name: "breed_id", type: "uniqueidentifier", nullable: true })
  breedId: string | null;

  @ManyToOne(() => BreedEntity, { nullable: true })
  @JoinColumn([
    { name: "breed_id", referencedColumnName: "id" },
    { name: "species_id", referencedColumnName: "speciesId" },
  ])
  breed: BreedEntity | null;

  // Physical details. Measurement units retain the application's existing convention.
  /** Exact date when known; never reconstructed from a historical age snapshot. */
  @Column({ name: "birth_date", type: "date", nullable: true })
  birthDate: string | null;

  @Column()
  color: string;

  @Column()
  sex: string;

  @Column({ nullable: true, type: "nvarchar", length: 255 })
  description: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true })
  notes: string | null;

  /** Supports both image URLs and unchanged embedded legacy data URLs. */
  @Column({ name: "image_url", type: "nvarchar", length: "MAX", nullable: true })
  imageUrl: string | null;

  @Column({ name: "microchip_number", type: "nvarchar", length: 255, nullable: true })
  microchipNumber: string | null;

  /** Null distinguishes unknown status from confirmed false. */
  @Column({ name: "is_neutered", type: "bit", nullable: true })
  isNeutered: boolean | null;

  // Verification is controlled by business rules, never by untrusted create/update input.
  @Column({ name: "is_verified", default: false })
  isVerified: boolean;

  // Audit timestamps; deleted rows remain available to explicit historical queries.
  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt: Date | null;
}
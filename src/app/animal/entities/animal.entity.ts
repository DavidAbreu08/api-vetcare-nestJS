import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UsersEntity } from "../../users/entities/users.entity";
import { SpeciesEntity } from "../../species/entities/species.entity";
import { BreedEntity } from "../../breeds/entities/breed.entity";

/**
 * Animal record with structured taxonomy; measurements are stored separately.
 * TypeScript/HTTP attributes remain camelCase; physical columns use snake_case.
 * Soft deletion preserves reservation history. Legacy owner references may be null.
 */
@Entity("vc_animals")
@Index("ix_vc_animals_species", ["speciesId"])
@Index("ix_vc_animals_breed_species", ["breedId", "speciesId"])
export class AnimalEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Identity and owner.
  @Column()
  name: string;

  @ManyToOne(() => UsersEntity, user => user.animals, { nullable: true })
  @JoinColumn({ name: "owner_id", foreignKeyConstraintName: "fk_vc_animals_owner" })
  owner: UsersEntity | null;

  // Taxonomy: breed/species consistency is enforced in SQL by the composite FK fk_vc_animals_breed_species.
  @Column({ name: "species_id", type: "uniqueidentifier" })
  speciesId: string;

  @ManyToOne(() => SpeciesEntity, { nullable: false })
  @JoinColumn({ name: "species_id", foreignKeyConstraintName: "fk_vc_animals_species" })
  species: SpeciesEntity;

  @Column({ name: "breed_id", type: "uniqueidentifier", nullable: true })
  breedId: string | null;

  /**
   * Mapped on breed_id only: a composite join column sharing species_id with `species` makes TypeORM 0.3 overwrite
   * that column's metadata and generate an invalid species join (ON s.speciesId=...). The composite FK
   * fk_vc_animals_breed_species (breed_id, species_id) -> vc_breeds (id, species_id) exists only in the database
   * (migration 1794744000000), hence createForeignKeyConstraints: false; resolveAnimalTaxonomy checks it first.
   */
  @ManyToOne(() => BreedEntity, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: "breed_id", referencedColumnName: "id" })
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
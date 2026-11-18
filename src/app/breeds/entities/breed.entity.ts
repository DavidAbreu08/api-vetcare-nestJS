import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { SpeciesEntity } from "../../species/entities/species.entity";
/** Breed of one species; names and constraints match migration 1794744000000. */
@Entity("vc_breeds")
@Unique("uq_vc_breeds_species_name", ["speciesId", "name"])
@Unique("uq_vc_breeds_id_species", ["id", "speciesId"])
export class BreedEntity {
  @Column({ type: "nvarchar", length: 240, nullable: true })
  description: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true })
  notes: string | null;

  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "species_id", type: "uniqueidentifier" }) speciesId: string;
  @ManyToOne(() => SpeciesEntity, { nullable: false })
  @JoinColumn({ name: "species_id", foreignKeyConstraintName: "fk_vc_breeds_species" }) species: SpeciesEntity;
  @Column({ type: "nvarchar", length: 255 }) name: string;
}

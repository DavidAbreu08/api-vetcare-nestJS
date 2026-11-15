import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { SpeciesEntity } from "./species.entity";
@Entity("vc_breeds")
@Unique(["speciesId", "name"])
@Unique(["id", "speciesId"])
export class BreedEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "species_id", type: "uniqueidentifier" }) speciesId: string;
  @ManyToOne(() => SpeciesEntity, { nullable: false })
  @JoinColumn({ name: "species_id" }) species: SpeciesEntity;
  @Column({ type: "nvarchar", length: 255 }) name: string;
}

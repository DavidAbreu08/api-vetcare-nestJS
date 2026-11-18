import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";
/** Species catalog shared by animal records and breeds. */
@Entity("vc_species")
@Unique("uq_vc_species_name", ["name"])
export class SpeciesEntity {
  @Column({ type: "nvarchar", length: 240, nullable: true })
  description: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true })
  notes: string | null;

  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "nvarchar", length: 255 }) name: string;
}

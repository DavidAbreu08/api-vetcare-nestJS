import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
/** Species catalog shared by animal records and breeds. */
@Entity("vc_species")
export class SpeciesEntity {
  @Column({ type: "nvarchar", length: 240, nullable: true })
  description: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true })
  notes: string | null;

  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "nvarchar", length: 255, unique: true }) name: string;
}

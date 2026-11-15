import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
@Entity("vc_species")
export class SpeciesEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "nvarchar", length: 255, unique: true }) name: string;
}

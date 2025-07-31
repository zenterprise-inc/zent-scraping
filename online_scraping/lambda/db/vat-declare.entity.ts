import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'vat_declare' })
export class VatDeclare {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  rpnTin!: string;

  @Column()
  bmanTin!: string;

  @Column()
  year!: string;

  @Column()
  half!: string;
}

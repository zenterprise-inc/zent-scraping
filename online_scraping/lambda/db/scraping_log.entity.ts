import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class ScrapingLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  onlineMall!: string;

  @Column()
  userId!: string;

  @Column()
  bizNo!: string;

  @Column()
  log!: string;

  @Column({ type: 'mediumblob', nullable: true })
  image?: Buffer;

  imgBase64?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

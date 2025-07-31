import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('online_mall_scraping_history')
export class OnlineMallScrapingHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  resultId!: number;

  @Column()
  onlineMallAccountId!: number;

  @Column({ type: 'char', length: 5 })
  svcCd!: string;

  @Column({
    type: 'enum',
    enum: ['fail', 'complete'],
  })
  status!: string;

  @Column({ type: 'json', nullable: true })
  result?: object;

  @Column({ type: 'text', nullable: true })
  message?: string;

  @Column({ type: 'char', length: 8 })
  startDate!: string;

  @Column({ type: 'char', length: 8 })
  endDate!: string;

  @CreateDateColumn({ type: 'date' })
  createdAt!: Date;
}

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('online_mall_scraping_result')
export class OnlineMallScrapingResult {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  vatDeclareId!: number;

  @Column()
  onlineMallAccountId!: number;

  @Column({ type: 'char', length: 5 })
  svcCd!: string;

  @Column({
    type: 'enum',
    enum: ['start', 'fail', 'complete'],
    default: 'start',
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
}

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('online_mall_account')
export class OnlineMallAccount {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  rpnTin!: string;

  @Column()
  bmanTin!: string;

  @Column()
  bizNo!: string;

  @Column()
  status!: string;

  @Column()
  mallId!: string;

  @Column()
  encryptData?: string;

  @Column()
  stepData?: string;

  @Column()
  mallType?: string;

  @Column()
  isNaverAccount?: boolean;

  @Column()
  detailStatus?: string;

  @Column()
  subUserId?: string;

  @Column()
  subPassword?: string;

  @Column()
  storeId?: string;

  @Column()
  deleteFlag!: number;

  @Column()
  lastSuccessLoginAt!: Date;

  @Column()
  lastSuccessScrapingAt!: Date;
}

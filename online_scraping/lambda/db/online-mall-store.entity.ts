import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('online_mall_store')
export class OnlineMallStore {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  onlineMallAccountId!: number;

  @Column()
  storeId!: string;
}

import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

console.log('ENV DB_USERNAME:', process.env.DB_USERNAME);
console.log('ENV DATABASE:', process.env.DATABASE);

const isDocker = process.env.IS_DOCKER === 'true';
const HOST = process.env.DB_HOST || 'localhost';
const USERNAME = process.env.DB_USERNAME || 'root';
const PASSWORD = process.env.DB_PASSWORD || 'root';
const DATABASE = process.env.DATABASE || 'zent_scraper';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: HOST,
  port: 3306,
  username: USERNAME,
  password: PASSWORD,
  database: DATABASE,
  synchronize: false,
  logging: false ,
  entities: [__dirname + '/../**/*.entity.{js,ts}'],
  namingStrategy: new SnakeNamingStrategy(),
});

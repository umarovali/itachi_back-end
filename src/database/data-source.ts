import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm.config';

/** Для CLI миграций: npm run migration:generate / migration:run */
export default new DataSource({ ...buildTypeOrmOptions(process.env), synchronize: false });

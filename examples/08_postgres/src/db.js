// @ts-ignore
import 'server-only';
import { Pool } from 'pg';

/**
 * WE RECOMMEND USING ENVIRONMENT VARIABLES FOR SENSITIVE DATA
 * DON'T COMMIT YOUR DATABASE PASSWORD TO GITHUB
 */
const db = new Pool({
  host: 'HOST',
  database: 'DATABASE',
  user: 'USER',
  password: 'PASSWORD',
  port: 'PORT',
});

export default db;
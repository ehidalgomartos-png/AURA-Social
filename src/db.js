const { Pool } = require('pg');

const sslEnabled = String(process.env.DATABASE_SSL || 'false').toLowerCase() === 'true';

function positiveInt(value,fallback){
  const parsed=Number(value);
  return Number.isInteger(parsed)&&parsed>0 ? parsed : fallback;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  max: positiveInt(process.env.DB_POOL_MAX,10),
  idleTimeoutMillis: positiveInt(process.env.DB_IDLE_TIMEOUT_MS,30000),
  connectionTimeoutMillis: positiveInt(process.env.DB_CONNECT_TIMEOUT_MS,5000),
  keepAlive: true
});

pool.on('error',error=>{
  console.error('RedLibertad PostgreSQL idle client error:',error);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

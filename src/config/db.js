const { Pool } = require('pg');
require('dotenv').config();

let pgPool = null;

const connectDB = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing from environment variables');
  }

  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true
  });

  pgPool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });

  await pgPool.query('SELECT 1');

  console.log('PostgreSQL connected to Neon successfully');
};

const getPool = () => {
  if (!pgPool) {
    throw new Error('Database pool is not initialized');
  }

  return pgPool;
};

module.exports = { connectDB, getPool };

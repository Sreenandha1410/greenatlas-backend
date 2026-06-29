const { Pool } = require('pg');
require('dotenv').config();

let pgPool = null;

const connectDB = async () => {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await pgPool.query('SELECT 1');
  console.log('PostgreSQL connected to Neon ✅');
};

const getPool = () => pgPool;

module.exports = { connectDB, getPool };
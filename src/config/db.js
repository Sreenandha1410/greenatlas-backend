require('dotenv').config();

const dbType = process.env.DB_TYPE || 'pg';

let dbModule;

if (dbType === 'mysql') {
  dbModule = require('./db-mysql');
} else {
  const { Pool } = require('pg');
  let pgPool = null;

  const connectDB = async () => {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: true } 
        : { rejectUnauthorized: false }
    });

    await pgPool.query('SELECT 1');
    console.log('PostgreSQL connected ✅');
  };

  const getPool = () => pgPool;
  dbModule = { connectDB, getPool };
}

module.exports = dbModule;
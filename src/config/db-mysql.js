const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;

const connectDB = async () => {
  pool = mysql.createPool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     process.env.DB_PORT || 3306,
    waitForConnections: true,
  });

  await pool.query('SELECT 1');
  console.log('MySQL connected ✅');
};

const getPool = () => pool;

module.exports = { connectDB, getPool };

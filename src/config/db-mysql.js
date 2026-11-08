const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;

const connectDB = async () => {
  pool = mysql.createPool({
    host:               process.env.DB_HOST || 'localhost',
    user:               process.env.DB_USER,
    password:           process.env.DB_PASSWORD,
    database:           process.env.DB_NAME,
    port:               parseInt(process.env.DB_PORT || '3306', 10),
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0
  });

  await pool.query('SELECT 1');
  console.log('MySQL connection pool established ✅');
};

const getPool = () => pool;

module.exports = { connectDB, getPool };
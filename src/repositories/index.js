const DB = process.env.DB_TYPE || 'pg';

const SUPPORTED = ['pg', 'mysql'];
if (!SUPPORTED.includes(DB)) {
  throw new Error(`Unsupported DB_TYPE: "${DB}". Only "mysql" and "pg" are supported.`);
}

const treeRepo = require(`./${DB}/treeRepo`);
const speciesRepo = require(`./${DB}/speciesRepo`);
const areaRepo = require(`./${DB}/areaRepo`);
const userRepo = require(`./${DB}/userRepo`);
const boardRepo = require(`./${DB}/boardRepo`);
module.exports = { treeRepo, speciesRepo, areaRepo, boardRepo };

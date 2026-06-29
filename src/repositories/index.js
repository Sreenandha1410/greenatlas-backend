const DB = process.env.DB_TYPE || 'pg';

const treeRepo   = require(`./${DB}/treeRepo`);
const speciesRepo = require(`./${DB}/speciesRepo`);
const areaRepo   = require(`./${DB}/areaRepo`);

module.exports = { treeRepo, speciesRepo, areaRepo };
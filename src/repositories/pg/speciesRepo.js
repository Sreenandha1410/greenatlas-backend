const { getPool } = require('../../config/db');

const getAll = async () => {
  const { rows } = await getPool().query('SELECT * FROM species ORDER BY common_name');
  return rows;
};

const getBySpecies = async (speciesName) => {
  const { rows } = await getPool().query(
    'SELECT * FROM species WHERE species = $1', [speciesName]
  );
  return rows[0] || null;
};

const getById = async (id) => {
  const { rows } = await getPool().query(
    'SELECT * FROM species WHERE species_id = $1', [id]
  );
  return rows[0] || null;
};

const create = async (data) => {
  const allowed = [
    'species_id','common_name','tamil_name','kingdom','division','class','order','family',
    'genus','species','origin','name_breakdown','general_description','avg_height',
    'lifespan','growth_rate','flowering_season','fruiting_season','native_exotic',
    'pollination_method','wildlife_supported','ecological_importance','medicinal_uses',
    'economic_uses','environmental_benefits','cultural_significance','interesting_facts',
    'conservation_status','image_url'
  ];
  const filtered = Object.fromEntries(
    Object.entries(data).filter(([k]) => allowed.includes(k))
  );
  const keys = Object.keys(filtered);
  const vals = Object.values(filtered);
  const cols = keys.map(k => `"${k}"`).join(', ');
  const placeholders = vals.map((_, i) => `$${i+1}`).join(', ');
  const { rows } = await getPool().query(
    `INSERT INTO species (${cols}) VALUES (${placeholders}) RETURNING *`, vals
  );
  return rows[0];
};

const update = async (id, data) => {
  const allowed = [
    'common_name','tamil_name','kingdom','division','class','order','family',
    'genus','species','origin','name_breakdown','general_description','avg_height',
    'lifespan','growth_rate','flowering_season','fruiting_season','native_exotic',
    'pollination_method','wildlife_supported','ecological_importance','medicinal_uses',
    'economic_uses','environmental_benefits','cultural_significance','interesting_facts',
    'conservation_status','image_url'
  ];
  const filtered = Object.fromEntries(
    Object.entries(data).filter(([k]) => allowed.includes(k))
  );
  const keys = Object.keys(filtered);
  const vals = Object.values(filtered);
  const sets = keys.map((k, i) => `"${k}"=$${i+1}`).join(', ');
  const { rows } = await getPool().query(
    `UPDATE species SET ${sets} WHERE species_id=$${keys.length+1} RETURNING *`,
    [...vals, id]
  );
  return rows[0];
};

const remove = async (id) => {
  await getPool().query('DELETE FROM species WHERE species_id=$1', [id]);
};

module.exports = { getAll, getBySpecies, getById, create, update, remove };
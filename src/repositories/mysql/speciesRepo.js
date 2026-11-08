const { getPool } = require('../../config/db');

const getAll = async () => {
  const [rows] = await getPool().query(
    'SELECT * FROM species ORDER BY common_name'
  );
  return rows;
};

const getBySpecies = async (speciesName) => {
  const [rows] = await getPool().query(
    'SELECT * FROM species WHERE species = ? LIMIT 1',
    [speciesName]
  );
  return rows[0] || null;
};

const getById = async (id) => {
  const [rows] = await getPool().query(
    'SELECT * FROM species WHERE species_id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
};

const create = async (data) => {
  const allowed = [
    'species_id', 'common_name', 'tamil_name', 'kingdom', 'division',
    'class', 'order', 'family', 'genus', 'species', 'origin',
    'name_breakdown', 'general_description', 'avg_height', 'lifespan',
    'growth_rate', 'flowering_season', 'fruiting_season', 'native_exotic',
    'pollination_method', 'wildlife_supported', 'ecological_importance',
    'medicinal_uses', 'economic_uses', 'environmental_benefits',
    'cultural_significance', 'interesting_facts', 'conservation_status',
    'image_url', 'flora_type'
  ];

  const filtered = Object.fromEntries(
    Object.entries(data).filter(([key]) => allowed.includes(key))
  );

  const keys = Object.keys(filtered);
  const vals = Object.values(filtered);

  if (keys.length === 0) {
    throw new Error('No valid fields provided for species creation');
  }

  const cols = keys.map(key => `\`${key}\``).join(', ');
  const placeholders = keys.map(() => '?').join(', ');

  await getPool().query(
    `INSERT INTO species (${cols}) VALUES (${placeholders})`,
    vals
  );

  const lookupId = filtered.species_id || data.species_id;
  const [rows] = await getPool().query(
    'SELECT * FROM species WHERE species_id = ? LIMIT 1',
    [lookupId]
  );

  return rows[0] || null;
};

const update = async (id, data) => {
  const allowed = [
    'common_name', 'tamil_name', 'kingdom', 'division', 'class',
    'order', 'family', 'genus', 'species', 'origin', 'name_breakdown',
    'general_description', 'avg_height', 'lifespan', 'growth_rate',
    'flowering_season', 'fruiting_season', 'native_exotic',
    'pollination_method', 'wildlife_supported', 'ecological_importance',
    'medicinal_uses', 'economic_uses', 'environmental_benefits',
    'cultural_significance', 'interesting_facts', 'conservation_status',
    'image_url', 'flora_type'
  ];

  const filtered = Object.fromEntries(
    Object.entries(data).filter(([key]) => allowed.includes(key))
  );

  const keys = Object.keys(filtered);
  const vals = Object.values(filtered);

  if (keys.length === 0) {
    throw new Error('No valid fields provided for species update');
  }

  const sets = keys.map(key => `\`${key}\` = ?`).join(', ');

  await getPool().query(
    `UPDATE species SET ${sets} WHERE species_id = ?`,
    [...vals, id]
  );

  const [rows] = await getPool().query(
    'SELECT * FROM species WHERE species_id = ? LIMIT 1',
    [id]
  );

  return rows[0] || null;
};

const remove = async (id) => {
  await getPool().query(
    'DELETE FROM species WHERE species_id = ?',
    [id]
  );
};

module.exports = {
  getAll,
  getBySpecies,
  getById,
  create,
  update,
  remove
};
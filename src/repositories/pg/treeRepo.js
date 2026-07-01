const { getPool } = require('../../config/db');

const getAll = async ({ search, area, family } = {}) => {
  const pool = getPool();
  let query = `
    SELECT DISTINCT ON (t.tree_id) t.*, s.tamil_name, s.general_description, s.avg_height,
        s.flowering_season, s.native_exotic, s.conservation_status,
        s.image_url AS species_image_url,
        a.area_code,
        COALESCE(
          (SELECT ti.image_url FROM tree_images ti
           WHERE ti.tree_id = t.tree_id
           ORDER BY ti.is_primary DESC, ti.id ASC
           LIMIT 1),
          t.image_link
        ) AS image_link
    FROM trees t
    LEFT JOIN species s ON t.botanical_name = (s.genus || ' ' || s.species)
    LEFT JOIN areas a ON t.area = a.area
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    query += ` AND (
      t.common_name    ILIKE $${params.length} OR
      t.botanical_name ILIKE $${params.length} OR
      t.area           ILIKE $${params.length} OR
      t.family         ILIKE $${params.length} OR
      t.tree_id        ILIKE $${params.length} OR
      s.tamil_name     ILIKE $${params.length}
    )`;
  }

  if (area) {
    params.push(area);
    query += ` AND t.area = $${params.length}`;
  }
  if (family) {
    params.push(family);
    query += ` AND t.family = $${params.length}`;
  }

  const { rows } = await pool.query(query, params);
  return rows;
};

const getById = async (id) => {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (t.tree_id) t.*, 
        s.tamil_name, s.general_description, s.avg_height,
        s.lifespan, s.growth_rate, s.flowering_season, s.fruiting_season,
        s.native_exotic, s.pollination_method, s.wildlife_supported,
        s.ecological_importance, s.medicinal_uses, s.economic_uses,
        s.environmental_benefits, s.cultural_significance,
        s.interesting_facts, s.conservation_status,
        s.kingdom, s.division, s.class, s.order, s.genus, s.species, s.origin,
        a.area_code
    FROM trees t
    LEFT JOIN species s ON t.botanical_name = (s.genus || ' ' || s.species)
    LEFT JOIN areas a ON t.area = a.area
    WHERE t.tree_id = $1
  `, [id]);
  return rows[0] || null;
};

const create = async (data) => {
  const pool = getPool();
  const { tree_id, botanical_name, common_name, family, area,
          latitude, longitude, age, notes, image_link } = data;
  const { rows } = await pool.query(`
    INSERT INTO trees 
      (tree_id, botanical_name, common_name, family, area,
       latitude, longitude, age, notes, image_link)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [tree_id, botanical_name, common_name, family, area,
      latitude, longitude, age, notes, image_link]);
  return rows[0];
};

const update = async (id, data) => {
  const pool = getPool();
  const { botanical_name, common_name, family, area,
          latitude, longitude, age, notes, image_link } = data;
  const { rows } = await pool.query(`
    UPDATE trees SET
      botanical_name=$1, common_name=$2, family=$3, area=$4,
      latitude=$5, longitude=$6, age=$7, notes=$8, image_link=$9
    WHERE tree_id=$10 RETURNING *
  `, [botanical_name, common_name, family, area,
      latitude, longitude, age, notes, image_link, id]);
  return rows[0];
};

const remove = async (id) => {
  await getPool().query('DELETE FROM trees WHERE tree_id=$1', [id]);
};

const getNearby = async (treeId, radiusMeters = 100) => {
  const pool = getPool();
  const { rows: [ref] } = await pool.query(
    'SELECT latitude, longitude FROM trees WHERE tree_id = $1', [treeId]
  );
  if (!ref) return [];
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (t.tree_id) t.tree_id, t.common_name, t.botanical_name, 
           t.family, t.area, t.image_link,
           ROUND((point(t.longitude, t.latitude) <@> point($1, $2)) * 1609.34) AS distance_m
    FROM trees t
    WHERE t.tree_id != $3
      AND (point(t.longitude, t.latitude) <@> point($1, $2)) * 1609.34 < $4
    ORDER BY t.tree_id, distance_m
    LIMIT 5
  `, [ref.longitude, ref.latitude, treeId, radiusMeters]);
  return rows;
};

module.exports = { getAll, getById, create, update, remove, getNearby };

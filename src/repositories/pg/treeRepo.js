const getAll = async ({ search, area, family } = {}) => {
  const pool = getPool();
  let query = `
    SELECT DISTINCT ON (t.tree_id) t.tree_id, t.botanical_name, t.common_name, 
        t.family, t.area, t.latitude, t.longitude, t.age, t.notes,
        s.tamil_name, s.general_description, s.avg_height,
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
    LEFT JOIN species s
    ON t.botanical_name = (s.genus || ' ' || s.species)
    LEFT JOIN areas a ON t.area = a.area
    WHERE t.tree_id = $1
    ORDER BY t.tree_id
  `, [id]);
  return rows[0] || null;
};

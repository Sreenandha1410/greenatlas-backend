const { getPool } = require('../../config/db');

async function getAll({ status, type, area, search, flora_type } = {}) {
  const pool = getPool();
  const conditions = [];
  const values = [];
  let idx = 1;

  if (status) { conditions.push(`b.status = $${idx++}`); values.push(status); }
  if (type)   { conditions.push(`b.board_type = $${idx++}`); values.push(type); }
  if (area)   { conditions.push(`b.area ILIKE $${idx++}`); values.push(`%${area}%`); }
  if (search) {
    conditions.push(`(b.board_id ILIKE $${idx} OR b.primary_tree_id ILIKE $${idx} OR t.common_name ILIKE $${idx} OR b.area ILIKE $${idx})`);
    values.push(`%${search}%`); idx++;
  }
  if (flora_type) {
    conditions.push(`COALESCE(s.flora_type, 'tree') = $${idx++}`);
    values.push(flora_type);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await pool.query(`
    SELECT b.*,
           t.common_name, t.botanical_name,
           COALESCE(s.flora_type, 'tree') AS flora_type
    FROM tree_boards b
    LEFT JOIN trees t ON t.tree_id = b.primary_tree_id
    LEFT JOIN species s ON t.botanical_name = (s.genus || ' ' || s.species)
    ${where}
    ORDER BY b.created_at DESC
  `, values);

  return result.rows.map(r => ({
    ...r,
    group_tree_ids: r.group_tree_ids || []
  }));
}

async function getById(id) {
  const pool = getPool();
  const result = await pool.query(`
    SELECT b.*, t.common_name, t.botanical_name,
           COALESCE(s.flora_type, 'tree') AS flora_type
    FROM tree_boards b
    LEFT JOIN trees t ON t.tree_id = b.primary_tree_id
    LEFT JOIN species s ON t.botanical_name = (s.genus || ' ' || s.species)
    WHERE b.id = $1
  `, [id]);
  return result.rows[0] || null;
}

async function getStats() {
  const pool = getPool();
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'Need to Fix') AS need_fix,
      COUNT(*) FILTER (WHERE status = 'Board Fixed') AS fixed,
      COUNT(*) FILTER (WHERE status = 'Requires Maintenance') AS maintenance,
      COUNT(*) FILTER (WHERE board_type = 'individual') AS individual,
      COUNT(*) FILTER (WHERE board_type = 'group') AS group_boards,
      COUNT(*) AS total
    FROM tree_boards
  `);
  return result.rows[0];
}

async function getMissingTrees() {
  const pool = getPool();
  const result = await pool.query(`
    SELECT t.tree_id, t.common_name, t.botanical_name, t.area,
           COALESCE(s.flora_type, 'tree') AS flora_type
    FROM trees t
    LEFT JOIN species s ON t.botanical_name = (s.genus || ' ' || s.species)
    WHERE t.tree_id NOT IN (
      SELECT primary_tree_id FROM tree_boards
    )
    AND t.tree_id NOT IN (
      SELECT jsonb_array_elements_text(group_tree_ids) FROM tree_boards WHERE group_tree_ids != '[]'
    )
    ORDER BY t.area, t.common_name
  `);
  return result.rows;
}

async function bulkCreate(treeIds) {
  const pool = getPool();
  if (!Array.isArray(treeIds) || !treeIds.length) {
    return { created: 0, skipped: 0 };
  }

  // Inserts missing individual boards with 'Need to Fix' status and area from trees table
  const result = await pool.query(`
    INSERT INTO tree_boards (board_id, primary_tree_id, board_type, status, area, group_count)
    SELECT
      'BRD-' || t.tree_id,
      t.tree_id,
      'individual',
      'Need to Fix',
      t.area,
      1
    FROM trees t
    WHERE t.tree_id = ANY($1)
    ON CONFLICT (board_id) DO NOTHING
    RETURNING board_id;
  `, [treeIds]);

  const createdCount = result.rowCount;
  const skippedCount = treeIds.length - createdCount;
  return { created: createdCount, skipped: skippedCount };
}

async function create(data) {
  const pool = getPool();
  const {
    primary_tree_id, board_type = 'individual',
    status = 'Need to Fix', group_tree_ids = [],
    group_count = 1, location_description, area,
    installed_date, last_checked, installed_by, notes
  } = data;

  const board_id = board_type === 'group'
    ? `GRP-${primary_tree_id}`
    : `BRD-${primary_tree_id}`;

  const result = await pool.query(`
    INSERT INTO tree_boards
      (board_id, primary_tree_id, board_type, status, group_tree_ids,
       group_count, location_description, area, installed_date,
       last_checked, installed_by, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
  `, [
    board_id, primary_tree_id, board_type, status,
    JSON.stringify(group_tree_ids), group_count,
    location_description || null, area || null,
    installed_date || null, last_checked || null,
    installed_by || null, notes || null
  ]);
  return result.rows[0];
}

async function update(id, data) {
  const pool = getPool();
  const allowed = [
    'status', 'group_tree_ids', 'group_count', 'location_description',
    'area', 'installed_date', 'last_checked', 'installed_by', 'notes'
  ];
  const sets = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key === 'group_tree_ids') val = JSON.stringify(val);
      if ((key === 'installed_date' || key === 'last_checked') && val === '') val = null;
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }

  if (!sets.length) return getById(id);

  values.push(id);
  const result = await pool.query(
    `UPDATE tree_boards SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
}

async function updateStatus(id, status) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE tree_boards SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return result.rows[0];
}

async function updateDates(id, { installed_date, last_checked }) {
  const pool = getPool();
  const sets = [];
  const values = [];
  let idx = 1;

  if (installed_date !== undefined) {
    sets.push(`installed_date = $${idx++}`);
    values.push(installed_date || null);
  }
  if (last_checked !== undefined) {
    sets.push(`last_checked = $${idx++}`);
    values.push(last_checked || null);
  }

  if (!sets.length) return getById(id);

  values.push(id);
  const result = await pool.query(
    `UPDATE tree_boards SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
}

async function remove(id) {
  const pool = getPool();
  await pool.query('DELETE FROM tree_boards WHERE id = $1', [id]);
}

module.exports = {
  getAll, getById, getStats, getMissingTrees, bulkCreate,
  create, update, updateStatus, updateDates, remove
};

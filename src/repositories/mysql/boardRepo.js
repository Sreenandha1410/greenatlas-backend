const { getPool } = require('../../config/db');

async function getAll({ status, type, area, search, flora_type } = {}) {
  const pool = getPool();
  const conditions = [];
  const values = [];

  if (status) { conditions.push('b.status = ?'); values.push(status); }
  if (type)   { conditions.push('b.board_type = ?'); values.push(type); }
  if (area)   { conditions.push('b.area LIKE ?'); values.push(`%${area}%`); }
  if (search) {
    conditions.push('(b.board_id LIKE ? OR b.primary_tree_id LIKE ? OR t.common_name LIKE ? OR b.area LIKE ?)');
    values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (flora_type) {
    conditions.push("COALESCE(s.flora_type, 'tree') = ?");
    values.push(flora_type);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows] = await pool.query(`
    SELECT b.*, t.common_name, t.botanical_name,
           COALESCE(s.flora_type, 'tree') AS flora_type
    FROM tree_boards b
    LEFT JOIN trees t ON t.tree_id = b.primary_tree_id
    LEFT JOIN species s ON t.botanical_name = CONCAT(s.genus, ' ', s.species)
    ${where}
    ORDER BY b.created_at DESC
  `, values);

  return rows.map(r => ({
    ...r,
    group_tree_ids: r.group_tree_ids
      ? (typeof r.group_tree_ids === 'string' ? JSON.parse(r.group_tree_ids) : r.group_tree_ids)
      : []
  }));
}

async function getById(id) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT b.*, t.common_name, t.botanical_name,
           COALESCE(s.flora_type, 'tree') AS flora_type
    FROM tree_boards b
    LEFT JOIN trees t ON t.tree_id = b.primary_tree_id
    LEFT JOIN species s ON t.botanical_name = CONCAT(s.genus, ' ', s.species)
    WHERE b.id = ?
  `, [id]);
  if (!rows[0]) return null;
  const r = rows[0];
  r.group_tree_ids = r.group_tree_ids
    ? (typeof r.group_tree_ids === 'string' ? JSON.parse(r.group_tree_ids) : r.group_tree_ids)
    : [];
  return r;
}

async function getStats() {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT
      SUM(status = 'Need to Fix') AS need_fix,
      SUM(status = 'Board Fixed') AS fixed,
      SUM(status = 'Requires Maintenance') AS maintenance,
      SUM(board_type = 'individual') AS individual,
      SUM(board_type = 'group') AS group_boards,
      COUNT(*) AS total
    FROM tree_boards
  `);
  return rows[0];
}

async function getMissingTrees() {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT t.tree_id, t.common_name, t.botanical_name, t.area,
           COALESCE(s.flora_type, 'tree') AS flora_type
    FROM trees t
    LEFT JOIN species s ON t.botanical_name = CONCAT(s.genus, ' ', s.species)
    WHERE t.tree_id NOT IN (SELECT primary_tree_id FROM tree_boards)
    ORDER BY t.area, t.common_name
  `);
  return rows;
}

async function bulkCreate(treeIds) {
  const pool = getPool();
  if (!Array.isArray(treeIds) || !treeIds.length) {
    return { created: 0, skipped: 0 };
  }

  const [result] = await pool.query(`
    INSERT IGNORE INTO tree_boards (board_id, primary_tree_id, board_type, status, area, group_count)
    SELECT
      CONCAT('BRD-', t.tree_id),
      t.tree_id,
      'individual',
      'Need to Fix',
      t.area,
      1
    FROM trees t
    WHERE t.tree_id IN (?)
  `, [treeIds]);

  const createdCount = result.affectedRows || 0;
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

  const [result] = await pool.query(`
    INSERT INTO tree_boards
      (board_id, primary_tree_id, board_type, status, group_tree_ids,
       group_count, location_description, area, installed_date,
       last_checked, installed_by, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    board_id, primary_tree_id, board_type, status,
    JSON.stringify(group_tree_ids), group_count,
    location_description || null, area || null,
    installed_date || null, last_checked || null,
    installed_by || null, notes || null
  ]);
  return getById(result.insertId);
}

async function update(id, data) {
  const pool = getPool();
  const allowed = [
    'status', 'group_tree_ids', 'group_count', 'location_description',
    'area', 'installed_date', 'last_checked', 'installed_by', 'notes'
  ];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key === 'group_tree_ids') val = JSON.stringify(val);
      if ((key === 'installed_date' || key === 'last_checked') && val === '') val = null;
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }

  if (!sets.length) return getById(id);

  values.push(id);
  await pool.query(`UPDATE tree_boards SET ${sets.join(', ')} WHERE id = ?`, values);
  return getById(id);
}

async function updateStatus(id, status) {
  const pool = getPool();
  await pool.query('UPDATE tree_boards SET status = ? WHERE id = ?', [status, id]);
  return getById(id);
}

async function updateDates(id, { installed_date, last_checked }) {
  const pool = getPool();
  const sets = [];
  const values = [];

  if (installed_date !== undefined) {
    sets.push('installed_date = ?');
    values.push(installed_date || null);
  }
  if (last_checked !== undefined) {
    sets.push('last_checked = ?');
    values.push(last_checked || null);
  }

  if (!sets.length) return getById(id);

  values.push(id);
  await pool.query(`UPDATE tree_boards SET ${sets.join(', ')} WHERE id = ?`, values);
  return getById(id);
}

async function remove(id) {
  const pool = getPool();
  await pool.query('DELETE FROM tree_boards WHERE id = ?', [id]);
}

module.exports = {
  getAll, getById, getStats, getMissingTrees, bulkCreate,
  create, update, updateStatus, updateDates, remove
};

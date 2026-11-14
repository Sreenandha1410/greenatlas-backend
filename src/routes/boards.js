const express = require('express');
const router = express.Router();
const { boardRepo } = require('../repositories');
const authMiddleware = require('../middleware/auth');

// GET /api/boards
router.get('/', async (req, res) => {
  try {
    const { status, type, area, search, flora_type } = req.query;
    const boards = await boardRepo.getAll({ status, type, area, search, flora_type });
    res.json(boards);
  } catch (err) {
    console.error('GET /boards:', err);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

// GET /api/boards/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await boardRepo.getStats();
    res.json(stats);
  } catch (err) {
    console.error('GET /boards/stats:', err);
    res.status(500).json({ error: 'Failed to fetch board stats' });
  }
});

// GET /api/boards/missing
router.get('/missing', authMiddleware, async (req, res) => {
  try {
    const trees = await boardRepo.getMissingTrees();
    res.json(trees);
  } catch (err) {
    console.error('GET /boards/missing:', err);
    res.status(500).json({ error: 'Failed to fetch missing boards data' });
  }
});

// POST /api/boards/bulk
router.post('/bulk', authMiddleware, async (req, res) => {
  try {
    const { treeIds } = req.body;
    if (!Array.isArray(treeIds) || !treeIds.length) {
      return res.status(400).json({ error: 'treeIds array is required' });
    }
    const cleanIds = treeIds.map(id => String(id).trim()).filter(Boolean);
    const result = await boardRepo.bulkCreate(cleanIds);
    res.json(result);
  } catch (err) {
    console.error('POST /boards/bulk:', err);
    res.status(500).json({ error: 'Failed to bulk create boards' });
  }
});

// GET /api/boards/export/csv
router.get('/export/csv', authMiddleware, async (req, res) => {
  try {
    const boards = await boardRepo.getAll({});
    const headers = [
      'board_id', 'primary_tree_id', 'common_name', 'botanical_name',
      'board_type', 'group_count', 'status', 'area',
      'location_description', 'installed_date', 'last_checked',
      'installed_by', 'notes', 'created_at'
    ];
    const escape = v => {
      if (v === null || v === undefined) return '';
      const s = Array.isArray(v) ? v.join('; ') : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(',')]
      .concat(boards.map(b => headers.map(h => escape(b[h])).join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="green_atlas_boards.csv"');
    res.send(csv);
  } catch (err) {
    console.error('GET /boards/export/csv:', err);
    res.status(500).json({ error: 'Failed to export boards' });
  }
});

// GET /api/boards/:id
router.get('/:id', async (req, res) => {
  try {
    const board = await boardRepo.getById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    console.error('GET /boards/:id:', err);
    res.status(500).json({ error: 'Failed to fetch board' });
  }
});

// POST /api/boards
router.post('/', authMiddleware, async (req, res) => {
  try {
    const board = await boardRepo.create(req.body);
    res.status(201).json(board);
  } catch (err) {
    if (err.code === '23505' || err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A board already exists for this tree ID' });
    }
    console.error('POST /boards:', err);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// PUT /api/boards/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const board = await boardRepo.update(req.params.id, req.body);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    console.error('PUT /boards/:id:', err);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

// PATCH /api/boards/:id/status
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['Need to Fix', 'Board Fixed', 'Requires Maintenance'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    const board = await boardRepo.updateStatus(req.params.id, status);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    console.error('PATCH /boards/:id/status:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PATCH /api/boards/:id/dates
router.patch('/:id/dates', authMiddleware, async (req, res) => {
  try {
    const { installed_date, last_checked } = req.body;
    const board = await boardRepo.updateDates(req.params.id, { installed_date, last_checked });
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    console.error('PATCH /boards/:id/dates:', err);
    res.status(500).json({ error: 'Failed to update dates' });
  }
});

// DELETE /api/boards/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await boardRepo.remove(req.params.id);
    res.json({ message: 'Board deleted' });
  } catch (err) {
    console.error('DELETE /boards/:id:', err);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

module.exports = router;

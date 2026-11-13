const router = require('express').Router();
const { speciesRepo } = require('../repositories');
const authMiddleware = require('../middleware/auth');

// Replace err.message with a generic message and log internally:
router.get('/', async (req, res) => {
  try {
    res.json(await speciesRepo.getAll());
  } catch (err) {
    console.error('Failed to get species:', err);
    res.status(500).json({ error: 'Failed to retrieve species' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const s = await speciesRepo.getById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Species not found' });
    res.json(s);
  } catch (err) {
    console.error('Failed to get species by ID:', err);
    res.status(500).json({ error: 'Failed to retrieve species' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const s = await speciesRepo.create(req.body);
    res.status(201).json(s);
  } catch (err) {
    console.error('Failed to create species:', err);
    res.status(500).json({ error: 'Failed to create species' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const s = await speciesRepo.update(req.params.id, req.body);
    res.json(s);
  } catch (err) {
    console.error('Species update error:', err);
    res.status(500).json({ error: 'Failed to update species' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await speciesRepo.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete species:', err);
    res.status(500).json({ error: 'Failed to delete species' });
  }
});

module.exports = router;

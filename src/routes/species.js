const router = require('express').Router();
const { speciesRepo } = require('../repositories');
const authMiddleware = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    res.json(await speciesRepo.getAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const s = await speciesRepo.getById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Species not found' });
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const s = await speciesRepo.create(req.body);
    res.status(201).json(s);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const s = await speciesRepo.update(req.params.id, req.body);
    res.json(s);
  } catch (err) {
    console.error('Species update error:', err.message); // ADD THIS
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await speciesRepo.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
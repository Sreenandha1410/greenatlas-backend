const router = require('express').Router();
const { areaRepo } = require('../repositories');

router.get('/', async (req, res) => {
  try {
    res.json(await areaRepo.getAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
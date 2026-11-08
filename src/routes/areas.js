const router = require('express').Router();
const { areaRepo } = require('../repositories');
const authMiddleware = require('../middleware/auth');

// GET /api/areas — list all areas
router.get('/', async (req, res) => {
  try {
    res.json(await areaRepo.getAll());
  } catch (err) {
    console.error('Failed to get areas:', err);
    res.status(500).json({ error: 'Failed to retrieve areas' });
  }
});

// GET /api/areas/:area/info — fetch metadata (image, description, navigation notes)
router.get('/:area/info', async (req, res) => {
  try {
    const area = await areaRepo.getByArea(req.params.area);
    if (!area) {
      return res.status(404).json({ error: 'Area not found' });
    }
    res.json({
      area: area.area,
      area_code: area.area_code,
      image_url: area.image_url || '',
      description: area.description || '',
      navigation_notes: area.navigation_notes || ''
    });
  } catch (err) {
    console.error('Failed to get area info:', err);
    res.status(500).json({ error: 'Failed to retrieve area info' });
  }
});

// PUT /api/areas/:area/info — update area metadata (admins only)
router.put('/:area/info', authMiddleware, async (req, res) => {
  try {
    const { image_url, description, navigation_notes } = req.body;
    const updated = await areaRepo.updateInfo(req.params.area, {
      image_url,
      description,
      navigation_notes
    });

    if (!updated) {
      return res.status(404).json({ error: 'Area not found' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Failed to update area info:', err);
    res.status(500).json({ error: 'Failed to update area info' });
  }
});

module.exports = router;

const router      = require('express').Router();
const QRCode      = require('qrcode');
const { Parser }  = require('json2csv');
const PDFDocument = require('pdfkit');
const { treeRepo }      = require('../repositories');
const authMiddleware     = require('../middleware/auth');
const { cloudinary, upload } = require('../config/cloudinary');

// GET /api/trees
router.get('/', async (req, res) => {
  try {
    const trees = await treeRepo.getAll(req.query);
    res.json(trees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trees/stats
router.get('/stats', async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const [trees, species, areas] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM trees'),
      pool.query('SELECT COUNT(*) FROM species'),
      pool.query('SELECT COUNT(*) FROM areas'),
    ]);
    res.json({
      trees:   parseInt(trees.rows[0].count),
      species: parseInt(species.rows[0].count),
      areas:   parseInt(areas.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trees/stats/detailed
router.get('/stats/detailed', authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const [byArea, byFamily, nativeExotic, conservation] = await Promise.all([
      pool.query('SELECT area, COUNT(*) as count FROM trees GROUP BY area ORDER BY count DESC'),
      pool.query('SELECT family, COUNT(*) as count FROM trees WHERE family IS NOT NULL GROUP BY family ORDER BY count DESC LIMIT 10'),
      pool.query('SELECT native_exotic, COUNT(*) as count FROM species WHERE native_exotic IS NOT NULL GROUP BY native_exotic'),
      pool.query('SELECT conservation_status, COUNT(*) as count FROM species WHERE conservation_status IS NOT NULL GROUP BY conservation_status ORDER BY count DESC'),
    ]);
    res.json({
      byArea:       byArea.rows.map(r => ({ ...r, count: parseInt(r.count) })),
      byFamily:     byFamily.rows.map(r => ({ ...r, count: parseInt(r.count) })),
      nativeExotic: nativeExotic.rows.map(r => ({ ...r, count: parseInt(r.count) })),
      conservation: conservation.rows.map(r => ({ ...r, count: parseInt(r.count) })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trees/export/csv
router.get('/export/csv', authMiddleware, async (req, res) => {
  try {
    const trees  = await treeRepo.getAll(req.query);
    const fields = ['tree_id','common_name','botanical_name','family','area','latitude','longitude','age','conservation_status'];
    const parser = new Parser({ fields });
    const csv    = parser.parse(trees);
    res.header('Content-Type', 'text/csv');
    res.attachment('campus_trees.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trees/export/pdf
router.get('/export/pdf', authMiddleware, async (req, res) => {
  try {
    const trees = await treeRepo.getAll(req.query);
    const doc   = new PDFDocument({ margin: 40, size: 'A4' });
    res.header('Content-Type', 'application/pdf');
    res.attachment('campus_trees.pdf');
    doc.pipe(res);

    doc.fontSize(18).fillColor('#2d5a27').text('Campus Tree Map — Tree List', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#888').text(`Total: ${trees.length} trees`, { align: 'center' });
    doc.moveDown();

    trees.forEach((t, i) => {
      if (doc.y > 720) doc.addPage();
      doc.fontSize(11).fillColor('#1a1a1a').text(`${i + 1}. ${t.common_name}`, { continued: true })
         .fillColor('#666').text(`  (${t.botanical_name})`);
      doc.fontSize(9).fillColor('#888')
         .text(`   Area: ${t.area}  |  Family: ${t.family}  |  ID: ${t.tree_id}`);
      doc.moveDown(0.3);
    });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trees/gallery  ← ADD HERE (before any /:id routes)
router.get('/gallery', async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const { rows } = await pool.query(`
      SELECT ti.image_url, ti.caption, ti.is_primary,
             t.tree_id, t.common_name, t.botanical_name, t.area
      FROM tree_images ti
      JOIN trees t ON ti.tree_id = t.tree_id
      ORDER BY ti.is_primary DESC, ti.id ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// POST /api/trees/views — record a visit
router.post('/views', async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const { path } = req.body;
    await pool.query('INSERT INTO page_views (path) VALUES ($1)', [path || '/']);
    const { rows } = await pool.query('SELECT COUNT(*) FROM page_views');
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trees/views — get total count
router.get('/views', async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const { rows } = await pool.query('SELECT COUNT(*) FROM page_views');
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trees/:id/nearby
router.get('/:id/nearby', async (req, res) => {
  try {
    const radius = parseInt(req.query.radius) || 100;
    const trees  = await treeRepo.getNearby(req.params.id, radius);
    res.json(trees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trees/:id/qr
router.get('/:id/qr', async (req, res) => {
  try {
    const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    const url = `${base}/trees/${req.params.id}`;
    const qr  = await QRCode.toDataURL(url, { width: 300, margin: 2 });
    res.json({ qr, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/images', async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const { rows } = await pool.query(
      'SELECT * FROM tree_images WHERE tree_id=$1 ORDER BY is_primary DESC, id ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/images', authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const { image_url, caption, is_primary } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO tree_images (tree_id, image_url, caption, is_primary) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, image_url, caption, is_primary || false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/images/:imgId', authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    await pool.query('DELETE FROM tree_images WHERE id=$1 AND tree_id=$2', [req.params.imgId, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'campus-trees' },
        (error, result) => error ? reject(error) : resolve(result)
      ).end(req.file.buffer);
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trees/:id
router.get('/:id', async (req, res) => {
  try {
    const tree = await treeRepo.getById(req.params.id);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trees
router.post('/', authMiddleware, async (req, res) => {
  try {
    const tree = await treeRepo.create(req.body);
    res.status(201).json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/trees/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const tree = await treeRepo.update(req.params.id, req.body);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trees/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await treeRepo.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

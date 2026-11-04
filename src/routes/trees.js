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


// Add these routes to backend/src/routes/trees.js.
// Keep existing imports: express router, Parser, treeRepo, authMiddleware.
// Remove the old PATCH /:id/location handler and paste this block BEFORE
// router.get('/:id', ...). This uses a transaction for update + history.

const actorLabel = req => {
  const u = req.user || {};
  return String(u.email || u.username || u.name || u.id || u.user_id || 'admin').slice(0, 255);
};
const validLatLng = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' &&
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

// Recent events across all trees.
router.get('/location-history/recent', authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const { rows } = await pool.query(
      `SELECT h.*, t.common_name, t.botanical_name, t.area
       FROM tree_location_history h
       LEFT JOIN trees t ON t.tree_id = h.tree_id
       ORDER BY h.created_at DESC, h.id DESC LIMIT $1`, [limit]);
    res.json({ updates: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unable to load recent location updates.' });
  }
});

// Export the complete audit log as CSV.
router.get('/location-history/export/csv', authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const { rows } = await pool.query(
      `SELECT h.id, h.tree_id, t.common_name, t.area, h.action,
              h.old_latitude, h.old_longitude, h.new_latitude, h.new_longitude,
              h.changed_by, h.reason, h.undo_of_id, h.reversed_by_id, h.created_at
       FROM tree_location_history h LEFT JOIN trees t ON t.tree_id=h.tree_id
       ORDER BY h.created_at DESC, h.id DESC`);
    const fields = ['id','tree_id','common_name','area','action','old_latitude',
      'old_longitude','new_latitude','new_longitude','changed_by','reason',
      'undo_of_id','reversed_by_id','created_at'];
    res.type('text/csv');
    res.attachment('greenatlas-location-history.csv');
    res.send(new Parser({ fields }).parse(rows));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unable to export location history.' });
  }
});

// History for one tree.
router.get('/:id/location-history', authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { rows } = await pool.query(
      `SELECT * FROM tree_location_history WHERE tree_id=$1
       ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]);
    res.json({ history: rows, limit, offset });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unable to load location history.' });
  }
});

// Replace the existing PATCH handler with this atomic update + audit insert.
router.patch('/:id/location', authMiddleware, async (req, res) => {
  const client = await require('../config/db').getPool().connect();
  try {
    const { latitude, longitude, reason } = req.body || {};
    if (!validLatLng(latitude, longitude))
      return res.status(400).json({ error: 'Invalid latitude or longitude.' });

    await client.query('BEGIN');
    const before = await client.query(
      'SELECT tree_id, latitude, longitude FROM trees WHERE tree_id=$1 FOR UPDATE',
      [req.params.id]);
    if (!before.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tree not found.' });
    }

    const old = before.rows[0];
    const oldLat = old.latitude == null ? null : Number(old.latitude);
    const oldLng = old.longitude == null ? null : Number(old.longitude);
    if (oldLat !== null && oldLng !== null &&
        Math.abs(oldLat-latitude) < 1e-10 && Math.abs(oldLng-longitude) < 1e-10) {
      await client.query('COMMIT');
      return res.json({ success: true, unchanged: true,
        tree: { ...old, latitude: oldLat, longitude: oldLng } });
    }

    const updated = await client.query(
      `UPDATE trees SET latitude=$1, longitude=$2
       WHERE tree_id=$3 RETURNING tree_id, latitude, longitude`,
      [latitude, longitude, req.params.id]);
    const logged = await client.query(
      `INSERT INTO tree_location_history
       (tree_id, old_latitude, old_longitude, new_latitude, new_longitude,
        changed_by, reason, action)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'UPDATE') RETURNING *`,
      [req.params.id, oldLat, oldLng, latitude, longitude, actorLabel(req),
       typeof reason === 'string' ? reason.trim().slice(0,500) || null : null]);
    await client.query('COMMIT');
    res.json({ success: true, tree: updated.rows[0], history: logged.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Location update failed:', e);
    res.status(500).json({ error: 'Failed to update tree location.' });
  } finally {
    client.release();
  }
});

// Undo the latest UPDATE event that has not already been reversed.
router.post('/:id/location/undo', authMiddleware, async (req, res) => {
  const client = await require('../config/db').getPool().connect();
  try {
    await client.query('BEGIN');
    const tree = await client.query(
      'SELECT tree_id, latitude, longitude FROM trees WHERE tree_id=$1 FOR UPDATE',
      [req.params.id]);
    if (!tree.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tree not found.' });
    }
    const prior = await client.query(
      `SELECT * FROM tree_location_history
       WHERE tree_id=$1 AND action='UPDATE' AND reversed_by_id IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [req.params.id]);
    if (!prior.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No saved location correction is available to undo.' });
    }
    const event = prior.rows[0];
    if (event.old_latitude == null || event.old_longitude == null) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'The previous coordinates were missing; this change cannot be undone automatically.' });
    }
    const current = tree.rows[0];
    const lat = Number(event.old_latitude);
    const lng = Number(event.old_longitude);
    const updated = await client.query(
      `UPDATE trees SET latitude=$1, longitude=$2
       WHERE tree_id=$3 RETURNING tree_id, latitude, longitude`,
      [lat, lng, req.params.id]);
    const undo = await client.query(
      `INSERT INTO tree_location_history
       (tree_id, old_latitude, old_longitude, new_latitude, new_longitude,
        changed_by, reason, action, undo_of_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'UNDO',$8) RETURNING *`,
      [req.params.id, current.latitude == null ? null : Number(current.latitude),
       current.longitude == null ? null : Number(current.longitude),
       lat, lng, actorLabel(req), `Undo of correction #${event.id}`, event.id]);
    await client.query(
      'UPDATE tree_location_history SET reversed_by_id=$1 WHERE id=$2',
      [undo.rows[0].id, event.id]);
    await client.query('COMMIT');
    res.json({ success: true, tree: updated.rows[0], undone: event, history: undo.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Location undo failed:', e);
    res.status(500).json({ error: 'Failed to undo tree location.' });
  } finally {
    client.release();
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


// PATCH /api/trees/:id/location
{/*
router.patch('/:id/location', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        error: 'Invalid latitude or longitude'
      });
    }

    const updated = await treeRepo.updateLocation(
      req.params.id,
      latitude,
      longitude
    );

    if (!updated) {
      return res.status(404).json({
        error: 'Tree not found'
      });
    }

    res.json({
      success: true,
      message: 'Tree location updated successfully',
      tree: updated
    });

  } catch (err) {
    console.error('Tree location update failed:', err);

    res.status(500).json({
      error: 'Failed to update tree location'
    });
  }
});*/}


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

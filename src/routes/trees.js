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
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/trees/stats
router.get('/stats', async (req, res) => {
  try {
    res.json(await treeRepo.getStats());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tree stats' });
  }
});
// GET /api/trees/stats/detailed
router.get('/stats/detailed', authMiddleware, async (req, res) => {
  try {
    res.json(await treeRepo.getDetailedStats());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch detailed stats' });
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
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
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
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/trees/gallery
router.get('/gallery', async (req, res) => {
  try {
    res.json(await treeRepo.getGallery());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});
// POST /api/trees/views
router.post('/views', async (req, res) => {
  try {
    const count = await treeRepo.recordView(req.body.path);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record page view' });
  }
});
// GET /api/trees/views
router.get('/views', async (req, res) => {
  try {
    const count = await treeRepo.getViewCount();
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch page views' });
  }
});

// GET /api/trees/:id/nearby
router.get('/:id/nearby', async (req, res) => {
  try {
    const radius = parseInt(req.query.radius) || 100;
    const trees  = await treeRepo.getNearby(req.params.id, radius);
    res.json(trees);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
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
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/images', async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const isPg = process.env.DB_TYPE !== 'mysql';
    const query = isPg 
      ? 'SELECT * FROM tree_images WHERE tree_id=$1 ORDER BY is_primary DESC, id ASC'
      : 'SELECT * FROM tree_images WHERE tree_id=? ORDER BY is_primary DESC, id ASC';
    const result = await pool.query(query, [req.params.id]);
    res.json(isPg ? result.rows : result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/images', authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const { image_url, caption, is_primary } = req.body;
    const isPg = process.env.DB_TYPE !== 'mysql';

    if (isPg) {
      const { rows } = await pool.query(
        'INSERT INTO tree_images (tree_id, image_url, caption, is_primary) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.params.id, image_url, caption, is_primary || false]
      );
      return res.status(201).json(rows[0]);
    } else {
      const [insertRes] = await pool.query(
        'INSERT INTO tree_images (tree_id, image_url, caption, is_primary) VALUES (?, ?, ?, ?)',
        [req.params.id, image_url, caption, is_primary ? 1 : 0]
      );
      const [rows] = await pool.query('SELECT * FROM tree_images WHERE id = ? LIMIT 1', [insertRes.insertId]);
      return res.status(201).json(rows[0]);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/images/:imgId', authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const isPg = process.env.DB_TYPE !== 'mysql';
    const query = isPg
      ? 'DELETE FROM tree_images WHERE id=$1 AND tree_id=$2'
      : 'DELETE FROM tree_images WHERE id=? AND tree_id=?';
    await pool.query(query, [req.params.imgId, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/upload', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'campus-trees' },
        (error, result) => {
          if (error) {
            console.error('Cloudinary stream error:', error);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      stream.end(req.file.buffer);
    });

    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('Upload handler error:', err);
    res.status(500).json({ error: err.message || 'Image upload failed' });
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
// Recent events across all trees.
router.get('/location-history/recent', authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const isPg = process.env.DB_TYPE !== 'mysql';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const query = isPg
      ? `SELECT h.*, t.common_name, t.botanical_name, t.area
         FROM tree_location_history h
         LEFT JOIN trees t ON t.tree_id = h.tree_id
         ORDER BY h.created_at DESC, h.id DESC LIMIT $1`
      : `SELECT h.*, t.common_name, t.botanical_name, t.area
         FROM tree_location_history h
         LEFT JOIN trees t ON t.tree_id = h.tree_id
         ORDER BY h.created_at DESC, h.id DESC LIMIT ?`;

    const result = await pool.query(query, [limit]);
    const rows = isPg ? result.rows : result[0];
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
    const isPg = process.env.DB_TYPE !== 'mysql';

    const result = await pool.query(
      `SELECT h.id, h.tree_id, t.common_name, t.area, h.action,
              h.old_latitude, h.old_longitude, h.new_latitude, h.new_longitude,
              h.changed_by, h.reason, h.undo_of_id, h.reversed_by_id, h.created_at
       FROM tree_location_history h LEFT JOIN trees t ON t.tree_id=h.tree_id
       ORDER BY h.created_at DESC, h.id DESC`
    );
    const rows = isPg ? result.rows : result[0];
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
    const isPg = process.env.DB_TYPE !== 'mysql';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const query = isPg
      ? `SELECT * FROM tree_location_history WHERE tree_id=$1
         ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`
      : `SELECT * FROM tree_location_history WHERE tree_id=?
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;

    const result = await pool.query(query, [req.params.id, limit, offset]);
    const rows = isPg ? result.rows : result[0];
    res.json({ history: rows, limit, offset });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unable to load location history.' });
  }
});

// Replace the existing PATCH handler with this atomic update + audit insert.
// PATCH /:id/location — atomic update + audit insert
router.patch('/:id/location', authMiddleware, async (req, res) => {
  const isPg = process.env.DB_TYPE !== 'mysql';
  const pool = require('../config/db').getPool();
  const conn = isPg ? await pool.connect() : await pool.getConnection();

  try {
    const { latitude, longitude, reason } = req.body || {};
    if (!validLatLng(latitude, longitude)) {
      return res.status(400).json({ error: 'Invalid latitude or longitude.' });
    }

    if (isPg) {
      await conn.query('BEGIN');
      const before = await conn.query(
        'SELECT tree_id, latitude, longitude FROM trees WHERE tree_id=$1 FOR UPDATE',
        [req.params.id]
      );
      if (!before.rowCount) {
        await conn.query('ROLLBACK');
        return res.status(404).json({ error: 'Tree not found.' });
      }

      const old = before.rows[0];
      const oldLat = old.latitude == null ? null : Number(old.latitude);
      const oldLng = old.longitude == null ? null : Number(old.longitude);

      if (oldLat !== null && oldLng !== null &&
          Math.abs(oldLat - latitude) < 1e-10 && Math.abs(oldLng - longitude) < 1e-10) {
        await conn.query('COMMIT');
        return res.json({ success: true, unchanged: true, tree: { ...old, latitude: oldLat, longitude: oldLng } });
      }

      const updated = await conn.query(
        `UPDATE trees SET latitude=$1, longitude=$2 WHERE tree_id=$3 RETURNING tree_id, latitude, longitude`,
        [latitude, longitude, req.params.id]
      );
      const logged = await conn.query(
        `INSERT INTO tree_location_history
         (tree_id, old_latitude, old_longitude, new_latitude, new_longitude, changed_by, reason, action)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'UPDATE') RETURNING *`,
        [req.params.id, oldLat, oldLng, latitude, longitude, actorLabel(req),
         typeof reason === 'string' ? reason.trim().slice(0, 500) || null : null]
      );
      await conn.query('COMMIT');
      return res.json({ success: true, tree: updated.rows[0], history: logged.rows[0] });

    } else {
      // MySQL Transaction
      await conn.beginTransaction();
      const [beforeRows] = await conn.query(
        'SELECT tree_id, latitude, longitude FROM trees WHERE tree_id=? FOR UPDATE',
        [req.params.id]
      );
      if (!beforeRows.length) {
        await conn.rollback();
        return res.status(404).json({ error: 'Tree not found.' });
      }

      const old = beforeRows[0];
      const oldLat = old.latitude == null ? null : Number(old.latitude);
      const oldLng = old.longitude == null ? null : Number(old.longitude);

      if (oldLat !== null && oldLng !== null &&
          Math.abs(oldLat - latitude) < 1e-10 && Math.abs(oldLng - longitude) < 1e-10) {
        await conn.commit();
        return res.json({ success: true, unchanged: true, tree: { ...old, latitude: oldLat, longitude: oldLng } });
      }

      await conn.query(
        `UPDATE trees SET latitude=?, longitude=? WHERE tree_id=?`,
        [latitude, longitude, req.params.id]
      );
      const [insertLog] = await conn.query(
        `INSERT INTO tree_location_history
         (tree_id, old_latitude, old_longitude, new_latitude, new_longitude, changed_by, reason, action)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'UPDATE')`,
        [req.params.id, oldLat, oldLng, latitude, longitude, actorLabel(req),
         typeof reason === 'string' ? reason.trim().slice(0, 500) || null : null]
      );

      const [updatedRows] = await conn.query('SELECT tree_id, latitude, longitude FROM trees WHERE tree_id=?', [req.params.id]);
      const [historyRows] = await conn.query('SELECT * FROM tree_location_history WHERE id=?', [insertLog.insertId]);

      await conn.commit();
      return res.json({ success: true, tree: updatedRows[0], history: historyRows[0] });
    }
  } catch (e) {
    if (isPg) await conn.query('ROLLBACK').catch(() => {});
    else await conn.rollback().catch(() => {});
    console.error('Location update failed:', e);
    res.status(500).json({ error: 'Failed to update tree location.' });
  } finally {
    conn.release();
  }
});

// POST /:id/location/undo
router.post('/:id/location/undo', authMiddleware, async (req, res) => {
  const isPg = process.env.DB_TYPE !== 'mysql';
  const pool = require('../config/db').getPool();
  const conn = isPg ? await pool.connect() : await pool.getConnection();

  try {
    if (isPg) {
      await conn.query('BEGIN');
      const tree = await conn.query('SELECT tree_id, latitude, longitude FROM trees WHERE tree_id=$1 FOR UPDATE', [req.params.id]);
      if (!tree.rowCount) {
        await conn.query('ROLLBACK');
        return res.status(404).json({ error: 'Tree not found.' });
      }

      const prior = await conn.query(
        `SELECT * FROM tree_location_history
         WHERE tree_id=$1 AND action='UPDATE' AND reversed_by_id IS NULL
         ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
        [req.params.id]
      );
      if (!prior.rowCount) {
        await conn.query('ROLLBACK');
        return res.status(409).json({ error: 'No saved location correction is available to undo.' });
      }

      const event = prior.rows[0];
      if (event.old_latitude == null || event.old_longitude == null) {
        await conn.query('ROLLBACK');
        return res.status(409).json({ error: 'The previous coordinates were missing; cannot undo automatically.' });
      }

      const current = tree.rows[0];
      const lat = Number(event.old_latitude);
      const lng = Number(event.old_longitude);

      const updated = await conn.query(
        `UPDATE trees SET latitude=$1, longitude=$2 WHERE tree_id=$3 RETURNING tree_id, latitude, longitude`,
        [lat, lng, req.params.id]
      );
      const undo = await conn.query(
        `INSERT INTO tree_location_history
         (tree_id, old_latitude, old_longitude, new_latitude, new_longitude, changed_by, reason, action, undo_of_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'UNDO',$8) RETURNING *`,
        [req.params.id, current.latitude == null ? null : Number(current.latitude),
         current.longitude == null ? null : Number(current.longitude),
         lat, lng, actorLabel(req), `Undo of correction #${event.id}`, event.id]
      );
      await conn.query('UPDATE tree_location_history SET reversed_by_id=$1 WHERE id=$2', [undo.rows[0].id, event.id]);
      await conn.query('COMMIT');
      return res.json({ success: true, tree: updated.rows[0], undone: event, history: undo.rows[0] });

    } else {
      // MySQL Transaction
      await conn.beginTransaction();
      const [treeRows] = await conn.query('SELECT tree_id, latitude, longitude FROM trees WHERE tree_id=? FOR UPDATE', [req.params.id]);
      if (!treeRows.length) {
        await conn.rollback();
        return res.status(404).json({ error: 'Tree not found.' });
      }

      const [priorRows] = await conn.query(
        `SELECT * FROM tree_location_history
         WHERE tree_id=? AND action='UPDATE' AND reversed_by_id IS NULL
         ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
        [req.params.id]
      );
      if (!priorRows.length) {
        await conn.rollback();
        return res.status(409).json({ error: 'No saved location correction is available to undo.' });
      }

      const event = priorRows[0];
      if (event.old_latitude == null || event.old_longitude == null) {
        await conn.rollback();
        return res.status(409).json({ error: 'The previous coordinates were missing; cannot undo automatically.' });
      }

      const current = treeRows[0];
      const lat = Number(event.old_latitude);
      const lng = Number(event.old_longitude);

      await conn.query(`UPDATE trees SET latitude=?, longitude=? WHERE tree_id=?`, [lat, lng, req.params.id]);
      const [undoLog] = await conn.query(
        `INSERT INTO tree_location_history
         (tree_id, old_latitude, old_longitude, new_latitude, new_longitude, changed_by, reason, action, undo_of_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'UNDO', ?)`,
        [req.params.id, current.latitude == null ? null : Number(current.latitude),
         current.longitude == null ? null : Number(current.longitude),
         lat, lng, actorLabel(req), `Undo of correction #${event.id}`, event.id]
      );

      await conn.query('UPDATE tree_location_history SET reversed_by_id=? WHERE id=?', [undoLog.insertId, event.id]);

      const [updatedRows] = await conn.query('SELECT tree_id, latitude, longitude FROM trees WHERE tree_id=?', [req.params.id]);
      const [historyRows] = await conn.query('SELECT * FROM tree_location_history WHERE id=?', [undoLog.insertId]);

      await conn.commit();
      return res.json({ success: true, tree: updatedRows[0], undone: event, history: historyRows[0] });
    }
  } catch (e) {
    if (isPg) await conn.query('ROLLBACK').catch(() => {});
    else await conn.rollback().catch(() => {});
    console.error('Location undo failed:', e);
    res.status(500).json({ error: 'Failed to undo tree location.' });
  } finally {
    conn.release();
  }
});


// GET /api/trees/:id
router.get('/:id', async (req, res) => {
  try {
    const tree = await treeRepo.getById(req.params.id);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    res.json(tree);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/trees
router.post('/', authMiddleware, async (req, res) => {
  try {
    const tree = await treeRepo.create(req.body);
    res.status(201).json(tree);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/trees/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const tree = await treeRepo.update(req.params.id, req.body);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    res.json(tree);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/trees/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await treeRepo.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

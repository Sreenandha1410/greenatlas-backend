const router = require('express').Router();

const authMiddleware = require('../middleware/auth');
const { cloudinary, upload } = require('../config/cloudinary');
const { getPool } = require('../config/db');


// =====================================================
// UPLOAD COMPLAINT IMAGE
// POST /api/complaints/upload
// =====================================================

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No image provided'
      });
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'green-atlas/complaints'
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      ).end(req.file.buffer);
    });

    res.json({
      url: result.secure_url
    });

  } catch (err) {
    console.error('Complaint image upload error:', err);

    res.status(500).json({
      error: 'Image upload failed'
    });
  }
});


// =====================================================
// SUBMIT COMPLAINT
// POST /api/complaints
// =====================================================

router.post('/', async (req, res) => {
  try {

    const {
      student_name,
      department,
      tree_id,
      tree_name,
      tree_area,
      issue_type,
      description,
      image_url
    } = req.body;

    if (
      !student_name ||
      !department ||
      !tree_id ||
      !issue_type
    ) {
      return res.status(400).json({
        error: 'Please fill all required fields'
      });
    }

    const pool = getPool();

    const { rows } = await pool.query(
      `
      INSERT INTO complaints
      (
        student_name,
        department,
        tree_id,
        tree_name,
        tree_area,
        issue_type,
        description,
        image_url,
        status
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,'Pending')
      RETURNING *
      `,
      [
        student_name,
        department,
        tree_id,
        tree_name || null,
        tree_area || null,
        issue_type,
        description || null,
        image_url || null
      ]
    );

    res.status(201).json(rows[0]);

  } catch (err) {

    console.error('Complaint submit error:', err);

    res.status(500).json({
      error: 'Failed to submit complaint'
    });
  }
});


// =====================================================
// GET ALL COMPLAINTS
// GET /api/complaints
// =====================================================

router.get('/', authMiddleware, async (req, res) => {
  try {

    const pool = getPool();

    const { rows } = await pool.query(
      `
      SELECT *
      FROM complaints
      ORDER BY created_at DESC
      `
    );

    res.json(rows);

  } catch (err) {

    console.error('Get complaints error:', err);

    res.status(500).json({
      error: 'Failed to fetch complaints'
    });
  }
});


// =====================================================
// UPDATE COMPLAINT STATUS
// PUT /api/complaints/:id/status
// =====================================================

router.put('/:id/status', authMiddleware, async (req, res) => {
  try {

    const {
      status,
      admin_notes
    } = req.body;

    const allowedStatuses = [
      'Pending',
      'In Progress',
      'Resolved'
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status'
      });
    }

    const pool = getPool();

    const { rows } = await pool.query(
      `
      UPDATE complaints
      SET
        status = $1,
        admin_notes = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
      `,
      [
        status,
        admin_notes || null,
        req.params.id
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Complaint not found'
      });
    }

    res.json(rows[0]);

  } catch (err) {

    console.error('Update complaint error:', err);

    res.status(500).json({
      error: 'Failed to update complaint'
    });
  }
});


module.exports = router;

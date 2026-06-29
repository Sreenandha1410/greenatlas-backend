require('dotenv').config();
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const pool = new Pool({
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  host:     process.env.PG_HOST,
  port:     process.env.PG_PORT,
  database: process.env.PG_DATABASE,
});

// Convert Google Drive view URL to direct download URL
const toDirect = (url) => {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return url;
  return `https://drive.google.com/uc?export=download&id=${match[1]}`;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function migrate() {
  const { rows: trees } = await pool.query(
    'SELECT tree_id, image_link FROM trees WHERE image_link IS NOT NULL'
  );

  console.log(`Found ${trees.length} trees with image links`);
  let success = 0, failed = 0;

  for (const tree of trees) {
    const directUrl = toDirect(tree.image_link);
    if (!directUrl) { failed++; continue; }

    try {
      // Upload directly from URL to Cloudinary
      const result = await cloudinary.uploader.upload(directUrl, {
        folder:         'campus-trees',
        public_id:      `tree-${tree.tree_id}`,
        overwrite:      true,
        transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }]
      });

      // Insert into tree_images as primary image
      await pool.query(
        `INSERT INTO tree_images (tree_id, image_url, caption, is_primary)
         VALUES ($1, $2, $3, true)
         ON CONFLICT DO NOTHING`,
        [tree.tree_id, result.secure_url, 'Primary photo']
      );

      success++;
      console.log(`✅ ${tree.tree_id} — ${success}/${trees.length}`);
    } catch (err) {
      failed++;
      console.log(`❌ ${tree.tree_id} — ${err.message}`);
    }

    // Wait 300ms between uploads to avoid rate limiting
    await sleep(300);
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
  await pool.end();
}

migrate();
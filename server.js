const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public')); // Frontend files ke liye

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- CORE LOGIC: RESEARCH ID GENERATOR ---
async function generateNewID() {
  const prefix = "10.1001";
  const result = await pool.query("SELECT COUNT(*) FROM identifiers");
  const count = parseInt(result.rows[0].count) + 1;
  const suffix = String(count).padStart(6, '0');
  return `${prefix}/RE${suffix}`;
}

// --- API: MINT/ISSUE NEW ID (Selling API) ---
app.post('/api/mint', async (req, res) => {
  const { apiKey, targetUrl, title } = req.body;
  try {
    const client = await pool.query("SELECT * FROM clients WHERE api_key = $1", [apiKey]);
    if (client.rows.length === 0 || client.rows[0].balance <= 0) {
      return res.status(403).json({ error: "Invalid Key or No Balance" });
    }

    const researchID = await generateNewID();
    await pool.query('BEGIN');
    await pool.query(
      "INSERT INTO identifiers (identifier, target_url, client_id, metadata) VALUES ($1, $2, $3, $4)",
      [researchID, targetUrl, client.rows[0].id, { title }]
    );
    await pool.query("UPDATE clients SET balance = balance - 1 WHERE id = $1", [client.rows[0].id]);
    await pool.query('COMMIT');

    res.json({ success: true, identifier: researchID });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// --- THE RESOLVER (Public Redirect) ---
app.get('/id/:p1/:p2', async (req, res) => {
  const fullID = `${req.params.p1}/${req.params.p2}`;
  const result = await pool.query("SELECT target_url FROM identifiers WHERE identifier = $1", [fullID]);
  if (result.rows.length === 0) return res.status(404).send("ResearchID Not Found");
  res.redirect(result.rows[0].target_url);
});

// --- ADMIN API: GET SYSTEM STATS ---
app.get('/api/admin/stats', async (req, res) => {
  const clients = await pool.query("SELECT name, balance FROM clients");
  const ids = await pool.query("SELECT COUNT(*) FROM identifiers");
  res.json({ total_ids: ids.rows[0].count, clients: clients.rows });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ResearchID System running on port ${PORT}`));

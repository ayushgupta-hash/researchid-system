const express = require('express');
const { Pool } = require('pg');
const { customAlphabet } = require('nanoid');
require('dotenv').config();

const app = express();
app.use(express.json());

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ResearchID Generator (10.1001/RE-XXXXX)
const nanoid = customAlphabet('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

// API: Register/Mint a new ResearchID (For Clients)
app.post('/mint', async (req, res) => {
  const { apiKey, targetUrl, metadata } = req.body;

  try {
    // 1. Check Client & Balance
    const client = await pool.query("SELECT * FROM clients WHERE api_key = $1", [apiKey]);
    if (client.rows.length === 0 || client.rows[0].balance <= 0) {
      return res.status(403).json({ error: "Invalid Key or No Balance" });
    }

    // 2. Generate Unique ResearchID
    const researchID = `10.1001/RE-${nanoid()}`;

    // 3. Save to Registry & Update Balance
    await pool.query('BEGIN');
    await pool.query(
      "INSERT INTO identifiers (identifier, target_url, client_id, metadata) VALUES ($1, $2, $3, $4)",
      [researchID, targetUrl, client.rows[0].id, metadata]
    );
    await pool.query("UPDATE clients SET balance = balance - 1 WHERE id = $1", [client.rows[0].id]);
    await pool.query('COMMIT');

    res.json({ success: true, identifier: researchID });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// API: Resolver (The Public Link)
app.get('/id/:prefix/:suffix', async (req, res) => {
  const fullID = `${req.params.prefix}/${req.params.suffix}`;
  const result = await pool.query("SELECT target_url FROM identifiers WHERE identifier = $1", [fullID]);

  if (result.rows.length === 0) return res.status(404).send("ResearchID not found.");
  res.redirect(result.rows[0].target_url);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ResearchID System Live on port ${PORT}`));

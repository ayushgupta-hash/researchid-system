const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ID Generator Function
async function generateResearchID() {
  const result = await pool.query("SELECT COUNT(*) FROM identifiers");
  const count = parseInt(result.rows[0].count) + 1;
  return `10.1001/RE${String(count).padStart(6, '0')}`;
}

// 1. API: Stats & Client List
app.get('/api/admin/stats', async (req, res) => {
  try {
    const clients = await pool.query("SELECT * FROM clients ORDER BY id DESC");
    const total = await pool.query("SELECT COUNT(*) FROM identifiers");
    res.json({ total: total.rows[0].count, clients: clients.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. API: Add New Client (Journal)
app.post('/api/admin/add-client', async (req, res) => {
  const { name, apiKey, balance } = req.body;
  try {
    await pool.query("INSERT INTO clients (name, api_key, balance) VALUES ($1, $2, $3)", [name, apiKey, balance]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Key already exists or DB error" }); }
});

// 3. API: Mint (Generate) ID
app.post('/api/mint', async (req, res) => {
  const { apiKey, targetUrl, title } = req.body;
  try {
    const client = await pool.query("SELECT * FROM clients WHERE api_key = $1", [apiKey]);
    if (client.rows.length === 0 || client.rows[0].balance <= 0) {
      return res.status(403).json({ error: "Invalid Key or No Balance" });
    }
    const newID = await generateResearchID();
    await pool.query('BEGIN');
    await pool.query("INSERT INTO identifiers (identifier, target_url, client_id, metadata) VALUES ($1, $2, $3, $4)", 
                    [newID, targetUrl, client.rows[0].id, { title }]);
    await pool.query("UPDATE clients SET balance = balance - 1 WHERE id = $1", [client.rows[0].id]);
    await pool.query('COMMIT');
    res.json({ success: true, researchID: newID });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// 4. The Resolver (Public Redirect)
app.get('/id/:p1/:p2', async (req, res) => {
  const fullID = `${req.params.p1}/${req.params.p2}`;
  const result = await pool.query("SELECT target_url FROM identifiers WHERE identifier = $1", [fullID]);
  if (result.rows.length === 0) return res.status(404).send("<h1>404</h1><p>ResearchID Not Found</p>");
  res.redirect(result.rows[0].target_url);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Professional Agency System Live!"));

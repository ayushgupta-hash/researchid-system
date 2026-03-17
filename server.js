const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(session({ secret: 're-secret-key', resave: false, saveUninitialized: true }));

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});

// --- ADMIN STATS (Table load karne ke liye) ---
app.get('/api/admin/stats', async (req, res) => {
    try {
        const clients = await pool.query("SELECT * FROM clients ORDER BY id DESC");
        const total = await pool.query("SELECT COUNT(*) FROM identifiers");
        res.json({ total: total.rows[0].count, clients: clients.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADD CLIENT BUTTON LOGIC ---
app.post('/api/admin/add-client', async (req, res) => {
    const { name, apiKey, balance } = req.body;
    try {
        await pool.query("INSERT INTO clients (name, api_key, balance) VALUES ($1, $2, $3)", [name, apiKey, balance]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "API Key already exists or DB Error" });
    }
});

// --- MINT ID BUTTON LOGIC ---
app.post('/api/mint', async (req, res) => {
    const { apiKey, targetUrl, title } = req.body;
    try {
        const client = await pool.query("SELECT * FROM clients WHERE api_key = $1", [apiKey]);
        
        if(client.rows.length > 0 && parseInt(client.rows[0].balance) > 0) {
            const idCount = await pool.query("SELECT COUNT(*) FROM identifiers");
            const newID = `10.1001/RE${String(parseInt(idCount.rows[0].count) + 1).padStart(6, '0')}`;
            
            await pool.query('BEGIN');
            await pool.query("INSERT INTO identifiers (identifier, target_url, client_id, metadata) VALUES ($1, $2, $3, $4)", 
                            [newID, targetUrl, client.rows[0].id, {title}]);
            await pool.query("UPDATE clients SET balance = balance - 1 WHERE id = $1", [client.rows[0].id]);
            await pool.query('COMMIT');
            
            res.json({ success: true, researchID: newID });
        } else {
            res.status(403).json({ error: "Invalid Key or No Balance Left" });
        }
    } catch (err) {
        if(pool) await pool.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// --- RESOLVER (Link chalane ke liye) ---
app.get('/id/:p1/:p2', async (req, res) => {
    const fullID = `${req.params.p1}/${req.params.p2}`;
    try {
        const result = await pool.query("SELECT target_url FROM identifiers WHERE identifier = $1", [fullID]);
        if(result.rows.length > 0) res.redirect(result.rows[0].target_url);
        else res.status(404).send("ResearchID Not Found");
    } catch (err) {
        res.status(500).send("Database Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

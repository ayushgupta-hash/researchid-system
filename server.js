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

// --- AUTOMATIC TABLE CREATION (Free Tier ke liye solution) ---
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                api_key TEXT UNIQUE NOT NULL,
                balance INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS identifiers (
                id SERIAL PRIMARY KEY,
                identifier TEXT UNIQUE NOT NULL,
                target_url TEXT NOT NULL,
                client_id INTEGER REFERENCES clients(id),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Database Tables Ready!");
    } catch (err) {
        console.error("DB Init Error:", err);
    }
};
initDB();

// --- LOGIN API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if(username === 'admin' && password === 'admin123') { 
        req.session.isLoggedIn = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

// --- ADMIN STATS ---
app.get('/api/admin/stats', async (req, res) => {
    try {
        const clients = await pool.query("SELECT * FROM clients ORDER BY id DESC");
        const total = await pool.query("SELECT COUNT(*) FROM identifiers");
        res.json({ total: total.rows[0].count, clients: clients.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADD CLIENT ---
app.post('/api/admin/add-client', async (req, res) => {
    const { name, apiKey, balance } = req.body;
    try {
        await pool.query("INSERT INTO clients (name, api_key, balance) VALUES ($1, $2, $3)", [name, apiKey, balance]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- MINT ID ---
app.post('/api/mint', async (req, res) => {
    const { apiKey, targetUrl, title } = req.body;
    try {
        const client = await pool.query("SELECT * FROM clients WHERE api_key = $1", [apiKey]);
        if(client.rows.length > 0 && client.rows[0].balance > 0) {
            const countRes = await pool.query("SELECT COUNT(*) FROM identifiers");
            const newID = `10.1001/RE${String(parseInt(countRes.rows[0].count) + 1).padStart(6, '0')}`;
            await pool.query("INSERT INTO identifiers (identifier, target_url, client_id, metadata) VALUES ($1, $2, $3, $4)", 
                            [newID, targetUrl, client.rows[0].id, {title}]);
            await pool.query("UPDATE clients SET balance = balance - 1 WHERE id = $1", [client.rows[0].id]);
            res.json({ success: true, researchID: newID });
        } else {
            res.status(400).json({ error: "Invalid Key or No Balance" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- RESOLVER ---
app.get('/id/:p1/:p2', async (req, res) => {
    const fullID = `${req.params.p1}/${req.params.p2}`;
    const result = await pool.query("SELECT target_url FROM identifiers WHERE identifier = $1", [fullID]);
    if(result.rows.length > 0) res.redirect(result.rows[0].target_url);
    else res.status(404).send("Not Found");
});

app.listen(process.env.PORT || 3000);

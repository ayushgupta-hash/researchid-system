const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();

// --- 1. MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session management
app.use(session({
    secret: 'research-edge-secret-7788',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Free Render tier ke liye false rakhein
}));

// --- 2. DATABASE CONNECTION ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- 3. AUTO DATABASE INITIALIZATION ---
const initDB = async () => {
    try {
        // Table: Clients (Journals)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                api_key TEXT UNIQUE NOT NULL,
                balance INTEGER DEFAULT 0
            );
        `);
        // Table: Identifiers (ResearchIDs)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS identifiers (
                id SERIAL PRIMARY KEY,
                identifier TEXT UNIQUE NOT NULL,
                target_url TEXT NOT NULL,
                client_id INTEGER REFERENCES clients(id),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Database Tables Verified & Ready!");
    } catch (err) {
        console.error("❌ DB Init Error:", err);
    }
};
initDB();

// --- 4. AUTHENTICATION ROUTES ---

// Login API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Aap yahan password badal sakte hain
    if (username === 'admin' && password === 'admin123') {
        req.session.isLoggedIn = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "Invalid Credentials" });
    }
});

// Logout API
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// --- 5. PAGE ROUTES (Fixing "Cannot GET /dashboard") ---

app.get('/dashboard', (req, res) => {
    if (req.session.isLoggedIn) {
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } else {
        res.redirect('/login.html');
    }
});

// --- 6. ADMIN API ROUTES ---

// Get Stats and Client List
app.get('/api/admin/stats', async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).send("Unauthorized");
    try {
        const clients = await pool.query("SELECT * FROM clients ORDER BY id DESC");
        const total = await pool.query("SELECT COUNT(*) FROM identifiers");
        res.json({ 
            total: total.rows[0].count, 
            clients: clients.rows 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add New Client/Journal
app.post('/api/admin/add-client', async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).send("Unauthorized");
    const { name, apiKey, balance } = req.body;
    try {
        await pool.query(
            "INSERT INTO clients (name, api_key, balance) VALUES ($1, $2, $3)", 
            [name, apiKey, balance]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "API Key already exists or DB Error" });
    }
});

// --- 7. MINTING LOGIC (The Core Business) ---

app.post('/api/mint', async (req, res) => {
    const { apiKey, targetUrl, title } = req.body;
    try {
        // Check if client exists and has balance
        const clientRes = await pool.query("SELECT * FROM clients WHERE api_key = $1", [apiKey]);
        const client = clientRes.rows[0];

        if (client && parseInt(client.balance) > 0) {
            const countRes = await pool.query("SELECT COUNT(*) FROM identifiers");
            const nextNum = parseInt(countRes.rows[0].count) + 1;
            const newID = `10.1001/RE${String(nextNum).padStart(6, '0')}`;

            // Atomic Transaction
            await pool.query('BEGIN');
            await pool.query(
                "INSERT INTO identifiers (identifier, target_url, client_id, metadata) VALUES ($1, $2, $3, $4)",
                [newID, targetUrl, client.id, JSON.stringify({ title })]
            );
            await pool.query("UPDATE clients SET balance = balance - 1 WHERE id = $1", [client.id]);
            await pool.query('COMMIT');

            res.json({ success: true, researchID: newID });
        } else {
            res.status(403).json({ error: "Insufficient Balance or Invalid API Key" });
        }
    } catch (err) {
        if (pool) await pool.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// --- 8. PUBLIC RESOLVER (Redirects the ResearchID) ---

app.get('/id/:prefix/:suffix', async (req, res) => {
    const fullID = `${req.params.prefix}/${req.params.suffix}`;
    try {
        const result = await pool.query("SELECT target_url FROM identifiers WHERE identifier = $1", [fullID]);
        if (result.rows.length > 0) {
            res.redirect(result.rows[0].target_url);
        } else {
            res.status(404).send(`
                <body style="font-family:sans-serif; text-align:center; padding:50px;">
                    <h1>404 - ResearchID Not Found</h1>
                    <p>The identifier ${fullID} is not registered in our system.</p>
                    <a href="/">Back to Home</a>
                </body>
            `);
        }
    } catch (err) {
        res.status(500).send("Database Error");
    }
});

// --- 9. SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 RE Agency Server running on port ${PORT}`);
});

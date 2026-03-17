const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();

// --- 1. CONFIGURATION & MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Secure Session Management
app.use(session({
    secret: 'research-edge-mega-secret-2024',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 Hours
        secure: false // Set to true if using HTTPS
    }
}));

// --- 2. DATABASE CONNECTION ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- 3. DATABASE INITIALIZATION (Auto-Migrate) ---
const initDB = async () => {
    console.log("⏳ Initializing Database...");
    try {
        const clientTable = `
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                api_key TEXT UNIQUE NOT NULL,
                balance INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`;

        const idTable = `
            CREATE TABLE IF NOT EXISTS identifiers (
                id SERIAL PRIMARY KEY,
                identifier TEXT UNIQUE NOT NULL,
                target_url TEXT NOT NULL,
                client_id INTEGER REFERENCES clients(id),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`;

        await pool.query(clientTable);
        await pool.query(idTable);
        console.log("✅ Database Tables Verified & Ready.");
    } catch (err) {
        console.error("❌ Database Init Error:", err.message);
    }
};
initDB();

// --- 4. AUTHENTICATION HELPERS ---
const requireLogin = (req, res, next) => {
    if (req.session.isLoggedIn) {
        next();
    } else {
        if (req.path.startsWith('/api/')) {
            res.status(401).json({ error: "Unauthorized Access" });
        } else {
            res.redirect('/login.html');
        }
    }
};

// --- 5. PAGE NAVIGATION ROUTES ---

app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

app.get('/dashboard', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/journals', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'journals.html'));
});

app.get('/identifiers', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'identifiers.html'));
});

app.get('/journal-detail', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'journal-detail.html'));
});

app.get('/billing', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'billing.html'));
});

// --- 6. AUTHENTICATION APIS ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Hardcoded for now, can be moved to DB later
    if (username === 'admin' && password === 'admin123') {
        req.session.isLoggedIn = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// --- 7. ADMIN MANAGEMENT APIS ---

// Get Overview Stats
app.get('/api/admin/stats', requireLogin, async (req, res) => {
    try {
        const clients = await pool.query("SELECT * FROM clients ORDER BY id DESC");
        const totalIds = await pool.query("SELECT COUNT(*) FROM identifiers");
        res.json({ 
            total: totalIds.rows[0].count, 
            clients: clients.rows 
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

// --- 7. ADMIN MANAGEMENT APIS ---

// 1. Dashboard Stats
app.get('/api/admin/stats', requireLogin, async (req, res) => {
    try {
        const clients = await pool.query("SELECT * FROM clients ORDER BY id DESC");
        const totalIds = await pool.query("SELECT COUNT(*) FROM identifiers");
        res.json({ total: totalIds.rows[0].count, clients: clients.rows });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

// >>> YAHAN PASTE KAREIN (NEW CODE) <<<

// 2. Get Global Identifiers List (For Identifiers Page)
app.get('/api/admin/all-ids', requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT i.*, c.name as journal_name 
            FROM identifiers i 
            JOIN clients c ON i.client_id = c.id 
            ORDER BY i.created_at DESC`);
        res.json(result.rows);
    } catch (err) {
        console.error("Database Error:", err.message);
        res.status(500).json({ error: "Database error" });
    }
});

// 3. Get Specific Journal Detail (For Journal Detail Page)
app.get('/api/admin/journal-history/:id', requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT i.*, c.name as journal_name 
            FROM identifiers i 
            JOIN clients c ON i.client_id = c.id 
            WHERE i.client_id = $1 
            ORDER BY i.created_at DESC`, [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// >>> PASTE KHATAM <<<

// 4. Add a New Journal Client (Pehle se hoga aapke paas)
app.post('/api/admin/add-client', requireLogin, async (req, res) => {
    // ... aapka purana code
});

// Add a New Journal Client
app.post('/api/admin/add-client', requireLogin, async (req, res) => {
    const { name, apiKey, balance } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO clients (name, api_key, balance) VALUES ($1, $2, $3) RETURNING *",
            [name, apiKey, balance || 0]
        );
        res.json({ success: true, client: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: "Duplicate API Key or Database Error" });
    }
});

// Credit Top-up System
app.post('/api/admin/topup', requireLogin, async (req, res) => {
    const { clientId, amount } = req.body;
    try {
        await pool.query(
            "UPDATE clients SET balance = balance + $1 WHERE id = $2",
            [amount, clientId]
        );
        res.json({ success: true, message: "Credits Added Successfully" });
    } catch (err) {
        res.status(500).json({ error: "Top-up failed" });
    }
});

// --- 8. RESEARCH ID CORE LOGIC (MINTING) ---

app.post('/api/mint', async (req, res) => {
    const { apiKey, targetUrl, title } = req.body;
    
    if (!apiKey || !targetUrl) {
        return res.status(400).json({ error: "API Key and Target URL are required" });
    }

    try {
        // 1. Verify Client
        const clientCheck = await pool.query("SELECT * FROM clients WHERE api_key = $1", [apiKey]);
        const client = clientCheck.rows[0];

        if (!client) return res.status(403).json({ error: "Invalid API Key" });
        if (parseInt(client.balance) <= 0) return res.status(403).json({ error: "Insufficient Credits" });

        // 2. Generate New Unique ID
        const countRes = await pool.query("SELECT COUNT(*) FROM identifiers");
        const newSerial = parseInt(countRes.rows[0].count) + 1;
        const researchID = `10.1001/RE${String(newSerial).padStart(6, '0')}`;

        // 3. Database Transaction (Atomic)
        await pool.query('BEGIN');
        
        await pool.query(
            "INSERT INTO identifiers (identifier, target_url, client_id, metadata) VALUES ($1, $2, $3, $4)",
            [researchID, targetUrl, client.id, JSON.stringify({ title, date: new Date() })]
        );

        await pool.query(
            "UPDATE clients SET balance = balance - 1 WHERE id = $1",
            [client.id]
        );

        await pool.query('COMMIT');

        res.json({ success: true, researchID: researchID });

    } catch (err) {
        if (pool) await pool.query('ROLLBACK');
        console.error("Minting Error:", err);
        res.status(500).json({ error: "Internal Server Error during minting" });
    }
});

// --- 9. PUBLIC RESOLVER (THE LINK HANDLER) ---

app.get('/id/:prefix/:suffix', async (req, res) => {
    const fullID = `${req.params.prefix}/${req.params.suffix}`;
    try {
        const result = await pool.query(
            "SELECT target_url FROM identifiers WHERE identifier = $1", 
            [fullID]
        );

        if (result.rows.length > 0) {
            // Redirect to the actual research paper
            res.redirect(result.rows[0].target_url);
        } else {
            res.status(404).send(`
                <div style="text-align:center; margin-top:100px; font-family:sans-serif;">
                    <h1 style="color:#d93025;">404 - ResearchID Not Found</h1>
                    <p>The ID <b>${fullID}</b> is not registered in the RE Agency database.</p>
                    <hr style="width:200px;">
                    <p><small>Powered by Research Edge Agency</small></p>
                </div>
            `);
        }
    } catch (err) {
        res.status(500).send("System Resolver Error");
    }
});

// --- 10. SERVER BOOT ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    🚀============================================🚀
       SERVER RUNNING ON PORT: ${PORT}
       DATABASE: POSTGRESQL (CONNECTED)
       MODE: PRODUCTION / MODULAR
    🚀============================================🚀
    `);
});

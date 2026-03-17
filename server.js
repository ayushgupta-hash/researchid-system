const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Form data handle karne ke liye
app.use(express.static('public'));

// Session setup
app.use(session({ 
    secret: 're-secret-key', 
    resave: false, 
    saveUninitialized: true,
    cookie: { secure: false } // Render HTTPs par ise handle kar lega
}));

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});

// --- 1. LOGIN API (Yeh missing tha) ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Aap yahan apna pasandida password set kar sakte hain
    if(username === 'admin' && password === 'admin123') { 
        req.session.isLoggedIn = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
    }
});

// --- 2. AUTH MIDDLEWARE (Security ke liye) ---
const checkAuth = (req, res, next) => {
    if(req.session.isLoggedIn) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
};

// Dashboard access
app.get('/dashboard', (req, res) => {
    if(req.session.isLoggedIn) {
        res.sendFile(__dirname + '/public/dashboard.html');
    } else {
        res.redirect('/login.html');
    }
});

// --- 3. ADMIN STATS (Data Fetching) ---
app.get('/api/admin/stats', async (req, res) => {
    try {
        const clients = await pool.query("SELECT * FROM clients ORDER BY id DESC");
        const total = await pool.query("SELECT COUNT(*) FROM identifiers");
        res.json({ total: total.rows[0].count, clients: clients.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 4. ADD CLIENT LOGIC ---
app.post('/api/admin/add-client', async (req, res) => {
    const { name, apiKey, balance } = req.body;
    try {
        await pool.query("INSERT INTO clients (name, api_key, balance) VALUES ($1, $2, $3)", [name, apiKey, balance]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "DB Error: " + err.message });
    }
});

// --- 5. MINT ID LOGIC ---
app.post('/api/mint', async (req, res) => {
    const { apiKey, targetUrl, title } = req.body;
    try {
        const client = await pool.query("SELECT * FROM clients WHERE api_key = $1", [apiKey]);
        
        if(client.rows.length > 0 && parseInt(client.rows[0].balance) > 0) {
            const idCount = await pool.query("SELECT COUNT(*) FROM identifiers");
            const newID = `10.1001/RE${String(parseInt(idCount.rows[0].count) + 1).padStart(6, '0')}`;
            
            await pool.query('BEGIN');
            await pool.query("INSERT INTO identifiers (identifier, target_url, client_id, metadata) VALUES ($1, $2, $3, $4)", 
                            [newID, targetUrl, client.rows[0].id, JSON.stringify({title})]);
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

// --- 6. RESOLVER (Public Link) ---
app.get('/id/:p1/:p2', async (req, res) => {
    const fullID = `${req.params.p1}/${req.params.p2}`;
    try {
        const result = await pool.query("SELECT target_url FROM identifiers WHERE identifier = $1", [fullID]);
        if(result.rows.length > 0) {
            res.redirect(result.rows[0].target_url);
        } else {
            res.status(404).send("<h1>ResearchID Not Found</h1>");
        }
    } catch (err) {
        res.status(500).send("Database Error");
    }
});

// Logout logic
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Login Session Setup
app.use(session({
  secret: 'research-edge-secret',
  resave: false,
  saveUninitialized: true
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// LOGIN LOGIC
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  // Abhi ke liye simple admin login (Aap ise DB se bhi connect kar sakte hain)
  if (username === 'admin' && password === 'admin123') {
    req.session.user = 'admin';
    return res.json({ success: true, role: 'admin' });
  }
  res.status(401).json({ success: false, message: 'Invalid Credentials' });
});

// Middleware to check login
const checkAuth = (req, res, next) => {
  if (req.session.user) next();
  else res.redirect('/login.html');
};

// Protected Dashboard Route
app.get('/dashboard', checkAuth, (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// ... Baki Minting aur Resolver logic wahi rahega ...

app.listen(3000, () => console.log("Professional System with Login Live!"));

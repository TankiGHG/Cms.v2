require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const basicAuth = require('express-basic-auth');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS gigs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                location TEXT NOT NULL,
                genre TEXT,
                ticket_link TEXT
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS mixes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                soundcloud_url TEXT NOT NULL,
                release_date TEXT
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                event_details TEXT,
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    });
}

// Mailer setup
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: false, // true for 465, false for other ports
    requireTLS: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Basic Auth setup for /api/admin
const adminUsers = {};
adminUsers[process.env.ADMIN_USER] = process.env.ADMIN_PASS;

const adminAuth = basicAuth({
    users: adminUsers,
    challenge: true,
    unauthorizedResponse: 'Unauthorized Access'
});

// --- PUBLIC API ROUTES ---

// Get future gigs
app.get('/api/gigs', (req, res) => {
    // In a real app, you might filter by date >= current date. For simplicity we order by date.
    const query = `SELECT * FROM gigs ORDER BY date ASC`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get mixes
app.get('/api/mixes', (req, res) => {
    const query = `SELECT * FROM mixes ORDER BY release_date DESC`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Submit a booking
app.post('/api/booking', (req, res) => {
    const { name, email, event_details, message } = req.body;

    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required.' });
    }

    // Save to DB
    const insertQuery = `INSERT INTO bookings (name, email, event_details, message) VALUES (?, ?, ?, ?)`;
    db.run(insertQuery, [name, email, event_details, message], function(err) {
        if (err) {
            console.error('Error saving booking:', err.message);
            return res.status(500).json({ error: 'Failed to save booking.' });
        }

        // Send email
        const mailOptions = {
            from: process.env.SMTP_FROM,
            to: process.env.SMTP_TO,
            replyTo: email,
            subject: `New Booking Request from ${name}`,
            text: `
You have received a new booking request.

Name: ${name}
Email: ${email}
Event Details: ${event_details || 'N/A'}

Message:
${message || 'N/A'}
            `
        };

        transporter.sendMail(mailOptions, (mailErr, info) => {
            if (mailErr) {
                console.error('Error sending email:', mailErr);
                // We still return 200 because DB save was successful, but log the email error.
                // Depending on requirements, you might want to return an error here instead.
                return res.status(200).json({ success: true, message: 'Booking saved, but failed to send email.' });
            }
            res.status(200).json({ success: true, message: 'Booking saved and email sent.' });
        });
    });
});

// --- ADMIN API ROUTES ---

// Use auth middleware for all /api/admin routes
app.use('/api/admin', adminAuth);

// Create a new gig
app.post('/api/admin/gigs', (req, res) => {
    const { date, location, genre, ticket_link } = req.body;
    if (!date || !location) {
        return res.status(400).json({ error: 'Date and location are required.' });
    }

    const query = `INSERT INTO gigs (date, location, genre, ticket_link) VALUES (?, ?, ?, ?)`;
    db.run(query, [date, location, genre, ticket_link], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, success: true });
    });
});

// Delete a gig
app.delete('/api/admin/gigs/:id', (req, res) => {
    const { id } = req.params;
    const query = `DELETE FROM gigs WHERE id = ?`;
    db.run(query, id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Get all bookings
app.get('/api/admin/bookings', (req, res) => {
    const query = `SELECT * FROM bookings ORDER BY created_at DESC`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

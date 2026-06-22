require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const basicAuth = require('express-basic-auth');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic Auth setup
const adminUsers = {};
adminUsers[process.env.ADMIN_USER] = process.env.ADMIN_PASS;

const adminAuth = basicAuth({
    users: adminUsers,
    challenge: true,
    unauthorizedResponse: 'Unauthorized Access'
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the admin directory protected by Basic Auth
app.use('/admin', adminAuth, express.static(path.join(__dirname, 'public/admin')));

// Serve the rest of the public files without auth
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

        // Send email (Wrapped in try/catch to ensure server stability even if nodemailer fails unexpectedly)
        try {
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
                    console.error('Error sending email:', mailErr.message);
                    return res.status(201).json({ success: true, message: 'Booking saved, but failed to send email notification.' });
                }
                res.status(201).json({ success: true, message: 'Booking saved and email sent.' });
            });
        } catch (mailException) {
            console.error('Critical Error in mail transporter:', mailException);
            return res.status(201).json({ success: true, message: 'Booking saved, but mail service is currently unavailable.' });
        }
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
        res.status(201).json({ id: this.lastID, success: true });
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
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Graceful Shutdown to prevent memory leaks and database corruption
function gracefulShutdown(signal) {
    console.log(`\nReceived ${signal}. Closing server gracefully...`);
    server.close(() => {
        console.log('HTTP server closed.');
        // Close SQLite connection safely
        db.close((err) => {
            if (err) {
                console.error('Error closing the database connection:', err.message);
                process.exit(1);
            }
            console.log('Database connection closed.');
            process.exit(0);
        });
    });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

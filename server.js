const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const basicAuth = require('express-basic-auth');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const app = express();
const PORT = config.port;

// --- Basic Auth for the admin area ---------------------------------------
const adminAuth = basicAuth({
    users: { [config.admin.user]: config.admin.pass },
    challenge: true,
    unauthorizedResponse: 'Unauthorized Access'
});

// --- Middleware ----------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the admin directory protected by Basic Auth
app.use('/admin', adminAuth, express.static(path.join(__dirname, 'public/admin')));
// Serve the rest of the public files without auth
app.use(express.static(path.join(__dirname, 'public')));

// --- Database ------------------------------------------------------------
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run('PRAGMA foreign_keys = ON');
        initDb();
    }
});

// Small promise wrappers around the sqlite3 callback API
const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const dbGet = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const dbRun = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

async function initDb() {
    try {
        await dbRun(`
            CREATE TABLE IF NOT EXISTS content_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                fields TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS content_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type_id INTEGER NOT NULL,
                data TEXT NOT NULL,
                status TEXT DEFAULT 'published',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (type_id) REFERENCES content_types(id) ON DELETE CASCADE
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                subject TEXT,
                body TEXT,
                meta TEXT,
                status TEXT DEFAULT 'new',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);

        // Seed default content types only when the table is empty, so the
        // template ships with working examples out of the box.
        const row = await dbGet('SELECT COUNT(*) AS count FROM content_types');
        if (row.count === 0) {
            for (const t of config.seedContentTypes) {
                await dbRun(
                    'INSERT INTO content_types (slug, name, description, fields) VALUES (?, ?, ?, ?)',
                    [t.slug, t.name, t.description || '', JSON.stringify(t.fields)]
                );
            }
            console.log(`Seeded ${config.seedContentTypes.length} default content type(s).`);
        }
    } catch (err) {
        console.error('Error initializing database:', err.message);
    }
}

// --- Mailer --------------------------------------------------------------
const mailEnabled = Boolean(config.smtp.host);
const transporter = mailEnabled ? nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    requireTLS: config.smtp.port !== 465,
    auth: (config.smtp.user || config.smtp.pass) ? {
        user: config.smtp.user,
        pass: config.smtp.pass
    } : undefined
}) : null;

function sendMail(options) {
    return new Promise((resolve, reject) => {
        if (!transporter) return reject(new Error('Mail is not configured.'));
        transporter.sendMail(options, (err, info) => err ? reject(err) : resolve(info));
    });
}

// --- Helpers -------------------------------------------------------------

// Build the effective site config: file defaults overridden by DB settings.
async function getSiteConfig() {
    const rows = await dbAll('SELECT key, value FROM settings');
    const overrides = {};
    rows.forEach(r => { overrides[r.key] = r.value; });

    const site = { ...config.siteDefaults };
    config.siteSchema.forEach(f => {
        if (overrides[f.key] !== undefined && overrides[f.key] !== null) {
            site[f.key] = overrides[f.key];
        }
    });
    return site;
}

// Validate a content-type definition coming from the admin panel.
function validateContentType(body) {
    const { slug, name } = body;
    let { description, fields } = body;

    if (!slug || !name) return { error: 'slug and name are required.' };
    if (!/^[a-z0-9-]+$/.test(slug)) {
        return { error: 'slug may only contain lowercase letters, numbers and hyphens.' };
    }
    if (!Array.isArray(fields) || fields.length === 0) {
        return { error: 'At least one field is required.' };
    }

    const seen = new Set();
    for (const f of fields) {
        if (!f.name || !/^[a-zA-Z0-9_]+$/.test(f.name)) {
            return { error: 'Each field needs a valid name (letters, numbers, underscore).' };
        }
        if (seen.has(f.name)) return { error: `Duplicate field name: ${f.name}` };
        seen.add(f.name);
        if (!config.fieldTypes.includes(f.type)) {
            return { error: `Invalid field type: ${f.type}` };
        }
    }

    const clean = fields.map(f => ({
        name: f.name,
        label: f.label || f.name,
        type: f.type,
        required: Boolean(f.required)
    }));
    return { value: { slug, name, description: description || '', fields: clean } };
}

// Validate an entry's data against the field definitions of its type.
function validateEntryData(fields, data) {
    const clean = {};
    data = data || {};
    for (const f of fields) {
        let v = data[f.name];
        if (f.required && (v === undefined || v === null || v === '')) {
            return { error: `Field "${f.label || f.name}" is required.` };
        }
        if (v === undefined || v === null) v = f.type === 'boolean' ? false : '';
        if (f.type === 'boolean') v = Boolean(v);
        clean[f.name] = v;
    }
    return { data: clean };
}

function serializeType(row) {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        fields: JSON.parse(row.fields)
    };
}

// =========================================================================
//  PUBLIC API
// =========================================================================

// Site configuration + list of content types (branding, colors, texts).
app.get('/api/config', async (req, res) => {
    try {
        const site = await getSiteConfig();
        const types = await dbAll('SELECT * FROM content_types ORDER BY id ASC');
        res.json({
            site,
            siteSchema: config.siteSchema,
            fieldTypes: config.fieldTypes,
            contentTypes: types.map(serializeType)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Published entries of a given content type.
app.get('/api/content/:slug', async (req, res) => {
    try {
        const type = await dbGet('SELECT * FROM content_types WHERE slug = ?', [req.params.slug]);
        if (!type) return res.status(404).json({ error: 'Unknown content type.' });
        const rows = await dbAll(
            'SELECT id, data, created_at, updated_at FROM content_entries WHERE type_id = ? AND status = ? ORDER BY created_at DESC',
            [type.id, 'published']
        );
        res.json(rows.map(r => ({
            id: r.id,
            created_at: r.created_at,
            updated_at: r.updated_at,
            data: JSON.parse(r.data)
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// A single published entry.
app.get('/api/content/:slug/:id', async (req, res) => {
    try {
        const type = await dbGet('SELECT * FROM content_types WHERE slug = ?', [req.params.slug]);
        if (!type) return res.status(404).json({ error: 'Unknown content type.' });
        const row = await dbGet(
            'SELECT id, data, created_at, updated_at FROM content_entries WHERE id = ? AND type_id = ? AND status = ?',
            [req.params.id, type.id, 'published']
        );
        if (!row) return res.status(404).json({ error: 'Entry not found.' });
        res.json({ id: row.id, created_at: row.created_at, updated_at: row.updated_at, data: JSON.parse(row.data) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Submit a contact message.
app.post('/api/messages', async (req, res) => {
    const { name, email, subject, body, meta } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required.' });
    }
    try {
        const result = await dbRun(
            'INSERT INTO messages (name, email, subject, body, meta) VALUES (?, ?, ?, ?, ?)',
            [name, email, subject || '', body || '', meta ? JSON.stringify(meta) : null]
        );

        // Fire-and-forget notification; never let mail issues fail the request.
        if (mailEnabled && config.smtp.to) {
            sendMail({
                from: config.smtp.from,
                to: config.smtp.to,
                replyTo: email,
                subject: `New message from ${name}${subject ? ': ' + subject : ''}`,
                text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject || 'N/A'}\n\n${body || 'N/A'}`
            }).catch(err => console.error('Notification email failed:', err.message));
        }

        res.status(201).json({ success: true, id: result.lastID, message: 'Message sent successfully.' });
    } catch (err) {
        console.error('Error saving message:', err.message);
        res.status(500).json({ error: 'Failed to save message.' });
    }
});

// =========================================================================
//  ADMIN API  (protected)
// =========================================================================
app.use('/api/admin', adminAuth);

// ---- Content types ----
app.get('/api/admin/content-types', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM content_types ORDER BY id ASC');
        const counts = await dbAll('SELECT type_id, COUNT(*) AS c FROM content_entries GROUP BY type_id');
        const countMap = {};
        counts.forEach(r => { countMap[r.type_id] = r.c; });
        res.json(rows.map(r => ({ ...serializeType(r), entryCount: countMap[r.id] || 0 })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/content-types', async (req, res) => {
    const { error, value } = validateContentType(req.body);
    if (error) return res.status(400).json({ error });
    try {
        const result = await dbRun(
            'INSERT INTO content_types (slug, name, description, fields) VALUES (?, ?, ?, ?)',
            [value.slug, value.name, value.description, JSON.stringify(value.fields)]
        );
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        if (/UNIQUE/.test(err.message)) return res.status(409).json({ error: 'A content type with this slug already exists.' });
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/content-types/:id', async (req, res) => {
    const { error, value } = validateContentType(req.body);
    if (error) return res.status(400).json({ error });
    try {
        const result = await dbRun(
            'UPDATE content_types SET slug = ?, name = ?, description = ?, fields = ? WHERE id = ?',
            [value.slug, value.name, value.description, JSON.stringify(value.fields), req.params.id]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Content type not found.' });
        res.json({ success: true });
    } catch (err) {
        if (/UNIQUE/.test(err.message)) return res.status(409).json({ error: 'A content type with this slug already exists.' });
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/content-types/:id', async (req, res) => {
    try {
        const result = await dbRun('DELETE FROM content_types WHERE id = ?', [req.params.id]);
        res.json({ success: true, changes: result.changes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Content entries (by type slug) ----
app.get('/api/admin/content/:slug', async (req, res) => {
    try {
        const type = await dbGet('SELECT * FROM content_types WHERE slug = ?', [req.params.slug]);
        if (!type) return res.status(404).json({ error: 'Unknown content type.' });
        const rows = await dbAll(
            'SELECT id, data, status, created_at, updated_at FROM content_entries WHERE type_id = ? ORDER BY created_at DESC',
            [type.id]
        );
        res.json({
            type: serializeType(type),
            entries: rows.map(r => ({
                id: r.id, status: r.status, created_at: r.created_at,
                updated_at: r.updated_at, data: JSON.parse(r.data)
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/content/:slug', async (req, res) => {
    try {
        const type = await dbGet('SELECT * FROM content_types WHERE slug = ?', [req.params.slug]);
        if (!type) return res.status(404).json({ error: 'Unknown content type.' });
        const fields = JSON.parse(type.fields);
        const { error, data } = validateEntryData(fields, req.body.data);
        if (error) return res.status(400).json({ error });
        const status = req.body.status === 'draft' ? 'draft' : 'published';
        const result = await dbRun(
            'INSERT INTO content_entries (type_id, data, status) VALUES (?, ?, ?)',
            [type.id, JSON.stringify(data), status]
        );
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/content/:slug/:id', async (req, res) => {
    try {
        const type = await dbGet('SELECT * FROM content_types WHERE slug = ?', [req.params.slug]);
        if (!type) return res.status(404).json({ error: 'Unknown content type.' });
        const fields = JSON.parse(type.fields);
        const { error, data } = validateEntryData(fields, req.body.data);
        if (error) return res.status(400).json({ error });
        const status = req.body.status === 'draft' ? 'draft' : 'published';
        const result = await dbRun(
            "UPDATE content_entries SET data = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type_id = ?",
            [JSON.stringify(data), status, req.params.id, type.id]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Entry not found.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/content/:slug/:id', async (req, res) => {
    try {
        const type = await dbGet('SELECT * FROM content_types WHERE slug = ?', [req.params.slug]);
        if (!type) return res.status(404).json({ error: 'Unknown content type.' });
        const result = await dbRun(
            'DELETE FROM content_entries WHERE id = ? AND type_id = ?',
            [req.params.id, type.id]
        );
        res.json({ success: true, changes: result.changes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Messages ----
app.get('/api/admin/messages', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM messages ORDER BY created_at DESC');
        res.json(rows.map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/messages/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!['new', 'read', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }
    try {
        const result = await dbRun('UPDATE messages SET status = ? WHERE id = ?', [status, req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Message not found.' });
        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/messages/:id/reply', async (req, res) => {
    const { replyMessage, email, subject } = req.body;
    if (!replyMessage || !email) {
        return res.status(400).json({ error: 'Reply message and email are required.' });
    }
    if (!mailEnabled) return res.status(503).json({ error: 'Mail is not configured on this server.' });
    try {
        await sendMail({
            from: config.smtp.from,
            to: email,
            subject: subject || 'Re: your message',
            text: replyMessage
        });
        // Mark the message as read once a reply has been sent.
        await dbRun("UPDATE messages SET status = 'read' WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Reply sent successfully.' });
    } catch (err) {
        console.error('Error sending reply:', err.message);
        res.status(500).json({ error: 'Failed to send reply email.' });
    }
});

app.delete('/api/admin/messages/:id', async (req, res) => {
    try {
        const result = await dbRun('DELETE FROM messages WHERE id = ?', [req.params.id]);
        res.json({ success: true, changes: result.changes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Settings ----
app.get('/api/admin/settings', async (req, res) => {
    try {
        const site = await getSiteConfig();
        res.json({ site, schema: config.siteSchema });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/settings', async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required.' });
    if (!config.siteSchema.some(f => f.key === key)) {
        return res.status(400).json({ error: 'Unknown setting key.' });
    }
    try {
        await dbRun(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            [key, value == null ? '' : String(value)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
//  Server lifecycle
// =========================================================================
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    if (!mailEnabled) console.log('Note: SMTP is not configured — email notifications are disabled.');
});

function gracefulShutdown(signal) {
    console.log(`\nReceived ${signal}. Closing server gracefully...`);
    server.close(() => {
        console.log('HTTP server closed.');
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

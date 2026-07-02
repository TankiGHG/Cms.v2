const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const multer = require('multer');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const app = express();
const PORT = config.port;
const IS_TEST = config.env === 'test';

if (config.trustProxy) app.set('trust proxy', 1);

// --- Directories -----------------------------------------------------------
const dataDir = config.dataDir;
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.sqlite');

// --- Database ---------------------------------------------------------------
let resolveReady, rejectReady;
const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
        rejectReady(err);
    } else {
        db.run('PRAGMA foreign_keys = ON');
        initDb().then(resolveReady).catch(rejectReady);
    }
});

// Small promise wrappers around the sqlite3 callback API
const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const dbGet = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const dbRun = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

async function ensureColumn(table, column, ddl) {
    const cols = await dbAll(`PRAGMA table_info(${table})`);
    if (!cols.some(c => c.name === column)) {
        await dbRun(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
}

async function initDb() {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'editor',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

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

    // Schema migrations for databases created by older versions.
    await ensureColumn('content_entries', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('content_entries', 'publish_at', 'publish_at DATETIME');
    await ensureColumn('content_entries', 'deleted_at', 'deleted_at DATETIME');
    await ensureColumn('content_entries', 'locale', "locale TEXT NOT NULL DEFAULT ''");

    await dbRun(`
        CREATE TABLE IF NOT EXISTS entry_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER NOT NULL,
            data TEXT NOT NULL,
            status TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entry_id) REFERENCES content_entries(id) ON DELETE CASCADE
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

    await dbRun('CREATE INDEX IF NOT EXISTS idx_entries_type ON content_entries(type_id, status, deleted_at)');
    await dbRun('CREATE INDEX IF NOT EXISTS idx_versions_entry ON entry_versions(entry_id)');

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

    // Seed the initial admin account. Weak/placeholder passwords are replaced
    // by a generated one that is printed exactly once.
    const userCount = await dbGet('SELECT COUNT(*) AS count FROM users');
    if (userCount.count === 0) {
        let pass = config.admin.pass;
        let generated = false;
        if (!pass || ['admin', 'changeme', 'changeme123', 'password'].includes(pass)) {
            pass = crypto.randomBytes(12).toString('base64url');
            generated = true;
        }
        await dbRun(
            'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
            [config.admin.user, bcrypt.hashSync(pass, 12), 'admin']
        );
        if (generated) {
            console.log('='.repeat(64));
            console.log(`Created admin user "${config.admin.user}" with a GENERATED password:`);
            console.log(`    ${pass}`);
            console.log('Log in at /admin and change it. (Set ADMIN_PASS to control this.)');
            console.log('='.repeat(64));
        } else {
            console.log(`Created admin user "${config.admin.user}".`);
        }
    }
}

// --- Base middleware ---------------------------------------------------------
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

if (!IS_TEST) app.use(morgan(process.env.LOG_FORMAT || 'short'));

app.use(express.json({ limit: '300kb' }));
app.use(express.urlencoded({ extended: false, limit: '300kb' }));

const sessionSecret = config.session.secret || crypto.randomBytes(32).toString('hex');
if (!config.session.secret && !IS_TEST) {
    console.warn('SESSION_SECRET is not set — using a random secret (sessions reset on restart).');
}
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir }),
    name: 'cms.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.trustProxy ? 'auto' : false,
        maxAge: config.session.maxAgeHours * 60 * 60 * 1000,
    },
}));

// --- Rate limiting -----------------------------------------------------------
const skipInTest = () => IS_TEST && process.env.TEST_RATE_LIMITS !== '1';
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10,
    standardHeaders: true, legacyHeaders: false, skip: skipInTest,
    message: { error: 'Too many login attempts. Try again later.' },
});
const messageLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, limit: 5,
    standardHeaders: true, legacyHeaders: false, skip: skipInTest,
    message: { error: 'Too many messages. Try again later.' },
});
const adminApiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, limit: 600,
    standardHeaders: true, legacyHeaders: false, skip: skipInTest,
    message: { error: 'Too many requests. Slow down.' },
});

// --- Helpers -----------------------------------------------------------------
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function httpError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function escapeHtml(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function isSafeUrl(v) {
    return typeof v === 'string' && (
        /^https?:\/\//i.test(v) || (v.startsWith('/uploads/') && !v.includes('..'))
    );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parsePagination(query, defaultLimit = 50) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
    return { page, limit, offset: (page - 1) * limit };
}

function likePattern(q) {
    return '%' + String(q).replace(/[\\%_]/g, (m) => '\\' + m) + '%';
}

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

function parseFields(row) {
    try { return JSON.parse(row.fields); } catch { return []; }
}

function serializeType(row) {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        fields: parseFields(row),
    };
}

function parseEntryData(raw) {
    try { return JSON.parse(raw); } catch { return {}; }
}

function firstTextValue(data) {
    if (data && typeof data === 'object') {
        if (typeof data.title === 'string' && data.title) return data.title;
        for (const v of Object.values(data)) {
            if (typeof v === 'string' && v) return v;
        }
    }
    return '';
}

// Fire-and-forget webhook notification on content changes.
async function fireWebhook(event, payload) {
    try {
        const site = await getSiteConfig();
        const url = site.webhook_url;
        if (!url || !/^https?:\/\//i.test(url)) return;
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, ...payload, timestamp: new Date().toISOString() }),
            signal: AbortSignal.timeout(5000),
        }).catch(err => console.error('Webhook delivery failed:', err.message));
    } catch (err) {
        console.error('Webhook error:', err.message);
    }
}

// --- Validation --------------------------------------------------------------

// Validate a content-type definition coming from the admin panel.
// Returns { value, renames } — `renames` carries field renamings so entry
// data can be migrated on update.
function validateContentType(body) {
    const { slug, name } = body;
    let { description, fields } = body;

    if (!slug || !name) return { error: 'slug and name are required.' };
    if (typeof slug !== 'string' || slug.length > 64 || !/^[a-z0-9-]+$/.test(slug)) {
        return { error: 'slug may only contain lowercase letters, numbers and hyphens (max 64 chars).' };
    }
    if (typeof name !== 'string' || name.length > 100) {
        return { error: 'name must be a string of at most 100 characters.' };
    }
    if (!Array.isArray(fields) || fields.length === 0) {
        return { error: 'At least one field is required.' };
    }
    if (fields.length > 50) return { error: 'A content type may have at most 50 fields.' };

    const seen = new Set();
    const clean = [];
    const renames = [];
    for (const f of fields) {
        if (!f.name || typeof f.name !== 'string' || f.name.length > 64 || !/^[a-zA-Z0-9_]+$/.test(f.name)) {
            return { error: 'Each field needs a valid name (letters, numbers, underscore).' };
        }
        if (seen.has(f.name)) return { error: `Duplicate field name: ${f.name}` };
        seen.add(f.name);
        if (!config.fieldTypes.includes(f.type)) {
            return { error: `Invalid field type: ${f.type}` };
        }
        const cf = {
            name: f.name,
            label: (typeof f.label === 'string' && f.label ? f.label : f.name).slice(0, 100),
            type: f.type,
            required: Boolean(f.required),
        };
        if (f.type === 'select') {
            const options = Array.isArray(f.options)
                ? f.options.map(o => String(o).trim()).filter(Boolean)
                : String(f.options || '').split(',').map(o => o.trim()).filter(Boolean);
            if (options.length === 0) return { error: `Select field "${f.name}" needs at least one option.` };
            cf.options = options.slice(0, 100);
        }
        if (f.type === 'relation') {
            if (!f.relatedType || !/^[a-z0-9-]+$/.test(f.relatedType)) {
                return { error: `Relation field "${f.name}" needs a valid related content type slug.` };
            }
            cf.relatedType = f.relatedType;
        }
        if (f.renamedFrom && typeof f.renamedFrom === 'string' &&
            /^[a-zA-Z0-9_]+$/.test(f.renamedFrom) && f.renamedFrom !== f.name) {
            renames.push({ from: f.renamedFrom, to: f.name });
        }
        clean.push(cf);
    }

    return {
        value: {
            slug,
            name,
            description: typeof description === 'string' ? description.slice(0, 500) : '',
            fields: clean,
        },
        renames,
    };
}

// Validate an entry's data against the field definitions of its type.
// Async because relation fields are checked against the database.
async function validateEntryData(fields, data) {
    const clean = {};
    data = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
    for (const f of fields) {
        let v = data[f.name];
        const label = f.label || f.name;
        const empty = v === undefined || v === null || v === '';

        if (f.type === 'boolean') {
            clean[f.name] = v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
            continue;
        }
        if (empty) {
            if (f.required) return { error: `Field "${label}" is required.` };
            clean[f.name] = '';
            continue;
        }

        switch (f.type) {
            case 'number': {
                if (typeof v === 'object' || String(v).trim() === '' || !Number.isFinite(Number(v))) {
                    return { error: `Field "${label}" must be a number.` };
                }
                clean[f.name] = Number(v);
                break;
            }
            case 'date': {
                if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(v) || isNaN(new Date(v))) {
                    return { error: `Field "${label}" must be a valid date (YYYY-MM-DD).` };
                }
                clean[f.name] = v;
                break;
            }
            case 'url':
            case 'image': {
                if (typeof v !== 'string' || v.length > 2000 || !isSafeUrl(v)) {
                    return { error: `Field "${label}" must be an http(s) URL or an /uploads/ path.` };
                }
                clean[f.name] = v;
                break;
            }
            case 'select': {
                const options = Array.isArray(f.options) ? f.options : [];
                if (typeof v !== 'string' || !options.includes(v)) {
                    return { error: `Field "${label}" must be one of: ${options.join(', ')}.` };
                }
                clean[f.name] = v;
                break;
            }
            case 'relation': {
                const id = Number(v);
                if (!Number.isInteger(id) || id <= 0) {
                    return { error: `Field "${label}" must reference an entry id.` };
                }
                const relType = await dbGet('SELECT id FROM content_types WHERE slug = ?', [f.relatedType]);
                const target = relType && await dbGet(
                    'SELECT id FROM content_entries WHERE id = ? AND type_id = ? AND deleted_at IS NULL',
                    [id, relType.id]
                );
                if (!target) return { error: `Field "${label}" references a missing "${f.relatedType}" entry.` };
                clean[f.name] = id;
                break;
            }
            default: { // text, textarea, markdown
                if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
                if (typeof v !== 'string') return { error: `Field "${label}" must be text.` };
                const max = f.type === 'text' ? 2000 : 50000;
                if (v.length > max) return { error: `Field "${label}" is too long (max ${max} characters).` };
                clean[f.name] = v;
            }
        }
    }
    return { data: clean };
}

// Normalize an optional "publish at" value to `YYYY-MM-DD HH:MM:SS`.
function normalizePublishAt(v) {
    if (v === undefined || v === null || v === '') return { value: null };
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(v)) {
        return { error: 'publish_at must be formatted as YYYY-MM-DD HH:MM.' };
    }
    let out = v.replace('T', ' ');
    if (out.length === 16) out += ':00';
    return { value: out };
}

function normalizeLocale(v) {
    if (v === undefined || v === null || v === '') return { value: '' };
    if (typeof v !== 'string' || v.length > 10 || !/^[a-zA-Z-]+$/.test(v)) {
        return { error: 'Invalid locale.' };
    }
    return { value: v };
}

// Replace relation-field ids with { id, title } for public consumption.
async function expandRelations(fields, entries) {
    const relFields = fields.filter(f => f.type === 'relation');
    for (const f of relFields) {
        const ids = [...new Set(entries.map(e => Number(e.data[f.name])).filter(n => Number.isInteger(n) && n > 0))];
        if (ids.length === 0) continue;
        const rows = await dbAll(
            `SELECT id, data FROM content_entries WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids
        );
        const map = {};
        rows.forEach(r => { map[r.id] = { id: r.id, title: firstTextValue(parseEntryData(r.data)) }; });
        entries.forEach(e => {
            const v = Number(e.data[f.name]);
            e.data[f.name] = map[v] || '';
        });
    }
}

// Condition shared by all public content queries.
const PUBLIC_ENTRY_WHERE = `
    status = 'published'
    AND deleted_at IS NULL
    AND (publish_at IS NULL OR publish_at <= datetime('now', 'localtime'))
`;

// --- Mailer ------------------------------------------------------------------
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

// =============================================================================
//  AUTHENTICATION
// =============================================================================
const DUMMY_HASH = bcrypt.hashSync('invalid-password-placeholder', 12);

function publicUser(u) {
    return { id: u.id, username: u.username, role: u.role };
}

function ensureCsrfToken(req) {
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    return req.session.csrfToken;
}

function requireAuth(req, res, next) {
    if (!req.session.user) return next(httpError(401, 'Authentication required.'));
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) return next(httpError(401, 'Authentication required.'));
    if (req.session.user.role !== 'admin') return next(httpError(403, 'Admin role required.'));
    next();
}

// CSRF protection for state-changing requests: the client must echo the
// session token in the X-CSRF-Token header (cookies are SameSite=Lax on top).
function csrfProtect(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const sent = req.get('x-csrf-token') || '';
    const expected = req.session.csrfToken || '';
    const a = Buffer.from(sent);
    const b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return next(httpError(403, 'Invalid CSRF token.'));
    }
    next();
}

app.post('/api/auth/login', loginLimiter, asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
        throw httpError(400, 'Username and password are required.');
    }
    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
    // Always compare against a hash so response timing does not reveal
    // whether the username exists.
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw httpError(401, 'Invalid username or password.');

    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.user = publicUser(user);
    const csrfToken = ensureCsrfToken(req);
    res.json({ user: req.session.user, csrfToken });
}));

app.post('/api/auth/logout', requireAuth, csrfProtect, (req, res, next) => {
    req.session.destroy(err => {
        if (err) return next(err);
        res.clearCookie('cms.sid');
        res.json({ success: true });
    });
});

app.get('/api/auth/me', (req, res) => {
    if (!req.session.user) return res.json({ user: null });
    res.json({ user: req.session.user, csrfToken: ensureCsrfToken(req) });
});

app.post('/api/auth/password', requireAuth, csrfProtect, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        throw httpError(400, 'Current and new password are required.');
    }
    if (newPassword.length < 8 || newPassword.length > 200) {
        throw httpError(400, 'The new password must be 8–200 characters long.');
    }
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
        throw httpError(401, 'Current password is incorrect.');
    }
    await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(newPassword, 12), user.id]);
    res.json({ success: true });
}));

// =============================================================================
//  STATIC FILES & SEO
// =============================================================================
const publicDir = path.join(__dirname, 'public');
const adminDir = path.join(publicDir, 'admin');

// The admin SPA is only served to authenticated users; the login page and its
// script stay public.
const ADMIN_PUBLIC_FILES = new Set(['/login.html', '/login.js']);
app.use('/admin', (req, res, next) => {
    if (ADMIN_PUBLIC_FILES.has(req.path)) return next();
    if (!req.session.user) return res.redirect('/admin/login.html');
    next();
}, express.static(adminDir));

app.use('/uploads', express.static(uploadsDir, { index: false, maxAge: '7d' }));

// Server-side meta-tag injection for the public page (SEO / link previews).
const indexTemplatePath = path.join(publicDir, 'index.html');
function renderIndexHtml({ title, description, url }) {
    const html = fs.readFileSync(indexTemplatePath, 'utf8');
    return html
        .replaceAll('{{PAGE_TITLE}}', escapeHtml(title))
        .replaceAll('{{PAGE_DESC}}', escapeHtml(description))
        .replaceAll('{{PAGE_URL}}', escapeHtml(url));
}

function baseUrl(site, req) {
    return (site.site_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

app.get('/', asyncHandler(async (req, res) => {
    const site = await getSiteConfig();
    res.type('html').send(renderIndexHtml({
        title: site.site_name || 'Website',
        description: site.meta_description || site.tagline || '',
        url: baseUrl(site, req) + '/',
    }));
}));

// Entry detail pages — same SPA, but with entry-specific meta tags.
app.get('/c/:slug/:id', asyncHandler(async (req, res) => {
    const site = await getSiteConfig();
    let title = site.site_name || 'Website';
    let description = site.meta_description || site.tagline || '';
    const type = await dbGet('SELECT * FROM content_types WHERE slug = ?', [req.params.slug]);
    if (type) {
        const row = await dbGet(
            `SELECT data FROM content_entries WHERE id = ? AND type_id = ? AND ${PUBLIC_ENTRY_WHERE}`,
            [req.params.id, type.id]
        );
        if (row) {
            const data = parseEntryData(row.data);
            const entryTitle = firstTextValue(data);
            if (entryTitle) title = `${entryTitle} – ${title}`;
            const text = Object.values(data).find(v => typeof v === 'string' && v.length > 40);
            if (text) description = String(text).replace(/\s+/g, ' ').slice(0, 200);
        }
    }
    res.type('html').send(renderIndexHtml({
        title, description,
        url: `${baseUrl(site, req)}/c/${encodeURIComponent(req.params.slug)}/${encodeURIComponent(req.params.id)}`,
    }));
}));

app.get('/index.html', (req, res) => res.redirect('/'));

app.get('/robots.txt', asyncHandler(async (req, res) => {
    const site = await getSiteConfig();
    res.type('text/plain').send(
        `User-agent: *\nDisallow: /admin\nDisallow: /api\n\nSitemap: ${baseUrl(site, req)}/sitemap.xml\n`
    );
}));

app.get('/sitemap.xml', asyncHandler(async (req, res) => {
    const site = await getSiteConfig();
    const base = baseUrl(site, req);
    const urls = [`  <url><loc>${escapeHtml(base)}/</loc></url>`];
    const types = await dbAll('SELECT id, slug FROM content_types ORDER BY id ASC');
    for (const t of types) {
        const rows = await dbAll(
            `SELECT id, updated_at FROM content_entries WHERE type_id = ? AND ${PUBLIC_ENTRY_WHERE} ORDER BY id ASC LIMIT 2000`,
            [t.id]
        );
        rows.forEach(r => {
            const lastmod = r.updated_at ? `<lastmod>${escapeHtml(String(r.updated_at).slice(0, 10))}</lastmod>` : '';
            urls.push(`  <url><loc>${escapeHtml(base)}/c/${escapeHtml(t.slug)}/${r.id}</loc>${lastmod}</url>`);
        });
    }
    res.type('application/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
    );
}));

app.use(express.static(publicDir, { index: false }));

// --- Health check ------------------------------------------------------------
app.get('/healthz', asyncHandler(async (req, res) => {
    await dbGet('SELECT 1');
    res.json({ status: 'ok' });
}));

// =============================================================================
//  PUBLIC API
// =============================================================================

// Site configuration + list of content types (branding, colors, texts).
app.get('/api/config', asyncHandler(async (req, res) => {
    const site = await getSiteConfig();
    const types = await dbAll('SELECT * FROM content_types ORDER BY id ASC');
    // Never leak internal-only settings to the public frontend.
    delete site.webhook_url;
    res.json({
        site,
        contentTypes: types.map(serializeType),
    });
}));

// Published entries of a given content type (paginated, searchable).
app.get('/api/content/:slug', asyncHandler(async (req, res) => {
    const type = await dbGet('SELECT * FROM content_types WHERE slug = ?', [req.params.slug]);
    if (!type) throw httpError(404, 'Unknown content type.');

    const { page, limit, offset } = parsePagination(req.query, 50);
    const where = [`type_id = ?`, PUBLIC_ENTRY_WHERE];
    const params = [type.id];
    if (req.query.q) {
        where.push("data LIKE ? ESCAPE '\\'");
        params.push(likePattern(String(req.query.q).slice(0, 200)));
    }
    if (req.query.locale && /^[a-zA-Z-]{1,10}$/.test(req.query.locale)) {
        where.push('locale = ?');
        params.push(req.query.locale);
    }
    const whereSql = where.join(' AND ');

    const totalRow = await dbGet(`SELECT COUNT(*) AS c FROM content_entries WHERE ${whereSql}`, params);
    const rows = await dbAll(
        `SELECT id, data, created_at, updated_at FROM content_entries
         WHERE ${whereSql}
         ORDER BY sort_order ASC, created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const entries = rows.map(r => ({
        id: r.id,
        created_at: r.created_at,
        updated_at: r.updated_at,
        data: parseEntryData(r.data),
    }));
    await expandRelations(parseFields(type), entries);
    res.json({ entries, total: totalRow.c, page, limit });
}));

// A single published entry.
app.get('/api/content/:slug/:id', asyncHandler(async (req, res) => {
    const type = await dbGet('SELECT * FROM content_types WHERE slug = ?', [req.params.slug]);
    if (!type) throw httpError(404, 'Unknown content type.');
    const row = await dbGet(
        `SELECT id, data, created_at, updated_at FROM content_entries
         WHERE id = ? AND type_id = ? AND ${PUBLIC_ENTRY_WHERE}`,
        [req.params.id, type.id]
    );
    if (!row) throw httpError(404, 'Entry not found.');
    const entry = { id: row.id, created_at: row.created_at, updated_at: row.updated_at, data: parseEntryData(row.data) };
    await expandRelations(parseFields(type), [entry]);
    res.json(entry);
}));

// Submit a contact message.
app.post('/api/messages', messageLimiter, asyncHandler(async (req, res) => {
    const { name, email, subject, body, website } = req.body || {};

    // Honeypot: the hidden "website" field is invisible to humans. Bots that
    // fill it get a fake success response and nothing is stored.
    if (website) return res.status(201).json({ success: true, message: 'Message sent successfully.' });

    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim()) {
        throw httpError(400, 'Name and email are required.');
    }
    if (name.length > 200) throw httpError(400, 'Name is too long (max 200 characters).');
    if (email.length > 200 || !EMAIL_RE.test(email)) throw httpError(400, 'Please provide a valid email address.');
    if (subject !== undefined && (typeof subject !== 'string' || subject.length > 300)) {
        throw httpError(400, 'Subject is too long (max 300 characters).');
    }
    if (body !== undefined && (typeof body !== 'string' || body.length > 10000)) {
        throw httpError(400, 'Message is too long (max 10000 characters).');
    }

    const result = await dbRun(
        'INSERT INTO messages (name, email, subject, body) VALUES (?, ?, ?, ?)',
        [name.trim(), email.trim(), subject || '', body || '']
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
}));

// =============================================================================
//  ADMIN API  (session auth + CSRF; some routes additionally need admin role)
// =============================================================================
app.use('/api/admin', adminApiLimiter, requireAuth, csrfProtect);

// ---- Content types (admin role) ----
app.get('/api/admin/content-types', asyncHandler(async (req, res) => {
    const rows = await dbAll('SELECT * FROM content_types ORDER BY id ASC');
    const counts = await dbAll('SELECT type_id, COUNT(*) AS c FROM content_entries WHERE deleted_at IS NULL GROUP BY type_id');
    const countMap = {};
    counts.forEach(r => { countMap[r.type_id] = r.c; });
    res.json(rows.map(r => ({ ...serializeType(r), entryCount: countMap[r.id] || 0 })));
}));

app.post('/api/admin/content-types', requireAdmin, asyncHandler(async (req, res) => {
    const { error, value } = validateContentType(req.body);
    if (error) throw httpError(400, error);
    try {
        const result = await dbRun(
            'INSERT INTO content_types (slug, name, description, fields) VALUES (?, ?, ?, ?)',
            [value.slug, value.name, value.description, JSON.stringify(value.fields)]
        );
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        if (/UNIQUE/.test(err.message)) throw httpError(409, 'A content type with this slug already exists.');
        throw err;
    }
}));

app.put('/api/admin/content-types/:id', requireAdmin, asyncHandler(async (req, res) => {
    const { error, value, renames } = validateContentType(req.body);
    if (error) throw httpError(400, error);
    try {
        const result = await dbRun(
            'UPDATE content_types SET slug = ?, name = ?, description = ?, fields = ? WHERE id = ?',
            [value.slug, value.name, value.description, JSON.stringify(value.fields), req.params.id]
        );
        if (result.changes === 0) throw httpError(404, 'Content type not found.');
    } catch (err) {
        if (/UNIQUE/.test(err.message)) throw httpError(409, 'A content type with this slug already exists.');
        throw err;
    }

    // Migrate entry data when fields were renamed so no content is orphaned.
    if (renames.length > 0) {
        const entries = await dbAll('SELECT id, data FROM content_entries WHERE type_id = ?', [req.params.id]);
        for (const e of entries) {
            const d = parseEntryData(e.data);
            let changed = false;
            for (const r of renames) {
                if (Object.prototype.hasOwnProperty.call(d, r.from) && !(r.to in d)) {
                    d[r.to] = d[r.from];
                    delete d[r.from];
                    changed = true;
                }
            }
            if (changed) await dbRun('UPDATE content_entries SET data = ? WHERE id = ?', [JSON.stringify(d), e.id]);
        }
    }
    res.json({ success: true, migrated: renames.length });
}));

app.delete('/api/admin/content-types/:id', requireAdmin, asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM content_types WHERE id = ?', [req.params.id]);
    res.json({ success: true, changes: result.changes });
}));

// ---- Content entries (by type slug) ----
async function findType(slug) {
    const type = await dbGet('SELECT * FROM content_types WHERE slug = ?', [slug]);
    if (!type) throw httpError(404, 'Unknown content type.');
    return type;
}

app.get('/api/admin/content/:slug', asyncHandler(async (req, res) => {
    const type = await findType(req.params.slug);
    const { page, limit, offset } = parsePagination(req.query, 20);

    const where = ['type_id = ?'];
    const params = [type.id];
    if (req.query.trash === '1') {
        where.push('deleted_at IS NOT NULL');
    } else {
        where.push('deleted_at IS NULL');
        if (req.query.status && ['published', 'draft'].includes(req.query.status)) {
            where.push('status = ?');
            params.push(req.query.status);
        }
    }
    if (req.query.q) {
        where.push("data LIKE ? ESCAPE '\\'");
        params.push(likePattern(String(req.query.q).slice(0, 200)));
    }
    const whereSql = where.join(' AND ');

    const totalRow = await dbGet(`SELECT COUNT(*) AS c FROM content_entries WHERE ${whereSql}`, params);
    const rows = await dbAll(
        `SELECT id, data, status, sort_order, publish_at, locale, deleted_at, created_at, updated_at
         FROM content_entries WHERE ${whereSql}
         ORDER BY sort_order ASC, created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    res.json({
        type: serializeType(type),
        entries: rows.map(r => ({
            id: r.id, status: r.status, sort_order: r.sort_order,
            publish_at: r.publish_at, locale: r.locale, deleted_at: r.deleted_at,
            created_at: r.created_at, updated_at: r.updated_at,
            data: parseEntryData(r.data),
        })),
        total: totalRow.c, page, limit,
    });
}));

app.post('/api/admin/content/:slug', asyncHandler(async (req, res) => {
    const type = await findType(req.params.slug);
    const { error, data } = await validateEntryData(parseFields(type), req.body.data);
    if (error) throw httpError(400, error);
    const status = req.body.status === 'draft' ? 'draft' : 'published';
    const pub = normalizePublishAt(req.body.publish_at);
    if (pub.error) throw httpError(400, pub.error);
    const loc = normalizeLocale(req.body.locale);
    if (loc.error) throw httpError(400, loc.error);

    const result = await dbRun(
        'INSERT INTO content_entries (type_id, data, status, publish_at, locale) VALUES (?, ?, ?, ?, ?)',
        [type.id, JSON.stringify(data), status, pub.value, loc.value]
    );
    fireWebhook('entry.created', { type: type.slug, id: result.lastID, status });
    res.status(201).json({ success: true, id: result.lastID });
}));

app.put('/api/admin/content/:slug/:id', asyncHandler(async (req, res) => {
    const type = await findType(req.params.slug);
    const { error, data } = await validateEntryData(parseFields(type), req.body.data);
    if (error) throw httpError(400, error);
    const status = req.body.status === 'draft' ? 'draft' : 'published';
    const pub = normalizePublishAt(req.body.publish_at);
    if (pub.error) throw httpError(400, pub.error);
    const loc = normalizeLocale(req.body.locale);
    if (loc.error) throw httpError(400, loc.error);

    const prev = await dbGet(
        'SELECT id, data, status FROM content_entries WHERE id = ? AND type_id = ?',
        [req.params.id, type.id]
    );
    if (!prev) throw httpError(404, 'Entry not found.');

    // Keep a version of the previous state (capped at 20 per entry).
    await dbRun('INSERT INTO entry_versions (entry_id, data, status) VALUES (?, ?, ?)', [prev.id, prev.data, prev.status]);
    await dbRun(
        `DELETE FROM entry_versions WHERE entry_id = ? AND id NOT IN
         (SELECT id FROM entry_versions WHERE entry_id = ? ORDER BY id DESC LIMIT 20)`,
        [prev.id, prev.id]
    );

    await dbRun(
        `UPDATE content_entries SET data = ?, status = ?, publish_at = ?, locale = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND type_id = ?`,
        [JSON.stringify(data), status, pub.value, loc.value, req.params.id, type.id]
    );
    fireWebhook('entry.updated', { type: type.slug, id: Number(req.params.id), status });
    res.json({ success: true });
}));

// Soft delete by default; `?permanent=1` removes the row (and its versions).
app.delete('/api/admin/content/:slug/:id', asyncHandler(async (req, res) => {
    const type = await findType(req.params.slug);
    let result;
    if (req.query.permanent === '1') {
        result = await dbRun('DELETE FROM content_entries WHERE id = ? AND type_id = ?', [req.params.id, type.id]);
    } else {
        result = await dbRun(
            'UPDATE content_entries SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND type_id = ? AND deleted_at IS NULL',
            [req.params.id, type.id]
        );
    }
    if (result.changes === 0) throw httpError(404, 'Entry not found.');
    fireWebhook('entry.deleted', { type: type.slug, id: Number(req.params.id), permanent: req.query.permanent === '1' });
    res.json({ success: true, changes: result.changes });
}));

app.post('/api/admin/content/:slug/:id/restore', asyncHandler(async (req, res) => {
    const type = await findType(req.params.slug);
    const result = await dbRun(
        'UPDATE content_entries SET deleted_at = NULL WHERE id = ? AND type_id = ? AND deleted_at IS NOT NULL',
        [req.params.id, type.id]
    );
    if (result.changes === 0) throw httpError(404, 'Entry not found in trash.');
    fireWebhook('entry.restored', { type: type.slug, id: Number(req.params.id) });
    res.json({ success: true });
}));

// Manual ordering: receives the full ordered id list of the current page.
app.put('/api/admin/content/:slug/reorder', asyncHandler(async (req, res) => {
    const type = await findType(req.params.slug);
    const { ids, offset } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every(n => Number.isInteger(n))) {
        throw httpError(400, 'ids must be an array of entry ids.');
    }
    const base = Number.isInteger(offset) && offset >= 0 ? offset : 0;
    for (let i = 0; i < ids.length; i++) {
        await dbRun('UPDATE content_entries SET sort_order = ? WHERE id = ? AND type_id = ?', [base + i, ids[i], type.id]);
    }
    res.json({ success: true });
}));

// ---- Entry versions ----
app.get('/api/admin/content/:slug/:id/versions', asyncHandler(async (req, res) => {
    const type = await findType(req.params.slug);
    const entry = await dbGet('SELECT id FROM content_entries WHERE id = ? AND type_id = ?', [req.params.id, type.id]);
    if (!entry) throw httpError(404, 'Entry not found.');
    const rows = await dbAll(
        'SELECT id, data, status, created_at FROM entry_versions WHERE entry_id = ? ORDER BY id DESC',
        [req.params.id]
    );
    res.json(rows.map(r => ({ id: r.id, status: r.status, created_at: r.created_at, data: parseEntryData(r.data) })));
}));

app.post('/api/admin/content/:slug/:id/revert/:versionId', asyncHandler(async (req, res) => {
    const type = await findType(req.params.slug);
    const entry = await dbGet('SELECT * FROM content_entries WHERE id = ? AND type_id = ?', [req.params.id, type.id]);
    if (!entry) throw httpError(404, 'Entry not found.');
    const version = await dbGet('SELECT * FROM entry_versions WHERE id = ? AND entry_id = ?', [req.params.versionId, entry.id]);
    if (!version) throw httpError(404, 'Version not found.');

    await dbRun('INSERT INTO entry_versions (entry_id, data, status) VALUES (?, ?, ?)', [entry.id, entry.data, entry.status]);
    await dbRun(
        'UPDATE content_entries SET data = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [version.data, version.status || entry.status, entry.id]
    );
    fireWebhook('entry.reverted', { type: type.slug, id: entry.id, versionId: version.id });
    res.json({ success: true });
}));

// ---- Media library ----
const ALLOWED_UPLOADS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/avif': '.avif',
};

const upload = multer({
    storage: multer.diskStorage({
        destination: uploadsDir,
        filename: (req, file, cb) => {
            const ext = ALLOWED_UPLOADS[file.mimetype];
            const base = path.basename(file.originalname, path.extname(file.originalname))
                .toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
            cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}-${base}${ext}`);
        },
    }),
    limits: { fileSize: config.uploads.maxBytes, files: 1 },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_UPLOADS[file.mimetype]) {
            return cb(httpError(400, 'Only JPEG, PNG, GIF, WebP and AVIF images are allowed.'));
        }
        cb(null, true);
    },
});

app.get('/api/admin/media', asyncHandler(async (req, res) => {
    const names = await fs.promises.readdir(uploadsDir);
    const files = [];
    for (const name of names) {
        const stat = await fs.promises.stat(path.join(uploadsDir, name));
        if (stat.isFile()) {
            files.push({ name, url: '/uploads/' + encodeURIComponent(name), size: stat.size, mtime: stat.mtimeMs });
        }
    }
    files.sort((a, b) => b.mtime - a.mtime);
    res.json(files);
}));

app.post('/api/admin/media', upload.single('file'), (req, res) => {
    if (!req.file) throw httpError(400, 'No file uploaded.');
    res.status(201).json({
        success: true,
        file: { name: req.file.filename, url: '/uploads/' + encodeURIComponent(req.file.filename), size: req.file.size },
    });
});

app.delete('/api/admin/media/:name', asyncHandler(async (req, res) => {
    const name = path.basename(req.params.name);
    const target = path.join(uploadsDir, name);
    if (name.startsWith('.') || !fs.existsSync(target)) throw httpError(404, 'File not found.');
    await fs.promises.unlink(target);
    res.json({ success: true });
}));

// ---- Messages ----
app.get('/api/admin/messages', asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query, 20);
    const where = [];
    const params = [];
    if (req.query.status && ['new', 'read', 'archived'].includes(req.query.status)) {
        where.push('status = ?');
        params.push(req.query.status);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const totalRow = await dbGet(`SELECT COUNT(*) AS c FROM messages ${whereSql}`, params);
    const rows = await dbAll(
        `SELECT * FROM messages ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    res.json({ messages: rows, total: totalRow.c, page, limit });
}));

app.put('/api/admin/messages/:id/status', asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!['new', 'read', 'archived'].includes(status)) throw httpError(400, 'Invalid status.');
    const result = await dbRun('UPDATE messages SET status = ? WHERE id = ?', [status, req.params.id]);
    if (result.changes === 0) throw httpError(404, 'Message not found.');
    res.json({ success: true, status });
}));

app.post('/api/admin/messages/:id/reply', asyncHandler(async (req, res) => {
    const { replyMessage, subject } = req.body || {};
    if (typeof replyMessage !== 'string' || !replyMessage.trim()) {
        throw httpError(400, 'Reply message is required.');
    }
    if (replyMessage.length > 10000) throw httpError(400, 'Reply is too long (max 10000 characters).');
    if (!mailEnabled) throw httpError(503, 'Mail is not configured on this server.');

    // The recipient always comes from the stored message — never from the client.
    const msg = await dbGet('SELECT * FROM messages WHERE id = ?', [req.params.id]);
    if (!msg) throw httpError(404, 'Message not found.');

    await sendMail({
        from: config.smtp.from,
        to: msg.email,
        subject: (typeof subject === 'string' && subject.trim() ? subject : 'Re: your message').slice(0, 300),
        text: replyMessage,
    });
    await dbRun("UPDATE messages SET status = 'read' WHERE id = ?", [msg.id]);
    res.json({ success: true, message: 'Reply sent successfully.' });
}));

app.delete('/api/admin/messages/:id', asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM messages WHERE id = ?', [req.params.id]);
    res.json({ success: true, changes: result.changes });
}));

// ---- Settings (admin role) ----
function validateSettingValue(field, value) {
    const v = value == null ? '' : String(value);
    if (v === '') return { value: v };
    if (v.length > 5000) return { error: `Value for "${field.key}" is too long.` };
    if (field.type === 'url' && !isSafeUrl(v)) {
        return { error: `"${field.label}" must be an http(s) URL or an /uploads/ path.` };
    }
    if (field.type === 'color' && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
        return { error: `"${field.label}" must be a hex color like #ff3366.` };
    }
    return { value: v };
}

app.get('/api/admin/settings', requireAdmin, asyncHandler(async (req, res) => {
    const site = await getSiteConfig();
    res.json({ site, schema: config.siteSchema });
}));

// Bulk update — saves all settings atomically in one request.
app.put('/api/admin/settings', requireAdmin, asyncHandler(async (req, res) => {
    const { values } = req.body || {};
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
        throw httpError(400, 'values object is required.');
    }
    const updates = [];
    for (const [key, raw] of Object.entries(values)) {
        const field = config.siteSchema.find(f => f.key === key);
        if (!field) throw httpError(400, `Unknown setting key: ${key}`);
        const { error, value } = validateSettingValue(field, raw);
        if (error) throw httpError(400, error);
        updates.push([key, value]);
    }
    for (const [key, value] of updates) {
        await dbRun(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            [key, value]
        );
    }
    res.json({ success: true, site: await getSiteConfig() });
}));

// Kept for backwards compatibility: update a single setting.
app.post('/api/admin/settings', requireAdmin, asyncHandler(async (req, res) => {
    const { key, value } = req.body || {};
    if (!key) throw httpError(400, 'Key is required.');
    const field = config.siteSchema.find(f => f.key === key);
    if (!field) throw httpError(400, 'Unknown setting key.');
    const check = validateSettingValue(field, value);
    if (check.error) throw httpError(400, check.error);
    await dbRun(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, check.value]
    );
    res.json({ success: true });
}));

// ---- Users (admin role) ----
app.get('/api/admin/users', requireAdmin, asyncHandler(async (req, res) => {
    const rows = await dbAll('SELECT id, username, role, created_at FROM users ORDER BY id ASC');
    res.json(rows);
}));

app.post('/api/admin/users', requireAdmin, asyncHandler(async (req, res) => {
    const { username, password, role } = req.body || {};
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
        throw httpError(400, 'Username must be 3–50 characters (letters, numbers, . _ -).');
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
        throw httpError(400, 'Password must be 8–200 characters long.');
    }
    if (!['admin', 'editor'].includes(role)) throw httpError(400, 'Role must be "admin" or "editor".');
    try {
        const result = await dbRun(
            'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
            [username, await bcrypt.hash(password, 12), role]
        );
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        if (/UNIQUE/.test(err.message)) throw httpError(409, 'This username already exists.');
        throw err;
    }
}));

app.put('/api/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) throw httpError(404, 'User not found.');
    const { password, role } = req.body || {};

    if (role !== undefined) {
        if (!['admin', 'editor'].includes(role)) throw httpError(400, 'Role must be "admin" or "editor".');
        if (user.role === 'admin' && role !== 'admin') {
            const admins = await dbGet("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
            if (admins.c <= 1) throw httpError(400, 'Cannot demote the last admin.');
        }
        await dbRun('UPDATE users SET role = ? WHERE id = ?', [role, user.id]);
    }
    if (password !== undefined) {
        if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
            throw httpError(400, 'Password must be 8–200 characters long.');
        }
        await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 12), user.id]);
    }
    res.json({ success: true });
}));

app.delete('/api/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) throw httpError(404, 'User not found.');
    if (user.id === req.session.user.id) throw httpError(400, 'You cannot delete your own account.');
    if (user.role === 'admin') {
        const admins = await dbGet("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
        if (admins.c <= 1) throw httpError(400, 'Cannot delete the last admin.');
    }
    await dbRun('DELETE FROM users WHERE id = ?', [user.id]);
    res.json({ success: true });
}));

// ---- Export / import / backup (admin role) ----
app.get('/api/admin/export', requireAdmin, asyncHandler(async (req, res) => {
    const types = await dbAll('SELECT * FROM content_types ORDER BY id ASC');
    const typeById = {};
    types.forEach(t => { typeById[t.id] = t.slug; });
    const entries = await dbAll('SELECT * FROM content_entries ORDER BY id ASC');
    const settings = await dbAll('SELECT key, value FROM settings');

    res.setHeader('Content-Disposition', 'attachment; filename="cms-export.json"');
    res.json({
        version: 2,
        exportedAt: new Date().toISOString(),
        settings: settings.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {}),
        contentTypes: types.map(t => ({
            slug: t.slug, name: t.name, description: t.description, fields: parseFields(t),
        })),
        entries: entries.map(e => ({
            type: typeById[e.type_id],
            data: parseEntryData(e.data),
            status: e.status, sort_order: e.sort_order, publish_at: e.publish_at,
            locale: e.locale, deleted_at: e.deleted_at,
            created_at: e.created_at, updated_at: e.updated_at,
        })),
    });
}));

app.post('/api/admin/import', requireAdmin, asyncHandler(async (req, res) => {
    const payload = req.body || {};
    if (!Array.isArray(payload.contentTypes) || !Array.isArray(payload.entries)) {
        throw httpError(400, 'Invalid export file: contentTypes and entries arrays are required.');
    }
    for (const t of payload.contentTypes) {
        const { error } = validateContentType(t);
        if (error) throw httpError(400, `Invalid content type "${t && t.slug}": ${error}`);
    }

    await dbRun('BEGIN');
    try {
        await dbRun('DELETE FROM content_entries');
        await dbRun('DELETE FROM content_types');
        const idBySlug = {};
        for (const t of payload.contentTypes) {
            const { value } = validateContentType(t);
            const r = await dbRun(
                'INSERT INTO content_types (slug, name, description, fields) VALUES (?, ?, ?, ?)',
                [value.slug, value.name, value.description, JSON.stringify(value.fields)]
            );
            idBySlug[value.slug] = r.lastID;
        }
        let imported = 0;
        for (const e of payload.entries) {
            const typeId = idBySlug[e.type];
            if (!typeId || !e.data || typeof e.data !== 'object') continue;
            await dbRun(
                `INSERT INTO content_entries (type_id, data, status, sort_order, publish_at, locale, deleted_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))`,
                [typeId, JSON.stringify(e.data), e.status === 'draft' ? 'draft' : 'published',
                 Number.isInteger(e.sort_order) ? e.sort_order : 0,
                 e.publish_at || null, typeof e.locale === 'string' ? e.locale : '',
                 e.deleted_at || null, e.created_at || null, e.updated_at || null]
            );
            imported++;
        }
        if (payload.settings && typeof payload.settings === 'object') {
            for (const [key, raw] of Object.entries(payload.settings)) {
                const field = config.siteSchema.find(f => f.key === key);
                if (!field) continue;
                const { error, value } = validateSettingValue(field, raw);
                if (!error) {
                    await dbRun(
                        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
                        [key, value]
                    );
                }
            }
        }
        await dbRun('COMMIT');
        res.json({ success: true, types: payload.contentTypes.length, entries: imported });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        throw err;
    }
}));

// Consistent SQLite snapshot via VACUUM INTO.
app.get('/api/admin/backup', requireAdmin, asyncHandler(async (req, res) => {
    const backupPath = path.join(dataDir, `backup-${Date.now()}.sqlite`);
    await dbRun(`VACUUM INTO ?`, [backupPath]);
    res.download(backupPath, 'cms-backup.sqlite', (err) => {
        fs.promises.unlink(backupPath).catch(() => {});
        if (err && !res.headersSent) res.status(500).end();
    });
}));

// =============================================================================
//  Error handling
// =============================================================================
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
    next();
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
        return res.status(400).json({ error: 'Invalid request body.' });
    }
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : err.message });
    }
    if (err.status && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
    }
    // Never leak internal error details to clients.
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
});

// =============================================================================
//  Server lifecycle
// =============================================================================
let server = null;
if (require.main === module) {
    ready.then(() => {
        server = app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            if (!mailEnabled) console.log('Note: SMTP is not configured — email notifications are disabled.');
        });
    }).catch(err => {
        console.error('Failed to initialize:', err);
        process.exit(1);
    });

    function gracefulShutdown(signal) {
        console.log(`\nReceived ${signal}. Closing server gracefully...`);
        const closeDb = () => db.close((err) => {
            if (err) {
                console.error('Error closing the database connection:', err.message);
                process.exit(1);
            }
            console.log('Database connection closed.');
            process.exit(0);
        });
        if (server) {
            server.close(() => {
                console.log('HTTP server closed.');
                closeDb();
            });
        } else {
            closeDb();
        }
    }

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

module.exports = { app, ready, db };

require('dotenv').config();

const path = require('path');

const currentYear = new Date().getFullYear();

/**
 * Schema describing every editable site / branding setting.
 *
 * The `default` values are the file-based defaults (optionally sourced from
 * environment variables). At runtime each of these keys can be overridden and
 * persisted through the Admin panel (stored in the `settings` table), so the
 * effective configuration is: siteSchema default -> ENV -> settings override.
 */
const siteSchema = [
    { key: 'site_name',        label: 'Site name',           type: 'text',     default: process.env.SITE_NAME || 'My CMS' },
    { key: 'logo_text',        label: 'Logo text',           type: 'text',     default: process.env.SITE_LOGO_TEXT || 'CMS' },
    { key: 'tagline',          label: 'Tagline',             type: 'text',     default: process.env.SITE_TAGLINE || 'A flexible, content-managed website' },
    { key: 'hero_title',       label: 'Hero title',          type: 'text',     default: process.env.SITE_HERO_TITLE || 'Welcome' },
    { key: 'hero_subtitle',    label: 'Hero subtitle',       type: 'textarea', default: process.env.SITE_HERO_SUBTITLE || 'Every word on this page is editable from the admin panel.' },
    { key: 'hero_cta_label',   label: 'Hero button label',   type: 'text',     default: process.env.SITE_HERO_CTA || 'Get in touch' },
    { key: 'hero_bg',          label: 'Hero background URL', type: 'url',      default: process.env.SITE_HERO_BG || 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1920&q=80' },
    { key: 'primary_color',    label: 'Primary color',       type: 'color',    default: process.env.SITE_PRIMARY_COLOR || '#ff3366' },
    { key: 'secondary_color',  label: 'Secondary color',     type: 'color',    default: process.env.SITE_SECONDARY_COLOR || '#7b2cbf' },
    { key: 'contact_heading',  label: 'Contact heading',     type: 'text',     default: process.env.SITE_CONTACT_HEADING || 'Contact' },
    { key: 'contact_intro',    label: 'Contact intro',       type: 'textarea', default: process.env.SITE_CONTACT_INTRO || 'Send a message and we will get back to you.' },
    { key: 'footer_text',      label: 'Footer text',         type: 'text',     default: process.env.SITE_FOOTER_TEXT || ('© ' + currentYear + ' My CMS. All rights reserved.') },
    { key: 'meta_description', label: 'Meta description (SEO)', type: 'textarea', default: process.env.SITE_META_DESCRIPTION || '' },
    { key: 'site_url',         label: 'Public site URL (for sitemap/SEO)', type: 'url', default: process.env.SITE_URL || '' },
    { key: 'content_locales',  label: 'Content locales (comma separated, empty = disabled)', type: 'text', default: process.env.CONTENT_LOCALES || '' },
    { key: 'webhook_url',      label: 'Webhook URL (called on content changes)', type: 'url', default: process.env.WEBHOOK_URL || '' },
];

/**
 * Field types available when defining content types in the Admin panel.
 * These drive both validation on the server and rendering on the frontend.
 */
const fieldTypes = ['text', 'textarea', 'markdown', 'number', 'date', 'url', 'image', 'boolean', 'select', 'relation'];

/**
 * Content types seeded into an empty database on first run. They are only a
 * starting point — every type (and its fields) can be edited or deleted from
 * the Admin panel afterwards.
 */
const seedContentTypes = [
    {
        slug: 'posts',
        name: 'Posts',
        description: 'Generic articles or news posts.',
        fields: [
            { name: 'title', label: 'Title', type: 'text', required: true },
            { name: 'body', label: 'Body', type: 'markdown', required: false },
            { name: 'image', label: 'Image URL', type: 'image', required: false },
            { name: 'date', label: 'Date', type: 'date', required: false },
        ],
    },
    {
        slug: 'events',
        name: 'Events',
        description: 'Upcoming events with a date and location.',
        fields: [
            { name: 'title', label: 'Title', type: 'text', required: true },
            { name: 'date', label: 'Date', type: 'date', required: true },
            { name: 'location', label: 'Location', type: 'text', required: false },
            { name: 'link', label: 'Link', type: 'url', required: false },
        ],
    },
];

const config = {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',

    // Data directory (SQLite database, session store, uploads).
    dataDir: process.env.DATA_DIR || path.join(__dirname, 'data'),

    // Set to "1" when the app runs behind a TLS-terminating reverse proxy so
    // secure cookies and client IPs (rate limiting) work correctly.
    trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',

    // Initial admin account, created only when the users table is empty.
    // If ADMIN_PASS is empty or a known placeholder, a random password is
    // generated and printed once to the server log.
    admin: {
        user: process.env.ADMIN_USER || 'admin',
        pass: process.env.ADMIN_PASS || '',
    },

    session: {
        // If unset, a random secret is generated on boot (sessions are then
        // invalidated on every restart — fine for testing, set it in prod).
        secret: process.env.SESSION_SECRET || '',
        maxAgeHours: parseInt(process.env.SESSION_MAX_AGE_HOURS, 10) || 8,
    },

    uploads: {
        maxBytes: (parseInt(process.env.UPLOAD_MAX_MB, 10) || 8) * 1024 * 1024,
    },

    smtp: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM,
        to: process.env.SMTP_TO,
    },

    siteSchema,
    fieldTypes,
    seedContentTypes,

    // Flat map of default site values, e.g. { site_name: 'My CMS', ... }
    siteDefaults: siteSchema.reduce((acc, f) => { acc[f.key] = f.default; return acc; }, {}),
};

module.exports = config;

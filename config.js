require('dotenv').config();

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
    { key: 'site_name',       label: 'Site name',          type: 'text',     default: process.env.SITE_NAME || 'My CMS' },
    { key: 'logo_text',       label: 'Logo text',          type: 'text',     default: process.env.SITE_LOGO_TEXT || 'CMS' },
    { key: 'tagline',         label: 'Tagline',            type: 'text',     default: process.env.SITE_TAGLINE || 'A flexible, content-managed website' },
    { key: 'hero_title',      label: 'Hero title',         type: 'text',     default: process.env.SITE_HERO_TITLE || 'Welcome' },
    { key: 'hero_subtitle',   label: 'Hero subtitle',      type: 'textarea', default: process.env.SITE_HERO_SUBTITLE || 'Every word on this page is editable from the admin panel.' },
    { key: 'hero_cta_label',  label: 'Hero button label',  type: 'text',     default: process.env.SITE_HERO_CTA || 'Get in touch' },
    { key: 'hero_bg',         label: 'Hero background URL', type: 'url',      default: process.env.SITE_HERO_BG || 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1920&q=80' },
    { key: 'primary_color',   label: 'Primary color',      type: 'text',     default: process.env.SITE_PRIMARY_COLOR || '#ff3366' },
    { key: 'secondary_color', label: 'Secondary color',    type: 'text',     default: process.env.SITE_SECONDARY_COLOR || '#7b2cbf' },
    { key: 'contact_heading', label: 'Contact heading',    type: 'text',     default: process.env.SITE_CONTACT_HEADING || 'Contact' },
    { key: 'contact_intro',   label: 'Contact intro',      type: 'textarea', default: process.env.SITE_CONTACT_INTRO || 'Send a message and we will get back to you.' },
    { key: 'footer_text',     label: 'Footer text',        type: 'text',     default: process.env.SITE_FOOTER_TEXT || ('© ' + currentYear + ' My CMS. All rights reserved.') },
];

/**
 * Field types available when defining content types in the Admin panel.
 * These drive both validation on the server and rendering on the frontend.
 */
const fieldTypes = ['text', 'textarea', 'number', 'date', 'url', 'image', 'boolean'];

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
            { name: 'body', label: 'Body', type: 'textarea', required: false },
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

    admin: {
        user: process.env.ADMIN_USER || 'admin',
        pass: process.env.ADMIN_PASS || 'admin',
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

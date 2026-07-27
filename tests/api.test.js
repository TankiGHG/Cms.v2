/* End-to-end API tests: boot the real app against a throwaway data
 * directory and exercise auth, CSRF, validation, publishing and messages. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-test-'));
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'test-password-123';
process.env.SESSION_SECRET = 'test-secret';

const { app, ready, db } = require('../server');

let server;
let base;

// Minimal cookie jar + CSRF handling for authenticated requests.
let cookie = '';
let csrf = '';

async function req(method, url, { body, headers = {}, raw = false, auth = true } = {}) {
    const opts = { method, headers: { ...headers } };
    if (auth && cookie) opts.headers.Cookie = cookie;
    if (auth && csrf && !['GET', 'HEAD'].includes(method)) opts.headers['X-CSRF-Token'] = csrf;
    if (body !== undefined && !(body instanceof FormData)) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
        opts.body = body;
    }
    const res = await fetch(base + url, opts);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    if (raw) return res;
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, data, res };
}

test.before(async () => {
    await ready;
    await new Promise(resolve => {
        server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('healthz responds ok', async () => {
    const { status, data } = await req('GET', '/healthz');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'ok');
});

test('admin API requires authentication', async () => {
    const res = await fetch(base + '/api/admin/content-types');
    assert.strictEqual(res.status, 401);
});

test('admin static area redirects anonymous users to login', async () => {
    const res = await fetch(base + '/admin/', { redirect: 'manual' });
    assert.strictEqual(res.status, 302);
    assert.match(res.headers.get('location'), /\/admin\/login\.html$/);
});

test('login rejects wrong credentials', async () => {
    const { status } = await req('POST', '/api/auth/login', {
        body: { username: 'admin', password: 'wrong-password' }, auth: false,
    });
    assert.strictEqual(status, 401);
});

test('login succeeds with seeded admin and returns CSRF token', async () => {
    const { status, data } = await req('POST', '/api/auth/login', {
        body: { username: 'admin', password: 'test-password-123' },
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.user.username, 'admin');
    assert.strictEqual(data.user.role, 'admin');
    assert.ok(data.csrfToken);
    csrf = data.csrfToken;
});

test('mutating admin request without CSRF token is rejected', async () => {
    const res = await fetch(base + '/api/admin/content-types', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'x', name: 'X', fields: [{ name: 'a', type: 'text' }] }),
    });
    assert.strictEqual(res.status, 403);
});

test('content type CRUD with validation', async () => {
    // invalid slug
    let r = await req('POST', '/api/admin/content-types', {
        body: { slug: 'Bad Slug!', name: 'Bad', fields: [{ name: 'a', type: 'text' }] },
    });
    assert.strictEqual(r.status, 400);

    // invalid field type
    r = await req('POST', '/api/admin/content-types', {
        body: { slug: 'bad', name: 'Bad', fields: [{ name: 'a', type: 'nope' }] },
    });
    assert.strictEqual(r.status, 400);

    // select without options
    r = await req('POST', '/api/admin/content-types', {
        body: { slug: 'bad', name: 'Bad', fields: [{ name: 'a', type: 'select' }] },
    });
    assert.strictEqual(r.status, 400);

    // valid
    r = await req('POST', '/api/admin/content-types', {
        body: {
            slug: 'articles', name: 'Articles',
            fields: [
                { name: 'title', label: 'Title', type: 'text', required: true },
                { name: 'count', label: 'Count', type: 'number' },
                { name: 'link', label: 'Link', type: 'url' },
                { name: 'category', label: 'Category', type: 'select', options: ['news', 'blog'] },
            ],
        },
    });
    assert.strictEqual(r.status, 201);

    // duplicate slug
    r = await req('POST', '/api/admin/content-types', {
        body: { slug: 'articles', name: 'Dup', fields: [{ name: 'a', type: 'text' }] },
    });
    assert.strictEqual(r.status, 409);
});

test('entry validation enforces field types', async () => {
    // missing required field
    let r = await req('POST', '/api/admin/content/articles', { body: { data: {} } });
    assert.strictEqual(r.status, 400);

    // number field rejects non-numbers
    r = await req('POST', '/api/admin/content/articles', {
        body: { data: { title: 'T', count: 'abc' } },
    });
    assert.strictEqual(r.status, 400);

    // url field rejects javascript: URLs
    r = await req('POST', '/api/admin/content/articles', {
        body: { data: { title: 'T', link: 'javascript:alert(1)' } },
    });
    assert.strictEqual(r.status, 400);

    // select field rejects unknown option
    r = await req('POST', '/api/admin/content/articles', {
        body: { data: { title: 'T', category: 'nope' } },
    });
    assert.strictEqual(r.status, 400);

    // valid entry
    r = await req('POST', '/api/admin/content/articles', {
        body: { data: { title: 'Hello', count: '5', link: 'https://example.com', category: 'news' } },
    });
    assert.strictEqual(r.status, 201);
});

test('public API only lists published, non-deleted, non-scheduled entries', async () => {
    // draft
    await req('POST', '/api/admin/content/articles', {
        body: { data: { title: 'Draft entry' }, status: 'draft' },
    });
    // scheduled in the future
    await req('POST', '/api/admin/content/articles', {
        body: { data: { title: 'Scheduled entry' }, publish_at: '2999-01-01 10:00' },
    });

    const { status, data } = await req('GET', '/api/content/articles', { auth: false });
    assert.strictEqual(status, 200);
    const titles = data.entries.map(e => e.data.title);
    assert.ok(titles.includes('Hello'));
    assert.ok(!titles.includes('Draft entry'));
    assert.ok(!titles.includes('Scheduled entry'));
    assert.strictEqual(typeof data.total, 'number');

    // number was stored as a real number
    const hello = data.entries.find(e => e.data.title === 'Hello');
    assert.strictEqual(hello.data.count, 5);
});

test('soft delete, restore and versions', async () => {
    const create = await req('POST', '/api/admin/content/articles', {
        body: { data: { title: 'Trash me' } },
    });
    const id = create.data.id;

    // update creates a version
    let r = await req('PUT', `/api/admin/content/articles/${id}`, {
        body: { data: { title: 'Trash me v2' } },
    });
    assert.strictEqual(r.status, 200);
    r = await req('GET', `/api/admin/content/articles/${id}/versions`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.length, 1);
    assert.strictEqual(r.data[0].data.title, 'Trash me');

    // soft delete hides it from the public API
    r = await req('DELETE', `/api/admin/content/articles/${id}`);
    assert.strictEqual(r.status, 200);
    let pub = await req('GET', `/api/content/articles/${id}`, { auth: false });
    assert.strictEqual(pub.status, 404);

    // it shows up in the trash and can be restored
    r = await req('GET', '/api/admin/content/articles?trash=1');
    assert.ok(r.data.entries.some(e => e.id === id));
    r = await req('POST', `/api/admin/content/articles/${id}/restore`);
    assert.strictEqual(r.status, 200);
    pub = await req('GET', `/api/content/articles/${id}`, { auth: false });
    assert.strictEqual(pub.status, 200);

    // revert to the first version
    const versions = await req('GET', `/api/admin/content/articles/${id}/versions`);
    r = await req('POST', `/api/admin/content/articles/${id}/revert/${versions.data[0].id}`);
    assert.strictEqual(r.status, 200);
    pub = await req('GET', `/api/content/articles/${id}`, { auth: false });
    assert.strictEqual(pub.data.data.title, 'Trash me');
});

test('field rename migrates entry data', async () => {
    const types = await req('GET', '/api/admin/content-types');
    const articles = types.data.find(t => t.slug === 'articles');
    const fields = articles.fields.map(f =>
        f.name === 'count' ? { ...f, name: 'amount', renamedFrom: 'count' } : f
    );
    const r = await req('PUT', `/api/admin/content-types/${articles.id}`, {
        body: { slug: 'articles', name: 'Articles', fields },
    });
    assert.strictEqual(r.status, 200);

    const pub = await req('GET', '/api/content/articles', { auth: false });
    const hello = pub.data.entries.find(e => e.data.title === 'Hello');
    assert.strictEqual(hello.data.amount, 5);
    assert.ok(!('count' in hello.data));
});

test('contact form validation and honeypot', async () => {
    // missing email
    let r = await req('POST', '/api/messages', { body: { name: 'A' }, auth: false });
    assert.strictEqual(r.status, 400);

    // invalid email
    r = await req('POST', '/api/messages', { body: { name: 'A', email: 'not-an-email' }, auth: false });
    assert.strictEqual(r.status, 400);

    // honeypot filled: fake success, nothing stored
    r = await req('POST', '/api/messages', {
        body: { name: 'Bot', email: 'bot@example.com', website: 'http://spam' }, auth: false,
    });
    assert.strictEqual(r.status, 201);

    // valid message
    r = await req('POST', '/api/messages', {
        body: { name: 'Alice', email: 'alice@example.com', subject: 'Hi', body: 'Hello!' }, auth: false,
    });
    assert.strictEqual(r.status, 201);

    const inbox = await req('GET', '/api/admin/messages');
    assert.strictEqual(inbox.status, 200);
    const names = inbox.data.messages.map(m => m.name);
    assert.ok(names.includes('Alice'));
    assert.ok(!names.includes('Bot'));
});

test('settings: bulk update validates keys and values', async () => {
    let r = await req('PUT', '/api/admin/settings', { body: { values: { nope: 'x' } } });
    assert.strictEqual(r.status, 400);

    r = await req('PUT', '/api/admin/settings', { body: { values: { primary_color: 'red' } } });
    assert.strictEqual(r.status, 400);

    r = await req('PUT', '/api/admin/settings', { body: { values: { hero_bg: 'javascript:alert(1)' } } });
    assert.strictEqual(r.status, 400);

    r = await req('PUT', '/api/admin/settings', {
        body: { values: { site_name: 'Test Site', primary_color: '#123abc' } },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.site.site_name, 'Test Site');

    const cfg = await req('GET', '/api/config', { auth: false });
    assert.strictEqual(cfg.data.site.site_name, 'Test Site');
    // internal settings must not leak to the public config
    assert.ok(!('webhook_url' in cfg.data.site));
});

test('users: editor role has limited permissions', async () => {
    let r = await req('POST', '/api/admin/users', {
        body: { username: 'editor1', password: 'editor-pass-123', role: 'editor' },
    });
    assert.strictEqual(r.status, 201);

    // weak password rejected
    r = await req('POST', '/api/admin/users', {
        body: { username: 'weak', password: 'short', role: 'editor' },
    });
    assert.strictEqual(r.status, 400);

    // switch session to the editor
    const adminCookie = cookie, adminCsrf = csrf;
    cookie = ''; csrf = '';
    r = await req('POST', '/api/auth/login', {
        body: { username: 'editor1', password: 'editor-pass-123' },
    });
    assert.strictEqual(r.status, 200);
    csrf = r.data.csrfToken;

    // editors can write content …
    r = await req('POST', '/api/admin/content/articles', {
        body: { data: { title: 'By editor' }, status: 'draft' },
    });
    assert.strictEqual(r.status, 201);

    // … but not manage settings, users or content types
    r = await req('PUT', '/api/admin/settings', { body: { values: { site_name: 'Hacked' } } });
    assert.strictEqual(r.status, 403);
    r = await req('GET', '/api/admin/users');
    assert.strictEqual(r.status, 403);
    r = await req('POST', '/api/admin/content-types', {
        body: { slug: 'sneaky', name: 'Sneaky', fields: [{ name: 'a', type: 'text' }] },
    });
    assert.strictEqual(r.status, 403);

    cookie = adminCookie; csrf = adminCsrf;
});

test('last admin cannot be deleted or demoted', async () => {
    const users = await req('GET', '/api/admin/users');
    const admin = users.data.find(u => u.username === 'admin');
    let r = await req('DELETE', `/api/admin/users/${admin.id}`);
    assert.strictEqual(r.status, 400);   // own account
    r = await req('PUT', `/api/admin/users/${admin.id}`, { body: { role: 'editor' } });
    assert.strictEqual(r.status, 400);   // last admin
});

test('export contains types, entries and settings', async () => {
    const { status, data } = await req('GET', '/api/admin/export');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.version, 2);
    assert.ok(data.contentTypes.some(t => t.slug === 'articles'));
    assert.ok(data.entries.length > 0);
    assert.strictEqual(data.settings.site_name, 'Test Site');
});

test('sitemap and robots are served', async () => {
    let res = await fetch(base + '/robots.txt');
    assert.strictEqual(res.status, 200);
    const robots = await res.text();
    assert.match(robots, /Disallow: \/admin/);

    res = await fetch(base + '/sitemap.xml');
    assert.strictEqual(res.status, 200);
    const xml = await res.text();
    assert.match(xml, /<urlset/);
    assert.match(xml, /\/c\/articles\//);
});

test('index page gets server-side meta tags, detail page entry title', async () => {
    let res = await fetch(base + '/');
    let html = await res.text();
    assert.match(html, /<title>Test Site<\/title>/);
    assert.ok(!html.includes('{{PAGE_TITLE}}'));

    const pub = await req('GET', '/api/content/articles', { auth: false });
    const hello = pub.data.entries.find(e => e.data.title === 'Hello');
    res = await fetch(base + `/c/articles/${hello.id}`);
    html = await res.text();
    assert.match(html, /<title>Hello – Test Site<\/title>/);
});

test('internal errors do not leak details', async () => {
    const { status, data } = await req('POST', '/api/messages', {
        body: undefined, headers: { 'Content-Type': 'application/json' }, auth: false,
    });
    // empty body with JSON content type → clean 400, no stack traces
    assert.strictEqual(status, 400);
    assert.ok(data && data.error);
    assert.ok(!/sqlite|stack trace/i.test(data.error));
});

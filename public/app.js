/* Public frontend for the generic CMS.
 * Renders branding, content sections with pagination, entry detail pages
 * (/c/:slug/:id) and the contact form. All user content is escaped before it
 * touches the DOM; markdown is rendered by a small safe subset renderer. */
(function () {
    'use strict';

    const API = '';
    const PAGE_SIZE = 12;
    const LANG = new URLSearchParams(location.search).get('lang') || '';

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return unsafe.toString()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function isHttpUrl(v) {
        return typeof v === 'string' && /^https?:\/\//i.test(v);
    }

    function isSafeSrc(v) {
        return isHttpUrl(v) || (typeof v === 'string' && v.startsWith('/uploads/') && !v.includes('..'));
    }

    // Minimal, safe markdown renderer: input is HTML-escaped first, then a
    // small subset of markdown is applied. Only http(s) links survive.
    function renderMarkdown(src) {
        const lines = escapeHtml(src).split(/\r?\n/);
        const out = [];
        let list = null;   // 'ul' | 'ol'
        let para = [];

        const inline = (s) => s
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
                '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

        const flushPara = () => {
            if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; }
        };
        const flushList = () => {
            if (list) { out.push('</' + list + '>'); list = null; }
        };

        for (const raw of lines) {
            const line = raw.trimEnd();
            const h = line.match(/^(#{1,3})\s+(.*)$/);
            const ul = line.match(/^[-*]\s+(.*)$/);
            const ol = line.match(/^\d+\.\s+(.*)$/);
            const bq = line.match(/^&gt;\s?(.*)$/);

            if (line === '') { flushPara(); flushList(); continue; }
            if (h) { flushPara(); flushList(); out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); continue; }
            if (bq) { flushPara(); flushList(); out.push('<blockquote><p>' + inline(bq[1]) + '</p></blockquote>'); continue; }
            if (ul) { flushPara(); if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(ul[1]) + '</li>'); continue; }
            if (ol) { flushPara(); if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(ol[1]) + '</li>'); continue; }
            flushList();
            para.push(line);
        }
        flushPara(); flushList();
        return out.join('\n');
    }

    function applyBranding(site) {
        document.documentElement.style.setProperty('--primary-color', site.primary_color || '#ff3366');
        document.documentElement.style.setProperty('--secondary-color', site.secondary_color || '#7b2cbf');
        const bg = isSafeSrc(site.hero_bg) ? site.hero_bg : '';
        document.documentElement.style.setProperty('--hero-bg', bg ? `url('${bg.replace(/'/g, '%27')}')` : 'none');

        document.getElementById('nav-logo').textContent = site.logo_text || site.site_name || '';
        document.getElementById('hero-title').textContent = site.hero_title || site.site_name || '';
        document.getElementById('hero-subtitle').textContent = site.hero_subtitle || site.tagline || '';
        document.getElementById('hero-cta').textContent = site.hero_cta_label || 'Contact';
        document.getElementById('nav-cta').textContent = site.hero_cta_label || 'Contact';
        document.getElementById('contact-heading').textContent = site.contact_heading || 'Contact';
        document.getElementById('contact-intro').textContent = site.contact_intro || '';
        document.getElementById('footer-text').textContent = site.footer_text || '';
    }

    function buildNav(types) {
        const nav = document.getElementById('nav-links');
        const cta = document.getElementById('nav-cta');
        types.forEach(t => {
            const a = document.createElement('a');
            a.href = '/#type-' + t.slug;
            a.textContent = t.name;
            nav.insertBefore(a, cta);
        });
    }

    function detailUrl(slug, id) {
        return `/c/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`;
    }

    function renderFieldValue(field, value) {
        if (value === '' || value === null || value === undefined) return '';
        switch (field.type) {
            case 'image': return '';  // handled separately
            case 'url':
                if (!isHttpUrl(value)) return '';
                return `<a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer" class="btn">${escapeHtml(field.label)}</a>`;
            case 'date': {
                const d = new Date(value);
                const text = isNaN(d) ? value : d.toLocaleDateString();
                return `<div class="card-field"><span class="lbl">${escapeHtml(field.label)}</span>${escapeHtml(text)}</div>`;
            }
            case 'boolean':
                return `<div class="card-field"><span class="lbl">${escapeHtml(field.label)}</span>${value ? 'Yes' : 'No'}</div>`;
            case 'textarea':
                return `<div class="card-field"><span class="lbl">${escapeHtml(field.label)}</span>${escapeHtml(value).replace(/\n/g, '<br>')}</div>`;
            case 'markdown':
                return `<div class="card-field"><span class="lbl">${escapeHtml(field.label)}</span><div class="md">${renderMarkdown(value)}</div></div>`;
            case 'relation': {
                if (!value || typeof value !== 'object' || !value.title) return '';
                const link = field.relatedType
                    ? `<a href="${detailUrl(field.relatedType, value.id)}">${escapeHtml(value.title)}</a>`
                    : escapeHtml(value.title);
                return `<div class="card-field"><span class="lbl">${escapeHtml(field.label)}</span>${link}</div>`;
            }
            default:
                return `<div class="card-field"><span class="lbl">${escapeHtml(field.label)}</span>${escapeHtml(value)}</div>`;
        }
    }

    function titleFieldOf(type) {
        const fields = type.fields || [];
        return fields.find(f => f.name === 'title') || fields.find(f => f.type === 'text');
    }

    function renderEntry(type, entry) {
        const data = entry.data || {};
        const fields = type.fields || [];

        const imageField = fields.find(f => f.type === 'image' && isSafeSrc(data[f.name]));
        const titleField = titleFieldOf(type);
        const title = titleField ? data[titleField.name] : '';
        const url = detailUrl(type.slug, entry.id);

        let inner = '';
        if (imageField) inner += `<a href="${url}"><img src="${escapeHtml(data[imageField.name])}" alt="${escapeHtml(title)}" loading="lazy"></a>`;
        inner += '<div class="card-body">';
        if (title) inner += `<div class="card-title"><a href="${url}">${escapeHtml(title)}</a></div>`;
        fields.forEach(f => {
            if (f === imageField || f === titleField) return;
            // Long markdown bodies are truncated on cards; the detail page has it all.
            if (f.type === 'markdown' && typeof data[f.name] === 'string' && data[f.name].length > 400) {
                inner += renderFieldValue({ ...f, type: 'textarea' }, data[f.name].slice(0, 400) + '…');
                return;
            }
            inner += renderFieldValue(f, data[f.name]);
        });
        inner += '</div>';
        return `<div class="card">${inner}</div>`;
    }

    async function fetchEntries(slug, page) {
        const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
        if (LANG) params.set('locale', LANG);
        const res = await fetch(`${API}/api/content/${encodeURIComponent(slug)}?${params}`);
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
    }

    async function renderContentSections(types) {
        const container = document.getElementById('content-sections');
        for (const type of types) {
            const section = document.createElement('section');
            section.className = 'block';
            section.id = 'type-' + type.slug;
            section.innerHTML = `
                <h2 class="section-title">${escapeHtml(type.name)}</h2>
                ${type.description ? `<p class="section-desc">${escapeHtml(type.description)}</p>` : ''}
                <div class="cards"><div class="empty">Loading…</div></div>
                <div class="load-more-wrap"></div>`;
            container.appendChild(section);

            const cards = section.querySelector('.cards');
            const moreWrap = section.querySelector('.load-more-wrap');
            let page = 1;
            let shown = 0;

            const loadPage = async () => {
                const result = await fetchEntries(type.slug, page);
                const entries = result.entries || [];
                if (page === 1) cards.innerHTML = '';
                cards.insertAdjacentHTML('beforeend', entries.map(e => renderEntry(type, e)).join(''));
                shown += entries.length;
                moreWrap.innerHTML = '';
                if (shown < (result.total || 0)) {
                    const btn = document.createElement('button');
                    btn.className = 'btn';
                    btn.textContent = 'Load more';
                    btn.addEventListener('click', async () => {
                        page += 1;
                        btn.disabled = true;
                        try { await loadPage(); } catch { btn.disabled = false; }
                    });
                    moreWrap.appendChild(btn);
                }
                return result.total || 0;
            };

            try {
                const total = await loadPage();
                if (total === 0) section.style.display = 'none';   // hide empty sections
            } catch (err) {
                cards.innerHTML = '<div class="empty">Could not load content.</div>';
            }
        }
    }

    // ---- Detail view (/c/:slug/:id) ----
    async function renderDetail(slug, id, cfg) {
        const type = (cfg.contentTypes || []).find(t => t.slug === slug);
        const container = document.getElementById('content-sections');
        document.getElementById('hero').classList.add('compact');

        const section = document.createElement('section');
        section.className = 'block';
        container.appendChild(section);

        if (!type) {
            section.innerHTML = '<p class="empty">Page not found.</p>';
            return;
        }
        try {
            const res = await fetch(`${API}/api/content/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`);
            if (!res.ok) throw new Error('not found');
            const entry = await res.json();
            const data = entry.data || {};
            const titleField = titleFieldOf(type);
            const title = titleField ? data[titleField.name] : '';
            if (title) document.getElementById('hero-title').textContent = title;

            const imageField = (type.fields || []).find(f => f.type === 'image' && isSafeSrc(data[f.name]));
            let html = `<div class="detail-wrap"><a class="back-link" href="/">← Back</a>`;
            if (imageField) html += `<img class="detail-img" src="${escapeHtml(data[imageField.name])}" alt="${escapeHtml(title)}">`;
            (type.fields || []).forEach(f => {
                if (f === imageField || f === titleField) return;
                html += renderFieldValue(f, data[f.name]);
            });
            html += '</div>';
            section.innerHTML = html;
        } catch {
            section.innerHTML = '<p class="empty">This entry does not exist (or is not published).</p>';
        }
    }

    // ---- Contact form ----
    document.getElementById('contact-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('form-feedback');
        feedback.textContent = 'Sending...';
        feedback.style.color = 'var(--primary-color)';

        const payload = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            subject: document.getElementById('subject').value,
            body: document.getElementById('body').value,
            website: document.getElementById('website').value,   // honeypot
        };
        try {
            const res = await fetch(`${API}/api/messages`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (res.ok || res.status === 201) {
                feedback.textContent = result.message || 'Message sent.';
                feedback.style.color = '#0f0';
                e.target.reset();
            } else {
                feedback.textContent = result.error || 'Failed to send.';
                feedback.style.color = 'red';
            }
        } catch (err) {
            feedback.textContent = 'Network error. Please try again later.';
            feedback.style.color = 'red';
        }
    });

    async function init() {
        try {
            const res = await fetch(`${API}/api/config`);
            const cfg = await res.json();
            applyBranding(cfg.site || {});
            buildNav(cfg.contentTypes || []);

            const detail = location.pathname.match(/^\/c\/([a-z0-9-]+)\/(\d+)$/);
            if (detail) {
                await renderDetail(detail[1], detail[2], cfg);
            } else {
                await renderContentSections(cfg.contentTypes || []);
            }
        } catch (err) {
            document.getElementById('hero-title').textContent = 'Configuration error';
            console.error(err);
        }
    }

    init();
})();

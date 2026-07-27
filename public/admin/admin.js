/* Admin panel for the generic CMS.
 * Talks to /api/admin with session cookies + CSRF token, supports the
 * editor/admin roles and a small DE/EN interface translation. */
(function () {
    'use strict';

    const API = '/api/admin';
    const LIMIT = 20;

    // ---- i18n ---------------------------------------------------------------
    const I18N = {
        en: {
            changePassword: 'Change password', viewSite: 'View site ↗', logout: 'Logout',
            tabContent: 'Content', tabTypes: 'Content Types', tabMessages: 'Messages',
            tabMedia: 'Media', tabUsers: 'Users', tabSettings: 'Settings',
            contentType: 'Content type', search: 'Search', filter: 'Filter',
            filterAll: 'All', filterPublished: 'Published', filterDraft: 'Drafts', filterTrash: 'Trash',
            newEntry: 'New entry', editEntry: 'Edit entry', status: 'Status',
            statusPublished: 'Published', statusDraft: 'Draft',
            publishAt: 'Publish at (optional)', locale: 'Language',
            saveEntry: 'Save entry', cancelEdit: 'Cancel edit', existingEntries: 'Existing entries',
            newType: 'New content type', editType: 'Edit', name: 'Name', description: 'Description',
            fields: 'Fields', addField: '+ Add field', saveType: 'Save content type',
            existingTypes: 'Existing content types',
            msgNew: 'New', msgRead: 'Read', msgArchived: 'Archived', inbox: 'Inbox',
            uploadImage: 'Upload image', mediaLibrary: 'Media library',
            newUser: 'New user', username: 'Username', password: 'Password', role: 'Role',
            createUser: 'Create user', existingUsers: 'Users',
            siteSettings: 'Site settings', saveSettings: 'Save settings',
            backupExport: 'Backup & export', exportJson: 'Export content (JSON)',
            backupDb: 'Download DB backup', importJson: 'Import content (JSON)',
            importWarning: 'Import replaces all content types and entries with the file contents.',
            replyTitle: 'Reply to message', subject: 'Subject', message: 'Message',
            sendEmail: 'Send email', cancel: 'Cancel', versionsTitle: 'Entry versions', close: 'Close',
            currentPassword: 'Current password', newPassword: 'New password (min. 8 characters)', save: 'Save',
            saving: 'Saving…', saved: 'Saved.', sending: 'Sending…', sent: 'Sent.',
            networkError: 'Network error.', failed: 'Failed.', loading: 'Loading…',
            noEntries: 'No entries yet.', noTypes: 'No content types yet.', noMessages: 'No messages.',
            noFiles: 'No files uploaded yet.', noVersions: 'No versions yet.',
            createTypeFirst: 'Create a content type first.',
            edit: 'Edit', del: 'Delete', restore: 'Restore', deleteForever: 'Delete forever',
            versions: 'Versions', reply: 'Reply', read: 'Read', archive: 'Archive',
            copyUrl: 'Copy URL', copied: 'Copied!', untitled: '(untitled)',
            prev: '‹ Prev', next: 'Next ›', pageOf: (p, n) => `Page ${p} of ${n}`,
            entriesCount: (n) => `${n} entries`,
            confirmTrashEntry: 'Move this entry to the trash?',
            confirmDeleteForever: 'Permanently delete this entry? This cannot be undone.',
            confirmDeleteType: (n) => `Delete content type "${n}" and ALL its entries?`,
            confirmDeleteMsg: 'Delete this message?',
            confirmDeleteUser: (n) => `Delete user "${n}"?`,
            confirmDeleteMedia: (n) => `Delete file "${n}"?`,
            confirmRevert: 'Revert the entry to this version?',
            confirmImport: 'This will REPLACE all content types and entries. Continue?',
            importDone: (t, e) => `Imported ${t} types and ${e} entries.`,
            resetPassword: 'Set password', promptNewPassword: 'New password (min. 8 characters):',
            uploadBtn: 'Upload', options: 'Options (comma separated)', relatedTypeLbl: 'Related type',
            required: 'req', selectEntry: '— select —', scheduled: 'scheduled',
        },
        de: {
            changePassword: 'Passwort ändern', viewSite: 'Seite ansehen ↗', logout: 'Abmelden',
            tabContent: 'Inhalte', tabTypes: 'Inhaltstypen', tabMessages: 'Nachrichten',
            tabMedia: 'Medien', tabUsers: 'Benutzer', tabSettings: 'Einstellungen',
            contentType: 'Inhaltstyp', search: 'Suche', filter: 'Filter',
            filterAll: 'Alle', filterPublished: 'Veröffentlicht', filterDraft: 'Entwürfe', filterTrash: 'Papierkorb',
            newEntry: 'Neuer Eintrag', editEntry: 'Eintrag bearbeiten', status: 'Status',
            statusPublished: 'Veröffentlicht', statusDraft: 'Entwurf',
            publishAt: 'Veröffentlichen am (optional)', locale: 'Sprache',
            saveEntry: 'Eintrag speichern', cancelEdit: 'Abbrechen', existingEntries: 'Vorhandene Einträge',
            newType: 'Neuer Inhaltstyp', editType: 'Bearbeiten', name: 'Name', description: 'Beschreibung',
            fields: 'Felder', addField: '+ Feld hinzufügen', saveType: 'Inhaltstyp speichern',
            existingTypes: 'Vorhandene Inhaltstypen',
            msgNew: 'Neu', msgRead: 'Gelesen', msgArchived: 'Archiviert', inbox: 'Posteingang',
            uploadImage: 'Bild hochladen', mediaLibrary: 'Medienbibliothek',
            newUser: 'Neuer Benutzer', username: 'Benutzername', password: 'Passwort', role: 'Rolle',
            createUser: 'Benutzer anlegen', existingUsers: 'Benutzer',
            siteSettings: 'Seiten-Einstellungen', saveSettings: 'Einstellungen speichern',
            backupExport: 'Backup & Export', exportJson: 'Inhalte exportieren (JSON)',
            backupDb: 'DB-Backup herunterladen', importJson: 'Inhalte importieren (JSON)',
            importWarning: 'Der Import ersetzt alle Inhaltstypen und Einträge durch den Dateiinhalt.',
            replyTitle: 'Auf Nachricht antworten', subject: 'Betreff', message: 'Nachricht',
            sendEmail: 'E-Mail senden', cancel: 'Abbrechen', versionsTitle: 'Versionen des Eintrags', close: 'Schließen',
            currentPassword: 'Aktuelles Passwort', newPassword: 'Neues Passwort (min. 8 Zeichen)', save: 'Speichern',
            saving: 'Speichere…', saved: 'Gespeichert.', sending: 'Sende…', sent: 'Gesendet.',
            networkError: 'Netzwerkfehler.', failed: 'Fehlgeschlagen.', loading: 'Lade…',
            noEntries: 'Noch keine Einträge.', noTypes: 'Noch keine Inhaltstypen.', noMessages: 'Keine Nachrichten.',
            noFiles: 'Noch keine Dateien hochgeladen.', noVersions: 'Noch keine Versionen.',
            createTypeFirst: 'Lege zuerst einen Inhaltstyp an.',
            edit: 'Bearbeiten', del: 'Löschen', restore: 'Wiederherstellen', deleteForever: 'Endgültig löschen',
            versions: 'Versionen', reply: 'Antworten', read: 'Gelesen', archive: 'Archivieren',
            copyUrl: 'URL kopieren', copied: 'Kopiert!', untitled: '(ohne Titel)',
            prev: '‹ Zurück', next: 'Weiter ›', pageOf: (p, n) => `Seite ${p} von ${n}`,
            entriesCount: (n) => `${n} Einträge`,
            confirmTrashEntry: 'Diesen Eintrag in den Papierkorb verschieben?',
            confirmDeleteForever: 'Diesen Eintrag endgültig löschen? Das kann nicht rückgängig gemacht werden.',
            confirmDeleteType: (n) => `Inhaltstyp "${n}" und ALLE zugehörigen Einträge löschen?`,
            confirmDeleteMsg: 'Diese Nachricht löschen?',
            confirmDeleteUser: (n) => `Benutzer "${n}" löschen?`,
            confirmDeleteMedia: (n) => `Datei "${n}" löschen?`,
            confirmRevert: 'Den Eintrag auf diese Version zurücksetzen?',
            confirmImport: 'Dies ERSETZT alle Inhaltstypen und Einträge. Fortfahren?',
            importDone: (t, e) => `${t} Typen und ${e} Einträge importiert.`,
            resetPassword: 'Passwort setzen', promptNewPassword: 'Neues Passwort (min. 8 Zeichen):',
            uploadBtn: 'Hochladen', options: 'Optionen (kommagetrennt)', relatedTypeLbl: 'Verknüpfter Typ',
            required: 'Pflicht', selectEntry: '— auswählen —', scheduled: 'geplant',
        },
    };
    let lang = localStorage.getItem('cms-admin-lang') ||
        ((navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en');
    const t = (key, ...args) => {
        const v = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
        return typeof v === 'function' ? v(...args) : v;
    };
    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
        document.getElementById('lang-toggle').textContent = lang === 'de' ? 'EN' : 'DE';
        document.getElementById('entry-search').placeholder = t('search') + '…';
    }
    document.getElementById('lang-toggle').addEventListener('click', () => {
        lang = lang === 'de' ? 'en' : 'de';
        localStorage.setItem('cms-admin-lang', lang);
        applyI18n();
        renderTypesList(); renderTypeSelect(); loadMessages(); loadMedia();
    });

    // ---- state / helpers ------------------------------------------------------
    let me = null;
    let csrf = null;
    let contentTypes = [];
    let siteSchema = [];
    let publicSite = {};
    let currentTypeSlug = null;
    let entryPage = 1, entrySearch = '', entryFilter = '';
    let currentEntries = [];
    let msgPage = 1, msgFilter = '';

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return unsafe.toString()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function setFeedback(el, msg, ok) {
        el.textContent = msg;
        el.style.color = ok === true ? 'var(--ok-color)' : ok === false ? 'var(--danger-color)' : '#fff';
    }

    async function api(path, options = {}) {
        const opts = { ...options, headers: { ...(options.headers || {}) } };
        if (opts.method && opts.method !== 'GET') opts.headers['X-CSRF-Token'] = csrf;
        if (opts.body && !(opts.body instanceof FormData) && !opts.headers['Content-Type']) {
            opts.headers['Content-Type'] = 'application/json';
        }
        const res = await fetch(path, opts);
        if (res.status === 401) {
            location.href = '/admin/login.html';
            throw new Error('unauthenticated');
        }
        return res;
    }

    // ---- tabs -----------------------------------------------------------------
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
            if (tab.dataset.tab === 'messages') loadMessages();
            if (tab.dataset.tab === 'media') loadMedia();
            if (tab.dataset.tab === 'users') loadUsers();
        });
    });

    // =====================================================================
    //  CONTENT TYPES  (definitions + field builder)
    // =====================================================================
    const fieldTypeOptions = ['text', 'textarea', 'markdown', 'number', 'date', 'url', 'image', 'boolean', 'select', 'relation'];

    function fieldBuilderRow(field = {}) {
        const wrap = document.createElement('div');
        wrap.className = 'field-builder-row';
        wrap.dataset.orig = field.name || '';
        wrap.innerHTML = `
            <input type="text" class="fb-name" placeholder="name" value="${escapeHtml(field.name || '')}" maxlength="64">
            <input type="text" class="fb-label" placeholder="Label" value="${escapeHtml(field.label || '')}" maxlength="100">
            <select class="fb-type">${fieldTypeOptions.map(x => `<option value="${x}" ${field.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
            <input type="text" class="fb-options" placeholder="${escapeHtml(t('options'))}" value="${escapeHtml((field.options || []).join(', '))}" style="display:none;">
            <select class="fb-related" style="display:none;"></select>
            <label class="chk"><input type="checkbox" class="fb-required" ${field.required ? 'checked' : ''}> ${escapeHtml(t('required'))}</label>
            <button type="button" class="btn btn-sm btn-danger fb-remove">✕</button>`;
        wrap.querySelector('.fb-remove').addEventListener('click', () => wrap.remove());

        const typeSel = wrap.querySelector('.fb-type');
        const optionsInput = wrap.querySelector('.fb-options');
        const relatedSel = wrap.querySelector('.fb-related');
        const refreshExtras = () => {
            optionsInput.style.display = typeSel.value === 'select' ? '' : 'none';
            relatedSel.style.display = typeSel.value === 'relation' ? '' : 'none';
            if (typeSel.value === 'relation') {
                relatedSel.innerHTML = contentTypes
                    .map(ct => `<option value="${escapeHtml(ct.slug)}" ${field.relatedType === ct.slug ? 'selected' : ''}>${escapeHtml(ct.name)}</option>`)
                    .join('');
            }
        };
        typeSel.addEventListener('change', refreshExtras);
        refreshExtras();
        return wrap;
    }

    document.getElementById('add-field').addEventListener('click', () => {
        document.getElementById('field-builder').appendChild(fieldBuilderRow());
    });

    function collectFields() {
        const rows = document.querySelectorAll('#field-builder .field-builder-row');
        const fields = [];
        rows.forEach(r => {
            const name = r.querySelector('.fb-name').value.trim();
            if (!name) return;
            const type = r.querySelector('.fb-type').value;
            const field = {
                name,
                label: r.querySelector('.fb-label').value.trim() || name,
                type,
                required: r.querySelector('.fb-required').checked,
            };
            if (type === 'select') {
                field.options = r.querySelector('.fb-options').value.split(',').map(o => o.trim()).filter(Boolean);
            }
            if (type === 'relation') field.relatedType = r.querySelector('.fb-related').value;
            // Track the original name so the server can migrate entry data on rename.
            if (r.dataset.orig && r.dataset.orig !== name) field.renamedFrom = r.dataset.orig;
            fields.push(field);
        });
        return fields;
    }

    function resetTypeForm() {
        document.getElementById('type-id').value = '';
        document.getElementById('type-name').value = '';
        document.getElementById('type-slug').value = '';
        document.getElementById('type-desc').value = '';
        const fb = document.getElementById('field-builder');
        fb.innerHTML = '';
        fb.appendChild(fieldBuilderRow());
        document.getElementById('type-form-title').textContent = t('newType');
        document.getElementById('type-cancel').style.display = 'none';
        setFeedback(document.getElementById('type-feedback'), '');
    }

    document.getElementById('type-cancel').addEventListener('click', resetTypeForm);

    function editType(id) {
        const ct = contentTypes.find(x => x.id === id);
        if (!ct) return;
        document.getElementById('type-id').value = ct.id;
        document.getElementById('type-name').value = ct.name;
        document.getElementById('type-slug').value = ct.slug;
        document.getElementById('type-desc').value = ct.description || '';
        const fb = document.getElementById('field-builder');
        fb.innerHTML = '';
        (ct.fields || []).forEach(f => fb.appendChild(fieldBuilderRow(f)));
        document.getElementById('type-form-title').textContent = t('editType') + ': ' + ct.name;
        document.getElementById('type-cancel').style.display = 'inline-block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function deleteType(id) {
        const ct = contentTypes.find(x => x.id === id);
        if (!confirm(t('confirmDeleteType', ct ? ct.name : id))) return;
        const res = await api(`${API}/content-types/${id}`, { method: 'DELETE' });
        if (res.ok) { await loadTypes(); } else { alert(t('failed')); }
    }

    document.getElementById('type-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('type-feedback');
        const id = document.getElementById('type-id').value;
        const payload = {
            name: document.getElementById('type-name').value.trim(),
            slug: document.getElementById('type-slug').value.trim(),
            description: document.getElementById('type-desc').value.trim(),
            fields: collectFields(),
        };
        setFeedback(feedback, t('saving'));
        try {
            const res = await api(id ? `${API}/content-types/${id}` : `${API}/content-types`, {
                method: id ? 'PUT' : 'POST',
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (res.ok) {
                setFeedback(feedback, t('saved'), true);
                resetTypeForm();
                await loadTypes();
            } else {
                setFeedback(feedback, result.error || t('failed'), false);
            }
        } catch (err) { if (err.message !== 'unauthenticated') setFeedback(feedback, t('networkError'), false); }
    });

    function renderTypesList() {
        const el = document.getElementById('types-list');
        if (!el) return;
        if (contentTypes.length === 0) { el.innerHTML = `<p class="muted">${escapeHtml(t('noTypes'))}</p>`; return; }
        el.innerHTML = contentTypes.map(ct => `
            <div class="list-item">
                <div>
                    <strong>${escapeHtml(ct.name)}</strong> <span class="muted">/${escapeHtml(ct.slug)}</span><br>
                    <span class="muted" style="font-size:0.82rem;">
                        ${(ct.fields || []).map(f => escapeHtml(f.name)).join(', ')} · ${t('entriesCount', ct.entryCount || 0)}
                    </span>
                </div>
                <div class="actions">
                    <button class="btn btn-sm btn-muted" data-edit-type="${ct.id}">${escapeHtml(t('edit'))}</button>
                    <button class="btn btn-sm btn-danger" data-del-type="${ct.id}">${escapeHtml(t('del'))}</button>
                </div>
            </div>`).join('');
        el.querySelectorAll('[data-edit-type]').forEach(b => b.addEventListener('click', () => editType(Number(b.dataset.editType))));
        el.querySelectorAll('[data-del-type]').forEach(b => b.addEventListener('click', () => deleteType(Number(b.dataset.delType))));
    }

    async function loadTypes() {
        const res = await api(`${API}/content-types`);
        contentTypes = await res.json();
        renderTypesList();
        renderTypeSelect();
    }

    // =====================================================================
    //  CONTENT ENTRIES
    // =====================================================================
    function renderTypeSelect() {
        const sel = document.getElementById('type-select');
        const prev = currentTypeSlug;
        sel.innerHTML = contentTypes.map(ct => `<option value="${escapeHtml(ct.slug)}">${escapeHtml(ct.name)}</option>`).join('');
        if (contentTypes.length === 0) {
            currentTypeSlug = null;
            document.getElementById('entry-fields').innerHTML = `<p class="muted">${escapeHtml(t('createTypeFirst'))}</p>`;
            document.getElementById('entries-list').innerHTML = '';
            document.getElementById('entries-pager').innerHTML = '';
            return;
        }
        currentTypeSlug = contentTypes.some(ct => ct.slug === prev) ? prev : contentTypes[0].slug;
        sel.value = currentTypeSlug;
        buildEntryForm();
        entryPage = 1;
        loadEntries();
    }

    document.getElementById('type-select').addEventListener('change', (e) => {
        currentTypeSlug = e.target.value;
        entryPage = 1;
        resetEntryForm();
        loadEntries();
    });

    let searchTimer = null;
    document.getElementById('entry-search').addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { entrySearch = e.target.value.trim(); entryPage = 1; loadEntries(); }, 300);
    });
    document.getElementById('entry-filter').addEventListener('change', (e) => {
        entryFilter = e.target.value;
        entryPage = 1;
        loadEntries();
    });

    function currentType() { return contentTypes.find(ct => ct.slug === currentTypeSlug); }

    function localeOptions() {
        return String(publicSite.content_locales || '').split(',').map(s => s.trim()).filter(Boolean);
    }

    function fieldInput(field, value = '') {
        const id = 'ef-' + field.name;
        const req = field.required ? 'required' : '';
        let control;
        switch (field.type) {
            case 'textarea':
            case 'markdown':
                control = `<textarea id="${id}" rows="${field.type === 'markdown' ? 8 : 4}" ${req}>${escapeHtml(value)}</textarea>`;
                break;
            case 'number': control = `<input type="number" step="any" id="${id}" value="${escapeHtml(value)}" ${req}>`; break;
            case 'date':   control = `<input type="date" id="${id}" value="${escapeHtml(value)}" ${req}>`; break;
            case 'url':    control = `<input type="url" id="${id}" value="${escapeHtml(value)}" placeholder="https://…" ${req}>`; break;
            case 'image':
                control = `
                    <div class="row" style="align-items:center;">
                        <div style="flex:1 1 220px;"><input type="text" id="${id}" value="${escapeHtml(value)}" placeholder="https://… / /uploads/…" ${req}></div>
                        <div style="flex:0 0 auto;">
                            <button type="button" class="btn btn-sm btn-muted ef-upload" data-target="${id}">${escapeHtml(t('uploadBtn'))}</button>
                            <input type="file" class="ef-upload-file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" style="display:none;">
                        </div>
                    </div>`;
                break;
            case 'boolean': control = `<input type="checkbox" id="${id}" style="width:auto;" ${value ? 'checked' : ''}>`; break;
            case 'select':
                control = `<select id="${id}" ${req}><option value=""></option>${(field.options || [])
                    .map(o => `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
                break;
            case 'relation':
                control = `<select id="${id}" class="ef-relation" data-related="${escapeHtml(field.relatedType || '')}" data-value="${escapeHtml(value && value.id ? value.id : value)}" ${req}>
                    <option value="">${escapeHtml(t('selectEntry'))}</option></select>`;
                break;
            default: control = `<input type="text" id="${id}" value="${escapeHtml(value)}" maxlength="2000" ${req}>`;
        }
        return `<div><label for="${id}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>${control}</div>`;
    }

    async function populateRelationSelects(container) {
        for (const sel of container.querySelectorAll('.ef-relation')) {
            const slug = sel.dataset.related;
            if (!slug) continue;
            try {
                const res = await api(`${API}/content/${encodeURIComponent(slug)}?limit=100`);
                const data = await res.json();
                const titleField = (data.type.fields || []).find(f => f.name === 'title') || (data.type.fields || []).find(f => f.type === 'text');
                (data.entries || []).forEach(en => {
                    const opt = document.createElement('option');
                    opt.value = en.id;
                    opt.textContent = `#${en.id} ${titleField ? (en.data[titleField.name] || '') : ''}`;
                    if (String(en.id) === String(sel.dataset.value)) opt.selected = true;
                    sel.appendChild(opt);
                });
            } catch { /* leave empty */ }
        }
    }

    function wireImageUploads(container) {
        container.querySelectorAll('.ef-upload').forEach(btn => {
            const fileInput = btn.parentElement.querySelector('.ef-upload-file');
            btn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async () => {
                if (!fileInput.files.length) return;
                const fd = new FormData();
                fd.append('file', fileInput.files[0]);
                btn.disabled = true;
                try {
                    const res = await api(`${API}/media`, { method: 'POST', body: fd });
                    const result = await res.json();
                    if (res.ok) document.getElementById(btn.dataset.target).value = result.file.url;
                    else alert(result.error || t('failed'));
                } catch { alert(t('networkError')); }
                btn.disabled = false;
                fileInput.value = '';
            });
        });
    }

    function buildEntryForm(values = {}, meta = {}) {
        const type = currentType();
        const container = document.getElementById('entry-fields');
        if (!type) { container.innerHTML = ''; return; }
        container.innerHTML = type.fields.map(f => fieldInput(f, values[f.name] !== undefined ? values[f.name] : '')).join('');
        populateRelationSelects(container);
        wireImageUploads(container);

        document.getElementById('entry-publish-at').value = meta.publish_at
            ? String(meta.publish_at).replace(' ', 'T').slice(0, 16) : '';

        const locales = localeOptions();
        const localeWrap = document.getElementById('entry-locale-wrap');
        const localeSel = document.getElementById('entry-locale');
        if (locales.length > 0) {
            localeWrap.style.display = '';
            localeSel.innerHTML = `<option value=""></option>` + locales
                .map(l => `<option value="${escapeHtml(l)}" ${meta.locale === l ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');
        } else {
            localeWrap.style.display = 'none';
            localeSel.innerHTML = '';
        }
    }

    function collectEntryData() {
        const type = currentType();
        const data = {};
        type.fields.forEach(f => {
            const el = document.getElementById('ef-' + f.name);
            if (!el) return;
            data[f.name] = f.type === 'boolean' ? el.checked : el.value;
        });
        return data;
    }

    function resetEntryForm() {
        document.getElementById('entry-id').value = '';
        document.getElementById('entry-status').value = 'published';
        document.getElementById('entry-form-title').textContent = t('newEntry');
        document.getElementById('entry-cancel').style.display = 'none';
        setFeedback(document.getElementById('entry-feedback'), '');
        buildEntryForm();
    }

    document.getElementById('entry-cancel').addEventListener('click', resetEntryForm);

    function editEntry(entry) {
        document.getElementById('entry-id').value = entry.id;
        document.getElementById('entry-status').value = entry.status || 'published';
        document.getElementById('entry-form-title').textContent = t('editEntry') + ' #' + entry.id;
        document.getElementById('entry-cancel').style.display = 'inline-block';
        buildEntryForm(entry.data || {}, entry);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.getElementById('entry-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('entry-feedback');
        const id = document.getElementById('entry-id').value;
        const publishAt = document.getElementById('entry-publish-at').value;
        const payload = {
            data: collectEntryData(),
            status: document.getElementById('entry-status').value,
            publish_at: publishAt ? publishAt.replace('T', ' ') : '',
            locale: document.getElementById('entry-locale').value || '',
        };
        setFeedback(feedback, t('saving'));
        try {
            const url = id ? `${API}/content/${currentTypeSlug}/${id}` : `${API}/content/${currentTypeSlug}`;
            const res = await api(url, { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
            const result = await res.json();
            if (res.ok) {
                setFeedback(feedback, t('saved'), true);
                resetEntryForm();
                loadEntries();
                loadTypes(); // refresh entry counts
            } else {
                setFeedback(feedback, result.error || t('failed'), false);
            }
        } catch (err) { if (err.message !== 'unauthenticated') setFeedback(feedback, t('networkError'), false); }
    });

    async function trashEntry(id) {
        if (!confirm(t('confirmTrashEntry'))) return;
        const res = await api(`${API}/content/${currentTypeSlug}/${id}`, { method: 'DELETE' });
        if (res.ok) { loadEntries(); loadTypes(); } else { alert(t('failed')); }
    }
    async function deleteEntryForever(id) {
        if (!confirm(t('confirmDeleteForever'))) return;
        const res = await api(`${API}/content/${currentTypeSlug}/${id}?permanent=1`, { method: 'DELETE' });
        if (res.ok) { loadEntries(); loadTypes(); } else { alert(t('failed')); }
    }
    async function restoreEntry(id) {
        const res = await api(`${API}/content/${currentTypeSlug}/${id}/restore`, { method: 'POST' });
        if (res.ok) { loadEntries(); loadTypes(); } else { alert(t('failed')); }
    }

    async function moveEntry(id, dir) {
        const idx = currentEntries.findIndex(x => x.id === id);
        const target = idx + dir;
        if (idx < 0 || target < 0 || target >= currentEntries.length) return;
        const ids = currentEntries.map(x => x.id);
        [ids[idx], ids[target]] = [ids[target], ids[idx]];
        const res = await api(`${API}/content/${currentTypeSlug}/reorder`, {
            method: 'PUT',
            body: JSON.stringify({ ids, offset: (entryPage - 1) * LIMIT }),
        });
        if (res.ok) loadEntries(); else alert(t('failed'));
    }

    function renderPager(el, page, total, onChange) {
        const pages = Math.max(1, Math.ceil(total / LIMIT));
        if (pages <= 1) { el.innerHTML = ''; return; }
        el.innerHTML = '';
        const prev = document.createElement('button');
        prev.className = 'btn btn-sm btn-muted';
        prev.textContent = t('prev');
        prev.disabled = page <= 1;
        prev.addEventListener('click', () => onChange(page - 1));
        const label = document.createElement('span');
        label.className = 'muted';
        label.textContent = t('pageOf', page, pages);
        const next = document.createElement('button');
        next.className = 'btn btn-sm btn-muted';
        next.textContent = t('next');
        next.disabled = page >= pages;
        next.addEventListener('click', () => onChange(page + 1));
        el.append(prev, label, next);
    }

    async function loadEntries() {
        const list = document.getElementById('entries-list');
        const pager = document.getElementById('entries-pager');
        const type = currentType();
        if (!type) { list.innerHTML = ''; pager.innerHTML = ''; return; }
        list.innerHTML = `<p class="muted">${escapeHtml(t('loading'))}</p>`;
        try {
            const params = new URLSearchParams({ page: String(entryPage), limit: String(LIMIT) });
            if (entrySearch) params.set('q', entrySearch);
            if (entryFilter === 'trash') params.set('trash', '1');
            else if (entryFilter) params.set('status', entryFilter);
            const res = await api(`${API}/content/${encodeURIComponent(currentTypeSlug)}?${params}`);
            const data = await res.json();
            const entries = data.entries || [];
            currentEntries = entries;
            if (entries.length === 0) { list.innerHTML = `<p class="muted">${escapeHtml(t('noEntries'))}</p>`; pager.innerHTML = ''; return; }

            const titleField = type.fields.find(f => f.name === 'title') || type.fields.find(f => f.type === 'text') || type.fields[0];
            const inTrash = entryFilter === 'trash';
            const canReorder = !inTrash && !entrySearch && !entryFilter;

            list.innerHTML = entries.map((entry, i) => {
                const title = titleField ? entry.data[titleField.name] : '';
                const color = entry.status === 'published' ? 'var(--ok-color)' : '#aaa';
                const scheduled = entry.publish_at && entry.publish_at > new Date().toISOString().slice(0, 19).replace('T', ' ');
                const badges = `
                    <span class="pill" style="color:${color}; border:1px solid ${color};">${escapeHtml(entry.status)}</span>
                    ${scheduled ? `<span class="pill" style="color:#e6a23c; border:1px solid #e6a23c;">${escapeHtml(t('scheduled'))} ${escapeHtml(entry.publish_at)}</span>` : ''}
                    ${entry.locale ? `<span class="pill" style="color:#7b9cff; border:1px solid #7b9cff;">${escapeHtml(entry.locale)}</span>` : ''}`;
                const actions = inTrash
                    ? `<button class="btn btn-sm btn-muted" data-restore="${entry.id}">${escapeHtml(t('restore'))}</button>
                       <button class="btn btn-sm btn-danger" data-del-forever="${entry.id}">${escapeHtml(t('deleteForever'))}</button>`
                    : `${canReorder ? `
                        <button class="btn btn-sm btn-muted" data-up="${entry.id}" ${i === 0 && entryPage === 1 ? 'disabled' : ''}>↑</button>
                        <button class="btn btn-sm btn-muted" data-down="${entry.id}" ${i === entries.length - 1 ? 'disabled' : ''}>↓</button>` : ''}
                       <button class="btn btn-sm btn-muted" data-edit="${entry.id}">${escapeHtml(t('edit'))}</button>
                       <button class="btn btn-sm btn-muted" data-versions="${entry.id}">${escapeHtml(t('versions'))}</button>
                       <button class="btn btn-sm btn-danger" data-del="${entry.id}">${escapeHtml(t('del'))}</button>`;
                return `
                    <div class="list-item">
                        <div>
                            <strong>${escapeHtml(title) || escapeHtml(t('untitled'))}</strong> ${badges}<br>
                            <span class="muted" style="font-size:0.8rem;">#${entry.id} · ${new Date(entry.created_at).toLocaleString()}</span>
                        </div>
                        <div class="actions">${actions}</div>
                    </div>`;
            }).join('');

            list.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () =>
                editEntry(entries.find(x => x.id === Number(b.dataset.edit)))));
            list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => trashEntry(Number(b.dataset.del))));
            list.querySelectorAll('[data-del-forever]').forEach(b => b.addEventListener('click', () => deleteEntryForever(Number(b.dataset.delForever))));
            list.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', () => restoreEntry(Number(b.dataset.restore))));
            list.querySelectorAll('[data-versions]').forEach(b => b.addEventListener('click', () => openVersions(Number(b.dataset.versions))));
            list.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => moveEntry(Number(b.dataset.up), -1)));
            list.querySelectorAll('[data-down]').forEach(b => b.addEventListener('click', () => moveEntry(Number(b.dataset.down), 1)));

            renderPager(pager, data.page, data.total, (p) => { entryPage = p; loadEntries(); });
        } catch (err) {
            if (err.message !== 'unauthenticated') list.innerHTML = `<p class="muted">${escapeHtml(t('failed'))}</p>`;
        }
    }

    // ---- versions ----
    const versionsModal = document.getElementById('versions-modal');
    document.getElementById('versions-close').addEventListener('click', () => versionsModal.classList.remove('open'));
    versionsModal.addEventListener('click', (e) => { if (e.target === versionsModal) versionsModal.classList.remove('open'); });

    async function openVersions(entryId) {
        const listEl = document.getElementById('versions-list');
        setFeedback(document.getElementById('versions-feedback'), '');
        listEl.innerHTML = `<p class="muted">${escapeHtml(t('loading'))}</p>`;
        versionsModal.classList.add('open');
        try {
            const res = await api(`${API}/content/${encodeURIComponent(currentTypeSlug)}/${entryId}/versions`);
            const versions = await res.json();
            if (!Array.isArray(versions) || versions.length === 0) {
                listEl.innerHTML = `<p class="muted">${escapeHtml(t('noVersions'))}</p>`;
                return;
            }
            listEl.innerHTML = versions.map(v => `
                <div class="version-item">
                    <strong>#${v.id}</strong>
                    <span class="muted" style="font-size:0.8rem;">${new Date(v.created_at).toLocaleString()} · ${escapeHtml(v.status || '')}</span>
                    <pre>${escapeHtml(JSON.stringify(v.data, null, 2))}</pre>
                    <button class="btn btn-sm btn-muted" data-revert="${v.id}">${escapeHtml(t('restore'))}</button>
                </div>`).join('');
            listEl.querySelectorAll('[data-revert]').forEach(b => b.addEventListener('click', async () => {
                if (!confirm(t('confirmRevert'))) return;
                const r = await api(`${API}/content/${encodeURIComponent(currentTypeSlug)}/${entryId}/revert/${b.dataset.revert}`, { method: 'POST' });
                if (r.ok) { versionsModal.classList.remove('open'); loadEntries(); }
                else setFeedback(document.getElementById('versions-feedback'), t('failed'), false);
            }));
        } catch {
            listEl.innerHTML = `<p class="muted">${escapeHtml(t('failed'))}</p>`;
        }
    }

    // =====================================================================
    //  MESSAGES
    // =====================================================================
    const replyModal = document.getElementById('reply-modal');

    document.getElementById('msg-filter').addEventListener('change', (e) => {
        msgFilter = e.target.value;
        msgPage = 1;
        loadMessages();
    });

    function openReply(id, name, email) {
        document.getElementById('reply-id').value = id;
        document.getElementById('reply-info').textContent = `To: ${name} <${email}>`;
        document.getElementById('reply-subject').value = 'Re: your message';
        document.getElementById('reply-message').value = '';
        setFeedback(document.getElementById('reply-feedback'), '');
        replyModal.classList.add('open');
    }
    document.getElementById('reply-cancel').addEventListener('click', () => replyModal.classList.remove('open'));
    replyModal.addEventListener('click', (e) => { if (e.target === replyModal) replyModal.classList.remove('open'); });

    document.getElementById('reply-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('reply-feedback');
        setFeedback(feedback, t('sending'));
        try {
            const res = await api(`${API}/messages/${document.getElementById('reply-id').value}/reply`, {
                method: 'POST',
                body: JSON.stringify({
                    subject: document.getElementById('reply-subject').value,
                    replyMessage: document.getElementById('reply-message').value,
                }),
            });
            const result = await res.json();
            if (res.ok) {
                setFeedback(feedback, t('sent'), true);
                setTimeout(() => { replyModal.classList.remove('open'); loadMessages(); }, 1200);
            } else {
                setFeedback(feedback, result.error || t('failed'), false);
            }
        } catch (err) { if (err.message !== 'unauthenticated') setFeedback(feedback, t('networkError'), false); }
    });

    async function setMessageStatus(id, status) {
        const res = await api(`${API}/messages/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
        if (res.ok) loadMessages(); else alert(t('failed'));
    }
    async function deleteMessage(id) {
        if (!confirm(t('confirmDeleteMsg'))) return;
        const res = await api(`${API}/messages/${id}`, { method: 'DELETE' });
        if (res.ok) loadMessages(); else alert(t('failed'));
    }

    async function loadMessages() {
        const list = document.getElementById('messages-list');
        const pager = document.getElementById('messages-pager');
        if (!list) return;
        list.innerHTML = `<p class="muted">${escapeHtml(t('loading'))}</p>`;
        try {
            const params = new URLSearchParams({ page: String(msgPage), limit: String(LIMIT) });
            if (msgFilter) params.set('status', msgFilter);
            const res = await api(`${API}/messages?${params}`);
            const data = await res.json();
            const messages = data.messages || [];
            if (messages.length === 0) { list.innerHTML = `<p class="muted">${escapeHtml(t('noMessages'))}</p>`; pager.innerHTML = ''; return; }
            list.innerHTML = `<table><thead><tr><th>Date</th><th>From</th><th>${escapeHtml(t('message'))}</th><th>Status</th><th></th></tr></thead><tbody>${
                messages.map(m => {
                    const color = m.status === 'new' ? 'var(--primary-color)' : m.status === 'archived' ? '#888' : 'var(--ok-color)';
                    return `<tr>
                        <td style="white-space:nowrap;">${new Date(m.created_at).toLocaleDateString()}</td>
                        <td><strong>${escapeHtml(m.name)}</strong><br><span class="muted" style="font-size:0.8rem;">${escapeHtml(m.email)}</span></td>
                        <td><strong>${escapeHtml(m.subject || '')}</strong><br><span class="muted" style="font-size:0.82rem;">${escapeHtml(m.body || '')}</span></td>
                        <td style="color:${color}; text-transform:uppercase; font-weight:600; font-size:0.75rem;">${escapeHtml(m.status)}</td>
                        <td><div class="actions">
                            <button class="btn btn-sm" data-reply="${m.id}" data-name="${escapeHtml(m.name)}" data-email="${escapeHtml(m.email)}">${escapeHtml(t('reply'))}</button>
                            ${m.status !== 'read' ? `<button class="btn btn-sm btn-muted" data-status="read" data-id="${m.id}">${escapeHtml(t('read'))}</button>` : ''}
                            ${m.status !== 'archived' ? `<button class="btn btn-sm btn-muted" data-status="archived" data-id="${m.id}">${escapeHtml(t('archive'))}</button>` : ''}
                            <button class="btn btn-sm btn-danger" data-delmsg="${m.id}">${escapeHtml(t('del'))}</button>
                        </div></td>
                    </tr>`;
                }).join('')
            }</tbody></table>`;
            list.querySelectorAll('[data-reply]').forEach(b => b.addEventListener('click', () => openReply(b.dataset.reply, b.dataset.name, b.dataset.email)));
            list.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => setMessageStatus(b.dataset.id, b.dataset.status)));
            list.querySelectorAll('[data-delmsg]').forEach(b => b.addEventListener('click', () => deleteMessage(b.dataset.delmsg)));
            renderPager(pager, data.page, data.total, (p) => { msgPage = p; loadMessages(); });
        } catch (err) {
            if (err.message !== 'unauthenticated') list.innerHTML = `<p class="muted">${escapeHtml(t('failed'))}</p>`;
        }
    }

    // =====================================================================
    //  MEDIA
    // =====================================================================
    document.getElementById('media-upload').addEventListener('change', async (e) => {
        const feedback = document.getElementById('media-feedback');
        if (!e.target.files.length) return;
        const fd = new FormData();
        fd.append('file', e.target.files[0]);
        setFeedback(feedback, t('saving'));
        try {
            const res = await api(`${API}/media`, { method: 'POST', body: fd });
            const result = await res.json();
            if (res.ok) { setFeedback(feedback, t('saved'), true); loadMedia(); }
            else setFeedback(feedback, result.error || t('failed'), false);
        } catch (err) { if (err.message !== 'unauthenticated') setFeedback(feedback, t('networkError'), false); }
        e.target.value = '';
    });

    async function loadMedia() {
        const grid = document.getElementById('media-grid');
        if (!grid) return;
        grid.innerHTML = `<p class="muted">${escapeHtml(t('loading'))}</p>`;
        try {
            const res = await api(`${API}/media`);
            const files = await res.json();
            if (!Array.isArray(files) || files.length === 0) {
                grid.innerHTML = `<p class="muted">${escapeHtml(t('noFiles'))}</p>`;
                return;
            }
            grid.innerHTML = files.map(f => `
                <div class="media-item">
                    <img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.name)}" loading="lazy">
                    <div class="info">${escapeHtml(f.name)}<br>${(f.size / 1024).toFixed(0)} KB</div>
                    <div class="actions">
                        <button class="btn btn-sm btn-muted" data-copy="${escapeHtml(f.url)}">${escapeHtml(t('copyUrl'))}</button>
                        <button class="btn btn-sm btn-danger" data-delmedia="${escapeHtml(f.name)}">✕</button>
                    </div>
                </div>`).join('');
            grid.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
                try { await navigator.clipboard.writeText(location.origin + b.dataset.copy); b.textContent = t('copied'); }
                catch { prompt('URL:', location.origin + b.dataset.copy); }
                setTimeout(() => { b.textContent = t('copyUrl'); }, 1500);
            }));
            grid.querySelectorAll('[data-delmedia]').forEach(b => b.addEventListener('click', async () => {
                if (!confirm(t('confirmDeleteMedia', b.dataset.delmedia))) return;
                const r = await api(`${API}/media/${encodeURIComponent(b.dataset.delmedia)}`, { method: 'DELETE' });
                if (r.ok) loadMedia(); else alert(t('failed'));
            }));
        } catch (err) {
            if (err.message !== 'unauthenticated') grid.innerHTML = `<p class="muted">${escapeHtml(t('failed'))}</p>`;
        }
    }

    // =====================================================================
    //  USERS  (admin role)
    // =====================================================================
    document.getElementById('user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('user-feedback');
        setFeedback(feedback, t('saving'));
        try {
            const res = await api(`${API}/users`, {
                method: 'POST',
                body: JSON.stringify({
                    username: document.getElementById('user-name').value.trim(),
                    password: document.getElementById('user-pass').value,
                    role: document.getElementById('user-role').value,
                }),
            });
            const result = await res.json();
            if (res.ok) {
                setFeedback(feedback, t('saved'), true);
                e.target.reset();
                loadUsers();
            } else setFeedback(feedback, result.error || t('failed'), false);
        } catch (err) { if (err.message !== 'unauthenticated') setFeedback(feedback, t('networkError'), false); }
    });

    async function loadUsers() {
        const list = document.getElementById('users-list');
        if (!list || me.role !== 'admin') return;
        list.innerHTML = `<p class="muted">${escapeHtml(t('loading'))}</p>`;
        try {
            const res = await api(`${API}/users`);
            const users = await res.json();
            list.innerHTML = users.map(u => `
                <div class="list-item">
                    <div>
                        <strong>${escapeHtml(u.username)}</strong>
                        <span class="pill" style="color:var(--primary-color); border:1px solid var(--primary-color);">${escapeHtml(u.role)}</span>
                        ${u.id === me.id ? '<span class="muted" style="font-size:0.8rem;">(you)</span>' : ''}<br>
                        <span class="muted" style="font-size:0.8rem;">#${u.id} · ${new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="actions">
                        <button class="btn btn-sm btn-muted" data-role="${u.id}" data-newrole="${u.role === 'admin' ? 'editor' : 'admin'}">→ ${u.role === 'admin' ? 'Editor' : 'Admin'}</button>
                        <button class="btn btn-sm btn-muted" data-pw="${u.id}">${escapeHtml(t('resetPassword'))}</button>
                        ${u.id !== me.id ? `<button class="btn btn-sm btn-danger" data-deluser="${u.id}" data-name="${escapeHtml(u.username)}">${escapeHtml(t('del'))}</button>` : ''}
                    </div>
                </div>`).join('');
            list.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', async () => {
                const r = await api(`${API}/users/${b.dataset.role}`, { method: 'PUT', body: JSON.stringify({ role: b.dataset.newrole }) });
                const result = await r.json();
                if (r.ok) loadUsers(); else alert(result.error || t('failed'));
            }));
            list.querySelectorAll('[data-pw]').forEach(b => b.addEventListener('click', async () => {
                const pw = prompt(t('promptNewPassword'));
                if (!pw) return;
                const r = await api(`${API}/users/${b.dataset.pw}`, { method: 'PUT', body: JSON.stringify({ password: pw }) });
                const result = await r.json();
                if (r.ok) alert(t('saved')); else alert(result.error || t('failed'));
            }));
            list.querySelectorAll('[data-deluser]').forEach(b => b.addEventListener('click', async () => {
                if (!confirm(t('confirmDeleteUser', b.dataset.name))) return;
                const r = await api(`${API}/users/${b.dataset.deluser}`, { method: 'DELETE' });
                const result = await r.json();
                if (r.ok) loadUsers(); else alert(result.error || t('failed'));
            }));
        } catch (err) {
            if (err.message !== 'unauthenticated') list.innerHTML = `<p class="muted">${escapeHtml(t('failed'))}</p>`;
        }
    }

    // =====================================================================
    //  SETTINGS  (admin role)
    // =====================================================================
    async function loadSettings() {
        if (me.role !== 'admin') return;
        const res = await api(`${API}/settings`);
        const data = await res.json();
        siteSchema = data.schema || [];
        const site = data.site || {};
        document.getElementById('settings-fields').innerHTML = siteSchema.map(f => {
            const val = site[f.key] !== undefined ? site[f.key] : '';
            let control;
            if (f.type === 'textarea') control = `<textarea id="set-${f.key}" rows="3">${escapeHtml(val)}</textarea>`;
            else if (f.type === 'color') control = `<input type="color" id="set-${f.key}" value="${escapeHtml(/^#[0-9a-fA-F]{3,6}$/.test(val) ? val : '#000000')}">`;
            else control = `<input type="${f.type === 'url' ? 'url' : 'text'}" id="set-${f.key}" value="${escapeHtml(val)}">`;
            return `<label for="set-${f.key}">${escapeHtml(f.label)}</label>${control}`;
        }).join('');
    }

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('settings-feedback');
        setFeedback(feedback, t('saving'));
        try {
            const values = {};
            for (const f of siteSchema) values[f.key] = document.getElementById('set-' + f.key).value;
            const res = await api(`${API}/settings`, { method: 'PUT', body: JSON.stringify({ values }) });
            const result = await res.json();
            if (res.ok) {
                setFeedback(feedback, t('saved'), true);
                publicSite = result.site || publicSite;
                document.getElementById('admin-title').textContent = (publicSite.site_name || 'CMS') + ' Admin';
            } else setFeedback(feedback, result.error || t('failed'), false);
        } catch (err) { if (err.message !== 'unauthenticated') setFeedback(feedback, t('networkError'), false); }
    });

    // ---- import / export ----
    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', async (e) => {
        const feedback = document.getElementById('import-feedback');
        if (!e.target.files.length) return;
        if (!confirm(t('confirmImport'))) { e.target.value = ''; return; }
        try {
            const text = await e.target.files[0].text();
            const payload = JSON.parse(text);
            setFeedback(feedback, t('saving'));
            const res = await api(`${API}/import`, { method: 'POST', body: JSON.stringify(payload) });
            const result = await res.json();
            if (res.ok) {
                setFeedback(feedback, t('importDone', result.types, result.entries), true);
                await loadTypes();
            } else setFeedback(feedback, result.error || t('failed'), false);
        } catch { setFeedback(feedback, t('failed'), false); }
        e.target.value = '';
    });

    // =====================================================================
    //  ACCOUNT (password change, logout)
    // =====================================================================
    const pwModal = document.getElementById('pw-modal');
    document.getElementById('pw-open').addEventListener('click', () => {
        document.getElementById('pw-current').value = '';
        document.getElementById('pw-new').value = '';
        setFeedback(document.getElementById('pw-feedback'), '');
        pwModal.classList.add('open');
    });
    document.getElementById('pw-cancel').addEventListener('click', () => pwModal.classList.remove('open'));
    pwModal.addEventListener('click', (e) => { if (e.target === pwModal) pwModal.classList.remove('open'); });

    document.getElementById('pw-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('pw-feedback');
        setFeedback(feedback, t('saving'));
        try {
            const res = await api('/api/auth/password', {
                method: 'POST',
                body: JSON.stringify({
                    currentPassword: document.getElementById('pw-current').value,
                    newPassword: document.getElementById('pw-new').value,
                }),
            });
            const result = await res.json();
            if (res.ok) {
                setFeedback(feedback, t('saved'), true);
                setTimeout(() => pwModal.classList.remove('open'), 1000);
            } else setFeedback(feedback, result.error || t('failed'), false);
        } catch (err) { if (err.message !== 'unauthenticated') setFeedback(feedback, t('networkError'), false); }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
        location.href = '/admin/login.html';
    });

    // ---- init ----
    (async function init() {
        applyI18n();
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            if (!data.user) { location.href = '/admin/login.html'; return; }
            me = data.user;
            csrf = data.csrfToken;
            document.body.classList.add('role-' + me.role);
            document.getElementById('user-badge').innerHTML =
                `${escapeHtml(me.username)} <span class="role">${escapeHtml(me.role)}</span>`;

            // Public config supplies branding + locales even for editors.
            const cfgRes = await fetch('/api/config');
            const cfg = await cfgRes.json();
            publicSite = cfg.site || {};
            document.getElementById('admin-title').textContent = (publicSite.site_name || 'CMS') + ' Admin';

            await loadTypes();
            if (me.role === 'admin') await loadSettings();
        } catch (err) {
            console.error(err);
        }
    })();
})();

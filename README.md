# CMS.v2 — Lightweight Generic CMS

Ein leichtgewichtiges, generisches Content-Management-System auf Basis von **Node.js + Express + SQLite**. Gedacht als **Grundlage/Vorlage** für beliebige inhaltsgetriebene Websites: Inhaltstypen mit frei definierbaren Feldern, ein geschütztes Admin-Panel, ein generisches Kontaktformular und komplett über Config/Admin konfigurierbares Branding. Kein Build-Step, kein Framework im Frontend — pure HTML/CSS/Vanilla JS.

---

## Features

### Inhalte
- **Generisches Inhaltsmodell:** Beliebige *Content-Types* (z. B. Posts, Events, Projekte) mit eigenen Feldern. Feldtypen: `text`, `textarea`, `markdown`, `number`, `date`, `url`, `image`, `boolean`, `select` (Dropdown mit Optionen), `relation` (Verknüpfung zu einem anderen Inhaltstyp).
- **Feld-Umbenennung mit Datenmigration:** Wird ein Feld umbenannt, werden vorhandene Einträge automatisch mitmigriert.
- **Draft/Published, zeitgesteuertes Publizieren** (`publish_at`), **Papierkorb** (Soft-Delete mit Wiederherstellen) und **Versionierung** (letzte 20 Versionen pro Eintrag, Revert im Admin-Panel).
- **Suche, Pagination und manuelle Sortierung** (↑/↓) im Admin; „Load more"-Pagination auf der öffentlichen Seite.
- **Mehrsprachige Inhalte (optional):** `CONTENT_LOCALES` bzw. Setting `content_locales` (z. B. `de,en`) aktiviert eine Sprach-Auswahl pro Eintrag; die öffentliche API filtert per `?locale=`.
- **Medienbibliothek:** Bild-Upload (JPEG/PNG/GIF/WebP/AVIF, Größenlimit) mit Verwaltung im Admin-Panel; Bildfelder haben einen Upload-Button.
- **Webhooks:** Optionale URL, die bei jeder Inhaltsänderung per POST benachrichtigt wird.

### Sicherheit
- **Session-Login statt Basic Auth:** Login-Seite, bcrypt-gehashte Passwörter, Logout, „Passwort ändern".
- **Mehrbenutzer & Rollen:** `admin` (alles) und `editor` (Inhalte, Nachrichten, Medien). Der letzte Admin kann weder gelöscht noch degradiert werden.
- **Sicherer Erststart:** Ohne (oder mit schwachem) `ADMIN_PASS` wird ein Zufallspasswort generiert und einmalig geloggt — es gibt keine Default-Zugangsdaten mehr.
- **CSRF-Schutz** (Token im `X-CSRF-Token`-Header + SameSite-Cookies), **Rate-Limiting** (Login, Kontaktformular, Admin-API), **Helmet**-Security-Header inkl. strikter CSP (keine Inline-Scripts, keine externen Skripte/Fonts).
- **Serverseitige Validierung** aller Feldtypen (Zahlen, Daten, URLs — nur `http(s)` bzw. `/uploads/`), E-Mail-Format und Längenlimits im Kontaktformular, **Honeypot**-Spamschutz.
- **Keine Fehlerdetails an Clients:** 500er antworten generisch, Details landen nur im Server-Log.
- **XSS-Schutz:** Ausgaben werden im Frontend escaped; Markdown wird über einen sicheren Subset-Renderer ausgegeben.

### Betrieb
- **SEO:** Serverseitige Meta-Tags (Title, Description, Open Graph), Detailseiten unter `/c/:slug/:id`, `sitemap.xml`, `robots.txt`.
- **Backups:** JSON-Export/-Import aller Inhalte + konsistenter SQLite-Snapshot-Download (`VACUUM INTO`).
- **Health-Check** (`/healthz`) + Docker-`HEALTHCHECK`, Request-Logging (morgan).
- **Gehärtetes Docker-Setup:** Container läuft als unprivilegierter `node`-User, `.dockerignore` hält Secrets/Daten aus dem Image.
- **Tests & CI:** `node:test`-Suite (Auth, CSRF, Validierung, Publishing, Rollen, …) + GitHub-Actions-Workflow.
- **Admin-UI auf Deutsch/Englisch** umschaltbar.

---

## Tech-Stack

- **Backend:** Node.js, Express 5, express-session, bcryptjs, helmet, express-rate-limit, multer
- **Datenbank:** SQLite3 (Inhalte) + SQLite-Session-Store
- **Mailer:** Nodemailer (SMTP, optional)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (Fetch API)
- **Deployment:** Docker & Docker Compose

---

## Datenmodell

| Tabelle | Zweck |
|---|---|
| `users` | Admin-/Editor-Konten (`username`, bcrypt-`password_hash`, `role`). |
| `content_types` | Definition der Inhaltstypen (`slug`, `name`, `description`, `fields` als JSON). |
| `content_entries` | Einträge (`type_id`, `data` als JSON, `status`, `sort_order`, `publish_at`, `deleted_at`, `locale`). |
| `entry_versions` | Frühere Stände eines Eintrags (max. 20 pro Eintrag). |
| `messages` | Kontaktanfragen (`name`, `email`, `subject`, `body`, `status`). |
| `settings` | Laufzeit-Overrides für Branding/Texte (Key/Value). |

---

## API-Übersicht

**Öffentlich**
- `GET /api/config` — Branding + Liste der Inhaltstypen
- `GET /api/content/:slug?page=&limit=&q=&locale=` — veröffentlichte Einträge (paginierte Antwort `{entries, total, page, limit}`)
- `GET /api/content/:slug/:id` — einzelner Eintrag
- `POST /api/messages` — Kontaktnachricht senden (rate-limitiert, Honeypot-Feld `website`)
- `GET /healthz`, `GET /sitemap.xml`, `GET /robots.txt`

**Auth**
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password`

**Admin (Session + CSRF; ✻ = nur Rolle `admin`)**
- `GET /api/admin/content-types`, ✻`POST /api/admin/content-types`, ✻`PUT|DELETE /api/admin/content-types/:id`
- `GET|POST /api/admin/content/:slug`, `PUT|DELETE /api/admin/content/:slug/:id` (`?permanent=1` löscht endgültig)
- `POST /api/admin/content/:slug/:id/restore`, `PUT /api/admin/content/:slug/reorder`
- `GET /api/admin/content/:slug/:id/versions`, `POST /api/admin/content/:slug/:id/revert/:versionId`
- `GET|POST /api/admin/media`, `DELETE /api/admin/media/:name`
- `GET /api/admin/messages?page=&status=`, `PUT /api/admin/messages/:id/status`, `POST /api/admin/messages/:id/reply`, `DELETE /api/admin/messages/:id`
- ✻`GET|PUT|POST /api/admin/settings`
- ✻`GET|POST /api/admin/users`, ✻`PUT|DELETE /api/admin/users/:id`
- ✻`GET /api/admin/export`, ✻`POST /api/admin/import`, ✻`GET /api/admin/backup`

---

## Setup & Deployment

### 1. Repository klonen
```bash
git clone https://github.com/TankiGHG/Cms.v2.git
cd Cms.v2
```

### 2. Setup-Skript ausführen
Fragt Port, Admin-Zugang, Branding und (optional) SMTP ab, generiert `SESSION_SECRET` und erzeugt die `.env`-Datei:
```bash
chmod +x install.sh
./install.sh
```

### 3. Starten
Per Docker:
```bash
docker compose up -d --build
```
Oder lokal ohne Docker:
```bash
npm install
cp .env.example .env   # anpassen (mind. SESSION_SECRET setzen)
npm start
```

Website: `http://localhost:3000` · Admin: `http://localhost:3000/admin`

**Erster Login:** Ist `ADMIN_PASS` leer (oder ein Platzhalter wie `changeme123`), wird beim ersten Start ein Zufallspasswort generiert und im Server-Log ausgegeben (`docker compose logs app`). Danach im Admin-Panel über „Passwort ändern" ein eigenes setzen.

### Produktion
- Immer hinter einen **TLS-Reverse-Proxy** (Caddy, Traefik, nginx) stellen und `TRUST_PROXY=1` setzen — sonst gehen Login-Daten im Klartext über die Leitung und Secure-Cookies/Rate-Limits funktionieren nicht korrekt.
- `SESSION_SECRET` fest setzen (z. B. `openssl rand -hex 32`), sonst werden Sessions bei jedem Neustart ungültig.
- Das `./data`-Verzeichnis gehört dem Container-User `node` (uid 1000): `chown -R 1000:1000 data` (macht `install.sh` automatisch).

### Tests
```bash
npm test
```

---

## Als Vorlage nutzen

1. `config.js` anpassen — Standard-Branding (`siteSchema`) und Start-Inhaltstypen (`seedContentTypes`).
2. App starten und im Admin-Panel unter **Content Types** eigene Typen/Felder definieren.
3. Unter **Content** Einträge pflegen, unter **Settings** Branding feinjustieren, unter **Media** Bilder hochladen.

Die öffentliche Seite rendert automatisch für jeden Inhaltstyp eine Sektion, verlinkt jede Karte auf eine Detailseite (`/c/:slug/:id`) und stellt die Felder passend zum Feldtyp dar (Bilder, Links, Markdown, Relationen usw.).

---

## Ordnerstruktur

```text
Cms.v2/
├── config.js               # Zentrale Defaults: Branding-Schema, Seed-Inhaltstypen, Feldtypen
├── server.js               # Express-Backend: Auth, API-Routen, Uploads, SQLite, Mailer, SEO
├── public/
│   ├── index.html          # Öffentliche, generische Seite (SEO-Platzhalter)
│   ├── app.js              # Frontend-Logik (Rendering, Detailseiten, Markdown, Kontaktformular)
│   └── admin/
│       ├── login.html      # Login-Seite
│       ├── login.js
│       ├── index.html      # Admin-Panel (Inhalte, Typen, Nachrichten, Medien, Benutzer, Einstellungen)
│       └── admin.js
├── tests/
│   └── api.test.js         # End-to-End-API-Tests (node:test)
├── .github/workflows/ci.yml
├── data/                   # SQLite-DB, Sessions, Uploads (Docker-Volume, nicht im Image)
├── .env.example            # Konfigurationsvorlage
├── .dockerignore
├── docker-compose.yml
├── Dockerfile
├── install.sh              # Interaktives Setup
└── package.json
```

---

## Lizenz
ISC.

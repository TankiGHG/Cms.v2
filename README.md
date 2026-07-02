# CMS.v2 — Lightweight Generic CMS

Ein leichtgewichtiges, generisches Content-Management-System auf Basis von **Node.js + Express + SQLite**. Gedacht als **Grundlage/Vorlage** für beliebige inhaltsgetriebene Websites: Inhaltstypen mit frei definierbaren Feldern, ein geschütztes Admin-Panel, ein generisches Kontaktformular und komplett über Config/Admin konfigurierbares Branding. Kein Build-Step, kein Framework im Frontend — pure HTML/CSS/Vanilla JS.

---

## Features

- **Generisches Inhaltsmodell:** Lege beliebige *Content-Types* (z. B. Posts, Events, Projekte) mit eigenen Feldern an. Unterstützte Feldtypen: `text`, `textarea`, `number`, `date`, `url`, `image`, `boolean`.
- **Admin-Panel:** Tabs für Inhalte, Inhaltstypen (Feld-Builder), Nachrichten und Einstellungen. Dynamische Formulare, die sich automatisch aus der Felddefinition ergeben. Draft/Published-Status pro Eintrag.
- **Konfigurierbares Branding:** Name, Logo, Tagline, Hero-Texte/-Bild, Farben, Footer usw. Defaults kommen aus `config.js`/`.env` und sind **zur Laufzeit im Admin-Panel überschreibbar** (in der `settings`-Tabelle gespeichert).
- **Kontakt/Nachrichten:** Generisches Kontaktformular; Nachrichten werden gespeichert, optional per E-Mail benachrichtigt und lassen sich im Admin-Panel beantworten, als gelesen/archiviert markieren oder löschen.
- **Optionaler Mailer:** Nodemailer/SMTP. Ist kein `SMTP_HOST` gesetzt, läuft die App trotzdem — E-Mail-Funktionen sind dann deaktiviert.
- **SQLite-Persistenz:** Keine externe Datenbank nötig. Beim ersten Start werden Tabellen angelegt und Beispiel-Inhaltstypen (`posts`, `events`) geseedet.
- **Basic-Auth-Schutz:** Admin-Oberfläche und alle `/api/admin`-Endpunkte sind per HTTP Basic Auth geschützt.
- **XSS-Schutz:** Ausgaben werden im Frontend escaped.

---

## Tech-Stack

- **Backend:** Node.js, Express.js
- **Datenbank:** SQLite3
- **Mailer:** Nodemailer (SMTP, optional)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (Fetch API)
- **Deployment:** Docker & Docker Compose

---

## Datenmodell

| Tabelle | Zweck |
|---|---|
| `content_types` | Definition der Inhaltstypen (`slug`, `name`, `description`, `fields` als JSON). |
| `content_entries` | Einzelne Einträge (`type_id`, `data` als JSON, `status`, Zeitstempel). |
| `messages` | Kontaktanfragen (`name`, `email`, `subject`, `body`, `status`). |
| `settings` | Laufzeit-Overrides für Branding/Texte (Key/Value). |

---

## API-Übersicht

**Öffentlich**
- `GET /api/config` — Branding + Liste der Inhaltstypen
- `GET /api/content/:slug` — veröffentlichte Einträge eines Typs
- `GET /api/content/:slug/:id` — einzelner Eintrag
- `POST /api/messages` — Kontaktnachricht senden

**Admin (Basic Auth)**
- `GET|POST /api/admin/content-types`, `PUT|DELETE /api/admin/content-types/:id`
- `GET|POST /api/admin/content/:slug`, `PUT|DELETE /api/admin/content/:slug/:id`
- `GET /api/admin/messages`, `PUT /api/admin/messages/:id/status`, `POST /api/admin/messages/:id/reply`, `DELETE /api/admin/messages/:id`
- `GET|POST /api/admin/settings`

---

## Setup & Deployment

### 1. Repository klonen
```bash
git clone https://github.com/TankiGHG/Cms.v2.git
cd Cms.v2
```

### 2. Setup-Skript ausführen
Fragt Port, Admin-Zugang, Branding und (optional) SMTP ab und erzeugt die `.env`-Datei:
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
cp .env.example .env   # anpassen
npm start
```

Website: `http://localhost:3000` · Admin: `http://localhost:3000/admin`

---

## Als Vorlage nutzen

1. `config.js` anpassen — Standard-Branding (`siteSchema`) und Start-Inhaltstypen (`seedContentTypes`).
2. App starten und im Admin-Panel unter **Content Types** eigene Typen/Felder definieren.
3. Unter **Content** Einträge pflegen, unter **Settings** Branding feinjustieren.

Die öffentliche Seite rendert automatisch für jeden Inhaltstyp eine Sektion und stellt die Felder passend zum Feldtyp dar (Bilder, Links, Datumsangaben usw.).

---

## Ordnerstruktur

```text
Cms.v2/
├── config.js               # Zentrale Defaults: Branding-Schema, Seed-Inhaltstypen, Feldtypen
├── server.js               # Express-Backend, API-Routen, SQLite, Mailer
├── public/
│   ├── index.html          # Öffentliche, generische Seite
│   └── admin/
│       └── index.html      # Admin-Panel (Inhalte, Typen, Nachrichten, Einstellungen)
├── data/
│   └── database.sqlite     # Wird beim ersten Start erzeugt (Docker-Volume)
├── .env.example            # Konfigurationsvorlage
├── docker-compose.yml
├── Dockerfile
├── install.sh              # Interaktives Setup
└── package.json
```

---

## Lizenz
ISC.

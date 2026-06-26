# DJ JAGGER Terminal CMS

![Hero Image](./docs/hero-screenshot.png)

Ein minimalistisches, extrem performantes Content-Management-System und Backend, das exklusiv für "DJ JAGGER" entwickelt wurde. Das gesamte System verzichtet komplett auf UI-Bloatware und präsentiert sich in einer strikten, an Retro-Hacker-Konsolen angelehnten Terminal-Aesthetic.

## Mission
Das Ziel dieses Projekts ist es, eine digitale Visitenkarte zu bieten, die nicht nur optisch durch ihre Einfachheit und ihren Geek-Faktor (ASCII Art, Monospace, Dark Mode) auffällt, sondern auch technisch extrem leichtgewichtig, stabil und sicher ist. Alles läuft in einem schlanken Docker-Container.

---

## Features

- **Terminal-Style Frontend:** Pure HTML, CSS und Vanilla JS. Kein React, kein Bootstrap. Grüner Text auf schwarzem Hintergrund mit blinkendem Cursor.
- **Gig-Verwaltung:** Admin-Dashboard zum einfachen Anlegen und Löschen von anstehenden Auftritten.
- **Booking-Mailer:** Direkte Integration von Nodemailer zur Anbindung an einen Mailcow-Server. Booking-Anfragen werden sowohl in der Datenbank gesichert als auch sofort per E-Mail an den DJ weitergeleitet.
- **SQLite Persistenz:** Keine externen Datenbank-Server nötig. Alle Gigs, Mixes und Bookings werden sicher in einer lokalen SQLite-Datei gespeichert (via Docker-Volumes).
- **Basic Auth Security:** Das gesamte Admin-Dashboard und die zugehörigen API-Endpunkte sind robust durch HTTP Basic Auth abgesichert.

---

## Tech-Stack

*   **Frontend:** HTML5, CSS3 (Custom Properties, Keyframes), Vanilla JavaScript (Fetch API).
*   **Backend:** Node.js, Express.js.
*   **Datenbank:** SQLite3.
*   **Mailer:** Nodemailer (SMTP).
*   **Deployment:** Docker & Docker Compose.

---

## Screenshots

### Frontend / Landing Page
![Frontend Screenshot](./docs/frontend-screenshot.png)

### Admin Dashboard
![Admin Dashboard Screenshot](./docs/admin-screenshot.png)

---

## Setup & Deployment (Schritt-für-Schritt)

Dieses Projekt ist für ein blitzschnelles Deployment via Docker optimiert und verfügt über ein interaktives Setup-Skript.

### 1. Repository klonen
```bash
git clone https://github.com/dein-username/dj-jagger-cms.git
cd dj-jagger-cms
```

### 2. Setup-Skript ausführen
Führe das beiliegende Installations-Skript aus. Es fragt automatisch alle wichtigen Konfigurationen (Admin-Passwort, SMTP-Daten, Port) ab und generiert die `.env`-Datei.
```bash
chmod +x install.sh
./install.sh
```

Am Ende des Skripts wirst du gefragt, ob du den Docker-Container direkt starten möchtest. Bestätige dies mit `y`.

### 3. Manuelles Starten (Optional)
Falls du den Container später manuell starten möchtest, nutze:
```bash
docker compose up -d --build
```

Das war's! Die Website ist nun (standardmäßig) unter `http://localhost:3000` erreichbar.
Das Admin-Dashboard findest du unter `http://localhost:3000/admin` (Logge dich mit den Daten ein, die du im Setup vergeben hast).

---

## Ordnerstruktur

```text
dj-jagger-cms/
│
├── public/                 # Statische Frontend-Dateien (ohne Build-Step!)
│   ├── index.html          # Das öffentliche Terminal-Frontend
│   └── admin/
│       └── index.html      # Das geschützte Admin-Dashboard
│
├── data/                   # Docker-Volume für Persistenz
│   └── database.sqlite     # (Wird beim ersten Start automatisch generiert)
│
├── .env.example            # Vorlage für Secrets
├── .gitignore
├── docker-compose.yml      # Container-Orchestrierung & Volume-Mapping
├── Dockerfile              # Node.js Image Bauplan
├── package.json            # Node-Abhängigkeiten
└── server.js               # Express Backend, API-Routen, SQLite & Mailer-Logik
```

---

## Lizenz
Dieses Projekt wurde exklusiv für DJ JAGGER entwickelt.

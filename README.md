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

Dieses Projekt ist für ein blitzschnelles Deployment via Docker optimiert.

### 1. Repository klonen
```bash
git clone https://github.com/dein-username/dj-jagger-cms.git
cd dj-jagger-cms
```

### 2. Umgebungsvariablen konfigurieren
Kopiere die Vorlage und trage deine Zugangsdaten ein:
```bash
cp .env.example .env
nano .env
```
_Wichtig: Setze hier dein Passwort für das Admin-Dashboard (`ADMIN_PASS`) und deine korrekten Mailcow-SMTP-Daten ein._

### 3. Container starten
Baue und starte den Container im Hintergrund. Docker kümmert sich automatisch um die Installation der Node-Module und das Setup.
```bash
docker compose up -d --build
```

Das war's! Die Website ist nun unter `http://localhost:3000` erreichbar.
Das Admin-Dashboard findest du unter `http://localhost:3000/admin` (Logge dich mit den Daten aus der `.env` ein).

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

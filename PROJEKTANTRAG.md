# Projektantrag

## DJ-Website mit integriertem Content-Management-System (CMS.v2)

| | |
|---|---|
| **Projekttitel** | DJ JAGGER – Website & CMS |
| **Antragsteller** | handballmark2017@gmail.com |
| **Datum** | 02.07.2026 |
| **Version** | 2.0 |
| **Projektstatus** | In Entwicklung |

---

## 1. Ausgangssituation und Zielsetzung

### 1.1 Ausgangssituation
Für den Künstler „DJ JAGGER" wird eine professionelle Online-Präsenz benötigt, über die Fans und Veranstalter kommende Auftritte („Gigs") einsehen und Buchungsanfragen stellen können. Bestehende Baukasten-Lösungen sind zu unflexibel und erlauben keine eigenständige Pflege der Inhalte.

### 1.2 Zielsetzung
Entwicklung einer eigenständigen Webanwendung, bestehend aus:

- einer **öffentlichen Website** zur Darstellung des Künstlers, der Tourdaten und eines Buchungsformulars,
- einem **passwortgeschützten Admin-Bereich** (CMS) zur eigenständigen Verwaltung von Auftritten, Buchungen und Website-Einstellungen,
- einer **automatischen E-Mail-Benachrichtigung** bei Buchungsanfragen sowie der Möglichkeit, direkt zu antworten.

---

## 2. Systemarchitektur

Die Anwendung folgt einer klassischen Client-Server-Architektur:

| Schicht | Technologie |
|---|---|
| **Backend / API** | Node.js mit Express |
| **Datenbank** | SQLite (dateibasiert) |
| **E-Mail-Versand** | Nodemailer (SMTP) |
| **Authentifizierung** | HTTP Basic Auth (`express-basic-auth`) |
| **Frontend** | HTML, CSS, Vanilla JavaScript |
| **Deployment** | Docker / Docker-Compose, Setup-Skript `install.sh` |

Sicherheitsmaßnahmen: Schutz vor XSS (Escaping serverseitig übergebener Daten im Frontend), CORS-Konfiguration, geschützter Admin-Bereich, sauberes Herunterfahren (Graceful Shutdown) zur Vermeidung von Datenbankkorruption.

---

## 3. Funktionsumfang (Leistungsbeschreibung)

### 3.1 Backend – Serverfunktionen (`server.js`)

**Kernfunktionen**

| Funktion | Beschreibung |
|---|---|
| `initDb()` | Initialisiert die Datenbank: legt die Tabellen `gigs`, `bookings` und `settings` an, führt eine Migration der `status`-Spalte durch und setzt einen Standard-Hintergrund. |
| `gracefulShutdown(signal)` | Fährt Server und Datenbankverbindung bei SIGINT/SIGTERM kontrolliert herunter. |

**Öffentliche API-Schnittstellen**

| Endpunkt | Funktion |
|---|---|
| `GET /api/gigs` | Liefert alle Auftritte, nach Datum sortiert. |
| `GET /api/settings` | Liefert öffentliche Einstellungen (z. B. Hintergrundbild). |
| `POST /api/booking` | Nimmt eine Buchungsanfrage entgegen, speichert sie und versendet eine Benachrichtigungs-E-Mail. |

**Geschützte Admin-API-Schnittstellen** (nur mit Login)

| Endpunkt | Funktion |
|---|---|
| `POST /api/admin/gigs` | Neuen Auftritt anlegen. |
| `DELETE /api/admin/gigs/:id` | Auftritt löschen. |
| `GET /api/admin/bookings` | Alle Buchungsanfragen abrufen. |
| `PUT /api/admin/bookings/:id/status` | Status einer Buchung setzen (offen/angenommen/abgelehnt). |
| `POST /api/admin/bookings/:id/reply` | Antwort-E-Mail an den Anfragenden senden. |
| `POST /api/admin/settings` | Website-Einstellung speichern/aktualisieren. |

### 3.2 Öffentliche Website (`public/index.html`)

| Funktion | Beschreibung |
|---|---|
| `fetchGigs()` | Lädt die Tourdaten von der API und stellt sie als Karten dar. |
| `fetchSettings()` | Lädt Einstellungen und setzt das Hero-Hintergrundbild. |
| `escapeHtml(unsafe)` | Sicherheitsfunktion gegen XSS. |
| Formular-Handler | Verarbeitet das Absenden des Buchungsformulars und zeigt eine Rückmeldung an. |

### 3.3 Admin-Bereich / CMS (`public/admin/index.html`)

| Funktion | Beschreibung |
|---|---|
| `loadSettings()` | Lädt bestehende Einstellungen in das Bearbeitungsformular. |
| `fetchBookings()` | Lädt alle Buchungen und stellt sie als Tabelle dar. |
| `setBookingStatus(id, status)` | Ändert den Status einer Buchung (annehmen/ablehnen). |
| `openModal(...)` / `closeModal()` | Öffnet/schließt das Fenster zum Beantworten einer Anfrage. |
| `fetchGigs()` | Lädt alle Auftritte inkl. Lösch-Option. |
| `deleteGig(id)` | Löscht einen Auftritt nach Bestätigung. |
| `escapeHtml(unsafe)` | Sicherheitsfunktion gegen XSS. |
| Formular-Handler | Verwalten Einstellungen, Antwort-E-Mails und das Anlegen neuer Auftritte. |

### 3.4 Installation & Betrieb (`install.sh`)

| Funktion | Beschreibung |
|---|---|
| `prompt(...)` | Interaktive Abfrage der Konfigurationswerte (Port, SMTP, Admin-Zugang) beim Einrichten. |

---

## 4. Zusammenfassung der Kernfunktionen (Nutzersicht)

**Für Besucher der Website:**
1. Ansicht kommender Auftritte mit Datum, Ort, Genre und Ticket-Link.
2. Absenden einer Buchungsanfrage über ein Kontaktformular.

**Für den Administrator (DJ):**
3. Sicherer Login in den geschützten Verwaltungsbereich.
4. Anlegen und Löschen von Auftritten.
5. Übersicht aller eingehenden Buchungsanfragen.
6. Annehmen, Ablehnen und direktes Beantworten von Anfragen per E-Mail.
7. Anpassen des Website-Hintergrundbilds.

**Automatisiert / Technisch:**
8. Automatischer E-Mail-Versand bei neuen Anfragen.
9. Persistente Datenspeicherung in einer SQLite-Datenbank.
10. Container-basiertes Deployment und geführte Ersteinrichtung.

---

## 5. Arbeitspakete und Zeitplan (Beispiel)

| AP | Arbeitspaket | Aufwand |
|---|---|---|
| AP 1 | Backend-Setup, Datenbankmodell & API | 3 Tage |
| AP 2 | Öffentliche Website (Design & Frontend) | 3 Tage |
| AP 3 | Admin-CMS (Buchungs- & Gig-Verwaltung) | 4 Tage |
| AP 4 | E-Mail-Integration & Sicherheit | 2 Tage |
| AP 5 | Deployment, Tests & Dokumentation | 2 Tage |
| | **Gesamt** | **ca. 14 Tage** |

---

## 6. Erwartetes Ergebnis

Eine vollständig lauffähige, eigenständig betreibbare Webanwendung, die es dem Künstler ermöglicht, seine Online-Präsenz und alle Buchungsanfragen ohne technische Vorkenntnisse selbst zu verwalten – bei voller Kontrolle über Daten und Design.

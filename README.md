# Mas0n1x Portfolio

Modernes Portfolio mit integriertem Admin-Panel, Kundenportal und Projektanfrage-System.

## Features

### Portfolio-Website
- Responsive Design mit modernen Animationen
- Dynamische Projektanzeige (aktive & abgeschlossene Projekte)
- Dynamischer Projektzähler
- Impressum-Modal (über Admin steuerbar)

### Admin-Panel
- Projekte und Services verwalten (CRUD)
- Bildupload für Projekte
- Projektanfragen einsehen und bearbeiten
- Nachrichten-System für Kundenkommunikation
- Rechnungsgenerator mit PDF-Export
- Impressum-Verwaltung (TMG-konform)

### Kundenportal
- Kunden-Login und Registrierung
- Projektanfrage-Wizard (mehrstufig)
- Status-Tracking für Anfragen
- Nachrichten-Austausch mit Admin

## Tech Stack

- **Backend**: Node.js, Express
- **Datenbank**: SQLite (sql.js)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Auth**: bcryptjs, express-session
- **Upload**: Multer

## Installation

```bash
# Repository klonen
git clone <repo-url>
cd mas0n1x-portfolio

# Abhängigkeiten installieren
npm install

# Server starten
npm start
```

## Nutzung

Nach dem Start ist verfügbar:

| URL | Beschreibung |
|-----|-------------|
| http://localhost:3000 | Portfolio-Website |
| http://localhost:3000/admin | Admin-Panel |
| http://localhost:3000/kunde | Kundenportal |
| http://localhost:3000/projekt-starten.html | Projektanfrage-Wizard |

### Standard-Login (Admin)

- **Passwort**: `admin`

> **Wichtig**: Passwort nach dem ersten Login ändern!

## Projektstruktur

```
mas0n1x-portfolio/
├── api/
│   └── server.js           # Express Backend & API
├── admin/
│   ├── index.html          # Admin-Panel UI
│   ├── css/
│   │   └── admin.css       # Admin Styles
│   └── js/
│       └── admin.js        # Admin Logik
├── kunde/
│   └── index.html          # Kundenportal
├── data/
│   └── portfolio.db        # SQLite Datenbank
├── uploads/                # Hochgeladene Bilder
├── index.html              # Portfolio Frontend
├── projekt-starten.html    # Projektanfrage-Wizard
├── package.json
└── README.md
```

## API-Endpunkte

### Auth (Admin)
- `POST /api/login` - Admin-Anmeldung
- `POST /api/logout` - Abmelden
- `GET /api/auth/check` - Auth-Status prüfen
- `POST /api/change-password` - Passwort ändern

### Auth (Kunde)
- `POST /api/customer/register` - Kunden-Registrierung
- `POST /api/customer/login` - Kunden-Anmeldung
- `POST /api/customer/logout` - Kunden-Abmeldung
- `GET /api/customer/auth/check` - Kunden-Auth prüfen

### Projekte
- `GET /api/projects` - Alle Projekte abrufen
- `GET /api/projects/:id` - Einzelnes Projekt
- `POST /api/projects` - Projekt erstellen
- `PUT /api/projects/:id` - Projekt aktualisieren
- `DELETE /api/projects/:id` - Projekt löschen

### Services
- `GET /api/services` - Alle Services abrufen
- `POST /api/services` - Service erstellen
- `PUT /api/services/:id` - Service aktualisieren
- `DELETE /api/services/:id` - Service löschen

### Projektanfragen
- `POST /api/requests` - Neue Anfrage erstellen
- `GET /api/requests` - Alle Anfragen (Admin)
- `GET /api/customer/requests` - Eigene Anfragen (Kunde)
- `PUT /api/requests/:id` - Anfrage-Status ändern

### Nachrichten
- `GET /api/requests/:id/messages` - Nachrichten einer Anfrage
- `POST /api/requests/:id/messages` - Nachricht senden

### Einstellungen
- `GET /api/settings` - Einstellungen abrufen (inkl. Impressum)
- `POST /api/settings` - Einstellungen speichern

## Entwicklung

```bash
# Mit Auto-Reload starten
npm run dev
```

## Lizenz

MIT

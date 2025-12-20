# Mas0n1x Portfolio

Modernes Portfolio mit integriertem Admin-Panel zur Verwaltung von Projekten und Services.

## Features

- **Portfolio-Website**: Responsive Design mit modernen Animationen
- **Admin-Panel**: Projekte und Services verwalten (CRUD)
- **Bildupload**: Projektbilder hochladen und verwalten
- **SQLite-Datenbank**: Persistente Datenspeicherung
- **Session-Auth**: Passwortgeschützter Admin-Bereich

## Tech Stack

- **Backend**: Node.js, Express
- **Datenbank**: SQLite (sql.js)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Auth**: bcryptjs, express-session

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

### Standard-Login

- **Passwort**: `admin`

> **Wichtig**: Passwort nach dem ersten Login ändern!

## Projektstruktur

```
mas0n1x-portfolio/
├── api/
│   └── server.js        # Express Backend & API
├── admin/
│   ├── index.html       # Admin-Panel UI
│   ├── css/
│   │   └── admin.css    # Admin Styles
│   └── js/
│       └── admin.js     # Admin Logik
├── data/
│   └── portfolio.db     # SQLite Datenbank
├── uploads/             # Hochgeladene Bilder
├── index.html           # Portfolio Frontend
├── package.json
└── README.md
```

## API-Endpunkte

### Auth
- `POST /api/login` - Anmelden
- `POST /api/logout` - Abmelden
- `GET /api/auth/check` - Auth-Status prüfen
- `POST /api/change-password` - Passwort ändern

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

## Entwicklung

```bash
# Mit Auto-Reload starten
npm run dev
```

## Lizenz

MIT

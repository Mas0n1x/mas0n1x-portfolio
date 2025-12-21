# Mas0n1x Portfolio

Modernes Portfolio mit integriertem Admin-Panel, Kundenportal und Projektanfrage-System.

## Features

### Portfolio-Website
- Responsive Design mit modernen Animationen
- Dynamische Projektanzeige (aktive & abgeschlossene Projekte)
- Dynamischer Projektzähler
- Skill-Badges mit Icons
- Testimonials/Kundenbewertungen
- Impressum-Modal (über Admin steuerbar)

### Admin-Panel
- **Projekte & Services**: Vollständige CRUD-Verwaltung mit Bildupload
- **Projektanfragen**: Einsehen, bearbeiten und Status-Management
- **Nachrichten-System**: Kommunikation mit Kunden
- **Nachrichtenvorlagen**: Vordefinierte Vorlagen für schnelle Antworten
- **Rechnungen & Angebote**: Generator mit PDF-Export und Archiv
- **Vertragsvorlagen**: Generator für individuelle Verträge
- **Skills-Verwaltung**: Skill-Badges für das Portfolio
- **Kundenbewertungen**: Moderation und Freischaltung
- **FAQ-Bereich**: Verwaltung häufiger Fragen
- **Dokumenten-Center**: Dateiverwaltung für Kundenprojekte
- **Backup-System**: Automatische Datenbank-Backups
- **E-Mail-Automatisierung**: Automatische Benachrichtigungen
- **Impressum-Verwaltung**: TMG-konforme Angaben

### Kundenportal
- Kunden-Login und Registrierung
- Projektanfrage-Wizard (mehrstufig)
- Status-Tracking für Anfragen
- Nachrichten-Austausch mit Admin
- Dokumenten-Download
- Bewertungen abgeben

## Tech Stack

- **Backend**: Node.js, Express
- **Datenbank**: SQLite (sql.js)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Auth**: bcryptjs, express-session
- **Upload**: Multer
- **PDF**: jsPDF (clientseitig)

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
│   ├── index.html          # Kundenportal UI
│   ├── css/
│   │   └── kunde.css       # Kundenportal Styles
│   └── js/
│       └── kunde.js        # Kundenportal Logik
├── data/
│   └── portfolio.db        # SQLite Datenbank
├── uploads/                # Hochgeladene Bilder
├── backups/                # Datenbank-Backups
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

### Skills
- `GET /api/skills` - Alle Skills abrufen
- `POST /api/admin/skills` - Skill erstellen
- `PUT /api/admin/skills/:id` - Skill aktualisieren
- `DELETE /api/admin/skills/:id` - Skill löschen

### Projektanfragen
- `POST /api/requests` - Neue Anfrage erstellen
- `GET /api/requests` - Alle Anfragen (Admin)
- `GET /api/customer/requests` - Eigene Anfragen (Kunde)
- `PUT /api/requests/:id` - Anfrage-Status ändern

### Nachrichten
- `GET /api/requests/:id/messages` - Nachrichten einer Anfrage
- `POST /api/requests/:id/messages` - Nachricht senden

### Nachrichtenvorlagen
- `GET /api/admin/templates` - Alle Vorlagen abrufen
- `POST /api/admin/templates` - Vorlage erstellen
- `PUT /api/admin/templates/:id` - Vorlage aktualisieren
- `DELETE /api/admin/templates/:id` - Vorlage löschen

### Kundenbewertungen
- `GET /api/reviews` - Öffentliche Bewertungen
- `GET /api/admin/reviews` - Alle Bewertungen (Admin)
- `POST /api/customer/reviews` - Bewertung erstellen
- `PUT /api/admin/reviews/:id` - Bewertung bearbeiten/freischalten

### FAQs
- `GET /api/faqs` - Alle FAQs abrufen
- `POST /api/admin/faqs` - FAQ erstellen
- `PUT /api/admin/faqs/:id` - FAQ aktualisieren
- `DELETE /api/admin/faqs/:id` - FAQ löschen

### Rechnungen & Angebote
- `GET /api/admin/invoices` - Alle Rechnungen
- `POST /api/admin/invoices` - Rechnung erstellen
- `PUT /api/admin/invoices/:id` - Rechnung aktualisieren
- `GET /api/admin/quotes` - Alle Angebote
- `POST /api/admin/quotes` - Angebot erstellen

### Verträge
- `GET /api/admin/contracts` - Alle Verträge
- `POST /api/admin/contracts` - Vertrag erstellen

### Backups
- `GET /api/admin/backups` - Backup-Liste
- `POST /api/admin/backup` - Backup erstellen
- `GET /api/admin/backup/:filename` - Backup herunterladen
- `POST /api/admin/backup/restore/:filename` - Backup wiederherstellen

### Einstellungen
- `GET /api/settings` - Einstellungen abrufen (inkl. Impressum)
- `POST /api/settings` - Einstellungen speichern

## Entwicklung

```bash
# Mit Auto-Reload starten (nodemon erforderlich)
npm run dev
```

## Lizenz

MIT

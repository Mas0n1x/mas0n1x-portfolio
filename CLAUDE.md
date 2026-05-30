# CLAUDE.md

Leitfaden für Claude Code (claude.com/code) in diesem Repository.

## Projekt

**Mas0n1x Portfolio** — Portfolio-Website mit integriertem Admin-Panel, Kundenportal und Projektanfrage-System.

## Tech-Stack

- **Frontend:** statisches HTML/CSS/JS (`index.html`, `kunde/`, `admin/`, …)
- **Backend:** Node.js + **Express** (`api/server.js`), `express-session`, `bcryptjs`, **sql.js** (SQLite)
- **Docker / docker-compose** (Backend-Container + nginx-Container)

## Struktur

- `index.html`, `projekt-starten.html`, `maintenance.html` — öffentliche Seiten
- `admin/` — Admin-Panel, `kunde/` — Kundenportal
- `api/` — Express-Backend (`server.js`)
- `data/` — SQLite-Daten (git-ignored), `uploads/` — Uploads (git-ignored)
- `nginx.conf`, `nginx-docker.conf`, `Dockerfile.backend`, `docker-compose.yml`

## Entwicklung

```bash
npm install
npm run dev      # node --watch api/server.js  (Backend auf :3000)
npm start        # Produktion
```

Gesamt: `docker compose up -d --build` (Frontend nginx auf `http://localhost:8101`, Backend auf `:3000`).

## Konventionen

- Daten/Uploads/Backups bleiben über `.gitignore` ausgeschlossen.
- Neue Quelldateien erhalten den Copyright-Header im Stil der bestehenden Dateien.

## Lizenz & Urheberrecht

Copyright (c) 2024-2026 DEV Mas0n1x. Alle Rechte vorbehalten.

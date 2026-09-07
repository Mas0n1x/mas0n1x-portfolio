/*
 * Copyright (c) 2024-2026 DEV Mas0n1x. Alle Rechte vorbehalten.
 *
 * Kuratierte Projekt-Auswahl fuer die Portfolio-Startseite — als Code, damit
 * sie einen DB-Reset ueberlebt. Setzt in `github_projects` fuer die unten
 * gelisteten Repos: selected=1, Titel, Kurz-/Detailtext, Tags, Link, Bilder,
 * Status und Reihenfolge. Bilder liegen in scripts/seed-assets/ und werden
 * nach data/../uploads/ kopiert.
 *
 * NUTZUNG (Backend muss gestoppt sein — der laufende Prozess haelt die DB
 * im Speicher und wuerde die Datei ueberschreiben):
 *
 *   docker compose stop backend
 *   docker compose run --rm backend node scripts/seed-portfolio-projects.js [--sync]
 *   docker compose start backend
 *
 *   --sync   vorher alle Repos frisch von GitHub in github_projects upserten
 *            (braucht GITHUB_TOKEN). Ohne Flag werden nur bereits vorhandene
 *            Repo-Zeilen kuratiert; fehlende werden gemeldet.
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '..', 'data', 'portfolio.db');
const ASSETS = path.join(__dirname, 'seed-assets');
const UPLOADS = path.join(__dirname, '..', 'uploads');

const IMG = (names) => JSON.stringify(names.map((n, i) => ({ path: `/uploads/${n}`, order: i })));

const CURATION = [
  { fn: 'LawNet-Team/LawNet', title: 'LawNet', status: 'completed', order: 0,
    link: 'https://demo.lawnet.sale',
    tags: ['Node.js', 'Express', 'SQLite', 'WebSocket', 'CAD/MDT', 'Multi-Tenant'],
    desc: 'Digitales Aktenverwaltungssystem (CAD/MDT) für Behörden-Roleplay — Bürger, Fahrzeuge, Strafakten, Einsatzberichte, Gewerbe und ein Live-Strafrechner.',
    detail: 'Kern des LawNet-Ökosystems. Vanilla-SPA auf Node/Express/SQLite, mandantenfähig (eine Instanz, eine Datenbank pro Kunde), versionierte Migrationen, RBAC mit über 64 Rechten und Auto-Backups. Akten- und Berichtsgeneratoren mit kollaborativen Echtzeit-Sessions über WebSocket. Im produktiven Einsatz bei zwei RP-Servern mit zusammen über 2.300 Spielern.',
    images: ['pf-lawnet-1.png', 'pf-lawnet-2.png', 'pf-lawnet-3.png', 'pf-lawnet-4.png', 'pf-lawnet-5.png'] },
  { fn: 'Mas0n1x/PersoNet-CC', title: 'PersoNet', status: 'completed', order: 1,
    link: 'https://demo-personet.lawnet.sale',
    tags: ['React', 'TypeScript', 'Prisma', 'Discord OAuth', 'Socket.IO'],
    desc: 'Personalverwaltung für Roleplay-Behörden — Mitarbeiter, Ränge, Units, Schichten, Bewerbungs- und Sanktions-Workflow, mit Discord-Sync.',
    detail: 'React/TypeScript + Express + Prisma. Rollen- und Rechtesystem, Academy-Modul, Dienstzeit-Tracking über die FiveM-API, Leitstellen-Bonus-Abrechnung. Die RP-spezifischen Erweiterungen (SWAT, Detectives, Asservate, Interne Ermittlungen …) sind modular echt abschaltbar. Live bei Corleone City.',
    images: ['pf-personet-1.png', 'pf-personet-2.png', 'pf-personet-3.png', 'pf-personet-4.png', 'pf-personet-5.png'] },
  { fn: 'LawNet-Team/SaleNet', title: 'SaleNet', status: 'completed', order: 2,
    link: 'https://lawnet.sale',
    tags: ['Node.js', 'Stripe', 'SQLite', 'SaaS', 'Affiliate'],
    desc: 'Shop- und Kundenportal für das LawNet-Ökosystem — Stripe-Checkout, Lizenzverwaltung, Affiliate-System, Onboarding-Mails und Admin-Dashboard.',
    detail: 'Node/Express/SQLite. Stripe-Live-Checkout mit vollem Abo-Lebenszyklus (Kündigung, Fehlzahlung, Verlängerung, Idempotenz), Rechnungs- und Vertragslogik nach deutschem Recht inkl. Kleinunternehmerregelung, Discord-Support-Bot-Anbindung und Wartungsmodus mit IP-Whitelist.',
    images: ['pf-salenet-1.png', 'pf-salenet-2.png', 'pf-salenet-3.png', 'pf-salenet-4.png', 'pf-salenet-5.png'] },
  { fn: 'LawNet-Team/DispatchNet', title: 'DispatchNet', status: 'completed', order: 3,
    link: 'https://lawnet.sale',
    tags: ['Next.js', 'TypeScript', 'Socket.IO', 'Discord OAuth'],
    desc: 'Live-Leitstelle für FiveM-LSPD — Streifeneinteilung in Echtzeit, Status-Codes, Einheiten je Revier und automatische Dienstzeiterfassung.',
    detail: 'React/TypeScript + Express + Prisma, socket-basiertes Live-Board. Streifen je Polizeirevier per Drag-and-drop, Status-Codes, FiveM-Presence-Poller für die Dienstzeit, Officer-Dienstzeit-Ranking. Discord-OAuth mit rollenbasiertem Zugriff.',
    images: ['pf-dispatchnet-1.png', 'pf-dispatchnet-2.png', 'pf-dispatchnet-3.png', 'pf-dispatchnet-4.png', 'pf-dispatchnet-5.png'] },
  { fn: 'LawNet-Team/MapNet', title: 'MapNet', status: 'completed', order: 4,
    link: 'https://demo-mapnet.lawnet.sale',
    tags: ['Leaflet', 'Node.js', 'WebSocket'],
    desc: 'Interaktive Ortskunde-Karte fürs Police Department — Bezirke, Marker und Routen mit Echtzeit-Persistenz, plus Ortskunde-Prüfung für Azubis.',
    detail: 'Geteilte Leaflet-Karte auf Node/Express. Schreibzugriff per Token-Auth abgesichert, versteckte Prüfungspunkte serverseitig maskiert. Bezirke und Marker werden live für alle Bearbeiter synchronisiert.',
    images: ['pf-mapnet-1.jpg', 'pf-mapnet-2.jpg', 'pf-mapnet-3.jpg', 'pf-mapnet-4.jpg'] },
  { fn: 'LawNet-Team/AzubiNet', title: 'AzubiNet', status: 'completed', order: 5,
    link: 'https://demo-azubinet.lawnet.sale',
    tags: ['React', 'TypeScript', 'Socket.IO'],
    desc: 'Prüfungsplattform für Ausbilder und Azubis — Prüfungen erstellen, Live-Monitor, Auto-Bewertung, Ergebnis-Historie.',
    detail: 'React/TypeScript mit Live-Monitor über Socket.IO. Auto-Bewertung für Multiple-Choice, Lückentext und Zuordnung, Fortschritts-Tracking pro Azubi, Gruppen-Zuweisung und geplante PDF-Zertifikate mit öffentlicher Verifikation.',
    images: ['pf-azubinet-1.png', 'pf-azubinet-2.png', 'pf-azubinet-3.png', 'pf-azubinet-4.png', 'pf-azubinet-5.png'] },
  { fn: 'Mas0n1x/Jarvis', title: 'Jarvis', status: 'in_progress', order: 6,
    link: '',
    tags: ['Python', 'FastAPI', 'LLM', 'Whisper', 'React', 'WebSocket'],
    desc: 'Lokaler, sprachgesteuerter KI-Assistent mit futuristischem HUD — Wake-Word, STT, LLM, TTS und Tool-Calling, komplett offline.',
    detail: 'FastAPI-Gateway mit EventBus-Architektur (Ports & Adapters). faster-whisper für die Spracherkennung, Ollama/Qwen als lokales LLM, Piper/Edge-TTS für die Ausgabe, Porcupine als Wake-Word. React-HUD im FUI-Stil. Läuft vollständig auf eigener Hardware (RTX 3060), Priorität liegt auf niedriger Latenz und lokaler Verarbeitung.',
    images: ['pf-jarvis-1.png', 'pf-jarvis-2.png', 'pf-jarvis-3.png'] },
  { fn: 'Mas0n1x/ProductivityTracker', title: 'ProductivityTracker', status: 'completed', order: 7,
    link: '',
    tags: ['Electron', 'JavaScript', 'Kanban', 'Gamification'],
    desc: 'Visueller Produktivitäts-Tracker als Desktop-App — Kanban-Board, Pomodoro mit Kaffeetassen-Timer, Fokus-Modus, XP und Streaks.',
    detail: 'Electron-Desktop-App. Drag-and-drop-Kanban (Backlog/In Arbeit/Erledigt), Pomodoro- und Ist-Zeit-Timer mit Soll-Ist-Vergleich, Tagesziel, Level-System mit XP und Serien, Statistik- und Projektauswertung. Optionaler Cloud-Sync über eine separate Web-Plattform.',
    images: ['pf-productivity-1.png', 'pf-productivity-2.png', 'pf-productivity-3.png', 'pf-productivity-4.png', 'pf-productivity-5.png'] },
  { fn: 'Mas0n1x/passwort-manager', title: 'Passwort-Manager', status: 'completed', order: 8,
    link: '',
    tags: ['Electron', 'AES-256', 'Security'],
    desc: 'Lokaler Passwort-Manager mit AES-256-Verschlüsselung, Leak-Check und Browser-Integration — Desktop-App, kein Cloud-Zwang.',
    detail: 'Electron-Desktop-App. Tresor lokal AES-256-verschlüsselt, Master-Passwort, Passwort-Generator, Leak-Check gegen bekannte Datenlecks, Kategorien und Favoriten, Ablauf-Warnungen, Browser-Erweiterung zum Autofill. Zusätzliche Sicherheits-Heuristiken für schwache und wiederverwendete Passwörter.',
    images: ['pf-passwort-1.png', 'pf-passwort-2.png', 'pf-passwort-3.png', 'pf-passwort-4.png', 'pf-passwort-5.png'] },
];

async function main() {
  const doSync = process.argv.includes('--sync');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB));
  const get = (sql, p = []) => { const s = db.prepare(sql); s.bind(p); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };

  if (doSync) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('--sync gesetzt, aber GITHUB_TOKEN fehlt');
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mas0n1x-portfolio', 'X-GitHub-Api-Version': '2022-11-28' };
    let repos = [];
    for (let page = 1; page <= 5; page++) {
      const r = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner,organization_member&sort=pushed`, { headers });
      if (!r.ok) throw new Error('GitHub API ' + r.status);
      const d = await r.json(); repos = repos.concat(d);
      if (d.length < 100) break;
    }
    for (const repo of repos) {
      const vals = [repo.full_name, repo.name, repo.owner ? repo.owner.login : '', repo.description || '', repo.language || '', repo.html_url, JSON.stringify(repo.topics || []), repo.stargazers_count || 0, repo.private ? 1 : 0, repo.pushed_at || '', repo.homepage || ''];
      const ex = get('SELECT repo_id FROM github_projects WHERE repo_id = ?', [repo.id]);
      if (ex) db.run('UPDATE github_projects SET full_name=?,name=?,owner=?,gh_description=?,gh_language=?,gh_url=?,gh_topics=?,gh_stars=?,gh_private=?,gh_pushed_at=?,gh_homepage=? WHERE repo_id=?', [...vals, repo.id]);
      else db.run('INSERT INTO github_projects (repo_id,full_name,name,owner,gh_description,gh_language,gh_url,gh_topics,gh_stars,gh_private,gh_pushed_at,gh_homepage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [repo.id, ...vals]);
    }
    console.log('sync: upserted', repos.length, 'repos');
  }

  if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
  db.run('UPDATE github_projects SET selected = 0');
  let applied = 0; const missing = [];
  for (const c of CURATION) {
    const row = get('SELECT repo_id FROM github_projects WHERE full_name = ?', [c.fn]);
    if (!row) { missing.push(c.fn); continue; }
    for (const img of c.images) {
      const src = path.join(ASSETS, img);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(UPLOADS, img));
      else console.warn('  Bild fehlt:', img);
    }
    db.run(
      'UPDATE github_projects SET selected=1, custom_title=?, custom_desc=?, detail_desc=?, custom_tags=?, custom_link=?, images=?, status=?, sort_order=? WHERE repo_id=?',
      [c.title, c.desc, c.detail, JSON.stringify(c.tags), c.link || '', IMG(c.images), c.status, c.order, row.repo_id]
    );
    applied++;
  }
  console.log('kuratiert:', applied, '| fehlende Repos:', missing.join(', ') || '-');
  if (missing.length && !doSync) console.log('  Tipp: mit --sync erneut ausfuehren, um die Repos zu holen.');

  fs.writeFileSync(DB, Buffer.from(db.export()));
  console.log('DB geschrieben:', DB);
}
main().catch(e => { console.error(e); process.exit(1); });

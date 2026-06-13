/*
 * Mas0n1x Portfolio
 * Copyright (c) 2024-2026 DEV Mas0n1x.
 * Alle Rechte vorbehalten.
 */
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const DiscordBot = require('./discord-bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Database Setup
const dbPath = path.join(__dirname, '..', 'data', 'portfolio.db');
let db;

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ── Persistente Geheimnisse (Session-Secret + Verschlüsselungs-Key) ──
// Liegen im data-Volume und überleben Container-Rebuilds. KEIN hartkodierter
// Fallback mehr — sonst könnte jeder mit dem öffentlich im Code stehenden Secret
// gültige Admin-Session-Cookies fälschen. Bevorzugt ENV, sonst zufällig erzeugt.
function loadOrCreateSecret(file, bytes) {
  const p = path.join(dataDir, file);
  try {
    const v = fs.readFileSync(p, 'utf8').trim();
    if (v) return v;
  } catch (e) { /* neu erzeugen */ }
  const secret = crypto.randomBytes(bytes).toString('hex');
  try { fs.writeFileSync(p, secret, { mode: 0o600 }); } catch (e) { fs.writeFileSync(p, secret); }
  return secret;
}
const SESSION_SECRET = process.env.SESSION_SECRET || loadOrCreateSecret('.session_secret', 48);
const ENC_KEY = crypto.createHash('sha256')
  .update(process.env.SECRETS_KEY || loadOrCreateSecret('.secrets_key', 32))
  .digest(); // 32 Byte für AES-256-GCM

// Verschlüsselung für Secrets in der DB (Format: enc:v1:<iv>:<tag>:<cipher>).
// Selbst-migrierend: Klartext-Altwerte werden beim Lesen unverändert zurückgegeben.
function encryptSecret(plain) {
  if (plain == null || plain === '') return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}
function decryptSecret(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:v1:')) return value; // Klartext (alt)
  try {
    const [, , ivH, tagH, dataH] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivH, 'hex'));
    decipher.setAuthTag(Buffer.from(tagH, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataH, 'hex')), decipher.final()]).toString('utf8');
  } catch (e) { return value; }
}

// Initialize Database
async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize tables
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      image TEXT,
      tags TEXT,
      link TEXT,
      status TEXT DEFAULT 'completed',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add status column if it doesn't exist (migration for existing databases)
  try {
    db.run("ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'completed'");
  } catch (e) {
    // Column already exists, ignore
  }
  // Zahlungslink pro Rechnung (Stripe Payment Link / PayPal.me / ...)
  try { db.run("ALTER TABLE invoices ADD COLUMN payment_link TEXT"); } catch (e) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      icon TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY,
      password_hash TEXT NOT NULL
    )
  `);

  // Login-Historie (Sicherheit)
  db.run(`
    CREATE TABLE IF NOT EXISTS login_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT DEFAULT (datetime('now')),
      ip TEXT,
      user_agent TEXT,
      success INTEGER,
      note TEXT
    )
  `);

  // Customers table
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Project requests table
  db.run(`
    CREATE TABLE IF NOT EXISTS project_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      project_type TEXT NOT NULL,
      budget TEXT NOT NULL,
      timeline TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'new',
      deadline TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  // Messages table for communication
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES project_requests(id)
    )
  `);

  // Files table for attachments
  db.run(`
    CREATE TABLE IF NOT EXISTS request_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      message_id INTEGER,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES project_requests(id),
      FOREIGN KEY (message_id) REFERENCES messages(id)
    )
  `);

  // Invoices table for invoice archive
  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_address TEXT,
      amount REAL NOT NULL,
      tax REAL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT DEFAULT 'offen',
      due_date TEXT,
      paid_date TEXT,
      notes TEXT,
      items TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  // Activities table for tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Reviews/Testimonials table
  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      title TEXT,
      content TEXT,
      is_public INTEGER DEFAULT 0,
      is_approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES project_requests(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  // Message templates table
  db.run(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Customer documents table
  db.run(`
    CREATE TABLE IF NOT EXISTS customer_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      request_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      file_path TEXT,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (request_id) REFERENCES project_requests(id)
    )
  `);

  // FAQ table
  db.run(`
    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Appointments table
  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      type TEXT DEFAULT 'consultation',
      notes TEXT,
      admin_notes TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  // Oeffentliche Erstgespraech-Buchungen (ohne Kundenkonto)
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'neu',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Contract templates table
  db.run(`
    CREATE TABLE IF NOT EXISTS contract_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'standard',
      content TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Generated contracts table
  db.run(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_number TEXT NOT NULL,
      template_id INTEGER,
      request_id INTEGER,
      customer_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      signed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (template_id) REFERENCES contract_templates(id),
      FOREIGN KEY (request_id) REFERENCES project_requests(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  // Skills/Technologies table for portfolio badges
  db.run(`
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      category TEXT DEFAULT 'frontend',
      level INTEGER DEFAULT 80,
      color TEXT DEFAULT '#00ff88',
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Email automation logs
  db.run(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT,
      status TEXT DEFAULT 'sent',
      entity_type TEXT,
      entity_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Backup logs
  db.run(`
    CREATE TABLE IF NOT EXISTS backup_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      size INTEGER,
      type TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'success',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Discord Bot tables
  db.run(`
    CREATE TABLE IF NOT EXISTS discord_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS discord_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      channel_id TEXT,
      message_id TEXT,
      user_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add progress column to projects if not exists
  try {
    db.run('ALTER TABLE projects ADD COLUMN progress INTEGER DEFAULT 0');
  } catch (e) {}

  // Add progress column to project_requests if not exists
  try {
    db.run('ALTER TABLE project_requests ADD COLUMN progress INTEGER DEFAULT 0');
  } catch (e) {}

  // Add admin_notes column to project_requests if not exists
  try {
    db.run('ALTER TABLE project_requests ADD COLUMN admin_notes TEXT');
  } catch (e) {}

  // Add name and company to customers if not exists
  try {
    db.run('ALTER TABLE customers ADD COLUMN name TEXT');
    db.run('ALTER TABLE customers ADD COLUMN company TEXT');
  } catch (e) {}

  // Add images (JSON array) and logo columns to projects
  try {
    db.run('ALTER TABLE projects ADD COLUMN images TEXT');
  } catch (e) {}
  try {
    db.run('ALTER TABLE projects ADD COLUMN logo TEXT');
  } catch (e) {}

  // Migrate existing single image data to images array
  try {
    const stmt = db.prepare("SELECT id, image, images FROM projects WHERE image IS NOT NULL AND image != '' AND (images IS NULL OR images = '')");
    const migrateRows = [];
    while (stmt.step()) {
      migrateRows.push(stmt.getAsObject());
    }
    stmt.free();
    for (const p of migrateRows) {
      const imagesJson = JSON.stringify([{ path: p.image, order: 0 }]);
      dbRun('UPDATE projects SET images = ? WHERE id = ?', [imagesJson, p.id]);
    }
  } catch (e) {
    console.error('Image migration error:', e);
  }

  // GitHub-Projekte: gecachte Repo-Daten + Kuratierung (Auswahl, eigene Inhalte, Bilder)
  db.run(`
    CREATE TABLE IF NOT EXISTS github_projects (
      repo_id INTEGER PRIMARY KEY,
      full_name TEXT,
      name TEXT,
      owner TEXT,
      gh_description TEXT,
      gh_language TEXT,
      gh_url TEXT,
      gh_topics TEXT,
      gh_stars INTEGER DEFAULT 0,
      gh_private INTEGER DEFAULT 0,
      gh_pushed_at TEXT,
      gh_homepage TEXT,
      selected INTEGER DEFAULT 0,
      custom_title TEXT,
      custom_desc TEXT,
      detail_desc TEXT,
      custom_tags TEXT,
      custom_link TEXT,
      images TEXT,
      logo TEXT,
      status TEXT DEFAULT 'completed',
      sort_order INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Magic-Links für passwortlosen Zugang zum Kundenportal (öffentliche Anfrage).
  db.run(`
    CREATE TABLE IF NOT EXISTS magic_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Check if admin exists
  const adminCheck = db.exec("SELECT * FROM admin WHERE id = 1");
  if (adminCheck.length === 0 || adminCheck[0].values.length === 0) {
    const defaultHash = bcrypt.hashSync('admin', 10);
    db.run("INSERT INTO admin (id, password_hash) VALUES (1, ?)", [defaultHash]);
    console.log('Default admin created. Password: admin (please change!)');
  }

  saveDatabase();
  console.log('Database initialized');
}

// Save database to file
function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Helper functions for database queries
function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
  saveDatabase();
  return { lastInsertRowid: lastId };
}

// Discord Bot instance (initialized after DB)
let discordBot = null;

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});
const projectUpload = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'logo', maxCount: 1 }
]);

// Middleware
// CORS nur für eigene Domains (same-origin Requests aus Admin/Kunde/Website).
// Server-zu-Server / curl (kein Origin-Header) bleibt erlaubt.
const allowedOrigins = [
  'https://mas0n1x.online',
  'https://www.mas0n1x.online',
  'http://localhost:8101',
  'http://localhost:3000'
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Nicht durch CORS erlaubt'));
  },
  credentials: true
}));
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// UTF-8 Encoding für API-Responses (deutsche Umlaute)
app.use('/api', (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(data);
  };
  next();
});
// Trust proxy for nginx
app.set('trust proxy', 1);

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    // 'auto': secure-Cookie nur wenn die Verbindung als HTTPS erkannt wird
    // (via trust proxy + X-Forwarded-Proto aus nginx). Lokal (HTTP) bleibt es funktionsfähig.
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static files
// Schutz-Guard VOR dem Root-Static: verhindert, dass sensible Dateien aus dem
// Projekt-Root per HTTP abrufbar sind (Cookie-Jars, DB, Configs, Quellcode).
// Echte /api-Routen (von den Routern weiter unten bedient) werden NICHT blockiert.
const BLOCKED_STATIC = /(^|\/)(node_modules\/|backups\/)|\.(db|sqlite|env|conf|cnf|ya?ml|log|lock|md|gitignore)$|(^|\/)(cookies|customer\d*|package(-lock)?)/i;
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  // Quelldateien unter /api/ nie als Datei ausliefern, echte API-Pfade aber durchlassen.
  if (/^\/api\//i.test(req.path)) {
    if (/\.(c|m)?js$/i.test(req.path)) return res.status(404).end();
    return next();
  }
  if (/^\/(data|\.git)(\/|$)/i.test(req.path) || BLOCKED_STATIC.test(req.path)) {
    return res.status(404).end();
  }
  next();
});
app.use(express.static(path.join(__dirname, '..'), { dotfiles: 'deny' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// Auth Middleware - Admin
const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Auth Middleware - Customer
const requireCustomerAuth = (req, res, next) => {
  if (req.session && req.session.customerId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Multer for request files (allows more file types)
const requestFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'requests');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const requestUpload = multer({
  storage: requestFileStorage,
  // Nur unbedenkliche Dokument-/Bildtypen zulassen; ausführbare/aktive Inhalte (exe, html, svg, js …) blocken.
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpe?g|png|gif|webp|bmp|pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z)$/i;
    if (allowed.test(file.originalname)) return cb(null, true);
    cb(new Error('Dieser Dateityp ist nicht erlaubt. Erlaubt sind Bilder, PDF, Office-Dokumente, Text und Archive.'));
  },
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// ==================== BRUTE-FORCE-SCHUTZ ====================
// In-Memory Rate-Limit pro IP für Login-Endpoints (kein npm-Paket → keine ESM-Falle).
const loginAttempts = new Map(); // ip -> { count, first, blockedUntil }
const LOGIN_WINDOW = 15 * 60 * 1000; // 15 Min Beobachtungsfenster
const LOGIN_MAX = 8;                 // erlaubte Fehlversuche im Fenster
const LOGIN_BLOCK = 15 * 60 * 1000;  // Sperrdauer nach Überschreitung
function loginRateLimit(req, res, next) {
  const ip = clientIp(req) || 'unknown';
  const rec = loginAttempts.get(ip);
  const now = Date.now();
  if (rec && rec.blockedUntil > now) {
    const mins = Math.ceil((rec.blockedUntil - now) / 60000);
    return res.status(429).json({ error: `Zu viele Fehlversuche. Bitte in ${mins} Minute(n) erneut versuchen.` });
  }
  next();
}
function registerLoginFail(req) {
  const ip = clientIp(req) || 'unknown';
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec || now - rec.first > LOGIN_WINDOW) rec = { count: 0, first: now, blockedUntil: 0 };
  rec.count++;
  if (rec.count >= LOGIN_MAX) rec.blockedUntil = now + LOGIN_BLOCK;
  loginAttempts.set(ip, rec);
}
function registerLoginSuccess(req) {
  loginAttempts.delete(clientIp(req) || 'unknown');
}
// Aufräumen: alte Einträge stündlich entfernen
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts) {
    if (rec.blockedUntil < now && now - rec.first > LOGIN_WINDOW) loginAttempts.delete(ip);
  }
}, 60 * 60 * 1000);

// ==================== AUTH ROUTES ====================

// ===== 2FA / Login-Historie (Sicherheit) =====
function twofaEnabled() { return dbGet("SELECT value FROM settings WHERE key = 'twofa_enabled'")?.value === 'true'; }
function logLogin(req, success, note) {
  try {
    dbRun('INSERT INTO login_log (ip, user_agent, success, note) VALUES (?, ?, ?, ?)',
      [clientIp(req), (req.headers['user-agent'] || '').slice(0, 200), success ? 1 : 0, note || '']);
  } catch (e) { /* logging darf den Login nie blockieren */ }
}
function verify2faCode(code) {
  if (!code) return false;
  const secret = dbGet("SELECT value FROM settings WHERE key = 'twofa_secret'")?.value;
  if (secret && authenticator.check(String(code).replace(/\s/g, ''), secret)) return true;
  // Einmal-Backup-Code (gehasht gespeichert)
  const raw = dbGet("SELECT value FROM settings WHERE key = 'twofa_backup'")?.value;
  if (raw) {
    let codes = []; try { codes = JSON.parse(raw); } catch (e) {}
    const h = crypto.createHash('sha256').update(String(code).trim().toLowerCase()).digest('hex');
    const idx = codes.indexOf(h);
    if (idx >= 0) { codes.splice(idx, 1); dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('twofa_backup', ?)", [JSON.stringify(codes)]); return true; }
  }
  return false;
}

app.post('/api/login', loginRateLimit, (req, res) => {
  const { password } = req.body;
  const admin = dbGet('SELECT password_hash FROM admin WHERE id = 1');
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    registerLoginFail(req);
    logLogin(req, false, 'Falsches Passwort');
    return res.status(401).json({ error: 'Invalid password' });
  }
  registerLoginSuccess(req);
  // Noch das Standard-Passwort "admin"? → Frontend zum Wechsel zwingen.
  const mustChange = bcrypt.compareSync('admin', admin.password_hash);
  if (twofaEnabled()) {
    req.session.pending2fa = true;
    req.session.mustChange2fa = mustChange;
    return res.json({ success: false, twofa: true });
  }
  // Session-ID nach erfolgreichem Login neu erzeugen (Schutz vor Session-Fixation).
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session-Fehler' });
    req.session.authenticated = true;
    logLogin(req, true, 'Passwort');
    res.json({ success: true, mustChangePassword: mustChange });
  });
});

app.post('/api/login/2fa', loginRateLimit, (req, res) => {
  if (!req.session.pending2fa) return res.status(401).json({ error: 'Keine 2FA-Anmeldung ausstehend' });
  if (verify2faCode(req.body.code)) {
    registerLoginSuccess(req);
    const mustChange = !!req.session.mustChange2fa;
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session-Fehler' });
      req.session.authenticated = true;
      logLogin(req, true, '2FA');
      res.json({ success: true, mustChangePassword: mustChange });
    });
    return;
  }
  // Fehlversuch zählt ins IP-Rate-Limit; nach 5 Fehlversuchen 2FA-Sitzung verwerfen.
  registerLoginFail(req);
  req.session.twofaFails = (req.session.twofaFails || 0) + 1;
  if (req.session.twofaFails >= 5) {
    delete req.session.pending2fa;
    delete req.session.mustChange2fa;
    delete req.session.twofaFails;
    logLogin(req, false, '2FA zu viele Fehlversuche — abgebrochen');
    return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte erneut anmelden.' });
  }
  logLogin(req, false, '2FA-Code falsch');
  res.status(401).json({ error: 'Code ungültig' });
});

app.get('/api/2fa/status', requireAuth, (req, res) => { res.json({ enabled: twofaEnabled() }); });

app.post('/api/2fa/setup', requireAuth, async (req, res) => {
  try {
    const secret = authenticator.generateSecret();
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('twofa_temp_secret', ?)", [secret]);
    const label = dbGet("SELECT value FROM settings WHERE key = 'impressum_email'")?.value || 'admin';
    const qr = await QRCode.toDataURL(authenticator.keyuri(label, 'Mas0n1x Admin', secret));
    res.json({ qr, secret });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/2fa/enable', requireAuth, (req, res) => {
  const temp = dbGet("SELECT value FROM settings WHERE key = 'twofa_temp_secret'")?.value;
  if (!temp) return res.status(400).json({ error: 'Kein Setup gestartet' });
  if (!authenticator.check(String(req.body.code || '').replace(/\s/g, ''), temp)) return res.status(400).json({ error: 'Code ungültig' });
  const plain = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
  const hashes = plain.map(c => crypto.createHash('sha256').update(c).digest('hex'));
  dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('twofa_secret', ?)", [temp]);
  dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('twofa_enabled', ?)", ['true']);
  dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('twofa_backup', ?)", [JSON.stringify(hashes)]);
  dbRun("DELETE FROM settings WHERE key = 'twofa_temp_secret'");
  res.json({ success: true, backupCodes: plain });
});

app.post('/api/2fa/disable', requireAuth, (req, res) => {
  const admin = dbGet('SELECT password_hash FROM admin WHERE id = 1');
  if (!admin || !bcrypt.compareSync(req.body.password || '', admin.password_hash)) return res.status(401).json({ error: 'Passwort falsch' });
  dbRun("DELETE FROM settings WHERE key IN ('twofa_secret','twofa_enabled','twofa_backup','twofa_temp_secret')");
  res.json({ success: true });
});

app.get('/api/admin/login-history', requireAuth, (req, res) => {
  res.json(dbAll("SELECT ts, ip, user_agent, success, note FROM login_log ORDER BY id DESC LIMIT 20"));
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

app.post('/api/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = dbGet('SELECT password_hash FROM admin WHERE id = 1');

  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (!newPassword || String(newPassword).length < 12) {
    return res.status(400).json({ error: 'Das neue Passwort muss mindestens 12 Zeichen lang sein.' });
  }
  if (String(newPassword) === 'admin') {
    return res.status(400).json({ error: 'Bitte ein eigenes, sicheres Passwort wählen.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  dbRun('UPDATE admin SET password_hash = ? WHERE id = 1', [newHash]);
  res.json({ success: true });
});

// ==================== MAINTENANCE MODE ====================

// Ermittelt die Client-IP hinter nginx/Cloudflare (best effort)
function clientIp(req) {
  return (req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || '').trim();
}
// Wartung aktiv? Manueller Schalter ODER geplantes Fenster — ausser die IP steht auf der Whitelist
function isMaintenanceActive(req) {
  const manual = dbGet("SELECT value FROM settings WHERE key = 'maintenance_mode'")?.value === 'true';
  const from = dbGet("SELECT value FROM settings WHERE key = 'maintenance_from'")?.value;
  const until = dbGet("SELECT value FROM settings WHERE key = 'maintenance_until'")?.value;
  let scheduled = false;
  if (from && until) {
    const now = Date.now(), f = Date.parse(from), u = Date.parse(until);
    if (!isNaN(f) && !isNaN(u) && now >= f && now <= u) scheduled = true;
  }
  if (!manual && !scheduled) return false;
  const wl = (dbGet("SELECT value FROM settings WHERE key = 'maintenance_whitelist'")?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  if (wl.length && wl.includes(clientIp(req))) return false;
  return true;
}

// Check endpoint for nginx auth_request (returns 200 = OK, 403 = maintenance)
app.get('/api/maintenance-check', (req, res) => {
  if (isMaintenanceActive(req)) res.status(403).send('Maintenance');
  else res.status(200).send('OK');
});

app.get('/api/maintenance', (req, res) => {
  const get = k => dbGet("SELECT value FROM settings WHERE key = ?", [k])?.value || '';
  res.json({
    enabled: get('maintenance_mode') === 'true',
    message: get('maintenance_message'),
    from: get('maintenance_from'),
    until: get('maintenance_until'),
    whitelist: get('maintenance_whitelist'),
    your_ip: clientIp(req)
  });
});

app.post('/api/maintenance', requireAuth, (req, res) => {
  const { enabled, message, from, until, whitelist } = req.body;
  const set = (k, v) => dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [k, v]);
  set('maintenance_mode', enabled ? 'true' : 'false');
  if (message !== undefined) set('maintenance_message', message || '');
  if (from !== undefined) set('maintenance_from', from || '');
  if (until !== undefined) set('maintenance_until', until || '');
  if (whitelist !== undefined) set('maintenance_whitelist', whitelist || '');
  res.json({ success: true });
});

// ==================== PROJECTS ROUTES ====================

function safeJson(s, fb) { try { return JSON.parse(s); } catch (e) { return fb; } }

// GitHub-Helper: Repos vom eigenen Account + Org-Mitgliedschaften (privat + öffentlich)
async function fetchGithubRepos() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) { const e = new Error('GITHUB_TOKEN fehlt'); e.code = 'NO_TOKEN'; throw e; }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mas0n1x-portfolio',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  let repos = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner,organization_member&sort=pushed`, { headers });
    if (!r.ok) { const e = new Error('GitHub API ' + r.status); e.code = 'API_' + r.status; throw e; }
    const data = await r.json();
    repos = repos.concat(data);
    if (data.length < 100) break;
  }
  return repos;
}

// Commits des laufenden Jahres via GraphQL-Contributions (oeffentlich + privat, da eigener Token)
async function fetchGithubCommitsThisYear() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) { const e = new Error('GITHUB_TOKEN fehlt'); e.code = 'NO_TOKEN'; throw e; }
  const year = new Date().getFullYear();
  const query = 'query($from:DateTime!,$to:DateTime!){viewer{contributionsCollection(from:$from,to:$to){totalCommitContributions restrictedContributionsCount}}}';
  const variables = { from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` };
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'mas0n1x-portfolio' },
    body: JSON.stringify({ query, variables })
  });
  if (!r.ok) { const e = new Error('GitHub GraphQL ' + r.status); e.code = 'API_' + r.status; throw e; }
  const j = await r.json();
  const c = j.data && j.data.viewer && j.data.viewer.contributionsCollection;
  if (!c) return 0;
  return (c.totalCommitContributions || 0) + (c.restrictedContributionsCount || 0);
}

// Oeffentliche Hero-Statistiken (Repo-Anzahl + Commits dieses Jahr), 1h gecacht
let _ghStatsCache = { at: 0, data: null };
app.get('/api/github/stats', async (req, res) => {
  const TTL = 60 * 60 * 1000;
  const year = new Date().getFullYear();
  if (_ghStatsCache.data && (Date.now() - _ghStatsCache.at) < TTL) {
    return res.json(_ghStatsCache.data);
  }
  try {
    const [repos, commits] = await Promise.all([
      fetchGithubRepos().then(r => r.length),
      fetchGithubCommitsThisYear().catch(() => null)
    ]);
    const data = { repos, commits, year };
    _ghStatsCache = { at: Date.now(), data };
    res.json(data);
  } catch (e) {
    // Fallback: gecachte Repo-Anzahl aus der DB (Hero bleibt nie leer)
    const row = dbGet('SELECT COUNT(*) AS c FROM github_projects');
    res.json({ repos: row ? row.c : null, commits: null, year, stale: true });
  }
});

// Repo-Basisdaten in DB cachen, ohne Kuratierung (selected/custom/images) zu überschreiben
function upsertGithubRepo(repo) {
  const vals = [
    repo.full_name, repo.name, repo.owner ? repo.owner.login : '',
    repo.description || '', repo.language || '', repo.html_url,
    JSON.stringify(repo.topics || []), repo.stargazers_count || 0,
    repo.private ? 1 : 0, repo.pushed_at || '', repo.homepage || ''
  ];
  const existing = dbGet('SELECT repo_id FROM github_projects WHERE repo_id = ?', [repo.id]);
  if (existing) {
    dbRun('UPDATE github_projects SET full_name=?,name=?,owner=?,gh_description=?,gh_language=?,gh_url=?,gh_topics=?,gh_stars=?,gh_private=?,gh_pushed_at=?,gh_homepage=? WHERE repo_id=?', [...vals, repo.id]);
  } else {
    dbRun('INSERT INTO github_projects (repo_id,full_name,name,owner,gh_description,gh_language,gh_url,gh_topics,gh_stars,gh_private,gh_pushed_at,gh_homepage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [repo.id, ...vals]);
  }
}

// Kuratiertes GitHub-Projekt → öffentliches Projekt-Format (custom überschreibt GitHub-Default)
function mapGithubProject(p) {
  const topics = p.gh_topics ? safeJson(p.gh_topics, []) : [];
  const customTags = p.custom_tags ? safeJson(p.custom_tags, []) : [];
  const tags = customTags.length ? customTags : [p.gh_language, ...topics].filter(Boolean).slice(0, 5);
  return {
    id: p.repo_id,
    title: p.custom_title || p.name,
    description: p.custom_desc || p.gh_description || '',
    detail: p.detail_desc || '',
    images: p.images ? safeJson(p.images, []) : [],
    logo: p.logo || null,
    tags,
    link: p.custom_link || p.gh_homepage || p.gh_url,
    status: p.status || 'completed',
    stars: p.gh_stars || 0,
    language: p.gh_language || null,
    pushed_at: p.gh_pushed_at || null,
    private: !!p.gh_private,
    repo_url: p.gh_url
  };
}

app.get('/api/projects', (req, res) => {
  // Bevorzugt kuratierte GitHub-Projekte; Fallback auf manuelle Projekte (Übergang)
  const gh = dbAll('SELECT * FROM github_projects WHERE selected = 1 ORDER BY sort_order ASC, gh_pushed_at DESC');
  if (gh.length) return res.json(gh.map(mapGithubProject));
  const projects = dbAll('SELECT * FROM projects ORDER BY sort_order ASC, id DESC');
  res.json(projects.map(p => ({
    ...p,
    tags: p.tags ? JSON.parse(p.tags) : [],
    images: p.images ? JSON.parse(p.images) : (p.image ? [{ path: p.image, order: 0 }] : []),
    logo: p.logo || null
  })));
});

app.get('/api/projects/:id', (req, res) => {
  const project = dbGet('SELECT * FROM projects WHERE id = ?', [parseInt(req.params.id)]);
  if (project) {
    project.tags = project.tags ? JSON.parse(project.tags) : [];
    project.images = project.images ? JSON.parse(project.images) : (project.image ? [{ path: project.image, order: 0 }] : []);
    project.logo = project.logo || null;
    res.json(project);
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

app.post('/api/projects', requireAuth, projectUpload, (req, res) => {
  const { title, description, tags, link, status, sort_order, progress } = req.body;

  let images = [];
  if (req.files && req.files['images']) {
    images = req.files['images'].map((file, index) => ({
      path: `/uploads/${file.filename}`,
      order: index
    }));
  }
  const imagesJson = JSON.stringify(images);
  const image = images.length > 0 ? images[0].path : null;

  const logo = (req.files && req.files['logo'] && req.files['logo'][0])
    ? `/uploads/${req.files['logo'][0].filename}`
    : null;

  const tagsJson = tags ? JSON.stringify(typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : '[]';

  const result = dbRun(
    'INSERT INTO projects (title, description, image, images, logo, tags, link, status, sort_order, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [title, description, image, imagesJson, logo, tagsJson, link, status || 'completed', parseInt(sort_order) || 0, parseInt(progress) || 0]
  );

  res.json({ id: result.lastInsertRowid, success: true });
});

// Reihenfolge per Drag & Drop speichern (muss VOR /:id stehen)
app.put('/api/projects/reorder', requireAuth, (req, res) => {
  const order = req.body && req.body.order;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order muss ein Array von IDs sein' });
  order.forEach((id, index) => {
    dbRun('UPDATE projects SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?', [index, parseInt(id)]);
  });
  res.json({ success: true });
});

app.put('/api/projects/:id', requireAuth, projectUpload, (req, res) => {
  const { title, description, tags, link, status, sort_order, progress } = req.body;
  const project = dbGet('SELECT * FROM projects WHERE id = ?', [parseInt(req.params.id)]);

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Parse existing images
  let existingImages = [];
  try {
    existingImages = project.images ? JSON.parse(project.images) : [];
  } catch (e) {
    existingImages = project.image ? [{ path: project.image, order: 0 }] : [];
  }

  // Handle image removals
  const removeImages = req.body.remove_images
    ? (typeof req.body.remove_images === 'string' ? JSON.parse(req.body.remove_images) : req.body.remove_images)
    : [];
  for (const removePath of removeImages) {
    const filePath = path.join(__dirname, '..', removePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    existingImages = existingImages.filter(img => img.path !== removePath);
  }

  // Handle image reordering
  const imageOrder = req.body.image_order
    ? (typeof req.body.image_order === 'string' ? JSON.parse(req.body.image_order) : req.body.image_order)
    : null;
  if (imageOrder) {
    existingImages = imageOrder
      .map((imgPath, index) => ({ path: imgPath, order: index }))
      .filter(img => existingImages.some(ei => ei.path === img.path));
  }

  // Add newly uploaded images
  if (req.files && req.files['images']) {
    const startOrder = existingImages.length;
    const newImages = req.files['images'].map((file, index) => ({
      path: `/uploads/${file.filename}`,
      order: startOrder + index
    }));
    existingImages = [...existingImages, ...newImages];
  }

  // Re-index order
  existingImages = existingImages.map((img, index) => ({ ...img, order: index }));
  const imagesJson = JSON.stringify(existingImages);
  const image = existingImages.length > 0 ? existingImages[0].path : null;

  // Handle logo
  let logo = project.logo || null;
  if (req.body.remove_logo === 'true' && project.logo) {
    const logoPath = path.join(__dirname, '..', project.logo);
    if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
    logo = null;
  }
  if (req.files && req.files['logo'] && req.files['logo'][0]) {
    if (project.logo) {
      const oldLogoPath = path.join(__dirname, '..', project.logo);
      if (fs.existsSync(oldLogoPath)) fs.unlinkSync(oldLogoPath);
    }
    logo = `/uploads/${req.files['logo'][0].filename}`;
  }

  const tagsJson = tags ? JSON.stringify(typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : project.tags;

  dbRun(
    'UPDATE projects SET title = ?, description = ?, image = ?, images = ?, logo = ?, tags = ?, link = ?, status = ?, sort_order = ?, progress = ?, updated_at = datetime("now") WHERE id = ?',
    [title || project.title, description || project.description, image, imagesJson, logo, tagsJson, link !== undefined ? link : project.link, status || project.status || 'completed', parseInt(sort_order) || project.sort_order, parseInt(progress) || project.progress || 0, parseInt(req.params.id)]
  );

  res.json({ success: true });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const project = dbGet('SELECT image, images, logo FROM projects WHERE id = ?', [parseInt(req.params.id)]);

  if (project) {
    // Delete all images
    try {
      const images = project.images ? JSON.parse(project.images) : [];
      for (const img of images) {
        const imgPath = path.join(__dirname, '..', img.path);
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      }
    } catch (e) {
      if (project.image) {
        const imagePath = path.join(__dirname, '..', project.image);
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      }
    }
    // Delete logo
    if (project.logo) {
      const logoPath = path.join(__dirname, '..', project.logo);
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
    }
  }

  dbRun('DELETE FROM projects WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

// ==================== GITHUB PROJECTS (Admin) ====================

// Alle erreichbaren Repos live von GitHub holen, Basisdaten cachen, kuratierten Stand zurückgeben
app.get('/api/admin/github/repos', requireAuth, async (req, res) => {
  try {
    const repos = await fetchGithubRepos();
    repos.forEach(upsertGithubRepo);
    const rows = dbAll('SELECT * FROM github_projects ORDER BY selected DESC, sort_order ASC, gh_pushed_at DESC');
    res.json({
      ok: true,
      count: rows.length,
      repos: rows.map(r => ({
        repo_id: r.repo_id, full_name: r.full_name, name: r.name, owner: r.owner,
        gh_description: r.gh_description, gh_language: r.gh_language, gh_url: r.gh_url,
        gh_topics: safeJson(r.gh_topics, []), gh_stars: r.gh_stars, gh_private: !!r.gh_private,
        gh_pushed_at: r.gh_pushed_at, gh_homepage: r.gh_homepage,
        selected: !!r.selected, custom_title: r.custom_title || '', custom_desc: r.custom_desc || '',
        detail_desc: r.detail_desc || '', custom_tags: safeJson(r.custom_tags, []), custom_link: r.custom_link || '',
        images: safeJson(r.images, []), logo: r.logo || null, status: r.status || 'completed', sort_order: r.sort_order || 0
      }))
    });
  } catch (e) {
    res.status(e.code === 'NO_TOKEN' ? 400 : 502).json({ ok: false, error: e.message, code: e.code || 'ERR' });
  }
});

// Reihenfolge der ausgewählten Projekte (muss VOR /:repoId stehen)
app.put('/api/admin/github/reorder', requireAuth, (req, res) => {
  const order = req.body && req.body.order;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order muss ein Array von repo_ids sein' });
  order.forEach((id, i) => dbRun('UPDATE github_projects SET sort_order = ? WHERE repo_id = ?', [i, parseInt(id)]));
  res.json({ success: true });
});

// Auswahl + eigene Inhalte + Bilder eines Repos speichern
app.put('/api/admin/github/projects/:repoId', requireAuth, projectUpload, (req, res) => {
  const repoId = parseInt(req.params.repoId);
  const row = dbGet('SELECT * FROM github_projects WHERE repo_id = ?', [repoId]);
  if (!row) return res.status(404).json({ error: 'Repo nicht gefunden — erst Repos synchronisieren' });
  const b = req.body || {};

  // Bilder: behaltene (existing_images JSON) + neu hochgeladene
  let images = b.existing_images ? safeJson(b.existing_images, []) : [];
  if (req.files && req.files['images']) {
    const start = images.length;
    req.files['images'].forEach((file, i) => images.push({ path: `/uploads/${file.filename}`, order: start + i }));
  }
  const logo = (req.files && req.files['logo'] && req.files['logo'][0])
    ? `/uploads/${req.files['logo'][0].filename}`
    : (b.logo || row.logo || null);
  const tagsJson = (b.custom_tags !== undefined)
    ? JSON.stringify(String(b.custom_tags).split(',').map(t => t.trim()).filter(Boolean))
    : (row.custom_tags || '[]');
  const sel = (b.selected === '1' || b.selected === 'true' || b.selected === true) ? 1 : 0;

  dbRun(
    `UPDATE github_projects SET selected=?,custom_title=?,custom_desc=?,detail_desc=?,custom_tags=?,custom_link=?,images=?,logo=?,status=?,sort_order=?,updated_at=datetime('now') WHERE repo_id=?`,
    [sel, b.custom_title || null, b.custom_desc || null, b.detail_desc || null, tagsJson,
     b.custom_link || null, JSON.stringify(images), logo, b.status || 'completed',
     parseInt(b.sort_order) || row.sort_order || 0, repoId]
  );
  res.json({ success: true, images });
});

// ==================== SERVICES ROUTES ====================

app.get('/api/services', (req, res) => {
  const services = dbAll('SELECT * FROM services ORDER BY sort_order ASC, id ASC');
  res.json(services);
});

app.post('/api/services', requireAuth, (req, res) => {
  const { icon, title, description, sort_order } = req.body;
  const result = dbRun(
    'INSERT INTO services (icon, title, description, sort_order) VALUES (?, ?, ?, ?)',
    [icon, title, description, parseInt(sort_order) || 0]
  );
  res.json({ id: result.lastInsertRowid, success: true });
});

// Reihenfolge per Drag & Drop speichern (muss VOR /:id stehen)
app.put('/api/services/reorder', requireAuth, (req, res) => {
  const order = req.body && req.body.order;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order muss ein Array von IDs sein' });
  order.forEach((id, index) => {
    dbRun('UPDATE services SET sort_order = ? WHERE id = ?', [index, parseInt(id)]);
  });
  res.json({ success: true });
});

app.put('/api/services/:id', requireAuth, (req, res) => {
  const { icon, title, description, sort_order } = req.body;
  dbRun(
    'UPDATE services SET icon = ?, title = ?, description = ?, sort_order = ? WHERE id = ?',
    [icon, title, description, parseInt(sort_order), parseInt(req.params.id)]
  );
  res.json({ success: true });
});

app.delete('/api/services/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM services WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

// ==================== SETTINGS ROUTES ====================

app.get('/api/settings', (req, res) => {
  const all = {};
  dbAll('SELECT * FROM settings').forEach(s => { all[s.key] = s.value; });
  // Authentifizierter Admin sieht alles; oeffentlich nur ungefaehrliche Keys (Impressum/Legal)
  if (req.session && req.session.authenticated) return res.json(all);
  const pub = {};
  Object.keys(all).forEach(k => {
    if (k.startsWith('impressum_') || k === 'datenschutz_custom' || k === 'agb_custom') pub[k] = all[k];
  });
  res.json(pub);
});

// Settings-Keys, die als Secret verschlüsselt in der DB liegen.
const SECRET_SETTING_KEYS = new Set(['smtp_pass']);
app.post('/api/settings', requireAuth, (req, res) => {
  const settings = req.body || {};

  Object.entries(settings).forEach(([key, value]) => {
    // Leeres Passwort-Feld nicht überschreiben (Admin lässt es beim Speichern oft leer).
    if (key === 'smtp_pass' && (value === '' || value == null)) return;
    const v = SECRET_SETTING_KEYS.has(key) ? encryptSecret(value) : value;
    dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, v]);
  });

  res.json({ success: true });
});

// Integrations-Health-Check: Status von GitHub, E-Mail/SMTP und Discord-Bot
app.get('/api/admin/integrations', requireAuth, async (req, res) => {
  const out = {};
  // GitHub-Token
  try {
    if (!process.env.GITHUB_TOKEN) {
      out.github = { ok: false, status: 'Kein Token gesetzt' };
    } else {
      const r = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'User-Agent': 'mas0n1x-portfolio' } });
      if (r.ok) {
        const u = await r.json();
        const scopes = r.headers.get('x-oauth-scopes') || '–';
        const rl = r.headers.get('x-ratelimit-remaining');
        out.github = { ok: true, status: 'Verbunden', detail: `@${u.login} · Scopes: ${scopes}`, meta: rl ? `${rl} API-Calls übrig` : '' };
      } else {
        out.github = { ok: false, status: `Token ungültig (HTTP ${r.status})` };
      }
    }
  } catch (e) { out.github = { ok: false, status: 'Fehler: ' + e.message }; }
  // E-Mail / SMTP (aus settings)
  const smtpHost = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_host'])?.value;
  const smtpUser = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_user'])?.value;
  out.email = (smtpHost && smtpUser)
    ? { ok: true, status: 'Konfiguriert', detail: `${smtpUser} via ${smtpHost}` }
    : { ok: false, status: 'Nicht konfiguriert' };
  // Discord-Bot
  try {
    const ds = discordBot.getStatus();
    out.discord = (ds && ds.connected)
      ? { ok: true, status: 'Verbunden', detail: ds.tag || ds.username || '' }
      : { ok: false, status: process.env.DISCORD_BOT_TOKEN ? 'Getrennt' : 'Kein Token gesetzt' };
  } catch (e) { out.discord = { ok: false, status: 'Nicht verfügbar' }; }
  res.json(out);
});

// ==================== EMAIL SERVICE ====================
// Email test endpoint - requires nodemailer to be installed for actual sending
app.post('/api/email/test', requireAuth, async (req, res) => {
  const { to } = req.body;

  if (!to) {
    return res.status(400).json({ error: 'E-Mail-Adresse erforderlich' });
  }

  // Get email settings
  const smtpHost = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_host'])?.value;
  const smtpPort = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_port'])?.value;
  const smtpUser = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_user'])?.value;
  const smtpPass = decryptSecret(dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_pass'])?.value);
  const fromName = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_from_name'])?.value || 'Mas0n1x Portfolio';
  // Absenderadresse separat vom SMTP-User (z.B. Brevo-Relay: User = Login-ID, Absender = echte Adresse)
  const fromAddr = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_from'])?.value || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return res.status(400).json({ error: 'SMTP-Einstellungen unvollständig. Bitte alle Felder ausfüllen.' });
  }

  try {
    // Try to load nodemailer if available
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (e) {
      // Nodemailer not installed - provide instructions
      return res.status(500).json({
        error: 'nodemailer nicht installiert. Führe "npm install nodemailer" aus, um E-Mail-Versand zu aktivieren.'
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort) || 587,
      secure: parseInt(smtpPort) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: to,
      subject: 'Test-E-Mail - Mas0n1x Portfolio',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #00ff88;">E-Mail-Konfiguration erfolgreich!</h2>
          <p>Wenn du diese E-Mail erhältst, funktioniert deine E-Mail-Konfiguration korrekt.</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="color: #888; font-size: 12px;">Diese E-Mail wurde automatisch vom Mas0n1x Portfolio Admin-Panel gesendet.</p>
        </div>
      `
    });

    res.json({ success: true, message: 'Test-E-Mail wurde gesendet!' });
  } catch (e) {
    console.error('Email error:', e);
    res.status(500).json({ error: `E-Mail-Fehler: ${e.message}` });
  }
});

// Helper function to send notification emails (used internally)
async function sendNotificationEmail(to, subject, htmlContent) {
  const emailEnabled = dbGet('SELECT value FROM settings WHERE key = ?', ['email_enabled'])?.value;
  if (emailEnabled === 'false') return false; // nur explizit deaktiviert blockt; sonst senden sobald SMTP gesetzt

  const smtpHost = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_host'])?.value;
  const smtpPort = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_port'])?.value;
  const smtpUser = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_user'])?.value;
  const smtpPass = decryptSecret(dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_pass'])?.value);
  const fromName = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_from_name'])?.value || 'Mas0n1x Portfolio';
  // Absenderadresse separat vom SMTP-User (z.B. Brevo-Relay: User = Login-ID, Absender = echte Adresse)
  const fromAddr = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_from'])?.value || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) return false;

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort) || 587,
      secure: parseInt(smtpPort) === 465,
      auth: { user: smtpUser, pass: smtpPass }
    });

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to,
      subject,
      html: htmlContent
    });

    return true;
  } catch (e) {
    console.error('Notification email error:', e);
    return false;
  }
}

// ==================== CUSTOMER AUTH ROUTES ====================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/customer/register', async (req, res) => {
  const { email, password, phone, name, company } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });
  }
  // Serverseitige Validierung (Frontend-Checks sind umgehbar).
  if (!EMAIL_RE.test(String(email))) {
    return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' });
  }

  // Check if email already exists
  const existing = dbGet('SELECT id FROM customers WHERE email = ?', [email.toLowerCase()]);
  if (existing) {
    return res.status(400).json({ error: 'Diese E-Mail ist bereits registriert' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = dbRun(
    'INSERT INTO customers (email, password_hash, phone, name, company) VALUES (?, ?, ?, ?, ?)',
    [email.toLowerCase(), passwordHash, phone || null, name || null, company || null]
  );

  // Send welcome email (async, don't wait)
  const customer = { id: result.lastInsertRowid, email: email.toLowerCase(), name };
  sendWelcomeEmail(customer).catch(e => console.error('Welcome email error:', e));

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session-Fehler' });
    req.session.customerId = result.lastInsertRowid;
    req.session.customerEmail = email.toLowerCase();
    res.json({ success: true, customerId: result.lastInsertRowid });
  });
});

app.post('/api/customer/login', loginRateLimit, (req, res) => {
  const { email, password } = req.body;

  const customer = dbGet('SELECT * FROM customers WHERE email = ?', [(email || '').toLowerCase()]);

  if (customer && bcrypt.compareSync(password || '', customer.password_hash)) {
    registerLoginSuccess(req);
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session-Fehler' });
      req.session.customerId = customer.id;
      req.session.customerEmail = customer.email;
      res.json({ success: true, customerId: customer.id });
    });
  } else {
    registerLoginFail(req);
    res.status(401).json({ error: 'Ungültige E-Mail oder Passwort' });
  }
});

app.post('/api/customer/logout', (req, res) => {
  // Session vollständig zerstören (nicht nur Felder nullen) — sonst bleibt die
  // Session-ID gültig und wiederverwendbar.
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/customer/check', (req, res) => {
  if (req.session.customerId) {
    const customer = dbGet('SELECT id, email, phone FROM customers WHERE id = ?', [req.session.customerId]);
    res.json({ authenticated: true, customer });
  } else {
    res.json({ authenticated: false });
  }
});

// ==================== MAGIC-LINK (passwortloser Zugang) ====================
const MAGIC_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 Tage gültig, wiederverwendbar bis Ablauf

function createMagicLink(customerId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + MAGIC_TTL_MS).toISOString();
  dbRun('INSERT INTO magic_links (token, customer_id, expires_at) VALUES (?, ?, ?)', [token, customerId, expires]);
  return token;
}

function siteBase(req) {
  const fromSettings = dbGet("SELECT value FROM settings WHERE key='site_url'")?.value;
  if (fromSettings) return fromSettings.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

// Magic-Link einlösen → Kunde anmelden und ins Portal weiterleiten.
app.get('/api/customer/magic/:token', (req, res) => {
  const ml = dbGet('SELECT * FROM magic_links WHERE token = ?', [req.params.token]);
  if (!ml || new Date(ml.expires_at) < new Date()) {
    return res.redirect('/kunde/?magic=invalid');
  }
  req.session.regenerate((err) => {
    if (err) return res.redirect('/kunde/?magic=error');
    req.session.customerId = ml.customer_id;
    const c = dbGet('SELECT email FROM customers WHERE id = ?', [ml.customer_id]);
    if (c) req.session.customerEmail = c.email;
    res.redirect('/kunde/');
  });
});

// Öffentliche Projektanfrage OHNE Pflicht-Registrierung. Legt bei Bedarf einen
// Kunden an und schickt einen Magic-Link für den Portal-Zugang.
app.post('/api/requests/public', (req, res) => {
  const { email, name, phone, company, projectType, budget, timeline, description } = req.body;

  if (!email || !EMAIL_RE.test(String(email))) {
    return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  }
  if (!projectType || !description || !String(description).trim()) {
    return res.status(400).json({ error: 'Bitte Projektart und Beschreibung ausfüllen.' });
  }

  const mail = String(email).toLowerCase();
  let customer = dbGet('SELECT * FROM customers WHERE email = ?', [mail]);
  let customerId;
  if (customer) {
    customerId = customer.id;
    // Fehlende Stammdaten ergänzen (überschreibt nichts Vorhandenes).
    dbRun('UPDATE customers SET name = COALESCE(name, ?), phone = COALESCE(phone, ?), company = COALESCE(company, ?) WHERE id = ?',
      [name || null, phone || null, company || null, customerId]);
  } else {
    // Zufallspasswort — Login läuft über den Magic-Link, kann später im Portal gesetzt werden.
    const pw = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
    const r = dbRun('INSERT INTO customers (email, password_hash, phone, name, company) VALUES (?, ?, ?, ?, ?)',
      [mail, pw, phone || null, name || null, company || null]);
    customerId = r.lastInsertRowid;
  }

  const reqResult = dbRun(
    'INSERT INTO project_requests (customer_id, project_type, budget, timeline, description) VALUES (?, ?, ?, ?, ?)',
    [customerId, projectType, budget || null, timeline || null, description]
  );

  // Magic-Link an den Kunden mailen.
  const token = createMagicLink(customerId);
  const link = `${siteBase(req)}/api/customer/magic/${token}`;
  sendNotificationEmail(mail, 'Deine Projektanfrage ist eingegangen',
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#111;color:#fff;">
       <h2 style="color:#00ff88;">Danke für deine Anfrage!</h2>
       <p>Hallo${name ? ` ${esc(name)}` : ''},</p>
       <p>wir haben deine Projektanfrage erhalten und melden uns zeitnah. Über den folgenden Link kommst du jederzeit in dein Kundenportal – ganz ohne Passwort:</p>
       <p><a href="${link}" style="display:inline-block;background:#00ff88;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Zum Kundenportal →</a></p>
       <p style="color:#888;font-size:12px;">Der Link ist 14 Tage gültig. Im Portal kannst du auch ein eigenes Passwort festlegen.</p>
     </div>`
  ).catch(e => console.error('Magic-Link-Mail:', e.message));

  // Admin benachrichtigen (E-Mail + Discord, Default an).
  adminNotify('request', {
    subject: `Neue Projektanfrage #${reqResult.lastInsertRowid}`,
    html: `<h2>Neue Projektanfrage</h2><p><strong>Von:</strong> ${esc(name || '')} &lt;${esc(mail)}&gt;</p>
           <p><strong>Art:</strong> ${esc(projectType)} · <strong>Budget:</strong> ${esc(budget || '–')} · <strong>Zeitrahmen:</strong> ${esc(timeline || '–')}</p>
           <p>${esc(description)}</p>`,
    discordText: `Neue Anfrage von ${name || mail} (${esc(projectType)}):\n${String(description).substring(0, 1500)}`
  }, { email: true, discord: true });

  res.json({ success: true });
});

// Customer Documents
app.get('/api/customer/documents/:requestId', requireCustomerAuth, (req, res) => {
  const requestId = parseInt(req.params.requestId);

  // Verify request belongs to customer
  const request = dbGet(
    'SELECT id FROM project_requests WHERE id = ? AND customer_id = ?',
    [requestId, req.session.customerId]
  );

  if (!request) {
    return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }

  const documents = dbAll(
    'SELECT * FROM customer_documents WHERE request_id = ? ORDER BY created_at DESC',
    [requestId]
  );

  res.json(documents);
});

// ==================== PROJECT REQUEST ROUTES ====================

// ===== Benachrichtigungs-Routing (Einstellungen → Benachrichtigungen) =====
function notifyAllowed(event, channel, def) {
  const v = dbGet("SELECT value FROM settings WHERE key = ?", [`notify_${event}_${channel}`])?.value;
  if (v === undefined || v === null || v === '') return def;
  return v === 'true';
}
function adminNotify(event, { subject, html, discordText }, def = {}) {
  // E-Mail an die Geschaefts-E-Mail
  if (notifyAllowed(event, 'email', def.email || false)) {
    const to = dbGet("SELECT value FROM settings WHERE key = 'impressum_email'")?.value;
    if (to && subject && html) sendNotificationEmail(to, subject, html).catch(e => console.error('Admin-Alert-Mail:', e.message));
  }
  // Discord-Alert in den Anfragen-Channel
  if (notifyAllowed(event, 'discord', def.discord || false) && discordBot && discordBot.sendAlert) {
    discordBot.sendAlert(subject, discordText || '').catch(e => console.error('Admin-Alert-Discord:', e.message));
  }
}
const esc = s => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

app.post('/api/requests', requireCustomerAuth, (req, res) => {
  const { projectType, budget, timeline, description } = req.body;

  const result = dbRun(
    'INSERT INTO project_requests (customer_id, project_type, budget, timeline, description) VALUES (?, ?, ?, ?, ?)',
    [req.session.customerId, projectType, budget, timeline, description]
  );

  // Discord-Benachrichtigung (Routing: default an), async, nicht blockierend
  if (discordBot && notifyAllowed('request', 'discord', true)) {
    const customer = dbGet('SELECT name, company, email, phone FROM customers WHERE id = ?', [req.session.customerId]);
    discordBot.sendRequestNotification(
      { id: result.lastInsertRowid, project_type: projectType, budget, timeline, description },
      customer
    ).catch(e => console.error('Discord request notification error:', e.message));
  }
  // Admin-E-Mail (Routing: default aus)
  adminNotify('request', {
    subject: 'Neue Projektanfrage',
    html: `<h2>Neue Projektanfrage</h2><p><b>Typ:</b> ${esc(projectType)}<br><b>Budget:</b> ${esc(budget)}<br><b>Zeitrahmen:</b> ${esc(timeline)}</p><p>${esc(description)}</p>`
  });

  res.json({ success: true, requestId: result.lastInsertRowid });
});

app.get('/api/requests', requireCustomerAuth, (req, res) => {
  const requests = dbAll(
    'SELECT * FROM project_requests WHERE customer_id = ? ORDER BY created_at DESC',
    [req.session.customerId]
  );
  res.json(requests);
});

app.get('/api/requests/:id', requireCustomerAuth, (req, res) => {
  const request = dbGet(
    'SELECT * FROM project_requests WHERE id = ? AND customer_id = ?',
    [parseInt(req.params.id), req.session.customerId]
  );

  if (!request) {
    return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }

  res.json(request);
});

// ==================== ADMIN REQUEST MANAGEMENT ====================

app.get('/api/admin/requests', requireAuth, (req, res) => {
  const requests = dbAll(`
    SELECT pr.*, c.email, c.phone
    FROM project_requests pr
    JOIN customers c ON pr.customer_id = c.id
    ORDER BY pr.created_at DESC
  `);
  res.json(requests);
});

app.get('/api/admin/requests/:id', requireAuth, (req, res) => {
  const request = dbGet(`
    SELECT pr.*, c.email, c.phone, c.name as customer_name, c.company
    FROM project_requests pr
    JOIN customers c ON pr.customer_id = c.id
    WHERE pr.id = ?
  `, [parseInt(req.params.id)]);

  if (!request) {
    return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }

  res.json(request);
});

app.put('/api/admin/requests/:id', requireAuth, async (req, res) => {
  const { status, deadline, progress, admin_notes } = req.body;
  const requestId = parseInt(req.params.id);

  const request = dbGet(`
    SELECT pr.*, c.email, c.name as customer_name
    FROM project_requests pr
    JOIN customers c ON pr.customer_id = c.id
    WHERE pr.id = ?
  `, [requestId]);

  if (!request) {
    return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }

  const oldStatus = request.status;
  const newStatus = status || request.status;

  dbRun(
    'UPDATE project_requests SET status = ?, deadline = ?, progress = ?, admin_notes = ?, updated_at = datetime("now") WHERE id = ?',
    [
      newStatus,
      deadline !== undefined ? deadline : request.deadline,
      progress !== undefined ? parseInt(progress) : (request.progress || 0),
      admin_notes !== undefined ? admin_notes : request.admin_notes,
      requestId
    ]
  );

  // Send notification email on status change
  if (oldStatus !== newStatus && request.email) {
    const statusLabels = {
      'new': 'Neu',
      'in_progress': 'In Bearbeitung',
      'waiting': 'Warte auf Ihre Rückmeldung',
      'completed': 'Abgeschlossen',
      'cancelled': 'Abgebrochen'
    };

    const customerName = request.customer_name || request.email.split('@')[0];
    const statusLabel = statusLabels[newStatus] || newStatus;

    let emailContent = `
      <h2>Projektstatus-Update</h2>
      <p>Hallo ${customerName},</p>
      <p>der Status Ihres Projekts wurde aktualisiert:</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Neuer Status:</strong> ${statusLabel}</p>
        ${progress !== undefined ? `<p><strong>Fortschritt:</strong> ${progress}%</p>` : ''}
      </div>
      <p>Melden Sie sich im <a href="${process.env.BASE_URL || 'http://localhost:3000'}/kunde/">Kundenportal</a> an, um weitere Details zu sehen.</p>
      <p>Mit freundlichen Grüßen,<br>Ihr Mas0n1x Team</p>
    `;

    // Check workflow rules for completed status
    if (newStatus === 'completed') {
      emailContent += `
        <hr style="margin: 30px 0;">
        <p><strong>Wir würden uns über Ihre Bewertung freuen!</strong></p>
        <p>Loggen Sie sich ein und hinterlassen Sie eine Bewertung für unser Portfolio.</p>
      `;
    }

    await sendNotificationEmail(request.email, `Projektstatus: ${statusLabel}`, emailContent);

    // Log the notification
    dbRun(
      'INSERT INTO email_logs (type, recipient, subject, status, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
      ['status_update', request.email, `Projektstatus: ${statusLabel}`, 'sent']
    );
  }

  res.json({ success: true });
});

app.delete('/api/admin/requests/:id', requireAuth, (req, res) => {
  const requestId = parseInt(req.params.id);

  // Delete associated messages and files first
  dbRun('DELETE FROM messages WHERE request_id = ?', [requestId]);
  dbRun('DELETE FROM request_files WHERE request_id = ?', [requestId]);
  dbRun('DELETE FROM project_requests WHERE id = ?', [requestId]);

  res.json({ success: true });
});

// ==================== MESSAGING ROUTES ====================

app.get('/api/requests/:id/messages', (req, res) => {
  const requestId = parseInt(req.params.id);

  // Verify access (admin or owner)
  if (req.session.authenticated) {
    // Admin access
  } else if (req.session.customerId) {
    const request = dbGet('SELECT id FROM project_requests WHERE id = ? AND customer_id = ?', [requestId, req.session.customerId]);
    if (!request) {
      return res.status(403).json({ error: 'Zugriff verweigert' });
    }
  } else {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const messages = dbAll(`
    SELECT m.*, rf.id as file_id, rf.original_name, rf.file_path
    FROM messages m
    LEFT JOIN request_files rf ON rf.message_id = m.id
    WHERE m.request_id = ?
    ORDER BY m.created_at ASC
  `, [requestId]);

  res.json(messages);
});

app.post('/api/requests/:id/messages', requestUpload.single('file'), (req, res) => {
  const requestId = parseInt(req.params.id);
  const { content } = req.body;

  let senderType, senderId;

  if (req.session.authenticated) {
    senderType = 'admin';
    senderId = 1;
  } else if (req.session.customerId) {
    const request = dbGet('SELECT id FROM project_requests WHERE id = ? AND customer_id = ?', [requestId, req.session.customerId]);
    if (!request) {
      return res.status(403).json({ error: 'Zugriff verweigert' });
    }
    senderType = 'customer';
    senderId = req.session.customerId;
  } else {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const result = dbRun(
    'INSERT INTO messages (request_id, sender_type, sender_id, content) VALUES (?, ?, ?, ?)',
    [requestId, senderType, senderId, content || '']
  );

  const messageId = result.lastInsertRowid;

  // Admin-E-Mail nur bei Kundennachrichten (nicht bei eigenen Antworten)
  if (senderType === 'customer') {
    adminNotify('message', {
      subject: `Neue Kundennachricht (Anfrage #${requestId})`,
      html: `<h2>Neue Nachricht zu Anfrage #${requestId}</h2><p>${esc(content)}</p>`,
      discordText: `Anfrage #${requestId}:\n${String(content || '').substring(0, 1500)}`
    });
  } else if (senderType === 'admin') {
    // Antwort des Admins → Kunde per E-Mail benachrichtigen.
    const r = dbGet('SELECT c.email, c.name FROM project_requests pr LEFT JOIN customers c ON c.id = pr.customer_id WHERE pr.id = ?', [requestId]);
    if (r?.email) {
      const base = (dbGet("SELECT value FROM settings WHERE key='site_url'")?.value || 'https://mas0n1x.online').replace(/\/$/, '');
      sendNotificationEmail(r.email, 'Neue Antwort zu deiner Projektanfrage',
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#111;color:#fff;">
           <h2 style="color:#00ff88;">Neue Nachricht</h2>
           <p>Hallo${r.name ? ` ${esc(r.name)}` : ''},</p>
           <p>es gibt eine neue Antwort zu deiner Projektanfrage:</p>
           <blockquote style="border-left:3px solid #00ff88;padding-left:12px;color:#ccc;">${esc(content)}</blockquote>
           <p><a href="${base}/kunde" style="color:#00ff88;">Im Kundenportal antworten →</a></p>
         </div>`
      ).catch(e => console.error('Kunden-Antwort-Mail:', e.message));
    }
  }

  // Handle file upload
  if (req.file) {
    dbRun(
      'INSERT INTO request_files (request_id, message_id, filename, original_name, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
      [requestId, messageId, req.file.filename, req.file.originalname, `/uploads/requests/${req.file.filename}`, senderType]
    );
  }

  // Update request timestamp
  dbRun('UPDATE project_requests SET updated_at = datetime("now") WHERE id = ?', [requestId]);

  res.json({ success: true, messageId });
});

// ==================== FILE ROUTES ====================

app.get('/api/requests/:id/files', (req, res) => {
  const requestId = parseInt(req.params.id);

  // Verify access
  if (req.session.authenticated) {
    // Admin access
  } else if (req.session.customerId) {
    const request = dbGet('SELECT id FROM project_requests WHERE id = ? AND customer_id = ?', [requestId, req.session.customerId]);
    if (!request) {
      return res.status(403).json({ error: 'Zugriff verweigert' });
    }
  } else {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const files = dbAll('SELECT * FROM request_files WHERE request_id = ? ORDER BY created_at DESC', [requestId]);
  res.json(files);
});

// ==================== IMPORT EXISTING DATA ====================

app.post('/api/import-existing', requireAuth, (req, res) => {
  const { projects, services } = req.body;
  let importedProjects = 0;
  let skippedProjects = 0;
  let importedServices = 0;
  let skippedServices = 0;

  if (projects && projects.length > 0) {
    // Get existing project titles to avoid duplicates
    const existingProjects = dbAll('SELECT title FROM projects');
    const existingTitles = new Set(existingProjects.map(p => p.title.toLowerCase()));

    projects.forEach((p, i) => {
      if (existingTitles.has(p.title.toLowerCase())) {
        skippedProjects++;
        return; // Skip duplicate
      }
      dbRun(
        'INSERT INTO projects (title, description, image, tags, sort_order) VALUES (?, ?, ?, ?, ?)',
        [p.title, p.description, p.image, JSON.stringify(p.tags), i]
      );
      importedProjects++;
    });
  }

  if (services && services.length > 0) {
    // Get existing service titles to avoid duplicates
    const existingServices = dbAll('SELECT title FROM services');
    const existingTitles = new Set(existingServices.map(s => s.title.toLowerCase()));

    services.forEach((s, i) => {
      if (existingTitles.has(s.title.toLowerCase())) {
        skippedServices++;
        return; // Skip duplicate
      }
      dbRun(
        'INSERT INTO services (icon, title, description, sort_order) VALUES (?, ?, ?, ?)',
        [s.icon, s.title, s.description, i]
      );
      importedServices++;
    });
  }

  res.json({
    success: true,
    imported: { projects: importedProjects, services: importedServices },
    skipped: { projects: skippedProjects, services: skippedServices }
  });
});

// ==================== CUSTOMER MANAGEMENT (Admin) ====================
// Get all customers with request counts
app.get('/api/customers', requireAuth, (req, res) => {
  const customers = dbAll(`
    SELECT
      c.*,
      (SELECT COUNT(*) FROM project_requests WHERE customer_id = c.id) as request_count,
      (SELECT COUNT(*) FROM project_requests WHERE customer_id = c.id AND status IN ('new', 'in_progress', 'waiting')) as active_requests
    FROM customers c
    ORDER BY c.created_at DESC
  `);
  res.json(customers);
});

// Get single customer with all details
app.get('/api/customers/:id', requireAuth, (req, res) => {
  const customer = dbAll('SELECT * FROM customers WHERE id = ?', [req.params.id])[0];

  if (!customer) {
    return res.status(404).json({ error: 'Kunde nicht gefunden' });
  }

  // Get customer's requests
  const requests = dbAll(`
    SELECT id, project_type, status, created_at
    FROM project_requests
    WHERE customer_id = ?
    ORDER BY created_at DESC
  `, [req.params.id]);

  res.json({ ...customer, requests });
});

// Delete customer
app.delete('/api/customers/:id', requireAuth, (req, res) => {
  const customer = dbAll('SELECT * FROM customers WHERE id = ?', [req.params.id])[0];

  if (!customer) {
    return res.status(404).json({ error: 'Kunde nicht gefunden' });
  }

  // Delete all related data
  dbRun('DELETE FROM messages WHERE request_id IN (SELECT id FROM project_requests WHERE customer_id = ?)', [req.params.id]);
  dbRun('DELETE FROM project_requests WHERE customer_id = ?', [req.params.id]);
  dbRun('DELETE FROM customers WHERE id = ?', [req.params.id]);

  res.json({ success: true });
});

// ==================== DASHBOARD API ====================
app.get('/api/dashboard', requireAuth, (req, res) => {
  const projects = dbAll('SELECT COUNT(*) as count FROM projects')[0].count;
  const customers = dbAll('SELECT COUNT(*) as count FROM customers')[0].count;
  const openRequests = dbAll("SELECT COUNT(*) as count FROM project_requests WHERE status IN ('new', 'in_progress', 'waiting')")[0].count;
  const invoices = dbAll('SELECT COUNT(*) as count FROM invoices')[0].count;

  // Revenue calculations
  const revenueData = dbAll('SELECT status, total FROM invoices');
  let totalRevenue = 0, paidRevenue = 0, openRevenue = 0, overdueRevenue = 0;
  const today = new Date().toISOString().split('T')[0];

  revenueData.forEach(inv => {
    totalRevenue += inv.total || 0;
    if (inv.status === 'bezahlt') {
      paidRevenue += inv.total || 0;
    } else if (inv.status === 'offen') {
      openRevenue += inv.total || 0;
    } else if (inv.status === 'überfällig') {
      overdueRevenue += inv.total || 0;
    }
  });

  // Recent activities
  const activities = dbAll('SELECT * FROM activities ORDER BY created_at DESC LIMIT 10');

  res.json({
    stats: { projects, customers, openRequests, invoices },
    revenue: {
      total: totalRevenue,
      paid: paidRevenue,
      open: openRevenue,
      overdue: overdueRevenue
    },
    activities
  });
});

// ==================== INVOICES API ====================
// Get all invoices
app.get('/api/invoices', requireAuth, (req, res) => {
  const invoices = dbAll('SELECT * FROM invoices ORDER BY created_at DESC');
  res.json(invoices);
});

// Create invoice
app.post('/api/invoices', requireAuth, (req, res) => {
  const { invoice_number, customer_id, customer_email, customer_name, customer_address, amount, tax, total, status, due_date, notes, items, payment_link } = req.body;

  // Kunden-Zuordnung: explizite customer_id bevorzugt, sonst per E-Mail einem registrierten
  // Kunden zuordnen — sonst erscheint die Rechnung nicht im Kundenportal.
  let cid = customer_id || null;
  if (!cid && customer_email) {
    const match = dbGet('SELECT id FROM customers WHERE LOWER(email) = LOWER(?)', [String(customer_email).trim()]);
    if (match) cid = match.id;
  }

  const result = dbRun(
    `INSERT INTO invoices (invoice_number, customer_id, customer_name, customer_address, amount, tax, total, status, due_date, notes, items, payment_link)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [invoice_number, cid, customer_name, customer_address, amount, tax, total, status || 'offen', due_date, notes, JSON.stringify(items), payment_link || null]
  );

  // Log activity
  dbRun(
    'INSERT INTO activities (type, description, entity_type, entity_id) VALUES (?, ?, ?, ?)',
    ['invoice_created', `Rechnung ${invoice_number} erstellt`, 'invoice', result.lastInsertRowid]
  );

  // Neuen Rechnungseingang dem verknüpften Portal-Kunden per E-Mail melden.
  if (cid) {
    const cust = dbGet('SELECT email, name FROM customers WHERE id = ?', [cid]);
    if (cust?.email) {
      const base = (dbGet("SELECT value FROM settings WHERE key='site_url'")?.value || 'https://mas0n1x.online').replace(/\/$/, '');
      const totalStr = Number(total || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 });
      const payBtn = payment_link
        ? `<p><a href="${esc(payment_link)}" style="display:inline-block;background:#00ff88;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Jetzt bezahlen →</a></p>`
        : '';
      sendNotificationEmail(cust.email, `Neue Rechnung ${invoice_number}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#111;color:#fff;">
           <h2 style="color:#00ff88;">Neue Rechnung</h2>
           <p>Hallo${cust.name ? ` ${esc(cust.name)}` : ''},</p>
           <p>du hast eine neue Rechnung erhalten:</p>
           <div style="background:#1a1a1a;padding:16px;border-radius:8px;margin:16px 0;">
             <p><strong>Rechnungsnummer:</strong> ${esc(invoice_number)}</p>
             <p><strong>Betrag:</strong> ${totalStr} EUR</p>
             ${due_date ? `<p><strong>Fällig:</strong> ${esc(due_date)}</p>` : ''}
           </div>
           ${payBtn}
           <p><a href="${base}/kunde" style="color:#00ff88;">Rechnung im Kundenportal ansehen →</a></p>
         </div>`
      ).catch(e => console.error('Rechnungs-Mail:', e.message));
    }
  }

  res.json({ success: true, id: result.lastInsertRowid });
});

// Update invoice status
app.put('/api/invoices/:id', requireAuth, (req, res) => {
  const { status, paid_date, payment_link } = req.body;
  const inv = dbGet('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
  if (!inv) return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  const newStatus = status !== undefined ? status : inv.status;
  dbRun(
    'UPDATE invoices SET status = ?, paid_date = ?, payment_link = ? WHERE id = ?',
    [
      newStatus,
      paid_date !== undefined ? paid_date : inv.paid_date,
      payment_link !== undefined ? payment_link : inv.payment_link,
      req.params.id
    ]
  );

  // Wechsel auf "bezahlt" → Zahlungsbestätigung an den Kunden (fire-and-forget).
  if (newStatus === 'bezahlt' && inv.status !== 'bezahlt' && inv.customer_id) {
    const customer = dbGet('SELECT email, name FROM customers WHERE id = ?', [inv.customer_id]);
    if (customer?.email) {
      const settings = {};
      dbAll('SELECT * FROM settings').forEach(s => { settings[s.key] = s.value; });
      const total = Number(inv.total || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 });
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111; color: #fff;">
          <div style="text-align:center; margin-bottom:30px;"><h1 style="color:#00ff88;">Zahlung erhalten</h1></div>
          <p>Hallo${customer.name ? ` ${customer.name}` : ''},</p>
          <p>vielen Dank! Wir haben deine Zahlung zur Rechnung <strong>${esc(inv.invoice_number)}</strong> über <strong>${total} EUR</strong> erhalten.</p>
          <p>Die Rechnung ist damit vollständig beglichen.</p>
          <hr style="border:1px solid #333; margin:30px 0;">
          <p style="color:#888; font-size:12px;">Mit freundlichen Grüßen<br>${esc(settings.impressum_name || settings.smtp_from_name || 'Mas0n1x')}</p>
        </div>`;
      sendNotificationEmail(customer.email, `Zahlungsbestätigung – Rechnung ${inv.invoice_number}`, html)
        .then(ok => { if (ok) dbRun('INSERT INTO email_logs (type, recipient, subject, entity_type, entity_id) VALUES (?,?,?,?,?)', ['payment_confirmation', customer.email, `Zahlungsbestätigung ${inv.invoice_number}`, 'invoice', inv.id]); })
        .catch(e => console.error('Payment-Confirmation-Mail:', e.message));
    }
  }

  res.json({ success: true });
});

// Delete invoice
app.delete('/api/invoices/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM invoices WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ==================== BACKUP API ====================
app.get('/api/backup', requireAuth, (req, res) => {
  const data = db.export();
  const buffer = Buffer.from(data);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename=portfolio-backup-${timestamp}.db`);
  res.send(buffer);
});

// ==================== PROJECT PROGRESS ====================
app.put('/api/projects/:id/progress', requireAuth, (req, res) => {
  const { progress } = req.body;
  dbRun('UPDATE projects SET progress = ? WHERE id = ?', [progress, req.params.id]);
  res.json({ success: true });
});

// ==================== REVIEWS/TESTIMONIALS API ====================
// Admin: Fix umlauts in database
app.post('/api/admin/fix-umlauts', requireAuth, (req, res) => {
  try {
    // Fix Services
    dbRun("UPDATE services SET description = 'Native und Cross-Platform Apps für mobile Endgeräte mit intuitiver User Experience.' WHERE id = 2");
    dbRun("UPDATE services SET description = 'Skalierbare APIs, Datenbanken und Server-Infrastruktur für deine Anwendungen.' WHERE id = 4");
    dbRun("UPDATE services SET description = 'Interaktive Benutzeroberflächen mit modernen Frameworks und sauberem, wartbarem Code.' WHERE id = 5");

    // Fix Projects
    dbRun("UPDATE projects SET description = 'Akten-, Einsatzbericht- und Razzia-Generator für FiveM Roleplay-Server. Automatische Formatierung und Discord-Export.' WHERE id = 1");
    dbRun("UPDATE projects SET description = 'Komplettes Personalverwaltungssystem mit Discord Bot Integration, Rangverwaltung und Aktivitätstracking.' WHERE id = 3");

    saveDatabase();
    res.json({ success: true, message: 'Umlaute korrigiert' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== MESSAGE TEMPLATES API ====================
app.get('/api/admin/templates', requireAuth, (req, res) => {
  const templates = dbAll('SELECT * FROM message_templates ORDER BY category, name');
  res.json(templates);
});

app.post('/api/admin/templates', requireAuth, (req, res) => {
  const { name, subject, content, category } = req.body;
  const result = dbRun(
    'INSERT INTO message_templates (name, subject, content, category) VALUES (?, ?, ?, ?)',
    [name, subject || '', content, category || 'general']
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/admin/templates/:id', requireAuth, (req, res) => {
  const { name, subject, content, category } = req.body;
  dbRun(
    'UPDATE message_templates SET name = ?, subject = ?, content = ?, category = ? WHERE id = ?',
    [name, subject || '', content, category || 'general', req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/admin/templates/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM message_templates WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Public templates for customer portal
app.get('/api/customer/templates', requireCustomerAuth, (req, res) => {
  const templates = dbAll('SELECT id, name, content, category FROM message_templates ORDER BY category, name');
  res.json(templates);
});

// ==================== ANALYTICS API ====================
app.get('/api/admin/analytics', requireAuth, (req, res) => {
  try {
    // Conversion Rate: Anfragen vs abgeschlossene Projekte
    const totalRequests = dbGet('SELECT COUNT(*) as count FROM project_requests')?.count || 0;
    const completedRequests = dbGet("SELECT COUNT(*) as count FROM project_requests WHERE status = 'completed'")?.count || 0;
    const conversionRate = totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0;

    // Beliebte Projekttypen
    const projectTypes = dbAll(`
      SELECT project_type, COUNT(*) as count
      FROM project_requests
      GROUP BY project_type
      ORDER BY count DESC
      LIMIT 5
    `);

    // Anfragen pro Monat (letzte 6 Monate)
    const requestsPerMonth = dbAll(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
      FROM project_requests
      WHERE created_at >= date('now', '-6 months')
      GROUP BY month
      ORDER BY month ASC
    `);

    // Durchschnittliche Reaktionszeit (erste Admin-Antwort)
    const avgResponseTime = dbGet(`
      SELECT AVG(
        CAST((julianday(m.created_at) - julianday(pr.created_at)) * 24 AS INTEGER)
      ) as avg_hours
      FROM project_requests pr
      JOIN messages m ON m.request_id = pr.id AND m.sender_type = 'admin'
      WHERE m.id = (
        SELECT MIN(id) FROM messages
        WHERE request_id = pr.id AND sender_type = 'admin'
      )
    `);

    // Status-Verteilung
    const statusDistribution = dbAll(`
      SELECT status, COUNT(*) as count
      FROM project_requests
      GROUP BY status
    `);

    // Umsatz nach Monat
    const revenuePerMonth = dbAll(`
      SELECT strftime('%Y-%m', created_at) as month, SUM(total) as revenue
      FROM invoices
      WHERE status = 'bezahlt' AND created_at >= date('now', '-6 months')
      GROUP BY month
      ORDER BY month ASC
    `);

    // Top Kunden
    const topCustomers = dbAll(`
      SELECT c.email, c.name, c.company, COUNT(pr.id) as request_count,
             SUM(CASE WHEN pr.status = 'completed' THEN 1 ELSE 0 END) as completed_count
      FROM customers c
      LEFT JOIN project_requests pr ON pr.customer_id = c.id
      GROUP BY c.id
      ORDER BY request_count DESC
      LIMIT 5
    `);

    res.json({
      conversion: {
        total: totalRequests,
        completed: completedRequests,
        rate: conversionRate
      },
      projectTypes,
      requestsPerMonth,
      avgResponseTimeHours: Math.round(avgResponseTime?.avg_hours || 0),
      statusDistribution,
      revenuePerMonth,
      topCustomers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== FAQ API ====================
// ==================== APPOINTMENTS API ====================
// Customer: Get available time slots
app.get('/api/appointments/available', (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Datum erforderlich' });
  }

  // Belegte Slots: Kunden-Termine + oeffentliche Buchungen
  const bookedSlots = dbAll(
    'SELECT time_slot FROM appointments WHERE date = ? AND status != ?',
    [date, 'cancelled']
  ).map(a => a.time_slot);
  const bookingSlots = dbAll(
    "SELECT time_slot FROM bookings WHERE date = ? AND status != 'abgelehnt'",
    [date]
  ).map(b => b.time_slot);
  const taken = new Set([...bookedSlots, ...bookingSlots]);

  const allSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const availableSlots = allSlots.filter(slot => !taken.has(slot));

  res.json(availableSlots);
});

// Oeffentliche Erstgespraech-Buchung (kein Konto noetig)
app.post('/api/booking', (req, res) => {
  const { name, email, date, time_slot, message } = req.body;
  if (!name || !email || !date || !time_slot) return res.status(400).json({ error: 'Name, E-Mail, Datum und Uhrzeit sind erforderlich.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Bitte eine gueltige E-Mail angeben.' });
  const takenA = dbGet("SELECT 1 AS x FROM appointments WHERE date = ? AND time_slot = ? AND status != 'cancelled'", [date, time_slot]);
  const takenB = dbGet("SELECT 1 AS x FROM bookings WHERE date = ? AND time_slot = ? AND status != 'abgelehnt'", [date, time_slot]);
  if (takenA || takenB) return res.status(409).json({ error: 'Dieser Termin ist leider schon vergeben.' });
  const r = dbRun('INSERT INTO bookings (name, email, date, time_slot, message) VALUES (?, ?, ?, ?, ?)',
    [String(name).slice(0, 120), String(email).slice(0, 160), date, time_slot, String(message || '').slice(0, 2000)]);
  // Admin-Benachrichtigung (Buchungen immer melden)
  adminNotify('booking', {
    subject: 'Neue Terminbuchung',
    html: `<h2>Neue Terminbuchung</h2><p><b>${esc(name)}</b> (${esc(email)})<br><b>Termin:</b> ${esc(date)} um ${esc(time_slot)} Uhr</p>${message ? `<p>${esc(message)}</p>` : ''}`,
    discordText: `**${String(name).substring(0, 100)}** — ${date} ${time_slot} Uhr\n${email}${message ? '\n' + String(message).substring(0, 1000) : ''}`
  }, { email: true, discord: true });
  // Bestaetigung an den Besucher
  sendNotificationEmail(email, 'Terminbestätigung — Mas0n1x',
    `<h2>Danke für deine Buchung!</h2><p>Hallo ${esc(name)},</p><p>dein kostenloses Erstgespräch ist vorgemerkt für <b>${esc(date)} um ${esc(time_slot)} Uhr</b>. Ich melde mich kurz zur Bestätigung.</p><p>— Mas0n1x</p>`
  ).catch(() => {});
  res.json({ success: true, id: r.lastInsertRowid });
});

app.get('/api/admin/bookings', requireAuth, (req, res) => {
  res.json(dbAll('SELECT * FROM bookings ORDER BY id DESC'));
});

app.put('/api/admin/bookings/:id', requireAuth, (req, res) => {
  dbRun('UPDATE bookings SET status = ? WHERE id = ?', [req.body.status || 'neu', parseInt(req.params.id)]);
  res.json({ success: true });
});

app.delete('/api/admin/bookings/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM bookings WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

// Customer: Book appointment
app.post('/api/appointments', requireCustomerAuth, (req, res) => {
  const { date, time_slot, type, notes } = req.body;
  const customerId = req.session.customerId;

  if (!date || !time_slot) {
    return res.status(400).json({ error: 'Datum und Uhrzeit erforderlich' });
  }

  // Check if slot is still available
  const existing = dbGet(
    'SELECT id FROM appointments WHERE date = ? AND time_slot = ? AND status != ?',
    [date, time_slot, 'cancelled']
  );

  if (existing) {
    return res.status(400).json({ error: 'Dieser Termin ist nicht mehr verfügbar' });
  }

  const result = dbRun(
    'INSERT INTO appointments (customer_id, date, time_slot, type, notes, status) VALUES (?, ?, ?, ?, ?, ?)',
    [customerId, date, time_slot, type || 'consultation', notes || '', 'pending']
  );

  // Send notification to admin
  const customer = dbGet('SELECT email, name FROM customers WHERE id = ?', [customerId]);
  const customerName = customer?.name || customer?.email?.split('@')[0] || 'Kunde';

  sendNotificationEmail(
    dbGet("SELECT value FROM settings WHERE key = 'smtp_user'")?.value || '',
    'Neuer Terminwunsch',
    `
      <h2>Neuer Terminwunsch</h2>
      <p><strong>Kunde:</strong> ${customerName} (${customer?.email})</p>
      <p><strong>Datum:</strong> ${date}</p>
      <p><strong>Uhrzeit:</strong> ${time_slot}</p>
      <p><strong>Art:</strong> ${type || 'Beratungsgespräch'}</p>
      ${notes ? `<p><strong>Notizen:</strong> ${notes}</p>` : ''}
      <p><a href="${process.env.BASE_URL || 'http://localhost:3000'}/admin/">Im Admin-Panel ansehen</a></p>
    `
  );

  res.json({ success: true, id: result.lastInsertRowid });
});

// Customer: Get available time slots for a date
app.get('/api/customer/appointments/slots', requireCustomerAuth, (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Datum erforderlich' });
  }

  // Define available time slots (business hours)
  const allSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
  ];

  // Get already booked slots for this date
  const bookedSlots = dbAll(
    "SELECT time_slot FROM appointments WHERE date = ? AND status != 'cancelled'",
    [date]
  ).map(a => a.time_slot);

  // Check if it's a weekend (Saturday = 6, Sunday = 0)
  const dayOfWeek = new Date(date).getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return res.json([]); // No slots on weekends
  }

  // Return slots with availability status
  const slots = allSlots.map(time => ({
    time,
    available: !bookedSlots.includes(time)
  }));

  res.json(slots);
});

// Customer: Get their appointments
app.get('/api/customer/appointments', requireCustomerAuth, (req, res) => {
  const appointments = dbAll(
    'SELECT * FROM appointments WHERE customer_id = ? ORDER BY date DESC, time_slot DESC',
    [req.session.customerId]
  );
  res.json(appointments);
});

// Rechnungen des eingeloggten Kunden (Self-Service)
app.get('/api/customer/invoices', requireCustomerAuth, (req, res) => {
  res.json(dbAll(
    'SELECT id, invoice_number, amount, tax, total, status, due_date, paid_date, payment_link, created_at FROM invoices WHERE customer_id = ? ORDER BY id DESC',
    [req.session.customerId]
  ));
});

// Einzelne Rechnung des Kunden inkl. Positionen + Absender-Geschaeftsdaten (fuer Druck/PDF)
app.get('/api/customer/invoices/:id', requireCustomerAuth, (req, res) => {
  const inv = dbGet('SELECT * FROM invoices WHERE id = ? AND customer_id = ?', [parseInt(req.params.id), req.session.customerId]);
  if (!inv) return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  let items = []; try { items = JSON.parse(inv.items || '[]'); } catch (e) {}
  const g = k => dbGet('SELECT value FROM settings WHERE key = ?', [k])?.value || '';
  const business = { name: g('impressum_name'), street: g('impressum_street'), zip: g('impressum_zip'), city: g('impressum_city'), email: g('impressum_email'), vatid: g('impressum_vatid'), bank: g('bank_name'), iban: g('bank_iban'), bic: g('bank_bic') };
  res.json({ ...inv, items, business });
});

// Admin: Get all appointments
app.get('/api/admin/appointments', requireAuth, (req, res) => {
  const appointments = dbAll(`
    SELECT a.*, c.email, c.name as customer_name, c.phone
    FROM appointments a
    JOIN customers c ON a.customer_id = c.id
    ORDER BY a.date ASC, a.time_slot ASC
  `);
  res.json(appointments);
});

// Admin: Update appointment status
app.put('/api/admin/appointments/:id', requireAuth, async (req, res) => {
  const { status, admin_notes } = req.body;
  const appointmentId = parseInt(req.params.id);

  const appointment = dbGet(`
    SELECT a.*, c.email, c.name as customer_name
    FROM appointments a
    JOIN customers c ON a.customer_id = c.id
    WHERE a.id = ?
  `, [appointmentId]);

  if (!appointment) {
    return res.status(404).json({ error: 'Termin nicht gefunden' });
  }

  const oldStatus = appointment.status;

  dbRun(
    'UPDATE appointments SET status = ?, admin_notes = ? WHERE id = ?',
    [status || appointment.status, admin_notes || appointment.admin_notes, appointmentId]
  );

  // Send notification on status change
  if (oldStatus !== status && appointment.email) {
    const statusLabels = {
      'pending': 'Ausstehend',
      'confirmed': 'Bestätigt',
      'cancelled': 'Abgesagt',
      'completed': 'Abgeschlossen'
    };

    const customerName = appointment.customer_name || appointment.email.split('@')[0];

    await sendNotificationEmail(
      appointment.email,
      `Termin ${statusLabels[status] || status}`,
      `
        <h2>Terminaktualisierung</h2>
        <p>Hallo ${customerName},</p>
        <p>Ihr Termin am <strong>${appointment.date}</strong> um <strong>${appointment.time_slot} Uhr</strong> wurde aktualisiert:</p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Status:</strong> ${statusLabels[status] || status}</p>
          ${admin_notes ? `<p><strong>Hinweis:</strong> ${admin_notes}</p>` : ''}
        </div>
        <p>Mit freundlichen Grüßen,<br>Ihr Mas0n1x Team</p>
      `
    );
  }

  res.json({ success: true });
});

app.delete('/api/admin/appointments/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM appointments WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ==================== DIRECT EMAIL API ====================
app.post('/api/admin/send-email', requireAuth, async (req, res) => {
  const { to, subject, content } = req.body;

  if (!to || !subject || !content) {
    return res.status(400).json({ error: 'Empfänger, Betreff und Inhalt erforderlich' });
  }

  const success = await sendNotificationEmail(to, subject, content);

  // Log the email
  dbRun(
    'INSERT INTO email_logs (type, recipient, subject, status, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
    ['direct_email', to, subject, success ? 'sent' : 'failed']
  );

  if (success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden. Prüfe die SMTP-Einstellungen.' });
  }
});

// ==================== CUSTOMER DOCUMENTS API ====================
// Customer: Get their documents
app.get('/api/documents', requireCustomerAuth, (req, res) => {
  const documents = dbAll(
    'SELECT * FROM customer_documents WHERE customer_id = ? ORDER BY created_at DESC',
    [req.session.customerId]
  );
  res.json(documents);
});

// Admin: Create document for customer
app.post('/api/admin/documents', requireAuth, (req, res) => {
  const { customer_id, request_id, type, title, content } = req.body;
  const result = dbRun(
    'INSERT INTO customer_documents (customer_id, request_id, type, title, content) VALUES (?, ?, ?, ?, ?)',
    [customer_id, request_id || null, type, title, content || '']
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

// Admin: Get all documents
app.get('/api/admin/documents', requireAuth, (req, res) => {
  const documents = dbAll(`
    SELECT d.*, c.email as customer_email
    FROM customer_documents d
    JOIN customers c ON d.customer_id = c.id
    ORDER BY d.created_at DESC
  `);
  res.json(documents);
});

app.delete('/api/admin/documents/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM customer_documents WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ==================== AUTOMATED BACKUPS ====================
// Schedule automatic backups (runs on server start and can be triggered)
let lastBackupDate = null;
let lastPaymentReminderDate = null;

async function performAutomaticBackup() {
  const backupEnabled = dbGet('SELECT value FROM settings WHERE key = ?', ['backup_enabled'])?.value;
  if (backupEnabled !== 'true') return;

  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const backupPath = path.join(backupDir, `backup-auto-${timestamp}.db`);

  // Only backup once per day
  if (lastBackupDate === timestamp) return;

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(backupPath, buffer);
    lastBackupDate = timestamp;

    // Log backup
    dbRun(
      'INSERT INTO backup_logs (filename, size, type) VALUES (?, ?, ?)',
      [`backup-auto-${timestamp}.db`, buffer.length, 'automatic']
    );

    // Keep only last 7 automatic backups
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('backup-auto-'));
    if (files.length > 7) {
      files.sort().slice(0, files.length - 7).forEach(f => {
        fs.unlinkSync(path.join(backupDir, f));
      });
    }

    console.log(`Automatic backup created: ${backupPath}`);
  } catch (e) {
    console.error('Automatic backup failed:', e);
  }
}

// Check and send payment reminders daily
async function checkPaymentReminders() {
  const today = new Date().toISOString().split('T')[0];
  if (lastPaymentReminderDate === today) return;

  const autoReminders = dbGet('SELECT value FROM settings WHERE key = ?', ['auto_payment_reminders'])?.value;
  if (autoReminders !== 'true') return;

  try {
    const overdueInvoices = dbAll(`
      SELECT * FROM invoices
      WHERE status = 'offen' AND due_date < date('now')
    `);

    for (const invoice of overdueInvoices) {
      await sendPaymentReminder(invoice);
      // Update status to überfällig
      dbRun('UPDATE invoices SET status = ? WHERE id = ?', ['überfällig', invoice.id]);
    }

    lastPaymentReminderDate = today;
    if (overdueInvoices.length > 0) {
      console.log(`Sent ${overdueInvoices.length} payment reminder(s)`);
    }
  } catch (e) {
    console.error('Payment reminder check failed:', e);
  }
}

// Run backup check every hour
setInterval(performAutomaticBackup, 60 * 60 * 1000);

// Run payment reminder check every 6 hours
setInterval(checkPaymentReminders, 6 * 60 * 60 * 1000);

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

// Serve customer portal
app.use('/kunde', express.static(path.join(__dirname, '..', 'kunde')));
app.get('/kunde', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'kunde', 'index.html'));
});

// ==================== PUBLIC API ROUTES ====================

// ==================== CONTRACT TEMPLATES API ====================
// Get all contract templates
app.get('/api/admin/contract-templates', requireAuth, (req, res) => {
  const templates = dbAll('SELECT * FROM contract_templates ORDER BY created_at DESC');
  res.json(templates);
});

// Create contract template
app.post('/api/admin/contract-templates', requireAuth, (req, res) => {
  const { name, type, content } = req.body;
  const result = dbRun(
    'INSERT INTO contract_templates (name, type, content) VALUES (?, ?, ?)',
    [name, type || 'standard', content]
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

// Update contract template
app.put('/api/admin/contract-templates/:id', requireAuth, (req, res) => {
  const { name, type, content, is_active } = req.body;
  dbRun(
    'UPDATE contract_templates SET name = ?, type = ?, content = ?, is_active = ? WHERE id = ?',
    [name, type || 'standard', content, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id]
  );
  res.json({ success: true });
});

// Delete contract template
app.delete('/api/admin/contract-templates/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM contract_templates WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Generate contract from template
app.post('/api/admin/contracts/generate', requireAuth, (req, res) => {
  const { template_id, request_id, customer_id } = req.body;

  // Get template
  const template = dbGet('SELECT * FROM contract_templates WHERE id = ?', [template_id]);
  if (!template) {
    return res.status(404).json({ error: 'Vorlage nicht gefunden' });
  }

  // Get customer data
  const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customer_id]);
  if (!customer) {
    return res.status(404).json({ error: 'Kunde nicht gefunden' });
  }

  // Get request data if provided
  let request = null;
  if (request_id) {
    request = dbGet('SELECT * FROM project_requests WHERE id = ?', [request_id]);
  }

  // Get settings for company info
  const settings = {};
  dbAll('SELECT * FROM settings').forEach(s => { settings[s.key] = s.value; });

  // Generate contract number
  const year = new Date().getFullYear();
  const existingCount = dbAll('SELECT COUNT(*) as count FROM contracts WHERE contract_number LIKE ?', [`V-${year}-%`])[0].count;
  const contractNumber = `V-${year}-${String(existingCount + 1).padStart(4, '0')}`;

  // Replace placeholders in content
  let content = template.content;
  const today = new Date().toLocaleDateString('de-DE');

  const replacements = {
    '{{VERTRAGSNUMMER}}': contractNumber,
    '{{DATUM}}': today,
    '{{KUNDE_NAME}}': customer.name || '',
    '{{KUNDE_EMAIL}}': customer.email || '',
    '{{KUNDE_FIRMA}}': customer.company || '',
    '{{KUNDE_TELEFON}}': customer.phone || '',
    '{{ANBIETER_NAME}}': settings.impressum_name || '',
    '{{ANBIETER_STRASSE}}': settings.impressum_street || '',
    '{{ANBIETER_PLZ}}': settings.impressum_zip || '',
    '{{ANBIETER_STADT}}': settings.impressum_city || '',
    '{{ANBIETER_EMAIL}}': settings.impressum_email || '',
    '{{ANBIETER_TELEFON}}': settings.impressum_phone || '',
    '{{PROJEKT_TYP}}': request?.project_type || '',
    '{{PROJEKT_BUDGET}}': request?.budget || '',
    '{{PROJEKT_ZEITRAHMEN}}': request?.timeline || '',
    '{{PROJEKT_BESCHREIBUNG}}': request?.description || ''
  };

  Object.entries(replacements).forEach(([key, value]) => {
    content = content.replace(new RegExp(key, 'g'), value);
  });

  // Save contract
  const result = dbRun(
    'INSERT INTO contracts (contract_number, template_id, request_id, customer_id, content) VALUES (?, ?, ?, ?, ?)',
    [contractNumber, template_id, request_id || null, customer_id, content]
  );

  res.json({
    success: true,
    id: result.lastInsertRowid,
    contract_number: contractNumber,
    content
  });
});

// Get all contracts
app.get('/api/admin/contracts', requireAuth, (req, res) => {
  const contracts = dbAll(`
    SELECT c.*, ct.name as template_name, cust.name as customer_name, cust.email as customer_email
    FROM contracts c
    LEFT JOIN contract_templates ct ON c.template_id = ct.id
    LEFT JOIN customers cust ON c.customer_id = cust.id
    ORDER BY c.created_at DESC
  `);
  res.json(contracts);
});

// Update contract status
app.put('/api/admin/contracts/:id', requireAuth, (req, res) => {
  const { status, content } = req.body;
  const updates = [];
  const params = [];

  if (status) {
    updates.push('status = ?');
    params.push(status);
    if (status === 'signed') {
      updates.push('signed_at = datetime("now")');
    }
  }
  if (content) {
    updates.push('content = ?');
    params.push(content);
  }

  if (updates.length > 0) {
    params.push(req.params.id);
    dbRun(`UPDATE contracts SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  res.json({ success: true });
});

// Delete contract
app.delete('/api/admin/contracts/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM contracts WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ==================== SKILLS/BADGES API ====================
// Get all skills (admin)
app.get('/api/admin/skills', requireAuth, (req, res) => {
  const skills = dbAll('SELECT * FROM skills ORDER BY category, sort_order');
  res.json(skills);
});

// Create skill
app.post('/api/admin/skills', requireAuth, (req, res) => {
  const { name, icon, category, level, color, sort_order } = req.body;
  const result = dbRun(
    'INSERT INTO skills (name, icon, category, level, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [name, icon, category || 'frontend', level || 80, color || '#00ff88', sort_order || 0]
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

// Update skill
app.put('/api/admin/skills/:id', requireAuth, (req, res) => {
  const { name, icon, category, level, color, sort_order, is_active } = req.body;
  dbRun(
    'UPDATE skills SET name = ?, icon = ?, category = ?, level = ?, color = ?, sort_order = ?, is_active = ? WHERE id = ?',
    [name, icon, category, level, color, sort_order || 0, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id]
  );
  res.json({ success: true });
});

// Delete skill
app.delete('/api/admin/skills/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM skills WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Public skills (for portfolio)
app.get('/api/public/skills', (req, res) => {
  const skills = dbAll(`
    SELECT id, name, icon, category, level, color
    FROM skills
    WHERE is_active = 1
    ORDER BY category, sort_order
  `);
  res.json(skills);
});

// ==================== EMAIL AUTOMATION API ====================
// Send welcome email to new customer
async function sendWelcomeEmail(customer) {
  const emailEnabled = dbGet('SELECT value FROM settings WHERE key = ?', ['email_enabled'])?.value;
  if (emailEnabled === 'false') return false; // nur explizit deaktiviert blockt; sonst senden sobald SMTP gesetzt

  const settings = {};
  dbAll('SELECT * FROM settings').forEach(s => { settings[s.key] = s.value; });

  const subject = 'Willkommen bei ' + (settings.smtp_from_name || 'Mas0n1x Portfolio');
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111; color: #fff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #00ff88;">Willkommen!</h1>
      </div>
      <p>Hallo${customer.name ? ` ${customer.name}` : ''},</p>
      <p>vielen Dank für Ihre Registrierung! Ihr Konto wurde erfolgreich erstellt.</p>
      <p>Sie können sich jetzt im <a href="${settings.site_url || 'http://localhost:3000'}/kunde" style="color: #00ff88;">Kundenportal</a> anmelden und Ihre Projektanfragen verwalten.</p>
      <hr style="border: 1px solid #333; margin: 30px 0;">
      <p style="color: #888; font-size: 12px;">Diese E-Mail wurde automatisch gesendet.</p>
    </div>
  `;

  const success = await sendNotificationEmail(customer.email, subject, htmlContent);

  if (success) {
    dbRun(
      'INSERT INTO email_logs (type, recipient, subject, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
      ['welcome', customer.email, subject, 'customer', customer.id]
    );
  }

  return success;
}

// Send payment reminder for overdue invoices
async function sendPaymentReminder(invoice) {
  const emailEnabled = dbGet('SELECT value FROM settings WHERE key = ?', ['email_enabled'])?.value;
  if (emailEnabled === 'false') return false; // nur explizit deaktiviert blockt; sonst senden sobald SMTP gesetzt

  // Get customer email
  let recipientEmail = null;
  if (invoice.customer_id) {
    const customer = dbGet('SELECT email FROM customers WHERE id = ?', [invoice.customer_id]);
    recipientEmail = customer?.email;
  }

  if (!recipientEmail) return false;

  const settings = {};
  dbAll('SELECT * FROM settings').forEach(s => { settings[s.key] = s.value; });

  const subject = `Zahlungserinnerung - Rechnung ${invoice.invoice_number}`;
  const dueDate = new Date(invoice.due_date).toLocaleDateString('de-DE');
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111; color: #fff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #ff6b6b;">Zahlungserinnerung</h1>
      </div>
      <p>Sehr geehrte/r ${invoice.customer_name},</p>
      <p>wir möchten Sie freundlich daran erinnern, dass die folgende Rechnung noch offen ist:</p>
      <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Rechnungsnummer:</strong> ${invoice.invoice_number}</p>
        <p><strong>Betrag:</strong> ${invoice.total.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR</p>
        <p><strong>Fällig seit:</strong> ${dueDate}</p>
      </div>
      <p>Bitte überweisen Sie den offenen Betrag zeitnah auf das angegebene Konto.</p>
      <p>Falls die Zahlung bereits erfolgt ist, betrachten Sie diese E-Mail bitte als gegenstandslos.</p>
      <hr style="border: 1px solid #333; margin: 30px 0;">
      <p style="color: #888; font-size: 12px;">Mit freundlichen Grüßen<br>${settings.impressum_name || 'Mas0n1x'}</p>
    </div>
  `;

  const success = await sendNotificationEmail(recipientEmail, subject, htmlContent);

  if (success) {
    dbRun(
      'INSERT INTO email_logs (type, recipient, subject, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
      ['payment_reminder', recipientEmail, subject, 'invoice', invoice.id]
    );
  }

  return success;
}

// API endpoint to trigger payment reminders
app.post('/api/admin/send-payment-reminders', requireAuth, async (req, res) => {
  const overdueInvoices = dbAll(`
    SELECT * FROM invoices
    WHERE status = 'offen' AND due_date < date('now')
  `);

  let sentCount = 0;
  for (const invoice of overdueInvoices) {
    const success = await sendPaymentReminder(invoice);
    if (success) {
      sentCount++;
      // Update status to überfällig
      dbRun('UPDATE invoices SET status = ? WHERE id = ?', ['überfällig', invoice.id]);
    }
  }

  res.json({ success: true, sent: sentCount, total: overdueInvoices.length });
});

// Get email logs
app.get('/api/admin/email-logs', requireAuth, (req, res) => {
  const logs = dbAll('SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 100');
  res.json(logs);
});

// ==================== BACKUP AUTOMATION API ====================
// Manual backup trigger
// ===== Backup-Helfer + Automatik =====
function createBackup(type) {
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${type}-${timestamp}.db`;
  const buffer = Buffer.from(db.export());
  fs.writeFileSync(path.join(backupDir, filename), buffer);
  dbRun('INSERT INTO backup_logs (filename, size, type) VALUES (?, ?, ?)', [filename, buffer.length, type]);
  return { filename, size: buffer.length };
}
// Aufbewahrung: nur die letzten `keep` Auto-Backups behalten, aeltere (Datei + Log) loeschen
function pruneAutoBackups(keep) {
  try {
    const backupDir = path.join(__dirname, '..', 'backups');
    const autos = dbAll("SELECT id, filename FROM backup_logs WHERE type = 'auto' ORDER BY id DESC");
    autos.slice(Math.max(1, keep)).forEach(b => {
      try { const p = path.join(backupDir, b.filename); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
      dbRun('DELETE FROM backup_logs WHERE id = ?', [b.id]);
    });
  } catch (e) { console.error('Backup-Prune:', e.message); }
}
// Scheduler: prueft, ob ein automatisches Backup faellig ist (restart-robust via backup_last)
function checkAutoBackup() {
  try {
    if (dbGet("SELECT value FROM settings WHERE key = 'backup_auto_enabled'")?.value !== 'true') return;
    const interval = dbGet("SELECT value FROM settings WHERE key = 'backup_interval'")?.value || 'daily';
    const last = dbGet("SELECT value FROM settings WHERE key = 'backup_last'")?.value;
    const ms = interval === 'weekly' ? 7 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
    if (last && (Date.now() - Date.parse(last)) < ms) return;
    createBackup('auto');
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('backup_last', ?)", [new Date().toISOString()]);
    pruneAutoBackups(parseInt(dbGet("SELECT value FROM settings WHERE key = 'backup_keep'")?.value || '7', 10));
    console.log('Auto-Backup erstellt');
  } catch (e) { console.error('Auto-Backup:', e.message); }
}
setInterval(checkAutoBackup, 15 * 60 * 1000);
setTimeout(checkAutoBackup, 30 * 1000);

app.post('/api/admin/backup', requireAuth, (req, res) => {
  try {
    res.json({ success: true, ...createBackup('manual') });
  } catch (e) {
    console.error('Backup error:', e);
    res.status(500).json({ error: 'Backup fehlgeschlagen: ' + e.message });
  }
});

// Get backup logs
app.get('/api/admin/backup-logs', requireAuth, (req, res) => {
  const logs = dbAll('SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 50');
  res.json(logs);
});

// List available backups
app.get('/api/admin/backups', requireAuth, (req, res) => {
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    return res.json([]);
  }

  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const stats = fs.statSync(path.join(backupDir, f));
      return {
        filename: f,
        size: stats.size,
        created: stats.mtime
      };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  res.json(files);
});

// Download specific backup
app.get('/api/admin/backups/:filename', requireAuth, (req, res) => {
  const backupDir = path.join(__dirname, '..', 'backups');
  // path.basename verhindert Path-Traversal (z.B. ../../data/portfolio.db) über den Routenparameter.
  const safeName = path.basename(req.params.filename || '');
  const backupPath = path.join(backupDir, safeName);

  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: 'Backup nicht gefunden' });
  }

  res.download(backupPath);
});

// Delete backup
app.delete('/api/admin/backups/:filename', requireAuth, (req, res) => {
  const backupDir = path.join(__dirname, '..', 'backups');
  // path.basename verhindert Path-Traversal (z.B. ../../data/portfolio.db) über den Routenparameter.
  const safeName = path.basename(req.params.filename || '');
  const backupPath = path.join(backupDir, safeName);

  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  res.json({ success: true });
});

// Restore from backup
app.post('/api/admin/restore/:filename', requireAuth, (req, res) => {
  const backupDir = path.join(__dirname, '..', 'backups');
  // path.basename verhindert Path-Traversal (z.B. ../../data/portfolio.db) über den Routenparameter.
  const safeName = path.basename(req.params.filename || '');
  const backupPath = path.join(backupDir, safeName);

  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: 'Backup nicht gefunden' });
  }

  try {
    // Create a backup of current state first
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const preRestoreBackup = `backup-pre-restore-${timestamp}.db`;
    const currentData = db.export();
    fs.writeFileSync(path.join(backupDir, preRestoreBackup), Buffer.from(currentData));

    // Load backup
    const fileBuffer = fs.readFileSync(backupPath);
    const SQL = require('sql.js');
    // Note: This would require reinitializing - in production, you'd restart the server
    res.json({
      success: true,
      message: 'Backup geladen. Bitte Server neu starten um Änderungen zu übernehmen.',
      preRestoreBackup
    });
  } catch (e) {
    res.status(500).json({ error: 'Wiederherstellung fehlgeschlagen: ' + e.message });
  }
});

// ── Discord Bot API Routes ─────────────────────────────────────────

// Get all discord config
app.get('/api/admin/discord/config', requireAuth, (req, res) => {
  try {
    const config = discordBot.getAllConfig();
    // Never send the token to frontend
    delete config.bot_token;
    config.has_token = !!(process.env.DISCORD_BOT_TOKEN || discordBot.getConfig('bot_token'));
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reset discord config to defaults
app.post('/api/admin/discord/reset-defaults', requireAuth, (req, res) => {
  try {
    const defaults = {
      msg_welcome: JSON.stringify({
        title: 'Willkommen!',
        description: 'Willkommen auf dem **Mas0n1x Development** Server, {user}!\nWir freuen uns, dich in unserer Community begrüssen zu dürfen.\nHier findest du professionellen Support, kannst Projekte anfragen und dich mit anderen Entwicklern austauschen.',
        color: '#00ff88',
        footer: 'Du bist unser {memberCount}. Mitglied!'
      }),
      msg_leave: JSON.stringify({
        title: 'Auf Wiedersehen!',
        description: '**{username}** hat den Server verlassen.\nWir bedanken uns für die gemeinsame Zeit und wünschen alles Gute.',
        color: '#ff4444'
      }),
      msg_rules: JSON.stringify({
        title: '📜 Serverregeln',
        color: '#ff4444',
        footer: 'Reagiere mit ✅ um die Regeln zu akzeptieren und Zugang zum Server zu erhalten!',
        sections: [
          { title: '§1 Allgemeines', rules: [
            'Dieser Server dient als offizielle Plattform für Support, Projektanfragen und den Austausch rund um Softwareentwicklung.',
            'Es gelten die offiziellen Discord Nutzungsbedingungen sowie die Discord Community-Richtlinien.',
            'Unwissenheit über die Regeln schützt nicht vor Konsequenzen.',
            'Jeder Nutzer ist für sein eigenes Verhalten auf diesem Server verantwortlich.',
            'Das Serverteam behält sich das Recht vor, Regeln jederzeit anzupassen.'
          ]},
          { title: '§2 Verhalten & Respekt', rules: [
            'Behandle alle Mitglieder respektvoll – kein Mobbing, keine Diskriminierung, kein Hass.',
            'Provokationen, Beleidigungen oder absichtliche Störungen sind verboten.',
            'Diskriminierende oder beleidigende Inhalte werden nicht toleriert.',
            'Toxisches Verhalten, Trolling oder passiv-aggressives Auftreten ist unerwünscht.',
            'Respektiere die Meinungen anderer, auch wenn du anderer Ansicht bist.'
          ]},
          { title: '§3 Sprache & Inhalte', rules: [
            'Inhalte müssen jugendfreundlich und gesetzeskonform sein.',
            'Kein NSFW-/18+ Material, keine extremistischen oder illegalen Inhalte.',
            'Werbung oder Spam sind nur mit ausdrücklicher Erlaubnis der Serverleitung erlaubt.',
            'Keine Kettenbriefe, Pyramid-Schemes oder dubiose Angebote.',
            'Die Serversprache ist Deutsch und Englisch.'
          ]},
          { title: '§4 Sicherheit & Datenschutz', rules: [
            'Veröffentliche keine privaten Daten (eigene oder fremde) ohne Einverständnis.',
            'Betrug, Phishing oder das Teilen schadhafter Dateien ist strengstens untersagt.',
            'Screenshots oder Aufnahmen von privaten Gesprächen dürfen nur mit Erlaubnis geteilt werden.',
            'Teile niemals Passwörter, API-Keys oder andere sensible Daten in öffentlichen Kanälen.',
            'Melde verdächtige Accounts oder Nachrichten sofort dem Serverteam.'
          ]},
          { title: '§5 Kanäle & Themen', rules: [
            'Nutze die Kanäle nur für ihren vorgesehenen Zweck.',
            'Achte auf die Kanalbeschreibungen und halte dich an vorgegebene Themen.',
            'Spam, Flooding oder unnötiges Pingen anderer Nutzer ist zu unterlassen.',
            'Vermeide Off-Topic Diskussionen – nutze dafür den passenden Kanal.',
            'Keine übermäßige Verwendung von Caps-Lock, Emojis oder Stickern.'
          ]},
          { title: '§6 Support & Projekte', rules: [
            'Beschreibe dein Anliegen im Ticket so genau wie möglich, damit wir dir schnell helfen können.',
            'Hab Geduld – unser Team bearbeitet Anfragen so schnell wie möglich.',
            'Spam in DMs an Teammitglieder ist verboten. Nutze das Ticketsystem.',
            'Öffne pro Anliegen nur ein Ticket. Doppelte Tickets werden geschlossen.',
            'Lies dir die FAQ und bestehende Informationen durch, bevor du ein Ticket erstellst.',
            'Bezahlte Projekte unterliegen separaten Vereinbarungen und AGB.'
          ]},
          { title: '§7 Geistiges Eigentum', rules: [
            'Respektiere das geistige Eigentum anderer – kein Kopieren oder Weitergeben fremder Arbeiten.',
            'Teile keinen Code, Designs oder Dateien, die du nicht besitzt oder weitergeben darfst.',
            'Von uns erstellte Projekte unterliegen unseren Lizenzbedingungen.',
            'Bei Open-Source-Projekten sind die jeweiligen Lizenzen zu beachten.'
          ]},
          { title: '§8 Voice-Kanäle', rules: [
            'Kein Soundboard-Spam, Stimmverzerrer-Missbrauch oder absichtliche Störgeräusche.',
            'Respektiere laufende Gespräche und frag bevor du mitmachst.',
            'Streame keine urheberrechtlich geschützten Inhalte.'
          ]},
          { title: '§9 Team & Entscheidungen', rules: [
            'Den Anweisungen des Serverteams ist Folge zu leisten.',
            'Entscheidungen des Teams sind bindend und nicht öffentlich zu diskutieren.',
            'Bei Problemen kann jederzeit ein Teammitglied per Ticket kontaktiert werden.',
            'Impersonation von Teammitgliedern oder anderen Nutzern ist verboten.'
          ]},
          { title: '§10 Sanktionen', rules: [
            'Regelverstöße können zu Verwarnungen, Mutes, Kicks oder permanenten Bans führen.',
            'Die Art der Sanktion liegt im Ermessen des Serverteams.',
            'Wiederholte Verstöße führen zu einer dauerhaften Entfernung vom Server.',
            'Umgehung von Sanktionen (z.B. mit Alt-Accounts) führt zu einem permanenten Ban.',
            'Falsche Anschuldigungen gegenüber anderen Nutzern oder dem Team werden ebenfalls sanktioniert.'
          ]}
        ]
      }),
      msg_social: JSON.stringify({
        title: '🌐 Social Media & Kontakt',
        description: 'Hier findest du alle wichtigen Links, um mit mir in Kontakt zu treten oder meine Arbeit zu verfolgen.',
        links: [
          { emoji: '💬', name: 'Discord', url: 'https://discord.com/users/388425445793857559', description: 'Direkter Kontakt via Discord' },
          { emoji: '🐙', name: 'GitHub', url: 'https://github.com/Mas0n1x', description: 'Open-Source Projekte & Code' },
          { emoji: '📧', name: 'E-Mail', url: 'mailto:support@mas0n1x.online', description: 'Geschäftliche Anfragen per E-Mail' },
          { emoji: '🌍', name: 'Portfolio', url: 'https://mas0n1x.dev', description: 'Mein Portfolio mit allen Projekten' },
        ]
      }),
      msg_products: JSON.stringify([
        { emoji: '💻', name: 'Web-Entwicklung', price: 'ab 499€', color: '#00ff88', description: 'Moderne, responsive Websites und Web-Applikationen mit aktuellen Technologien und Best Practices. Von einfachen Landing Pages bis zu komplexen Web-Applikationen mit Admin-Dashboards und Kundenportalen.', features: '➜ Responsive Design für alle Geräte\n➜ SEO-Optimierung & Performance\n➜ Moderne Frameworks & sauberer Code\n➜ Admin-Dashboards & CMS-Integration' },
        { emoji: '📱', name: 'App-Entwicklung', price: 'ab 799€', color: '#00d4ff', description: 'Native und Cross-Platform Apps mit intuitiver User Experience. Individuell entwickelte Anwendungen für Desktop und Mobile, zugeschnitten auf deine Bedürfnisse.', features: '➜ Cross-Platform Kompatibilität\n➜ Intuitive Benutzeroberfläche\n➜ Offline-Funktionalität\n➜ Push-Benachrichtigungen & Updates' },
        { emoji: '🤖', name: 'Discord Bots', price: 'ab 199€', color: '#a855f7', description: 'Maßgeschneiderte Discord Bot Entwicklung für Moderation, Unterhaltung und Verwaltung. Von einfachen Utility-Bots bis zu komplexen Systemen mit Datenbank-Anbindung.', features: '➜ Moderation & Auto-Moderation\n➜ Ticket- & Supportsysteme\n➜ Custom Commands & Interaktionen\n➜ Dashboard & Web-Interface' },
        { emoji: '⚙️', name: 'Backend-Systeme', price: 'ab 599€', color: '#ffaa00', description: 'Skalierbare APIs, Datenbanken und Server-Infrastruktur. Robuste Backend-Lösungen die zuverlässig und performant arbeiten.', features: '➜ REST & GraphQL APIs\n➜ Datenbank-Design & Optimierung\n➜ Docker & Server-Setup\n➜ Monitoring & Wartung' },
        { emoji: '🎨', name: 'Frontend-Systeme', price: 'ab 399€', color: '#00ff88', description: 'Interaktive Benutzeroberflächen mit modernen Frameworks und sauberem Code. Pixel-perfektes Design mit flüssigen Animationen und optimaler User Experience.', features: '➜ Moderne UI/UX Design\n➜ Animationen & Micro-Interactions\n➜ Barrierefreiheit & Accessibility\n➜ Performance-Optimierung' },
      ]),
      ticket_categories: JSON.stringify([
        { name: 'Allgemeine Frage', emoji: '❓', description: 'Allgemeine Fragen zum Server oder zu Services' },
        { name: 'Projektanfrage', emoji: '📩', description: 'Neue Projektanfrage oder Auftragsarbeit' },
        { name: 'Tech-Support', emoji: '🔧', description: 'Technische Hilfe bei bestehendem Projekt' },
        { name: 'Bug-Report', emoji: '🐛', description: 'Fehler in einem bestehenden Projekt melden' },
      ]),
      ticket_welcome_msg: 'Beschreibe dein Anliegen so detailliert wie möglich.\nEin Teammitglied wird sich so schnell wie möglich bei dir melden.',
      rules_reaction_emoji: '✅',
      welcome_enabled: 'true',
      leave_enabled: 'true',
      modlog_enabled: 'true',
    };
    discordBot.saveAllConfig(defaults);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save discord config
app.post('/api/admin/discord/config', requireAuth, (req, res) => {
  try {
    const config = req.body;
    // Handle token separately
    if (config.bot_token) {
      discordBot.setConfig('bot_token', config.bot_token);
      delete config.bot_token;
    }
    discordBot.saveAllConfig(config);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get bot status
app.get('/api/admin/discord/status', requireAuth, (req, res) => {
  try {
    res.json(discordBot.getStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Connect bot
app.post('/api/admin/discord/connect', requireAuth, async (req, res) => {
  try {
    await discordBot.start();
    res.json({ success: true, status: discordBot.getStatus() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Disconnect bot
app.post('/api/admin/discord/disconnect', requireAuth, async (req, res) => {
  try {
    await discordBot.stop();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send test welcome message
app.post('/api/admin/discord/send-welcome-test', requireAuth, async (req, res) => {
  try {
    const channelId = req.body.channelId || discordBot.getConfig('channel_welcome');
    if (!channelId) return res.status(400).json({ error: 'Kein Channel konfiguriert' });
    const messageId = await discordBot.sendWelcomeTest(channelId);
    res.json({ success: true, messageId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send product embeds
app.post('/api/admin/discord/send-products', requireAuth, async (req, res) => {
  try {
    const channelId = req.body.channelId || discordBot.getConfig('channel_products');
    if (!channelId) return res.status(400).json({ error: 'Kein Channel konfiguriert' });
    const messageIds = await discordBot.sendProductEmbeds(channelId);
    res.json({ success: true, messageIds });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send active projects embeds
app.post('/api/admin/discord/send-active-projects', requireAuth, async (req, res) => {
  try {
    const channelId = req.body.channelId || discordBot.getConfig('channel_projects');
    if (!channelId) return res.status(400).json({ error: 'Kein Channel konfiguriert' });
    const messageIds = await discordBot.sendActiveProjectsEmbed(channelId);
    res.json({ success: true, messageIds });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send social links embed
app.post('/api/admin/discord/send-social', requireAuth, async (req, res) => {
  try {
    const channelId = req.body.channelId || discordBot.getConfig('channel_social');
    if (!channelId) return res.status(400).json({ error: 'Kein Channel konfiguriert' });
    const messageId = await discordBot.sendSocialEmbed(channelId);
    res.json({ success: true, messageId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send rules embed
app.post('/api/admin/discord/send-rules', requireAuth, async (req, res) => {
  try {
    const channelId = req.body.channelId || discordBot.getConfig('channel_rules');
    if (!channelId) return res.status(400).json({ error: 'Kein Channel konfiguriert' });
    const messageId = await discordBot.sendRulesEmbed(channelId);
    res.json({ success: true, messageId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create ticket panel
app.post('/api/admin/discord/send-ticket-panel', requireAuth, async (req, res) => {
  try {
    const channelId = req.body.channelId;
    if (!channelId) return res.status(400).json({ error: 'Kein Channel angegeben' });
    const messageId = await discordBot.createTicketPanel(channelId);
    res.json({ success: true, messageId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get discord logs
app.get('/api/admin/discord/logs', requireAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const type = req.query.type || null;
    const logs = discordBot.getLogs(limit, offset, type);
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear discord logs
app.delete('/api/admin/discord/logs', requireAuth, (req, res) => {
  try {
    discordBot.clearLogs();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GitHub: Setup webhooks on all repos ──────────────────────────

app.post('/api/admin/discord/github-setup-all', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'GitHub Token fehlt' });

    const webhookUrl = discordBot.getConfig('github_webhook_url') || `${req.protocol}://${req.get('host')}/api/webhook/github`;
    const secret = discordBot.getConfig('github_webhook_secret') || '';

    // Fetch all repos (paginated)
    let allRepos = [];
    let page = 1;
    while (true) {
      const repoRes = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner`, {
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Mas0n1x-Portfolio' }
      });
      if (!repoRes.ok) {
        const err = await repoRes.json().catch(() => ({}));
        return res.status(repoRes.status).json({ error: `GitHub API Fehler: ${err.message || repoRes.statusText}` });
      }
      const repos = await repoRes.json();
      if (repos.length === 0) break;
      allRepos = allRepos.concat(repos);
      page++;
    }

    const results = { added: [], skipped: [], failed: [] };

    for (const repo of allRepos) {
      try {
        // Check existing webhooks
        const hooksRes = await fetch(`https://api.github.com/repos/${repo.full_name}/hooks`, {
          headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Mas0n1x-Portfolio' }
        });

        if (hooksRes.ok) {
          const hooks = await hooksRes.json();
          const exists = hooks.some(h => h.config?.url === webhookUrl);
          if (exists) {
            results.skipped.push(repo.full_name);
            continue;
          }
        }

        // Create webhook
        const createRes = await fetch(`https://api.github.com/repos/${repo.full_name}/hooks`, {
          method: 'POST',
          headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'Mas0n1x-Portfolio' },
          body: JSON.stringify({
            name: 'web',
            active: true,
            events: ['push', 'release', 'issues', 'pull_request'],
            config: { url: webhookUrl, content_type: 'json', secret: secret || undefined, insecure_ssl: '0' }
          })
        });

        if (createRes.ok || createRes.status === 201) {
          results.added.push(repo.full_name);
        } else {
          const err = await createRes.json().catch(() => ({}));
          results.failed.push({ repo: repo.full_name, error: err.message || createRes.statusText });
        }
      } catch (e) {
        results.failed.push({ repo: repo.full_name, error: e.message });
      }
    }

    // Save token for future use
    discordBot.setConfig('github_token', token);

    res.json({ success: true, total: allRepos.length, ...results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GitHub: Setup webhooks on org repos ──────────────────────────

app.post('/api/admin/discord/github-setup-orgs', requireAuth, async (req, res) => {
  try {
    const { token, orgs } = req.body;
    if (!token) return res.status(400).json({ error: 'GitHub Token fehlt' });
    if (!orgs || !Array.isArray(orgs) || orgs.length === 0) return res.status(400).json({ error: 'Keine Organisationen angegeben' });

    const webhookUrl = discordBot.getConfig('github_webhook_url') || `${req.protocol}://${req.get('host')}/api/webhook/github`;
    const secret = discordBot.getConfig('github_webhook_secret') || '';

    let allRepos = [];

    for (const org of orgs) {
      let page = 1;
      while (true) {
        const repoRes = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/repos?per_page=100&page=${page}`, {
          headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Mas0n1x-Portfolio' }
        });
        if (!repoRes.ok) {
          const err = await repoRes.json().catch(() => ({}));
          return res.status(repoRes.status).json({ error: `GitHub API Fehler für ${org}: ${err.message || repoRes.statusText}` });
        }
        const repos = await repoRes.json();
        if (repos.length === 0) break;
        allRepos = allRepos.concat(repos);
        page++;
      }
    }

    const results = { added: [], skipped: [], failed: [] };

    for (const repo of allRepos) {
      try {
        const hooksRes = await fetch(`https://api.github.com/repos/${repo.full_name}/hooks`, {
          headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Mas0n1x-Portfolio' }
        });

        if (hooksRes.ok) {
          const hooks = await hooksRes.json();
          const exists = hooks.some(h => h.config?.url === webhookUrl);
          if (exists) {
            results.skipped.push(repo.full_name);
            continue;
          }
        }

        const createRes = await fetch(`https://api.github.com/repos/${repo.full_name}/hooks`, {
          method: 'POST',
          headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'Mas0n1x-Portfolio' },
          body: JSON.stringify({
            name: 'web',
            active: true,
            events: ['push', 'release', 'issues', 'pull_request'],
            config: { url: webhookUrl, content_type: 'json', secret: secret || undefined, insecure_ssl: '0' }
          })
        });

        if (createRes.ok || createRes.status === 201) {
          results.added.push(repo.full_name);
        } else {
          const err = await createRes.json().catch(() => ({}));
          results.failed.push({ repo: repo.full_name, error: err.message || createRes.statusText });
        }
      } catch (e) {
        results.failed.push({ repo: repo.full_name, error: e.message });
      }
    }

    discordBot.setConfig('github_token', token);
    discordBot.setConfig('github_orgs', JSON.stringify(orgs));

    res.json({ success: true, total: allRepos.length, orgCount: orgs.length, ...results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GitHub: Repo-Liste mit Auswahl-Status ────────────────────────
// Liefert alle erreichbaren Repos (User + konfigurierte Orgs) inkl. Flag,
// ob sie aktuell für Discord-Posts ausgewählt sind (github_repos Allowlist).
app.get('/api/admin/discord/github-repos', requireAuth, async (req, res) => {
  try {
    const token = discordBot.getConfig('github_token');
    if (!token) return res.status(400).json({ error: 'GitHub Token fehlt – bitte zuerst GitHub einrichten.' });

    const ghHeaders = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Mas0n1x-Portfolio' };
    let allRepos = [];

    // Eigene Repos
    let page = 1;
    while (true) {
      const r = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner`, { headers: ghHeaders });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: `GitHub API Fehler: ${err.message || r.statusText}` });
      }
      const repos = await r.json();
      if (repos.length === 0) break;
      allRepos = allRepos.concat(repos);
      page++;
    }

    // Org-Repos (falls konfiguriert)
    const orgs = (() => { try { return JSON.parse(discordBot.getConfig('github_orgs') || '[]'); } catch { return []; } })();
    for (const org of orgs) {
      let p = 1;
      while (true) {
        const r = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/repos?per_page=100&page=${p}`, { headers: ghHeaders });
        if (!r.ok) break;
        const repos = await r.json();
        if (!Array.isArray(repos) || repos.length === 0) break;
        allRepos = allRepos.concat(repos);
        p++;
      }
    }

    // Allowlist: null/ungültig => "alle ausgewählt"
    const selected = (() => { try { return JSON.parse(discordBot.getConfig('github_repos')); } catch { return null; } })();
    const selectAll = !Array.isArray(selected);

    // Deduplizieren nach full_name
    const seen = new Set();
    const list = [];
    for (const repo of allRepos) {
      if (seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);
      list.push({
        full_name: repo.full_name,
        name: repo.name,
        private: !!repo.private,
        archived: !!repo.archived,
        selected: selectAll ? true : selected.includes(repo.full_name),
      });
    }

    list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    res.json({ repos: list, selectAll, total: list.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GitHub Webhook (Public) ───────────────────────────────────────

app.post('/api/webhook/github', (req, res) => {
  try {
    const secret = discordBot.getConfig('github_webhook_secret') || process.env.GITHUB_WEBHOOK_SECRET;

    // Secret ist PFLICHT: ohne wäre der Endpoint offen und jeder könnte gefälschte
    // GitHub-Events posten, die der Bot als echte Repo-Aktivität in Discord spiegelt.
    if (!secret || !req.rawBody) {
      return res.status(401).json({ error: 'Webhook nicht konfiguriert' });
    }
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return res.status(401).json({ error: 'Missing signature' });

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(req.rawBody);
    const expected = 'sha256=' + hmac.digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    // Längen-Check VOR timingSafeEqual — sonst wirft es bei ungleicher Länge eine Exception (500).
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.headers['x-github-event'];
    const payload = req.body;

    if (!event || !payload) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    discordBot.sendGitHubNotification(payload, event);
    res.status(200).json({ received: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start server after database is initialized
initDatabase().then(() => {
  // Initialize Discord Bot
  discordBot = new DiscordBot({ dbGet, dbAll, dbRun });

  // Auto-start bot if enabled
  const botEnabled = discordBot.getConfig('bot_enabled');
  const hasToken = !!(process.env.DISCORD_BOT_TOKEN || discordBot.getConfig('bot_token'));
  if (botEnabled === 'true' && hasToken) {
    discordBot.start().catch(e => console.error('Discord Bot auto-start failed:', e.message));
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

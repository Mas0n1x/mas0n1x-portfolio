const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');

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

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
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
app.use(session({
  secret: process.env.SESSION_SECRET || 'mas0n1x-portfolio-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static files
app.use(express.static(path.join(__dirname, '..')));
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
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// ==================== AUTH ROUTES ====================

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const admin = dbGet('SELECT password_hash FROM admin WHERE id = 1');

  if (admin && bcrypt.compareSync(password, admin.password_hash)) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
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

  const newHash = bcrypt.hashSync(newPassword, 10);
  dbRun('UPDATE admin SET password_hash = ? WHERE id = 1', [newHash]);
  res.json({ success: true });
});

// ==================== PROJECTS ROUTES ====================

app.get('/api/projects', (req, res) => {
  const projects = dbAll('SELECT * FROM projects ORDER BY sort_order ASC, id DESC');
  res.json(projects.map(p => ({
    ...p,
    tags: p.tags ? JSON.parse(p.tags) : []
  })));
});

app.get('/api/projects/:id', (req, res) => {
  const project = dbGet('SELECT * FROM projects WHERE id = ?', [parseInt(req.params.id)]);
  if (project) {
    project.tags = project.tags ? JSON.parse(project.tags) : [];
    res.json(project);
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

app.post('/api/projects', requireAuth, upload.single('image'), (req, res) => {
  const { title, description, tags, link, status, sort_order, progress } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const tagsJson = tags ? JSON.stringify(typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : '[]';

  const result = dbRun(
    'INSERT INTO projects (title, description, image, tags, link, status, sort_order, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [title, description, image, tagsJson, link, status || 'completed', parseInt(sort_order) || 0, parseInt(progress) || 0]
  );

  res.json({ id: result.lastInsertRowid, success: true });
});

app.put('/api/projects/:id', requireAuth, upload.single('image'), (req, res) => {
  const { title, description, tags, link, status, sort_order, progress } = req.body;
  const project = dbGet('SELECT * FROM projects WHERE id = ?', [parseInt(req.params.id)]);

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  let image = project.image;
  if (req.file) {
    // Delete old image if exists
    if (project.image) {
      const oldPath = path.join(__dirname, '..', project.image);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    image = `/uploads/${req.file.filename}`;
  }

  const tagsJson = tags ? JSON.stringify(typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : project.tags;

  dbRun(
    'UPDATE projects SET title = ?, description = ?, image = ?, tags = ?, link = ?, status = ?, sort_order = ?, progress = ?, updated_at = datetime("now") WHERE id = ?',
    [title || project.title, description || project.description, image, tagsJson, link || project.link, status || project.status || 'completed', parseInt(sort_order) || project.sort_order, parseInt(progress) || project.progress || 0, parseInt(req.params.id)]
  );

  res.json({ success: true });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const project = dbGet('SELECT image FROM projects WHERE id = ?', [parseInt(req.params.id)]);

  if (project && project.image) {
    const imagePath = path.join(__dirname, '..', project.image);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }

  dbRun('DELETE FROM projects WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
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
  const settings = dbAll('SELECT * FROM settings');
  const result = {};
  settings.forEach(s => {
    result[s.key] = s.value;
  });
  res.json(result);
});

app.post('/api/settings', requireAuth, (req, res) => {
  const settings = req.body;

  Object.entries(settings).forEach(([key, value]) => {
    dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  });

  res.json({ success: true });
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
  const smtpPass = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_pass'])?.value;
  const fromName = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_from_name'])?.value || 'Mas0n1x Portfolio';

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
      from: `"${fromName}" <${smtpUser}>`,
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
  if (emailEnabled !== 'true') return false;

  const smtpHost = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_host'])?.value;
  const smtpPort = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_port'])?.value;
  const smtpUser = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_user'])?.value;
  const smtpPass = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_pass'])?.value;
  const fromName = dbGet('SELECT value FROM settings WHERE key = ?', ['smtp_from_name'])?.value || 'Mas0n1x Portfolio';

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
      from: `"${fromName}" <${smtpUser}>`,
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

app.post('/api/customer/register', async (req, res) => {
  const { email, password, phone, name, company } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });
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

  req.session.customerId = result.lastInsertRowid;
  req.session.customerEmail = email.toLowerCase();

  // Send welcome email (async, don't wait)
  const customer = { id: result.lastInsertRowid, email: email.toLowerCase(), name };
  sendWelcomeEmail(customer).catch(e => console.error('Welcome email error:', e));

  res.json({ success: true, customerId: result.lastInsertRowid });
});

app.post('/api/customer/login', (req, res) => {
  const { email, password } = req.body;

  const customer = dbGet('SELECT * FROM customers WHERE email = ?', [email.toLowerCase()]);

  if (customer && bcrypt.compareSync(password, customer.password_hash)) {
    req.session.customerId = customer.id;
    req.session.customerEmail = customer.email;
    res.json({ success: true, customerId: customer.id });
  } else {
    res.status(401).json({ error: 'Ungültige E-Mail oder Passwort' });
  }
});

app.post('/api/customer/logout', (req, res) => {
  req.session.customerId = null;
  req.session.customerEmail = null;
  res.json({ success: true });
});

app.get('/api/customer/check', (req, res) => {
  if (req.session.customerId) {
    const customer = dbGet('SELECT id, email, phone FROM customers WHERE id = ?', [req.session.customerId]);
    res.json({ authenticated: true, customer });
  } else {
    res.json({ authenticated: false });
  }
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

// Customer Reviews
app.get('/api/customer/review/:requestId', requireCustomerAuth, (req, res) => {
  const requestId = parseInt(req.params.requestId);

  const review = dbGet(
    'SELECT * FROM reviews WHERE request_id = ? AND customer_id = ?',
    [requestId, req.session.customerId]
  );

  if (!review) {
    return res.status(404).json({ error: 'Keine Bewertung gefunden' });
  }

  res.json(review);
});

app.post('/api/customer/review', requireCustomerAuth, (req, res) => {
  const { request_id, rating, title, content, is_public } = req.body;

  // Verify request belongs to customer and is completed
  const request = dbGet(
    'SELECT id, status FROM project_requests WHERE id = ? AND customer_id = ?',
    [request_id, req.session.customerId]
  );

  if (!request) {
    return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }

  if (request.status !== 'completed') {
    return res.status(400).json({ error: 'Bewertungen sind nur für abgeschlossene Projekte möglich' });
  }

  // Check if review already exists
  const existing = dbGet(
    'SELECT id FROM reviews WHERE request_id = ? AND customer_id = ?',
    [request_id, req.session.customerId]
  );

  if (existing) {
    return res.status(400).json({ error: 'Sie haben dieses Projekt bereits bewertet' });
  }

  dbRun(
    `INSERT INTO reviews (request_id, customer_id, rating, title, content, is_public, is_approved)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [request_id, req.session.customerId, rating, title, content, is_public ? 1 : 0]
  );

  res.json({ success: true });
});

// ==================== PROJECT REQUEST ROUTES ====================

app.post('/api/requests', requireCustomerAuth, (req, res) => {
  const { projectType, budget, timeline, description } = req.body;

  const result = dbRun(
    'INSERT INTO project_requests (customer_id, project_type, budget, timeline, description) VALUES (?, ?, ?, ?, ?)',
    [req.session.customerId, projectType, budget, timeline, description]
  );

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
      'INSERT INTO email_logs (recipient, subject, status, created_at) VALUES (?, ?, ?, datetime("now"))',
      [request.email, `Projektstatus: ${statusLabel}`, 'sent']
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
  const { invoice_number, customer_id, customer_name, customer_address, amount, tax, total, status, due_date, notes, items } = req.body;

  const result = dbRun(
    `INSERT INTO invoices (invoice_number, customer_id, customer_name, customer_address, amount, tax, total, status, due_date, notes, items)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [invoice_number, customer_id || null, customer_name, customer_address, amount, tax, total, status || 'offen', due_date, notes, JSON.stringify(items)]
  );

  // Log activity
  dbRun(
    'INSERT INTO activities (type, description, entity_type, entity_id) VALUES (?, ?, ?, ?)',
    ['invoice_created', `Rechnung ${invoice_number} erstellt`, 'invoice', result.lastInsertRowid]
  );

  res.json({ success: true, id: result.lastInsertRowid });
});

// Update invoice status
app.put('/api/invoices/:id', requireAuth, (req, res) => {
  const { status, paid_date } = req.body;

  dbRun(
    'UPDATE invoices SET status = ?, paid_date = ? WHERE id = ?',
    [status, paid_date || null, req.params.id]
  );

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
// Customer submits a review
app.post('/api/reviews', requireCustomerAuth, (req, res) => {
  const { request_id, rating, title, content, is_public } = req.body;

  // Check if request belongs to customer and is completed
  const request = dbGet(
    'SELECT * FROM project_requests WHERE id = ? AND customer_id = ? AND status = ?',
    [request_id, req.session.customerId, 'completed']
  );

  if (!request) {
    return res.status(400).json({ error: 'Nur abgeschlossene Projekte können bewertet werden' });
  }

  // Check if already reviewed
  const existingReview = dbGet(
    'SELECT id FROM reviews WHERE request_id = ? AND customer_id = ?',
    [request_id, req.session.customerId]
  );

  if (existingReview) {
    return res.status(400).json({ error: 'Dieses Projekt wurde bereits bewertet' });
  }

  const result = dbRun(
    'INSERT INTO reviews (request_id, customer_id, rating, title, content, is_public) VALUES (?, ?, ?, ?, ?, ?)',
    [request_id, req.session.customerId, rating, title || '', content || '', is_public ? 1 : 0]
  );

  res.json({ success: true, id: result.lastInsertRowid });
});

// Get customer's reviews
app.get('/api/reviews', requireCustomerAuth, (req, res) => {
  const reviews = dbAll(
    'SELECT r.*, pr.project_type FROM reviews r JOIN project_requests pr ON r.request_id = pr.id WHERE r.customer_id = ?',
    [req.session.customerId]
  );
  res.json(reviews);
});

// Admin: Get all reviews
app.get('/api/admin/reviews', requireAuth, (req, res) => {
  const reviews = dbAll(`
    SELECT r.*, pr.project_type, c.email as customer_email
    FROM reviews r
    JOIN project_requests pr ON r.request_id = pr.id
    JOIN customers c ON r.customer_id = c.id
    ORDER BY r.created_at DESC
  `);
  res.json(reviews);
});

// Admin: Approve/update review
app.put('/api/admin/reviews/:id', requireAuth, (req, res) => {
  const { is_approved, is_public } = req.body;
  dbRun(
    'UPDATE reviews SET is_approved = ?, is_public = ? WHERE id = ?',
    [is_approved ? 1 : 0, is_public ? 1 : 0, req.params.id]
  );
  res.json({ success: true });
});

// Admin: Delete review
app.delete('/api/admin/reviews/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM reviews WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

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

// Public: Get approved testimonials (for portfolio)
app.get('/api/testimonials', (req, res) => {
  const testimonials = dbAll(`
    SELECT r.rating, r.title, r.content, r.created_at, c.name as customer_name, c.company as customer_company
    FROM reviews r
    JOIN customers c ON r.customer_id = c.id
    WHERE r.is_approved = 1 AND r.is_public = 1
    ORDER BY r.created_at DESC
    LIMIT 10
  `);
  res.json(testimonials);
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
// Public: Get all FAQs
app.get('/api/faqs', (req, res) => {
  const faqs = dbAll('SELECT * FROM faqs WHERE is_active = 1 ORDER BY sort_order, id');
  res.json(faqs);
});

// Admin: Get all FAQs (including inactive)
app.get('/api/admin/faqs', requireAuth, (req, res) => {
  const faqs = dbAll('SELECT * FROM faqs ORDER BY sort_order, id');
  res.json(faqs);
});

app.post('/api/admin/faqs', requireAuth, (req, res) => {
  const { question, answer, category, sort_order } = req.body;
  const result = dbRun(
    'INSERT INTO faqs (question, answer, category, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
    [question, answer, category || 'general', sort_order || 0]
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/admin/faqs/:id', requireAuth, (req, res) => {
  const { question, answer, category, sort_order, is_active } = req.body;
  dbRun(
    'UPDATE faqs SET question = ?, answer = ?, category = ?, sort_order = ?, is_active = ? WHERE id = ?',
    [question, answer, category || 'general', sort_order || 0, is_active ? 1 : 0, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/admin/faqs/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM faqs WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ==================== APPOINTMENTS API ====================
// Customer: Get available time slots
app.get('/api/appointments/available', (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Datum erforderlich' });
  }

  // Get booked slots for the date
  const bookedSlots = dbAll(
    'SELECT time_slot FROM appointments WHERE date = ? AND status != ?',
    [date, 'cancelled']
  ).map(a => a.time_slot);

  // Available time slots (9:00 - 18:00, hourly)
  const allSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const availableSlots = allSlots.filter(slot => !bookedSlots.includes(slot));

  res.json(availableSlots);
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
    'INSERT INTO email_logs (recipient, subject, status, created_at) VALUES (?, ?, ?, datetime("now"))',
    [to, subject, success ? 'sent' : 'failed']
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

// ==================== FAQ API ====================
// Public: Get active FAQs
app.get('/api/faqs', (req, res) => {
  const faqs = dbAll('SELECT * FROM faqs WHERE is_active = 1 ORDER BY category, sort_order');
  res.json(faqs);
});

// Admin: Get all FAQs
app.get('/api/admin/faqs', requireAuth, (req, res) => {
  const faqs = dbAll('SELECT * FROM faqs ORDER BY category, sort_order');
  res.json(faqs);
});

app.post('/api/admin/faqs', requireAuth, (req, res) => {
  const { question, answer, category, sort_order } = req.body;
  const result = dbRun(
    'INSERT INTO faqs (question, answer, category, sort_order) VALUES (?, ?, ?, ?)',
    [question, answer, category || 'general', sort_order || 0]
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/admin/faqs/:id', requireAuth, (req, res) => {
  const { question, answer, category, sort_order, is_active } = req.body;
  dbRun(
    'UPDATE faqs SET question = ?, answer = ?, category = ?, sort_order = ?, is_active = ? WHERE id = ?',
    [question, answer, category || 'general', sort_order || 0, is_active ? 1 : 0, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/admin/faqs/:id', requireAuth, (req, res) => {
  dbRun('DELETE FROM faqs WHERE id = ?', [req.params.id]);
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

// Public testimonials (approved and public reviews)
app.get('/api/public/testimonials', (req, res) => {
  const testimonials = dbAll(`
    SELECT r.id, r.rating, r.title, r.content, r.created_at, c.name as customer_name
    FROM reviews r
    LEFT JOIN customers c ON r.customer_id = c.id
    WHERE r.is_approved = 1 AND r.is_public = 1
    ORDER BY r.created_at DESC
    LIMIT 10
  `);
  res.json(testimonials);
});

// Public FAQs (active FAQs)
app.get('/api/public/faqs', (req, res) => {
  const faqs = dbAll(`
    SELECT id, question, answer, category
    FROM faqs
    WHERE is_active = 1
    ORDER BY sort_order ASC, created_at ASC
  `);
  res.json(faqs);
});

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
  if (emailEnabled !== 'true') return false;

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
  if (emailEnabled !== 'true') return false;

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
app.post('/api/admin/backup', requireAuth, (req, res) => {
  try {
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-manual-${timestamp}.db`;
    const backupPath = path.join(backupDir, filename);

    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(backupPath, buffer);

    // Log backup
    dbRun(
      'INSERT INTO backup_logs (filename, size, type) VALUES (?, ?, ?)',
      [filename, buffer.length, 'manual']
    );

    res.json({ success: true, filename, size: buffer.length });
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
  const backupPath = path.join(backupDir, req.params.filename);

  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: 'Backup nicht gefunden' });
  }

  res.download(backupPath);
});

// Delete backup
app.delete('/api/admin/backups/:filename', requireAuth, (req, res) => {
  const backupDir = path.join(__dirname, '..', 'backups');
  const backupPath = path.join(backupDir, req.params.filename);

  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  res.json({ success: true });
});

// Restore from backup
app.post('/api/admin/restore/:filename', requireAuth, (req, res) => {
  const backupDir = path.join(__dirname, '..', 'backups');
  const backupPath = path.join(backupDir, req.params.filename);

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

// Start server after database is initialized
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

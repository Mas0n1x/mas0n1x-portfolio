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
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

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
  saveDatabase();
  return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] };
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

// Auth Middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

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
  const { title, description, tags, link, sort_order } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const tagsJson = tags ? JSON.stringify(typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : '[]';

  const result = dbRun(
    'INSERT INTO projects (title, description, image, tags, link, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [title, description, image, tagsJson, link, parseInt(sort_order) || 0]
  );

  res.json({ id: result.lastInsertRowid, success: true });
});

app.put('/api/projects/:id', requireAuth, upload.single('image'), (req, res) => {
  const { title, description, tags, link, sort_order } = req.body;
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
    'UPDATE projects SET title = ?, description = ?, image = ?, tags = ?, link = ?, sort_order = ?, updated_at = datetime("now") WHERE id = ?',
    [title || project.title, description || project.description, image, tagsJson, link || project.link, parseInt(sort_order) || project.sort_order, parseInt(req.params.id)]
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

// ==================== IMPORT EXISTING DATA ====================

app.post('/api/import-existing', requireAuth, (req, res) => {
  const { projects, services } = req.body;

  if (projects && projects.length > 0) {
    projects.forEach((p, i) => {
      dbRun(
        'INSERT INTO projects (title, description, image, tags, sort_order) VALUES (?, ?, ?, ?, ?)',
        [p.title, p.description, p.image, JSON.stringify(p.tags), i]
      );
    });
  }

  if (services && services.length > 0) {
    services.forEach((s, i) => {
      dbRun(
        'INSERT INTO services (icon, title, description, sort_order) VALUES (?, ?, ?, ?)',
        [s.icon, s.title, s.description, i]
      );
    });
  }

  res.json({ success: true });
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
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

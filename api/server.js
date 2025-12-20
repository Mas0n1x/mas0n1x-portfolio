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
  const { title, description, tags, link, status, sort_order } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const tagsJson = tags ? JSON.stringify(typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : '[]';

  const result = dbRun(
    'INSERT INTO projects (title, description, image, tags, link, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, description, image, tagsJson, link, status || 'completed', parseInt(sort_order) || 0]
  );

  res.json({ id: result.lastInsertRowid, success: true });
});

app.put('/api/projects/:id', requireAuth, upload.single('image'), (req, res) => {
  const { title, description, tags, link, status, sort_order } = req.body;
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
    'UPDATE projects SET title = ?, description = ?, image = ?, tags = ?, link = ?, status = ?, sort_order = ?, updated_at = datetime("now") WHERE id = ?',
    [title || project.title, description || project.description, image, tagsJson, link || project.link, status || project.status || 'completed', parseInt(sort_order) || project.sort_order, parseInt(req.params.id)]
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

// ==================== CUSTOMER AUTH ROUTES ====================

app.post('/api/customer/register', (req, res) => {
  const { email, password, phone } = req.body;

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
    'INSERT INTO customers (email, password_hash, phone) VALUES (?, ?, ?)',
    [email.toLowerCase(), passwordHash, phone || null]
  );

  req.session.customerId = result.lastInsertRowid;
  req.session.customerEmail = email.toLowerCase();

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
    SELECT pr.*, c.email, c.phone
    FROM project_requests pr
    JOIN customers c ON pr.customer_id = c.id
    WHERE pr.id = ?
  `, [parseInt(req.params.id)]);

  if (!request) {
    return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }

  res.json(request);
});

app.put('/api/admin/requests/:id', requireAuth, (req, res) => {
  const { status, deadline } = req.body;
  const requestId = parseInt(req.params.id);

  const request = dbGet('SELECT * FROM project_requests WHERE id = ?', [requestId]);
  if (!request) {
    return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }

  dbRun(
    'UPDATE project_requests SET status = ?, deadline = ?, updated_at = datetime("now") WHERE id = ?',
    [status || request.status, deadline || request.deadline, requestId]
  );

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
      (SELECT COUNT(*) FROM requests WHERE customer_id = c.id) as request_count,
      (SELECT COUNT(*) FROM requests WHERE customer_id = c.id AND status IN ('new', 'in_progress', 'waiting')) as active_requests
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
    FROM requests
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
  dbRun('DELETE FROM messages WHERE request_id IN (SELECT id FROM requests WHERE customer_id = ?)', [req.params.id]);
  dbRun('DELETE FROM requests WHERE customer_id = ?', [req.params.id]);
  dbRun('DELETE FROM customers WHERE id = ?', [req.params.id]);

  res.json({ success: true });
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

// Serve customer portal
app.use('/kunde', express.static(path.join(__dirname, '..', 'kunde')));
app.get('/kunde', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'kunde', 'index.html'));
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

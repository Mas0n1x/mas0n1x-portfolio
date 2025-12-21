// ==================== STATE ====================
let isAuthenticated = false;

// ==================== DOM ELEMENTS ====================
const loginScreen = document.getElementById('login-screen');
const adminDashboard = document.getElementById('admin-dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');
const toastContainer = document.getElementById('toast-container');

// ==================== API HELPER ====================
async function api(endpoint, options = {}) {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(!options.body || options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    body: options.body instanceof FormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
  });

  if (response.status === 401) {
    isAuthenticated = false;
    showLogin();
    throw new Error('Unauthorized');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'An error occurred');
  }

  return data;
}

// ==================== AUTH ====================
async function checkAuth() {
  try {
    const data = await api('/auth/check');
    isAuthenticated = data.authenticated;
    if (isAuthenticated) {
      showDashboard();
    } else {
      showLogin();
    }
  } catch (e) {
    showLogin();
  }
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  adminDashboard.classList.add('hidden');
}

function showDashboard() {
  loginScreen.classList.add('hidden');
  adminDashboard.classList.remove('hidden');
  loadDashboard();
  loadProjects();
  loadServices();
  loadRequests();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;

  try {
    await api('/login', {
      method: 'POST',
      body: { password },
    });
    isAuthenticated = true;
    showDashboard();
    showToast('Erfolgreich angemeldet!', 'success');
  } catch (e) {
    loginError.textContent = 'Falsches Passwort!';
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  isAuthenticated = false;
  showLogin();
  showToast('Abgemeldet', 'success');
});

// ==================== NAVIGATION ====================
document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    // Show section
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(`section-${section}`).classList.add('active');

    // Load section-specific data
    if (section === 'analytics') {
      loadAnalytics();
    } else if (section === 'appointments') {
      loadAdminAppointments();
    } else if (section === 'faqs') {
      loadAdminFAQs();
    }
  });
});

// ==================== MODAL ====================
function openModal(title, content) {
  modalTitle.textContent = title;
  modalBody.innerHTML = content;
  modal.classList.add('active');
}

function closeModal() {
  modal.classList.remove('active');
  modalBody.innerHTML = '';
}

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

// ==================== TOAST ====================
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'exclamation-triangle'}"></i>
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== PROJECTS ====================
async function loadProjects() {
  const container = document.getElementById('projects-list');

  try {
    const projects = await api('/projects');

    if (projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fas fa-folder-open"></i>
          <h3>Keine Projekte vorhanden</h3>
          <p>Füge dein erstes Projekt hinzu oder importiere bestehende Daten.</p>
          <button onclick="openProjectModal()" class="btn-primary">
            <i class="fas fa-plus"></i> Erstes Projekt hinzufügen
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = projects.map(project => `
      <div class="item-card">
        <div class="item-card-image">
          ${project.image
            ? `<img src="${project.image}" alt="${project.title}">`
            : `<div class="placeholder"><i class="fas fa-image"></i></div>`
          }
          <span class="status-badge status-${project.status || 'completed'}">${getStatusLabel(project.status)}</span>
        </div>
        <div class="item-card-content">
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.description || '')}</p>
          <div class="item-card-tags">
            ${(project.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
          ${project.progress !== undefined && project.progress !== null ? `
          <div class="project-progress-bar">
            <div class="project-progress-fill" style="width: ${project.progress}%"></div>
          </div>
          <div class="project-progress-text">
            <span>Fortschritt</span>
            <span>${project.progress}%</span>
          </div>
          ` : ''}
          <div class="item-card-actions">
            <button class="btn-icon" onclick="openProjectModal(${project.id})" title="Bearbeiten">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon danger" onclick="deleteProject(${project.id})" title="Löschen">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<p class="error-message">Fehler beim Laden der Projekte</p>`;
  }
}

async function openProjectModal(id = null) {
  let project = { title: '', description: '', tags: [], image: '', link: '', status: 'completed', sort_order: 0, progress: 0 };

  if (id) {
    project = await api(`/projects/${id}`);
  }

  const tagsString = Array.isArray(project.tags) ? project.tags.join(', ') : '';

  const statusOptions = [
    { value: 'in_progress', label: 'In Arbeit' },
    { value: 'completed', label: 'Abgeschlossen' },
    { value: 'paused', label: 'Pausiert' },
    { value: 'planned', label: 'Geplant' }
  ];

  openModal(id ? 'Projekt bearbeiten' : 'Neues Projekt', `
    <form id="project-form" enctype="multipart/form-data">
      <div class="form-group">
        <label for="project-title">Titel *</label>
        <input type="text" id="project-title" value="${escapeHtml(project.title)}" required>
      </div>
      <div class="form-group">
        <label for="project-description">Beschreibung</label>
        <textarea id="project-description">${escapeHtml(project.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label for="project-status">Status</label>
        <select id="project-status">
          ${statusOptions.map(opt => `
            <option value="${opt.value}" ${(project.status || 'completed') === opt.value ? 'selected' : ''}>
              ${opt.label}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="project-tags">Tags (kommagetrennt)</label>
        <input type="text" id="project-tags" value="${escapeHtml(tagsString)}" placeholder="z.B. JavaScript, React, Node.js">
      </div>
      <div class="form-group">
        <label for="project-link">Link (optional)</label>
        <input type="url" id="project-link" value="${escapeHtml(project.link || '')}" placeholder="https://...">
      </div>
      <div class="form-group">
        <label for="project-order">Sortierung</label>
        <input type="number" id="project-order" value="${project.sort_order || 0}" min="0">
      </div>
      <div class="form-group">
        <label for="project-progress">Fortschritt: <span id="progress-display">${project.progress || 0}%</span></label>
        <input type="range" id="project-progress" value="${project.progress || 0}" min="0" max="100" step="5" class="progress-slider">
        <div class="progress-labels">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>
      <div class="form-group">
        <label>Bild</label>
        <div class="file-input-wrapper">
          <input type="file" id="project-image" accept="image/*">
          <div class="file-input-label">
            <i class="fas fa-cloud-upload-alt"></i>
            <span>Bild auswählen oder hierher ziehen</span>
          </div>
        </div>
        <div class="image-preview" id="image-preview" ${!project.image ? 'style="display:none"' : ''}>
          ${project.image ? `<img src="${project.image}" alt="Preview">` : ''}
        </div>
      </div>
      <button type="submit" class="btn-primary">
        <i class="fas fa-save"></i> ${id ? 'Speichern' : 'Erstellen'}
      </button>
    </form>
  `);

  // Progress slider
  const progressSlider = document.getElementById('project-progress');
  const progressDisplay = document.getElementById('progress-display');
  progressSlider.addEventListener('input', (e) => {
    progressDisplay.textContent = e.target.value + '%';
  });

  // Image preview
  const imageInput = document.getElementById('project-image');
  const imagePreview = document.getElementById('image-preview');

  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        imagePreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });

  // Form submit
  document.getElementById('project-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('title', document.getElementById('project-title').value);
    formData.append('description', document.getElementById('project-description').value);
    formData.append('status', document.getElementById('project-status').value);
    formData.append('tags', document.getElementById('project-tags').value);
    formData.append('link', document.getElementById('project-link').value);
    formData.append('sort_order', document.getElementById('project-order').value);
    formData.append('progress', document.getElementById('project-progress').value);

    const imageFile = document.getElementById('project-image').files[0];
    if (imageFile) {
      formData.append('image', imageFile);
    }

    try {
      if (id) {
        await api(`/projects/${id}`, { method: 'PUT', body: formData });
        showToast('Projekt aktualisiert!', 'success');
      } else {
        await api('/projects', { method: 'POST', body: formData });
        showToast('Projekt erstellt!', 'success');
      }
      closeModal();
      loadProjects();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

async function deleteProject(id) {
  if (!confirm('Möchtest du dieses Projekt wirklich löschen?')) return;

  try {
    await api(`/projects/${id}`, { method: 'DELETE' });
    showToast('Projekt gelöscht!', 'success');
    loadProjects();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

document.getElementById('add-project-btn').addEventListener('click', () => openProjectModal());

// ==================== SERVICES ====================
async function loadServices() {
  const container = document.getElementById('services-list');

  try {
    const services = await api('/services');

    if (services.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fas fa-cogs"></i>
          <h3>Keine Services vorhanden</h3>
          <p>Füge deinen ersten Service hinzu oder importiere bestehende Daten.</p>
          <button onclick="openServiceModal()" class="btn-primary">
            <i class="fas fa-plus"></i> Ersten Service hinzufügen
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = services.map(service => `
      <div class="service-card">
        <div class="service-card-icon">
          <i class="${service.icon}"></i>
        </div>
        <h3>${escapeHtml(service.title)}</h3>
        <p>${escapeHtml(service.description || '')}</p>
        <div class="service-card-actions">
          <button class="btn-icon" onclick="openServiceModal(${service.id})" title="Bearbeiten">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-icon danger" onclick="deleteService(${service.id})" title="Löschen">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<p class="error-message">Fehler beim Laden der Services</p>`;
  }
}

async function openServiceModal(id = null) {
  let service = { icon: 'fas fa-code', title: '', description: '', sort_order: 0 };

  if (id) {
    const services = await api('/services');
    service = services.find(s => s.id === id) || service;
  }

  const iconOptions = [
    { value: 'fas fa-code', label: 'Code' },
    { value: 'fas fa-laptop-code', label: 'Laptop Code' },
    { value: 'fas fa-mobile-alt', label: 'Mobile' },
    { value: 'fas fa-server', label: 'Server' },
    { value: 'fas fa-database', label: 'Database' },
    { value: 'fas fa-cloud', label: 'Cloud' },
    { value: 'fas fa-robot', label: 'Robot/Bot' },
    { value: 'fas fa-paint-brush', label: 'Design' },
    { value: 'fas fa-cogs', label: 'Settings' },
    { value: 'fas fa-shield-alt', label: 'Security' },
    { value: 'fas fa-chart-line', label: 'Analytics' },
    { value: 'fas fa-globe', label: 'Web' },
  ];

  openModal(id ? 'Service bearbeiten' : 'Neuer Service', `
    <form id="service-form">
      <div class="form-group">
        <label for="service-icon">Icon</label>
        <select id="service-icon">
          ${iconOptions.map(opt => `
            <option value="${opt.value}" ${service.icon === opt.value ? 'selected' : ''}>
              ${opt.label}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="service-title">Titel *</label>
        <input type="text" id="service-title" value="${escapeHtml(service.title)}" required>
      </div>
      <div class="form-group">
        <label for="service-description">Beschreibung</label>
        <textarea id="service-description">${escapeHtml(service.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label for="service-order">Sortierung</label>
        <input type="number" id="service-order" value="${service.sort_order || 0}" min="0">
      </div>
      <button type="submit" class="btn-primary">
        <i class="fas fa-save"></i> ${id ? 'Speichern' : 'Erstellen'}
      </button>
    </form>
  `);

  document.getElementById('service-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
      icon: document.getElementById('service-icon').value,
      title: document.getElementById('service-title').value,
      description: document.getElementById('service-description').value,
      sort_order: parseInt(document.getElementById('service-order').value) || 0,
    };

    try {
      if (id) {
        await api(`/services/${id}`, { method: 'PUT', body: data });
        showToast('Service aktualisiert!', 'success');
      } else {
        await api('/services', { method: 'POST', body: data });
        showToast('Service erstellt!', 'success');
      }
      closeModal();
      loadServices();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

async function deleteService(id) {
  if (!confirm('Möchtest du diesen Service wirklich löschen?')) return;

  try {
    await api(`/services/${id}`, { method: 'DELETE' });
    showToast('Service gelöscht!', 'success');
    loadServices();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

document.getElementById('add-service-btn').addEventListener('click', () => openServiceModal());

// ==================== SETTINGS ====================
document.getElementById('change-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (newPassword !== confirmPassword) {
    showToast('Passwörter stimmen nicht überein!', 'error');
    return;
  }

  if (newPassword.length < 4) {
    showToast('Passwort muss mindestens 4 Zeichen lang sein!', 'error');
    return;
  }

  try {
    await api('/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    showToast('Passwort erfolgreich geändert!', 'success');
    e.target.reset();
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// ==================== IMPORT DATA ====================
document.getElementById('import-data-btn').addEventListener('click', async () => {
  if (!confirm('Möchtest du die bestehenden Projekte und Services aus der index.html importieren?')) return;

  // Hardcoded data from the existing portfolio
  const existingProjects = [
    {
      title: 'FiveM Generatoren',
      description: 'Verschiedene Generatoren für FiveM Server, darunter Fahrzeug-Spawner, Item-Generatoren und mehr.',
      image: '/generatoren.png',
      tags: ['FiveM', 'JavaScript', 'HTML/CSS']
    },
    {
      title: 'Straftatenrechner',
      description: 'Ein umfangreicher Straftatenrechner für Roleplay-Server mit automatischer Berechnung von Strafen.',
      image: '/Straftatenrechner.png',
      tags: ['FiveM', 'JavaScript']
    },
    {
      title: 'LSPD Personalsystem',
      description: 'Komplettes Personalmanagementsystem für Roleplay-Fraktionen mit Discord-Integration.',
      image: '/personalsystem.png',
      tags: ['Node.js', 'Discord.js', 'SQLite']
    },
    {
      title: 'Custom Websites',
      description: 'Individuelle Webseiten für verschiedene Kunden mit modernem Design und responsivem Layout.',
      image: '/custom website.png',
      tags: ['HTML/CSS', 'JavaScript', 'Responsive']
    },
    {
      title: 'Dashboards',
      description: 'Interaktive Dashboards mit Echtzeit-Daten, Statistiken und benutzerfreundlicher Oberfläche.',
      image: '/dashboard.png',
      tags: ['Express.js', 'REST API', 'Charts']
    },
    {
      title: 'Custom Anwendungen',
      description: 'Maßgeschneiderte Desktop-Anwendungen für spezifische Anforderungen und Workflows.',
      image: '/custom anwendungen.png',
      tags: ['Node.js', 'JavaScript', 'Desktop']
    }
  ];

  const existingServices = [
    {
      icon: 'fas fa-code',
      title: 'Web Development',
      description: 'Moderne und responsive Webseiten mit den neuesten Technologien.'
    },
    {
      icon: 'fas fa-mobile-alt',
      title: 'App Development',
      description: 'Native und Cross-Platform Apps für iOS und Android.'
    },
    {
      icon: 'fas fa-robot',
      title: 'Discord Bots',
      description: 'Individuelle Discord Bots mit erweiterten Funktionen.'
    },
    {
      icon: 'fas fa-server',
      title: 'Backend Development',
      description: 'Skalierbare Backend-Lösungen mit Node.js und Datenbanken.'
    },
    {
      icon: 'fas fa-paint-brush',
      title: 'Frontend Design',
      description: 'Modernes UI/UX Design mit Fokus auf Benutzerfreundlichkeit.'
    }
  ];

  try {
    const result = await api('/import-existing', {
      method: 'POST',
      body: { projects: existingProjects, services: existingServices },
    });

    const imported = result.imported || {};
    const skipped = result.skipped || {};

    if (imported.projects === 0 && imported.services === 0) {
      showToast('Alle Daten bereits vorhanden - nichts importiert.', 'info');
    } else {
      let message = 'Import abgeschlossen: ';
      if (imported.projects > 0) message += `${imported.projects} Projekte`;
      if (imported.services > 0) message += `${imported.projects > 0 ? ', ' : ''}${imported.services} Services`;
      if (skipped.projects > 0 || skipped.services > 0) {
        message += ` (${skipped.projects + skipped.services} Duplikate übersprungen)`;
      }
      showToast(message, 'success');
    }

    loadProjects();
    loadServices();
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// ==================== PROJECT REQUESTS ====================
let currentRequestId = null;
let currentRequestData = null;

async function loadRequests() {
  const container = document.getElementById('requests-list');
  const badge = document.getElementById('request-badge');

  try {
    const requests = await api('/admin/requests');

    // Update badge
    const newCount = requests.filter(r => r.status === 'new').length;
    if (newCount > 0) {
      badge.textContent = newCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    if (requests.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <h3>Keine Anfragen vorhanden</h3>
          <p>Sobald Kunden Projekte anfragen, erscheinen sie hier.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = requests.map(request => `
      <div class="request-card ${request.status === 'new' ? 'new' : ''}" onclick="openRequestDetail(${request.id})">
        <div class="request-type-icon">
          ${getProjectTypeIcon(request.project_type)}
        </div>
        <div class="request-info">
          <h3>${getProjectTypeLabel(request.project_type)}</h3>
          <p>${escapeHtml(request.email)}</p>
          <div class="request-meta">
            <span><i class="fas fa-euro-sign"></i> ${getBudgetLabel(request.budget)}</span>
            <span><i class="fas fa-clock"></i> ${getTimelineLabel(request.timeline)}</span>
            <span><i class="fas fa-calendar"></i> ${formatDate(request.created_at)}</span>
          </div>
        </div>
        <span class="request-status ${request.status}">${getRequestStatusLabel(request.status)}</span>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<p class="error-message">Fehler beim Laden der Anfragen</p>`;
  }
}

async function openRequestDetail(id) {
  currentRequestId = id;

  try {
    const request = await api(`/admin/requests/${id}`);
    currentRequestData = request; // Store for quick replies

    // Show detail section
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('section-request-detail').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    // Fill info panel
    document.getElementById('request-info').innerHTML = `
      <div class="info-item">
        <div class="info-label">Projektart</div>
        <div class="info-value">${getProjectTypeIcon(request.project_type)} ${getProjectTypeLabel(request.project_type)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Budget</div>
        <div class="info-value">${getBudgetLabel(request.budget)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Zeitrahmen</div>
        <div class="info-value">${getTimelineLabel(request.timeline)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">E-Mail</div>
        <div class="info-value"><a href="mailto:${request.email}" style="color: var(--accent-secondary)">${escapeHtml(request.email)}</a></div>
      </div>
      ${request.phone ? `
        <div class="info-item">
          <div class="info-label">Telefon</div>
          <div class="info-value"><a href="tel:${request.phone}" style="color: var(--accent-secondary)">${escapeHtml(request.phone)}</a></div>
        </div>
      ` : ''}
      <div class="info-item">
        <div class="info-label">Eingereicht am</div>
        <div class="info-value">${formatDateTime(request.created_at)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Beschreibung</div>
        <div class="info-value description">${escapeHtml(request.description) || 'Keine Beschreibung'}</div>
      </div>
    `;

    // Set status, deadline and progress
    document.getElementById('request-status').value = request.status;
    document.getElementById('request-deadline').value = request.deadline || '';

    // Set progress
    const progressSlider = document.getElementById('request-progress');
    const progressValue = document.getElementById('request-progress-value');
    if (progressSlider && progressValue) {
      const progress = request.progress || 0;
      progressSlider.value = progress;
      progressValue.textContent = progress;
      updateMilestoneHighlights(progress);
    }

    // Set admin notes
    const notesField = document.getElementById('request-admin-notes');
    if (notesField) {
      notesField.value = request.admin_notes || '';
    }

    // Load messages and quick replies
    loadMessages(id);
    loadQuickReplies();
  } catch (e) {
    showToast('Fehler beim Laden der Anfrage', 'error');
  }
}

async function loadMessages(requestId) {
  const container = document.getElementById('chat-messages');

  try {
    const messages = await api(`/requests/${requestId}/messages`);

    if (messages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 40px;">
          <i class="fas fa-comments" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
          Noch keine Nachrichten
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(msg => `
      <div class="chat-message ${msg.sender_type}">
        <div>${escapeHtml(msg.content)}</div>
        ${msg.file_path ? renderFileAttachment(msg.file_path, msg.original_name) : ''}
        <div class="chat-message-time">${formatDateTime(msg.created_at)}</div>
      </div>
    `).join('');

    // Add click handlers for image preview
    container.querySelectorAll('.file-preview-image').forEach(img => {
      img.addEventListener('click', () => openImageModal(img.src, img.alt));
    });

    container.scrollTop = container.scrollHeight;
  } catch (e) {
    container.innerHTML = `<p class="error-message">Fehler beim Laden der Nachrichten</p>`;
  }
}

// Load Quick Replies for request detail
async function loadQuickReplies() {
  const container = document.getElementById('quick-replies-list');
  if (!container) return;

  try {
    const templates = await api('/admin/templates');

    if (templates.length === 0) {
      container.innerHTML = `
        <div class="quick-replies-empty">
          <i class="fas fa-bolt"></i>
          <p>Keine Vorlagen vorhanden</p>
          <small>Erstelle Vorlagen im Bereich "Vorlagen"</small>
        </div>
      `;
      return;
    }

    container.innerHTML = templates.map(t => `
      <div class="quick-reply-item" onclick="insertQuickReply(${t.id})" data-content="${escapeHtml(t.content).replace(/"/g, '&quot;')}">
        <div class="quick-reply-name">
          <i class="fas fa-file-alt"></i>
          ${escapeHtml(t.name)}
          <span class="quick-reply-category">${getCategoryLabel(t.category)}</span>
        </div>
        <div class="quick-reply-preview">${escapeHtml(t.content).substring(0, 60)}${t.content.length > 60 ? '...' : ''}</div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<p class="error-message">Fehler beim Laden</p>`;
  }
}

function getCategoryLabel(category) {
  const labels = {
    'greeting': 'Begrüßung',
    'status': 'Status',
    'followup': 'Nachfassen',
    'closing': 'Abschluss',
    'general': 'Allgemein'
  };
  return labels[category] || category;
}

function insertQuickReply(templateId) {
  const container = document.getElementById('quick-replies-list');
  const item = container.querySelector(`[onclick="insertQuickReply(${templateId})"]`);
  if (!item) return;

  let content = item.dataset.content
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Replace placeholders with actual data from current request
  if (currentRequestData) {
    // Extract name from email if no customer_name is set
    const customerName = currentRequestData.customer_name ||
                         currentRequestData.name ||
                         (currentRequestData.email ? currentRequestData.email.split('@')[0] : 'Kunde');

    const replacements = {
      '{{KUNDE_NAME}}': customerName,
      '{{KUNDE_EMAIL}}': currentRequestData.email || '',
      '{{KUNDE_TELEFON}}': currentRequestData.phone || '',
      '{{KUNDE_FIRMA}}': currentRequestData.company || '',
      '{{PROJEKT_TYP}}': getProjectTypeLabel(currentRequestData.project_type) || '',
      '{{PROJEKT_BUDGET}}': getBudgetLabel(currentRequestData.budget) || '',
      '{{PROJEKT_ZEITRAHMEN}}': getTimelineLabel(currentRequestData.timeline) || '',
      '{{PROJEKT_BESCHREIBUNG}}': currentRequestData.description || '',
      '{{PROJEKT_STATUS}}': getStatusLabel(currentRequestData.status) || '',
      '{{PROJEKT_FORTSCHRITT}}': (currentRequestData.progress || 0) + '%',
      '{{DEADLINE}}': currentRequestData.deadline ? formatDate(currentRequestData.deadline) : 'Nicht festgelegt',
      '{{DATUM}}': new Date().toLocaleDateString('de-DE'),
      '{{ANFRAGE_ID}}': currentRequestData.id || ''
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      content = content.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
  }

  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.value = content;
    chatInput.focus();
    showToast('Vorlage eingefügt', 'success');
  }
}

function getStatusLabel(status) {
  const labels = {
    'new': 'Neu',
    'in_progress': 'In Bearbeitung',
    'waiting': 'Warte auf Kunde',
    'completed': 'Abgeschlossen',
    'cancelled': 'Abgebrochen'
  };
  return labels[status] || status;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-DE');
}

// Back button
document.getElementById('back-to-requests').addEventListener('click', () => {
  document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
  document.getElementById('section-requests').classList.add('active');
  document.querySelector('[data-section="requests"]').classList.add('active');
  loadRequests();
});

// Save request changes
document.getElementById('save-request-btn').addEventListener('click', async () => {
  if (!currentRequestId) return;

  const status = document.getElementById('request-status').value;
  const deadline = document.getElementById('request-deadline').value;
  const progress = document.getElementById('request-progress').value;
  const admin_notes = document.getElementById('request-admin-notes')?.value || '';

  try {
    await api(`/admin/requests/${currentRequestId}`, {
      method: 'PUT',
      body: { status, deadline: deadline || null, progress: parseInt(progress), admin_notes }
    });
    showToast('Änderungen gespeichert!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// Progress slider event listener
document.getElementById('request-progress')?.addEventListener('input', (e) => {
  const value = e.target.value;
  document.getElementById('request-progress-value').textContent = value;
  updateMilestoneHighlights(parseInt(value));
});

// Update milestone highlights based on progress
function updateMilestoneHighlights(progress) {
  document.querySelectorAll('.progress-milestones span').forEach(span => {
    const value = parseInt(span.dataset.value);
    if (progress >= value) {
      span.classList.add('reached');
    } else {
      span.classList.remove('reached');
    }
  });
}

// Send message
document.getElementById('send-message-btn').addEventListener('click', async () => {
  if (!currentRequestId) return;

  const input = document.getElementById('chat-input');
  const fileInput = document.getElementById('chat-file');
  const content = input.value.trim();
  const file = fileInput.files[0];

  if (!content && !file) {
    showToast('Bitte Nachricht eingeben oder Datei auswählen', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('content', content);
  if (file) {
    formData.append('file', file);
  }

  try {
    await api(`/requests/${currentRequestId}/messages`, {
      method: 'POST',
      body: formData
    });

    input.value = '';
    fileInput.value = '';
    document.getElementById('selected-file').textContent = '';
    loadMessages(currentRequestId);
    showToast('Nachricht gesendet!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// File selection display
document.getElementById('chat-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const display = document.getElementById('selected-file');
  display.textContent = file ? `Ausgewählt: ${file.name}` : '';
});

// Helper functions
function getProjectTypeIcon(type) {
  const icons = {
    'webdesign': '💻',
    'custom-app': '🛠️',
    'discord-bot': '🤖',
    'linux-setup': '🐧'
  };
  return icons[type] || '📁';
}

function getProjectTypeLabel(type) {
  const labels = {
    'webdesign': 'Webdesign',
    'custom-app': 'Custom Anwendung',
    'discord-bot': 'Discord Bot',
    'linux-setup': 'Linux-Setup'
  };
  return labels[type] || type;
}

function getBudgetLabel(budget) {
  const labels = {
    'unter-500': 'Unter 500€',
    '500-1000': '500€ - 1.000€',
    '1000-2500': '1.000€ - 2.500€',
    'ueber-2500': 'Über 2.500€'
  };
  return labels[budget] || budget;
}

function getTimelineLabel(timeline) {
  const labels = {
    'asap': 'So schnell wie möglich',
    '1-2-wochen': '1-2 Wochen',
    '1-monat': '1 Monat',
    'flexibel': 'Flexibel'
  };
  return labels[timeline] || timeline;
}

function getRequestStatusLabel(status) {
  const labels = {
    'new': 'Neu',
    'in_progress': 'In Bearbeitung',
    'waiting': 'Warte auf Kunde',
    'completed': 'Abgeschlossen',
    'cancelled': 'Abgebrochen'
  };
  return labels[status] || status;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-DE');
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('de-DE');
}

// ==================== FILE PREVIEW ====================
function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  const pdfExts = ['pdf'];
  const videoExts = ['mp4', 'webm', 'ogg', 'mov'];
  const audioExts = ['mp3', 'wav', 'ogg', 'flac'];
  const codeExts = ['js', 'ts', 'html', 'css', 'json', 'py', 'java', 'cpp', 'c', 'php'];
  const docExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];

  if (imageExts.includes(ext)) return 'image';
  if (pdfExts.includes(ext)) return 'pdf';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (codeExts.includes(ext)) return 'code';
  if (docExts.includes(ext)) return 'document';
  return 'file';
}

function getFileIcon(type) {
  const icons = {
    'image': 'fa-image',
    'pdf': 'fa-file-pdf',
    'video': 'fa-video',
    'audio': 'fa-music',
    'code': 'fa-code',
    'document': 'fa-file-word',
    'file': 'fa-file'
  };
  return icons[type] || 'fa-file';
}

function renderFileAttachment(filePath, originalName) {
  const fileType = getFileType(originalName);
  const fileIcon = getFileIcon(fileType);

  if (fileType === 'image') {
    return `
      <div class="file-attachment image-attachment">
        <img src="${filePath}" alt="${escapeHtml(originalName)}" class="file-preview-image" loading="lazy">
        <a href="${filePath}" target="_blank" class="file-download-link">
          <i class="fas fa-download"></i> ${escapeHtml(originalName)}
        </a>
      </div>
    `;
  }

  if (fileType === 'pdf') {
    return `
      <div class="file-attachment pdf-attachment">
        <div class="pdf-preview">
          <i class="fas fa-file-pdf"></i>
          <span>PDF Dokument</span>
        </div>
        <div class="file-attachment-info">
          <a href="${filePath}" target="_blank" class="file-view-link">
            <i class="fas fa-external-link-alt"></i> Öffnen
          </a>
          <a href="${filePath}" download class="file-download-link">
            <i class="fas fa-download"></i> ${escapeHtml(originalName)}
          </a>
        </div>
      </div>
    `;
  }

  if (fileType === 'video') {
    return `
      <div class="file-attachment video-attachment">
        <video controls preload="metadata">
          <source src="${filePath}" type="video/mp4">
          Ihr Browser unterstützt kein Video.
        </video>
        <a href="${filePath}" download class="file-download-link">
          <i class="fas fa-download"></i> ${escapeHtml(originalName)}
        </a>
      </div>
    `;
  }

  if (fileType === 'audio') {
    return `
      <div class="file-attachment audio-attachment">
        <audio controls preload="metadata">
          <source src="${filePath}">
          Ihr Browser unterstützt kein Audio.
        </audio>
        <a href="${filePath}" download class="file-download-link">
          <i class="fas fa-download"></i> ${escapeHtml(originalName)}
        </a>
      </div>
    `;
  }

  return `
    <a href="${filePath}" target="_blank" class="chat-message-file">
      <i class="fas ${fileIcon}"></i>
      <span>${escapeHtml(originalName)}</span>
      <i class="fas fa-download download-icon"></i>
    </a>
  `;
}

function openImageModal(src, alt) {
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  modal.innerHTML = `
    <div class="image-modal-backdrop"></div>
    <div class="image-modal-content">
      <button class="image-modal-close"><i class="fas fa-times"></i></button>
      <img src="${src}" alt="${escapeHtml(alt)}">
      <div class="image-modal-caption">${escapeHtml(alt)}</div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  modal.querySelector('.image-modal-backdrop').addEventListener('click', () => closeImageModal(modal));
  modal.querySelector('.image-modal-close').addEventListener('click', () => closeImageModal(modal));
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closeImageModal(modal);
      document.removeEventListener('keydown', escHandler);
    }
  });

  requestAnimationFrame(() => modal.classList.add('active'));
}

function closeImageModal(modal) {
  modal.classList.remove('active');
  setTimeout(() => {
    modal.remove();
    document.body.style.overflow = '';
  }, 300);
}

// ==================== UTILS ====================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getStatusLabel(status) {
  const labels = {
    'in_progress': 'In Arbeit',
    'completed': 'Abgeschlossen',
    'paused': 'Pausiert',
    'planned': 'Geplant'
  };
  return labels[status] || 'Abgeschlossen';
}

// ==================== INVOICE GENERATOR ====================
let invoiceInitialized = false;

function initInvoice() {
  const dateInput = document.getElementById('invoice-date');
  const numberInput = document.getElementById('invoice-number');
  const addItemBtn = document.getElementById('add-invoice-item');
  const downloadBtn = document.getElementById('download-invoice-btn');
  const itemsContainer = document.getElementById('invoice-items');

  // Check if elements exist
  if (!dateInput || !numberInput) return;

  // Set default date
  if (!dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Generate invoice number
  if (!numberInput.value) {
    const year = new Date().getFullYear();
    numberInput.value = `${year}-001`;
  }

  // Load saved sender data from localStorage
  const savedSender = localStorage.getItem('invoiceSender');
  if (savedSender) {
    try {
      const sender = JSON.parse(savedSender);
      const fromName = document.getElementById('invoice-from-name');
      const fromAddress = document.getElementById('invoice-from-address');
      const fromEmail = document.getElementById('invoice-from-email');
      const fromPhone = document.getElementById('invoice-from-phone');
      const bank = document.getElementById('invoice-bank');

      if (fromName && !fromName.value) fromName.value = sender.name || '';
      if (fromAddress && !fromAddress.value) fromAddress.value = sender.address || '';
      if (fromEmail && !fromEmail.value) fromEmail.value = sender.email || '';
      if (fromPhone && !fromPhone.value) fromPhone.value = sender.phone || '';
      if (bank && !bank.value) bank.value = sender.bank || '';
    } catch (e) {
      console.error('Error loading sender data:', e);
    }
  }

  // Event listeners (only add once)
  if (!invoiceInitialized) {
    if (addItemBtn) {
      addItemBtn.addEventListener('click', addInvoiceItem);
    }
    if (downloadBtn) {
      downloadBtn.addEventListener('click', downloadInvoice);
    }

    // Remove item handler
    if (itemsContainer) {
      itemsContainer.addEventListener('click', (e) => {
        if (e.target.closest('.remove-item')) {
          const items = document.querySelectorAll('#invoice-items .invoice-item');
          if (items.length > 1) {
            e.target.closest('.invoice-item').remove();
            updateInvoicePreview();
          }
        }
      });
    }

    // Update preview on input change
    const formPanel = document.querySelector('#invoice-generator-tab .invoice-form-panel');
    if (formPanel) {
      formPanel.addEventListener('input', updateInvoicePreview);
    }

    invoiceInitialized = true;
  }

  updateInvoicePreview();
}

function addInvoiceItem() {
  const container = document.getElementById('invoice-items');
  const newItem = document.createElement('div');
  newItem.className = 'invoice-item';
  newItem.innerHTML = `
    <div class="form-row">
      <div class="form-group" style="flex: 3;">
        <label>Beschreibung</label>
        <input type="text" class="item-desc" placeholder="z.B. Webentwicklung">
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Menge</label>
        <input type="number" class="item-qty" value="1" min="1">
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Preis (€)</label>
        <input type="number" class="item-price" value="0" step="0.01" min="0">
      </div>
      <button type="button" class="btn-icon danger remove-item" style="align-self: flex-end; margin-bottom: 16px;">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;
  container.appendChild(newItem);
  updateInvoicePreview();
}

function getInvoiceData() {
  const items = [];
  const invoiceItemsContainer = document.getElementById('invoice-items');
  if (invoiceItemsContainer) {
    invoiceItemsContainer.querySelectorAll('.invoice-item').forEach(item => {
      const descEl = item.querySelector('.item-desc');
      const qtyEl = item.querySelector('.item-qty');
      const priceEl = item.querySelector('.item-price');
      if (descEl && qtyEl && priceEl) {
        const desc = descEl.value;
        const qty = parseFloat(qtyEl.value) || 0;
        const price = parseFloat(priceEl.value) || 0;
        if (desc || price > 0) {
          items.push({ desc, qty, price, total: qty * price });
        }
      }
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const isKleinunternehmer = document.getElementById('invoice-kleinunternehmer').checked;
  const taxRate = isKleinunternehmer ? 0 : 0.19;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const paymentDays = parseInt(document.getElementById('invoice-payment-days').value) || 14;
  const invoiceDate = new Date(document.getElementById('invoice-date').value);
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + paymentDays);

  return {
    number: document.getElementById('invoice-number').value || '-',
    date: document.getElementById('invoice-date').value,
    dueDate: dueDate.toISOString().split('T')[0],
    from: {
      name: document.getElementById('invoice-from-name').value,
      address: document.getElementById('invoice-from-address').value,
      email: document.getElementById('invoice-from-email').value,
      phone: document.getElementById('invoice-from-phone').value
    },
    to: {
      name: document.getElementById('invoice-to-name').value,
      address: document.getElementById('invoice-to-address').value
    },
    items,
    subtotal,
    taxRate,
    tax,
    total,
    isKleinunternehmer,
    bank: document.getElementById('invoice-bank').value,
    notes: document.getElementById('invoice-notes').value
  };
}

function updateInvoicePreview() {
  const data = getInvoiceData();
  const preview = document.getElementById('invoice-preview');

  // Save sender data
  localStorage.setItem('invoiceSender', JSON.stringify({
    name: data.from.name,
    address: data.from.address,
    email: data.from.email,
    phone: data.from.phone,
    bank: data.bank
  }));

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('de-DE');
  };

  const formatCurrency = (amount) => {
    return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  preview.innerHTML = `
    <div class="invoice-document">
      <div class="invoice-header">
        <div>
          <div class="invoice-title">RECHNUNG</div>
          <div class="invoice-meta">
            <div><strong>Rechnungsnr.:</strong> ${escapeHtml(data.number)}</div>
            <div><strong>Datum:</strong> ${formatDate(data.date)}</div>
            <div><strong>Fällig bis:</strong> ${formatDate(data.dueDate)}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <img src="/logo.png" alt="Mas0n1x" class="invoice-logo">
          ${data.from.name ? `<div class="party-name">${escapeHtml(data.from.name)}</div>` : ''}
          ${data.from.address ? `<div class="party-address">${escapeHtml(data.from.address)}</div>` : ''}
          ${data.from.email ? `<div>${escapeHtml(data.from.email)}</div>` : ''}
          ${data.from.phone ? `<div>${escapeHtml(data.from.phone)}</div>` : ''}
        </div>
      </div>

      <div class="invoice-parties">
        <div>
          <div class="party-label">Rechnungsempfänger</div>
          ${data.to.name ? `<div class="party-name">${escapeHtml(data.to.name)}</div>` : '<div class="party-name" style="color: #ccc;">Kunde</div>'}
          ${data.to.address ? `<div class="party-address">${escapeHtml(data.to.address)}</div>` : ''}
        </div>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th>Pos.</th>
            <th>Beschreibung</th>
            <th class="text-right">Menge</th>
            <th class="text-right">Einzelpreis</th>
            <th class="text-right">Gesamt</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.length > 0 ? data.items.map((item, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(item.desc) || '-'}</td>
              <td class="text-right">${item.qty}</td>
              <td class="text-right">${formatCurrency(item.price)}</td>
              <td class="text-right">${formatCurrency(item.total)}</td>
            </tr>
          `).join('') : '<tr><td colspan="5" style="text-align: center; color: #999;">Keine Positionen</td></tr>'}
        </tbody>
      </table>

      <div class="invoice-total">
        <div class="total-box">
          <div class="total-row">
            <span>Zwischensumme</span>
            <span>${formatCurrency(data.subtotal)}</span>
          </div>
          ${!data.isKleinunternehmer ? `
            <div class="total-row">
              <span>MwSt. (19%)</span>
              <span>${formatCurrency(data.tax)}</span>
            </div>
          ` : ''}
          <div class="total-row grand-total">
            <span>Gesamtbetrag</span>
            <span>${formatCurrency(data.total)}</span>
          </div>
        </div>
      </div>

      <div class="invoice-footer">
        <div class="payment-info">
          <div>
            <h4>Zahlungsinformationen</h4>
            <p>${escapeHtml(data.bank) || 'Keine Bankdaten angegeben'}</p>
          </div>
          <div>
            <h4>Zahlungsziel</h4>
            <p>Bitte überweisen Sie den Betrag bis zum ${formatDate(data.dueDate)}.</p>
          </div>
        </div>
        ${data.notes ? `<div class="invoice-notes">${escapeHtml(data.notes)}</div>` : ''}
        ${data.isKleinunternehmer ? `
          <div class="kleinunternehmer-notice">
            Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function downloadInvoice() {
  const data = getInvoiceData();
  const preview = document.getElementById('invoice-preview');

  // Use html2canvas and jsPDF for PDF generation
  // For now, we'll create a print-friendly window
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Rechnung ${escapeHtml(data.number)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.5; color: #000; padding: 40px; }
        .invoice-header { display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #00ff88; }
        .invoice-logo { width: 80px; height: 80px; object-fit: contain; margin-bottom: 12px; border-radius: 12px; }
        .invoice-title { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
        .invoice-meta { color: #666; font-size: 11px; }
        .invoice-meta div { margin-bottom: 4px; }
        .invoice-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
        .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
        .party-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
        .party-address { white-space: pre-line; color: #444; }
        .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .invoice-table th { background: #f5f5f5; padding: 12px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #ddd; }
        .invoice-table td { padding: 12px; border-bottom: 1px solid #eee; }
        .text-right { text-align: right; }
        .invoice-total { display: flex; justify-content: flex-end; margin-bottom: 40px; }
        .total-box { width: 250px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .grand-total { font-weight: 700; font-size: 16px; border-bottom: 2px solid #00ff88; padding: 12px 0; margin-top: 8px; }
        .invoice-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
        .payment-info { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 20px; }
        .payment-info h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 8px; }
        .payment-info p { color: #444; white-space: pre-line; }
        .invoice-notes { font-size: 11px; color: #666; font-style: italic; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
        .kleinunternehmer-notice { font-size: 10px; color: #888; margin-top: 10px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      ${preview.innerHTML}
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// ==================== LEGAL (Impressum, Datenschutz, AGB, Widerruf) ====================
async function loadLegalSettings() {
  try {
    const settings = await api('/settings');

    // Impressum
    document.getElementById('imp-name').value = settings.impressum_name || '';
    document.getElementById('imp-street').value = settings.impressum_street || '';
    document.getElementById('imp-zip').value = settings.impressum_zip || '';
    document.getElementById('imp-city').value = settings.impressum_city || '';
    document.getElementById('imp-country').value = settings.impressum_country || '';
    document.getElementById('imp-email').value = settings.impressum_email || '';
    document.getElementById('imp-phone').value = settings.impressum_phone || '';
    document.getElementById('imp-ustid').value = settings.impressum_ustid || '';
    document.getElementById('imp-job').value = settings.impressum_job || '';
    document.getElementById('imp-disclaimer').value = settings.impressum_disclaimer || '';

    // Datenschutz
    if (settings.datenschutz_custom) {
      document.getElementById('datenschutz-custom-toggle').checked = true;
      document.getElementById('datenschutz-custom-container').classList.remove('hidden');
      document.getElementById('datenschutz-custom').value = settings.datenschutz_custom;
    }

    // AGB
    if (settings.agb_custom) {
      document.getElementById('agb-custom-toggle').checked = true;
      document.getElementById('agb-custom-container').classList.remove('hidden');
      document.getElementById('agb-custom').value = settings.agb_custom;
    }

    // Widerruf
    if (settings.widerruf_custom) {
      document.getElementById('widerruf-custom-toggle').checked = true;
      document.getElementById('widerruf-custom-container').classList.remove('hidden');
      document.getElementById('widerruf-custom').value = settings.widerruf_custom;
    }
  } catch (e) {
    // Settings not found, leave empty
  }
}

// Legal tabs
document.querySelectorAll('.legal-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.legal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.legal-tab-content').forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    const tabId = `legal-${tab.dataset.legalTab}-tab`;
    document.getElementById(tabId)?.classList.add('active');
  });
});

// Toggle custom text containers
document.getElementById('datenschutz-custom-toggle')?.addEventListener('change', (e) => {
  const container = document.getElementById('datenschutz-custom-container');
  if (e.target.checked) {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
});

document.getElementById('agb-custom-toggle')?.addEventListener('change', (e) => {
  const container = document.getElementById('agb-custom-container');
  if (e.target.checked) {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
});

document.getElementById('widerruf-custom-toggle')?.addEventListener('change', (e) => {
  const container = document.getElementById('widerruf-custom-container');
  if (e.target.checked) {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
});

// Save Impressum
document.getElementById('save-impressum-btn').addEventListener('click', async () => {
  const impressumData = {
    impressum_name: document.getElementById('imp-name').value,
    impressum_street: document.getElementById('imp-street').value,
    impressum_zip: document.getElementById('imp-zip').value,
    impressum_city: document.getElementById('imp-city').value,
    impressum_country: document.getElementById('imp-country').value,
    impressum_email: document.getElementById('imp-email').value,
    impressum_phone: document.getElementById('imp-phone').value,
    impressum_ustid: document.getElementById('imp-ustid').value,
    impressum_job: document.getElementById('imp-job').value,
    impressum_disclaimer: document.getElementById('imp-disclaimer').value
  };

  try {
    await api('/settings', {
      method: 'POST',
      body: impressumData
    });
    showToast('Impressum gespeichert!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// Save Datenschutz
document.getElementById('save-datenschutz-btn')?.addEventListener('click', async () => {
  const useCustom = document.getElementById('datenschutz-custom-toggle').checked;
  const customText = document.getElementById('datenschutz-custom').value;

  try {
    await api('/settings', {
      method: 'POST',
      body: {
        datenschutz_custom: useCustom ? customText : ''
      }
    });
    showToast('Datenschutzerklärung gespeichert!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// Save AGB
document.getElementById('save-agb-btn')?.addEventListener('click', async () => {
  const useCustom = document.getElementById('agb-custom-toggle').checked;
  const customText = document.getElementById('agb-custom').value;

  try {
    await api('/settings', {
      method: 'POST',
      body: {
        agb_custom: useCustom ? customText : ''
      }
    });
    showToast('AGB gespeichert!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// Save Widerruf
document.getElementById('save-widerruf-btn')?.addEventListener('click', async () => {
  const useCustom = document.getElementById('widerruf-custom-toggle').checked;
  const customText = document.getElementById('widerruf-custom').value;

  try {
    await api('/settings', {
      method: 'POST',
      body: {
        widerruf_custom: useCustom ? customText : ''
      }
    });
    showToast('Widerrufsbelehrung gespeichert!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// ==================== CUSTOMERS ====================
let allCustomers = [];

async function loadCustomers() {
  try {
    const customers = await api('/customers');
    allCustomers = customers;
    renderCustomers(customers);
    updateCustomerStats(customers);
  } catch (e) {
    console.error('Error loading customers:', e);
    document.getElementById('customers-list').innerHTML = `
      <div class="empty-customers">
        <i class="fas fa-users"></i>
        <h3>Keine Kunden gefunden</h3>
        <p>Es sind noch keine Kunden registriert.</p>
      </div>
    `;
  }
}

function updateCustomerStats(customers) {
  document.getElementById('total-customers').textContent = customers.length;

  let totalRequests = 0;
  let activeRequests = 0;

  customers.forEach(c => {
    totalRequests += c.request_count || 0;
    activeRequests += c.active_requests || 0;
  });

  document.getElementById('total-customer-requests').textContent = totalRequests;
  document.getElementById('active-requests').textContent = activeRequests;
}

function renderCustomers(customers) {
  const container = document.getElementById('customers-list');

  if (customers.length === 0) {
    container.innerHTML = `
      <div class="empty-customers">
        <i class="fas fa-users"></i>
        <h3>Keine Kunden gefunden</h3>
        <p>Es sind noch keine Kunden registriert.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = customers.map(customer => {
    const initials = getInitials(customer.name);
    const createdDate = new Date(customer.created_at).toLocaleDateString('de-DE');

    return `
      <div class="customer-card" data-customer-id="${customer.id}">
        <div class="customer-avatar">${initials}</div>
        <div class="customer-info">
          <h3>${escapeHtml(customer.name)}</h3>
          <p>${escapeHtml(customer.email)}</p>
          ${customer.company ? `<p class="company">${escapeHtml(customer.company)}</p>` : ''}
        </div>
        <div class="customer-meta">
          <span class="request-count">
            <i class="fas fa-folder"></i>
            ${customer.request_count || 0} Anfragen
          </span>
          <span class="date">Seit ${createdDate}</span>
        </div>
        <button class="customer-actions-btn" onclick="event.stopPropagation(); openCustomerDetail(${customer.id})">
          <i class="fas fa-eye"></i>
        </button>
      </div>
    `;
  }).join('');

  // Add click handlers
  document.querySelectorAll('.customer-card').forEach(card => {
    card.addEventListener('click', () => {
      const customerId = card.dataset.customerId;
      openCustomerDetail(customerId);
    });
  });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return parts[0][0] + parts[parts.length - 1][0];
  }
  return name.substring(0, 2);
}

async function openCustomerDetail(customerId) {
  try {
    const customer = await api(`/customers/${customerId}`);

    document.getElementById('customer-modal-title').textContent = customer.name;

    const createdDate = new Date(customer.created_at).toLocaleDateString('de-DE');

    document.getElementById('customer-contact-info').innerHTML = `
      <div class="info-row">
        <span class="label">Name</span>
        <span class="value">${escapeHtml(customer.name)}</span>
      </div>
      <div class="info-row">
        <span class="label">E-Mail</span>
        <span class="value"><a href="mailto:${escapeHtml(customer.email)}">${escapeHtml(customer.email)}</a></span>
      </div>
      ${customer.company ? `
        <div class="info-row">
          <span class="label">Firma</span>
          <span class="value">${escapeHtml(customer.company)}</span>
        </div>
      ` : ''}
      ${customer.phone ? `
        <div class="info-row">
          <span class="label">Telefon</span>
          <span class="value"><a href="tel:${escapeHtml(customer.phone)}">${escapeHtml(customer.phone)}</a></span>
        </div>
      ` : ''}
      <div class="info-row">
        <span class="label">Registriert</span>
        <span class="value">${createdDate}</span>
      </div>
    `;

    // Load customer requests
    const requests = customer.requests || [];
    document.getElementById('customer-request-count').textContent = requests.length;

    if (requests.length > 0) {
      document.getElementById('customer-requests-list').innerHTML = requests.map(req => {
        const reqDate = new Date(req.created_at).toLocaleDateString('de-DE');
        return `
          <div class="customer-request-item" onclick="viewRequestFromCustomer(${req.id})">
            <div class="request-title">${escapeHtml(req.project_type || 'Projektanfrage')}</div>
            <div class="request-meta">
              <span>${getStatusLabel(req.status)}</span>
              <span>${reqDate}</span>
            </div>
          </div>
        `;
      }).join('');
    } else {
      document.getElementById('customer-requests-list').innerHTML = `
        <p style="color: var(--text-muted); text-align: center; padding: 20px;">
          Keine Anfragen vorhanden
        </p>
      `;
    }

    // Setup delete button
    document.getElementById('delete-customer-btn').onclick = () => deleteCustomer(customerId);

    // Show modal
    document.getElementById('customer-detail-modal').classList.add('active');
  } catch (e) {
    showToast('Fehler beim Laden der Kundendaten', 'error');
  }
}

function viewRequestFromCustomer(requestId) {
  document.getElementById('customer-detail-modal').classList.remove('active');
  showSection('request-detail');
  openRequestDetail(requestId);
}

async function deleteCustomer(customerId) {
  if (!confirm('Möchtest du diesen Kunden wirklich löschen? Alle zugehörigen Anfragen werden ebenfalls gelöscht.')) {
    return;
  }

  try {
    await api(`/customers/${customerId}`, { method: 'DELETE' });
    showToast('Kunde wurde gelöscht', 'success');
    document.getElementById('customer-detail-modal').classList.remove('active');
    loadCustomers();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// Customer search
document.getElementById('customer-search')?.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();

  if (!query) {
    renderCustomers(allCustomers);
    return;
  }

  const filtered = allCustomers.filter(c =>
    c.name.toLowerCase().includes(query) ||
    c.email.toLowerCase().includes(query) ||
    (c.company && c.company.toLowerCase().includes(query))
  );

  renderCustomers(filtered);
});

// Close customer modal
document.querySelector('#customer-detail-modal .modal-close')?.addEventListener('click', () => {
  document.getElementById('customer-detail-modal').classList.remove('active');
});

document.getElementById('customer-detail-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'customer-detail-modal') {
    document.getElementById('customer-detail-modal').classList.remove('active');
  }
});

// ==================== DASHBOARD ====================
async function loadDashboard() {
  try {
    const data = await api('/dashboard');

    // Update stats
    document.getElementById('dash-projects').textContent = data.stats.projects;
    document.getElementById('dash-customers').textContent = data.stats.customers;
    document.getElementById('dash-requests').textContent = data.stats.openRequests;
    document.getElementById('dash-invoices').textContent = data.stats.invoices;

    // Update revenue
    document.getElementById('dash-revenue-total').textContent = formatCurrency(data.revenue.total);
    document.getElementById('dash-revenue-paid').textContent = formatCurrency(data.revenue.paid);
    document.getElementById('dash-revenue-open').textContent = formatCurrency(data.revenue.open);
    document.getElementById('dash-revenue-overdue').textContent = formatCurrency(data.revenue.overdue);

    // Update activities
    const activitiesContainer = document.getElementById('dash-activities');
    if (data.activities && data.activities.length > 0) {
      activitiesContainer.innerHTML = data.activities.map(activity => `
        <div class="activity-item">
          <div class="activity-icon">
            <i class="fas ${getActivityIcon(activity.type)}"></i>
          </div>
          <div class="activity-content">
            <div class="activity-text">${escapeHtml(activity.description)}</div>
            <div class="activity-time">${formatDateTime(activity.created_at)}</div>
          </div>
        </div>
      `).join('');
    } else {
      activitiesContainer.innerHTML = '<p class="empty-text">Keine Aktivitäten vorhanden</p>';
    }
  } catch (e) {
    console.error('Error loading dashboard:', e);
  }
}

function formatCurrency(amount) {
  return (amount || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function getActivityIcon(type) {
  const icons = {
    'invoice_created': 'fa-file-invoice',
    'project_created': 'fa-folder-plus',
    'customer_registered': 'fa-user-plus',
    'request_received': 'fa-inbox',
    'status_changed': 'fa-sync-alt'
  };
  return icons[type] || 'fa-circle';
}

// Backup download
document.getElementById('backup-db-btn')?.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/backup', { credentials: 'include' });
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-backup-${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      showToast('Backup erfolgreich erstellt!', 'success');
    } else {
      showToast('Fehler beim Erstellen des Backups', 'error');
    }
  } catch (e) {
    showToast('Fehler beim Erstellen des Backups', 'error');
  }
});

// ==================== INVOICE ARCHIVE ====================
let allInvoices = [];

async function loadInvoiceArchive() {
  try {
    allInvoices = await api('/invoices');
    renderInvoiceArchive(allInvoices);
  } catch (e) {
    console.error('Error loading invoices:', e);
  }
}

function renderInvoiceArchive(invoices) {
  const container = document.getElementById('invoice-archive-list');
  if (!container) return;

  if (invoices.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-invoice"></i>
        <h3>Keine Rechnungen vorhanden</h3>
        <p>Erstelle deine erste Rechnung im Rechnungsgenerator.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = invoices.map(inv => `
    <div class="invoice-archive-item ${inv.status}">
      <div class="invoice-info">
        <h4>${escapeHtml(inv.invoice_number)}</h4>
        <p>${escapeHtml(inv.customer_name)}</p>
        <span class="invoice-date">${formatDate(inv.created_at)}</span>
      </div>
      <div class="invoice-amount">
        <span class="amount">${formatCurrency(inv.total)}</span>
        <span class="status-badge ${inv.status}">${getInvoiceStatusLabel(inv.status)}</span>
      </div>
      <div class="invoice-actions">
        <select onchange="updateInvoiceStatus(${inv.id}, this.value)" class="status-select">
          <option value="offen" ${inv.status === 'offen' ? 'selected' : ''}>Offen</option>
          <option value="bezahlt" ${inv.status === 'bezahlt' ? 'selected' : ''}>Bezahlt</option>
          <option value="überfällig" ${inv.status === 'überfällig' ? 'selected' : ''}>Überfällig</option>
        </select>
        <button class="btn-icon danger" onclick="deleteInvoice(${inv.id})" title="Löschen">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

async function updateInvoiceStatus(id, status) {
  try {
    const paidDate = status === 'bezahlt' ? new Date().toISOString() : null;
    await api(`/invoices/${id}`, {
      method: 'PUT',
      body: { status, paid_date: paidDate }
    });
    showToast('Status aktualisiert!', 'success');
    loadInvoiceArchive();
    loadDashboard();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteInvoice(id) {
  if (!confirm('Möchtest du diese Rechnung wirklich löschen?')) return;

  try {
    await api(`/invoices/${id}`, { method: 'DELETE' });
    showToast('Rechnung gelöscht!', 'success');
    loadInvoiceArchive();
    loadDashboard();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function getInvoiceStatusLabel(status) {
  const labels = {
    'offen': 'Offen',
    'bezahlt': 'Bezahlt',
    'überfällig': 'Überfällig'
  };
  return labels[status] || status;
}

// Save invoice to archive
async function saveInvoiceToArchive() {
  const data = getInvoiceData();

  if (!data.to.name) {
    showToast('Bitte Kundenname eingeben', 'error');
    return;
  }

  try {
    await api('/invoices', {
      method: 'POST',
      body: {
        invoice_number: data.number,
        customer_name: data.to.name,
        customer_address: data.to.address,
        amount: data.subtotal,
        tax: data.tax,
        total: data.total,
        due_date: data.dueDate,
        notes: data.notes,
        items: data.items
      }
    });
    showToast('Rechnung gespeichert!', 'success');
    loadDashboard();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ==================== INVOICE TABS ====================
let invoiceTabsInitialized = false;

function initInvoiceTabs() {
  if (invoiceTabsInitialized) return;

  // Only select invoice tabs within the invoices section, not contract tabs
  const invoiceSection = document.getElementById('section-invoices');
  if (!invoiceSection) return;

  const tabs = invoiceSection.querySelectorAll('.invoice-tab[data-tab]');
  const tabContents = invoiceSection.querySelectorAll('.invoice-tab-content');

  if (tabs.length === 0) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      if (!targetTab) return;

      // Update active tab button (only within invoice section)
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show target tab content
      tabContents.forEach(content => content.classList.remove('active'));
      const targetContent = document.getElementById(`invoice-${targetTab}-tab`);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      // Load archive data when switching to archive tab
      if (targetTab === 'archive') {
        loadInvoiceArchive();
        updateArchiveStats();
      }

      // Initialize quote when switching to quote tab
      if (targetTab === 'quote') {
        initQuote();
      }
    });
  });

  // Save invoice button
  document.getElementById('save-invoice-btn')?.addEventListener('click', saveInvoiceToArchive);

  // Invoice search
  document.getElementById('invoice-search')?.addEventListener('input', filterInvoices);

  // Invoice status filter
  document.getElementById('invoice-status-filter')?.addEventListener('change', filterInvoices);

  invoiceTabsInitialized = true;
}

// ==================== QUOTE GENERATOR ====================
function initQuote() {
  // Set default date
  const dateInput = document.getElementById('quote-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Generate quote number
  const numberInput = document.getElementById('quote-number');
  if (numberInput && !numberInput.value) {
    const year = new Date().getFullYear();
    numberInput.value = `A-${year}-001`;
  }

  // Load saved sender data from localStorage
  const savedSender = localStorage.getItem('invoiceSender');
  if (savedSender) {
    const sender = JSON.parse(savedSender);
    const fromName = document.getElementById('quote-from-name');
    const fromAddress = document.getElementById('quote-from-address');
    const fromEmail = document.getElementById('quote-from-email');
    const fromPhone = document.getElementById('quote-from-phone');

    if (fromName && !fromName.value) fromName.value = sender.name || '';
    if (fromAddress && !fromAddress.value) fromAddress.value = sender.address || '';
    if (fromEmail && !fromEmail.value) fromEmail.value = sender.email || '';
    if (fromPhone && !fromPhone.value) fromPhone.value = sender.phone || '';
  }

  // Event listeners (only add once)
  if (!document.getElementById('add-quote-item')?.dataset.initialized) {
    document.getElementById('add-quote-item')?.addEventListener('click', addQuoteItem);
    document.getElementById('download-quote-btn')?.addEventListener('click', downloadQuote);

    // Remove item handler
    document.getElementById('quote-items')?.addEventListener('click', (e) => {
      if (e.target.closest('.remove-quote-item')) {
        const items = document.querySelectorAll('#quote-items .invoice-item');
        if (items.length > 1) {
          e.target.closest('.invoice-item').remove();
          updateQuotePreview();
        }
      }
    });

    // Update preview on input change
    const formPanel = document.querySelector('#invoice-quote-tab .invoice-form-panel');
    if (formPanel) {
      formPanel.addEventListener('input', updateQuotePreview);
    }

    document.getElementById('add-quote-item').dataset.initialized = 'true';
  }

  updateQuotePreview();
}

function addQuoteItem() {
  const container = document.getElementById('quote-items');
  const newItem = document.createElement('div');
  newItem.className = 'invoice-item';
  newItem.innerHTML = `
    <div class="form-row">
      <div class="form-group" style="flex: 3;">
        <label>Leistung</label>
        <input type="text" class="quote-item-desc" placeholder="z.B. Entwicklung">
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Stunden</label>
        <input type="number" class="quote-item-hours" value="0" min="0">
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Stundensatz</label>
        <input type="number" class="quote-item-rate" value="75" step="0.01" min="0">
      </div>
      <button type="button" class="btn-icon danger remove-quote-item" style="align-self: flex-end; margin-bottom: 16px;">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;
  container.appendChild(newItem);
  updateQuotePreview();
}

function getQuoteData() {
  const items = [];
  document.querySelectorAll('#quote-items .invoice-item').forEach(item => {
    const desc = item.querySelector('.quote-item-desc')?.value || '';
    const hours = parseFloat(item.querySelector('.quote-item-hours')?.value) || 0;
    const rate = parseFloat(item.querySelector('.quote-item-rate')?.value) || 0;
    if (desc || hours > 0) {
      items.push({ desc, hours, rate, total: hours * rate });
    }
  });

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const isKleinunternehmer = document.getElementById('quote-kleinunternehmer')?.checked ?? true;
  const taxRate = isKleinunternehmer ? 0 : 0.19;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const validityDays = parseInt(document.getElementById('quote-validity')?.value) || 30;
  const quoteDate = new Date(document.getElementById('quote-date')?.value || new Date());
  const validUntil = new Date(quoteDate);
  validUntil.setDate(validUntil.getDate() + validityDays);

  return {
    number: document.getElementById('quote-number')?.value || '-',
    date: document.getElementById('quote-date')?.value,
    validUntil: validUntil.toISOString().split('T')[0],
    from: {
      name: document.getElementById('quote-from-name')?.value || '',
      address: document.getElementById('quote-from-address')?.value || '',
      email: document.getElementById('quote-from-email')?.value || '',
      phone: document.getElementById('quote-from-phone')?.value || ''
    },
    to: {
      name: document.getElementById('quote-to-name')?.value || '',
      address: document.getElementById('quote-to-address')?.value || ''
    },
    project: {
      title: document.getElementById('quote-project-title')?.value || '',
      description: document.getElementById('quote-project-description')?.value || ''
    },
    duration: document.getElementById('quote-duration')?.value || '',
    startDate: document.getElementById('quote-start-date')?.value || '',
    items,
    subtotal,
    taxRate,
    tax,
    total,
    isKleinunternehmer,
    notes: document.getElementById('quote-notes')?.value || ''
  };
}

function updateQuotePreview() {
  const data = getQuoteData();
  const preview = document.getElementById('quote-preview');
  if (!preview) return;

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('de-DE');
  };

  const formatCurrencyLocal = (amount) => {
    return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  const totalHours = data.items.reduce((sum, item) => sum + item.hours, 0);

  preview.innerHTML = `
    <div class="invoice-document quote-document">
      <div class="invoice-header">
        <div>
          <div class="invoice-title" style="color: var(--accent-secondary);">ANGEBOT</div>
          <div class="invoice-meta">
            <div><strong>Angebotsnr.:</strong> ${escapeHtml(data.number)}</div>
            <div><strong>Datum:</strong> ${formatDate(data.date)}</div>
            <div><strong>Gültig bis:</strong> ${formatDate(data.validUntil)}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <img src="/logo.png" alt="Mas0n1x" class="invoice-logo">
          ${data.from.name ? `<div class="party-name">${escapeHtml(data.from.name)}</div>` : ''}
          ${data.from.address ? `<div class="party-address">${escapeHtml(data.from.address)}</div>` : ''}
          ${data.from.email ? `<div>${escapeHtml(data.from.email)}</div>` : ''}
          ${data.from.phone ? `<div>${escapeHtml(data.from.phone)}</div>` : ''}
        </div>
      </div>

      <div class="invoice-parties">
        <div>
          <div class="party-label">Angebot für</div>
          ${data.to.name ? `<div class="party-name">${escapeHtml(data.to.name)}</div>` : '<div class="party-name" style="color: #ccc;">Kunde</div>'}
          ${data.to.address ? `<div class="party-address">${escapeHtml(data.to.address)}</div>` : ''}
        </div>
      </div>

      ${data.project.title ? `
        <div class="quote-project-section">
          <h3 style="margin-bottom: 10px; color: var(--accent-secondary);">Projekt: ${escapeHtml(data.project.title)}</h3>
          ${data.project.description ? `<p style="color: #666; white-space: pre-line;">${escapeHtml(data.project.description)}</p>` : ''}
        </div>
      ` : ''}

      <table class="invoice-table">
        <thead>
          <tr>
            <th>Pos.</th>
            <th>Leistung</th>
            <th class="text-right">Stunden</th>
            <th class="text-right">Stundensatz</th>
            <th class="text-right">Gesamt</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.length > 0 ? data.items.map((item, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(item.desc) || '-'}</td>
              <td class="text-right">${item.hours}h</td>
              <td class="text-right">${formatCurrencyLocal(item.rate)}</td>
              <td class="text-right">${formatCurrencyLocal(item.total)}</td>
            </tr>
          `).join('') : '<tr><td colspan="5" style="text-align: center; color: #999;">Keine Positionen</td></tr>'}
        </tbody>
      </table>

      <div class="invoice-total">
        <div class="total-box">
          <div class="total-row">
            <span>Geschätzte Stunden gesamt</span>
            <span>${totalHours}h</span>
          </div>
          <div class="total-row">
            <span>Zwischensumme</span>
            <span>${formatCurrencyLocal(data.subtotal)}</span>
          </div>
          ${!data.isKleinunternehmer ? `
            <div class="total-row">
              <span>MwSt. (19%)</span>
              <span>${formatCurrencyLocal(data.tax)}</span>
            </div>
          ` : ''}
          <div class="total-row grand-total" style="border-color: var(--accent-secondary);">
            <span>Geschätzter Gesamtpreis</span>
            <span>${formatCurrencyLocal(data.total)}</span>
          </div>
        </div>
      </div>

      <div class="invoice-footer">
        ${(data.duration || data.startDate) ? `
          <div class="quote-timeline" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <h4 style="margin-bottom: 10px;"><i class="fas fa-calendar"></i> Zeitrahmen</h4>
            ${data.duration ? `<p><strong>Geschätzte Dauer:</strong> ${escapeHtml(data.duration)}</p>` : ''}
            ${data.startDate ? `<p><strong>Frühester Starttermin:</strong> ${formatDate(data.startDate)}</p>` : ''}
          </div>
        ` : ''}

        ${data.notes ? `<div class="invoice-notes" style="margin-bottom: 20px;">${escapeHtml(data.notes)}</div>` : ''}

        ${data.isKleinunternehmer ? `
          <div class="kleinunternehmer-notice">
            Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).
          </div>
        ` : ''}

        <div class="quote-disclaimer" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 11px; color: #888;">
          <p>Dieses Angebot ist freibleibend und unverbindlich. Der tatsächliche Aufwand kann je nach Projektanforderungen abweichen. Dieses Angebot ist gültig bis zum ${formatDate(data.validUntil)}.</p>
        </div>
      </div>
    </div>
  `;
}

function downloadQuote() {
  const data = getQuoteData();
  const preview = document.getElementById('quote-preview');

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Angebot ${escapeHtml(data.number)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.5; color: #000; padding: 40px; }
        .invoice-header { display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #00d4ff; }
        .invoice-logo { width: 80px; height: 80px; object-fit: contain; margin-bottom: 12px; border-radius: 12px; }
        .invoice-title { font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #00d4ff; }
        .invoice-meta { color: #666; font-size: 11px; }
        .invoice-meta div { margin-bottom: 4px; }
        .invoice-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
        .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
        .party-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
        .party-address { white-space: pre-line; color: #444; }
        .quote-project-section { margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; }
        .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .invoice-table th { background: #f5f5f5; padding: 12px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #ddd; }
        .invoice-table td { padding: 12px; border-bottom: 1px solid #eee; }
        .text-right { text-align: right; }
        .invoice-total { display: flex; justify-content: flex-end; margin-bottom: 40px; }
        .total-box { width: 280px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .grand-total { font-weight: 700; font-size: 16px; border-bottom: 2px solid #00d4ff; padding: 12px 0; margin-top: 8px; }
        .invoice-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
        .quote-timeline { margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; }
        .invoice-notes { font-size: 11px; color: #666; font-style: italic; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; white-space: pre-line; }
        .kleinunternehmer-notice { font-size: 10px; color: #888; margin-top: 10px; }
        .quote-disclaimer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 11px; color: #888; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      ${preview.innerHTML}
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function filterInvoices() {
  const searchTerm = document.getElementById('invoice-search')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('invoice-status-filter')?.value || '';

  let filtered = allInvoices;

  if (searchTerm) {
    filtered = filtered.filter(inv =>
      inv.invoice_number.toLowerCase().includes(searchTerm) ||
      inv.customer_name.toLowerCase().includes(searchTerm) ||
      inv.total.toString().includes(searchTerm)
    );
  }

  if (statusFilter) {
    filtered = filtered.filter(inv => inv.status === statusFilter);
  }

  renderInvoiceArchive(filtered);
}

function updateArchiveStats() {
  const totalCount = allInvoices.length;
  const paidAmount = allInvoices.filter(i => i.status === 'bezahlt').reduce((sum, i) => sum + (i.total || 0), 0);
  const openAmount = allInvoices.filter(i => i.status === 'offen').reduce((sum, i) => sum + (i.total || 0), 0);
  const overdueAmount = allInvoices.filter(i => i.status === 'überfällig').reduce((sum, i) => sum + (i.total || 0), 0);

  const el = (id) => document.getElementById(id);
  if (el('archive-total-count')) el('archive-total-count').textContent = totalCount;
  if (el('archive-paid-amount')) el('archive-paid-amount').textContent = formatCurrency(paidAmount);
  if (el('archive-open-amount')) el('archive-open-amount').textContent = formatCurrency(openAmount);
  if (el('archive-overdue-amount')) el('archive-overdue-amount').textContent = formatCurrency(overdueAmount);
}

// ==================== INIT ====================
checkAuth();

// Initialize sections when shown
document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.section === 'dashboard') {
      loadDashboard();
    }
    if (item.dataset.section === 'invoices') {
      setTimeout(() => {
        initInvoice();
        initInvoiceTabs();
      }, 100);
    }
    if (item.dataset.section === 'legal') {
      loadLegalSettings();
    }
    if (item.dataset.section === 'customers') {
      loadCustomers();
    }
    if (item.dataset.section === 'calendar') {
      initCalendar();
    }
    if (item.dataset.section === 'settings') {
      loadEmailSettings();
    }
  });
});

// ==================== EMAIL SETTINGS ====================
async function loadEmailSettings() {
  try {
    const settings = await api('/settings');

    document.getElementById('email-enabled').checked = settings.email_enabled === 'true';
    document.getElementById('smtp-host').value = settings.smtp_host || '';
    document.getElementById('smtp-port').value = settings.smtp_port || '587';
    document.getElementById('smtp-user').value = settings.smtp_user || '';
    document.getElementById('smtp-pass').value = settings.smtp_pass || '';
    document.getElementById('smtp-from-name').value = settings.smtp_from_name || '';

    document.getElementById('notify-new-message').checked = settings.notify_new_message !== 'false';
    document.getElementById('notify-new-request').checked = settings.notify_new_request !== 'false';
    document.getElementById('notify-status-change').checked = settings.notify_status_change !== 'false';
    document.getElementById('notify-deadline-reminder').checked = settings.notify_deadline_reminder === 'true';

    toggleEmailSettings();
  } catch (e) {
    // Settings not found, use defaults
    toggleEmailSettings();
  }
}

function toggleEmailSettings() {
  const enabled = document.getElementById('email-enabled')?.checked;
  const container = document.getElementById('email-settings-container');
  if (container) {
    container.style.opacity = enabled ? '1' : '0.5';
    container.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

document.getElementById('email-enabled')?.addEventListener('change', toggleEmailSettings);

document.getElementById('save-email-settings-btn')?.addEventListener('click', async () => {
  const emailSettings = {
    email_enabled: document.getElementById('email-enabled').checked.toString(),
    smtp_host: document.getElementById('smtp-host').value,
    smtp_port: document.getElementById('smtp-port').value,
    smtp_user: document.getElementById('smtp-user').value,
    smtp_pass: document.getElementById('smtp-pass').value,
    smtp_from_name: document.getElementById('smtp-from-name').value,
    notify_new_message: document.getElementById('notify-new-message').checked.toString(),
    notify_new_request: document.getElementById('notify-new-request').checked.toString(),
    notify_status_change: document.getElementById('notify-status-change').checked.toString(),
    notify_deadline_reminder: document.getElementById('notify-deadline-reminder').checked.toString()
  };

  try {
    await api('/settings', {
      method: 'POST',
      body: emailSettings
    });
    showToast('E-Mail-Einstellungen gespeichert!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
});

document.getElementById('test-email-btn')?.addEventListener('click', async () => {
  const smtpUser = document.getElementById('smtp-user').value;
  if (!smtpUser) {
    showToast('Bitte zuerst E-Mail-Adresse eingeben', 'warning');
    return;
  }

  try {
    await api('/email/test', {
      method: 'POST',
      body: { to: smtpUser }
    });
    showToast('Test-E-Mail wurde gesendet!', 'success');
  } catch (e) {
    showToast(e.message || 'Fehler beim Senden der Test-E-Mail', 'error');
  }
});

// ==================== CALENDAR ====================
let calendarDate = new Date();
let calendarDeadlines = [];

async function initCalendar() {
  await loadCalendarDeadlines();
  renderCalendar();
  renderUpcomingDeadlines();

  // Event listeners
  document.getElementById('calendar-prev')?.addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById('calendar-next')?.addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
  });

  document.getElementById('calendar-today-btn')?.addEventListener('click', () => {
    calendarDate = new Date();
    renderCalendar();
  });
}

async function loadCalendarDeadlines() {
  try {
    const requests = await api('/admin/requests');
    calendarDeadlines = requests
      .filter(r => r.deadline && r.status !== 'completed' && r.status !== 'cancelled')
      .map(r => ({
        id: r.id,
        date: r.deadline,
        title: getProjectTypeLabel(r.project_type),
        email: r.email,
        status: r.status,
        progress: r.progress || 0
      }));
  } catch (e) {
    console.error('Error loading deadlines:', e);
    calendarDeadlines = [];
  }
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  // Update header
  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  document.getElementById('calendar-month-year').textContent = `${monthNames[month]} ${year}`;

  // Calculate calendar days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);

  // Adjust to start from Monday (0 = Monday, 6 = Sunday)
  const dayOfWeek = firstDay.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startDate.setDate(startDate.getDate() - daysToSubtract);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = '';
  const currentDate = new Date(startDate);

  // Generate 6 weeks of days
  for (let week = 0; week < 6; week++) {
    for (let day = 0; day < 7; day++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isToday = currentDate.getTime() === today.getTime();
      const isOtherMonth = currentDate.getMonth() !== month;
      const isWeekend = day >= 5;

      // Find events for this day
      const dayEvents = calendarDeadlines.filter(d => d.date === dateStr);

      let classes = ['calendar-day'];
      if (isToday) classes.push('today');
      if (isOtherMonth) classes.push('other-month');
      if (isWeekend) classes.push('weekend');

      html += `
        <div class="${classes.join(' ')}" data-date="${dateStr}">
          <div class="day-number">${currentDate.getDate()}</div>
          <div class="day-events">
            ${dayEvents.slice(0, 2).map(event => {
              const eventDate = new Date(event.date);
              let eventClass = '';
              const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
              if (daysUntil < 0) eventClass = 'danger';
              else if (daysUntil <= 3) eventClass = 'warning';
              return `<div class="day-event ${eventClass}" title="${event.title}">${event.title}</div>`;
            }).join('')}
            ${dayEvents.length > 2 ? `<div class="day-more">+${dayEvents.length - 2} mehr</div>` : ''}
          </div>
        </div>
      `;

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  grid.innerHTML = html;

  // Add click handlers to days
  grid.querySelectorAll('.calendar-day').forEach(dayEl => {
    dayEl.addEventListener('click', () => {
      const date = dayEl.dataset.date;
      const events = calendarDeadlines.filter(d => d.date === date);
      if (events.length > 0) {
        // Navigate to first event's request
        openRequestDetail(events[0].id);
      }
    });
  });
}

function renderUpcomingDeadlines() {
  const container = document.getElementById('upcoming-deadlines-list');
  if (!container) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sort by date and filter future/recent deadlines
  const upcoming = [...calendarDeadlines]
    .map(d => {
      const deadlineDate = new Date(d.date);
      const daysUntil = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
      return { ...d, daysUntil, deadlineDate };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 10);

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="empty-deadlines">
        <i class="fas fa-calendar-check"></i>
        <p>Keine anstehenden Deadlines</p>
      </div>
    `;
    return;
  }

  const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  container.innerHTML = upcoming.map(deadline => {
    let itemClass = '';
    let statusClass = '';
    let statusText = '';

    if (deadline.daysUntil < 0) {
      itemClass = 'overdue';
      statusClass = 'overdue';
      statusText = `${Math.abs(deadline.daysUntil)} Tage überfällig`;
    } else if (deadline.daysUntil === 0) {
      itemClass = 'soon';
      statusClass = 'soon';
      statusText = 'Heute fällig';
    } else if (deadline.daysUntil <= 3) {
      itemClass = 'soon';
      statusClass = 'soon';
      statusText = `In ${deadline.daysUntil} Tag${deadline.daysUntil > 1 ? 'en' : ''}`;
    } else {
      statusClass = 'upcoming';
      statusText = `In ${deadline.daysUntil} Tagen`;
    }

    return `
      <div class="deadline-item ${itemClass}" onclick="openRequestDetail(${deadline.id})">
        <div class="deadline-date">
          <span class="day">${deadline.deadlineDate.getDate()}</span>
          <span class="month">${monthNames[deadline.deadlineDate.getMonth()]}</span>
        </div>
        <div class="deadline-info">
          <h4>${escapeHtml(deadline.title)}</h4>
          <p>${escapeHtml(deadline.email)}</p>
        </div>
        <span class="deadline-status ${statusClass}">${statusText}</span>
      </div>
    `;
  }).join('');
}

// ==================== REVIEWS / TESTIMONIALS ====================
let allReviews = [];

async function loadReviews() {
  try {
    allReviews = await api('/admin/reviews');
    renderReviews(allReviews);
    updateReviewStats(allReviews);
  } catch (e) {
    console.error('Error loading reviews:', e);
    const container = document.getElementById('reviews-list');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-star"></i>
          <h3>Keine Bewertungen vorhanden</h3>
          <p>Bewertungen von Kunden werden hier angezeigt.</p>
        </div>
      `;
    }
  }
}

function updateReviewStats(reviews) {
  const totalEl = document.getElementById('total-reviews');
  const pendingEl = document.getElementById('pending-reviews');
  const avgEl = document.getElementById('avg-rating');

  if (totalEl) totalEl.textContent = reviews.length;
  if (pendingEl) pendingEl.textContent = reviews.filter(r => !r.is_approved).length;

  if (avgEl) {
    const avg = reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : '-';
    avgEl.textContent = avg;
  }
}

function renderReviews(reviews) {
  const container = document.getElementById('reviews-list');
  if (!container) return;

  if (reviews.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-star"></i>
        <h3>Keine Bewertungen vorhanden</h3>
        <p>Bewertungen von Kunden werden hier angezeigt.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = reviews.map(review => {
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const statusClass = review.is_approved ? 'approved' : 'pending';
    const publicBadge = review.is_public ? '<span class="badge public">Öffentlich</span>' : '';

    return `
      <div class="review-card ${statusClass}">
        <div class="review-header">
          <div class="review-stars">${stars}</div>
          <div class="review-badges">
            ${publicBadge}
            <span class="badge ${statusClass}">${review.is_approved ? 'Genehmigt' : 'Ausstehend'}</span>
          </div>
        </div>
        <h4 class="review-title">${escapeHtml(review.title || 'Bewertung')}</h4>
        <p class="review-content">${escapeHtml(review.content || '')}</p>
        <div class="review-meta">
          <span><i class="fas fa-user"></i> ${escapeHtml(review.customer_name || 'Kunde')}</span>
          <span><i class="fas fa-calendar"></i> ${formatDate(review.created_at)}</span>
        </div>
        <div class="review-actions">
          ${!review.is_approved ? `
            <button class="btn btn-small btn-primary" onclick="approveReview(${review.id})">
              <i class="fas fa-check"></i> Genehmigen
            </button>
          ` : ''}
          <button class="btn btn-small ${review.is_public ? 'btn-secondary' : 'btn-primary'}"
                  onclick="toggleReviewPublic(${review.id}, ${!review.is_public})">
            <i class="fas fa-${review.is_public ? 'eye-slash' : 'eye'}"></i>
            ${review.is_public ? 'Verbergen' : 'Veröffentlichen'}
          </button>
          <button class="btn btn-small btn-danger" onclick="deleteReview(${review.id})">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function approveReview(id) {
  try {
    await api(`/admin/reviews/${id}`, {
      method: 'PUT',
      body: { is_approved: 1 }
    });
    showToast('Bewertung genehmigt!', 'success');
    loadReviews();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function toggleReviewPublic(id, isPublic) {
  try {
    await api(`/admin/reviews/${id}`, {
      method: 'PUT',
      body: { is_public: isPublic ? 1 : 0 }
    });
    showToast(isPublic ? 'Bewertung veröffentlicht!' : 'Bewertung verborgen!', 'success');
    loadReviews();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteReview(id) {
  if (!confirm('Möchtest du diese Bewertung wirklich löschen?')) return;

  try {
    await api(`/admin/reviews/${id}`, { method: 'DELETE' });
    showToast('Bewertung gelöscht!', 'success');
    loadReviews();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ==================== MESSAGE TEMPLATES ====================
let allTemplates = [];

async function loadTemplates() {
  try {
    allTemplates = await api('/admin/templates');
    renderTemplates(allTemplates);
    updateTemplateStats(allTemplates);
  } catch (e) {
    console.error('Error loading templates:', e);
    const container = document.getElementById('templates-list');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-file-alt"></i>
          <h3>Keine Vorlagen vorhanden</h3>
          <p>Erstelle Vorlagen für häufige Nachrichtenantworten.</p>
        </div>
      `;
    }
  }
}

function updateTemplateStats(templates) {
  const totalEl = document.getElementById('total-templates');
  if (totalEl) totalEl.textContent = templates.length;

  const categories = [...new Set(templates.map(t => t.category))];
  const catEl = document.getElementById('template-categories');
  if (catEl) catEl.textContent = categories.length;
}

function renderTemplates(templates) {
  const container = document.getElementById('templates-list');
  if (!container) return;

  if (templates.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-alt"></i>
        <h3>Keine Vorlagen vorhanden</h3>
        <p>Erstelle Vorlagen für häufige Nachrichtenantworten.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = templates.map(template => `
    <div class="template-card" data-template-id="${template.id}">
      <div class="template-header">
        <h4>${escapeHtml(template.name)}</h4>
        <span class="template-category">${escapeHtml(template.category || 'Allgemein')}</span>
      </div>
      ${template.subject ? `<div class="template-subject"><strong>Betreff:</strong> ${escapeHtml(template.subject)}</div>` : ''}
      <p class="template-preview">${escapeHtml(template.content.substring(0, 150))}${template.content.length > 150 ? '...' : ''}</p>
      <div class="template-actions">
        <button class="btn btn-small btn-primary" onclick="copyTemplate(${template.id})">
          <i class="fas fa-copy"></i> Kopieren
        </button>
        <button class="btn btn-small btn-secondary" onclick="editTemplate(${template.id})">
          <i class="fas fa-edit"></i> Bearbeiten
        </button>
        <button class="btn btn-small btn-danger" onclick="deleteTemplate(${template.id})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function copyTemplate(id) {
  const template = allTemplates.find(t => t.id === id);
  if (template) {
    navigator.clipboard.writeText(template.content);
    showToast('Vorlage in Zwischenablage kopiert!', 'success');
  }
}

function openNewTemplateModal() {
  document.getElementById('template-modal-title').textContent = 'Neue Vorlage';
  document.getElementById('template-id').value = '';
  document.getElementById('template-name').value = '';
  document.getElementById('template-subject').value = '';
  document.getElementById('template-category').value = 'general';
  document.getElementById('template-content').value = '';
  document.getElementById('template-modal').classList.add('active');
}

async function editTemplate(id) {
  const template = allTemplates.find(t => t.id === id);
  if (!template) return;

  document.getElementById('template-modal-title').textContent = 'Vorlage bearbeiten';
  document.getElementById('template-id').value = template.id;
  document.getElementById('template-name').value = template.name;
  document.getElementById('template-subject').value = template.subject || '';
  document.getElementById('template-category').value = template.category || 'general';
  document.getElementById('template-content').value = template.content;
  document.getElementById('template-modal').classList.add('active');
}

async function saveTemplate() {
  const id = document.getElementById('template-id').value;
  const name = document.getElementById('template-name').value.trim();
  const subject = document.getElementById('template-subject').value.trim();
  const category = document.getElementById('template-category').value;
  const content = document.getElementById('template-content').value.trim();

  if (!name || !content) {
    showToast('Bitte Name und Inhalt eingeben', 'warning');
    return;
  }

  try {
    if (id) {
      await api(`/admin/templates/${id}`, {
        method: 'PUT',
        body: { name, subject, category, content }
      });
      showToast('Vorlage aktualisiert!', 'success');
    } else {
      await api('/admin/templates', {
        method: 'POST',
        body: { name, subject, category, content }
      });
      showToast('Vorlage erstellt!', 'success');
    }

    document.getElementById('template-modal').classList.remove('active');
    loadTemplates();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteTemplate(id) {
  if (!confirm('Möchtest du diese Vorlage wirklich löschen?')) return;

  try {
    await api(`/admin/templates/${id}`, { method: 'DELETE' });
    showToast('Vorlage gelöscht!', 'success');
    loadTemplates();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// Template modal event listeners
document.getElementById('add-template-btn')?.addEventListener('click', openNewTemplateModal);
document.getElementById('save-template-btn')?.addEventListener('click', saveTemplate);
document.querySelector('#template-modal .modal-close')?.addEventListener('click', () => {
  document.getElementById('template-modal').classList.remove('active');
});
document.getElementById('template-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'template-modal') {
    document.getElementById('template-modal').classList.remove('active');
  }
});

// ==================== FAQ MANAGEMENT ====================
let allFaqs = [];
const loadAdminFAQs = () => loadFaqs(); // Alias for navigation

async function loadFaqs() {
  try {
    allFaqs = await api('/admin/faqs');
    renderFaqs(allFaqs);
    updateFaqStats(allFaqs);
  } catch (e) {
    console.error('Error loading FAQs:', e);
    const container = document.getElementById('faq-list');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-question-circle"></i>
          <h3>Keine FAQs vorhanden</h3>
          <p>Erstelle FAQs für dein Portfolio.</p>
        </div>
      `;
    }
  }
}

function updateFaqStats(faqs) {
  const totalEl = document.getElementById('total-faqs');
  const activeEl = document.getElementById('active-faqs');

  if (totalEl) totalEl.textContent = faqs.length;
  if (activeEl) activeEl.textContent = faqs.filter(f => f.is_active).length;

  const categories = [...new Set(faqs.map(f => f.category))];
  const catEl = document.getElementById('faq-categories');
  if (catEl) catEl.textContent = categories.length;
}

function renderFaqs(faqs) {
  const container = document.getElementById('faq-list');
  if (!container) return;

  if (faqs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-question-circle"></i>
        <h3>Keine FAQs vorhanden</h3>
        <p>Erstelle FAQs für dein Portfolio.</p>
      </div>
    `;
    return;
  }

  // Group by category
  const grouped = {};
  faqs.forEach(faq => {
    const cat = faq.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(faq);
  });

  const categoryLabels = {
    'general': 'Allgemein',
    'services': 'Services',
    'pricing': 'Preise',
    'process': 'Ablauf',
    'technical': 'Technisch'
  };

  container.innerHTML = Object.entries(grouped).map(([category, categoryFaqs]) => `
    <div class="faq-category-section">
      <h3 class="faq-category-title">${categoryLabels[category] || category}</h3>
      ${categoryFaqs.sort((a, b) => a.sort_order - b.sort_order).map(faq => `
        <div class="faq-admin-item ${faq.is_active ? '' : 'inactive'}">
          <div class="faq-item-header">
            <div class="faq-drag-handle"><i class="fas fa-grip-vertical"></i></div>
            <span class="faq-question">${escapeHtml(faq.question)}</span>
            <span class="faq-status ${faq.is_active ? 'active' : 'inactive'}">
              ${faq.is_active ? 'Aktiv' : 'Inaktiv'}
            </span>
          </div>
          <div class="faq-answer-preview">${escapeHtml(faq.answer.substring(0, 100))}${faq.answer.length > 100 ? '...' : ''}</div>
          <div class="faq-actions">
            <button class="btn btn-small btn-secondary" onclick="toggleFaqActive(${faq.id}, ${!faq.is_active})">
              <i class="fas fa-${faq.is_active ? 'eye-slash' : 'eye'}"></i>
              ${faq.is_active ? 'Deaktivieren' : 'Aktivieren'}
            </button>
            <button class="btn btn-small btn-secondary" onclick="editFaq(${faq.id})">
              <i class="fas fa-edit"></i> Bearbeiten
            </button>
            <button class="btn btn-small btn-danger" onclick="deleteFaq(${faq.id})">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function openNewFaqModal() {
  document.getElementById('faq-modal-title').textContent = 'Neue FAQ';
  document.getElementById('faq-id').value = '';
  document.getElementById('faq-question').value = '';
  document.getElementById('faq-answer').value = '';
  document.getElementById('faq-category').value = 'general';
  document.getElementById('faq-sort-order').value = '0';
  document.getElementById('faq-active').checked = true;
  document.getElementById('faq-modal').classList.add('active');
}

async function editFaq(id) {
  const faq = allFaqs.find(f => f.id === id);
  if (!faq) return;

  document.getElementById('faq-modal-title').textContent = 'FAQ bearbeiten';
  document.getElementById('faq-id').value = faq.id;
  document.getElementById('faq-question').value = faq.question;
  document.getElementById('faq-answer').value = faq.answer;
  document.getElementById('faq-category').value = faq.category || 'general';
  document.getElementById('faq-sort-order').value = faq.sort_order || 0;
  document.getElementById('faq-active').checked = faq.is_active;
  document.getElementById('faq-modal').classList.add('active');
}

async function saveFaq() {
  const id = document.getElementById('faq-id').value;
  const question = document.getElementById('faq-question').value.trim();
  const answer = document.getElementById('faq-answer').value.trim();
  const category = document.getElementById('faq-category').value;
  const sort_order = parseInt(document.getElementById('faq-sort-order').value) || 0;
  const is_active = document.getElementById('faq-active').checked ? 1 : 0;

  if (!question || !answer) {
    showToast('Bitte Frage und Antwort eingeben', 'warning');
    return;
  }

  try {
    if (id) {
      await api(`/admin/faqs/${id}`, {
        method: 'PUT',
        body: { question, answer, category, sort_order, is_active }
      });
      showToast('FAQ aktualisiert!', 'success');
    } else {
      await api('/admin/faqs', {
        method: 'POST',
        body: { question, answer, category, sort_order, is_active }
      });
      showToast('FAQ erstellt!', 'success');
    }

    document.getElementById('faq-modal').classList.remove('active');
    loadFaqs();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function toggleFaqActive(id, isActive) {
  try {
    await api(`/admin/faqs/${id}`, {
      method: 'PUT',
      body: { is_active: isActive ? 1 : 0 }
    });
    showToast(isActive ? 'FAQ aktiviert!' : 'FAQ deaktiviert!', 'success');
    loadFaqs();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteFaq(id) {
  if (!confirm('Möchtest du diese FAQ wirklich löschen?')) return;

  try {
    await api(`/admin/faqs/${id}`, { method: 'DELETE' });
    showToast('FAQ gelöscht!', 'success');
    loadFaqs();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// FAQ modal event listeners
document.getElementById('add-faq-btn')?.addEventListener('click', openNewFaqModal);
document.getElementById('save-faq-btn')?.addEventListener('click', saveFaq);
document.querySelector('#faq-modal .modal-close')?.addEventListener('click', () => {
  document.getElementById('faq-modal').classList.remove('active');
});
document.getElementById('faq-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'faq-modal') {
    document.getElementById('faq-modal').classList.remove('active');
  }
});

// Initialize Reviews/Templates/FAQ sections when navigation clicked
document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  const existingHandler = item._sectionHandler;
  item.addEventListener('click', () => {
    if (item.dataset.section === 'reviews') {
      loadReviews();
    }
    if (item.dataset.section === 'templates') {
      loadTemplates();
    }
    if (item.dataset.section === 'faq' || item.dataset.section === 'faqs') {
      loadFaqs();
    }
    if (item.dataset.section === 'contracts') {
      loadContractTemplates();
      loadContracts();
    }
    if (item.dataset.section === 'skills') {
      loadSkills();
    }
    if (item.dataset.section === 'backups') {
      loadBackups();
      loadBackupSettings();
      loadEmailLogs();
    }
  });
});

// ==================== CONTRACT TEMPLATES ====================
let allContractTemplates = [];
let allContracts = [];

async function loadContractTemplates() {
  try {
    allContractTemplates = await api('/admin/contract-templates');
    renderContractTemplates(allContractTemplates);
    document.getElementById('total-contract-templates').textContent = allContractTemplates.length;
  } catch (e) {
    console.error('Error loading contract templates:', e);
  }
}

function renderContractTemplates(templates) {
  const container = document.getElementById('contract-templates-list');
  if (!container) return;

  if (templates.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-alt"></i>
        <h3>Keine Vertragsvorlagen vorhanden</h3>
        <p>Erstelle eine Vorlage um Verträge zu generieren.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = templates.map(template => `
    <div class="template-card" data-template-id="${template.id}">
      <div class="template-header">
        <h4>${escapeHtml(template.name)}</h4>
        <span class="template-category">${escapeHtml(template.type || 'Standard')}</span>
      </div>
      <p class="template-preview">${escapeHtml(template.content.substring(0, 200))}${template.content.length > 200 ? '...' : ''}</p>
      <div class="template-actions">
        <button class="btn btn-small btn-primary" onclick="openGenerateContractModal(${template.id})">
          <i class="fas fa-file-signature"></i> Generieren
        </button>
        <button class="btn btn-small btn-secondary" onclick="editContractTemplate(${template.id})">
          <i class="fas fa-edit"></i> Bearbeiten
        </button>
        <button class="btn btn-small btn-danger" onclick="deleteContractTemplate(${template.id})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

async function loadContracts() {
  try {
    allContracts = await api('/admin/contracts');
    renderContracts(allContracts);
    updateContractStats(allContracts);
  } catch (e) {
    console.error('Error loading contracts:', e);
  }
}

function updateContractStats(contracts) {
  document.getElementById('total-contracts').textContent = contracts.length;
  document.getElementById('draft-contracts').textContent = contracts.filter(c => c.status === 'draft').length;
  document.getElementById('signed-contracts').textContent = contracts.filter(c => c.status === 'signed').length;
}

function renderContracts(contracts) {
  const container = document.getElementById('contracts-list');
  if (!container) return;

  if (contracts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-signature"></i>
        <h3>Keine Verträge vorhanden</h3>
        <p>Generiere einen Vertrag aus einer Vorlage.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = contracts.map(contract => {
    const statusLabels = {
      'draft': 'Entwurf',
      'sent': 'Gesendet',
      'signed': 'Unterschrieben',
      'cancelled': 'Storniert'
    };

    return `
      <div class="contract-card">
        <div class="contract-header">
          <h4>${escapeHtml(contract.contract_number)}</h4>
          <span class="badge ${contract.status}">${statusLabels[contract.status] || contract.status}</span>
        </div>
        <div class="contract-info">
          <p><i class="fas fa-user"></i> ${escapeHtml(contract.customer_name || 'Unbekannt')}</p>
          <p><i class="fas fa-calendar"></i> ${formatDate(contract.created_at)}</p>
        </div>
        <div class="contract-actions">
          <select onchange="updateContractStatus(${contract.id}, this.value)" class="status-select">
            <option value="draft" ${contract.status === 'draft' ? 'selected' : ''}>Entwurf</option>
            <option value="sent" ${contract.status === 'sent' ? 'selected' : ''}>Gesendet</option>
            <option value="signed" ${contract.status === 'signed' ? 'selected' : ''}>Unterschrieben</option>
            <option value="cancelled" ${contract.status === 'cancelled' ? 'selected' : ''}>Storniert</option>
          </select>
          <button class="btn btn-small btn-secondary" onclick="viewContract(${contract.id})">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-small btn-danger" onclick="deleteContract(${contract.id})">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openNewContractTemplateModal() {
  document.getElementById('contract-template-modal-title').textContent = 'Neue Vertragsvorlage';
  document.getElementById('contract-template-id').value = '';
  document.getElementById('contract-template-name').value = '';
  document.getElementById('contract-template-type').value = 'standard';
  document.getElementById('contract-template-content').value = getDefaultContractTemplate();
  document.getElementById('contract-template-modal').classList.add('active');
}

function getDefaultContractTemplate() {
  return `DIENSTLEISTUNGSVERTRAG
Vertragsnummer: {{VERTRAGSNUMMER}}
Datum: {{DATUM}}

ZWISCHEN

{{ANBIETER_NAME}}
(nachfolgend "Auftragnehmer")

UND

{{KUNDE_NAME}}
{{KUNDE_FIRMA}}
E-Mail: {{KUNDE_EMAIL}}
(nachfolgend "Auftraggeber")

§1 VERTRAGSGEGENSTAND
Der Auftragnehmer erbringt folgende Leistungen:
Projektart: {{PROJEKT_TYP}}
Beschreibung: {{PROJEKT_BESCHREIBUNG}}

§2 VERGÜTUNG
Budget: {{PROJEKT_BUDGET}}
Die Zahlung erfolgt nach Vereinbarung.

§3 ZEITRAHMEN
Geplanter Zeitrahmen: {{PROJEKT_ZEITRAHMEN}}

§4 GEHEIMHALTUNG
Beide Parteien verpflichten sich zur Vertraulichkeit bezüglich aller im Rahmen dieses Vertrags erlangten Informationen.

§5 SCHLUSSBESTIMMUNGEN
Änderungen dieses Vertrages bedürfen der Schriftform.

_______________________          _______________________
Auftragnehmer                    Auftraggeber
{{ANBIETER_NAME}}                {{KUNDE_NAME}}`;
}

async function editContractTemplate(id) {
  const template = allContractTemplates.find(t => t.id === id);
  if (!template) return;

  document.getElementById('contract-template-modal-title').textContent = 'Vorlage bearbeiten';
  document.getElementById('contract-template-id').value = template.id;
  document.getElementById('contract-template-name').value = template.name;
  document.getElementById('contract-template-type').value = template.type || 'standard';
  document.getElementById('contract-template-content').value = template.content;
  document.getElementById('contract-template-modal').classList.add('active');
}

async function saveContractTemplate() {
  const id = document.getElementById('contract-template-id').value;
  const name = document.getElementById('contract-template-name').value.trim();
  const type = document.getElementById('contract-template-type').value;
  const content = document.getElementById('contract-template-content').value.trim();

  if (!name || !content) {
    showToast('Bitte Name und Inhalt eingeben', 'warning');
    return;
  }

  try {
    if (id) {
      await api(`/admin/contract-templates/${id}`, {
        method: 'PUT',
        body: { name, type, content }
      });
      showToast('Vorlage aktualisiert!', 'success');
    } else {
      await api('/admin/contract-templates', {
        method: 'POST',
        body: { name, type, content }
      });
      showToast('Vorlage erstellt!', 'success');
    }

    document.getElementById('contract-template-modal').classList.remove('active');
    loadContractTemplates();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteContractTemplate(id) {
  if (!confirm('Möchtest du diese Vorlage wirklich löschen?')) return;

  try {
    await api(`/admin/contract-templates/${id}`, { method: 'DELETE' });
    showToast('Vorlage gelöscht!', 'success');
    loadContractTemplates();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function insertPlaceholder(placeholder) {
  const textarea = document.getElementById('contract-template-content');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + placeholder + text.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
  textarea.focus();
}

async function openGenerateContractModal(templateId) {
  // Load customers
  const customers = await api('/customers');
  const customerSelect = document.getElementById('generate-customer-select');
  customerSelect.innerHTML = customers.map(c =>
    `<option value="${c.id}">${escapeHtml(c.name || c.email)}</option>`
  ).join('');

  // Load requests
  const requests = await api('/admin/requests');
  const requestSelect = document.getElementById('generate-request-select');
  requestSelect.innerHTML = '<option value="">-- Keine Anfrage --</option>' +
    requests.map(r =>
      `<option value="${r.id}">${escapeHtml(r.project_type)} - ${escapeHtml(r.email)}</option>`
    ).join('');

  // Set template
  const templateSelect = document.getElementById('generate-template-select');
  templateSelect.innerHTML = allContractTemplates.map(t =>
    `<option value="${t.id}" ${t.id === templateId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
  ).join('');

  document.getElementById('generate-contract-modal').classList.add('active');
}

async function generateContract() {
  const template_id = parseInt(document.getElementById('generate-template-select').value);
  const customer_id = parseInt(document.getElementById('generate-customer-select').value);
  const request_id = document.getElementById('generate-request-select').value;

  if (!template_id || !customer_id) {
    showToast('Bitte Vorlage und Kunde auswählen', 'warning');
    return;
  }

  try {
    const result = await api('/admin/contracts/generate', {
      method: 'POST',
      body: {
        template_id,
        customer_id,
        request_id: request_id ? parseInt(request_id) : null
      }
    });

    showToast(`Vertrag ${result.contract_number} erstellt!`, 'success');
    document.getElementById('generate-contract-modal').classList.remove('active');
    loadContracts();

    // Switch to contracts tab
    document.querySelector('[data-contract-tab="generated"]').click();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function updateContractStatus(id, status) {
  try {
    await api(`/admin/contracts/${id}`, {
      method: 'PUT',
      body: { status }
    });
    showToast('Status aktualisiert!', 'success');
    loadContracts();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function viewContract(id) {
  const contract = allContracts.find(c => c.id === id);
  if (!contract) return;

  // Open print window with contract content
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Vertrag ${escapeHtml(contract.contract_number)}</title>
      <style>
        body { font-family: 'Courier New', monospace; padding: 40px; white-space: pre-wrap; line-height: 1.6; }
      </style>
    </head>
    <body>${escapeHtml(contract.content)}</body>
    </html>
  `);
  printWindow.document.close();
}

async function deleteContract(id) {
  if (!confirm('Möchtest du diesen Vertrag wirklich löschen?')) return;

  try {
    await api(`/admin/contracts/${id}`, { method: 'DELETE' });
    showToast('Vertrag gelöscht!', 'success');
    loadContracts();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// Contract tabs
document.querySelectorAll('.contract-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.contract-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.contract-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const tabId = `contract-${tab.dataset.contractTab}-tab`;
    document.getElementById(tabId)?.classList.add('active');
  });
});

// Contract modal event listeners
document.getElementById('add-contract-template-btn')?.addEventListener('click', openNewContractTemplateModal);
document.getElementById('save-contract-template-btn')?.addEventListener('click', saveContractTemplate);
document.getElementById('generate-contract-btn')?.addEventListener('click', generateContract);

document.querySelector('#contract-template-modal .modal-close')?.addEventListener('click', () => {
  document.getElementById('contract-template-modal').classList.remove('active');
});
document.getElementById('contract-template-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'contract-template-modal') {
    document.getElementById('contract-template-modal').classList.remove('active');
  }
});
document.querySelector('#generate-contract-modal .modal-close')?.addEventListener('click', () => {
  document.getElementById('generate-contract-modal').classList.remove('active');
});
document.getElementById('generate-contract-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'generate-contract-modal') {
    document.getElementById('generate-contract-modal').classList.remove('active');
  }
});

// ==================== SKILLS MANAGEMENT ====================
let allSkills = [];

async function loadSkills() {
  try {
    allSkills = await api('/admin/skills');
    renderSkills(allSkills);
    updateSkillStats(allSkills);
  } catch (e) {
    console.error('Error loading skills:', e);
  }
}

function updateSkillStats(skills) {
  document.getElementById('total-skills').textContent = skills.length;
  const categories = [...new Set(skills.map(s => s.category))];
  document.getElementById('skill-categories-count').textContent = categories.length;
}

function renderSkills(skills) {
  const container = document.getElementById('skills-list');
  if (!container) return;

  if (skills.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-code"></i>
        <h3>Keine Skills vorhanden</h3>
        <p>Füge deine Technologien und Skills hinzu.</p>
      </div>
    `;
    return;
  }

  // Group by category
  const grouped = {};
  skills.forEach(skill => {
    const cat = skill.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(skill);
  });

  const categoryLabels = {
    'frontend': 'Frontend',
    'backend': 'Backend',
    'database': 'Datenbank',
    'tools': 'Tools',
    'other': 'Sonstiges'
  };

  container.innerHTML = Object.entries(grouped).map(([category, categorySkills]) => `
    <div class="skill-category-section">
      <h3 class="skill-category-title">${categoryLabels[category] || category}</h3>
      <div class="skills-grid">
        ${categorySkills.sort((a, b) => a.sort_order - b.sort_order).map(skill => `
          <div class="skill-admin-card ${skill.is_active ? '' : 'inactive'}" style="--skill-color: ${skill.color}">
            <div class="skill-icon"><i class="${skill.icon}"></i></div>
            <div class="skill-info">
              <h4>${escapeHtml(skill.name)}</h4>
              <div class="skill-level-bar">
                <div class="skill-level-fill" style="width: ${skill.level}%; background: ${skill.color}"></div>
              </div>
              <span class="skill-level-text">${skill.level}%</span>
            </div>
            <div class="skill-actions">
              <button class="btn-icon" onclick="editSkill(${skill.id})" title="Bearbeiten">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn-icon danger" onclick="deleteSkill(${skill.id})" title="Löschen">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function openNewSkillModal() {
  document.getElementById('skill-modal-title').textContent = 'Neuer Skill';
  document.getElementById('skill-id').value = '';
  document.getElementById('skill-name').value = '';
  document.getElementById('skill-icon').value = 'fab fa-js';
  document.getElementById('skill-category').value = 'frontend';
  document.getElementById('skill-level').value = '80';
  document.getElementById('skill-color').value = '#00ff88';
  document.getElementById('skill-sort-order').value = '0';
  document.getElementById('skill-active').checked = true;
  updateSkillPreview();
  document.getElementById('skill-modal').classList.add('active');
}

async function editSkill(id) {
  const skill = allSkills.find(s => s.id === id);
  if (!skill) return;

  document.getElementById('skill-modal-title').textContent = 'Skill bearbeiten';
  document.getElementById('skill-id').value = skill.id;
  document.getElementById('skill-name').value = skill.name;
  document.getElementById('skill-icon').value = skill.icon;
  document.getElementById('skill-category').value = skill.category || 'frontend';
  document.getElementById('skill-level').value = skill.level;
  document.getElementById('skill-color').value = skill.color || '#00ff88';
  document.getElementById('skill-sort-order').value = skill.sort_order || 0;
  document.getElementById('skill-active').checked = skill.is_active;
  updateSkillPreview();
  document.getElementById('skill-modal').classList.add('active');
}

async function saveSkill() {
  const id = document.getElementById('skill-id').value;
  const name = document.getElementById('skill-name').value.trim();
  const icon = document.getElementById('skill-icon').value.trim();
  const category = document.getElementById('skill-category').value;
  const level = parseInt(document.getElementById('skill-level').value) || 80;
  const color = document.getElementById('skill-color').value;
  const sort_order = parseInt(document.getElementById('skill-sort-order').value) || 0;
  const is_active = document.getElementById('skill-active').checked ? 1 : 0;

  if (!name || !icon) {
    showToast('Bitte Name und Icon eingeben', 'warning');
    return;
  }

  try {
    if (id) {
      await api(`/admin/skills/${id}`, {
        method: 'PUT',
        body: { name, icon, category, level, color, sort_order, is_active }
      });
      showToast('Skill aktualisiert!', 'success');
    } else {
      await api('/admin/skills', {
        method: 'POST',
        body: { name, icon, category, level, color, sort_order }
      });
      showToast('Skill erstellt!', 'success');
    }

    document.getElementById('skill-modal').classList.remove('active');
    loadSkills();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteSkill(id) {
  if (!confirm('Möchtest du diesen Skill wirklich löschen?')) return;

  try {
    await api(`/admin/skills/${id}`, { method: 'DELETE' });
    showToast('Skill gelöscht!', 'success');
    loadSkills();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function updateSkillPreview() {
  const name = document.getElementById('skill-name')?.value || 'JavaScript';
  const icon = document.getElementById('skill-icon')?.value || 'fab fa-js';
  const level = document.getElementById('skill-level')?.value || 80;
  const color = document.getElementById('skill-color')?.value || '#00ff88';

  const preview = document.getElementById('skill-preview-badge');
  if (preview) {
    preview.innerHTML = `
      <i class="${icon}" style="color: ${color}"></i>
      <span>${escapeHtml(name)}</span>
      <div class="skill-level-bar"><div class="skill-level-fill" style="width: ${level}%; background: ${color}"></div></div>
    `;
  }
}

// Skill modal event listeners
document.getElementById('add-skill-btn')?.addEventListener('click', openNewSkillModal);
document.getElementById('save-skill-btn')?.addEventListener('click', saveSkill);
document.getElementById('skill-name')?.addEventListener('input', updateSkillPreview);
document.getElementById('skill-icon')?.addEventListener('input', updateSkillPreview);
document.getElementById('skill-level')?.addEventListener('input', updateSkillPreview);
document.getElementById('skill-color')?.addEventListener('input', updateSkillPreview);

document.querySelector('#skill-modal .modal-close')?.addEventListener('click', () => {
  document.getElementById('skill-modal').classList.remove('active');
});
document.getElementById('skill-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'skill-modal') {
    document.getElementById('skill-modal').classList.remove('active');
  }
});

// ==================== BACKUP MANAGEMENT ====================
let allBackups = [];

async function loadBackups() {
  try {
    allBackups = await api('/admin/backups');
    renderBackups(allBackups);
    updateBackupStats(allBackups);
  } catch (e) {
    console.error('Error loading backups:', e);
  }
}

function updateBackupStats(backups) {
  document.getElementById('total-backups').textContent = backups.length;
  if (backups.length > 0) {
    const lastBackup = new Date(backups[0].created);
    document.getElementById('last-backup').textContent = lastBackup.toLocaleDateString('de-DE');
  }
}

function renderBackups(backups) {
  const container = document.getElementById('backups-list');
  if (!container) return;

  if (backups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-database"></i>
        <h3>Keine Backups vorhanden</h3>
        <p>Erstelle ein manuelles Backup oder aktiviere automatische Backups.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = backups.map(backup => {
    const date = new Date(backup.created);
    const sizeKB = (backup.size / 1024).toFixed(1);
    const isAuto = backup.filename.includes('auto');

    return `
      <div class="backup-item">
        <div class="backup-icon">
          <i class="fas fa-${isAuto ? 'clock' : 'hand-pointer'}"></i>
        </div>
        <div class="backup-info">
          <h4>${escapeHtml(backup.filename)}</h4>
          <p>${date.toLocaleString('de-DE')} - ${sizeKB} KB</p>
        </div>
        <div class="backup-actions">
          <a href="/api/admin/backups/${encodeURIComponent(backup.filename)}" class="btn btn-small btn-secondary" download>
            <i class="fas fa-download"></i>
          </a>
          <button class="btn btn-small btn-danger" onclick="deleteBackup('${escapeHtml(backup.filename)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function createBackup() {
  try {
    const result = await api('/admin/backup', { method: 'POST' });
    showToast(`Backup erstellt: ${result.filename}`, 'success');
    loadBackups();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteBackup(filename) {
  if (!confirm('Möchtest du dieses Backup wirklich löschen?')) return;

  try {
    await api(`/admin/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    showToast('Backup gelöscht!', 'success');
    loadBackups();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadBackupSettings() {
  try {
    const settings = await api('/settings');
    document.getElementById('backup-enabled').checked = settings.backup_enabled === 'true';
    document.getElementById('auto-payment-reminders').checked = settings.auto_payment_reminders === 'true';
  } catch (e) {
    // Settings not found
  }
}

async function saveBackupSettings() {
  const backup_enabled = document.getElementById('backup-enabled').checked.toString();
  const auto_payment_reminders = document.getElementById('auto-payment-reminders').checked.toString();

  try {
    await api('/settings', {
      method: 'POST',
      body: { backup_enabled, auto_payment_reminders }
    });
    showToast('Einstellungen gespeichert!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadEmailLogs() {
  try {
    const logs = await api('/admin/email-logs');
    renderEmailLogs(logs);
  } catch (e) {
    console.error('Error loading email logs:', e);
  }
}

function renderEmailLogs(logs) {
  const container = document.getElementById('email-logs-list');
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = '<p class="empty-text">Keine E-Mails gesendet</p>';
    return;
  }

  const typeLabels = {
    'welcome': 'Willkommen',
    'payment_reminder': 'Zahlungserinnerung',
    'status_update': 'Status-Update',
    'new_message': 'Neue Nachricht'
  };

  container.innerHTML = logs.slice(0, 20).map(log => `
    <div class="email-log-item">
      <span class="email-log-type">${typeLabels[log.type] || log.type}</span>
      <span class="email-log-recipient">${escapeHtml(log.recipient)}</span>
      <span class="email-log-date">${formatDate(log.created_at)}</span>
    </div>
  `).join('');
}

// Backup event listeners
document.getElementById('create-backup-btn')?.addEventListener('click', createBackup);
document.getElementById('save-backup-settings-btn')?.addEventListener('click', saveBackupSettings);

// ==================== ANALYTICS ====================
async function loadAnalytics() {
  try {
    const analytics = await api('/admin/analytics');
    renderAnalytics(analytics);
  } catch (e) {
    console.error('Error loading analytics:', e);
  }
}

function renderAnalytics(data) {
  // Update stats
  document.getElementById('analytics-conversion').textContent =
    data.conversion?.rate ? `${data.conversion.rate}%` : '0%';

  document.getElementById('analytics-response-time').textContent =
    data.avgResponseTimeHours ? `${data.avgResponseTimeHours}h` : '-';

  document.getElementById('analytics-total-requests').textContent =
    data.conversion?.total || 0;

  const totalRevenue = data.revenuePerMonth?.reduce((sum, m) => sum + (m.revenue || 0), 0) || 0;
  document.getElementById('analytics-total-revenue').textContent =
    formatCurrency(totalRevenue);

  // Project Types Chart
  const projectTypesContainer = document.getElementById('project-types-chart');
  if (projectTypesContainer && data.projectTypes) {
    const maxCount = Math.max(...data.projectTypes.map(p => p.count), 1);
    projectTypesContainer.innerHTML = `
      <div class="bar-chart">
        ${data.projectTypes.map(type => `
          <div class="bar-chart-item">
            <span class="bar-chart-label">${getProjectTypeLabel(type.project_type)}</span>
            <div class="bar-chart-bar">
              <div class="bar-chart-fill" style="width: ${(type.count / maxCount) * 100}%"></div>
            </div>
            <span class="bar-chart-value">${type.count}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Status Distribution
  const statusContainer = document.getElementById('status-chart');
  if (statusContainer && data.statusDistribution) {
    const statusLabels = {
      'new': 'Neu',
      'in_progress': 'In Bearbeitung',
      'waiting': 'Wartend',
      'completed': 'Abgeschlossen',
      'cancelled': 'Abgebrochen'
    };

    statusContainer.innerHTML = `
      <div class="status-chart">
        ${data.statusDistribution.map(status => `
          <div class="status-item">
            <span class="status-dot ${status.status}"></span>
            <span class="status-count">${status.count}</span>
            <span class="status-label">${statusLabels[status.status] || status.status}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Requests per Month
  const requestsMonthContainer = document.getElementById('requests-per-month-chart');
  if (requestsMonthContainer && data.requestsPerMonth) {
    const maxRequests = Math.max(...data.requestsPerMonth.map(m => m.count), 1);
    requestsMonthContainer.innerHTML = `
      <div class="bar-chart">
        ${data.requestsPerMonth.map(month => `
          <div class="bar-chart-item">
            <span class="bar-chart-label">${month.month}</span>
            <div class="bar-chart-bar">
              <div class="bar-chart-fill" style="width: ${(month.count / maxRequests) * 100}%"></div>
            </div>
            <span class="bar-chart-value">${month.count}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Top Customers
  const topCustomersContainer = document.getElementById('top-customers-list');
  if (topCustomersContainer && data.topCustomers) {
    if (data.topCustomers.length === 0) {
      topCustomersContainer.innerHTML = '<p class="empty-text">Keine Kundendaten</p>';
    } else {
      topCustomersContainer.innerHTML = `
        ${data.topCustomers.slice(0, 5).map((customer, index) => `
          <div class="top-list-item">
            <span class="top-list-rank">${index + 1}</span>
            <div class="top-list-info">
              <span class="top-list-name">${escapeHtml(customer.email)}</span>
              <span class="top-list-meta">${customer.request_count} Anfragen</span>
            </div>
            <span class="top-list-value">${formatCurrency(customer.total_value || 0)}</span>
          </div>
        `).join('')}
      `;
    }
  }

  // Revenue per Month
  const revenueMonthContainer = document.getElementById('revenue-per-month-chart');
  if (revenueMonthContainer && data.revenuePerMonth) {
    const maxRevenue = Math.max(...data.revenuePerMonth.map(m => m.revenue), 1);
    revenueMonthContainer.innerHTML = `
      <div class="bar-chart">
        ${data.revenuePerMonth.map(month => `
          <div class="bar-chart-item">
            <span class="bar-chart-label">${month.month}</span>
            <div class="bar-chart-bar">
              <div class="bar-chart-fill" style="width: ${(month.revenue / maxRevenue) * 100}%"></div>
            </div>
            <span class="bar-chart-value">${formatCurrency(month.revenue)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function getProjectTypeLabel(type) {
  const labels = {
    'webdesign': 'Webdesign',
    'custom-app': 'Custom App',
    'discord-bot': 'Discord Bot',
    'linux-setup': 'Linux Setup'
  };
  return labels[type] || type || 'Sonstige';
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
}

// Analytics period change
document.getElementById('analytics-period')?.addEventListener('change', (e) => {
  loadAnalytics();
});

// ==================== APPOINTMENTS ADMIN ====================
let allAppointments = [];
let appointmentFilter = 'pending';

async function loadAdminAppointments() {
  try {
    allAppointments = await api('/admin/appointments');
    updateAppointmentStats();
    renderAdminAppointments();
  } catch (e) {
    console.error('Error loading appointments:', e);
  }
}

function updateAppointmentStats() {
  const pending = allAppointments.filter(a => a.status === 'pending').length;
  const confirmed = allAppointments.filter(a => a.status === 'confirmed').length;

  // Calculate upcoming this week
  const today = new Date();
  const weekEnd = new Date();
  weekEnd.setDate(today.getDate() + 7);

  const upcoming = allAppointments.filter(a => {
    const aptDate = new Date(a.date);
    return aptDate >= today && aptDate <= weekEnd && a.status !== 'cancelled';
  }).length;

  document.getElementById('pending-appointments').textContent = pending;
  document.getElementById('confirmed-appointments').textContent = confirmed;
  document.getElementById('upcoming-appointments').textContent = upcoming;
}

function renderAdminAppointments() {
  const container = document.getElementById('appointments-admin-list');
  if (!container) return;

  let filtered = allAppointments;
  if (appointmentFilter !== 'all') {
    filtered = allAppointments.filter(a => a.status === appointmentFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="appointments-empty-state">
        <i class="fas fa-calendar-times"></i>
        <p>Keine Termine gefunden</p>
      </div>
    `;
    return;
  }

  const typeLabels = {
    'consultation': 'Beratung',
    'project_discussion': 'Projektbesprechung',
    'review': 'Review',
    'other': 'Sonstiges'
  };

  const statusLabels = {
    'pending': '<i class="fas fa-clock"></i> Ausstehend',
    'confirmed': '<i class="fas fa-check"></i> Bestätigt',
    'cancelled': '<i class="fas fa-times"></i> Abgesagt',
    'completed': '<i class="fas fa-check-double"></i> Abgeschlossen'
  };

  container.innerHTML = filtered.map(apt => {
    const date = new Date(apt.date);
    const day = date.getDate();
    const month = date.toLocaleString('de-DE', { month: 'short' });

    return `
      <div class="appointment-admin-card" data-id="${apt.id}">
        <div class="appointment-datetime">
          <div class="appointment-day">${day}</div>
          <div class="appointment-month">${month}</div>
          <div class="appointment-time-slot">${apt.time_slot}</div>
        </div>
        <div class="appointment-details">
          <div class="appointment-customer">${escapeHtml(apt.customer_name || apt.email || 'Unbekannt')}</div>
          <div class="appointment-type-label">${typeLabels[apt.type] || apt.type}</div>
          ${apt.notes ? `<div class="appointment-notes-text">"${escapeHtml(apt.notes)}"</div>` : ''}
        </div>
        <div class="appointment-status-badge ${apt.status}">
          ${statusLabels[apt.status] || apt.status}
        </div>
        <div class="appointment-actions">
          ${apt.status === 'pending' ? `
            <button class="btn-icon confirm" onclick="confirmAppointment(${apt.id})" title="Bestätigen">
              <i class="fas fa-check"></i>
            </button>
            <button class="btn-icon cancel" onclick="cancelAppointment(${apt.id})" title="Absagen">
              <i class="fas fa-times"></i>
            </button>
          ` : ''}
          ${apt.status === 'confirmed' ? `
            <button class="btn-icon" onclick="completeAppointment(${apt.id})" title="Als erledigt markieren">
              <i class="fas fa-check-double"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function confirmAppointment(id) {
  try {
    await api(`/admin/appointments/${id}`, {
      method: 'PUT',
      body: { status: 'confirmed' }
    });
    showToast('Termin bestätigt!', 'success');
    loadAdminAppointments();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function cancelAppointment(id) {
  if (!confirm('Möchtest du diesen Termin wirklich absagen?')) return;

  try {
    await api(`/admin/appointments/${id}`, {
      method: 'PUT',
      body: { status: 'cancelled' }
    });
    showToast('Termin abgesagt', 'success');
    loadAdminAppointments();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function completeAppointment(id) {
  try {
    await api(`/admin/appointments/${id}`, {
      method: 'PUT',
      body: { status: 'completed' }
    });
    showToast('Termin als erledigt markiert', 'success');
    loadAdminAppointments();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// Appointment filter buttons
document.querySelectorAll('.appointment-filters .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.appointment-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    appointmentFilter = btn.dataset.filter;
    renderAdminAppointments();
  });
});

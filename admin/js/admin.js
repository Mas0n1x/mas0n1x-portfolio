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
  });
});

// ==================== MODAL ====================
function openModal(title, content) {
  modalTitle.textContent = title;
  modalBody.innerHTML = content;
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
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
  let project = { title: '', description: '', tags: [], image: '', link: '', status: 'completed', sort_order: 0 };

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

    // Set status and deadline
    document.getElementById('request-status').value = request.status;
    document.getElementById('request-deadline').value = request.deadline || '';

    // Load messages
    loadMessages(id);
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
        ${msg.file_path ? `
          <a href="${msg.file_path}" target="_blank" class="chat-message-file">
            <i class="fas fa-file"></i>
            <span>${escapeHtml(msg.original_name)}</span>
          </a>
        ` : ''}
        <div class="chat-message-time">${formatDateTime(msg.created_at)}</div>
      </div>
    `).join('');

    container.scrollTop = container.scrollHeight;
  } catch (e) {
    container.innerHTML = `<p class="error-message">Fehler beim Laden der Nachrichten</p>`;
  }
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

  try {
    await api(`/admin/requests/${currentRequestId}`, {
      method: 'PUT',
      body: { status, deadline: deadline || null }
    });
    showToast('Änderungen gespeichert!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
});

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
function initInvoice() {
  // Set default date
  document.getElementById('invoice-date').value = new Date().toISOString().split('T')[0];

  // Generate invoice number
  const year = new Date().getFullYear();
  document.getElementById('invoice-number').value = `${year}-001`;

  // Load saved sender data from localStorage
  const savedSender = localStorage.getItem('invoiceSender');
  if (savedSender) {
    const sender = JSON.parse(savedSender);
    document.getElementById('invoice-from-name').value = sender.name || '';
    document.getElementById('invoice-from-address').value = sender.address || '';
    document.getElementById('invoice-from-email').value = sender.email || '';
    document.getElementById('invoice-from-phone').value = sender.phone || '';
    document.getElementById('invoice-bank').value = sender.bank || '';
  }

  // Event listeners
  document.getElementById('add-invoice-item').addEventListener('click', addInvoiceItem);
  document.getElementById('download-invoice-btn').addEventListener('click', downloadInvoice);

  // Remove item handler
  document.getElementById('invoice-items').addEventListener('click', (e) => {
    if (e.target.closest('.remove-item')) {
      const items = document.querySelectorAll('.invoice-item');
      if (items.length > 1) {
        e.target.closest('.invoice-item').remove();
        updateInvoicePreview();
      }
    }
  });

  // Update preview on input change
  const formPanel = document.querySelector('.invoice-form-panel');
  if (formPanel) {
    formPanel.addEventListener('input', updateInvoicePreview);
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
  document.querySelectorAll('.invoice-item').forEach(item => {
    const desc = item.querySelector('.item-desc').value;
    const qty = parseFloat(item.querySelector('.item-qty').value) || 0;
    const price = parseFloat(item.querySelector('.item-price').value) || 0;
    if (desc || price > 0) {
      items.push({ desc, qty, price, total: qty * price });
    }
  });

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

// ==================== IMPRESSUM ====================
async function loadImpressum() {
  try {
    const settings = await api('/settings');

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
  } catch (e) {
    // Settings not found, leave empty
  }
}

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
  loadRequestDetail(requestId);
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

// ==================== INIT ====================
checkAuth();

// Initialize sections when shown
document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.section === 'invoices') {
      setTimeout(initInvoice, 100);
    }
    if (item.dataset.section === 'impressum') {
      loadImpressum();
    }
    if (item.dataset.section === 'customers') {
      loadCustomers();
    }
  });
});

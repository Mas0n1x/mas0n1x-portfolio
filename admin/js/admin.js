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
  let project = { title: '', description: '', tags: [], image: '', link: '', sort_order: 0 };

  if (id) {
    project = await api(`/projects/${id}`);
  }

  const tagsString = Array.isArray(project.tags) ? project.tags.join(', ') : '';

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
    await api('/import-existing', {
      method: 'POST',
      body: { projects: existingProjects, services: existingServices },
    });
    showToast('Daten erfolgreich importiert!', 'success');
    loadProjects();
    loadServices();
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// ==================== UTILS ====================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== INIT ====================
checkAuth();

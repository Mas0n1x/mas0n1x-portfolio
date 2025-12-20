// ==================== STATE ====================
let customer = null;
let currentRequestId = null;

// ==================== DOM ELEMENTS ====================
const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');
const requestsView = document.getElementById('requests-view');
const detailView = document.getElementById('request-detail-view');

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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Ein Fehler ist aufgetreten');
  }

  return data;
}

// ==================== AUTH ====================
async function checkAuth() {
  try {
    const data = await api('/customer/check');
    if (data.authenticated) {
      customer = data.customer;
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
  dashboard.classList.add('hidden');
}

function showDashboard() {
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  userEmail.textContent = customer?.email || '';
  loadRequests();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const data = await api('/customer/login', {
      method: 'POST',
      body: { email, password },
    });
    customer = { id: data.customerId, email };
    showDashboard();
  } catch (e) {
    loginError.textContent = e.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('/customer/logout', { method: 'POST' });
  customer = null;
  showLogin();
});

// ==================== REQUESTS ====================
async function loadRequests() {
  const container = document.getElementById('requests-list');

  try {
    const requests = await api('/requests');

    if (requests.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-folder-open"></i>
          <h3>Keine Anfragen vorhanden</h3>
          <p>Starten Sie Ihr erstes Projekt!</p>
          <a href="/projekt-starten.html" class="btn-primary">
            <i class="fas fa-plus"></i> Projekt starten
          </a>
        </div>
      `;
      return;
    }

    container.innerHTML = requests.map(req => `
      <div class="request-card" onclick="openRequest(${req.id})">
        <div class="request-icon">
          ${getProjectTypeIcon(req.project_type)}
        </div>
        <div class="request-content">
          <h3>${getProjectTypeLabel(req.project_type)}</h3>
          <p>${escapeHtml(req.description) || 'Keine Beschreibung'}</p>
          <div class="request-meta">
            <span><i class="fas fa-euro-sign"></i> ${getBudgetLabel(req.budget)}</span>
            <span><i class="fas fa-calendar"></i> ${formatDate(req.created_at)}</span>
          </div>
          ${req.deadline ? `
            <div class="deadline-badge">
              <i class="fas fa-clock"></i>
              Deadline: ${formatDate(req.deadline)}
            </div>
          ` : ''}
        </div>
        <span class="request-status ${req.status}">${getStatusLabel(req.status)}</span>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<p style="color: var(--danger); text-align: center;">${e.message}</p>`;
  }
}

async function openRequest(id) {
  currentRequestId = id;

  try {
    const request = await api(`/requests/${id}`);

    // Show detail view
    requestsView.classList.add('hidden');
    detailView.classList.remove('hidden');

    // Fill info
    document.getElementById('request-info').innerHTML = `
      <div class="info-item">
        <div class="info-label">Projektart</div>
        <div class="info-value">${getProjectTypeIcon(request.project_type)} ${getProjectTypeLabel(request.project_type)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Status</div>
        <div class="info-value">
          <span class="request-status ${request.status}" style="display: inline-block;">${getStatusLabel(request.status)}</span>
        </div>
      </div>
      <div class="info-item">
        <div class="info-label">Budget</div>
        <div class="info-value">${getBudgetLabel(request.budget)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Zeitrahmen</div>
        <div class="info-value">${getTimelineLabel(request.timeline)}</div>
      </div>
      ${request.deadline ? `
        <div class="info-item">
          <div class="info-label">Deadline</div>
          <div class="info-value deadline">
            <i class="fas fa-clock"></i>
            ${formatDate(request.deadline)}
          </div>
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

    loadMessages(id);
  } catch (e) {
    alert(e.message);
  }
}

async function loadMessages(requestId) {
  const container = document.getElementById('chat-messages');

  try {
    const messages = await api(`/requests/${requestId}/messages`);

    if (messages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 40px;">
          <i class="fas fa-comments" style="font-size: 2.5rem; margin-bottom: 12px; display: block;"></i>
          Noch keine Nachrichten.<br>Schreiben Sie uns!
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
    container.innerHTML = `<p style="color: var(--danger);">${e.message}</p>`;
  }
}

// Back button
document.getElementById('back-btn').addEventListener('click', () => {
  detailView.classList.add('hidden');
  requestsView.classList.remove('hidden');
  currentRequestId = null;
  loadRequests();
});

// Send message
document.getElementById('send-btn').addEventListener('click', async () => {
  if (!currentRequestId) return;

  const input = document.getElementById('message-input');
  const fileInput = document.getElementById('file-input');
  const content = input.value.trim();
  const file = fileInput.files[0];

  if (!content && !file) {
    alert('Bitte Nachricht eingeben oder Datei auswählen');
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
    document.getElementById('file-name').textContent = '';
    loadMessages(currentRequestId);
  } catch (e) {
    alert(e.message);
  }
});

// File selection display
document.getElementById('file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  document.getElementById('file-name').textContent = file ? `Ausgewählt: ${file.name}` : '';
});

// ==================== HELPER FUNCTIONS ====================
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

function getStatusLabel(status) {
  const labels = {
    'new': 'Neu',
    'in_progress': 'In Bearbeitung',
    'waiting': 'Antwort erforderlich',
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

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== INIT ====================
checkAuth();

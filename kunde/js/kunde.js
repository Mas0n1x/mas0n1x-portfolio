/*
 * Mas0n1x Portfolio
 * Copyright (c) 2024-2026 DEV Mas0n1x.
 * Alle Rechte vorbehalten.
 */
// ==================== STATE ====================
let customer = null;
let currentRequestId = null;
let currentView = 'requests';

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
            <div class="deadline-info ${isDeadlineSoon(req.deadline) ? 'urgent' : ''}">
              <i class="fas fa-calendar-alt"></i>
              <span>Deadline: ${formatDate(req.deadline)}</span>
              ${getDaysRemaining(req.deadline)}
            </div>
          ` : ''}
          ${req.progress > 0 || req.status === 'in_progress' ? `
            <div class="progress-section">
              <div class="progress-header">
                <span><i class="fas fa-tasks"></i> Fortschritt</span>
                <span class="progress-percent">${req.progress || 0}%</span>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" style="width: ${req.progress || 0}%"></div>
              </div>
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
      ${(request.progress > 0 || request.status === 'in_progress') ? `
        <div class="progress-card">
          <div class="progress-card-header">
            <span class="progress-card-title">
              <i class="fas fa-chart-line"></i>
              Projektfortschritt
            </span>
            <span class="progress-card-value">${request.progress || 0}%</span>
          </div>
          <div class="progress-card-bar">
            <div class="progress-card-fill" style="width: ${request.progress || 0}%"></div>
          </div>
          <div class="progress-card-milestones">
            <span class="${(request.progress || 0) >= 0 ? 'active' : ''}">Start</span>
            <span class="${(request.progress || 0) >= 25 ? 'active' : ''}">25%</span>
            <span class="${(request.progress || 0) >= 50 ? 'active' : ''}">50%</span>
            <span class="${(request.progress || 0) >= 75 ? 'active' : ''}">75%</span>
            <span class="${(request.progress || 0) >= 100 ? 'active' : ''}">Fertig</span>
          </div>
        </div>
      ` : ''}
      ${request.deadline ? `
        <div class="deadline-card ${isDeadlineSoon(request.deadline) ? 'urgent' : ''}">
          <div class="deadline-card-icon">
            <i class="fas fa-calendar-alt"></i>
          </div>
          <div class="deadline-card-content">
            <span class="deadline-card-label">Deadline</span>
            <span class="deadline-card-date">${formatDate(request.deadline)}</span>
            <span class="deadline-card-remaining">${getDaysRemainingText(request.deadline)}</span>
          </div>
        </div>
      ` : ''}
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
    loadDocuments(id);
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

  // Default file attachment
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

  // Close handlers
  modal.querySelector('.image-modal-backdrop').addEventListener('click', () => closeImageModal(modal));
  modal.querySelector('.image-modal-close').addEventListener('click', () => closeImageModal(modal));
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closeImageModal(modal);
      document.removeEventListener('keydown', escHandler);
    }
  });

  // Animate in
  requestAnimationFrame(() => modal.classList.add('active'));
}

function closeImageModal(modal) {
  modal.classList.remove('active');
  setTimeout(() => {
    modal.remove();
    document.body.style.overflow = '';
  }, 300);
}

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

function isDeadlineSoon(deadline) {
  if (!deadline) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline);
  const diffTime = deadlineDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 7 && diffDays >= 0;
}

function getDaysRemaining(deadline) {
  if (!deadline) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline);
  const diffTime = deadlineDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `<span class="days-remaining overdue">${Math.abs(diffDays)} Tage überfällig</span>`;
  } else if (diffDays === 0) {
    return `<span class="days-remaining today">Heute fällig!</span>`;
  } else if (diffDays === 1) {
    return `<span class="days-remaining soon">Morgen fällig</span>`;
  } else if (diffDays <= 7) {
    return `<span class="days-remaining soon">${diffDays} Tage verbleibend</span>`;
  } else {
    return `<span class="days-remaining">${diffDays} Tage verbleibend</span>`;
  }
}

function getDaysRemainingText(deadline) {
  if (!deadline) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline);
  const diffTime = deadlineDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `${Math.abs(diffDays)} Tage überfällig`;
  } else if (diffDays === 0) {
    return 'Heute fällig!';
  } else if (diffDays === 1) {
    return 'Morgen fällig';
  } else {
    return `${diffDays} Tage verbleibend`;
  }
}

// ==================== DOCUMENTS ====================
async function loadDocuments(requestId) {
  const container = document.getElementById('documents-list');

  try {
    const documents = await api(`/customer/documents/${requestId}`);

    if (documents.length === 0) {
      container.innerHTML = `
        <div class="documents-empty">
          <i class="fas fa-file-alt"></i>
          <p>Keine Dokumente vorhanden</p>
        </div>
      `;
      return;
    }

    container.innerHTML = documents.map(doc => {
      const iconClass = getDocumentIconClass(doc.type);
      return `
        <a href="${doc.file_path || '#'}" class="document-item" target="_blank" ${!doc.file_path ? 'onclick="return false;"' : ''}>
          <div class="document-icon ${doc.type}">
            <i class="fas ${iconClass}"></i>
          </div>
          <div class="document-info">
            <div class="document-title">${escapeHtml(doc.title)}</div>
            <div class="document-meta">${formatDate(doc.created_at)}</div>
          </div>
          ${doc.file_path ? '<i class="fas fa-download document-download"></i>' : ''}
        </a>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = `
      <div class="documents-empty">
        <i class="fas fa-file-alt"></i>
        <p>Keine Dokumente vorhanden</p>
      </div>
    `;
  }
}

function getDocumentIconClass(type) {
  const icons = {
    'invoice': 'fa-file-invoice-dollar',
    'contract': 'fa-file-contract',
    'quote': 'fa-file-invoice'
  };
  return icons[type] || 'fa-file-alt';
}

// ==================== PORTAL NAVIGATION ====================
function initPortalNavigation() {
  document.querySelectorAll('.portal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      switchView(view);
    });
  });
}

async function loadInvoices() {
  const el = document.getElementById('invoices-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    const rows = await api('/customer/invoices');
    if (!rows.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-file-invoice"></i><h3>Keine Rechnungen</h3><p>Hier erscheinen deine Rechnungen, sobald welche erstellt wurden.</p></div>'; return; }
    const SL = { 'bezahlt': 'Bezahlt', 'offen': 'Offen', 'überfällig': 'Überfällig' };
    const SC = { 'bezahlt': 'paid', 'offen': 'open', 'überfällig': 'overdue' };
    el.innerHTML = rows.map(inv => `<div class="inv-item" onclick="openInvoice(${inv.id})">
      <div class="inv-main">
        <div class="inv-num">${escapeHtml(inv.invoice_number)}</div>
        <div class="inv-meta">${inv.due_date ? 'Fällig: ' + escapeHtml(inv.due_date) : ''}${inv.paid_date ? ' · Bezahlt: ' + escapeHtml(inv.paid_date) : ''}</div>
      </div>
      <div class="inv-right">
        <div class="inv-total">${(inv.total || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</div>
        <span class="inv-status ${SC[inv.status] || 'open'}">${SL[inv.status] || escapeHtml(inv.status || '')}</span>
        ${inv.payment_link && inv.status !== 'bezahlt' ? `<a class="inv-pay" href="${escapeHtml(inv.payment_link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="fas fa-credit-card"></i> Bezahlen</a>` : ''}
      </div>
    </div>`).join('');
  } catch (e) { el.innerHTML = '<div class="empty-state">Rechnungen nicht abrufbar.</div>'; }
}

async function openInvoice(id) {
  try {
    const inv = await api('/customer/invoices/' + id);
    const b = inv.business || {};
    const SL = { 'bezahlt': 'Bezahlt', 'offen': 'Offen', 'überfällig': 'Überfällig' };
    const items = inv.items || [];
    const fmt = n => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 });
    const qOf = it => it.quantity || it.qty || 1;
    const pOf = it => it.price || it.amount || it.unit_price || 0;
    const rows = items.length
      ? items.map(it => `<tr><td>${escapeHtml(it.description || it.name || it.title || 'Position')}</td><td class="r">${qOf(it)}</td><td class="r">${fmt(pOf(it))} €</td><td class="r">${fmt(qOf(it) * pOf(it))} €</td></tr>`).join('')
      : `<tr><td>Leistung</td><td class="r">1</td><td class="r">${fmt(inv.amount)} €</td><td class="r">${fmt(inv.amount)} €</td></tr>`;
    document.getElementById('invoice-body').innerHTML = `
      <div class="iv-doc">
        <div class="iv-head">
          <div class="iv-from"><strong>${escapeHtml(b.name || 'Mas0n1x')}</strong><br>${escapeHtml(b.street || '')}<br>${escapeHtml(b.zip || '')} ${escapeHtml(b.city || '')}<br>${escapeHtml(b.email || '')}</div>
          <div class="iv-title"><h2>Rechnung</h2><div>${escapeHtml(inv.invoice_number || '')}</div></div>
        </div>
        <div class="iv-meta"><div><b>Datum:</b> ${escapeHtml((inv.created_at || '').split(' ')[0])}</div>${inv.due_date ? `<div><b>Fällig:</b> ${escapeHtml(inv.due_date)}</div>` : ''}<div><b>Status:</b> ${SL[inv.status] || escapeHtml(inv.status || '')}</div></div>
        <table class="iv-table"><thead><tr><th>Beschreibung</th><th class="r">Menge</th><th class="r">Einzel</th><th class="r">Gesamt</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="iv-sum"><div><span>Netto</span><span>${fmt(inv.amount)} €</span></div><div><span>MwSt.</span><span>${fmt(inv.tax)} €</span></div><div class="iv-total"><span>Gesamt</span><span>${fmt(inv.total)} €</span></div></div>
        ${b.iban ? `<div class="iv-bank"><b>Zahlbar an:</b> ${escapeHtml(b.bank || '')} · IBAN ${escapeHtml(b.iban)}${b.bic ? ' · BIC ' + escapeHtml(b.bic) : ''}</div>` : ''}
        ${b.vatid ? `<div class="iv-vat">USt-IdNr.: ${escapeHtml(b.vatid)}</div>` : ''}
      </div>`;
    const pay = document.getElementById('invoice-pay');
    if (inv.payment_link && inv.status !== 'bezahlt') { pay.href = inv.payment_link; pay.style.display = 'inline-flex'; } else { pay.style.display = 'none'; }
    document.getElementById('invoice-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
  } catch (e) { console.error('Rechnung laden:', e); }
}
function closeInvoice() { document.getElementById('invoice-modal').classList.remove('active'); document.body.style.overflow = ''; }
function printInvoice() { window.print(); }

function switchView(view) {
  currentView = view;

  // Update tabs
  document.querySelectorAll('.portal-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });

  // Update views
  document.querySelectorAll('.portal-view').forEach(v => {
    v.classList.add('hidden');
  });

  const targetView = document.getElementById(`${view}-view`);
  if (targetView) {
    targetView.classList.remove('hidden');
  }

  // Load content for the view
  if (view === 'requests') {
    loadRequests();
  } else if (view === 'appointments') {
    loadMyAppointments();
    initAppointmentDatePicker();
  } else if (view === 'invoices') {
    loadInvoices();
  } else if (view === 'faq') {
    loadFAQs();
  }
}

// ==================== FAQ (statisch) ====================
const KUNDE_FAQS = [
  { question: 'Wie sehe ich den Stand meines Projekts?', answer: 'Unter „Meine Anfragen" siehst du zu jeder Anfrage den aktuellen Status sowie Nachrichten und Zwischenstände von mir.' },
  { question: 'Wie kann ich dir Dateien schicken?', answer: 'Öffne eine Anfrage und hänge in den Nachrichten direkt Dateien an — ich bekomme sie sofort.' },
  { question: 'Wie buche ich einen Termin?', answer: 'Im Tab „Termine" wählst du Datum und Uhrzeit für ein Gespräch. Ich bestätige den Termin zeitnah.' },
  { question: 'Wo finde ich meine Rechnungen?', answer: 'Im Tab „Rechnungen" siehst du alle Rechnungen, kannst sie als PDF drucken und — falls ein Bezahllink hinterlegt ist — direkt bezahlen.' },
  { question: 'Wie erreiche ich dich am schnellsten?', answer: 'Am besten direkt in der jeweiligen Anfrage per Nachricht — oder per E-Mail an support@mas0n1x.online.' }
];
function loadFAQs() {
  const container = document.getElementById('faq-list');
  if (!container) return;
  container.innerHTML = KUNDE_FAQS.map((faq, index) => `
    <div class="faq-item" data-faq-id="${index}">
      <div class="faq-question" onclick="toggleFAQ(${index})">
        <span>${escapeHtml(faq.question)}</span>
        <i class="fas fa-chevron-down faq-toggle"></i>
      </div>
      <div class="faq-answer">
        <p>${escapeHtml(faq.answer)}</p>
      </div>
    </div>
  `).join('');
}

function toggleFAQ(index) {
  const items = document.querySelectorAll('.faq-item');
  const item = items[index];
  if (!item) return;

  const isOpen = item.classList.contains('open');

  // Close all
  items.forEach(i => i.classList.remove('open'));

  // Toggle current
  if (!isOpen) {
    item.classList.add('open');
  }
}

// ==================== APPOINTMENTS ====================
async function loadMyAppointments() {
  const container = document.getElementById('my-appointments-list');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <i class="fas fa-spinner fa-spin" style="color: var(--primary);"></i>
    </div>
  `;

  try {
    const appointments = await api('/customer/appointments');

    if (appointments.length === 0) {
      container.innerHTML = `
        <div class="appointments-empty">
          <i class="fas fa-calendar-times"></i>
          <p>Keine Termine geplant</p>
        </div>
      `;
      return;
    }

    container.innerHTML = appointments.map(apt => `
      <div class="appointment-card ${apt.status}">
        <div class="appointment-date">
          <i class="fas fa-calendar"></i>
          <span>${formatDate(apt.date)}</span>
        </div>
        <div class="appointment-time">
          <i class="fas fa-clock"></i>
          <span>${apt.time_slot}</span>
        </div>
        <div class="appointment-type">
          <i class="fas fa-tag"></i>
          <span>${getAppointmentTypeLabel(apt.type)}</span>
        </div>
        <div class="appointment-status ${apt.status}">
          ${getAppointmentStatusLabel(apt.status)}
        </div>
        ${apt.notes ? `<div class="appointment-notes"><i class="fas fa-sticky-note"></i> ${escapeHtml(apt.notes)}</div>` : ''}
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `
      <div class="appointments-empty">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Fehler beim Laden der Termine</p>
      </div>
    `;
  }
}

function initAppointmentDatePicker() {
  const dateInput = document.getElementById('appointment-date');
  if (!dateInput) return;

  // Set min date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.min = tomorrow.toISOString().split('T')[0];

  // Set max date to 3 months from now
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 3);
  dateInput.max = maxDate.toISOString().split('T')[0];

  dateInput.addEventListener('change', loadAvailableSlots);
}

async function loadAvailableSlots() {
  const dateInput = document.getElementById('appointment-date');
  const slotsContainer = document.getElementById('time-slots');

  if (!dateInput || !slotsContainer) return;

  const selectedDate = dateInput.value;
  if (!selectedDate) {
    slotsContainer.innerHTML = '';
    return;
  }

  slotsContainer.innerHTML = `
    <div style="text-align: center; padding: 10px;">
      <i class="fas fa-spinner fa-spin"></i> Lade verfügbare Zeiten...
    </div>
  `;

  try {
    const slots = await api(`/customer/appointments/slots?date=${selectedDate}`);

    if (slots.length === 0) {
      slotsContainer.innerHTML = `
        <div class="no-slots">Keine Termine verfügbar an diesem Tag</div>
      `;
      return;
    }

    slotsContainer.innerHTML = slots.map(slot => `
      <button type="button" class="time-slot ${slot.available ? '' : 'unavailable'}"
              data-slot="${slot.time}"
              ${slot.available ? '' : 'disabled'}
              onclick="selectTimeSlot(this)">
        ${slot.time}
      </button>
    `).join('');
  } catch (e) {
    slotsContainer.innerHTML = `
      <div class="no-slots">Fehler beim Laden der Zeiten</div>
    `;
  }
}

function selectTimeSlot(button) {
  document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
  button.classList.add('selected');

  // Enable the book button
  const bookBtn = document.getElementById('book-appointment-btn');
  if (bookBtn) {
    bookBtn.disabled = false;
  }
}

async function bookAppointment() {
  const dateInput = document.getElementById('appointment-date');
  const typeSelect = document.getElementById('appointment-type');
  const notesInput = document.getElementById('appointment-notes');
  const selectedSlot = document.querySelector('.time-slot.selected');

  if (!dateInput?.value) {
    alert('Bitte wählen Sie ein Datum');
    return;
  }

  if (!selectedSlot) {
    alert('Bitte wählen Sie eine Uhrzeit');
    return;
  }

  const bookBtn = document.getElementById('book-appointment-btn');
  bookBtn.disabled = true;
  bookBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buche...';

  try {
    await api('/appointments', {
      method: 'POST',
      body: {
        date: dateInput.value,
        time_slot: selectedSlot.dataset.slot,
        type: typeSelect?.value || 'consultation',
        notes: notesInput?.value || ''
      }
    });

    // Reset form
    dateInput.value = '';
    if (notesInput) notesInput.value = '';
    document.getElementById('time-slots').innerHTML = '';

    // Show success and reload
    alert('Termin erfolgreich gebucht!');
    loadMyAppointments();
  } catch (e) {
    alert(e.message);
  } finally {
    bookBtn.disabled = false;
    bookBtn.innerHTML = '<i class="fas fa-calendar-check"></i> Termin buchen';
  }
}

function getAppointmentTypeLabel(type) {
  const labels = {
    'consultation': 'Beratungsgespräch',
    'project_discussion': 'Projektbesprechung',
    'review': 'Review-Meeting',
    'other': 'Sonstiges'
  };
  return labels[type] || type;
}

function getAppointmentStatusLabel(status) {
  const labels = {
    'pending': '<i class="fas fa-clock"></i> Ausstehend',
    'confirmed': '<i class="fas fa-check"></i> Bestätigt',
    'cancelled': '<i class="fas fa-times"></i> Abgesagt',
    'completed': '<i class="fas fa-check-double"></i> Abgeschlossen'
  };
  return labels[status] || status;
}

// ==================== INIT ====================
checkAuth();
initPortalNavigation();

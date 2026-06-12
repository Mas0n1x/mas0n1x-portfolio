const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push('[' + m.type() + '] ' + m.text()); });
  page.on('response', r => { if (r.status()>=400) logs.push('[HTTP '+r.status()+'] '+r.url()); });
  page.on('pageerror', e => logs.push('[PAGEERROR] ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 5).join('\n')));

  // fetch mocken: eingeloggt + realistische Dashboard-Daten -> showDashboard rendert alles
  await page.evaluateOnNewDocument(() => {
    const mock = (url) => {
      if (url.includes('/auth/check')) return { authenticated: true };
      if (url.includes('/dashboard')) return { stats: { projects: 3, customers: 2, openRequests: 1, invoices: 4 }, revenue: { total: 1000, paid: 500, open: 300, overdue: 200 }, activities: [{ type: 'invoice_created', description: 'Test', created_at: '2026-06-12T10:00:00Z' }, { type: 'request_received', description: 'Neu', created_at: '2026-06-12T09:00:00Z' }] };
      if (url.includes('/services')) return [{ id: 1, icon: 'fas fa-code', title: 'Web', description: 'x', sort_order: 0 }];
      if (url.includes('/github/projects')) return [{ id: 1, title: 'Repo', description: 'x', tags: 'a,b', link: '#', status: 'active', sort_order: 0 }];
      if (url.includes('/requests')) return [{ id: 1, status: 'new', customer_name: 'Max', customer_email: 'a@b.de', project_type: 'web', budget: '500', timeline: 'asap', description: 'x', created_at: '2026-06-12T10:00:00Z', unread: 0 }];
      if (url.includes('/maintenance')) return { enabled: false };
      if (url.includes('/settings')) return {};
      return [];
    };
    window.fetch = (url, opts) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mock(String(url))), text: () => Promise.resolve('') });
  });

  try { await page.goto('https://mas0n1x.online/admin/', { waitUntil: 'networkidle2', timeout: 30000 }); } catch (e) { logs.push('[GOTO] ' + e.message); }
  await new Promise(r => setTimeout(r, 2500));
  const state = await page.evaluate(() => {
    const d = document.getElementById('admin-dashboard');
    const l = document.getElementById('login-screen');
    return { dashHidden: d ? d.classList.contains('hidden') : 'kein dash', loginHidden: l ? l.classList.contains('hidden') : 'kein login', bodyLen: document.body.innerText.length };
  });
  console.log('=== FEHLER ===');
  console.log(logs.join('\n') || '(keine)');
  console.log('=== Zustand: ' + JSON.stringify(state) + ' ===');
  await browser.close();
})();

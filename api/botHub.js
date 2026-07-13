/*
 * Mas0n1x Portfolio
 * Copyright (c) 2024-2026 DEV Mas0n1x.
 * Alle Rechte vorbehalten.
 */

// Schlanker Outbound-Helfer zur zentralen Bot-Zentrale (Homelab-Dashboard).
// Ersetzt den früher in-process laufenden Discord-Bot: statt selbst Nachrichten
// zu senden, meldet das Portfolio nur noch Ereignisse an die Bot-Zentrale, die
// den eigentlichen Versand übernimmt. Fire-and-forget: wirft nie, blockiert nie.

let _warned = false;

/**
 * Meldet ein Ereignis an die Bot-Zentrale. Fehlt die Konfiguration
 * (BOT_HUB_URL / BOT_HUB_TOKEN), passiert still nichts.
 * @param {object} event - z.B. { type: 'request', request, customer } oder { type: 'alert', title, description }
 */
function notifyBotHub(event) {
  const url = process.env.BOT_HUB_URL;
  const token = process.env.BOT_HUB_TOKEN;
  if (!url || !token) {
    if (!_warned) {
      console.warn('[botHub] BOT_HUB_URL/BOT_HUB_TOKEN nicht gesetzt — Bot-Benachrichtigungen deaktiviert.');
      _warned = true;
    }
    return;
  }

  try {
    fetch(`${url}/api/bots/portfolio/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10000)
    }).catch((e) => {
      console.error('[botHub] Zustellung fehlgeschlagen:', e.message);
    });
  } catch (e) {
    // Absolute Absicherung — darf den Aufrufer niemals stören.
    console.error('[botHub] Unerwarteter Fehler:', e.message);
  }
}

module.exports = { notifyBotHub };

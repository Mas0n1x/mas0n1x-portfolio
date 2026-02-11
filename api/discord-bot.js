const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionsBitField,
  ChannelType, Events, Partials, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  SectionBuilder, ThumbnailBuilder } = require('discord.js');
const crypto = require('crypto');

// ── Components V2 Flag ──────────────────────────────────────────
const CV2_FLAGS = MessageFlags.IsComponentsV2 || (1 << 15);

// ── Default Content ─────────────────────────────────────────────

const DEFAULT_RULES_SECTIONS = [
  {
    title: '§1 Allgemeines',
    rules: [
      'Dieser Server dient als offizielle Plattform für Support, Projektanfragen und den Austausch rund um Softwareentwicklung.',
      'Es gelten die offiziellen Discord [Nutzungsbedingungen](https://discord.com/terms) sowie die Discord [Community-Richtlinien](https://discord.com/guidelines).',
      'Unwissenheit über die Regeln schützt nicht vor Konsequenzen.',
      'Jeder Nutzer ist für sein eigenes Verhalten auf diesem Server verantwortlich.',
      'Das Serverteam behält sich das Recht vor, Regeln jederzeit anzupassen.',
    ]
  },
  {
    title: '§2 Verhalten & Respekt',
    rules: [
      'Behandle alle Mitglieder respektvoll – kein Mobbing, keine Diskriminierung, kein Hass.',
      'Provokationen, Beleidigungen oder absichtliche Störungen sind verboten.',
      'Diskriminierende oder beleidigende Inhalte werden nicht toleriert.',
      'Toxisches Verhalten, Trolling oder passiv-aggressives Auftreten ist unerwünscht.',
      'Respektiere die Meinungen anderer, auch wenn du anderer Ansicht bist.',
    ]
  },
  {
    title: '§3 Sprache & Inhalte',
    rules: [
      'Inhalte müssen jugendfreundlich und gesetzeskonform sein.',
      'Kein NSFW-/18+ Material, keine extremistischen oder illegalen Inhalte.',
      'Werbung oder Spam sind nur mit ausdrücklicher Erlaubnis der Serverleitung erlaubt.',
      'Keine Kettenbriefe, Pyramid-Schemes oder dubiose Angebote.',
      'Die Serversprache ist Deutsch und Englisch.',
    ]
  },
  {
    title: '§4 Sicherheit & Datenschutz',
    rules: [
      'Veröffentliche keine privaten Daten (eigene oder fremde) ohne Einverständnis.',
      'Betrug, Phishing oder das Teilen schadhafter Dateien ist strengstens untersagt.',
      'Screenshots oder Aufnahmen von privaten Gesprächen dürfen nur mit Erlaubnis geteilt werden.',
      'Teile niemals Passwörter, API-Keys oder andere sensible Daten in öffentlichen Kanälen.',
      'Melde verdächtige Accounts oder Nachrichten sofort dem Serverteam.',
    ]
  },
  {
    title: '§5 Kanäle & Themen',
    rules: [
      'Nutze die Kanäle nur für ihren vorgesehenen Zweck.',
      'Achte auf die Kanalbeschreibungen und halte dich an vorgegebene Themen.',
      'Spam, Flooding oder unnötiges Pingen anderer Nutzer ist zu unterlassen.',
      'Vermeide Off-Topic Diskussionen – nutze dafür den passenden Kanal.',
      'Keine übermäßige Verwendung von Caps-Lock, Emojis oder Stickern.',
    ]
  },
  {
    title: '§6 Support & Projekte',
    rules: [
      'Beschreibe dein Anliegen im Ticket so genau wie möglich, damit wir dir schnell helfen können.',
      'Hab Geduld – unser Team bearbeitet Anfragen so schnell wie möglich.',
      'Spam in DMs an Teammitglieder ist verboten. Nutze das Ticketsystem.',
      'Öffne pro Anliegen nur ein Ticket. Doppelte Tickets werden geschlossen.',
      'Lies dir die FAQ und bestehende Informationen durch, bevor du ein Ticket erstellst.',
      'Bezahlte Projekte unterliegen separaten Vereinbarungen und AGB.',
    ]
  },
  {
    title: '§7 Geistiges Eigentum',
    rules: [
      'Respektiere das geistige Eigentum anderer – kein Kopieren oder Weitergeben fremder Arbeiten.',
      'Teile keinen Code, Designs oder Dateien, die du nicht besitzt oder weitergeben darfst.',
      'Von uns erstellte Projekte unterliegen unseren Lizenzbedingungen.',
      'Bei Open-Source-Projekten sind die jeweiligen Lizenzen zu beachten.',
    ]
  },
  {
    title: '§8 Voice-Kanäle',
    rules: [
      'Kein Soundboard-Spam, Stimmverzerrer-Missbrauch oder absichtliche Störgeräusche.',
      'Respektiere laufende Gespräche und frag bevor du mitmachst.',
      'Streame keine urheberrechtlich geschützten Inhalte.',
    ]
  },
  {
    title: '§9 Team & Entscheidungen',
    rules: [
      'Den Anweisungen des Serverteams ist Folge zu leisten.',
      'Entscheidungen des Teams sind bindend und nicht öffentlich zu diskutieren.',
      'Bei Problemen kann jederzeit ein Teammitglied per Ticket kontaktiert werden.',
      'Impersonation von Teammitgliedern oder anderen Nutzern ist verboten.',
    ]
  },
  {
    title: '§10 Sanktionen',
    rules: [
      'Regelverstöße können zu Verwarnungen, Mutes, Kicks oder permanenten Bans führen.',
      'Die Art der Sanktion liegt im Ermessen des Serverteams.',
      'Wiederholte Verstöße führen zu einer dauerhaften Entfernung vom Server.',
      'Umgehung von Sanktionen (z.B. mit Alt-Accounts) führt zu einem permanenten Ban.',
      'Falsche Anschuldigungen gegenüber anderen Nutzern oder dem Team werden ebenfalls sanktioniert.',
    ]
  },
];

const DEFAULT_SERVICES = [
  {
    emoji: '💻',
    name: 'Web-Entwicklung',
    description: 'Moderne, responsive Websites und Web-Applikationen mit aktuellen Technologien und Best Practices. Von einfachen Landing Pages bis zu komplexen Web-Applikationen mit Admin-Dashboards und Kundenportalen.',
    features: '➜ Responsive Design für alle Geräte\n➜ SEO-Optimierung & Performance\n➜ Moderne Frameworks & sauberer Code\n➜ Admin-Dashboards & CMS-Integration',
    price: 'ab 499€',
    color: '#00ff88',
  },
  {
    emoji: '📱',
    name: 'App-Entwicklung',
    description: 'Native und Cross-Platform Apps mit intuitiver User Experience. Individuell entwickelte Anwendungen für Desktop und Mobile, zugeschnitten auf deine Bedürfnisse.',
    features: '➜ Cross-Platform Kompatibilität\n➜ Intuitive Benutzeroberfläche\n➜ Offline-Funktionalität\n➜ Push-Benachrichtigungen & Updates',
    price: 'ab 799€',
    color: '#00d4ff',
  },
  {
    emoji: '🤖',
    name: 'Discord Bots',
    description: 'Maßgeschneiderte Discord Bot Entwicklung für Moderation, Unterhaltung und Verwaltung. Von einfachen Utility-Bots bis zu komplexen Systemen mit Datenbank-Anbindung.',
    features: '➜ Moderation & Auto-Moderation\n➜ Ticket- & Supportsysteme\n➜ Custom Commands & Interaktionen\n➜ Dashboard & Web-Interface',
    price: 'ab 199€',
    color: '#a855f7',
  },
  {
    emoji: '⚙️',
    name: 'Backend-Systeme',
    description: 'Skalierbare APIs, Datenbanken und Server-Infrastruktur. Robuste Backend-Lösungen die zuverlässig und performant arbeiten.',
    features: '➜ REST & GraphQL APIs\n➜ Datenbank-Design & Optimierung\n➜ Docker & Server-Setup\n➜ Monitoring & Wartung',
    price: 'ab 599€',
    color: '#ffaa00',
  },
  {
    emoji: '🎨',
    name: 'Frontend-Systeme',
    description: 'Interaktive Benutzeroberflächen mit modernen Frameworks und sauberem Code. Pixel-perfektes Design mit flüssigen Animationen und optimaler User Experience.',
    features: '➜ Moderne UI/UX Design\n➜ Animationen & Micro-Interactions\n➜ Barrierefreiheit & Accessibility\n➜ Performance-Optimierung',
    price: 'ab 399€',
    color: '#00ff88',
  },
  {
    emoji: '🐧',
    name: 'Linux Server Setup',
    description: 'Professionelle Einrichtung und Konfiguration von Linux-Servern für Hosting, Gameserver und Entwicklungsumgebungen. Sicher, performant und auf deine Anforderungen zugeschnitten.',
    features: '➜ Server-Installation & Härtung\n➜ Docker & Container-Setup\n➜ Nginx, Apache & Reverse Proxy\n➜ Monitoring, Backups & Wartung',
    price: 'ab 149€',
    color: '#f97316',
  },
];

const DEFAULT_SOCIALS = {
  title: '🌐 Social Media & Kontakt',
  description: 'Hier findest du alle wichtigen Links, um mit mir in Kontakt zu treten oder meine Arbeit zu verfolgen.',
  links: [
    { emoji: '💬', name: 'Discord', url: 'https://discord.com/users/388425445793857559', description: 'Direkter Kontakt via Discord' },
    { emoji: '🐙', name: 'GitHub', url: 'https://github.com/Mas0n1x', description: 'Open-Source Projekte & Code' },
    { emoji: '📧', name: 'E-Mail', url: 'mailto:bleckermax11@gmail.com', description: 'Geschäftliche Anfragen per E-Mail' },
    { emoji: '🌍', name: 'Portfolio', url: 'https://mas0n1x.dev', description: 'Mein Portfolio mit allen Projekten' },
  ]
};

const DEFAULT_TICKET_CATEGORIES = [
  { name: 'Allgemeine Frage', emoji: '❓', description: 'Allgemeine Fragen zum Server oder zu Services' },
  { name: 'Projektanfrage', emoji: '📩', description: 'Neue Projektanfrage oder Auftragsarbeit' },
  { name: 'Tech-Support', emoji: '🔧', description: 'Technische Hilfe bei bestehendem Projekt' },
  { name: 'Bug-Report', emoji: '🐛', description: 'Fehler in einem bestehenden Projekt melden' },
];

// ── Bot Class ───────────────────────────────────────────────────

class DiscordBot {
  constructor(dbHelpers) {
    this.client = null;
    this.dbGet = dbHelpers.dbGet;
    this.dbAll = dbHelpers.dbAll;
    this.dbRun = dbHelpers.dbRun;
    this.isConnected = false;
    this.startTime = null;
  }

  // ── Config Helpers ──────────────────────────────────────────────

  getConfig(key) {
    const row = this.dbGet('SELECT value FROM discord_config WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  setConfig(key, value) {
    const existing = this.dbGet('SELECT key FROM discord_config WHERE key = ?', [key]);
    if (existing) {
      this.dbRun('UPDATE discord_config SET value = ?, updated_at = datetime("now") WHERE key = ?', [value, key]);
    } else {
      this.dbRun('INSERT INTO discord_config (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  getAllConfig() {
    const rows = this.dbAll('SELECT key, value FROM discord_config');
    const config = {};
    rows.forEach(row => { config[row.key] = row.value; });
    return config;
  }

  saveAllConfig(configObj) {
    for (const [key, value] of Object.entries(configObj)) {
      if (value !== undefined && value !== null) {
        this.setConfig(key, String(value));
      }
    }
  }

  // ── Logging ─────────────────────────────────────────────────────

  log(type, channelId, messageId, userId, details) {
    this.dbRun(
      'INSERT INTO discord_logs (type, channel_id, message_id, user_id, details) VALUES (?, ?, ?, ?, ?)',
      [type, channelId || null, messageId || null, userId || null, typeof details === 'object' ? JSON.stringify(details) : details || null]
    );
  }

  getLogs(limit = 50, offset = 0, type = null) {
    if (type) {
      return this.dbAll('SELECT * FROM discord_logs WHERE type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [type, limit, offset]);
    }
    return this.dbAll('SELECT * FROM discord_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
  }

  clearLogs() {
    this.dbRun('DELETE FROM discord_logs');
  }

  // ── Bot Lifecycle ───────────────────────────────────────────────

  async start() {
    if (this.client) {
      await this.stop();
    }

    const token = process.env.DISCORD_BOT_TOKEN || this.getConfig('bot_token');
    if (!token) {
      throw new Error('Kein Bot-Token konfiguriert');
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
      ],
      partials: [Partials.Message, Partials.Reaction, Partials.User],
    });

    this._registerEvents();

    await this.client.login(token);
    this.isConnected = true;
    this.startTime = Date.now();
    this.log('system', null, null, null, { action: 'bot_started' });
    console.log('Discord Bot connected');
  }

  async stop() {
    if (this.client) {
      this.log('system', null, null, null, { action: 'bot_stopped' });
      await this.client.destroy();
      this.client = null;
      this.isConnected = false;
      this.startTime = null;
      console.log('Discord Bot disconnected');
    }
  }

  getStatus() {
    if (!this.client || !this.isConnected) {
      return { connected: false, guild: null, memberCount: 0, uptime: 0, ping: 0 };
    }

    const guildId = this.getConfig('guild_id');
    const guild = guildId ? this.client.guilds.cache.get(guildId) : this.client.guilds.cache.first();
    const allGuilds = this.client.guilds.cache.map(g => ({ id: g.id, name: g.name }));

    return {
      connected: true,
      guild: guild ? { id: guild.id, name: guild.name, icon: guild.iconURL() } : null,
      memberCount: guild ? guild.memberCount : 0,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      ping: this.client.ws.ping,
      username: this.client.user?.tag || null,
      avatar: this.client.user?.displayAvatarURL() || null,
      availableGuilds: allGuilds,
    };
  }

  // ── Event Registration ──────────────────────────────────────────

  _registerEvents() {
    this.client.once(Events.ClientReady, () => {
      console.log(`Discord Bot ready as ${this.client.user.tag}`);
    });

    this.client.on(Events.GuildMemberAdd, (member) => this._onMemberJoin(member));
    this.client.on(Events.GuildMemberRemove, (member) => this._onMemberLeave(member));
    this.client.on(Events.MessageReactionAdd, (reaction, user) => this._onReactionAdd(reaction, user));
    this.client.on(Events.InteractionCreate, (interaction) => this._onInteraction(interaction));
    this.client.on(Events.GuildBanAdd, (ban) => this._onModAction('ban', ban));
    this.client.on(Events.GuildBanRemove, (ban) => this._onModAction('unban', ban));
    this.client.on(Events.GuildMemberUpdate, (oldMember, newMember) => this._onMemberUpdate(oldMember, newMember));
    this.client.on(Events.MessageDelete, (message) => this._onMessageDelete(message));
  }

  // ── Welcome (Components V2) ────────────────────────────────────

  _buildWelcomeComponents({ userId, username, avatarUrl, guildName, memberCount, isTest }) {
    const msgConfig = this._parseJSON(this.getConfig('msg_welcome'), {
      title: 'Willkommen!',
      description: 'Willkommen auf dem Server, {user}!',
      color: '#00ff88',
      footer: 'Mitglied #{memberCount}'
    });

    const userMention = isTest ? '@TestUser' : `<@${userId}>`;
    const count = isTest ? '???' : String(memberCount);

    const description = (msgConfig.description || '')
      .replace(/{user}/g, userMention)
      .replace(/{username}/g, username)
      .replace(/{server}/g, guildName)
      .replace(/{memberCount}/g, count);

    const footer = (msgConfig.footer || '')
      .replace(/{memberCount}/g, count);

    const rulesChannelId = this.getConfig('channel_rules');
    const productsChannelId = this.getConfig('channel_products');
    const socialChannelId = this.getConfig('channel_social');

    const container = new ContainerBuilder()
      .setAccentColor(this._parseColor(msgConfig.color));

    // Welcome header with avatar
    const welcomeSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 👋 ${msgConfig.title || 'Willkommen!'}\n` +
          `Hey ${userMention}!\n${description}`
        )
      );

    if (avatarUrl) {
      welcomeSection.setThumbnailAccessory(
        new ThumbnailBuilder().setURL(avatarUrl)
      );
    }

    container.addSectionComponents(welcomeSection);
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // About
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### 🖥️ Über diesen Server\n' +
        'Dies ist der offizielle **Mas0n1x Development** Discord Server.\n' +
        'Hier findest du Support, kannst Projekte anfragen und dich mit der Community austauschen.'
      )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Getting started
    let stepsText = '### 📌 Erste Schritte\n';

    if (rulesChannelId) {
      stepsText += `**1.** 📜 Lies dir die Regeln in <#${rulesChannelId}> durch und akzeptiere sie\n`;
    } else {
      stepsText += '**1.** 📜 Lies dir die Serverregeln durch und akzeptiere sie\n';
    }
    stepsText += '**2.** 💬 Stell dich gerne in der Community vor\n';
    stepsText += '**3.** 🎫 Für Support oder Projektanfragen öffne ein **Ticket**\n';
    if (productsChannelId) {
      stepsText += `**4.** 🛒 Schau dir unsere Services & Preise in <#${productsChannelId}> an\n`;
    } else {
      stepsText += '**4.** 🛒 Schau dir unsere Services & Preise an\n';
    }
    if (socialChannelId) {
      stepsText += `**5.** 🌐 Folge uns auf Social Media — alle Links in <#${socialChannelId}>`;
    } else {
      stepsText += '**5.** 🌐 Folge uns auf Social Media für aktuelle Updates';
    }

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(stepsText)
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Footer
    let footerText = '';
    if (isTest) {
      footerText = `-# 🧪 Test-Nachricht · ${footer || `Du bist unser ${count}. Mitglied!`}`;
    } else {
      footerText = `-# ${footer || `Du bist unser ${count}. Mitglied!`} · Viel Spaß auf dem Server!`;
    }
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footerText)
    );

    return [container];
  }

  async _onMemberJoin(member) {
    const channelId = this.getConfig('channel_welcome');
    const enabled = this.getConfig('welcome_enabled');
    if (!channelId || enabled === 'false') return;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return;

      const components = this._buildWelcomeComponents({
        userId: member.id,
        username: member.user.username,
        avatarUrl: member.user.displayAvatarURL({ size: 128 }),
        guildName: member.guild.name,
        memberCount: member.guild.memberCount,
        isTest: false,
      });

      const sent = await channel.send({
        components,
        flags: CV2_FLAGS,
      });

      this.log('welcome', channelId, sent.id, member.id, { username: member.user.username });
    } catch (e) {
      console.error('Welcome message error:', e.message);
    }
  }

  // ── Leave (Components V2) ──────────────────────────────────────

  async _onMemberLeave(member) {
    const channelId = this.getConfig('channel_welcome');
    const enabled = this.getConfig('leave_enabled');
    if (!channelId || enabled === 'false') return;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return;

      const msgConfig = this._parseJSON(this.getConfig('msg_leave'), {
        title: 'Auf Wiedersehen!',
        description: '{username} hat den Server verlassen.',
        color: '#ff4444'
      });

      const description = (msgConfig.description || '')
        .replace(/{user}/g, `<@${member.id}>`)
        .replace(/{username}/g, member.user.username)
        .replace(/{server}/g, member.guild.name)
        .replace(/{memberCount}/g, String(member.guild.memberCount));

      // ── Container: Leave Message ──
      const container = new ContainerBuilder()
        .setAccentColor(this._parseColor(msgConfig.color));

      const leaveSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 👋 ${msgConfig.title || 'Auf Wiedersehen!'}\n${description}`
          )
        );

      const avatarUrl = member.user.displayAvatarURL({ size: 128 });
      if (avatarUrl) {
        leaveSection.setThumbnailAccessory(
          new ThumbnailBuilder().setURL(avatarUrl)
        );
      }

      container.addSectionComponents(leaveSection);

      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

      // Join date info
      const joinedAt = member.joinedAt;
      let durationText = '';
      if (joinedAt) {
        const days = Math.floor((Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24));
        if (days < 1) durationText = 'weniger als einen Tag';
        else if (days === 1) durationText = '1 Tag';
        else if (days < 30) durationText = `${days} Tage`;
        else if (days < 365) durationText = `${Math.floor(days / 30)} Monat(e)`;
        else durationText = `${Math.floor(days / 365)} Jahr(e)`;
      }

      let statsText = '### 📊 Mitglied-Info\n';
      if (durationText) {
        statsText += `➜ **Dabei seit:** ${durationText}\n`;
      }
      statsText += `➜ **Beigetreten:** <t:${Math.floor((joinedAt?.getTime() || Date.now()) / 1000)}:D>\n`;
      statsText += `➜ **Verbleibende Mitglieder:** ${member.guild.memberCount}`;

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(statsText)
      );

      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '-# Wir wünschen dir alles Gute auf deinem weiteren Weg. Du bist jederzeit wieder willkommen! 💚'
        )
      );

      const sent = await channel.send({
        components: [container],
        flags: CV2_FLAGS,
      });

      this.log('leave', channelId, sent.id, member.id, { username: member.user.username });
    } catch (e) {
      console.error('Leave message error:', e.message);
    }
  }

  // ── Auto-Role via Reaction ──────────────────────────────────────

  async _onReactionAdd(reaction, user) {
    if (user.bot) return;

    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }

    const rulesMessageId = this.getConfig('rules_message_id');
    if (!rulesMessageId || reaction.message.id !== rulesMessageId) return;

    const roleId = this.getConfig('role_autorole') || '1412684258631356416';
    const guild = reaction.message.guild;

    try {
      const member = await guild.members.fetch(user.id);
      await member.roles.add(roleId);
      this.log('autorole', reaction.message.channel.id, null, user.id, { role: roleId, username: user.username });
    } catch (e) {
      console.error('Auto-role error:', e.message);
    }
  }

  // ── Ticket System ───────────────────────────────────────────────

  async _onInteraction(interaction) {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('ticket_create_')) {
      const category = interaction.customId.replace('ticket_create_', '');
      await this._handleTicketCreate(interaction, category);
    } else if (interaction.customId === 'ticket_close') {
      await this._handleTicketClose(interaction);
    }
  }

  async _handleTicketCreate(interaction, category) {
    const guild = interaction.guild;
    const ticketCategoryId = this.getConfig('channel_tickets');
    const supportRoleId = this.getConfig('role_support');

    if (!ticketCategoryId) {
      return interaction.reply({ content: 'Ticket-System nicht konfiguriert.', flags: 64 });
    }

    const existingChannel = guild.channels.cache.find(
      ch => ch.name.startsWith(`ticket-${interaction.user.username.toLowerCase()}`) && ch.parentId === ticketCategoryId
    );
    if (existingChannel) {
      return interaction.reply({ content: `Du hast bereits ein offenes Ticket: ${existingChannel}`, flags: 64 });
    }

    try {
      const permissionOverwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] },
      ];

      if (supportRoleId) {
        permissionOverwrites.push({
          id: supportRoleId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles]
        });
      }

      const ticketChannel = await guild.channels.create({
        name: `ticket-${interaction.user.username}-${Date.now().toString(36)}`,
        type: ChannelType.GuildText,
        parent: ticketCategoryId,
        permissionOverwrites,
      });

      const welcomeMsg = this.getConfig('ticket_welcome_msg') || 'Beschreibe dein Anliegen so detailliert wie möglich.\nEin Teammitglied wird sich so schnell wie möglich bei dir melden.';

      // Ticket welcome with Components V2
      const ticketContainer = new ContainerBuilder()
        .setAccentColor(0x00ff88);

      const ticketSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🎫 Ticket: ${category}\n` +
            `**Erstellt von:** <@${interaction.user.id}>\n` +
            `**Kategorie:** ${category}`
          )
        );

      const userAvatar = interaction.user.displayAvatarURL({ size: 64 });
      if (userAvatar) {
        ticketSection.setThumbnailAccessory(
          new ThumbnailBuilder().setURL(userAvatar)
        );
      }

      ticketContainer.addSectionComponents(ticketSection);
      ticketContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

      ticketContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### 📝 Beschreibung\n${welcomeMsg}`
        )
      );

      ticketContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

      ticketContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '### ⏱️ Bearbeitungszeit\n' +
          'Unser Team bearbeitet Tickets in der Regel innerhalb von **24 Stunden**.\n' +
          'Bei dringenden Anfragen erwähne bitte ein Teammitglied.'
        )
      );

      // Close button
      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Ticket schliessen')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      );

      ticketContainer.addActionRowComponents(closeRow);

      const mentions = supportRoleId ? `<@${interaction.user.id}> <@&${supportRoleId}>` : `<@${interaction.user.id}>`;
      await ticketChannel.send({ content: mentions });
      await ticketChannel.send({
        components: [ticketContainer],
        flags: CV2_FLAGS,
      });

      await interaction.reply({ content: `Ticket erstellt: ${ticketChannel}`, flags: 64 });
      this.log('ticket', ticketChannel.id, null, interaction.user.id, { category, action: 'created' });
    } catch (e) {
      console.error('Ticket create error:', e.message);
      await interaction.reply({ content: 'Fehler beim Erstellen des Tickets.', flags: 64 }).catch(() => {});
    }
  }

  async _handleTicketClose(interaction) {
    const channel = interaction.channel;
    const logChannelId = this.getConfig('channel_ticket_logs');

    try {
      if (logChannelId) {
        const logChannel = await this.client.channels.fetch(logChannelId);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setTitle('Ticket geschlossen')
            .setDescription(`**Channel:** ${channel.name}\n**Geschlossen von:** <@${interaction.user.id}>`)
            .setColor(0xff4444)
            .setTimestamp();
          await logChannel.send({ embeds: [embed] });
        }
      }

      await interaction.reply({ content: 'Ticket wird in 5 Sekunden geschlossen...' });
      this.log('ticket', channel.id, null, interaction.user.id, { action: 'closed', channelName: channel.name });

      setTimeout(() => {
        channel.delete().catch(e => console.error('Ticket delete error:', e.message));
      }, 5000);
    } catch (e) {
      console.error('Ticket close error:', e.message);
    }
  }

  // ── Moderation Logs (Embeds – internal messages) ───────────────

  async _onModAction(type, ban) {
    const channelId = this.getConfig('channel_modlog');
    const enabled = this.getConfig('modlog_enabled');
    if (!channelId || enabled === 'false') return;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return;

      const colors = { ban: 0xff4444, unban: 0x00ff88, kick: 0xffaa00, timeout: 0xffaa00 };
      const labels = { ban: 'Gebannt', unban: 'Entbannt', kick: 'Gekickt', timeout: 'Timeout' };

      const embed = new EmbedBuilder()
        .setTitle(`Mod-Log: ${labels[type] || type}`)
        .setDescription(`**User:** ${ban.user.tag} (${ban.user.id})`)
        .setColor(colors[type] || 0xffffff)
        .setTimestamp();

      if (ban.reason) embed.addFields({ name: 'Grund', value: ban.reason });

      const sent = await channel.send({ embeds: [embed] });
      this.log('modlog', channelId, sent.id, ban.user.id, { type, username: ban.user.tag });
    } catch (e) {
      console.error('Mod log error:', e.message);
    }
  }

  async _onMemberUpdate(oldMember, newMember) {
    const channelId = this.getConfig('channel_modlog');
    const enabled = this.getConfig('modlog_enabled');
    if (!channelId || enabled === 'false') return;

    if (!oldMember.communicationDisabledUntilTimestamp && newMember.communicationDisabledUntilTimestamp) {
      try {
        const channel = await this.client.channels.fetch(channelId);
        if (!channel) return;

        const embed = new EmbedBuilder()
          .setTitle('Mod-Log: Timeout')
          .setDescription(`**User:** ${newMember.user.tag} (${newMember.user.id})`)
          .addFields({ name: 'Bis', value: `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>` })
          .setColor(0xffaa00)
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        this.log('modlog', channelId, null, newMember.user.id, { type: 'timeout', username: newMember.user.tag });
      } catch (e) {
        console.error('Timeout log error:', e.message);
      }
    }

    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

    if (addedRoles.size > 0 || removedRoles.size > 0) {
      const logRoleChanges = this.getConfig('modlog_role_changes');
      if (logRoleChanges === 'false') return;

      try {
        const channel = await this.client.channels.fetch(channelId);
        if (!channel) return;

        const fields = [];
        if (addedRoles.size > 0) fields.push({ name: 'Hinzugefuegt', value: addedRoles.map(r => r.name).join(', ') });
        if (removedRoles.size > 0) fields.push({ name: 'Entfernt', value: removedRoles.map(r => r.name).join(', ') });

        const embed = new EmbedBuilder()
          .setTitle('Mod-Log: Rollenänderung')
          .setDescription(`**User:** ${newMember.user.tag}`)
          .addFields(fields)
          .setColor(0x00d4ff)
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } catch (e) {
        console.error('Role change log error:', e.message);
      }
    }
  }

  async _onMessageDelete(message) {
    if (message.partial || message.author?.bot) return;

    const channelId = this.getConfig('channel_modlog');
    const enabled = this.getConfig('modlog_enabled');
    const logDeletes = this.getConfig('modlog_message_delete');
    if (!channelId || enabled === 'false' || logDeletes === 'false') return;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setTitle('Mod-Log: Nachricht gelöscht')
        .setDescription(`**Author:** ${message.author?.tag || 'Unbekannt'}\n**Channel:** <#${message.channel.id}>`)
        .setColor(0xff4444)
        .setTimestamp();

      if (message.content) {
        embed.addFields({ name: 'Inhalt', value: message.content.substring(0, 1024) });
      }

      await channel.send({ embeds: [embed] });
    } catch (e) {
      console.error('Message delete log error:', e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  SEND ACTIONS (Components V2) — called from Admin API
  // ══════════════════════════════════════════════════════════════════

  // ── Welcome Test ──────────────────────────────────────────────

  async sendWelcomeTest(channelId) {
    if (!this.client || !this.isConnected) throw new Error('Bot nicht verbunden');

    const channel = await this.client.channels.fetch(channelId);
    if (!channel) throw new Error('Channel nicht gefunden');

    const guild = channel.guild;
    const botAvatar = this.client.user?.displayAvatarURL({ size: 128 });

    const components = this._buildWelcomeComponents({
      userId: this.client.user?.id,
      username: 'TestUser',
      avatarUrl: botAvatar,
      guildName: guild?.name || 'Test Server',
      memberCount: guild?.memberCount || 0,
      isTest: true,
    });

    const sent = await channel.send({
      components,
      flags: CV2_FLAGS,
    });

    this.log('welcome_test', channelId, sent.id, null, { test: true });
    return sent.id;
  }

  // ── Rules (Components V2) ────────────────────────────────────

  async sendRulesEmbed(channelId) {
    if (!this.client || !this.isConnected) throw new Error('Bot nicht verbunden');

    const channel = await this.client.channels.fetch(channelId);
    if (!channel) throw new Error('Channel nicht gefunden');

    const rulesData = this._parseJSON(this.getConfig('msg_rules'), null);
    const configColor = rulesData?.color || '#ff4444';
    const configTitle = rulesData?.title || '📜 Serverregeln';
    const configFooter = rulesData?.footer || 'Reagiere mit ✅ um die Regeln zu akzeptieren und Zugang zum Server zu erhalten!';

    // Determine sections: use config sections, convert flat rules, or use defaults
    let sections;
    if (rulesData?.sections && rulesData.sections.length > 0) {
      sections = rulesData.sections;
    } else if (rulesData?.rules && rulesData.rules.length > 0) {
      sections = [{ title: 'Regeln', rules: rulesData.rules }];
    } else {
      sections = DEFAULT_RULES_SECTIONS;
    }

    const accentColor = this._parseColor(configColor);

    // ── Header message ──
    const headerContainer = new ContainerBuilder()
      .setAccentColor(accentColor);

    headerContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${configTitle}\n` +
        'Bitte lies dir die folgenden Regeln sorgfältig durch.\n' +
        'Mit dem Beitritt zum Server und dem Akzeptieren der Regeln erklärst du dich mit allen Punkten einverstanden.\n' +
        'Bei Fragen wende dich an das Serverteam.'
      )
    );

    await channel.send({ components: [headerContainer], flags: CV2_FLAGS });

    // ── Rules messages (2 sections per message to stay within 4000 char limit) ──
    const chunkSize = 2;
    for (let i = 0; i < sections.length; i += chunkSize) {
      const chunk = sections.slice(i, i + chunkSize);
      const container = new ContainerBuilder()
        .setAccentColor(accentColor);

      chunk.forEach((section, idx) => {
        if (idx > 0) {
          container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        }

        const rulesText = section.rules.map(r => `— ${r}`).join('\n');
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### ${section.title}\n${rulesText}`)
        );
      });

      await channel.send({ components: [container], flags: CV2_FLAGS });
    }

    // ── Footer message with accept reaction ──
    const footerContainer = new ContainerBuilder()
      .setAccentColor(0x00ff88);

    footerContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ✅ Regeln akzeptieren\n${configFooter}`
      )
    );

    const sent = await channel.send({ components: [footerContainer], flags: CV2_FLAGS });

    // Add reaction for auto-role on the footer message
    const reactionEmoji = this.getConfig('rules_reaction_emoji') || '✅';
    await sent.react(reactionEmoji);

    this.setConfig('rules_message_id', sent.id);
    this.log('rules', channelId, sent.id, null, { rulesCount: sections.length });
    return sent.id;
  }

  // ── Products / Services (Components V2) ───────────────────────

  async sendProductEmbeds(channelId) {
    if (!this.client || !this.isConnected) throw new Error('Bot nicht verbunden');

    const channel = await this.client.channels.fetch(channelId);
    if (!channel) throw new Error('Channel nicht gefunden');

    const products = this._parseJSON(this.getConfig('msg_products'), null);
    const productList = (products && products.length > 0) ? products : DEFAULT_SERVICES;

    // Header container
    const headerContainer = new ContainerBuilder()
      .setAccentColor(0x00ff88);

    headerContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 🛒 Services & Produkte\n' +
        'Professionelle Entwicklungsdienstleistungen für dein Projekt.\n' +
        'Jedes Projekt wird individuell auf deine Bedürfnisse zugeschnitten.'
      )
    );

    headerContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    headerContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '**Technologien:** JavaScript · Node.js · Express · HTML/CSS · SQLite · Discord.js · Docker · Git\n' +
        '**Erfahrung:** Web-Apps · APIs · Dashboards · Discord Bots · Custom Tools'
      )
    );

    const sentMessages = [];

    // Send header
    const headerMsg = await channel.send({
      components: [headerContainer],
      flags: CV2_FLAGS,
    });
    sentMessages.push(headerMsg.id);

    // Send each product as its own message with a container
    for (const product of productList) {
      const productContainer = new ContainerBuilder()
        .setAccentColor(this._parseColor(product.color || '#00ff88'));

      // Product header with name and price
      let titleLine = `## ${product.emoji || ''} ${product.name}`.trim();
      productContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(titleLine)
      );

      // Description
      if (product.description) {
        productContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(product.description)
        );
      }

      productContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

      // Features and price side by side
      let detailsText = '';
      if (product.features) {
        detailsText += `### 📋 Features\n${product.features}\n`;
      }
      if (product.price) {
        detailsText += `\n**💰 Preis:** ${product.price}`;
      }

      if (detailsText) {
        productContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(detailsText.trim())
        );
      }

      const sent = await channel.send({
        components: [productContainer],
        flags: CV2_FLAGS,
      });
      sentMessages.push(sent.id);
    }

    // Closing container with CTA
    const ctaContainer = new ContainerBuilder()
      .setAccentColor(0x00d4ff);

    ctaContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### 💡 Interesse an einem Projekt?\n' +
        'Erstelle ein **Ticket** oder besuche unser **[Portfolio](https://mas0n1x.dev)** für weitere Informationen.\n' +
        'Wir freuen uns auf deine Anfrage!'
      )
    );

    const ctaMsg = await channel.send({
      components: [ctaContainer],
      flags: CV2_FLAGS,
    });
    sentMessages.push(ctaMsg.id);

    this.log('products', channelId, null, null, { count: sentMessages.length });
    return sentMessages;
  }

  // ── Social Links (Components V2) ──────────────────────────────

  async sendSocialEmbed(channelId) {
    if (!this.client || !this.isConnected) throw new Error('Bot nicht verbunden');

    const channel = await this.client.channels.fetch(channelId);
    if (!channel) throw new Error('Channel nicht gefunden');

    const socialData = this._parseJSON(this.getConfig('msg_social'), null);
    const title = socialData?.title || DEFAULT_SOCIALS.title;
    const description = socialData?.description || DEFAULT_SOCIALS.description;
    const links = (socialData?.links && socialData.links.length > 0) ? socialData.links : DEFAULT_SOCIALS.links;

    const container = new ContainerBuilder()
      .setAccentColor(0x00d4ff);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${title}\n${description}`)
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Build links text
    const linksText = links.map(l => {
      let line = `${l.emoji || '🔗'} **${l.name}**`;
      if (l.url) {
        if (l.url.startsWith('mailto:')) {
          line += ` — ${l.url.replace('mailto:', '')}`;
        } else {
          line += ` — ${l.url}`;
        }
      }
      if (l.description) {
        line += `\n-# ${l.description}`;
      }
      return line;
    }).join('\n\n');

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(linksText)
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Folge uns auf unseren Kanälen, um keine Updates zu verpassen!'
      )
    );

    // Add link buttons
    const buttonRow = new ActionRowBuilder();
    for (const link of links) {
      if (link.url && !link.url.startsWith('mailto:') && buttonRow.components.length < 5) {
        buttonRow.addComponents(
          new ButtonBuilder()
            .setLabel(link.name)
            .setURL(link.url)
            .setStyle(ButtonStyle.Link)
            .setEmoji(link.emoji || '🔗')
        );
      }
    }

    if (buttonRow.components.length > 0) {
      container.addActionRowComponents(buttonRow);
    }

    const sent = await channel.send({
      components: [container],
      flags: CV2_FLAGS,
    });

    this.log('social', channelId, sent.id, null, { linksCount: links.length });
    return sent.id;
  }

  // ── Ticket Panel (Components V2) ──────────────────────────────

  async createTicketPanel(channelId) {
    if (!this.client || !this.isConnected) throw new Error('Bot nicht verbunden');

    const channel = await this.client.channels.fetch(channelId);
    if (!channel) throw new Error('Channel nicht gefunden');

    const categories = this._parseJSON(this.getConfig('ticket_categories'), DEFAULT_TICKET_CATEGORIES);

    // Main info container
    const infoContainer = new ContainerBuilder()
      .setAccentColor(0x00ff88);

    infoContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 🎫 Support & Tickets\n' +
        'Du brauchst Hilfe oder hast eine Anfrage? Erstelle ein Ticket und unser Team kümmert sich darum!'
      )
    );

    infoContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    infoContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### 📌 So funktioniert es\n' +
        '**1.** Wähle eine passende Kategorie aus den Buttons unten\n' +
        '**2.** Ein privater Kanal wird automatisch für dich erstellt\n' +
        '**3.** Beschreibe dein Anliegen so detailliert wie möglich\n' +
        '**4.** Unser Team wird sich schnellstmöglich bei dir melden'
      )
    );

    infoContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Build category descriptions
    const categoriesText = categories.map(cat =>
      `${cat.emoji || '📝'} **${cat.name}** — ${cat.description || 'Keine Beschreibung'}`
    ).join('\n');

    infoContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### 📂 Kategorien\n${categoriesText}`
      )
    );

    infoContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    infoContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### ⏱️ Bearbeitungszeit\n' +
        'Tickets werden in der Regel innerhalb von **24 Stunden** bearbeitet.\n' +
        'Bitte erstelle pro Anliegen nur **ein** Ticket.'
      )
    );

    // Category buttons
    const rows = [];
    let currentRow = new ActionRowBuilder();
    categories.forEach((cat, i) => {
      if (i > 0 && i % 5 === 0) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      const button = new ButtonBuilder()
        .setCustomId(`ticket_create_${cat.name}`)
        .setLabel(cat.name)
        .setStyle(ButtonStyle.Primary);
      if (cat.emoji) button.setEmoji(cat.emoji);
      currentRow.addComponents(button);
    });
    rows.push(currentRow);

    // Add button rows to container
    for (const row of rows) {
      infoContainer.addActionRowComponents(row);
    }

    const sent = await channel.send({
      components: [infoContainer],
      flags: CV2_FLAGS,
    });

    this.log('ticket_panel', channelId, sent.id, null, { categories: categories.length });
    return sent.id;
  }

  // ── GitHub Notifications (Embeds – standardized) ──────────────

  async sendGitHubNotification(payload, event) {
    const channelId = this.getConfig('channel_github');
    if (!this.client || !this.isConnected || !channelId) return;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return;

      let embed;

      if (event === 'push') {
        const commits = payload.commits || [];
        const commitList = commits.slice(0, 10).map(c =>
          `[\`${c.id.substring(0, 7)}\`](${c.url}) ${c.message.split('\n')[0]}`
        ).join('\n');

        embed = new EmbedBuilder()
          .setTitle(`Push: ${payload.repository.full_name}`)
          .setDescription(commitList || 'Keine Commits')
          .setColor(0x00ff88)
          .addFields({ name: 'Branch', value: payload.ref.replace('refs/heads/', ''), inline: true })
          .addFields({ name: 'Commits', value: String(commits.length), inline: true })
          .setAuthor({ name: payload.pusher?.name || 'Unknown', iconURL: payload.sender?.avatar_url })
          .setTimestamp()
          .setFooter({ text: 'GitHub Push' });

        if (payload.compare) embed.setURL(payload.compare);
      } else if (event === 'release') {
        embed = new EmbedBuilder()
          .setTitle(`Release: ${payload.release.tag_name}`)
          .setDescription(payload.release.body?.substring(0, 2000) || 'Keine Beschreibung')
          .setColor(0x00d4ff)
          .setURL(payload.release.html_url)
          .setAuthor({ name: payload.release.author?.login || 'Unknown', iconURL: payload.release.author?.avatar_url })
          .setTimestamp()
          .setFooter({ text: `${payload.repository.full_name}` });
      } else if (event === 'issues') {
        embed = new EmbedBuilder()
          .setTitle(`Issue ${payload.action}: #${payload.issue.number} ${payload.issue.title}`)
          .setDescription(payload.issue.body?.substring(0, 2000) || '')
          .setColor(payload.action === 'opened' ? 0x00ff88 : 0xff4444)
          .setURL(payload.issue.html_url)
          .setTimestamp()
          .setFooter({ text: `${payload.repository.full_name}` });
      } else if (event === 'pull_request') {
        embed = new EmbedBuilder()
          .setTitle(`PR ${payload.action}: #${payload.pull_request.number} ${payload.pull_request.title}`)
          .setDescription(payload.pull_request.body?.substring(0, 2000) || '')
          .setColor(payload.action === 'opened' ? 0x00d4ff : 0xffaa00)
          .setURL(payload.pull_request.html_url)
          .setTimestamp()
          .setFooter({ text: `${payload.repository.full_name}` });
      }

      if (embed) {
        const sent = await channel.send({ embeds: [embed] });
        this.log('github', channelId, sent.id, null, { event, repo: payload.repository?.full_name });
      }
    } catch (e) {
      console.error('GitHub notification error:', e.message);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  _parseJSON(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
  }

  _parseColor(color) {
    if (!color) return 0x00ff88;
    if (typeof color === 'number') return color;
    if (typeof color === 'string') {
      const hex = color.replace('#', '');
      return parseInt(hex, 16) || 0x00ff88;
    }
    return 0x00ff88;
  }
}

module.exports = DiscordBot;

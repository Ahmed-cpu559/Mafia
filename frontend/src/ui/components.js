/**
 * Reusable UI Components
 * 
 * Timer display, player cards, chat panel, modals, toast system, Web Audio SFX
 */

import { RoleTheme, PhaseTheme, GamePhase, Role } from '../../../shared/enums.js';
import { t } from '../i18n.js';

/* ═══════════════════════════════════════════════════════════════
   AUDIO SYNTHESIZER (Web Audio API)
   ═══════════════════════════════════════════════════════════════ */
let audioCtx = null;
let soundEnabled = true;

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function toggleAudio() {
  soundEnabled = !soundEnabled;
  showToast(soundEnabled ? '🔊 Sound effects enabled' : '🔇 Sound effects muted', 'info');
  const btn = document.getElementById('audio-toggle-btn');
  if (btn) btn.innerHTML = soundEnabled ? '🔊' : '🔇';
  return soundEnabled;
}

export function isAudioEnabled() {
  return soundEnabled;
}

export function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'tick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'warning') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'night') {
      // Atmospheric low drone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 1.2);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    } else if (type === 'morning') {
      // Gentle dawn chord
      [330, 440, 660].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.05, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.8);
      });
    } else if (type === 'vote') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.12);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'eliminate') {
      // Dramatic elimination thump
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    } else if (type === 'win') {
      // Victory fanfare
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);
        gain.gain.setValueAtTime(0.08, now + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.6);
      });
    }
  } catch (e) {
    // Gracefully ignore audio errors (e.g. browser restrictions)
  }
}

/* ═══════════════════════════════════════════════════════════════
   TOAST NOTIFICATION SYSTEM
   ═══════════════════════════════════════════════════════════════ */
export function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('app-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'app-toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '⚠' : type === 'warning' ? '⚡' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ═══════════════════════════════════════════════════════════════
   CONNECTION STATUS PILL
   ═══════════════════════════════════════════════════════════════ */
export function renderConnectionStatus(status = 'CONNECTED') {
  const norm = (status || 'CONNECTED').toUpperCase();
  const isConnected = norm === 'CONNECTED';
  const isReconnecting = norm === 'RECONNECTING' || norm === 'CONNECTING';

  const cls = isConnected ? 'connection-indicator--connected'
            : isReconnecting ? 'connection-indicator--reconnecting'
            : 'connection-indicator--disconnected';

  const label = isConnected ? t('Online')
              : isReconnecting ? t('Reconnecting...')
              : t('Offline');

  return `
    <div class="connection-indicator ${cls}" id="global-connection-pill" title="Server Connection Status">
      <span class="connection-indicator__dot"></span>
      <span>${label}</span>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   TIMER COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function renderTimer(label) {
  label = label || t('Time Remaining');
  return `
    <div class="timer">
      <div id="game-timer-display" class="timer__display timer__display--normal">00:00</div>
      <div class="timer__label">${label}</div>
      <div class="timer__bar">
        <div id="game-timer-bar" class="timer__bar-fill" style="width:100%; background:var(--sage)"></div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   PHASE HEADER
   ═══════════════════════════════════════════════════════════════ */
export function renderPhaseHeader(phase, round, subtitle = '') {
  const theme = PhaseTheme[phase] || { icon: '🎮', label: phase, color: '#fff' };
  return `
    <div class="phase-header">
      <span class="phase-header__icon">${theme.icon}</span>
      <h1 class="phase-header__title" style="color:${theme.color}">${t(theme.label)}</h1>
      ${subtitle ? `<p class="phase-header__subtitle">${t(subtitle)}</p>` : ''}
      ${round ? `<span class="phase-header__round">${t('Round')} ${round}</span>` : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   PLAYER CARD
   ═══════════════════════════════════════════════════════════════ */
export function renderPlayerCard(player, options = {}) {
  const {
    selectable = false,
    selected = false,
    showRole = false,
    showStatus = true,
    disabled = false,
    disabledReason = '',
    onClick = '',
    isModerator = false,
  } = options;

  const roleName = player.role ? (player.role === 'CITIZEN' ? 'VILLAGER' : player.role) : null;
  const roleTheme = roleName ? RoleTheme[player.role] || RoleTheme[roleName] : null;
  const avatarBg = roleTheme && showRole ? roleTheme.color : 'rgba(255,255,255,0.2)';
  const icon = roleTheme && showRole ? roleTheme.icon : '👤';

  let classes = 'player-card';
  if (selectable) classes += ' player-card--selectable';
  if (selected) classes += ' player-card--selected';
  if (player.isAlive === false) classes += ' player-card--dead';
  if (disabled) classes += ' player-card--disabled';

  return `
    <div class="${classes}" ${onClick && !disabled ? `onclick="${onClick}"` : ''} ${disabled ? `title="${disabledReason}"` : ''}>
      <div class="player-card__avatar" style="border-color:${avatarBg}">${icon}</div>
      <div class="player-card__info">
        <div class="player-card__name flex items-center gap-2">
          <span>${player.name}</span>
          ${isModerator ? `<span class="text-xs" style="background:rgba(139,92,246,0.3); color:#c4b5fd; padding:1px 6px; border-radius:8px; font-weight:700;">${t('Moderator')}</span>` : ''}
        </div>
        ${showRole && player.role ? `
          <span class="role-badge role-badge--${player.role.toLowerCase()}">${t(roleTheme?.label || player.role)}</span>
        ` : ''}
        ${disabled && disabledReason ? `<div class="text-xs text-muted mt-1">${disabledReason}</div>` : ''}
      </div>
      ${showStatus ? `<span class="status-dot ${player.isAlive !== false ? 'status-dot--alive' : 'status-dot--dead'}"></span>` : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   ROLE BADGE & TEAM BADGE
   ═══════════════════════════════════════════════════════════════ */
export function renderRoleBadge(role) {
  if (!role) return '';
  const norm = role === 'CITIZEN' ? 'VILLAGER' : role;
  const theme = RoleTheme[role] || RoleTheme[norm] || { icon: '👤', label: role };
  return `<span class="role-badge role-badge--${norm.toLowerCase()}">${theme.icon || ''} ${t(theme.label || norm)}</span>`;
}

export function renderTeamBadge(team) {
  if (!team) return '';
  const tStr = team.toLowerCase();
  return `<span class="team-badge team-badge--${tStr}">${team}</span>`;
}

/* ═══════════════════════════════════════════════════════════════
   CHAT PANEL
   ═══════════════════════════════════════════════════════════════ */
export function renderChat(messages, options = {}) {
  const {
    title = 'Village Square',
    channelIcon = '💬',
    canSend = true,
    onSend = '',
    inputId = 'chat-input',
    tabs = [],
    activeTab = 'PUBLIC',
    onTabSelect = '',
  } = options;

  const uniqueMessages = [];
  const seenKeys = new Set();
  (messages || []).forEach((m) => {
    if (!m) return;
    const key = m.id || `${m.channel}_${m.timestamp}_${m.playerId}_${m.message}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueMessages.push(m);
    }
  });

  const msgHtml = (!uniqueMessages || uniqueMessages.length === 0)
    ? `<div class="text-muted text-sm text-center" style="padding:2rem">${t('No messages yet')}</div>`
    : uniqueMessages.map(m => `
      <div class="chat__message">
        <span class="chat__message-sender" style="color:var(--sage)">${escapeHtml(m.playerName || 'Player')}:</span>
        <span>${escapeHtml(m.message)}</span>
      </div>
    `).join('');

  const tabsHtml = tabs.length > 1 ? `
    <div class="chat__tabs">
      ${tabs.map(tab => `
        <button class="chat__tab ${tab.id === activeTab ? 'chat__tab--active' : ''}" 
                onclick="${onTabSelect}('${tab.id}')">
          <span>${tab.icon}</span> <span>${tab.label}</span>
        </button>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="chat">
      <div class="chat__header flex justify-between items-center">
        <span>${channelIcon} ${title}</span>
      </div>
      ${tabsHtml}
      <div class="chat__messages" id="chat-messages">${msgHtml}</div>
      ${canSend ? `
        <div class="chat__input-row">
          <input type="text" class="chat__input" id="${inputId}" placeholder="${t('Type a message...')}" 
                 ${onSend ? `onkeypress="if(event.key==='Enter') ${onSend.replace(/"/g, '&quot;')}"` : ''} />
          <button class="chat__send" ${onSend ? `onclick="${onSend.replace(/"/g, '&quot;')}"` : ''}>${t('Send')}</button>
        </div>
      ` : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   VOTE BAR
   ═══════════════════════════════════════════════════════════════ */
export function renderVoteBar(name, count, maxCount, type = 'normal') {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return `
    <div class="vote-bar vote-bar--${type}">
      <span class="vote-bar__name">${name}</span>
      <div class="vote-bar__track">
        <div class="vote-bar__fill" style="width:${Math.max(pct, 2)}%"></div>
      </div>
      <span class="vote-bar__count">${count}</span>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   NUMBER INPUT
   ═══════════════════════════════════════════════════════════════ */
export function renderNumberInput(id, value, min = 0, max = 99, label = '') {
  return `
    <div class="form-group">
      ${label ? `<label class="form-label">${label}</label>` : ''}
      <div class="number-input">
        <button class="number-input__btn" onclick="window._numChange('${id}', -1)" ${value <= min ? 'disabled' : ''}>−</button>
        <input type="text" class="number-input__value" id="${id}" value="${value}" readonly />
        <button class="number-input__btn" onclick="window._numChange('${id}', 1)" ${value >= max ? 'disabled' : ''}>+</button>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   RADIO OPTION GROUP
   ═══════════════════════════════════════════════════════════════ */
export function renderRadioGroup(name, options, selectedValue) {
  return `
    <div class="radio-group">
      ${options.map(opt => `
        <div class="radio-option ${opt.value === selectedValue ? 'radio-option--selected' : ''}"
             onclick="window._radioSelect('${name}', '${opt.value}')">
          <div class="radio-option__label">${opt.label}</div>
          <div class="radio-option__desc">${opt.desc}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   DEV / MODERATOR QUICK CONTROLS
   ═══════════════════════════════════════════════════════════════ */
export function renderDevControls(buttons) {
  return `
    <div class="dev-controls">
      <div class="dev-controls__title">🛠️ ${t('Moderator Controls')}</div>
      <div class="dev-controls__grid">
        ${buttons.map(b => `
          <button class="btn btn--ghost btn--sm" onclick="${(b.action || '').replace(/"/g, '&quot;')}" ${b.disabled ? 'disabled' : ''}>
            ${b.icon || ''} ${b.label}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   ANNOUNCEMENT COMPOSER
   ═══════════════════════════════════════════════════════════════ */
export function renderAnnouncementComposer(presets = []) {
  return `
    <div class="composer">
      <div class="composer__presets">
        ${presets.map((p) => `
          <button class="composer__preset" onclick="window._setAnnouncement('${escapeHtml(p).replace(/'/g, "\\'")}')">${p}</button>
        `).join('')}
      </div>
      <textarea class="composer__textarea" id="announcement-text" placeholder="${t('Write an announcement...')}"></textarea>
      <div class="mt-3">
        <button class="btn btn--success btn--sm" onclick="window._sendAnnouncement()">📢 ${t('Send Announcement')}</button>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   ALLIES PANEL (Group awareness)
   ═══════════════════════════════════════════════════════════════ */
export function renderAlliesPanel(title, allies, color) {
  return `
    <div class="allies-panel" style="border-color: ${color}20">
      <div class="allies-panel__title" style="color: ${color}">${title}</div>
      <div class="allies-list">
        ${allies.map(a => `
          <span class="ally-chip" style="background:${color}15; color:${color}">👤 ${a.name}</span>
        `).join('')}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

if (typeof window !== 'undefined') {
  window._copyRoomCode = (code) => {
    if (!code) return;
    const notifySuccess = () => {
      showToast('Room Code copied to clipboard!', 'success');
      playSound('tick');
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(notifySuccess).catch(() => {
        fallbackCopyText(code, notifySuccess);
      });
    } else {
      fallbackCopyText(code, notifySuccess);
    }
  };

  function fallbackCopyText(code, onSuccess) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = code;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      textArea.remove();
      if (successful && onSuccess) onSuccess();
      else showToast(`Room Code: ${code}`, 'info');
    } catch (e) {
      showToast(`Room Code: ${code}`, 'info');
    }
  }

  window._numChange = (id, delta) => {
    const input = document.getElementById(id);
    if (!input) return;
    const current = parseInt(input.value, 10) || 0;
    input.value = Math.max(0, current + delta);
    playSound('tick');
  };

  window._radioSelect = (name, value) => {
    const radios = document.querySelectorAll(`[onclick*="_radioSelect('${name}'"]`);
    radios.forEach(r => r.classList.remove('radio-option--selected'));
    const target = Array.from(radios).find(r => r.getAttribute('onclick')?.includes(`'${value}'`));
    if (target) target.classList.add('radio-option--selected');
    playSound('tick');
  };
}

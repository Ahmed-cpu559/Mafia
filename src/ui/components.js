/**
 * Reusable UI Components
 * 
 * Timer display, player cards, chat panel, modals, etc.
 */

import { RoleTheme, PhaseTheme, GamePhase } from '../../shared/enums.js';
import { t } from '../i18n.js';

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
  } = options;

  const roleTheme = player.role ? RoleTheme[player.role] : null;
  const avatarBg = roleTheme && showRole ? roleTheme.color : 'var(--text-muted)';
  const icon = roleTheme && showRole ? roleTheme.icon : '👤';

  let classes = 'player-card';
  if (selectable) classes += ' player-card--selectable';
  if (selected) classes += ' player-card--selected';
  if (!player.isAlive) classes += ' player-card--dead';
  if (disabled) classes += ' player-card--disabled';

  return `
    <div class="${classes}" ${onClick ? `onclick="${onClick}"` : ''} ${disabled ? `title="${disabledReason}"` : ''}>
      <div class="player-card__avatar" style="border-color:${avatarBg}">${icon}</div>
      <div class="player-card__info">
        <div class="player-card__name">${player.name}</div>
        ${showRole && player.role ? `
          <span class="role-badge role-badge--${player.role.toLowerCase()}">${t(roleTheme?.label || player.role)}</span>
        ` : ''}
        ${disabled ? `<div class="text-xs text-muted mt-1">${disabledReason}</div>` : ''}
      </div>
      ${showStatus ? `<span class="status-dot ${player.isAlive ? 'status-dot--alive' : 'status-dot--dead'}"></span>` : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   ROLE BADGE
   ═══════════════════════════════════════════════════════════════ */

export function renderRoleBadge(role) {
  if (!role) return '';
  const theme = RoleTheme[role];
  return `<span class="role-badge role-badge--${role.toLowerCase()}">${theme?.icon || ''} ${t(theme?.label || role)}</span>`;
}

export function renderTeamBadge(team) {
  if (!team) return '';
  const t = team.toLowerCase();
  return `<span class="team-badge team-badge--${t}">${team}</span>`;
}

/* ═══════════════════════════════════════════════════════════════
   CHAT PANEL
   ═══════════════════════════════════════════════════════════════ */

export function renderChat(messages, options = {}) {
  const {
    title = 'Public Chat',
    channelIcon = '💬',
    canSend = true,
    onSend = '',
    inputId = 'chat-input',
  } = options;

  const msgHtml = messages.length === 0
    ? '<div class="text-muted text-sm text-center" style="padding:2rem">No messages yet</div>'
    : messages.map(m => `
      <div class="chat__message">
        <span class="chat__message-sender" style="color:var(--sage)">${m.playerName}:</span>
        <span>${escapeHtml(m.message)}</span>
      </div>
    `).join('');

  return `
    <div class="chat">
      <div class="chat__header">${channelIcon} ${title}</div>
      <div class="chat__messages" id="chat-messages">${msgHtml}</div>
      ${canSend ? `
        <div class="chat__input-row">
          <input type="text" class="chat__input" id="${inputId}" placeholder="${t('Type a message...')}" />
          <button class="chat__send" ${onSend ? `onclick="${onSend}"` : ''}>${t('Send')}</button>
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
   DEV CONTROLS
   ═══════════════════════════════════════════════════════════════ */

export function renderDevControls(buttons) {
  return `
    <div class="dev-controls">
      <div class="dev-controls__title">🛠️ DEV / DEMO CONTROLS</div>
      <div class="dev-controls__grid">
        ${buttons.map(b => `
          <button class="btn btn--ghost btn--sm" onclick="${b.action}" ${b.disabled ? 'disabled' : ''}>
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
        ${presets.map((p, i) => `
          <button class="composer__preset" onclick="window._setAnnouncement('${escapeHtml(p)}')">${p}</button>
        `).join('')}
      </div>
      <textarea class="composer__textarea" id="announcement-text" placeholder="Write an announcement..."></textarea>
      <div class="mt-3">
        <button class="btn btn--success btn--sm" onclick="window._sendAnnouncement()">📢 Announce</button>
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
          <span class="ally-chip" style="background:${color}15; color:${color}">${a.name}</span>
        `).join('')}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

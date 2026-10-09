/**
 * Game View orchestrator
 * Combines Sage and Player views and adds the perspective switcher.
 */

import { renderSageDash } from './sage.js';
import { renderPlayerView } from './player.js';
import { t } from '../i18n.js';

export function renderGame(container, app) {
  const state = app.gameState;
  if (!state) { app.screen = 'home'; app.render(); return; }

  // Which perspective to show?
  const isSage = state.isSage;
  
  // Render view
  let viewHtml = '';
  if (isSage) {
    viewHtml = renderSageDash(app);
  } else {
    viewHtml = renderPlayerView(app);
  }

  container.innerHTML = `
    ${viewHtml}
  `;

  // Attach Hold-to-Peek listeners if button exists
  const peekBtn = container.querySelector('#role-peek-btn');
  const peekBadge = container.querySelector('#role-peek-badge');
  const peekLabel = container.querySelector('#role-peek-label');
  if (peekBtn && peekBadge && peekLabel) {
    const showRole = (e) => {
      if (e) e.preventDefault();
      peekBadge.style.display = 'inline-block';
      peekLabel.textContent = t('Peeking...');
      peekBtn.style.borderColor = 'rgba(255,255,255,0.7)';
      peekBtn.style.background = 'rgba(255,255,255,0.15)';
    };
    const hideRole = (e) => {
      if (e) e.preventDefault();
      peekBadge.style.display = 'none';
      peekLabel.textContent = t('Hold to Peek');
      peekBtn.style.borderColor = 'rgba(255,255,255,0.3)';
      peekBtn.style.background = 'transparent';
    };

    peekBtn.addEventListener('mousedown', showRole);
    peekBtn.addEventListener('mouseup', hideRole);
    peekBtn.addEventListener('mouseleave', hideRole);
    peekBtn.addEventListener('touchstart', showRole, { passive: false });
    peekBtn.addEventListener('touchend', hideRole, { passive: false });
    peekBtn.addEventListener('touchcancel', hideRole, { passive: false });
  }
}

// Handlers attached globally
window._hideRoleCard = () => {
  window.__ROLE_CARD_HIDDEN__ = true;
  window.__MAFIA_APP__.render();
};

window._showRoleCard = () => {
  window.__ROLE_CARD_HIDDEN__ = false;
  window.__MAFIA_APP__.render();
};

window._dismissInvestigation = () => {
  window.__DISMISSED_INVESTIGATIONS__ = true;
  window.__MAFIA_APP__.render();
};

window._showInvestigation = () => {
  window.__DISMISSED_INVESTIGATIONS__ = false;
  window.__MAFIA_APP__.render();
};

window._exitGame = () => {
  const app = window.__MAFIA_APP__;
  if (app && app.socket) {
    app.socket.emit('leaveRoom');
  }
  sessionStorage.removeItem('mafia_session_token');
  sessionStorage.removeItem('mafia_room_code');
  sessionStorage.removeItem('mafia_player_name');
  window.__ROLE_CARD_HIDDEN__ = false;
  window.__DISMISSED_INVESTIGATIONS__ = false;
  if (app) {
    app.gameState = null;
    app.screen = 'home';
    app.render();
  }
};

window._sageKickPlayer = (playerId) => {
  if (confirm(t('Are you sure you want to remove this player?'))) {
    window.__MAFIA_APP__.socket.emit('sageCommand', { type: 'KICK_PLAYER', payload: { playerId } });
  }
};

  // Player Actions (Night)
  window._toggleTarget = (id, max) => {
    const app = window.__MAFIA_APP__;
    const sel = app.selectedTargets || [];
    if (sel.includes(id)) {
      app.selectedTargets = sel.filter(x => x !== id);
    } else {
      if (sel.length < max) {
        app.selectedTargets = [...sel, id];
      } else if (max === 1) {
        app.selectedTargets = [id]; // auto replace if only 1 target allowed
      }
    }
    app.render();
  };

  window._submitAction = (type) => {
    const app = window.__MAFIA_APP__;
    const sel = app.selectedTargets || [];
    if (sel.length === 0) return;
    app.socket.emit('playerAction', { type, targetIds: sel }, (res) => {
      if (!res.success) {
        alert(res.error || 'Invalid action');
      }
    });
    app.selectedTargets = [];
  };

  window._retractAction = () => {
    const app = window.__MAFIA_APP__;
    if (app.gameState && app.gameState.myActions) {
      app.gameState.myActions = [];
    }
    app.render();
  };

  // Voting
  window._submitVote = (targetId) => {
    window.__MAFIA_APP__.socket.emit('submitVote', { targetId });
  };

  // Chat
  window._sendChat = (channel) => {
    const app = window.__MAFIA_APP__;
    const input = document.getElementById('chat-input');
    if (!input || !input.value.trim()) return;
    app.socket.emit('sendChat', { channel, message: input.value.trim() });
    input.value = '';
    try {
      input.focus();
    } catch (e) {}
    setTimeout(() => {
      const msgs = document.getElementById('chat-messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  };

  // Sage Controls
  window._sageAdvancePhase = () => {
    window.__MAFIA_APP__.socket.emit('sageCommand', { type: 'ADVANCE_PHASE' });
  };

  window._sageExtendTimer = (sec) => {
    window.__MAFIA_APP__.socket.emit('sageCommand', { type: 'EXTEND_TIMER', payload: { seconds: sec } });
  };

  window._sageResetRound = () => {
    // Not supported in multiplayer MVP
  };

  window._sageRevealInvestigation = (officerId) => {
    window.__MAFIA_APP__.socket.emit('sageCommand', { type: 'REVEAL_INVESTIGATION', payload: { targetId: officerId } });
  };

  window._sageForceWin = (team) => {
    window.__MAFIA_APP__.socket.emit('sageCommand', { type: 'SET_WINNER', payload: { team } });
  };
  
  window._sageSetChat = (ch) => {
    const app = window.__MAFIA_APP__;
    app.activeChatChannel = ch;
    app.render();
  };

  window._setAnnouncement = (text) => {
    const ta = document.getElementById('announcement-text');
    if (ta) ta.value = text;
  };

  window._sendAnnouncement = () => {
    const app = window.__MAFIA_APP__;
    const ta = document.getElementById('announcement-text');
    if (!ta || !ta.value.trim()) return;
    app.socket.emit('sageCommand', { type: 'ANNOUNCE', payload: { text: ta.value.trim() } });
    ta.value = '';
  };

  window._sageUpdateConfig = (key, delta) => {
    const app = window.__MAFIA_APP__;
    if (!app.gameState || !app.gameState.config) return;
    const alivePlayers = (app.gameState.players || []).filter(p => p.isAlive);
    const maxAllowance = Math.max(1, alivePlayers.length);
    const curVal = app.gameState.config[key] || 1;
    const newVal = Math.min(maxAllowance, Math.max(1, curVal + delta));
    app.socket.emit('sageCommand', { type: 'UPDATE_CONFIG', payload: { [key]: newVal } });
  };

  window._sageCancelGame = () => {
    if (confirm('Are you sure you want to cancel the game and return everyone to the lobby?')) {
      window.__MAFIA_APP__.socket.emit('sageCommand', { type: 'CANCEL_GAME' });
    }
  };

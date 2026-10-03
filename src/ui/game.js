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
}

// Handlers attached globally
window._exitGame = () => {
  sessionStorage.removeItem('mafia_session_token');
  sessionStorage.removeItem('mafia_room_code');
  window.__MAFIA_APP__.gameState = null;
  window.__MAFIA_APP__.screen = 'home';
  window.__MAFIA_APP__.render();
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
    app.socket.emit('playerAction', { type, targetIds: sel });
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

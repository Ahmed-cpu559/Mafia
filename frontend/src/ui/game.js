/**
 * Game View orchestrator
 * Combines Moderator and Player views and dispatches authoritative socket actions.
 */

import { renderPlayerView } from './player.js';
import { showToast, playSound } from './components.js';
import { ActionType, Role } from '../../../shared/enums.js';
import { t } from '../i18n.js';

export function renderGame(container, app) {
  const state = app.gameState;
  if (!state) {
    app.screen = 'home';
    app.render();
    return;
  }

  // In active gameplay, every player (including room creator) sees the normal player view
  container.innerHTML = renderPlayerView(app);
}

/* ═══════════════════════════════════════════════════════════════
   GLOBAL GAME HANDLERS
   ═══════════════════════════════════════════════════════════════ */

window._exitGame = () => {
  const app = window.__MAFIA_APP__;
  if (app && app.socket) {
    app.socket.emit('leaveGame');
  }
  sessionStorage.removeItem('mafia_session_token');
  sessionStorage.removeItem('mafia_room_code');
  if (app) {
    app.gameState = null;
    app.screen = 'home';
    app.render();
  }
};

window._copyRoomCode = (code) => {
  if (!code) return;
  const notifySuccess = () => {
    showToast('Room Code copied to clipboard!', 'success');
    playSound('tick');
  };

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(notifySuccess).catch(() => {
      fallbackCopy(code, notifySuccess);
    });
  } else {
    fallbackCopy(code, notifySuccess);
  }
};

function fallbackCopy(code, onSuccess) {
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

window._shareRoomCode = (code) => {
  if (typeof navigator !== 'undefined' && navigator.share) {
    navigator.share({
      title: 'Join my Mafia Game!',
      text: `Join my Mafia game with room code: ${code}`,
      url: window.location.href,
    }).catch(() => {});
  } else {
    window._copyRoomCode(code);
  }
};

// Target Selection
window._toggleTarget = (id, max = 1) => {
  const app = window.__MAFIA_APP__;
  if (!app) return;
  const sel = app.selectedTargets || [];
  if (sel.includes(id)) {
    app.selectedTargets = sel.filter(x => x !== id);
  } else {
    if (sel.length < max) {
      app.selectedTargets = [...sel, id];
    } else if (max === 1) {
      app.selectedTargets = [id]; // auto-replace single target
    }
  }
  playSound('tick');
  app.render();
};

// Submit Night Action (mafia:kill, doctor:protect, officer:investigate)
window._submitRoleAction = () => {
  const app = window.__MAFIA_APP__;
  if (!app || !app.gameState) return;
  const sel = app.selectedTargets || [];
  if (sel.length === 0) {
    showToast('Please select a target first', 'warning');
    return;
  }

  const myRole = app.gameState.myRole;
  const targetId = sel[0];
  const targetIds = sel;

  let eventName = 'playerAction';
  let payload = { type: ActionType.KILL, targetIds };

  if (myRole === Role.MAFIA) {
    eventName = 'mafia:kill';
    payload = { targetId, targetIds };
  } else if (myRole === Role.DOCTOR) {
    eventName = 'doctor:protect';
    payload = { targetId, targetIds };
  } else if (myRole === Role.OFFICER) {
    eventName = 'officer:investigate';
    payload = { targetId, targetIds };
  }

  app.socket.emit(eventName, payload, (res) => {
    if (res && res.success === false) {
      showToast(res.error || 'Action failed', 'error');
    } else {
      playSound('vote');
      showToast('Action confirmed by server!', 'success');
    }
  });

  app.selectedTargets = [];
};

window._retractAction = () => {
  const app = window.__MAFIA_APP__;
  if (!app) return;
  if (app.gameState && app.gameState.myActions) {
    app.gameState.myActions = [];
  }
  app.selectedTargets = [];
  playSound('tick');
  app.render();
};

// Submit Vote
window._submitVote = (targetId) => {
  const app = window.__MAFIA_APP__;
  if (!app || !app.socket) return;

  // Cannot vote for self as per backend rules
  if (app.gameState && targetId === app.gameState.myId) {
    showToast('You cannot vote for yourself', 'warning');
    return;
  }

  app.socket.emit('submitVote', { targetId }, (res) => {
    if (res && res.success === false) {
      showToast(res.error || 'Failed to submit vote', 'error');
    } else {
      playSound('vote');
      showToast('Vote registered!', 'success');
    }
  });
};

// Send Realtime Chat
window._sendChat = (channel = 'PUBLIC') => {
  const app = window.__MAFIA_APP__;
  if (!app || !app.socket) return;
  const input = document.getElementById('chat-input');
  if (!input || !input.value.trim()) return;

  const msg = input.value.trim();
  app.socket.emit('sendChat', { channel, message: msg }, (res) => {
    if (res && res.success === false) {
      showToast(res.error || 'Message rejected', 'error');
    }
  });

  input.value = '';
  setTimeout(() => {
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 50);
};

// Moderator Commands (Advance Phase, Extend Timer, Broadcast Announcement, Cancel Game)
window._moderatorCommand = (type, payload = {}) => {
  const app = window.__MAFIA_APP__;
  if (!app || !app.socket) return;

  app.socket.emit('moderator:command', { type, payload }, (res) => {
    if (res && res.success === false) {
      // Fallback to legacy sageCommand
      app.socket.emit('sageCommand', { type, payload }, (fallbackRes) => {
        if (fallbackRes && fallbackRes.success === false) {
          showToast(fallbackRes.error || 'Command failed', 'error');
        } else {
          showToast(`Executed: ${type}`, 'success');
        }
      });
    } else {
      playSound('tick');
      showToast(`Command executed`, 'success');
    }
  });
};

// Legacy bindings for compatibility
window._sageAdvancePhase = () => window._moderatorCommand('ADVANCE_PHASE');
window._sageExtendTimer = (sec) => window._moderatorCommand('EXTEND_TIMER', { seconds: sec });
window._sageCancelGame = () => {
  if (confirm('Are you sure you want to cancel the game and return everyone to the lobby?')) {
    window._moderatorCommand('CANCEL_GAME');
  }
};
window._sageSetChat = (channel) => {
  const app = window.__MAFIA_APP__;
  if (app) {
    app.activeChatChannel = channel;
    playSound('tick');
    app.render();
  }
};
window._setAnnouncement = (text) => {
  const ta = document.getElementById('announcement-text');
  if (ta) ta.value = text;
};
window._sendAnnouncement = () => {
  const ta = document.getElementById('announcement-text');
  if (!ta || !ta.value.trim()) return;
  window._moderatorCommand('ANNOUNCE', { text: ta.value.trim() });
  ta.value = '';
};

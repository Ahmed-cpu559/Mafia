import { io } from 'socket.io-client';
import { renderHome, renderSetup } from './ui/home.js';
import { renderGame } from './ui/game.js';
import { setLang, getLang } from './i18n.js';

class App {
  constructor() {
    this.screen = 'home'; 
    this.gameState = null;
    this.selectedTargets = []; 
    this.activeChatChannel = 'PUBLIC'; 
    
    this.container = document.getElementById('app');

    // Connect to server
    const serverUrl = import.meta.env.VITE_SERVER_URL || undefined;
    this.socket = io(serverUrl);

    this.socket.on('connect', () => {
      console.log('Connected to server');
      // Auto-reconnect if we have a session token stored
      const sessionToken = sessionStorage.getItem('mafia_session_token');
      const roomCode = sessionStorage.getItem('mafia_room_code');
      const playerName = sessionStorage.getItem('mafia_player_name');
      if (sessionToken && roomCode) {
        this.socket.emit('joinGame', { roomCode, sessionToken, playerName }, (res) => {
          if (res.success) {
            this.gameState = res.state;
            this.screen = res.state.phase === 'LOBBY' ? 'setup' : 'game';
            this.render();
          } else {
            sessionStorage.removeItem('mafia_session_token');
            sessionStorage.removeItem('mafia_room_code');
            sessionStorage.removeItem('mafia_player_name');
            this.screen = 'home';
            this.gameState = null;
            this.render();
          }
        });
      }
    });

    this.socket.on('stateUpdate', (state) => {
      if (this.gameState && this.gameState.currentRound !== state.currentRound) {
        window.__DISMISSED_INVESTIGATIONS__ = false;
      }
      this.gameState = state;
      
      if (state.phase === 'LOBBY') {
        this.screen = 'setup';
      } else if (this.screen === 'setup') {
        this.screen = 'game';
      }
      
      this.render();
    });

    this.socket.on('chatMessage', (msg) => {
      if (!this.gameState) return;
      if (!this.gameState.chatMessages) this.gameState.chatMessages = { PUBLIC: [], MAFIA: [], DEAD: [] };
      if (!this.gameState.chatMessages[msg.channel]) this.gameState.chatMessages[msg.channel] = [];
      this.gameState.chatMessages[msg.channel].push(msg);

      // Fast in-place DOM update so the keyboard is never closed and the user's draft is not lost!
      const msgsEl = document.getElementById('chat-messages');
      if (msgsEl) {
        const activeChannel = msgsEl.getAttribute('data-channel');
        if (activeChannel && activeChannel !== msg.channel) {
          return; // message is for a background channel, no DOM update needed
        }

        // If placeholder exists, remove it
        const emptyPlaceholder = msgsEl.querySelector('.text-muted');
        if (emptyPlaceholder) emptyPlaceholder.remove();

        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat__message';
        const senderSpan = document.createElement('span');
        senderSpan.className = 'chat__message-sender';
        senderSpan.style.color = 'var(--sage)';
        senderSpan.textContent = `${msg.playerName}: `;
        const textSpan = document.createElement('span');
        textSpan.textContent = msg.message;
        msgDiv.appendChild(senderSpan);
        msgDiv.appendChild(textSpan);
        msgsEl.appendChild(msgDiv);
        msgsEl.scrollTop = msgsEl.scrollHeight;
        return;
      }

      this.render();
    });

    this.socket.on('error', (err) => {
      alert(err);
    });
    
    // Add language toggle globally
    const langBtn = document.createElement('button');
    langBtn.className = 'btn btn--ghost btn--sm';
    langBtn.style.position = 'fixed';
    langBtn.style.bottom = '20px';
    langBtn.style.left = '20px';
    langBtn.style.zIndex = '9999';
    langBtn.style.background = 'rgba(255,255,255,0.1)';
    langBtn.style.backdropFilter = 'blur(4px)';
    langBtn.innerText = 'عربي';
    langBtn.onclick = () => {
      const newLang = getLang() === 'en' ? 'ar' : 'en';
      setLang(newLang);
      langBtn.innerText = newLang === 'en' ? 'عربي' : 'English';
      this.render();
    };
    document.body.appendChild(langBtn);
    
    // Initial render
    this.render();
    this._startTimerLoop();
  }

  _startTimerLoop() {
    const tick = () => {
      if (this.gameState && this.gameState.phaseEndsAt) {
        const remaining = Math.max(0, Math.ceil((this.gameState.phaseEndsAt - Date.now()) / 1000));
        const total = Math.ceil((this.gameState.phaseEndsAt - this.gameState.phaseStartedAt) / 1000);
        
        const displayEl = document.getElementById('game-timer-display');
        const barEl = document.getElementById('game-timer-bar');
        
        if (displayEl && barEl) {
          const mins = Math.floor(remaining / 60);
          const secs = remaining % 60;
          displayEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
          
          const pct = total > 0 ? (remaining / total) * 100 : 0;
          barEl.style.width = `${pct}%`;
          
          if (remaining <= 10) {
            displayEl.className = 'timer__display timer__display--danger';
            barEl.style.background = 'var(--danger)';
          } else if (remaining <= 30) {
            displayEl.className = 'timer__display timer__display--warning';
            barEl.style.background = 'var(--warning)';
          } else {
            displayEl.className = 'timer__display timer__display--normal';
            barEl.style.background = 'var(--sage)';
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  render() {
    if (!this._renderPending) {
      this._renderPending = true;
      requestAnimationFrame(() => {
        this._renderContent();
        this._renderPending = false;
      });
    }
  }
  
  _renderContent() {
    // Preserve focused input (e.g. typing a chat message or announcement)
    const activeEl = document.activeElement;
    let focusedId = null;
    let focusedValue = null;
    let selStart = null;
    let selEnd = null;

    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && activeEl.id) {
      focusedId = activeEl.id;
      focusedValue = activeEl.value;
      try {
        selStart = activeEl.selectionStart;
        selEnd = activeEl.selectionEnd;
      } catch (e) {
        // Some input types don't support selectionStart
      }
    }

    if (this.screen === 'home') {
      renderHome(this.container, this);
    } else if (this.screen === 'setup') {
      renderSetup(this.container, this);
    } else if (this.screen === 'game') {
      renderGame(this.container, this);
    }

    // Restore input value, focus, and selection cursor
    if (focusedId) {
      const restoredEl = document.getElementById(focusedId);
      if (restoredEl && restoredEl.tagName === (activeEl?.tagName)) {
        if (focusedValue !== null && focusedValue !== undefined) {
          restoredEl.value = focusedValue;
        }
        try {
          restoredEl.focus();
          if (selStart !== null && selEnd !== null) {
            restoredEl.setSelectionRange(selStart, selEnd);
          }
        } catch (e) {
          // Ignore focus errors
        }
      }
    }
  }
}

const app = new App();
window.__MAFIA_APP__ = app;

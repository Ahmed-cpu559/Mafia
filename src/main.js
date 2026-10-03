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
      if (sessionToken && roomCode) {
        this.socket.emit('joinGame', { roomCode, sessionToken }, (res) => {
          if (res.success) {
            this.gameState = res.state;
            this.screen = res.state.phase === 'LOBBY' ? 'setup' : 'game';
            this.render();
          } else {
            sessionStorage.removeItem('mafia_session_token');
            sessionStorage.removeItem('mafia_room_code');
            this.screen = 'home';
            this.gameState = null;
            this.render();
          }
        });
      }
    });

    this.socket.on('stateUpdate', (state) => {
      this.gameState = state;
      // Chat messages usually need to be appended. If state brings full history, cool.
      this.render();
    });

    this.socket.on('chatMessage', (msg) => {
      if (!this.gameState) return;
      if (!this.gameState.chatMessages) this.gameState.chatMessages = { PUBLIC: [], MAFIA: [], DEAD: [] };
      if (!this.gameState.chatMessages[msg.channel]) this.gameState.chatMessages[msg.channel] = [];
      this.gameState.chatMessages[msg.channel].push(msg);
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
    if (this.screen === 'home') {
      renderHome(this.container, this);
    } else if (this.screen === 'setup') {
      renderSetup(this.container, this);
    } else if (this.screen === 'game') {
      renderGame(this.container, this);
    }
  }
}

const app = new App();
window.__MAFIA_APP__ = app;

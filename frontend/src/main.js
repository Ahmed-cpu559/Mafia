import { io } from 'socket.io-client';
import { renderLogin, renderHome, renderSetup } from './ui/home.js';
import { renderGame } from './ui/game.js';
import { renderAdminConsole } from './ui/admin.js';
import { setLang, getLang, t } from './i18n.js';
import { renderConnectionStatus, showToast, playSound, toggleAudio, isAudioEnabled } from './ui/components.js';

class App {
  constructor() {
    this.screen = 'home'; 
    this.gameState = null;
    this.selectedTargets = []; 
    this.activeChatChannel = 'PUBLIC';
    this.connectionStatus = 'CONNECTING';
    this.roleAssignments = {};
    
    this.container = document.getElementById('app');

    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    if (tokenFromUrl) {
      sessionStorage.setItem('mafia_auth_token', tokenFromUrl);
      localStorage.setItem('mafia_auth_token', tokenFromUrl);
      window.history.replaceState({}, document.title, '/');
    }

    this.token = sessionStorage.getItem('mafia_auth_token') || localStorage.getItem('mafia_auth_token');
    
    // Set up floating utility HUD (Language Toggle & Sound FX Toggle)
    this._initFloatingControls();

    // Check if route is /admin or /admin/login
    if (window.location.pathname.startsWith('/admin')) {
      this.screen = 'admin';
      this.render();
      return;
    }

    if (this.token) {
      this.connectSocket();
    } else {
      this.screen = 'login';
      this.render();
    }

    window.addEventListener('popstate', () => {
      if (window.location.pathname.startsWith('/admin')) {
        this.screen = 'admin';
      } else if (!this.token) {
        this.screen = 'login';
      } else {
        this.screen = 'home';
      }
      this.render();
    });
  }

  _initFloatingControls() {
    const controls = document.createElement('div');
    controls.id = 'floating-game-controls';
    controls.style.position = 'fixed';
    controls.style.bottom = '18px';
    controls.style.left = '18px';
    controls.style.zIndex = '9999';
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.alignItems = 'center';

    // Lang toggle button
    const langBtn = document.createElement('button');
    langBtn.className = 'btn btn--ghost btn--sm';
    langBtn.style.background = 'rgba(20,24,36,0.85)';
    langBtn.style.backdropFilter = 'blur(8px)';
    langBtn.style.border = '1px solid rgba(255,255,255,0.12)';
    langBtn.style.fontWeight = '700';
    langBtn.style.fontSize = '12px';
    langBtn.style.padding = '6px 12px';
    langBtn.innerText = getLang() === 'en' ? 'عربي' : 'English';
    langBtn.onclick = () => {
      const newLang = getLang() === 'en' ? 'ar' : 'en';
      setLang(newLang);
      langBtn.innerText = newLang === 'en' ? 'عربي' : 'English';
      this.render();
    };
    controls.appendChild(langBtn);

    // Audio SFX toggle button
    const audioBtn = document.createElement('button');
    audioBtn.id = 'audio-toggle-btn';
    audioBtn.className = 'btn btn--ghost btn--sm';
    audioBtn.style.background = 'rgba(20,24,36,0.85)';
    audioBtn.style.backdropFilter = 'blur(8px)';
    audioBtn.style.border = '1px solid rgba(255,255,255,0.12)';
    audioBtn.style.fontSize = '14px';
    audioBtn.style.padding = '6px 10px';
    audioBtn.innerText = isAudioEnabled() ? '🔊' : '🔇';
    audioBtn.title = 'Toggle Sound Effects';
    audioBtn.onclick = () => {
      toggleAudio();
    };
    controls.appendChild(audioBtn);

    document.body.appendChild(controls);
  }

  connectSocket() {
    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch (e) {
        console.warn('Socket disconnect error:', e);
      }
      this.socket = null;
    }

    const serverUrl = import.meta.env.VITE_SERVER_URL || '';
    this.connectionStatus = 'CONNECTING';
    this._updateConnectionIndicator();

    this.socket = io(serverUrl, {
      auth: { token: this.token },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('Connected to Mafia server via Socket.IO');
      this.connectionStatus = 'CONNECTED';
      this._updateConnectionIndicator();

      // Auto-reconnect to room if session stored
      const sessionToken = sessionStorage.getItem('mafia_session_token');
      const roomCode = sessionStorage.getItem('mafia_room_code');

      if (sessionToken && roomCode) {
        this.socket.emit('joinGame', { roomCode, sessionToken }, (res) => {
          if (res && res.success) {
            this.gameState = res.state;
            const isMod = res.isModerator || res.isSage || res.state?.isSage;
            this.screen = (res.state?.phase === 'LOBBY' && isMod) ? 'setup' : 'game';
            showToast('Reconnected to room ' + roomCode, 'success');
            this.render();
          } else {
            sessionStorage.removeItem('mafia_session_token');
            sessionStorage.removeItem('mafia_room_code');
            this.screen = 'home';
            this.gameState = null;
            this.render();
          }
        });
      } else {
        if (this.screen === 'login') this.screen = 'home';
        this.render();
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('Disconnected from server:', reason);
      this.connectionStatus = 'DISCONNECTED';
      this._updateConnectionIndicator();
      showToast('Lost server connection. Attempting to reconnect...', 'warning');
    });

    this.socket.on('reconnect_attempt', () => {
      this.connectionStatus = 'RECONNECTING';
      this._updateConnectionIndicator();
    });

    // Handle authoritative game state broadcast (game:state and stateUpdate)
    const handleStateUpdate = (state) => {
      if (!state) return;
      const prevPhase = this.gameState?.phase;
      this.gameState = state;

      // Play audio cues on phase change
      if (prevPhase && prevPhase !== state.phase) {
        if (state.phase.includes('NIGHT')) {
          playSound('night');
        } else if (state.phase === 'MORNING' || state.phase === 'DISCUSSION') {
          playSound('morning');
        } else if (state.phase === 'VOTING') {
          playSound('vote');
        } else if (state.phase === 'VOTE_RESOLUTION') {
          playSound('eliminate');
        } else if (state.phase === 'FINISHED') {
          playSound('win');
        }
      }

      const isMod = state.isSage || state.isModerator;
      if (state.phase === 'LOBBY') {
        if (isMod) {
          this.screen = 'setup';
        }
      } else {
        this.screen = 'game';
      }

      this.render();
    };

    this.socket.on('stateUpdate', handleStateUpdate);
    this.socket.on('game:state', handleStateUpdate);

    // Lobby updates
    this.socket.on('lobbyUpdate', ({ players }) => {
      if (this.gameState && this.gameState.phase === 'LOBBY') {
        this.gameState.players = players;
        this.render();
      }
    });

    // Realtime chat messages
    const handleChatMessage = (msg) => {
      if (!this.gameState || !msg) return;
      if (!this.gameState.chatMessages) {
        this.gameState.chatMessages = { PUBLIC: [], MAFIA: [], DEAD: [] };
      }
      const ch = msg.channel || 'PUBLIC';
      if (!this.gameState.chatMessages[ch]) this.gameState.chatMessages[ch] = [];

      // Deduplicate messages by id or timestamp+player+content
      const isDuplicate = this.gameState.chatMessages[ch].some((existing) => {
        if (msg.id && existing.id) {
          return String(existing.id) === String(msg.id);
        }
        return (
          existing.timestamp === msg.timestamp &&
          existing.playerId === msg.playerId &&
          existing.message === msg.message
        );
      });

      if (isDuplicate) return;

      this.gameState.chatMessages[ch].push(msg);
      
      const msgsEl = document.getElementById('chat-messages');
      if (msgsEl) {
        setTimeout(() => { msgsEl.scrollTop = msgsEl.scrollHeight; }, 30);
      }
      this.render();
    };

    this.socket.off('chatMessage', handleChatMessage);
    this.socket.on('chatMessage', handleChatMessage);

    // Error handling
    this.socket.on('error', (err) => {
      const msg = typeof err === 'object' ? (err.message || err.error || 'Server Error') : String(err);
      showToast(msg, 'error');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      this.connectionStatus = 'DISCONNECTED';
      this._updateConnectionIndicator();

      if (err.message && err.message.includes('Authentication')) {
        sessionStorage.removeItem('mafia_auth_token');
        localStorage.removeItem('mafia_auth_token');
        this.token = null;
        this.screen = 'login';
        this.render();
      }
    });
    
    this._startTimerLoop();
    this.render();
  }

  _updateConnectionIndicator() {
    let pill = document.getElementById('global-connection-pill');
    if (!pill) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderConnectionStatus(this.connectionStatus);
      document.body.appendChild(wrapper.firstElementChild);
    } else {
      pill.outerHTML = renderConnectionStatus(this.connectionStatus);
    }
  }

  _startTimerLoop() {
    if (this._timerLoopStarted) return;
    this._timerLoopStarted = true;

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
          
          if (remaining <= 5 && remaining > 0) {
            displayEl.className = 'timer__display timer__display--danger';
            barEl.style.background = 'var(--danger)';
          } else if (remaining <= 15) {
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
        this._updateConnectionIndicator();
      });
    }
  }
  
  _renderContent() {
    const controls = document.getElementById('floating-game-controls');
    if (this.screen === 'admin') {
      if (controls) controls.style.display = 'none';
      renderAdminConsole(this.container);
      return;
    } else {
      if (controls) controls.style.display = 'flex';
    }

    if (this.screen === 'login') {
      renderLogin(this.container, this);
    } else if (this.screen === 'home') {
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

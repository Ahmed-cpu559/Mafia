import { Role, AwarenessMode, GameMode } from '../../shared/enums.js';
import { renderRadioGroup, renderNumberInput } from './components.js';
import { t } from '../i18n.js';

export function renderHome(container, app) {
  container.innerHTML = `
    <div class="home">
      <h1 class="home__logo">MAFIA</h1>
      <p class="home__subtitle">${t('A social deduction game of hidden roles, secret kills, and village justice.')}</p>

      <div class="home__actions" style="display:flex; flex-direction:column; gap:20px; align-items:center;">
        
        <div class="card" style="width:100%; max-width:400px; padding:20px;">
          <h3 style="margin-bottom:15px; text-align:center;">${t('Create New Game')}</h3>
          <input type="text" id="sage-name" placeholder="${t('Your Name (Village Sage)')}" class="mb-4" style="width:100%; padding:10px; border-radius:4px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.5); color:#fff;" value="Village Sage"/>
          <button class="btn btn--primary btn--block" onclick="window._createGame()">
            🎭 ${t('Create Room')}
          </button>
        </div>

        <div class="card" style="width:100%; max-width:400px; padding:20px;">
          <h3 style="margin-bottom:15px; text-align:center;">${t('Join Game')}</h3>
          <input type="text" id="join-name" placeholder="${t('Your Name')}" class="mb-4" style="width:100%; padding:10px; border-radius:4px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.5); color:#fff;"/>
          <input type="text" id="join-code" placeholder="${t('Room Code')}" class="mb-4" style="text-transform:uppercase; width:100%; padding:10px; border-radius:4px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.5); color:#fff;"/>
          <button class="btn btn--primary btn--block" onclick="window._joinGame()">
            🚪 ${t('Join Room')}
          </button>
        </div>

      </div>
    </div>
  `;

  window._createGame = () => {
    const name = document.getElementById('sage-name').value.trim() || 'Village Sage';
    app.socket.emit('createGame', { playerName: name }, (res) => {
      if (res.success) {
        sessionStorage.setItem('mafia_session_token', res.sessionToken);
        sessionStorage.setItem('mafia_room_code', res.roomCode);
        app.gameState = res.state;
        app.screen = 'setup';
        app.render();
      } else {
        alert(res.error);
      }
    });
  };

  window._joinGame = () => {
    const name = document.getElementById('join-name').value.trim();
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!name || !code) return alert('Enter name and room code');
    
    app.socket.emit('joinGame', { roomCode: code, playerName: name }, (res) => {
      if (res.success) {
        sessionStorage.setItem('mafia_session_token', res.sessionToken);
        sessionStorage.setItem('mafia_room_code', res.roomCode);
        app.gameState = res.state;
        app.screen = 'game';
        app.render();
      } else {
        alert(res.error);
      }
    });
  };
}

export function renderSetup(container, app) {
  const state = app.gameState;
  if (!state) { app.screen = 'home'; app.render(); return; }

  if (!app.setupState) {
    app.setupState = {
      mafiaCount: 1,
      doctorCount: 0,
      officerCount: 0,
      citizenCount: 0, // In the real UI we'd auto-compute citizenCount from players left, but for UI sake let Sage choose.
      gameMode: GameMode.SAGE_CONTROLLED,
      mafiaAwareness: AwarenessMode.GROUP,
      doctorAwareness: AwarenessMode.INDIVIDUAL,
      officerAwareness: AwarenessMode.INDIVIDUAL,
      revealRole: true,
    };
  }
  const s = app.setupState;

  const joinedPlayers = state.players || [];
  const joinedCount = joinedPlayers.length; // excluding Sage
  
  const totalRoles = s.mafiaCount + s.doctorCount + s.officerCount + s.citizenCount;
  const isValid = totalRoles === joinedCount && s.mafiaCount >= 1 && joinedCount >= 1;
  const validationMsg = totalRoles !== joinedCount
    ? `Role count (${totalRoles}) doesn't match player count (${joinedCount})`
    : s.mafiaCount < 1
    ? 'At least 1 Mafia is required'
    : `✓ Configuration valid — ${joinedCount} players ready`;

  container.innerHTML = `
    <div class="setup">
      <div class="container--lg">
        <button class="btn btn--ghost btn--sm mb-6" onclick="window._backToHome()">← ${t('Back')}</button>

        <h1 class="setup__title">🎭 ${t('Game Setup')}</h1>

        <div class="text-center mb-6">
          <div class="text-xs text-muted" style="text-transform:uppercase; letter-spacing:0.1em">${t('Game Code')}</div>
          <div style="font-family:var(--font-display); font-size:var(--fs-3xl); font-weight:900; letter-spacing:0.15em; color:var(--sage)">${state.code}</div>
          <div class="text-sm mt-2">Share this code with players so they can join!</div>
        </div>

        <div class="setup__section">
          <h2 class="setup__section-title">👥 Joined Players (${joinedCount})</h2>
          <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
            ${joinedPlayers.length === 0 ? '<div class="text-muted">Waiting for players to join...</div>' : ''}
            ${joinedPlayers.map(p => `<span style="background:rgba(255,255,255,0.1); padding:6px 12px; border-radius:12px;">${p.name}</span>`).join('')}
          </div>
          <div class="text-xs text-muted">Auto-updating...</div>
        </div>

        <div class="setup__section">
          <h2 class="setup__section-title">🎭 ${t('Roles')}</h2>
          <div class="setup__row">
            ${renderNumberInput('mafiaCount', s.mafiaCount, 1, 10, t('🔪 Mafia'))}
            ${renderNumberInput('doctorCount', s.doctorCount, 0, 5, t('💊 Doctor'))}
            ${renderNumberInput('officerCount', s.officerCount, 0, 5, t('🔍 Officer'))}
            ${renderNumberInput('citizenCount', s.citizenCount, 0, 20, t('👤 Citizen'))}
          </div>

          <div class="setup__validation ${isValid ? 'setup__validation--success' : 'setup__validation--error'}">
            ${validationMsg}
          </div>
        </div>

        <div class="setup__section">
          <h2 class="setup__section-title">⚙️ ${t('Game Mode')}</h2>
          ${renderRadioGroup('gameMode', [
            { value: GameMode.SAGE_CONTROLLED, label: t('🧙 Sage Controlled'), desc: t('The Sage manually controls phase progression and timing.') },
            { value: GameMode.AUTOMATED, label: t('⚡ Automated'), desc: t('The system automatically advances phases when timers expire.') },
          ], s.gameMode)}
        </div>

        <div class="setup__section text-center">
          <button class="btn btn--primary btn--lg btn--block" onclick="window._startGame()" ${!isValid ? 'disabled' : ''}>
            🚀 ${t('Start Game')}
          </button>
        </div>
      </div>
    </div>
  `;

  window._numChange = (key, delta) => {
    if (!app.setupState) return;
    app.setupState[key] += delta;
    app.render();
  };

  window._radioSelect = (key, val) => {
    if (!app.setupState) return;
    app.setupState[key] = val;
    app.render();
  };

  window._backToHome = () => {
    sessionStorage.removeItem('mafia_session_token');
    sessionStorage.removeItem('mafia_room_code');
    app.gameState = null;
    app.screen = 'home';
    app.render();
  };

  window._startGame = () => {
    if (!isValid) return;

    app.socket.emit('sageCommand', {
      type: 'START_GAME',
      payload: {
        gameMode: s.gameMode,
        config: {
          mafiaKillCount: s.mafiaCount > 2 ? 2 : 1, 
          doctorHealCount: 1,
          officerInvestigateCount: 1,
          mafiaAwareness: s.mafiaAwareness,
          doctorAwareness: s.doctorAwareness,
          officerAwareness: s.officerAwareness,
          revealRole: s.revealRole,
          timers: {
            NIGHT_MAFIA: 30,
            NIGHT_DOCTOR: 20,
            NIGHT_OFFICER: 20,
            DISCUSSION: 120,
            VOTING: 45,
          }
        },
        roleCounts: {
          [Role.MAFIA]: s.mafiaCount,
          [Role.DOCTOR]: s.doctorCount,
          [Role.OFFICER]: s.officerCount,
          [Role.CITIZEN]: s.citizenCount,
        }
      }
    }, (res) => {
      if (res.success) {
        app.screen = 'game';
        app.render();
      } else {
        alert(res.error);
      }
    });
  };
}

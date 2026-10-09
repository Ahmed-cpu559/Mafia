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
          <input type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="join-code" placeholder="${t('4-Digit Room Code (e.g. 1234)')}" class="mb-4" style="text-align:center; font-size:1.15rem; letter-spacing:0.15em; width:100%; padding:10px; border-radius:4px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.5); color:#fff;"/>
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
        sessionStorage.setItem('mafia_player_name', name);
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
    const code = document.getElementById('join-code').value.trim().replace(/\D/g, '');
    if (!name || !code) return alert('Enter your name and a 4-digit room code');
    if (code.length !== 4) return alert('Room code must be exactly 4 digits');
    
    app.socket.emit('joinGame', { roomCode: code, playerName: name }, (res) => {
      if (res.success) {
        sessionStorage.setItem('mafia_session_token', res.sessionToken);
        sessionStorage.setItem('mafia_room_code', res.roomCode);
        sessionStorage.setItem('mafia_player_name', name);
        app.gameState = res.state;
        app.screen = res.state.phase === 'LOBBY' ? 'setup' : 'game';
        app.render();
      } else {
        alert(res.error);
      }
    });
  };
}

export function renderPlayerLobby(container, app) {
  const state = app.gameState;
  const players = state.players || [];
  container.innerHTML = `
    <div class="setup" style="text-align:center; max-width:500px; margin:40px auto; padding:20px;">
      <div class="card p-6">
        <div class="text-xs text-muted mb-1" style="text-transform:uppercase; letter-spacing:0.1em">${t('Game Code')}</div>
        <div style="font-family:var(--font-display); font-size:var(--fs-4xl); font-weight:900; letter-spacing:0.2em; color:var(--sage)">
          ${state.code}
        </div>
        
        <div class="mt-4 mb-6">
          <div class="text-lg font-weight:700 mb-2">⏳ ${t('Waiting for Village Sage')}</div>
          <p class="text-sm text-muted">${t('The Sage is configuring roles and preparing to start the game.')}</p>
        </div>

        <div class="card mb-6" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); text-align:left; padding:15px;">
          <div class="text-xs text-muted uppercase mb-3">👥 ${t('Joined Players')} (${players.length})</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${players.length === 0 ? `<div class="text-xs text-muted">${t('Waiting for other players...')}</div>` : ''}
            ${players.map(p => `
              <span style="background:rgba(255,255,255,0.1); padding:6px 14px; border-radius:16px; font-size:0.85rem; font-weight:600;">
                ${p.id === state.myId ? `⭐ ${p.name} (${t('You')})` : p.name}
              </span>
            `).join('')}
          </div>
        </div>

        <button class="btn btn--ghost text-muted hover-danger" onclick="if(confirm('${t('Leave the room?')}')) window._exitGame()">
          ⬅️ ${t('Leave Room')}
        </button>
      </div>
    </div>
  `;
}

export function renderSetup(container, app) {
  const state = app.gameState;
  if (!state) { app.screen = 'home'; app.render(); return; }

  // Non-Sage players MUST see the player lobby waiting screen
  if (!state.isSage) {
    return renderPlayerLobby(container, app);
  }

  if (!app.setupState) {
    app.setupState = {
      mafiaCount: 1,
      doctorCount: 0,
      officerCount: 0,
      citizenCount: 0,
      gameMode: GameMode.SAGE_CONTROLLED,
      distributionMode: 'RANDOM',
      manualAssignments: {},
      mafiaAwareness: AwarenessMode.GROUP,
      doctorAwareness: AwarenessMode.INDIVIDUAL,
      officerAwareness: AwarenessMode.INDIVIDUAL,
      revealRole: true,
    };
  }
  const s = app.setupState;
  if (!s.distributionMode) s.distributionMode = 'RANDOM';
  if (!s.manualAssignments) s.manualAssignments = {};

  const joinedPlayers = state.players || [];
  const joinedCount = joinedPlayers.length; // excluding Sage
  
  // Ensure default manual assignments for each joined player
  joinedPlayers.forEach((p, idx) => {
    if (!s.manualAssignments[p.id]) {
      s.manualAssignments[p.id] = idx === 0 ? Role.MAFIA : Role.CITIZEN;
    }
  });
  // Clean up any players that left
  for (const pid of Object.keys(s.manualAssignments)) {
    if (!joinedPlayers.some(p => p.id === pid)) {
      delete s.manualAssignments[pid];
    }
  }

  // Random mode validation
  const totalRoles = s.mafiaCount + s.doctorCount + s.officerCount + s.citizenCount;
  const isRandomValid = totalRoles === joinedCount && s.mafiaCount >= 1 && joinedCount >= 1;
  const randomValidationMsg = joinedCount === 0
    ? t('Waiting for players to join...')
    : totalRoles !== joinedCount
    ? `${t('Role count')} (${totalRoles}) ${t("doesn't match player count")} (${joinedCount})`
    : s.mafiaCount < 1
    ? t('At least 1 Mafia is required')
    : `✓ ${t('Configuration valid —')} ${joinedCount} ${t('players ready')}`;

  // Manual mode validation & counts
  const assignedMafia = Object.values(s.manualAssignments).filter(r => r === Role.MAFIA).length;
  const assignedDoctor = Object.values(s.manualAssignments).filter(r => r === Role.DOCTOR).length;
  const assignedOfficer = Object.values(s.manualAssignments).filter(r => r === Role.OFFICER).length;
  const assignedCitizen = Object.values(s.manualAssignments).filter(r => r === Role.CITIZEN).length;
  const assignedTotal = Object.keys(s.manualAssignments).length;

  const isManualValid = joinedCount >= 1 && assignedTotal === joinedCount && assignedMafia >= 1;
  const manualValidationMsg = joinedCount === 0
    ? t('Waiting for players to join...')
    : assignedMafia < 1
    ? t('At least 1 Mafia is required')
    : `✓ ${t('Manual distribution ready —')} 🔪 ${assignedMafia} ${t('Mafia')}, 💊 ${assignedDoctor} ${t('Doctor')}, 🔍 ${assignedOfficer} ${t('Officer')}, 👤 ${assignedCitizen} ${t('Citizen')}`;

  const isSetupValid = s.distributionMode === 'MANUAL' ? isManualValid : isRandomValid;

  container.innerHTML = `
    <div class="setup">
      <div class="container--lg">
        <button class="btn btn--ghost btn--sm mb-6" onclick="window._backToHome()">← ${t('Back')}</button>

        <h1 class="setup__title">🎭 ${t('Game Setup')}</h1>

        <div class="text-center mb-6">
          <div class="text-xs text-muted" style="text-transform:uppercase; letter-spacing:0.1em">${t('Game Code')}</div>
          <div style="font-family:var(--font-display); font-size:var(--fs-3xl); font-weight:900; letter-spacing:0.15em; color:var(--sage)">${state.code}</div>
          <div class="text-sm mt-2">${t('Share this code with players so they can join!')}</div>
        </div>

        <div class="setup__section">
          <h2 class="setup__section-title">👥 ${t('Joined Players')} (${joinedCount})</h2>
          <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
            ${joinedPlayers.length === 0 ? `<div class="text-muted">${t('Waiting for players to join...')}</div>` : ''}
            ${joinedPlayers.map(p => `
              <span style="background:rgba(255,255,255,0.1); padding:6px 12px; border-radius:12px; display:inline-flex; align-items:center; gap:8px;">
                <span>${p.name}</span>
                <button class="btn btn--ghost btn--xs" style="padding:0 4px; color:var(--danger); font-size:12px; line-height:1; cursor:pointer;" onclick="window._sageKickPlayer('${p.id}')" title="${t('Kick player')}">✕</button>
              </span>
            `).join('')}
          </div>
          <div class="text-xs text-muted">${t('Auto-updating...')}</div>
        </div>

        <div class="setup__section">
          <h2 class="setup__section-title">🎲 ${t('Role Distribution')}</h2>
          ${renderRadioGroup('distributionMode', [
            { value: 'RANDOM', label: t('🎲 Random Distribution'), desc: t('Randomly shuffle and distribute configured roles to players.') },
            { value: 'MANUAL', label: t('✍️ Manual Distribution (Sage Assigns)'), desc: t('You manually select each player\'s specific role.') },
          ], s.distributionMode)}
        </div>

        ${s.distributionMode === 'RANDOM' ? `
          <div class="setup__section">
            <h2 class="setup__section-title">🎭 ${t('Roles')}</h2>
            <div class="setup__row">
              ${renderNumberInput('mafiaCount', s.mafiaCount, 1, 10, t('🔪 Mafia'))}
              ${renderNumberInput('doctorCount', s.doctorCount, 0, 5, t('💊 Doctor'))}
              ${renderNumberInput('officerCount', s.officerCount, 0, 5, t('🔍 Officer'))}
              ${renderNumberInput('citizenCount', s.citizenCount, 0, 20, t('👤 Citizen'))}
            </div>

            <div class="setup__validation ${isRandomValid ? 'setup__validation--success' : 'setup__validation--error'}">
              ${randomValidationMsg}
            </div>
          </div>
        ` : `
          <div class="setup__section">
            <h2 class="setup__section-title">✍️ ${t('Assign Roles to Players')}</h2>
            <div style="display:flex; flex-direction:column; gap:12px;">
              ${joinedPlayers.length === 0 ? `<div class="text-muted">${t('Waiting for players to join...')}</div>` : ''}
              ${joinedPlayers.map(p => {
                const curRole = s.manualAssignments[p.id] || Role.CITIZEN;
                return `
                  <div class="card p-3" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px;">
                    <div style="font-weight:700; font-size:1.05rem;">👤 ${p.name}</div>
                    <div>
                      <select class="input" style="padding:6px 12px; border-radius:8px; background:rgba(0,0,0,0.6); color:#fff; border:1px solid rgba(255,255,255,0.2); font-weight:600; cursor:pointer;" onchange="window._setPlayerRole('${p.id}', this.value)">
                        <option value="${Role.MAFIA}" ${curRole === Role.MAFIA ? 'selected' : ''}>🔪 ${t('Mafia')}</option>
                        <option value="${Role.DOCTOR}" ${curRole === Role.DOCTOR ? 'selected' : ''}>💊 ${t('Doctor')}</option>
                        <option value="${Role.OFFICER}" ${curRole === Role.OFFICER ? 'selected' : ''}>🔍 ${t('Officer')}</option>
                        <option value="${Role.CITIZEN}" ${curRole === Role.CITIZEN ? 'selected' : ''}>👤 ${t('Citizen')}</option>
                      </select>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="setup__validation mt-4 ${isManualValid ? 'setup__validation--success' : 'setup__validation--error'}">
              ${manualValidationMsg}
            </div>
          </div>
        `}

        <div class="setup__section">
          <h2 class="setup__section-title">⚙️ ${t('Game Mode')}</h2>
          ${renderRadioGroup('gameMode', [
            { value: GameMode.SAGE_CONTROLLED, label: t('🧙 Sage Controlled'), desc: t('The Sage manually controls phase progression and timing.') },
            { value: GameMode.AUTOMATED, label: t('⚡ Automated'), desc: t('The system automatically advances phases when timers expire.') },
          ], s.gameMode)}
        </div>
        
        <div class="setup__section">
          <h2 class="setup__section-title">🧠 ${t('Awareness Modes')}</h2>
          
          <h3 class="text-sm font-weight:600 mb-2 mt-4">${t('🔪 Mafia Awareness')}</h3>
          ${renderRadioGroup('mafiaAwareness', [
            { value: AwarenessMode.GROUP, label: t('Group (Teammates know each other)'), desc: '' },
            { value: AwarenessMode.INDIVIDUAL, label: t('Individual (Blind)'), desc: '' },
          ], s.mafiaAwareness)}

          <h3 class="text-sm font-weight:600 mb-2 mt-4">${t('💊 Doctor Awareness')}</h3>
          ${renderRadioGroup('doctorAwareness', [
            { value: AwarenessMode.GROUP, label: t('Group (Teammates know each other)'), desc: '' },
            { value: AwarenessMode.INDIVIDUAL, label: t('Individual (Blind)'), desc: '' },
          ], s.doctorAwareness)}

          <h3 class="text-sm font-weight:600 mb-2 mt-4">${t('🔍 Officer Awareness')}</h3>
          ${renderRadioGroup('officerAwareness', [
            { value: AwarenessMode.GROUP, label: t('Group (Teammates know each other)'), desc: '' },
            { value: AwarenessMode.INDIVIDUAL, label: t('Individual (Blind)'), desc: '' },
          ], s.officerAwareness)}
        </div>

        <div class="setup__section text-center">
          <button class="btn btn--primary btn--lg btn--block" onclick="window._startGame()" ${!isSetupValid ? 'disabled' : ''}>
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

  window._setPlayerRole = (playerId, role) => {
    if (!app.setupState) return;
    if (!app.setupState.manualAssignments) app.setupState.manualAssignments = {};
    app.setupState.manualAssignments[playerId] = role;
    app.render();
  };

  window._backToHome = () => {
    if (app && app.socket) {
      app.socket.emit('leaveRoom');
    }
    sessionStorage.removeItem('mafia_session_token');
    sessionStorage.removeItem('mafia_room_code');
    sessionStorage.removeItem('mafia_player_name');
    app.gameState = null;
    app.screen = 'home';
    app.render();
  };

  window._startGame = () => {
    const valid = s.distributionMode === 'MANUAL' ? isManualValid : isRandomValid;
    if (!valid) return;

    let roleCounts = {
      [Role.MAFIA]: s.mafiaCount,
      [Role.DOCTOR]: s.doctorCount,
      [Role.OFFICER]: s.officerCount,
      [Role.CITIZEN]: s.citizenCount,
    };
    if (s.distributionMode === 'MANUAL') {
      roleCounts = {
        [Role.MAFIA]: assignedMafia,
        [Role.DOCTOR]: assignedDoctor,
        [Role.OFFICER]: assignedOfficer,
        [Role.CITIZEN]: assignedCitizen,
      };
    }

    const mafiaCnt = s.distributionMode === 'MANUAL' ? assignedMafia : s.mafiaCount;

    app.socket.emit('sageCommand', {
      type: 'START_GAME',
      payload: {
        gameMode: s.gameMode,
        assignmentMode: s.distributionMode,
        playerRoles: s.distributionMode === 'MANUAL' ? s.manualAssignments : null,
        config: {
          mafiaKillCount: mafiaCnt > 2 ? 2 : 1, 
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
        roleCounts
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

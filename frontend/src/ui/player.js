/**
 * Player UI
 */

import { GamePhase, Role, ActionType, PhaseActiveRole, Team, AwarenessMode } from '../../shared/enums.js';
import { 
  renderPhaseHeader, renderTimer, renderPlayerCard, 
  renderRoleBadge, renderTeamBadge, renderChat, renderVoteBar,
  renderAlliesPanel
} from './components.js';
import { t } from '../i18n.js';

export function renderPlayerView(app) {
  const state = app.gameState;
  const isDead = !state.isAlive;
  
  if (isDead) {
    return renderDeadPlayerView(app, state);
  }

  let content = '';

  switch (state.phase) {
    case GamePhase.ROLE_ASSIGNMENT:
      content = renderRoleReveal(state);
      break;
    
    case GamePhase.NIGHT_MAFIA:
    case GamePhase.NIGHT_DOCTOR:
    case GamePhase.NIGHT_OFFICER:
      content = renderNightPhase(app, state);
      break;
      
    case GamePhase.NIGHT_RESOLUTION:
      content = renderWaiting(state, t('The sun is rising...'), t('The Sage is preparing the morning announcements.'));
      break;
      
    case GamePhase.MORNING:
      content = renderMorning(state);
      break;
      
    case GamePhase.DISCUSSION:
      content = renderDiscussion(app, state);
      break;
      
    case GamePhase.VOTING:
      content = renderVoting(app, state);
      break;
      
    case GamePhase.VOTE_RESOLUTION:
      content = renderVoteResolution(state);
      break;
      
    case GamePhase.FINISHED:
      content = renderGameOver(state);
      break;
      
    case GamePhase.LOBBY:
      content = renderWaiting(state, t('Game Cancelled'), t('The Sage has cancelled the game. You can leave the room.'));
      break;
      
    default:
      content = renderWaiting(state, t('Waiting...'), t('The game will begin shortly.'));
  }

  return `
    <div class="screen">
      <div class="screen__content">
        ${renderPlayerHeader(state)}
        ${content}
      </div>
    </div>
  `;
}

function renderPlayerHeader(state) {
  if (state.phase === GamePhase.ROLE_ASSIGNMENT || state.phase === GamePhase.FINISHED) return '';
  
  return `
    <div class="flex justify-between items-center mb-6" style="padding:var(--sp-3); background:var(--bg-card); border-radius:var(--r-xl); border:1px solid rgba(255,255,255,0.06)">
      <div class="flex items-center gap-3">
        <div class="player-card__avatar" style="width:40px; height:40px">${state.myRole === Role.MAFIA ? '🔪' : state.myRole === Role.DOCTOR ? '💊' : state.myRole === Role.OFFICER ? '🔍' : '👤'}</div>
        <div>
          <div class="text-sm font-weight:700">${state.myName}</div>
          <div class="mt-1">${renderRoleBadge(state.myRole)}</div>
        </div>
      </div>
      <div class="text-right flex items-center gap-2">
        ${state.phase !== GamePhase.FINISHED && state.phase !== GamePhase.ROLE_ASSIGNMENT ? renderTimer('') : ''}
        <button class="btn btn--ghost p-2 text-muted hover-danger" onclick="if(confirm('Are you sure you want to leave the game?')) window._exitGame()" title="Leave Room">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   PHASE VIEWS
   ═══════════════════════════════════════════════════════════════ */

function renderRoleReveal(state) {
  return `
    <div class="role-reveal">
      <h2 class="text-2xl font-weight:800 mb-6">${t('Your Secret Role')}</h2>
      <div class="role-reveal__card role-reveal__card--revealed" style="border-color:var(--${state.myRole.toLowerCase()}-soft)">
        <div class="role-reveal__icon">${state.myRole === Role.MAFIA ? '🔪' : state.myRole === Role.DOCTOR ? '💊' : state.myRole === Role.OFFICER ? '🔍' : '👤'}</div>
        <div class="role-reveal__role" style="color:var(--${state.myRole.toLowerCase()}-soft)">${state.myRole}</div>
        <div class="role-reveal__team" style="color:var(--text-muted)">Team: ${t(state.myTeam)}</div>
        
        <div class="role-reveal__hint">
          ${t(getRoleHint(state.myRole))}
        </div>
      </div>
      <div class="mt-8 text-sm text-muted">Waiting for Sage to start the game...</div>
    </div>
  `;
}

function getRoleHint(role) {
  switch(role) {
    case Role.MAFIA: return 'Work with your team to eliminate the village at night. Blend in during the day.';
    case Role.DOCTOR: return 'Choose one player each night to protect from the Mafia. You can protect yourself, but not twice in a row.';
    case Role.OFFICER: return 'Investigate one player each night to learn if they are Mafia or Innocent.';
    case Role.CITIZEN: return 'You have no special night abilities. Use your wits during the day to find the Mafia.';
    default: return '';
  }
}

function renderNightPhase(app, state) {
  const activeRole = PhaseActiveRole[state.phase];
  
  // If not my turn, show waiting screen
  if (state.myRole !== activeRole) {
    let msg = 'The village sleeps...';
    if (activeRole === Role.MAFIA) msg = 'The Mafia are choosing their target.';
    else if (activeRole === Role.DOCTOR) msg = 'The Doctor is making their rounds.';
    else if (activeRole === Role.OFFICER) msg = 'The Officer is conducting an investigation.';
    return renderWaiting(state, '🌙 Night Phase', msg);
  }

  // It's my turn!
  const actionType = state.myRole === Role.MAFIA ? ActionType.KILL 
                   : state.myRole === Role.DOCTOR ? ActionType.HEAL 
                   : ActionType.INVESTIGATE;
                   
  const hasSubmitted = state.myActions && state.myActions.length > 0;
  
  if (hasSubmitted) {
    return `
      ${renderWaiting(state, t('Action Submitted'), t('Waiting for the phase to end...'))}
      <div class="mt-8 text-center">
        <button class="btn btn--ghost" onclick="window._retractAction()">${t('Retract & Change Target')}</button>
      </div>
    `;
  }

  // Action selection screen
  const configKey = state.myRole === Role.MAFIA ? 'mafiaKillCount' : state.myRole === Role.DOCTOR ? 'doctorHealCount' : null;
  const maxTargets = configKey ? state.config[configKey] : 1;
  const selected = app.selectedTargets || [];
  
  let title = '', subtitle = '';
  if (state.myRole === Role.MAFIA) { title = 'Select Kill Targets'; subtitle = `Choose up to ${maxTargets} players to eliminate.`; }
  else if (state.myRole === Role.DOCTOR) { title = 'Select Heal Targets'; subtitle = `Choose up to ${maxTargets} players to protect.`; }
  else if (state.myRole === Role.OFFICER) { title = 'Select Investigation Target'; subtitle = 'Choose 1 player to investigate.'; }

  // Allies panel (Group mode)
  const allies = state.players.filter(p => p.id !== state.myId && p.role === state.myRole);
  const alliesPanel = allies.length > 0 ? renderAlliesPanel(
    `Known ${state.myRole}s`, 
    allies, 
    `var(--${state.myRole.toLowerCase()}-soft)`
  ) : '';

  return `
    <div class="fade-in">
      ${renderPhaseHeader(state.phase, state.currentRound, subtitle)}
      
      ${alliesPanel}
      
      <div class="selection-counter">
        <span class="selection-counter__label">Selected:</span>
        <span class="selection-counter__value ${selected.length === maxTargets ? 'text-success' : ''}">${selected.length} / ${maxTargets}</span>
      </div>

      <div class="player-grid mt-4">
        ${state.eligibleTargets.map(t => renderPlayerCard(t, {
          selectable: !t.disabled,
          selected: selected.includes(t.id),
          disabled: t.disabled,
          disabledReason: t.disabledReason,
          onClick: t.disabled ? '' : `window._toggleTarget('${t.id}', ${maxTargets})`
        })).join('')}
      </div>

      <div class="mt-8 text-center">
        <button class="btn btn--primary btn--lg" 
                ${selected.length === 0 ? 'disabled' : ''}
                onclick="window._submitAction('${actionType}')">
          ${t('Confirm Selection')}
        </button>
      </div>
      
      ${state.myRole === Role.MAFIA && state.mafiaAwareness === AwarenessMode.GROUP ? `
        <div class="mt-8">
          ${renderChat((state.chatMessages || {}).MAFIA || [], { title: t('Mafia Chat'), channelIcon: '🔪', onSend: 'window._sendChat("MAFIA")' })}
        </div>
      ` : ''}
    </div>
  `;
}

function renderMorning(state) {
  const deaths = state.nightDeaths || [];
  const announcements = state.announcements.filter(a => a.roundNumber === state.currentRound);
  
  const privateInv = (state.myInvestigations && state.myInvestigations.length > 0) ? `
    <div class="card mb-3 text-left" style="border:1px solid rgba(59,130,246,0.3); background:rgba(59,130,246,0.1);">
      <div class="text-xs uppercase tracking-widest font-weight:700 mb-2" style="color:#60a5fa">🔍 ${t('Private Investigation Result')}</div>
      ${state.myInvestigations.map(inv => `
        <div class="text-sm">${t('You investigated')} <strong>${inv.targetName}</strong> ${t('and the Sage revealed they are:')} 
          <span style="color:${inv.result === 'MAFIA' ? 'var(--danger)' : 'var(--success)'}; font-weight:bold;">${t(inv.result)}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="fade-in">
      ${renderPhaseHeader(state.phase, state.currentRound)}
      
      <div class="container mt-6 text-center">
        ${deaths.length === 0 
          ? `<div class="announcement mb-6"><div class="announcement__icon">🌅</div><div class="announcement__text">Nobody died last night.</div></div>`
          : `<div class="announcement mb-6" style="background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.3)">
              <div class="announcement__icon">💀</div>
              <div class="announcement__text" style="color:var(--mafia-soft)">${deaths.map(d=>d.name).join(' and ')} died last night.</div>
             </div>`
        }
        
        ${privateInv}
        
        ${announcements.map(a => `
          <div class="card mb-3 text-left">
            <div class="text-xs text-sage uppercase tracking-widest font-weight:700 mb-2">Sage Announcement</div>
            <div class="text-lg">${a.message}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderDiscussion(app, state) {
  const privateInv = (state.myInvestigations && state.myInvestigations.length > 0) ? `
    <div class="card mb-3 text-left" style="border:1px solid rgba(59,130,246,0.3); background:rgba(59,130,246,0.1);">
      <div class="text-xs uppercase tracking-widest font-weight:700 mb-2" style="color:#60a5fa">🔍 Private Investigation Result</div>
      ${state.myInvestigations.map(inv => `
        <div class="text-sm">You investigated <strong>${inv.targetName}</strong> and the Sage revealed they are: 
          <span style="color:${inv.result === 'MAFIA' ? 'var(--danger)' : 'var(--success)'}; font-weight:bold;">${inv.result}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="fade-in">
      ${renderPhaseHeader(state.phase, state.currentRound, 'Discuss and find the Mafia!')}
      <div class="container--lg mt-4">
        ${privateInv}
        ${renderChat((state.chatMessages || {}).PUBLIC || [], { 
          title: 'Village Square', 
          channelIcon: '🏛️', 
          onSend: 'window._sendChat("PUBLIC")' 
        })}
      </div>
    </div>
  `;
}

function renderVoting(app, state) {
  const hasVoted = !!state.myVote;
  const myVoteTarget = hasVoted ? state.players.find(p => p.id === state.myVote)?.name : null;
  const tally = state.voteTally || {};
  const aliveCount = state.players.filter(p => p.isAlive).length + 1; // +1 for self
  
  return `
    <div class="fade-in">
      ${renderPhaseHeader(state.phase, state.currentRound, 'Cast your vote to eliminate a player.')}
      
      <div class="container--lg mt-4" style="display:grid; grid-template-columns: 1fr 300px; gap:var(--sp-6)">
        <div>
          ${hasVoted ? `
            <div class="card mb-6" style="border-color:var(--sage); background:var(--sage-bg)">
              <div class="text-sm font-weight:600 mb-1">Your Vote:</div>
              <div class="text-xl font-weight:800 text-sage">${myVoteTarget}</div>
            </div>
          ` : ''}
          
          <h3 class="text-sm uppercase tracking-widest text-muted mb-3">Select Player</h3>
          <div class="player-grid">
            <!-- Can vote for self -->
            ${renderPlayerCard({id: state.myId, name: state.myName + ' (You)', isAlive: true}, {
              selectable: true,
              selected: state.myVote === state.myId,
              onClick: `window._submitVote('${state.myId}')`
            })}
            ${state.eligibleVoteTargets.map(t => renderPlayerCard(t, {
              selectable: true,
              selected: state.myVote === t.id,
              onClick: `window._submitVote('${t.id}')`
            })).join('')}
          </div>
        </div>
        
        <div class="card h-100">
          <h3 class="text-sm uppercase tracking-widest text-muted mb-4">Live Tally</h3>
          ${Object.entries(tally).sort((a,b)=>b[1]-a[1]).map(([tid, count]) => {
            const name = tid === state.myId ? state.myName : state.players.find(p=>p.id===tid)?.name;
            return renderVoteBar(name, count, aliveCount);
          }).join('')}
          ${Object.keys(tally).length === 0 ? '<div class="text-muted text-sm text-center py-4">No votes yet</div>' : ''}
        </div>
      </div>
      
      <div class="container--lg mt-6">
        ${renderChat((state.chatMessages || {}).PUBLIC || [], { title: 'Village Square', onSend: 'window._sendChat("PUBLIC")' })}
      </div>
    </div>
  `;
}

function renderVoteResolution(state) {
  const vr = state.voteResult;
  if (!vr) return renderWaiting(state, 'Calculating Votes...', '');
  
  const aliveCount = state.players.filter(p => p.isAlive).length + (vr.eliminatedId ? 1 : 0) + 1; // +1 for self if alive
  
  return `
    <div class="fade-in">
      ${renderPhaseHeader(state.phase, state.currentRound)}
      
      <div class="container mt-6">
        <div class="text-center p-6 rounded mb-6" style="background:rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1)">
          ${vr.isTie 
            ? `<div class="text-4xl mb-4">⚖️</div>
               <div class="text-2xl font-weight:800 text-warning mb-2">Vote Tie!</div>
               <div class="text-lg text-muted">Nobody was eliminated.</div>`
            : `<div class="text-4xl mb-4">🚪</div>
               <div class="text-2xl font-weight:800 text-danger mb-2">${vr.eliminatedId === state.myId ? 'You have' : state.players.find(p=>p.id===vr.eliminatedId)?.name + ' has'} been eliminated!</div>
               ${state.revealRoleAfterVoting ? `<div class="mt-4">Role: ${renderRoleBadge(vr.eliminatedRole)}</div>` : ''}`
          }
        </div>
        
        <div class="card">
          <h3 class="text-sm uppercase tracking-widest text-muted mb-4">Final Results</h3>
          ${Object.entries(vr.tally).sort((a,b)=>b[1]-a[1]).map(([tid, count]) => {
            const name = tid === state.myId ? state.myName : state.players.find(p=>p.id===tid)?.name;
            const isEliminated = tid === vr.eliminatedId;
            const type = isEliminated ? 'winner' : (vr.isTie && count === Object.values(vr.tally)[0] ? 'tie' : 'normal');
            return renderVoteBar(name, count, aliveCount, type);
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderGameOver(state) {
  const isVillageWin = state.winner === Team.VILLAGE;
  const isMyTeam = state.myTeam === state.winner;
  
  return `
    <div class="game-over fade-in">
      <div class="game-over__trophy">${isVillageWin ? '🕊️' : '🔪'}</div>
      <div class="game-over__title" style="color:${isVillageWin ? 'var(--village-soft)' : 'var(--mafia-soft)'}">
        ${state.winner} WINS!
      </div>
      <div class="game-over__subtitle">
        ${isMyTeam ? 'Congratulations! Your team emerged victorious.' : 'Better luck next time...'}
      </div>
      
      <div class="card" style="width:100%; max-width:600px; text-align:left; margin-bottom: 2rem;">
        <h3 class="text-lg font-weight:700 mb-4 text-center">Final Roles</h3>
        <div class="player-grid">
          ${state.players.map(p => renderPlayerCard(p, { showRole: true, showStatus: true })).join('')}
          ${renderPlayerCard({id:state.myId, name:state.myName+' (You)', role:state.myRole, isAlive:state.isAlive}, { showRole: true, showStatus: true })}
        </div>
      </div>
      
      <button class="btn btn--ghost text-muted hover-danger" onclick="if(confirm('Leave the room?')) window._exitGame()">⬅️ Leave Room</button>
    </div>
  `;
}

function renderDeadPlayerView(app, state) {
  return `
    <div class="screen">
      <div class="dead-overlay">
        <div class="container text-center">
          <div class="dead-banner justify-center mb-8">
            <span class="dead-banner__icon">💀</span>
            <span class="dead-banner__text">YOU ARE DEAD</span>
          </div>
          
          <div class="text-xl font-weight:600 mb-2">You can no longer participate.</div>
          <div class="text-sm text-muted mb-8">You may watch the game and chat with other dead players.</div>
          
          <div style="max-width:600px; margin:0 auto; text-align:left">
            ${renderChat((state.chatMessages || {}).DEAD || [], { 
              title: 'Graveyard Chat', 
              channelIcon: '🪦', 
              onSend: 'window._sendChat("DEAD")' 
            })}
          </div>
        </div>
      </div>
      <!-- Background shows the game blurrily -->
      <div style="filter:blur(8px); opacity:0.3; pointer-events:none; padding:var(--sp-8)">
        ${renderPhaseHeader(state.phase, state.currentRound)}
        <div class="player-grid mt-8">
          ${state.players.map(p => renderPlayerCard(p)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderWaiting(state, title, subtitle) {
  const isLobby = state.phase === GamePhase.LOBBY;
  return `
    <div class="waiting fade-in">
      <div class="waiting__moon">${state.phase.includes('NIGHT') ? '🌙' : '⏳'}</div>
      <div class="waiting__text">${title}</div>
      <div class="waiting__subtext">${subtitle}</div>
      <div class="waiting__dots">
        <div class="waiting__dot"></div>
        <div class="waiting__dot"></div>
        <div class="waiting__dot"></div>
      </div>
      ${isLobby ? `<div class="mt-8"><button class="btn btn--ghost" onclick="window._exitGame()">⬅️ Leave Room</button></div>` : ''}
    </div>
  `;
}

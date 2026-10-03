/**
 * Sage Dashboard UI
 */

import { 
  GamePhase, Role, Team, ActionType, PhaseActiveRole, GameMode 
} from '../../shared/enums.js';
import { 
  renderPhaseHeader, renderTimer, renderPlayerCard, 
  renderDevControls, renderAnnouncementComposer, renderVoteBar,
  renderChat
} from './components.js';

export function renderSageDash(app) {
  const state = app.gameState;
  const nonSagePlayers = state.players || [];

  // Helper to group players
  const alivePlayers = nonSagePlayers.filter(p => p.isAlive);
  const deadPlayers = nonSagePlayers.filter(p => !p.isAlive);

  return `
    <div class="sage-dash">
      <div class="sage-dash__main">
        
        <!-- Header & Timer -->
        <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="text-xs text-muted mb-1" style="text-transform:uppercase; letter-spacing:0.1em">Current Phase</div>
            <h2 style="font-family:var(--font-display); font-size:var(--fs-2xl); font-weight:800; color:var(--sage)">
              ${state.phase.replace('_', ' ')}
            </h2>
            <div class="text-sm mt-1">Round ${state.currentRound}</div>
          </div>
          <div style="text-align:right">
            ${state.phase !== GamePhase.FINISHED ? renderTimer('Time Remaining') : ''}
          </div>
        </div>

        <!-- Dev Controls -->
        ${renderSageControls(app, state)}

        <!-- Active Phase Details -->
        ${renderActivePhaseDetails(state, nonSagePlayers)}

        <!-- All Players Table -->
        <div class="sage-panel">
          <div class="sage-panel__header">
            <h3 class="sage-panel__title">👥 All Players (${alivePlayers.length} Alive / ${deadPlayers.length} Dead)</h3>
          </div>
          <table class="sage-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>Role</th>
                <th>Team</th>
                <th>Death Info</th>
              </tr>
            </thead>
            <tbody>
              ${nonSagePlayers.map(p => `
                <tr style="opacity: ${p.isAlive ? 1 : 0.5}">
                  <td><span class="status-dot ${p.isAlive ? 'status-dot--alive' : 'status-dot--dead'}"></span></td>
                  <td style="font-weight:600">${p.name}</td>
                  <td><span class="role-badge role-badge--${p.role.toLowerCase()}">${p.role}</span></td>
                  <td><span class="team-badge team-badge--${p.team.toLowerCase()}">${p.team}</span></td>
                  <td class="text-xs text-muted">${!p.isAlive ? `${p.deathCause} (R${p.deathRound})` : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

      </div>

      <div class="sage-dash__sidebar">
        <!-- Game Info & Win Conditions -->
        <div class="card">
          <h3 class="sage-panel__title mb-4">📊 Game Status</h3>
          <div class="flex justify-between mb-2">
            <span class="text-sm">Mafia Remaining:</span>
            <span class="text-sm font-weight:700 text-danger" style="color:var(--mafia-soft)">${state.mafiaCount}</span>
          </div>
          <div class="flex justify-between mb-4">
            <span class="text-sm">Village Remaining:</span>
            <span class="text-sm font-weight:700" style="color:var(--village-soft)">${state.villageCount}</span>
          </div>
          ${state.winner ? `
            <div class="text-center mt-4 p-3" style="background:rgba(251,191,36,0.1); border-radius:var(--r-md); border:1px solid var(--warning)">
              <div class="text-xs text-muted text-uppercase mb-1">Winner</div>
              <div style="font-family:var(--font-display); font-size:var(--fs-xl); font-weight:800; color:var(--warning)">
                🏆 ${state.winner}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Announcements / Logs -->
        <div class="sage-panel" style="flex:1; display:flex; flex-direction:column">
          <div class="sage-panel__header">
            <h3 class="sage-panel__title">📢 Announcements</h3>
          </div>
          <div class="sage-panel__body" style="flex:1; overflow-y:auto; max-height:400px">
            ${state.announcements.length === 0 ? '<div class="text-muted text-sm text-center py-4">No announcements yet</div>' : 
              state.announcements.map(a => `
                <div class="mb-3 p-3" style="background:rgba(255,255,255,0.05); border-radius:var(--r-md); border-left:3px solid var(--sage)">
                  <div class="text-xs text-muted mb-1">Round ${a.roundNumber}</div>
                  <div class="text-sm">${a.message}</div>
                </div>
              `).reverse().join('')
            }
          </div>
        </div>

        <!-- Chat View -->
        ${renderChat((state.chatMessages || {})[app.activeChatChannel || 'PUBLIC'] || [], {
          title: `View Chat: ${app.activeChatChannel || 'PUBLIC'}`,
          canSend: false
        })}
        <div class="tab-bar mt-2">
          ${['PUBLIC', 'MAFIA', 'DEAD'].map(ch => `
            <button class="tab-bar__item ${app.activeChatChannel === ch || (!app.activeChatChannel && ch === 'PUBLIC') ? 'tab-bar__item--active' : ''}"
                    onclick="window._sageSetChat('${ch}')">${ch}</button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderActivePhaseDetails(state, players) {
  if (state.phase === GamePhase.FINISHED) return '';

  let content = '';

  // Night Phases
  if ([GamePhase.NIGHT_MAFIA, GamePhase.NIGHT_DOCTOR, GamePhase.NIGHT_OFFICER].includes(state.phase)) {
    const activeRole = PhaseActiveRole[state.phase];
    const expectedActors = players.filter(p => p.isAlive && p.role === activeRole);
    const actions = state.allActions || [];
    
    content = `
      <h3 class="sage-panel__title mb-3">🌙 Night Actions (${activeRole})</h3>
      <div class="player-grid">
        ${expectedActors.map(actor => {
          const acts = actions.filter(a => a.actorId === actor.id);
          const targetedNames = acts.map(a => {
            const t = players.find(p => p.id === a.targetId);
            return t ? t.name : 'Unknown';
          }).join(', ');
          
          return `
            <div class="card" style="padding:var(--sp-3)">
              <div class="text-sm font-weight:600 mb-2">${actor.name}</div>
              ${acts.length > 0 
                ? `<div class="text-xs" style="color:var(--success)">Target: <strong>${targetedNames}</strong></div>
                   ${acts[0].result ? `<div class="text-xs mt-1" style="color:var(--info)">Result: ${acts[0].result}</div>` : ''}`
                : `<div class="text-xs text-muted">Waiting for action...</div>`
              }
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Night Resolution
  else if (state.phase === GamePhase.NIGHT_RESOLUTION) {
    const res = state.resolution;
    if (!res) content = '<div class="text-muted text-sm">Resolution data not available yet.</div>';
    else {
      content = `
        <h3 class="sage-panel__title mb-3">⚡ Resolution Summary</h3>
        <div class="flex gap-4">
          <div class="card flex-1">
            <div class="text-xs text-muted uppercase mb-2">Mafia Targets</div>
            ${res.killTargets.length > 0 ? res.killTargets.map(id => {
              const p = players.find(x => x.id === id);
              return `<div class="text-sm text-danger mb-1">🔪 ${p?.name}</div>`;
            }).join('') : '<div class="text-xs text-muted">None</div>'}
          </div>
          <div class="card flex-1">
            <div class="text-xs text-muted uppercase mb-2">Doctor Saves</div>
            ${res.healTargets.length > 0 ? res.healTargets.map(id => {
              const p = players.find(x => x.id === id);
              return `<div class="text-sm text-success mb-1">💊 ${p?.name}</div>`;
            }).join('') : '<div class="text-xs text-muted">None</div>'}
          </div>
          <div class="card flex-1">
            <div class="text-xs text-muted uppercase mb-2">Final Deaths</div>
            ${res.deaths.length > 0 ? res.deaths.map(id => {
              const p = players.find(x => x.id === id);
              return `<div class="text-sm text-danger font-weight:700 mb-1">💀 ${p?.name}</div>`;
            }).join('') : '<div class="text-sm text-success font-weight:700">Nobody Died</div>'}
          </div>
        </div>
      `;
    }
  }

  // Morning / Announcements
  else if (state.phase === GamePhase.MORNING) {
    const res = state.resolution;
    const deaths = res?.deaths || [];
    const deathNames = deaths.map(id => players.find(p => p.id === id)?.name).join(' and ');
    const investigations = res?.investigations || [];
    
    const presets = [
      deaths.length === 0 ? 'Nobody died last night.' : `${deathNames} died last night.`,
      'An officer accused a Mafia.',
      'An officer accused an innocent.',
      'The town wakes up to a beautiful morning.'
    ];

    content = `
      <h3 class="sage-panel__title mb-3">☀️ Morning Announcements</h3>
      <div class="mb-4">
        ${investigations.length > 0 ? `
          <div class="text-xs text-muted mb-2">Private Investigation Results:</div>
          ${investigations.map(inv => {
            const officer = players.find(p => p.id === inv.officerId)?.name;
            const target = players.find(p => p.id === inv.targetId)?.name;
            return `
              <div class="text-sm mb-2 flex items-center justify-between" style="background:rgba(255,255,255,0.05); padding:8px; border-radius:4px;">
                <div>
                  🔍 <strong>${officer}</strong> investigated <strong>${target}</strong>: 
                  <span style="color:${inv.result === 'MAFIA' ? 'var(--mafia-soft)' : 'var(--doctor-soft)'}">${inv.result}</span>
                </div>
                ${!inv.revealed 
                  ? `<button class="btn btn--sm btn--ghost" onclick="window._sageRevealInvestigation('${inv.officerId}')">Reveal to Officer</button>` 
                  : `<span class="text-xs text-success">Revealed</span>`
                }
              </div>`;
          }).join('')}
        ` : ''}
      </div>
      ${renderAnnouncementComposer(presets)}
    `;
  }

  // Voting
  else if (state.phase === GamePhase.VOTING) {
    const votes = state.votes || [];
    const tally = {};
    votes.forEach(v => {
      tally[v.targetId] = (tally[v.targetId] || 0) + 1;
    });
    
    const aliveCount = players.filter(p => p.isAlive).length;
    
    content = `
      <h3 class="sage-panel__title mb-3">🗳️ Live Voting (${votes.length} / ${aliveCount} voted)</h3>
      <div class="card">
        ${Object.entries(tally).sort((a,b) => b[1]-a[1]).map(([targetId, count]) => {
          const target = players.find(p => p.id === targetId);
          return renderVoteBar(target?.name || 'Unknown', count, aliveCount, 'normal');
        }).join('')}
        ${votes.length === 0 ? '<div class="text-sm text-muted text-center py-4">No votes cast yet</div>' : ''}
      </div>
    `;
  }

  // Vote Resolution
  else if (state.phase === GamePhase.VOTE_RESOLUTION) {
    const vr = state.voteResult;
    if (!vr) content = '<div class="text-muted text-sm">Vote results not available.</div>';
    else {
      const aliveCount = players.filter(p => p.isAlive).length + (vr.eliminatedId ? 1 : 0); // Add 1 back if someone just died
      content = `
        <h3 class="sage-panel__title mb-3">📊 Voting Results</h3>
        <div class="card mb-4">
          ${Object.entries(vr.tally).sort((a,b) => b[1]-a[1]).map(([targetId, count]) => {
            const target = players.find(p => p.id === targetId);
            const isEliminated = targetId === vr.eliminatedId;
            const type = isEliminated ? 'winner' : (vr.isTie && count === Object.values(vr.tally)[0] ? 'tie' : 'normal');
            return renderVoteBar(target?.name || 'Unknown', count, aliveCount, type);
          }).join('')}
        </div>
        <div class="text-center p-4 rounded" style="background:rgba(255,255,255,0.05)">
          ${vr.isTie 
            ? `<div class="text-lg text-warning font-weight:700">Vote Tie! Nobody is eliminated.</div>`
            : `<div class="text-lg text-danger font-weight:700">${players.find(p=>p.id===vr.eliminatedId)?.name} has been eliminated!</div>
               ${state.revealRoleAfterVoting ? `<div class="text-sm mt-1">Role was: <span class="role-badge role-badge--${vr.eliminatedRole.toLowerCase()}">${vr.eliminatedRole}</span></div>` : ''}`
          }
        </div>
      `;
    }
  }

  return content ? `<div class="sage-panel mt-4"><div class="sage-panel__body">${content}</div></div>` : '';
}

function renderSageControls(app, state) {
  const isAuto = state.gameMode === GameMode.AUTOMATED;
  
  const buttons = [
    { label: 'Advance Phase ⏩', action: 'window._sageAdvancePhase()', disabled: state.phase === GamePhase.FINISHED },
    { label: '+30s ⏱️', action: 'window._sageExtendTimer(30)', disabled: state.timerRemaining <= 0 || state.phase === GamePhase.FINISHED },
    { label: 'Reset Round ⏪', action: 'window._sageResetRound()', disabled: state.phase === GamePhase.FINISHED },
    { label: 'Force Village Win 🏆', action: 'window._sageForceWin("VILLAGE")', disabled: state.phase === GamePhase.FINISHED },
    { label: 'Force Mafia Win 🏆', action: 'window._sageForceWin("MAFIA")', disabled: state.phase === GamePhase.FINISHED },
  ];

  return renderDevControls(buttons);
}

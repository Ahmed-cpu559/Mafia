/**
 * Sage Dashboard UI
 */

import { 
  GamePhase, Role, Team, ActionType, PhaseActiveRole, GameMode, PhaseTheme
} from '../../shared/enums.js';
import { 
  renderPhaseHeader, renderTimer, renderPlayerCard, 
  renderDevControls, renderAnnouncementComposer, renderVoteBar,
  renderChat, renderRoleBadge, renderTeamBadge
} from './components.js';
import { t } from '../i18n.js';

export function renderSageDash(app) {
  const state = app.gameState;
  const nonSagePlayers = state.players || [];

  // Helper to group players
  const alivePlayers = nonSagePlayers.filter(p => p.isAlive);
  const deadPlayers = nonSagePlayers.filter(p => !p.isAlive);

  const phaseLabel = PhaseTheme[state.phase]?.label || state.phase.replace('_', ' ');

  return `
    <div class="sage-dash">
      <div class="sage-dash__main">
        
        <!-- Header & Timer -->
        <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="text-xs text-muted mb-1" style="text-transform:uppercase; letter-spacing:0.1em">${t('Current Phase')}</div>
            <h2 style="font-family:var(--font-display); font-size:var(--fs-2xl); font-weight:800; color:var(--sage)">
              ${t(phaseLabel)}
            </h2>
            <div class="text-sm mt-1">${t('Round')} ${state.currentRound}</div>
          </div>
          <div style="text-align:right">
            ${state.phase !== GamePhase.FINISHED ? renderTimer(t('Time Remaining')) : ''}
          </div>
        </div>

        <!-- Dev Controls -->
        ${renderSageControls(app, state)}

        <!-- Active Phase Details -->
        ${renderActivePhaseDetails(state, nonSagePlayers)}

        <!-- All Players Table -->
        <div class="sage-panel">
          <div class="sage-panel__header">
            <h3 class="sage-panel__title">👥 ${t('All Players')} (${alivePlayers.length} ${t('Alive')} / ${deadPlayers.length} ${t('Dead')})</h3>
          </div>
          <table class="sage-table">
            <thead>
              <tr>
                <th>${t('Status')}</th>
                <th>${t('Name')}</th>
                <th>${t('Role')}</th>
                <th>${t('Team')}</th>
                <th>${t('Death Info')}</th>
              </tr>
            </thead>
            <tbody>
              ${nonSagePlayers.map(p => `
                <tr style="opacity: ${p.isAlive ? 1 : 0.5}">
                  <td><span class="status-dot ${p.isAlive ? 'status-dot--alive' : 'status-dot--dead'}"></span></td>
                  <td style="font-weight:600">${p.name}</td>
                  <td>${p.role ? renderRoleBadge(p.role) : '-'}</td>
                  <td>${p.team ? renderTeamBadge(p.team) : '-'}</td>
                  <td class="text-xs text-muted">${!p.isAlive ? `${t(p.deathCause || '')} (R${p.deathRound})` : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

      </div>

      <div class="sage-dash__sidebar">
        <!-- Game Info & Win Conditions -->
        <div class="card">
          <h3 class="sage-panel__title mb-4">📊 ${t('Game Status')}</h3>
          <div class="flex justify-between mb-2">
            <span class="text-sm">${t('Mafia Remaining:')}</span>
            <span class="text-sm font-weight:700 text-danger" style="color:var(--mafia-soft)">${state.mafiaCount}</span>
          </div>
          <div class="flex justify-between mb-4">
            <span class="text-sm">${t('Village Remaining:')}</span>
            <span class="text-sm font-weight:700" style="color:var(--village-soft)">${state.villageCount}</span>
          </div>
          ${state.winner ? `
            <div class="text-center mt-4 p-3" style="background:rgba(251,191,36,0.1); border-radius:var(--r-md); border:1px solid var(--warning)">
              <div class="text-xs text-muted text-uppercase mb-1">${t('Winner')}</div>
              <div style="font-family:var(--font-display); font-size:var(--fs-xl); font-weight:800; color:var(--warning)">
                🏆 ${t(state.winner)}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Announcements / Logs -->
        <div class="sage-panel" style="flex:1; display:flex; flex-direction:column">
          <div class="sage-panel__header">
            <h3 class="sage-panel__title">📢 ${t('Announcements')}</h3>
          </div>
          <div class="sage-panel__body" style="flex:1; overflow-y:auto; max-height:400px">
            ${state.announcements.length === 0 ? `<div class="text-muted text-sm text-center py-4">${t('No announcements yet')}</div>` : 
              state.announcements.map(a => `
                <div class="mb-3 p-3" style="background:rgba(255,255,255,0.05); border-radius:var(--r-md); border-left:3px solid var(--sage)">
                  <div class="text-xs text-muted mb-1">${t('Round')} ${a.roundNumber}</div>
                  <div class="text-sm">${a.message}</div>
                </div>
              `).reverse().join('')
            }
          </div>
        </div>

        <!-- Chat View -->
        ${renderChat((state.chatMessages || {})[app.activeChatChannel || 'PUBLIC'] || [], {
          title: `${t('View Chat:')} ${t(app.activeChatChannel || 'PUBLIC')}`,
          canSend: false
        })}
        <div class="tab-bar mt-2">
          ${['PUBLIC', 'MAFIA', 'DEAD'].map(ch => `
            <button class="tab-bar__item ${app.activeChatChannel === ch || (!app.activeChatChannel && ch === 'PUBLIC') ? 'tab-bar__item--active' : ''}"
                    onclick="window._sageSetChat('${ch}')">${t(ch)}</button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderActivePhaseDetails(state, players) {
  let content = '';

  // Night Setup Phase
  if (state.phase === GamePhase.NIGHT_SETUP) {
    content = `
      <div class="card mb-2" style="background:linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(30,27,75,0.4) 100%); border:1px solid #6366f1; padding:20px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div class="text-xs text-muted uppercase mb-1">🌙 ${t('Round')} ${state.currentRound} — ${t('Night Preparation')}</div>
          <div style="font-size:1.2rem; font-weight:800; color:#fff;">${t('Adjust Round Configuration')}</div>
          <div class="text-xs text-muted mt-1">${t('Set allowances below, then start the night phase when ready.')}</div>
        </div>
        <button class="btn btn--primary btn--lg" onclick="window._sageAdvancePhase()" style="font-weight:800; font-size:1.1rem; padding:12px 24px;">
          ▶️ ${t('Start Night Phase')} 🌙
        </button>
      </div>
    `;
  }

  // End of Game Citizen Suspicions Dashboard
  else if (state.phase === GamePhase.FINISHED) {
    if (state.citizenStats && state.citizenStats.length > 0) {
      content = `
        <h3 class="sage-panel__title mb-3">🎯 ${t('Citizen Deductions & Accuracy')}</h3>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${state.citizenStats.map(stat => {
            const pct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
            return `
              <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:12px; border:1px solid rgba(255,255,255,0.08);">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                  <strong>👤 ${stat.playerName}</strong>
                  <span style="font-weight:700; color:${pct >= 50 ? 'var(--success)' : 'var(--warning)'};">${stat.correct} / ${stat.total} (${pct}%)</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  ${stat.history.map(h => `
                    <span style="font-size:0.75rem; padding:2px 8px; border-radius:6px; background:${h.isCorrect ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color:${h.isCorrect ? '#34d399' : '#f87171'}; border:1px solid ${h.isCorrect ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'};">
                      R${h.round}: ${h.targetName} (${h.isCorrect ? '🎯 ' + t('Mafia') : '❌ ' + t('Innocent')})
                    </span>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  }

  // Unified Night Phase or Legacy Night Phases
  else if (state.phase === GamePhase.NIGHT || [GamePhase.NIGHT_MAFIA, GamePhase.NIGHT_DOCTOR, GamePhase.NIGHT_OFFICER].includes(state.phase)) {
    const isUnified = state.phase === GamePhase.NIGHT;
    const actions = state.allActions || [];
    
    if (isUnified) {
      const alivePlayers = players.filter(p => p.isAlive);
      const rolesOrder = [Role.MAFIA, Role.DOCTOR, Role.OFFICER, Role.CITIZEN];
      
      content = `
        <h3 class="sage-panel__title mb-3">🌙 ${t('Night Actions & Citizen Suspicions')}</h3>
        <div style="display:flex; flex-direction:column; gap:16px;">
          ${rolesOrder.map(r => {
            const rolePlayers = alivePlayers.filter(p => p.role === r);
            if (rolePlayers.length === 0) return '';
            const roleEmoji = r === Role.MAFIA ? '🔪' : r === Role.DOCTOR ? '💊' : r === Role.OFFICER ? '🔍' : '👤';
            return `
              <div>
                <div class="text-xs font-weight:700 text-muted uppercase mb-2">${roleEmoji} ${t(r)} (${rolePlayers.length})</div>
                <div class="player-grid">
                  ${rolePlayers.map(actor => {
                    const acts = actions.filter(a => a.actorId === actor.id);
                    const targetedNames = acts.map(a => {
                      const tgt = players.find(p => p.id === a.targetId);
                      return tgt ? tgt.name : 'Unknown';
                    }).join(', ');
                    
                    return `
                      <div class="card" style="padding:var(--sp-3)">
                        <div class="text-sm font-weight:600 mb-1">${actor.name}</div>
                        ${acts.length > 0 
                          ? `<div class="text-xs" style="color:var(--success)">${r === Role.CITIZEN ? t('Suspecting:') : t('Target:')} <strong>${targetedNames}</strong></div>
                             ${acts[0].result ? `<div class="text-xs mt-1" style="color:var(--info)">${t('Result:')} ${t(acts[0].result)}</div>` : ''}`
                          : `<div class="text-xs text-muted">${t('Waiting for action...')}</div>`
                        }
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      const activeRole = PhaseActiveRole[state.phase];
      const expectedActors = players.filter(p => p.isAlive && p.role === activeRole);
      content = `
        <h3 class="sage-panel__title mb-3">🌙 ${t('Night Actions')} (${t(activeRole)})</h3>
        <div class="player-grid">
          ${expectedActors.map(actor => {
            const acts = actions.filter(a => a.actorId === actor.id);
            const targetedNames = acts.map(a => {
              const tgt = players.find(p => p.id === a.targetId);
              return tgt ? tgt.name : 'Unknown';
            }).join(', ');
            
            return `
              <div class="card" style="padding:var(--sp-3)">
                <div class="text-sm font-weight:600 mb-2">${actor.name}</div>
                ${acts.length > 0 
                  ? `<div class="text-xs" style="color:var(--success)">${t('Target:')} <strong>${targetedNames}</strong></div>
                     ${acts[0].result ? `<div class="text-xs mt-1" style="color:var(--info)">${t('Result:')} ${t(acts[0].result)}</div>` : ''}`
                  : `<div class="text-xs text-muted">${t('Waiting for action...')}</div>`
                }
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  }

  // Night Resolution
  else if (state.phase === GamePhase.NIGHT_RESOLUTION) {
    const res = state.resolution;
    if (!res) content = `<div class="text-muted text-sm">${t('Resolution data not available yet.')}</div>`;
    else {
      content = `
        <h3 class="sage-panel__title mb-3">⚡ ${t('Resolution Summary')}</h3>
        <div class="flex gap-4">
          <div class="card flex-1">
            <div class="text-xs text-muted uppercase mb-2">${t('Mafia Targets')}</div>
            ${res.killTargets.length > 0 ? res.killTargets.map(id => {
              const p = players.find(x => x.id === id);
              return `<div class="text-sm text-danger mb-1">🔪 ${p?.name}</div>`;
            }).join('') : `<div class="text-xs text-muted">${t('None')}</div>`}
          </div>
          <div class="card flex-1">
            <div class="text-xs text-muted uppercase mb-2">${t('Doctor Saves')}</div>
            ${res.healTargets.length > 0 ? res.healTargets.map(id => {
              const p = players.find(x => x.id === id);
              return `<div class="text-sm text-success mb-1">💊 ${p?.name}</div>`;
            }).join('') : `<div class="text-xs text-muted">${t('None')}</div>`}
          </div>
          <div class="card flex-1">
            <div class="text-xs text-muted uppercase mb-2">${t('Final Deaths')}</div>
            ${res.deaths.length > 0 ? res.deaths.map(id => {
              const p = players.find(x => x.id === id);
              return `<div class="text-sm text-danger font-weight:700 mb-1">💀 ${p?.name}</div>`;
            }).join('') : `<div class="text-sm text-success font-weight:700">${t('Nobody Died')}</div>`}
          </div>
        </div>
      `;
    }
  }

  // Morning / Announcements
  else if (state.phase === GamePhase.MORNING) {
    const res = state.resolution;
    const deaths = res?.deaths || [];
    const deathNames = deaths.map(id => players.find(p => p.id === id)?.name).join(' ' + t('and') + ' ');
    const investigations = res?.investigations || [];
    
    const presets = [
      deaths.length === 0 ? t('Nobody died last night.') : `${deathNames} ${t('died last night.')}`,
      t('The town wakes up to a beautiful morning.')
    ];

    content = `
      <h3 class="sage-panel__title mb-3">☀️ ${t('Morning Announcements')}</h3>
      <div class="mb-4">
        ${investigations.length > 0 ? `
          <div class="text-xs text-muted mb-2">${t('Private Investigation Results:')}</div>
          ${investigations.map(inv => {
            const officer = players.find(p => p.id === inv.officerId)?.name;
            const target = players.find(p => p.id === inv.targetId)?.name;
            return `
              <div class="text-sm mb-2 flex items-center justify-between" style="background:rgba(255,255,255,0.05); padding:8px; border-radius:4px;">
                <div>
                  🔍 <strong>${officer}</strong> ${t('investigated')} <strong>${target}</strong>: 
                  <span style="color:${inv.result === 'MAFIA' ? 'var(--mafia-soft)' : 'var(--doctor-soft)'}; font-weight:bold;">${t(inv.result)}</span>
                </div>
                ${!inv.revealed 
                  ? `<button class="btn btn--sm btn--ghost" onclick="window._sageRevealInvestigation('${inv.officerId}')">${t('Reveal to Officer')}</button>` 
                  : `<span class="text-xs text-success">${t('Revealed')}</span>`
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
      <h3 class="sage-panel__title mb-3">🗳️ ${t('Live Voting')} (${votes.length} / ${aliveCount} ${t('voted')})</h3>
      <div class="card">
        ${Object.entries(tally).sort((a,b) => b[1]-a[1]).map(([targetId, count]) => {
          const target = players.find(p => p.id === targetId);
          return renderVoteBar(target?.name || 'Unknown', count, aliveCount, 'normal');
        }).join('')}
        ${votes.length === 0 ? `<div class="text-sm text-muted text-center py-4">${t('No votes cast yet')}</div>` : ''}
      </div>
    `;
  }

  // Vote Resolution
  else if (state.phase === GamePhase.VOTE_RESOLUTION) {
    const vr = state.voteResult;
    if (!vr) content = `<div class="text-muted text-sm">${t('Vote results not available.')}</div>`;
    else {
      const aliveCount = players.filter(p => p.isAlive).length + (vr.eliminatedId ? 1 : 0);
      content = `
        <h3 class="sage-panel__title mb-3">📊 ${t('Voting Results')}</h3>
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
            ? `<div class="text-lg text-warning font-weight:700">${t('Vote Tie! Nobody is eliminated.')}</div>`
            : `<div class="text-lg text-danger font-weight:700">${players.find(p=>p.id===vr.eliminatedId)?.name} ${t('has been eliminated!')}</div>
               ${state.revealRoleAfterVoting ? `<div class="text-sm mt-1">${t('Role was:')} <span class="role-badge role-badge--${vr.eliminatedRole.toLowerCase()}">${t(vr.eliminatedRole)}</span></div>` : ''}`
          }
        </div>
      `;
    }
  }

  return content ? `<div class="sage-panel mt-4"><div class="sage-panel__body">${content}</div></div>` : '';
}

function renderSageControls(app, state) {
  const isAuto = state.gameMode === GameMode.AUTOMATED;
  const alivePlayers = (state.players || []).filter(p => p.isAlive);
  const maxAllowance = Math.max(1, alivePlayers.length);
  
  const buttons = [
    { label: t('Advance Phase ⏩'), action: 'window._sageAdvancePhase()', disabled: state.phase === GamePhase.FINISHED },
    { label: t('+30s ⏱️'), action: 'window._sageExtendTimer(30)', disabled: state.timerRemaining <= 0 || state.phase === GamePhase.FINISHED },
    { label: t('Reset Round ⏪'), action: 'window._sageResetRound()', disabled: state.phase === GamePhase.FINISHED },
    { label: t('Force Village Win 🏆'), action: 'window._sageForceWin("VILLAGE")', disabled: state.phase === GamePhase.FINISHED },
    { label: t('Force Mafia Win 🏆'), action: 'window._sageForceWin("MAFIA")', disabled: state.phase === GamePhase.FINISHED },
    { label: t('Cancel Game 🛑'), action: 'window._sageCancelGame()', disabled: false },
  ];

  const configSection = state.phase !== GamePhase.FINISHED ? `
    <div class="sage-panel mt-4">
      <div class="sage-panel__header">⚙️ ${t('Dynamic Round Configuration')} (${t('Max')}: ${maxAllowance})</div>
      <div class="sage-panel__body">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <div class="form-group" style="flex: 1; min-width: 120px;">
            <label class="form-label">🔪 ${t('Mafia Kills')}</label>
            <div class="number-input">
              <button class="number-input__btn" onclick="window._sageUpdateConfig('mafiaKillCount', -1)" ${state.config.mafiaKillCount <= 1 ? 'disabled' : ''}>−</button>
              <input type="text" class="number-input__value" value="${state.config.mafiaKillCount}" readonly />
              <button class="number-input__btn" onclick="window._sageUpdateConfig('mafiaKillCount', 1)" ${state.config.mafiaKillCount >= maxAllowance ? 'disabled' : ''}>+</button>
            </div>
          </div>
          <div class="form-group" style="flex: 1; min-width: 120px;">
            <label class="form-label">💊 ${t('Doctor Heals')}</label>
            <div class="number-input">
              <button class="number-input__btn" onclick="window._sageUpdateConfig('doctorHealCount', -1)" ${state.config.doctorHealCount <= 1 ? 'disabled' : ''}>−</button>
              <input type="text" class="number-input__value" value="${state.config.doctorHealCount}" readonly />
              <button class="number-input__btn" onclick="window._sageUpdateConfig('doctorHealCount', 1)" ${state.config.doctorHealCount >= maxAllowance ? 'disabled' : ''}>+</button>
            </div>
          </div>
          <div class="form-group" style="flex: 1; min-width: 120px;">
            <label class="form-label">🔍 ${t('Officer Invs')}</label>
            <div class="number-input">
              <button class="number-input__btn" onclick="window._sageUpdateConfig('officerInvestigateCount', -1)" ${state.config.officerInvestigateCount <= 1 ? 'disabled' : ''}>−</button>
              <input type="text" class="number-input__value" value="${state.config.officerInvestigateCount}" readonly />
              <button class="number-input__btn" onclick="window._sageUpdateConfig('officerInvestigateCount', 1)" ${state.config.officerInvestigateCount >= maxAllowance ? 'disabled' : ''}>+</button>
            </div>
          </div>
        </div>
        <div class="text-xs text-muted mt-3">${t('Changes apply immediately to the current round.')}</div>
      </div>
    </div>
  ` : '';

  return configSection + renderDevControls(buttons);
}

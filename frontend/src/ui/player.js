/**
 * Player UI — Cinematic Mafia Experience
 */

import { GamePhase, Role, ActionType, PhaseActiveRole, Team, AwarenessMode } from '../../../shared/enums.js';
import { 
  renderPhaseHeader, renderTimer, renderPlayerCard, 
  renderRoleBadge, renderTeamBadge, renderChat, renderVoteBar,
  renderAlliesPanel, showToast, playSound
} from './components.js';
import { t } from '../i18n.js';

export function renderPlayerView(app) {
  const state = app.gameState;
  const isDead = !state.isAlive;
  
  if (isDead && state.phase !== GamePhase.FINISHED) {
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
      content = renderWaiting(state, t('The sun is rising...'), t('The Moderator is compiling the morning report.'));
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
      content = renderPlayerLobby(state);
      break;
      
    default:
      content = renderWaiting(state, t('Waiting...'), t('The game will begin shortly.'));
  }

  return `
    <div class="screen fade-in">
      <div class="screen__content">
        ${renderPlayerHeader(state)}
        ${content}
      </div>
    </div>
  `;
}

function renderPlayerHeader(state) {
  if (state.phase === GamePhase.ROLE_ASSIGNMENT || state.phase === GamePhase.FINISHED || state.phase === GamePhase.LOBBY) return '';
  
  const myRole = state.myRole || 'CITIZEN';
  const icon = myRole === Role.MAFIA ? '🔪' : myRole === Role.DOCTOR ? '💊' : myRole === Role.OFFICER ? '🔍' : '👤';

  return `
    <div class="flex justify-between items-center mb-6" style="padding:12px 18px; background:rgba(20,24,36,0.85); backdrop-filter:blur(12px); border-radius:16px; border:1px solid rgba(255,255,255,0.08); box-shadow:0 8px 24px rgba(0,0,0,0.4);">
      <div class="flex items-center gap-3">
        <div class="player-card__avatar" style="width:42px; height:42px; font-size:20px; border-color:var(--sage)">${icon}</div>
        <div>
          <div class="text-sm font-weight:700" style="color:#fff;">${state.myName}</div>
          <div class="mt-1 flex items-center gap-2">
            ${renderRoleBadge(myRole)}
            ${state.isModerator ? `<span class="text-xs" style="background:rgba(139,92,246,0.25); color:#c4b5fd; padding:1px 6px; border-radius:6px; font-weight:700;">👑 ${t('Room Creator')}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="text-right flex items-center gap-3">
        ${state.phase !== GamePhase.FINISHED && state.phase !== GamePhase.ROLE_ASSIGNMENT ? renderTimer('') : ''}
        <button class="btn btn--ghost p-2 text-muted hover-danger" onclick="if(confirm('${t('Are you sure you want to leave the game?')}')) window._exitGame()" title="${t('Leave Room')}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   ROLE REVEAL SCREEN
   ═══════════════════════════════════════════════════════════════ */
function renderRoleReveal(state) {
  const myRole = state.myRole || 'CITIZEN';
  const roleName = myRole === 'CITIZEN' ? 'VILLAGER' : myRole;
  const isMafia = myRole === Role.MAFIA;
  const isDoctor = myRole === Role.DOCTOR;
  const isOfficer = myRole === Role.OFFICER;

  const icon = isMafia ? '🔪' : isDoctor ? '💊' : isOfficer ? '🔍' : '👤';
  const color = isMafia ? '#ef4444' : isDoctor ? '#10b981' : isOfficer ? '#3b82f6' : '#f59e0b';
  
  // Teammates for Mafia (Group awareness)
  const teammates = (state.players || []).filter(p => p.id !== state.myId && p.role === Role.MAFIA);

  return `
    <div class="role-reveal-hero fade-in">
      <div class="text-xs text-muted mb-2 uppercase tracking-widest font-weight:700">
        ${t('Confidential Briefing')}
      </div>
      <h2 class="text-3xl font-weight:900 mb-6" style="letter-spacing:0.05em;">
        ${t('Your Secret Role')}
      </h2>

      <div class="role-reveal-card-cinematic" style="border-color:${color}; box-shadow: 0 0 40px ${color}30;">
        <div style="font-size:64px; margin-bottom:12px; filter: drop-shadow(0 0 20px ${color}80);">
          ${icon}
        </div>
        
        <div style="font-family:var(--font-display); font-size:32px; font-weight:900; letter-spacing:0.1em; color:${color}; margin-bottom:4px;">
          ${t(roleName)}
        </div>
        
        <div class="mb-4">
          ${renderTeamBadge(state.myTeam || (isMafia ? 'MAFIA' : 'VILLAGE'))}
        </div>

        <div style="background:rgba(0,0,0,0.4); border-radius:12px; padding:16px; border:1px solid rgba(255,255,255,0.06); margin-bottom:20px; font-size:14px; line-height:1.6; color:#e2e8f0;">
          ${t(getRoleHint(myRole))}
        </div>

        ${isMafia && teammates.length > 0 ? `
          <div style="background:rgba(239,68,68,0.1); border-radius:12px; padding:12px 16px; border:1px solid rgba(239,68,68,0.3); margin-bottom:20px; text-align:left;">
            <div style="font-size:12px; font-weight:700; color:#fca5a5; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.05em;">
              👥 ${t('Your Mafia Teammates')}:
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${teammates.map(tm => `<span style="background:rgba(239,68,68,0.2); color:#fff; font-weight:600; padding:4px 10px; border-radius:12px; font-size:12px;">🔪 ${tm.name}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="text-xs text-muted">
          ⏳ ${t('Prepare yourself... Night is about to fall.')}
        </div>
      </div>
    </div>
  `;
}

function getRoleHint(role) {
  switch(role) {
    case Role.MAFIA:
      return 'You are part of the Mafia syndicate. Coordinate in secret to eliminate the village by night, and blend in with the innocent citizens by day.';
    case Role.DOCTOR:
      return 'You are the Village Doctor. Each night, choose one player to protect with your medical expertise. If targeted by the Mafia, your patient will survive.';
    case Role.OFFICER:
      return 'You are the Village Officer. Each night, conduct an investigation on one suspect to uncover whether they belong to the Mafia or are innocent.';
    case Role.CITIZEN:
    default:
      return 'You are an innocent Villager. You hold no special night powers, but your voice and deductive wits are crucial during daytime discussions and trials to weed out the Mafia.';
  }
}

/* ═══════════════════════════════════════════════════════════════
   NIGHT PHASE SCREEN
   ═══════════════════════════════════════════════════════════════ */
function renderNightPhase(app, state) {
  const activeRole = PhaseActiveRole[state.phase];
  const isMyTurn = state.myRole === activeRole;
  
  // Non-active player waiting screen
  if (!isMyTurn) {
    let msg = t('The village sleeps...');
    if (activeRole === Role.MAFIA) msg = t('The Mafia are choosing their target in the shadows.');
    else if (activeRole === Role.DOCTOR) msg = t('The Doctor is making their rounds across town.');
    else if (activeRole === Role.OFFICER) msg = t('The Officer is conducting a covert investigation.');

    const alivePlayers = (state.players || []).filter(p => p.isAlive !== false);

    return `
      <div class="fade-in">
        ${renderWaiting(state, '🌙 ' + t('Night Phase'), msg)}
        
        <div class="card mt-6" style="max-width:540px; margin: 24px auto 0; text-align:left; background:rgba(15,18,28,0.8); border:1px solid rgba(255,255,255,0.06);">
          <div class="flex justify-between items-center mb-3">
            <span class="text-xs text-muted uppercase tracking-wider font-weight:700">👥 ${t('Living Villagers')} (${alivePlayers.length})</span>
            <span class="text-xs text-muted">${t('Round')} ${state.currentRound}</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${alivePlayers.map(p => `
              <div style="background:rgba(255,255,255,0.05); padding:6px 12px; border-radius:16px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px;">
                <span>👤</span>
                <span>${p.name}</span>
                ${p.id === state.myId ? `<span style="font-size:10px; color:#a5b4fc; background:rgba(99,102,241,0.3); padding:1px 5px; border-radius:6px;">${t('You')}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Active Role Night Action
  const hasSubmitted = state.myActions && state.myActions.length > 0;
  
  if (hasSubmitted) {
    const actionDesc = state.myRole === Role.MAFIA ? t('Kill order placed.')
                     : state.myRole === Role.DOCTOR ? t('Protection granted.')
                     : t('Investigation launched.');

    return `
      <div class="fade-in">
        ${renderWaiting(state, `✓ ${t('Action Submitted')}`, `${actionDesc} ${t('Waiting for night resolution...')}`)}
        <div class="mt-8 text-center">
          <button class="btn btn--ghost btn--sm" onclick="window._retractAction()" style="border:1px solid rgba(255,255,255,0.15);">
            ↺ ${t('Retract & Change Target')}
          </button>
        </div>
        ${state.myRole === Role.MAFIA ? `
          <div class="mt-8" style="max-width:600px; margin:24px auto 0;">
            ${renderChat((state.chatMessages || {}).MAFIA || [], { 
              title: t('Mafia Syndicate Chat'), 
              channelIcon: '🔪', 
              onSend: 'window._sendChat("MAFIA")' 
            })}
          </div>
        ` : ''}
      </div>
    `;
  }

  // Action Selection
  const configKey = state.myRole === Role.MAFIA ? 'mafiaKillCount' : state.myRole === Role.DOCTOR ? 'doctorHealCount' : null;
  const maxTargets = configKey && state.config?.[configKey] ? state.config[configKey] : 1;
  const selected = app.selectedTargets || [];

  let title = '', subtitle = '';
  if (state.myRole === Role.MAFIA) {
    title = t('Choose a Victim');
    subtitle = t(`Select up to ${maxTargets} player to eliminate tonight.`);
  } else if (state.myRole === Role.DOCTOR) {
    title = t('Choose Patient to Protect');
    subtitle = t('Select 1 player to keep safe from harm tonight.');
  } else if (state.myRole === Role.OFFICER) {
    title = t('Choose Suspect to Investigate');
    subtitle = t('Select 1 player to interrogate.');
  }

  const allies = (state.players || []).filter(p => p.id !== state.myId && p.role === state.myRole);
  const targets = state.eligibleTargets || [];

  return `
    <div class="fade-in">
      ${renderPhaseHeader(state.phase, state.currentRound, subtitle)}
      
      ${state.myRole === Role.MAFIA && allies.length > 0 ? renderAlliesPanel(t('Known Mafia'), allies, 'var(--mafia-soft)') : ''}
      
      <div class="selection-counter" style="margin: 16px 0; text-align: center;">
        <span class="selection-counter__label">${t('Selected')}:</span>
        <span class="selection-counter__value ${selected.length === maxTargets ? 'text-success' : ''}" style="font-weight: 800; font-size: 16px;">
          ${selected.length} / ${maxTargets}
        </span>
      </div>

      <div class="player-grid mt-4">
        ${targets.map(tPlayer => renderPlayerCard(tPlayer, {
          selectable: !tPlayer.disabled,
          selected: selected.includes(tPlayer.id),
          disabled: tPlayer.disabled,
          disabledReason: tPlayer.disabledReason,
          onClick: tPlayer.disabled ? '' : `window._toggleTarget('${tPlayer.id}', ${maxTargets})`
        })).join('')}
      </div>

      <div class="mt-8 text-center">
        <button class="btn btn--primary btn--lg" 
                ${selected.length === 0 ? 'disabled' : ''}
                onclick="window._submitRoleAction()"
                style="padding: 14px 36px; font-size: 16px; font-weight: 800;">
          ✓ ${t('Confirm Selection')}
        </button>
      </div>
      
      ${state.myRole === Role.MAFIA ? `
        <div class="mt-8" style="max-width:640px; margin:28px auto 0;">
          ${renderChat((state.chatMessages || {}).MAFIA || [], { 
            title: t('Mafia Syndicate Chat'), 
            channelIcon: '🔪', 
            onSend: 'window._sendChat("MAFIA")' 
          })}
        </div>
      ` : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   OFFICER INTELLIGENCE ANNOUNCEMENT (Alternate Rounds)
   ═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   OFFICER INTELLIGENCE ANNOUNCEMENT (Alternate Rounds)
   ═══════════════════════════════════════════════════════════════ */
function renderOfficerReportCard(report, isOfficer = false) {
  if (!report) return '';

  if (!report.isAnnounced) {
    return `
      <div class="announcement mb-6" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:20px; border-radius:16px; text-align:center;">
        <div style="font-size:36px; margin-bottom:8px;">🔒</div>
        <div class="text-xs uppercase tracking-widest font-weight:800 mb-2" style="color:var(--text-muted);">
          🕵️‍♂️ ${t('Officer Intelligence Report')}
        </div>
        <div style="color:var(--text-secondary); font-size:18px; font-weight:700; margin-bottom:6px;">
          ${t('Report skipped this morning')}
        </div>
        <div class="text-xs text-muted" style="line-height:1.6; max-width:440px; margin:0 auto;">
          ${t('Officer reports are announced every other night to keep the investigation challenging for the village.')}
        </div>
        ${isOfficer ? `
          <div class="text-xs font-weight:700 mt-3 pt-3" style="color:#a5b4fc; border-top:1px dashed rgba(255,255,255,0.1);">
            🔒 ${t('Your investigation result is classified this round (even for you) to maintain mystery.')}
          </div>
        ` : ''}
      </div>
    `;
  }

  if (!report.hasInvestigation) {
    return `
      <div class="announcement mb-6" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:20px; border-radius:16px; text-align:center;">
        <div style="font-size:36px; margin-bottom:8px;">🕵️‍♂️</div>
        <div class="text-xs uppercase tracking-widest font-weight:800 mb-2" style="color:var(--text-muted);">
          🕵️‍♂️ ${t('Officer Intelligence Report')}
        </div>
        <div style="color:var(--text-secondary); font-size:18px; font-weight:700; margin-bottom:6px;">
          ${t('No investigation was conducted last night.')}
        </div>
        <div class="text-xs text-muted">
          ${t('No clues were gathered before dawn.')}
        </div>
      </div>
    `;
  }

  if (report.isCorrect) {
    return `
      <div class="announcement mb-6" style="background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); padding:20px; border-radius:16px; text-align:center; box-shadow:0 8px 24px rgba(16,185,129,0.08);">
        <div style="font-size:38px; margin-bottom:8px;">🎯</div>
        <div class="text-xs uppercase tracking-widest font-weight:800 mb-2" style="color:#6ee7b7;">
          🕵️‍♂️ ${t('Officer Intelligence Report')}
        </div>
        <div style="color:#34d399; font-size:20px; font-weight:800; margin-bottom:6px;">
          ${t("The Officer's suspicion was correct!")}
        </div>
        <div class="text-xs text-muted" style="line-height:1.6; max-width:440px; margin:0 auto;">
          ${t('The Officer investigated a Mafia member last night. Their identity remains classified.')}
        </div>
        ${isOfficer ? `
          <div class="text-xs font-weight:700 mt-3 pt-3" style="color:#34d399; border-top:1px dashed rgba(16,185,129,0.3);">
            🎯 ${t('Your suspicion was spot on! Your target from last night is indeed Mafia.')}
          </div>
        ` : ''}
      </div>
    `;
  } else {
    return `
      <div class="announcement mb-6" style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.35); padding:20px; border-radius:16px; text-align:center; box-shadow:0 8px 24px rgba(239,68,68,0.08);">
        <div style="font-size:38px; margin-bottom:8px;">🔍</div>
        <div class="text-xs uppercase tracking-widest font-weight:800 mb-2" style="color:#fca5a5;">
          🕵️‍♂️ ${t('Officer Intelligence Report')}
        </div>
        <div style="color:#f87171; font-size:20px; font-weight:800; margin-bottom:6px;">
          ${t("The Officer's suspicion was wrong.")}
        </div>
        <div class="text-xs text-muted" style="line-height:1.6; max-width:440px; margin:0 auto;">
          ${t('The suspect investigated last night was innocent. Their identity remains classified.')}
        </div>
        ${isOfficer ? `
          <div class="text-xs font-weight:700 mt-3 pt-3" style="color:#fca5a5; border-top:1px dashed rgba(239,68,68,0.3);">
            🔍 ${t('Your suspicion was mistaken. Your target from last night is innocent.')}
          </div>
        ` : ''}
      </div>
    `;
  }
}

function renderOfficerReportMiniBanner(report, isOfficer = false) {
  if (!report) return '';

  if (!report.isAnnounced) {
    return `
      <div class="card mb-4" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:12px 16px; display:flex; align-items:center; gap:12px; border-radius:12px;">
        <span style="font-size:22px;">🔒</span>
        <div style="text-align:left;">
          <div class="text-xs text-muted uppercase font-weight:700">${t('Officer Intelligence Report')}</div>
          <div class="text-sm font-weight:600" style="color:var(--text-secondary);">${t('Report skipped this round (delivered on alternate rounds).')}</div>
        </div>
      </div>
    `;
  }

  if (!report.hasInvestigation) return '';

  const isCorrect = report.isCorrect;
  return `
    <div class="card mb-4" style="background:${isCorrect ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; border:1px solid ${isCorrect ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}; padding:12px 16px; display:flex; align-items:center; gap:12px; border-radius:12px;">
      <span style="font-size:24px;">${isCorrect ? '🎯' : '🔍'}</span>
      <div style="text-align:left;">
        <div class="text-xs uppercase font-weight:700" style="color:${isCorrect ? '#6ee7b7' : '#fca5a5'};">${t('Officer Intelligence Report')}</div>
        <div class="text-sm font-weight:700" style="color:${isCorrect ? '#6ee7b7' : '#fca5a5'};">
          ${isCorrect ? t("The Officer's suspicion was correct!") : t("The Officer's suspicion was wrong.")}
        </div>
        ${isOfficer ? `
          <div class="text-xs font-weight:600 mt-1" style="color:${isCorrect ? '#34d399' : '#fca5a5'};">
            ${isCorrect ? t('Your target was Mafia!') : t('Your target was Innocent!')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   MORNING & ANNOUNCEMENT SCREEN
   ═══════════════════════════════════════════════════════════════ */
function renderMorning(state) {
  const deaths = state.nightDeaths || [];
  const announcements = (state.announcements || []).filter(a => a.roundNumber === state.currentRound);
  const isOfficer = state.myRole === Role.OFFICER;
  const officerIntelCard = renderOfficerReportCard(state.publicOfficerReport, isOfficer);

  return `
    <div class="fade-in">
      ${renderPhaseHeader(state.phase, state.currentRound, t('Dawn breaks over the village.'))}
      
      <div class="container mt-6 text-center" style="max-width:580px;">
        ${deaths.length === 0 
          ? `<div class="announcement mb-6" style="background:rgba(16,185,129,0.12); border-color:rgba(16,185,129,0.3); padding:20px; border-radius:16px;">
               <div class="announcement__icon" style="font-size:36px;">🌅</div>
               <div class="announcement__text" style="color:#6ee7b7; font-size:18px; font-weight:700;">${t('Nobody died last night.')}</div>
               <div class="text-xs text-muted mt-1">${t('The doctor was vigilant or the attack was thwarted.')}</div>
             </div>`
          : `<div class="announcement mb-6" style="background:rgba(239,68,68,0.14); border-color:rgba(239,68,68,0.4); padding:20px; border-radius:16px;">
               <div class="announcement__icon" style="font-size:36px;">💀</div>
               <div class="announcement__text" style="color:#fca5a5; font-size:18px; font-weight:700;">
                 ${deaths.map(d => escapeHtml(d.name)).join(' and ')} ${t('died last night.')}
               </div>
               <div class="text-xs text-muted mt-1">${t('The village mourns the fallen.')}</div>
             </div>`
        }

        ${officerIntelCard}
        
        ${announcements.map(a => `
          <div class="card mb-3 text-left" style="background:rgba(255,255,255,0.04); border-left:4px solid var(--sage);">
            <div class="text-xs text-sage uppercase tracking-widest font-weight:700 mb-1">${t('Moderator Announcement')}</div>
            <div class="text-sm">${escapeHtml(a.message)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   DISCUSSION SCREEN
   ═══════════════════════════════════════════════════════════════ */
function renderDiscussion(app, state) {
  const isOfficer = state.myRole === Role.OFFICER;
  const officerBanner = renderOfficerReportMiniBanner(state.publicOfficerReport, isOfficer);
  const alivePlayers = (state.players || []).filter(p => p.isAlive !== false);
  const deadPlayers = (state.players || []).filter(p => p.isAlive === false);

  return `
    <div class="fade-in">
      ${renderPhaseHeader(state.phase, state.currentRound, t('Discuss and find the Mafia!'))}
      
      <div class="container--lg mt-4" style="display:grid; grid-template-columns: 1fr 280px; gap:20px;">
        <div>
          ${officerBanner}
          ${renderChat((state.chatMessages || {}).PUBLIC || [], { 
            title: t('Village Square'), 
            channelIcon: '🏛️', 
            onSend: 'window._sendChat("PUBLIC")' 
          })}
        </div>

        <div>
          <div class="card mb-4">
            <h3 class="text-xs uppercase tracking-widest text-muted mb-3 font-weight:700">
              👥 ${t('Alive Players')} (${alivePlayers.length})
            </h3>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${alivePlayers.map(p => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:rgba(255,255,255,0.04); border-radius:8px; font-size:13px; font-weight:600;">
                  <span>👤 ${escapeHtml(p.name)}</span>
                  ${p.id === state.myId ? `<span class="text-xs" style="color:#a5b4fc;">(${t('You')})</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          ${deadPlayers.length > 0 ? `
            <div class="card" style="opacity:0.6;">
              <h3 class="text-xs uppercase tracking-widest text-muted mb-3 font-weight:700">
                💀 ${t('Graveyard')} (${deadPlayers.length})
              </h3>
              <div style="display:flex; flex-direction:column; gap:4px;">
                ${deadPlayers.map(p => `
                  <div style="font-size:12px; color:var(--text-muted); text-decoration:line-through; padding:4px 8px;">
                    ${escapeHtml(p.name)}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   VOTING SCREEN
   ═══════════════════════════════════════════════════════════════ */
function renderVoting(app, state) {
  const hasVoted = Boolean(state.myVote);
  const myVoteTarget = hasVoted ? (state.players.find(p => p.id === state.myVote)?.name || (state.myVote === state.myId ? state.myName : 'Player')) : null;
  const alivePlayers = (state.players || []).filter(p => p.isAlive !== false);
  const totalEligible = Number(state.totalEligibleVoters || alivePlayers.length || 1);
  const votesCount = Number(state.votesCount ?? (hasVoted ? 1 : 0));
  const voteProgressPct = Math.min(100, Math.round((votesCount / Math.max(1, totalEligible)) * 100));

  return `
    <div class="fade-in">
      ${renderPhaseHeader(state.phase, state.currentRound, t('Cast your vote to eliminate a suspect.'))}
      
      <div class="container--lg mt-4" style="display:grid; grid-template-columns: 1fr 300px; gap:var(--sp-6)">
        <div>
          ${hasVoted ? `
            <div class="card mb-6" style="border-color:var(--sage); background:var(--sage-bg)">
              <div class="text-xs text-muted uppercase tracking-widest font-weight:700 mb-1">${t('Your Vote')}:</div>
              <div class="text-xl font-weight:800 text-sage flex items-center gap-2">
                <span>🗳️</span>
                <span>${escapeHtml(myVoteTarget)}</span>
              </div>
              <div class="text-xs text-muted mt-1">${t('You can change your vote until the timer runs out.')}</div>
            </div>
          ` : ''}
          
          <h3 class="text-xs uppercase tracking-widest text-muted mb-3 font-weight:700">${t('Select Suspect')}</h3>
          <div class="player-grid">
            ${(state.eligibleVoteTargets || []).map(tPlayer => renderPlayerCard(tPlayer, {
              selectable: true,
              selected: state.myVote === tPlayer.id,
              onClick: `window._submitVote('${tPlayer.id}')`
            })).join('')}
          </div>
        </div>
        
        <div class="card h-100" style="display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:28px 20px;">
          <div style="font-size:44px; margin-bottom:12px; filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4));">🗳️</div>
          <h3 class="text-xs uppercase tracking-widest text-muted mb-2 font-weight:700">
            ${t('Secret Ballot')}
          </h3>
          <p class="text-sm font-weight:600 mb-4" style="color:${hasVoted ? 'var(--sage)' : 'var(--text-secondary)'};">
            ${hasVoted ? `✓ ${t('Your vote has been submitted!')}` : t('Cast your vote on the left.')}
          </p>

          <div style="width:100%; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:16px; margin-bottom:16px;">
            <div class="text-xs text-muted mb-1 font-weight:600 uppercase tracking-wider">${t('Votes Cast')}</div>
            <div class="text-2xl font-weight:800 text-sage" style="letter-spacing:0.05em;">
              ${votesCount} <span style="font-size:14px; font-weight:600; color:var(--text-muted);">/ ${totalEligible}</span>
            </div>
            <div class="vote-bar mt-3" style="height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
              <div style="height:100%; background:var(--sage); width:${voteProgressPct}%; transition: width 0.3s ease;"></div>
            </div>
          </div>

          <div class="text-xs text-muted" style="line-height:1.6; max-width:240px;">
            🔒 ${t('Votes are secret and will be revealed when voting ends.')}
          </div>
        </div>
      </div>
      
      <div class="container--lg mt-6">
        ${renderChat((state.chatMessages || {}).PUBLIC || [], { 
          title: t('Village Square'), 
          onSend: 'window._sendChat("PUBLIC")' 
        })}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   VOTE RESOLUTION & ELIMINATION
   ═══════════════════════════════════════════════════════════════ */
function renderVoteResolution(state) {
  const vr = state.voteResult;
  if (!vr) return renderWaiting(state, t('Tallying the votes...'), '');
  
  const eliminatedPlayer = vr.eliminatedId ? state.players.find(p => p.id === vr.eliminatedId) : null;
  const isMe = vr.eliminatedId === state.myId;
  const aliveCount = (state.players || []).filter(p => p.isAlive).length + (vr.eliminatedId ? 1 : 0) + 1;

  return `
    <div class="fade-in">
      ${renderPhaseHeader(state.phase, state.currentRound)}
      
      <div class="container mt-6" style="max-width:580px;">
        <div class="text-center p-6 rounded mb-6" style="background:rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius:18px;">
          ${vr.isTie 
            ? `<div class="text-4xl mb-3">⚖️</div>
               <div class="text-2xl font-weight:800 text-warning mb-2">${t('Vote Tie!')}</div>
               <div class="text-sm text-muted">${t('The village could not reach a majority consensus. Nobody was eliminated.')}</div>`
            : `<div class="text-4xl mb-3">🚪</div>
               <div class="text-2xl font-weight:800 text-danger mb-2">
                 ${isMe ? t('You have been eliminated!') : `${eliminatedPlayer ? eliminatedPlayer.name : 'A player'} ${t('has been eliminated!')}`}
               </div>
               ${state.revealRoleAfterVoting && vr.eliminatedRole ? `
                 <div class="mt-4 flex items-center justify-center gap-2">
                   <span class="text-sm text-muted">${t('Their true role was')}:</span>
                   ${renderRoleBadge(vr.eliminatedRole)}
                 </div>
               ` : ''}`
          }
        </div>
        
        <div class="card">
          <h3 class="text-xs uppercase tracking-widest text-muted mb-4 font-weight:700">${t('Final Vote Count')}</h3>
          ${Object.entries(vr.tally || {}).sort((a,b)=>b[1]-a[1]).map(([tid, count]) => {
            const name = tid === state.myId ? state.myName : state.players.find(p=>p.id===tid)?.name;
            const isEliminated = tid === vr.eliminatedId;
            const type = isEliminated ? 'winner' : (vr.isTie && count === Object.values(vr.tally)[0] ? 'tie' : 'normal');
            return renderVoteBar(name || 'Unknown', count, aliveCount, type);
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   GAME OVER SCREEN & POST-GAME REVEAL
   ═══════════════════════════════════════════════════════════════ */
function renderGameOver(state) {
  const isVillageWin = state.winner === Team.VILLAGE;
  const isMyTeam = state.myTeam === state.winner;
  
  return `
    <div class="game-over fade-in" style="max-width:700px; margin:0 auto; text-align:center; padding: 40px 20px;">
      <div class="game-over__trophy" style="font-size:64px; animation:trophyBounce 2s infinite;">
        ${isVillageWin ? '🕊️' : '🔪'}
      </div>
      
      <h1 class="game-over__title" style="font-size:42px; font-weight:900; letter-spacing:0.1em; color:${isVillageWin ? 'var(--village-soft)' : 'var(--mafia-soft)'}; margin: 12px 0;">
        ${state.winner === 'MAFIA' ? t('MAFIA WINS') : t('VILLAGE WINS')}!
      </h1>
      
      <div class="game-over__subtitle" style="font-size:16px; color:var(--text-secondary); margin-bottom: 28px;">
        ${isMyTeam 
          ? `🎉 ${t('Congratulations! Your team emerged victorious.')}` 
          : `💀 ${t('Better luck next time. Your team was defeated.')}`
        }
      </div>
      
      <div class="card mb-6" style="text-align:left; padding:24px; background:rgba(18,20,32,0.9); border:1px solid rgba(255,255,255,0.08);">
        <h3 class="text-sm font-weight:800 uppercase tracking-widest mb-4 text-center" style="color:var(--sage)">
          🎭 ${t('Final Role Reveal')}
        </h3>
        
        <div class="player-grid">
          ${(state.players || []).map(p => renderPlayerCard(p, { showRole: true, showStatus: true })).join('')}
          ${renderPlayerCard({ id: state.myId, name: state.myName + ' (' + t('You') + ')', role: state.myRole, isAlive: state.isAlive }, { showRole: true, showStatus: true })}
        </div>
      </div>
      
      <button class="btn btn--primary btn--lg" onclick="window._exitGame()" style="padding: 14px 40px; font-weight: 800;">
        ⬅️ ${t('Return to Home')}
      </button>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   DEAD PLAYER SPECTATOR VIEW
   ═══════════════════════════════════════════════════════════════ */
function renderDeadPlayerView(app, state) {
  return `
    <div class="screen fade-in">
      <div class="dead-overlay">
        <div class="container text-center" style="max-width:540px; padding:20px;">
          <div class="dead-banner justify-center mb-6">
            <span class="dead-banner__icon">💀</span>
            <span class="dead-banner__text">${t('YOU ARE DEAD')}</span>
          </div>
          
          <div class="text-lg font-weight:700 mb-1" style="color:#fca5a5;">
            ${t('You have been eliminated from the game.')}
          </div>
          <div class="text-xs text-muted mb-6">
            ${t('You are now a spectator. You may chat in the Graveyard with other fallen players.')}
          </div>
          
          <div style="text-align:left;">
            ${renderChat((state.chatMessages || {}).DEAD || [], { 
              title: t('Graveyard Chat'), 
              channelIcon: '🪦', 
              onSend: 'window._sendChat("DEAD")' 
            })}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   WAITING SCREEN
   ═══════════════════════════════════════════════════════════════ */
function renderWaiting(state, title, subtitle) {
  const isNight = state.phase && state.phase.includes('NIGHT');
  return `
    <div class="waiting fade-in">
      <div class="waiting__moon" style="font-size:52px; animation:float 3s ease-in-out infinite;">
        ${isNight ? '🌙' : '⏳'}
      </div>
      <div class="waiting__text" style="font-size:24px; font-weight:800; margin-top:12px;">
        ${title}
      </div>
      <div class="waiting__subtext" style="font-size:14px; color:var(--text-muted); margin-top:6px;">
        ${subtitle}
      </div>
      <div class="waiting__dots mt-4">
        <div class="waiting__dot"></div>
        <div class="waiting__dot"></div>
        <div class="waiting__dot"></div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   PLAYER LOBBY SCREEN (Waiting for Moderator to start)
   ═══════════════════════════════════════════════════════════════ */
function renderPlayerLobby(state) {
  const players = state.players || [];
  return `
    <div class="lobby-waiting fade-in" style="max-width: 520px; margin: 30px auto; text-align: center; padding: 36px 24px; background: rgba(20, 24, 38, 0.9); backdrop-filter: blur(16px); border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);">
      <div style="font-size: 52px; margin-bottom: 12px; animation: pulseGlow 2s infinite;">⏳</div>
      <div class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700;">${t('Room Code')}</div>
      <div style="font-family: var(--font-display); font-size: 42px; font-weight: 900; letter-spacing: 0.16em; color: var(--sage); margin: 6px 0 16px;">
        ${state.code}
      </div>

      <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 8px;">${t('Waiting for Moderator to start...')}</h2>
      <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 24px; line-height: 1.5;">
        ${t('You are in the lobby. The Moderator is assigning roles and will start the game shortly.')}
      </p>

      <div style="background: rgba(0,0,0,0.35); border-radius: 16px; padding: 18px; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.06); text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <span style="font-weight: 700; font-size: 14px;">👥 ${t('Joined Players')} (${players.length})</span>
          <span style="font-size: 12px; color: #10b981; display: flex; align-items: center; gap: 6px; font-weight: 600;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
            ${t('Connected')}
          </span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${players.map(p => `
            <div style="display: flex; align-items: center; gap: 6px; background: ${p.id === state.myId ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.05)'}; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; border: 1px solid ${p.id === state.myId ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255,255,255,0.08)'};">
              <span>${(p.isModerator || p.id === (state.moderatorId || state.sageId)) ? '👑' : '👤'}</span>
              <span>${p.name}</span>
              ${(p.isModerator || p.id === (state.moderatorId || state.sageId)) ? `<span style="font-size: 10px; background: rgba(245, 158, 11, 0.25); color: #fbbf24; padding: 2px 6px; border-radius: 10px; margin-left: 2px; font-weight: 700;">${t('Room Creator')}</span>` : ''}
              ${p.id === state.myId ? `<span style="font-size: 10px; background: rgba(99, 102, 241, 0.4); color: #a5b4fc; padding: 2px 6px; border-radius: 10px; margin-left: 2px; font-weight: 700;">${t('You')}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <div class="flex justify-center gap-3">
        <button class="btn btn--secondary btn--sm" onclick="window._copyRoomCode('${state.code}')">
          📋 ${t('Copy Code')}
        </button>
        <button class="btn btn--ghost btn--sm" onclick="window._exitGame()" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600;">
          🚪 ${t('Leave Room')}
        </button>
      </div>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window._copyRoomCode = window._copyRoomCode || ((code) => {
    if (!code) return;
    const notifySuccess = () => {
      showToast('Room Code copied to clipboard!', 'success');
      playSound('tick');
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(notifySuccess).catch(() => {
        fallbackCopyP(code, notifySuccess);
      });
    } else {
      fallbackCopyP(code, notifySuccess);
    }
  });

  function fallbackCopyP(code, onSuccess) {
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

  window._shareRoomCode = window._shareRoomCode || ((code) => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: 'Join my Mafia Game!',
        text: `Join my Mafia game with room code: ${code}`,
        url: window.location.href,
      }).catch(() => {});
    } else if (window._copyRoomCode) {
      window._copyRoomCode(code);
    }
  });
}

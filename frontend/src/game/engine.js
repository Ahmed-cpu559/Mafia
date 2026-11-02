/**
 * Mafia Game Engine
 * 
 * Core game state management, phase transitions, action handling,
 * night resolution, voting, and win condition evaluation.
 * 
 * All game logic lives here — UI never mutates game state directly.
 */

import {
  Team, Role, AwarenessMode, GameMode, GamePhase, ActionType,
  DeathCause, ChatChannel, RoleTeamMap, RoundPhaseOrder,
  NightPhaseOrder, PhaseActiveRole,
} from './enums.js';

/* ═══════════════════════════════════════════════════════════════
   UTILITY HELPERS
   ═══════════════════════════════════════════════════════════════ */

let _idCounter = 1;
export function generateId() {
  return `id_${Date.now()}_${_idCounter++}`;
}

export function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Cryptographically-adequate shuffle (Fisher-Yates) */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick n random items from arr */
function randomSelect(arr, n) {
  return shuffle(arr).slice(0, n);
}

/* ═══════════════════════════════════════════════════════════════
   MAFIA GAME CLASS
   ═══════════════════════════════════════════════════════════════ */

export class MafiaGame {
  constructor() {
    this.id = generateId();
    this.code = generateGameCode();

    /* ── Fixed configuration (set before game start) ── */
    this.gameMode = GameMode.AUTOMATED;
    this.mafiaAwareness = AwarenessMode.GROUP;
    this.doctorAwareness = AwarenessMode.INDIVIDUAL;
    this.officerAwareness = AwarenessMode.INDIVIDUAL;
    this.revealRoleAfterVoting = true;

    /* ── Players ── */
    this.players = []; // GamePlayer[]
    this.moderatorId = null;
    this.roomOwnerId = null;
    this.sageId = null;

    /* ── Game state ── */
    this.phase = GamePhase.LOBBY;
    this.currentRound = 0;
    this.winner = null;

    /* ── Round tracking ── */
    this.rounds = []; // Round[]
    this.currentRoundData = null;

    /* ── Default round configuration ── */
    this.defaultRoundConfig = {
      mafiaKillCount: 1,
      doctorHealCount: 1,
      officerInvestigateCount: 1,
      mafiaTimerSeconds: 10,
      doctorTimerSeconds: 10,
      officerTimerSeconds: 10,
      resolutionTimerSeconds: 3,
      morningTimerSeconds: 5,
      discussionTimerSeconds: 60,
      votingTimerSeconds: 30,
      voteResolutionTimerSeconds: 5,
    };

    /* ── Timer ── */
    this.timerRemaining = 0;
    this.timerTotal = 0;
    this._timerInterval = null;
    this._onTimerTick = null;
    this._onTimerExpire = null;

    /* ── Chat ── */
    this.chatMessages = {
      [ChatChannel.PUBLIC]: [],
      [ChatChannel.MAFIA]: [],
      [ChatChannel.DEAD]: [],
    };

    /* ── Announcements ── */
    this.announcements = []; // { roundNumber, message, timestamp }

    /* ── Event log ── */
    this.events = [];

    /* ── Callbacks ── */
    this.onStateChange = null;
  }

  /* ═══════════════════════════════════════════════════
     PLAYER MANAGEMENT
     ═══════════════════════════════════════════════════ */

  addPlayer(name) {
    if (this.phase !== GamePhase.LOBBY) throw new Error('Can only add players in LOBBY');
    const player = {
      id: generateId(),
      name,
      role: null,
      team: null,
      isAlive: true,
      deathCause: null,
      deathRound: null,
    };
    this.players.push(player);
    this._emit('PLAYER_JOINED', { player });
    return player;
  }

  removePlayer(playerId) {
    if (this.phase !== GamePhase.LOBBY) throw new Error('Can only remove players in LOBBY');
    this.players = this.players.filter(p => p.id !== playerId);
    this._emit('PLAYER_REMOVED', { playerId });
  }

  setModerator(playerId) {
    this.moderatorId = playerId;
    this.roomOwnerId = playerId;
    this.sageId = playerId;
  }

  setSage(playerId) {
    this.setModerator(playerId);
  }

  getPlayer(id) {
    return this.players.find(p => p.id === id);
  }

  getAlivePlayers() {
    return this.players.filter(p => p.isAlive);
  }

  getAliveByTeam(team) {
    return this.players.filter(p => p.isAlive && p.team === team);
  }

  getAliveByRole(role) {
    return this.players.filter(p => p.isAlive && p.role === role);
  }

  getDeadPlayers() {
    return this.players.filter(p => !p.isAlive);
  }

  /* ═══════════════════════════════════════════════════
     ROLE ASSIGNMENT
     ═══════════════════════════════════════════════════ */

  /** Assign roles from a map: { MAFIA: 2, DOCTOR: 1, OFFICER: 1, CITIZEN: 2 } */
  assignRoles(roleCounts) {
    const totalRoles = Object.values(roleCounts).reduce((a, b) => a + b, 0);

    if (totalRoles !== this.players.length) {
      throw new Error(`Role count (${totalRoles}) doesn't match player count (${this.players.length})`);
    }
    if (!roleCounts[Role.MAFIA] || roleCounts[Role.MAFIA] < 1) {
      throw new Error('At least 1 Mafia is required');
    }

    const roleList = [];
    for (const [role, count] of Object.entries(roleCounts)) {
      for (let i = 0; i < count; i++) roleList.push(role);
    }

    const shuffled = shuffle(roleList);
    this.players.forEach((p, i) => {
      p.role = shuffled[i];
      p.team = RoleTeamMap[shuffled[i]];
    });

    this.phase = GamePhase.ROLE_ASSIGNMENT;
    this._emit('ROLES_ASSIGNED', { players: this.players.map(p => ({ id: p.id, name: p.name, role: p.role })) });
    this._notify();
  }

  /** Directly set a player's role (for scenarios) */
  setPlayerRole(playerId, role) {
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.role = role;
    p.team = RoleTeamMap[role];
  }

  /* ═══════════════════════════════════════════════════
     GAME START
     ═══════════════════════════════════════════════════ */

  startGame() {
    if (this.phase !== GamePhase.ROLE_ASSIGNMENT) throw new Error('Roles must be assigned first');
    if (this.players.some(p => !p.role)) throw new Error('Not all players have roles');
    this._startNewRound();
    this._emit('GAME_STARTED', {});
    this._notify();
  }

  /* ═══════════════════════════════════════════════════
     ROUND MANAGEMENT
     ═══════════════════════════════════════════════════ */

  _startNewRound() {
    this.currentRound++;
    const alive = this.getAlivePlayers();
    this.currentRoundData = {
      roundNumber: this.currentRound,
      config: { ...this.defaultRoundConfig },
      snapshot: alive.map(p => p.id),
      actions: [],     // PlayerAction[]
      votes: [],       // Vote[]
      resolution: null, // NightResolution
      voteResult: null,
      announcements: [],
    };
    this.rounds.push(this.currentRoundData);
    this.phase = GamePhase.NIGHT_MAFIA;
    this._emit('ROUND_STARTED', { round: this.currentRound });
    this._startPhaseTimer();
    this._notify();
  }

  getRoundConfig() {
    return this.currentRoundData ? this.currentRoundData.config : this.defaultRoundConfig;
  }

  updateRoundConfig(updates) {
    if (!this.currentRoundData) return;
    Object.assign(this.currentRoundData.config, updates);
    this._notify();
  }

  updateDefaultConfig(updates) {
    if (!updates || typeof updates !== "object") return;
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null) {
        this.defaultRoundConfig[key] = value;
      }
    }
  }

  /* ═══════════════════════════════════════════════════
     PHASE TRANSITIONS
     ═══════════════════════════════════════════════════ */

  advancePhase() {
    if (this.phase === GamePhase.FINISHED) return;

    const idx = RoundPhaseOrder.indexOf(this.phase);


    if (this.phase === GamePhase.VOTE_RESOLUTION) {
      this._resolveVotes();
      const win = this._checkWinCondition();
      if (win) {
        this.winner = win;
        this.phase = GamePhase.FINISHED;
        this._emit('GAME_FINISHED', { winner: win });
        this._stopTimer();
        this._notify();
        return;
      }
      // Start new round
      this._startNewRound();
      return;
    }

    if (idx >= 0 && idx < RoundPhaseOrder.length - 1) {
      this.phase = RoundPhaseOrder[idx + 1];
      this._emit('PHASE_STARTED', { phase: this.phase });
      this._startPhaseTimer();
      this._notify();
    }
  }

  /** Force a specific phase (for dev/demo controls) */
  setPhase(phase) {
    this.phase = phase;
    this._startPhaseTimer();
    this._notify();
  }

  _getTimerForPhase(phase) {
    if (!this.currentRoundData) return 0;
    const c = this.currentRoundData.config;
    switch (phase) {
      case GamePhase.NIGHT_MAFIA: return c.mafiaTimerSeconds;
      case GamePhase.NIGHT_DOCTOR: return c.doctorTimerSeconds;
      case GamePhase.NIGHT_OFFICER: return c.officerTimerSeconds;
      case GamePhase.NIGHT_RESOLUTION: return c.resolutionTimerSeconds || 3;
      case GamePhase.MORNING: return c.morningTimerSeconds || 5;
      case GamePhase.DISCUSSION: return c.discussionTimerSeconds;
      case GamePhase.VOTING: return c.votingTimerSeconds;
      case GamePhase.VOTE_RESOLUTION: return c.voteResolutionTimerSeconds || 5;
      default: return 0;
    }
  }

  /* ═══════════════════════════════════════════════════
     TIMER MANAGEMENT
     ═══════════════════════════════════════════════════ */

  _startPhaseTimer() {
    this._stopTimer();
    const seconds = this._getTimerForPhase(this.phase);
    if (seconds <= 0) return;
    this.timerTotal = seconds;
    this.timerRemaining = seconds;
    this._timerInterval = setInterval(() => {
      this.timerRemaining--;
      if (this._onTimerTick) this._onTimerTick(this.timerRemaining);
      if (this.timerRemaining <= 0) {
        this._stopTimer();
        if (this._onTimerExpire) this._onTimerExpire();
        // In automated mode, advance phase
        if (this.gameMode === GameMode.AUTOMATED) {
          this.advancePhase();
        }
        this._notify();
      }
    }, 1000);
  }

  _stopTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  extendTimer(seconds) {
    this.timerRemaining += seconds;
    this.timerTotal += seconds;
    this._emit('TIMER_EXTENDED', { added: seconds, remaining: this.timerRemaining });
    this._notify();
  }

  setTimerCallbacks(onTick, onExpire) {
    this._onTimerTick = onTick;
    this._onTimerExpire = onExpire;
  }

  /* ═══════════════════════════════════════════════════
     NIGHT ACTIONS
     ═══════════════════════════════════════════════════ */

  /**
   * Submit a night action.
   * @param {string} actorId - Player performing the action
   * @param {string} actionType - KILL, HEAL, or INVESTIGATE
   * @param {string[]} targetIds - Target player IDs
   * @returns {{ success: boolean, error?: string, result?: string }}
   */
  submitAction(actorId, actionType, targetIds) {
    const validation = this._validateAction(actorId, actionType, targetIds);
    if (!validation.valid) return { success: false, error: validation.error };

    // Remove previous actions by this actor for this phase
    this.currentRoundData.actions = this.currentRoundData.actions.filter(
      a => !(a.actorId === actorId && a.actionType === actionType)
    );

    // Store actions
    let investigationResult = null;
    for (const targetId of targetIds) {
      const action = {
        id: generateId(),
        actorId,
        actionType,
        targetId,
        roundNumber: this.currentRound,
        timestamp: Date.now(),
      };

      // Immediately resolve investigation for display
      if (actionType === ActionType.INVESTIGATE) {
        const target = this.getPlayer(targetId);
        investigationResult = target.team === Team.MAFIA ? 'MAFIA' : 'INNOCENT';
        action.result = investigationResult;
      }

      this.currentRoundData.actions.push(action);
    }

    this._emit('ACTION_SUBMITTED', { actorId, actionType, targetIds });
    this._notify();

    return { success: true, result: investigationResult };
  }

  _validateAction(actorId, actionType, targetIds) {
    const actor = this.getPlayer(actorId);
    if (!actor) return { valid: false, error: 'Player not found' };
    if (!actor.isAlive) return { valid: false, error: 'Dead players cannot act' };

    // Check correct phase for action
    const expectedPhase = {
      [ActionType.KILL]: GamePhase.NIGHT_MAFIA,
      [ActionType.HEAL]: GamePhase.NIGHT_DOCTOR,
      [ActionType.INVESTIGATE]: GamePhase.NIGHT_OFFICER,
    }[actionType];

    if (this.phase !== expectedPhase) {
      return { valid: false, error: `Cannot perform ${actionType} during ${this.phase}` };
    }

    // Check actor has the correct role
    const expectedRole = {
      [ActionType.KILL]: Role.MAFIA,
      [ActionType.HEAL]: Role.DOCTOR,
      [ActionType.INVESTIGATE]: Role.OFFICER,
    }[actionType];

    if (actor.role !== expectedRole) {
      return { valid: false, error: `Your role cannot perform ${actionType}` };
    }

    // Check target count
    const config = this.getRoundConfig();
    const maxTargets = {
      [ActionType.KILL]: config.mafiaKillCount,
      [ActionType.HEAL]: config.doctorHealCount,
      [ActionType.INVESTIGATE]: 1, // Always 1
    }[actionType];

    if (targetIds.length > maxTargets) {
      return { valid: false, error: `Can only select up to ${maxTargets} targets` };
    }

    // Check all targets are eligible (alive at round start)
    const snapshot = this.currentRoundData.snapshot;
    for (const tid of targetIds) {
      if (!snapshot.includes(tid)) {
        return { valid: false, error: `Target ${tid} is not eligible (not alive at round start)` };
      }
      // Also ensure target exists and is not sage
      const target = this.getPlayer(tid);
      if (!target) return { valid: false, error: 'Target not found' };
    }

    // Doctor: check consecutive target restriction
    if (actionType === ActionType.HEAL) {
      const prevRound = this.rounds[this.rounds.length - 2]; // previous round
      if (prevRound) {
        const prevHeals = prevRound.actions.filter(
          a => a.actorId === actorId && a.actionType === ActionType.HEAL
        );
        for (const tid of targetIds) {
          if (prevHeals.some(a => a.targetId === tid)) {
            const targetName = this.getPlayer(tid)?.name || tid;
            return { valid: false, error: `Cannot heal ${targetName} in consecutive rounds` };
          }
        }
      }
    }

    return { valid: true };
  }

  /** Get actions submitted by a specific player this round */
  getPlayerActions(playerId, actionType) {
    if (!this.currentRoundData) return [];
    return this.currentRoundData.actions.filter(
      a => a.actorId === playerId && a.actionType === actionType
    );
  }

  /** Get all actions of a type this round */
  getActionsOfType(actionType) {
    if (!this.currentRoundData) return [];
    return this.currentRoundData.actions.filter(a => a.actionType === actionType);
  }

  /** Check if a player has submitted all required actions */
  hasPlayerSubmitted(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || !player.isAlive) return true;

    const activeRole = PhaseActiveRole[this.phase];
    if (!activeRole || player.role !== activeRole) return true;

    const actionType = {
      [Role.MAFIA]: ActionType.KILL,
      [Role.DOCTOR]: ActionType.HEAL,
      [Role.OFFICER]: ActionType.INVESTIGATE,
    }[player.role];

    const actions = this.getPlayerActions(playerId, actionType);
    return actions.length > 0;
  }

  /** Check if all active players have submitted their actions */
  allActionsSubmitted() {
    const activeRole = PhaseActiveRole[this.phase];
    if (!activeRole) return true;
    const activePlayers = this.getAliveByRole(activeRole);
    return activePlayers.every(p => this.hasPlayerSubmitted(p.id));
  }

  /* ═══════════════════════════════════════════════════
     NIGHT RESOLUTION
     ═══════════════════════════════════════════════════ */

  _resolveNight() {
    const config = this.getRoundConfig();
    const killActions = this.getActionsOfType(ActionType.KILL);
    const healActions = this.getActionsOfType(ActionType.HEAL);
    const investigateActions = this.getActionsOfType(ActionType.INVESTIGATE);

    // Aggregate mafia targets
    const killVotes = this._aggregateTargets(killActions);
    const killTargets = this._selectTopN(killVotes, config.mafiaKillCount);

    // Aggregate doctor targets
    const healVotes = this._aggregateTargets(healActions);
    const healTargets = this._selectTopN(healVotes, config.doctorHealCount);

    // Determine deaths (killed but not healed)
    const deaths = killTargets.filter(id => !healTargets.includes(id));
    const saves = killTargets.filter(id => healTargets.includes(id));

    // Apply deaths
    for (const pid of deaths) {
      const player = this.getPlayer(pid);
      if (player) {
        player.isAlive = false;
        player.deathCause = DeathCause.MAFIA_KILL;
        player.deathRound = this.currentRound;
      }
    }

    // Determine public officer report on alternate nights (Odd rounds: announced, Even rounds: skipped)
    const isAnnouncedRound = this.currentRound % 2 === 1;
    let publicOfficerReport = null;

    if (isAnnouncedRound) {
      if (investigateActions.length > 0) {
        const foundMafia = investigateActions.some(a => a.result === 'MAFIA');
        publicOfficerReport = {
          isAnnounced: true,
          hasInvestigation: true,
          isCorrect: foundMafia,
          verdict: foundMafia ? 'CORRECT' : 'WRONG',
          roundNumber: this.currentRound,
        };
      } else {
        publicOfficerReport = {
          isAnnounced: true,
          hasInvestigation: false,
          isCorrect: null,
          verdict: 'NO_INVESTIGATION',
          roundNumber: this.currentRound,
        };
      }
    } else {
      publicOfficerReport = {
        isAnnounced: false,
        reason: 'SKIPPED',
        roundNumber: this.currentRound,
      };
    }

    // Store resolution
    this.currentRoundData.resolution = {
      killVotes,
      healVotes,
      killTargets,
      healTargets,
      deaths,
      saves,
      investigations: investigateActions.map(a => ({
        officerId: a.actorId,
        targetId: a.targetId,
        result: a.result,
        revealed: true,
      })),
      publicOfficerReport,
    };

    this._emit('NIGHT_RESOLVED', this.currentRoundData.resolution);
  }

  /** Count votes per target: returns [{ targetId, count }] sorted desc */
  _aggregateTargets(actions) {
    const counts = {};
    for (const a of actions) {
      counts[a.targetId] = (counts[a.targetId] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([targetId, count]) => ({ targetId, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Select top N targets with random tie-breaking */
  _selectTopN(voteCounts, n) {
    if (voteCounts.length === 0 || n <= 0) return [];

    const selected = [];
    let remaining = n;
    let i = 0;

    while (remaining > 0 && i < voteCounts.length) {
      const currentCount = voteCounts[i].count;
      const tied = [];
      while (i < voteCounts.length && voteCounts[i].count === currentCount) {
        tied.push(voteCounts[i].targetId);
        i++;
      }

      if (tied.length <= remaining) {
        selected.push(...tied);
        remaining -= tied.length;
      } else {
        const picks = randomSelect(tied, remaining);
        selected.push(...picks);
        this._emit('RANDOM_SELECTION', { candidates: tied, selected: picks });
        remaining = 0;
      }
    }

    return selected;
  }

  /* ═══════════════════════════════════════════════════
     VOTING
     ═══════════════════════════════════════════════════ */

  submitVote(voterId, targetId) {
    const voter = this.getPlayer(voterId);
    if (!voter) return { success: false, error: 'Player not found' };
    if (!voter.isAlive) return { success: false, error: 'Dead players cannot vote' };
    if (this.phase !== GamePhase.VOTING) return { success: false, error: 'Not in voting phase' };

    const target = this.getPlayer(targetId);
    if (!target) return { success: false, error: 'Target not found' };
    if (!target.isAlive) return { success: false, error: 'Cannot vote for dead player' };

    // Update or add vote
    const existing = this.currentRoundData.votes.findIndex(v => v.voterId === voterId);
    if (existing >= 0) {
      this.currentRoundData.votes[existing].targetId = targetId;
      this.currentRoundData.votes[existing].updatedAt = Date.now();
    } else {
      this.currentRoundData.votes.push({
        id: generateId(),
        voterId,
        targetId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    this._emit('VOTE_SUBMITTED', { voterId, targetId });
    this._notify();
    return { success: true };
  }

  getVoteTally() {
    if (!this.currentRoundData) return {};
    const tally = {};
    for (const v of this.currentRoundData.votes) {
      tally[v.targetId] = (tally[v.targetId] || 0) + 1;
    }
    return tally;
  }

  getPlayerVote(playerId) {
    if (!this.currentRoundData) return null;
    const v = this.currentRoundData.votes.find(v => v.voterId === playerId);
    return v ? v.targetId : null;
  }

  allVotesSubmitted() {
    const eligibleVoters = this.getAlivePlayers();
    return eligibleVoters.every(p =>
      this.currentRoundData.votes.some(v => v.voterId === p.id)
    );
  }

  _resolveVotes() {
    const tally = this.getVoteTally();
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);

    let eliminatedId = null;
    let eliminatedRole = null;
    let isTie = false;

    if (entries.length > 0) {
      const maxVotes = entries[0][1];
      const topTargets = entries.filter(e => e[1] === maxVotes);

      if (topTargets.length === 1) {
        eliminatedId = topTargets[0][0];
        const player = this.getPlayer(eliminatedId);
        if (player) {
          player.isAlive = false;
          player.deathCause = DeathCause.VILLAGE_VOTE;
          player.deathRound = this.currentRound;
          eliminatedRole = this.revealRoleAfterVoting ? player.role : null;
        }
      } else {
        isTie = true;
      }
    }

    this.currentRoundData.voteResult = {
      tally,
      eliminatedId,
      eliminatedRole,
      isTie,
    };

    this._emit('VOTE_RESOLVED', this.currentRoundData.voteResult);
  }

  /* ═══════════════════════════════════════════════════
     WIN CONDITIONS
     ═══════════════════════════════════════════════════ */

  _checkWinCondition() {
    const alivePlayers = this.getAlivePlayers();
    const mafiaCount = alivePlayers.filter(p => p.team === Team.MAFIA).length;
    const villageCount = alivePlayers.filter(p => p.team === Team.VILLAGE).length;

    if (mafiaCount === 0) return Team.VILLAGE;
    if (mafiaCount >= villageCount) return Team.MAFIA;
    return null; // Game continues
  }

  getMafiaCount() {
    return this.getAlivePlayers().filter(p => p.team === Team.MAFIA).length;
  }

  getVillageCount() {
    return this.getAlivePlayers().filter(p => p.team === Team.VILLAGE).length;
  }

  /* ═══════════════════════════════════════════════════
     ANNOUNCEMENTS
     ═══════════════════════════════════════════════════ */

  createAnnouncement(message) {
    const ann = {
      id: generateId(),
      roundNumber: this.currentRound,
      message,
      timestamp: Date.now(),
    };
    this.announcements.push(ann);
    if (this.currentRoundData) {
      this.currentRoundData.announcements.push(ann);
    }
    this._emit('ANNOUNCEMENT', ann);
    this._notify();
    return ann;
  }

  getRoundAnnouncements(roundNumber) {
    return this.announcements.filter(a => a.roundNumber === (roundNumber || this.currentRound));
  }

  /* ═══════════════════════════════════════════════════
     CHAT
     ═══════════════════════════════════════════════════ */

  sendChat(playerId, channel, message) {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    // Validate channel permissions
    const canChat = this._canUseChannel(player, channel);
    if (!canChat) return { success: false, error: 'You cannot use this channel' };

    const msg = {
      id: generateId(),
      playerId,
      playerName: player.name,
      channel,
      message,
      timestamp: Date.now(),
    };
    this.chatMessages[channel].push(msg);
    this._notify();
    return { success: true };
  }

  _canUseChannel(player, channel) {
    if (channel === ChatChannel.PUBLIC) {
      // Must be alive, and in discussion or voting phase
      return player.isAlive && (
        this.phase === GamePhase.DISCUSSION ||
        this.phase === GamePhase.VOTING
      );
    }
    if (channel === ChatChannel.MAFIA) {
      // Must be alive Mafia in GROUP mode, and during NIGHT_MAFIA phase
      return player.isAlive &&
        player.role === Role.MAFIA &&
        this.mafiaAwareness === AwarenessMode.GROUP &&
        this.phase === GamePhase.NIGHT_MAFIA;
    }
    if (channel === ChatChannel.DEAD) {
      return !player.isAlive;
    }
    return false;
  }

  getChat(channel) {
    return this.chatMessages[channel] || [];
  }

  /* ═══════════════════════════════════════════════════
     VISIBILITY / PRIVACY
     ═══════════════════════════════════════════════════ */

  /**
   * Get the game state visible to a specific player.
   * This is the core privacy filter — only returns what the player should see.
   */
  getVisibleState(playerId) {
    const player = this.getPlayer(playerId);
    const isRoomModerator = Boolean(playerId && (String(playerId) === String(this.moderatorId) || String(playerId) === String(this.sageId)));

    const state = {
      id: this.id,
      code: this.code,
      phase: this.phase,
      currentRound: this.currentRound,
      winner: this.winner,
      timerRemaining: this.timerRemaining,
      timerTotal: this.timerTotal,
      gameMode: this.gameMode,
      mafiaAwareness: this.mafiaAwareness,
      doctorAwareness: this.doctorAwareness,
      officerAwareness: this.officerAwareness,
      revealRoleAfterVoting: this.revealRoleAfterVoting,
      announcements: this.getRoundAnnouncements(),
      config: this.getRoundConfig(),
      moderatorId: this.moderatorId || this.sageId,
      isModerator: isRoomModerator,
    };

    // In LOBBY or ROLE_ASSIGNMENT:
    if (this.phase === GamePhase.LOBBY || this.phase === GamePhase.ROLE_ASSIGNMENT) {
      state.isSage = false;
      state.players = this.players.map(p => {
        const isMe = player && p.id === player.id;
        const showRole = isRoomModerator || isMe;
        return {
          ...p,
          role: showRole ? p.role : null,
          team: showRole ? p.team : null,
          isModerator: Boolean(p.id && (String(p.id) === String(this.moderatorId) || String(p.id) === String(this.sageId))),
          roleVisible: showRole,
        };
      });
      if (player) {
        state.myId = player.id;
        state.myName = player.name;
        state.myRole = player.role;
        state.myTeam = player.team;
        state.isAlive = player.isAlive;
      }
      return state;
    }

    // ACTIVE GAMEPLAY: ALL players, including room creator, get normal player visibility
    state.isSage = false;
    if (!player) return state;

    state.myId = player.id;
    state.myName = player.name;
    state.myRole = player.role;
    state.myTeam = player.team;
    state.isAlive = player.isAlive;

    // Build player list: includes all players
    state.players = this.players.map(p => {
      const visible = {
        id: p.id,
        name: p.name,
        isAlive: p.isAlive,
        deathCause: p.deathCause,
        deathRound: p.deathRound,
        roleVisible: false,
        role: null,
        team: null,
      };

      // Can always see own role
      if (p.id === player.id) {
        visible.role = p.role;
        visible.team = p.team;
        visible.roleVisible = true;
        return visible;
      }

      // Group awareness: can see teammates
      if (player.role === Role.MAFIA && p.role === Role.MAFIA && this.mafiaAwareness === AwarenessMode.GROUP) {
        visible.role = p.role;
        visible.team = p.team;
        visible.roleVisible = true;
      }
      if (player.role === Role.DOCTOR && p.role === Role.DOCTOR && this.doctorAwareness === AwarenessMode.GROUP) {
        visible.role = p.role;
        visible.team = p.team;
        visible.roleVisible = true;
      }
      if (player.role === Role.OFFICER && p.role === Role.OFFICER && this.officerAwareness === AwarenessMode.GROUP) {
        visible.role = p.role;
        visible.team = p.team;
        visible.roleVisible = true;
      }

      // Dead player with role reveal after voting
      if (!p.isAlive && p.deathCause === DeathCause.VILLAGE_VOTE && this.revealRoleAfterVoting) {
        visible.role = p.role;
        visible.team = p.team;
        visible.roleVisible = true;
      }

      // After game ends, reveal all
      if (this.phase === GamePhase.FINISHED) {
        visible.role = p.role;
        visible.team = p.team;
        visible.roleVisible = true;
      }

      return visible;
    });

    // Own actions this round
    if (this.currentRoundData) {
      state.myActions = this.currentRoundData.actions.filter(a => a.actorId === player.id);
    }

    // Vote tally (revealed only in VOTE_RESOLUTION)
    if (this.phase === GamePhase.VOTING || this.phase === GamePhase.VOTE_RESOLUTION) {
      state.voteTally = this.phase === GamePhase.VOTE_RESOLUTION ? this.getVoteTally() : null;
      state.myVote = this.getPlayerVote(player.id);
      state.voteResult = this.currentRoundData?.voteResult;
      state.votesCount = this.currentRoundData?.votes?.length || 0;
      state.totalEligibleVoters = this.getAlivePlayers().length;
    }

    // Resolution info that players can see
    if (this.currentRoundData?.resolution && (
      this.phase === GamePhase.MORNING ||
      this.phase === GamePhase.DISCUSSION ||
      this.phase === GamePhase.VOTING ||
      this.phase === GamePhase.VOTE_RESOLUTION
    )) {
      state.nightDeaths = this.currentRoundData.resolution.deaths.map(id => {
        const p = this.getPlayer(id);
        return { id, name: p?.name }; // No role revealed for mafia kills
      });
      state.nightSaves = this.currentRoundData.resolution.saves.length; // only count
      state.publicOfficerReport = this.currentRoundData.resolution.publicOfficerReport;
      
      if (player.role === Role.OFFICER) {
        state.myInvestigations = [];
      }
    }

    // Eligible targets for current phase
    if (NightPhaseOrder.includes(this.phase) && player.isAlive) {
      state.eligibleTargets = this._getEligibleTargets(player);
    }
    if (this.phase === GamePhase.VOTING && player.isAlive) {
      state.eligibleVoteTargets = this.getAlivePlayers()
        .map(p => ({ id: p.id, name: p.name }));
    }

    return state;
  }

  _getEligibleTargets(player) {
    if (!this.currentRoundData) return [];
    const snapshot = this.currentRoundData.snapshot;
    const activeRole = PhaseActiveRole[this.phase];

    // Only active role gets targets
    if (player.role !== activeRole) return [];

    let targets = snapshot
      .map(id => this.getPlayer(id))
      .filter(p => p && p.isAlive);

    // Doctor: filter out consecutive target
    if (player.role === Role.DOCTOR) {
      const prevRound = this.rounds[this.rounds.length - 2];
      if (prevRound) {
        const prevHeals = prevRound.actions.filter(
          a => a.actorId === player.id && a.actionType === ActionType.HEAL
        );
        const prevTargetIds = prevHeals.map(a => a.targetId);
        targets = targets.map(t => ({
          ...t,
          disabled: prevTargetIds.includes(t.id),
          disabledReason: 'Healed last round',
        }));
      }
    }

    return targets.map(t => ({
      id: t.id,
      name: t.name,
      disabled: t.disabled || false,
      disabledReason: t.disabledReason || null,
    }));
  }

  /* ═══════════════════════════════════════════════════
     EVENTS & NOTIFICATIONS
     ═══════════════════════════════════════════════════ */

  _emit(type, data) {
    this.events.push({ type, data, timestamp: Date.now(), round: this.currentRound });
  }

  _notify() {
    if (this.onStateChange) this.onStateChange(this);
  }

  /* ═══════════════════════════════════════════════════
     DEV / DEMO CONTROLS
     ═══════════════════════════════════════════════════ */

  /** Kill a player directly (dev control) */
  devKillPlayer(playerId, cause = DeathCause.MAFIA_KILL) {
    const player = this.getPlayer(playerId);
    if (!player || !player.isAlive) return;
    player.isAlive = false;
    player.deathCause = cause;
    player.deathRound = this.currentRound;
    this._notify();
  }

  /** Revive a player (dev control) */
  devRevivePlayer(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.isAlive = true;
    player.deathCause = null;
    player.deathRound = null;
    this._notify();
  }

  /** Force trigger win */
  devTriggerWin(team) {
    this.winner = team;
    this.phase = GamePhase.FINISHED;
    this._stopTimer();
    this._notify();
  }

  /** Reset to beginning of current round */
  devResetRound() {
    // Revive players killed this round
    for (const p of this.players) {
      if (p.deathRound === this.currentRound) {
        p.isAlive = true;
        p.deathCause = null;
        p.deathRound = null;
      }
    }
    this.phase = GamePhase.NIGHT_MAFIA;
    if (this.currentRoundData) {
      this.currentRoundData.actions = [];
      this.currentRoundData.votes = [];
      this.currentRoundData.resolution = null;
      this.currentRoundData.voteResult = null;
    }
    this.winner = null;
    this._startPhaseTimer();
    this._notify();
  }

  /** Reveal an investigation result to the officer */
  devRevealInvestigation(officerId) {
    if (!this.currentRoundData || !this.currentRoundData.resolution) return;
    const inv = this.currentRoundData.resolution.investigations.find(i => i.officerId === officerId);
    if (inv) {
      inv.revealed = true;
      this._notify();
    }
  }

  /** Destroy timer on cleanup */
  destroy() {
    this._stopTimer();
  }
}

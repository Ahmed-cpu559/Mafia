// backend/server/engine/MafiaGame.js
/**
 * Mafia Game Engine
 *
 * Core game state management, phase transitions, action handling,
 * night resolution, voting, and win condition evaluation.
 *
 * All game logic lives here — UI never mutates game state directly.
 */

import { Team, Role, AwarenessMode, GameMode, GamePhase, ActionType, DeathCause, ChatChannel, RoleTeamMap, RoundPhaseOrder, NightPhaseOrder, PhaseActiveRole, TimelineEventType, DEFAULT_GAME_RULES } from "../../../shared/enums.js";

/* ═══════════════════════════════════════════════════════════════
   UTILITY HELPERS
   ═══════════════════════════════════════════════════════════════ */

let _idCounter = 1;
export function generateId() {
  return `id_${Date.now()}_${_idCounter++}`;
}

export function generateGameCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
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
      voteResolutionTimerSeconds: 5
    };

    /* ── Timer ── */
    this.timerRemaining = 0;
    this.timerTotal = 0;
    this._timerInterval = null;
    this._onTimerTick = null;
    this._onTimerExpire = null;

    /* ── Chat ── */
    this.chatMessages = { [ChatChannel.PUBLIC]: [], [ChatChannel.MAFIA]: [], [ChatChannel.DEAD]: [] };

    /* ── Announcements ── */
    this.announcements = []; // { roundNumber, message, timestamp }

    /* ── Room & Rules Configuration ── */
    this.visibility = "PUBLIC";
    this.inviteToken = null;
    this.rules = null;
    this.rulesSnapshot = null;
    this.doctorCanSelfHeal = true;
    this.doctorConsecutiveProtection = false;
    this.allowSelfVote = false;
    this.tieRule = "NO_ELIMINATION";

    /* ── Timeline ── */
    this.timeline = []; // structured event timeline

    /* ── Event log ── */
    this.events = [];

    /* ── Callbacks ── */
    this.onStateChange = null;
  }

  /* ═══════════════════════════════════════════════════
     DYNAMIC RULES & CONFIGURATION
     ═══════════════════════════════════════════════════ */

  applyCustomRules(customRules) {
    if (!customRules || typeof customRules !== "object") return;
    this.rules = {
      ...DEFAULT_GAME_RULES,
      ...customRules,
      timers: { ...DEFAULT_GAME_RULES.timers, ...(customRules.timers || {}) },
      doctor: { ...DEFAULT_GAME_RULES.doctor, ...(customRules.doctor || {}) },
      voting: { ...DEFAULT_GAME_RULES.voting, ...(customRules.voting || {}) },
      mafia: { ...DEFAULT_GAME_RULES.mafia, ...(customRules.mafia || {}) },
    };

    if (this.rules.timers) {
      if (Number.isFinite(Number(this.rules.timers.NIGHT_MAFIA))) {
        this.defaultRoundConfig.mafiaTimerSeconds = Math.max(5, Math.min(300, Number(this.rules.timers.NIGHT_MAFIA)));
      }
      if (Number.isFinite(Number(this.rules.timers.NIGHT_DOCTOR))) {
        this.defaultRoundConfig.doctorTimerSeconds = Math.max(5, Math.min(300, Number(this.rules.timers.NIGHT_DOCTOR)));
      }
      if (Number.isFinite(Number(this.rules.timers.NIGHT_OFFICER))) {
        this.defaultRoundConfig.officerTimerSeconds = Math.max(5, Math.min(300, Number(this.rules.timers.NIGHT_OFFICER)));
      }
      if (Number.isFinite(Number(this.rules.timers.DISCUSSION))) {
        this.defaultRoundConfig.discussionTimerSeconds = Math.max(10, Math.min(600, Number(this.rules.timers.DISCUSSION)));
      }
      if (Number.isFinite(Number(this.rules.timers.VOTING))) {
        this.defaultRoundConfig.votingTimerSeconds = Math.max(10, Math.min(300, Number(this.rules.timers.VOTING)));
      }
    }

    if (this.rules.mafia && Number.isFinite(Number(this.rules.mafia.killCount))) {
      this.defaultRoundConfig.mafiaKillCount = Math.max(1, Math.min(5, Number(this.rules.mafia.killCount)));
    }

    if (this.rules.doctor) {
      this.doctorCanSelfHeal = this.rules.doctor.canSelfHeal !== false;
      this.doctorConsecutiveProtection = Boolean(this.rules.doctor.consecutiveProtection);
    }

    if (this.rules.voting) {
      this.allowSelfVote = Boolean(this.rules.voting.allowSelfVote);
      this.tieRule = this.rules.voting.tieRule || "NO_ELIMINATION";
      this.revealRoleAfterVoting = this.rules.voting.revealRole !== false;
    }
  }

  /* ═══════════════════════════════════════════════════
     TIMELINE SYSTEM
     ═══════════════════════════════════════════════════ */

  addTimelineEvent({ type, displayText, isPublic = true, targetRole = null, actorId = null, targetPlayerId = null, details = null }) {
    const event = {
      id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: type || TimelineEventType.PHASE_STARTED,
      round: this.currentRound,
      phase: this.phase,
      timestamp: Date.now(),
      displayText,
      isPublic: Boolean(isPublic),
      targetRole: targetRole || null,
      actorId: actorId || null,
      targetPlayerId: targetPlayerId || null,
      details: details || null
    };
    this.timeline.push(event);
    this._emit("TIMELINE_EVENT", event);
    return event;
  }

  getFilteredTimeline(player) {
    if (this.phase === GamePhase.FINISHED || !player) {
      return this.timeline;
    }
    return this.timeline.filter((e) => e.isPublic || (player && player.role === e.targetRole));
  }

  /* ═══════════════════════════════════════════════════
     PLAYER MANAGEMENT
     ═══════════════════════════════════════════════════ */

  addPlayer(name, id = null) {
    if (this.phase !== GamePhase.LOBBY) throw new Error("Can only add players in LOBBY");
    const player = { id: id || generateId(), name, role: null, team: null, isAlive: true, deathCause: null, deathRound: null };
    this.players.push(player);
    this.addTimelineEvent({
      type: TimelineEventType.PLAYER_JOINED,
      displayText: `${name} joined the room.`,
      isPublic: true,
      actorId: player.id
    });
    this._emit("PLAYER_JOINED", { player });
    return player;
  }

  removePlayer(playerId) {
    if (this.phase !== GamePhase.LOBBY) throw new Error("Can only remove players in LOBBY");
    const player = this.getPlayer(playerId);
    this.players = this.players.filter((p) => p.id !== playerId);
    if (player) {
      this.addTimelineEvent({
        type: TimelineEventType.PLAYER_LEFT,
        displayText: `${player.name} left the room.`,
        isPublic: true,
        actorId: playerId
      });
    }
    this._emit("PLAYER_REMOVED", { playerId });
  }

  setSage(playerId) {
    this.sageId = playerId;
    this.moderatorId = playerId;
    this.roomOwnerId = playerId;
  }

  setModerator(playerId) {
    this.sageId = playerId;
    this.moderatorId = playerId;
    this.roomOwnerId = playerId;
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  getAlivePlayers() {
    return this.players.filter((p) => p.isAlive);
  }

  getAliveByTeam(team) {
    return this.players.filter((p) => p.isAlive && p.team === team);
  }

  getAliveByRole(role) {
    return this.players.filter((p) => p.isAlive && p.role === role);
  }

  getDeadPlayers() {
    return this.players.filter((p) => !p.isAlive);
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
      throw new Error("At least 1 Mafia is required");
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
    this.addTimelineEvent({
      type: TimelineEventType.ROLES_ASSIGNED,
      displayText: `Roles have been distributed secretly to all players.`,
      isPublic: true
    });
    this._emit("ROLES_ASSIGNED", { players: this.players.map((p) => ({ id: p.id, name: p.name, role: p.role })) });
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
    if (this.phase !== GamePhase.ROLE_ASSIGNMENT) throw new Error("Roles must be assigned first");
    if (this.players.some((p) => !p.role)) throw new Error("Not all players have roles");
    this.startedAt = Date.now();
    this.rulesSnapshot = JSON.parse(JSON.stringify(this.rules || {
      timers: {
        NIGHT_MAFIA: this.defaultRoundConfig.mafiaTimerSeconds,
        NIGHT_DOCTOR: this.defaultRoundConfig.doctorTimerSeconds,
        NIGHT_OFFICER: this.defaultRoundConfig.officerTimerSeconds,
        DISCUSSION: this.defaultRoundConfig.discussionTimerSeconds,
        VOTING: this.defaultRoundConfig.votingTimerSeconds,
      },
      doctor: { canSelfHeal: this.doctorCanSelfHeal, consecutiveProtection: this.doctorConsecutiveProtection },
      voting: { allowSelfVote: this.allowSelfVote, tieRule: this.tieRule, revealRole: this.revealRoleAfterVoting },
      mafia: { killCount: this.defaultRoundConfig.mafiaKillCount }
    }));
    this.addTimelineEvent({
      type: TimelineEventType.GAME_STARTED,
      displayText: `Game has started! Round 1 is beginning.`,
      isPublic: true
    });
    this._startNewRound();
    this._emit("GAME_STARTED", {});
    this._notify();
  }

  cancelGame() {
    this.phase = GamePhase.LOBBY;
    this.currentRound = 0;
    this.currentRoundData = null;
    this.chatMessages = { PUBLIC: [], MAFIA: [], DEAD: [] };
    this.announcements = [];
    this.winner = null;
    this._stopTimer();

    // Reset all players
    for (const p of this.players) {
      p.role = null;
      p.team = null;
      p.isAlive = true;
      p.deathCause = null;
      p.deathRound = null;
    }
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
      snapshot: alive.map((p) => p.id),
      actions: [], // PlayerAction[]
      votes: [], // Vote[]
      resolution: null, // NightResolution
      voteResult: null,
      announcements: []
    };
    this.rounds.push(this.currentRoundData);
    this.phase = GamePhase.NIGHT_MAFIA;
    this.addTimelineEvent({
      type: TimelineEventType.ROUND_STARTED,
      displayText: `Round ${this.currentRound} has begun. Night falls upon the village.`,
      isPublic: true
    });
    this._emit("ROUND_STARTED", { round: this.currentRound });
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

    if (this.phase === GamePhase.VOTE_RESOLUTION) {
      const win = this._checkWinCondition();
      if (win) {
        this.winner = win;
        this.phase = GamePhase.FINISHED;
        this.addTimelineEvent({
          type: TimelineEventType.GAME_FINISHED,
          displayText: `Game Over! The ${win} team has achieved victory!`,
          isPublic: true,
          details: { winner: win }
        });
        this._emit("GAME_FINISHED", { winner: win });
        this._stopTimer();
        this._notify();
        return;
      }
      // Start new round
      this._startNewRound();
      return;
    }

    // Normal progression
    const idx = RoundPhaseOrder.indexOf(this.phase);
    if (idx >= 0 && idx < RoundPhaseOrder.length - 1) {
      this.phase = RoundPhaseOrder[idx + 1];
      const phaseLabels = {
        [GamePhase.NIGHT_MAFIA]: "Night falls. Mafia awakens.",
        [GamePhase.NIGHT_DOCTOR]: "Doctor awakens to protect a citizen.",
        [GamePhase.NIGHT_OFFICER]: "Officer awakens to conduct investigation.",
        [GamePhase.NIGHT_RESOLUTION]: "Night resolution underway.",
        [GamePhase.MORNING]: "Morning arrives! Dawn breaks over the village.",
        [GamePhase.DISCUSSION]: "Town discussion phase starts. Deliberate on suspects.",
        [GamePhase.VOTING]: "Town voting opens. Cast your ballots.",
        [GamePhase.VOTE_RESOLUTION]: "Voting concluded. Counting results."
      };
      this.addTimelineEvent({
        type: TimelineEventType.PHASE_STARTED,
        displayText: phaseLabels[this.phase] || `${this.phase} phase begun.`,
        isPublic: true
      });
      this._emit("PHASE_STARTED", { phase: this.phase });

      // Execute resolution immediately upon entering the resolution phase
      if (this.phase === GamePhase.NIGHT_RESOLUTION) {
        this._resolveNight();
        const win = this._checkWinCondition();
        if (win) {
          this.winner = win;
          this.phase = GamePhase.FINISHED;
          this.addTimelineEvent({
            type: TimelineEventType.GAME_FINISHED,
            displayText: `Game Over! The ${win} team has achieved victory!`,
            isPublic: true,
            details: { winner: win }
          });
          this._emit("GAME_FINISHED", { winner: win });
          this._stopTimer();
          this._notify();
          return;
        }
      } else if (this.phase === GamePhase.VOTE_RESOLUTION) {
        this._resolveVotes();
        const win = this._checkWinCondition();
        if (win) {
          this.winner = win;
          this.phase = GamePhase.FINISHED;
          this.addTimelineEvent({
            type: TimelineEventType.GAME_FINISHED,
            displayText: `Game Over! The ${win} team has achieved victory!`,
            isPublic: true,
            details: { winner: win }
          });
          this._emit("GAME_FINISHED", { winner: win });
          this._stopTimer();
          this._notify();
          return;
        }
      }

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
      case GamePhase.NIGHT_MAFIA:
        return c.mafiaTimerSeconds;
      case GamePhase.NIGHT_DOCTOR:
        return c.doctorTimerSeconds;
      case GamePhase.NIGHT_OFFICER:
        return c.officerTimerSeconds;
      case GamePhase.NIGHT_RESOLUTION:
        return c.resolutionTimerSeconds || 3;
      case GamePhase.MORNING:
        return c.morningTimerSeconds || 5;
      case GamePhase.DISCUSSION:
        return c.discussionTimerSeconds;
      case GamePhase.VOTING:
        return c.votingTimerSeconds;
      case GamePhase.VOTE_RESOLUTION:
        return c.voteResolutionTimerSeconds || 5;
      default:
        return 0;
    }
  }

  /* ═══════════════════════════════════════════════════
     TIMER MANAGEMENT
     ═══════════════════════════════════════════════════ */

  _startPhaseTimer() {
    this._stopTimer();
    const seconds = this._getTimerForPhase(this.phase);
    if (seconds <= 0) {
      this.phaseStartedAt = null;
      this.phaseEndsAt = null;
      return;
    }

    this.phaseStartedAt = Date.now();
    this.phaseEndsAt = this.phaseStartedAt + seconds * 1000;

    if (this.gameMode === GameMode.AUTOMATED) {
      this._timerTimeout = setTimeout(() => {
        this.advancePhase();
      }, seconds * 1000);
    }
  }

  _stopTimer() {
    if (this._timerTimeout) {
      clearTimeout(this._timerTimeout);
      this._timerTimeout = null;
    }
  }

  extendTimer(seconds) {
    if (this.phaseEndsAt) {
      this.phaseEndsAt += seconds * 1000;
      if (this.gameMode === GameMode.AUTOMATED) {
        // Reschedule timeout
        this._stopTimer();
        const remaining = Math.max(0, this.phaseEndsAt - Date.now());
        this._timerTimeout = setTimeout(() => {
          this.advancePhase();
        }, remaining);
      }
      this._emit("TIMER_EXTENDED", { added: seconds, phaseEndsAt: this.phaseEndsAt });
      this._notify();
    }
  }

  getTimerRemaining() {
    if (!this.phaseEndsAt) return 0;
    return Math.max(0, Math.ceil((this.phaseEndsAt - Date.now()) / 1000));
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
    const normAction = (actionType === "PROTECT" ? ActionType.HEAL : actionType);
    const validation = this._validateAction(actorId, normAction, targetIds);
    if (!validation.valid) return { success: false, error: validation.error };

    // Remove previous actions by this actor for this phase
    this.currentRoundData.actions = this.currentRoundData.actions.filter((a) => !(a.actorId === actorId && (a.actionType === normAction || a.actionType === actionType)));

    // Store actions
    let investigationResult = null;
    for (const targetId of targetIds) {
      const action = { id: generateId(), actorId, actionType: normAction, targetId, roundNumber: this.currentRound, timestamp: Date.now() };

      // Immediately resolve investigation for display
      if (normAction === ActionType.INVESTIGATE) {
        const target = this.getPlayer(targetId);
        investigationResult = target.team === Team.MAFIA ? "MAFIA" : "INNOCENT";
        action.result = investigationResult;
      }

      this.currentRoundData.actions.push(action);
    }

    // Timeline logging
    const targetNames = targetIds.map((tid) => this.getPlayer(tid)?.name || "Player").join(", ");
    if (normAction === ActionType.KILL) {
      this.addTimelineEvent({
        type: TimelineEventType.ACTION_SUBMITTED,
        displayText: `Mafia selected ${targetNames} for elimination.`,
        isPublic: false,
        targetRole: Role.MAFIA,
        actorId,
        details: { actionType: normAction, targetIds }
      });
      this.addTimelineEvent({
        type: TimelineEventType.ACTION_SUBMITTED,
        displayText: `Mafia reached a decision.`,
        isPublic: true,
        details: { actionType: normAction }
      });
    } else if (normAction === ActionType.HEAL) {
      this.addTimelineEvent({
        type: TimelineEventType.ACTION_SUBMITTED,
        displayText: `Doctor protected ${targetNames}.`,
        isPublic: false,
        targetRole: Role.DOCTOR,
        actorId,
        details: { actionType: normAction, targetIds }
      });
      this.addTimelineEvent({
        type: TimelineEventType.ACTION_SUBMITTED,
        displayText: `Doctor administered protection.`,
        isPublic: true,
        details: { actionType: normAction }
      });
    } else if (normAction === ActionType.INVESTIGATE) {
      this.addTimelineEvent({
        type: TimelineEventType.ACTION_SUBMITTED,
        displayText: `Officer investigated ${targetNames}: Result is ${investigationResult}.`,
        isPublic: false,
        targetRole: Role.OFFICER,
        actorId,
        details: { actionType: normAction, targetIds, result: investigationResult }
      });
      this.addTimelineEvent({
        type: TimelineEventType.ACTION_SUBMITTED,
        displayText: `Officer completed night investigation.`,
        isPublic: true,
        details: { actionType: normAction }
      });
    }

    this._emit("ACTION_SUBMITTED", { actorId, actionType: normAction, targetIds });
    this._notify();

    return { success: true, result: investigationResult };
  }

  _validateAction(actorId, actionType, targetIds) {
    const actor = this.getPlayer(actorId);
    if (!actor) return { valid: false, error: "Player not found" };
    if (!actor.isAlive) return { valid: false, error: "Dead players cannot act" };

    const normActionType = (actionType === "PROTECT" ? ActionType.HEAL : actionType);

    // Check correct phase for action
    const expectedPhase = { [ActionType.KILL]: GamePhase.NIGHT_MAFIA, [ActionType.HEAL]: GamePhase.NIGHT_DOCTOR, [ActionType.INVESTIGATE]: GamePhase.NIGHT_OFFICER }[normActionType];

    if (this.phase !== expectedPhase) {
      return { valid: false, error: `Cannot perform ${actionType} during ${this.phase}` };
    }

    // Check actor has the correct role
    const expectedRole = { [ActionType.KILL]: Role.MAFIA, [ActionType.HEAL]: Role.DOCTOR, [ActionType.INVESTIGATE]: Role.OFFICER }[normActionType];

    if (actor.role !== expectedRole) {
      return { valid: false, error: `Your role cannot perform ${actionType}` };
    }

    // Check target count
    const config = this.getRoundConfig();
    const maxTargets = {
      [ActionType.KILL]: config.mafiaKillCount,
      [ActionType.HEAL]: config.doctorHealCount,
      [ActionType.INVESTIGATE]: 1 // Always 1
    }[normActionType];

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
      if (!target) return { valid: false, error: "Target not found" };
    }

    // Doctor: check self heal and consecutive target restriction
    if (normActionType === ActionType.HEAL) {
      if (!this.doctorCanSelfHeal && targetIds.includes(actorId)) {
        return { valid: false, error: "Doctor self-healing is disabled in this room" };
      }
      if (!this.doctorConsecutiveProtection) {
        const prevRound = this.rounds[this.rounds.length - 2]; // previous round
        if (prevRound) {
          const prevHeals = prevRound.actions.filter((a) => a.actorId === actorId && a.actionType === ActionType.HEAL);
          for (const tid of targetIds) {
            if (prevHeals.some((a) => a.targetId === tid)) {
              const targetName = this.getPlayer(tid)?.name || tid;
              return { valid: false, error: `Cannot heal ${targetName} in consecutive rounds` };
            }
          }
        }
      }
    }

    return { valid: true };
  }

  /** Get actions submitted by a specific player this round */
  getPlayerActions(playerId, actionType) {
    if (!this.currentRoundData) return [];
    return this.currentRoundData.actions.filter((a) => a.actorId === playerId && a.actionType === actionType);
  }

  /** Get all actions of a type this round */
  getActionsOfType(actionType) {
    if (!this.currentRoundData) return [];
    return this.currentRoundData.actions.filter((a) => a.actionType === actionType);
  }

  /** Check if a player has submitted all required actions */
  hasPlayerSubmitted(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || !player.isAlive) return true;

    const activeRole = PhaseActiveRole[this.phase];
    if (!activeRole || player.role !== activeRole) return true;

    const actionType = { [Role.MAFIA]: ActionType.KILL, [Role.DOCTOR]: ActionType.HEAL, [Role.OFFICER]: ActionType.INVESTIGATE }[player.role];

    const actions = this.getPlayerActions(playerId, actionType);
    return actions.length > 0;
  }

  /** Check if all active players have submitted their actions */
  allActionsSubmitted() {
    const activeRole = PhaseActiveRole[this.phase];
    if (!activeRole) return true;
    const activePlayers = this.getAliveByRole(activeRole);
    return activePlayers.every((p) => this.hasPlayerSubmitted(p.id));
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
    const deaths = killTargets.filter((id) => !healTargets.includes(id));
    const saves = killTargets.filter((id) => healTargets.includes(id));

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
        const foundMafia = investigateActions.some((a) => a.result === "MAFIA");
        publicOfficerReport = {
          isAnnounced: true,
          hasInvestigation: true,
          isCorrect: foundMafia, // true = شك صح (مافيا), false = شك غلط (بريء)
          verdict: foundMafia ? "CORRECT" : "WRONG",
          roundNumber: this.currentRound
        };
      } else {
        publicOfficerReport = {
          isAnnounced: true,
          hasInvestigation: false,
          isCorrect: null,
          verdict: "NO_INVESTIGATION",
          roundNumber: this.currentRound
        };
      }
    } else {
      publicOfficerReport = {
        isAnnounced: false,
        reason: "SKIPPED",
        roundNumber: this.currentRound
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
      investigations: investigateActions.map((a) => ({ officerId: a.actorId, targetId: a.targetId, result: a.result, revealed: true })),
      publicOfficerReport
    };

    if (deaths.length > 0) {
      for (const pid of deaths) {
        const deadPlayer = this.getPlayer(pid);
        this.addTimelineEvent({
          type: TimelineEventType.PLAYER_ELIMINATED,
          displayText: `${deadPlayer?.name || "A player"} was eliminated during the night by the Mafia.`,
          isPublic: true,
          targetPlayerId: pid
        });
      }
    } else if (saves.length > 0) {
      this.addTimelineEvent({
        type: TimelineEventType.NIGHT_RESOLVED,
        displayText: `The Doctor successfully saved someone tonight! No deaths occurred.`,
        isPublic: true
      });
    } else {
      this.addTimelineEvent({
        type: TimelineEventType.NIGHT_RESOLVED,
        displayText: `A peaceful night. No casualties occurred.`,
        isPublic: true
      });
    }

    // Public officer intelligence timeline event
    if (publicOfficerReport.isAnnounced) {
      if (publicOfficerReport.hasInvestigation) {
        this.addTimelineEvent({
          type: TimelineEventType.NIGHT_RESOLVED,
          displayText: publicOfficerReport.isCorrect
            ? `Officer intelligence: The Officer suspected correctly last night!`
            : `Officer intelligence: The Officer suspected wrongly last night (suspect was innocent).`,
          isPublic: true
        });
      }
    } else {
      this.addTimelineEvent({
        type: TimelineEventType.NIGHT_RESOLVED,
        displayText: `Officer intelligence: Report skipped this morning (announced on alternate rounds).`,
        isPublic: true
      });
    }

    this._emit("NIGHT_RESOLVED", this.currentRoundData.resolution);
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
        this._emit("RANDOM_SELECTION", { candidates: tied, selected: picks });
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
    if (!voter) return { success: false, error: "Player not found" };
    if (!voter.isAlive) return { success: false, error: "Dead players cannot vote" };
    if (this.phase !== GamePhase.VOTING) return { success: false, error: "Not in voting phase" };

    if (!this.allowSelfVote && voterId === targetId) {
      return { success: false, error: "Self-voting is not allowed in this room" };
    }

    const target = this.getPlayer(targetId);
    if (!target) return { success: false, error: "Target not found" };
    if (!target.isAlive) return { success: false, error: "Cannot vote for dead player" };

    // Update or add vote
    const existing = this.currentRoundData.votes.findIndex((v) => v.voterId === voterId);
    if (existing >= 0) {
      this.currentRoundData.votes[existing].targetId = targetId;
      this.currentRoundData.votes[existing].updatedAt = Date.now();
    } else {
      this.currentRoundData.votes.push({ id: generateId(), voterId, targetId, createdAt: Date.now(), updatedAt: Date.now() });
    }

    this.addTimelineEvent({
      type: TimelineEventType.VOTE_SUBMITTED,
      displayText: `${voter.name} voted for ${target.name}.`,
      isPublic: true,
      actorId: voterId,
      targetPlayerId: targetId
    });

    this._emit("VOTE_SUBMITTED", { voterId, targetId });
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
    const v = this.currentRoundData.votes.find((v) => v.voterId === playerId);
    return v ? v.targetId : null;
  }

  allVotesSubmitted() {
    const eligibleVoters = this.getAlivePlayers();
    return eligibleVoters.every((p) => this.currentRoundData.votes.some((v) => v.voterId === p.id));
  }

  _resolveVotes() {
    const tally = this.getVoteTally();
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);

    let eliminatedId = null;
    let eliminatedRole = null;
    let isTie = false;

    if (entries.length > 0) {
      const maxVotes = entries[0][1];
      const topTargets = entries.filter((e) => e[1] === maxVotes);

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
        if (this.tieRule === "RANDOM" && topTargets.length > 0) {
          const pickedTarget = randomSelect(topTargets.map((t) => t[0]), 1)[0];
          eliminatedId = pickedTarget;
          const player = this.getPlayer(eliminatedId);
          if (player) {
            player.isAlive = false;
            player.deathCause = DeathCause.VILLAGE_VOTE;
            player.deathRound = this.currentRound;
            eliminatedRole = this.revealRoleAfterVoting ? player.role : null;
          }
        }
      }
    } else {
      isTie = true;
    }

    if (eliminatedId) {
      const eliminated = this.getPlayer(eliminatedId);
      this.addTimelineEvent({
        type: TimelineEventType.PLAYER_ELIMINATED,
        displayText: `${eliminated?.name || "Player"} was eliminated by town majority vote!${eliminatedRole ? ` (Role: ${eliminatedRole})` : ""}`,
        isPublic: true,
        targetPlayerId: eliminatedId
      });
    } else {
      this.addTimelineEvent({
        type: TimelineEventType.VOTE_RESOLVED,
        displayText: `Town vote resulted in no elimination (tie or insufficient votes).`,
        isPublic: true
      });
    }

    this.currentRoundData.voteResult = { tally, eliminatedId, eliminatedRole, isTie };

    this._emit("VOTE_RESOLVED", this.currentRoundData.voteResult);
  }

  /* ═══════════════════════════════════════════════════
     WIN CONDITIONS
     ═══════════════════════════════════════════════════ */

  _checkWinCondition() {
    const alivePlayers = this.getAlivePlayers();
    const mafiaCount = alivePlayers.filter((p) => p.team === Team.MAFIA).length;
    const villageCount = alivePlayers.filter((p) => p.team === Team.VILLAGE).length;

    if (mafiaCount === 0) return Team.VILLAGE;
    if (mafiaCount >= villageCount) return Team.MAFIA;
    return null; // Game continues
  }

  getMafiaCount() {
    return this.getAlivePlayers().filter((p) => p.team === Team.MAFIA).length;
  }

  getVillageCount() {
    return this.getAlivePlayers().filter((p) => p.team === Team.VILLAGE).length;
  }

  /* ═══════════════════════════════════════════════════
     ANNOUNCEMENTS
     ═══════════════════════════════════════════════════ */

  createAnnouncement(message) {
    const ann = { id: generateId(), roundNumber: this.currentRound, message, timestamp: Date.now() };
    this.announcements.push(ann);
    if (this.currentRoundData) {
      this.currentRoundData.announcements.push(ann);
    }
    this._emit("ANNOUNCEMENT", ann);
    this._notify();
    return ann;
  }

  getRoundAnnouncements(roundNumber) {
    return this.announcements.filter((a) => a.roundNumber === (roundNumber || this.currentRound));
  }

  /* ═══════════════════════════════════════════════════
     CHAT
     ═══════════════════════════════════════════════════ */

  sendChat(playerId, channel, message) {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: "Player not found" };

    // Validate channel permissions
    const canChat = this._canUseChannel(player, channel);
    if (!canChat) return { success: false, error: "You cannot use this channel" };

    const msg = { id: generateId(), playerId, playerName: player.name, channel, message, timestamp: Date.now() };
    this.chatMessages[channel].push(msg);
    return { success: true, message: msg };
  }

  _canUseChannel(player, channel) {
    if (channel === ChatChannel.PUBLIC) {
      // Must be alive, and in discussion or voting phase
      return player.isAlive && (this.phase === GamePhase.DISCUSSION || this.phase === GamePhase.VOTING);
    }
    if (channel === ChatChannel.MAFIA) {
      // Must be alive Mafia in GROUP mode, and during NIGHT_MAFIA phase
      return player.isAlive && player.role === Role.MAFIA && this.mafiaAwareness === AwarenessMode.GROUP && this.phase === GamePhase.NIGHT_MAFIA;
    }
    if (channel === ChatChannel.DEAD) {
      return !player.isAlive;
    }
    return false;
  }

  canReadChannel(player, channel) {
    if (!player) return false;
    if (channel === ChatChannel.PUBLIC) {
      // Everyone can read public chat (alive or dead, at any time)
      return true;
    }
    if (channel === ChatChannel.MAFIA) {
      // Only mafia can read mafia chat
      return player.role === Role.MAFIA;
    }
    if (channel === ChatChannel.DEAD) {
      // Only dead can read dead chat
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
      timerRemaining: this.getTimerRemaining(),
      phaseStartedAt: this.phaseStartedAt,
      phaseEndsAt: this.phaseEndsAt,
      gameMode: this.gameMode,
      mafiaAwareness: this.mafiaAwareness,
      doctorAwareness: this.doctorAwareness,
      officerAwareness: this.officerAwareness,
      revealRoleAfterVoting: this.revealRoleAfterVoting,
      announcements: this.getRoundAnnouncements(),
      config: this.getRoundConfig(),
      moderatorId: this.moderatorId || this.sageId,
      isModerator: isRoomModerator,
      visibility: this.visibility || "PUBLIC",
      inviteToken: (isRoomModerator || this.visibility !== "INVITE_ONLY") ? this.inviteToken : null,
      rules: this.rules || null,
      timeline: this.getFilteredTimeline(player)
    };

    if (this.phase === GamePhase.FINISHED) {
      state.replay = this.getReplayState();
    }

    // In LOBBY or ROLE_ASSIGNMENT:
    if (this.phase === GamePhase.LOBBY || this.phase === GamePhase.ROLE_ASSIGNMENT) {
      state.isSage = false;
      state.players = this.players.map((p) => {
        return {
          id: p.id,
          name: p.name,
          role: null,
          team: null,
          isAlive: p.isAlive,
          isModerator: Boolean(p.id && (String(p.id) === String(this.moderatorId) || String(p.id) === String(this.sageId))),
          roleVisible: false
        };
      });
      if (player) {
        state.myId = player.id;
        state.myName = player.name;
        state.myRole = null;
        state.myTeam = null;
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

    // Filter chat messages based on privacy
    state.chatMessages = { PUBLIC: this.chatMessages.PUBLIC || [] };
    if (player.role === Role.MAFIA) {
      state.chatMessages.MAFIA = this.chatMessages.MAFIA || [];
    }
    if (!player.isAlive) {
      state.chatMessages.DEAD = this.chatMessages.DEAD || [];
    }

    // Player roster: includes ALL players in this.players
    state.players = this.players.map((p) => {
      const isMe = p.id === player.id;
      const isTeammate =
        (player.role === Role.MAFIA && p.role === Role.MAFIA && this.mafiaAwareness === AwarenessMode.GROUP) ||
        (player.role === Role.DOCTOR && p.role === Role.DOCTOR && this.doctorAwareness === AwarenessMode.GROUP) ||
        (player.role === Role.OFFICER && p.role === Role.OFFICER && this.officerAwareness === AwarenessMode.GROUP);

      const isDeadRevealed = !p.isAlive && p.deathCause === DeathCause.VILLAGE_VOTE && this.revealRoleAfterVoting;
      const isGameOver = this.phase === GamePhase.FINISHED;

      const showRole = isMe || isTeammate || isDeadRevealed || isGameOver;

      return {
        id: p.id,
        name: p.name,
        isAlive: p.isAlive,
        deathCause: p.deathCause,
        deathRound: p.deathRound,
        isModerator: Boolean(p.id && (String(p.id) === String(this.moderatorId) || String(p.id) === String(this.sageId))),
        roleVisible: showRole,
        role: showRole ? p.role : null,
        team: showRole ? p.team : null
      };
    });

    if (this.currentRoundData) {
      state.myActions = this.currentRoundData.actions.filter((a) => a.actorId === player.id);
      state.myVote = this.getPlayerVote(player.id);
      state.voteResult = this.currentRoundData.voteResult;
    }

    if (this.phase === GamePhase.VOTING || this.phase === GamePhase.VOTE_RESOLUTION) {
      state.voteTally = this.phase === GamePhase.VOTE_RESOLUTION ? this.getVoteTally() : null;
      state.myVote = this.getPlayerVote(player.id);
      state.voteResult = this.currentRoundData?.voteResult;
      state.votesCount = this.currentRoundData?.votes?.length || 0;
      state.totalEligibleVoters = this.getAlivePlayers().length;
    }

    if (this.currentRoundData?.resolution && (this.phase === GamePhase.MORNING || this.phase === GamePhase.DISCUSSION || this.phase === GamePhase.VOTING || this.phase === GamePhase.VOTE_RESOLUTION)) {
      state.nightDeaths = this.currentRoundData.resolution.deaths.map((id) => {
        const p = this.getPlayer(id);
        return { id, name: p?.name };
      });
      state.nightSaves = this.currentRoundData.resolution.saves.length;
      state.publicOfficerReport = this.currentRoundData.resolution.publicOfficerReport;

      if (player.role === Role.OFFICER) {
        state.myInvestigations = [];
      }
    }

    if (NightPhaseOrder.includes(this.phase) && player.isAlive) {
      state.eligibleTargets = this._getEligibleTargets(player);
    }
    if (this.phase === GamePhase.VOTING && player.isAlive) {
      state.eligibleVoteTargets = this.getAlivePlayers().map((p) => ({ id: p.id, name: p.name }));
    }

    return state;
  }

  getReplayState() {
    return {
      gameId: this.id,
      code: this.code,
      winner: this.winner,
      currentRound: this.currentRound,
      rulesSnapshot: this.rulesSnapshot || this.rules,
      startedAt: this.startedAt || null,
      endedAt: Date.now(),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        team: p.team,
        isAlive: p.isAlive,
        deathCause: p.deathCause,
        deathRound: p.deathRound
      })),
      timeline: this.timeline,
      rounds: this.rounds.map((r) => ({
        roundNumber: r.roundNumber,
        config: r.config,
        actions: r.actions,
        votes: r.votes,
        resolution: r.resolution,
        voteResult: r.voteResult,
        announcements: r.announcements
      }))
    };
  }

  _getEligibleTargets(player) {
    if (!this.currentRoundData) return [];
    const snapshot = this.currentRoundData.snapshot;
    const activeRole = PhaseActiveRole[this.phase];

    // Only active role gets targets
    if (player.role !== activeRole) return [];

    let targets = snapshot.map((id) => this.getPlayer(id)).filter((p) => p && p.isAlive);

    // Doctor: filter out consecutive target
    if (player.role === Role.DOCTOR) {
      const prevRound = this.rounds[this.rounds.length - 2];
      if (prevRound) {
        const prevHeals = prevRound.actions.filter((a) => a.actorId === player.id && a.actionType === ActionType.HEAL);
        const prevTargetIds = prevHeals.map((a) => a.targetId);
        targets = targets.map((t) => ({ ...t, disabled: prevTargetIds.includes(t.id), disabledReason: "Healed last round" }));
      }
    }

    return targets.map((t) => ({ id: t.id, name: t.name, disabled: t.disabled || false, disabledReason: t.disabledReason || null }));
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
    const inv = this.currentRoundData.resolution.investigations.find((i) => i.officerId === officerId);
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

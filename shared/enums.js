/* ─── Teams ─── */
export const Team = Object.freeze({
  VILLAGE: 'VILLAGE',
  MAFIA: 'MAFIA',
});

/* ─── Roles ─── */
export const Role = Object.freeze({
  CITIZEN: 'CITIZEN',
  VILLAGER: 'VILLAGER',
  DOCTOR: 'DOCTOR',
  OFFICER: 'OFFICER',
  MAFIA: 'MAFIA',
});

/* ─── Awareness Modes ─── */
export const AwarenessMode = Object.freeze({
  INDIVIDUAL: 'INDIVIDUAL',
  GROUP: 'GROUP',
});

/* ─── Game Modes ─── */
export const GameMode = Object.freeze({
  SAGE_CONTROLLED: 'SAGE_CONTROLLED',
  AUTOMATED: 'AUTOMATED',
});

/* ─── Game Phases ─── */
export const GamePhase = Object.freeze({
  LOBBY: 'LOBBY',
  ROLE_ASSIGNMENT: 'ROLE_ASSIGNMENT',
  NIGHT_MAFIA: 'NIGHT_MAFIA',
  NIGHT_DOCTOR: 'NIGHT_DOCTOR',
  NIGHT_OFFICER: 'NIGHT_OFFICER',
  NIGHT_RESOLUTION: 'NIGHT_RESOLUTION',
  MORNING: 'MORNING',
  DISCUSSION: 'DISCUSSION',
  VOTING: 'VOTING',
  VOTE_RESOLUTION: 'VOTE_RESOLUTION',
  FINISHED: 'FINISHED',
});

/* ─── Action Types ─── */
export const ActionType = Object.freeze({
  KILL: 'KILL',
  HEAL: 'HEAL',
  INVESTIGATE: 'INVESTIGATE',
});

/* ─── Death Causes ─── */
export const DeathCause = Object.freeze({
  MAFIA_KILL: 'MAFIA_KILL',
  VILLAGE_VOTE: 'VILLAGE_VOTE',
});

/* ─── Chat Channels ─── */
export const ChatChannel = Object.freeze({
  PUBLIC: 'PUBLIC',
  MAFIA: 'MAFIA',
  DEAD: 'DEAD',
});

/* ─── Role → Team mapping ─── */
export const RoleTeamMap = Object.freeze({
  [Role.CITIZEN]: Team.VILLAGE,
  [Role.VILLAGER]: Team.VILLAGE,
  [Role.DOCTOR]: Team.VILLAGE,
  [Role.OFFICER]: Team.VILLAGE,
  [Role.MAFIA]: Team.MAFIA,
});

/* ─── Night phase order ─── */
export const NightPhaseOrder = [
  GamePhase.NIGHT_MAFIA,
  GamePhase.NIGHT_DOCTOR,
  GamePhase.NIGHT_OFFICER,
];

/* ─── Full round phase order ─── */
export const RoundPhaseOrder = [
  GamePhase.NIGHT_MAFIA,
  GamePhase.NIGHT_DOCTOR,
  GamePhase.NIGHT_OFFICER,
  GamePhase.NIGHT_RESOLUTION,
  GamePhase.MORNING,
  GamePhase.DISCUSSION,
  GamePhase.VOTING,
  GamePhase.VOTE_RESOLUTION,
];

/* ─── Phase-specific role that acts ─── */
export const PhaseActiveRole = Object.freeze({
  [GamePhase.NIGHT_MAFIA]: Role.MAFIA,
  [GamePhase.NIGHT_DOCTOR]: Role.DOCTOR,
  [GamePhase.NIGHT_OFFICER]: Role.OFFICER,
});

/* ─── Visual themes for roles ─── */
export const RoleTheme = Object.freeze({
  [Role.MAFIA]: { color: '#ef4444', bg: '#991b1b', glow: 'rgba(239,68,68,0.25)', icon: '🔪', label: 'Mafia' },
  [Role.DOCTOR]: { color: '#10b981', bg: '#065f46', glow: 'rgba(16,185,129,0.25)', icon: '💊', label: 'Doctor' },
  [Role.OFFICER]: { color: '#3b82f6', bg: '#1e3a5f', glow: 'rgba(59,130,246,0.25)', icon: '🔍', label: 'Officer' },
  [Role.CITIZEN]: { color: '#94a3b8', bg: '#334155', glow: 'rgba(148,163,184,0.15)', icon: '👤', label: 'Villager' },
  [Role.VILLAGER]: { color: '#94a3b8', bg: '#334155', glow: 'rgba(148,163,184,0.15)', icon: '👤', label: 'Villager' },
});

/* ─── Visual themes for phases ─── */
export const PhaseTheme = Object.freeze({
  [GamePhase.LOBBY]: { color: '#f59e0b', icon: '🏠', label: 'Lobby', gradient: 'linear-gradient(135deg, #1a1500 0%, #0a0a1a 100%)' },
  [GamePhase.ROLE_ASSIGNMENT]: { color: '#8b5cf6', icon: '🎭', label: 'Role Assignment', gradient: 'linear-gradient(135deg, #1a0033 0%, #0a0a1a 100%)' },
  [GamePhase.NIGHT_MAFIA]: { color: '#ef4444', icon: '🔪', label: 'Mafia Phase', gradient: 'linear-gradient(135deg, #1a0000 0%, #0a0a1a 100%)' },
  [GamePhase.NIGHT_DOCTOR]: { color: '#10b981', icon: '💊', label: 'Doctor Phase', gradient: 'linear-gradient(135deg, #001a0f 0%, #0a0a1a 100%)' },
  [GamePhase.NIGHT_OFFICER]: { color: '#3b82f6', icon: '🔍', label: 'Officer Phase', gradient: 'linear-gradient(135deg, #00071a 0%, #0a0a1a 100%)' },
  [GamePhase.NIGHT_RESOLUTION]: { color: '#f59e0b', icon: '⚡', label: 'Resolution', gradient: 'linear-gradient(135deg, #1a1200 0%, #0a0a1a 100%)' },
  [GamePhase.MORNING]: { color: '#fbbf24', icon: '☀️', label: 'Morning', gradient: 'linear-gradient(135deg, #1a1500 0%, #0a0a1a 100%)' },
  [GamePhase.DISCUSSION]: { color: '#f59e0b', icon: '💬', label: 'Discussion', gradient: 'linear-gradient(135deg, #1a1200 0%, #0a0a1a 100%)' },
  [GamePhase.VOTING]: { color: '#8b5cf6', icon: '🗳️', label: 'Voting', gradient: 'linear-gradient(135deg, #0f0025 0%, #0a0a1a 100%)' },
  [GamePhase.VOTE_RESOLUTION]: { color: '#8b5cf6', icon: '📊', label: 'Vote Results', gradient: 'linear-gradient(135deg, #0f0025 0%, #0a0a1a 100%)' },
  [GamePhase.FINISHED]: { color: '#fbbf24', icon: '🏆', label: 'Game Over', gradient: 'linear-gradient(135deg, #1a1500 0%, #0a0a1a 100%)' },
});

/* ─── Team labels ─── */
export const TeamLabel = Object.freeze({
  [Team.VILLAGE]: 'Village',
  [Team.MAFIA]: 'Mafia',
});

/* ─── Room Visibility ─── */
export const RoomVisibility = Object.freeze({
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
  INVITE_ONLY: 'INVITE_ONLY',
});

/* ─── Timeline Events ─── */
export const TimelineEventType = Object.freeze({
  ROOM_CREATED: 'ROOM_CREATED',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  ROLES_ASSIGNED: 'ROLES_ASSIGNED',
  GAME_STARTED: 'GAME_STARTED',
  ROUND_STARTED: 'ROUND_STARTED',
  PHASE_STARTED: 'PHASE_STARTED',
  ACTION_SUBMITTED: 'ACTION_SUBMITTED',
  NIGHT_RESOLVED: 'NIGHT_RESOLVED',
  VOTE_SUBMITTED: 'VOTE_SUBMITTED',
  VOTE_RESOLVED: 'VOTE_RESOLVED',
  PLAYER_ELIMINATED: 'PLAYER_ELIMINATED',
  TIMER_EXTENDED: 'TIMER_EXTENDED',
  GAME_FINISHED: 'GAME_FINISHED',
});

/* ─── Notification Severity ─── */
export const NotificationSeverity = Object.freeze({
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  URGENT: 'URGENT',
});

/* ─── Default Centralized Game Rules ─── */
export const DEFAULT_GAME_RULES = Object.freeze({
  minPlayers: 5,
  maxPlayers: 20,
  timers: {
    NIGHT_MAFIA: 10,
    NIGHT_DOCTOR: 10,
    NIGHT_OFFICER: 10,
    DISCUSSION: 60,
    VOTING: 30,
  },
  doctor: {
    canSelfHeal: true,
    consecutiveProtection: false,
  },
  voting: {
    allowSelfVote: false,
    tieRule: 'NO_ELIMINATION',
    revealRole: true,
  },
  mafia: {
    killCount: 1,
    communication: true,
  },
});


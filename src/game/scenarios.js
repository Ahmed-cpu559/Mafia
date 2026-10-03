/**
 * Demo Scenarios
 * 
 * Pre-configured game states for testing and demonstrating
 * different game situations without playing through entire games.
 */

import { MafiaGame } from './engine.js';
import {
  Role, Team, AwarenessMode, GameMode, GamePhase, ActionType, DeathCause,
} from './enums.js';

/* ─── Sample player names ─── */
const NAMES = ['Ahmed', 'Mohamed', 'Omar', 'Ali', 'Hassan', 'Khaled', 'Youssef', 'Nour', 'Layla', 'Sara'];

/* ─── Helper: quickly build a game with players ─── */
function createBaseGame(playerCount = 6) {
  const game = new MafiaGame();
  // Create a sage
  const sage = game.addPlayer('Village Sage');
  game.setSage(sage.id);
  // Add players
  for (let i = 0; i < playerCount; i++) {
    game.addPlayer(NAMES[i] || `Player ${i + 1}`);
  }
  return game;
}

function getNonSagePlayers(game) {
  return game.players.filter(p => p.id !== game.sageId);
}

/* ═══════════════════════════════════════════════════════
   SCENARIO DEFINITIONS
   ═══════════════════════════════════════════════════════ */

export const scenarios = [
  {
    id: 'normal_game',
    name: 'Normal Game — Full Playthrough',
    description: 'A standard 8-player game with Group Mafia. Start from the beginning and play through all phases.',
    category: 'Full Game',
    setup: () => {
      const game = createBaseGame(8);
      game.gameMode = GameMode.SAGE_CONTROLLED;
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.revealRoleAfterVoting = true;
      game.defaultRoundConfig = {
        mafiaKillCount: 1,
        doctorHealCount: 1,
        mafiaTimerSeconds: 60,
        doctorTimerSeconds: 30,
        officerTimerSeconds: 30,
        discussionTimerSeconds: 300,
        votingTimerSeconds: 120,
      };
      return game;
    },
  },

  {
    id: 'group_mafia',
    name: 'Group Mafia — Night Phase',
    description: 'Mafia know each other and coordinate kills. Shows the Group awareness experience during NIGHT_MAFIA phase.',
    category: 'Night Phases',
    setup: () => {
      const game = createBaseGame(6);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.revealRoleAfterVoting = true;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      // Ahmed, Mohamed = Mafia; Omar = Doctor; Ali = Officer; Hassan, Khaled = Citizen
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.MAFIA);
      game.setPlayerRole(ps[2].id, Role.DOCTOR);
      game.setPlayerRole(ps[3].id, Role.OFFICER);
      game.setPlayerRole(ps[4].id, Role.CITIZEN);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.startGame();
      return game;
    },
  },

  {
    id: 'individual_mafia',
    name: 'Individual Mafia — Night Phase',
    description: 'Mafia do NOT know each other. Each acts independently. May target other Mafia accidentally.',
    category: 'Night Phases',
    setup: () => {
      const game = createBaseGame(6);
      game.mafiaAwareness = AwarenessMode.INDIVIDUAL;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.revealRoleAfterVoting = false;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.MAFIA);
      game.setPlayerRole(ps[2].id, Role.DOCTOR);
      game.setPlayerRole(ps[3].id, Role.OFFICER);
      game.setPlayerRole(ps[4].id, Role.CITIZEN);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.startGame();
      return game;
    },
  },

  {
    id: 'doctor_saves',
    name: 'Doctor Saves Player',
    description: 'Night resolution where the Doctor heals the Mafia target. Nobody dies.',
    category: 'Resolution',
    setup: () => {
      const game = createBaseGame(6);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.revealRoleAfterVoting = true;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.MAFIA);
      game.setPlayerRole(ps[2].id, Role.DOCTOR);
      game.setPlayerRole(ps[3].id, Role.OFFICER);
      game.setPlayerRole(ps[4].id, Role.CITIZEN);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.startGame();
      // Pre-submit Mafia actions targeting Hassan
      game.submitAction(ps[0].id, ActionType.KILL, [ps[4].id]); // Mafia1 → Hassan
      game.submitAction(ps[1].id, ActionType.KILL, [ps[4].id]); // Mafia2 → Hassan
      game.advancePhase(); // → NIGHT_DOCTOR
      // Doctor heals Hassan
      game.submitAction(ps[2].id, ActionType.HEAL, [ps[4].id]); // Doctor → Hassan
      game.advancePhase(); // → NIGHT_OFFICER
      game.advancePhase(); // → NIGHT_RESOLUTION (skip officer)
      // Now at NIGHT_RESOLUTION — advance will resolve
      return game;
    },
  },

  {
    id: 'multiple_kills',
    name: 'Multiple Kills',
    description: 'Mafia configured to kill 2 players. Shows multi-target selection and resolution.',
    category: 'Resolution',
    setup: () => {
      const game = createBaseGame(8);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.revealRoleAfterVoting = true;
      game.defaultRoundConfig.mafiaKillCount = 2;
      game.defaultRoundConfig.doctorHealCount = 1;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.MAFIA);
      game.setPlayerRole(ps[2].id, Role.MAFIA);
      game.setPlayerRole(ps[3].id, Role.DOCTOR);
      game.setPlayerRole(ps[4].id, Role.OFFICER);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.setPlayerRole(ps[6].id, Role.CITIZEN);
      game.setPlayerRole(ps[7].id, Role.CITIZEN);
      game.startGame();
      return game;
    },
  },

  {
    id: 'multiple_heals',
    name: 'Multiple Heals',
    description: '2 Doctors, heal count = 2. Shows multi-heal aggregation and duplicate protection.',
    category: 'Resolution',
    setup: () => {
      const game = createBaseGame(8);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.GROUP;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.revealRoleAfterVoting = true;
      game.defaultRoundConfig.mafiaKillCount = 2;
      game.defaultRoundConfig.doctorHealCount = 2;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.MAFIA);
      game.setPlayerRole(ps[2].id, Role.DOCTOR);
      game.setPlayerRole(ps[3].id, Role.DOCTOR);
      game.setPlayerRole(ps[4].id, Role.OFFICER);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.setPlayerRole(ps[6].id, Role.CITIZEN);
      game.setPlayerRole(ps[7].id, Role.CITIZEN);
      game.startGame();
      return game;
    },
  },

  {
    id: 'mafia_target_tie',
    name: 'Mafia Target Tie',
    description: 'Multiple Mafia targets with equal votes. Demonstrates random tie-breaking resolution.',
    category: 'Resolution',
    setup: () => {
      const game = createBaseGame(8);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.defaultRoundConfig.mafiaKillCount = 1;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.MAFIA);
      game.setPlayerRole(ps[2].id, Role.MAFIA);
      game.setPlayerRole(ps[3].id, Role.DOCTOR);
      game.setPlayerRole(ps[4].id, Role.OFFICER);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.setPlayerRole(ps[6].id, Role.CITIZEN);
      game.setPlayerRole(ps[7].id, Role.CITIZEN);
      game.startGame();
      // Each mafia picks a different target — 3-way tie
      game.submitAction(ps[0].id, ActionType.KILL, [ps[5].id]); // → Khaled
      game.submitAction(ps[1].id, ActionType.KILL, [ps[6].id]); // → Youssef
      game.submitAction(ps[2].id, ActionType.KILL, [ps[7].id]); // → Nour
      // Skip to resolution
      game.advancePhase(); // → NIGHT_DOCTOR
      game.advancePhase(); // → NIGHT_OFFICER
      game.advancePhase(); // → NIGHT_RESOLUTION
      return game;
    },
  },

  {
    id: 'doctor_target_tie',
    name: 'Doctor Target Tie',
    description: '2 Doctors with 2 heal slots, 3 equally targeted patients. Random tie-breaking.',
    category: 'Resolution',
    setup: () => {
      const game = createBaseGame(8);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.GROUP;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.defaultRoundConfig.mafiaKillCount = 2;
      game.defaultRoundConfig.doctorHealCount = 2;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.MAFIA);
      game.setPlayerRole(ps[2].id, Role.DOCTOR);
      game.setPlayerRole(ps[3].id, Role.DOCTOR);
      game.setPlayerRole(ps[4].id, Role.OFFICER);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.setPlayerRole(ps[6].id, Role.CITIZEN);
      game.setPlayerRole(ps[7].id, Role.CITIZEN);
      game.startGame();
      // Mafia kills
      game.submitAction(ps[0].id, ActionType.KILL, [ps[5].id, ps[6].id]);
      game.submitAction(ps[1].id, ActionType.KILL, [ps[5].id, ps[7].id]);
      game.advancePhase(); // → NIGHT_DOCTOR
      // Doctor 1 heals Khaled and Youssef, Doctor 2 heals Youssef and Nour
      game.submitAction(ps[2].id, ActionType.HEAL, [ps[5].id, ps[6].id]);
      game.submitAction(ps[3].id, ActionType.HEAL, [ps[6].id, ps[7].id]);
      game.advancePhase(); // → NIGHT_OFFICER
      game.advancePhase(); // → NIGHT_RESOLUTION
      return game;
    },
  },

  {
    id: 'officer_mafia',
    name: 'Officer Finds Mafia',
    description: 'Officer investigates a Mafia member. Shows the investigation result and Sage announcement options.',
    category: 'Officer',
    setup: () => {
      const game = createBaseGame(6);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.revealRoleAfterVoting = true;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.MAFIA);
      game.setPlayerRole(ps[2].id, Role.DOCTOR);
      game.setPlayerRole(ps[3].id, Role.OFFICER);
      game.setPlayerRole(ps[4].id, Role.CITIZEN);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.startGame();
      // Skip to officer phase
      game.advancePhase(); // → NIGHT_DOCTOR
      game.advancePhase(); // → NIGHT_OFFICER
      return game;
    },
  },

  {
    id: 'officer_innocent',
    name: 'Officer Finds Innocent',
    description: 'Officer investigates a Village member. Shows the INNOCENT result.',
    category: 'Officer',
    setup: () => {
      const game = createBaseGame(6);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.GROUP;
      game.revealRoleAfterVoting = true;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.CITIZEN);
      game.setPlayerRole(ps[2].id, Role.DOCTOR);
      game.setPlayerRole(ps[3].id, Role.OFFICER);
      game.setPlayerRole(ps[4].id, Role.OFFICER);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.startGame();
      game.advancePhase(); // → NIGHT_DOCTOR
      game.advancePhase(); // → NIGHT_OFFICER
      return game;
    },
  },

  {
    id: 'voting_tie',
    name: 'Voting Tie',
    description: 'Vote results in a tie between two players. Nobody is eliminated.',
    category: 'Voting',
    setup: () => {
      const game = createBaseGame(6);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.revealRoleAfterVoting = true;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.MAFIA);
      game.setPlayerRole(ps[2].id, Role.DOCTOR);
      game.setPlayerRole(ps[3].id, Role.OFFICER);
      game.setPlayerRole(ps[4].id, Role.CITIZEN);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.startGame();
      // Skip night phases
      game.advancePhase(); // NIGHT_DOCTOR
      game.advancePhase(); // NIGHT_OFFICER
      game.advancePhase(); // NIGHT_RESOLUTION
      game.advancePhase(); // MORNING
      game.advancePhase(); // DISCUSSION
      game.advancePhase(); // VOTING
      // Submit tied votes: 3 for Ahmed, 3 for Mohamed
      game.submitVote(ps[2].id, ps[0].id); // Omar → Ahmed
      game.submitVote(ps[3].id, ps[0].id); // Ali → Ahmed
      game.submitVote(ps[4].id, ps[0].id); // Hassan → Ahmed
      game.submitVote(ps[0].id, ps[1].id); // Ahmed → Mohamed
      game.submitVote(ps[1].id, ps[1].id); // Mohamed → Mohamed (self-vote)
      game.submitVote(ps[5].id, ps[1].id); // Khaled → Mohamed
      return game;
    },
  },

  {
    id: 'mafia_wins',
    name: 'Mafia Wins',
    description: 'Game state where Mafia outnumbers Village after elimination.',
    category: 'Win Conditions',
    setup: () => {
      const game = createBaseGame(6);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.revealRoleAfterVoting = true;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.MAFIA);
      game.setPlayerRole(ps[2].id, Role.MAFIA);
      game.setPlayerRole(ps[3].id, Role.DOCTOR);
      game.setPlayerRole(ps[4].id, Role.CITIZEN);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.startGame();
      // Kill some village members to set up mafia win
      game.devKillPlayer(ps[3].id, DeathCause.MAFIA_KILL); // Doctor dead
      game.devKillPlayer(ps[4].id, DeathCause.MAFIA_KILL); // Citizen dead
      // Now: 3 Mafia vs 1 Village — advance to vote resolution
      game.phase = GamePhase.VOTING;
      game.currentRoundData.votes = [];
      // Village votes for Mafia, but Mafia votes for last citizen
      game.submitVote(ps[0].id, ps[5].id); // Mafia → Khaled
      game.submitVote(ps[1].id, ps[5].id); // Mafia → Khaled
      game.submitVote(ps[2].id, ps[5].id); // Mafia → Khaled
      game.submitVote(ps[5].id, ps[0].id); // Khaled → Ahmed
      game.phase = GamePhase.VOTE_RESOLUTION;
      return game;
    },
  },

  {
    id: 'village_wins',
    name: 'Village Wins',
    description: 'Last Mafia is eliminated by voting. Village wins!',
    category: 'Win Conditions',
    setup: () => {
      const game = createBaseGame(6);
      game.mafiaAwareness = AwarenessMode.GROUP;
      game.doctorAwareness = AwarenessMode.INDIVIDUAL;
      game.officerAwareness = AwarenessMode.INDIVIDUAL;
      game.revealRoleAfterVoting = true;
      const ps = getNonSagePlayers(game);
      game.phase = GamePhase.ROLE_ASSIGNMENT;
      game.setPlayerRole(ps[0].id, Role.MAFIA);
      game.setPlayerRole(ps[1].id, Role.CITIZEN);
      game.setPlayerRole(ps[2].id, Role.DOCTOR);
      game.setPlayerRole(ps[3].id, Role.OFFICER);
      game.setPlayerRole(ps[4].id, Role.CITIZEN);
      game.setPlayerRole(ps[5].id, Role.CITIZEN);
      game.startGame();
      // Set up voting to eliminate last mafia
      game.phase = GamePhase.VOTING;
      game.currentRoundData.votes = [];
      game.submitVote(ps[1].id, ps[0].id);
      game.submitVote(ps[2].id, ps[0].id);
      game.submitVote(ps[3].id, ps[0].id);
      game.submitVote(ps[4].id, ps[0].id);
      game.submitVote(ps[5].id, ps[0].id);
      game.submitVote(ps[0].id, ps[1].id);
      game.phase = GamePhase.VOTE_RESOLUTION;
      return game;
    },
  },
];

/** Get a scenario by ID */
export function getScenario(id) {
  return scenarios.find(s => s.id === id);
}

/** Get scenarios grouped by category */
export function getScenariosByCategory() {
  const grouped = {};
  for (const s of scenarios) {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  }
  return grouped;
}

import { MafiaGame } from '../engine/MafiaGame.js';
import { GameMode, Role, ActionType, GamePhase } from '../../../shared/enums.js';

console.log('Testing Officer Alternate Reports...');

const game = new MafiaGame();
game.code = 'TEST';
game.gameMode = GameMode.AUTOMATED;

const p1 = game.addPlayer('Creator');
game.setModerator(p1.id);
const p2 = game.addPlayer('OfficerPlayer');
const p3 = game.addPlayer('MafiaPlayer');
const p4 = game.addPlayer('DoctorPlayer');
const p5 = game.addPlayer('Citizen1');
const p6 = game.addPlayer('Citizen2');

game.assignRoles({
  [Role.MAFIA]: 1,
  [Role.DOCTOR]: 1,
  [Role.OFFICER]: 1,
  [Role.VILLAGER]: 3
});

// Force specific roles on players for test deterministic assertions
p1.role = Role.VILLAGER;
p2.role = Role.OFFICER;
p3.role = Role.MAFIA;
p3.team = 'MAFIA';
p4.role = Role.DOCTOR;
p5.role = Role.VILLAGER;
p6.role = Role.VILLAGER;

game.startGame();

// ROUND 1: Officer investigates MafiaPlayer (p3)
console.log('--- ROUND 1 (Should be ANNOUNCED) ---');
game.phase = GamePhase.NIGHT_MAFIA;
game.submitAction(p3.id, ActionType.KILL, [p5.id]);

game.phase = GamePhase.NIGHT_DOCTOR;
game.submitAction(p4.id, ActionType.HEAL, [p6.id]);

game.phase = GamePhase.NIGHT_OFFICER;
game.submitAction(p2.id, ActionType.INVESTIGATE, [p3.id]); // Officer checks MafiaPlayer

game.advancePhase(); // -> NIGHT_RESOLUTION
console.log('Phase:', game.phase);
const resolutionR1 = game.currentRoundData.resolution;
console.log('R1 Public Officer Report:', resolutionR1.publicOfficerReport);

if (!resolutionR1.publicOfficerReport || !resolutionR1.publicOfficerReport.isAnnounced) {
  throw new Error('R1 report should be announced!');
}
if (!resolutionR1.publicOfficerReport.isCorrect) {
  throw new Error('R1 officer should have suspected correctly (target is Mafia)!');
}

game.advancePhase(); // -> MORNING (Villagers wake up)
console.log('Phase now:', game.phase);

// Check visible state for officer (p2)
const officerState = game.getVisibleState(p2.id);
if (officerState.myInvestigations && officerState.myInvestigations.length > 0) {
  throw new Error('Officer should not receive private investigation identity leak!');
}
if (!officerState.publicOfficerReport || !officerState.publicOfficerReport.isCorrect) {
  throw new Error('Officer should see public report showing suspicion was correct!');
}
console.log('✓ Round 1: Officer suspected correctly and public report is available to all players without private leaks.');

// Advance through Discussion, Voting to Round 2
game.advancePhase(); // DISCUSSION
game.advancePhase(); // VOTING
game.advancePhase(); // VOTE_RESOLUTION
game.advancePhase(); // Starts ROUND 2 (NIGHT_MAFIA)

console.log('--- ROUND 2 (Should be SKIPPED) ---');
console.log('Current Round:', game.currentRound);
if (game.currentRound !== 2) throw new Error('Expected round 2');

game.phase = GamePhase.NIGHT_MAFIA;
game.submitAction(p3.id, ActionType.KILL, [p6.id]);

game.phase = GamePhase.NIGHT_DOCTOR;
game.submitAction(p4.id, ActionType.HEAL, [p4.id]);

game.phase = GamePhase.NIGHT_OFFICER;
game.submitAction(p2.id, ActionType.INVESTIGATE, [p4.id]); // Officer checks Doctor (Innocent)

game.advancePhase(); // NIGHT_RESOLUTION
const resolutionR2 = game.currentRoundData.resolution;
console.log('R2 Public Officer Report:', resolutionR2.publicOfficerReport);

if (resolutionR2.publicOfficerReport.isAnnounced !== false) {
  throw new Error('R2 report should be skipped (announced=false)!');
}
if (resolutionR2.publicOfficerReport.reason !== 'SKIPPED') {
  throw new Error('R2 reason should be SKIPPED!');
}
console.log('✓ Round 2: Report correctly skipped (ليلة لا).');

// Advance to Round 3
game.advancePhase(); // MORNING
game.advancePhase(); // DISCUSSION
game.advancePhase(); // VOTING
game.advancePhase(); // VOTE_RESOLUTION
game.advancePhase(); // Starts ROUND 3

console.log('--- ROUND 3 (Should be ANNOUNCED - Officer suspected wrongly) ---');
console.log('Current Round:', game.currentRound);
if (game.currentRound !== 3) throw new Error('Expected round 3');

game.phase = GamePhase.NIGHT_MAFIA;
game.submitAction(p3.id, ActionType.KILL, [p4.id]);

game.phase = GamePhase.NIGHT_DOCTOR;
game.submitAction(p4.id, ActionType.HEAL, [p2.id]);

game.phase = GamePhase.NIGHT_OFFICER;
game.submitAction(p2.id, ActionType.INVESTIGATE, [p1.id]); // Officer checks Citizen (Innocent)

game.advancePhase(); // NIGHT_RESOLUTION
const resolutionR3 = game.currentRoundData.resolution;
console.log('R3 Public Officer Report:', resolutionR3.publicOfficerReport);

if (!resolutionR3.publicOfficerReport.isAnnounced) {
  throw new Error('R3 report should be announced!');
}
if (resolutionR3.publicOfficerReport.isCorrect !== false) {
  throw new Error('R3 officer should have suspected wrongly (target was innocent)!');
}
console.log('✓ Round 3: Officer suspected wrongly and public report is announced.');

console.log('====================================');
console.log('🎉 ALL ALTERNATE REPORT TESTS PASSED!');
console.log('====================================');

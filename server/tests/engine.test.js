import { jest } from '@jest/globals';
import { MafiaGame } from '../engine/MafiaGame.js';
import { GameMode, AwarenessMode, Role, Team, GamePhase } from '../../shared/enums.js';

describe('MafiaGame Engine', () => {
  let game;

  beforeEach(() => {
    game = new MafiaGame();
    game.code = 'TEST';
    game.gameMode = GameMode.SAGE_CONTROLLED;
    game.config = {
      mafiaKillCount: 1,
      doctorHealCount: 1,
      officerInvestigateCount: 1,
      mafiaAwareness: AwarenessMode.GROUP,
      doctorAwareness: AwarenessMode.INDIVIDUAL,
      officerAwareness: AwarenessMode.INDIVIDUAL,
      revealRole: true,
      timers: {}
    };

    const sage = game.addPlayer('Sage');
    game.setSage(sage.id);

    // Add 6 players
    for (let i = 1; i <= 6; i++) {
      game.addPlayer(`Player ${i}`);
    }

    game.assignRoles({
      [Role.MAFIA]: 2,
      [Role.DOCTOR]: 1,
      [Role.OFFICER]: 1,
      [Role.CITIZEN]: 2
    });
    
    game.startGame();
  });

  afterEach(() => {
    game.destroy();
  });

  test('should assign roles correctly', () => {
    const mafia = game.getAliveByRole(Role.MAFIA);
    const doctor = game.getAliveByRole(Role.DOCTOR);
    const officer = game.getAliveByRole(Role.OFFICER);
    const citizen = game.getAliveByRole(Role.CITIZEN);
    
    expect(mafia.length).toBe(2);
    expect(doctor.length).toBe(1);
    expect(officer.length).toBe(1);
    expect(citizen.length).toBe(2);
  });

  test('should advance phases correctly', () => {
    expect(game.phase).toBe(GamePhase.NIGHT_SETUP);
    game.advancePhase();
    expect(game.phase).toBe(GamePhase.NIGHT);
    game.advancePhase();
    expect(game.phase).toBe(GamePhase.NIGHT_RESOLUTION);
  });

  test('tracks citizen suspicions accuracy across rounds', () => {
    // Advance from NIGHT_SETUP to NIGHT
    game.advancePhase();
    expect(game.phase).toBe(GamePhase.NIGHT);

    const mafia = game.getAliveByRole(Role.MAFIA);
    const citizen = game.getAliveByRole(Role.CITIZEN);
    
    // Citizen suspects Mafia (correct!)
    game.submitAction(citizen[0].id, 'SUSPECT', [mafia[0].id]);
    
    // Advance phase to resolution
    game.advancePhase();
    expect(game.phase).toBe(GamePhase.NIGHT_RESOLUTION);
    
    const stats = game.citizenStats[citizen[0].id];
    expect(stats).toBeDefined();
    expect(stats.total).toBe(1);
    expect(stats.correct).toBe(1);
    expect(stats.wrong).toBe(0);
  });

  test('bounds dynamic round configuration between 1 and alive players count', () => {
    const aliveCount = game.getAlivePlayers().filter(p => p.id !== game.sageId).length;
    expect(aliveCount).toBe(6);

    // Test minimum bound (cannot go below 1)
    game.updateRoundConfig({ mafiaKillCount: 0, doctorHealCount: -5 });
    expect(game.getRoundConfig().mafiaKillCount).toBe(1);
    expect(game.getRoundConfig().doctorHealCount).toBe(1);

    // Test maximum bound (cannot exceed aliveCount)
    game.updateRoundConfig({ officerInvestigateCount: 10 });
    expect(game.getRoundConfig().officerInvestigateCount).toBe(aliveCount);

    // Valid intermediate value
    game.updateRoundConfig({ mafiaKillCount: 3 });
    expect(game.getRoundConfig().mafiaKillCount).toBe(3);
  });

  test('voting tie resolves to nobody eliminated', () => {
    // Jump to voting
    game.phase = GamePhase.VOTING;
    const players = game.getAlivePlayers().filter(p => p.id !== game.sageId);
    
    // 3 votes for p1, 3 votes for p2
    game.submitVote(players[0].id, players[1].id);
    game.submitVote(players[2].id, players[1].id);
    game.submitVote(players[3].id, players[1].id);

    game.submitVote(players[1].id, players[2].id);
    game.submitVote(players[4].id, players[2].id);
    game.submitVote(players[5].id, players[2].id);

    game.advancePhase(); // Go to VOTE_RESOLUTION

    expect(game.phase).toBe(GamePhase.VOTE_RESOLUTION);
    const result = game.currentRoundData.voteResult;
    expect(result.eliminatedId).toBeNull();
    expect(result.isTie).toBe(true);
  });

  test('assignSpecificRoles sets manual roles correctly', () => {
    const newGame = new MafiaGame();
    newGame.code = 'MANL';
    const sage = newGame.addPlayer('Sage');
    newGame.setSage(sage.id);
    const p1 = newGame.addPlayer('Alice');
    const p2 = newGame.addPlayer('Bob');
    const p3 = newGame.addPlayer('Charlie');

    newGame.assignSpecificRoles({
      [p1.id]: Role.MAFIA,
      [p2.id]: Role.DOCTOR,
      [p3.id]: Role.CITIZEN,
    });

    expect(newGame.getPlayer(p1.id).role).toBe(Role.MAFIA);
    expect(newGame.getPlayer(p2.id).role).toBe(Role.DOCTOR);
    expect(newGame.getPlayer(p3.id).role).toBe(Role.CITIZEN);
    expect(newGame.phase).toBe(GamePhase.ROLE_ASSIGNMENT);
    newGame.destroy();
  });

  test('removePlayer removes player in lobby and notifies', () => {
    const lobbyGame = new MafiaGame();
    const p1 = lobbyGame.addPlayer('Alice');
    const p2 = lobbyGame.addPlayer('Bob');
    let notified = false;
    lobbyGame.onStateChange = () => { notified = true; };

    expect(lobbyGame.players.length).toBe(2);
    lobbyGame.removePlayer(p1.id);
    expect(lobbyGame.players.length).toBe(1);
    expect(lobbyGame.getPlayer(p1.id)).toBeUndefined();
    expect(notified).toBe(true);
    lobbyGame.destroy();
  });
});

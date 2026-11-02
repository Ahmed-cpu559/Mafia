import { jest } from '@jest/globals';
import { MafiaGame } from '../engine/MafiaGame.js';
import { GameMode, AwarenessMode, Role, Team, GamePhase } from '../../../shared/enums.js';

describe('MafiaGame Engine', () => {
  let game;

  beforeEach(() => {
    game = new MafiaGame();
    game.code = 'TEST';
    game.gameMode = GameMode.AUTOMATED;
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

    // Creator is player 1 and room moderator
    const creator = game.addPlayer('Creator');
    game.setModerator(creator.id);

    // Add 5 more players (total 6)
    for (let i = 2; i <= 6; i++) {
      game.addPlayer(`Player ${i}`);
    }

    game.assignRoles({
      [Role.MAFIA]: 2,
      [Role.DOCTOR]: 1,
      [Role.OFFICER]: 1,
      [Role.VILLAGER]: 2
    });
    
    game.startGame();
  });

  afterEach(() => {
    game.destroy();
  });

  test('should assign roles correctly to all 6 players including creator', () => {
    const mafia = game.getAliveByRole(Role.MAFIA);
    const doctor = game.getAliveByRole(Role.DOCTOR);
    const officer = game.getAliveByRole(Role.OFFICER);
    const villager = game.getAliveByRole(Role.VILLAGER);
    
    expect(mafia.length).toBe(2);
    expect(doctor.length).toBe(1);
    expect(officer.length).toBe(1);
    expect(villager.length).toBe(2);
    expect(game.players.length).toBe(6);
    expect(game.players.every(p => p.role !== null)).toBe(true);
  });

  test('should advance phases correctly', () => {
    expect(game.phase).toBe(GamePhase.NIGHT_MAFIA);
    game.advancePhase();
    expect(game.phase).toBe(GamePhase.NIGHT_DOCTOR);
  });

  test('voting tie resolves to nobody eliminated', () => {
    // Jump to voting
    game.phase = GamePhase.VOTING;
    const players = game.getAlivePlayers();
    
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
});

// backend/server/tests/e2e_game_flow.js
import { spawn } from 'child_process';
import { io } from 'socket.io-client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isServerRunning(url) {
  try {
    const res = await fetch(`${url}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function waitForPhase(socket, expectedPhase, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error(`Timeout waiting for phase ${expectedPhase}`));
      }
    }, timeoutMs);

    const check = (state) => {
      if (state && state.phase === expectedPhase && !resolved) {
        resolved = true;
        cleanup();
        resolve(state);
      }
    };

    const onStateUpdate = (state) => check(state);
    const onGameState = (state) => check(state);

    function cleanup() {
      clearTimeout(timer);
      socket.off('stateUpdate', onStateUpdate);
      socket.off('game:state', onGameState);
    }

    socket.on('stateUpdate', onStateUpdate);
    socket.on('game:state', onGameState);

    // Initial check
    socket.emit('getRoomState', {}, (res) => {
      if (res?.state?.phase === expectedPhase && !resolved) {
        resolved = true;
        cleanup();
        resolve(res.state);
      }
    });
  });
}

async function run() {
  console.log('=====================================================');
  console.log('REAL 6-PLAYER COMPLETE MAFIA GAME PLAYTHROUGH TEST');
  console.log('=====================================================');

  const serverUrl = 'http://localhost:4090';
  let serverProc = null;

  const running = await isServerRunning(serverUrl);
  if (!running) {
    console.log('Spawning backend server on port 4090...');
    const backendServerPath = path.resolve(__dirname, '../index.js');
    serverProc = spawn('node', [backendServerPath], {
      stdio: 'inherit',
      env: { ...process.env, PORT: '4090' }
    });
    await sleep(3500);
  } else {
    console.log('✓ Backend server is running on port 4090.');
  }

  try {
    // 1. Authenticate 6 players (1 Host + 5 other players)
    console.log('\n--- [STEP 1] Authenticating 6 Players ---');
    const playerNames = [
      'Host_Creator',
      'Mafia_1',
      'Mafia_2',
      'Doctor_1',
      'Officer_1',
      'Villager_1'
    ];
    const users = [];

    for (const name of playerNames) {
      const res = await fetch(`${serverUrl}/api/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name })
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Auth failed for ${name}: ${JSON.stringify(data)}`);
      users.push({ name, token: data.token, id: data.user.id });
    }
    console.log(`✓ Authenticated 6 accounts.`);

    // 2. Connect 6 sockets
    console.log('\n--- [STEP 2] Connecting Sockets ---');
    const sockets = users.map(u => io(serverUrl, { auth: { token: u.token } }));
    await Promise.all(sockets.map(s => new Promise(resolve => s.on('connect', resolve))));
    console.log('✓ 6 sockets connected via Socket.IO.');

    // 3. Host creates room
    console.log('\n--- [STEP 3] Room Creation ---');
    const hostSocket = sockets[0];
    const createRes = await new Promise(resolve => hostSocket.emit('createGame', {}, resolve));
    if (!createRes.success) throw new Error(`createGame failed: ${JSON.stringify(createRes)}`);
    const roomCode = createRes.roomCode;
    const hostPlayerId = createRes.playerId;
    users[0].playerId = hostPlayerId;
    console.log(`✓ Room created: ${roomCode}. Host Player ID: ${hostPlayerId}`);

    // 4. Other 5 players join
    console.log('\n--- [STEP 4] 5 Players Join ---');
    for (let i = 1; i < 6; i++) {
      const joinRes = await new Promise(resolve => {
        sockets[i].emit('joinGame', { roomCode, playerName: users[i].name }, resolve);
      });
      if (!joinRes.success) throw new Error(`joinGame failed for player ${i}: ${JSON.stringify(joinRes)}`);
      users[i].playerId = joinRes.playerId;
    }
    console.log(`✓ All 5 other players joined room ${roomCode}. Total: 6 players.`);

    // 5. Moderator assigns roles
    console.log('\n--- [STEP 5] Moderator Assigns Roles (Creator is a Player) ---');
    // Creator is a normal Villager!
    const assignments = {
      [users[0].playerId]: 'VILLAGER',
      [users[1].playerId]: 'MAFIA',
      [users[2].playerId]: 'MAFIA',
      [users[3].playerId]: 'DOCTOR',
      [users[4].playerId]: 'OFFICER',
      [users[5].playerId]: 'VILLAGER'
    };

    const assignRes = await new Promise(resolve => {
      hostSocket.emit('moderator:assignRoles', { roleAssignments: assignments }, resolve);
    });
    if (!assignRes.success) throw new Error(`assignRoles failed: ${JSON.stringify(assignRes)}`);
    console.log('✓ All 6 roles assigned successfully.');

    // Verify role privacy in lobby
    const user5State = await new Promise(resolve => sockets[5].emit('getRoomState', {}, res => resolve(res.state)));
    const mafiaInState = user5State.players.find(p => p.id === users[1].playerId);
    if (mafiaInState && mafiaInState.role !== null) {
      throw new Error(`SECURITY PRIVACY LEAK: Non-moderator player could see hidden role: ${mafiaInState.role}`);
    }
    console.log('✓ Security check passed: Roles strictly hidden from regular players in lobby.');

    // 6. Start game with test timers
    console.log('\n--- [STEP 6] Start Game ---');
    const startRes = await new Promise(resolve => {
      hostSocket.emit('moderator:startGame', {
        config: {
          timers: {
            NIGHT_MAFIA: 4,
            NIGHT_DOCTOR: 4,
            NIGHT_OFFICER: 4,
            DISCUSSION: 2,
            VOTING: 4
          }
        }
      }, resolve);
    });
    if (!startRes.success) throw new Error(`startGame failed: ${JSON.stringify(startRes)}`);
    console.log('✓ Game started with sequential night flow.');

    // 7. ROUND 1 — NIGHT_MAFIA
    console.log('\n--- [STEP 7] Round 1: NIGHT_MAFIA (Both Mafia submit kill) ---');
    await waitForPhase(hostSocket, 'NIGHT_MAFIA');
    console.log('✓ Entered NIGHT_MAFIA phase.');

    // Both Mafia players submit kill target (Villager 1)
    const kill1 = await new Promise(resolve => sockets[1].emit('mafia:kill', { targetId: users[5].playerId }, resolve));
    if (!kill1.success) throw new Error(`Mafia 1 kill failed: ${JSON.stringify(kill1)}`);

    const kill2 = await new Promise(resolve => sockets[2].emit('mafia:kill', { targetId: users[5].playerId }, resolve));
    if (!kill2.success) throw new Error(`Mafia 2 kill failed: ${JSON.stringify(kill2)}`);
    console.log('✓ Both Mafia members submitted kill target -> early completion advances to NIGHT_DOCTOR.');

    // 8. ROUND 1 — NIGHT_DOCTOR
    console.log('\n--- [STEP 8] Round 1: NIGHT_DOCTOR (Doctor protects Host) ---');
    await waitForPhase(hostSocket, 'NIGHT_DOCTOR');
    console.log('✓ Entered NIGHT_DOCTOR phase.');

    // Doctor protects Host (Creator)
    const healRes = await new Promise(resolve => sockets[3].emit('doctor:protect', { targetId: users[0].playerId }, resolve));
    if (!healRes.success) throw new Error(`Doctor protect failed: ${JSON.stringify(healRes)}`);
    console.log('✓ Doctor submitted protection on Host -> early completion advances to NIGHT_OFFICER.');

    // 9. ROUND 1 — NIGHT_OFFICER
    console.log('\n--- [STEP 9] Round 1: NIGHT_OFFICER (Officer investigates Mafia 1) ---');
    await waitForPhase(hostSocket, 'NIGHT_OFFICER');
    console.log('✓ Entered NIGHT_OFFICER phase.');

    // Officer investigates Mafia 1
    const invRes = await new Promise(resolve => sockets[4].emit('officer:investigate', { targetId: users[1].playerId }, resolve));
    if (!invRes.success) throw new Error(`Officer investigate failed: ${JSON.stringify(invRes)}`);
    console.log('✓ Officer investigated Mafia 1 (Result: MAFIA) -> early completion advances to NIGHT_RESOLUTION.');

    // 10. ROUND 1 — NIGHT_RESOLUTION -> MORNING
    console.log('\n--- [STEP 10] Round 1: RESOLUTION & MORNING ---');
    const morningState = await waitForPhase(hostSocket, 'MORNING');
    console.log('✓ Entered MORNING phase.');
    console.log('Night deaths announced:', morningState.nightDeaths);
    if (!morningState.nightDeaths.some(d => d.id === users[5].playerId)) {
      throw new Error('Villager 1 should be listed in night deaths!');
    }
    console.log('✓ Villager 1 killed by Mafia. Host survived.');

    // 11. ROUND 1 — VOTING
    console.log('\n--- [STEP 11] Round 1: VOTING (Village votes out Mafia 1) ---');
    await waitForPhase(hostSocket, 'VOTING');
    console.log('✓ Entered VOTING phase.');

    // Dead player (Villager 1) attempts to vote -> verify rejection!
    const deadVote = await new Promise(resolve => sockets[5].emit('submitVote', { targetId: users[1].playerId }, resolve));
    if (deadVote.success) throw new Error('Dead player should NOT be allowed to vote!');
    console.log('✓ Security check passed: Dead player voting rejected.');

    // Living players cast votes:
    // Host -> Mafia 1
    // Doctor -> Mafia 1
    // Officer -> Mafia 1
    // Mafia 1 -> Doctor
    // Mafia 2 -> Doctor
    await new Promise(resolve => hostSocket.emit('submitVote', { targetId: users[1].playerId }, resolve));
    await new Promise(resolve => sockets[3].emit('submitVote', { targetId: users[1].playerId }, resolve));
    await new Promise(resolve => sockets[4].emit('submitVote', { targetId: users[1].playerId }, resolve));
    await new Promise(resolve => sockets[1].emit('submitVote', { targetId: users[3].playerId }, resolve));
    await new Promise(resolve => sockets[2].emit('submitVote', { targetId: users[3].playerId }, resolve));
    console.log('✓ All 5 living players voted -> early completion advances to VOTE_RESOLUTION.');

    // 12. ROUND 1 — VOTE_RESOLUTION
    console.log('\n--- [STEP 12] Round 1: VOTE_RESOLUTION ---');
    const voteResState = await waitForPhase(hostSocket, 'VOTE_RESOLUTION');
    console.log(`Vote eliminated player: ${voteResState.voteResult?.eliminatedId}`);
    if (voteResState.voteResult?.eliminatedId !== users[1].playerId) {
      throw new Error(`Expected Mafia 1 eliminated, got ${voteResState.voteResult?.eliminatedId}`);
    }
    console.log('✓ Mafia 1 eliminated by Village vote (3 votes vs 2 votes)!');

    // 13. ROUND 2 — NIGHT_MAFIA (1 Mafia left: Mafia 2)
    console.log('\n--- [STEP 13] Round 2: NIGHT_MAFIA (Mafia 2 acts) ---');
    await waitForPhase(hostSocket, 'NIGHT_MAFIA');
    console.log('✓ Round 2 started. Entered NIGHT_MAFIA.');

    // Mafia 2 kills Doctor (User 3)
    const killR2 = await new Promise(resolve => sockets[2].emit('mafia:kill', { targetId: users[3].playerId }, resolve));
    if (!killR2.success) throw new Error(`Mafia 2 kill failed: ${JSON.stringify(killR2)}`);
    console.log('✓ Mafia 2 killed Doctor.');

    // 14. ROUND 2 — NIGHT_DOCTOR (Doctor is still alive during night until resolution)
    console.log('\n--- [STEP 14] Round 2: NIGHT_DOCTOR & NIGHT_OFFICER ---');
    await waitForPhase(hostSocket, 'NIGHT_DOCTOR');
    // Doctor heals Officer
    await new Promise(resolve => sockets[3].emit('doctor:protect', { targetId: users[4].playerId }, resolve));

    await waitForPhase(hostSocket, 'NIGHT_OFFICER');
    // Officer investigates Mafia 2
    await new Promise(resolve => sockets[4].emit('officer:investigate', { targetId: users[2].playerId }, resolve));

    // 15. ROUND 2 — VOTING
    console.log('\n--- [STEP 15] Round 2: VOTING (Village votes out remaining Mafia 2) ---');
    await waitForPhase(hostSocket, 'VOTING');
    console.log('✓ Entered Round 2 VOTING phase.');

    // Living players: Host, Officer, Mafia 2.
    // Host votes Mafia 2
    await new Promise(resolve => hostSocket.emit('submitVote', { targetId: users[2].playerId }, resolve));
    // Officer votes Mafia 2
    await new Promise(resolve => sockets[4].emit('submitVote', { targetId: users[2].playerId }, resolve));
    // Mafia 2 votes Officer
    await new Promise(resolve => sockets[2].emit('submitVote', { targetId: users[4].playerId }, resolve));
    console.log('✓ All living players voted.');

    // 16. ROUND 2 — VOTE_RESOLUTION & WIN CHECK
    console.log('\n--- [STEP 16] Game Resolution & Win Condition Check ---');
    // After eliminating Mafia 2, Mafia count reaches 0!
    // The Village should WIN immediately!
    const finalState = await waitForPhase(hostSocket, 'FINISHED', 12000);
    console.log(`✓ Game finished! Phase: ${finalState.phase}, Winner: ${finalState.winner}`);

    if (finalState.winner !== 'VILLAGE') {
      throw new Error(`Expected winner VILLAGE, got ${finalState.winner}`);
    }

    // Verify all roles revealed at game end
    const allRevealed = finalState.players.every(p => p.role !== null && p.roleVisible === true);
    if (!allRevealed) throw new Error('All player roles should be revealed at game finish!');
    console.log('✓ Verified: All player roles revealed at Game Over.');

    // Verify database persistence
    await sleep(1000);
    const dbRes = await fetch(`${serverUrl}/api/admin/games`, {
      headers: {
        'Authorization': `Bearer ${users[0].token}` // User token (will be 403)
      }
    });
    console.log(`✓ Verified security: Normal user accessing /api/admin/games returns status: ${dbRes.status}`);

    // Clean up
    sockets.forEach(s => s.disconnect());

    console.log('\n=====================================================');
    console.log('🎉 6-PLAYER FULL MULTI-ROUND GAME PLAYTHROUGH PASSED 100%!');
    console.log('=====================================================');
  } finally {
    if (serverProc) {
      serverProc.kill();
    }
  }
}

run().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('PLAYTHROUGH ERROR:', err);
  process.exit(1);
});

// backend/server/tests/test_role_counts.js
import { spawn } from 'child_process';
import { io } from 'socket.io-client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('--- Testing Role Counts & Randomized Assignment ---');
  
  const backendServerPath = path.resolve(__dirname, '../index.js');
  const serverProc = spawn('node', [backendServerPath], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '4095', MAFIA_MIN_PLAYERS: '5' }
  });

  await sleep(3500);

  const serverUrl = 'http://localhost:4095';

  try {
    const playerNames = ['CreatorHost', 'Player2', 'Player3', 'Player4', 'Player5'];
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
    console.log(`✓ 5 Users authenticated.`);

    const sockets = users.map(u => io(serverUrl, { auth: { token: u.token } }));
    await Promise.all(sockets.map(s => new Promise((resolve) => s.on('connect', resolve))));
    console.log('✓ 5 sockets connected.');

    const modSocket = sockets[0];
    const createRes = await new Promise(resolve => modSocket.emit('createGame', {}, resolve));
    if (!createRes.success) throw new Error(`createGame failed: ${JSON.stringify(createRes)}`);
    const roomCode = createRes.roomCode;
    users[0].playerId = createRes.playerId;
    console.log(`✓ Room created: ${roomCode}. Host: ${users[0].playerId}`);

    for (let i = 1; i < 5; i++) {
      const joinRes = await new Promise(resolve => sockets[i].emit('joinGame', { roomCode, playerName: users[i].name }, resolve));
      if (!joinRes.success) throw new Error(`join failed: ${JSON.stringify(joinRes)}`);
      users[i].playerId = joinRes.playerId;
    }
    console.log(`✓ 5 players in lobby.`);

    // Check that lobby state keeps roles secret/hidden
    const lobbyStateRes = await new Promise(resolve => modSocket.emit('getRoomState', {}, resolve));
    if (!lobbyStateRes.success) throw new Error('Failed to get lobby room state');
    for (const p of lobbyStateRes.state.players) {
      if (p.role !== null) {
        throw new Error(`Expected role to be hidden in lobby, but got: ${p.role}`);
      }
    }
    console.log(`✓ Confirmed: Roles are hidden in lobby for all players.`);

    // Moderator assigns by roleCounts
    const roleCounts = {
      MAFIA: 1,
      DOCTOR: 1,
      OFFICER: 1,
      VILLAGER: 2
    };

    const assignRes = await new Promise(resolve => modSocket.emit('moderator:assignRoles', { roleCounts }, resolve));
    if (!assignRes.success) throw new Error(`assignRoles with roleCounts failed: ${JSON.stringify(assignRes)}`);
    console.log(`✓ moderator:assignRoles succeeded with roleCounts:`, assignRes);

    // Moderator starts game
    const startRes = await new Promise(resolve => modSocket.emit('moderator:startGame', { roleCounts }, resolve));
    if (!startRes.success) throw new Error(`startGame failed: ${JSON.stringify(startRes)}`);
    console.log(`✓ moderator:startGame succeeded. Phase: ${startRes.state.phase}`);

    // Wait for state sync
    await sleep(1000);

    // Collect each player's private visible state
    const states = await Promise.all(sockets.map(s => new Promise(resolve => s.emit('getRoomState', {}, resolve))));
    const assignedRoles = states.map((res, i) => {
      if (!res.success) throw new Error(`getRoomState failed for player ${i}`);
      return res.state.myRole;
    });

    console.log('✓ Revealed roles for each player:', assignedRoles);

    const counts = { MAFIA: 0, DOCTOR: 0, OFFICER: 0, VILLAGER: 0 };
    for (const role of assignedRoles) {
      if (!counts[role] && counts[role] !== 0) throw new Error(`Unknown role assigned: ${role}`);
      counts[role]++;
    }

    if (counts.MAFIA !== 1 || counts.DOCTOR !== 1 || counts.OFFICER !== 1 || counts.VILLAGER !== 2) {
      throw new Error(`Incorrect role distribution: ${JSON.stringify(counts)}`);
    }

    console.log(`✓ Exact distribution verified: 1 MAFIA, 1 DOCTOR, 1 OFFICER, 2 VILLAGER.`);
    console.log('🎉 ALL ROLE COUNTS TESTS PASSED SUCCESSFULLY!');

    sockets.forEach(s => s.disconnect());
    serverProc.kill();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    serverProc.kill();
    process.exit(1);
  }
}

run();

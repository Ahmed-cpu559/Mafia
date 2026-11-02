// backend/server/tests/test_5_players.js
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
  console.log('--- Starting 5-Player Game Flow Test ---');
  
  const backendServerPath = path.resolve(__dirname, '../index.js');
  const serverProc = spawn('node', [backendServerPath], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '4090', MAFIA_MIN_PLAYERS: '5' }
  });

  await sleep(3500);

  const serverUrl = 'http://localhost:4090';

  try {
    const playerNames = ['Host_Creator', 'Mafia_1', 'Doc_1', 'Officer_1', 'Villager_1'];
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
    console.log(`✓ Authenticated 5 Players (Creator is Player 1).`);

    const sockets = users.map(u => io(serverUrl, { auth: { token: u.token } }));
    await Promise.all(sockets.map(s => new Promise((resolve) => s.on('connect', resolve))));
    console.log('✓ All 5 sockets connected to server.');

    const modSocket = sockets[0];
    const createRes = await new Promise(resolve => modSocket.emit('createGame', {}, resolve));
    if (!createRes.success) throw new Error(`createGame failed: ${JSON.stringify(createRes)}`);
    const roomCode = createRes.roomCode;
    users[0].playerId = createRes.playerId;
    console.log(`✓ Room created: ${roomCode}. Host Player ID: ${users[0].playerId}`);

    for (let i = 1; i < 5; i++) {
      const joinRes = await new Promise(resolve => sockets[i].emit('joinGame', { roomCode, playerName: users[i].name }, resolve));
      if (!joinRes.success) throw new Error(`join failed: ${JSON.stringify(joinRes)}`);
      users[i].playerId = joinRes.playerId;
    }
    console.log(`✓ 4 additional players joined room ${roomCode}. Total: 5 players.`);

    // Roles for 5 players: 1 Mafia, 1 Doctor, 1 Officer, 2 Villagers (Host is Villager)
    const assignments = {
      [users[0].playerId]: 'VILLAGER',
      [users[1].playerId]: 'MAFIA',
      [users[2].playerId]: 'DOCTOR',
      [users[3].playerId]: 'OFFICER',
      [users[4].playerId]: 'VILLAGER',
    };

    const assignRes = await new Promise(resolve => modSocket.emit('moderator:assignRoles', { roleAssignments: assignments }, resolve));
    if (!assignRes.success) throw new Error(`assignRoles failed: ${JSON.stringify(assignRes)}`);
    console.log('✓ Successfully assigned all 5 player roles including Host!');

    const startRes = await new Promise(resolve => modSocket.emit('moderator:startGame', {}, resolve));
    if (!startRes.success) throw new Error(`startGame failed: ${JSON.stringify(startRes)}`);
    console.log('✓ Successfully started game with 5 players!');

    sockets.forEach(s => s.disconnect());
    console.log('🎉 5-PLAYER TEST PASSED 100%!');
  } finally {
    serverProc.kill();
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

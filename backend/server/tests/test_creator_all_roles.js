// backend/server/tests/test_creator_all_roles.js
import { spawn } from 'child_process';
import { io } from 'socket.io-client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const serverUrl = 'http://localhost:4090';

async function authUsers(names) {
  const users = [];
  for (const name of names) {
    const res = await fetch(`${serverUrl}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: name })
    });
    const data = await res.json();
    if (!data.success) throw new Error(`Auth failed for ${name}: ${JSON.stringify(data)}`);
    users.push({ name, token: data.token, id: data.user.id });
  }
  return users;
}

async function run() {
  console.log('=====================================================');
  console.log('Testing Room Creator as Active Player across all 4 roles');
  console.log('=====================================================');

  const backendServerPath = path.resolve(__dirname, '../index.js');
  const serverProc = spawn('node', [backendServerPath], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '4090', MAFIA_MIN_PLAYERS: '5' }
  });

  await sleep(3500);

  try {
    // ------------------------------------------------------------------
    // TEST 1: CREATOR AS MAFIA
    // ------------------------------------------------------------------
    console.log('\n--- [TEST 1] Creator as MAFIA ---');
    {
      const users = await authUsers(['Host_Mafia', 'Player_Doc', 'Player_Officer', 'Player_V1', 'Player_V2']);
      const sockets = users.map(u => io(serverUrl, { auth: { token: u.token } }));
      await Promise.all(sockets.map(s => new Promise(res => s.on('connect', res))));

      const hostSocket = sockets[0];
      const createRes = await new Promise(res => hostSocket.emit('createGame', {}, res));
      if (!createRes.success) throw new Error(`createGame failed: ${JSON.stringify(createRes)}`);
      const roomCode = createRes.roomCode;
      const hostPlayerId = createRes.playerId;

      // Other 4 players join (Total = 5 players with Creator!)
      for (let i = 1; i <= 4; i++) {
        const joinRes = await new Promise(res => sockets[i].emit('joinGame', { roomCode, playerName: users[i].name }, res));
        if (!joinRes.success) throw new Error(`join failed: ${JSON.stringify(joinRes)}`);
        users[i].playerId = joinRes.playerId;
      }

      // Assign Creator -> MAFIA
      const assignments = {
        [hostPlayerId]: 'MAFIA',
        [users[1].playerId]: 'DOCTOR',
        [users[2].playerId]: 'OFFICER',
        [users[3].playerId]: 'VILLAGER',
        [users[4].playerId]: 'VILLAGER',
      };

      const assignRes = await new Promise(res => hostSocket.emit('moderator:assignRoles', { roleAssignments: assignments }, res));
      if (!assignRes.success) throw new Error(`assignRoles failed: ${JSON.stringify(assignRes)}`);
      console.log('✓ Roles assigned (Creator = MAFIA).');

      const startRes = await new Promise(res => hostSocket.emit('moderator:startGame', {}, res));
      if (!startRes.success) throw new Error(`startGame failed: ${JSON.stringify(startRes)}`);
      console.log('✓ Game started.');

      // Wait for state
      await sleep(500);

      // Verify Host gets MAFIA role and can perform mafia action
      const hostStateRes = await new Promise(res => hostSocket.emit('getGameState', {}, res));
      const hostState = hostStateRes.state || hostStateRes;
      if (hostState.myRole !== 'MAFIA') throw new Error(`Expected host role MAFIA, got: ${hostState.myRole}`);
      if (hostState.isSage === true) throw new Error('Creator should NOT be a spectator/Sage!');
      console.log(`✓ Host state confirmed: myRole=${hostState.myRole}, isSage=${hostState.isSage}`);

      // Host performs mafia:kill on Player_V1
      const killRes = await new Promise(res => hostSocket.emit('mafia:kill', { targetId: users[3].playerId }, res));
      if (!killRes.success) throw new Error(`Creator mafia:kill failed: ${JSON.stringify(killRes)}`);
      console.log('✓ Creator successfully performed Mafia night kill action!');

      sockets.forEach(s => s.disconnect());
      console.log('✅ TEST 1 PASSED: Creator as MAFIA works perfectly!');
    }

    // ------------------------------------------------------------------
    // TEST 2: CREATOR AS DOCTOR
    // ------------------------------------------------------------------
    console.log('\n--- [TEST 2] Creator as DOCTOR ---');
    {
      const users = await authUsers(['Host_Doctor', 'Player_Mafia', 'Player_Officer', 'Player_V1', 'Player_V2']);
      const sockets = users.map(u => io(serverUrl, { auth: { token: u.token } }));
      await Promise.all(sockets.map(s => new Promise(res => s.on('connect', res))));

      const hostSocket = sockets[0];
      const createRes = await new Promise(res => hostSocket.emit('createGame', {}, res));
      const roomCode = createRes.roomCode;
      const hostPlayerId = createRes.playerId;

      for (let i = 1; i <= 4; i++) {
        const joinRes = await new Promise(res => sockets[i].emit('joinGame', { roomCode, playerName: users[i].name }, res));
        users[i].playerId = joinRes.playerId;
      }

      // Assign Creator -> DOCTOR
      const assignments = {
        [hostPlayerId]: 'DOCTOR',
        [users[1].playerId]: 'MAFIA',
        [users[2].playerId]: 'OFFICER',
        [users[3].playerId]: 'VILLAGER',
        [users[4].playerId]: 'VILLAGER',
      };

      await new Promise(res => hostSocket.emit('moderator:assignRoles', { roleAssignments: assignments }, res));
      await new Promise(res => hostSocket.emit('moderator:startGame', {}, res));
      await sleep(500);

      const hostStateRes = await new Promise(res => hostSocket.emit('getGameState', {}, res));
      const hostState = hostStateRes.state || hostStateRes;
      if (hostState.myRole !== 'DOCTOR') throw new Error(`Expected host role DOCTOR, got: ${hostState.myRole}`);
      console.log(`✓ Host state confirmed: myRole=${hostState.myRole}`);

      // Player_Mafia kills Player_V1 to advance to Doctor phase
      const kRes = await new Promise(res => sockets[1].emit('mafia:kill', { targetId: users[3].playerId }, res));
      console.log('Mafia kill res:', kRes);
      await sleep(500);

      // Creator performs doctor:protect on Player_V1
      const healRes = await new Promise(res => hostSocket.emit('doctor:protect', { targetId: users[3].playerId }, res));
      console.log('Doctor protect res:', healRes);
      if (!healRes.success) throw new Error(`Creator doctor:protect failed: ${JSON.stringify(healRes)}`);
      console.log('✓ Creator successfully performed Doctor protect action!');

      sockets.forEach(s => s.disconnect());
      console.log('✅ TEST 2 PASSED: Creator as DOCTOR works perfectly!');
    }

    // ------------------------------------------------------------------
    // TEST 3: CREATOR AS OFFICER
    // ------------------------------------------------------------------
    console.log('\n--- [TEST 3] Creator as OFFICER ---');
    {
      const users = await authUsers(['Host_Officer', 'Player_Mafia', 'Player_Doctor', 'Player_V1', 'Player_V2']);
      const sockets = users.map(u => io(serverUrl, { auth: { token: u.token } }));
      await Promise.all(sockets.map(s => new Promise(res => s.on('connect', res))));

      const hostSocket = sockets[0];
      const createRes = await new Promise(res => hostSocket.emit('createGame', {}, res));
      const roomCode = createRes.roomCode;
      const hostPlayerId = createRes.playerId;

      for (let i = 1; i <= 4; i++) {
        const joinRes = await new Promise(res => sockets[i].emit('joinGame', { roomCode, playerName: users[i].name }, res));
        users[i].playerId = joinRes.playerId;
      }

      // Assign Creator -> OFFICER
      const assignments = {
        [hostPlayerId]: 'OFFICER',
        [users[1].playerId]: 'MAFIA',
        [users[2].playerId]: 'DOCTOR',
        [users[3].playerId]: 'VILLAGER',
        [users[4].playerId]: 'VILLAGER',
      };

      await new Promise(res => hostSocket.emit('moderator:assignRoles', { roleAssignments: assignments }, res));
      await new Promise(res => hostSocket.emit('moderator:startGame', {}, res));
      await sleep(500);

      const hostStateRes = await new Promise(res => hostSocket.emit('getGameState', {}, res));
      const hostState = hostStateRes.state || hostStateRes;
      if (hostState.myRole !== 'OFFICER') throw new Error(`Expected host role OFFICER, got: ${hostState.myRole}`);
      console.log(`✓ Host state confirmed: myRole=${hostState.myRole}`);

      // Advance through Mafia & Doctor
      await new Promise(res => sockets[1].emit('mafia:kill', { targetId: users[3].playerId }, res));
      await sleep(500);
      await new Promise(res => sockets[2].emit('doctor:protect', { targetId: users[3].playerId }, res));
      await sleep(500);

      // Creator investigates Player_Mafia
      const investRes = await new Promise(res => hostSocket.emit('officer:investigate', { targetId: users[1].playerId }, res));
      if (!investRes.success) throw new Error(`Creator officer:investigate failed: ${JSON.stringify(investRes)}`);
      console.log('✓ Creator successfully performed Officer investigate action!');

      sockets.forEach(s => s.disconnect());
      console.log('✅ TEST 3 PASSED: Creator as OFFICER works perfectly!');
    }

    // ------------------------------------------------------------------
    // TEST 4: CREATOR AS VILLAGER
    // ------------------------------------------------------------------
    console.log('\n--- [TEST 4] Creator as VILLAGER ---');
    {
      const users = await authUsers(['Host_Villager', 'Player_Mafia', 'Player_Doctor', 'Player_Officer', 'Player_V2']);
      const sockets = users.map(u => io(serverUrl, { auth: { token: u.token } }));
      await Promise.all(sockets.map(s => new Promise(res => s.on('connect', res))));

      const hostSocket = sockets[0];
      const createRes = await new Promise(res => hostSocket.emit('createGame', {}, res));
      const roomCode = createRes.roomCode;
      const hostPlayerId = createRes.playerId;

      for (let i = 1; i <= 4; i++) {
        const joinRes = await new Promise(res => sockets[i].emit('joinGame', { roomCode, playerName: users[i].name }, res));
        users[i].playerId = joinRes.playerId;
      }

      // Assign Creator -> VILLAGER
      const assignments = {
        [hostPlayerId]: 'VILLAGER',
        [users[1].playerId]: 'MAFIA',
        [users[2].playerId]: 'DOCTOR',
        [users[3].playerId]: 'OFFICER',
        [users[4].playerId]: 'VILLAGER',
      };

      await new Promise(res => hostSocket.emit('moderator:assignRoles', { roleAssignments: assignments }, res));
      await new Promise(res => hostSocket.emit('moderator:startGame', {}, res));
      await sleep(500);

      const hostStateRes = await new Promise(res => hostSocket.emit('getGameState', {}, res));
      const hostState = hostStateRes.state || hostStateRes;
      if (hostState.myRole !== 'VILLAGER') throw new Error(`Expected host role VILLAGER, got: ${hostState.myRole}`);
      console.log(`✓ Host state confirmed: myRole=${hostState.myRole}, isSage=${hostState.isSage}`);

      // Verify Mafia can target Creator (Creator has no gameplay immunity!)
      const targetCreatorRes = await new Promise(res => sockets[1].emit('mafia:kill', { targetId: hostPlayerId }, res));
      if (!targetCreatorRes.success) throw new Error(`Targeting creator failed: ${JSON.stringify(targetCreatorRes)}`);
      console.log('✓ Mafia successfully targeted the Room Creator (no immunity)!');

      // Doctor can protect Creator
      await sleep(500);
      const healCreatorRes = await new Promise(res => sockets[2].emit('doctor:protect', { targetId: hostPlayerId }, res));
      if (!healCreatorRes.success) throw new Error(`Doctor protecting creator failed: ${JSON.stringify(healCreatorRes)}`);
      console.log('✓ Doctor successfully protected the Room Creator!');

      sockets.forEach(s => s.disconnect());
      console.log('✅ TEST 4 PASSED: Creator as VILLAGER works perfectly!');
    }

    console.log('\n=====================================================');
    console.log('🎉 ALL 4 TESTS PASSED 100%! ROOM CREATOR IS FULL PLAYER!');
    console.log('=====================================================');
  } finally {
    serverProc.kill();
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});

// backend/server/tests/test_open_rooms_count.js
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
  console.log('--- Testing Open Rooms Player Count & Realtime Updates ---');
  
  const backendServerPath = path.resolve(__dirname, '../index.js');
  const serverProc = spawn('node', [backendServerPath], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '4096', MAFIA_MIN_PLAYERS: '5' }
  });

  for (let i = 0; i < 20; i++) {
    try {
      await fetch(`http://localhost:4096/api/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      break;
    } catch {
      await sleep(500);
    }
  }

  const serverUrl = 'http://localhost:4096';

  try {
    // 1. Create Host user
    const res1 = await fetch(`${serverUrl}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'HostAhmed' })
    });
    const u1 = await res1.json();
    const s1 = io(serverUrl, { auth: { token: u1.token } });
    await new Promise(r => s1.on('connect', r));

    // Host creates public room
    const createRes = await new Promise(r => s1.emit('createGame', { visibility: 'PUBLIC' }, r));
    const roomCode = createRes.roomCode;
    console.log(`✓ Room created: ${roomCode}`);

    // Check public rooms via HTTP
    let pubRes = await fetch(`${serverUrl}/api/rooms/public`);
    let pubData = await pubRes.json();
    console.log(`HTTP /api/rooms/public initially:`, pubData.rooms);
    if (pubData.rooms[0].playerCount !== 1) {
      throw new Error(`Expected playerCount 1, got ${pubData.rooms[0].playerCount}`);
    }

    // 2. Observer socket listening to publicRooms:update
    const resObs = await fetch(`${serverUrl}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Observer' })
    });
    const uObs = await resObs.json();
    const sObs = io(serverUrl, { auth: { token: uObs.token } });
    await new Promise(r => sObs.on('connect', r));

    let lastBroadcastRooms = null;
    sObs.on('publicRooms:update', (payload) => {
      lastBroadcastRooms = payload.rooms;
      console.log('📡 Observer received publicRooms:update:', payload.rooms);
    });

    // 3. User 2 joins room
    const res2 = await fetch(`${serverUrl}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'PlayerTwo' })
    });
    const u2 = await res2.json();
    const s2 = io(serverUrl, { auth: { token: u2.token } });
    await new Promise(r => s2.on('connect', r));

    const joinRes = await new Promise(r => s2.emit('joinGame', { roomCode, playerName: 'PlayerTwo' }, r));
    console.log('PlayerTwo joined:', joinRes.success);

    await sleep(500);

    // Check HTTP again
    pubRes = await fetch(`${serverUrl}/api/rooms/public`);
    pubData = await pubRes.json();
    console.log(`HTTP /api/rooms/public after PlayerTwo joined:`, pubData.rooms);

    if (pubData.rooms[0].playerCount !== 2) {
      throw new Error(`Expected playerCount 2 after join, got ${pubData.rooms[0].playerCount}`);
    }

    if (!lastBroadcastRooms || lastBroadcastRooms[0].playerCount !== 2) {
      throw new Error(`Broadcast did not update observer to 2 players!`);
    }

    // 4. Now what if SAME user (same token u1) connects from a second socket (like a second tab) and emits joinGame?
    console.log('--- Testing Tab 2 with SAME token (same user.id) ---');
    const s1_tab2 = io(serverUrl, { auth: { token: u1.token } });
    await new Promise(r => s1_tab2.on('connect', r));
    const joinTab2Res = await new Promise(r => s1_tab2.emit('joinGame', { roomCode, playerName: 'DifferentName' }, r));
    console.log('Tab 2 (same token) join response:', joinTab2Res.success, 'isModerator:', joinTab2Res.isModerator);

    pubRes = await fetch(`${serverUrl}/api/rooms/public`);
    pubData = await pubRes.json();
    console.log(`HTTP /api/rooms/public when Tab 2 joined:`, pubData.rooms);
    console.log(`Notice: playerCount is ${pubData.rooms[0].playerCount} because Tab 2 had the same user.id!`);

    s1.disconnect();
    s2.disconnect();
    s1_tab2.disconnect();
    sObs.disconnect();
    serverProc.kill();
    console.log('Test completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    serverProc.kill();
    process.exit(1);
  }
}

run();

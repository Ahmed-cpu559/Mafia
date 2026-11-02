// frontend/src/ui/home.js
import { showToast, renderRoleBadge, playSound } from "./components.js";
import { t } from "../i18n.js";

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const MIN_PLAYERS = 5;
const DEFAULT_MAX_PLAYERS = 10;

const ROOM_VISIBILITIES = Object.freeze({ PUBLIC: "PUBLIC", PRIVATE: "PRIVATE", INVITE_ONLY: "INVITE_ONLY" });

const GAME_ROLES = Object.freeze({ MAFIA: "MAFIA", DOCTOR: "DOCTOR", OFFICER: "OFFICER", VILLAGER: "VILLAGER" });

const ROLE_ORDER = Object.freeze([GAME_ROLES.MAFIA, GAME_ROLES.DOCTOR, GAME_ROLES.OFFICER, GAME_ROLES.VILLAGER]);

const PUBLIC_ROOM_PHASES = new Set(["LOBBY", "WAITING"]);

const LOBBY_PHASES = new Set(["LOBBY", "WAITING", "ROLE_ASSIGNMENT"]);

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Escape dynamic values before inserting them into innerHTML.
 * This is important because player names / room data come from
 * the server and must never be treated as trusted HTML.
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeRole(role) {
  const normalized = String(role || "")
    .trim()
    .toUpperCase();

  if (normalized === "CITIZEN") {
    return GAME_ROLES.VILLAGER;
  }

  return normalized;
}

function normalizeRoomCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function getServerUrl() {
  return String(import.meta.env.VITE_SERVER_URL || "").replace(/\/+$/, "");
}

function getApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getServerUrl()}${normalizedPath}`;
}

function getAuthToken(app) {
  return app?.token || sessionStorage.getItem("mafia_auth_token") || localStorage.getItem("mafia_auth_token") || "";
}

function getCurrentSessionToken() {
  return sessionStorage.getItem("mafia_session_token") || "";
}

function isSocketReady(app) {
  return Boolean(app?.socket && app.socket.connected !== false);
}

function createRoleAssignmentsStore(existing) {
  const store = Object.create(null);

  if (existing && typeof existing === "object") {
    Object.entries(existing).forEach(([playerId, role]) => {
      const normalizedRole = normalizeRole(role);

      if (playerId && ROLE_ORDER.includes(normalizedRole)) {
        store[playerId] = normalizedRole;
      }
    });
  }

  return store;
}

function clearSetupSync(app) {
  if (app?._setupSyncInterval) {
    clearInterval(app._setupSyncInterval);
    app._setupSyncInterval = null;
  }
}

function clearPublicRoomsRequest(app) {
  if (app?._publicRoomsInterval) {
    try {
      clearInterval(app._publicRoomsInterval);
    } catch {
      // Ignore clear error.
    }
    app._publicRoomsInterval = null;
  }

  if (app?._publicRoomsController) {
    try {
      app._publicRoomsController.abort();
    } catch {
      // Ignore abort errors.
    }

    app._publicRoomsController = null;
  }

  if (app?.socket && app._onPublicRoomsUpdate) {
    try {
      app.socket.off("publicRooms:update", app._onPublicRoomsUpdate);
    } catch {
      // Ignore cleanup error.
    }
    app._onPublicRoomsUpdate = null;
  }
}

function setButtonLoading(button, loadingText) {
  if (!button) {
    return;
  }

  button.disabled = true;
  button.dataset.originalText = button.dataset.originalText || button.innerText;

  button.innerText = loadingText;
}

function restoreButton(button, fallbackText) {
  if (!button) {
    return;
  }

  button.disabled = false;
  button.innerText = button.dataset.originalText || fallbackText;
  delete button.dataset.originalText;
}

/**
 * Socket.IO style acknowledgement helper.
 * Existing project uses callback-based socket emits, so keep
 * that architecture but add timeout + connection validation.
 */
function emitWithAck(app, eventName, payload = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!isSocketReady(app)) {
      reject(new Error("Realtime connection is unavailable."));
      return;
    }

    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(`No response received for socket event: ${eventName}`));
    }, timeoutMs);

    try {
      app.socket.emit(eventName, payload, (response) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timer);

        resolve(response || {});
      });
    } catch (error) {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * Used for optional realtime events where the current backend
 * may not return an acknowledgement.
 */
function emitSocketEvent(app, eventName, payload = {}, callback) {
  if (!isSocketReady(app)) {
    return false;
  }

  try {
    if (typeof callback === "function") {
      app.socket.emit(eventName, payload, callback);
    } else {
      app.socket.emit(eventName, payload);
    }

    return true;
  } catch (error) {
    console.error(`[SOCKET][${eventName}]`, error);
    return false;
  }
}

async function parseJsonResponse(response) {
  const rawText = await response.text();

  let data = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { success: false, message_EN: rawText };
    }
  }

  if (!response.ok) {
    const error = new Error(data?.message_EN || data?.message || data?.error || `Request failed with status ${response.status}`);

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

function sanitizeDisplayName(name) {
  const normalized = String(name || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized) {
    return `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
  }

  return normalized.slice(0, 24);
}

function calculateRoleRules(playerCount) {
  const minMafia = playerCount <= 5 ? 1 : 2;

  const maxMafia = Math.max(minMafia, Math.floor(playerCount / 2.5));

  return { minMafia, maxMafia, exactDoctors: 1, exactOfficers: 1 };
}

function getRecommendedRoleCounts(playerCount) {
  const minMafia = playerCount <= 5 ? 1 : 2;
  const maxMafia = Math.max(minMafia, Math.floor(playerCount / 2.5));
  const mafia = Math.min(maxMafia, Math.max(minMafia, Math.floor(playerCount / 3)));
  const doctor = 1;
  const officer = 1;
  const villager = Math.max(0, playerCount - mafia - doctor - officer);
  return {
    [GAME_ROLES.MAFIA]: mafia,
    [GAME_ROLES.DOCTOR]: doctor,
    [GAME_ROLES.OFFICER]: officer,
    [GAME_ROLES.VILLAGER]: villager
  };
}

function validateRoleCounts(playerCount, roleCounts) {
  const rules = calculateRoleRules(playerCount);
  const counts = {
    [GAME_ROLES.MAFIA]: Number(roleCounts?.[GAME_ROLES.MAFIA] || 0),
    [GAME_ROLES.DOCTOR]: Number(roleCounts?.[GAME_ROLES.DOCTOR] || 0),
    [GAME_ROLES.OFFICER]: Number(roleCounts?.[GAME_ROLES.OFFICER] || 0),
    [GAME_ROLES.VILLAGER]: Number(roleCounts?.[GAME_ROLES.VILLAGER] || 0)
  };

  let valid = true;
  let message = "";

  if (playerCount < MIN_PLAYERS) {
    valid = false;
    message = `⚠ ${t("Need at least 5 players to start")} (${t("currently")} ${playerCount}). ${t("Invite more friends!")}`;
  } else if (counts[GAME_ROLES.MAFIA] < rules.minMafia) {
    valid = false;
    message = `⚠ ${t("At least")} ${rules.minMafia} ${t("Mafia required.")}`;
  } else if (counts[GAME_ROLES.MAFIA] > rules.maxMafia) {
    valid = false;
    message = `⚠ ${t("Maximum Mafia count is")} ${rules.maxMafia}.`;
  } else if (counts[GAME_ROLES.DOCTOR] !== rules.exactDoctors) {
    valid = false;
    message = `⚠ ${t("Exactly 1 Doctor is required.")}`;
  } else if (counts[GAME_ROLES.OFFICER] !== rules.exactOfficers) {
    valid = false;
    message = `⚠ ${t("Exactly 1 Officer is required.")}`;
  } else if (counts[GAME_ROLES.MAFIA] + counts[GAME_ROLES.DOCTOR] + counts[GAME_ROLES.OFFICER] + counts[GAME_ROLES.VILLAGER] !== playerCount) {
    valid = false;
    message = `⚠ ${t("Total roles must equal player count.")}`;
  } else if (counts[GAME_ROLES.VILLAGER] < 0) {
    valid = false;
    message = `⚠ ${t("Special roles exceed player count.")}`;
  } else {
    valid = true;
    message = `✓ ${t("Balanced setup:")} ${counts[GAME_ROLES.MAFIA]} ${t("Mafia")}, ${counts[GAME_ROLES.DOCTOR]} ${t("Doctor")}, ${counts[GAME_ROLES.OFFICER]} ${t("Officer")}, ${counts[GAME_ROLES.VILLAGER]} ${t("Villagers")}. ${t("Roles will be randomized secretly at game start!")}`;
  }

  return { valid, message, counts, totalAssigned: counts[GAME_ROLES.MAFIA] + counts[GAME_ROLES.DOCTOR] + counts[GAME_ROLES.OFFICER] + counts[GAME_ROLES.VILLAGER], ...rules };
}

function validateRoleAssignments(players, roleAssignments) {
  const safePlayers = Array.isArray(players) ? players : [];
  const assignments = roleAssignments || {};

  const counts = { [GAME_ROLES.MAFIA]: 0, [GAME_ROLES.DOCTOR]: 0, [GAME_ROLES.OFFICER]: 0, [GAME_ROLES.VILLAGER]: 0 };

  let totalAssigned = 0;

  safePlayers.forEach((player) => {
    const role = normalizeRole(assignments[player.id]);

    if (ROLE_ORDER.includes(role)) {
      counts[role] += 1;
      totalAssigned += 1;
    }
  });

  const playerCount = safePlayers.length;
  const rules = calculateRoleRules(playerCount);

  let valid = true;
  let message = "";

  if (playerCount < MIN_PLAYERS) {
    valid = false;

    message = `⚠ Need at least ${MIN_PLAYERS} players to start ` + `(currently ${playerCount}). Invite more friends!`;
  } else if (totalAssigned < playerCount) {
    valid = false;

    const missing = playerCount - totalAssigned;

    message = `⚠ ${missing} player${missing === 1 ? "" : "s"} ` + `${missing === 1 ? "still needs" : "still need"} ` + `a role assigned.`;
  } else if (counts[GAME_ROLES.MAFIA] < rules.minMafia) {
    valid = false;

    message = `⚠ At least ${rules.minMafia} Mafia ` + `player${rules.minMafia === 1 ? " is" : "s are"} required.`;
  } else if (counts[GAME_ROLES.MAFIA] > rules.maxMafia) {
    valid = false;

    message = `⚠ For ${playerCount} players, maximum Mafia count is ${rules.maxMafia}.`;
  } else if (counts[GAME_ROLES.DOCTOR] !== rules.exactDoctors) {
    valid = false;

    message = `⚠ Exactly 1 Doctor is required ` + `(currently ${counts[GAME_ROLES.DOCTOR]}).`;
  } else if (counts[GAME_ROLES.OFFICER] !== rules.exactOfficers) {
    valid = false;

    message = `⚠ Exactly 1 Officer is required ` + `(currently ${counts[GAME_ROLES.OFFICER]}).`;
  } else {
    message = `✓ Valid distribution — all ${playerCount} players assigned. Ready to start!`;
  }

  return { valid, message, counts, totalAssigned, ...rules };
}

function getPlayerName(player) {
  return player?.name || player?.displayName || player?.username || "Player";
}

function isPlayerOnline(player) {
  return Boolean(player?.isOnline ?? player?.online ?? player?.connected ?? true);
}

function getModeratorId(state) {
  return state?.moderatorId || state?.sageId || null;
}

function isModeratorPlayer(player, state) {
  const moderatorId = getModeratorId(state);

  return Boolean(player?.isModerator || (moderatorId && player?.id === moderatorId));
}

function isModeratorState(state) {
  return Boolean(state?.isModerator ?? state?.isSage ?? false);
}

function goToAdmin(app) {
  window.history.pushState({}, "", "/admin");

  app.screen = "admin";
  app.render();
}

function clearRoomSession(app) {
  clearSetupSync(app);

  if (app?._publicRoomsController) {
    clearPublicRoomsRequest(app);
  }

  try {
    if (isSocketReady(app)) {
      emitSocketEvent(app, "leaveGame");
    }
  } catch {
    // Ignore leave errors during navigation.
  }

  sessionStorage.removeItem("mafia_session_token");

  sessionStorage.removeItem("mafia_room_code");

  app.gameState = null;
  app.roleAssignments = Object.create(null);
  app._roleAssignmentRoomCode = null;
}

async function copyText(text) {
  const value = String(text || "");

  if (!value) {
    return false;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Use legacy fallback below.
  }

  try {
    const textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.setAttribute("readonly", "");

    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);

    textarea.select();

    const success = document.execCommand("copy");

    textarea.remove();

    return success;
  } catch {
    return false;
  }
}

async function copyRoomCode(code) {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    return;
  }

  const copied = await copyText(normalizedCode);

  if (copied) {
    showToast("Room Code copied to clipboard!", "success");

    playSound("tick");
  } else {
    showToast(normalizedCode, "info");
  }
}

async function shareRoomCode(code) {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    return;
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Join my Mafia Game!", text: `Join my Mafia game with room code: ${normalizedCode}`, url: window.location.href });

      return;
    } catch {
      // User cancelled share or browser rejected it.
    }
  }

  await copyRoomCode(normalizedCode);
}

/* ═══════════════════════════════════════════════════════════════
   LOGIN SCREEN
   ═══════════════════════════════════════════════════════════════ */

export function renderLogin(container, app) {
  container.innerHTML = `
    <div class="home fade-in">
      <div style="text-align:center;margin-bottom:24px;">
        <div
          style="
            font-size:54px;
            margin-bottom:8px;
            filter:drop-shadow(0 0 20px rgba(239,68,68,.4));
          "
          aria-hidden="true"
        >
          🔪
        </div>

        <h1
          class="home__logo"
          style="letter-spacing:.2em;margin-bottom:8px;"
        >
          MAFIA
        </h1>

        <p
          class="home__subtitle"
          style="
            max-width:440px;
            margin:0 auto;
            color:var(--text-secondary);
            font-size:14px;
          "
        >
          ${escapeHtml(t("A social deduction game of hidden roles, secret kills, and village justice."))}
        </p>
      </div>

      <div
        class="home__actions"
        style="
          display:flex;
          flex-direction:column;
          gap:20px;
          align-items:center;
        "
      >
        <div
          class="card"
          style="
            width:100%;
            max-width:420px;
            padding:28px 24px;
            background:rgba(18,20,32,.9);
            backdrop-filter:blur(16px);
            border:1px solid rgba(255,255,255,.08);
            box-shadow:0 20px 40px rgba(0,0,0,.6);
          "
        >
          <h3
            style="
              margin-bottom:20px;
              text-align:center;
              font-size:18px;
              font-weight:800;
              letter-spacing:.05em;
            "
          >
            ${escapeHtml(t("Login to Play"))}
          </h3>

          <button
            class="btn btn--secondary btn--block mb-4"
            id="google-login-btn"
            type="button"
            data-action="google-login"
            style="
              display:flex;
              align-items:center;
              justify-content:center;
              gap:10px;
              font-weight:700;
              height:46px;
            "
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z"/>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
              <path fill="#FBBC05" d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.4 0-.9.2-1.7.4-2.4L1.6 7c-.8 1.6-1.2 3.4-1.2 5.3s.4 3.7 1.2 5.3l3.7-2.9z"/>
              <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z"/>
            </svg>

            ${escapeHtml(t("Continue with Google"))}
          </button>

          <div
            style="
              display:flex;
              align-items:center;
              margin:20px 0;
              color:var(--text-muted);
              font-size:12px;
            "
          >
            <div
              style="
                flex:1;
                height:1px;
                background:rgba(255,255,255,.1);
              "
            ></div>

            <span
              style="
                padding:0 12px;
                text-transform:uppercase;
                letter-spacing:.1em;
                font-weight:600;
              "
            >
              ${escapeHtml(t("Or play as guest"))}
            </span>

            <div
              style="
                flex:1;
                height:1px;
                background:rgba(255,255,255,.1);
              "
            ></div>
          </div>

          <div class="form-group mb-4">
            <input
              type="text"
              id="guest-name"
              placeholder="${escapeHtml(t("Your Name"))}"
              maxlength="24"
              autocomplete="nickname"
              style="
                width:100%;
                padding:12px 14px;
                border-radius:8px;
                border:1px solid rgba(255,255,255,.15);
                background:rgba(0,0,0,.5);
                color:#fff;
                font-size:14px;
              "
            />
          </div>

          <button
            class="btn btn--primary btn--block"
            id="guest-login-btn"
            type="button"
            data-action="guest-login"
            style="
              font-weight:700;
              height:46px;
            "
          >
            👤 ${escapeHtml(t("Play as Guest"))}
          </button>

          <div
            style="
              margin-top:18px;
              text-align:center;
            "
          >
            <button
              type="button"
              data-action="admin-login"
              style="
                border:0;
                background:transparent;
                font-size:11px;
                color:var(--text-muted);
                text-decoration:none;
                opacity:.6;
                cursor:pointer;
              "
            >
              🛡️ Admin Operations Portal
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  /* -------------------------------------------
     LOGIN EVENT DELEGATION
     ------------------------------------------- */

  container.onclick = async (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;

    if (!target) {
      return;
    }

    const action = target.dataset.action;

    if (action === "google-login") {
      window.location.href = getApiUrl("/api/auth/google");
      return;
    }

    if (action === "admin-login") {
      goToAdmin(app);
      return;
    }

    if (action !== "guest-login") {
      return;
    }

    const input = container.querySelector("#guest-name");

    const button = container.querySelector("#guest-login-btn");

    const name = sanitizeDisplayName(input?.value);

    setButtonLoading(button, "Entering...");

    try {
      const response = await fetch(getApiUrl("/api/auth/guest"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name }) });

      const data = await parseJsonResponse(response);

      if (!data?.success || !data?.token) {
        throw new Error(data?.message_EN || data?.message || data?.error || "Login failed.");
      }

      sessionStorage.setItem("mafia_auth_token", data.token);

      app.token = data.token;

      app.userName = data.user?.displayName || data.user?.name || name;

      showToast(`Welcome, ${app.userName}!`, "success");

      if (typeof app.connectSocket === "function") {
        app.connectSocket();
      } else {
        showToast("Login successful, but realtime connection is unavailable.", "warning");
      }
    } catch (error) {
      console.error("[AUTH][GUEST]", error);

      showToast(error?.message || "Network error connecting to auth server.", "error");

      restoreButton(button, `👤 ${t("Play as Guest")}`);
    }
  };

  container.onkeydown = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    const target = event.target;

    if (target instanceof HTMLInputElement && target.id === "guest-name") {
      event.preventDefault();

      const button = container.querySelector("#guest-login-btn");

      button?.click();
    }
  };

  /* -------------------------------------------
     BACKWARD COMPATIBILITY
     ------------------------------------------- */

  window._guestLogin = async () => {
    const button = container.querySelector("#guest-login-btn");

    button?.click();
  };
}

/* ═══════════════════════════════════════════════════════════════
   HOME SCREEN
   ═══════════════════════════════════════════════════════════════ */

export function renderHome(container, app) {
  const userName = app.userName || app.user?.displayName || app.user?.name || "Detective";

  app.roomVisibility = Object.values(ROOM_VISIBILITIES).includes(app.roomVisibility) ? app.roomVisibility : ROOM_VISIBILITIES.PUBLIC;

  clearPublicRoomsRequest(app);

  container.innerHTML = `
    <div class="home fade-in">
      <div style="text-align:center;margin-bottom:24px;">
        <div
          style="font-size:48px;margin-bottom:6px;"
          aria-hidden="true"
        >
          🎭
        </div>

        <h1
          class="home__logo"
          style="letter-spacing:.15em;margin-bottom:6px;"
        >
          MAFIA
        </h1>

        <p
          class="home__subtitle"
          style="
            max-width:460px;
            margin:0 auto;
            font-size:14px;
          "
        >
          ${escapeHtml(t("A social deduction game of hidden roles, secret kills, and village justice."))}
        </p>
      </div>

      <div
        class="home__actions"
        style="
          display:flex;
          flex-direction:column;
          gap:20px;
          align-items:center;
        "
      >

        <!-- USER BAR -->
        <div
          style="
            width:100%;
            max-width:440px;
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:12px;
            background:rgba(255,255,255,.04);
            padding:10px 16px;
            border-radius:12px;
            border:1px solid rgba(255,255,255,.06);
          "
        >
          <div
            style="
              display:flex;
              align-items:center;
              gap:8px;
              min-width:0;
            "
          >
            <div
              style="
                width:32px;
                height:32px;
                flex:none;
                border-radius:50%;
                background:var(--sage-bg);
                border:1px solid var(--sage);
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:14px;
              "
              aria-hidden="true"
            >
              👤
            </div>

            <span
              style="
                font-weight:700;
                font-size:14px;
                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;
              "
            >
              ${escapeHtml(userName)}
            </span>
          </div>

          <div
            style="
              display:flex;
              align-items:center;
              gap:8px;
              flex:none;
            "
          >
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              data-action="admin"
              style="
                font-size:12px;
                color:#818cf8;
                font-weight:700;
              "
            >
              🛡️ Ops
            </button>

            <button
              type="button"
              class="btn btn--ghost btn--sm"
              data-action="switch-user"
              style="
                font-size:12px;
                color:var(--text-muted);
              "
            >
              🔄 ${escapeHtml(t("Switch User"))}
            </button>
          </div>
        </div>

        <!-- CREATE ROOM -->
        <div
          class="card"
          style="
            width:100%;
            max-width:440px;
            padding:24px;
            background:rgba(18,20,32,.85);
            border:1px solid rgba(255,255,255,.08);
            box-shadow:0 12px 30px rgba(0,0,0,.5);
          "
        >
          <div
            style="
              display:flex;
              align-items:center;
              gap:12px;
              margin-bottom:12px;
            "
          >
            <div
              style="font-size:28px;"
              aria-hidden="true"
            >
              👑
            </div>

            <div>
              <h3
                style="
                  font-size:18px;
                  font-weight:800;
                  margin:0;
                "
              >
                ${escapeHtml(t("Host a Game"))}
              </h3>

              <p
                style="
                  font-size:12px;
                  color:var(--text-muted);
                  margin:0;
                "
              >
                ${escapeHtml(t("Create a room and become the Moderator"))}
              </p>
            </div>
          </div>

          <div
            style="
              display:flex;
              gap:8px;
              margin-bottom:12px;
            "
          >
            <button
              class="visibility-btn"
              type="button"
              data-action="set-visibility"
              data-visibility="PUBLIC"
              id="vis-PUBLIC"
              style="
                flex:1;
                padding:8px 4px;
                border-radius:8px;
                border:1px solid rgba(255,255,255,.15);
                font-size:11px;
                font-weight:700;
                cursor:pointer;
                transition:all .2s;
              "
            >
              🌍 Public
            </button>

            <button
              class="visibility-btn"
              type="button"
              data-action="set-visibility"
              data-visibility="PRIVATE"
              id="vis-PRIVATE"
              style="
                flex:1;
                padding:8px 4px;
                border-radius:8px;
                border:1px solid rgba(255,255,255,.08);
                background:rgba(0,0,0,.3);
                color:var(--text-muted);
                font-size:11px;
                font-weight:700;
                cursor:pointer;
                transition:all .2s;
              "
            >
              🔒 Private
            </button>

            <button
              class="visibility-btn"
              type="button"
              data-action="set-visibility"
              data-visibility="INVITE_ONLY"
              id="vis-INVITE_ONLY"
              style="
                flex:1;
                padding:8px 4px;
                border-radius:8px;
                border:1px solid rgba(255,255,255,.08);
                background:rgba(0,0,0,.3);
                color:var(--text-muted);
                font-size:11px;
                font-weight:700;
                cursor:pointer;
                transition:all .2s;
              "
            >
              🔗 Invite Only
            </button>
          </div>

          <div
            id="visibility-hint"
            style="
              font-size:11px;
              color:var(--text-muted);
              margin-bottom:12px;
              min-height:16px;
              padding:0 2px;
            "
          >
          </div>

          <button
            class="btn btn--primary btn--block"
            id="create-game-btn"
            type="button"
            data-action="create-game"
            style="
              font-weight:700;
              height:46px;
              margin-top:4px;
            "
          >
            🎭 ${escapeHtml(t("Create Room"))}
          </button>
        </div>

        <!-- JOIN ROOM -->
        <div
          class="card"
          style="
            width:100%;
            max-width:440px;
            padding:24px;
            background:rgba(18,20,32,.85);
            border:1px solid rgba(255,255,255,.08);
            box-shadow:0 12px 30px rgba(0,0,0,.5);
          "
        >
          <div
            style="
              display:flex;
              align-items:center;
              gap:12px;
              margin-bottom:16px;
            "
          >
            <div
              style="font-size:28px;"
              aria-hidden="true"
            >
              🚪
            </div>

            <div>
              <h3
                style="
                  font-size:18px;
                  font-weight:800;
                  margin:0;
                "
              >
                ${escapeHtml(t("Join Game"))}
              </h3>

              <p
                style="
                  font-size:12px;
                  color:var(--text-muted);
                  margin:0;
                "
              >
                ${escapeHtml(t("Enter a room code provided by the host"))}
              </p>
            </div>
          </div>

          <input
            type="text"
            id="join-name"
            placeholder="${escapeHtml(t("Display Name (Optional)"))}"
            maxlength="24"
            autocomplete="nickname"
            class="mb-3"
            style="
              width:100%;
              padding:10px 14px;
              border-radius:8px;
              border:1px solid rgba(255,255,255,.15);
              background:rgba(0,0,0,.4);
              color:#fff;
              font-size:14px;
            "
          />

          <input
            type="text"
            id="join-code"
            placeholder="${escapeHtml(t("ROOM CODE (e.g. ABC123)"))}"
            maxlength="10"
            inputmode="text"
            autocomplete="off"
            class="mb-4"
            style="
              text-transform:uppercase;
              letter-spacing:.15em;
              font-family:var(--font-display);
              font-weight:800;
              text-align:center;
              font-size:20px;
              width:100%;
              padding:12px;
              border-radius:8px;
              border:1px solid rgba(255,255,255,.2);
              background:rgba(0,0,0,.5);
              color:var(--sage);
            "
          />

          <button
            class="btn btn--secondary btn--block"
            id="join-game-btn"
            type="button"
            data-action="join-game"
            style="
              font-weight:700;
              height:46px;
            "
          >
            🚪 ${escapeHtml(t("Join Room"))}
          </button>
        </div>

        <!-- PUBLIC ROOMS -->
        <div
          class="card"
          style="
            width:100%;
            max-width:440px;
            padding:24px;
            background:rgba(18,20,32,.85);
            border:1px solid rgba(255,255,255,.08);
            box-shadow:0 12px 30px rgba(0,0,0,.5);
          "
        >
          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:12px;
              margin-bottom:14px;
            "
          >
            <div
              style="
                display:flex;
                align-items:center;
                gap:10px;
              "
            >
              <span
                style="font-size:22px;"
                aria-hidden="true"
              >
                🌍
              </span>

              <h3
                style="
                  font-size:16px;
                  font-weight:800;
                  margin:0;
                "
              >
                ${escapeHtml(t("Open Rooms"))}
              </h3>
            </div>

            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-action="refresh-public-rooms"
              style="
                font-size:11px;
                font-weight:700;
              "
            >
              🔄 Refresh
            </button>
          </div>

          <div
            id="public-rooms-list"
            style="
              min-height:64px;
              display:flex;
              align-items:center;
              justify-content:center;
            "
          >
            <span
              style="
                color:var(--text-muted);
                font-size:13px;
              "
            >
              Loading open rooms...
            </span>
          </div>
        </div>
      </div>
    </div>
  `;

  /* -------------------------------------------
     VISIBILITY UI
     ------------------------------------------- */

  const visibilityHints = {
    PUBLIC: "Anyone can discover and join this room while it is open.",

    PRIVATE: "Hidden from the room browser. Players need your room code to join.",

    INVITE_ONLY: "Only players with your invite link or QR code can join."
  };

  const updateVisibilityUI = () => {
    const visibility = app.roomVisibility;

    container.querySelectorAll(".visibility-btn").forEach((button) => {
      const active = button.dataset.visibility === visibility;

      button.style.background = active ? "rgba(99,102,241,.25)" : "rgba(0,0,0,.3)";

      button.style.borderColor = active ? "rgba(99,102,241,.5)" : "rgba(255,255,255,.08)";

      button.style.color = active ? "#a5b4fc" : "var(--text-muted)";
    });

    const hint = container.querySelector("#visibility-hint");

    if (hint) {
      hint.textContent = visibilityHints[visibility] || "";
    }
  };

  updateVisibilityUI();

  /* -------------------------------------------
     CREATE ROOM
     ------------------------------------------- */

  const createGame = async () => {
    const button = container.querySelector("#create-game-btn");

    setButtonLoading(button, "Creating room...");

    try {
      const response = await emitWithAck(app, "createGame", { visibility: app.roomVisibility || ROOM_VISIBILITIES.PUBLIC });

      if (!response?.success) {
        throw new Error(response?.message_EN || response?.message || response?.error || "Failed to create room.");
      }

      const roomCode = normalizeRoomCode(response.roomCode);

      if (!roomCode) {
        throw new Error("Room was created but no room code was returned.");
      }

      sessionStorage.setItem("mafia_session_token", response.sessionToken || "");

      sessionStorage.setItem("mafia_room_code", roomCode);

      app.gameState = response.state || { code: roomCode, players: [], phase: "LOBBY" };

      app.roleAssignments = Object.create(null);

      app._roleAssignmentRoomCode = roomCode;

      app.screen = "setup";

      playSound("win");

      showToast(`Room created: ${roomCode}`, "success");

      app.render();
    } catch (error) {
      console.error("[ROOM][CREATE]", error);

      restoreButton(button, `🎭 ${t("Create Room")}`);

      showToast(error?.message || "Failed to create room.", "error");
    }
  };

  /* -------------------------------------------
     JOIN ROOM
     ------------------------------------------- */

  const joinGame = async () => {
    const codeInput = container.querySelector("#join-code");

    const nameInput = container.querySelector("#join-name");

    const code = normalizeRoomCode(codeInput?.value);

    const playerName = sanitizeDisplayName(nameInput?.value);

    if (!code) {
      showToast("Please enter a room code.", "warning");

      codeInput?.focus();
      return;
    }

    if (code.length < 4) {
      showToast("The room code is too short.", "warning");

      codeInput?.focus();
      return;
    }

    const button = container.querySelector("#join-game-btn");

    setButtonLoading(button, "Joining...");

    try {
      const enteredName = String(nameInput?.value || "").trim();
      if (enteredName && enteredName !== app.userName) {
        try {
          const authRes = await fetch(getApiUrl("/api/auth/guest"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ displayName: enteredName })
          });
          const authData = await parseJsonResponse(authRes);
          if (authData?.success && authData?.token) {
            sessionStorage.setItem("mafia_auth_token", authData.token);
            app.token = authData.token;
            app.userName = authData.user?.displayName || enteredName;
            if (app.socket) {
              app.socket.auth = { token: authData.token };
              app.socket.disconnect().connect();
              await new Promise((resolve) => setTimeout(resolve, 250));
            }
          }
        } catch (authErr) {
          console.warn("[JOIN] Guest auth profile update failed:", authErr);
        }
      }

      const response = await emitWithAck(app, "joinGame", { roomCode: code, playerName: playerName || "" });

      if (!response?.success) {
        throw new Error(response?.message_EN || response?.message || response?.error || "Unable to join room.");
      }

      const returnedRoomCode = normalizeRoomCode(response.roomCode || code);

      sessionStorage.setItem("mafia_session_token", response.sessionToken || "");

      sessionStorage.setItem("mafia_room_code", returnedRoomCode);

      app.gameState = response.state;

      /*
       * IMPORTANT:
       * Any player joining an active lobby should enter
       * the setup/lobby screen, not the game screen.
       */
      const phase = response.state?.phase;

      app.screen = LOBBY_PHASES.has(phase) ? "setup" : "game";

      if (phase === "LOBBY") {
        app.roleAssignments = Object.create(null);

        app._roleAssignmentRoomCode = returnedRoomCode;
      }

      playSound("tick");

      showToast(`Joined room ${returnedRoomCode}!`, "success");

      app.render();
    } catch (error) {
      console.error("[ROOM][JOIN]", error);

      restoreButton(button, `🚪 ${t("Join Room")}`);

      showToast(error?.message || "Unable to join room.", "error");
    }
  };

  /* -------------------------------------------
     PUBLIC ROOMS
     ------------------------------------------- */

  const renderPublicRoomsList = (rawRooms) => {
    const listEl = container.querySelector("#public-rooms-list");

    if (!listEl) {
      return;
    }

    const rooms = (Array.isArray(rawRooms) ? rawRooms : []).filter((room) => {
      const p = String(room?.status || room?.phase || "LOBBY").toUpperCase();
      return PUBLIC_ROOM_PHASES.has(p);
    });

    if (!rooms.length) {
      listEl.style.display = "flex";

      listEl.innerHTML = `
          <span
            style="
              color:var(--text-muted);
              font-size:13px;
              text-align:center;
            "
          >
            ${escapeHtml(t("No open rooms right now. Be the first to create one!"))}
          </span>
        `;

      return;
    }

    listEl.style.display = "block";

    listEl.innerHTML = `
        <div
          style="
            display:flex;
            flex-direction:column;
            gap:8px;
            width:100%;
          "
        >
          ${rooms
            .map((room) => {
              const roomCode = normalizeRoomCode(room?.code || room?.roomCode);

              const playerCount = Number(room?.playerCount || room?.playersCount || 0);

              const maxPlayers = Number(room?.maxPlayers || DEFAULT_MAX_PLAYERS);

              if (!roomCode) {
                return "";
              }

              return `
                  <div
                    style="
                      display:flex;
                      justify-content:space-between;
                      align-items:center;
                      gap:12px;
                      padding:10px 14px;
                      background:rgba(255,255,255,.04);
                      border-radius:10px;
                      border:1px solid rgba(255,255,255,.07);
                    "
                  >
                    <div
                      style="
                        min-width:0;
                      "
                    >
                      <span
                        style="
                          font-family:var(--font-display);
                          font-weight:800;
                          font-size:16px;
                          color:var(--sage);
                          letter-spacing:.1em;
                        "
                      >
                        ${escapeHtml(roomCode)}
                      </span>

                      <span
                        style="
                          font-size:11px;
                          color:var(--text-muted);
                          margin-left:8px;
                        "
                      >
                        ${escapeHtml(`${playerCount}/${maxPlayers} ${t("players")}`)}
                      </span>
                    </div>

                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      data-action="join-public-room"
                      data-room-code="${escapeHtml(roomCode)}"
                      style="
                        font-size:11px;
                        font-weight:700;
                        flex:none;
                      "
                    >
                      ${escapeHtml(t("Join"))} →
                    </button>
                  </div>
                `;
            })
            .join("")}
        </div>
      `;
  };

  const refreshPublicRooms = async () => {
    const listEl = container.querySelector("#public-rooms-list");

    if (!listEl) {
      return;
    }

    clearPublicRoomsRequest(app);

    const controller = new AbortController();

    app._publicRoomsController = controller;

    listEl.style.display = "flex";

    listEl.innerHTML = `
        <span
          style="
            color:var(--text-muted);
            font-size:13px;
          "
        >
          ${escapeHtml(t("Loading open rooms..."))}
        </span>
      `;

    const token = getAuthToken(app);

    const headers = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(getApiUrl("/api/rooms/public"), { method: "GET", headers, signal: controller.signal, cache: "no-store" });

      const data = await parseJsonResponse(response);

      const rawRooms = Array.isArray(data?.rooms) ? data.rooms : (Array.isArray(data) ? data : []);

      renderPublicRoomsList(rawRooms);
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }

      // Socket fallback if HTTP fails
      if (app?.socket && isSocketReady(app)) {
        try {
          const socketRes = await emitWithAck(app, "getPublicRooms", {});
          if (socketRes?.success && Array.isArray(socketRes?.rooms)) {
            renderPublicRoomsList(socketRes.rooms);
            return;
          }
        } catch {
          // Socket fallback failed, show error
        }
      }

      console.error("[ROOMS][PUBLIC]", error);

      listEl.style.display = "flex";

      listEl.innerHTML = `
          <span
            style="
              color:var(--text-muted);
              font-size:13px;
              text-align:center;
            "
          >
            ${escapeHtml(t("Could not load rooms."))}
          </span>
        `;
    } finally {
      if (app._publicRoomsController === controller) {
        app._publicRoomsController = null;
      }
    }
  };

  /* -------------------------------------------
     EVENTS
     ------------------------------------------- */

  container.onclick = async (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;

    if (!target) {
      return;
    }

    const action = target.dataset.action;

    if (action === "set-visibility") {
      const visibility = target.dataset.visibility;

      if (Object.values(ROOM_VISIBILITIES).includes(visibility)) {
        app.roomVisibility = visibility;

        updateVisibilityUI();
      }

      return;
    }

    if (action === "create-game") {
      await createGame();
      return;
    }

    if (action === "join-game") {
      await joinGame();
      return;
    }

    if (action === "join-public-room") {
      const code = normalizeRoomCode(target.dataset.roomCode);

      const codeInput = container.querySelector("#join-code");

      if (codeInput) {
        codeInput.value = code;

        codeInput.dispatchEvent(new Event("input", { bubbles: true }));

        codeInput.focus();
      }

      await joinGame();
      return;
    }

    if (action === "refresh-public-rooms") {
      await refreshPublicRooms();
      return;
    }

    if (action === "admin") {
      goToAdmin(app);
      return;
    }

    if (action === "switch-user") {
      clearPublicRoomsRequest(app);

      sessionStorage.clear();
      localStorage.removeItem("mafia_auth_token");

      window.location.reload();
    }
  };

  container.oninput = (event) => {
    const target = event.target;

    if (target instanceof HTMLInputElement && target.id === "join-code") {
      target.value = normalizeRoomCode(target.value).slice(0, 10);
    }
  };

  container.onkeydown = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    const target = event.target;

    if (target instanceof HTMLInputElement && target.id === "join-code") {
      event.preventDefault();

      const button = container.querySelector("#join-game-btn");

      button?.click();
    }
  };

  /* -------------------------------------------
     BACKWARD COMPATIBILITY
     ------------------------------------------- */

  window._setVisibility = (visibility) => {
    if (Object.values(ROOM_VISIBILITIES).includes(visibility)) {
      app.roomVisibility = visibility;

      updateVisibilityUI();
    }
  };

  window._createGame = createGame;

  window._joinGame = joinGame;

  window._refreshPublicRooms = refreshPublicRooms;

  window._copyRoomCode = copyRoomCode;

  window._shareRoomCode = shareRoomCode;

  if (app?.socket) {
    if (app._onPublicRoomsUpdate) {
      app.socket.off("publicRooms:update", app._onPublicRoomsUpdate);
    }
    app._onPublicRoomsUpdate = (payload) => {
      if (Array.isArray(payload?.rooms)) {
        renderPublicRoomsList(payload.rooms);
      } else {
        refreshPublicRooms();
      }
    };
    app.socket.on("publicRooms:update", app._onPublicRoomsUpdate);
  }

  // Periodic polling fallback while viewing open rooms on the home screen
  if (!app._publicRoomsInterval) {
    app._publicRoomsInterval = window.setInterval(() => {
      if (app.screen === "home") {
        refreshPublicRooms();
      } else {
        clearPublicRoomsRequest(app);
      }
    }, 3500);
  }

  refreshPublicRooms();
}

/* ═══════════════════════════════════════════════════════════════
   LOBBY / MODERATOR ROLE ASSIGNMENT
   ═══════════════════════════════════════════════════════════════ */

export function renderSetup(container, app) {
  const state = app.gameState;

  if (!state) {
    clearSetupSync(app);
    app.screen = "home";
    app.render();
    return;
  }

  const joinedPlayers = Array.isArray(state.players) ? state.players : [];

  const joinedCount = joinedPlayers.length;

  const isModerator = isModeratorState(state);

  const roomCode = normalizeRoomCode(state.code || sessionStorage.getItem("mafia_room_code"));

  const roleRules = calculateRoleRules(joinedCount);

  /* -------------------------------------------
     ROLE CONFIGURATION STORE
     Reset it when changing rooms.
     ------------------------------------------- */

  if (app._roleAssignmentRoomCode !== roomCode) {
    app.roleAssignments = Object.create(null);
    app._roleAssignmentRoomCode = roomCode;
    app.roleSetupMode = "auto";
    app.customRoleCounts = null;
  } else if (!app.roleAssignments) {
    app.roleAssignments = Object.create(null);
  }

  app.roleSetupMode = app.roleSetupMode || "auto";

  const recommendedCounts = getRecommendedRoleCounts(joinedCount);
  let activeRoleCounts;

  if (app.roleSetupMode === "auto") {
    activeRoleCounts = { ...recommendedCounts };
  } else {
    if (!app.customRoleCounts) {
      app.customRoleCounts = { ...recommendedCounts };
    }
    const mafia = Math.max(roleRules.minMafia, Math.min(roleRules.maxMafia, Number(app.customRoleCounts[GAME_ROLES.MAFIA] || roleRules.minMafia)));
    const doctor = 1;
    const officer = 1;
    const villager = Math.max(0, joinedCount - mafia - doctor - officer);
    activeRoleCounts = {
      [GAME_ROLES.MAFIA]: mafia,
      [GAME_ROLES.DOCTOR]: doctor,
      [GAME_ROLES.OFFICER]: officer,
      [GAME_ROLES.VILLAGER]: villager
    };
  }

  const validation = validateRoleCounts(joinedCount, activeRoleCounts);

  /* -------------------------------------------
     SETUP POLLING FALLBACK
     ------------------------------------------- */

  if (!app._setupSyncInterval) {
    app._setupSyncInterval = window.setInterval(async () => {
      if (app.screen !== "setup" || !app.socket) {
        clearSetupSync(app);

        return;
      }

      try {
        const response = await emitWithAck(app, "getRoomState", {}, 5000);

        if (!response?.success || !response?.state) {
          return;
        }

        const nextState = response.state;

        const previousState = app.gameState;

        const previousSnapshot = JSON.stringify({
          phase: previousState?.phase || null,

          moderatorId: previousState?.moderatorId || previousState?.sageId || null,

          players: (previousState?.players || [])
            .map((player) => ({
              id: player?.id,

              name: getPlayerName(player),

              role: isModerator ? normalizeRole(player?.role) : null,

              isModerator: isModeratorPlayer(player, previousState),

              online: isPlayerOnline(player)
            }))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        });

        const nextSnapshot = JSON.stringify({
          phase: nextState?.phase || null,

          moderatorId: nextState?.moderatorId || nextState?.sageId || null,

          players: (nextState?.players || [])
            .map((player) => ({
              id: player?.id,

              name: getPlayerName(player),

              role: isModerator ? normalizeRole(player?.role) : null,

              isModerator: isModeratorPlayer(player, nextState),

              online: isPlayerOnline(player)
            }))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        });

        if (previousSnapshot !== nextSnapshot) {
          app.gameState = nextState;

          /*
           * Once the backend moved the game away from lobby,
           * stop polling and enter game screen.
           */
          if (!LOBBY_PHASES.has(nextState?.phase)) {
            clearSetupSync(app);

            app.screen = "game";
          }

          app.render();
        }
      } catch (error) {
        /*
         * Ignore transient polling errors.
         * Realtime connection may recover on its own.
         */
        if (error?.message?.includes("realtime")) {
          return;
        }

        console.debug("[LOBBY][SYNC]", error?.message || error);
      }
    }, 2000);
  }

  /* -------------------------------------------
     RENDER
     ------------------------------------------- */

  container.innerHTML = `
    <div class="setup fade-in">
      <div class="container--lg">

        <!-- TOP NAV -->
        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:12px;
            margin-bottom:20px;
          "
        >
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            data-action="leave-room"
          >
            ← ${escapeHtml(t("Leave Room"))}
          </button>

          <div class="flex items-center gap-2">
            <span
              style="
                font-size:12px;
                color:#10b981;
                display:flex;
                align-items:center;
                gap:6px;
                font-weight:700;
              "
            >
              <span
                style="
                  display:inline-block;
                  width:8px;
                  height:8px;
                  border-radius:50%;
                  background:#10b981;
                  box-shadow:0 0 8px #10b981;
                "
              ></span>

              ${escapeHtml(t("Realtime Lobby"))}
            </span>
          </div>
        </div>

        <!-- ROOM CODE -->
        <div
          class="card text-center mb-6"
          style="
            padding:24px 20px;
            background:
              radial-gradient(
                circle at 50% 20%,
                rgba(139,92,246,.15),
                rgba(15,17,28,.9)
              );
            border:1px solid rgba(139,92,246,.3);
          "
        >
          <div
            class="text-xs text-muted"
            style="
              text-transform:uppercase;
              letter-spacing:.15em;
              font-weight:700;
            "
          >
            ${escapeHtml(t("Room Code"))}
          </div>

          <div
            style="
              font-family:var(--font-display);
              font-size:44px;
              font-weight:900;
              letter-spacing:.18em;
              color:var(--sage);
              margin:6px 0;
              word-break:break-word;
            "
          >
            ${escapeHtml(roomCode || "------")}
          </div>

          <div
            class="flex justify-center items-center gap-3 mt-3"
          >
            <button
              class="btn btn--secondary btn--sm"
              type="button"
              data-action="copy-room-code"
            >
              📋 ${escapeHtml(t("Copy Code"))}
            </button>
          </div>
        </div>

        ${
          isModerator
            ? `
          <!-- MODERATOR ROLE SETUP BANNER -->
          <div class="moderator-banner" style="display:flex; flex-direction:column; gap:16px;">
            <div class="flex items-center justify-between" style="width:100%; flex-wrap:wrap; gap:12px;">
              <div class="flex items-center gap-3">
                <span
                  style="font-size:26px;"
                  aria-hidden="true"
                >
                  👑
                </span>

                <div>
                  <div
                    style="
                      font-weight:800;
                      font-size:16px;
                      color:#e0e7ff;
                    "
                  >
                    ${escapeHtml(t("You are the Room Creator"))}
                  </div>

                  <div
                    style="
                      font-size:12px;
                      color:rgba(224,231,255,.75);
                      margin-top:2px;
                    "
                  >
                    ${escapeHtml(t("Choose role counts or use Auto-Fill. Roles will be secretly randomized at game start."))}
                  </div>
                </div>
              </div>

              <!-- MODE SWITCH BUTTONS -->
              <div style="display:inline-flex; background:rgba(0,0,0,0.35); padding:4px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); gap:6px;">
                <button
                  type="button"
                  class="btn btn--sm ${app.roleSetupMode === "auto" ? "btn--primary" : "btn--ghost"}"
                  data-action="set-role-mode"
                  data-mode="auto"
                  style="font-size:12px; font-weight:700; padding:6px 14px; border-radius:8px; box-shadow:${app.roleSetupMode === "auto" ? "0 0 14px rgba(124,58,237,.5)" : "none"};"
                >
                  ⚡ ${escapeHtml(t("Auto-Fill (Recommended)"))}
                </button>
                <button
                  type="button"
                  class="btn btn--sm ${app.roleSetupMode === "custom" ? "btn--primary" : "btn--ghost"}"
                  data-action="set-role-mode"
                  data-mode="custom"
                  style="font-size:12px; font-weight:700; padding:6px 14px; border-radius:8px; box-shadow:${app.roleSetupMode === "custom" ? "0 0 14px rgba(124,58,237,.5)" : "none"};"
                >
                  ⚙ ${escapeHtml(t("Custom Counts"))}
                </button>
              </div>
            </div>
          </div>

          <!-- ROLE SUMMARY & COUNT CONFIGURATION -->
          <div class="role-summary-box">
            <div
              class="flex justify-between items-center"
              style="gap:12px; margin-bottom:12px;"
            >
              <h3
                style="
                  font-size:15px;
                  font-weight:800;
                  margin:0;
                "
              >
                📊 ${escapeHtml(t("Role Distribution"))}
                (${validation.totalAssigned}/${joinedCount}
                ${escapeHtml(t("Assigned"))})
              </h3>

              <span class="text-xs text-muted">
                ${joinedCount < MIN_PLAYERS ? `Min ${MIN_PLAYERS} Players` : `${joinedCount} Players Ready`}
              </span>
            </div>

            <div class="role-summary-grid">

              <!-- MAFIA CARD -->
              <div class="role-counter-pill role-counter-pill--mafia">
                <div class="role-counter-pill__header">
                  <span>🔪 ${escapeHtml(t("Mafia"))}</span>

                  <span
                    style="
                      font-size:10px;
                      opacity:.8;
                    "
                  >
                    Min ${roleRules.minMafia}
                    / Max ${roleRules.maxMafia}
                  </span>
                </div>

                <div class="role-counter-pill__count">
                  ${activeRoleCounts[GAME_ROLES.MAFIA]}
                </div>

                ${
                  app.roleSetupMode === "custom"
                    ? `
                  <div class="role-counter-stepper">
                    <button
                      type="button"
                      class="role-stepper-btn"
                      data-action="adjust-role-count"
                      data-role="${GAME_ROLES.MAFIA}"
                      data-delta="-1"
                      ${activeRoleCounts[GAME_ROLES.MAFIA] <= roleRules.minMafia ? "disabled" : ""}
                    >－</button>
                    <button
                      type="button"
                      class="role-stepper-btn"
                      data-action="adjust-role-count"
                      data-role="${GAME_ROLES.MAFIA}"
                      data-delta="1"
                      ${activeRoleCounts[GAME_ROLES.MAFIA] >= roleRules.maxMafia ? "disabled" : ""}
                    >＋</button>
                  </div>
                `
                    : ""
                }
              </div>

              <!-- DOCTOR CARD -->
              <div class="role-counter-pill role-counter-pill--doctor">
                <div class="role-counter-pill__header">
                  <span>💊 ${escapeHtml(t("Doctor"))}</span>

                  <span
                    style="
                      font-size:10px;
                      opacity:.8;
                    "
                  >
                    Exact 1
                  </span>
                </div>

                <div class="role-counter-pill__count">
                  ${activeRoleCounts[GAME_ROLES.DOCTOR]}
                </div>

                ${
                  app.roleSetupMode === "custom"
                    ? `
                  <div class="role-counter-stepper">
                    <button type="button" class="role-stepper-btn" disabled>－</button>
                    <button type="button" class="role-stepper-btn" disabled>＋</button>
                  </div>
                `
                    : ""
                }
              </div>

              <!-- OFFICER CARD -->
              <div class="role-counter-pill role-counter-pill--officer">
                <div class="role-counter-pill__header">
                  <span>🔍 ${escapeHtml(t("Officer"))}</span>

                  <span
                    style="
                      font-size:10px;
                      opacity:.8;
                    "
                  >
                    Exact 1
                  </span>
                </div>

                <div class="role-counter-pill__count">
                  ${activeRoleCounts[GAME_ROLES.OFFICER]}
                </div>

                ${
                  app.roleSetupMode === "custom"
                    ? `
                  <div class="role-counter-stepper">
                    <button type="button" class="role-stepper-btn" disabled>－</button>
                    <button type="button" class="role-stepper-btn" disabled>＋</button>
                  </div>
                `
                    : ""
                }
              </div>

              <!-- VILLAGER CARD -->
              <div class="role-counter-pill role-counter-pill--villager">
                <div class="role-counter-pill__header">
                  <span>👤 ${escapeHtml(t("Villager"))}</span>

                  <span
                    style="
                      font-size:10px;
                      opacity:.8;
                    "
                  >
                    ${escapeHtml(t("Rest become Villagers"))}
                  </span>
                </div>

                <div class="role-counter-pill__count">
                  ${activeRoleCounts[GAME_ROLES.VILLAGER]}
                </div>

                ${
                  app.roleSetupMode === "custom"
                    ? `
                  <div style="font-size:10px; color:rgba(255,255,255,0.6); text-align:center; margin-top:8px;">
                    Auto
                  </div>
                `
                    : ""
                }
              </div>

            </div>

            <div
              class="
                setup__validation
                ${validation.valid ? "setup__validation--success" : "setup__validation--error"}
              "
              style="margin-top:16px;"
            >
              ${escapeHtml(validation.message)}
            </div>
          </div>

          <!-- PLAYERS -->
          <div class="setup__section">

            <h2 class="setup__section-title">
              👥 ${escapeHtml(t("Joined Players"))}
              (${joinedCount})
            </h2>

            ${
              !joinedPlayers.length
                ? `
                <div
                  class="text-muted"
                  style="
                    padding:24px;
                    border-radius:12px;
                    background:rgba(255,255,255,.02);
                    border:1px dashed rgba(255,255,255,.15);
                    text-align:center;
                  "
                >
                  ⏳ ${escapeHtml(t("Waiting for players to join..."))}
                </div>
              `
                : `
                <div
                  style="
                    display:flex;
                    flex-direction:column;
                    gap:12px;
                  "
                >
                  ${joinedPlayers
                    .map((player) => {
                      const moderator = isModeratorPlayer(player, state);

                      const online = isPlayerOnline(player);

                      const playerName = getPlayerName(player);

                      const safePlayerId = escapeHtml(String(player.id || ""));

                      return `
                          <div
                            class="player-assign-card"
                            data-player-id="${safePlayerId}"
                            style="padding:14px 18px;"
                          >
                            <div class="player-assign-card__header" style="margin-bottom:0;">
                              <div
                                class="
                                  flex
                                  items-center
                                  gap-3
                                "
                              >
                                <span
                                  style="font-size:20px;"
                                  aria-hidden="true"
                                >
                                  ${moderator ? "👑" : "👤"}
                                </span>

                                <div
                                  style="
                                    min-width:0;
                                  "
                                >
                                  <span
                                    style="
                                      font-weight:700;
                                      font-size:15px;
                                    "
                                  >
                                    ${escapeHtml(playerName)}
                                  </span>

                                  ${
                                    moderator
                                      ? `
                                      <span
                                        class="badge"
                                        style="
                                          background:rgba(245,158,11,.25);
                                          color:#fbbf24;
                                          font-size:10px;
                                          padding:2px 8px;
                                          border-radius:10px;
                                          margin-left:6px;
                                          font-weight:700;
                                        "
                                      >
                                        👑 ${escapeHtml(t("Room Creator"))}
                                      </span>
                                    `
                                      : ""
                                  }

                                  ${
                                    player.id === state.myId
                                      ? `
                                      <span
                                        class="badge"
                                        style="
                                          background:rgba(99,102,241,.25);
                                          color:#a5b4fc;
                                          font-size:10px;
                                          padding:2px 8px;
                                          border-radius:10px;
                                          margin-left:6px;
                                          font-weight:700;
                                        "
                                      >
                                        ${escapeHtml(t("You"))}
                                      </span>
                                    `
                                      : ""
                                  }

                                  <span
                                    style="
                                      display:inline-block;
                                      width:6px;
                                      height:6px;
                                      border-radius:50%;
                                      background:${online ? "#10b981" : "#6b7280"};
                                      margin-left:6px;
                                    "
                                    title="${online ? "Online" : "Offline"}"
                                    aria-label="${online ? "Online" : "Offline"}"
                                  ></span>
                                </div>
                              </div>

                              <div>
                                <span
                                  class="badge"
                                  style="
                                    background:rgba(124,58,237,0.18);
                                    color:#c4b5fd;
                                    border:1px solid rgba(139,92,246,0.35);
                                    font-size:11px;
                                    padding:4px 10px;
                                    border-radius:20px;
                                    font-weight:700;
                                    letter-spacing:0.3px;
                                  "
                                >
                                  🎲 ${escapeHtml(t("Secret (Randomized at start)"))}
                                </span>
                              </div>
                            </div>
                          </div>
                        `;
                    })
                    .join("")}
                </div>
              `
            }
          </div>

          <!-- START GAME -->
          <div
            class="setup__section text-center mt-6"
          >
            <button
              class="btn btn--primary btn--lg btn--block"
              id="start-game-btn"
              type="button"
              data-action="start-game"
              ${!validation.valid ? "disabled" : ""}
              style="
                font-size:18px;
                font-weight:800;
                height:54px;
                box-shadow:${validation.valid ? "0 0 25px rgba(139,92,246,.4)" : "none"};
              "
            >
              🚀 ${escapeHtml(t("Start Game"))}
            </button>

            ${
              !validation.valid
                ? `
                  <div
                    class="text-xs text-muted mt-2"
                  >
                    ${escapeHtml(validation.message)}
                  </div>
                `
                : ""
            }
          </div>
        `
            : `
          <!-- NORMAL PLAYER LOBBY -->
          <div
            class="card text-center"
            style="
              padding:36px 20px;
              background:rgba(18,20,32,.85);
              border:1px solid rgba(255,255,255,.08);
            "
          >
            <div
              style="
                font-size:44px;
                margin-bottom:12px;
                animation:pulseGlow 2s infinite;
              "
              aria-hidden="true"
            >
              ⏳
            </div>

            <h2
              style="
                font-size:22px;
                font-weight:800;
                margin-bottom:8px;
              "
            >
              ${escapeHtml(t("Waiting for Moderator to start..."))}
            </h2>

            <p
              style="
                color:var(--text-muted);
                font-size:14px;
                max-width:440px;
                margin:0 auto 24px;
              "
            >
              ${escapeHtml(t("You are in the lobby. The Moderator is assigning roles and will start the game shortly."))}
            </p>

            <div
              style="
                text-align:left;
                background:rgba(0,0,0,.3);
                padding:18px;
                border-radius:14px;
                border:1px solid rgba(255,255,255,.06);
                max-width:480px;
                margin:0 auto 20px;
              "
            >
              <div
                class="flex justify-between items-center mb-3"
                style="gap:10px;"
              >
                <span
                  style="
                    font-weight:700;
                    font-size:13px;
                  "
                >
                  👥 ${escapeHtml(t("Joined Players"))}
                  (${joinedCount})
                </span>

                <span class="text-xs text-muted">
                  Min ${MIN_PLAYERS}
                </span>
              </div>

              <div
                style="
                  display:flex;
                  flex-wrap:wrap;
                  gap:8px;
                "
              >
                ${joinedPlayers
                  .map((player) => {
                    const moderator = isModeratorPlayer(player, state);

                    const isMe = player.id === state.myId;

                    return `
                        <div
                          style="
                            display:flex;
                            align-items:center;
                            gap:6px;
                            background:${isMe ? "rgba(99,102,241,.25)" : "rgba(255,255,255,.05)"};
                            padding:6px 12px;
                            border-radius:16px;
                            font-size:13px;
                            font-weight:600;
                            border:1px solid ${isMe ? "rgba(99,102,241,.5)" : "rgba(255,255,255,.08)"};
                          "
                        >
                          <span aria-hidden="true">
                            ${moderator ? "👑" : "👤"}
                          </span>

                          <span>
                            ${escapeHtml(getPlayerName(player))}
                          </span>

                          ${
                            moderator
                              ? `
                                <span
                                  style="
                                    font-size:10px;
                                    color:#fbbf24;
                                    background:rgba(245,158,11,.25);
                                    padding:1px 6px;
                                    border-radius:6px;
                                    font-weight:700;
                                  "
                                >
                                  ${escapeHtml(t("Host"))}
                                </span>
                              `
                              : ""
                          }

                          ${
                            isMe
                              ? `
                                <span
                                  style="
                                    font-size:10px;
                                    color:#a5b4fc;
                                    background:rgba(99,102,241,.4);
                                    padding:1px 5px;
                                    border-radius:6px;
                                  "
                                >
                                  ${escapeHtml(t("You"))}
                                </span>
                              `
                              : ""
                          }
                        </div>
                      `;
                  })
                  .join("")}
              </div>
            </div>
          </div>
        `
        }

      </div>
    </div>
  `;

  /* -------------------------------------------
     LOCAL ACTIONS
     ------------------------------------------- */

  const assignRole = async (playerId, role) => {
    if (!isModerator || !playerId || !ROLE_ORDER.includes(role)) {
      showToast("You are not allowed to assign roles.", "error");

      return;
    }

    const playerExists = joinedPlayers.some((player) => String(player?.id) === String(playerId));

    if (!playerExists) {
      showToast("Player is no longer in this room.", "error");

      return;
    }

    const previousRole = normalizeRole(app.roleAssignments[playerId]);

    app.roleAssignments[playerId] = role;

    playSound("tick");

    /*
     * Render immediately for responsive UI.
     * Backend remains authoritative.
     */
    app.render();

    if (!isSocketReady(app)) {
      showToast("Realtime connection is unavailable.", "error");

      if (previousRole) {
        app.roleAssignments[playerId] = previousRole;
      } else {
        delete app.roleAssignments[playerId];
      }

      app.render();
      return;
    }

    emitSocketEvent(app, "moderator:assignRole", { playerId, role }, (response) => {
      if (response && response.success === false) {
        if (previousRole) {
          app.roleAssignments[playerId] = previousRole;
        } else {
          delete app.roleAssignments[playerId];
        }

        showToast(response?.message_EN || response?.message || response?.error || "Role assignment failed.", "error");

        app.render();
      }
    });
  };

  const autoDistributeRoles = () => {
    app.roleSetupMode = "auto";
    app.customRoleCounts = null;
    playSound("tick");
    showToast(t("Auto-Fill (Recommended)") + " " + t("active"), "info");
    app.render();
  };

  const startGame = async () => {
    /*
     * Recalculate validation at click time.
     * Never rely only on the render-time validation.
     */
    const currentValidation = validateRoleCounts(joinedCount, activeRoleCounts);

    if (!currentValidation.valid) {
      showToast(currentValidation.message, "error");

      return;
    }

    if (!isModerator) {
      showToast("Only the Room Moderator can start the game.", "error");

      return;
    }

    const button = container.querySelector("#start-game-btn");

    setButtonLoading(button, "Starting game...");

    try {
      if (!isSocketReady(app)) {
        throw new Error("Realtime connection is unavailable.");
      }

      /*
       * Step 1:
       * Assign roles secretly & randomly on server with selected counts.
       */
      const assignResponse = await emitWithAck(app, "moderator:assignRoles", { roleCounts: activeRoleCounts }, 8000);

      if (assignResponse && assignResponse.success === false) {
        throw new Error(assignResponse?.message_EN || assignResponse?.message || assignResponse?.error || "Role assignment failed.");
      }

      /*
       * Step 2:
       * Start the actual game.
       */
      const startResponse = await emitWithAck(app, "moderator:startGame", { roleCounts: activeRoleCounts }, 10000);

      if (!startResponse?.success) {
        throw new Error(startResponse?.message_EN || startResponse?.message || startResponse?.error || "Failed to start game.");
      }

      clearSetupSync(app);

      /*
       * Prefer the authoritative server state.
       */
      if (startResponse.state) {
        app.gameState = startResponse.state;
      }

      playSound("night");

      showToast("The game has begun! Roles are revealed privately.", "success");

      app.screen = "game";

      app.render();
    } catch (error) {
      console.error("[GAME][START]", error);

      restoreButton(button, `🚀 ${t("Start Game")}`);

      showToast(error?.message || "Failed to start game.", "error");
    }
  };

  const leaveRoom = () => {
    clearRoomSession(app);

    app.screen = "home";

    app.render();
  };

  /* -------------------------------------------
     EVENT DELEGATION
     ------------------------------------------- */

  container.onclick = async (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;

    if (!target) {
      return;
    }

    const action = target.dataset.action;

    if (action === "copy-room-code") {
      await copyRoomCode(roomCode);

      return;
    }

    if (action === "share-room-code") {
      await shareRoomCode(roomCode);

      return;
    }

    if (action === "leave-room") {
      leaveRoom();
      return;
    }

    if (action === "set-role-mode") {
      const mode = target.dataset.mode;
      if (mode === "auto" || mode === "custom") {
        app.roleSetupMode = mode;
        if (mode === "custom" && !app.customRoleCounts) {
          app.customRoleCounts = { ...getRecommendedRoleCounts(joinedCount) };
        }
        playSound("tick");
        app.render();
      }
      return;
    }

    if (action === "adjust-role-count") {
      const role = target.dataset.role;
      const delta = parseInt(target.dataset.delta, 10) || 0;
      if (!app.customRoleCounts) {
        app.customRoleCounts = { ...getRecommendedRoleCounts(joinedCount) };
      }
      if (role === GAME_ROLES.MAFIA) {
        const currentMafia = Number(app.customRoleCounts[GAME_ROLES.MAFIA] || roleRules.minMafia);
        const nextMafia = currentMafia + delta;
        if (nextMafia >= roleRules.minMafia && nextMafia <= roleRules.maxMafia) {
          app.customRoleCounts[GAME_ROLES.MAFIA] = nextMafia;
          playSound("tick");
          app.render();
        }
      }
      return;
    }

    if (action === "assign-role") {
      const playerId = target.dataset.playerId;

      const role = normalizeRole(target.dataset.role);

      /*
       * Prevent double-click spam.
       */
      if (target.disabled) {
        return;
      }

      await assignRole(playerId, role);

      return;
    }

    if (action === "auto-distribute") {
      autoDistributeRoles();
      return;
    }

    if (action === "start-game") {
      await startGame();
    }
  };

  /* -------------------------------------------
     BACKWARD COMPATIBILITY
     ------------------------------------------- */

  window._copyRoomCode = copyRoomCode;

  window._shareRoomCode = shareRoomCode;

  window._assignRole = assignRole;

  window._autoDistributeRoles = autoDistributeRoles;

  window._backToHome = leaveRoom;

  window._startGame = startGame;
}

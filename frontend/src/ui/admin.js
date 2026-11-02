// frontend/src/ui/admin.js — Super Admin Operations Console
import { t } from "../i18n.js";
import "../styles/admin.css";

class AdminConsole {
  constructor() {
    this.currentTab = "overview";
    this.token = sessionStorage.getItem("mafia_admin_token") || localStorage.getItem("mafia_admin_token");
    this.adminUser = null;
    this.loading = false;
    this.error = null;

    // View data caches
    this.dashboard = null;
    this.users = { list: [], pagination: { total: 0, page: 1, limit: 15, totalPages: 1 }, search: "", role: "", isBlocked: "" };
    this.rooms = { list: [], pagination: { total: 0, page: 1, limit: 15, totalPages: 1 }, search: "", status: "" };
    this.activeGames = [];
    this.games = { list: [], pagination: { total: 0, page: 1, limit: 15, totalPages: 1 }, status: "", winnerTeam: "" };
    this.analytics = null;
    this.audit = { list: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1 }, action: "" };
    this.system = null;

    // UI overlays
    this.drawer = null; // { type: 'user'|'room'|'game', data: any }
    this.modal = null; // { title, message, danger, onConfirm }
    this.autoRefreshInterval = null;
  }

  async init(container) {
    this.container = container;
    if (!this.token) {
      this.renderLogin();
      return;
    }

    try {
      const res = await this.api("/auth/me");
      if (res && res.success && res.user.role === "SUPER_ADMIN") {
        this.adminUser = res.user;
        this.renderLayout();
        this.loadTab(this.currentTab);
        this.startAutoRefresh();
      } else {
        this.logout();
      }
    } catch (err) {
      this.logout();
    }
  }

  destroy() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  startAutoRefresh() {
    if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
    this.autoRefreshInterval = setInterval(() => {
      if (this.currentTab === "overview") this.loadOverview(true);
      else if (this.currentTab === "activeGames") this.loadActiveGames(true);
    }, 8000);
  }

  async api(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(`/api/admin${endpoint}`, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      if (endpoint !== "/auth/login") {
        this.logout();
        throw new Error("Session expired or access denied");
      }
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}`);
    }
    return data;
  }

  logout() {
    sessionStorage.removeItem("mafia_admin_token");
    localStorage.removeItem("mafia_admin_token");
    this.token = null;
    this.adminUser = null;
    this.destroy();
    this.renderLogin();
  }

  /* ─────────────────────────────────────────────────────────────
     RENDER: LOGIN SCREEN
     ───────────────────────────────────────────────────────────── */

  renderLogin(errorMessage = "") {
    this.container.innerHTML = `
      <div style="min-height: 100vh; width: 100vw; display: flex; align-items: center; justify-content: center; background: #0b0f19; font-family: -apple-system, sans-serif;">
        <div style="width: 400px; max-width: 90vw; background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
            <div style="width: 42px; height: 42px; border-radius: 10px; background: linear-gradient(135deg, #4f46e5, #7c3aed); display: flex; align-items: center; justify-content: center; font-size: 22px;">🛡️</div>
            <div>
              <div style="font-size: 18px; font-weight: 800; color: #fff;">MAFIA OPERATIONS</div>
              <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Super Admin Portal</div>
            </div>
          </div>

          ${errorMessage ? `
            <div style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #f87171; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 18px;">
              ${errorMessage}
            </div>
          ` : ""}

          <form id="admin-login-form">
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase;">Admin Email</label>
              <input id="admin-email" type="email" required placeholder="admin@mafia.local" style="width: 100%; box-sizing: border-box; background: #1f2937; border: 1px solid #374151; color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 14px; outline: none;" value="admin@mafia.local" />
            </div>

            <div style="margin-bottom: 24px;">
              <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase;">Password</label>
              <input id="admin-password" type="password" required placeholder="••••••••••••" style="width: 100%; box-sizing: border-box; background: #1f2937; border: 1px solid #374151; color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 14px; outline: none;" value="ChangeThisImmediately" />
            </div>

            <button type="submit" id="admin-login-submit" style="width: 100%; background: #4f46e5; hover: #4338ca; color: #fff; font-weight: 700; border: none; padding: 12px; border-radius: 8px; font-size: 14px; cursor: pointer; transition: background 0.15s ease;">
              Authenticate to Console
            </button>
          </form>

          <div style="margin-top: 20px; text-align: center;">
            <a href="/" style="font-size: 12px; color: #64748b; text-decoration: none;">← Return to Player Game</a>
          </div>
        </div>
      </div>
    `;

    document.getElementById("admin-login-form").onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById("admin-email").value.trim();
      const password = document.getElementById("admin-password").value.trim();
      const submitBtn = document.getElementById("admin-login-submit");
      submitBtn.disabled = true;
      submitBtn.innerText = "Verifying Credentials...";

      try {
        const res = await this.api("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });

        if (res.success && res.token) {
          this.token = res.token;
          sessionStorage.setItem("mafia_admin_token", res.token);
          this.adminUser = res.user;
          this.renderLayout();
          this.loadTab("overview");
          this.startAutoRefresh();
        } else {
          this.renderLogin(res.error || "Authentication failed");
        }
      } catch (err) {
        this.renderLogin(err.message || "Invalid email or password");
      }
    };
  }

  /* ─────────────────────────────────────────────────────────────
     RENDER: SHELL / LAYOUT
     ───────────────────────────────────────────────────────────── */

  renderLayout() {
    this.container.innerHTML = `
      <div class="admin-app">
        <!-- Sidebar Navigation -->
        <aside class="admin-sidebar">
          <div class="admin-sidebar__brand">
            <div class="admin-sidebar__logo">🛡️</div>
            <div>
              <div class="admin-sidebar__title">MAFIA OPS</div>
              <div class="admin-sidebar__subtitle">Super Admin Console</div>
            </div>
          </div>

          <nav class="admin-sidebar__nav">
            <div class="admin-nav-item ${this.currentTab === "overview" ? "active" : ""}" data-tab="overview">
              <span class="admin-nav-item__icon">📊</span> Overview
            </div>
            <div class="admin-nav-item ${this.currentTab === "users" ? "active" : ""}" data-tab="users">
              <span class="admin-nav-item__icon">👥</span> Users
            </div>
            <div class="admin-nav-item ${this.currentTab === "rooms" ? "active" : ""}" data-tab="rooms">
              <span class="admin-nav-item__icon">🚪</span> Rooms
            </div>
            <div class="admin-nav-item ${this.currentTab === "activeGames" ? "active" : ""}" data-tab="activeGames">
              <span class="admin-nav-item__icon">⚡</span> Active Games
            </div>
            <div class="admin-nav-item ${this.currentTab === "games" ? "active" : ""}" data-tab="games">
              <span class="admin-nav-item__icon">📜</span> Game History
            </div>
            <div class="admin-nav-item ${this.currentTab === "analytics" ? "active" : ""}" data-tab="analytics">
              <span class="admin-nav-item__icon">📈</span> Analytics
            </div>
            <div class="admin-nav-item ${this.currentTab === "audit" ? "active" : ""}" data-tab="audit">
              <span class="admin-nav-item__icon">📋</span> Audit Logs
            </div>
            <div class="admin-nav-item ${this.currentTab === "system" ? "active" : ""}" data-tab="system">
              <span class="admin-nav-item__icon">💻</span> System Health
            </div>
            <div class="admin-nav-item ${this.currentTab === "profile" ? "active" : ""}" data-tab="profile">
              <span class="admin-nav-item__icon">⚙️</span> Settings & Profile
            </div>
          </nav>

          <div class="admin-sidebar__footer">
            <div class="admin-user-pill">
              <div class="admin-user-avatar">${(this.adminUser?.displayName || "A")[0].toUpperCase()}</div>
              <div style="flex: 1; overflow: hidden;">
                <div style="font-weight: 600; font-size: 13px; color: #fff; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${this.adminUser?.displayName || "Admin"}</div>
                <div style="font-size: 11px; color: #10b981; font-weight: 600;">SUPER ADMIN</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <a href="/" class="admin-btn admin-btn--secondary admin-btn--sm" style="flex: 1; text-decoration: none;">🎮 Game UI</a>
              <button id="admin-logout-btn" class="admin-btn admin-btn--danger admin-btn--sm" title="Log out">🚪 Exit</button>
            </div>
          </div>
        </aside>

        <!-- Main Content Area -->
        <main class="admin-content">
          <header class="admin-topbar">
            <div class="admin-topbar__title" id="admin-topbar-title">
              <span>Overview</span>
            </div>
            <div class="admin-topbar__actions">
              <span id="admin-live-pulse" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #10b981; font-weight: 600;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; animation: pulse 1.5s infinite;"></span> LIVE OPS
              </span>
              <button id="admin-refresh-btn" class="admin-btn admin-btn--secondary admin-btn--sm">🔄 Refresh</button>
            </div>
          </header>

          <div class="admin-body" id="admin-body-content">
            <div style="padding: 40px; text-align: center; color: #64748b;">Loading operations data...</div>
          </div>
        </main>

        <!-- Overlay Drawer Container -->
        <div id="admin-drawer-root"></div>
        <!-- Modal Confirmation Container -->
        <div id="admin-modal-root"></div>
      </div>
    `;

    // Bind sidebar navigation events
    this.container.querySelectorAll(".admin-nav-item").forEach((item) => {
      item.onclick = () => {
        const tab = item.getAttribute("data-tab");
        this.switchTab(tab);
      };
    });

    document.getElementById("admin-logout-btn").onclick = () => this.logout();
    document.getElementById("admin-refresh-btn").onclick = () => this.loadTab(this.currentTab);
  }

  switchTab(tab) {
    this.currentTab = tab;
    this.container.querySelectorAll(".admin-nav-item").forEach((item) => {
      item.classList.toggle("active", item.getAttribute("data-tab") === tab);
    });

    const titleEl = document.getElementById("admin-topbar-title");
    const titles = {
      overview: "📊 Platform Overview & KPIs",
      users: "👥 User Management",
      rooms: "🚪 Room Management & Realtime Inspection",
      activeGames: "⚡ Live Games Monitor",
      games: "📜 Game History & Detailed Logs",
      analytics: "📈 Role & Team Analytics",
      audit: "📋 Administrative Audit Log",
      system: "💻 System Health & Infrastructure",
      profile: "⚙️ Admin Profile & Settings"
    };
    if (titleEl) titleEl.innerHTML = titles[tab] || tab;
    this.loadTab(tab);
  }

  loadTab(tab) {
    switch (tab) {
      case "overview": return this.loadOverview();
      case "users": return this.loadUsers();
      case "rooms": return this.loadRooms();
      case "activeGames": return this.loadActiveGames();
      case "games": return this.loadGames();
      case "analytics": return this.loadAnalytics();
      case "audit": return this.loadAudit();
      case "system": return this.loadSystem();
      case "profile": return this.loadProfile();
      default: return this.loadOverview();
    }
  }

  /* ─────────────────────────────────────────────────────────────
     TAB 1: OVERVIEW
     ───────────────────────────────────────────────────────────── */

  async loadOverview(silent = false) {
    const body = document.getElementById("admin-body-content");
    if (!silent && body) body.innerHTML = `<div style="padding: 40px; text-align: center; color: #64748b;">Loading platform telemetry...</div>`;

    try {
      const data = await this.api("/dashboard");
      this.dashboard = data;

      const kpis = data.kpis || {};
      const activeRooms = data.activeRooms || [];
      const recentGames = data.recentGames || [];
      const recentAudits = data.recentAudits || [];

      if (!body) return;

      body.innerHTML = `
        <!-- KPI Cards Grid -->
        <div class="admin-kpi-grid">
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Total Users</div>
            <div class="admin-kpi-card__value">${kpis.totalUsers?.toLocaleString() || 0}</div>
            <div class="admin-kpi-card__sub">${kpis.onlineUsers || 0} online now</div>
          </div>
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Active Users (24h)</div>
            <div class="admin-kpi-card__value" style="color: #38bdf8;">${kpis.activeUsers24h?.toLocaleString() || 0}</div>
            <div class="admin-kpi-card__sub">Engaged in last 24 hours</div>
          </div>
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Live Active Rooms</div>
            <div class="admin-kpi-card__value" style="color: #10b981;">${kpis.activeRooms || 0}</div>
            <div class="admin-kpi-card__sub">${kpis.totalRooms || 0} lifetime rooms</div>
          </div>
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Completed Games</div>
            <div class="admin-kpi-card__value" style="color: #f59e0b;">${kpis.completedGames?.toLocaleString() || 0}</div>
            <div class="admin-kpi-card__sub">${kpis.gamesToday || 0} finished today</div>
          </div>
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Mafia Win Rate</div>
            <div class="admin-kpi-card__value" style="color: #ef4444;">${kpis.mafiaWinRate || 0}%</div>
            <div class="admin-kpi-card__sub">${kpis.mafiaWins || 0} total wins</div>
          </div>
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Village Win Rate</div>
            <div class="admin-kpi-card__value" style="color: #818cf8;">${kpis.villageWinRate || 0}%</div>
            <div class="admin-kpi-card__sub">${kpis.villageWins || 0} total wins</div>
          </div>
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Socket Connections</div>
            <div class="admin-kpi-card__value" style="color: #c084fc;">${kpis.connectedSockets || 0}</div>
            <div class="admin-kpi-card__sub">Realtime sockets alive</div>
          </div>
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Server Uptime</div>
            <div class="admin-kpi-card__value" style="font-size: 20px; color: #94a3b8; font-family: monospace;">
              ${this.formatUptime(data.systemHealth?.uptime || 0)}
            </div>
            <div class="admin-kpi-card__sub">Node ${data.systemHealth?.nodeVersion || "active"}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px;">
          <!-- Live Games Snippet -->
          <div class="admin-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #fff;">⚡ Active Rooms Telemetry</h3>
              <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.switchTab('activeGames')">View All (${activeRooms.length})</button>
            </div>
            ${activeRooms.length === 0 ? `
              <div style="padding: 24px; text-align: center; color: #64748b; background: rgba(0,0,0,0.2); border-radius: 8px;">
                No active games currently running. Platform is idle.
              </div>
            ` : `
              <div class="admin-table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Phase</th>
                      <th>Round</th>
                      <th>Players</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${activeRooms.map((r) => `
                      <tr>
                        <td><span style="font-family: monospace; font-weight: 700; color: #818cf8;">${r.code}</span></td>
                        <td><span class="admin-badge admin-badge--primary">${r.phase}</span></td>
                        <td>Round ${r.round}</td>
                        <td>${r.aliveCount}/${r.playersCount} alive</td>
                        <td>
                          <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.inspectRoom('${r.code}')">Inspect</button>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <!-- Recent Audit Logs -->
          <div class="admin-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #fff;">📋 Administrative Activity</h3>
              <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.switchTab('audit')">Full Audit Log</button>
            </div>
            ${recentAudits.length === 0 ? `
              <div style="padding: 24px; text-align: center; color: #64748b; background: rgba(0,0,0,0.2); border-radius: 8px;">
                No administrative actions logged yet.
              </div>
            ` : `
              <div class="admin-table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Admin</th>
                      <th>Target</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recentAudits.map((a) => `
                      <tr>
                        <td><span class="admin-badge ${a.status === "SUCCESS" ? "admin-badge--success" : "admin-badge--danger"}">${a.action}</span></td>
                        <td style="color: #94a3b8; font-size: 12px;">${a.adminEmail}</td>
                        <td><span style="font-family: monospace; font-size: 12px;">${a.targetType || "—"}: ${a.targetId || ""}</span></td>
                        <td style="color: #64748b; font-size: 11px;">${new Date(a.createdAt).toLocaleTimeString()}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      `;
    } catch (err) {
      if (body) body.innerHTML = `<div style="padding: 30px; color: #ef4444;">Error loading dashboard: ${err.message}</div>`;
    }
  }

  /* ─────────────────────────────────────────────────────────────
     TAB 2: USERS MANAGEMENT
     ───────────────────────────────────────────────────────────── */

  async loadUsers() {
    const body = document.getElementById("admin-body-content");
    body.innerHTML = `
      <div class="admin-filter-bar">
        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <input id="user-search-input" class="admin-input" type="text" placeholder="Search by name, email, or ID..." style="width: 260px;" value="${this.users.search}" />
          <select id="user-role-select" class="admin-select">
            <option value="">All Roles</option>
            <option value="PLAYER" ${this.users.role === "PLAYER" ? "selected" : ""}>PLAYER</option>
            <option value="SUPER_ADMIN" ${this.users.role === "SUPER_ADMIN" ? "selected" : ""}>SUPER_ADMIN</option>
          </select>
          <select id="user-blocked-select" class="admin-select">
            <option value="">All Statuses</option>
            <option value="false" ${this.users.isBlocked === "false" ? "selected" : ""}>Active Only</option>
            <option value="true" ${this.users.isBlocked === "true" ? "selected" : ""}>Blocked Only</option>
          </select>
          <button id="user-filter-btn" class="admin-btn admin-btn--primary admin-btn--sm">Filter</button>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.exportData('users')">📥 Export CSV</button>
        </div>
      </div>

      <div class="admin-card" style="padding: 0;">
        <div class="admin-table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Online</th>
                <th>Games (W/L)</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="users-table-body">
              <tr><td colspan="7" style="text-align: center; color: #64748b; padding: 30px;">Loading users...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-pagination" id="users-pagination-controls"></div>
    `;

    // Bind filters
    document.getElementById("user-filter-btn").onclick = () => {
      this.users.search = document.getElementById("user-search-input").value;
      this.users.role = document.getElementById("user-role-select").value;
      this.users.isBlocked = document.getElementById("user-blocked-select").value;
      this.users.pagination.page = 1;
      this.fetchUsersTable();
    };

    document.getElementById("user-search-input").onkeydown = (e) => {
      if (e.key === "Enter") document.getElementById("user-filter-btn").click();
    };

    this.fetchUsersTable();
  }

  async fetchUsersTable() {
    const tbody = document.getElementById("users-table-body");
    const pgen = document.getElementById("users-pagination-controls");
    if (!tbody) return;

    try {
      const q = new URLSearchParams({
        page: this.users.pagination.page,
        limit: this.users.pagination.limit,
        search: this.users.search,
        role: this.users.role,
        isBlocked: this.users.isBlocked
      });

      const res = await this.api(`/users?${q.toString()}`);
      this.users.list = res.users || [];
      this.users.pagination = res.pagination || this.users.pagination;

      if (this.users.list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 40px;">No users match your criteria.</td></tr>`;
        pgen.innerHTML = "";
        return;
      }

      tbody.innerHTML = this.users.list.map((u) => `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="admin-user-avatar" style="width: 28px; height: 28px; font-size: 11px;">${(u.displayName || "U")[0].toUpperCase()}</div>
              <div>
                <div style="font-weight: 600; color: #fff;">${u.displayName}</div>
                <div style="font-size: 11px; color: #94a3b8;">${u.email}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="admin-badge ${u.role === "SUPER_ADMIN" ? "admin-badge--warning" : "admin-badge--neutral"}">
              ${u.role}
            </span>
          </td>
          <td>
            <span class="admin-badge ${u.isBlocked ? "admin-badge--danger" : "admin-badge--success"}">
              ${u.isBlocked ? "BLOCKED" : "ACTIVE"}
            </span>
          </td>
          <td>
            <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: ${u.isOnline ? "#10b981" : "#64748b"}; font-weight: 600;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: ${u.isOnline ? "#10b981" : "#64748b"};"></span>
              ${u.isOnline ? "Online" : "Offline"}
            </span>
          </td>
          <td>
            <span style="font-weight: 700; color: #fff;">${u.gamesPlayed || 0}</span>
            <span style="color: #64748b; font-size: 12px;"> (${u.gamesWon || 0}W / ${u.gamesLost || 0}L)</span>
          </td>
          <td style="color: #94a3b8; font-size: 12px;">${new Date(u.createdAt).toLocaleDateString()}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.inspectUser('${u.id}')">Details</button>
              ${u.id !== this.adminUser?.id ? `
                <button class="admin-btn ${u.isBlocked ? "admin-btn--secondary" : "admin-btn--danger"} admin-btn--sm" onclick="window.__ADMIN__.toggleBlockUser('${u.id}', '${u.displayName}', ${u.isBlocked})">
                  ${u.isBlocked ? "Unblock" : "Block"}
                </button>
              ` : ""}
            </div>
          </td>
        </tr>
      `).join("");

      // Render Pagination
      const p = this.users.pagination;
      pgen.innerHTML = `
        <div>Showing ${(p.page - 1) * p.limit + 1}–${Math.min(p.page * p.limit, p.total)} of ${p.total} users</div>
        <div class="admin-pagination__buttons">
          <button class="admin-btn admin-btn--secondary admin-btn--sm" ${p.page <= 1 ? "disabled" : ""} onclick="window.__ADMIN__.changeUsersPage(${p.page - 1})">Prev</button>
          <span style="padding: 4px 8px; font-weight: 600;">Page ${p.page} of ${p.totalPages || 1}</span>
          <button class="admin-btn admin-btn--secondary admin-btn--sm" ${p.page >= p.totalPages ? "disabled" : ""} onclick="window.__ADMIN__.changeUsersPage(${p.page + 1})">Next</button>
        </div>
      `;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; padding: 20px;">Error loading users: ${err.message}</td></tr>`;
    }
  }

  changeUsersPage(page) {
    this.users.pagination.page = page;
    this.fetchUsersTable();
  }

  async inspectUser(userId) {
    this.openDrawer("Loading User Details...");
    try {
      const res = await this.api(`/users/${userId}`);
      const user = res.user;
      const ownedRooms = res.ownedRooms || [];
      const gameHistory = res.gameHistory || [];
      const liveRoom = res.liveRoom;

      const content = `
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 24px;">
          <div class="admin-user-avatar" style="width: 50px; height: 50px; font-size: 20px;">${(user.displayName || "U")[0].toUpperCase()}</div>
          <div>
            <h2 style="margin: 0; font-size: 18px; color: #fff;">${user.displayName}</h2>
            <div style="color: #94a3b8; font-size: 13px;">${user.email}</div>
            <div style="margin-top: 6px; display: flex; gap: 6px;">
              <span class="admin-badge ${user.role === "SUPER_ADMIN" ? "admin-badge--warning" : "admin-badge--neutral"}">${user.role}</span>
              <span class="admin-badge ${user.isBlocked ? "admin-badge--danger" : "admin-badge--success"}">${user.isBlocked ? "BLOCKED" : "ACTIVE"}</span>
              <span class="admin-badge ${user.isOnline ? "admin-badge--success" : "admin-badge--neutral"}">${user.isOnline ? "ONLINE" : "OFFLINE"}</span>
            </div>
          </div>
        </div>

        ${liveRoom ? `
          <div class="admin-card" style="background: rgba(79, 70, 229, 0.15); border-color: rgba(79, 70, 229, 0.4); margin-bottom: 20px;">
            <div style="font-weight: 700; color: #a5b4fc; margin-bottom: 4px;">⚡ Currently in Active Game!</div>
            <div style="font-size: 13px; color: #e0e7ff;">
              Room: <strong>${liveRoom.roomCode}</strong> | Phase: <strong>${liveRoom.phase}</strong> | Role: <strong>${liveRoom.role || "Pending"}</strong> | Alive: <strong>${liveRoom.isAlive ? "Yes" : "Dead"}</strong>
            </div>
          </div>
        ` : ""}

        <div class="admin-kpi-grid" style="grid-template-columns: 1fr 1fr 1fr; margin-bottom: 20px;">
          <div class="admin-kpi-card" style="padding: 12px 14px;">
            <div class="admin-kpi-card__label">Games</div>
            <div class="admin-kpi-card__value" style="font-size: 20px;">${user.gamesPlayed || 0}</div>
          </div>
          <div class="admin-kpi-card" style="padding: 12px 14px;">
            <div class="admin-kpi-card__label">Wins</div>
            <div class="admin-kpi-card__value" style="font-size: 20px; color: #10b981;">${user.gamesWon || 0}</div>
          </div>
          <div class="admin-kpi-card" style="padding: 12px 14px;">
            <div class="admin-kpi-card__label">Losses</div>
            <div class="admin-kpi-card__value" style="font-size: 20px; color: #ef4444;">${user.gamesLost || 0}</div>
          </div>
        </div>

        <h4 style="color: #fff; margin: 20px 0 10px 0; font-size: 14px;">Recent Game Participation</h4>
        ${gameHistory.length === 0 ? `<div style="color: #64748b; font-size: 13px;">No recorded games yet.</div>` : `
          <div class="admin-table-container" style="margin-bottom: 20px;">
            <table class="admin-table">
              <thead><tr><th>Role</th><th>Team</th><th>Result</th><th>Surv</th></tr></thead>
              <tbody>
                ${gameHistory.map((g) => {
                  const won = g.Game?.winnerTeam === g.team;
                  return `
                    <tr>
                      <td><span class="admin-badge admin-badge--primary">${g.role}</span></td>
                      <td>${g.team}</td>
                      <td><span class="admin-badge ${won ? "admin-badge--success" : "admin-badge--danger"}">${won ? "WIN" : "LOSS"}</span></td>
                      <td>${g.isAlive ? "Alive" : `Died R${g.deathRound || "?"}`}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        `}

        <h4 style="color: #fff; margin: 20px 0 10px 0; font-size: 14px;">Account Administration</h4>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${user.id !== this.adminUser?.id ? `
            <button class="admin-btn ${user.isBlocked ? "admin-btn--secondary" : "admin-btn--danger"}" onclick="window.__ADMIN__.toggleBlockUser('${user.id}', '${user.displayName}', ${user.isBlocked})">
              ${user.isBlocked ? "Unblock Account" : "Suspend / Block Account"}
            </button>
            <button class="admin-btn admin-btn--secondary" onclick="window.__ADMIN__.changeUserRole('${user.id}', '${user.displayName}', '${user.role}')">
              ${user.role === "SUPER_ADMIN" ? "Demote to PLAYER" : "Promote to SUPER_ADMIN"}
            </button>
          ` : `<div style="color: #64748b; font-size: 13px;">This is your active Super Admin session.</div>`}
        </div>
      `;

      this.updateDrawerContent("User Profile: " + user.displayName, content);
    } catch (err) {
      this.updateDrawerContent("Error", `<div style="color: #ef4444;">${err.message}</div>`);
    }
  }

  toggleBlockUser(userId, displayName, currentBlocked) {
    const actionName = currentBlocked ? "Unblock" : "Block";
    this.confirmAction({
      title: `${actionName} User: ${displayName}`,
      message: `Are you sure you want to ${actionName.toLowerCase()} this user? ${!currentBlocked ? "They will be disconnected immediately and prevented from joining rooms." : "They will regain normal platform access."}`,
      danger: !currentBlocked,
      onConfirm: async () => {
        try {
          await this.api(`/users/${userId}/block`, {
            method: "PATCH",
            body: JSON.stringify({ isBlocked: !currentBlocked })
          });
          this.closeDrawer();
          this.fetchUsersTable();
        } catch (err) {
          alert(`Action failed: ${err.message}`);
        }
      }
    });
  }

  changeUserRole(userId, displayName, currentRole) {
    const targetRole = currentRole === "SUPER_ADMIN" ? "PLAYER" : "SUPER_ADMIN";
    this.confirmAction({
      title: `Change Role: ${displayName}`,
      message: `Are you sure you want to change this user's role to ${targetRole}?`,
      danger: targetRole === "SUPER_ADMIN",
      onConfirm: async () => {
        try {
          await this.api(`/users/${userId}/role`, {
            method: "PATCH",
            body: JSON.stringify({ role: targetRole })
          });
          this.closeDrawer();
          this.fetchUsersTable();
        } catch (err) {
          alert(`Role change failed: ${err.message}`);
        }
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     TAB 3: ROOMS MANAGEMENT
     ───────────────────────────────────────────────────────────── */

  async loadRooms() {
    const body = document.getElementById("admin-body-content");
    body.innerHTML = `
      <div class="admin-filter-bar">
        <div style="display: flex; gap: 10px; align-items: center;">
          <input id="room-search-input" class="admin-input" type="text" placeholder="Search room code..." style="width: 220px;" value="${this.rooms.search}" />
          <select id="room-status-select" class="admin-select">
            <option value="">All Statuses</option>
            <option value="WAITING_FOR_PLAYERS">WAITING_FOR_PLAYERS</option>
            <option value="ROLE_ASSIGNMENT">ROLE_ASSIGNMENT</option>
            <option value="PLAYING">PLAYING</option>
            <option value="FINISHED">FINISHED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          <button id="room-filter-btn" class="admin-btn admin-btn--primary admin-btn--sm">Filter</button>
        </div>
      </div>

      <div class="admin-card" style="padding: 0;">
        <div class="admin-table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Room Code</th>
                <th>Status</th>
                <th>Live Status</th>
                <th>Owner / Moderator</th>
                <th>Players</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="rooms-table-body">
              <tr><td colspan="7" style="text-align: center; color: #64748b; padding: 30px;">Loading rooms...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-pagination" id="rooms-pagination-controls"></div>
    `;

    document.getElementById("room-filter-btn").onclick = () => {
      this.rooms.search = document.getElementById("room-search-input").value;
      this.rooms.status = document.getElementById("room-status-select").value;
      this.rooms.pagination.page = 1;
      this.fetchRoomsTable();
    };

    this.fetchRoomsTable();
  }

  async fetchRoomsTable() {
    const tbody = document.getElementById("rooms-table-body");
    const pgen = document.getElementById("rooms-pagination-controls");
    if (!tbody) return;

    try {
      const q = new URLSearchParams({
        page: this.rooms.pagination.page,
        limit: this.rooms.pagination.limit,
        search: this.rooms.search,
        status: this.rooms.status
      });

      const res = await this.api(`/rooms?${q.toString()}`);
      this.rooms.list = res.rooms || [];
      this.rooms.pagination = res.pagination || this.rooms.pagination;

      if (this.rooms.list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 40px;">No rooms found.</td></tr>`;
        pgen.innerHTML = "";
        return;
      }

      tbody.innerHTML = this.rooms.list.map((r) => `
        <tr>
          <td><span style="font-family: monospace; font-size: 15px; font-weight: 700; color: #818cf8;">${r.code}</span></td>
          <td><span class="admin-badge ${r.status === "PLAYING" ? "admin-badge--warning" : r.status === "FINISHED" ? "admin-badge--success" : "admin-badge--neutral"}">${r.status}</span></td>
          <td>
            ${r.isLive ? `
              <span class="admin-badge admin-badge--success">⚡ ACTIVE (${r.livePhase})</span>
            ` : `
              <span style="color: #64748b; font-size: 12px;">Archived</span>
            `}
          </td>
          <td>
            <div style="font-weight: 600; color: #fff;">${r.owner?.displayName || "—"}</div>
            <div style="font-size: 11px; color: #64748b;">${r.owner?.email || ""}</div>
          </td>
          <td>${r.isLive ? `${r.liveAliveCount}/${r.livePlayersCount} active` : `Max ${r.maxPlayers}`}</td>
          <td style="color: #94a3b8; font-size: 12px;">${new Date(r.createdAt).toLocaleString()}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.inspectRoom('${r.code}')">Inspect</button>
              ${r.isLive ? `
                <button class="admin-btn admin-btn--danger admin-btn--sm" onclick="window.__ADMIN__.cancelRoom('${r.code}')">Cancel</button>
              ` : ""}
            </div>
          </td>
        </tr>
      `).join("");

      const p = this.rooms.pagination;
      pgen.innerHTML = `
        <div>Showing ${(p.page - 1) * p.limit + 1}–${Math.min(p.page * p.limit, p.total)} of ${p.total} rooms</div>
        <div class="admin-pagination__buttons">
          <button class="admin-btn admin-btn--secondary admin-btn--sm" ${p.page <= 1 ? "disabled" : ""} onclick="window.__ADMIN__.changeRoomsPage(${p.page - 1})">Prev</button>
          <span style="padding: 4px 8px; font-weight: 600;">Page ${p.page} of ${p.totalPages || 1}</span>
          <button class="admin-btn admin-btn--secondary admin-btn--sm" ${p.page >= p.totalPages ? "disabled" : ""} onclick="window.__ADMIN__.changeRoomsPage(${p.page + 1})">Next</button>
        </div>
      `;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; padding: 20px;">Error: ${err.message}</td></tr>`;
    }
  }

  changeRoomsPage(page) {
    this.rooms.pagination.page = page;
    this.fetchRoomsTable();
  }

  async inspectRoom(code) {
    this.openDrawer("Loading Room Details: " + code);
    try {
      const res = await this.api(`/rooms/${code}`);
      const room = res.room;
      const live = res.liveEngineState;

      const content = `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 24px; font-weight: 800; font-family: monospace; color: #818cf8;">Room #${room.code}</div>
          <div style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Owner: <strong>${room.owner?.displayName || "—"}</strong> (${room.owner?.email || ""})</div>
          <div style="margin-top: 8px;">
            <span class="admin-badge ${room.status === "PLAYING" ? "admin-badge--warning" : "admin-badge--neutral"}">${room.status}</span>
            <span class="admin-badge ${live ? "admin-badge--success" : "admin-badge--neutral"}">${live ? "LIVE ENGINE RUNNING" : "NO ACTIVE INSTANCE"}</span>
          </div>
        </div>

        ${live ? `
          <div class="admin-card" style="margin-bottom: 20px; background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.3);">
            <h4 style="margin: 0 0 10px 0; color: #10b981;">⚡ Live Game Telemetry</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
              <div>Current Phase: <strong>${live.phase}</strong></div>
              <div>Current Round: <strong>Round ${live.round}</strong></div>
              <div>Timer Remaining: <strong>${live.timerRemaining}s</strong></div>
              <div>Mode: <strong>${live.gameMode}</strong></div>
            </div>
          </div>

          <h4 style="color: #fff; margin: 20px 0 10px 0; font-size: 14px;">Live Roster (${live.players.length} Players)</h4>
          <div class="admin-table-container" style="margin-bottom: 20px;">
            <table class="admin-table">
              <thead><tr><th>Player</th><th>Role</th><th>Team</th><th>Status</th></tr></thead>
              <tbody>
                ${live.players.map((p) => `
                  <tr>
                    <td>
                      <span style="font-weight: 600; color: #fff;">${p.name}</span>
                      ${p.isModerator ? `<span class="admin-badge admin-badge--warning" style="margin-left: 6px;">CREATOR</span>` : ""}
                    </td>
                    <td><span class="admin-badge admin-badge--primary">${p.role || "Unassigned"}</span></td>
                    <td>${p.team || "—"}</td>
                    <td>${p.isAlive ? `<span style="color: #10b981;">Alive</span>` : `<span style="color: #ef4444;">Dead (R${p.deathRound || "?"})</span>`}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          <div style="margin-top: 20px;">
            <button class="admin-btn admin-btn--danger" onclick="window.__ADMIN__.cancelRoom('${room.code}')">🛑 Terminate / Clean Up Room</button>
          </div>
        ` : `
          <div style="padding: 20px; background: rgba(0,0,0,0.2); border-radius: 8px; color: #64748b; font-size: 13px;">
            This room is not currently loaded in the active Game Engine memory.
          </div>
        `}
      `;

      this.updateDrawerContent(`Room Inspection: ${code}`, content);
    } catch (err) {
      this.updateDrawerContent("Error", `<div style="color: #ef4444;">${err.message}</div>`);
    }
  }

  cancelRoom(code) {
    this.confirmAction({
      title: `Terminate Room ${code}`,
      message: `Are you sure you want to forcibly terminate and cancel Room ${code}? All connected players will be disconnected.`,
      danger: true,
      onConfirm: async () => {
        try {
          await this.api(`/rooms/${code}/cancel`, { method: "POST" });
          this.closeDrawer();
          this.fetchRoomsTable();
        } catch (err) {
          alert(`Failed: ${err.message}`);
        }
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     TAB 4: ACTIVE GAMES MONITOR
     ───────────────────────────────────────────────────────────── */

  async loadActiveGames(silent = false) {
    const body = document.getElementById("admin-body-content");
    if (!silent && body) body.innerHTML = `<div style="padding: 40px; text-align: center; color: #64748b;">Loading live game states...</div>`;

    try {
      const res = await this.api("/games/active");
      this.activeGames = res.activeGames || [];

      if (!body) return;

      if (this.activeGames.length === 0) {
        body.innerHTML = `
          <div class="admin-card" style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 40px; margin-bottom: 12px;">💤</div>
            <h3 style="margin: 0 0 8px 0; color: #fff;">No Active Games Running</h3>
            <p style="color: #64748b; font-size: 14px; max-width: 400px; margin: 0 auto;">
              There are currently no games in progress. When players start games, real-time telemetry will appear here automatically.
            </p>
          </div>
        `;
        return;
      }

      body.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px;">
          ${this.activeGames.map((g) => `
            <div class="admin-card" style="border-left: 4px solid #4f46e5;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div>
                  <span style="font-family: monospace; font-size: 18px; font-weight: 800; color: #fff;">Room #${g.code}</span>
                  <div style="margin-top: 4px;">
                    <span class="admin-badge admin-badge--primary">${g.phase}</span>
                    <span class="admin-badge admin-badge--neutral">Round ${g.round}</span>
                  </div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 20px; font-weight: 700; font-family: monospace; color: #38bdf8;">${g.timerRemaining}s</div>
                  <div style="font-size: 11px; color: #64748b;">Timer</div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; background: rgba(0,0,0,0.25); padding: 12px; border-radius: 8px; font-size: 13px;">
                <div>Alive Players: <strong>${g.aliveCount} / ${g.totalPlayers}</strong></div>
                <div>Mafia Alive: <strong style="color: #ef4444;">${g.mafiaAlive}</strong></div>
                <div>Village Alive: <strong style="color: #10b981;">${g.villageAlive}</strong></div>
                <div>Mode: <strong>${g.gameMode}</strong></div>
              </div>

              <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.inspectRoom('${g.code}')">Inspect Roster</button>
                <button class="admin-btn admin-btn--danger admin-btn--sm" onclick="window.__ADMIN__.terminateGame('${g.code}')">Emergency Stop</button>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    } catch (err) {
      if (body) body.innerHTML = `<div style="color: #ef4444; padding: 30px;">Error: ${err.message}</div>`;
    }
  }

  terminateGame(code) {
    this.confirmAction({
      title: `Terminate Game in Room ${code}`,
      message: `Are you sure you want to stop this active game immediately? The game will be aborted and room reset.`,
      danger: true,
      onConfirm: async () => {
        try {
          await this.api(`/games/${code}/terminate`, { method: "POST" });
          this.loadActiveGames();
        } catch (err) {
          alert(`Termination failed: ${err.message}`);
        }
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     TAB 5: GAME HISTORY
     ───────────────────────────────────────────────────────────── */

  async loadGames() {
    const body = document.getElementById("admin-body-content");
    body.innerHTML = `
      <div class="admin-filter-bar">
        <div style="display: flex; gap: 10px; align-items: center;">
          <select id="game-winner-select" class="admin-select">
            <option value="">All Winners</option>
            <option value="MAFIA">MAFIA</option>
            <option value="VILLAGE">VILLAGE</option>
          </select>
          <button id="game-filter-btn" class="admin-btn admin-btn--primary admin-btn--sm">Filter</button>
        </div>
        <div>
          <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.exportData('games')">📥 Export CSV</button>
        </div>
      </div>

      <div class="admin-card" style="padding: 0;">
        <div class="admin-table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Game ID</th>
                <th>Room</th>
                <th>Winner</th>
                <th>Players</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="games-table-body">
              <tr><td colspan="7" style="text-align: center; color: #64748b; padding: 30px;">Loading game history...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-pagination" id="games-pagination-controls"></div>
    `;

    document.getElementById("game-filter-btn").onclick = () => {
      this.games.winnerTeam = document.getElementById("game-winner-select").value;
      this.games.pagination.page = 1;
      this.fetchGamesTable();
    };

    this.fetchGamesTable();
  }

  async fetchGamesTable() {
    const tbody = document.getElementById("games-table-body");
    const pgen = document.getElementById("games-pagination-controls");
    if (!tbody) return;

    try {
      const q = new URLSearchParams({
        page: this.games.pagination.page,
        limit: this.games.pagination.limit,
        winnerTeam: this.games.winnerTeam
      });

      const res = await this.api(`/games?${q.toString()}`);
      this.games.list = res.games || [];
      this.games.pagination = res.pagination || this.games.pagination;

      if (this.games.list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 40px;">No completed games recorded yet.</td></tr>`;
        pgen.innerHTML = "";
        return;
      }

      tbody.innerHTML = this.games.list.map((g) => `
        <tr>
          <td><span style="font-family: monospace; font-size: 12px; color: #94a3b8;">${g.id.slice(0, 8)}...</span></td>
          <td><span style="font-family: monospace; font-weight: 700; color: #818cf8;">${g.Room?.code || "—"}</span></td>
          <td>
            <span class="admin-badge ${g.winnerTeam === "MAFIA" ? "admin-badge--danger" : g.winnerTeam ? "admin-badge--success" : "admin-badge--neutral"}">
              ${g.winnerTeam || "DRAW"}
            </span>
          </td>
          <td>${g.playerCount} players</td>
          <td style="color: #94a3b8; font-size: 12px;">${new Date(g.startedAt).toLocaleString()}</td>
          <td style="font-family: monospace; font-size: 12px; color: #fff;">
            ${g.durationSeconds ? `${Math.floor(g.durationSeconds / 60)}m ${g.durationSeconds % 60}s` : "—"}
          </td>
          <td>
            <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.inspectGame('${g.id}')">Details</button>
          </td>
        </tr>
      `).join("");

      const p = this.games.pagination;
      pgen.innerHTML = `
        <div>Showing ${(p.page - 1) * p.limit + 1}–${Math.min(p.page * p.limit, p.total)} of ${p.total} games</div>
        <div class="admin-pagination__buttons">
          <button class="admin-btn admin-btn--secondary admin-btn--sm" ${p.page <= 1 ? "disabled" : ""} onclick="window.__ADMIN__.changeGamesPage(${p.page - 1})">Prev</button>
          <span style="padding: 4px 8px; font-weight: 600;">Page ${p.page} of ${p.totalPages || 1}</span>
          <button class="admin-btn admin-btn--secondary admin-btn--sm" ${p.page >= p.totalPages ? "disabled" : ""} onclick="window.__ADMIN__.changeGamesPage(${p.page + 1})">Next</button>
        </div>
      `;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; padding: 20px;">Error: ${err.message}</td></tr>`;
    }
  }

  changeGamesPage(page) {
    this.games.pagination.page = page;
    this.fetchGamesTable();
  }

  async inspectGame(gameId) {
    this.openDrawer("Loading Game Report...");
    try {
      const res = await this.api(`/games/${gameId}`);
      const game = res.game;
      const players = game.GamePlayers || [];

      const content = `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 13px; color: #64748b; text-transform: uppercase;">Game ID: ${game.id}</div>
          <div style="font-size: 20px; font-weight: 800; color: #fff; margin-top: 4px;">
            Winner: <span style="color: ${game.winnerTeam === "MAFIA" ? "#ef4444" : "#10b981"};">${game.winnerTeam || "None"}</span>
          </div>
          <div style="font-size: 13px; color: #94a3b8; margin-top: 6px;">
            Room: <strong>${game.Room?.code || "—"}</strong> | Duration: <strong>${game.durationSeconds ? `${Math.floor(game.durationSeconds / 60)}m ${game.durationSeconds % 60}s` : "—"}</strong>
          </div>
        </div>

        <h4 style="color: #fff; margin: 20px 0 10px 0; font-size: 14px;">Player Performance Roster (${players.length})</h4>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead><tr><th>Player</th><th>Role</th><th>Team</th><th>Outcome</th></tr></thead>
            <tbody>
              ${players.map((p) => {
                const won = p.team === game.winnerTeam;
                return `
                  <tr>
                    <td>
                      <div style="font-weight: 600; color: #fff;">${p.User?.displayName || "Player"}</div>
                      <div style="font-size: 11px; color: #64748b;">${p.User?.email || ""}</div>
                    </td>
                    <td><span class="admin-badge admin-badge--primary">${p.role}</span></td>
                    <td>${p.team}</td>
                    <td>
                      <span class="admin-badge ${won ? "admin-badge--success" : "admin-badge--danger"}">${won ? "WINNER" : "DEFEAT"}</span>
                      <div style="font-size: 11px; color: ${p.isAlive ? "#10b981" : "#64748b"}; margin-top: 2px;">
                        ${p.isAlive ? "Survived" : `Eliminated (R${p.deathRound || "?"})`}
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;

      this.updateDrawerContent("Game Report", content);
    } catch (err) {
      this.updateDrawerContent("Error", `<div style="color: #ef4444;">${err.message}</div>`);
    }
  }

  /* ─────────────────────────────────────────────────────────────
     TAB 6: ANALYTICS
     ───────────────────────────────────────────────────────────── */

  async loadAnalytics() {
    const body = document.getElementById("admin-body-content");
    body.innerHTML = `<div style="padding: 40px; text-align: center; color: #64748b;">Compiling telemetry analytics...</div>`;

    try {
      const data = await this.api("/analytics");
      const roles = data.roleDistribution || {};
      const team = data.teamPerformance || {};

      body.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px;">
          <!-- Team Win Performance -->
          <div class="admin-card">
            <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #fff;">🏆 Team Win Performance</h3>
            <div style="margin-bottom: 20px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px;">
                <span style="font-weight: 700; color: #ef4444;">Mafia Win Rate (${team.mafiaWinRate || 0}%)</span>
                <span>${team.mafiaWins || 0} wins</span>
              </div>
              <div style="height: 10px; background: #1f2937; border-radius: 999px; overflow: hidden;">
                <div style="height: 100%; width: ${team.mafiaWinRate || 0}%; background: #ef4444;"></div>
              </div>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px;">
                <span style="font-weight: 700; color: #10b981;">Village Win Rate (${team.villageWinRate || 0}%)</span>
                <span>${team.villageWins || 0} wins</span>
              </div>
              <div style="height: 10px; background: #1f2937; border-radius: 999px; overflow: hidden;">
                <div style="height: 100%; width: ${team.villageWinRate || 0}%; background: #10b981;"></div>
              </div>
            </div>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--adm-border); font-size: 13px; color: #94a3b8;">
              Total Completed Matches: <strong>${team.totalGamesFinished || 0}</strong>
            </div>
          </div>

          <!-- Role Distribution -->
          <div class="admin-card">
            <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #fff;">🎭 Gameplay Role Assignments</h3>
            <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
              <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>🔪 Mafia</span>
                  <span style="font-weight: 700;">${roles.mafia || 0}</span>
                </div>
                <div style="height: 6px; background: #1f2937; border-radius: 999px; overflow: hidden;">
                  <div style="height: 100%; width: ${roles.totalAssigned ? (roles.mafia / roles.totalAssigned) * 100 : 0}%; background: #ef4444;"></div>
                </div>
              </div>

              <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>💊 Doctor</span>
                  <span style="font-weight: 700;">${roles.doctor || 0}</span>
                </div>
                <div style="height: 6px; background: #1f2937; border-radius: 999px; overflow: hidden;">
                  <div style="height: 100%; width: ${roles.totalAssigned ? (roles.doctor / roles.totalAssigned) * 100 : 0}%; background: #10b981;"></div>
                </div>
              </div>

              <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>🔍 Officer</span>
                  <span style="font-weight: 700;">${roles.officer || 0}</span>
                </div>
                <div style="height: 6px; background: #1f2937; border-radius: 999px; overflow: hidden;">
                  <div style="height: 100%; width: ${roles.totalAssigned ? (roles.officer / roles.totalAssigned) * 100 : 0}%; background: #3b82f6;"></div>
                </div>
              </div>

              <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>👤 Villager / Citizen</span>
                  <span style="font-weight: 700;">${roles.villager || 0}</span>
                </div>
                <div style="height: 6px; background: #1f2937; border-radius: 999px; overflow: hidden;">
                  <div style="height: 100%; width: ${roles.totalAssigned ? (roles.villager / roles.totalAssigned) * 100 : 0}%; background: #f59e0b;"></div>
                </div>
              </div>
            </div>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--adm-border); font-size: 13px; color: #94a3b8;">
              Total Role Assignments Recorded: <strong>${roles.totalAssigned || 0}</strong>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      body.innerHTML = `<div style="color: #ef4444; padding: 30px;">Error: ${err.message}</div>`;
    }
  }

  /* ─────────────────────────────────────────────────────────────
     TAB 7: AUDIT LOGS
     ───────────────────────────────────────────────────────────── */

  async loadAudit() {
    const body = document.getElementById("admin-body-content");
    body.innerHTML = `
      <div class="admin-filter-bar">
        <div style="display: flex; gap: 10px; align-items: center;">
          <select id="audit-action-select" class="admin-select">
            <option value="">All Actions</option>
            <option value="ADMIN_LOGIN">ADMIN_LOGIN</option>
            <option value="BLOCK_USER">BLOCK_USER</option>
            <option value="UNBLOCK_USER">UNBLOCK_USER</option>
            <option value="CHANGE_ROLE">CHANGE_ROLE</option>
            <option value="CANCEL_ROOM">CANCEL_ROOM</option>
            <option value="TERMINATE_GAME">TERMINATE_GAME</option>
            <option value="EXPORT_DATA">EXPORT_DATA</option>
          </select>
          <button id="audit-filter-btn" class="admin-btn admin-btn--primary admin-btn--sm">Filter</button>
        </div>
        <div>
          <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.exportData('audit')">📥 Export CSV</button>
        </div>
      </div>

      <div class="admin-card" style="padding: 0;">
        <div class="admin-table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Target</th>
                <th>IP Address</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="audit-table-body">
              <tr><td colspan="6" style="text-align: center; color: #64748b; padding: 30px;">Loading audit logs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-pagination" id="audit-pagination-controls"></div>
    `;

    document.getElementById("audit-filter-btn").onclick = () => {
      this.audit.action = document.getElementById("audit-action-select").value;
      this.audit.pagination.page = 1;
      this.fetchAuditTable();
    };

    this.fetchAuditTable();
  }

  async fetchAuditTable() {
    const tbody = document.getElementById("audit-table-body");
    const pgen = document.getElementById("audit-pagination-controls");
    if (!tbody) return;

    try {
      const q = new URLSearchParams({
        page: this.audit.pagination.page,
        limit: this.audit.pagination.limit,
        action: this.audit.action
      });

      const res = await this.api(`/audit?${q.toString()}`);
      this.audit.list = res.logs || [];
      this.audit.pagination = res.pagination || this.audit.pagination;

      if (this.audit.list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 40px;">No audit records found.</td></tr>`;
        pgen.innerHTML = "";
        return;
      }

      tbody.innerHTML = this.audit.list.map((a) => `
        <tr>
          <td style="color: #94a3b8; font-size: 12px; font-family: monospace;">${new Date(a.createdAt).toLocaleString()}</td>
          <td style="font-weight: 600; color: #fff;">${a.adminEmail}</td>
          <td><span class="admin-badge ${a.status === "SUCCESS" ? "admin-badge--success" : "admin-badge--danger"}">${a.action}</span></td>
          <td><span style="font-family: monospace; font-size: 12px; color: #818cf8;">${a.targetType || "—"}: ${a.targetId || ""}</span></td>
          <td style="color: #64748b; font-size: 12px; font-family: monospace;">${a.ipAddress || "—"}</td>
          <td><span class="admin-badge ${a.status === "SUCCESS" ? "admin-badge--success" : "admin-badge--danger"}">${a.status}</span></td>
        </tr>
      `).join("");

      const p = this.audit.pagination;
      pgen.innerHTML = `
        <div>Showing ${(p.page - 1) * p.limit + 1}–${Math.min(p.page * p.limit, p.total)} of ${p.total} logs</div>
        <div class="admin-pagination__buttons">
          <button class="admin-btn admin-btn--secondary admin-btn--sm" ${p.page <= 1 ? "disabled" : ""} onclick="window.__ADMIN__.changeAuditPage(${p.page - 1})">Prev</button>
          <span style="padding: 4px 8px; font-weight: 600;">Page ${p.page} of ${p.totalPages || 1}</span>
          <button class="admin-btn admin-btn--secondary admin-btn--sm" ${p.page >= p.totalPages ? "disabled" : ""} onclick="window.__ADMIN__.changeAuditPage(${p.page + 1})">Next</button>
        </div>
      `;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="color: #ef4444; padding: 20px;">Error: ${err.message}</td></tr>`;
    }
  }

  changeAuditPage(page) {
    this.audit.pagination.page = page;
    this.fetchAuditTable();
  }

  /* ─────────────────────────────────────────────────────────────
     TAB 8: SYSTEM HEALTH
     ───────────────────────────────────────────────────────────── */

  async loadSystem() {
    const body = document.getElementById("admin-body-content");
    body.innerHTML = `<div style="padding: 40px; text-align: center; color: #64748b;">Querying server health...</div>`;

    try {
      const data = await this.api("/system");
      const h = data.health || {};
      const db = data.database || {};
      const sock = data.socket || {};
      const mem = data.memory || {};

      body.innerHTML = `
        <div class="admin-kpi-grid">
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Server Status</div>
            <div class="admin-kpi-card__value" style="color: #10b981;">${h.serverStatus}</div>
            <div class="admin-kpi-card__sub">Port ${h.port} (${h.environment})</div>
          </div>
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">MySQL Database</div>
            <div class="admin-kpi-card__value" style="color: ${db.status === "CONNECTED" ? "#10b981" : "#ef4444"};">${db.status}</div>
            <div class="admin-kpi-card__sub">${db.latencyMs}ms query latency</div>
          </div>
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Socket.IO Engine</div>
            <div class="admin-kpi-card__value" style="color: #38bdf8;">${sock.status}</div>
            <div class="admin-kpi-card__sub">${sock.connectedSockets} connected sockets</div>
          </div>
          <div class="admin-kpi-card">
            <div class="admin-kpi-card__label">Heap Memory</div>
            <div class="admin-kpi-card__value" style="color: #f59e0b;">${mem.heapUsedMb} MB</div>
            <div class="admin-kpi-card__sub">${mem.heapTotalMb} MB allocated (RSS: ${mem.rssMb}MB)</div>
          </div>
        </div>

        <div class="admin-card">
          <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #fff;">⚙️ Infrastructure Telemetry</h3>
          <table class="admin-table">
            <tbody>
              <tr><td style="color: #94a3b8; width: 220px;">Node.js Runtime</td><td style="font-family: monospace; font-weight: 700;">${h.nodeVersion}</td></tr>
              <tr><td style="color: #94a3b8;">Host Platform</td><td style="font-family: monospace;">${h.platform}</td></tr>
              <tr><td style="color: #94a3b8;">Process Uptime</td><td style="font-family: monospace;">${this.formatUptime(h.uptimeSeconds)}</td></tr>
              <tr><td style="color: #94a3b8;">Database Engine</td><td>MySQL 8+ (Sequelize ORM)</td></tr>
              <tr><td style="color: #94a3b8;">Server Time (UTC)</td><td style="font-family: monospace;">${h.timestamp}</td></tr>
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      body.innerHTML = `<div style="color: #ef4444; padding: 30px;">Error: ${err.message}</div>`;
    }
  }

  /* ─────────────────────────────────────────────────────────────
     TAB 9: PROFILE & SETTINGS
     ───────────────────────────────────────────────────────────── */

  loadProfile() {
    const body = document.getElementById("admin-body-content");
    body.innerHTML = `
      <div class="admin-card" style="max-width: 600px;">
        <h3 style="margin: 0 0 16px 0; color: #fff;">Super Admin Profile</h3>
        <form id="admin-profile-form">
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px;">DISPLAY NAME</label>
            <input id="prof-name" class="admin-input" style="width: 100%; box-sizing: border-box;" value="${this.adminUser?.displayName || ""}" required />
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px;">EMAIL (READ ONLY)</label>
            <input class="admin-input" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); color: #64748b;" value="${this.adminUser?.email || ""}" disabled />
          </div>

          <hr style="border: none; border-top: 1px solid var(--adm-border); margin: 24px 0;" />

          <h4 style="margin: 0 0 14px 0; color: #fff;">Change Password</h4>
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px;">CURRENT PASSWORD</label>
            <input id="prof-curr-pass" type="password" class="admin-input" style="width: 100%; box-sizing: border-box;" placeholder="Enter current password to make changes" />
          </div>
          <div style="margin-bottom: 24px;">
            <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px;">NEW PASSWORD</label>
            <input id="prof-new-pass" type="password" class="admin-input" style="width: 100%; box-sizing: border-box;" placeholder="Minimum 8 characters" />
          </div>

          <button type="submit" class="admin-btn admin-btn--primary">Save Changes</button>
        </form>
      </div>
    `;

    document.getElementById("admin-profile-form").onsubmit = async (e) => {
      e.preventDefault();
      const displayName = document.getElementById("prof-name").value.trim();
      const currentPassword = document.getElementById("prof-curr-pass").value.trim();
      const newPassword = document.getElementById("prof-new-pass").value.trim();

      try {
        const payload = { displayName };
        if (newPassword) {
          payload.currentPassword = currentPassword;
          payload.newPassword = newPassword;
        }

        const res = await this.api("/auth/profile", {
          method: "PUT",
          body: JSON.stringify(payload)
        });

        if (res.success) {
          this.adminUser = res.user;
          alert("Profile updated successfully!");
          this.switchTab("overview");
        }
      } catch (err) {
        alert("Update failed: " + err.message);
      }
    };
  }

  /* ─────────────────────────────────────────────────────────────
     DRAWER & MODAL UTILITIES
     ───────────────────────────────────────────────────────────── */

  openDrawer(title, content = "Loading...") {
    const root = document.getElementById("admin-drawer-root");
    if (!root) return;
    root.innerHTML = `
      <div class="admin-drawer-overlay" onclick="if(event.target === this) window.__ADMIN__.closeDrawer()">
        <div class="admin-drawer">
          <div class="admin-drawer__header">
            <h3 id="admin-drawer-title" style="margin: 0; font-size: 16px; color: #fff;">${title}</h3>
            <button class="admin-btn admin-btn--secondary admin-btn--sm" onclick="window.__ADMIN__.closeDrawer()">✕</button>
          </div>
          <div class="admin-drawer__body" id="admin-drawer-body">
            ${content}
          </div>
        </div>
      </div>
    `;
  }

  updateDrawerContent(title, content) {
    const titleEl = document.getElementById("admin-drawer-title");
    const bodyEl = document.getElementById("admin-drawer-body");
    if (titleEl) titleEl.innerText = title;
    if (bodyEl) bodyEl.innerHTML = content;
  }

  closeDrawer() {
    const root = document.getElementById("admin-drawer-root");
    if (root) root.innerHTML = "";
  }

  confirmAction({ title, message, danger = false, onConfirm }) {
    const root = document.getElementById("admin-modal-root");
    if (!root) return;
    root.innerHTML = `
      <div class="admin-modal-overlay">
        <div class="admin-modal">
          <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 16px;">${title}</h3>
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0 0 20px 0;">${message}</p>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="admin-btn admin-btn--secondary" onclick="window.__ADMIN__.closeModal()">Cancel</button>
            <button id="admin-modal-confirm-btn" class="admin-btn ${danger ? "admin-btn--danger" : "admin-btn--primary"}">
              Confirm Action
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("admin-modal-confirm-btn").onclick = () => {
      this.closeModal();
      if (typeof onConfirm === "function") onConfirm();
    };
  }

  closeModal() {
    const root = document.getElementById("admin-modal-root");
    if (root) root.innerHTML = "";
  }

  exportData(entity) {
    if (!this.token) return;
    window.open(`/api/admin/export/${entity}?token=${encodeURIComponent(this.token)}`, "_blank");
  }

  formatUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }
}

export function renderAdminConsole(container) {
  const admin = new AdminConsole();
  window.__ADMIN__ = admin;
  admin.init(container);
  return admin;
}

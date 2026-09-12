/**
 * Online Go - Admin Backoffice Controller
 * Comprehensive owner-only management panel
 */

// State
let adminKey = sessionStorage.getItem('online_go_admin_key') || '';
let currentUsers = [];
let currentRooms = [];
let currentGames = [];

// Socket.io Real-time connection
const adminSocket = typeof io !== 'undefined' ? io() : null;
if (adminSocket) {
  adminSocket.on('connect', () => {
    updateLiveSyncBadge(true);
  });
  adminSocket.on('disconnect', () => {
    updateLiveSyncBadge(false);
  });
  adminSocket.on('admin_event', () => {
    if (adminKey && mainDashboard.style.display !== 'none') {
      loadAllAdminData();
    }
  });
}

function updateLiveSyncBadge(isLive) {
  const badge = document.getElementById('liveSyncBadge');
  if (!badge) return;
  if (isLive) {
    badge.innerHTML = '🟢 ซิงก์ข้อมูลสด (Real-time)';
    badge.className = 'badge-pill badge-green';
  } else {
    badge.innerHTML = '🟡 ออฟไลน์ (Polling 3s)';
    badge.className = 'badge-pill badge-red';
  }
}

// DOM Elements
const authOverlay = document.getElementById('authOverlay');
const mainDashboard = document.getElementById('mainDashboard');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminKeyInput = document.getElementById('adminKeyInput');
const btnLogoutAdmin = document.getElementById('btnLogoutAdmin');
const btnRefreshData = document.getElementById('btnRefreshData');

// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Badges & Stats
const userCountBadge = document.getElementById('userCountBadge');
const roomCountBadge = document.getElementById('roomCountBadge');
const gameCountBadge = document.getElementById('gameCountBadge');

const statUsers = document.getElementById('statUsers');
const statRooms = document.getElementById('statRooms');
const statGames = document.getElementById('statGames');
const statUptime = document.getElementById('statUptime');
const statServerTime = document.getElementById('statServerTime');

// Diagnostics
const diagNodeVersion = document.getElementById('diagNodeVersion');
const diagPlatform = document.getElementById('diagPlatform');
const diagMemRss = document.getElementById('diagMemRss');
const diagMemHeap = document.getElementById('diagMemHeap');

// Tables
const usersTableBody = document.getElementById('usersTableBody');
const userSearchInput = document.getElementById('userSearchInput');
const roomsTableBody = document.getElementById('roomsTableBody');
const gamesTableBody = document.getElementById('gamesTableBody');

// Password Reset Requests Elements
const resetBadge = document.getElementById('resetBadge');
const resetRequestsBox = document.getElementById('resetRequestsBox');
const resetRequestsCount = document.getElementById('resetRequestsCount');
const resetRequestsTableBody = document.getElementById('resetRequestsTableBody');
const btnRefreshResetRequests = document.getElementById('btnRefreshResetRequests');

// Reset Password Modal
const resetPasswordModal = document.getElementById('resetPasswordModal');
const resetPasswordForm = document.getElementById('resetPasswordForm');
const resetTargetUsername = document.getElementById('resetTargetUsername');
const resetTargetId = document.getElementById('resetTargetId');
const newPasswordInput = document.getElementById('newPasswordInput');
const btnCancelReset = document.getElementById('btnCancelReset');

// Broadcast
const broadcastForm = document.getElementById('broadcastForm');
const broadcastInput = document.getElementById('broadcastInput');
const broadcastDurationSelect = document.getElementById('broadcastDurationSelect');
const btnClearBroadcast = document.getElementById('btnClearBroadcast');
const activeBroadcastCard = document.getElementById('activeBroadcastCard');
const activeBroadcastTimerBadge = document.getElementById('activeBroadcastTimerBadge');
const activeBroadcastText = document.getElementById('activeBroadcastText');

// Toast
const adminToast = document.getElementById('adminToast');
let toastTimer = null;

function showToast(message, isError = false) {
  if (toastTimer) clearTimeout(toastTimer);
  adminToast.textContent = message;
  adminToast.style.borderLeftColor = isError ? '#f85149' : '#3fb950';
  adminToast.style.display = 'block';
  toastTimer = setTimeout(() => {
    adminToast.style.display = 'none';
  }, 3500);
}

// API Fetch Helper with Admin Key
async function adminFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-key': adminKey,
    ...(options.headers || {})
  };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 403) {
    sessionStorage.removeItem('online_go_admin_key');
    adminKey = '';
    showLogin();
    throw new Error('Master Admin Key ไม่ถูกต้อง หรือหมดอายุการเชื่อมต่อ');
  }
  return res.json();
}

// Show / Hide Views
function showLogin() {
  authOverlay.style.display = 'flex';
  mainDashboard.style.display = 'none';
  adminKeyInput.value = '';
  adminKeyInput.focus();
}

function showDashboard() {
  authOverlay.style.display = 'none';
  mainDashboard.style.display = 'block';
  loadAllAdminData();
}

// Format Seconds to Readable Uptime
function formatUptime(seconds) {
  if (!seconds || isNaN(seconds)) return '0 นาที';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d} วัน`);
  if (h > 0) parts.push(`${h} ชม.`);
  if (m > 0) parts.push(`${m} นาที`);
  parts.push(`${s} วิ`);
  return parts.join(' ');
}

// Load All Dashboard Data
async function loadAllAdminData() {
  if (!adminKey) return;
  try {
    await Promise.all([
      loadStats(),
      loadUsers(),
      loadResetRequests(),
      loadRooms(),
      loadGames(),
      refreshActiveBroadcastStatus()
    ]);
  } catch (err) {
    console.error('Error loading admin data:', err);
    showToast(err.message, true);
  }
}

// 1. Load Stats
async function loadStats() {
  const data = await adminFetch('/api/admin/stats');
  if (data.success && data.stats) {
    const s = data.stats;
    statUsers.textContent = s.totalUsers.toLocaleString();
    statRooms.textContent = s.activeRooms.toLocaleString();
    statGames.textContent = s.totalGames.toLocaleString();
    statUptime.textContent = formatUptime(s.uptimeSeconds);
    statServerTime.textContent = `Server: ${new Date(s.serverTime).toLocaleTimeString('th-TH')}`;

    userCountBadge.textContent = s.totalUsers;
    roomCountBadge.textContent = s.activeRooms;
    gameCountBadge.textContent = s.totalGames;

    diagNodeVersion.textContent = s.nodeVersion;
    diagPlatform.textContent = s.platform;
    diagMemRss.textContent = `${s.memoryUsageMB.rss} MB`;
    diagMemHeap.textContent = `${s.memoryUsageMB.heapUsed} MB / ${s.memoryUsageMB.heapTotal} MB`;
  }
}

// 2. Load Users
async function loadUsers() {
  const data = await adminFetch('/api/admin/users');
  if (data.success) {
    currentUsers = data.users || [];
    renderUsersTable(currentUsers);
  }
}

// Password Reset Requests Management
async function loadResetRequests() {
  try {
    const res = await adminFetch('/api/admin/reset-requests');
    if (res && res.success) {
      renderResetRequests(res.requests || []);
    }
  } catch (err) {
    console.error('Error loading reset requests:', err);
  }
}

function renderResetRequests(requests) {
  if (!resetRequestsTableBody) return;
  const pending = requests.filter(r => r.status === 'pending');

  if (resetBadge) {
    if (pending.length > 0) {
      resetBadge.textContent = `${pending.length} ขอรีเซ็ต`;
      resetBadge.style.display = 'inline-block';
    } else {
      resetBadge.style.display = 'none';
    }
  }

  if (resetRequestsCount) {
    resetRequestsCount.textContent = pending.length;
  }

  if (resetRequestsBox) {
    resetRequestsBox.style.display = requests.length > 0 ? 'block' : 'none';
  }

  resetRequestsTableBody.innerHTML = '';
  if (requests.length === 0) {
    resetRequestsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #8b949e; padding: 1rem;">ไม่มีคำขอรีเซ็ตรหัสผ่านค้างอยู่</td></tr>';
    return;
  }

  requests.forEach(r => {
    const tr = document.createElement('tr');
    const isPending = r.status === 'pending';
    const dateStr = new Date(r.createdAt).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    let statusBadge = '';
    if (r.status === 'pending') {
      statusBadge = '<span class="badge-pill badge-yellow">รอดำเนินการ</span>';
    } else if (r.status === 'approved_code') {
      statusBadge = `<span class="badge-pill badge-green">⚡ ออกรหัส OTP: ${escapeHtml(r.otpCode || '-')}</span>`;
    } else {
      statusBadge = `<span class="badge-pill badge-green">ดำเนินการแล้ว (${escapeHtml(r.tempPassword || 'สำเร็จ')})</span>`;
    }

    const actions = isPending ? `
      <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
        <button class="btn-sm btn-sm-primary" onclick="handleGenerateResetCode('${escapeHtml(r.id)}', '${escapeHtml(r.username)}')">⚡ ออกรหัส OTP 6 หลัก</button>
        <button class="btn-sm btn-outline" onclick="handleResolveResetPrompt('${escapeHtml(r.id)}', '${escapeHtml(r.username)}')">🔑 ตั้งรหัสให้</button>
        <button class="btn-sm btn-sm-danger" onclick="handleDeleteResetRequest('${escapeHtml(r.id)}')">ลบ</button>
      </div>
    ` : `
      <button class="btn-sm btn-outline" onclick="handleDeleteResetRequest('${escapeHtml(r.id)}')">ลบ</button>
    `;

    tr.innerHTML = `
      <td>${dateStr}</td>
      <td><strong style="color: var(--admin-accent); font-size: 0.92rem;">${escapeHtml(r.username)}</strong></td>
      <td>${escapeHtml(r.note || '-')}</td>
      <td>${statusBadge}</td>
      <td>${actions}</td>
    `;
    resetRequestsTableBody.appendChild(tr);
  });
}

window.handleGenerateResetCode = function(requestId, username) {
  adminFetch(`/api/admin/reset-requests/${requestId}/generate-code`, {
    method: 'POST'
  }).then(res => {
    if (res.success) {
      loadResetRequests();
      navigator.clipboard.writeText(res.code).catch(() => {});
      alert(`✅ ออกรหัส OTP 6 หลักให้คุณ "${username}" สำเร็จ!\n\nรหัส OTP คือ: ${res.code}\n(คัดลอกลงคลิปบอร์ดแล้ว)\n\n👉 ส่งเลข 6 หลักนี้ให้ผู้เล่น นำไปกรอกที่หน้าเว็บเพื่อ "พิมพ์ตั้งรหัสผ่านใหม่ด้วยตัวเอง" ได้เลยครับ!`);
      showToast(`สร้างรหัส OTP 6 หลักสำเร็จ: ${res.code}`);
    } else {
      showToast(res.message || 'เกิดข้อผิดพลาด', true);
    }
  }).catch(err => showToast(err.message, true));
};

window.handleResolveResetPrompt = function(requestId, username) {
  const newPass = prompt(`กำหนดรหัสผ่านใหม่ให้กับผู้เล่น "${username}":`, '123456');
  if (!newPass || newPass.trim().length < 4) {
    if (newPass !== null) alert('รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
    return;
  }

  adminFetch(`/api/admin/reset-requests/${requestId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ newPassword: newPass.trim() })
  }).then(res => {
    if (res.success) {
      showToast(`🔑 รีเซ็ตรหัสผ่านให้ "${username}" เป็น "${newPass.trim()}" เรียบร้อยแล้ว!`);
      loadResetRequests();
      loadUsers();
      navigator.clipboard.writeText(newPass.trim()).catch(() => {});
      alert(`รีเซ็ตรหัสผ่านให้คุณ "${username}" สำเร็จ!\nรหัสผ่านใหม่คือ: ${newPass.trim()}\n(คัดลอกลงคลิปบอร์ดแล้ว สามารถส่งต่อให้ผู้เล่นได้ทันที)`);
    } else {
      showToast(res.message || 'เกิดข้อผิดพลาด', true);
    }
  }).catch(err => showToast(err.message, true));
};

window.handleDeleteResetRequest = function(requestId) {
  if (!confirm('ต้องการลบรายการคำขอนี้หรือไม่?')) return;
  adminFetch(`/api/admin/reset-requests/${requestId}`, {
    method: 'DELETE'
  }).then(res => {
    if (res.success) {
      showToast('ลบรายการคำขอเรียบร้อยแล้ว');
      loadResetRequests();
    } else {
      showToast(res.message || 'ลบไม่สำเร็จ', true);
    }
  }).catch(err => showToast(err.message, true));
};

function renderUsersTable(usersToRender) {
  usersTableBody.innerHTML = '';
  if (!usersToRender || usersToRender.length === 0) {
    usersTableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #8b949e; padding: 2rem;">ไม่พบข้อมูลผู้ใช้</td></tr>';
    return;
  }

  usersToRender.forEach((u, index) => {
    const tr = document.createElement('tr');

    const created = u.createdAt && u.createdAt !== 'ไม่ระบุ' 
      ? new Date(u.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'ไม่ระบุ';

    const stats = u.stats || { totalGames: 0, wins: 0, losses: 0, winRate: 0 };
    const displayPassword = u.plainPassword || '(ไม่ได้บันทึก)';
    const displayEmail = u.email && u.email !== '-' ? u.email : '-';

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <strong style="color: #f0f6fc; font-size: 0.95rem;">${escapeHtml(u.username)}</strong>
      </td>
      <td>
        ${displayEmail !== '-' 
          ? `<span style="color: #79c0ff; font-size: 0.88rem;">${escapeHtml(displayEmail)}</span>` 
          : '<span style="color: #6e7681;">-</span>'}
      </td>
      <td>
        <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 0.25rem 0.5rem;">
          <span style="font-family: 'Fira Code', monospace; color: #ffd166; font-weight: 600; font-size: 0.9rem;" id="pwd_val_${index}">${escapeHtml(displayPassword)}</span>
          <button type="button" class="btn-sm" style="padding: 0.15rem 0.35rem; font-size: 0.75rem; background: rgba(88, 166, 255, 0.15); color: #58a6ff; border: none; border-radius: 4px; cursor: pointer;" title="คัดลอกรหัสผ่าน" onclick="copyToClipboard('${escapeHtml(displayPassword)}', 'คัดลอกรหัสผ่านแล้ว')">📋</button>
        </div>
      </td>
      <td>
        ${u.recoveryPin && u.recoveryPin !== '-' 
          ? `<span class="badge-pill badge-yellow" style="font-family: monospace; font-size: 0.88rem; letter-spacing: 1px;">${escapeHtml(u.recoveryPin)}</span>` 
          : '<span style="color: #6e7681;">-</span>'}
      </td>
      <td><span class="code-box" title="คลิกเพื่อคัดลอก User ID" onclick="copyToClipboard('${u.id}', 'คัดลอก User ID แล้ว')">${u.id}</span></td>
      <td><span style="font-size: 0.85rem; color: #8b949e;">${created}</span></td>
      <td>
        <span class="badge-pill badge-green">ชนะ ${stats.wins}</span>
        <span class="badge-pill badge-red">แพ้ ${stats.losses}</span>
        <span style="font-size: 0.8rem; color: #8b949e; margin-left: 0.3rem;">(${stats.winRate}%)</span>
      </td>
      <td>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn-sm btn-sm-warning" onclick="openResetPasswordModal('${u.id}', '${escapeHtml(u.username)}')">🔑 เปลี่ยนรหัส</button>
          <button class="btn-sm btn-sm-danger" onclick="confirmDeleteUser('${u.id}', '${escapeHtml(u.username)}')">🗑️ ลบ</button>
        </div>
      </td>
    `;
    usersTableBody.appendChild(tr);
  });
}

// 3. Load Live Rooms
async function loadRooms() {
  const data = await adminFetch('/api/admin/rooms');
  if (data.success) {
    currentRooms = data.rooms || [];
    renderRoomsTable(currentRooms);
    roomCountBadge.textContent = currentRooms.length;
    statRooms.textContent = currentRooms.length;
  }
}

function renderRoomsTable(rooms) {
  roomsTableBody.innerHTML = '';
  if (!rooms || rooms.length === 0) {
    roomsTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #8b949e; padding: 2rem;">ไม่มีห้องที่กำลังเล่นหรือเปิดอยู่ขณะนี้</td></tr>';
    return;
  }

  rooms.forEach(r => {
    const tr = document.createElement('tr');
    const black = r.black 
      ? `<span class="badge-pill ${r.black.connected ? 'badge-green' : 'badge-red'}">⚫ ${escapeHtml(r.black.name)} ${r.black.connected ? '(ออนไลน์)' : '(หลุด)'}</span>` 
      : '<span style="color: #8b949e;">รอผู้เล่น...</span>';

    const white = r.white 
      ? `<span class="badge-pill ${r.white.connected ? 'badge-green' : 'badge-red'}">⚪ ${escapeHtml(r.white.name)} ${r.white.connected ? '(ออนไลน์)' : '(หลุด)'}</span>` 
      : '<span style="color: #8b949e;">รอผู้เล่น...</span>';

    const modeBadge = r.isBotGame 
      ? `<span class="badge-pill badge-blue">🤖 vs บอท (${r.botLevel || 'บอท'})</span>` 
      : '<span class="badge-pill badge-green">👥 ผู้เล่น 2 คน</span>';

    const turnText = r.isGameOver 
      ? '<span class="badge-pill badge-red">จบเกมแล้ว</span>' 
      : (r.currentTurn === 1 ? '⚫ ตาหมากดำ' : '⚪ ตาหมากขาว');

    tr.innerHTML = `
      <td><span class="code-box" style="font-weight: 700; color: #58a6ff; font-size: 0.95rem;">${r.id}</span></td>
      <td><strong>${r.size}x${r.size}</strong> <div style="margin-top: 0.2rem;">${modeBadge}</div></td>
      <td>${r.timeLimit ? `${r.timeLimit} วิ` : 'ไม่จำกัด'}</td>
      <td>${black}</td>
      <td>${white}</td>
      <td>${turnText} <span style="font-size: 0.8rem; color: #8b949e;">(${r.moveCount} ตา)</span></td>
      <td>${r.spectatorCount} คน</td>
      <td>
        <div style="display: flex; gap: 0.4rem;">
          <a href="/?room=${r.id}&admin=1" target="_blank" class="btn-sm btn-sm-success" style="text-decoration: none;">👁️ เข้าดูสด (ผู้ดูแลระบบ)</a>
          <button class="btn-sm btn-sm-danger" onclick="forceCloseRoom('${r.id}')">🛑 ปิดห้อง</button>
        </div>
      </td>
    `;
    roomsTableBody.appendChild(tr);
  });
}

// 4. Load Games Archive
async function loadGames() {
  const data = await adminFetch('/api/admin/games');
  if (data.success) {
    currentGames = data.games || [];
    renderGamesTable(currentGames);
    gameCountBadge.textContent = currentGames.length;
    statGames.textContent = currentGames.length;
  }
}

function renderGamesTable(games) {
  gamesTableBody.innerHTML = '';
  if (!games || games.length === 0) {
    gamesTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #8b949e; padding: 2rem;">ยังไม่มีประวัติการแข่งขันที่บันทึกไว้</td></tr>';
    return;
  }

  games.forEach(g => {
    const tr = document.createElement('tr');
    const dateStr = g.date 
      ? new Date(g.date).toLocaleDateString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';

    const blackName = g.blackPlayer ? escapeHtml(g.blackPlayer.name) : 'หมากดำ';
    const whiteName = g.whitePlayer ? escapeHtml(g.whitePlayer.name) : 'หมากขาว';

    const winnerBadge = g.winner === 1 
      ? `<span class="badge-pill badge-green">⚫ หมากดำชนะ (${escapeHtml(g.winReason || 'คะแนน')})</span>` 
      : (g.winner === 2 
        ? `<span class="badge-pill badge-blue">⚪ หมากขาวชนะ (${escapeHtml(g.winReason || 'คะแนน')})</span>` 
        : '<span class="badge-pill">เสมอ</span>');

    const mode = g.isBotGame ? '🤖 บอท' : '👥 คน vs คน';

    tr.innerHTML = `
      <td><span style="font-size: 0.85rem; color: #8b949e;">${dateStr}</span></td>
      <td><strong>${g.size}x${g.size}</strong></td>
      <td>${mode}</td>
      <td>⚫ ${blackName}</td>
      <td>⚪ ${whiteName}</td>
      <td>${winnerBadge}</td>
      <td>${g.totalMoves || 0} ตา</td>
      <td>ดำกิน ${g.captures ? g.captures[1] || 0 : 0} | ขาวกิน ${g.captures ? g.captures[2] || 0 : 0}</td>
    `;
    gamesTableBody.appendChild(tr);
  });
}

// User Actions
window.openResetPasswordModal = function(id, username) {
  resetTargetId.value = id;
  resetTargetUsername.textContent = username;
  newPasswordInput.value = '';
  resetPasswordModal.style.display = 'flex';
  newPasswordInput.focus();
};

btnCancelReset.addEventListener('click', () => {
  resetPasswordModal.style.display = 'none';
});

resetPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = resetTargetId.value;
  const newPassword = newPasswordInput.value.trim();
  if (!newPassword || newPassword.length < 4) {
    showToast('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร', true);
    return;
  }

  try {
    const res = await adminFetch('/api/admin/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ target: id, newPassword })
    });
    if (res.success) {
      showToast(res.message);
      resetPasswordModal.style.display = 'none';
      loadUsers();
    } else {
      showToast(res.message || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน', true);
    }
  } catch (err) {
    showToast(err.message, true);
  }
});

window.confirmDeleteUser = async function(id, username) {
  if (!confirm(`⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบบัญชีผู้ใช้ "${username}" ออกจากระบบถาวร?`)) {
    return;
  }
  try {
    const res = await adminFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.success) {
      showToast(res.message);
      loadUsers();
      loadStats();
    } else {
      showToast(res.message || 'ลบบัญชีไม่สำเร็จ', true);
    }
  } catch (err) {
    showToast(err.message, true);
  }
};

// Clean Test Data Button
const btnCleanTestData = document.getElementById('btnCleanTestData');
if (btnCleanTestData) {
  btnCleanTestData.addEventListener('click', async () => {
    if (!confirm('🧹 ยืนยันการล้างบัญชีทดสอบอัตโนมัติ (Pro_*, Chal_*) และประวัติเกมทดสอบทั้งหมดหรือไม่?')) {
      return;
    }
    try {
      const res = await adminFetch('/api/admin/clean-test-data', { method: 'POST' });
      if (res.success) {
        showToast(res.message);
        loadAllAdminData();
      } else {
        showToast(res.message || 'ล้างข้อมูลไม่สำเร็จ', true);
      }
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

// Force Close Room
window.forceCloseRoom = async function(roomId) {
  if (!confirm(`⚠️ ยืนยันการบังคับปิดห้อง ${roomId} หรือไม่?`)) {
    return;
  }
  try {
    const res = await adminFetch(`/api/admin/rooms/${roomId}`, { method: 'DELETE' });
    if (res.success) {
      showToast(res.message);
      loadRooms();
      loadStats();
    } else {
      showToast(res.message || 'ปิดห้องไม่สำเร็จ', true);
    }
  } catch (err) {
    showToast(err.message, true);
  }
};

// Broadcast Form & Active Broadcast Tracking
async function refreshActiveBroadcastStatus() {
  try {
    const res = await adminFetch('/api/broadcast/current');
    if (res && res.success && res.broadcast) {
      const b = res.broadcast;
      if (activeBroadcastCard && activeBroadcastText && activeBroadcastTimerBadge) {
        activeBroadcastText.textContent = b.message;
        if (b.expiresAt) {
          const remSec = Math.max(0, Math.round((b.expiresAt - Date.now()) / 1000));
          activeBroadcastTimerBadge.textContent = remSec > 0 ? `⏳ เหลือ ${remSec} วิ` : '⚠️ หมดเวลาแล้ว';
        } else {
          activeBroadcastTimerBadge.textContent = '📌 แสดงค้างตลอด';
        }
        activeBroadcastCard.style.display = 'block';
      }
    } else {
      if (activeBroadcastCard) activeBroadcastCard.style.display = 'none';
    }
  } catch (err) {
    // Ignore error
  }
}

broadcastForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = broadcastInput.value.trim();
  if (!message) return;
  const duration = parseInt(broadcastDurationSelect ? broadcastDurationSelect.value : 60, 10) || 0;

  try {
    const res = await adminFetch('/api/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify({ message, duration })
    });
    if (res.success) {
      showToast(res.message || '📢 ส่งข้อความประกาศเซิร์ฟเวอร์เรียบร้อยแล้ว!');
      broadcastInput.value = '';
      refreshActiveBroadcastStatus();
    } else {
      showToast(res.message || 'ส่งประกาศไม่สำเร็จ', true);
    }
  } catch (err) {
    showToast(err.message, true);
  }
});

if (btnClearBroadcast) {
  btnClearBroadcast.addEventListener('click', async () => {
    if (!confirm('ต้องการล้างและปิดแถบประกาศบนหน้าจอผู้เล่นทุกคนหรือไม่?')) return;
    try {
      const res = await adminFetch('/api/admin/broadcast/clear', {
        method: 'POST'
      });
      if (res.success) {
        showToast('🛑 ล้างและปิดแถบประกาศเรียบร้อยแล้ว');
        refreshActiveBroadcastStatus();
      } else {
        showToast(res.message || 'ล้างประกาศไม่สำเร็จ', true);
      }
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

// Search Filter
userSearchInput.addEventListener('input', () => {
  const q = userSearchInput.value.toLowerCase().trim();
  if (!q) {
    renderUsersTable(currentUsers);
  } else {
    const filtered = currentUsers.filter(u => 
      u.username.toLowerCase().includes(q) || 
      u.id.toLowerCase().includes(q)
    );
    renderUsersTable(filtered);
  }
});

// Copy to Clipboard Helper
window.copyToClipboard = function(text, successMsg) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`📋 ${successMsg || 'คัดลอกลงคลิปบอร์ดแล้ว'}`);
  }).catch(() => {
    showToast('ไม่สามารถคัดลอกได้', true);
  });
};

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Tab Switching
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const targetContent = document.getElementById(`tab-${tabName}`);
    if (targetContent) targetContent.classList.add('active');

    if (tabName === 'broadcast') {
      refreshActiveBroadcastStatus();
    }
  });
});

// Auth Form Submit
adminLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = adminKeyInput.value.trim();
  if (!key) return;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey: key })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      adminKey = key;
      sessionStorage.setItem('online_go_admin_key', key);
      showToast('ยินดีต้อนรับสู่ระบบหลังบ้าน Online Go!');
      showDashboard();
    } else {
      showToast(data.message || 'Master Admin Key ไม่ถูกต้อง', true);
    }
  } catch (err) {
    showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', true);
  }
});

// Refresh & Logout Buttons
btnRefreshData.addEventListener('click', () => {
  loadAllAdminData();
  showToast('🔄 รีเฟรชข้อมูลล่าสุดสำเร็จ');
});

btnLogoutAdmin.addEventListener('click', () => {
  sessionStorage.removeItem('online_go_admin_key');
  adminKey = '';
  showLogin();
  showToast('ออกจากระบบหลังบ้านแล้ว');
});

// Initial Startup
if (adminKey) {
  // Test if key is valid by fetching stats
  adminFetch('/api/admin/stats')
    .then(data => {
      if (data.success) {
        showDashboard();
      } else {
        showLogin();
      }
    })
    .catch(() => showLogin());
} else {
  showLogin();
}

if (btnRefreshResetRequests) {
  btnRefreshResetRequests.addEventListener('click', () => {
    loadResetRequests();
    showToast('🔄 รีเฟรชคำขอรีเซ็ตรหัสผ่านแล้ว');
  });
}

// Auto refresh fallback every 3 seconds if tab is active
setInterval(() => {
  if (adminKey && mainDashboard.style.display !== 'none') {
    loadStats();
    loadRooms();
    loadUsers();
    loadResetRequests();
  }
}, 3000);

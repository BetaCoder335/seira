import { Application } from 'https://esm.sh/@splinetool/runtime';

// ============================================================
// 1. BACKGROUND ENVIRONMENT (SPLINE)
// ============================================================
const canvasBg = document.getElementById('canvas3d');
const splineBg = new Application(canvasBg);
splineBg.load('./assets/scene-clean (1).splinecode').then(() => {
  console.log('Strategic Environment Deployed!');
});

// Global Pointer Forwarding
window.addEventListener('pointermove', (e) => {
  canvasBg.dispatchEvent(new PointerEvent('pointermove', {
    clientX: e.clientX, clientY: e.clientY,
    pointerId: e.pointerId, pointerType: e.pointerType,
    isPrimary: e.isPrimary, bubbles: true
  }));
});

// ============================================================
// 2. SEIRA INTELLIGENCE ENGINE (CORE STATE)
// ============================================================

// 0. SUPABASE INITIALIZATION
const SUPABASE_URL = 'https://uwaxtusxwrrgbakngvpr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SJfCpOTwhtnFBfN2zP_36w_MJps52EH';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const State = {
  tasks: [],
  focusSessions: [],
  totalFocusTime: 0,
  historicalCompletedCount: 0,
  filterDate: new Date().getFullYear() + '-' + (new Date().getMonth() + 1).toString().padStart(2, '0') + '-' + new Date().getDate().toString().padStart(2, '0'),
  viewMonth: new Date().getMonth(),
  viewYear: new Date().getFullYear(),
  dailyTarget: 4,
  chatContext: { stage: 'TASK', task: '', deadline: '' },
  user: { signedIn: false, username: 'Guest User', avatar: '', id: null },
  focusDuration: 1500,

  getLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  async initUserSession() {
    const now = new Date();
    this.viewMonth = now.getMonth();
    this.viewYear = now.getFullYear();
    this.filterDate = this.getLocalDate();

    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
      await this.syncWithCloud(session.user);
    } else {
      this.user = { signedIn: false, username: 'Guest User', avatar: '', id: null };
      this.tasks = [];
      this.totalFocusTime = 0;
      this.historicalCompletedCount = 0;
    }
    renderUI();
  },

  async syncWithCloud(authUser) {
    if (!authUser) return;
    const { data: profile } = await _supabase.from('profiles').select('*').eq('id', authUser.id).single();
    const { data: tasks } = await _supabase.from('tasks').select('*').eq('user_id', authUser.id);
    const { data: stats } = await _supabase.from('user_stats').select('*').eq('user_id', authUser.id).single();

    this.user = {
      signedIn: true,
      username: profile?.username || authUser.email.split('@')[0],
      avatar: profile?.avatar_url || '',
      id: authUser.id
    };
    this.tasks = (tasks || []).map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date ? t.due_date.split('T')[0] : null, 
      parentTaskId: t.parent_id,
      type: t.type,
      attachment: t.attachment
    }));
    this.totalFocusTime = stats?.total_focus_time || 0;
    this.historicalCompletedCount = stats?.historical_completed_count || 0;
    renderUI();
  },

  async save() {
    if (!this.user.signedIn || !this.user.id) return;
    await _supabase.from('user_stats').upsert({
      user_id: this.user.id,
      total_focus_time: this.totalFocusTime,
      historical_completed_count: this.historicalCompletedCount,
      last_sync: new Date().toISOString()
    });
  }
};

// Initial Boot
State.initUserSession();
const savedContext = localStorage.getItem('seira_chat_context');
if (savedContext) State.chatContext = JSON.parse(savedContext);

// ============================================================
// 3. CALENDAR RENDERING
// ============================================================
const renderCalendar = () => {
  const calGrid = document.querySelector('.full-cal-grid');
  const calHeader = document.querySelector('.calendar-card .card-header');
  if (!calGrid || !calHeader) return;

  const vMonth = State.viewMonth;
  const vYear = State.viewYear;
  const firstDay = new Date(vYear, vMonth, 1).getDay();
  const daysInMonth = new Date(vYear, vMonth + 1, 0).getDate();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const prevMonth = monthNames[(vMonth + 11) % 12].substring(0, 3);
  const nextMonth = monthNames[(vMonth + 1) % 12].substring(0, 3);

  calHeader.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <div class="month-pill" onclick="window.changeMonth(-1)">${prevMonth}</div>
      <div class="month-pill" onclick="window.gotoToday()" title="Temporal Reset" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">Today</div>
    </div>
    <div style="font-size: 16px; font-weight: 500;">${monthNames[vMonth]} ${vYear}</div>
    <div class="month-pill" onclick="window.changeMonth(1)">${nextMonth}</div>
  `;

  let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="cal-head">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="full-cal-day muted"></div>`;

  const todayStr = new Date().toISOString().split('T')[0];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${vYear}-${(vMonth + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    const isActive = dateStr === State.filterDate;
    const hasEvent = State.tasks.some(t => t.dueDate === dateStr);
    const isToday = dateStr === todayStr;

    html += `<div class="full-cal-day ${isActive ? 'active' : ''} ${hasEvent ? 'event' : ''} ${isToday ? 'today' : ''}" 
               style="${isToday ? 'position: relative;' : ''}"
               onclick="window.selectSeiraDate('${dateStr}')">
             ${d}
           </div>`;
  }
  calGrid.innerHTML = html;
};

window.changeMonth = (delta) => {
  State.viewMonth += delta;
  if (State.viewMonth > 11) { State.viewMonth = 0; State.viewYear++; }
  else if (State.viewMonth < 0) { State.viewMonth = 11; State.viewYear--; }
  renderCalendar();
};

window.gotoToday = () => {
  const now = new Date();
  State.viewMonth = now.getMonth();
  State.viewYear = now.getFullYear();
  State.filterDate = State.getLocalDate();
  renderCalendar();
  renderUI();
};

window.selectSeiraDate = (date) => {
  State.filterDate = date;
  renderUI();
};

// ============================================================
// 4. UI SYNC & RENDERING
// ============================================================
const renderUI = () => {
  const counts = {
    active: State.tasks.filter(t => t.status === 'active').length,
    progress: State.tasks.filter(t => t.status === 'in-progress').length,
    completedCount: State.tasks.filter(t => t.status === 'completed').length,
    historical: State.historicalCompletedCount,
    overdue: State.tasks.filter(t => t.status === 'overdue').length
  };

  const statNums = document.querySelectorAll('.big-stat-num');
  const progBars = document.querySelectorAll('.prog-bar');

  const sidebarFooter = document.querySelector('.sidebar-footer');
  if (sidebarFooter) {
    const { signedIn, username, avatar } = State.user;
    const authAction = signedIn ? 'window.logoutSeira()' : 'window.openAuthModal()';
    const initial = username ? username.charAt(0).toUpperCase() : '?';
    const profileImg = avatar ? `<img src="${avatar}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:16px; font-weight:700; color:var(--primary-cyan); font-family:'Outfit'">${initial}</span>`;

    sidebarFooter.innerHTML = `
      ${signedIn ? `<button class="btn-export-report" onclick="window.exportMissionData()"><i class="fa-solid fa-file-excel"></i> Download report</button>` : ''}
      <div class="user-profile" onclick="${authAction}">
         <div class="user-avatar" style="background: rgba(255,255,255,0.05); overflow: hidden; display: flex; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,0.2);">${profileImg}</div>
         <div class="user-info"><h4>${username}</h4><p>${signedIn ? 'Authorized Session' : 'Not signed in'}</p></div>
         <button class="btn-logout" title="${signedIn ? 'Logout' : 'Login'}" style="color: var(--primary-cyan);" onclick="${authAction}"><i class="fa-solid ${signedIn ? 'fa-right-from-bracket' : 'fa-right-to-bracket'}"></i></button>
      </div>
    `;
  }

  if (statNums.length >= 4) {
    statNums[0].textContent = counts.active.toString().padStart(2, '0');
    statNums[1].textContent = counts.progress.toString().padStart(2, '0');
    statNums[2].textContent = counts.historical.toString().padStart(2, '0');
    statNums[3].textContent = counts.overdue.toString().padStart(2, '0');

    const total = State.tasks.length || 1;
    if (progBars.length >= 4) {
      progBars[0].textContent = counts.active; progBars[0].style.width = Math.max(10, (counts.active / total) * 100) + '%';
      progBars[1].textContent = counts.progress; progBars[1].style.width = Math.max(10, (counts.progress / total) * 100) + '%';
      progBars[2].textContent = counts.completedCount; progBars[2].style.width = Math.max(10, (counts.completedCount / total) * 100) + '%';
      progBars[3].textContent = counts.overdue; progBars[3].style.width = Math.max(10, (counts.overdue / total) * 100) + '%';
    }
  }

  const taskContainer = document.querySelector('.task-list-container');
  const taskHeaderArea = document.querySelector('.card.task-card .card-header');
  const taskCountHeader = document.querySelector('.task-count');

  if (!document.getElementById('btnClearCompleted') && State.tasks.some(t => t.status === 'completed')) {
    taskHeaderArea.insertAdjacentHTML('beforeend', `<button id="btnClearCompleted" style="background:transparent; border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.5); font-size:10px; padding:4px 10px; border-radius:20px; cursor:pointer;" onclick="window.clearCompletedTasks()">Clear Completed</button>`);
  } else if (document.getElementById('btnClearCompleted') && !State.tasks.some(t => t.status === 'completed')) {
    document.getElementById('btnClearCompleted')?.remove();
  }

  const visibleTasks = State.tasks.filter(t => t.dueDate === State.filterDate);
  if (taskCountHeader) taskCountHeader.textContent = `${visibleTasks.filter(t => t.status === 'completed').length}/${visibleTasks.length}`;

  if (visibleTasks.length === 0) {
    if (taskContainer) taskContainer.innerHTML = `<div style="text-align: center; color: var(--text-tertiary); padding: 50px 0; font-size: 13px;">No objectives for ${State.filterDate}.</div>`;
  } else {
    const strategyTasks = visibleTasks.filter(t => (t.type === 'strategy' || t.parentTaskId) && t.type !== 'side-quest');
    const customTasks = visibleTasks.filter(t => (t.type === 'custom' || !t.type) && !t.parentTaskId);
    const sideQuests = visibleTasks.filter(t => t.type === 'side-quest');

    const renderTask = (task, isChild = false) => {
      const status = task.status || 'active';
      const icon = task.type === 'side-quest' ? 'fa-gamepad side-quest-icon' : (isChild ? 'fa-arrow-turn-down' : (task.type === 'custom' ? 'fa-user-pen' : 'fa-crosshairs'));
      const styleAttrib = isChild ? `style="margin-left: 32px; margin-top: 8px; border-left: 1px solid rgba(255,255,255,0.05); padding-left: 16px;"` : '';
      return `
        <div class="task-item ${status === 'completed' ? 'done' : ''}" data-id="${task.id}" ${styleAttrib}>
            <div class="task-icon-wrap" ${isChild ? 'style="width:28px; height:28px;"' : ''}><i class="fa-solid ${icon}" ${isChild ? 'style="font-size:10px; transform:rotate(-90deg)"' : ''}></i></div>
            <div style="flex:1">
                <div class="task-title" style="${isChild ? 'font-size:13px;' : 'font-weight:600;'}">${task.title || 'Untitled Objective'}</div>
                <div class="task-time">${status.toUpperCase()} ${!isChild ? `• Priority: ${task.priority || 'Medium'}` : ''}${task.attachment ? `<span style="margin-left:8px; color:var(--primary-cyan); font-size:10px;"><i class="fa-solid fa-paperclip"></i> ${task.attachment.name}</span>` : ''}</div>
            </div>
            <div class="task-check ${status === 'completed' ? 'checked' : 'unchecked'}">${status === 'completed' ? '<i class="fa-solid fa-check"></i>' : ''}</div>
            ${status === 'completed' ? `<button class="btn-delete-item" style="background:transparent; border:none; color:rgba(255,69,58,0.4); margin-left:10px;" onclick="event.stopPropagation(); window.deleteSeiraTask('${task.id}')"><i class="fa-solid fa-trash-can"></i></button>` : ''}
        </div>
      `;
    };

    let finalHTML = '';
    if (strategyTasks.length > 0) {
      finalHTML += `<div class="task-section-header">Strategic Intelligence<span>${strategyTasks.filter(t => !t.parentTaskId).length} ACTIVE</span></div>`;
      finalHTML += strategyTasks.filter(t => !t.parentTaskId).map(task => {
        const subs = strategyTasks.filter(c => c.parentTaskId === task.id);
        return `<div class="task-group" style="margin-bottom:20px;">${renderTask(task)} ${subs.map(s => renderTask(s, true)).join('')}</div>`;
      }).join('');
    }
    if (customTasks.length > 0) {
      finalHTML += `<div class="task-section-header">Manual Operations<span>${customTasks.length} ITEMS</span></div>`;
      finalHTML += customTasks.map(t => renderTask(t)).join('');
    }
    if (sideQuests.length > 0) {
      finalHTML += `<div class="task-section-header">Refresh Quests<span>${sideQuests.length} ACTIVE</span></div>`;
      finalHTML += sideQuests.map(t => renderTask(t)).join('');
    }
    if (taskContainer) taskContainer.innerHTML = finalHTML || `<div style="text-align: center; color: var(--text-tertiary); padding: 50px 0; font-size: 13px;">Incomplete data synchronization.</div>`;

    document.querySelectorAll('.task-item').forEach(item => {
      item.onclick = (e) => { if (e.target.closest('button')) return; window.toggleSeiraTask(item.dataset.id); };
    });
  }

  const totalPossible = Math.max(State.tasks.length, State.historicalCompletedCount);
  const auraScore = Math.min(100, Math.round(((State.historicalCompletedCount / (totalPossible || 1)) * 50) + Math.min(50, (State.totalFocusTime / State.dailyTarget) * 50)));

  const analyticsCards = document.querySelectorAll('.grid-stats .card');
  if (analyticsCards.length >= 3) {
    analyticsCards[0].querySelector('div:nth-child(2)').textContent = auraScore + '%';
    analyticsCards[1].querySelector('div:nth-child(2)').textContent = State.totalFocusTime.toFixed(1) + 'h';
    analyticsCards[2].querySelector('div:nth-child(2)').textContent = State.historicalCompletedCount;
  }

  renderCalendar();
  initAnalyticsCharts();
  updateAIInsights();
  renderWizard();
  State.save();
};

// ============================================================
// 5. TIMER LOGIC
// ============================================================
const timerDisplay = document.getElementById('timerDisplay');
const timerArc = document.getElementById('timerArc');
const btnPlay = document.getElementById('btnPlay');
const btnPause = document.getElementById('btnPause');
const btnStop = document.getElementById('btnStop');

const ARC_TOTAL = 289;
let timeLeft = State.focusDuration;
let timerInterval = null;

function updateTimerUI() {
  if (!timerDisplay || !timerArc) return;
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  timerArc.style.strokeDashoffset = ARC_TOTAL * (1 - (timeLeft / State.focusDuration));
}

window.openTimerConfig = () => {
  if (timerInterval) { alert("Mission in progress. Cease timer to re-calibrate."); return; }
  document.getElementById('tCfgMins').value = Math.floor(State.focusDuration / 60);
  document.getElementById('tCfgSecs').value = State.focusDuration % 60;
  document.getElementById('timerConfigModal').classList.add('active');
};

window.setTimerPreset = (mins) => {
  document.getElementById('tCfgMins').value = mins;
  document.getElementById('tCfgSecs').value = "00";
};

window.saveTimerConfig = () => {
  const totalSecs = (parseInt(document.getElementById('tCfgMins').value) || 0) * 60 + (parseInt(document.getElementById('tCfgSecs').value) || 0);
  if (totalSecs <= 0) { alert("Duration must exceed zero."); return; }
  State.focusDuration = timeLeft = totalSecs;
  State.save(); updateTimerUI();
  document.getElementById('timerConfigModal').classList.remove('active');
};

const startTimer = () => {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    if (timeLeft > 0) { timeLeft--; updateTimerUI(); }
    else {
      clearInterval(timerInterval); timerInterval = null;
      State.totalFocusTime += parseFloat((State.focusDuration / 3600).toFixed(2));
      renderUI(); alert("Greetings Sire! Your custom focus session is complete.");
    }
  }, 1000);
};

if (btnPlay) btnPlay.onclick = startTimer;
if (btnPause) btnPause.onclick = () => { clearInterval(timerInterval); timerInterval = null; };
if (btnStop) btnStop.onclick = () => { clearInterval(timerInterval); timerInterval = null; timeLeft = 0; updateTimerUI(); };

// ============================================================
// 6. TASK ACTIONS
// ============================================================
window.addSeiraTask = async (title, priority, date, type = 'custom', attachment = null) => {
  if (!State.user.signedIn) { alert("Authorization Required"); return; }
  const { data, error } = await _supabase.from('tasks').insert({ user_id: State.user.id, title, priority, due_date: date, type, attachment }).select().single();
  if (error) { console.error(error); return; }
  State.tasks.push({ id: data.id, title, status: 'active', priority, dueDate: date, type, attachment });
  renderUI();
};

window.toggleSeiraTask = async (id) => {
  const task = State.tasks.find(t => t.id === id);
  if (!task) return;
  const newStatus = task.status === 'completed' ? 'active' : 'completed';
  const { error } = await _supabase.from('tasks').update({ status: newStatus }).eq('id', id);
  if (error) return;
  task.status = newStatus;
  if (newStatus === 'completed') { State.historicalCompletedCount++; await State.save(); }
  
  if (!task.parentTaskId) { // Parent cascades to Children
    const children = State.tasks.filter(child => child.parentTaskId === task.id);
    for (const child of children) {
      if (child.status !== newStatus) {
        await _supabase.from('tasks').update({ status: newStatus }).eq('id', child.id);
        child.status = newStatus; if (newStatus === 'completed') State.historicalCompletedCount++;
      }
    }
  } else { // Children bubble up to Parent
    const parent = State.tasks.find(p => p.id === task.parentTaskId);
    if (parent && State.tasks.filter(t => t.parentTaskId === parent.id).every(s => s.status === 'completed') && parent.status !== 'completed') {
      await _supabase.from('tasks').update({ status: 'completed' }).eq('id', parent.id);
      parent.status = 'completed'; State.historicalCompletedCount++;
    }
  }
  renderUI();
};

window.deleteSeiraTask = async (id) => {
  const { error } = await _supabase.from('tasks').delete().eq('id', id);
  if (!error) { State.tasks = State.tasks.filter(t => t.id !== id); renderUI(); }
};

window.clearCompletedTasks = async () => {
  if (!State.user.id) return;
  const { error } = await _supabase.from('tasks').delete().eq('user_id', State.user.id).eq('status', 'completed');
  if (!error) { State.tasks = State.tasks.filter(t => t.status !== 'completed'); renderUI(); }
};

// ============================================================
// 7. AUTH LOGIC (SUPABASE)
// ============================================================
let currentAuthMode = 'LOGIN';

window.openAuthModal = () => { document.getElementById('authModal').classList.add('active'); window.setAuthMode('LOGIN'); };
window.setAuthMode = (mode) => {
  currentAuthMode = mode; const isReg = mode === 'REGISTER';
  document.getElementById('authTitle').textContent = isReg ? 'Establish Identity' : 'Security Clearance';
  document.getElementById('regOnlyEmail').style.display = isReg ? 'block' : 'none';
  document.getElementById('authPreviewWrap').style.display = isReg ? 'flex' : 'none';
  document.getElementById('btnModeLogin').style.background = isReg ? 'transparent' : 'var(--primary-cyan)';
  document.getElementById('btnModeLogin').style.color = isReg ? '#888' : '#000';
  document.getElementById('btnModeReg').style.background = isReg ? 'var(--primary-cyan)' : 'transparent';
  document.getElementById('btnModeReg').style.color = isReg ? '#000' : '#888';
  document.getElementById('authError').style.display = 'none';
};

window.previewAvatar = (input) => {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => { document.getElementById('authPreview').innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">`; };
    reader.readAsDataURL(input.files[0]);
  }
};

window.handleAuthAction = async () => {
  const username = document.getElementById('authUsername').value;
  const email = document.getElementById('authEmail').value || `${username}@seira.mission`;
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');
  errorEl.style.display = 'none';

  try {
    if (currentAuthMode === 'REGISTER') {
      const { data, error } = await _supabase.auth.signUp({ email, password });
      if (error) throw error;
      await _supabase.from('profiles').insert({ id: data.user.id, username });
      await _supabase.from('user_stats').insert({ user_id: data.user.id });
      alert("Authorization Registered. Proceed to Login."); window.setAuthMode('LOGIN');
    } else {
      const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await _supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', data.user.id);
      await State.syncWithCloud(data.user);
      document.getElementById('authModal').classList.remove('active'); alert(`Welcome back, Sire.`);
    }
  } catch (err) { errorEl.textContent = err.message; errorEl.style.display = 'block'; }
};

window.logoutSeira = async () => { await _supabase.auth.signOut(); await State.initUserSession(); alert("Session Terminated."); };

// ============================================================
// 8. STRATEGIC EXPORT (XLSX)
// ============================================================
window.exportMissionData = () => {
  if (!State.user.signedIn) return;
  const formatTask = (t) => ({
    "Objective": t.title, "Date": t.dueDate || "Continuous", "Priority": t.priority || "Medium", "Status": (t.status || "Active").toUpperCase()
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(State.tasks.map(formatTask)), "Objectives");
  XLSX.writeFile(wb, `Seira_Report_${State.user.username}.xlsx`);
};

// ============================================================
// 9. AI STRATEGIC WIZARD (GROQ)
// ============================================================
const GROQ_API_KEY = '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';
const wizardContainer = document.getElementById('wizard-container');

const fetchGroq = async (task, deadline) => {
  const systemPrompt = `You are Seira, a formal AI. Respond with JSON: { "reply": "...", "objectives": [{ "title": "...", "priority": "High", "date": "...", "steps": ["..."] }], "sideQuests": ["...", "..."] }`;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Plan: ${task}. Until: ${deadline}` }], response_format: { type: 'json_object' } })
    });
    const data = await res.json();
    return data.choices[0].message.content;
  } catch (e) { return null; }
};

const renderWizard = () => {
  if (!wizardContainer) return;
  if (!State.user.signedIn) {
    wizardContainer.innerHTML = `<div class="wizard-step active"><i class="fa-solid fa-lock wizard-icon"></i><div class="wizard-title">Sign In to access the AI</div><button class="wizard-btn" onclick="window.openAuthModal()">Sign In</button></div>`;
    return;
  }
  const stage = State.chatContext.stage;
  if (stage === 'TASK') {
    wizardContainer.innerHTML = `<div class="wizard-step active"><i class="fa-solid fa-crosshairs wizard-icon"></i><div class="wizard-title">What task do you want to achieve?</div><input type="text" id="wizTaskInput" class="wizard-input" value="${State.chatContext.task || ''}"><button class="wizard-btn" onclick="wizNextStep()">Continue</button></div>`;
  } else if (stage === 'DATE') {
    wizardContainer.innerHTML = `<div class="wizard-step active"><i class="fa-solid fa-clock wizard-icon"></i><div class="wizard-title">Deadline?</div><input type="datetime-local" id="wizDateInput" class="wizard-date" value="${State.chatContext.deadline || ''}"><button class="wizard-btn" onclick="wizExecutePlan()">Execute</button></div>`;
  } else if (stage === 'LOADING') {
    wizardContainer.innerHTML = `<div class="wizard-step active"><i class="fa-solid fa-circle-notch fa-spin wizard-icon"></i><div class="wizard-title">Planning...</div></div>`;
  } else if (stage === 'SUCCESS') {
    wizardContainer.innerHTML = `<div class="wizard-step active"><i class="fa-solid fa-check-circle wizard-icon"></i><div class="wizard-title">Strategy Deployed</div><button class="wizard-btn" onclick="wizReset()">New Plan</button></div>`;
  }
};

window.wizNextStep = () => { State.chatContext.task = document.getElementById('wizTaskInput').value; State.chatContext.stage = 'DATE'; State.save(); renderWizard(); };
window.wizReset = () => { State.chatContext = { stage: 'TASK', task: '', deadline: '' }; State.save(); renderWizard(); };

window.wizExecutePlan = async () => {
  State.chatContext.deadline = document.getElementById('wizDateInput').value;
  State.chatContext.stage = 'LOADING'; renderWizard();
  const result = await fetchGroq(State.chatContext.task, State.chatContext.deadline);
  if (!result) { State.chatContext.stage = 'ERROR'; renderWizard(); return; }
  try {
    const data = JSON.parse(result.match(/\{[\s\S]*\}/)[0]);
    for (const obj of data.objectives) {
      const { data: pData } = await _supabase.from('tasks').insert({ user_id: State.user.id, title: obj.title, priority: obj.priority || 'Medium', due_date: obj.date || State.chatContext.deadline.split('T')[0], type: 'strategy' }).select().single();
      State.tasks.push({ id: pData.id, title: obj.title, status: 'active', priority: obj.priority, dueDate: pData.due_date, type: 'strategy' });
      for (const step of obj.steps) {
        const { data: sData } = await _supabase.from('tasks').insert({ user_id: State.user.id, title: step, parent_id: pData.id, type: 'strategy', due_date: pData.due_date }).select().single();
        State.tasks.push({ id: sData.id, title: step, status: 'active', parentTaskId: pData.id, type: 'strategy', dueDate: pData.due_date });
      }
    }
    State.chatContext.stage = 'SUCCESS'; State.save(); renderUI();
  } catch (e) { State.chatContext.stage = 'ERROR'; renderWizard(); }
};

// ============================================================
// 10. ANALYTICS & ENVIRONMENTAL
// ============================================================
let velocityChart, allocationChart;
function initAnalyticsCharts() {
  if (velocityChart) velocityChart.destroy(); if (allocationChart) allocationChart.destroy();
  const ctxV = document.getElementById('velocityChart')?.getContext('2d');
  const ctxA = document.getElementById('allocationChart')?.getContext('2d');
  if (!ctxV || !ctxA) return;

  const totalTasks = State.tasks.length;
  const completedTasks = State.tasks.filter(t => t.status === 'completed').length;
  const leftTasks = totalTasks - completedTasks;

  if (document.getElementById('ov-total')) document.getElementById('ov-total').textContent = totalTasks.toString().padStart(2, '0');
  if (document.getElementById('ov-completed')) document.getElementById('ov-completed').textContent = completedTasks.toString().padStart(2, '0');
  if (document.getElementById('ov-left')) document.getElementById('ov-left').textContent = leftTasks.toString().padStart(2, '0');

  velocityChart = new Chart(ctxV, { type: 'line', data: { labels: ['M','T','W','T','F','S','S'], datasets: [{ data: [0,0,0,0,0,0,completedTasks], borderColor: '#FF8A00', tension: 0.4 }] }, options: { plugins: { legend: { display:false } } } });
  allocationChart = new Chart(ctxA, { type: 'doughnut', data: { datasets: [{ data: [completedTasks || 0.1, leftTasks || 0.1], backgroundColor: ['#FF8A00', '#222'], borderWidth: 0 }] }, options: { cutout: '85%', plugins: { tooltip: { enabled: false }, legend: { display: false } } } });
}

const seiraQuotes = ["Efficiency is victory.", "Consistency is advantage.", "Focus is currency."];
function updateAIInsights() {
  const el = document.getElementById('seira-insight-content');
  if (el) el.innerHTML = `<p style="font-style:italic;">"${seiraQuotes[Math.floor(Math.random() * seiraQuotes.length)]}"</p>`;
}

async function syncEnvironmentalData() {
  const now = new Date();
  document.getElementById('env-time').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  document.getElementById('env-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  try {
    const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=18.52&longitude=73.85&current_weather=true");
    const data = await res.json();
    if (data.current_weather) document.getElementById('env-weather-temp').textContent = `${Math.round(data.current_weather.temperature)}° C`;
  } catch(e) {}
}

// Global initialization
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

window.openTaskModal = () => {
    document.getElementById('taskDate').value = State.filterDate;
    document.getElementById('taskModal').classList.add('active');
};

window.saveCustomTask = async () => {
    const title = document.getElementById('taskTitle').value;
    const priority = document.getElementById('taskPriority').value;
    const date = document.getElementById('taskDate').value;

    if (!title || !date) { alert("Operational parameters required."); return; }
    
    await window.addSeiraTask(title, priority, date, 'custom');
    window.closeModal('taskModal');
    
    // Clear inputs
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskPriority').value = 'Medium';
};

syncEnvironmentalData(); setInterval(syncEnvironmentalData, 60000);
updateTimerUI(); renderCalendar(); renderUI(); 

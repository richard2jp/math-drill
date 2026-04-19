// ── Constants ─────────────────────────────────────────
const TOTAL = 10;
const DC_W  = 52;   // must match --dc-w in CSS
const DC_GAP = 8;   // must match --dc-gap in CSS

// ── State ─────────────────────────────────────────────
let questions = [], currentQ = 0;
let sessionStart = null, qStart = null, timerInterval = null;
let sessionData = null, prevBest = null;
let wrongList = [], reviewIdx = 0;

// ── Drag state ────────────────────────────────────────
const drag = { digit: null, ghost: null, source: null };

// ── Helpers ───────────────────────────────────────────
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  window.scrollTo(0, 0);
}

// ── Question generation (2+2 / 3+2 / 3+3 混合) ───────
function generateQuestion() {
  const type = Math.floor(Math.random() * 3);
  let n1, n2;
  if (type === 0) {
    n1 = rand(100, 999); n2 = rand(100, 999);            // 3+3
  } else if (type === 1) {
    if (Math.random() < 0.5) { n1 = rand(100, 999); n2 = rand(10, 99); }
    else                     { n1 = rand(10, 99);  n2 = rand(100, 999); } // 3+2
  } else {
    n1 = rand(10, 99); n2 = rand(10, 99);                // 2+2
  }
  return { n1, n2, correct: n1 + n2, ua: null, t: 0, ok: false };
}

// displayCols = width of problem display (determines divider & num1/num2 alignment)
// num2 occupies (displayCols - 1) cells; the "+" takes the remaining 1 cell
function getDisplayCols(q) {
  return Math.max(
    String(q.n1).length,
    String(q.n2).length + 1,
    String(q.correct).length
  );
}

// ── Render digit cells ────────────────────────────────
function renderDigits(id, num, slots) {
  const str = String(num).padStart(slots, ' ');
  document.getElementById(id).innerHTML = str.split('').map(c =>
    c === ' ' ? '<div class="dc empty"> </div>' : `<div class="dc">${c}</div>`
  ).join('');
}

function renderDigitsColored(id, num, slots, cls) {
  const str = String(num).padStart(slots, ' ');
  document.getElementById(id).innerHTML = str.split('').map(c =>
    c === ' ' ? '<div class="dc empty"> </div>' : `<div class="dc ${cls}">${c}</div>`
  ).join('');
}

function setProbLineWidth(elementId, cols) {
  document.getElementById(elementId).style.width =
    `${cols * DC_W + (cols - 1) * DC_GAP}px`;
}

// ── Start / Question ──────────────────────────────────
async function startGame() {
  questions = Array.from({ length: TOTAL }, generateQuestion);
  currentQ = 0;
  try {
    const r = await fetch('/api/best');
    prevBest = await r.json();
  } catch { prevBest = null; }
  sessionStart = Date.now();
  showQuestion();
}

function showQuestion() {
  const q = questions[currentQ];
  qStart = Date.now();

  document.getElementById('q-num').textContent = `${currentQ + 1} / ${TOTAL}`;
  document.getElementById('prog-bar').style.width = `${(currentQ / TOTAL) * 100}%`;

  const dispCols   = getDisplayCols(q);
  const answerCols = String(q.correct).length;

  renderDigits('num1-cells', q.n1, dispCols);
  renderDigits('num2-cells', q.n2, dispCols - 1);
  setProbLineWidth('prob-line', dispCols);

  // Build answer slots (drag targets)
  const slotsEl = document.getElementById('answer-slots');
  slotsEl.innerHTML = '';
  for (let i = 0; i < answerCols; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot empty';
    slot.dataset.idx = i;
    slot.textContent = '？';
    slotsEl.appendChild(slot);
  }

  document.getElementById('submit-btn').disabled = true;
  document.querySelector('.math-problem').classList.remove('flash-ok', 'flash-ng');

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    document.getElementById('timer').textContent = fmtTime((Date.now() - sessionStart) / 1000);
  }, 100);

  showScreen('game');
}

// ── Slot helpers ──────────────────────────────────────
function fillSlot(slot, digit) {
  slot.textContent   = digit;
  slot.dataset.value = digit;
  slot.classList.replace('empty', 'filled');
  checkAllFilled();
}

function clearSlot(slot) {
  slot.textContent = '？';
  delete slot.dataset.value;
  slot.classList.replace('filled', 'empty');
  slot.classList.remove('drag-over');
  checkAllFilled();
}

function clearAllSlots() {
  document.querySelectorAll('#answer-slots .slot').forEach(clearSlot);
}

function checkAllFilled() {
  const slots = document.querySelectorAll('#answer-slots .slot');
  const allOk = Array.from(slots).every(s => s.dataset.value !== undefined);
  document.getElementById('submit-btn').disabled = !allOk;
}

// Tap on a filled slot → clear it
document.addEventListener('click', e => {
  const slot = e.target.closest('#answer-slots .slot');
  if (slot && slot.classList.contains('filled') && !drag.ghost) clearSlot(slot);
});

// ── Pointer drag (works for mouse + touch) ────────────
function startDrag(e, tile) {
  e.preventDefault();
  drag.digit  = tile.dataset.digit;
  drag.source = tile;
  tile.classList.add('dragging-source');

  const ghost = document.createElement('div');
  ghost.className   = 'tile-ghost';
  ghost.textContent = drag.digit;
  document.body.appendChild(ghost);
  drag.ghost = ghost;

  moveDragGhost(e);
}

function moveDragGhost(e) {
  if (!drag.ghost) return;
  const { clientX, clientY } = e.touches ? e.touches[0] : e;
  drag.ghost.style.left = `${clientX - 32}px`;
  drag.ghost.style.top  = `${clientY - 32}px`;

  // Highlight slot under pointer
  drag.ghost.style.display = 'none';
  const el = document.elementFromPoint(clientX, clientY);
  drag.ghost.style.display = '';
  document.querySelectorAll('#answer-slots .slot').forEach(s => s.classList.remove('drag-over'));
  if (el?.closest('#answer-slots .slot')) el.closest('#answer-slots .slot').classList.add('drag-over');
}

function endDrag(e) {
  if (!drag.ghost) return;

  const { clientX, clientY } = e.changedTouches ? e.changedTouches[0] : e;

  drag.ghost.style.display = 'none';
  const el = document.elementFromPoint(clientX, clientY);
  drag.ghost.remove();
  drag.ghost = null;

  if (drag.source) { drag.source.classList.remove('dragging-source'); drag.source = null; }
  document.querySelectorAll('#answer-slots .slot').forEach(s => s.classList.remove('drag-over'));

  const slot = el?.closest('#answer-slots .slot');
  if (slot) fillSlot(slot, drag.digit);

  drag.digit = null;
}

function cancelDrag() {
  if (drag.ghost) { drag.ghost.remove(); drag.ghost = null; }
  if (drag.source) { drag.source.classList.remove('dragging-source'); drag.source = null; }
  document.querySelectorAll('#answer-slots .slot').forEach(s => s.classList.remove('drag-over'));
  drag.digit = null;
}

// Attach pointer listeners to all tiles (delegated from tiles-row)
document.addEventListener('pointerdown', e => {
  const tile = e.target.closest('#tiles-row .tile');
  if (tile) startDrag(e, tile);
});
document.addEventListener('pointermove', e => { if (drag.ghost) { e.preventDefault(); moveDragGhost(e); } }, { passive: false });
document.addEventListener('pointerup',     endDrag);
document.addEventListener('pointercancel', cancelDrag);

// ── Submit ────────────────────────────────────────────
function submitAnswer() {
  const slots = Array.from(document.querySelectorAll('#answer-slots .slot'));
  if (slots.some(s => !s.dataset.value)) return;

  const q       = questions[currentQ];
  q.ua          = parseInt(slots.map(s => s.dataset.value).join(''), 10);
  q.t           = (Date.now() - qStart) / 1000;
  q.ok          = q.ua === q.correct;

  document.querySelector('.math-problem').classList.add(q.ok ? 'flash-ok' : 'flash-ng');

  setTimeout(() => {
    currentQ++;
    if (currentQ >= TOTAL) endGame();
    else showQuestion();
  }, 550);
}

// ── End of 10 questions ───────────────────────────────
async function endGame() {
  clearInterval(timerInterval);
  const elapsed  = (Date.now() - sessionStart) / 1000;
  const correct  = questions.filter(q => q.ok).length;
  const accuracy = (correct / TOTAL) * 100;
  const now      = new Date();

  sessionData = {
    date: now.toLocaleDateString('ja-JP'),
    time: now.toLocaleTimeString('ja-JP'),
    correct_count: correct,
    total_count: TOTAL,
    accuracy,
    elapsed_seconds: elapsed,
    questions: questions.map(q => ({
      num1: q.n1, num2: q.n2, correct: q.correct,
      userAnswer: q.ua, isCorrect: q.ok, timeSpent: q.t
    }))
  };

  try {
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData)
    });
  } catch {}

  showResult(correct, accuracy, elapsed);
}

// ── Result ────────────────────────────────────────────
function showResult(correct, accuracy, elapsed) {
  document.getElementById('res-score').textContent = correct;
  document.getElementById('res-pct').textContent   = Math.round(accuracy);
  document.getElementById('res-time').textContent  = fmtTime(elapsed);

  const level = accuracy === 100 ? 100 : accuracy >= 80 ? 80 : accuracy >= 60 ? 60 : 0;
  const cats  = {
    100: { e: '😸', m: 'ぜんもんせいかい！\nすごい！🌟' },
     80: { e: '😺', m: 'よくできました！\nあと少し！' },
     60: { e: '🙀', m: 'がんばったね！\nもういちどやってみよう！' },
      0: { e: '😿', m: 'いっしょに\nれんしゅうしよう！' }
  };
  const cat = cats[level];
  document.getElementById('res-cat').textContent = cat.e;
  document.getElementById('res-msg').textContent = cat.m;

  wrongList = questions.filter(q => !q.ok);
  const btn = document.getElementById('res-next-btn');
  btn.textContent = wrongList.length > 0 ? 'まちがいをみる ➡' : 'じこベストを見る 🏆';

  showScreen('result');
}

function goNext() {
  if (wrongList.length > 0) { reviewIdx = 0; renderReview(); showScreen('review'); }
  else showBest();
}

// ── Review ────────────────────────────────────────────
function renderReview() {
  const q        = wrongList[reviewIdx];
  const dispCols = getDisplayCols(q);
  const ansCols  = String(q.correct).length;

  document.getElementById('rev-prog').textContent = `${reviewIdx + 1} / ${wrongList.length}`;
  document.getElementById('rev-msg').textContent  =
    `${q.n1} ＋ ${q.n2} = ${q.correct} だよ！\nいっしょに おぼえよう！`;

  renderDigits('rev-n1', q.n1, dispCols);
  renderDigits('rev-n2', q.n2, dispCols - 1);
  setProbLineWidth('rev-prob-line', dispCols);
  renderDigitsColored('rev-correct', q.correct, ansCols, 'ok');
  // user answer: display in ansCols slots (may have entered wrong number of digits)
  const uaStr = q.ua !== null ? String(q.ua).padStart(ansCols, '0') : '?'.repeat(ansCols);
  document.getElementById('rev-user').innerHTML = uaStr.split('').map(c =>
    `<div class="dc ng">${c}</div>`
  ).join('');

  document.getElementById('rev-prev').disabled = reviewIdx === 0;
  const nextBtn = document.getElementById('rev-next');
  if (reviewIdx === wrongList.length - 1) {
    nextBtn.textContent = 'じこベストを見る 🏆';
    nextBtn.onclick     = showBest;
  } else {
    nextBtn.textContent = 'つぎへ ▶';
    nextBtn.onclick     = nextReview;
  }
}

function nextReview() { if (reviewIdx < wrongList.length - 1) { reviewIdx++; renderReview(); } }
function prevReview()  { if (reviewIdx > 0)                   { reviewIdx--; renderReview(); } }

// ── Best Record ───────────────────────────────────────
function showBest() {
  const elapsed  = sessionData.elapsed_seconds;
  const accuracy = sessionData.accuracy;
  const isAllOk  = accuracy === 100;

  const catEl  = document.getElementById('best-cat');
  const msgEl  = document.getElementById('best-msg');
  const cardEl = document.getElementById('best-card');

  if (!isAllOk) {
    catEl.textContent = '😺';
    msgEl.textContent = 'まずはぜんもんせいかいを\nめざそう！いっしょにがんばろう！';
    cardEl.innerHTML  = '';
  } else if (!prevBest || prevBest.elapsed_seconds > elapsed) {
    catEl.textContent = '🎉';
    const prev = prevBest
      ? `（まえ: ${fmtTime(prevBest.elapsed_seconds)}）`
      : '（はじめて！）';
    msgEl.textContent = `じこベスト こうしん！！\n${fmtTime(elapsed)} 🏆\n${prev}`;
    cardEl.innerHTML  = prevBest
      ? `<div class="improve-badge">⬇ ${fmtTime(prevBest.elapsed_seconds - elapsed)} はやくなった！</div>`
      : '<div style="font-size:28px">🎊 はじめてのぜんもんせいかい！ 🎊</div>';
  } else {
    catEl.textContent = '😸';
    msgEl.textContent = `ぜんもんせいかい！\nじこベスト: ${fmtTime(prevBest.elapsed_seconds)}\nつぎはもっとはやく！`;
    cardEl.innerHTML  = `今回のタイム: ${fmtTime(elapsed)}`;
  }

  showScreen('best');
}

// ── Start Screen ──────────────────────────────────────
function goToStart() { loadHistory(); showScreen('start'); }

async function loadHistory() {
  try {
    const r    = await fetch('/api/history');
    const hist = await r.json();
    const el   = document.getElementById('history-list');
    if (!hist.length) { el.innerHTML = '<p class="no-hist">まだきろくがありません</p>'; return; }
    el.innerHTML = hist.slice(0, 5).map(h => `
      <div class="hist-item">
        <span class="hist-date">${h.session_date} ${h.session_time}</span>
        <div class="hist-stats">
          <b>${h.correct_count}/${h.total_count}</b>
          <span class="hist-pct">${Math.round(h.accuracy)}%</span>
          <span class="hist-time">⏱ ${fmtTime(h.elapsed_seconds)}</span>
        </div>
      </div>
    `).join('');
  } catch {}
}

window.addEventListener('DOMContentLoaded', loadHistory);

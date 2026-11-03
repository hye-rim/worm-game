'use strict';

// 지렁이: 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 20×20 판. 지렁이는 한 칸씩 앞으로 가고, 사과를 먹으면 한 마디 길어지고 1점
// - 벽이나 제 몸에 부딪히면 끝. 이번 걸음에 꼬리가 비켜 주는 칸으로는 들어갈 수 있다
// - 꺾기는 다음 칸들에서 쓸 방향으로 두 개까지 미리 받아 둔다 (빠르게 두 번 꺾어도 둘 다 먹게). 같은 방향·뒤로 돌기는 무시
// - 사과를 먹을수록 빨라진다
// - 아이템 모드: 돌이 있는 판 + 가끔 나오는 아이템 (⭐ 황금 사과 · 🐌 느린 걸음 · 🛡 보호막). 기본 모드 규칙은 그대로
const LOGIC_WORM = (() => {
const N = 20;

// ---------- 아이템 모드 ----------
// 돌 판: 지렁이가 처음 서 있는 가운데 줄(y=10)과 그 앞길은 늘 비어 있다
const ring = (cells) => cells.map(([x, y]) => y * N + x);
const MAPS = [
  { name: '빈 들판', rocks: [] },
  { name: '돌 정원', rocks: ring([[4, 4], [15, 4], [4, 15], [15, 15], [9, 6], [10, 14], [2, 8], [17, 12], [7, 2], [12, 17]]) },
  { name: '모서리 담', rocks: ring([[3, 3], [4, 3], [5, 3], [3, 4], [3, 5], [16, 3], [15, 3], [14, 3], [16, 4], [16, 5], [3, 16], [4, 16], [5, 16], [3, 15], [3, 14], [16, 16], [15, 16], [14, 16], [16, 15], [16, 14]]) },
  { name: '미로 담', rocks: ring([...Array.from({ length: 11 }, (_, i) => [3 + i, 5]), ...Array.from({ length: 11 }, (_, i) => [6 + i, 14])]) },
];
const ITEM_KINDS = [['gold', 0.45], ['slow', 0.3], ['shield', 0.25]];
const ITEM_EVERY = [3, 5];          // 사과를 이만큼(최소, 최대) 먹을 때마다 아이템이 하나 나온다
const ITEM_TTL = 70;                // 나온 아이템이 남아 있는 걸음 수 (약 9초)
const GOLD_SCORE = 5;
const SLOW_STEPS = 40, SLOW_FACTOR = 1.6;     // 느린 걸음: 이 걸음 동안 걸음이 1.6배 느려진다
const SHIELD_STEPS = 35;            // 보호막: 이 걸음 동안 벽·내 몸·돌을 지나간다 (벽은 반대편으로 나옴)

function newGame(rand = Math.random, opts = {}) {
  const items = !!opts.items;
  const map = items ? (Number.isInteger(opts.map) && MAPS[opts.map] ? opts.map : 0) : 0;
  const st = { worm: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], dir: { x: 1, y: 0 }, turns: [], food: null, score: 0, over: false, rand,
    items, map, rocks: new Set(items ? MAPS[map].rocks : []), eaten: 0, item: null, effects: { slow: 0, shield: 0 }, sinceItem: 0, nextItem: 0, events: [] };
  st.nextItem = nextGap(st);
  placeFood(st);
  return st;
}
const nextGap = (st) => ITEM_EVERY[0] + Math.floor(st.rand() * (ITEM_EVERY[1] - ITEM_EVERY[0] + 1));

// 지렁이·돌(·사과·아이템)이 없는 칸 중 하나에 사과를 놓는다 (빈칸이 없으면 null)
function placeFood(st) {
  const taken = new Set(st.worm.map((s) => s.y * N + s.x));
  for (const r of st.rocks) taken.add(r);
  if (st.item) taken.add(st.item.y * N + st.item.x);
  const free = [];
  for (let i = 0; i < N * N; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) { st.food = null; return; }
  const i = free[Math.floor(st.rand() * free.length)];
  st.food = { x: i % N, y: Math.floor(i / N) };
}

// 아이템을 하나 놓는다 (빈 칸이 없으면 안 놓는다)
function spawnItem(st) {
  const taken = new Set(st.worm.map((s) => s.y * N + s.x));
  for (const r of st.rocks) taken.add(r);
  if (st.food) taken.add(st.food.y * N + st.food.x);
  const free = [];
  for (let i = 0; i < N * N; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) return false;
  const i = free[Math.floor(st.rand() * free.length)];
  let x = st.rand(), kind = ITEM_KINDS[0][0];
  for (const [k, w] of ITEM_KINDS) { if ((x -= w) < 0) { kind = k; break; } }
  st.item = { kind, x: i % N, y: Math.floor(i / N), ttl: ITEM_TTL };
  st.events.push({ type: 'itemSpawn', kind });
  return true;
}

// 꺾기를 받아 둔다. 받았으면 true
function turn(st, x, y) {
  if (st.over) return false;
  const last = st.turns.length ? st.turns[st.turns.length - 1] : st.dir;
  if ((x === last.x && y === last.y) || (x === -last.x && y === -last.y)) return false;
  if (st.turns.length >= 2) return false;
  st.turns.push({ x, y });
  return true;
}

// 한 칸 간다. 'move' · 'eat' · 'dead' (이미 끝났으면 'over'). 아이템 모드의 일은 st.events 에 남긴다
function step(st) {
  if (st.over) return 'over';
  if (st.turns.length) st.dir = st.turns.shift();
  const shield = st.effects.shield > 0;
  const h = { x: st.worm[0].x + st.dir.x, y: st.worm[0].y + st.dir.y };
  if (shield) { h.x = (h.x + N) % N; h.y = (h.y + N) % N; }       // 보호막: 벽은 반대편으로 나온다
  const eat = !!st.food && h.x === st.food.x && h.y === st.food.y;
  const getItem = !!st.item && h.x === st.item.x && h.y === st.item.y;
  const grow = eat || (getItem && st.item.kind === 'gold');
  const body = grow ? st.worm : st.worm.slice(0, -1);              // 먹지 않으면 꼬리가 이번에 비켜 준다
  const out = h.x < 0 || h.y < 0 || h.x >= N || h.y >= N;
  if (!shield && (out || st.rocks.has(h.y * N + h.x) || body.some((s) => s.x === h.x && s.y === h.y))) { st.over = true; return 'dead'; }
  st.worm.unshift(h);
  if (!grow) st.worm.pop();
  let result = 'move';
  if (eat) { st.score++; st.eaten++; placeFood(st); result = 'eat'; }
  if (getItem) takeItem(st);
  if (eat && st.items) {
    st.sinceItem++;
    if (!st.item && st.sinceItem >= st.nextItem) { if (spawnItem(st)) { st.sinceItem = 0; st.nextItem = nextGap(st); } }
  }
  tick(st);
  return result;
}

// 아이템을 먹었다
function takeItem(st) {
  const it = st.item;
  st.item = null;
  st.eaten++;
  if (it.kind === 'gold') st.score += GOLD_SCORE;
  else { st.score++; if (it.kind === 'slow') st.effects.slow = SLOW_STEPS; else st.effects.shield = SHIELD_STEPS; }
  st.events.push({ type: 'item', kind: it.kind });
}

// 걸음마다: 아이템이 사라질 때까지, 효과가 끝날 때까지
function tick(st) {
  if (st.item && --st.item.ttl <= 0) { st.item = null; st.events.push({ type: 'itemGone' }); }
  for (const k of ['slow', 'shield']) {
    if (st.effects[k] > 0 && --st.effects[k] === 0) st.events.push({ type: 'effectEnd', kind: k });
  }
}

// 걸음 간격: 먹을수록 빨라진다. 황금 사과의 보너스 점수로는 빨라지지 않고 먹은 개수로만 빨라진다 (speedOf)
const speedOf = (st) => speedMs(st.eaten, st);
const speedMs = (score, st) => Math.max(60, 130 - score * 3) * (st && st.effects && st.effects.slow > 0 ? SLOW_FACTOR : 1);

return { N, MAPS, ITEM_KINDS, ITEM_EVERY, ITEM_TTL, GOLD_SCORE, SLOW_STEPS, SLOW_FACTOR, SHIELD_STEPS, newGame, placeFood, spawnItem, turn, step, speedMs, speedOf };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_WORM;

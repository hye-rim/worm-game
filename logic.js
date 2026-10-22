'use strict';

// 지렁이: 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 20×20 판. 지렁이는 한 칸씩 앞으로 가고, 사과를 먹으면 한 마디 길어지고 1점
// - 벽이나 제 몸에 부딪히면 끝. 이번 걸음에 꼬리가 비켜 주는 칸으로는 들어갈 수 있다
// - 꺾기는 다음 칸들에서 쓸 방향으로 두 개까지 미리 받아 둔다 (빠르게 두 번 꺾어도 둘 다 먹게). 같은 방향·뒤로 돌기는 무시
// - 사과를 먹을수록 빨라진다
const LOGIC_WORM = (() => {
const N = 20;

function newGame(rand = Math.random) {
  const st = { worm: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], dir: { x: 1, y: 0 }, turns: [], food: null, score: 0, over: false, rand };
  placeFood(st);
  return st;
}

// 지렁이가 없는 칸 중 하나에 사과를 놓는다 (빈칸이 없으면 null)
function placeFood(st) {
  const taken = new Set(st.worm.map((s) => s.y * N + s.x));
  const free = [];
  for (let i = 0; i < N * N; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) { st.food = null; return; }
  const i = free[Math.floor(st.rand() * free.length)];
  st.food = { x: i % N, y: Math.floor(i / N) };
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

// 한 칸 간다. 'move' · 'eat' · 'dead' (이미 끝났으면 'over')
function step(st) {
  if (st.over) return 'over';
  if (st.turns.length) st.dir = st.turns.shift();
  const h = { x: st.worm[0].x + st.dir.x, y: st.worm[0].y + st.dir.y };
  const eat = !!st.food && h.x === st.food.x && h.y === st.food.y;
  const body = eat ? st.worm : st.worm.slice(0, -1);              // 먹지 않으면 꼬리가 이번에 비켜 준다
  if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N || body.some((s) => s.x === h.x && s.y === h.y)) { st.over = true; return 'dead'; }
  st.worm.unshift(h);
  if (eat) { st.score++; placeFood(st); return 'eat'; }
  st.worm.pop();
  return 'move';
}

const speedMs = (score) => Math.max(60, 130 - score * 3);

return { N, newGame, placeFood, turn, step, speedMs };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_WORM;

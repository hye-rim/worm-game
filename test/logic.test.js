'use strict';
// 지렁이 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function rng(seed) {                                   // mulberry32 (시험용 고정 난수)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const at = (x, y) => ({ x, y });

test('a new worm: three cells heading right, an apple somewhere else', () => {
  for (let s = 1; s <= 50; s++) {
    const st = L.newGame(rng(s));
    assert.deepStrictEqual(st.worm, [at(10, 10), at(9, 10), at(8, 10)]);
    assert.ok(!st.worm.some((p) => p.x === st.food.x && p.y === st.food.y));
    assert.ok(st.food.x >= 0 && st.food.x < L.N && st.food.y >= 0 && st.food.y < L.N);
  }
});

test('moving, eating and growing', () => {
  const st = L.newGame(rng(1));
  st.food = at(12, 10);
  assert.strictEqual(L.step(st), 'move');
  assert.deepStrictEqual(st.worm, [at(11, 10), at(10, 10), at(9, 10)]);
  assert.strictEqual(L.step(st), 'eat');
  assert.strictEqual(st.worm.length, 4);
  assert.strictEqual(st.score, 1);
  assert.ok(!st.worm.some((p) => p.x === st.food.x && p.y === st.food.y), 'the new apple is not under the worm');
});

test('turning: no reversing, no repeats, at most two queued', () => {
  const st = L.newGame(rng(2));
  assert.ok(!L.turn(st, -1, 0), 'cannot turn back on itself');
  assert.ok(!L.turn(st, 1, 0), 'already going that way');
  assert.ok(L.turn(st, 0, 1));
  assert.ok(!L.turn(st, 0, -1), 'reverse of the queued turn');
  assert.ok(L.turn(st, -1, 0), 'quick second turn (down then left) is kept');
  assert.ok(!L.turn(st, 0, 1), 'only two are queued');
  st.food = null;
  L.step(st); L.step(st);
  assert.deepStrictEqual(st.worm[0], at(9, 11));
});

test('hitting a wall or itself ends the game', () => {
  const st = L.newGame(rng(3));
  st.food = null;
  let r;
  for (let k = 0; k < 20 && r !== 'dead'; k++) r = L.step(st);
  assert.strictEqual(r, 'dead');
  assert.deepStrictEqual(st.worm[0], at(19, 10), 'stopped at the right edge');
  assert.strictEqual(L.step(st), 'over');
  const self = L.newGame(rng(4));
  self.worm = [at(5, 5), at(4, 5), at(4, 6), at(5, 6), at(6, 6), at(6, 5)];
  self.dir = at(1, 0); self.food = null;
  L.turn(self, 0, 1);                                   // 아래 (5,6) 는 몸통
  assert.strictEqual(L.step(self), 'dead');
});

test('the head may move into the cell the tail is leaving, but not when the worm grows there', () => {
  const st = L.newGame(rng(5));
  st.worm = [at(5, 5), at(6, 5), at(6, 6), at(5, 6)];  // 꼬리 (5,6) 가 머리 바로 아래
  st.dir = at(-1, 0); st.food = null;
  L.turn(st, 0, 1);
  assert.strictEqual(L.step(st), 'move', 'following your own tail is fine');
  assert.deepStrictEqual(st.worm[0], at(5, 6));
  const grow = L.newGame(rng(6));
  grow.worm = [at(5, 5), at(6, 5), at(6, 6), at(5, 6)];
  grow.dir = at(-1, 0); grow.food = at(5, 6);          // (사과가 꼬리 칸에 있을 수는 없지만) 길어지는 걸음에는 꼬리가 안 비킨다
  L.turn(grow, 0, 1);
  assert.strictEqual(L.step(grow), 'dead');
});

test('apples always land on a free cell, and none when the board is full', () => {
  const st = L.newGame(rng(7));
  st.worm = [];
  for (let y = 0; y < L.N; y++) for (let x = 0; x < L.N; x++) if (!(x === 3 && y === 7)) st.worm.push(at(x, y));
  L.placeFood(st);
  assert.deepStrictEqual(st.food, at(3, 7));
  st.worm.push(at(3, 7));
  L.placeFood(st);
  assert.strictEqual(st.food, null);
});

test('a simple autopilot plays a long game without the rules breaking', () => {
  // 사과 쪽으로 가되 죽는 칸은 피한다
  for (let s = 1; s <= 10; s++) {
    const st = L.newGame(rng(s));
    for (let k = 0; k < 3000 && !st.over; k++) {
      const h = st.worm[0];
      const opts = [at(1, 0), at(-1, 0), at(0, 1), at(0, -1)].filter((d) => !(d.x === -st.dir.x && d.y === -st.dir.y));
      const safe = opts.filter((d) => {
        const n = at(h.x + d.x, h.y + d.y);
        return n.x >= 0 && n.y >= 0 && n.x < L.N && n.y < L.N && !st.worm.slice(0, -1).some((p) => p.x === n.x && p.y === n.y);
      });
      const pick = (safe.length ? safe : opts).sort((a, b) => (Math.abs(h.x + a.x - st.food.x) + Math.abs(h.y + a.y - st.food.y)) - (Math.abs(h.x + b.x - st.food.x) + Math.abs(h.y + b.y - st.food.y)))[0];
      L.turn(st, pick.x, pick.y);
      const before = st.worm.length, r = L.step(st);
      if (r === 'eat') assert.strictEqual(st.worm.length, before + 1);
      if (r === 'move') assert.strictEqual(st.worm.length, before);
      const cells = new Set(st.worm.map((p) => p.y * L.N + p.x));
      if (!st.over) assert.strictEqual(cells.size, st.worm.length, 'the worm never overlaps itself');
    }
    assert.ok(st.score >= 10, `seed ${s}: ${st.score}`);
    assert.strictEqual(st.worm.length - 3, st.score);
  }
  assert.ok(L.speedMs(0) > L.speedMs(10) && L.speedMs(1000) === 60);
});

// ---------- 아이템 모드 ----------
const itemGame = (seed = 1, map = 0) => L.newGame(rng(seed), { items: true, map });
const eatNow = (st) => { const h = st.worm[0]; st.food = at(h.x + st.dir.x, h.y + st.dir.y); return L.step(st); };      // 바로 앞에 사과를 두고 먹는다
const flood = (rocks) => {                                           // 돌이 아닌 칸이 모두 이어져 있는가
  const free = []; for (let i = 0; i < L.N * L.N; i++) if (!rocks.has(i)) free.push(i);
  const seen = new Set([free[0]]), stack = [free[0]];
  while (stack.length) {
    const i = stack.pop(), x = i % L.N, y = Math.floor(i / L.N);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * L.N + nx;
      if (nx >= 0 && ny >= 0 && nx < L.N && ny < L.N && !rocks.has(k) && !seen.has(k)) { seen.add(k); stack.push(k); }
    }
  }
  return seen.size === free.length;
};

test('classic mode is unchanged: no rocks, no items, no effects', () => {
  const st = L.newGame(rng(3));
  assert.strictEqual(st.items, false);
  assert.strictEqual(st.rocks.size, 0);
  for (let k = 0; k < 200 && !st.over; k++) { eatNow(st); }
  assert.strictEqual(st.item, null);
  assert.strictEqual(st.events.length, 0);
  assert.strictEqual(L.newGame(rng(3), { map: 2 }).rocks.size, 0, 'a map is ignored outside item mode');
  assert.strictEqual(L.speedMs(5), L.speedMs(5, st));
});

test('every map keeps the start free, is fully connected, and is not crowded', () => {
  assert.ok(L.MAPS.length >= 4);
  for (let m = 0; m < L.MAPS.length; m++) {
    const rocks = new Set(L.MAPS[m].rocks);
    assert.strictEqual(rocks.size, L.MAPS[m].rocks.length, `map ${m} has no duplicate rocks`);
    assert.ok([...rocks].every((i) => i >= 0 && i < L.N * L.N));
    for (let x = 3; x < L.N; x++) assert.ok(!rocks.has(10 * L.N + x), `map ${m}: the middle row is clear at x=${x}`);
    assert.ok(flood(rocks), `map ${m}: every free cell can be reached`);
    assert.ok(rocks.size <= L.N * L.N * 0.1, `map ${m}: ${rocks.size} rocks`);
    const st = itemGame(1, m);
    assert.ok(!st.rocks.has(st.food.y * L.N + st.food.x), 'the first apple is not on a rock');
  }
});

test('hitting a rock ends the game; the shield passes through it', () => {
  const st = itemGame(1, 1);
  st.rocks.add(10 * L.N + 11);                                       // 바로 앞
  assert.strictEqual(L.step(st), 'dead');
  const sh = itemGame(1, 1);
  sh.rocks.add(10 * L.N + 11); sh.effects.shield = 5;
  assert.notStrictEqual(L.step(sh), 'dead');
  assert.deepStrictEqual(sh.worm[0], at(11, 10));
});

test('apples and items never land on rocks, the worm or each other', () => {
  for (let m = 0; m < L.MAPS.length; m++) {
    const st = itemGame(m + 5, m);
    for (let k = 0; k < 300; k++) {
      L.placeFood(st); L.spawnItem(st);
      const food = st.food.y * L.N + st.food.x, item = st.item.y * L.N + st.item.x;
      assert.ok(!st.rocks.has(food) && !st.rocks.has(item));
      assert.ok(!st.worm.some((p) => p.y * L.N + p.x === food || p.y * L.N + p.x === item));
      assert.notStrictEqual(food, item);
    }
  }
});

test('an item appears after the set number of apples and times out after its lifetime', () => {
  const st = itemGame(2);
  assert.strictEqual(st.item, null);
  let apples = 0, spawnedAt = -1;
  while (st.item === null && apples < 10) { st.worm = [at(10, 10), at(9, 10), at(8, 10)]; st.dir = at(1, 0); st.rocks.clear(); eatNow(st); apples++; if (st.item) spawnedAt = apples; }
  assert.ok(spawnedAt >= L.ITEM_EVERY[0] && spawnedAt <= L.ITEM_EVERY[1], `after ${spawnedAt} apples`);
  assert.ok(st.events.some((e) => e.type === 'itemSpawn'));
  assert.strictEqual(st.item.ttl, L.ITEM_TTL - 1, 'the step that spawned it already counts once');
  st.events.length = 0;
  for (let k = 0; k < L.ITEM_TTL + 2 && st.item; k++) { st.worm = [at(10, 10), at(9, 10), at(8, 10)]; st.dir = at(1, 0); st.food = at(0, 0); if (st.item.x === 11 && st.item.y === 10) st.item.x = 15; L.step(st); }
  assert.strictEqual(st.item, null, 'it went away');
  assert.ok(st.events.some((e) => e.type === 'itemGone'));
});

test('gold apple: +5 points and one more segment', () => {
  const st = itemGame(1);
  st.item = { kind: 'gold', x: 11, y: 10, ttl: 50 };
  const len = st.worm.length, sc = st.score;
  assert.strictEqual(L.step(st), 'move');
  assert.strictEqual(st.score, sc + L.GOLD_SCORE);
  assert.strictEqual(st.worm.length, len + 1);
  assert.strictEqual(st.item, null);
  assert.ok(st.events.some((e) => e.type === 'item' && e.kind === 'gold'));
});

test('speed follows how many things were eaten, not the bonus points of a gold apple', () => {
  const st = itemGame(1);
  const before = L.speedOf(st);
  st.item = { kind: 'gold', x: 11, y: 10, ttl: 50 };
  L.step(st);
  assert.strictEqual(st.score, L.GOLD_SCORE);
  assert.strictEqual(st.eaten, 1);
  assert.strictEqual(L.speedOf(st), L.speedMs(1), 'one item counts as one step of speed-up');
  assert.ok(L.speedOf(st) < before);
  const c = L.newGame(rng(1));                                       // 기본 모드는 점수 = 먹은 개수라 그대로
  eatNow(c); eatNow(c);
  assert.strictEqual(c.eaten, c.score);
  assert.strictEqual(L.speedOf(c), L.speedMs(c.score));
});

test('slow walk makes steps 1.6 times slower for a set number of steps, then ends', () => {
  const st = itemGame(1);
  st.item = { kind: 'slow', x: 11, y: 10, ttl: 50 };
  const base = L.speedMs(st.score + 1);
  L.step(st);
  assert.ok(st.effects.slow > 0);
  assert.ok(Math.abs(L.speedMs(st.score, st) - L.speedMs(st.score) * L.SLOW_FACTOR) < 1e-9);
  assert.ok(L.speedMs(st.score, st) > base);
  st.events.length = 0;
  const steps = st.effects.slow;
  for (let k = 0; k < steps; k++) { st.worm = [at(10, 10), at(9, 10), at(8, 10)]; st.dir = at(1, 0); st.food = at(0, 0); L.step(st); }
  assert.strictEqual(st.effects.slow, 0);
  assert.ok(st.events.some((e) => e.type === 'effectEnd' && e.kind === 'slow'));
  assert.strictEqual(L.speedMs(st.score, st), L.speedMs(st.score));
});

test('shield: walls wrap around, the worm passes through its own body, then the shield ends and walls kill again', () => {
  const st = itemGame(1);
  st.item = { kind: 'shield', x: 11, y: 10, ttl: 50 };
  L.step(st);
  assert.ok(st.effects.shield > 0);
  st.worm = [at(18, 5), at(17, 5), at(16, 5)]; st.dir = at(1, 0); st.turns = []; st.food = at(0, 0);
  L.step(st); L.step(st);
  assert.strictEqual(st.over, false);
  assert.deepStrictEqual(st.worm[0], at(0, 5), 'came out on the left');
  st.worm = [at(5, 5), at(6, 5), at(7, 5), at(5, 6), at(5, 7)];       // 머리가 몸 한가운데로
  st.dir = at(1, 0);
  L.step(st);
  assert.strictEqual(st.over, false, 'through its own body');
  st.effects.shield = 1; st.worm = [at(18, 5), at(17, 5), at(16, 5)]; st.dir = at(1, 0);
  L.step(st);
  assert.ok(st.events.some((e) => e.type === 'effectEnd' && e.kind === 'shield'));
  L.step(st);                                                          // x=19 -> 20 은 벽
  L.step(st);
  assert.strictEqual(st.over, true, 'without the shield the wall kills');
});

// 최단 길을 찾아 가는 봇: 돌과 몸(꼬리 끝 제외)을 피해 target 까지 가는 첫 걸음. 길이 없으면 갈 수 있는 칸이 가장 넓은 쪽
function bfsMove(st, target) {
  const h = st.worm[0], blocked = new Set([...st.rocks, ...st.worm.slice(0, -1).map((p) => p.y * L.N + p.x)]);
  const dirs = [at(1, 0), at(-1, 0), at(0, 1), at(0, -1)].filter((d) => !(d.x === -st.dir.x && d.y === -st.dir.y));
  const reach = (from) => {                                          // from 에서 target 까지 걸음 수 (못 가면 Infinity)
    const seen = new Map([[from.y * L.N + from.x, 0]]); const q = [from];
    while (q.length) {
      const c = q.shift(), dd = seen.get(c.y * L.N + c.x);
      if (c.x === target.x && c.y === target.y) return dd;
      for (const d of [at(1, 0), at(-1, 0), at(0, 1), at(0, -1)]) {
        const nx = c.x + d.x, ny = c.y + d.y, k = ny * L.N + nx;
        if (nx < 0 || ny < 0 || nx >= L.N || ny >= L.N || blocked.has(k) || seen.has(k)) continue;
        seen.set(k, dd + 1); q.push(at(nx, ny));
      }
    }
    return Infinity;
  };
  let best = null, bd = Infinity;
  for (const d of dirs) {
    const n = at(h.x + d.x, h.y + d.y), k = n.y * L.N + n.x;
    if (n.x < 0 || n.y < 0 || n.x >= L.N || n.y >= L.N || blocked.has(k)) continue;
    const dd = reach(n);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best || dirs[0];
}

test('an autopilot that avoids rocks plays long games on every map without the rules breaking', () => {
  for (let m = 0; m < L.MAPS.length; m++) {
    for (let s = 1; s <= 4; s++) {
      const st = itemGame(s * 7 + m, m);
      for (let k = 0; k < 2500 && !st.over; k++) {
        const tx = st.item && st.item.kind === 'gold' ? st.item : st.food;
        const pick = bfsMove(st, tx);
        L.turn(st, pick.x, pick.y);
        const len = st.worm.length, sc = st.score;
        L.step(st);
        if (st.over) break;
        st.events.length = 0;
        assert.ok(st.worm.length >= len, 'never shrinks');
        assert.ok(st.score >= sc);
        if (st.effects.shield === 0) assert.strictEqual(new Set(st.worm.map((p) => p.y * L.N + p.x)).size, st.worm.length, 'no overlap without the shield');
        assert.ok(st.worm.every((p) => p.x >= 0 && p.x < L.N && p.y >= 0 && p.y < L.N), 'inside the board');
      }
      assert.ok(st.score >= 15, `map ${m} seed ${s}: ${st.score}`);
    }
  }
});

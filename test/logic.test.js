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

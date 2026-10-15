'use strict';
// 사슬검 (수치: data/transforms.js 사슬검 chain / 기술마다 hand · blade)
//  · 공격 중: 칼날 위치는 키프레임 애니메이션(move.blade)으로 정확히 정함 — 물리 영향 없음.
//    판정은 정해진 활성 프레임(startup ~ startup+active)에 칼날 위치 기준 (지난 프레임 → 지금 프레임 선분으로 쓸고 지나간 것까지)
//  · 사슬은 "보이게"만: 손~칼날을 2차 베지어로 그리고, 제어점을 칼날 이동 반대쪽으로 속도만큼 밀어 휘게 함 (멈추면 직선)
//  · 대기·이동 중에만 Verlet 로프 물리 (덜렁거림). 공격 시작 시 물리 → 애니메이션 blendFrames 동안 보간, 끝나면 다시 물리로
//  · 강공(throw): 칼날을 직선으로 던짐 → 적·벽에 박히면 우클릭 유지로 끌어오기 / 그쪽으로 날아가기
//
// 칼날 키: { f: 프레임, a: 각도(0 앞, 90 아래, -90 위), r: 피벗에서 거리, sq: 세로 납작함 } 또는 { f, x, y } (피벗 기준 직교 좌표)
//   e: 이 키까지 가는 구간의 이징 — slow(천천히 출발·정지) / whip(시간 20% 에 경로 80% 급가속 → 감속, o 만큼 지나쳤다 돌아옴) / lin / hold(멈춤)
//   fx: 이 키에 도착할 때 'impact'(바닥 충격파) / 'tang'(사슬 팽팽 반동)

const ChainRope = {
  cfg(p) {
    const d = Transform.of(p);
    return d && d.mech === 'chain' ? d.chain : null;
  },

  make(C, x, y) {
    const n = C.nodes, seg = C.idleLength / (n - 1), nodes = [];
    for (let i = 0; i < n; i++) nodes.push({ x, y: y + i * seg, px: x, py: y + i * seg });
    return { nodes, len: C.idleLength, mode: 'phys', blade: { x, y: y + C.idleLength }, prev: { x, y: y + C.idleLength }, vel: { x: 0, y: 0 },
      speed: 0, hist: [], embed: null, swing: -1, blendFrom: null, crackSwing: -1, fxDone: {}, jingleT: -99, taut: false };
  },

  // ---------- 손 궤적 (손이 먼저 움직임) ----------
  // move.hand: { keys: [[프레임, 앞 x, 발 기준 y], ...] } 또는 { circle: { start, end, cx, cy, r, turns, a0, squash, after } }
  localHand(p, C, f) {
    const m = p.move;
    const rest = C.handRest;
    if (p.state !== 'attack' || !m) return rest;
    if (f === undefined) f = p.stateFrame;
    const H = m.hand;
    if (!H) {
      const pose = p.bladePose(f);
      const a = pose.ang * DEG;
      return [2 + Math.cos(a) * C.handR, pose.py + Math.sin(a) * C.handR * (pose.squash || 1)];
    }
    if (H.keys) {
      const K = H.keys;
      if (f <= K[0][0]) return [K[0][1], K[0][2]];
      for (let i = 1; i < K.length; i++) {
        if (f <= K[i][0]) {
          const a = K[i - 1], b = K[i], t = ease.inOut((f - a[0]) / Math.max(1, b[0] - a[0]));
          return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        }
      }
      const L = K[K.length - 1];
      return [L[1], L[2]];
    }
    const c = H.circle;
    const at = (fr) => {
      const t = (fr - c.start) / Math.max(1, c.end - c.start);
      const a = (c.a0 + t * c.turns * 360) * DEG;
      return [c.cx + Math.cos(a) * c.r, c.cy + Math.sin(a) * c.r * (c.squash || 1)];
    };
    if (f < c.start) {
      const s = at(c.start), t = f / Math.max(1, c.start);
      return [rest[0] + (s[0] - rest[0]) * t, rest[1] + (s[1] - rest[1]) * t];
    }
    if (f <= c.end) return at(f);
    const e = at(c.end), t = Math.min(1, (f - c.end) / (c.after || 8));
    return [e[0] + (rest[0] - e[0]) * t, e[1] + (rest[1] - e[1]) * t];
  },

  handPoint(p, C, f) {
    const l = this.localHand(p, C, f);
    return { x: p.x + p.facing * l[0], y: p.y + l[1] };
  },

  // ---------- 칼날 키프레임 ----------
  // 이징: whip = 시간 20% 에 경로 80% (급가속) → 감속하며 o 만큼 지나쳤다 돌아옴
  ease(e, t, o) {
    if (e === 'hold') return 0;
    if (e === 'lin') return t;
    if (e === 'whip') {
      if (t < 0.2) { const u = t / 0.2; return 0.8 * u * u; }
      const u = (t - 0.2) / 0.8;
      return 0.8 + 0.2 * (1 - Math.pow(1 - u, 3)) + (o || 0) * Math.sin(Math.PI * u) * (1 - u * 0.3);
    }
    return ease.inOut(t);       // slow
  },

  keyPolar(k) {
    if (k.x !== undefined) return { a: Math.atan2(k.y, k.x) / DEG, r: Math.hypot(k.x, k.y), sq: 1 };
    return { a: k.a, r: k.r, sq: k.sq !== undefined ? k.sq : 1 };
  },
  keyXY(k) {
    if (k.x !== undefined) return { x: k.x, y: k.y };
    const sq = k.sq !== undefined ? k.sq : 1;
    return { x: Math.cos(k.a * DEG) * k.r, y: Math.sin(k.a * DEG) * k.r * sq };
  },

  // 기술의 f 프레임 칼날 위치 (발 기준, 앞쪽 +)
  localBlade(p, C, m, f) {
    const B = m.blade;
    if (!B) {
      // 키가 없는 기술(런처·반격 등): 칼 각도를 따라 일정 거리
      const pose = p.bladePose(f), end = m.startup + m.active;
      const r = f < m.startup ? 40 + (C.genericReach - 40) * (f / m.startup) * 0.4
        : f < end ? C.genericReach : C.genericReach + (40 - C.genericReach) * Math.min(1, (f - end) / Math.max(1, m.recovery));
      const a = pose.ang * DEG;
      return [2 + Math.cos(a) * r, pose.py + Math.sin(a) * r * (pose.squash || 1)];
    }
    const K = B.keys, pv = B.pivot || C.pivot;
    let i = 1;
    while (i < K.length && f > K[i].f) i++;
    let q;
    if (f <= K[0].f) q = this.keyXY(K[0]);
    else if (i >= K.length) q = this.keyXY(K[K.length - 1]);
    else {
      const a = K[i - 1], b = K[i];
      const t = this.ease(b.e, Math.min(1, (f - a.f) / Math.max(1, b.f - a.f)), b.o);
      if (b.x !== undefined) {
        const A = this.keyXY(a), Bq = this.keyXY(b);
        q = { x: A.x + (Bq.x - A.x) * t, y: A.y + (Bq.y - A.y) * t };
      } else {
        const A = this.keyPolar(a), Bp = this.keyPolar(b);
        const ang = (A.a + (Bp.a - A.a) * t) * DEG, r = A.r + (Bp.r - A.r) * t, sq = A.sq + (Bp.sq - A.sq) * t;
        q = { x: Math.cos(ang) * r, y: Math.sin(ang) * r * sq };
      }
    }
    return [pv[0] + q.x, pv[1] + q.y];
  },

  bladePoint(p, C, m, f) {
    const l = this.localBlade(p, C, m, f);
    return { x: p.x + p.facing * l[0], y: p.y + l[1] };
  },

  // ---------- 대기 물리 ----------
  simulate(rope, hand, C, ground, drag) {
    const N = rope.nodes, n = N.length, seg = rope.len / (n - 1);
    N[0].px = N[0].x; N[0].py = N[0].y;
    N[0].x = hand.x; N[0].y = hand.y;
    for (let i = 1; i < n; i++) {
      const q = N[i];
      const vx = (q.x - q.px) * drag, vy = (q.y - q.py) * drag;
      q.px = q.x; q.py = q.y;
      q.x += vx; q.y += vy + C.gravity;
    }
    const touched = rope._touched || (rope._touched = new Array(n).fill(false));
    touched.fill(false);
    for (let k = 0; k < C.iterations; k++) {
      for (let i = 0; i < n - 1; i++) {
        const a = N[i], c = N[i + 1];
        const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
        if (d <= seg || d < 1e-6) continue;          // 사슬: 늘어나지 않고 접히기만 함
        const wa = i === 0 ? 0 : 1, wc = i + 1 === n - 1 ? 1 / C.bladeMass : 1;
        const sum = wa + wc, diff = (d - seg) / d;
        a.x += dx * diff * (wa / sum); a.y += dy * diff * (wa / sum);
        c.x -= dx * diff * (wc / sum); c.y -= dy * diff * (wc / sum);
      }
      if (ground) {
        for (let i = 1; i < n; i++) {
          const q = N[i], g = ground(q.x, q.y);
          if (g !== null) { q.y = g; touched[i] = true; }
        }
      }
    }
    for (let i = 1; i < n; i++) {
      if (!touched[i]) continue;
      const q = N[i];
      q.px = q.x - (q.x - q.px) * C.groundFriction;
      if (q.py < q.y) q.py = q.y;
    }
  },

  groundFn(game) {
    const L = game.level;
    return (x, y) => {
      for (const r of L.active) {
        if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + Math.min(r.h, 24)) return r.oneWay ? null : r.y;
      }
      return null;
    };
  },

  // 애니메이션·박힘 → 물리로: 지금 사슬 모양(직선)에 칼날 속도를 실어 이어받음
  toPhysics(rope, hand, C) {
    const N = rope.nodes, n = N.length, b = rope.blade, v = rope.vel;
    const d = Math.hypot(b.x - hand.x, b.y - hand.y);
    rope.len = Math.max(C.idleLength, Math.min(C.length, d));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      N[i].x = hand.x + (b.x - hand.x) * t;
      N[i].y = hand.y + (b.y - hand.y) * t;
      N[i].px = N[i].x - v.x * t * 0.6;
      N[i].py = N[i].y - v.y * t * 0.6;
    }
    rope.mode = 'phys';
  },

  // ---------- 매 프레임 ----------
  // game 이 없으면 카드 미리보기 (판정·효과 없이 모양만, 바닥 y = 0)
  update(game, p, C) {
    C = C || this.cfg(p);
    if (!C) { p.rope = null; p.chainHand = null; return; }
    const hand = this.handPoint(p, C);
    p.chainHand = hand;
    if (!p.rope) p.rope = this.make(C, hand.x, hand.y);
    const rope = p.rope, m = p.state === 'attack' ? p.move : null;
    rope._C = C;
    const prev = { x: rope.blade.x, y: rope.blade.y };
    // 다른 공격을 시작하면 박힌 사슬은 풀림
    if (rope.embed && m && rope.embed.type !== 'bind' && p.swingId !== rope.embed.swing) rope.embed = null;

    if (m) {
      // 공격: 키프레임 애니메이션 (시작할 때 지금 칼날 위치에서 blendFrames 동안 보간)
      if (rope.swing !== p.swingId) {
        rope.swing = p.swingId;
        rope.blendFrom = { x: rope.blade.x, y: rope.blade.y };
        rope.fxDone = {};
      }
      const f = p.stateFrame;
      let q = this.bladePoint(p, C, m, f);
      if (rope.blendFrom && f < C.blendFrames) {
        const t = (f + 1) / (C.blendFrames + 1);
        q = { x: rope.blendFrom.x + (q.x - rope.blendFrom.x) * t, y: rope.blendFrom.y + (q.y - rope.blendFrom.y) * t };
      }
      // 바닥 아래로는 안 들어감 (오버슈트가 땅을 파고들지 않게)
      const g = game ? this.groundFn(game)(q.x, q.y) : (q.y > 0 ? 0 : null);
      if (g !== null) q.y = g;
      rope.blade = q;
      rope.mode = 'anim';
      rope.taut = !!m.taut || !!(m.throw && f >= m.startup && f <= m.startup + m.active + 2);
    } else if (rope.embed) {
      rope.mode = 'embed';
      rope.taut = false;
      if (game) this.updateEmbed(game, p, rope, C);
      if (rope.embed) rope.blade = { x: rope.embed.at.x, y: rope.embed.at.y };
    } else {
      rope.taut = false;
      if (rope.mode !== 'phys') this.toPhysics(rope, hand, C);
      if (rope.len > C.idleLength) rope.len = Math.max(C.idleLength, rope.len - C.retract);
      this.simulate(rope, hand, C, game ? this.groundFn(game) : (x, y) => (y > 0 ? 0 : null), C.idleDrag);
      const b = rope.nodes[rope.nodes.length - 1];
      rope.blade = { x: b.x, y: b.y };
    }
    rope.vel = { x: rope.blade.x - prev.x, y: rope.blade.y - prev.y };
    rope.prev = prev;
    rope.speed = Math.hypot(rope.vel.x, rope.vel.y);
    // 칼날 잔상 기록 (그릴 땐 급가속 구간만)
    const dir = this.bladeDir(rope, hand);
    rope.hist.push({ tip: { x: rope.blade.x + dir.x * C.bladeTip, y: rope.blade.y + dir.y * C.bladeTip },
      base: { x: rope.blade.x - dir.x * C.bladeBack, y: rope.blade.y - dir.y * C.bladeBack },
      v: m && p.stateFrame >= m.startup && p.stateFrame <= m.startup + m.active + 2 ? rope.speed : 0 });
    if (rope.hist.length > 6) rope.hist.shift();
    if (!game) return;
    if (m) this.keyFx(game, p, rope, m, p.stateFrame, C);
    // 짤랑: 칼날 속도에 비례 (물리 중엔 마디 평균 속도)
    let v = rope.speed;
    if (rope.mode === 'phys') {
      const N = rope.nodes;
      v = 0;
      for (let i = 1; i < N.length; i++) v += Math.hypot(N[i].x - N[i].px, N[i].y - N[i].py);
      v /= N.length - 1;
    }
    const fr = game.frame || 0;
    if (v > C.jingleSpeed && fr - rope.jingleT > Math.max(4, 14 - v * 0.5)) {
      rope.jingleT = fr;
      Sound.play('jingle', Math.min(1, v / C.jingleLoud));
    }
  },

  // 칼날 방향: 사슬 끝 접선 (애니메이션 중엔 베지어 제어점 → 칼날)
  bladeDir(rope, hand) {
    let dx, dy;
    if (rope.mode === 'phys') {
      const N = rope.nodes, a = N[N.length - 2], b = N[N.length - 1];
      dx = b.x - a.x; dy = b.y - a.y;
    } else {
      const c = this.control(rope, hand);
      dx = rope.blade.x - c.x; dy = rope.blade.y - c.y;
    }
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  },

  // 베지어 제어점: 손~칼날 가운데에서 칼날 이동 반대쪽으로 (속도에 비례). 멈추면 직선, 팽팽(taut)이면 직선
  control(rope, hand) {
    const b = rope.blade, mx = (hand.x + b.x) / 2, my = (hand.y + b.y) / 2;
    const C = rope._C;
    if (!C || rope.taut) return { x: mx, y: my };
    if (rope.mode === 'embed') {
      const sag = rope.embed && rope.embed.pulling ? 0 : C.embedSag;     // 당기면 직선, 아니면 살짝 처짐
      return { x: mx, y: my + sag };
    }
    const s = rope.speed;
    if (s < 0.01) return { x: mx, y: my };
    const k = Math.min(C.curveMax, s * C.curveK);
    return { x: mx - rope.vel.x / s * k, y: my - rope.vel.y / s * k };
  },

  // 키 도착 효과 / 급가속 크랙
  keyFx(game, p, rope, m, f, C) {
    const b = rope.blade, K = m.blade && m.blade.keys;
    if (K) for (const k of K) {
      if (!k.fx || f !== k.f || rope.fxDone[k.f]) continue;
      rope.fxDone[k.f] = true;
      if (k.fx === 'impact' && m.impact) this.impact(game, p, b.x, Math.max(b.y, p.y - 4), m.impact);
      if (k.fx === 'tang') {
        Effects.ring(b.x, b.y, '#cfe', 36);
        Effects.sparks(b.x, b.y, -p.facing, 7, '#dff');
        Effects.addShake(3);
        Sound.play('tang');
      }
    }
    // 크랙 '착': 타격 구간(활성 프레임)에서 급가속할 때만
    if (f >= m.startup && f <= m.startup + m.active && rope.speed >= C.crackSpeed && rope.crackSwing !== p.swingId) {
      rope.crackSwing = p.swingId;
      Effects.flashRing(b.x, b.y);
      Effects.sparks(b.x, b.y, p.facing, 5, '#fff');
      Sound.play('crack');
    }
  },

  // ---------- 판정 (공격 중, 활성 프레임에만) ----------
  attack(game, p) {
    const C = this.cfg(p), rope = p.rope, m = p.move;
    if (!C || !rope || !m || m.noHit || rope.mode !== 'anim') return;
    const f = p.stateFrame;
    if (f < m.startup || f > m.startup + m.active) return;
    const a = rope.prev, b = rope.blade, R = C.hitRadius;
    const fr = game.frame || 0;
    if (!p.rehit || p.rehitSwing !== p.swingId) { p.rehit = new Map(); p.rehitSwing = p.swingId; }
    for (const e of game.enemies) {
      if (e.dead || e.executed) continue;
      if (m.rehit ? fr - (p.rehit.get(e) === undefined ? -999 : p.rehit.get(e)) < m.rehit : p.hitList.has(e)) continue;
      const hit = this.segBox(a, b, e, R);
      if (!hit) continue;
      p.hitList.add(e);
      p.rehit.set(e, fr);
      p.hitFx = hit;
      Combat.hitEnemy(game, p, e, m);
      // 던지기·포박: 맞은 적에 박힘
      if (m.throw && !e.dead && !rope.embed) { this.embedAt(game, p, rope, { type: m.special === 'bind' ? 'bind' : 'enemy', e }); return; }
    }
    // 던지기: 벽·맵 끝에 박힘
    if (m.throw && !rope.embed && m.special !== 'bind') {
      const L = game.level, steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
      for (let i = 1; i <= steps; i++) {
        const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
        let wall = x < 2 || x > L.width - 2;
        if (!wall) for (const r of L.active) if (!r.oneWay && x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) { wall = true; break; }
        if (wall) {
          const at = { x: Math.max(2, Math.min(L.width - 2, x)), y };
          this.embedAt(game, p, rope, { type: 'wall', at });
          Effects.sparks(at.x, y, -p.facing, 8, '#dff');
          Sound.play('clash');
          return;
        }
      }
    }
  },

  // 선분(지난 칼날 → 지금 칼날)과 적 몸 상자 거리 ≤ R 이면 맞음 (빠르게 지나가도 놓치지 않게)
  segBox(a, b, e, R) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
      const cx = Math.max(e.x - e.w / 2, Math.min(e.x + e.w / 2, x)), cy = Math.max(e.y - e.h, Math.min(e.y, y));
      if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) return { x, y };
    }
    return null;
  },

  embedAt(game, p, rope, E) {
    E.t = 0;
    E.swing = p.swingId;
    if (!E.at) E.at = { x: E.e.x, y: E.e.y - E.e.h * 0.5 };
    rope.embed = E;
    rope.blade = { x: E.at.x, y: E.at.y };
    rope.len = Math.hypot(E.at.x - p.chainHand.x, E.at.y - p.chainHand.y);
    Sound.play('chain');
    p.endMove();    // 던지기 동작은 끝 — 이제 우클릭 유지로 당기기
  },

  // 박힌 상태: 우클릭을 누르고 있으면 사슬이 직선으로 팽팽해지며 감아 당김 (가벼운 적은 끌려옴 / 무거운 적·보스·벽이면 내가 날아감)
  updateEmbed(game, p, rope, C) {
    const E = rope.embed;
    E.t++;
    if (E.type === 'bind') {
      const b = Transform.binds.find((x) => x.e === E.e);
      if (!b || b.thrown || E.e.dead) { rope.embed = null; return; }
      E.at.x = E.e.x; E.at.y = E.e.y - E.e.h * 0.5;
      E.pulling = true;
      return;
    }
    if (E.type === 'enemy') {
      if (E.e.dead || E.e.executed || E.e.remove) { rope.embed = null; return; }
      E.at.x = E.e.x; E.at.y = E.e.y - E.e.h * 0.5;
    }
    const held = Input.isDown('heavy');
    if (held) E.held = true;
    E.pulling = held;
    if ((E.held && !held) || (!E.held && E.t > C.embedFrames) || E.t > C.embedFrames * 3 || p.state === 'hurt' || p.dead) {
      rope.embed = null;
      return;
    }
    if (!held) return;
    rope.len = Math.max(C.minLen, rope.len - C.reelSpeed);
    const hx = p.chainHand.x, hy = p.chainHand.y;
    const dx = E.at.x - hx, dy = E.at.y - hy, d = Math.hypot(dx, dy) || 1;
    const excess = d - rope.len;
    if (excess <= 0) return;
    const ux = dx / d, uy = dy / d;
    const light = E.type === 'enemy' && !E.e.isBoss && (E.e.cfg.weight || 1) < 2;
    if (light) {
      const e = E.e;
      e.x -= ux * Math.min(excess, C.zipSpeed);
      e.vx = 0;
      if (e.state !== 'launched' && e.state !== 'broken' && e.state !== 'hurt') { e.hitstun = 12; e.setState('hurt'); }
      else if (e.state === 'hurt') e.hitstun = Math.max(e.hitstun || 0, 6);
    } else {
      p.vx = ux * C.zipSpeed;
      p.vy = uy * C.zipSpeed - 0.6;
      if (uy < -0.2) p.onGround = false;
    }
  },

  impact(game, p, x, y, I) {
    Effects.shockwave(x, y, I.radius);
    Effects.dust(x, y, 8, 0);
    Effects.addShake(5);
    Sound.play('quake');
    for (const e of game.enemies) {
      if (e.dead || e.executed || Math.abs(e.x - x) > I.radius || Math.abs(e.y - y) > 40) continue;
      const dir = Math.sign(e.x - x) || p.facing;
      const res = Combat.applyHit(game, e, I.damage * p.damageMult(), false, { dir, knockX: 3, knockY: -4, hitstun: 26, launch: false, attackerX: x },
        { hitstop: 4, shake: 2, heavy: true, x: e.x, y: e.y - 6, styleId: 'CHAIN_IMPACT', weapon: 'sword' });
      if (res !== 'kill' && res !== 'blocked') e.addPosture(I.posture || 0, game);
    }
  },

  // ---------- 그리기 ----------
  // debug: 슬로모션 디버그 (키프레임 경로 점선, 활성 프레임엔 칼날 빨갛게)
  draw(ctx, p, col, debug) {
    const C = this.cfg(p), rope = p.rope;
    if (!C || !rope) return;
    rope._C = C;
    const hand = p.chainHand || rope.nodes[0];
    const pal = p.trailPal();
    const m = p.state === 'attack' ? p.move : null;
    if (debug && m) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,230,120,0.8)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      const total = m.startup + m.active + (m.hold || 0) + m.recovery;
      for (let f = 0; f <= total; f++) {
        const q = this.bladePoint(p, C, m, f);
        if (f === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // 칼날 잔상: 급가속 구간에만
    const H = rope.hist;
    for (let i = 1; i < H.length; i++) {
      const a = H[i - 1], c = H[i];
      if (c.v < C.blurSpeed) continue;
      const k = Math.min(1, c.v / (C.blurSpeed * 3)) * (i / H.length);
      ctx.fillStyle = `rgba(${pal.outer},${0.5 * k})`;
      ctx.beginPath();
      ctx.moveTo(a.base.x, a.base.y); ctx.lineTo(a.tip.x, a.tip.y); ctx.lineTo(c.tip.x, c.tip.y); ctx.lineTo(c.base.x, c.base.y);
      ctx.closePath();
      ctx.fill();
    }
    // 사슬 경로: 물리 = 마디 / 애니메이션·박힘 = 2차 베지어
    let pts;
    if (rope.mode === 'phys') pts = rope.nodes.map((q) => ({ x: q.x, y: q.y }));
    else {
      const c = this.control(rope, hand), b = rope.blade;
      pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, u = 1 - t;
        pts.push({ x: u * u * hand.x + 2 * u * t * c.x + t * t * b.x, y: u * u * hand.y + 2 * u * t * c.y + t * t * b.y });
      }
    }
    // 고리: 곡선 위에 일정 간격으로 타원 (가로/세로 번갈아)
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.3;
    let carry = 0, li = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < 0.01) continue;
      const ang = Math.atan2(dy, dx);
      let s = carry;
      for (; s < d; s += C.linkGap) {
        const t = s / d;
        ctx.beginPath();
        ctx.ellipse(a.x + dx * t, a.y + dy * t, 3.1, li % 2 ? 0.8 : 1.9, ang, 0, Math.PI * 2);
        ctx.stroke();
        li++;
      }
      carry = s - d;
    }
    ctx.restore();
    // 칼날
    const dir = this.bladeDir(rope, hand), b = rope.blade;
    const tip = { x: b.x + dir.x * C.bladeTip, y: b.y + dir.y * C.bladeTip };
    const base = { x: b.x - dir.x * C.bladeBack, y: b.y - dir.y * C.bladeBack };
    const hot = debug && m && p.stateFrame >= m.startup && p.stateFrame <= m.startup + m.active;
    Anim.drawBlade(ctx, base, tip, 3, 1.2, hot ? '#ff3030' : col);
    if (debug && m) {
      ctx.save();
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = hot ? '#ff6060' : '#fff';
      ctx.fillText(`${p.stateFrame}f`, b.x, b.y - 12);
      ctx.restore();
    }
  },
};

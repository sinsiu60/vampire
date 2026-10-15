'use strict';
// 사슬검 마우스 조준 (우클릭 사슬 던지기 / Q 포박 / Q 투척) + 조준 보정 + 조준 VFX
//  · 조준 방향: 손 → 마우스 커서 (360°). 조준 중엔 마우스 쪽을 바라봄
//  · 보정 수치: config.js AIM_ASSIST (단계는 설정 메뉴, Settings.aimAssist) / 동작 수치: data/transforms.js 사슬검 aim · 스킬 bind
//  · p.aim = { mode: 'throw' | 'bind' | 'toss', t, lock(잠긴 적), wall(스냅 지점), status, vis(조준점), plan(투척 예측) }
//  · 발사하면 p.aimShot = { ang, target, point, homing, hitScale } → chainrope.js 가 키프레임 경로를 이 각도만큼 돌려서 씀

const Aim = {
  level() { return AIM_ASSIST.levels[Settings.aimAssist] || AIM_ASSIST.levels[AIM_ASSIST.defaultLevel]; },

  // 사슬검 aim 수치 (사슬검이 아니면 null)
  cfg(p) {
    const d = Transform.of(p);
    return d && d.mech === 'chain' ? d.aim : null;
  },

  // 마우스 → 월드 좌표
  mouseWorld(game) {
    const m = Input.mouse(), z = CONFIG.view.zoom;
    return { x: game.cam.x + m.x / z, y: game.cam.y + m.y / z };
  },

  hand(p) { return p.chainHand || { x: p.x + p.facing * 9, y: p.y - 30 }; },
  // 칼날 키프레임 회전 중심 (어깨)
  pivot(p, facing) {
    const d = Transform.of(p), pv = (d && d.chain && d.chain.pivot) || [2, -32];
    return { x: p.x + (facing || p.facing) * pv[0], y: p.y + pv[1] };
  },

  angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  },

  center(e) { return { x: e.x, y: e.y - e.h * 0.5 }; },

  // 손 → 점 사이에 벽(통과 못 하는 지형)이 없는가
  los(game, a, b, skip) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
    for (let i = 1; i < n; i++) {
      const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
      for (const r of game.level.active) {
        if (r.oneWay || r === skip) continue;
        if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return false;
      }
    }
    return true;
  },

  // 손에서 ang 방향으로 range 안에서 처음 닿는 벽 (없으면 null)
  ray(game, a, ang, range) {
    const L = game.level, cx = Math.cos(ang), cy = Math.sin(ang);
    for (let s = 6; s <= range; s += 5) {
      const x = a.x + cx * s, y = a.y + cy * s;
      if (x < 2 || x > L.width - 2) return { x: Math.max(2, Math.min(L.width - 2, x)), y };
      for (const r of L.active) if (!r.oneWay && x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return { x, y };
    }
    return null;
  },

  // 커서 반경 안의 벽 모서리·발판 끝 (갈고리 스냅)
  wallSnap(game, cursor, hand, range) {
    let best = null, bd = AIM_ASSIST.wallSnap;
    for (const r of game.level.active) {
      const corners = r.oneWay ? [[r.x, r.y], [r.x + r.w, r.y]]
        : [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
      for (const [cx, cy] of corners) {
        const d = Math.hypot(cx - cursor.x, cy - cursor.y);
        if (d > bd || Math.hypot(cx - hand.x, cy - hand.y) > range) continue;
        // 지형 안쪽으로 살짝 들어간 지점에 박힘
        const ix = cx + (cx === r.x ? 3 : -3), iy = cy + (cy === r.y ? 3 : -3);
        if (!this.los(game, hand, { x: cx + (hand.x - cx) * 0.05, y: cy + (hand.y - cy) * 0.05 }, r)) continue;
        bd = d;
        best = { x: ix, y: iy, cx, cy };
      }
    }
    return best;
  },

  // ---------- 시작 / 취소 ----------
  start(game, p, mode) {
    const cur = this.mouseWorld(game);
    p.aim = { mode, t: 0, lock: null, lockT: 0, lockScore: 0, wall: null, snapT: 0, status: 'empty', blend: 0, vis: { x: cur.x, y: cur.y }, plan: null, scores: [] };
    if (mode === 'bind' || mode === 'toss') Sound.play('menuMove');
  },
  cancel(game, p) {
    p.aim = null;
    if (game) game.aimSlow = 0;
  },

  // Q: 포박 중이면 투척 조준, 아니면 (쿨타임이 끝났으면) 포박 조준
  startQ(game, p) {
    const b = Transform.binds.find((x) => x.phase === 'orbit');
    if (b) { this.start(game, p, 'toss'); p.aim.bind = b; return true; }
    const t = p.weaponType();
    if (p.skillCd[t].q > 0) { p.skillDeny[t].q = 14; Sound.play('deny'); return false; }
    this.start(game, p, 'bind');
    return true;
  },

  // ---------- 매 프레임 ----------
  update(game, p) {
    const A = p.aim, D = this.cfg(p);
    if (!A || !D) { if (A) this.cancel(game, p); game.aimSlow = 0; return; }
    if (p.dead || p.state === 'hurt' || p.state === 'dash' || p.state === 'execute' || p.state === 'guardBreak' || p.state === 'parry') { this.cancel(game, p); return; }
    A.t++;
    const hand = this.hand(p), cur = this.mouseWorld(game);
    const cang = Math.atan2(cur.y - hand.y, cur.x - hand.x);
    A.cang = cang;
    if (Math.abs(cur.x - p.x) > 4) p.facing = cur.x > p.x ? 1 : -1;   // 마우스 쪽을 바라봄
    if (A.mode === 'toss') this.updateToss(game, p, A, D, cang);
    else this.select(game, p, A, D, hand, cur, cang);
    // 조준점: 커서(또는 보정 지점)를 부드럽게 늦게 따라감
    const T = A.point;
    A.vis.x += (T.x - A.vis.x) * D.visLerp;
    A.vis.y += (T.y - A.vis.y) * D.visLerp;
    A.blend += ((A.lock ? 1 : 0) - A.blend) * 0.3;
    A.lockT++;
    A.snapT++;
    // Q 포박 조준: 시간 느리게, 최대 bindAimSec 초 (실제 시간)
    game.aimSlow = A.mode === 'bind' ? D.bindSlow : 0;
    const maxF = D.bindAimSec * 60 * (A.mode === 'bind' ? D.bindSlow : 1);
    const key = A.mode === 'throw' ? 'heavy' : 'skill1';
    if (!Input.isDown(key) || (A.mode !== 'throw' && A.t >= maxF)) this.fire(game, p);
  },

  // 보정 대상 고르기 (점수 + 잠금 유지)
  select(game, p, A, D, hand, cur, cang) {
    const L = this.level(), W = AIM_ASSIST.weights, range = D.range;
    const cands = [];
    A.scores = [];
    for (const e of game.enemies) {
      if (e.dead || e.executed || e.bound || e.state === 'intro' || e.state === 'bossDeath') continue;
      const c = this.center(e), dist = Math.hypot(c.x - hand.x, c.y - hand.y);
      if (dist > range || !this.los(game, hand, c)) continue;
      const dAng = Math.abs(this.angDiff(Math.atan2(c.y - hand.y, c.x - hand.x), cang)) / DEG;
      const dCur = Math.hypot(c.x - cur.x, c.y - cur.y);
      const inCone = L.cone > 0 && dAng <= L.cone, inRad = L.radius > 0 && dCur <= L.radius;
      const keep = e === A.lock && ((L.cone > 0 && dAng <= L.cone + AIM_ASSIST.keepExtra) || (L.radius > 0 && dCur <= L.radius * AIM_ASSIST.keepRadiusMult));
      const score = W.cursor * (1 - Math.min(1, dCur / Math.max(1, L.radius * AIM_ASSIST.cursorNorm)))
        + W.angle * (1 - Math.min(1, dAng / Math.max(1, L.cone * AIM_ASSIST.angleNorm)))
        + W.player * (1 - Math.min(1, dist / range))
        + ((e.state === 'broken' || e.state === 'groggy') ? AIM_ASSIST.groggyBonus : 0);
      A.scores.push({ e, score, ok: inCone || inRad || keep });
      if (inCone || inRad || keep) cands.push({ e, score, keep });
    }
    let best = null;
    for (const c of cands) if (!best || c.score > best.score) best = c;
    const curLock = cands.find((c) => c.e === A.lock && c.keep);
    let lock = null;
    if (curLock) lock = best && best.e !== curLock.e && best.score > curLock.score * AIM_ASSIST.switchRatio ? best : curLock;
    else lock = best;
    const prev = A.lock;
    A.lock = lock ? lock.e : null;
    A.lockScore = lock ? lock.score : 0;
    if (A.lock && A.lock !== prev) { A.lockT = 0; Sound.play('lock'); }
    // 벽: 커서 근처 모서리 스냅 > 조준선에 걸리는 벽
    A.wall = null;
    if (!A.lock) {
      const snap = L.radius > 0 ? this.wallSnap(game, cur, hand, range) : null;
      const ray = snap ? null : this.ray(game, hand, cang, Math.min(range, Math.hypot(cur.x - hand.x, cur.y - hand.y) + 30));
      const w = snap || ray;
      if (w) {
        const moved = !A.wallPrev || Math.hypot(w.x - A.wallPrev.x, w.y - A.wallPrev.y) > 6;
        if (snap && moved) { A.snapT = 0; Sound.play('hookSnap'); }
        A.wall = { x: w.x, y: w.y, snap: !!snap };
      }
      A.wallPrev = A.wall;
    } else A.wallPrev = null;
    const dCur = Math.hypot(cur.x - hand.x, cur.y - hand.y);
    if (A.lock) { A.status = 'enemy'; A.point = this.center(A.lock); }
    else if (A.wall) { A.status = 'wall'; A.point = { x: A.wall.x, y: A.wall.y }; }
    else if (dCur > range) { A.status = 'out'; A.point = { x: hand.x + Math.cos(cang) * range, y: hand.y + Math.sin(cang) * range }; }
    else { A.status = 'empty'; A.point = cur; }
  },

  // ---------- 발사 ----------
  fire(game, p) {
    const A = p.aim, D = this.cfg(p);
    p.aim = null;
    game.aimSlow = 0;
    if (!A || !D) return;
    if (A.mode === 'toss') {
      if (A.bind && A.plan) Transform.toss(game, p, A.bind, A.plan.ang);
      return;
    }
    this.shoot(game, p, A, A.mode === 'throw' ? 'HEAVY0' : 'SKILL_SWORD_Q');
  },

  // 발사 방향 정하기 (잠긴 대상 > 벽 지점 > 커서) + 공격 시작
  shoot(game, p, A, id) {
    const hand = this.hand(p), L = this.level();
    let ang = A.cang, target = null, point = null, tp = null;
    if (A.lock) { tp = this.center(A.lock); target = A.lock; }
    else if (A.wall) { tp = { x: A.wall.x, y: A.wall.y }; point = tp; }
    // 키프레임 경로는 피벗(어깨) 기준으로 돌아가므로 피벗 → 목표(없으면 커서) 각도로
    if (!tp) tp = { x: hand.x + Math.cos(A.cang) * 400, y: hand.y + Math.sin(A.cang) * 400 };
    const fc = tp.x >= hand.x ? 1 : -1, pv = this.pivot(p, fc);
    ang = Math.atan2(tp.y - pv.y, tp.x - pv.x);
    p.aimShot = { ang, target, point, homing: L.homing, hitScale: Settings.aimAssist === 'off' ? 1 : AIM_ASSIST.hitScale };
    p.facing = Math.cos(ang) >= 0 ? 1 : -1;
    // 발사 연출: 손 섬광 + 사슬 풀리는 소리
    Effects.flashRing(hand.x, hand.y);
    Effects.sparks(hand.x, hand.y, p.facing, 6, '#dff');
    Sound.play('chain');
    if (id === 'SKILL_SWORD_Q') {
      const S = p.weaponCfg().skills.q;
      p.applySkillCooldown('sword', 'q', S);
      p.startAttack(id, 0, Object.assign({}, S.move, { skillCfg: S, aimed: true }));
      Effects.popText(p.x, p.y - p.h - 22, S.name, '#fff', 15);
      Sound.play('skill');
    } else {
      const m = id === 'HEAVY0' ? p.moveData('HEAVY')[0] : p.moveData(id);
      p.startAttack(id, 0, Object.assign({}, m, { aimed: true }));
    }
  },

  // 조준 없이 바로 쏘기 (3타 회전 중 우클릭 → 회전 던지기): 지금 커서 방향 + 보정
  fireNow(game, p, id) {
    this.start(game, p, 'throw');
    const A = p.aim, D = this.cfg(p), hand = this.hand(p), cur = this.mouseWorld(game);
    A.cang = Math.atan2(cur.y - hand.y, cur.x - hand.x);
    this.select(game, p, A, D, hand, cur, A.cang);
    p.aim = null;
    this.shoot(game, p, A, id);
  },

  // ---------- 투척 조준 ----------
  updateToss(game, p, A, D, cang) {
    const b = A.bind;
    if (!b || b.phase !== 'orbit' || b.e.dead) { this.cancel(game, p); return; }
    A.plan = this.tossPlan(game, p, b, cang);
    A.status = A.plan.hitE ? 'enemy' : A.plan.wall ? 'wall' : 'empty';
    A.point = A.plan.end;
    A.lock = A.plan.hitE || null;
  },

  // 던진 적이 날아갈 길 (중력 포물선). 처음 닿는 적 / 벽 / 바닥까지
  simToss(game, p, b, ang) {
    const S = b.S, e = b.e, L = game.level;
    let x = e.x, y = e.y - e.h * 0.5, vx = Math.cos(ang) * S.throwSpeed, vy = Math.sin(ang) * S.throwSpeed;
    const pts = [{ x, y }];
    for (let i = 0; i < S.maxFlight; i++) {
      vy += S.gravity;
      const px = x, py = y;
      x += vx; y += vy;
      pts.push({ x, y });
      for (const o of game.enemies) {
        if (o === e || o.dead || o.executed || o.bound) continue;
        if (Math.abs(o.x - x) < (o.w + e.w) / 2 && Math.abs((o.y - o.h * 0.5) - y) < (o.h + e.h) / 2) return { ang, pts, hitE: o, end: { x, y } };
      }
      if (x < 4 || x > L.width - 4) return { ang, pts, wall: { x: Math.max(4, Math.min(L.width - 4, x)), y }, end: { x, y } };
      for (const r of L.active) {
        const bot = y + e.h * 0.5;
        if (x > r.x && x < r.x + r.w && bot > r.y && y - e.h * 0.5 < r.y + r.h) {
          // 위에서 떨어져 닿으면 바닥, 옆·아래에서 부딪히면 벽
          if (py + e.h * 0.5 <= r.y + 2 && vy > 0) return { ang, pts, ground: { x, y: r.y }, end: { x, y } };
          if (!r.oneWay) return { ang, pts, wall: { x: px, y: py }, end: { x, y } };
        }
      }
    }
    return { ang, pts, end: { x, y } };
  },

  // 투척 보정: 예측 경로 ±tossCone 안에 적(우선)·벽이 있으면 그쪽으로 경로를 휘어 맞춤
  tossPlan(game, p, b, ang) {
    const base = this.simToss(game, p, b, ang);
    if (Settings.aimAssist === 'off' || base.hitE) return base;
    const cone = AIM_ASSIST.tossCone * DEG, step = AIM_ASSIST.tossStep * DEG;
    let bestE = null, bestW = null;
    for (let d = step; d <= cone + 1e-6; d += step) {
      for (const s of [1, -1]) {
        const pl = this.simToss(game, p, b, ang + d * s);
        if (pl.hitE && !bestE) bestE = pl;
        if (pl.wall && !bestW && !base.wall) bestW = pl;
      }
      if (bestE) break;
    }
    return bestE || bestW || base;
  },

  // ---------- 그리기 (월드) ----------
  draw(ctx, game) {
    const p = game.player, A = p.aim;
    if (CONFIG.debug.showHitboxes && A) this.drawDebug(ctx, game, p, A);
    if (!A) return;
    const D = this.cfg(p);
    if (!D) return;
    const hand = this.hand(p);
    if (A.mode === 'toss') { this.drawToss(ctx, game, p, A); return; }
    const col = A.status === 'enemy' ? '#3ff' : A.status === 'wall' ? '#ffd23a' : A.status === 'out' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.55)';
    // 조준선: 커서 방향 → 잠기면 대상 쪽으로 휘어 붙음 (2차 베지어)
    const range = D.range, cang = A.cang;
    const straight = { x: hand.x + Math.cos(cang) * Math.min(range, Math.hypot(A.vis.x - hand.x, A.vis.y - hand.y)), y: hand.y + Math.sin(cang) * Math.min(range, Math.hypot(A.vis.x - hand.x, A.vis.y - hand.y)) };
    const end = { x: straight.x + (A.vis.x - straight.x) * A.blend, y: straight.y + (A.vis.y - straight.y) * A.blend };
    if (A.status !== 'enemy') { end.x = A.vis.x; end.y = A.vis.y; }
    const len = Math.hypot(end.x - hand.x, end.y - hand.y);
    const ctrl = { x: hand.x + Math.cos(cang) * len * 0.55, y: hand.y + Math.sin(cang) * len * 0.55 };
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.3;
    if (A.status === 'enemy') { ctx.shadowColor = '#3ff'; ctx.shadowBlur = 8; }
    // 사슬 고리 모양 점선 (잠금이면 촘촘한 실선)
    const N = Math.max(2, Math.floor(len / 7));
    let prev = hand;
    for (let i = 1; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const q = { x: u * u * hand.x + 2 * u * t * ctrl.x + t * t * end.x, y: u * u * hand.y + 2 * u * t * ctrl.y + t * t * end.y };
      const ang = Math.atan2(q.y - prev.y, q.x - prev.x);
      if (A.status === 'enemy') {
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      } else if (i % 2 === 0) {
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, 2.6, (i / 2) % 2 ? 0.8 : 1.6, ang, 0, Math.PI * 2);
        ctx.stroke();
      }
      prev = q;
    }
    ctx.shadowBlur = 0;
    // 끝 표시
    if (A.status === 'out') {
      ctx.strokeStyle = '#ff4040';
      ctx.lineWidth = 2;
      const s = 5;
      ctx.beginPath(); ctx.moveTo(end.x - s, end.y - s); ctx.lineTo(end.x + s, end.y + s); ctx.moveTo(end.x + s, end.y - s); ctx.lineTo(end.x - s, end.y + s); ctx.stroke();
    } else if (A.status === 'wall') {
      // 갈고리 아이콘: 스냅되는 순간 크게 → 딸깍 붙음
      const k = A.wall && A.wall.snap ? 1 + Math.max(0, 1 - A.snapT / 6) * 0.8 : 1;
      this.hook(ctx, end.x, end.y, 6 * k, '#ffd23a');
    } else if (A.status === 'enemy' && A.lock) {
      // 잠금 테두리: 모서리 4개가 조여듦
      const e = A.lock, k = 1 + Math.max(0, 1 - A.lockT / 8) * 0.7;
      const hw = (e.w / 2 + 6) * k, hh = (e.h / 2 + 6) * k, cx = e.x, cy = e.y - e.h * 0.5, c = 6;
      ctx.strokeStyle = '#3ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#3ff';
      ctx.shadowBlur = 8;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = cx + sx * hw, y = cy + sy * hh;
        ctx.beginPath(); ctx.moveTo(x, y - sy * c); ctx.lineTo(x, y); ctx.lineTo(x - sx * c, y); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    } else {
      ctx.beginPath(); ctx.arc(end.x, end.y, 3.5, 0, Math.PI * 2); ctx.stroke();
    }
    // Q 포박 조준: 남은 시간
    if (A.mode === 'bind') {
      const maxF = D.bindAimSec * 60 * D.bindSlow, k = Math.max(0, 1 - A.t / maxF);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y - p.h - 14, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    }
    ctx.restore();
  },

  hook(ctx, x, y, s, col) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.4);
    ctx.lineTo(x, y + s * 0.4);
    ctx.arc(x - s * 0.6, y + s * 0.4, s * 0.6, 0, Math.PI * 0.9);
    ctx.moveTo(x, y + s * 0.4);
    ctx.arc(x + s * 0.6, y + s * 0.4, s * 0.6, Math.PI, Math.PI * 0.1, true);
    ctx.stroke();
    ctx.restore();
  },

  // 투척 예측선: 점선 포물선 / 맞을 적 빨간 하이라이트 / 벽 충돌 지점 충격 아이콘
  drawToss(ctx, game, p, A) {
    const pl = A.plan;
    if (!pl) return;
    ctx.save();
    ctx.fillStyle = pl.hitE ? '#ff5a5a' : pl.wall ? '#ffd23a' : 'rgba(255,255,255,0.7)';
    for (let i = 2; i < pl.pts.length; i += 2) {
      const q = pl.pts[i];
      ctx.beginPath(); ctx.arc(q.x, q.y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    if (pl.hitE) {
      const e = pl.hitE;
      ctx.strokeStyle = '#ff4040';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ff2020';
      ctx.shadowBlur = 12 + Math.sin((Game.frame || 0) * 0.4) * 4;
      ctx.strokeRect(e.x - e.w / 2 - 4, e.y - e.h - 4, e.w + 8, e.h + 8);
    }
    if (pl.wall) {
      const w = pl.wall;
      ctx.strokeStyle = '#ffd23a';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffb000';
      ctx.shadowBlur = 8;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(w.x + Math.cos(a) * 4, w.y + Math.sin(a) * 4); ctx.lineTo(w.x + Math.cos(a) * (i % 2 ? 8 : 12), w.y + Math.sin(a) * (i % 2 ? 8 : 12)); ctx.stroke();
      }
    }
    ctx.restore();
  },

  // 디버그 (H): 보정 원뿔 / 커서 반경 / 후보별 점수 / 잠긴 대상
  drawDebug(ctx, game, p, A) {
    const L = this.level(), hand = this.hand(p), cur = this.mouseWorld(game), D = this.cfg(p);
    if (!D || A.mode === 'toss') return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,255,255,0.08)';
    ctx.strokeStyle = 'rgba(0,255,255,0.5)';
    ctx.lineWidth = 1;
    const c = L.cone * DEG;
    ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.arc(hand.x, hand.y, D.range, A.cang - c, A.cang + c); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cur.x, cur.y, L.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,0,0.4)';
    ctx.beginPath(); ctx.arc(cur.x, cur.y, AIM_ASSIST.wallSnap, 0, Math.PI * 2); ctx.stroke();
    ctx.font = 'bold 9px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    for (const s of A.scores) {
      ctx.fillStyle = s.e === A.lock ? '#3ff' : s.ok ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.fillText(s.score.toFixed(2), s.e.x, s.e.y - s.e.h - 26);
    }
    if (A.lock) { ctx.strokeStyle = '#3ff'; ctx.strokeRect(A.lock.x - A.lock.w / 2, A.lock.y - A.lock.h, A.lock.w, A.lock.h); }
    ctx.restore();
  },

  // ---------- 그리기 (화면): 조준 중 가장자리 비네트 ----------
  drawScreen(ctx, game) {
    const A = game.player && game.player.aim;
    if (!A) return;
    const V = CONFIG.view, k = Math.min(1, A.t / 8);
    const g = ctx.createRadialGradient(V.width / 2, V.height / 2, V.height * 0.35, V.width / 2, V.height / 2, V.width * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(A.mode === 'bind' ? 0.6 : 0.38) * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, V.width, V.height);
  },
};

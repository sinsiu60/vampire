'use strict';
// 사슬검: Verlet 로프 물리 (수치: data/transforms.js 사슬검 chain)
//  · 마디 nodes 개, 마디 사이 최대 길이 고정 (거리 제약을 iterations 번 반복). 첫 마디는 손에 고정, 마지막 마디는 칼날 (질량 bladeMass 배)
//  · 평소엔 짧게(idleLength) 손 아래로 늘어져 있다가, 기술이 시작되면 휘두르면서 사슬을 풀어 length 까지 늘림 (payout)
//  · 기술은 손의 궤적(move.hand)만 정한다. 사슬·칼날은 관성으로 늦게 따라오며 휘감긴다 (손이 급정거하면 끝이 가속·오버슈트)
//  · 판정: 칼날 머리 + 칼날 쪽 사슬 마디 2개. 칼날 속도가 speedMin 이상일 때만, 속도에 비례한 데미지
//  · 강공(throw): 사슬을 늘려 칼날을 던짐 → 끝에서 팽팽해지며 반동 / 적·벽에 박히면 우클릭 유지로 끌어오기·날아가기

const ChainRope = {
  // 지금 든 무기가 사슬검이면 그 수치
  cfg(p) {
    const d = Transform.of(p);
    return d && d.mech === 'chain' ? d.chain : null;
  },

  make(C, x, y) {
    const n = C.nodes, seg = C.idleLength / (n - 1), nodes = [];
    for (let i = 0; i < n; i++) nodes.push({ x, y: y + i * seg, px: x, py: y + i * seg });
    return { nodes, len: C.idleLength, speed: 0, hist: [], embed: null, throwing: false, snapped: false, throwId: -1,
      crackT: -99, jingleT: -99, hitGround: false, impactId: -1, hand: { x, y }, heldT: 0 };
  },

  // ---------- 손 궤적 ----------
  // move.hand: { keys: [[프레임, 앞쪽 x, 발 기준 y], ...] } 또는 { circle: { start, end, cx, cy, r, turns, a0 } }
  // 좌표는 플레이어 발밑 기준, x 는 바라보는 쪽이 +
  localHand(p, C) {
    const m = p.move, f = p.stateFrame;
    const rest = C.handRest;
    if (p.state !== 'attack' || !m) return rest;
    const H = m.hand;
    if (!H) {
      // 손 궤적이 없는 기술(런처·반격 등): 칼 각도를 따라 손을 휘두름
      const pose = p.bladePose();
      const a = pose.ang * DEG;
      return [2 + Math.cos(a) * C.handR, pose.py + Math.sin(a) * C.handR * (pose.squash || 1)];
    }
    if (H.keys) {
      const K = H.keys;
      if (f <= K[0][0]) return [K[0][1], K[0][2]];
      for (let i = 1; i < K.length; i++) {
        if (f <= K[i][0]) {
          const a = K[i - 1], b = K[i], t = (f - a[0]) / Math.max(1, b[0] - a[0]);
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

  handPoint(p, C) {
    const l = this.localHand(p, C);
    return { x: p.x + p.facing * l[0], y: p.y + l[1] };
  },

  // ---------- 물리 한 스텝 ----------
  // ground(x, y): 그 점이 바닥·벽 속이면 밀어낼 위쪽 y, 아니면 null
  simulate(rope, hand, C, ground, drag) {
    const N = rope.nodes, n = N.length, seg = rope.len / (n - 1);
    const b = N[n - 1], bx = b.x, by = b.y;
    // 손 속도 → 급정거하면 그 운동량을 칼날 쪽으로 전달 (끝에서 가속·오버슈트)
    const hvx = hand.x - N[0].x, hvy = hand.y - N[0].y, hs = Math.hypot(hvx, hvy);
    const pv = rope.hv || { x: 0, y: 0, s: 0 };
    if (pv.s >= C.whipMinHand && hs < pv.s * 0.45 && !rope.embed) {
      const k = (pv.s - hs) * C.whipGain / pv.s;
      for (let i = Math.floor(n * 0.5); i < n; i++) {
        const w = (i - n * 0.5) / (n * 0.5);          // 칼날 쪽일수록 많이
        N[i].px -= pv.x * k * w;
        N[i].py -= pv.y * k * w;
      }
    }
    rope.hv = { x: hvx, y: hvy, s: hs };
    N[0].px = N[0].x; N[0].py = N[0].y;
    N[0].x = hand.x; N[0].y = hand.y;
    for (let i = 1; i < n; i++) {
      const q = N[i];
      const vx = (q.x - q.px) * drag, vy = (q.y - q.py) * drag;
      q.px = q.x; q.py = q.y;
      q.x += vx; q.y += vy + C.gravity;
    }
    const pin = rope.embed ? rope.embed.at : null;
    let hit = false;
    const touched = rope._touched || (rope._touched = new Array(n).fill(false));
    touched.fill(false);
    for (let k = 0; k < C.iterations; k++) {
      if (pin) { b.x = pin.x; b.y = pin.y; }
      for (let i = 0; i < n - 1; i++) {
        const a = N[i], c = N[i + 1];
        const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
        if (d <= seg || d < 1e-6) continue;            // 사슬: 늘어나지 않고 접히기만 함
        const wa = i === 0 ? 0 : 1, wc = i + 1 === n - 1 ? (pin ? 0 : 1 / C.bladeMass) : 1;
        const sum = wa + wc;
        if (sum <= 0) continue;
        const diff = (d - seg) / d;
        a.x += dx * diff * (wa / sum); a.y += dy * diff * (wa / sum);
        c.x -= dx * diff * (wc / sum); c.y -= dy * diff * (wc / sum);
      }
      if (ground) {
        for (let i = 1; i < n; i++) {
          const q = N[i], g = ground(q.x, q.y);
          if (g !== null) {
            q.y = g;
            touched[i] = true;
            if (i === n - 1) hit = true;
          }
        }
      }
    }
    if (pin) { b.x = pin.x; b.y = pin.y; }
    // 바닥 마찰 (프레임당 한 번): 닿은 마디의 가로 속도를 줄이고 세로로 튀지 않게
    for (let i = 1; i < n; i++) {
      if (!touched[i]) continue;
      const q = N[i];
      q.px = q.x - (q.x - q.px) * C.groundFriction;
      if (q.py < q.y) q.py = q.y;
    }
    rope.speed = Math.hypot(b.x - bx, b.y - by);
    rope.hitGround = hit;
    // 칼날 잔상용 기록
    const dir = this.bladeDir(rope);
    rope.hist.push({ tip: { x: b.x + dir.x * C.bladeTip, y: b.y + dir.y * C.bladeTip }, base: { x: b.x - dir.x * C.bladeBack, y: b.y - dir.y * C.bladeBack }, v: rope.speed });
    if (rope.hist.length > 7) rope.hist.shift();
  },

  bladeDir(rope) {
    const N = rope.nodes, a = N[N.length - 2], b = N[N.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  },

  // 레벨 지형 충돌
  groundFn(game) {
    const L = game.level;
    return (x, y) => {
      for (const r of L.active) {
        if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + Math.min(r.h, 24)) return r.oneWay ? null : r.y;
      }
      return null;
    };
  },

  // ---------- 매 프레임 (Transform.update 에서) ----------
  update(game, p) {
    const C = this.cfg(p);
    if (!C) { p.rope = null; p.chainHand = null; return; }
    const hand = this.handPoint(p, C);
    p.chainHand = hand;
    if (!p.rope) p.rope = this.make(C, hand.x, hand.y);
    const rope = p.rope, m = p.state === 'attack' ? p.move : null;
    // 회전 기술: 손목으로 계속 돌려줌 (칼날 쪽 마디에 회전 방향 힘, 목표 속도까지)
    const cc = m && m.hand && m.hand.circle;
    if (cc && cc.drive && p.stateFrame >= cc.start && p.stateFrame <= cc.end && !rope.embed && !rope.throwing) this.drive(p, rope, hand, cc);
    // 던지기: 사슬을 늘려 칼날을 앞으로
    if (m && m.throw && p.stateFrame === m.throw.at && rope.throwId !== p.swingId) this.startThrow(p, rope, m.throw);
    if (!m || !m.throw) rope.throwing = false;
    // 박힘: 우클릭 유지로 당기기 (다른 공격을 시작하면 풀림)
    if (rope.embed && m && rope.embed.type !== 'bind' && p.swingId !== rope.throwId) rope.embed = null;
    if (rope.embed) this.updateEmbed(game, p, rope, C);
    this.lengthStep(rope, m, p.stateFrame, C);
    // 공기저항: 평소엔 강하게 (달리면 뒤로 끌리고 멈추면 흔들리다 정지), 공격·던지기 중엔 약하게
    this.simulate(rope, hand, C, this.groundFn(game), m || rope.throwing ? C.drag : C.idleDrag);
    const N = rope.nodes, b = N[N.length - 1];
    // 던진 칼날: 팽팽해지면 반동, 적·벽에 박힘
    if (rope.throwing && !rope.embed) {
      const d = Math.hypot(b.x - hand.x, b.y - hand.y);
      if (!rope.snapped && d >= rope.len * 0.96) {
        rope.snapped = true;
        b.px = b.x + (b.x - b.px) * 0.35;        // 반동: 바깥으로 가던 힘이 튕겨 돌아옴
        Effects.ring(b.x, b.y, '#cfe', 34);
        Effects.sparks(b.x, b.y, -p.facing, 6, '#dff');
        Effects.addShake(3);
        Sound.play('tang');
      }
      this.checkEmbed(game, p, rope, m, b);
    }
    // 채찍 크랙
    if (rope.speed >= C.crackSpeed && (game.frame || 0) - rope.crackT > 14) {
      rope.crackT = game.frame || 0;
      Effects.flashRing(b.x, b.y);
      Effects.sparks(b.x, b.y, Math.sign(b.x - b.px) || 1, 5, '#fff');
      Sound.play('crack');
    }
    // 내려치기 착지 충격파
    if (m && m.impact && rope.hitGround && rope.impactId !== p.swingId && p.stateFrame >= m.startup && Math.hypot(b.x - b.px, b.y - b.py) + rope.speed >= C.speedMin) {
      rope.impactId = p.swingId;
      this.impact(game, p, b.x, b.y, m.impact);
    }
    // 짤랑 (빠를수록 크고 자주)
    let avg = 0;
    for (let i = 1; i < N.length; i++) avg += Math.hypot(N[i].x - N[i].px, N[i].y - N[i].py);
    avg /= N.length - 1;
    const gap = Math.max(4, 14 - avg);
    if (avg > C.jingleSpeed && (game.frame || 0) - rope.jingleT > gap) {
      rope.jingleT = game.frame || 0;
      Sound.play('jingle', Math.min(1, avg / 18));
    }
  },

  // 사슬 길이: 공격 중엔 풀어서 늘림 (payout), 평소엔 짧게 감음. 던진 것·박힌 것은 따로
  lengthStep(rope, m, f, C) {
    if (rope.throwing || rope.embed) return;
    // payout: 그 프레임에 사슬을 풀어줌 (speed 가 크면 한 번에 — 휘둘러 얻은 운동량으로 칼날이 날아감)
    const P = m && (m.payout || { at: m.startup, speed: C.payoutSpeed });
    if (m && f >= P.at) rope.len = Math.min(m.len || C.length, rope.len + P.speed);
    else if (!m) rope.len = rope.len > C.idleLength ? Math.max(C.idleLength, rope.len - C.retract) : C.idleLength;
  },

  // 카드 미리보기용: 가짜 플레이어 한 스텝 (바닥 y = 0)
  previewStep(fake, rope, C) {
    const m = fake.state === 'attack' ? fake.move : null;
    const hand = this.handPoint(fake, C);
    fake.chainHand = hand;
    if (m && m.throw && fake.stateFrame === m.throw.at && rope.throwId !== fake.swingId) this.startThrow(fake, rope, m.throw, true);
    if (!m || !m.throw) rope.throwing = false;
    const cc = m && m.hand && m.hand.circle;
    if (cc && cc.drive && fake.stateFrame >= cc.start && fake.stateFrame <= cc.end) this.drive(fake, rope, hand, cc);
    this.lengthStep(rope, m, fake.stateFrame, C);
    this.simulate(rope, hand, C, (x, y) => (y > 0 ? 0 : null), m || rope.throwing ? C.drag : C.idleDrag);
    if (rope.throwing && !rope.snapped && Math.hypot(rope.nodes[rope.nodes.length - 1].x - hand.x, rope.nodes[rope.nodes.length - 1].y - hand.y) >= rope.len * 0.96) rope.snapped = true;
  },

  drive(p, rope, hand, cc) {
    const N = rope.nodes, n = N.length, b = N[n - 1];
    if (Math.hypot(b.x - b.px, b.y - b.py) >= cc.maxSpeed) return;
    const sg = p.facing * Math.sign(cc.turns || 1);
    for (let i = Math.floor(n / 2); i < n; i++) {
      const q = N[i], rx = q.x - hand.x, ry = q.y - hand.y, d = Math.hypot(rx, ry) || 1;
      const w = cc.drive * (i - n / 2) / (n / 2);
      q.px -= sg * (-ry / d) * w;
      q.py -= sg * (rx / d) * w;
    }
  },

  startThrow(p, rope, T, silent) {
    rope.throwId = p.swingId;
    rope.throwing = true;
    rope.snapped = false;
    rope.len = T.len;
    const N = rope.nodes, n = N.length;
    const b = N[n - 1];
    // 지금 칼날 속도(원심력)를 그대로 살려서 앞으로 일직선
    const cur = Math.hypot(b.x - b.px, b.y - b.py);
    const sp = Math.max(T.speed, T.keepVel ? cur * 1.1 : 0);
    for (let i = 1; i < n; i++) {
      const k = i / (n - 1);
      N[i].px = N[i].x - p.facing * sp * k;
      N[i].py = N[i].y - (T.vy || 0) * k;
    }
    if (!silent) Sound.play('chain');
  },

  // 던진 칼날이 적·벽에 닿으면 박힘
  checkEmbed(game, p, rope, m, b) {
    const C = this.cfg(p);
    for (const e of game.enemies) {
      if (e.dead || e.executed || p.hitList.has(e)) continue;
      if (b.x < e.x - e.w / 2 - 6 || b.x > e.x + e.w / 2 + 6 || b.y < e.y - e.h - 6 || b.y > e.y + 4) continue;
      p.hitList.add(e);
      p.hitFx = { x: b.x, y: b.y };
      Combat.hitEnemy(game, p, e, m);
      if (e.dead) continue;
      rope.embed = m.special === 'bind'
        ? { type: 'bind', e, t: 0, at: { x: e.x, y: e.y - e.h * 0.5 } }
        : { type: 'enemy', e, t: 0, at: { x: e.x, y: e.y - e.h * 0.5 } };
      rope.throwing = false;
      Sound.play('chain');
      return;
    }
    // 벽 (지형 옆면·천장, 맵 양 끝)
    const L = game.level;
    if (b.x < 2 || b.x > L.width - 2) {
      rope.embed = { type: 'wall', t: 0, at: { x: Math.max(2, Math.min(L.width - 2, b.x)), y: b.y } };
      rope.throwing = false;
      Effects.sparks(rope.embed.at.x, b.y, -p.facing, 8, '#dff');
      Sound.play('clash');
      return;
    }
    for (const r of L.active) {
      if (r.oneWay) continue;
      if (b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h) {
        rope.embed = { type: 'wall', t: 0, at: { x: b.x, y: b.y } };
        rope.throwing = false;
        Effects.sparks(b.x, b.y, -p.facing, 8, '#dff');
        Sound.play('clash');
        return;
      }
    }
  },

  // 박힌 상태: 우클릭을 누르고 있으면 감아 당김 (가벼운 적은 끌려옴 / 무거운 적·보스·벽이면 내가 날아감)
  updateEmbed(game, p, rope, C) {
    const E = rope.embed;
    E.t++;
    if (E.type === 'bind') {
      // 포박: 묶인 적을 따라감 (휘두르기·던지기는 transform.js)
      const b = Transform.binds.find((x) => x.e === E.e);
      if (!b || b.thrown || E.e.dead) { rope.embed = null; return; }
      E.at.x = E.e.x; E.at.y = E.e.y - E.e.h * 0.5;
      rope.len = Math.max(C.minLen, rope.len - C.retract);
      return;
    }
    if (E.type === 'enemy') {
      if (E.e.dead || E.e.executed || E.e.remove) { rope.embed = null; return; }
      E.at.x = E.e.x; E.at.y = E.e.y - E.e.h * 0.5;
    }
    const held = Input.isDown('heavy');
    if (held) E.held = true;
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
      // 적을 끌어옴 (경직)
      const e = E.e;
      e.x -= ux * Math.min(excess, C.zipSpeed);
      e.vx = 0;
      if (e.state !== 'launched' && e.state !== 'broken' && e.state !== 'hurt') { e.hitstun = 12; e.setState('hurt'); }
      else if (e.state === 'hurt') e.hitstun = Math.max(e.hitstun || 0, 6);
    } else {
      // 내가 그쪽으로
      p.vx = ux * C.zipSpeed;
      p.vy = uy * C.zipSpeed - 0.6;
      if (uy < -0.2) p.onGround = false;
    }
  },

  // 내려치기 충격파
  impact(game, p, x, y, I) {
    Effects.shockwave(x, y, I.radius);
    Effects.dust(x, y, 8, 0);
    Effects.addShake(4);
    Sound.play('quake');
    for (const e of game.enemies) {
      if (e.dead || e.executed || Math.abs(e.x - x) > I.radius || Math.abs(e.y - y) > 40) continue;
      const dir = Math.sign(e.x - x) || p.facing;
      const res = Combat.applyHit(game, e, I.damage * p.damageMult(), false, { dir, knockX: 3, knockY: -4, hitstun: 26, launch: false, attackerX: x },
        { hitstop: 4, shake: 2, heavy: true, x: e.x, y: e.y - 6, styleId: 'CHAIN_IMPACT', weapon: 'sword' });
      if (res !== 'kill' && res !== 'blocked') e.addPosture(I.posture || 0, game);
    }
  },

  // ---------- 판정 (공격 중) ----------
  // 칼날 머리 + 칼날 쪽 마디 2개. 속도 speedMin 미만이면 안 맞음, 이상이면 속도에 비례한 데미지
  attack(game, p) {
    const C = this.cfg(p), rope = p.rope, m = p.move;
    if (!C || !rope || !m || m.noHit) return;
    if (rope.throwing || rope.embed) return;          // 던진 칼날은 박힐 때 따로 처리
    const v = rope.speed;
    if (v < C.speedMin) return;
    const N = rope.nodes, n = N.length;
    const pts = [[N[n - 1], C.hitRadius], [N[n - 2], C.nodeRadius], [N[n - 3], C.nodeRadius]];
    const f = game.frame || 0;
    if (!p.rehit || p.rehitSwing !== p.swingId) { p.rehit = new Map(); p.rehitSwing = p.swingId; }
    for (const e of game.enemies) {
      if (e.dead || e.executed) continue;
      if (m.rehit ? f - (p.rehit.get(e) || -999) < m.rehit : p.hitList.has(e)) continue;
      let hitPt = null;
      for (const [q, r] of pts) {
        const cx = Math.max(e.x - e.w / 2, Math.min(e.x + e.w / 2, q.x)), cy = Math.max(e.y - e.h, Math.min(e.y, q.y));
        if ((q.x - cx) ** 2 + (q.y - cy) ** 2 <= r * r) { hitPt = q; break; }
      }
      if (!hitPt) continue;
      p.hitList.add(e);
      p.rehit.set(e, f);
      const k = Math.min(C.speedMaxMult, v / C.speedRef);
      const mv = Object.assign({}, m, { damage: m.damage * k });
      if (m.posture !== undefined) mv.posture = m.posture * k;
      p.hitFx = { x: hitPt.x, y: hitPt.y };
      Combat.hitEnemy(game, p, e, mv);
    }
  },

  // ---------- 그리기 ----------
  draw(ctx, p, col, debug) {
    const C = this.cfg(p), rope = p.rope;
    if (!C || !rope) return;
    const N = rope.nodes, n = N.length, b = N[n - 1];
    const pal = p.trailPal();
    // 칼날 잔상 (속도에 비례)
    const H = rope.hist;
    for (let i = 1; i < H.length; i++) {
      const a = H[i - 1], c = H[i];
      const k = Math.min(1, c.v / C.speedRef) * (i / H.length);
      if (k < 0.08) continue;
      ctx.fillStyle = `rgba(${pal.outer},${0.38 * k})`;
      ctx.beginPath();
      ctx.moveTo(a.base.x, a.base.y); ctx.lineTo(a.tip.x, a.tip.y); ctx.lineTo(c.tip.x, c.tip.y); ctx.lineTo(c.base.x, c.base.y);
      ctx.closePath();
      ctx.fill();
    }
    // 사슬: 고리를 가로/세로 번갈아 (팽팽하면 직선, 느슨하면 곡선 — 마디를 따라 그대로)
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.3;
    let carry = 0, li = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = N[i], c = N[i + 1];
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < 0.01) continue;
      const ang = Math.atan2(dy, dx);
      for (let s = carry; s < d; s += C.linkGap) {
        const t = s / d;
        ctx.beginPath();
        ctx.ellipse(a.x + dx * t, a.y + dy * t, 3.1, li % 2 ? 0.8 : 1.9, ang, 0, Math.PI * 2);
        ctx.stroke();
        li++;
        carry = s + C.linkGap - d;
      }
      if (carry < 0) carry = 0;
    }
    ctx.restore();
    // 칼날 (데미지 들어가는 속도면 디버그에서 빨갛게)
    const dir = this.bladeDir(rope);
    const tip = { x: b.x + dir.x * C.bladeTip, y: b.y + dir.y * C.bladeTip };
    const base = { x: b.x - dir.x * C.bladeBack, y: b.y - dir.y * C.bladeBack };
    const hot = debug && p.state === 'attack' && rope.speed >= C.speedMin;
    Anim.drawBlade(ctx, base, tip, 3, 1.2, hot ? '#ff3030' : col);
    if (debug) {
      ctx.save();
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = hot ? '#ff6060' : '#fff';
      ctx.fillText(rope.speed.toFixed(1), b.x, b.y - 12);
      ctx.restore();
    }
  },
};

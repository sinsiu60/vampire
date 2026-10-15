'use strict';
// 무기 변형 (데이터: data/transforms.js)
//  · 무기마다 변형 칸 1개. 변형이 있으면 그 무기의 설정(기술·스킬·칼 모양·차지)을 patch 로 덮어씀 → player.weaponCfg()
//  · 패링·대시·각인 효과는 그대로. 전환기(스왑 어택)도 변형된 기술을 씀
//  · 변형마다 특수 동작(mech): 발도술(납도·발도 보너스·자동 거합 반격·일섬 연쇄) / 쌍검(가속) / 사슬검(당기기·포박)
//  · 얻는 곳: 보스 보상 카드(확률) / 대장간(8단계). 런 동안 유지

const Transform = {
  byId: {},
  cache: {},
  binds: [],     // 사슬검 포박: 묶인 적

  init() {
    for (const d of DATA.transforms) this.byId[d.id] = d;
  },
  reset() { this.binds.length = 0; },

  def(id) { return id ? this.byId[id] || null : null; },
  forWeapon(w) { return DATA.transforms.filter((d) => d.weapon === w); },
  emptySlots() { const o = {}; for (const t of WEAPON_ORDER) o[t] = null; return o; },

  // 변형을 덮어쓴 무기 설정 (캐시)
  cfg(t, id) {
    if (!id || !this.byId[id]) return CONFIG.weapons[t];
    const key = t + ':' + id;
    if (this.cache[key]) return this.cache[key];
    const base = CONFIG.weapons[t], P = this.byId[id].patch;
    const out = Object.assign({}, base);
    for (const k in P) {
      if (k === 'moves' || k === 'skills') out[k] = Object.assign({}, base[k], P[k]);
      else out[k] = P[k];
    }
    out.transform = id;
    return (this.cache[key] = out);
  },

  // 지금 든 무기(또는 t)의 변형
  of(p, t) { return p && p.trans ? this.def(p.trans[t || p.weaponType()]) : null; },
  mech(p) { const d = this.of(p); return d ? d.mech : null; },

  set(p, t, id) {
    p.trans[t] = id || null;
    p.sheathed = true;
    p.dualRamp = 0;
    p.recalcStats();
  },

  // 보상 등으로 변형 얻기
  give(game, d) {
    const p = game.player;
    this.set(p, d.weapon, d.id);
    Effects.popText(p.x, p.y - p.h - 50, `${CONFIG.weapons[d.weapon].name} 변형: ${d.name}`, `rgb(${CONFIG.weapons[d.weapon].trail.inner})`, 18);
    Effects.ring(p.x, p.y - p.h * 0.5, CONFIG.weapons[d.weapon].trail.glow, 80);
    Sound.play('engraveUp');
  },

  // 얻을 수 있는 변형 (변형이 없는 무기 것만)
  available(p) {
    return DATA.transforms.filter((d) => WEAPON_ORDER.indexOf(d.weapon) >= 0 && !p.trans[d.weapon]);
  },

  // 스타일 랭크용 이름 앞에 붙이는 말 (변형 기술은 다른 기술로 취급)
  stylePrefix(p) {
    const d = this.of(p);
    return d ? d.id.split('_').slice(1).join('_').toUpperCase() + '_' : '';
  },

  // 쌍검: 연속 적중 가속 (공격 속도 +%)
  aspd(p) {
    const d = this.of(p);
    return d && d.mech === 'dual' ? (p.dualRamp || 0) * d.dual.rampAspd : 0;
  },

  // ---------- 기술 ----------
  // 공격 시작: 발도술은 칼집에서 뽑는 첫 타 보너스
  onAttackStart(p, id, move) {
    const d = this.of(p);
    p.bindHit = false;
    if (!d || d.mech !== 'iaido') return move;
    if (p.sheathed && !move.noHit) {
      const k = d.iaido.drawMult;
      move = Object.assign({}, move, { damage: move.damage * k, drawn: true });
      if (move.posture !== undefined) move.posture *= k;
      Effects.popText(p.x, p.y - p.h - 34, '발도', '#dff', 13);
    }
    p.sheathed = false;
    p.drawnT = d.iaido.sheatheDelay;
    return move;
  },

  // 판정 시작 프레임
  onActive(game, p, m) {
    if (m.special === 'iaiChain') this.startIaiChain(game, p, m);
  },

  // 매 프레임 (공격 중). true = 기술 끝냄
  onMoveFrame(game, p, m, f, ax) {
    const end = m.startup + m.active;
    // 쌍검 회전 전진: 천천히 앞으로 + A/D 로 방향 조절
    if (m.special === 'dualSpin' && f >= m.startup && f < end) {
      const D = this.of(p).dual;
      p.vx = p.facing * D.spinSpeed + (ax || 0) * D.spinSteer;
    }
    if (m.special === 'iaiChain') return this.stepIaiChain(game, p, m, f);
    if (m.special === 'flurry' && f >= m.startup && f < end) p.vx = p.facing * 2.6;
    // 사슬검 3타 회전 중 우클릭: 회전을 앞으로 놓아주듯 던짐
    if (m.spinRelease && f >= m.startup && p.buf.heavy > 0) {
      p.buf.heavy = 0;
      p.startAttack('HEAVY_SPIN', 0, p.moveData('HEAVY_SPIN'));
      return true;
    }
    return false;
  },

  // 기술이 끝남 (납도)
  onMoveEnd(p, m) {
    if (m && m.sheathe && this.mech(p) === 'iaido') this.sheathe(p);
  },

  sheathe(p) {
    if (p.sheathed) return;
    p.sheathed = true;
    Sound.play('sheathe');
    Effects.sparks(p.x - p.facing * 6, p.y - p.h * 0.45, -p.facing, 4, '#dff');
  },

  // 적중
  onHit(game, p, e, move, res) {
    const d = this.of(p);
    if (d && d.mech === 'dual') {
      p.dualRamp = Math.min(d.dual.rampMax, (p.dualRamp || 0) + 1);
      p.dualT = d.dual.rampWindow;
    }
    if (move.special === 'bind' && !p.bindHit) {
      p.bindHit = true;
      if (res === 'kill') return;
      const S = move.skillCfg && move.skillCfg.bind;
      if (!S) return;
      if (e.isBoss) {
        e.addPosture(S.bossPosture, game);
        Combat.applyHit(game, e, S.bossDamage * p.damageMult(), false, { dir: p.facing, knockX: 0, knockY: 0, hitstun: 0, attackerX: p.x },
          { hitstop: 6, shake: 4, x: e.x, y: e.y - e.h * 0.5, styleId: 'BIND', weapon: 'sword' });
        Effects.popText(e.x, e.y - e.h - 30, '포박 불가', '#ccc', 13);
        return;
      }
      if (this.binds.some((b) => b.e === e)) return;
      this.binds.push({ e, t: 0, S, a0: Math.atan2(e.y - p.y, e.x - p.x), thrown: false });
      e.bound = true;
      Sound.play('chain');
    }
  },

  // 퍼펙트 패링: 발도술 납도 상태면 자동 거합 반격
  onPerfectParry(p, enemy) {
    if (this.mech(p) !== 'iaido' || !p.sheathed || !enemy || enemy.dead) return;
    p.facing = Math.sign(enemy.x - p.x) || p.facing;
    p.counterTimer = 0;
    p.startAttack('COUNTER_IAI', 0, p.moveData('COUNTER_IAI'));
    Effects.popText(p.x, p.y - p.h - 46, '거합 반격', '#dff', 18);
  },

  // ---------- 발도술 E: 일섬 연쇄 ----------
  startIaiChain(game, p, m) {
    const S = m.skillCfg, C = S.chain, V = CONFIG.view;
    const x0 = game.cam.x - 20, x1 = game.cam.x + V.width / V.zoom + 20;
    const pool = game.enemies.filter((e) => !e.dead && !e.executed && e.x > x0 && e.x < x1 && e.state !== 'intro' && e.state !== 'bossDeath');
    // 가까운 적부터 차례로 (매번 지금 위치에서 가장 가까운 적)
    const list = [];
    let cx = p.x;
    while (list.length < C.max && pool.length) {
      let bi = 0;
      for (let i = 1; i < pool.length; i++) if (Math.abs(pool[i].x - cx) < Math.abs(pool[bi].x - cx)) bi = i;
      const e = pool.splice(bi, 1)[0];
      list.push(e);
      cx = e.x;
    }
    if (!list.length) {
      // 적이 없으면 보통 발도 일섬
      Skills.iai(game, p, S.fallback);
      p.chainRun = null;
      return;
    }
    p.chainRun = { list, i: 0, t: 0, C, mult: p.damageMult() * (1 + Engrave.v(p, 'sword_iai_mastery', 'pct') / 100) };
    p.invuln = Math.max(p.invuln, list.length * C.interval + 20);
  },

  stepIaiChain(game, p, m, f) {
    const run = p.chainRun;
    if (f < m.startup || m.chainDone) return false;
    if (!run) {
      if (f >= m.startup + 6) { this.finishMove(p, m, f); return true; }
      return false;
    }
    const C = run.C;
    if (run.t-- > 0) return false;
    if (run.i >= run.list.length) { p.chainRun = null; this.finishMove(p, m, f); return true; }
    const e = run.list[run.i], n = run.list.length;
    run.t = C.interval - 1;
    const L = game.level;
    const dir = Math.sign(e.x - p.x) || p.facing;
    const tx = Math.max(20, Math.min(L.width - 20, e.x + dir * C.offset));
    const x0 = p.x, y0 = p.y;
    for (let i = 1; i <= 4; i++) {
      p.x = x0 + (tx - x0) * (i / 5);
      p.y = y0 + ((e.onGround ? e.y : y0) - y0) * (i / 5);
      Effects.afterimage(Anim.snapshot(Anim.playerFigure(p)), 'rgb(80,240,255)', 24);
    }
    p.x = tx;
    if (e.onGround) { p.y = e.y; p.vy = 0; }
    else p.vy = Math.min(p.vy, 0);
    p.facing = -dir;
    const y = p.y - p.h * 0.55;
    Effects.streak(x0, y0 - p.h * 0.55, tx, y, '#bff');
    // 베기는 마지막에 한꺼번에 터짐
    Skills.cuts.push({ x0, x1: tx, y, t: (n - 1 - run.i) * C.interval + C.delay, C, targets: [e], dir,
      mult: run.mult, styleId: p.styleId, weapon: 'sword' });
    Sound.play('teleport');
    run.i++;
    return false;
  },

  // 기술의 판정을 끝내고 후딜로
  finishMove(p, m, f) {
    p.move = Object.assign({}, m, { active: Math.max(1, f - m.startup), chainDone: true });
  },

  // ---------- 매 프레임 ----------
  update(game) {
    const p = game.player, d = this.of(p);
    // 발도술: 공격이 끝나고 잠시 뒤 자동 납도 (다른 무기를 들면 납도 상태로)
    if (d && d.mech === 'iaido') {
      if (p.state === 'attack' || p.state === 'execute' || p.state === 'slam') p.drawnT = d.iaido.sheatheDelay;
      else if (!p.sheathed && --p.drawnT <= 0) this.sheathe(p);
    } else p.sheathed = true;
    // 쌍검 가속: 한동안 못 맞히면 초기화
    if (p.dualT > 0 && --p.dualT === 0) p.dualRamp = 0;
    if (!d || d.mech !== 'dual') p.dualRamp = 0;
    if (p.state !== 'attack') p.chainRun = null;
    // 사슬검: 로프 물리 (다른 무기면 정리)
    ChainRope.update(game, p);
    // 포박: 휘두르기 → 던지기
    for (let i = this.binds.length - 1; i >= 0; i--) {
      const b = this.binds[i], e = b.e, S = b.S;
      if (e.dead || e.executed || e.remove) { e.bound = false; this.binds.splice(i, 1); continue; }
      b.t++;
      if (!b.thrown) {
        if (b.t < S.spinFrames) {
          const a = b.a0 + (b.t / S.spinFrames) * Math.PI * 3 * (p.facing || 1);
          // 머리 위로 크게 휘두름 (발밑이 바닥보다 내려가지 않게 — 벽 속에 박히면 밀려나 버림)
          e.x = Math.max(12, Math.min(game.level.width - 12, p.x + Math.cos(a) * S.radius));
          e.y = Math.min(p.y - 6, p.y - 30 + Math.sin(a) * S.radius * 0.45);
          e.vx = 0; e.vy = 0;
          e.onGround = false;
          if (e.state !== 'launched') e.setState('launched');
          if (b.t % 8 === 0) Sound.play('whoosh');
          continue;
        }
        // 던지기: 가장 가까운 다른 적에게 (없으면 앞으로)
        let tgt = null, bd = 700;
        for (const o of game.enemies) {
          if (o === e || o.dead || o.executed || o.bound) continue;
          const dd = Math.abs(o.x - p.x);
          if (dd < bd) { bd = dd; tgt = o; }
        }
        // 목표를 향해 일직선으로 날아감 (중력 무시)
        const tx = tgt ? tgt.x : e.x + p.facing * 400, ty = tgt ? tgt.y - 22 : e.y - 20;
        const L = Math.hypot(tx - e.x, ty - e.y) || 1;
        b.vx = (tx - e.x) / L * S.throwSpeed;
        b.vy = (ty - e.y) / L * S.throwSpeed;
        e.vx = b.vx; e.vy = b.vy;
        b.thrown = true;
        b.t = 0;
        b.tgt = tgt;
        Sound.play('swingHeavy');
        continue;
      }
      // 날아가는 중: 다른 적과 부딪히면 둘 다 피해 (맵 끝·벽에 닿으면 멈춤)
      let stop = false;
      if (e.x < 12 || e.x > game.level.width - 12 || e.hitWall) { e.x = Math.max(12, Math.min(game.level.width - 12, e.x)); stop = true; }
      e.vx = b.vx; e.vy = b.vy;
      let hitO = null;
      for (const o of game.enemies) {
        if (o === e || o.dead || o.executed) continue;
        if (Math.abs(o.x - e.x) < (o.w + e.w) / 2 + 6 && o.y - o.h < e.y && e.y - e.h < o.y) { hitO = o; break; }
      }
      if (hitO || stop || (e.onGround && b.t > 30) || b.t > 45) {
        e.vx = b.vx * 0.3; e.vy = -3;
        const dmg = S.damage * p.damageMult();
        for (const o of hitO ? [hitO, e] : [e]) {
          if (o.dead) continue;
          const dir = Math.sign(o.x - e.x) || p.facing;
          const res = Combat.applyHit(game, o, hitO ? dmg : dmg * 0.5, false, { dir, knockX: 6, knockY: -4, hitstun: 36, launch: true, attackerX: e.x },
            { hitstop: 8, shake: 7, heavy: true, x: o.x, y: o.y - o.h * 0.5, styleId: 'BIND_THROW', weapon: 'sword' });
          if (res !== 'kill' && res !== 'blocked') o.addPosture(S.posture, game);
        }
        Effects.ring(e.x, e.y - e.h * 0.5, '#cfe', 60);
        e.bound = false;
        this.binds.splice(i, 1);
      }
    }
  },

  // ---------- 그리기 ----------
  // 월드: 포박 사슬
  draw(ctx, game) {
    const p = game.player;
    for (const b of this.binds) {
      if (b.thrown || p.rope) continue;     // 사슬검 로프가 있으면 그게 묶은 적까지 이어짐
      const e = b.e;
      this.chainLine(ctx, p.x + p.facing * 8, p.y - p.h * 0.6, e.x, e.y - e.h * 0.5, '#cfe');
    }
  },

  chainLine(ctx, x0, y0, x1, y1, col) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    ctx.shadowColor = col;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  },

  // 플레이어 무기 모양 (칼집 / 두 번째 칼 / 사슬). true = 기본 칼은 그리지 않음
  drawWeapon(ctx, p, fig, col) {
    const b = fig.blade, B = b.spec, f = p.facing, hip = fig.j.hip;
    if (B.sheath) {
      // 칼집 (허리 뒤로 비스듬히)
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(hip.x + f * 4, hip.y - 3);
      ctx.lineTo(hip.x - f * 34, hip.y + 11);
      ctx.stroke();
      if (p.sheathed && p.state !== 'attack') {
        // 납도: 칼자루만 앞으로
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(hip.x + f * 4, hip.y - 3);
        ctx.lineTo(hip.x + f * 17, hip.y - 9);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hip.x + f * 5, hip.y - 8);
        ctx.lineTo(hip.x + f * 3, hip.y + 2);
        ctx.stroke();
        ctx.restore();
        return true;
      }
      ctx.restore();
      return false;
    }
    if (B.dual && fig.blade2) {
      // 쌍검 기술 중: 왼손 칼은 자기 궤적대로
      Anim.drawBlade(ctx, fig.blade2.base, fig.blade2.tip, B.w0, B.w1, col);
      return false;
    }
    if (B.dual) {
      // 뒷손에도 칼 (앞칼보다 조금 뒤로 기울여)
      const a = (b.pose.ang + 32) * DEG, hb = fig.j.handB;
      const tip = { x: hb.x + f * Math.cos(a) * B.length, y: hb.y + Math.sin(a) * B.length * (b.pose.squash || 1) };
      const base = { x: hb.x - f * Math.cos(a) * 5, y: hb.y - Math.sin(a) * 5 };
      Anim.drawBlade(ctx, base, tip, B.w0, B.w1, col);
      return false;
    }
    if (B.chain && p.rope) {
      // 사슬검: 사슬·칼날은 물리 (chainrope.js)
      ChainRope.draw(ctx, p, col, !!Game.debugSlow);
      return true;
    }
    return false;
  },

  // HUD: 쌍검 가속 / 발도술 상태 (무기 아이콘 위)
  drawHud(ctx, game, x, y) {
    const p = game.player, d = this.of(p);
    if (!d) return;
    ctx.save();
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    if (d.mech === 'dual') {
      const n = p.dualRamp || 0, M = d.dual.rampMax;
      ctx.fillStyle = n ? '#7ff' : 'rgba(255,255,255,0.45)';
      ctx.fillText(`가속 +${n * d.dual.rampAspd}%`, x, y);
      for (let i = 0; i < M; i++) {
        ctx.fillStyle = i < n ? '#7ff' : 'rgba(255,255,255,0.15)';
        ctx.fillRect(x + 74 + i * 6, y - 8, 4, 8);
      }
    } else if (d.mech === 'iaido') {
      ctx.fillStyle = p.sheathed ? '#dff' : 'rgba(255,255,255,0.5)';
      ctx.fillText(p.sheathed ? '납도 — 다음 타 ×1.5' : '발도', x, y);
    }
    ctx.restore();
  },

  // ---------- 보상 카드 ----------
  cardOption(game, d) {
    return {
      label: d.name, desc: d.card.join('\n'),
      draw: (ctx, x, y, w, h, on) => this.drawCard(ctx, d, x, y, w, h, on),
      act: () => { this.give(game, d); },
    };
  },

  // 변형 카드: 무기 색 이중 테두리 + 움직이는 미리보기 + 바뀌는 점
  drawCard(ctx, d, x, y, w, h, on) {
    const W = CONFIG.weapons[d.weapon], col = W.trail.glow;
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(14,26,30,0.98)');
    g.addColorStop(1, 'rgba(10,10,16,0.98)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = col;
    ctx.lineWidth = on ? 2.5 : 1.5;
    if (on) { ctx.shadowColor = col; ctx.shadowBlur = 18; }
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    ctx.globalAlpha = 1;
    Menu.text(ctx, `◆ ${W.name} 변형 ◆`, x + w / 2, y + 20, 'bold 10px "Segoe UI", sans-serif', col);
    Menu.text(ctx, d.name, x + w / 2, y + 42, 'bold 18px "Segoe UI", sans-serif', '#fff');
    Menu.text(ctx, d.tagline, x + w / 2, y + 58, '10px "Segoe UI", sans-serif', `rgb(${W.trail.inner})`);
    this.drawPreview(ctx, d, x + 8, y + 64, w - 16, 76, (Game.frame || 0));
    d.card.forEach((l, i) => {
      ctx.font = '11px "Segoe UI", sans-serif';
      Menu.text(ctx, '· ' + l, x + 12, y + 158 + i * 16, '11px "Segoe UI", sans-serif', 'rgba(230,240,250,0.9)', 'left');
    });
    ctx.restore();
  },

  // 기술 미리보기: 가짜 플레이어로 preview 기술들을 차례로 반복 재생
  previewMove(cfg, id) {
    if (id === 'Q' || id === 'E') { const S = cfg.skills[id.toLowerCase()]; return S && S.move; }
    const h = /^HEAVY(\d)$/.exec(id);
    if (h) { const H = cfg.moves.HEAVY || CONFIG.moves.HEAVY; return H[Math.min(+h[1], H.length - 1)]; }
    return cfg.moves[id] || CONFIG.moves[id];
  },

  drawPreview(ctx, d, x, y, w, h, t) {
    const cfg = this.cfg(d.weapon, d.id);
    const moves = d.preview.map((id) => [id, this.previewMove(cfg, id)]).filter((a) => a[1]);
    if (!moves.length) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, y, w, h);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    // 지금 재생할 기술
    const span = (m) => m.startup + Math.min(m.active, 60) + m.recovery + 10;
    const total = moves.reduce((s, a) => s + span(a[1]), 0);
    let ft = (t * 0.7) % total, cur = moves[0];
    for (const a of moves) { if (ft < span(a[1])) { cur = a; break; } ft -= span(a[1]); }
    const [id, m] = cur;
    const maxR = d.chain ? d.chain.length + 40 : Math.max(...moves.map((a) => (a[1].swing && a[1].swing.r) || 60));
    const sc = Math.min(0.85, (w * 0.62) / maxR, (h - 8) / 70);
    // 가짜 플레이어
    const fake = Object.create(Player.prototype);
    Object.assign(fake, {
      x: 0, y: 0, facing: 1, w: CONFIG.player.width, h: CONFIG.player.height, vx: 0, vy: 0, onGround: true, runPhase: 0,
      state: ft < m.startup + Math.min(m.active, 60) + m.recovery ? 'attack' : 'free', stateFrame: ft, move: m, moveId: id,
      activeWeapon: WEAPON_ORDER.indexOf(d.weapon), trans: { [d.weapon]: d.id }, sheathed: ft >= m.startup + m.active + m.recovery, res: { timer: 0 },
      chargeLevel: 0, critReady: 0, swapFlash: 0,
    });
    ctx.translate(x + w * 0.34, y + h - 6);
    ctx.scale(sc, sc);
    // 바닥
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1 / sc;
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(w * 2, 0); ctx.stroke();
    const W = CONFIG.weapons[d.weapon];
    // 검기: 판정 동안 칼끝 궤적
    if (fake.state === 'attack' && m.swing && ft >= m.startup && d.mech !== 'chain' && !m.dual) {
      const a = {}, pts = [];
      const f1 = Math.min(ft, m.startup + Math.min(m.active, 60));
      for (let fr = Math.max(m.startup, f1 - 8); fr <= f1; fr += 0.5) pts.push(fake.bladePoint(fake.bladePose(fr), m.swing.r, a) && { x: a.x, y: a.y });
      ctx.strokeStyle = `rgba(${W.trail.outer},0.85)`;
      ctx.shadowColor = W.trail.glow;
      ctx.shadowBlur = 10;
      ctx.lineWidth = m.swing.thrust ? 3 : 4;
      ctx.lineCap = 'round';
      if (m.swing.thrust) {
        const ext = ft < m.startup + m.active ? 1 : 0.4;
        ctx.beginPath(); ctx.moveTo(10, -32); ctx.lineTo(m.swing.r * ext, -32); ctx.stroke();
      } else if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const q of pts) ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    // 사슬검: 미리보기용 로프를 따로 굴림
    if (d.mech === 'chain') {
      const C = d.chain, pv = d._pv || (d._pv = { rope: ChainRope.make(C, 9, -30), ft: ft, cur: id, swing: 0 });
      if (pv.cur !== id) { pv.cur = id; pv.swing++; }
      fake.swingId = pv.swing;
      let n = Math.max(0, Math.min(4, Math.round(ft - pv.ft)));
      if (ft < pv.ft) n = 1;
      const fe = ft;
      fake.rope = pv.rope;
      for (let k = n - 1; k >= 0; k--) { fake.stateFrame = Math.max(0, Math.round(fe - k)); ChainRope.update(null, fake, C); }
      fake.stateFrame = fe;
      if (!fake.chainHand) fake.chainHand = ChainRope.handPoint(fake, C);
      pv.ft = ft;
    }
    const fig = Anim.playerFigure(fake);
    Anim.drawFigure(ctx, fig, { color: '#dfe9f2', back: '#7f8c98', glow: W.trail.glow, glowBlur: 6 }, null);
    if (!this.drawWeapon(ctx, fake, fig, '#dfe9f2') && !fig.blade.spec.fist) Anim.drawBlade(ctx, fig.blade.base, fig.blade.tip, fig.blade.spec.w0, fig.blade.spec.w1, '#dfe9f2');
    ctx.restore();
    Menu.text(ctx, m.name, x + w - 4, y + 12, '10px "Segoe UI", sans-serif', 'rgba(255,255,255,0.55)', 'right');
  },
};

Transform.init();

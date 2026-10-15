'use strict';
// 스킬·고유 효과의 월드 오브젝트: 지면 충격파(지면 강타 / 대검 Lv3), 번개(뇌신), 폭발(폭염), 대시 피해(그림자)
// 플레이어 기술 데이터는 config.js 의 skills / weapons, 발동은 player.js

const Skills = {
  waves: [],     // 지면 충격파
  bolts: [],     // 번개 연출

  reset() {
    this.waves.length = 0;
    this.bolts.length = 0;
  },

  // ---------- 지면 충격파 ----------
  // Q: { damage, range, speed, height, stun, bossPosture }
  quake(game, p, Q) {
    const g = game.groundAt(p.x + p.facing * 18);
    this.waves.push({
      x: p.x + p.facing * 18, y: g ? g.y : p.y, dir: p.facing, dist: 0, Q,
      hit: new Set(), mult: p.damageMult(), styleId: p.styleId, t: 0,
    });
    Effects.shockwave(p.x + p.facing * 20, p.y, 50);
    Effects.addShake(6);
    Sound.play('quake');
  },

  update(game) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i], Q = w.Q;
      w.t++;
      w.x += w.dir * Q.speed;
      w.dist += Q.speed;
      // 바닥을 따라감: 낭떠러지나 벽(높이 차가 큼)에서 사라짐
      const sg = this.segAt(game.level, w.x);
      const gy = sg ? CONFIG.dungeon.baseY - sg.h : game.level.groundY;
      if ((sg && sg.pit) || Math.abs(gy - w.y) > 40 || w.dist > Q.range || w.x < 0 || w.x > game.level.width) {
        this.waves.splice(i, 1);
        continue;
      }
      w.y = gy;
      if (w.t % 2 === 0) Effects.dust(w.x, w.y, 2, w.dir);
      for (const e of game.enemies) {
        if (e.dead || w.hit.has(e) || e.executed) continue;
        if (Math.abs(e.x - w.x) > 26 + e.w / 2 || e.y < w.y - Q.height || e.y > w.y + 12) continue;
        w.hit.add(e);
        const crit = Math.random() < game.player.critChance();
        const dmg = Q.damage * w.mult * (crit ? CONFIG.player.critMult : 1);
        const res = Combat.applyHit(game, e, dmg, crit, {
          dir: w.dir, knockX: 2, knockY: -4, hitstun: 30, launch: false, attackerX: w.x - w.dir * 30,
        }, { hitstop: 5, shake: 3, heavy: true, x: e.x, y: e.y - e.h * 0.3, styleId: w.styleId + '_WAVE' });
        if (res !== 'kill') this.stun(game, e, Q);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) if (--this.bolts[i].life <= 0) this.bolts.splice(i, 1);
  },

  // 기절: 일반 적은 stun 상태로 (슈퍼아머도 무시), 보스는 그로기 게이지
  stun(game, e, Q) {
    if (e.dead) return;
    if (e.isBoss) { e.addPosture(Q.bossPosture || 0, game); return; }
    if (e.state === 'broken' || e.state === 'launched' || e.state === 'down') return;
    e.stunTimer = Math.max(e.stunTimer, Q.stun);
    e.vx = 0;
    e.setState('stun');
    Effects.popText(e.x, e.y - e.h - 22, '기절', '#ffe070', 13);
  },

  segAt(level, x) {
    if (!level.segs) return null;
    for (const sg of level.segs) if (x >= sg.x0 && x <= sg.x1) return sg;
    return null;
  },

  // ---------- 전설 고유 효과 ----------
  // 뇌신: 대상에게 번개
  thunder(game, p, e) {
    const U = CONFIG.loot.uniques.thunder;
    const top = e.y - e.h - 260;
    this.bolts.push({ x: e.x, y0: top, y1: e.y - e.h * 0.3, life: 12, max: 12, seed: Math.random() * 1000 });
    const dmg = U.damage * p.damageMult();
    Combat.applyHit(game, e, dmg, false, {
      dir: p.facing, knockX: 0.5, knockY: 0, hitstun: U.stun, launch: false, attackerX: p.x,
    }, { hitstop: 3, shake: 4, heavy: false, x: e.x, y: e.y - e.h * 0.5, styleId: 'THUNDER' });
    Effects.radialSparks(e.x, e.y - e.h * 0.5, 12, '#bfe6ff', 1);
    Effects.screenFlash('rgba(190,220,255,', 5);
    Sound.play('thunder');
  },

  // 폭염: 퍼펙트 패링 시 주변 폭발
  parryBlast(game, p, x, y) {
    const U = CONFIG.loot.uniques.parryBlast;
    Effects.ring(x, y, '#ff8a2a', U.radius);
    Effects.radialSparks(x, y, 30, '#ffb050', 2);
    Effects.shockwave(x, p.y, U.radius * 0.7);
    Sound.play('boom');
    const mult = p.damageMult();
    for (const e of game.enemies) {
      if (e.dead || e.executed) continue;
      const dx = e.x - x, dy = (e.y - e.h / 2) - y;
      if (dx * dx + dy * dy > U.radius * U.radius) continue;
      const dir = Math.sign(dx) || p.facing;
      const res = Combat.applyHit(game, e, U.damage * mult, false, {
        dir, knockX: 5, knockY: -3, hitstun: 30, launch: false, attackerX: x,
      }, { hitstop: 4, shake: 5, heavy: true, x: e.x, y: e.y - e.h * 0.5, styleId: 'PARRY_BLAST' });
      if (res !== 'kill') e.addPosture(U.posture, game);
    }
  },

  // 그림자: 대시로 통과한 적에게 피해 (대시당 한 번)
  phantom(game, p) {
    const U = CONFIG.loot.uniques.phantom;
    const pb = Combat.bodyBox(p, {});
    pb.x -= 6; pb.w += 12;
    for (const e of game.enemies) {
      if (e.dead || e.executed || p.dashHits.has(e)) continue;
      if (!Combat.overlap(pb, Combat.bodyBox(e, {}))) continue;
      p.dashHits.add(e);
      Combat.applyHit(game, e, U.damage * p.damageMult(), false, {
        dir: p.dashDir, knockX: 1.5, knockY: 0, hitstun: 20, launch: false, attackerX: p.x - p.dashDir * 40,
      }, { hitstop: 2, shake: 2, heavy: false, x: e.x, y: e.y - e.h * 0.5, styleId: 'PHANTOM' });
      Effects.streak(p.x - p.dashDir * 40, e.y - e.h * 0.5, p.x + p.dashDir * 40, e.y - e.h * 0.5, '#b8f');
    }
  },

  // ---------- 그리기 (월드 좌표) ----------
  draw(ctx) {
    const t = Game.frame || 0;
    // 충격파: 바닥에서 솟는 바위 가시들
    for (const w of this.waves) {
      ctx.save();
      ctx.fillStyle = '#0c0a0b';
      ctx.shadowColor = '#ffd27a';
      ctx.shadowBlur = 12;
      for (let k = 0; k < 4; k++) {
        const x = w.x - w.dir * k * 14;
        const h = (26 - k * 6) * (0.8 + 0.3 * Math.sin(t * 0.9 + k));
        ctx.beginPath();
        ctx.moveTo(x - 7, w.y);
        ctx.lineTo(x + w.dir * 2, w.y - h);
        ctx.lineTo(x + 7, w.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,220,140,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w.x - w.dir * 60, w.y - 1);
      ctx.lineTo(w.x + w.dir * 8, w.y - 1);
      ctx.stroke();
      ctx.restore();
    }
    // 번개: 지그재그 선
    for (const b of this.bolts) {
      const k = b.life / b.max;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.strokeStyle = '#eaf6ff';
      ctx.shadowColor = '#7cc4ff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 1.5 + 3 * k;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const y = b.y0 + (b.y1 - b.y0) * (i / n);
        const x = b.x + (i === 0 || i === n ? 0 : Math.sin(b.seed + i * 12.9898 + (b.life >> 1)) * 14);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  },
};

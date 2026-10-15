'use strict';
// 층별 함정: 2층 가시 함정 / 3층 화염 분출구
//  idle(대기) → warn(빨강 예고) → active(판정) 반복. 플레이어는 대시 무적으로 피할 수 있고 패링 불가
//  적도 맞는다 — 넉백으로 밀어 넣거나 띄워서 떨어뜨리면 TRAP KILL
// 수치는 CONFIG.traps, 층별 개수는 CONFIG.floors[].traps

const Traps = {
  // 방 생성 때: 전투방의 넓은 땅 위에 놓기
  place(room, level, fi) {
    const F = CONFIG.floors[Math.min(fi, CONFIG.floors.length - 1)], T = CONFIG.traps;
    room.traps = [];
    if (!F.traps || !room.terrain) return;
    const C = T[F.traps.kind];
    const n = randInt(F.traps.min, F.traps.max);
    const exitGap = (room.exitLanding || 0) + 60;   // 오른쪽 갈림길 문 앞은 비움
    const segs = level.segs.filter((sg) => !sg.pit && sg.x1 - sg.x0 >= T.minSeg && sg.x1 > T.doorGap && sg.x0 < room.width - exitGap);
    for (let i = 0; i < n && segs.length; i++) {
      const sg = segs.splice((Math.random() * segs.length) | 0, 1)[0];
      const lo = Math.max(sg.x0 + C.width, T.doorGap), hi = Math.min(sg.x1 - C.width, room.width - exitGap);
      if (hi <= lo) continue;
      room.traps.push({
        kind: F.traps.kind, x: rand(lo, hi), y: CONFIG.dungeon.baseY - sg.h,
        phase: 'idle', t: randInt(20, C.idle[1]), hitPlayer: false, hit: new Set(),
      });
    }
  },

  update(game) {
    const room = game.room;
    if (!room || !room.traps) return;
    if (room.cleared) {   // 방을 클리어하면 멈춤 (내려간 상태로)
      for (const tr of room.traps) tr.phase = 'idle';
      return;
    }
    const p = game.player;
    for (const tr of room.traps) {
      const C = CONFIG.traps[tr.kind];
      if (--tr.t <= 0) {
        if (tr.phase === 'idle') { tr.phase = 'warn'; tr.t = C.warn; Sound.play('trapWarn'); }
        else if (tr.phase === 'warn') {
          tr.phase = 'active'; tr.t = C.active; tr.hitPlayer = false; tr.hit.clear();
          Sound.play(tr.kind === 'flames' ? 'trapFlame' : 'trapSpike');
          Effects.dust(tr.x, tr.y, 6, 0);
        } else { tr.phase = 'idle'; tr.t = randInt(C.idle[0], C.idle[1]); }
      }
      if (tr.phase !== 'active') continue;
      // 화염은 처음 몇 프레임 동안 솟아오름
      const k = tr.kind === 'flames' ? Math.min(1, (C.active - tr.t) / 6) : 1;
      const box = { x: tr.x - C.width / 2, y: tr.y - C.height * k, w: C.width, h: C.height * k };
      if (!tr.hitPlayer && !p.dead && Combat.overlap(box, Combat.bodyBox(p, {}))) {
        tr.hitPlayer = true;
        const dir = Math.sign(p.x - tr.x) || -p.facing;
        Combat.resolveIncoming(game, p, C.damage, dir, C.knock, { parryable: false, trap: true }, null, tr.x);
      }
      for (const e of game.enemies) {
        if (e.dead || e.executed || tr.hit.has(e) || e.isBoss) continue;
        if (!Combat.overlap(box, Combat.bodyBox(e, {}))) continue;
        tr.hit.add(e);
        const dir = Math.sign(e.x - tr.x) || 1;
        const res = e.takeHit(C.enemyDamage, { dir, knockX: C.knock.x, knockY: C.knock.y, hitstun: 30, launch: true, attackerX: tr.x });
        Effects.damageNumber(e.x, e.y - e.h - 8, C.enemyDamage, false);
        Effects.sparks(e.x, e.y - e.h * 0.4, dir, 8, tr.kind === 'flames' ? '#ff9040' : '#d8e0ff');
        if (res === 'kill') {
          game.onEnemyKilled(e, 'trap');
          Style.gain(CONFIG.style.trapKill);
          Style.pushFeed('TRAP KILL', '#ff9a5a');
        }
      }
    }
  },

  // 방 그리기 (월드 좌표)
  draw(ctx, game) {
    const room = game.room;
    if (!room || !room.traps) return;
    const t = Game.frame || 0;
    for (const tr of room.traps) {
      const C = CONFIG.traps[tr.kind];
      const hw = C.width / 2;
      ctx.save();
      if (tr.kind === 'spikes') {
        // 바닥 판 + 예고 때 빨간 틈 / 작동 때 가시
        const up = tr.phase === 'active' ? Math.min(1, (C.active - tr.t) / 3) * Math.min(1, tr.t / 5) :
          tr.phase === 'warn' ? 0.12 + 0.06 * Math.sin(t * 0.8) : 0;
        if (tr.phase === 'warn') {
          ctx.fillStyle = `rgba(255,50,40,${(0.35 + 0.35 * Math.sin(t * 0.5)).toFixed(3)})`;
          ctx.shadowColor = '#f33';
          ctx.shadowBlur = 10;
          ctx.fillRect(tr.x - hw, tr.y - 3, C.width, 3);
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = '#060506';
        const n = 6;
        for (let i = 0; i < n; i++) {
          const x = tr.x - hw + (i + 0.5) * (C.width / n);
          ctx.beginPath();
          ctx.moveTo(x - 4.5, tr.y);
          ctx.lineTo(x, tr.y - C.height * up);
          ctx.lineTo(x + 4.5, tr.y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillRect(tr.x - hw - 4, tr.y - 2, C.width + 8, 4);
      } else {
        // 화염 분출구: 바닥 틈 + 예고 때 불씨·연기 / 작동 때 불기둥
        ctx.fillStyle = '#060506';
        ctx.fillRect(tr.x - hw, tr.y - 5, C.width, 5);
        const glow = tr.phase === 'warn' ? 0.4 + 0.4 * Math.sin(t * 0.6) : tr.phase === 'active' ? 1 : 0.15;
        ctx.fillStyle = `rgba(255,${tr.phase === 'warn' ? 60 : 140},30,${glow.toFixed(3)})`;
        ctx.shadowColor = '#f60';
        ctx.shadowBlur = 12;
        ctx.fillRect(tr.x - hw + 6, tr.y - 4, C.width - 12, 2);
        if (tr.phase === 'warn') {
          for (let i = 0; i < 3; i++) {
            const ph = (t * 1.5 + i * 13) % 40;
            ctx.fillStyle = `rgba(255,140,40,${(1 - ph / 40).toFixed(3)})`;
            ctx.fillRect(tr.x - 10 + i * 10 + Math.sin(t * 0.3 + i) * 3, tr.y - 6 - ph, 2, 2);
          }
        }
        if (tr.phase === 'active') {
          const k = Math.min(1, (C.active - tr.t) / 6) * Math.min(1, tr.t / 8);
          const h = C.height * k;
          const g = ctx.createLinearGradient(0, tr.y - h, 0, tr.y);
          g.addColorStop(0, 'rgba(255,220,120,0)');
          g.addColorStop(0.3, 'rgba(255,170,60,0.85)');
          g.addColorStop(1, 'rgba(255,90,30,0.95)');
          ctx.fillStyle = g;
          ctx.shadowBlur = 24;
          ctx.beginPath();
          const wob = Math.sin(t * 0.9) * 4;
          ctx.moveTo(tr.x - hw, tr.y);
          ctx.quadraticCurveTo(tr.x - hw * 0.8 + wob, tr.y - h * 0.6, tr.x + wob * 0.5, tr.y - h);
          ctx.quadraticCurveTo(tr.x + hw * 0.8 - wob, tr.y - h * 0.6, tr.x + hw, tr.y);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255,240,200,0.8)';
          ctx.fillRect(tr.x - 4, tr.y - h * 0.7, 8, h * 0.7);
        }
      }
      ctx.restore();
    }
  },
};

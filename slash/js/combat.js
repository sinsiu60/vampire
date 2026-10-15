'use strict';
// 히트박스 계산과 타격 처리 (데미지, 크리티컬, 넉백, 경직, 히트스톱, 연출)

const Combat = {
  // 상대 히트박스 → 월드 사각형
  worldBox(ent, hb, out) {
    out = out || {};
    out.x = ent.facing > 0 ? ent.x + hb.x : ent.x - hb.x - hb.w;
    out.y = ent.y + hb.y;
    out.w = hb.w;
    out.h = hb.h;
    return out;
  },

  bodyBox(ent, out) {
    out = out || {};
    out.x = ent.x - ent.w / 2;
    out.y = ent.y - ent.h;
    out.w = ent.w;
    out.h = ent.h;
    return out;
  },

  overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  },

  _hb: {}, _bb: {},

  // 플레이어 공격 판정: 판정 프레임 동안 매 스텝 호출
  playerAttack(game, player) {
    const move = player.move;
    if (!move || !player.isActiveFrame()) return;
    const hb = this.worldBox(player, move.hitbox, this._hb);
    for (const e of game.enemies) {
      if (e.dead || player.hitList.has(e)) continue;
      if (!this.overlap(hb, this.bodyBox(e, this._bb))) continue;
      player.hitList.add(e);
      this.hitEnemy(game, player, e, move);
    }
  },

  hitEnemy(game, player, enemy, move) {
    const P = CONFIG.player, F = CONFIG.feel;
    const crit = Math.random() < P.critChance;
    const dmg = move.damage * (crit ? P.critMult : 1);
    const dir = player.facing;

    enemy.takeHit(dmg, {
      dir,
      knockX: move.knock.x,
      knockY: move.knock.y,
      hitstun: move.hitstun,
      launch: !!move.launch,
      slam: !!move.slam,
    });
    // 공중 공격 적중: 플레이어도 공중에 살짝 머무름 (적의 저글링 감쇠를 같이 따름)
    if (move.air) player.airHang(enemy.juggleMult());

    // 히트 위치: 적 몸 중앙쯤
    const hx = enemy.x - dir * enemy.w * 0.2;
    const hy = enemy.y - enemy.h * 0.6;
    const killed = enemy.hp <= 0;

    let stop = move.hitstop + (crit ? 2 : 0) + (killed ? F.killHitstop : 0);
    game.hitstop = Math.max(game.hitstop, stop);
    Effects.addShake(move.shake + (crit ? 2 : 0) + (killed ? 4 : 0));
    Effects.sparks(hx, hy, dir, move.heavy ? 14 : 7, crit ? '#ffe680' : '#ffffff');
    Effects.damageNumber(enemy.x, enemy.y - enemy.h - 8, dmg, crit);
    if (move.impactFrame || (killed && move.heavy)) Effects.impactFrame(1);

    if (killed) {
      Effects.shards(enemy.x, enemy.y - enemy.h / 2, dir, 18, '#0c0a0b');
      Effects.sparks(hx, hy, dir, 10, '#ff5050');
      Sound.play('kill');
      game.onEnemyKilled(enemy);
    } else {
      Sound.play(move.launch ? 'launchHit' : move.heavy ? 'heavyHit' : 'hit');
    }
    if (crit) Sound.play('crit');

    game.registerHit();
  },

  // 내려찍기 착지 충격파: 주변 바닥의 적을 띄움
  slamWave(game, player) {
    const W = CONFIG.moves.SLAM_WAVE;
    Effects.shockwave(player.x, player.y, W.radius);
    Effects.addShake(W.shake);
    Effects.impactFrame(1);
    game.hitstop = Math.max(game.hitstop, 4);
    Sound.play('slam');
    for (const e of game.enemies) {
      if (e.dead) continue;
      const dx = e.x - player.x;
      if (Math.abs(dx) > W.radius || Math.abs(e.y - player.y) > W.height) continue;
      const dir = dx === 0 ? player.facing : Math.sign(dx);
      const crit = Math.random() < CONFIG.player.critChance;
      const dmg = W.damage * (crit ? CONFIG.player.critMult : 1);
      e.takeHit(dmg, { dir, knockX: W.knock.x, knockY: W.knock.y, hitstun: W.hitstun, launch: true });
      Effects.damageNumber(e.x, e.y - e.h - 8, dmg, crit);
      Effects.sparks(e.x, e.y - e.h * 0.4, dir, 6, '#ffffff');
      game.hitstop = Math.max(game.hitstop, W.hitstop);
      if (e.hp <= 0) {
        Effects.shards(e.x, e.y - e.h / 2, dir, 18, '#0c0a0b');
        Sound.play('kill');
        game.onEnemyKilled(e);
      }
      game.registerHit();
    }
  },

  // 적 공격 판정
  enemyAttack(game, enemy, hitbox, attack) {
    const player = game.player;
    if (player.dead || enemy.hitPlayer) return;
    const hb = this.worldBox(enemy, hitbox, this._hb);
    if (!this.overlap(hb, this.bodyBox(player, this._bb))) return;
    enemy.hitPlayer = true;
    if (player.isInvulnerable()) return;   // 대시 무적 등: 피함
    const F = CONFIG.feel;
    player.takeHit(attack.damage, enemy.facing, attack.knock);
    game.hitstop = Math.max(game.hitstop, F.hurtHitstop);
    Effects.addShake(F.hurtShake);
    Effects.sparks(player.x, player.y - player.h * 0.6, enemy.facing, 10, '#ff4040');
    Effects.damageNumber(player.x, player.y - player.h - 8, attack.damage, false);
    Sound.play('hurt');
    game.onPlayerHurt();
  },
};

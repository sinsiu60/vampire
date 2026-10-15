'use strict';
// 히트박스 계산과 타격 처리 (데미지, 크리티컬, 넉백, 경직, 히트스톱, 연출)
// 패링, 칼 부딪힘, 방패 막기, 슈퍼아머, 투사체 반사도 여기서

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

  _hb: {}, _bb: {}, _eb: {}, _pb: {},

  // ---------- 플레이어 → 적 ----------
  // 판정 프레임 동안 매 스텝 호출
  playerAttack(game, player) {
    const move = player.move;
    if (!move || !player.isActiveFrame()) return;
    const hb = this.worldBox(player, move.hitbox, this._hb);

    // 투사체 베기 → 반사
    for (const pr of game.projectiles) {
      if (pr.dead || pr.owner !== 'enemy') continue;
      if (this.overlap(hb, pr.box(this._pb))) {
        pr.reflect(player.facing);
        game.hitstop = Math.max(game.hitstop, 5);
        Effects.addShake(3);
      }
    }

    for (const e of game.enemies) {
      if (e.dead || player.hitList.has(e)) continue;
      // 칼끼리 부딪힘: 적이 근접 공격 판정 중이고 서로의 공격 판정이 겹치면 (슈퍼아머는 밀리지 않음)
      if (e.state === 'attack' && e.atk.kind === 'melee' && !e.hitPlayer && !e.armored &&
          this.overlap(hb, this.worldBox(e, e.atk.hitbox, this._eb))) {
        player.hitList.add(e);
        this.clash(game, player, e, hb);
        continue;
      }
      if (!this.overlap(hb, this.bodyBox(e, this._bb))) continue;
      player.hitList.add(e);
      this.hitEnemy(game, player, e, move);
    }
  },

  hitEnemy(game, player, enemy, move) {
    const P = CONFIG.player;
    // 패링 성공 후엔 크리티컬 확정
    const sure = player.critReady > 0;
    const crit = sure || Math.random() < P.critChance;
    if (sure) player.critReady = 0;
    const dmg = move.damage * (crit ? P.critMult : 1);
    const dir = player.facing;

    const res = this.applyHit(game, enemy, dmg, crit, {
      dir,
      knockX: move.knock.x,
      knockY: move.knock.y,
      hitstun: move.hitstun,
      launch: !!move.launch,
      slam: !!move.slam,
      attackerX: player.x,
    }, {
      hitstop: move.hitstop, shake: move.shake, heavy: move.heavy, impact: move.impactFrame,
      launchSfx: move.launch,
    });

    if (res === 'blocked') {
      // 방패에 막힘: 플레이어가 튕겨남
      player.vx = -dir * enemy.cfg.blockPush;
    } else if (move.air) {
      // 공중 공격 적중: 플레이어도 공중에 살짝 머무름 (적의 저글링 감쇠를 같이 따름)
      player.airHang(enemy.juggleMult());
    }
    if (sure && res !== 'blocked') Effects.popText(enemy.x, enemy.y - enemy.h - 34, 'CRITICAL', '#ffd83a', 16);
  },

  // 적에게 데미지 적용 + 결과별 연출. fx: { hitstop, shake, heavy, impact, x, y, launchSfx }
  applyHit(game, enemy, dmg, crit, info, fx) {
    const F = CONFIG.feel;
    const res = enemy.takeHit(dmg, info);
    const dir = info.dir;
    const hx = fx.x !== undefined ? fx.x : enemy.x - dir * enemy.w * 0.2;
    const hy = fx.y !== undefined ? fx.y : enemy.y - enemy.h * 0.6;

    if (res === 'blocked') {
      // 방패에 막힘: 데미지 없음, 파란 불꽃
      game.hitstop = Math.max(game.hitstop, 4);
      Effects.addShake(2);
      Effects.sparks(enemy.x + enemy.facing * enemy.w * 0.6, hy, -dir, 10, '#cfe6ff');
      Effects.popText(enemy.x, enemy.y - enemy.h - 14, '막힘', '#cfe6ff', 13);
      Sound.play('block');
      return res;
    }

    const killed = res === 'kill';
    const stop = fx.hitstop + (crit ? 2 : 0) + (killed ? F.killHitstop : 0);
    game.hitstop = Math.max(game.hitstop, res === 'armor' ? Math.ceil(stop * 0.6) : stop);
    Effects.addShake(fx.shake + (crit ? 2 : 0) + (killed ? 4 : 0));
    Effects.sparks(hx, hy, dir, fx.heavy ? 14 : 7, res === 'armor' ? '#aab4c0' : crit ? '#ffe680' : '#ffffff');
    Effects.damageNumber(enemy.x, enemy.y - enemy.h - 8, dmg, crit);
    if (fx.impact || (killed && fx.heavy)) Effects.impactFrame(1);

    if (killed) {
      Effects.shards(enemy.x, enemy.y - enemy.h / 2, dir, 18, '#0c0a0b');
      Effects.sparks(hx, hy, dir, 10, '#ff5050');
      Sound.play('kill');
      game.onEnemyKilled(enemy);
    } else if (res === 'armor') {
      Sound.play('armorHit');
    } else {
      Sound.play(fx.launchSfx ? 'launchHit' : fx.heavy ? 'heavyHit' : 'hit');
    }
    if (crit) Sound.play('crit');
    game.registerHit();
    return res;
  },

  // 칼끼리 부딪힘: 불꽃 + 양쪽 밀려남
  clash(game, player, enemy, hb) {
    const F = CONFIG.feel;
    const eb = this._eb;
    const x = (Math.max(hb.x, eb.x) + Math.min(hb.x + hb.w, eb.x + eb.w)) / 2;
    const y = (Math.max(hb.y, eb.y) + Math.min(hb.y + hb.h, eb.y + eb.h)) / 2;
    const dir = Math.sign(enemy.x - player.x) || player.facing;
    enemy.clashed(dir);
    player.vx = -dir * F.clashKnock * 0.6;
    game.hitstop = Math.max(game.hitstop, F.clashHitstop);
    Effects.addShake(5);
    Effects.sparks(x, y, dir, 12, '#fff6c0');
    Effects.sparks(x, y, -dir, 12, '#ffd060');
    Effects.flashRing(x, y);
    Sound.play('clash');
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
      this.applyHit(game, e, dmg, crit, {
        dir, knockX: W.knock.x, knockY: W.knock.y, hitstun: W.hitstun, launch: true, attackerX: player.x,
      }, { hitstop: W.hitstop, shake: 0, heavy: false, x: e.x, y: e.y - e.h * 0.4 });
    }
  },

  // ---------- 적 → 플레이어 ----------
  // 적 근접/돌진/급강하 공격 판정 (공격 판정 중 매 스텝)
  enemyAttack(game, enemy, hitbox, attack) {
    const player = game.player;
    if (player.dead || enemy.hitPlayer) return;
    const hb = this.worldBox(enemy, hitbox, this._hb);
    if (!this.overlap(hb, this.bodyBox(player, this._bb))) return;
    enemy.hitPlayer = true;
    // 패링: 노랑 공격만 가능
    if (player.isParrying() && attack.parryable) {
      const x = (player.x + enemy.x) / 2, y = player.y - player.h * 0.6;
      enemy.parried(Math.sign(enemy.x - player.x) || -player.facing);
      this.parrySuccess(game, player, enemy, x, y);
      return;
    }
    if (player.isInvulnerable()) return;   // 대시 무적 등: 피함
    this.damagePlayer(game, player, attack.damage, enemy.facing, attack.knock);
  },

  damagePlayer(game, player, dmg, dir, knock) {
    const F = CONFIG.feel;
    player.takeHit(dmg, dir, knock);
    game.hitstop = Math.max(game.hitstop, F.hurtHitstop);
    Effects.addShake(F.hurtShake);
    Effects.sparks(player.x, player.y - player.h * 0.6, dir, 10, '#ff4040');
    Effects.damageNumber(player.x, player.y - player.h - 8, dmg, false);
    Sound.play('hurt');
    game.onPlayerHurt();
  },

  // 패링 성공: 슬로모션 + 화면 번쩍 + 다음 공격 크리티컬 확정
  parrySuccess(game, player, enemy, x, y) {
    const PR = CONFIG.parry;
    player.onParrySuccess(enemy);
    game.hitstop = Math.max(game.hitstop, PR.hitstop);
    game.slowmo(PR.slowmoMs);
    Effects.screenFlash('rgba(255,250,215,', 8);
    Effects.addShake(6);
    Effects.sparks(x, y, 1, 14, '#fff6c0');
    Effects.sparks(x, y, -1, 14, '#ffd040');
    Effects.flashRing(x, y);
    Effects.popText(player.x, player.y - player.h - 30, 'PARRY!', '#ffe070', 24);
    Sound.play('parry');
    game.onParry(enemy);
  },
};

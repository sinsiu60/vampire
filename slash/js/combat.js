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

    // 보상 상자: 공격으로 쳐서 열기
    const ch = game.room && game.room.chest;
    if (ch && !ch.opened && this.overlap(hb, { x: ch.x - ch.w / 2, y: ch.y - ch.h, w: ch.w, h: ch.h })) game.openChest(ch);

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
    const wasDeflected = enemy.state === 'deflected' || enemy.state === 'stun';

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
      launchSfx: move.launch, styleId: player.moveId,
    });

    // 체간: 공격이 들어갈수록 차오름 (방패에 막혀도 조금)
    const PO = CONFIG.posture;
    let pd = move.posture !== undefined ? move.posture : move.damage * PO.hitMult;
    if (wasDeflected) pd *= PO.deflectedHitMult;   // 휘청이는 빈틈을 공략하면 더 크게
    if (enemy.cfg.hitPostureMult !== undefined) pd *= enemy.cfg.hitPostureMult;   // 보스: 공격보다 패링으로
    if (res === 'blocked') enemy.addPosture(move.damage * PO.blockMult, game);
    else if (res !== 'kill') enemy.addPosture(pd, game);

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
    // 공중 콤보 판정: 내가 공중이거나 적이 떠 있을 때
    const air = !game.player.onGround || enemy.state === 'launched';
    const res = enemy.takeHit(dmg, info);
    if (res !== 'blocked' && fx.styleId) Style.onHit(fx.styleId, air, res === 'armor');
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
    Style.onClash();
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
      }, { hitstop: W.hitstop, shake: 0, heavy: false, x: e.x, y: e.y - e.h * 0.4, styleId: 'SLAM_WAVE' });
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
    this.resolveIncoming(game, player, attack.damage, enemy.facing, attack.knock, attack, enemy, enemy.x);
  },

  // 플레이어에게 들어오는 공격 처리: 퍼펙트 패링 → 가드 → 회피(무적) → 피격
  // 반환: 'perfect' | 'guard' | 'dodge' | 'hit'
  resolveIncoming(game, player, dmg, dir, knock, attack, enemy, srcX) {
    const parryable = attack.parryable || attack.telegraph === 'white';
    // 퍼펙트 패링: 노랑/흰색 공격만. 방향 상관없이 (자동으로 돌아봄)
    if (player.isParrying() && parryable) {
      const x = enemy ? (player.x + enemy.x) / 2 : srcX;
      game.logParry(player.parryStart - game.simTime, true);
      this.perfectParry(game, player, enemy, x, player.y - player.h * 0.6, attack.telegraph === 'white');
      return 'perfect';
    }
    if (player.isInvulnerable()) {                 // 대시 무적 등: 피함
      if (player.state === 'dash') Style.onDodge();
      return 'dodge';
    }
    // 가드: 노랑/흰색 공격을 정면에서
    if (player.isGuarding() && parryable && (srcX - player.x) * player.facing >= 0) {
      const taken = player.onGuardBlock(dmg, dir);
      const x = player.x + player.facing * 14, y = player.y - player.h * 0.6;
      game.hitstop = Math.max(game.hitstop, 4);
      Effects.addShake(3);
      Effects.sparks(x, y, -player.facing, 8, '#dfe9ff');
      Effects.damageNumber(player.x, player.y - player.h - 8, taken, false);
      Sound.play('guard');
      Style.onGuard();
      if (player.dead) game.onPlayerHurt();
      return 'guard';
    }
    // 늦은 입력 보정: 패링 가능한 공격은 데미지·경직을 lateGraceMs 동안 보류
    // (그 사이 F 를 누르면 퍼펙트 패링으로 바뀜. 패링 불가 시간엔 보류 안 함)
    if (parryable && !player.parryLocked()) {
      player.pendingHits.push({ dmg, dir, knock, attack, enemy, srcX, time: game.simTime });
      return 'pending';
    }
    if (parryable) this.noteParryMiss(game, player, game.simTime);
    this.damagePlayer(game, player, dmg, dir, knock);
    return 'hit';
  },

  // F 를 누른 순간(tp) 보류 중인 피격이 있으면 퍼펙트 패링으로 처리
  // (같은 프레임 안에서 맞은 직후 처리된 입력도 인정: tp 가 타격보다 조금 앞서도 됨)
  tryLateParry(game, player, tp) {
    const PR = CONFIG.parry;
    for (let i = 0; i < player.pendingHits.length; i++) {
      const h = player.pendingHits[i];
      if (tp >= h.time - PR.windowMs && tp <= h.time + PR.lateGraceMs) {
        player.pendingHits.splice(i, 1);
        const e = h.enemy && !h.enemy.dead ? h.enemy : null;
        const x = e ? (player.x + e.x) / 2 : h.srcX;
        game.logParry(tp - h.time, true, tp > h.time ? '늦은 입력 보정' : '');
        this.perfectParry(game, player, e, x, player.y - player.h * 0.6, h.attack.telegraph === 'white');
        return true;
      }
    }
    return false;
  },

  // 디버그: 패링 가능한 공격에 맞음 → 너무 일찍 눌렀으면 기록, 이후 늦게 누르면 readInput 에서 기록
  noteParryMiss(game, player, hitTime) {
    const early = hitTime - player.lastParryPress;
    if (early > 0 && early <= CONFIG.parry.debugReportMs) {
      game.logParry(-early, false, player.parryLocked() ? '재입력 금지 중' : '');
      player.lastParryPress = -1e9;
    }
    game.lastParryHitSim = hitTime;
  },

  // 보류했던 피격 확정
  applyPendingHit(game, player, h) {
    if (player.dead) return;
    this.noteParryMiss(game, player, h.time);
    if (player.isInvulnerable()) return;
    if (player.isGuarding() && (h.srcX - player.x) * player.facing >= 0) {
      this.resolveIncoming(game, player, h.dmg, h.dir, h.knock, h.attack, h.enemy, h.srcX);
      return;
    }
    this.damagePlayer(game, player, h.dmg, h.dir, h.knock);
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

  // 연속 패링 체인 단계: 0(1~2회) / 1(3~4회) / 2(5회 이상)
  chainTier(n) {
    const C = CONFIG.parry.chain;
    return n >= C.tier3 ? 2 : n >= C.tier2 ? 1 : 0;
  },

  // 퍼펙트 패링: 데미지 0, 적 체간 크게 증가, 칼 맞닿은 채 히트스톱
  // enemy 가 null 이면 투사체 패링 (반사는 투사체 쪽에서)
  perfectParry(game, player, enemy, x, y, white) {
    const PR = CONFIG.parry, C = PR.chain;
    player.onPerfectParry(enemy);
    const tier = this.chainTier(player.parryChain);
    const color = white ? '#ffffff' : C.colors[tier];

    if (enemy) {
      const dir = Math.sign(enemy.x - player.x) || player.facing;
      enemy.parried(dir);
      let gain = PR.enemyPosture;
      if (white) gain *= PR.whitePostureMult;
      if (tier === 2) gain *= C.tier3PostureMult;
      enemy.addPosture(gain, game);
    }

    // 연출: 칼 맞닿은 채 정지 → 방사형 불꽃 + 충격파 원 + 1프레임 흑백 반전
    game.hitstop = Math.max(game.hitstop, PR.hitstop);
    game.slowmo(PR.slowmoMs);
    Effects.addShake(PR.shake + tier * 2);
    Effects.radialSparks(x, y, C.sparks[tier] + (white ? 16 : 0), color, tier);
    Effects.ring(x, y, color, 46 + tier * 18);
    Effects.flashRing(x, y);
    Effects.monoInvert(1);
    if (tier >= 1) game.zoomPulse = Math.max(game.zoomPulse, tier === 2 ? C.zoom3 : C.zoom2);
    if (tier === 2) {
      game.dim = Math.max(game.dim, C.dim3);
      Effects.radialSparks(x, y, 18, '#ffd23a', 2);     // 주황 폭발 + 노란 불씨
      Effects.ring(x, y, '#ff8a1a', 90);
    }
    if (white) {
      // 간파: 흰 섬광 + 특수 연출
      Effects.screenFlash('rgba(255,255,255,', 12);
      Effects.ring(x, y, '#ffffff', 130);
      Effects.popText(player.x, player.y - player.h - 34, '간파!', '#ffffff', 26);
      game.zoomPulse = Math.max(game.zoomPulse, C.zoom3 * 1.3);
    }
    Sound.play(white ? 'perfectParryWhite' : tier === 2 ? 'perfectParry3' : tier === 1 ? 'perfectParry2' : 'perfectParry');
    game.onParry(enemy, tier);
  },
};

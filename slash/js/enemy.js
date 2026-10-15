'use strict';
// 적 6종 공통 클래스. 종류별 차이는 config.js 의 enemies.* (특성 플래그 + attacks 목록)
//  상태: idle | chase | windup | attack | recover | hurt | stun | deflected | broken | launched | down | getup | dead
//   windup : 공격 예고 (노랑 = 패링 가능 / 빨강 = 패링 불가)
//   stun   : 그로기 (벽에 박음). 아무것도 못 함
//   deflected: 퍼펙트 패링 당해 휘청 (짧은 경직)
//   broken : 체간 붕괴. 무릎 꿇고 비틀거림 → 이때 처형 가능
//   launched: 공중에 떠 있음 (공격 불가) → 바닥에 닿으면 down → getup → chase
//  특성: shield(정면 방어) / flying(공중 부유) / superArmor(경직 무시, 패링으로 해제)

// 공격 예고 프레임(windup)은 config 의 telegraphMs 로 계산: 예고 시작 → 타격까지 항상 같은 시간
// (windup 이 끝난 다음 스텝이 공격 첫 판정 → windup + 1 스텝 = telegraphMs)
(function () {
  const STEP = 1000 / CONFIG.fps;
  for (const k in CONFIG.enemies) {
    for (const a of CONFIG.enemies[k].attacks) {
      if (a.telegraphMs !== undefined) a.windup = Math.max(1, Math.round(a.telegraphMs / STEP) - 1);
    }
  }
})();

class Enemy {
  // cfg: 보스처럼 CONFIG.enemies 밖의 설정을 쓰는 경우 직접 전달
  constructor(type, x, y, cfg) {
    const T = cfg || CONFIG.enemies[type];
    this.type = type;
    this.cfg = T;
    this.w = T.width;
    this.h = T.height;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = -1;
    this.hp = T.hp;
    this.maxHp = T.hp;
    this.onGround = false;
    this.state = 'idle';
    this.stateFrame = 0;
    this.cooldown = 30 + Math.random() * 40;
    this.atk = T.attacks ? T.attacks[0] : { id: 'slash', kind: 'melee', windup: 30, recovery: 40 };   // 현재(또는 다음) 공격
    this.flash = 0;
    this.hitPlayer = false;
    this.dead = false;
    this.remove = false;
    this.hpShow = 0;              // 맞은 뒤 체력바 표시 시간
    this.airTime = 0;             // 띄워진 뒤 누적 체공 시간 (저글링 감쇠용, 기상하면 리셋)
    this.slammed = false;         // 내려찍기로 바닥에 꽂히는 중
    this.hitstun = 0;
    this.stunTimer = 0;           // 그로기 남은 시간
    this.maxPosture = T.posture;  // 체간: 가득 차면 붕괴(처형 가능)
    this.posture = 0;
    this.postureDelay = 0;
    this.postureFlash = 0;
    this.executed = false;        // 처형 연출 중 (일반 렌더 대신 처형 연출이 그림)
    this.armorBroken = 0;         // 슈퍼아머 해제 남은 시간
    this.turnTimer = 0;           // 방패병: 뒤돌아보기까지 누적
    this.diveVX = 0; this.diveVY = 0;
    this.walkPhase = Math.random() * 6;
    this.seed = Math.random() * 1000;   // 숨쉬기 등 애니메이션 박자를 적마다 다르게
    if (T.flying) this.y = y - T.hoverHeight;
  }

  // 무한콤 방지: 오래 떠 있을수록 덜 뜬다
  juggleMult() {
    const A = CONFIG.air;
    return Math.max(A.juggleMinMult, 1 - this.airTime / A.juggleDecayFrames);
  }

  setState(s) {
    this.state = s;
    this.stateFrame = 0;
  }

  // 예고 중인가? (렌더러가 빨강/노랑 번쩍에 사용)
  get telegraphing() {
    return this.state === 'windup';
  }

  // 예고 진행도 0~1 (렌더러가 빛 세기에 사용)
  get teleProgress() {
    return clamp01(this.stateFrame / this.atk.windup);
  }

  // 체간이 회복되는 평상시 상태인가
  isNeutral() {
    const s = this.state;
    return s === 'idle' || s === 'chase' || s === 'windup' || s === 'attack' || s === 'recover';
  }

  get armored() {
    return !!this.cfg.superArmor && this.armorBroken <= 0;
  }

  // 방패를 들고 있는 상태인가 (정면 공격 막음). 방패 파괴(대검 E) 중엔 못 막음
  get guarding() {
    return !!this.cfg.shield && !(this.shieldBroken > 0) && (this.state === 'idle' || this.state === 'chase' || this.state === 'windup');
  }

  // 약점 무기: weapons.*.strongVs 에 이 적 종류가 있는 무기 (없으면 null)
  get weakTo() {
    if (this._weak === undefined) {
      this._weak = null;
      for (const t in CONFIG.weapons) if ((CONFIG.weapons[t].strongVs || []).indexOf(this.type) >= 0) this._weak = t;
    }
    return this._weak;
  }

  // 공격 예고 색: white(간파, 보스) / yellow(패링 가능) / red(패링 불가)
  get telegraphColor() {
    if (this.atk.telegraph === 'white') return 'white';
    return this.atk.parryable ? 'yellow' : 'red';
  }

  // 공중에 떠서 움직이는 중인가 (중력 무시)
  get hovering() {
    return !!this.cfg.flying && !this.dead &&
      this.state !== 'launched' && this.state !== 'down' && this.state !== 'getup' && this.state !== 'broken' &&
      !(this.state === 'recover' && this.grounded);
  }

  // 사거리 안의 공격 중 가중치로 하나 고르기. 빨강(패링 불가) 공격은 연속으로 쓰지 않음
  pickAttack(dist) {
    let list = this.cfg.attacks.filter((a) => dist <= a.range);
    if (this.lastRed) {
      const yellow = list.filter((a) => a.parryable);
      if (yellow.length) list = yellow;
    }
    if (!list.length) return null;
    let total = 0;
    for (const a of list) total += a.weight || 1;
    let r = Math.random() * total;
    for (const a of list) { r -= a.weight || 1; if (r <= 0) return a; }
    return list[list.length - 1];
  }

  update(game) {
    const T = this.cfg;
    const p = game.player;
    if (this.flash > 0) this.flash--;
    if (this.hpShow > 0) this.hpShow--;
    if (this.cooldown > 0) this.cooldown--;
    if (this.armorBroken > 0) this.armorBroken--;
    if (this.shieldBroken > 0) this.shieldBroken--;
    if (this.postureFlash > 0) this.postureFlash--;
    this.stateFrame++;

    // 체간 회복: 한동안 안 맞으면 천천히 (체력이 적을수록 느리게)
    const PO = CONFIG.posture;
    // 휘청·경직·그로기·공중 상태에선 회복하지 않음 (빈틈을 공략할 시간)
    const neutral = this.isNeutral();
    if (this.postureDelay > 0) { if (neutral) this.postureDelay--; }
    else if (this.posture > 0 && neutral) {
      const hpK = 1 - PO.regenHpFactor * (1 - this.hp / this.maxHp);
      this.posture = Math.max(0, this.posture - PO.enemyRegen * hpK);
    }

    const dx = p.x - this.x;
    const dist = Math.abs(dx);
    const dirToPlayer = dx >= 0 ? 1 : -1;

    switch (this.state) {
      case 'idle':
        this.vx *= T.friction;
        if (this.hovering) this.hover(game, p, 0.4);
        if (dist < T.aggroRange && !p.dead) this.setState('chase');
        break;

      case 'chase':
        if (p.dead) { this.setState('idle'); break; }
        this.updateChase(game, p, dx, dist, dirToPlayer);
        break;

      case 'windup': {
        const A = this.atk;
        this.vx *= T.friction;
        if (this.hovering) { this.vx *= 0.9; this.vy *= 0.85; this.vy += Math.sin(this.stateFrame * 0.9) * 0.2; }
        // 돌진형/급강하는 예고 동안 계속 플레이어를 노려봄
        if (A.kind === 'rush' || A.kind === 'dive' || A.kind === 'shoot') this.facing = dirToPlayer;
        // 타격 직전 "슉"
        if ((A.kind === 'melee' || A.kind === 'dive') &&
            this.stateFrame === A.windup + 1 - Math.round(CONFIG.enemyTiming.whooshLeadMs * CONFIG.fps / 1000)) {
          Sound.play(A.id === 'smash' || A.id === 'sweep' ? 'whooshHeavy' : 'whoosh');
        }
        if (this.stateFrame >= A.windup) this.startAttack(game, p);
        break;
      }

      case 'attack':
        this.updateAttack(game, p);
        break;

      case 'recover':
        this.vx *= T.friction;
        if (this.hovering) { this.vy *= 0.9; this.vy -= 0.12; }
        if (this.stateFrame >= this.atk.recovery) {
          this.grounded = false;
          this.cooldown = this.atk.cooldown * (0.8 + Math.random() * 0.4);
          this.setState('chase');
        }
        break;

      case 'hurt':
        if (this.hovering) { this.vx *= 0.9; this.vy *= 0.88; }
        else this.vx *= this.onGround ? T.friction : 0.97;
        if (this.stateFrame >= this.hitstun && (this.onGround || this.hovering)) this.afterHurt();
        break;

      case 'deflected':
        // 퍼펙트 패링 당함: 뒤로 휘청
        this.vx *= 0.85;
        if (this.hovering) this.vy *= 0.9;
        if (this.stateFrame >= (this.deflectFrames || CONFIG.parry.deflectStagger)) this.afterHurt();
        break;

      case 'broken':
        // 체간 붕괴: 무릎 꿇고 비틀거림. 시간이 지나면 체간 일부를 남기고 회복
        this.vx *= 0.8;
        if (this.stateFrame >= PO.breakFrames) {
          this.posture = this.maxPosture * PO.resetRatio;
          this.cooldown = Math.max(this.cooldown, 30);
          this.setState('chase');
        }
        break;

      case 'stun':
        // 그로기: 제자리에서 휘청
        this.vx *= 0.85;
        if (this.hovering) this.vy *= 0.9;
        if (--this.stunTimer <= 0) { this.stunTimer = 0; this.setState('chase'); this.cooldown = Math.max(this.cooldown, 30); }
        break;

      case 'launched':
        this.vx *= 0.97;
        this.airTime++;
        if (this.onGround && this.stateFrame > 1) {
          if (this.slammed) {
            // 내려찍기로 꽂힘: 크게 튕긴 뒤 다운
            this.slammed = false;
            this.vy = -5;
            this.setState('launched');
            Effects.dust(this.x, this.y, 10, 0);
            Effects.addShake(5);
            Sound.play('bounce');
          } else {
            this.vy = CONFIG.air.landBounceVy;
            this.setState('down');
            Effects.dust(this.x, this.y, 6, 0);
            Sound.play('land');
          }
        }
        break;

      case 'down':
        this.vx *= this.onGround ? 0.8 : 0.97;
        if (this.stateFrame >= CONFIG.air.downFrames && this.onGround) {
          // 떠 있는 동안 체간이 가득 찼으면 일어나자마자 붕괴
          if (this.posture >= this.maxPosture) this.breakPosture(game);
          else this.setState('getup');
        }
        break;

      case 'getup':
        this.vx *= 0.8;
        if (this.stateFrame >= CONFIG.air.getupFrames) {
          this.airTime = 0;
          this.cooldown = Math.max(this.cooldown, 25);
          this.afterHurt();
        }
        break;

      case 'dead':
        this.vx *= 0.9;
        if (this.stateFrame > 24) this.remove = true;
        break;
    }

    // 다른 적과 겹치지 않게 살짝 밀어냄
    if (this.state !== 'dead') {
      for (const o of game.enemies) {
        if (o === this || o.dead) continue;
        const ox = this.x - o.x;
        if (Math.abs(ox) < (this.w + o.w) * 0.5 && Math.abs(this.y - o.y) < 30) {
          this.x += (ox >= 0 ? 1 : -1) * 0.6;
        }
      }
    }

    if (this.slammed) {
      this.vy = CONFIG.air.slamEnemySpeed;
    } else if (this.hovering && !(this.state === 'attack' && this.atk.kind === 'dive')) {
      // 부유: 중력 없음, 통과 발판 무시
      this.dropThrough = 2;
    } else if (!(this.state === 'attack' && this.atk.kind === 'dive')) {
      const g = this.gravOverride || CONFIG.physics.gravity * (this.state === 'launched' ? CONFIG.air.launchedGravityMult : 1);
      this.vy = Math.min(this.vy + g, CONFIG.physics.maxFall);
    }
    Dungeon.moveAndCollide(this);
    if (this.onGround) this.walkPhase += Math.abs(this.vx) * 0.11;
    // 낭떠러지로 떨어짐 → 처치 (넉백으로 밀어 떨어뜨리기)
    if (this.y > game.level.killY && !this.dead) {
      this.dead = true;
      this.remove = true;
      this.hp = 0;
      game.onEnemyKilled(this, 'pit');
    }
    else if (this.hovering) this.walkPhase += 0.25;   // 날갯짓
  }

  // 경직/기상 후: 체간이 가득이면 붕괴, 그로기가 남아 있으면 다시 그로기로
  afterHurt() {
    if (this.posture >= this.maxPosture) this.breakPosture(Game);
    else if (this.stunTimer > 0) this.setState('stun');
    else {
      this.cooldown = Math.max(this.cooldown, 20);
      this.setState('chase');
    }
  }

  // ---------- 이동 / 공격 선택 ----------
  updateChase(game, p, dx, dist, dir) {
    const T = this.cfg;
    const sameLevel = Math.abs(p.y - this.y) < 70;

    // 방향 전환: 방패병은 뒤로 넘어간 플레이어를 늦게 돌아봄
    if (T.shield) {
      if (dir !== this.facing) {
        if (++this.turnTimer >= T.turnDelay) { this.facing = dir; this.turnTimer = 0; }
      } else this.turnTimer = 0;
    } else {
      this.facing = dir;
    }

    let targetVX = 0;
    if (T.flying) {
      this.hover(game, p, 1);
    } else if (T.keepMin !== undefined) {
      // 원거리형: 거리 유지
      if (dist < T.keepMin) targetVX = -dir * T.speed;
      else if (dist > T.keepMax) targetVX = dir * T.speed;
    } else {
      const reach = Math.min(...T.attacks.map((a) => a.range));
      if (dist > reach * 0.9 || !sameLevel) targetVX = dir * T.speed;
      if (T.shield && dir !== this.facing) targetVX = 0;   // 뒤돌아보는 중엔 멈칫
    }
    // 낭떠러지 앞에서는 멈춤 (걸어서 떨어지지 않게)
    if (!T.flying && targetVX !== 0 && this.onGround &&
        !Dungeon.hasGround(this.x + Math.sign(targetVX) * (this.w / 2 + 8), this.y)) targetVX = 0;
    if (!T.flying) {
      this.vx += Math.sign(targetVX - this.vx) * Math.min(Math.abs(targetVX - this.vx), T.accel);
      // 낭떠러지/벽 앞에서 막히지 않게 단순 처리: 벽에 닿으면 멈춤
      if (this.hitWall) this.vx = 0;
    }

    // 공격 시작
    if (this.cooldown <= 0 && !p.dead) {
      const canSee = T.flying || sameLevel || this.cfg.attacks[0].kind === 'shoot';
      const a = canSee ? this.pickAttack(dist) : null;
      if (a && (!T.shield || dir === this.facing)) {
        this.atk = a;
        this.lastRed = !a.parryable;
        this.facing = dir;
        this.setState('windup');
        Sound.play(a.telegraph === 'white' ? 'telegraphWhite' : a.parryable ? 'telegraphYellow' : 'telegraph');
      }
    }
  }

  // 비행형: 플레이어 옆 위쪽에 떠 있기 (위아래로 둥실)
  hover(game, p, k) {
    const T = this.cfg;
    const side = this.x >= p.x ? 1 : -1;
    const tx = p.x + side * T.hoverSide;
    const ty = game.level.groundY - T.hoverHeight + Math.sin((game.frame + this.seed) * 0.05) * 12;
    const ax = Math.max(-1, Math.min(1, (tx - this.x) / 80)) * T.accel * k;
    const ay = Math.max(-1, Math.min(1, (ty - this.y) / 60)) * T.accel * k;
    this.vx = (this.vx + ax) * 0.95;
    this.vy = (this.vy + ay) * 0.92;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > T.speed) { this.vx *= T.speed / sp; this.vy *= T.speed / sp; }
  }

  startAttack(game, p) {
    const A = this.atk;
    this.hitPlayer = false;
    this.setState('attack');
    if (A.kind === 'melee') {
      this.vx = this.facing * A.lunge;
    } else if (A.kind === 'dive') {
      // 플레이어가 있던 곳으로 급강하
      const tx = p.x - this.x, ty = (p.y - p.h * 0.5) - (this.y - this.h * 0.5);
      const L = Math.hypot(tx, ty) || 1;
      this.diveVX = tx / L * A.diveSpeed;
      this.diveVY = Math.max(2, ty / L * A.diveSpeed);
      this.facing = tx >= 0 ? 1 : -1;
      Sound.play('dash');
    } else if (A.kind === 'rush') {
      Sound.play('rush');
      Effects.dust(this.x, this.y, 10, this.facing);
    } else if (A.kind === 'shoot') {
      const sx = this.x + this.facing * 18, sy = this.y - this.h * 0.62;
      const tx = p.x - sx, ty = (p.y - p.h * 0.55) - sy;
      const L = Math.hypot(tx, ty) || 1;
      const P = A.projectile;
      game.projectiles.push(new Projectile(sx, sy, tx / L * P.speed, ty / L * P.speed, A, this));
      Sound.play('shoot');
    }
  }

  updateAttack(game, p) {
    const A = this.atk, T = this.cfg;
    const f = this.stateFrame;
    switch (A.kind) {
      case 'melee':
        this.vx *= 0.88;
        Combat.enemyAttack(game, this, A.hitbox, A);
        if (f >= A.active) this.setState('recover');
        break;

      case 'shoot':
        this.vx *= T.friction;
        if (f >= A.active) this.setState('recover');
        break;

      case 'rush':
        this.vx = this.facing * A.rushSpeed;
        if (f % 3 === 0) Effects.dust(this.x, this.y, 2, this.facing);
        Combat.enemyAttack(game, this, A.hitbox, A);
        if (this.hitWall) {
          // 벽에 박음 → 기절
          this.vx = -this.facing * 4;
          this.vy = -3;
          this.stunTimer = A.wallStun;
          this.setState('stun');
          if (A.wallPosture) this.addPosture(this.maxPosture * A.wallPosture, game);
          Effects.addShake(9);
          Effects.sparks(this.x + this.facing * this.w / 2, this.y - this.h * 0.6, -this.facing, 14, '#fff3c0');
          Effects.popText(this.x, this.y - this.h - 20, '기절!', '#ffe070', 18);
          Sound.play('wallHit');
        } else if (f >= A.active) {
          this.setState('recover');
        }
        break;

      case 'dive':
        this.vx = this.diveVX;
        this.vy = this.diveVY;
        if (f % 2 === 0) Effects.afterimage(Anim.snapshot(Anim.enemyFigure(this)), 'rgba(255,60,60,1)');
        Combat.enemyAttack(game, this, A.hitbox, A);
        if (this.onGround) {
          // 땅에 처박힘: 잠시 무방비
          this.grounded = true;
          this.vx = 0; this.vy = 0;
          Effects.dust(this.x, this.y, 8, 0);
          this.setState('recover');
        } else if (f >= A.active) {
          this.setState('recover');
        }
        break;
    }
  }

  // ---------- 피격 ----------
  // 칼끼리 부딪힘: 공격이 끊기고 뒤로 밀려남 (데미지 없음)
  clashed(dir) {
    const C = CONFIG.feel;
    this.hitPlayer = true;
    this.vx = dir * C.clashKnock / this.cfg.weight;
    this.hitstun = C.clashStun;
    this.setState('hurt');
  }

  // 퍼펙트 패링 당함: 휘청 (중갑병은 슈퍼아머 해제). 체간은 combat 에서 더함
  parried(dir) {
    const PR = CONFIG.parry;
    this.hitPlayer = true;
    this.vx = dir * PR.deflectPush / this.cfg.weight;
    if (this.cfg.superArmor && this.armorBroken <= 0) {
      this.armorBroken = PR.armorBreakFrames;
      Effects.popText(this.x, this.y - this.h - 26, 'ARMOR BREAK', '#ffe070', 18);
      Effects.shards(this.x, this.y - this.h * 0.7, dir, 12, '#8d97a3');
    }
    if (this.state !== 'launched' && this.state !== 'down' && this.state !== 'broken') this.setState('deflected');
  }

  // 체간 증가. 가득 차면 붕괴 (공중/다운 중이면 착지 후)
  addPosture(n, game) {
    if (this.dead || this.state === 'broken' || n <= 0) return;
    this.posture = Math.min(this.maxPosture, this.posture + n);
    this.postureDelay = CONFIG.posture.enemyRegenDelay;
    this.postureFlash = 6;
    if (this.posture >= this.maxPosture &&
        this.state !== 'launched' && this.state !== 'down' && this.state !== 'getup') {
      this.breakPosture(game);
    }
  }

  // 체간 붕괴: 무릎 꿇고 비틀거림 → 처형 가능
  breakPosture(game) {
    this.posture = this.maxPosture;
    this.slammed = false;
    this.stunTimer = 0;
    this.hitPlayer = true;
    this.vx = 0;
    if (this.cfg.superArmor) this.armorBroken = Math.max(this.armorBroken, CONFIG.posture.breakFrames + 30);
    this.setState('broken');
    Effects.popText(this.x, this.y - this.h - 30, '체간 붕괴', '#ff5040', 20);
    Effects.sparks(this.x, this.y - this.h * 0.7, 1, 12, '#ff6040');
    Effects.sparks(this.x, this.y - this.h * 0.7, -1, 12, '#ff6040');
    Effects.addShake(8);
    Sound.play('postureBreak');
    if (game) {
      game.slowmo(CONFIG.posture.breakSlowmoMs);
      game.onPostureBreak(this);
    }
  }

  // 정면에서 맞았는가 (방패 판정용). attackerX: 공격 위치
  hitFromFront(attackerX) {
    return (attackerX - this.x) * this.facing > 0;
  }

  // info: { dir, knockX, knockY, hitstun, launch, slam, attackerX }
  // 반환: 'blocked'(방패로 막음) | 'armor'(슈퍼아머로 버팀) | 'hit' | 'kill'
  takeHit(dmg, info) {
    const T = this.cfg, A = CONFIG.air;

    // 방패: 정면 공격은 막는다 (런처·내려찍기는 방패를 무시)
    if (this.guarding && !info.launch && !info.slam && !info.shieldBreak && !info.pierceShield && this.hitFromFront(info.attackerX)) {
      this.flash = 3;
      this.vx = info.dir * 1.5 / T.weight;
      return 'blocked';
    }

    this.hp -= dmg;
    this.flash = CONFIG.feel.flashFrames;
    this.hpShow = 180;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.slammed = false;
      this.vx = info.dir * Math.max(6, info.knockX);
      this.vy = -5;
      this.setState('dead');
      return 'kill';
    }

    // 체간 붕괴 중: 데미지만 받고 그대로 무릎 꿇고 있음 (처형 기회 유지)
    if (this.state === 'broken' || (this.state === 'groggy' && !info.launch && !info.slam)) {
      this.vx += info.dir * 0.4;
      return 'hit';
    }

    // 슈퍼아머: 데미지만 받고 행동은 계속
    if (this.armored && !info.slam) {
      this.vx += info.dir * 0.6;
      return 'armor';
    }

    // 맞은 쪽으로 돌아봄 (방패병은 turnDelay 에 따라 천천히)
    if (!T.shield) this.facing = -info.dir;
    const mult = this.juggleMult();
    const inAir = this.state === 'launched' || (!this.onGround && !this.hovering);

    if (info.slam) {
      // 내려찍기: 같이 바닥으로 꽂힘
      this.slammed = true;
      this.vx = 0;
      this.setState('launched');
    } else if (info.launch) {
      // 런처 / 충격파: 띄움
      this.slammed = false;
      this.vx = info.dir * info.knockX / T.weight;
      this.vy = info.knockY * mult / T.weight;
      this.onGround = false;
      this.setState('launched');
    } else if (this.hovering) {
      // 비행형: 맞으면 공중에서 휘청 (떨어지지 않음)
      this.vx = info.dir * info.knockX * 0.6 / T.weight;
      this.vy = Math.min(0, info.knockY) * 0.4 * mult;
      this.hitstun = info.hitstun;
      this.setState('hurt');
    } else if (inAir) {
      // 공중 저글링: 맞을 때마다 살짝 띄워서 공중에 머무르게
      const lift = info.knockY < 0 ? info.knockY : -A.defaultLift;
      this.vx = info.dir * info.knockX / T.weight;
      this.vy = info.knockY > 0 ? info.knockY : lift * mult / T.weight;
      if (this.state !== 'launched') this.setState('launched');
    } else if (this.state === 'down' || this.state === 'getup') {
      // 다운 중 추가타: 밀리기만 하고 다운 시간은 늘리지 않음
      this.vx = info.dir * info.knockX * 0.4 / T.weight;
    } else {
      this.vx = info.dir * info.knockX / T.weight;
      if (info.knockY !== 0) this.vy = info.knockY / T.weight;
      // 경직: 예고/공격 중이어도 끊긴다
      this.hitstun = info.hitstun;
      this.setState('hurt');
    }
    return 'hit';
  }
}

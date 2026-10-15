'use strict';
// 적. 1단계: 근접 잡몹 (0.5초 빨강 예고 후 베기)
// 상태: idle | chase | windup | attack | recover | hurt | launched | down | getup | dead
//  launched: 공중에 떠 있음 (공격 불가) → 바닥에 닿으면 down → getup → chase

class Enemy {
  constructor(type, x, y) {
    const T = CONFIG.enemies[type];
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
    this.flash = 0;
    this.hitPlayer = false;
    this.dead = false;
    this.remove = false;
    this.hpShow = 0;          // 맞은 뒤 체력바 표시 시간
    this.spawnFrame = 0;
    this.airTime = 0;         // 띄워진 뒤 누적 체공 시간 (저글링 감쇠용, 기상하면 리셋)
    this.slammed = false;     // 내려찍기로 바닥에 꽂히는 중
    this.hitstun = 0;
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

  // 예고 중인가? (렌더러가 빨강 번쩍에 사용)
  get telegraphing() {
    return this.state === 'windup';
  }

  update(game) {
    const T = this.cfg;
    const p = game.player;
    if (this.flash > 0) this.flash--;
    if (this.hpShow > 0) this.hpShow--;
    if (this.cooldown > 0) this.cooldown--;
    this.spawnFrame++;
    this.stateFrame++;

    const dx = p.x - this.x;
    const dist = Math.abs(dx);

    switch (this.state) {
      case 'idle':
        this.vx *= T.friction;
        if (dist < T.aggroRange && !p.dead) this.setState('chase');
        break;

      case 'chase': {
        if (p.dead) { this.setState('idle'); break; }
        this.facing = dx >= 0 ? 1 : -1;
        const sameLevel = Math.abs(p.y - this.y) < 70;
        if (dist > T.attackRange || !sameLevel) {
          const target = this.facing * T.speed;
          this.vx += Math.sign(target - this.vx) * Math.min(Math.abs(target - this.vx), T.accel);
        } else {
          this.vx *= T.friction;
          if (this.cooldown <= 0) {
            this.setState('windup');
            Sound.play('telegraph');
          }
        }
        break;
      }

      case 'windup':
        this.vx *= T.friction;
        if (this.stateFrame >= T.windup) {
          this.hitPlayer = false;
          this.vx = this.facing * T.attackLunge;
          this.setState('attack');
        }
        break;

      case 'attack':
        this.vx *= 0.88;
        Combat.enemyAttack(game, this, T.hitbox, T);
        if (this.stateFrame >= T.active) this.setState('recover');
        break;

      case 'recover':
        this.vx *= T.friction;
        if (this.stateFrame >= T.recovery) {
          this.cooldown = T.cooldown * (0.8 + Math.random() * 0.4);
          this.setState('chase');
        }
        break;

      case 'hurt':
        this.vx *= this.onGround ? T.friction : 0.97;
        if (this.stateFrame >= this.hitstun && this.onGround) {
          this.cooldown = Math.max(this.cooldown, 20);
          this.setState('chase');
        }
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
        if (this.stateFrame >= CONFIG.air.downFrames && this.onGround) this.setState('getup');
        break;

      case 'getup':
        this.vx *= 0.8;
        if (this.stateFrame >= CONFIG.air.getupFrames) {
          this.airTime = 0;
          this.cooldown = Math.max(this.cooldown, 25);
          this.setState('chase');
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
    } else {
      const g = CONFIG.physics.gravity * (this.state === 'launched' ? CONFIG.air.launchedGravityMult : 1);
      this.vy = Math.min(this.vy + g, CONFIG.physics.maxFall);
    }
    Dungeon.moveAndCollide(this);
  }

  // info: { dir, knockX, knockY, hitstun, launch, slam }
  takeHit(dmg, info) {
    const T = this.cfg, A = CONFIG.air;
    this.hp -= dmg;
    this.flash = CONFIG.feel.flashFrames;
    this.hpShow = 180;
    this.facing = -info.dir;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.slammed = false;
      this.vx = info.dir * Math.max(6, info.knockX);
      this.vy = -5;
      this.setState('dead');
      return;
    }
    const mult = this.juggleMult();
    const inAir = this.state === 'launched' || !this.onGround;

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
  }
}

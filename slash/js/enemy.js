'use strict';
// 적. 1단계: 근접 잡몹 (0.5초 빨강 예고 후 베기)
// 상태: idle | chase | windup | attack | recover | hurt | dead

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

    this.vy = Math.min(this.vy + CONFIG.physics.gravity, CONFIG.physics.maxFall);
    Dungeon.moveAndCollide(this);
  }

  takeHit(dmg, info) {
    const T = this.cfg;
    this.hp -= dmg;
    this.flash = CONFIG.feel.flashFrames;
    this.hpShow = 180;
    this.vx = info.dir * info.knockX / T.weight;
    if (info.knockY !== 0) this.vy = info.knockY / T.weight;
    this.facing = -info.dir;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.vx = info.dir * Math.max(6, info.knockX);
      this.vy = -5;
      this.setState('dead');
      return;
    }
    // 경직: 예고/공격 중이어도 끊긴다
    this.hitstun = info.hitstun;
    this.setState('hurt');
  }
}

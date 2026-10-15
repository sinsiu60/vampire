'use strict';
// 투사체. 적이 쏜 것은 플레이어를 노리고, 베거나 패링하면 반사되어 적을 맞힌다.

class Projectile {
  // atk: 쏜 공격 데이터 (config 의 attacks 항목), shooter: 쏜 적
  constructor(x, y, vx, vy, atk, shooter) {
    const P = atk.projectile;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r = P.radius;
    this.life = P.life;
    this.atk = atk;
    this.shooter = shooter;
    this.owner = 'enemy';        // enemy | player (반사됨)
    this.damage = atk.damage;
    this.parryable = atk.parryable;
    this.dead = false;
    this.trail = [];
  }

  box(out) {
    out = out || {};
    out.x = this.x - this.r; out.y = this.y - this.r;
    out.w = this.r * 2; out.h = this.r * 2;
    return out;
  }

  // 반사: 쏜 적(살아 있으면)에게 되돌아감, 아니면 dir 방향으로 직진
  reflect(dir) {
    const P = this.atk.projectile;
    const sp = Math.hypot(this.vx, this.vy) * P.reflectMult;
    const s = this.shooter;
    if (s && !s.dead) {
      const tx = s.x - this.x, ty = (s.y - s.h * 0.55) - this.y;
      const L = Math.hypot(tx, ty) || 1;
      this.vx = tx / L * sp; this.vy = ty / L * sp;
    } else {
      this.vx = dir * sp; this.vy = 0;
    }
    this.owner = 'player';
    this.damage = P.reflectDamage;
    this.life = P.life;
    Effects.sparks(this.x, this.y, Math.sign(this.vx) || dir, 10, '#bff');
    Effects.flashRing(this.x, this.y);
    Sound.play('reflect');
  }

  update(game) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 8) this.trail.shift();
    this.x += this.vx;
    this.y += this.vy;
    if (--this.life <= 0) { this.dead = true; return; }

    // 벽/바닥에 닿으면 사라짐
    for (const r of game.level.rects) {
      if (r.oneWay) continue;
      if (this.x > r.x && this.x < r.x + r.w && this.y > r.y && this.y < r.y + r.h) {
        this.dead = true;
        Effects.sparks(this.x, this.y, -Math.sign(this.vx), 5, '#ffd870');
        return;
      }
    }

    const b = this.box(Combat._pb);
    if (this.owner === 'enemy') {
      const p = game.player;
      if (p.dead || !Combat.overlap(b, Combat.bodyBox(p, Combat._bb))) return;
      // 퍼펙트 패링: 반사 / 가드: 막고 사라짐 / 대시: 통과
      if (p.isParrying() && this.parryable) {
        this.reflect(p.facing);
        Combat.perfectParry(game, p, null, this.x, this.y, false);
        return;
      }
      if (p.isInvulnerable()) return;
      const shooterX = this.x - this.vx * 10;   // 날아온 쪽
      const res = Combat.resolveIncoming(game, p, this.damage, Math.sign(this.vx) || 1, { x: 4, y: -3 }, this.atk, null, shooterX);
      if (res !== 'dodge') this.dead = true;
    } else {
      for (const e of game.enemies) {
        if (e.dead || !Combat.overlap(b, Combat.bodyBox(e, Combat._bb))) continue;
        this.dead = true;
        const dir = Math.sign(this.vx) || 1;
        Combat.applyHit(game, e, this.damage, false, {
          dir, knockX: 5, knockY: -3, hitstun: 34, attackerX: this.x - dir * 20,
        }, { hitstop: 7, shake: 5, heavy: true, x: this.x, y: this.y });
        e.addPosture(this.damage * CONFIG.posture.hitMult, game);
        return;
      }
    }
  }

  draw(ctx) {
    const reflected = this.owner === 'player';
    const core = reflected ? '#e8ffff' : '#fff2b0';
    const glow = reflected ? '#3ff' : '#ffc830';   // 노랑 = 패링/반사 가능
    ctx.save();
    // 꼬리
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i], k = (i + 1) / this.trail.length;
      ctx.globalAlpha = k * 0.4;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.r * k * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 14;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

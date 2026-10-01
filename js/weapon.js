'use strict';
// 무기 4종 + 투사체 풀

class Weapon {
  constructor(key) {
    this.key = key;
    this.def = CONFIG.weapons[key];
    this.level = 1;
    this.timer = 0.3;
  }
  get stats() { return this.def.levels[this.level - 1]; }
  get maxLevel() { return this.def.levels.length; }
  update(dt, p) {}
  drawUnder(ctx, p) {} // 적보다 아래에 그림
  draw(ctx, p) {}      // 적보다 위에 그림
}

// ---------------------------------------------------------------------
// 1. 마법탄: 가장 가까운 적에게 자동 발사
// ---------------------------------------------------------------------
class MagicBolt extends Weapon {
  update(dt, p) {
    this.timer -= dt;
    if (this.timer > 0) return;
    const s = this.stats;
    const target = Enemies.nearest(p.x, p.y, 650);
    if (!target) { this.timer = 0.1; return; }
    this.timer = s.cooldown * p.cdMult;
    const base = Math.atan2(target.y - p.y, target.x - p.x);
    const spread = 0.16;
    for (let i = 0; i < s.count; i++) {
      const a = base + (i - (s.count - 1) / 2) * spread;
      Projectiles.fire(p.x, p.y, Math.cos(a) * s.speed, Math.sin(a) * s.speed,
        s.damage * p.might, s.pierce, 6, 1.6, this.def.color);
    }
  }
}

// ---------------------------------------------------------------------
// 2. 회전 칼날: 플레이어 주위를 공전
// ---------------------------------------------------------------------
class OrbitBlade extends Weapon {
  constructor(key) {
    super(key);
    this.angle = 0;
    this._q = [];
  }
  update(dt, p) {
    const s = this.stats;
    this.angle = (this.angle + s.rotSpeed * dt) % U.TAU;
    const dmg = s.damage * p.might;
    const cd = s.hitInterval * p.cdMult;
    for (let i = 0; i < s.count; i++) {
      const a = this.angle + (i / s.count) * U.TAU;
      const bx = p.x + Math.cos(a) * s.radius, by = p.y + Math.sin(a) * s.radius;
      const q = Enemies.grid.query(bx, by, s.size, this._q);
      for (let j = 0; j < q.length; j++) {
        const e = q[j];
        if (e.bladeCd > 0) continue;
        e.bladeCd = cd;
        Enemies.damage(e, dmg, p.x, p.y, 0.9);
      }
    }
  }
  draw(ctx, p) {
    const s = this.stats;
    ctx.strokeStyle = 'rgba(224,230,240,0.08)';
    ctx.lineWidth = s.size * 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, s.radius, 0, U.TAU);
    ctx.stroke();

    for (let i = 0; i < s.count; i++) {
      const a = this.angle + (i / s.count) * U.TAU;
      const bx = p.x + Math.cos(a) * s.radius, by = p.y + Math.sin(a) * s.radius;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(a + Math.PI / 2 + this.angle * 3);
      const L = s.size * 1.5, W = s.size * 0.55;
      ctx.fillStyle = this.def.color;
      ctx.strokeStyle = '#5c6b80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -L);
      ctx.lineTo(W, 0);
      ctx.lineTo(0, L);
      ctx.lineTo(-W, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------
// 3. 번개: 화면 안 랜덤한 적에게 낙뢰 (범위 피해)
// ---------------------------------------------------------------------
class Lightning extends Weapon {
  constructor(key) {
    super(key);
    this._cands = [];
    this._q = [];
  }
  update(dt, p) {
    this.timer -= dt;
    if (this.timer > 0) return;
    const s = this.stats;
    const view = Game.view;
    const cands = this._cands;
    cands.length = 0;
    const a = Enemies.list;
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (e.alive && e.x > view.left && e.x < view.right && e.y > view.top && e.y < view.bottom) cands.push(e);
    }
    if (cands.length === 0) { this.timer = 0.2; return; }
    this.timer = s.cooldown * p.cdMult;
    const dmg = s.damage * p.might;
    for (let k = 0; k < s.strikes && cands.length > 0; k++) {
      const idx = Math.floor(Math.random() * cands.length);
      const t = cands[idx];
      cands[idx] = cands[cands.length - 1];
      cands.pop();
      const x = t.x, y = t.y;
      Effects.lightning(x, y, s.radius);
      Effects.particle(x, y, '#fff59d', 10, 220, 0.35, 3);
      const q = Enemies.grid.query(x, y, s.radius, this._q);
      for (let j = 0; j < q.length; j++) Enemies.damage(q[j], dmg, x, y, 1.2);
    }
    Effects.shake(CONFIG.effects.shakeOnLightning);
  }
}

// ---------------------------------------------------------------------
// 4. 오라: 플레이어 주변 지속 피해 (+ 둔화)
// ---------------------------------------------------------------------
class Aura extends Weapon {
  constructor(key) {
    super(key);
    this.pulse = 0;
    this.t = 0;
    this._q = [];
  }
  update(dt, p) {
    this.t += dt;
    if (this.pulse > 0) this.pulse -= dt * 4;
    this.timer -= dt;
    if (this.timer > 0) return;
    const s = this.stats;
    this.timer = s.tick * p.cdMult;
    this.pulse = 1;
    const dmg = s.damage * p.might;
    const q = Enemies.grid.query(p.x, p.y, s.radius, this._q);
    for (let j = 0; j < q.length; j++) {
      const e = q[j];
      Enemies.damage(e, dmg, p.x, p.y, 0.25);
      if (s.slow > 0) {
        e.slowTimer = s.tick + 0.15;
        e.slowAmt = e.isBoss ? s.slow * 0.5 : s.slow;
      }
    }
  }
  drawUnder(ctx, p) {
    const s = this.stats;
    const r = s.radius * (1 + Math.max(0, this.pulse) * 0.04) + Math.sin(this.t * 3) * 2;
    ctx.globalAlpha = 0.16 + Math.max(0, this.pulse) * 0.12;
    ctx.fillStyle = this.def.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, U.TAU);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = this.def.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -this.t * 30;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

const WEAPON_CLASSES = {
  magicBolt: MagicBolt,
  orbitBlade: OrbitBlade,
  lightning: Lightning,
  aura: Aura,
};

function createWeapon(key) {
  return new WEAPON_CLASSES[key](key);
}

// ---------------------------------------------------------------------
// 투사체 (오브젝트 풀)
// ---------------------------------------------------------------------
const Projectiles = {
  init() {
    this.pool = new Pool(() => ({
      x: 0, y: 0, vx: 0, vy: 0, damage: 0, pierce: 1, radius: 5, life: 0, color: '#fff', hit: [],
    }), 100);
    this._q = [];
  },

  reset() { this.pool.clear(); },

  fire(x, y, vx, vy, damage, pierce, radius, life, color) {
    const b = this.pool.get();
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    b.damage = damage;
    b.pierce = pierce;
    b.radius = radius;
    b.life = life;
    b.color = color;
    b.hit.length = 0;
  },

  update(dt) {
    const a = this.pool.active;
    for (let i = a.length - 1; i >= 0; i--) {
      const b = a[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life > 0) {
        const q = Enemies.grid.query(b.x, b.y, b.radius, this._q);
        for (let j = 0; j < q.length && b.pierce > 0; j++) {
          const e = q[j];
          if (b.hit.indexOf(e.id) !== -1) continue;
          b.hit.push(e.id);
          Enemies.damage(e, b.damage, b.x - b.vx, b.y - b.vy, 1);
          Effects.particle(b.x, b.y, b.color, 3, 120, 0.25, 2);
          b.pierce--;
        }
      }
      if (b.life <= 0 || b.pierce <= 0) this.pool.releaseAt(i);
    }
  },

  draw(ctx) {
    const a = this.pool.active;
    if (a.length === 0) return;
    // 꼬리
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(110,200,255,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (const b of a) {
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
    // 바깥 빛
    ctx.fillStyle = 'rgba(110,200,255,0.35)';
    ctx.beginPath();
    for (const b of a) {
      ctx.moveTo(b.x + b.radius * 1.8, b.y);
      ctx.arc(b.x, b.y, b.radius * 1.8, 0, U.TAU);
    }
    ctx.fill();
    // 코어
    ctx.fillStyle = '#e8f7ff';
    ctx.beginPath();
    for (const b of a) {
      ctx.moveTo(b.x + b.radius, b.y);
      ctx.arc(b.x, b.y, b.radius, 0, U.TAU);
    }
    ctx.fill();
  },
};

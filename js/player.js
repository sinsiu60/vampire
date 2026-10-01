'use strict';
// 플레이어: 이동, 능력치, 경험치/레벨, 피격 처리

class Player {
  constructor() {
    this._axis = { x: 0, y: 0 };
    this.reset();
  }

  reset() {
    const c = CONFIG.player;
    this.x = 0;
    this.y = 0;
    this.radius = c.radius;
    this.level = 1;
    this.exp = 0;
    this.expToNext = Player.expFor(1);
    this.pendingLevelUps = 0;
    this.passives = {};
    for (const k in CONFIG.passives) this.passives[k] = 0;
    this.weapons = [];
    this.invuln = 0;
    this.facingX = 1;
    this.facingY = 0;
    this.moving = false;
    this.walkT = 0;
    this.dead = false;
    this.maxHp = undefined;
    this.hp = undefined;
    this.recalc();
    this.hp = this.maxHp;
    this.addWeapon(c.startWeapon);
  }

  static expFor(level) {
    const e = CONFIG.exp;
    const n = level - 1;
    return Math.floor(e.base + e.linear * n + e.quad * n * n);
  }

  // 패시브 레벨로부터 최종 능력치 계산
  recalc() {
    const P = CONFIG.passives, c = CONFIG.player, l = this.passives;
    const oldMax = this.maxHp;
    this.speed = c.speed * (1 + P.speed.perLevel * l.speed);
    this.maxHp = c.maxHp + P.maxHp.perLevel * l.maxHp;
    if (oldMax !== undefined && this.maxHp > oldMax) this.hp += this.maxHp - oldMax;
    this.might = 1 + P.might.perLevel * l.might;
    this.cdMult = Math.max(CONFIG.minCooldownMult, 1 - P.cooldown.perLevel * l.cooldown);
    this.magnetRadius = c.magnetRadius * (1 + P.magnet.perLevel * l.magnet);
    this.pickupRadius = c.pickupRadius;
    this.regen = c.regen + P.regen.perLevel * l.regen;
  }

  getWeapon(key) {
    for (const w of this.weapons) if (w.key === key) return w;
    return null;
  }

  addWeapon(key) {
    const w = createWeapon(key);
    this.weapons.push(w);
    return w;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  addExp(v) {
    this.exp += v;
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      this.level++;
      this.expToNext = Player.expFor(this.level);
      this.pendingLevelUps++;
      Effects.ring(this.x, this.y, 10, 120, '#ffe680', 0.6, 4);
      Effects.particle(this.x, this.y, '#ffe680', 24, 260, 0.7, 4);
    }
  }

  takeDamage(amount) {
    if (this.invuln > 0 || this.dead) return;
    amount = Math.round(amount);
    this.hp -= amount;
    this.invuln = CONFIG.player.invulnTime;
    Effects.shake(CONFIG.effects.shakeOnHurt);
    Effects.hurtFlash = 1;
    Effects.particle(this.x, this.y, '#ff5252', 12, 200, 0.45, 3);
    Effects.damageText(this.x, this.y - this.radius - 6, amount, '#ff5252', true);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      Effects.particle(this.x, this.y, CONFIG.player.color, 50, 340, 1.2, 5);
      Effects.ring(this.x, this.y, 10, 200, '#ffffff', 0.8, 5);
    }
  }

  update(dt) {
    const a = Input.axis(this._axis);
    this.moving = a.x !== 0 || a.y !== 0;
    if (this.moving) {
      this.x += a.x * this.speed * dt;
      this.y += a.y * this.speed * dt;
      this.facingX = a.x;
      this.facingY = a.y;
      this.walkT += dt * 12;
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.regen > 0 && this.hp < this.maxHp) this.heal(this.regen * dt);
  }

  draw(ctx) {
    // 무적 중 깜빡임
    if (this.invuln > 0 && Math.floor(this.invuln * 16) % 2 === 0) return;
    const r = this.radius;
    const bob = this.moving ? Math.sin(this.walkT) * 1.5 : 0;
    const x = this.x, y = this.y + bob;

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + r * 0.9, r * 0.9, r * 0.35, 0, 0, U.TAU);
    ctx.fill();

    // 몸통
    ctx.fillStyle = CONFIG.player.color;
    ctx.strokeStyle = '#0d3b52';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, U.TAU);
    ctx.fill();
    ctx.stroke();

    // 바라보는 방향 표시 (눈)
    const fx = this.facingX, fy = this.facingY;
    const px = -fy, py = fx;
    ctx.fillStyle = '#ffffff';
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.arc(x + fx * r * 0.45 + px * r * 0.35 * s, y + fy * r * 0.45 + py * r * 0.35 * s, 3.2, 0, U.TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#10202a';
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.arc(x + fx * r * 0.6 + px * r * 0.35 * s, y + fy * r * 0.6 + py * r * 0.35 * s, 1.6, 0, U.TAU);
      ctx.fill();
    }
  }

  // 플레이어 발밑 체력바
  drawHpBar(ctx) {
    const w = 40, h = 5;
    const x = this.x - w / 2, y = this.y + this.radius + 9;
    const k = U.clamp(this.hp / this.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = k > 0.5 ? '#4caf50' : k > 0.25 ? '#ffb300' : '#f44336';
    ctx.fillRect(x, y, w * k, h);
  }
}

'use strict';
// 경험치 보석(자석 흡수) & 보스 상자

const Pickups = {
  init() {
    this.gems = new Pool(() => ({ x: 0, y: 0, value: 1, color: '#fff', size: 4, attract: false, speed: 0 }), 300);
    this.chests = [];
    this.t = 0;
  },

  reset() {
    this.gems.clear();
    this.chests.length = 0;
  },

  _applyTier(g) {
    const tiers = CONFIG.gem.tiers;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (g.value >= tiers[i].min) {
        g.color = tiers[i].color;
        g.size = tiers[i].size;
        return;
      }
    }
  },

  gem(x, y, value) {
    // 보석이 너무 많으면 기존 보석에 경험치를 합침 (성능)
    if (this.gems.count >= CONFIG.gem.maxCount) {
      const a = this.gems.active;
      const g = a[Math.floor(Math.random() * a.length)];
      g.value += value;
      this._applyTier(g);
      return;
    }
    const g = this.gems.get();
    g.x = x + U.rand(-4, 4);
    g.y = y + U.rand(-4, 4);
    g.value = value;
    g.attract = false;
    g.speed = 0;
    this._applyTier(g);
  },

  chest(x, y) {
    this.chests.push({ x, y, t: 0 });
  },

  update(dt, p) {
    this.t += dt;
    const G = CONFIG.gem;
    const mR2 = p.magnetRadius * p.magnetRadius;
    const pickR = p.radius + p.pickupRadius;
    const a = this.gems.active;
    for (let i = a.length - 1; i >= 0; i--) {
      const g = a[i];
      let dx = p.x - g.x, dy = p.y - g.y;
      const d2 = dx * dx + dy * dy;
      if (!g.attract && d2 < mR2) g.attract = true;
      if (!g.attract) continue;
      const d = Math.sqrt(d2) || 1;
      if (d < pickR) {
        p.addExp(g.value);
        Effects.particle(g.x, g.y, g.color, 4, 90, 0.3, 2);
        this.gems.releaseAt(i);
        continue;
      }
      g.speed = Math.min(G.maxSpeed, g.speed + G.magnetAccel * dt);
      const step = Math.min(d, g.speed * dt);
      g.x += (dx / d) * step;
      g.y += (dy / d) * step;
    }

    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      c.t += dt;
      const dx = p.x - c.x, dy = p.y - c.y;
      if (dx * dx + dy * dy < (p.radius + 18) * (p.radius + 18)) {
        this.chests.splice(i, 1);
        const msg = Upgrades.openChest(p);
        Effects.ring(c.x, c.y, 10, 160, '#ffd54f', 0.7, 5);
        Effects.particle(c.x, c.y, '#ffd54f', 40, 300, 0.9, 4);
        UI.notify(msg, '#ffd54f', 3);
      }
    }
  },

  draw(ctx, view) {
    const a = this.gems.active;
    const tiers = CONFIG.gem.tiers;
    // 색상별로 묶어서 그리기
    for (let k = 0; k < tiers.length; k++) {
      const color = tiers[k].color;
      ctx.fillStyle = color;
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < a.length; i++) {
        const g = a[i];
        if (g.color !== color) continue;
        if (g.x < view.left || g.x > view.right || g.y < view.top || g.y > view.bottom) continue;
        const s = g.size;
        ctx.moveTo(g.x, g.y - s * 1.3);
        ctx.lineTo(g.x + s, g.y);
        ctx.lineTo(g.x, g.y + s * 1.3);
        ctx.lineTo(g.x - s, g.y);
        ctx.closePath();
        any = true;
      }
      if (any) {
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    for (const c of this.chests) {
      const bob = Math.sin(c.t * 4) * 3;
      const x = c.x, y = c.y + bob;
      // 빛
      ctx.globalAlpha = 0.25 + Math.sin(c.t * 6) * 0.1;
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, U.TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      // 상자
      ctx.fillStyle = '#8d5524';
      ctx.fillRect(x - 16, y - 10, 32, 22);
      ctx.fillStyle = '#a86b32';
      ctx.fillRect(x - 17, y - 16, 34, 9);
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(x - 17, y - 8, 34, 3);
      ctx.fillRect(x - 3, y - 10, 6, 9);
      ctx.strokeStyle = '#3e2410';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 16, y - 16, 32, 28);
    }
  },
};

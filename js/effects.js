'use strict';
// 손맛 연출: 파티클, 데미지 숫자, 낙뢰, 충격파 링, 화면 흔들림

const Effects = {
  init() {
    this.particles = new Pool(() => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff' }), 200);
    this.texts = new Pool(() => ({ x: 0, y: 0, vy: 0, life: 0, maxLife: 1, text: '', color: '#fff', big: false }), 80);
    this.bolts = new Pool(() => ({ x: 0, y: 0, r: 0, life: 0, maxLife: 1, pts: new Float32Array(20) }), 8);
    this.rings = new Pool(() => ({ x: 0, y: 0, r0: 0, r1: 0, life: 0, maxLife: 1, color: '#fff', width: 3 }), 16);
    this.reset();
  },

  reset() {
    this.particles.clear();
    this.texts.clear();
    this.bolts.clear();
    this.rings.clear();
    this.shakeAmt = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.hurtFlash = 0;
  },

  particle(x, y, color, count, speed, life, size) {
    const max = CONFIG.effects.maxParticles;
    for (let i = 0; i < count; i++) {
      if (this.particles.count >= max) return;
      const p = this.particles.get();
      const a = Math.random() * U.TAU;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.maxLife = p.life = life * (0.6 + Math.random() * 0.4);
      p.size = size;
      p.color = color;
    }
  },

  damageText(x, y, amount, color, big) {
    if (this.texts.count >= CONFIG.effects.maxDamageTexts) return;
    const t = this.texts.get();
    t.x = x + U.rand(-6, 6);
    t.y = y;
    t.vy = -55;
    t.maxLife = t.life = big ? 0.9 : 0.6;
    t.text = String(amount);
    t.color = color;
    t.big = big;
  },

  lightning(x, y, r) {
    const b = this.bolts.get();
    b.x = x;
    b.y = y;
    b.r = r;
    b.maxLife = b.life = 0.28;
    // 위에서 내려오는 지그재그 경로 (x 오프셋만 저장)
    for (let i = 0; i < b.pts.length; i++) b.pts[i] = (i === b.pts.length - 1) ? 0 : U.rand(-14, 14);
  },

  ring(x, y, r0, r1, color, life, width) {
    const g = this.rings.get();
    g.x = x;
    g.y = y;
    g.r0 = r0;
    g.r1 = r1;
    g.color = color;
    g.maxLife = g.life = life;
    g.width = width || 3;
  },

  // 색/크기별 숫자(0~9) 아틀라스를 한 번만 만들어 캐시
  _atlas(color, big) {
    const key = color + (big ? 'B' : 's');
    if (!this._atlases) this._atlases = {};
    let a = this._atlases[key];
    if (a) return a;
    const size = big ? 20 : 14;
    const font = `bold ${size}px sans-serif`;
    const cv = document.createElement('canvas');
    const c = cv.getContext('2d');
    c.font = font;
    const adv = Math.ceil(c.measureText('0').width);
    const gw = adv + 6, gh = size + 8;
    cv.width = gw * 10;
    cv.height = gh;
    c.font = font;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 3;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.fillStyle = color;
    for (let d = 0; d < 10; d++) {
      c.strokeText(String(d), d * gw + gw / 2, gh / 2);
      c.fillText(String(d), d * gw + gw / 2, gh / 2);
    }
    a = { canvas: cv, gw, gh, adv };
    this._atlases[key] = a;
    return a;
  },

  shake(amount) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  },

  update(dt) {
    let a = this.particles.active;
    for (let i = a.length - 1; i >= 0; i--) {
      const p = a[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.releaseAt(i); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const f = 1 - 4 * dt;
      p.vx *= f;
      p.vy *= f;
    }
    a = this.texts.active;
    for (let i = a.length - 1; i >= 0; i--) {
      const t = a[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.releaseAt(i); continue; }
      t.y += t.vy * dt;
      t.vy *= 1 - 3 * dt;
    }
    a = this.bolts.active;
    for (let i = a.length - 1; i >= 0; i--) {
      a[i].life -= dt;
      if (a[i].life <= 0) this.bolts.releaseAt(i);
    }
    a = this.rings.active;
    for (let i = a.length - 1; i >= 0; i--) {
      a[i].life -= dt;
      if (a[i].life <= 0) this.rings.releaseAt(i);
    }

    // 화면 흔들림 감쇠
    if (this.shakeAmt > 0) {
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 45);
      this.shakeX = (Math.random() * 2 - 1) * this.shakeAmt;
      this.shakeY = (Math.random() * 2 - 1) * this.shakeAmt;
    } else {
      this.shakeX = this.shakeY = 0;
    }
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
  },

  // 월드 좌표계에서 그리기 (카메라 변환 적용된 상태)
  draw(ctx) {
    // 충격파 링
    for (const g of this.rings.active) {
      const t = 1 - g.life / g.maxLife;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = g.color;
      ctx.lineWidth = g.width;
      ctx.beginPath();
      ctx.arc(g.x, g.y, U.lerp(g.r0, g.r1, t), 0, U.TAU);
      ctx.stroke();
    }

    // 낙뢰
    for (const b of this.bolts.active) {
      const t = b.life / b.maxLife;
      ctx.globalAlpha = t * 0.35;
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (1.15 - t * 0.15), 0, U.TAU);
      ctx.fill();

      const top = b.y - 420;
      const n = b.pts.length;
      ctx.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = pass === 0 ? t * 0.5 : t;
        ctx.strokeStyle = pass === 0 ? '#ffd23f' : '#ffffff';
        ctx.lineWidth = pass === 0 ? 9 : 3;
        ctx.beginPath();
        ctx.moveTo(b.x + b.pts[0], top);
        for (let i = 1; i < n; i++) {
          ctx.lineTo(b.x + b.pts[i], top + (b.y - top) * (i / (n - 1)));
        }
        ctx.stroke();
      }
    }

    // 파티클 (사각형이 원보다 빠름)
    for (const p of this.particles.active) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    }

    // 데미지 숫자 (미리 렌더링한 숫자 아틀라스로 그려서 fillText보다 훨씬 빠름)
    for (const t of this.texts.active) {
      const atlas = this._atlas(t.color, t.big);
      const k = t.life / t.maxLife;
      ctx.globalAlpha = k > 0.3 ? 1 : k / 0.3;
      const str = t.text;
      const gw = atlas.gw, gh = atlas.gh, adv = atlas.adv;
      let x = Math.round(t.x - (str.length * adv) / 2 - (gw - adv) / 2);
      const y = Math.round(t.y - gh / 2);
      for (let i = 0; i < str.length; i++) {
        const d = str.charCodeAt(i) - 48;
        if (d >= 0 && d <= 9) ctx.drawImage(atlas.canvas, d * gw, 0, gw, gh, x, y, gw, gh);
        x += adv;
      }
    }
    ctx.globalAlpha = 1;
  },
};

'use strict';
// 파티클, 베기 궤적, 잔상, 데미지 숫자, 화면 흔들림, 임팩트 프레임

const Effects = {
  particles: [],
  slashes: [],
  afterimages: [],
  numbers: [],
  shake: 0,
  shakeX: 0,
  shakeY: 0,
  impact: 0,       // >0 이면 색 반전 프레임

  reset() {
    this.particles.length = 0;
    this.slashes.length = 0;
    this.afterimages.length = 0;
    this.numbers.length = 0;
    this.shake = 0;
    this.impact = 0;
  },

  // ---------- 생성 ----------
  addShake(amount) {
    this.shake = Math.min(CONFIG.feel.maxShake, Math.max(this.shake, amount));
  },

  impactFrame(frames) {
    this.impact = Math.max(this.impact, frames || 1);
  },

  // 칼 맞은 자리 불꽃
  sparks(x, y, dir, count, color) {
    for (let i = 0; i < count; i++) {
      const a = (Math.random() - 0.5) * 1.6 + (dir < 0 ? Math.PI : 0);
      const s = 3 + Math.random() * 7;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5,
        life: 14 + Math.random() * 10, max: 24, size: 2 + Math.random() * 2,
        color: color || '#fff6d0', grav: 0.25, drag: 0.9, kind: 'spark',
      });
    }
  },

  // 착지 / 대시 먼지
  dust(x, y, count, dir) {
    for (let i = 0; i < count; i++) {
      const vx = dir ? -dir * (0.5 + Math.random() * 2.5) : (Math.random() - 0.5) * 4;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 16, y: y - Math.random() * 4,
        vx, vy: -Math.random() * 1.4,
        life: 18 + Math.random() * 14, max: 32, size: 3 + Math.random() * 4,
        color: 'rgba(30,24,28,', grav: -0.02, drag: 0.92, kind: 'dust',
      });
    }
  },

  // 처치 시 파편
  shards(x, y, dir, count, color) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4 + dir * 0.5;
      const s = 3 + Math.random() * 8;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 30,
        vx: Math.cos(a) * s + dir * 3, vy: Math.sin(a) * s,
        life: 40 + Math.random() * 30, max: 70, size: 3 + Math.random() * 5,
        color: color || '#111', grav: 0.35, drag: 0.98, kind: 'shard',
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5,
      });
    }
  },

  // 베기 궤적 (호)
  slash(owner, arc, facing, life, color, width) {
    this.slashes.push({
      owner, ox: 0, oy: -28, r: arc.r, from: arc.from, to: arc.to, thrust: !!arc.thrust,
      facing, life: life, max: life, color: color || '#4ff', width: width || 10,
    });
  },

  // 대시 잔상
  afterimage(x, y, w, h, facing, color) {
    this.afterimages.push({ x, y, w, h, facing, life: 16, max: 16, color: color || '#3ee' });
  },

  damageNumber(x, y, value, crit) {
    this.numbers.push({
      x: x + (Math.random() - 0.5) * 14, y,
      vx: (Math.random() - 0.5) * 1.5, vy: crit ? -4.2 : -3.2,
      text: String(Math.round(value)), crit,
      life: CONFIG.feel.damageNumberLife, max: CONFIG.feel.damageNumberLife,
    });
  },

  // ---------- 갱신 (히트스톱 중에도 돌아감) ----------
  update() {
    const F = CONFIG.feel;
    // 흔들림
    if (this.shake > 0.2) {
      this.shakeX = (Math.random() * 2 - 1) * this.shake;
      this.shakeY = (Math.random() * 2 - 1) * this.shake;
      this.shake *= F.shakeDecay;
    } else {
      this.shake = 0; this.shakeX = 0; this.shakeY = 0;
    }
    if (this.impact > 0) this.impact--;

    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav;
      p.x += p.vx; p.y += p.vy;
      if (p.rot !== undefined) p.rot += p.vr;
      if (--p.life <= 0) ps.splice(i, 1);
    }
    const ss = this.slashes;
    for (let i = ss.length - 1; i >= 0; i--) if (--ss[i].life <= 0) ss.splice(i, 1);
    const as = this.afterimages;
    for (let i = as.length - 1; i >= 0; i--) if (--as[i].life <= 0) as.splice(i, 1);
    const ns = this.numbers;
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      n.x += n.vx; n.y += n.vy; n.vy += 0.16;
      if (n.vy > 0.6) n.vy = 0.6;
      if (--n.life <= 0) ns.splice(i, 1);
    }
  },

  // ---------- 그리기 (월드 좌표, 카메라 변환 적용된 상태) ----------
  drawBack(ctx) {
    // 잔상
    for (const a of this.afterimages) {
      ctx.globalAlpha = (a.life / a.max) * 0.45;
      ctx.fillStyle = a.color;
      ctx.fillRect(a.x - a.w / 2, a.y - a.h, a.w, a.h);
    }
    ctx.globalAlpha = 1;
  },

  drawFront(ctx) {
    // 베기 궤적
    for (const s of this.slashes) {
      const t = s.life / s.max;
      const cx = s.owner.x, cy = s.owner.y + s.oy;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s.facing, 1);
      ctx.globalAlpha = t;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = s.color;
      if (s.thrust) {
        ctx.beginPath();
        ctx.moveTo(6, -4 * t);
        ctx.lineTo(s.r + 10, 0);
        ctx.lineTo(6, 4 * t);
        ctx.closePath();
        ctx.fill();
      } else {
        // 초승달 모양: 바깥 호 + 안쪽 호(중심 이동)
        const a0 = s.from * Math.PI / 180, a1 = s.to * Math.PI / 180;
        const ccw = a1 < a0;
        const w = s.width * t;
        ctx.beginPath();
        ctx.arc(0, 0, s.r, a0, a1, ccw);
        ctx.arc(-w * 0.6, 0, s.r - w, a1, a0, !ccw);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 파티클
    for (const p of this.particles) {
      const t = p.life / p.max;
      if (p.kind === 'dust') {
        ctx.fillStyle = p.color + (0.5 * t).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.4 - t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      } else {
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 데미지 숫자
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.numbers) {
      const t = n.life / n.max;
      const pop = n.life > n.max - 6 ? 1 + (n.life - (n.max - 6)) * 0.12 : 1;
      const size = (n.crit ? 30 : 18) * pop;
      ctx.globalAlpha = Math.min(1, t * 3);
      ctx.font = `bold ${size | 0}px "Segoe UI", sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.crit ? '#ffd83a' : '#ffffff';
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  },
};

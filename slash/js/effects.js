'use strict';
// 파티클, 베기 궤적, 잔상, 데미지 숫자, 화면 흔들림, 임팩트 프레임

const Effects = {
  particles: [],
  slashes: [],
  trail: [],       // 검기 리본: 칼 안쪽~칼끝 샘플 점들
  waves: [],       // 충격파 고리
  rings: [],       // 부딪힘 섬광
  afterimages: [],
  numbers: [],
  shake: 0,
  shakeX: 0,
  shakeY: 0,
  impact: 0,       // >0 이면 색 반전 프레임

  reset() {
    this.particles.length = 0;
    this.slashes.length = 0;
    this.trail.length = 0;
    this.waves.length = 0;
    this.rings.length = 0;
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

  // 찌르기 궤적 (가시 모양)
  thrust(owner, r, facing, life, color) {
    this.slashes.push({ owner, r, facing, life, max: life, color: color || '#5ff' });
  },

  // 검기 리본 점 하나 추가. id 가 같은 점끼리 이어서 그린다 (한 번의 휘두르기 = 한 id)
  // (ix,iy) 칼 안쪽, (ox,oy) 칼끝 바깥
  trailPoint(id, ix, iy, ox, oy, life, heavy) {
    this.trail.push({ id, ix, iy, ox, oy, life, max: life, heavy: !!heavy });
  },

  // 칼 부딪힘 섬광 (작은 원이 퍼지며 사라짐)
  flashRing(x, y) {
    this.rings.push({ x, y, life: 10, max: 10 });
  },

  // 내려찍기 착지 충격파
  shockwave(x, y, radius) {
    this.waves.push({ x, y, r: radius, life: 22, max: 22 });
    this.dust(x - 20, y, 10, 1);
    this.dust(x + 20, y, 10, -1);
  },

  // 대시 잔상: 그 순간의 골격을 반투명 청록 분신으로
  afterimage(fig) {
    this.afterimages.push({ fig, life: 16, max: 16 });
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
  // frozen: 히트스톱 중 (검기/궤적은 멈춘 채로 유지)
  update(frozen) {
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
    if (!frozen) {
      const ss = this.slashes;
      for (let i = ss.length - 1; i >= 0; i--) if (--ss[i].life <= 0) ss.splice(i, 1);
      const tr = this.trail;
      for (let i = tr.length - 1; i >= 0; i--) if (--tr[i].life <= 0) tr.splice(i, 1);
    }
    const rs = this.rings;
    for (let i = rs.length - 1; i >= 0; i--) if (--rs[i].life <= 0) rs.splice(i, 1);
    const ws = this.waves;
    for (let i = ws.length - 1; i >= 0; i--) if (--ws[i].life <= 0) ws.splice(i, 1);
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
  // 검기 리본: 연속된 두 샘플 사이를 사각형으로 채움. 오래된 점일수록 투명 + 가늘게
  drawTrail(ctx) {
    const tr = this.trail;
    let i = 0;
    while (i < tr.length) {
      let j = i;
      while (j + 1 < tr.length && tr[j + 1].id === tr[i].id) j++;
      if (j > i) this._drawRibbon(ctx, tr, i, j);
      i = j + 1;
    }
  },

  // 한 번의 휘두르기를 하나의 다각형으로: 오래된 쪽일수록 안쪽 가장자리가 칼끝으로 모여 꼬리가 가늘어짐
  _drawRibbon(ctx, tr, i0, i1) {
    const newest = tr[i1].life / tr[i1].max;
    const heavy = tr[i1].heavy;
    const band = (k, frac) => {
      const p = tr[k];
      const t = p.life / p.max;
      const w = t * t * frac;                       // 남은 두께 비율
      return [p.ox + (p.ix - p.ox) * w, p.oy + (p.iy - p.oy) * w];
    };
    const layer = (frac, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tr[i0].ox, tr[i0].oy);
      for (let k = i0 + 1; k <= i1; k++) ctx.lineTo(tr[k].ox, tr[k].oy);
      for (let k = i1; k >= i0; k--) { const q = band(k, frac); ctx.lineTo(q[0], q[1]); }
      ctx.closePath();
      ctx.fill();
    };
    ctx.save();
    ctx.shadowColor = '#3ff';
    ctx.shadowBlur = 16;
    layer(1, `rgba(90,230,255,${((heavy ? 0.5 : 0.4) * newest).toFixed(3)})`);
    ctx.shadowBlur = 0;
    layer(0.35, `rgba(200,255,255,${(0.85 * newest).toFixed(3)})`);
    // 칼끝 가장자리 선
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(255,255,255,${newest.toFixed(3)})`;
    ctx.lineWidth = heavy ? 3 : 2;
    ctx.beginPath();
    const start = Math.max(i0, i1 - Math.ceil((i1 - i0) * 0.7));
    ctx.moveTo(tr[start].ox, tr[start].oy);
    for (let k = start + 1; k <= i1; k++) ctx.lineTo(tr[k].ox, tr[k].oy);
    ctx.stroke();
    ctx.restore();
  },

  drawBack(ctx) {
    for (const a of this.afterimages) {
      const t = a.life / a.max;
      ctx.globalAlpha = t * 0.5;
      const col = 'rgb(70,230,255)';
      Anim.drawFigure(ctx, a.fig, { color: col, back: col });
      if (a.fig.blade) Anim.drawBlade(ctx, a.fig.blade.base, a.fig.blade.tip, 1.8, 1, col);
    }
    ctx.globalAlpha = 1;
  },

  drawFront(ctx) {
    this.drawTrail(ctx);

    // 찌르기 궤적
    for (const s of this.slashes) {
      const t = s.life / s.max;
      ctx.save();
      ctx.translate(s.owner.x, s.owner.y - 34);
      ctx.scale(s.facing, 1);
      ctx.globalAlpha = t;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(-30, -6 * t);
      ctx.lineTo(s.r + 14, 0);
      ctx.lineTo(-30, 6 * t);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, -2 * t);
      ctx.lineTo(s.r + 8, 0);
      ctx.lineTo(0, 2 * t);
      ctx.fill();
      ctx.restore();
    }

    // 부딪힘 섬광
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      ctx.arc(r.x, r.y, 4 + 10 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd860';
      ctx.lineWidth = 3 * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 6 + 30 * t, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 충격파
    for (const w of this.waves) {
      const t = 1 - w.life / w.max;
      const r = w.r * (0.3 + 0.7 * Math.sqrt(t));
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#bff';
      ctx.lineWidth = 8 * (1 - t) + 1;
      ctx.beginPath();
      ctx.ellipse(w.x, w.y - 2, r, r * 0.22, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(w.x, w.y - 2, r * 0.7, r * 0.15, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

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

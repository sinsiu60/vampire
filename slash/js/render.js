'use strict';
// 월드 그리기: 배경(테마별 하늘 + 패럴랙스 원경 3겹 + 떠다니는 먼지), 지형, 실루엣 캐릭터

// 층별 테마. 저채도 하늘 + 원경은 뒤로 갈수록 하늘색에 가깝게(공기 원근)
const THEMES = [
  { // 1층: 노을
    name: '노을',
    sky: ['#857087', '#d69c80', '#efc896'],
    orb: { x: 0.7, y: 300, r: 70, color: 'rgba(255,238,200,0.8)', glow: 'rgba(255,220,170,0.35)' },
    layers: [
      { kind: 'mountains', factor: 0.12, base: 330, amp: 90, color: '#c59886' },
      { kind: 'buildings', factor: 0.3, base: 390, amp: 110, color: '#9f7069' },
      { kind: 'hills', factor: 0.55, base: 430, amp: 40, color: '#6c4749' },
    ],
    mote: 'rgba(255,236,200,',
    moteRise: false,
  },
  { // 2층: 달밤
    name: '달밤',
    sky: ['#1d2440', '#3f4b74', '#7584ab'],
    orb: { x: 0.25, y: 120, r: 46, color: 'rgba(235,240,255,0.9)', glow: 'rgba(200,215,255,0.25)' },
    layers: [
      { kind: 'mountains', factor: 0.12, base: 340, amp: 100, color: '#5a6690' },
      { kind: 'buildings', factor: 0.3, base: 395, amp: 120, color: '#3f4970' },
      { kind: 'hills', factor: 0.55, base: 432, amp: 40, color: '#2a3152' },
    ],
    mote: 'rgba(200,220,255,',
    moteRise: false,
  },
  { // 3층: 불타는 성
    name: '불타는 성',
    sky: ['#3a1414', '#8e3220', '#e07a3a'],
    orb: { x: 0.6, y: 330, r: 120, color: 'rgba(255,170,90,0.35)', glow: 'rgba(255,120,60,0.25)' },
    layers: [
      { kind: 'mountains', factor: 0.12, base: 330, amp: 80, color: '#a8492e' },
      { kind: 'buildings', factor: 0.3, base: 400, amp: 140, color: '#6e2a1c' },
      { kind: 'hills', factor: 0.55, base: 432, amp: 36, color: '#3e1712' },
    ],
    mote: 'rgba(255,170,80,',
    moteRise: true,     // 불씨가 위로 올라감
  },
];

const Render = {
  themeIndex: 0,
  _layers: null,
  _motes: null,
  _tufts: null,

  get theme() { return THEMES[this.themeIndex] || THEMES[0]; },

  setTheme(i) {
    this.themeIndex = i;
    this._layers = null;
    this._motes = null;
  },

  // ---------- 원경 생성 (한 번) ----------
  buildLayers() {
    let seed = 1234 + this.themeIndex * 77;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    this._layers = this.theme.layers.map((L) => {
      const pts = [];
      const W = 3200;
      if (L.kind === 'mountains') {
        // 뾰족한 산맥
        for (let x = -200; x <= W; x += 60 + rnd() * 80) pts.push([x, L.base - rnd() * L.amp]);
      } else if (L.kind === 'hills') {
        // 둥근 언덕 + 나무 실루엣
        for (let x = -200; x <= W; x += 24) {
          pts.push([x, L.base - (Math.sin(x * 0.006) * 0.5 + Math.sin(x * 0.017 + 1) * 0.3 + 0.5) * L.amp]);
        }
      } else {
        // 건물 / 성 실루엣: 탑, 뾰족 지붕, 성가퀴
        let x = -200;
        pts.push([x, L.base]);
        while (x < W) {
          const w = 30 + rnd() * 70;
          const h = 20 + rnd() * L.amp;
          const top = L.base - h;
          const kind = rnd();
          pts.push([x, top]);
          if (kind < 0.3) {               // 뾰족 지붕 탑
            pts.push([x + w / 2, top - 20 - rnd() * 30]);
          } else if (kind < 0.55) {       // 성가퀴
            for (let k = 0; k < 3; k++) {
              const cx = x + (w / 3) * k;
              pts.push([cx, top - 8], [cx + w / 6, top - 8], [cx + w / 6, top]);
            }
          } else if (kind < 0.7) {        // 첨탑
            pts.push([x + w * 0.45, top], [x + w / 2, top - 45 - rnd() * 30], [x + w * 0.55, top]);
          }
          pts.push([x + w, top]);
          x += w;
          if (rnd() < 0.35) { pts.push([x, L.base - 5]); x += 10 + rnd() * 40; pts.push([x, L.base - 5]); }
        }
      }
      // 언덕엔 나무 몇 그루
      const trees = [];
      if (L.kind === 'hills') for (let x = 0; x < W; x += 90 + rnd() * 160) trees.push([x, 14 + rnd() * 22]);
      return { ...L, pts, trees };
    });
  },

  hillY(L, x) {
    return L.base - (Math.sin(x * 0.006) * 0.5 + Math.sin(x * 0.017 + 1) * 0.3 + 0.5) * L.amp;
  },

  // ---------- 떠다니는 먼지 (고정 스텝에서 갱신) ----------
  updateAmbient() {
    const V = CONFIG.view;
    if (!this._motes) {
      this._motes = [];
      for (let i = 0; i < 46; i++) {
        this._motes.push({
          x: Math.random() * V.width * 2, y: Math.random() * V.height,
          depth: 0.2 + Math.random() * 0.8, size: 0.8 + Math.random() * 1.8,
          ph: Math.random() * 6, sp: 0.2 + Math.random() * 0.4,
        });
      }
    }
    const rise = this.theme.moteRise;
    for (const m of this._motes) {
      m.ph += 0.02;
      m.x += Math.sin(m.ph) * 0.2 + 0.12 * m.depth;
      m.y += rise ? -m.sp * 1.4 : Math.cos(m.ph * 0.7) * 0.15 + 0.05;
      if (m.y < -10) m.y = V.height + 10;
      if (m.y > V.height + 10) m.y = -10;
    }
  },

  background(ctx, cam) {
    const V = CONFIG.view, T = this.theme;
    const g = ctx.createLinearGradient(0, 0, 0, V.height);
    g.addColorStop(0, T.sky[0]);
    g.addColorStop(0.55, T.sky[1]);
    g.addColorStop(1, T.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, V.width, V.height);

    // 해 / 달
    const ox = V.width * T.orb.x - cam.x * 0.04;
    const og = ctx.createRadialGradient(ox, T.orb.y, T.orb.r * 0.6, ox, T.orb.y, T.orb.r * 2.6);
    og.addColorStop(0, T.orb.glow);
    og.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = og;
    ctx.fillRect(0, 0, V.width, V.height);
    ctx.fillStyle = T.orb.color;
    ctx.beginPath();
    ctx.arc(ox, T.orb.y, T.orb.r, 0, Math.PI * 2);
    ctx.fill();

    if (!this._layers) this.buildLayers();
    for (const L of this._layers) {
      const offX = cam.x * L.factor, offY = cam.y * L.factor;
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(-10, V.height);
      for (const [x, y] of L.pts) {
        const sx = x - offX;
        if (sx < -300 || sx > V.width + 300) continue;
        ctx.lineTo(sx, y - offY);
      }
      ctx.lineTo(V.width + 10, V.height);
      ctx.closePath();
      ctx.fill();
      // 나무 (원뿔 + 줄기)
      for (const [tx, th] of L.trees) {
        const sx = tx - offX;
        if (sx < -40 || sx > V.width + 40) continue;
        const gy = this.hillY(L, tx) - offY;
        ctx.beginPath();
        ctx.moveTo(sx - th * 0.35, gy + 2);
        ctx.lineTo(sx, gy - th);
        ctx.lineTo(sx + th * 0.35, gy + 2);
        ctx.fill();
      }
    }

    // 먼지 / 불씨
    if (this._motes) {
      for (const m of this._motes) {
        const span = V.width + 40;
        let sx = (m.x - cam.x * m.depth * 0.6) % span;
        if (sx < 0) sx += span;
        sx -= 20;
        const a = (0.25 + 0.35 * m.depth) * (0.6 + 0.4 * Math.sin(m.ph * 3));
        ctx.fillStyle = T.mote + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(sx, m.y - cam.y * m.depth * 0.3, m.size * (0.6 + m.depth * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  // ---------- 지형: 검정 ----------
  level(ctx, level, cam) {
    const V = CONFIG.view;
    ctx.fillStyle = '#050405';
    for (const r of level.rects) {
      if (r.x > cam.x + V.width + 20 || r.x + r.w < cam.x - 20) continue;
      if (r.oneWay) {
        ctx.fillRect(r.x, r.y, r.w, 7);
        // 받침 장식
        ctx.beginPath();
        ctx.moveTo(r.x + 8, r.y + 7); ctx.lineTo(r.x + 18, r.y + 18); ctx.lineTo(r.x + 28, r.y + 7);
        ctx.moveTo(r.x + r.w - 8, r.y + 7); ctx.lineTo(r.x + r.w - 18, r.y + 18); ctx.lineTo(r.x + r.w - 28, r.y + 7);
        ctx.fill();
      } else {
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }
    // 바닥 위 풀 실루엣
    if (!this._tufts) {
      this._tufts = [];
      let seed = 99;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let x = 0; x < level.width; x += 14 + rnd() * 40) this._tufts.push([x, 3 + rnd() * 7]);
    }
    const gy = level.groundY;
    ctx.beginPath();
    for (const [x, h] of this._tufts) {
      if (x < cam.x - 20 || x > cam.x + V.width + 20) continue;
      ctx.moveTo(x - 4, gy);
      ctx.lineTo(x - 2, gy - h);
      ctx.lineTo(x, gy - h * 0.4);
      ctx.lineTo(x + 2, gy - h * 0.9);
      ctx.lineTo(x + 4, gy);
    }
    ctx.fill();
  },

  // ---------- 플레이어 ----------
  player(ctx, p) {
    const fig = Anim.playerFigure(p);
    if (p.invuln > 0 && p.state !== 'hurt' && !p.dead && (p.invuln >> 2) % 2 === 0) ctx.globalAlpha = 0.45;
    const white = p.flash > 0;
    const col = white ? '#ffffff' : '#060608';
    const back = white ? '#e8e8e8' : '#2a2328';
    let glow = null;
    if (p.state === 'charge' && p.chargeLevel > 0) glow = p.chargeLevel >= 2 ? '#bff' : '#3ef';

    Anim.drawFigure(ctx, fig, { color: col, back, glow, glowBlur: 8 + 5 * p.chargeLevel }, p.scarf);

    // 칼: 검은 칼날 (궤적만 청록). 패링 성공 후 크리티컬 확정 상태면 금빛
    const b = fig.blade;
    ctx.save();
    if (p.critReady > 0) { ctx.shadowColor = '#ffc830'; ctx.shadowBlur = 10 + Math.sin(p.critReady * 0.3) * 4; }
    else if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
    Anim.drawBlade(ctx, b.base, b.tip, 2.4, 1.1, col);
    // 코등이
    const gx = b.guard.x, gy2 = b.guard.y;
    const dx = b.tip.x - b.base.x, dy = b.tip.y - b.base.y, L = Math.hypot(dx, dy) || 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx - dy / L * 4, gy2 + dx / L * 4);
    ctx.lineTo(gx + dy / L * 4, gy2 - dx / L * 4);
    ctx.stroke();
    ctx.restore();

    // 판정 중: 칼날을 따라 검기가 뻗어나감
    if (p.isActiveFrame() && p.state === 'attack' && !p.move.swing.thrust) {
      const far = p.bladePoint(b.pose, b.pose.r, {});
      ctx.save();
      ctx.shadowColor = '#3ff';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(210,255,255,0.95)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.hand.x, b.hand.y);
      ctx.lineTo(far.x, far.y);
      ctx.stroke();
      ctx.restore();
    }

    if (!white) Anim.drawEye(ctx, fig, '#bffcff', '#2ff', 2);

    // 패링 판정 창: 칼날 가운데 노란 반짝임
    if (p.isParrying() || p.parryFlash > 0) {
      const k = p.parryFlash > 0 ? p.parryFlash / 14 : 1 - p.stateFrame / (CONFIG.parry.window + 1);
      const mx = (b.hand.x + b.tip.x) / 2, my = (b.hand.y + b.tip.y) / 2;
      ctx.save();
      ctx.globalAlpha = clamp01(k);
      ctx.fillStyle = '#fff6c0';
      ctx.shadowColor = '#ffd21a';
      ctx.shadowBlur = 14;
      this.star(ctx, mx, my, 5 + (p.parryFlash > 0 ? 10 * k : 3 * k));
      ctx.restore();
    }

    // 차지 링
    if (p.state === 'charge' && p.chargeLevel > 0) {
      ctx.save();
      ctx.strokeStyle = p.chargeLevel >= 2 ? '#e8ffff' : '#5ff';
      ctx.shadowColor = '#3ff';
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(p.stateFrame * 0.5);
      ctx.lineWidth = 1.5 + p.chargeLevel;
      ctx.beginPath();
      ctx.arc(fig.j.hip.x, fig.j.hip.y - 4, 26 + p.chargeLevel * 8 + Math.sin(p.stateFrame * 0.3) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  // ---------- 적 ----------
  enemy(ctx, e) {
    const fig = Anim.enemyFigure(e);
    const look = e.cfg.look;
    ctx.save();
    if (e.dead) ctx.globalAlpha = Math.max(0, 1 - e.stateFrame / 24);
    const white = e.flash > 0;
    let col = '#060506', back = '#2b2225', glow = null, blur = 0;
    // 예고: 빨강(패링 불가) / 노랑(패링 가능) 기운이 깜빡이며 차오름
    if (e.telegraphing) {
      const yellow = e.atk.parryable;
      const k = clamp01(e.stateFrame / e.atk.windup);
      const on = (e.stateFrame >> 2) % 2 === 0;
      glow = yellow ? '#ffd21a' : '#ff1a1a';
      blur = on ? 10 + 16 * k : 6;
      if (on) { col = yellow ? '#2a2205' : '#2a0505'; back = yellow ? '#4a3e10' : '#4a1010'; }
    } else if (e.armored) {
      // 슈퍼아머: 은빛 테두리
      glow = 'rgba(190,205,225,0.9)';
      blur = 5;
    }
    if (white) { col = '#ffffff'; back = '#e8e8e8'; glow = null; }

    if (look.weapon === 'claws') this.wings(ctx, fig, e, col, back);
    Anim.drawFigure(ctx, fig, { color: col, back, glow, glowBlur: blur });
    ctx.save();
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = blur; }
    this.enemyGear(ctx, fig, e, col);
    ctx.restore();
    if (!white) Anim.drawEye(ctx, fig, '#ff5050', '#f00', look.body === 'heavy' ? 2.6 : 2.2);
    ctx.restore();

    const headY = fig.j.head.y - fig.dim.headR;
    // 예고 표시 "!"
    if (e.telegraphing) {
      const k = clamp01(e.stateFrame / e.atk.windup);
      const c = e.atk.parryable ? '#ffd21a' : '#ff2a2a';
      ctx.save();
      ctx.fillStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 8;
      ctx.font = `bold ${(18 + 8 * k) | 0}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('!', e.x, headY - 10);
      ctx.restore();
    }
    // 그로기: 머리 위로 별이 빙글빙글
    if (e.state === 'stun' && !e.dead) {
      const t = (Game.frame || 0) * 0.12;
      ctx.save();
      ctx.fillStyle = '#ffe070';
      ctx.shadowColor = '#ffb000';
      ctx.shadowBlur = 6;
      for (let i = 0; i < 3; i++) {
        const a = t + i * (Math.PI * 2 / 3);
        this.star(ctx, fig.j.head.x + Math.cos(a) * 14, headY - 6 + Math.sin(a) * 4, 3.5);
      }
      ctx.restore();
    }
    // 체력바
    if (!e.dead && e.hpShow > 0) {
      const bw = look.body === 'heavy' ? 56 : 40;
      const by = Math.min(e.y - e.h - 12, headY - 10);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = '#d33';
      ctx.fillRect(e.x - bw / 2, by, bw * (e.hp / e.maxHp), 3);
    }
  },

  star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  },

  // 종류별 장비: 칼 / 방패 / 망치 / 활 / 뿔 / 투구
  enemyGear(ctx, fig, e, col) {
    const w = fig.weapon, j = fig.j, d = fig.dim, f = fig.facing;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    switch (e.cfg.look.weapon) {
      case 'blade':
        Anim.drawBlade(ctx, w.base, w.tip, 2.2, 4.2, col);
        break;
      case 'shield': {
        // 몸 앞을 가리는 큰 방패
        ctx.save();
        ctx.translate(w.hand.x, w.hand.y);
        ctx.rotate(f > 0 ? w.ang * 0.4 : -w.ang * 0.4);
        ctx.beginPath();
        ctx.moveTo(-3 * f, -22);
        ctx.lineTo(4 * f, -20);
        ctx.lineTo(5 * f, 14);
        ctx.lineTo(0, 22);
        ctx.lineTo(-4 * f, 14);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'hammer': {
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(w.base.x, w.base.y);
        ctx.lineTo(w.tip.x, w.tip.y);
        ctx.stroke();
        // 망치 머리 (자루에 수직인 큰 덩어리)
        const dx = w.tip.x - w.base.x, dy = w.tip.y - w.base.y, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L, ux = dx / L, uy = dy / L;
        const cx = w.tip.x - ux * 5, cy = w.tip.y - uy * 5;
        ctx.beginPath();
        ctx.moveTo(cx + nx * 12 - ux * 8, cy + ny * 12 - uy * 8);
        ctx.lineTo(cx + nx * 12 + ux * 8, cy + ny * 12 + uy * 8);
        ctx.lineTo(cx - nx * 9 + ux * 8, cy - ny * 9 + uy * 8);
        ctx.lineTo(cx - nx * 9 - ux * 8, cy - ny * 9 - uy * 8);
        ctx.closePath();
        ctx.fill();
        // 투구 볏
        ctx.beginPath();
        ctx.moveTo(j.head.x - f * 2, j.head.y - d.headR + 1);
        ctx.lineTo(j.head.x - f * 12, j.head.y - d.headR - 7);
        ctx.lineTo(j.head.x - f * 4, j.head.y - d.headR - 1);
        ctx.fill();
        // 어깨 갑옷
        ctx.beginPath();
        ctx.arc(j.shoulder.x, j.shoulder.y + 2, 8, Math.PI, 0);
        ctx.fill();
        break;
      }
      case 'bow': {
        // 활: 손을 중심으로 세로 호, 시위는 뒷손으로
        const bx = w.hand.x, by = w.hand.y;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(bx - f * 3, by, 6, 16, 0, f > 0 ? -Math.PI / 2 : Math.PI / 2, f > 0 ? Math.PI / 2 : Math.PI * 1.5);
        ctx.stroke();
        const drawing = e.state === 'windup' && e.atk.kind === 'shoot';
        const sx = drawing ? j.handB.x : bx - f * 3;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(bx - f * 3, by - 16);
        ctx.lineTo(sx, drawing ? j.handB.y : by);
        ctx.lineTo(bx - f * 3, by + 16);
        ctx.stroke();
        if (drawing) {
          // 화살 끝이 노랗게 빛남 (반사 가능)
          ctx.save();
          ctx.shadowColor = '#ffc830';
          ctx.shadowBlur = 8;
          ctx.fillStyle = '#ffe070';
          ctx.beginPath();
          ctx.arc(bx + f * 4, by, 2.5 + clamp01(e.stateFrame / e.atk.windup) * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        // 두건
        ctx.beginPath();
        ctx.moveTo(j.head.x + f * 3, j.head.y - d.headR);
        ctx.lineTo(j.head.x - f * 10, j.head.y + 2);
        ctx.lineTo(j.head.x - f * 2, j.head.y + 4);
        ctx.fill();
        break;
      }
      case 'horns': {
        // 앞으로 휜 뿔 두 개
        ctx.lineWidth = 3;
        for (const off of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(j.head.x, j.head.y - d.headR * 0.6);
          ctx.quadraticCurveTo(j.head.x - f * 4, j.head.y - d.headR - 10 + off * 2, j.head.x + f * (10 + off * 3), j.head.y - d.headR - 6 + off * 3);
          ctx.stroke();
        }
        break;
      }
    }
  },

  // 비행형 날개: 어깨에서 퍼덕임
  wings(ctx, fig, e, col, back) {
    const s = fig.j.shoulder, f = fig.facing;
    const flap = e.state === 'attack' ? -0.2 : Math.sin(e.walkPhase * 1.6);
    const draw = (sign, color, scale) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      const tipX = s.x - f * 30 * scale, tipY = s.y - 22 * scale * flap - 4;
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(s.x - f * 22 * scale, s.y + 4 + 6 * flap);
      ctx.lineTo(s.x - f * 14 * scale, s.y + 2);
      ctx.lineTo(s.x - f * 8 * scale, s.y + 8);
      ctx.closePath();
      ctx.fill();
    };
    draw(1, back, 0.85);
    draw(1, col, 1);
  },

  hitboxes(ctx, game) {
    const p = game.player;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#0f0';
    const b = Combat.bodyBox(p);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (p.isActiveFrame()) {
      const hb = Combat.worldBox(p, p.move.hitbox);
      ctx.strokeStyle = '#ff0';
      ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
    }
    for (const e of game.enemies) {
      const eb = Combat.bodyBox(e);
      ctx.strokeStyle = '#0f0';
      ctx.strokeRect(eb.x, eb.y, eb.w, eb.h);
      if ((e.state === 'attack' || e.state === 'windup') && e.atk.hitbox) {
        const hb = Combat.worldBox(e, e.atk.hitbox);
        ctx.strokeStyle = e.state === 'attack' ? '#f00' : 'rgba(255,0,0,0.35)';
        ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
      }
    }
  },
};

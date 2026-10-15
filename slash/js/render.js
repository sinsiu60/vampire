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
  { // 4층: 서리 묘역
    name: '서리 묘역',
    sky: ['#24313f', '#5f7c96', '#c3d5e3'],
    orb: { x: 0.78, y: 130, r: 40, color: 'rgba(240,248,255,0.85)', glow: 'rgba(210,230,255,0.25)' },
    layers: [
      { kind: 'mountains', factor: 0.12, base: 320, amp: 120, color: '#8ea3b6' },
      { kind: 'buildings', factor: 0.3, base: 400, amp: 90, color: '#5d7387' },
      { kind: 'hills', factor: 0.55, base: 432, amp: 36, color: '#34445a' },
    ],
    mote: 'rgba(240,248,255,',
    moteRise: false,    // 눈
  },
  { // 5층: 공허의 첨탑
    name: '공허의 첨탑',
    sky: ['#0c0916', '#2a1b46', '#6b3f8c'],
    orb: { x: 0.5, y: 200, r: 90, color: 'rgba(210,160,255,0.3)', glow: 'rgba(170,90,255,0.3)' },
    layers: [
      { kind: 'mountains', factor: 0.12, base: 330, amp: 110, color: '#4b2f70' },
      { kind: 'buildings', factor: 0.3, base: 390, amp: 160, color: '#2e1c4b' },
      { kind: 'hills', factor: 0.55, base: 432, amp: 40, color: '#190f2e' },
    ],
    mote: 'rgba(200,150,255,',
    moteRise: true,
  },
];

const Render = {
  themeIndex: 0,
  lit: 0,          // 0~1: 어두운 화면(처형 암전 등)에서 캐릭터를 밝은 실루엣으로 그리는 정도
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
  resetLevelCache() {
    this._tufts = null;
  },

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
    // 낭떠러지: 아래로 갈수록 어두워지는 심연
    if (level.segs) {
      for (const sg of level.segs) {
        if (!sg.pit || sg.x1 < cam.x - 20 || sg.x0 > cam.x + V.width + 20) continue;
        const top = level.groundY - sg.h;
        const g = ctx.createLinearGradient(0, top, 0, top + 90);
        g.addColorStop(0, 'rgba(5,4,5,0.15)');
        g.addColorStop(1, 'rgba(5,4,5,0.97)');
        ctx.fillStyle = g;
        ctx.fillRect(sg.x0, top, sg.x1 - sg.x0, 400);
        // 벼랑 끝 바위
        ctx.fillStyle = '#050405';
        for (const ex of [sg.x0, sg.x1]) {
          const d = ex === sg.x0 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(ex, top + 10); ctx.lineTo(ex + d * 7, top + 24); ctx.lineTo(ex, top + 40);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#050405';
    }
    // 땅 윗면의 풀 실루엣 (땅 사각형마다)
    if (!this._tufts) {
      this._tufts = [];
      let seed = 99;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      const grounds = level.rects.filter((r) => !r.oneWay && r.w > 40 && r.y > level.groundY - 200 && r.x >= 0 && r.x < level.width);
      for (const r of grounds) {
        for (let x = r.x + 6; x < r.x + r.w - 6; x += 14 + rnd() * 40) this._tufts.push([x, r.y, 3 + rnd() * 7]);
      }
    }
    ctx.beginPath();
    for (const [x, gy, h] of this._tufts) {
      if (x < cam.x - 20 || x > cam.x + V.width + 20) continue;
      ctx.moveTo(x - 4, gy);
      ctx.lineTo(x - 2, gy - h);
      ctx.lineTo(x, gy - h * 0.4);
      ctx.lineTo(x + 2, gy - h * 0.9);
      ctx.lineTo(x + 4, gy);
    }
    ctx.fill();
    this.gates(ctx, level);
  },

  // 문: 잠겼으면 붉게 빛나는 철창, 열렸으면 위로 걷힌 철창 끝만
  gates(ctx, level) {
    const t = Game.frame || 0;
    for (const g of level.gates) {
      ctx.save();
      if (level.locked) {
        ctx.shadowColor = '#ff3020';
        ctx.shadowBlur = 8 + Math.sin(t * 0.15) * 3;
        ctx.fillStyle = '#050405';
        ctx.fillRect(g.x, g.y - 6, g.w, 6);
        ctx.strokeStyle = '#2a0c0a';
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          const bx = g.x + 2 + i * 4;
          ctx.beginPath(); ctx.moveTo(bx, g.y); ctx.lineTo(bx, g.y + g.h); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,60,40,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y + g.h * 0.35); ctx.lineTo(g.x + g.w, g.y + g.h * 0.35);
        ctx.moveTo(g.x, g.y + g.h * 0.7); ctx.lineTo(g.x + g.w, g.y + g.h * 0.7);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#050405';
        ctx.fillRect(g.x, g.y - 6, g.w, 10);
        // 열린 문: 다음 방 방향 화살표
        const room = Game.room;
        const exitable = room && (g.gate === 'right' || room.index > 0);
        if (exitable) {
          ctx.fillStyle = `rgba(255,240,200,${(0.45 + 0.25 * Math.sin(t * 0.1)).toFixed(3)})`;
          const dir = g.gate === 'right' ? 1 : -1;
          const ax = g.gate === 'right' ? g.x - 18 : g.x + g.w + 18, ay = g.y + g.h * 0.5;
          ctx.beginPath();
          ctx.moveTo(ax + dir * 8, ay); ctx.lineTo(ax - dir * 4, ay - 8); ctx.lineTo(ax - dir * 4, ay + 8);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }
  },

  // 모닥불 (층 시작방): 쓰기 전엔 타오르고, 쓰고 나면 잔불
  rest(ctx, r) {
    if (!r) return;
    const t = Game.frame || 0;
    ctx.save();
    ctx.translate(r.x, r.y);
    // 장작
    ctx.fillStyle = '#060506';
    ctx.save(); ctx.rotate(0.35); ctx.fillRect(-16, -6, 32, 6); ctx.restore();
    ctx.save(); ctx.rotate(-0.35); ctx.fillRect(-16, -6, 32, 6); ctx.restore();
    // 불빛
    const k = r.used ? 0.25 : 1;
    const g = ctx.createRadialGradient(0, -14, 2, 0, -14, 90);
    g.addColorStop(0, `rgba(255,170,70,${(0.45 * k).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-90, -104, 180, 104);
    // 불꽃
    ctx.shadowColor = '#ff8a2a';
    ctx.shadowBlur = 14 * k;
    for (let i = 0; i < (r.used ? 1 : 3); i++) {
      const h = (r.used ? 8 : 26 - i * 6) + Math.sin(t * 0.3 + i * 2) * 4;
      const ox = (i - 1) * 6 + Math.sin(t * 0.2 + i) * 2;
      ctx.fillStyle = i === 2 ? '#fff0c0' : i === 1 ? '#ffb040' : '#ff6a20';
      ctx.beginPath();
      ctx.moveTo(ox - 7 + i * 2, -4);
      ctx.quadraticCurveTo(ox - 4, -h * 0.6, ox, -h);
      ctx.quadraticCurveTo(ox + 4, -h * 0.6, ox + 7 - i * 2, -4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    const p = Game.player;
    if (!r.used && !r.quiet && Math.abs(p.x - r.x) < 90) {
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      const txt = `${Input.label('up')}: 모닥불에서 쉬기 (체력 +${Math.round(r.heal * 100)}%)`;
      ctx.strokeText(txt, 0, -50);
      ctx.fillStyle = '#ffe0a0';
      ctx.fillText(txt, 0, -50);
    }
    ctx.restore();
  },

  // 보상 상자: 최고 랭크 색으로 빛남
  chest(ctx, ch) {
    if (!ch) return;
    const R = CONFIG.style.ranks;
    const col = ch.rank >= 0 ? R[ch.rank].color : '#aaa';
    const t = Game.frame || 0;
    ctx.save();
    ctx.translate(ch.x, ch.y);
    if (!ch.opened) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 10 + Math.sin(t * 0.12) * 4;
    }
    ctx.fillStyle = '#060506';
    ctx.fillRect(-ch.w / 2, -ch.h * 0.62, ch.w, ch.h * 0.62);
    if (ch.opened) {
      // 뚜껑 열림
      ctx.save();
      ctx.translate(-ch.w / 2, -ch.h * 0.62);
      ctx.rotate(-1.9);
      ctx.fillRect(0, -ch.h * 0.38, ch.w, ch.h * 0.38);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.moveTo(-ch.w / 2, -ch.h * 0.62);
      ctx.quadraticCurveTo(0, -ch.h * 1.15, ch.w / 2, -ch.h * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = col;
      ctx.fillRect(-3, -ch.h * 0.7, 6, 7);
      // 안내
      const p = Game.player;
      if (Math.abs(p.x - ch.x) < 70) {
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        const txt = `공격 또는 ${Input.label('up')} 로 열기`;
        ctx.strokeText(txt, 0, -ch.h - 14);
        ctx.fillText(txt, 0, -ch.h - 14);
      }
    }
    ctx.restore();
  },

  // ---------- 플레이어 ----------
  player(ctx, p) {
    const fig = Anim.playerFigure(p);
    if (p.invuln > 0 && p.state !== 'hurt' && !p.dead && (p.invuln >> 2) % 2 === 0) ctx.globalAlpha = 0.45;
    const white = p.flash > 0;
    let col = white ? '#ffffff' : '#060608';
    let back = white ? '#e8e8e8' : '#2a2328';
    let glow = null, blur = 8 + 5 * p.chargeLevel;
    if (p.state === 'charge' && p.chargeLevel > 0) glow = p.chargeLevel >= 2 ? '#bff' : '#3ef';
    if (p.state === 'guardBreak') { glow = '#ff7a40'; blur = 10; }
    // 어두운 화면: 청록 테두리 → 완전히 어두우면 밝은 실루엣
    if (this.lit > 0.05 && !white) {
      glow = '#3ff'; blur = 6 + 10 * this.lit;
      if (this.lit > 0.5) { col = '#eafcff'; back = '#a9c9cf'; }
    }

    // 철벽(대검 Q): 주황 테두리 / 간파 자세(검 Q): 청록 테두리
    if (!glow && p.ironWall > 0) { glow = '#ffa040'; blur = 8 + Math.sin(p.ironWall * 0.3) * 4; }
    if (!glow && p.state === 'stance') { glow = '#7ff'; blur = 10; }
    if (p.state === 'stance') {
      const k = clamp01(p.stanceTimer / 20);
      ctx.save();
      ctx.globalAlpha = 0.5 * k;
      ctx.strokeStyle = '#bff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 34 + Math.sin(p.stateFrame * 0.2) * 3, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (p.ironWall > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(p.ironWall * 0.3);
      ctx.strokeStyle = '#ffb050';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y - p.h * 0.5, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    Anim.drawFigure(ctx, fig, { color: col, back, glow, glowBlur: blur }, p.scarf);

    // 칼: 검은 칼날 (궤적만 청록). 패링 성공 후 크리티컬 확정 상태면 금빛
    const b = fig.blade, B = b.spec, pal = p.trailPal();
    ctx.save();
    if (p.critReady > 0) { ctx.shadowColor = '#ffc830'; ctx.shadowBlur = 10 + Math.sin(p.critReady * 0.3) * 4; }
    else if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
    else if (p.swapFlash > 0) { ctx.shadowColor = pal.glow; ctx.shadowBlur = p.swapFlash; }
    if (B.fist) {
      // 건틀릿: 양손에 쇠주먹 (판정 중엔 앞주먹이 빛남)
      const hot = p.isActiveFrame();
      if (hot) { ctx.shadowColor = pal.glow; ctx.shadowBlur = 14; }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(fig.j.handB.x, fig.j.handB.y, 3.4, 0, Math.PI * 2);
      ctx.arc(b.hand.x, b.hand.y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hot ? `rgb(${pal.inner})` : `rgba(${pal.outer},0.55)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(b.hand.x, b.hand.y, 4.2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      Anim.drawBlade(ctx, b.base, b.tip, B.w0, B.w1, col);
      // 코등이
      const gx = b.guard.x, gy2 = b.guard.y;
      const dx = b.tip.x - b.base.x, dy = b.tip.y - b.base.y, L = Math.hypot(dx, dy) || 1;
      const gw = 3 + B.w0 * 0.6;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(gx - dy / L * gw, gy2 + dx / L * gw);
      ctx.lineTo(gx + dy / L * gw, gy2 - dx / L * gw);
      ctx.stroke();
    }
    ctx.restore();

    // 공명: 무기에 청록 글로우 (단계가 높을수록 밝게)
    if (p.res.timer > 0 && !white) {
      const g = CONFIG.swap.resonance.glow[p.res.level - 1];
      const fade = Math.min(1, p.res.timer / 30);
      ctx.save();
      ctx.globalAlpha = (0.35 + 0.6 * g) * fade;
      ctx.shadowColor = '#3ff';
      ctx.shadowBlur = 6 + 18 * g;
      ctx.strokeStyle = g >= 1 ? '#f0ffff' : '#8ff';
      ctx.lineCap = 'round';
      if (B.fist) {
        ctx.lineWidth = 1 + 1.5 * g;
        ctx.beginPath();
        ctx.arc(b.hand.x, b.hand.y, 5.5 + 2 * g, 0, Math.PI * 2);
        ctx.arc(fig.j.handB.x, fig.j.handB.y, 4.5 + 2 * g, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.lineWidth = 1 + 1.6 * g;
        ctx.beginPath();
        ctx.moveTo(b.base.x, b.base.y);
        ctx.lineTo(b.tip.x, b.tip.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 판정 중: 칼날을 따라 검기가 뻗어나감
    if (p.isActiveFrame() && p.state === 'attack' && !p.move.swing.thrust && !B.fist) {
      const far = p.bladePoint(b.pose, b.pose.r, {});
      ctx.save();
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = `rgba(${pal.inner},0.95)`;
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
      const k = p.parryFlash > 0 ? p.parryFlash / 14 : 1 - (Game.simTime - p.parryStart) / CONFIG.parry.windowMs;
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
    // 정예: 몸을 키워 그림 (발밑 기준)
    if (e.scale) { ctx.translate(e.x, e.y); ctx.scale(e.scale, e.scale); ctx.translate(-e.x, -e.y); }
    if (e.dead && !e.executed) ctx.globalAlpha = Math.max(0, 1 - e.stateFrame / 24);
    const white = e.flash > 0;
    let col = '#060506', back = '#2b2225', glow = null, blur = 0;
    // 예고: 빨강(패링 불가) / 노랑(패링 가능) / 흰색 섬광(간파, 보스) 기운이 깜빡이며 차오름
    if (e.telegraphing) {
      const tc = e.telegraphColor;
      const k = e.teleProgress;
      const on = (e.stateFrame >> 2) % 2 === 0;
      glow = Render.TELE[tc].glow;
      blur = on ? 10 + 16 * k : 6;
      if (on) { col = Render.TELE[tc].body; back = Render.TELE[tc].back; }
    } else if (e.state === 'broken' || e.state === 'groggy') {
      // 체간 붕괴 / 보스 그로기: 붉게 맥동
      glow = '#ff2a1a';
      blur = 8 + Math.sin((Game.frame || 0) * 0.3) * 5;
    } else if (e.isBoss) {
      // 보스 2페이즈: 분노의 기운
      if (e.phase === 2) { glow = e.cfg.aura; blur = 10 + Math.sin((Game.frame || 0) * 0.2) * 4; }
    } else if (e.armored) {
      // 슈퍼아머: 은빛 테두리
      glow = 'rgba(190,205,225,0.9)';
      blur = 5;
    } else if (e.elite) {
      // 정예: 층 색 기운
      glow = e.eliteColor;
      blur = 7 + Math.sin((Game.frame || 0) * 0.15 + e.seed) * 3;
    }
    if (white) { col = '#ffffff'; back = '#e8e8e8'; glow = null; }
    if (this.lit > 0.05 && !white) {
      glow = glow || '#ff3030'; blur = Math.max(blur, 5 + 10 * this.lit);
      if (this.lit > 0.5) { col = '#fbeeee'; back = '#cbb5b5'; }
    }

    if (look.weapon === 'claws') this.wings(ctx, fig, e, col, back);
    Anim.drawFigure(ctx, fig, { color: col, back, glow, glowBlur: blur });
    ctx.save();
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = blur; }
    this.enemyGear(ctx, fig, e, col);
    ctx.restore();
    if (look.body === 'dummy') {
      // 허수아비: 말뚝 + 밀짚모자 + 짚 색 눈
      const j = fig.j;
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(j.hip.x, j.hip.y);
      ctx.lineTo(e.x, e.y + 2);
      ctx.stroke();
      const hx = j.head.x, hy = j.head.y - fig.dim.headR * 0.6;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(hx - 13, hy + 2); ctx.lineTo(hx + 13, hy + 2); ctx.lineTo(hx + 4, hy - 4); ctx.lineTo(hx, hy - 10); ctx.lineTo(hx - 4, hy - 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (!white) Anim.drawEye(ctx, fig, '#e8c070', '#c80', 2);
    } else if (!white) Anim.drawEye(ctx, fig, '#ff5050', '#f00', look.body === 'heavy' ? 2.6 : 2.2);
    ctx.restore();

    if (e.executed) return;   // 처형 대상은 처형 연출이 마저 그림
    const headY = fig.j.head.y - fig.dim.headR;
    // 예고 표시 "!"
    if (e.telegraphing) {
      const k = e.teleProgress;
      const c = Render.TELE[e.telegraphColor].mark;
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
    if (e.isBoss) {   // 보스는 화면 아래 큰 바 + 그로기 표식만
      if (e.state === 'groggy') this.executePrompt(ctx, e, headY - 18);
      return;
    }
    // 체력바 + 체간 바 (세키로식: 가운데서 양옆으로 차오름)
    const bw = look.body === 'heavy' ? 56 : 40;
    const by = Math.min(e.y - e.h - 12, headY - 10);
    if (!e.dead && (e.hpShow > 0 || e.posture > 0)) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = '#d33';
      ctx.fillRect(e.x - bw / 2, by, bw * (e.hp / e.maxHp), 3);
    }
    if (!e.dead && e.posture > 0.5) this.postureBar(ctx, e.x, by - 7, bw, e.posture / e.maxPosture, e.state === 'broken', e.postureFlash > 0);
    // 체간 붕괴: 붉은 처형 표식 + 안내
    if (e.state === 'broken' && !e.dead) this.executePrompt(ctx, e, by - 22);
  },

  // 처형 가능 표식 (붉은 마름모) + 안내
  executePrompt(ctx, e, my) {
    const t = (Game.frame || 0);
    const pulse = 1 + Math.sin(t * 0.25) * 0.15;
    ctx.save();
    ctx.translate(e.x, my);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ff2a1a';
    ctx.shadowColor = '#f00';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(7, 0); ctx.lineTo(0, 9); ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -4); ctx.lineTo(3, 0); ctx.lineTo(0, 4); ctx.lineTo(-3, 0);
    ctx.fill();
    ctx.restore();
    const near = Math.abs(Game.player.x - e.x) <= CONFIG.posture.executeRange;
    ctx.save();
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = near ? '#fff' : 'rgba(255,255,255,0.6)';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    const txt = `${Input.label('light')} 처형` + (e.isBoss ? ` / ${Input.label('down')}+${Input.label('heavy')} 띄우기` : '');
    ctx.strokeText(txt, e.x, e.y + 16);
    ctx.fillText(txt, e.x, e.y + 16);
    ctx.restore();
  },

  // 예고 색 (색 = 정보)
  TELE: {
    red: { glow: '#ff1a1a', body: '#2a0505', back: '#4a1010', mark: '#ff2a2a' },
    yellow: { glow: '#ffd21a', body: '#2a2205', back: '#4a3e10', mark: '#ffd21a' },
    white: { glow: '#ffffff', body: '#5a5a5a', back: '#8a8a8a', mark: '#ffffff' },
  },

  // 체간 바: 가운데에서 양옆으로. 찰수록 노랑 → 주황 → 빨강
  // 적 머리 위 약점 무기 아이콘 (지금 든 무기가 약점이면 밝게 빛남)
  weakIcon(ctx, e, p) {
    const w = e.weakTo;
    if (!w || e.dead || e.executed) return;
    const on = p.weaponType() === w, W = CONFIG.weapons[w];
    const x = e.x, y = e.y - e.h - (e.isBoss ? 30 : 34);
    ctx.save();
    ctx.globalAlpha = on ? 1 : 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(x, y, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = on ? `rgb(${W.trail.inner})` : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    if (on) { ctx.shadowColor = W.trail.glow; ctx.shadowBlur = 8 + Math.sin((Game.frame || 0) * 0.2) * 3; }
    ctx.stroke();
    ctx.shadowBlur = 0;
    Loot.drawIcon(ctx, { type: w, rarity: 0, icon: true, tint: on ? `rgb(${W.trail.inner})` : '#ccc' }, x, y, 0.55);
    ctx.restore();
  },

  postureBar(ctx, x, y, w, t, broken, flash) {
    t = clamp01(t);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
    const r = 255, g = Math.round(210 - 170 * t), b = Math.round(60 - 50 * t);
    ctx.fillStyle = broken ? ((Game.frame >> 2) % 2 ? '#ff3020' : '#ffd0a0') : flash ? '#fff2c0' : `rgb(${r},${g},${b})`;
    ctx.fillRect(x - (w / 2) * t, y, w * t, 2);
    // 가운데 눈금
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x - 0.5, y - 1, 1, 4);
  },

  // 처형 대상: 붉은 일섬 표시 → 두 동강
  executionTarget(ctx, ex) {
    const e = ex.target, X = CONFIG.execution;
    const slashAt = X.prepFrames, splitAt = slashAt + X.stillFrames;
    if (ex.survived) return;   // 보스가 버텼으면 일반 렌더가 그림
    if (ex.f < splitAt) {
      this.enemy(ctx, e);
    } else {
      // 위/아래로 나뉘어 벌어지며 사라짐
      const k = ex.f - splitAt;
      const a = Math.max(0, 1 - k / X.splitFrames);
      const sep = ex.split;
      const cy = ex.cutY;
      for (const half of [0, 1]) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.beginPath();
        if (half === 0) ctx.rect(e.x - 200, cy - 300, 400, 300);
        else ctx.rect(e.x - 200, cy, 400, 300);
        ctx.clip();
        if (half === 0) {
          ctx.translate(ex.dir * sep * 0.8, -sep * 0.35 + k * k * 0.01);
          ctx.translate(e.x, cy); ctx.rotate(ex.dir * sep * 0.012); ctx.translate(-e.x, -cy);
        } else {
          ctx.translate(-ex.dir * sep * 0.25, 0);
        }
        this.enemy(ctx, e);
        ctx.restore();
      }
    }
    // 붉은 일섬 표시 (예고)
    if (ex.f < slashAt + 4) {
      const t = clamp01(ex.f / (slashAt * 0.7));
      const len = 70 * ease.outCubic(t);
      ctx.save();
      ctx.strokeStyle = '#ff2a1a';
      ctx.shadowColor = '#f00';
      ctx.shadowBlur = 16;
      ctx.lineCap = 'round';
      ctx.lineWidth = 3 + 2 * Math.sin(ex.f * 0.6);
      ctx.beginPath();
      ctx.moveTo(e.x - len * 0.7, ex.cutY - len * 0.25);
      ctx.lineTo(e.x + len * 0.7, ex.cutY + len * 0.25);
      ctx.stroke();
      ctx.restore();
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
      case 'greatsword':
        Anim.drawBlade(ctx, w.base, w.tip, 3.4, 6.5, col);
        this.bossCrest(ctx, fig, e, col);
        break;
      case 'lance': {
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(w.base.x, w.base.y); ctx.lineTo(w.tip.x, w.tip.y); ctx.stroke();
        const dx = w.tip.x - w.base.x, dy = w.tip.y - w.base.y, L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        // 창날 + 깃발
        ctx.beginPath();
        ctx.moveTo(w.tip.x + ux * 16, w.tip.y + uy * 16);
        ctx.lineTo(w.tip.x + nx * 5, w.tip.y + ny * 5);
        ctx.lineTo(w.tip.x - nx * 5, w.tip.y - ny * 5);
        ctx.closePath(); ctx.fill();
        const fx = w.tip.x - ux * 14, fy = w.tip.y - uy * 14, wave = Math.sin((Game.frame || 0) * 0.3) * 3;
        ctx.beginPath();
        ctx.moveTo(fx, fy); ctx.lineTo(fx - ux * 14 + nx * (10 + wave), fy - uy * 14 + ny * (10 + wave)); ctx.lineTo(fx - ux * 16, fy - uy * 16);
        ctx.closePath(); ctx.fill();
        this.bossCrest(ctx, fig, e, col);
        break;
      }
      case 'flameblade': {
        Anim.drawBlade(ctx, w.base, w.tip, 3.2, 6, col);
        // 칼날을 따라 일렁이는 불꽃
        const t = Game.frame || 0;
        ctx.save();
        ctx.shadowColor = '#ff6020';
        ctx.shadowBlur = 12;
        for (let i = 0; i < 6; i++) {
          const k = (i + 1) / 7, fx = w.base.x + (w.tip.x - w.base.x) * k, fy = w.base.y + (w.tip.y - w.base.y) * k;
          const fl = 4 + Math.sin(t * 0.5 + i * 1.7) * 2.5;
          ctx.fillStyle = i % 2 ? 'rgba(255,140,40,0.85)' : 'rgba(255,210,90,0.85)';
          ctx.beginPath();
          ctx.ellipse(fx, fy - fl * 0.6, 2.4, fl, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        this.bossCrest(ctx, fig, e, col);
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

  // 보스 투구 장식: 검귀 = 뿔, 창기사 = 깃털 장식, 성주 = 왕관
  bossCrest(ctx, fig, e, col) {
    const j = fig.j, d = fig.dim, f = fig.facing;
    const hx = j.head.x, hy = j.head.y, r = d.headR;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    if (e.bossId === 'dusk') {
      ctx.lineWidth = 3;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * 3, hy - r * 0.6);
        ctx.quadraticCurveTo(hx + s * 10, hy - r - 6, hx + s * 6 - f * 4, hy - r - 14);
        ctx.stroke();
      }
    } else if (e.bossId === 'moon') {
      const wave = Math.sin((Game.frame || 0) * 0.15) * 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy - r);
      ctx.quadraticCurveTo(hx - f * 10, hy - r - 16, hx - f * (24 + wave), hy - r - 4);
      ctx.quadraticCurveTo(hx - f * 10, hy - r - 6, hx, hy - r + 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(hx - r, hy - r * 0.5);
      for (let i = 0; i <= 4; i++) {
        const x = hx - r + (2 * r) * (i / 4);
        ctx.lineTo(x, hy - r - (i % 2 ? 2 : 8));
        if (i < 4) ctx.lineTo(x + r / 4, hy - r * 0.6);
      }
      ctx.lineTo(hx + r, hy - r * 0.5);
      ctx.fill();
    }
    // 어깨 갑주
    ctx.beginPath();
    ctx.arc(j.shoulder.x, j.shoulder.y + 2, 9, Math.PI, 0);
    ctx.fill();
  },

  // 보스 바닥 경고: 붉은 원이 차오르고 안쪽 고리가 좁혀지면 폭발. 내려찍기 착지 표시
  bossHazards(ctx, b) {
    for (const z of b.zones) {
      ctx.save();
      if (!z.boom) {
        const k = clamp01(z.t / z.warn);
        ctx.fillStyle = `rgba(255,40,20,${(0.12 + 0.3 * k).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(z.x, z.y - 2, z.r, z.r * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff3a20';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#f00';
        ctx.shadowBlur = 8;
        ctx.stroke();
        const rr = z.r * (1.6 - 0.6 * k);   // 좁혀오는 고리 = 남은 시간
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.ellipse(z.x, z.y - 2, rr, rr * 0.22, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const k = z.boom / 22;
        ctx.globalAlpha = 1 - k;
        const g = ctx.createLinearGradient(0, z.y - 140, 0, z.y);
        g.addColorStop(0, 'rgba(255,120,40,0)');
        g.addColorStop(1, 'rgba(255,200,90,0.9)');
        ctx.fillStyle = g;
        ctx.fillRect(z.x - z.r * 0.6 * (1 - k * 0.5), z.y - 140, z.r * 1.2 * (1 - k * 0.5), 140);
      }
      ctx.restore();
    }
    const m = b.marker;
    if (m) {
      const k = clamp01(m.t / m.T);
      ctx.save();
      ctx.strokeStyle = '#ff3a20';
      ctx.fillStyle = `rgba(255,30,20,${(0.1 + 0.25 * k).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = '#f00';
      ctx.shadowBlur = 10;
      const r = b.pat ? b.pat.cfg.radius : 110;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y - 2, r, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(m.x - 10, m.y - 2); ctx.lineTo(m.x + 10, m.y - 2);
      ctx.moveTo(m.x, m.y - 8); ctx.lineTo(m.x, m.y + 4);
      ctx.stroke();
      ctx.restore();
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

  // ---------- 패링 디버그 (` 키) ----------
  // 플레이어 주변 원: 초록 = 패링 활성 (남은 시간만큼 호), 주황 = 늦은 입력 보정 대기, 빨강 = 패링 불가
  // 적: 공격 판정 박스 (예고 중엔 점선 + 타격까지 남은 시간, 판정 중엔 실선)
  parryDebug(ctx, game) {
    const p = game.player, PR = CONFIG.parry, now = game.simTime;
    const cx = p.x, cy = p.y - p.h * 0.5;
    const arc = (r, t, color, w, dash) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      if (dash) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(t));
      ctx.stroke();
      ctx.restore();
    };
    ctx.save();
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    if (p.isParrying()) {
      const left = PR.windowMs - (now - p.parryStart);
      ctx.fillStyle = 'rgba(80,255,120,0.12)';
      ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.fill();
      arc(40, left / PR.windowMs, '#5f8', 3);
      ctx.fillStyle = '#7fa';
      ctx.fillText(`PARRY ${Math.max(0, left).toFixed(0)}ms`, cx, cy - 46);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.stroke();
    }
    for (const h of p.pendingHits) {
      const left = PR.lateGraceMs - (now - h.time);
      arc(48, left / PR.lateGraceMs, '#ffa040', 3);
      ctx.fillStyle = '#fb6';
      ctx.fillText(`보정 ${Math.max(0, left).toFixed(0)}ms`, cx, cy + 58);
    }
    if (p.parryLocked()) {
      const left = p.parryLockedUntil - now;
      arc(34, left / PR.lockoutMs, '#f55', 2, true);
      ctx.fillStyle = '#f88';
      ctx.fillText(`금지 ${left.toFixed(0)}ms`, cx, cy + 46);
    }
    if (p.state === 'guard') {
      ctx.fillStyle = '#9cf';
      ctx.fillText('GUARD', cx, cy - 46);
    }
    // 적 공격 판정
    const STEP = 1000 / CONFIG.fps;
    for (const e of game.enemies) {
      if (e.dead || !e.atk || !e.atk.hitbox) continue;
      const col = Render.TELE[e.telegraphColor].mark;
      if (e.state === 'windup') {
        const hb = Combat.worldBox(e, e.atk.hitbox);
        ctx.save();
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.7;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
        ctx.restore();
        const toHit = (e.atk.windup + 1 - e.stateFrame) * STEP;
        ctx.fillStyle = col;
        ctx.fillText(`${(toHit / 1000).toFixed(2)}s`, hb.x + hb.w / 2, hb.y - 4);
      } else if (e.state === 'attack') {
        const hb = Combat.worldBox(e, e.atk.hitbox);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
      }
    }
    ctx.restore();
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

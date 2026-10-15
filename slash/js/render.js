'use strict';
// 월드 그리기: 배경, 지형, 캐릭터. (1단계: 도형 임시 그래픽)

const Render = {
  // 패럴랙스 원경 (한 번 생성)
  _layers: null,

  buildLayers() {
    const layers = [];
    const specs = [
      { factor: 0.15, base: 330, amp: 70, step: 120, color: '#5a3a44' },
      { factor: 0.35, base: 380, amp: 50, step: 80, color: '#3a2630' },
      { factor: 0.6, base: 420, amp: 30, step: 50, color: '#24161c' },
    ];
    for (const s of specs) {
      const pts = [];
      let seed = s.step * 7.3;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let x = -200; x <= 3000; x += s.step) pts.push([x, s.base - rnd() * s.amp]);
      layers.push({ ...s, pts });
    }
    this._layers = layers;
  },

  background(ctx, cam) {
    const V = CONFIG.view;
    const g = ctx.createLinearGradient(0, 0, 0, V.height);
    g.addColorStop(0, '#2d2236');
    g.addColorStop(0.55, '#8a5a52');
    g.addColorStop(1, '#c98a5c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, V.width, V.height);

    // 해
    ctx.fillStyle = 'rgba(255,200,140,0.35)';
    ctx.beginPath();
    ctx.arc(V.width * 0.7 - cam.x * 0.05, 300, 70, 0, Math.PI * 2);
    ctx.fill();

    if (!this._layers) this.buildLayers();
    for (const L of this._layers) {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(-10, V.height);
      for (const [x, y] of L.pts) ctx.lineTo(x - cam.x * L.factor, y - cam.y * L.factor);
      ctx.lineTo(V.width + 10, V.height);
      ctx.closePath();
      ctx.fill();
    }
  },

  level(ctx, level) {
    ctx.fillStyle = '#050405';
    for (const r of level.rects) {
      if (r.oneWay) {
        ctx.fillRect(r.x, r.y, r.w, 6);
        ctx.fillStyle = 'rgba(5,4,5,0.6)';
        ctx.fillRect(r.x + 6, r.y + 6, r.w - 12, 4);
        ctx.fillStyle = '#050405';
      } else {
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }
  },

  // ---------- 플레이어 (임시 도형) ----------
  player(ctx, p) {
    if (p.invuln > 0 && p.state !== 'hurt' && (p.invuln >> 2) % 2 === 0) ctx.globalAlpha = 0.5;
    let sx = 1, sy = 1;
    if (p.landSquash > 0) { const k = p.landSquash / 8; sx = 1 + 0.25 * k; sy = 1 - 0.2 * k; }
    else if (!p.onGround && p.vy < -3) { sx = 0.85; sy = 1.15; }
    if (p.state === 'dash') { sx = 1.3; sy = 0.8; }

    // 공격 예비동작: 몸을 뒤로 젖힘
    let lean = 0;
    if (p.state === 'attack' && p.move) {
      const f = p.stateFrame, m = p.move;
      if (f < m.startup) lean = -0.25 * (f / m.startup);
      else if (f < m.startup + m.active) lean = 0.2;
      else lean = 0.2 * (1 - (f - m.startup - m.active) / m.recovery);
    }
    if (p.state === 'charge') lean = -0.2;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(sx * p.facing, sy);
    ctx.transform(1, 0, -lean * 0.6, 1, 0, 0); // 기울임 (발 고정)
    const w = p.w, h = p.h;
    const white = p.flash > 0;
    ctx.fillStyle = white ? '#fff' : '#0a0a0c';
    // 몸
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h, w, h, 6);
    ctx.fill();
    // 목도리
    ctx.fillStyle = white ? '#fff' : '#0a0a0c';
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h + 14);
    ctx.lineTo(-w / 2 - 14 - Math.abs(p.vx) * 2, -h + 12 + Math.sin(performance.now() / 90) * 3);
    ctx.lineTo(-w / 2, -h + 20);
    ctx.fill();
    // 눈 (청록 글로우)
    if (!white) {
      ctx.shadowColor = '#3ff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#6ff';
      ctx.fillRect(w / 2 - 9, -h + 9, 7, 3);
      ctx.shadowBlur = 0;
    }
    // 검 (임시: 막대)
    ctx.strokeStyle = white ? '#fff' : '#111';
    ctx.lineWidth = 3;
    ctx.beginPath();
    let ang = 0.9;   // 기본: 아래로 늘어뜨림
    if (p.state === 'attack' && p.move) {
      const f = p.stateFrame, m = p.move;
      const a0 = (m.arc.from) * Math.PI / 180, a1 = (m.arc.to) * Math.PI / 180;
      if (f < m.startup) ang = a0;
      else if (f < m.startup + m.active) ang = a0 + (a1 - a0) * ((f - m.startup + 1) / m.active);
      else ang = a1;
    } else if (p.state === 'charge') ang = -2.4;
    const len = 34;
    ctx.moveTo(4, -28);
    ctx.lineTo(4 + Math.cos(ang) * len, -28 + Math.sin(ang) * len);
    ctx.stroke();

    // 차지 글로우
    if (p.state === 'charge') {
      ctx.strokeStyle = p.chargeLevel >= 2 ? '#fff' : '#3ff';
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(p.stateFrame * 0.5);
      ctx.lineWidth = 2 + p.chargeLevel * 2;
      ctx.beginPath();
      ctx.arc(0, -h / 2, 30 + p.chargeLevel * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  },

  // ---------- 적 (임시 도형) ----------
  enemy(ctx, e) {
    ctx.save();
    if (e.dead) ctx.globalAlpha = Math.max(0, 1 - e.stateFrame / 24);
    ctx.translate(e.x, e.y);
    ctx.scale(e.facing, 1);
    let lean = 0;
    if (e.state === 'windup') lean = -0.3 * Math.min(1, e.stateFrame / 10);
    else if (e.state === 'attack') lean = 0.35;
    else if (e.state === 'hurt') lean = -0.25;
    ctx.transform(1, 0, -lean * 0.6, 1, 0, 0);

    const w = e.w, h = e.h;
    const white = e.flash > 0;
    const tele = e.telegraphing && (e.stateFrame >> 2) % 2 === 0;
    if (e.telegraphing) {
      // 빨강 예고: 외곽 글로우
      ctx.shadowColor = '#f22';
      ctx.shadowBlur = tele ? 22 : 10;
    }
    ctx.fillStyle = white ? '#fff' : (tele ? '#4a0a0a' : e.cfg.color);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h, w, h, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 눈 (빨강)
    if (!white) {
      ctx.shadowColor = '#f00';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ff3030';
      ctx.fillRect(w / 2 - 10, -h + 10, 6, 3);
      ctx.shadowBlur = 0;
    }
    // 무기
    ctx.strokeStyle = white ? '#fff' : '#120c0e';
    ctx.lineWidth = 3;
    let ang = 0.8;
    if (e.state === 'windup') ang = -2.2;
    else if (e.state === 'attack') ang = -2.2 + Math.min(1, e.stateFrame / 3) * 3;
    ctx.beginPath();
    ctx.moveTo(4, -26);
    ctx.lineTo(4 + Math.cos(ang) * 30, -26 + Math.sin(ang) * 30);
    ctx.stroke();
    ctx.restore();

    // 예고 표시 "!"
    if (e.telegraphing) {
      ctx.fillStyle = '#ff3030';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', e.x, e.y - e.h - 14);
    }
    // 체력바
    if (!e.dead && e.hpShow > 0) {
      const bw = 40;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(e.x - bw / 2 - 1, e.y - e.h - 9, bw + 2, 5);
      ctx.fillStyle = '#d33';
      ctx.fillRect(e.x - bw / 2, e.y - e.h - 8, bw * (e.hp / e.maxHp), 3);
    }
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
      if (e.state === 'attack' || e.state === 'windup') {
        const hb = Combat.worldBox(e, e.cfg.hitbox);
        ctx.strokeStyle = e.state === 'attack' ? '#f00' : 'rgba(255,0,0,0.35)';
        ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
      }
    }
  },
};

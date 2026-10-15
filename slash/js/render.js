'use strict';
// 월드 그리기: 배경, 지형, 캐릭터. (1단계: 도형 임시 그래픽)

const Render = {
  // 패럴랙스 원경 (한 번 생성)
  _layers: null,

  buildLayers() {
    const layers = [];
    const specs = [
      { factor: 0.15, base: 330, amp: 70, step: 120, color: '#d7a089' },
      { factor: 0.35, base: 380, amp: 50, step: 80, color: '#b97f70' },
      { factor: 0.6, base: 420, amp: 30, step: 50, color: '#93605a' },
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
    // 밝은 노을: 검은 실루엣이 잘 보이도록 배경은 밝게
    g.addColorStop(0, '#8e7a96');
    g.addColorStop(0.5, '#e8a983');
    g.addColorStop(1, '#f7d39a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, V.width, V.height);

    // 해
    ctx.fillStyle = 'rgba(255,240,200,0.75)';
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
    this.playerBlade(ctx, p, white);
    ctx.globalAlpha = 1;
  },

  // 칼: 플레이어의 bladePose 를 그대로 사용 (검기 리본과 정확히 일치)
  playerBlade(ctx, p, white) {
    const pose = p.bladePose();
    const L = CONFIG.player.bladeLength;
    const base = p.bladePoint(pose, 0, {});
    const grip = p.bladePoint(pose, 8, {});
    const tip = p.bladePoint(pose, L, {});
    ctx.lineCap = 'round';
    // 팔 (어깨 → 손잡이)
    ctx.strokeStyle = white ? '#fff' : '#0a0a0c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 34);
    ctx.lineTo(grip.x, grip.y);
    ctx.stroke();
    // 칼날
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    // 판정 중: 칼끝에서 검기가 뻗어나감
    if (p.isActiveFrame() && p.state === 'attack' && !p.move.swing.thrust) {
      const far = p.bladePoint(pose, pose.r, {});
      ctx.save();
      ctx.shadowColor = '#3ff';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(200,255,255,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(grip.x, grip.y);
      ctx.lineTo(far.x, far.y);
      ctx.stroke();
      ctx.restore();
    }
  },

  // ---------- 적 (임시 도형) ----------
  enemy(ctx, e) {
    ctx.save();
    if (e.dead) ctx.globalAlpha = Math.max(0, 1 - e.stateFrame / 24);
    ctx.translate(e.x, e.y);
    ctx.scale(e.facing, 1);
    // 띄워짐: 몸이 뒤로 젖혀지며 회전 / 다운: 누움 / 기상: 일어남
    if (e.state === 'launched' || (e.state === 'dead' && !e.onGround)) {
      const rot = Math.max(-1.3, Math.min(0.6, -0.6 + e.vy * 0.08));
      ctx.translate(0, -e.h / 2);
      ctx.rotate(rot);
      ctx.translate(0, e.h / 2);
    } else if (e.state === 'down') {
      // 회전된 좌표에서 +x 는 화면 위쪽 → 몸 두께 절반만큼 올려서 바닥 위에 눕힘
      ctx.rotate(-Math.PI / 2);
      ctx.translate(e.w / 2, 0);
    } else if (e.state === 'getup') {
      const t = e.stateFrame / CONFIG.air.getupFrames;
      ctx.rotate(-Math.PI / 2 * (1 - t));
      ctx.translate(e.w / 2 * (1 - t), 0);
    }
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

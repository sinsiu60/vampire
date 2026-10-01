'use strict';
// UI: HUD, 레벨업 카드, 일시정지/게임오버/타이틀 화면, 알림

const UI = {
  cardRects: [],
  hover: -1,
  notes: [],

  reset() {
    this.notes.length = 0;
    this.hover = -1;
  },

  notify(text, color, duration) {
    this.notes.push({ text, color: color || '#fff', life: duration || 2.5, maxLife: duration || 2.5 });
    if (this.notes.length > 4) this.notes.shift();
  },

  update(dt) {
    for (let i = this.notes.length - 1; i >= 0; i--) {
      this.notes[i].life -= dt;
      if (this.notes[i].life <= 0) this.notes.splice(i, 1);
    }
  },

  // -----------------------------------------------------------------
  // 아이콘 (도형으로만)
  // -----------------------------------------------------------------
  drawIcon(ctx, kind, key, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, s * 0.12);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (kind === 'weapon') {
      const c = CONFIG.weapons[key].color;
      ctx.fillStyle = c;
      ctx.strokeStyle = c;
      if (key === 'magicBolt') {
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#e8f7ff';
        ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, U.TAU); ctx.fill();
      } else if (key === 'orbitBlade') {
        ctx.strokeStyle = '#5c6b80';
        for (let i = 0; i < 3; i++) {
          const a = i * U.TAU / 3 - Math.PI / 2;
          ctx.save();
          ctx.translate(Math.cos(a) * s * 0.28, Math.sin(a) * s * 0.28);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(-s * 0.2, 0); ctx.lineTo(0, s * 0.08); ctx.lineTo(s * 0.2, 0); ctx.lineTo(0, -s * 0.08);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      } else if (key === 'lightning') {
        ctx.beginPath();
        ctx.moveTo(s * 0.1, -s * 0.45);
        ctx.lineTo(-s * 0.2, s * 0.05);
        ctx.lineTo(s * 0.05, s * 0.05);
        ctx.lineTo(-s * 0.1, s * 0.45);
        ctx.lineTo(s * 0.25, -s * 0.08);
        ctx.lineTo(0, -s * 0.08);
        ctx.closePath();
        ctx.fill();
      } else if (key === 'aura') {
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, U.TAU); ctx.stroke();
        ctx.fillStyle = CONFIG.player.color;
        ctx.beginPath(); ctx.arc(0, 0, s * 0.15, 0, U.TAU); ctx.fill();
      }
    } else if (kind === 'passive') {
      ctx.strokeStyle = '#ffcc80';
      ctx.fillStyle = '#ffcc80';
      if (key === 'speed') {
        for (let i = 0; i < 2; i++) {
          const ox = (i - 0.5) * s * 0.3;
          ctx.beginPath();
          ctx.moveTo(ox - s * 0.12, -s * 0.3); ctx.lineTo(ox + s * 0.15, 0); ctx.lineTo(ox - s * 0.12, s * 0.3);
          ctx.stroke();
        }
      } else if (key === 'maxHp') {
        ctx.fillStyle = '#ef5350';
        ctx.beginPath();
        ctx.moveTo(0, s * 0.38);
        ctx.bezierCurveTo(-s * 0.55, 0, -s * 0.3, -s * 0.5, 0, -s * 0.18);
        ctx.bezierCurveTo(s * 0.3, -s * 0.5, s * 0.55, 0, 0, s * 0.38);
        ctx.fill();
      } else if (key === 'might') {
        ctx.fillStyle = '#ff7043';
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.42); ctx.lineTo(s * 0.35, s * 0.3); ctx.lineTo(-s * 0.35, s * 0.3);
        ctx.closePath(); ctx.fill();
      } else if (key === 'cooldown') {
        ctx.beginPath(); ctx.arc(0, 0, s * 0.38, 0, U.TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.25); ctx.moveTo(0, 0); ctx.lineTo(s * 0.18, s * 0.08); ctx.stroke();
      } else if (key === 'magnet') {
        ctx.strokeStyle = '#ef5350';
        ctx.lineWidth = s * 0.18;
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(0, -s * 0.02, s * 0.27, Math.PI, 0, true); ctx.stroke();
        ctx.strokeStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.moveTo(-s * 0.27, -s * 0.02); ctx.lineTo(-s * 0.27, -s * 0.32);
        ctx.moveTo(s * 0.27, -s * 0.02); ctx.lineTo(s * 0.27, -s * 0.32);
        ctx.stroke();
      } else if (key === 'regen') {
        ctx.fillStyle = '#66bb6a';
        const w = s * 0.14, l = s * 0.38;
        ctx.fillRect(-w, -l, w * 2, l * 2);
        ctx.fillRect(-l, -w, l * 2, w * 2);
      }
    } else {
      ctx.fillStyle = '#ef9a9a';
      const w = s * 0.14, l = s * 0.38;
      ctx.fillRect(-w, -l, w * 2, l * 2);
      ctx.fillRect(-l, -w, l * 2, w * 2);
    }
    ctx.restore();
  },

  // -----------------------------------------------------------------
  // HUD
  // -----------------------------------------------------------------
  drawHUD(ctx, game) {
    const W = game.W, H = game.H, p = game.player;

    // 경험치 바
    const barH = 16;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, barH);
    ctx.fillStyle = '#3d8bfd';
    ctx.fillRect(0, 0, W * U.clamp(p.exp / p.expToNext, 0, 1), barH);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, 0, W * U.clamp(p.exp / p.expToNext, 0, 1), 4);
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.floor(p.exp)} / ${p.expToNext}`, W - 8, barH / 2 + 1);

    // 레벨
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px sans-serif';
    this._outlined(ctx, `Lv ${p.level}`, 12, barH + 18, '#ffe680');

    // 생존 시간
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px sans-serif';
    this._outlined(ctx, U.formatTime(game.time), W / 2, barH + 22, '#ffffff');

    // 처치 수
    ctx.textAlign = 'right';
    ctx.font = 'bold 18px sans-serif';
    this._outlined(ctx, `처치 ${game.kills}`, W - 12, barH + 18, '#ff8a80');

    // 체력 수치
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px sans-serif';
    this._outlined(ctx, `HP ${Math.ceil(p.hp)} / ${p.maxHp}`, 12, barH + 42, '#a5d6a7');

    // 보유 무기 / 패시브 아이콘
    let ix = 12;
    const iy = barH + 66, is = 26;
    for (const w of p.weapons) {
      this._slot(ctx, ix, iy, is);
      this.drawIcon(ctx, 'weapon', w.key, ix + is / 2, iy + is / 2, is);
      this._levelPip(ctx, ix, iy, is, w.level, w.maxLevel);
      ix += is + 6;
    }
    ix = 12;
    const iy2 = iy + is + 10;
    for (const k in p.passives) {
      if (p.passives[k] <= 0) continue;
      this._slot(ctx, ix, iy2, is);
      this.drawIcon(ctx, 'passive', k, ix + is / 2, iy2 + is / 2, is);
      this._levelPip(ctx, ix, iy2, is, p.passives[k], CONFIG.passives[k].maxLevel);
      ix += is + 6;
    }

    // 보스 체력바
    const boss = Enemies.boss;
    if (boss && boss.alive) {
      const bw = Math.min(520, W * 0.6), bh = 14;
      const bx = (W - bw) / 2, by = barH + 44;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#4a0000';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), bh);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 4);
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(`BOSS #${Enemies.bossCount}   ${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}`, W / 2, by + bh / 2 + 1);
      this._edgeArrow(ctx, game, boss.x, boss.y, '#ff5252');
    } else {
      // 다음 보스까지 남은 시간
      const left = Enemies.nextBossTime - game.time;
      if (left <= 15) {
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        this._outlined(ctx, `보스 등장까지 ${Math.ceil(left)}초`, W / 2, barH + 50, '#ff8a80');
      }
    }

    // 화면 밖 상자 방향 표시
    for (const c of Pickups.chests) this._edgeArrow(ctx, game, c.x, c.y, '#ffd54f');

    // 알림
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px sans-serif';
    let ny = H * 0.28;
    for (const n of this.notes) {
      ctx.globalAlpha = Math.min(1, n.life / 0.4);
      this._outlined(ctx, n.text, W / 2, ny, n.color);
      ny += 30;
    }
    ctx.globalAlpha = 1;

    // 피격 시 붉은 테두리
    if (Effects.hurtFlash > 0) {
      ctx.globalAlpha = Effects.hurtFlash * 0.35;
      ctx.strokeStyle = '#ff1744';
      ctx.lineWidth = 40;
      ctx.strokeRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    if (game.showFps) {
      ctx.textAlign = 'right';
      ctx.font = '12px monospace';
      this._outlined(ctx, `${game.fps} fps | 적 ${Enemies.list.length} | 보석 ${Pickups.gems.count} | 탄 ${Projectiles.pool.count}`, W - 12, H - 14, '#b0bec5');
    }
  },

  _slot(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  },

  _levelPip(ctx, x, y, s, lvl, max) {
    const pw = (s - 2) / max;
    for (let i = 0; i < max; i++) {
      ctx.fillStyle = i < lvl ? '#ffe680' : 'rgba(255,255,255,0.2)';
      ctx.fillRect(x + 1 + i * pw, y + s + 2, pw - 1, 3);
    }
  },

  _outlined(ctx, text, x, y, color) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  },

  // 화면 밖 대상 방향을 화면 가장자리에 화살표로 표시
  _edgeArrow(ctx, game, wx, wy, color) {
    const sx = wx - game.cam.x + game.W / 2, sy = wy - game.cam.y + game.H / 2;
    const m = 30;
    if (sx > 0 && sx < game.W && sy > 0 && sy < game.H) return;
    const cx = game.W / 2, cy = game.H / 2;
    const dx = sx - cx, dy = sy - cy;
    const k = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
    const ax = cx + dx * k, ay = cy + dy * k;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },

  _dim(ctx, game, alpha) {
    ctx.fillStyle = `rgba(5,6,10,${alpha})`;
    ctx.fillRect(0, 0, game.W, game.H);
  },

  _wrap(ctx, text, maxW) {
    const lines = [];
    let line = '';
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        // 가능하면 공백에서 줄바꿈
        const sp = line.lastIndexOf(' ');
        if (sp > 0) {
          lines.push(line.slice(0, sp));
          line = line.slice(sp + 1) + ch;
        } else {
          lines.push(line);
          line = ch;
        }
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  },

  // -----------------------------------------------------------------
  // 레벨업 카드
  // -----------------------------------------------------------------
  drawLevelUp(ctx, game) {
    const W = game.W, H = game.H;
    this._dim(ctx, game, 0.6);
    const choices = game.choices || [];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px sans-serif';
    this._outlined(ctx, 'LEVEL UP!', W / 2, H * 0.18, '#ffe680');
    ctx.font = '16px sans-serif';
    this._outlined(ctx, '업그레이드를 선택하세요  (1 / 2 / 3 키 또는 클릭)', W / 2, H * 0.18 + 38, '#cfd8dc');

    const n = choices.length;
    const gap = 20;
    const cw = Math.min(230, (W - 40 - gap * (n - 1)) / n);
    const ch = Math.min(300, H * 0.5);
    const total = cw * n + gap * (n - 1);
    const x0 = (W - total) / 2, y0 = H * 0.18 + 70;
    this.cardRects.length = 0;

    for (let i = 0; i < n; i++) {
      const c = choices[i];
      const x = x0 + i * (cw + gap), y = y0 - (this.hover === i ? 8 : 0);
      this.cardRects.push({ x, y: y0, w: cw, h: ch });

      // 카드 배경
      ctx.fillStyle = this.hover === i ? '#2b3242' : '#1e2330';
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = this.hover === i ? '#ffe680' : c.color;
      ctx.lineWidth = this.hover === i ? 3 : 2;
      ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
      ctx.fillStyle = c.color;
      ctx.fillRect(x, y, cw, 6);

      // 번호
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#90a4ae';
      ctx.fillText(`[${i + 1}]`, x + 10, y + 22);

      // 태그
      ctx.textAlign = 'right';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = c.tag.startsWith('NEW') ? '#69f0ae' : '#ffe680';
      ctx.fillText(c.tag, x + cw - 10, y + 22);

      // 아이콘
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(x + cw / 2, y + 78, 34, 0, U.TAU);
      ctx.fill();
      this.drawIcon(ctx, c.kind, c.key, x + cw / 2, y + 78, 52);

      // 이름
      ctx.textAlign = 'center';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(c.title, x + cw / 2, y + 136);

      // 설명
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#cfd8dc';
      const lines = this._wrap(ctx, c.desc, cw - 24);
      for (let l = 0; l < lines.length; l++) ctx.fillText(lines[l], x + cw / 2, y + 172 + l * 22);

      // 레벨 표시
      if (c.kind !== 'heal') {
        const max = c.kind === 'weapon' ? CONFIG.weapons[c.key].levels.length : CONFIG.passives[c.key].maxLevel;
        const pw = 18, pg = 5;
        const px0 = x + cw / 2 - (max * pw + (max - 1) * pg) / 2;
        for (let k = 0; k < max; k++) {
          ctx.fillStyle = k < c.level - 1 ? '#ffe680' : (k === c.level - 1 ? '#69f0ae' : 'rgba(255,255,255,0.15)');
          ctx.fillRect(px0 + k * (pw + pg), y + ch - 24, pw, 8);
        }
      }
    }
  },

  hitCard(mx, my) {
    for (let i = 0; i < this.cardRects.length; i++) {
      const r = this.cardRects[i];
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y - 10 && my <= r.y + r.h) return i;
    }
    return -1;
  },

  // -----------------------------------------------------------------
  // 오버레이 화면들
  // -----------------------------------------------------------------
  _controls(ctx, W, y) {
    ctx.font = '16px sans-serif';
    const lines = [
      '이동: WASD / 방향키      공격: 자동',
      '레벨업 선택: 1 / 2 / 3 또는 클릭',
      '일시정지: ESC      재시작: R      FPS 표시: F',
    ];
    for (let i = 0; i < lines.length; i++) this._outlined(ctx, lines[i], W / 2, y + i * 26, '#b0bec5');
  },

  drawTitle(ctx, game) {
    const W = game.W, H = game.H;
    this._dim(ctx, game, 0.55);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 56px sans-serif';
    this._outlined(ctx, 'NIGHT SURVIVORS', W / 2, H * 0.3, '#ff6b6b');
    ctx.font = '18px sans-serif';
    this._outlined(ctx, '몰려오는 적들 사이에서 최대한 오래 살아남으세요', W / 2, H * 0.3 + 50, '#eceff1');
    this._controls(ctx, W, H * 0.5);
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) {
      ctx.font = 'bold 24px sans-serif';
      this._outlined(ctx, 'Enter / Space / 클릭으로 시작', W / 2, H * 0.72, '#ffe680');
    }
    if (game.best) {
      ctx.font = '15px sans-serif';
      this._outlined(ctx, `최고 기록: ${U.formatTime(game.best.time)} · Lv ${game.best.level} · 처치 ${game.best.kills}`, W / 2, H * 0.72 + 40, '#90a4ae');
    }
  },

  drawPause(ctx, game) {
    const W = game.W, H = game.H, p = game.player;
    this._dim(ctx, game, 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 44px sans-serif';
    this._outlined(ctx, '일시정지', W / 2, H * 0.22, '#ffffff');
    ctx.font = '16px sans-serif';
    const stats = [
      `이동속도 ${Math.round(p.speed)}   ·   최대 체력 ${p.maxHp}   ·   공격력 x${p.might.toFixed(2)}`,
      `쿨타임 x${p.cdMult.toFixed(2)}   ·   자석 범위 ${Math.round(p.magnetRadius)}   ·   재생 ${p.regen.toFixed(1)}/s`,
    ];
    for (let i = 0; i < stats.length; i++) this._outlined(ctx, stats[i], W / 2, H * 0.34 + i * 26, '#ffe0b2');
    this._controls(ctx, W, H * 0.5);
    ctx.font = 'bold 20px sans-serif';
    this._outlined(ctx, 'ESC로 계속하기', W / 2, H * 0.72, '#ffe680');
  },

  drawGameOver(ctx, game) {
    const W = game.W, H = game.H, p = game.player;
    this._dim(ctx, game, 0.7);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 56px sans-serif';
    this._outlined(ctx, 'GAME OVER', W / 2, H * 0.24, '#ff5252');
    ctx.font = 'bold 22px sans-serif';
    const rows = [
      ['생존 시간', U.formatTime(game.time)],
      ['도달 레벨', `Lv ${p.level}`],
      ['처치 수', `${game.kills}`],
      ['처치한 보스', `${game.bossKills}`],
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = H * 0.38 + i * 36;
      ctx.textAlign = 'right';
      this._outlined(ctx, rows[i][0], W / 2 - 16, y, '#b0bec5');
      ctx.textAlign = 'left';
      this._outlined(ctx, rows[i][1], W / 2 + 16, y, '#ffffff');
    }
    ctx.textAlign = 'center';
    if (game.newBest) {
      ctx.font = 'bold 20px sans-serif';
      this._outlined(ctx, '★ 신기록! ★', W / 2, H * 0.38 + rows.length * 36 + 10, '#ffe680');
    } else if (game.best) {
      ctx.font = '16px sans-serif';
      this._outlined(ctx, `최고 기록: ${U.formatTime(game.best.time)} · Lv ${game.best.level} · 처치 ${game.best.kills}`, W / 2, H * 0.38 + rows.length * 36 + 10, '#90a4ae');
    }
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) {
      ctx.font = 'bold 24px sans-serif';
      this._outlined(ctx, 'R 키로 재시작', W / 2, H * 0.78, '#ffe680');
    }
  },
};

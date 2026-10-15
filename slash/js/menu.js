'use strict';
// 메뉴 화면: 첫 입력 대기 → "시우 공방" 로고 → 타이틀 (시작 / 콤보 연습장 / 조작법 / 설정)
//            일시정지 메뉴, 게임오버, 던전 클리어, 조작법·설정 (타이틀/일시정지 위에 겹쳐 뜸)
// Game.state: gate | logo | title | paused | gameover | victory  (playing / inventory 는 main.js)

const Menu = {
  sel: 0,
  sub: null,          // 'controls' | 'settings'
  subSel: 0,
  t: 0,               // 지금 화면에 들어온 뒤 프레임
  rects: [],          // 마우스 판정용 항목 위치
  subRects: [],
  titlePlayer: null,

  // 화면 전환할 때 부름
  enter(game, state) {
    game.setState(state);
    this.sel = 0;
    this.sub = null;
    this.t = 0;
    this.rects = [];
    Input.mouseMoved = false;
    if (state === 'title') {
      Render.setTheme(CONFIG.title.theme);
      this.titlePlayer = new Player(0, 0);
      this.titlePlayer.onGround = true;
      this.titlePlayer.facing = -1;
      this.titlePlayer.initScarf();
      Music.play('title');
    }
  },

  // ---------- 항목 ----------
  items(game) {
    const sub = (name) => () => this.openSub(name);
    switch (game.state) {
      case 'title': return [
        { label: '시작하기', desc: '5층 던전 런 — 갈림길에서 방을 골라 나아간다', act: () => game.startRun('dungeon') },
        { label: '콤보 연습장', desc: '허수아비를 상대로 콤보·저글링·패링 연습', act: () => game.startRun('practice') },
        { label: '조작법', desc: '키 배치와 전투 요령', act: sub('controls') },
        { label: '설정', desc: '소리 크기, 화면 흔들림', act: sub('settings') },
      ];
      case 'paused': return [
        { label: '계속하기', act: () => { game.setState('playing'); Sound.play('menuBack'); } },
        { label: '다시 시작', act: () => game.startRun(game.mode) },
        { label: '조작법', act: sub('controls') },
        { label: '설정', act: sub('settings') },
        { label: '타이틀로', act: () => game.toTitle() },
      ];
      case 'gameover': return [
        { label: '다시 시작', act: () => game.startRun(game.mode) },
        { label: '타이틀로', act: () => game.toTitle() },
      ];
      case 'victory': return [
        { label: '다시 도전', act: () => game.startRun('dungeon') },
        { label: '타이틀로', act: () => game.toTitle() },
      ];
    }
    return [];
  },

  openSub(name) {
    this.sub = name;
    this.subSel = 0;
    this.subRects = [];
    Sound.play('menuSelect');
  },

  clicked() { return Input.pressed.Mouse0 !== undefined; },
  anyPress() { for (const k in Input.pressed) return true; return false; },

  // ---------- 갱신 ----------
  update(game) {
    this.t++;
    switch (game.state) {
      case 'gate':
        // 첫 입력 (브라우저가 소리를 허용) → 로고
        if (this.anyPress()) { Sound.unlock(); this.enter(game, 'logo'); }
        return;
      case 'logo': this.updateLogo(game); return;
      case 'title':
        if (this.titlePlayer) { this.titlePlayer.stateFrame++; this.titlePlayer.updateScarf(); }
        break;
    }
    if (this.sub) { this.updateSub(game); return; }
    // 일시정지: Esc 로 바로 계속
    if (game.state === 'paused' && this.t > 1 && (Input.isPressed('pause') || Input.isPressed('back'))) {
      game.setState('playing');
      Sound.play('menuBack');
      return;
    }
    const items = this.items(game);
    this.navigate(items.length, (i) => { this.sel = i; }, () => this.sel, this.rects);
    if (game.state === 'gameover' && Input.isPressed('restart')) { items[0].act(); return; }
    if (this.t > 8 && (Input.isPressed('confirm') || (this.clicked() && this.hit(this.rects) === this.sel))) {
      Sound.play('menuSelect');
      items[this.sel].act();
    }
  },

  // 위/아래 + 마우스 가리키기
  navigate(n, set, get, rects) {
    let i = get();
    if (Input.isPressed('menuUp')) { i = (i - 1 + n) % n; Sound.play('menuMove'); }
    if (Input.isPressed('menuDown')) { i = (i + 1) % n; Sound.play('menuMove'); }
    if (Input.mouseMoved || this.clicked()) {
      Input.mouseMoved = false;
      const h = this.hit(rects);
      if (h >= 0 && h !== i) { i = h; Sound.play('menuMove'); }
    }
    set(i);
  },

  hit(rects) {
    const m = Input.mouse();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r && m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h) return i;
    }
    return -1;
  },

  updateLogo(game) {
    const I = CONFIG.intro;
    const t = this.t, slashAt = I.black, revealAt = slashAt + I.slash;
    if (t === slashAt) Sound.play('logoSlash');
    if (t === revealAt) Sound.play('logoBoom');
    const end = revealAt + I.reveal + I.hold + I.fade;
    // 아무 키나 누르면 건너뜀
    if (t > 12 && this.anyPress()) { this.enter(game, 'title'); return; }
    if (t >= end) this.enter(game, 'title');
  },

  // 설정 / 조작법 (겹쳐 뜨는 화면)
  updateSub(game) {
    if (Input.isPressed('back') || (game.state === 'paused' && Input.isPressed('pause'))) { this.sub = null; Sound.play('menuBack'); return; }
    if (this.sub === 'controls') {
      if (Input.isPressed('confirm') || this.clicked()) { this.sub = null; Sound.play('menuBack'); }
      return;
    }
    // 설정: 효과음 / 음악 / 화면 흔들림 / 돌아가기
    const n = 4;
    this.navigate(n, (i) => { this.subSel = i; }, () => this.subSel, this.subRects);
    let d = 0;
    if (Input.isPressed('menuLeft')) d = -1;
    if (Input.isPressed('menuRight')) d = 1;
    const click = this.clicked() && this.hit(this.subRects) === this.subSel;
    if (click) {
      // 항목 왼쪽 반 = 줄이기, 오른쪽 반 = 늘리기
      const r = this.subRects[this.subSel], m = Input.mouse();
      d = m.x < r.x + r.w * 0.62 ? -1 : 1;
    }
    const s = this.subSel;
    if (s === 3) {
      if (Input.isPressed('confirm') || click) { this.sub = null; Sound.play('menuBack'); }
      return;
    }
    if (s === 2 && (d !== 0 || Input.isPressed('confirm'))) {
      Settings.shake = !Settings.shake;
      Settings.save();
      if (Settings.shake) Effects.addShake(8);
      Sound.play('menuMove');
      return;
    }
    if (d !== 0) {
      const key = s === 0 ? 'sfx' : 'music';
      Settings[key] = Math.round(Math.max(0, Math.min(1, Settings[key] + d * 0.1)) * 10) / 10;
      Settings.save();
      Sound.play(s === 0 ? 'hit' : 'menuMove');
    }
  },

  // ---------- 그리기 ----------
  draw(ctx, game) {
    const V = CONFIG.view;
    switch (game.state) {
      case 'gate': this.drawGate(ctx); return;
      case 'logo': this.drawLogo(ctx); return;
      case 'title': this.drawTitle(ctx, game); break;
      case 'paused': this.drawPause(ctx, game); break;
      case 'gameover': this.drawEnd(ctx, game, false); break;
      case 'victory': this.drawEnd(ctx, game, true); break;
    }
    if (this.sub) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, V.width, V.height);
      if (this.sub === 'controls') this.drawControls(ctx);
      else this.drawSettings(ctx);
    }
  },

  // 글자 (외곽선 + 그림자 빛)
  text(ctx, str, x, y, font, color, align, glow) {
    ctx.font = font;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'alphabetic';
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  },

  drawGate(ctx) {
    const V = CONFIG.view;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, V.width, V.height);
    const a = 0.35 + 0.35 * Math.sin(this.t * 0.06);
    this.text(ctx, CONFIG.intro.gateText, V.width / 2, V.height / 2 + 6, '14px "Segoe UI", sans-serif', `rgba(200,240,255,${a.toFixed(3)})`);
  },

  // "시우 공방": 암전 → 청록 일섬이 화면을 가름 → 그 틈에서 로고가 위아래로 열림 → 유지 → 페이드
  drawLogo(ctx) {
    const V = CONFIG.view, I = CONFIG.intro, t = this.t;
    const cx = V.width / 2, cy = V.height / 2;
    const slashAt = I.black, revealAt = slashAt + I.slash, holdAt = revealAt + I.reveal, fadeAt = holdAt + I.hold;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, V.width, V.height);
    // 일섬: 왼쪽 → 오른쪽으로 그어짐
    if (t >= slashAt) {
      const k = clamp01((t - slashAt) / (I.slash * 0.45));
      const fade = t < revealAt ? 1 : Math.max(0, 1 - (t - revealAt) / 30);
      const x1 = -40 + (V.width + 80) * ease.outCubic(k);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.shadowColor = '#3ff';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#e8ffff';
      const h = t < revealAt ? 2 : 2 + 6 * fade;
      ctx.fillRect(-40, cy - h / 2, x1 + 40, h);
      ctx.restore();
    }
    if (t < revealAt) return;
    // 로고: 일섬 자리에서 위아래로 벌어지며 드러남
    const open = ease.outCubic(clamp01((t - revealAt) / I.reveal));
    const fadeOut = t < fadeAt ? 1 : Math.max(0, 1 - (t - fadeAt) / I.fade);
    ctx.save();
    ctx.globalAlpha = fadeOut;
    ctx.beginPath();
    ctx.rect(0, cy - 70 * open, V.width, 140 * open);
    ctx.clip();
    // 은은한 빛
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 260);
    g.addColorStop(0, 'rgba(60,200,220,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, V.width, V.height);
    this.text(ctx, I.studio, cx, cy + 14, 'bold 50px "Segoe UI", "Malgun Gothic", sans-serif', '#f2fdff', 'center', '#3ff');
    ctx.font = '12px "Segoe UI", sans-serif';
    this.text(ctx, I.studioEn, cx, cy + 42, '600 12px "Segoe UI", sans-serif', 'rgba(150,230,240,0.75)');
    // 글자 위를 지나가는 가는 반짝임
    const sweep = ((t - revealAt) * 9) % (V.width + 400) - 200;
    const sg = ctx.createLinearGradient(sweep - 60, 0, sweep + 60, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = sg;
    ctx.fillRect(cx - 160, cy - 40, 320, 90);
    ctx.restore();
    // 불씨
    ctx.save();
    ctx.globalAlpha = fadeOut;
    for (let i = 0; i < 26; i++) {
      const ph = i * 97.3;
      const life = ((t - revealAt) * (0.6 + (i % 5) * 0.12) + ph) % 160;
      const x = cx + Math.sin(ph) * 240 + Math.sin(life * 0.05 + i) * 10;
      const y = cy + 60 - life * 0.9;
      ctx.globalAlpha = fadeOut * Math.max(0, Math.sin(life / 160 * Math.PI)) * open * 0.8;
      ctx.fillStyle = i % 3 ? '#7ff' : '#fff';
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    ctx.restore();
    if (t > 30) this.text(ctx, '아무 키나 눌러 건너뛰기', V.width - 16, V.height - 14, '10px "Segoe UI", sans-serif', 'rgba(255,255,255,0.25)', 'right');
  },

  // ---------- 타이틀 ----------
  drawTitle(ctx, game) {
    const V = CONFIG.view, T = CONFIG.title, t = this.t;
    const cam = { x: t * T.scroll, y: 0 };
    Render.background(ctx, cam);
    // 땅: 왼쪽은 낮은 언덕, 오른쪽은 플레이어가 선 절벽
    ctx.fillStyle = '#060506';
    ctx.beginPath();
    ctx.moveTo(0, V.height);
    ctx.lineTo(0, 470);
    ctx.quadraticCurveTo(240, 455, 470, 478);
    ctx.lineTo(600, 486);
    ctx.lineTo(640, 432);
    ctx.lineTo(V.width, 432);
    ctx.lineTo(V.width, V.height);
    ctx.closePath();
    ctx.fill();
    // 풀
    for (let i = 0; i < 18; i++) {
      const x = 660 + i * 17 + Math.sin(i * 3.1) * 5, sw = Math.sin(t * 0.04 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(x - 2, 433); ctx.lineTo(x + sw, 425 - (i % 3) * 3); ctx.lineTo(x + 2, 433);
      ctx.fill();
    }
    // 플레이어 (절벽 위, 왼쪽을 바라봄)
    const p = this.titlePlayer;
    if (p) {
      ctx.save();
      ctx.translate(800, 432);
      ctx.scale(1.7, 1.7);
      Render.player(ctx, p);
      ctx.restore();
    }
    // 왼쪽을 살짝 어둡게 (글자가 잘 보이게)
    const lg = ctx.createLinearGradient(0, 0, 560, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0.5)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, 560, V.height);
    // 제목
    const a = clamp01(t / 40);
    ctx.save();
    ctx.globalAlpha = a;
    const tx = 84, ty = 170;
    this.text(ctx, T.name, tx, ty, 'italic 900 64px "Segoe UI", sans-serif', '#0a0809', 'left');
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    this.text(ctx, T.name, tx - 2, ty - 2, 'italic 900 64px "Segoe UI", sans-serif', '#f4fdff', 'left', '#3ff');
    ctx.restore();
    // 제목 아래 일섬
    const w = 430 * ease.outCubic(clamp01((t - 10) / 30));
    ctx.fillStyle = '#bff';
    ctx.shadowColor = '#3ff';
    ctx.shadowBlur = 12;
    ctx.fillRect(tx, ty + 14, w, 2);
    ctx.shadowBlur = 0;
    this.text(ctx, T.sub, tx + 2, ty + 42, '18px "Segoe UI", "Malgun Gothic", sans-serif', 'rgba(230,250,255,0.85)', 'left');
    ctx.restore();

    // 메뉴
    const items = this.items(game);
    this.drawItems(ctx, items, tx, 266, 40, a, 'left');
    // 설명
    const it = items[this.sel];
    if (it && it.desc) this.text(ctx, it.desc, tx + 2, 266 + items.length * 40 + 16, '12px "Segoe UI", sans-serif', `rgba(200,235,245,${(0.7 * a).toFixed(3)})`, 'left');
    this.text(ctx, `${Input.label('menuUp')}/${Input.label('menuDown')} 이동   ${Input.label('confirm')} 선택   마우스로도 가능`, tx + 2, V.height - 22, '11px "Segoe UI", sans-serif', 'rgba(255,255,255,0.4)', 'left');
    this.text(ctx, `${CONFIG.intro.studio}  ·  ${T.version}`, V.width - 16, V.height - 14, '10px "Segoe UI", sans-serif', 'rgba(255,255,255,0.35)', 'right');
    // 로고에서 넘어올 때 검은 화면이 걷힘
    if (t < 30) {
      ctx.fillStyle = `rgba(0,0,0,${(1 - t / 30).toFixed(3)})`;
      ctx.fillRect(0, 0, V.width, V.height);
    }
  },

  // 메뉴 항목 목록 (선택된 것은 청록 칼날 표식 + 밝게)
  drawItems(ctx, items, x, y, gap, alpha, align) {
    this.rects = [];
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    items.forEach((it, i) => {
      const on = i === this.sel && !this.sub;
      const yy = y + i * gap;
      ctx.font = on ? 'bold 22px "Segoe UI", sans-serif' : '20px "Segoe UI", sans-serif';
      const w = ctx.measureText(it.label).width;
      const lx = align === 'center' ? x - w / 2 : x;
      this.rects.push({ x: lx - 30, y: yy - 26, w: w + 60, h: gap - 4 });
      if (on) {
        // 칼날 표식
        ctx.fillStyle = '#7ff';
        ctx.shadowColor = '#3ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(lx - 24, yy - 7);
        ctx.lineTo(lx - 8, yy - 8);
        ctx.lineTo(lx - 24, yy - 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(lx, yy + 6, w, 1.5);
        ctx.shadowBlur = 0;
      }
      this.text(ctx, it.label, lx, yy, ctx.font, on ? '#ffffff' : 'rgba(255,255,255,0.55)', 'left', on ? '#3ff' : null);
    });
    ctx.restore();
  },

  // ---------- 일시정지 ----------
  drawPause(ctx, game) {
    const V = CONFIG.view;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, V.width, V.height);
    this.text(ctx, '일시정지', V.width / 2, 150, 'bold 40px "Segoe UI", sans-serif', '#fff', 'center', '#3ff');
    this.text(ctx, game.mode === 'practice' ? '콤보 연습장' : `${(game.floorIndex || 0) + 1}층`, V.width / 2, 178, '13px "Segoe UI", sans-serif', 'rgba(255,255,255,0.6)');
    this.drawItems(ctx, this.items(game), V.width / 2, 236, 42, 1, 'center');
    this.text(ctx, `${Input.label('pause')}: 계속`, V.width / 2, V.height - 30, '12px "Segoe UI", sans-serif', 'rgba(255,255,255,0.45)');
  },

  // ---------- 게임오버 / 던전 클리어 ----------
  drawEnd(ctx, game, win) {
    const V = CONFIG.view;
    const k = clamp01(this.t / 60);
    ctx.fillStyle = win ? `rgba(0,0,0,${(0.7 * k).toFixed(3)})` : `rgba(24,0,0,${(0.75 * k).toFixed(3)})`;
    ctx.fillRect(0, 0, V.width, V.height);
    ctx.save();
    ctx.globalAlpha = k;
    if (win) this.text(ctx, '던전 클리어', V.width / 2, 150, 'bold 52px "Segoe UI", sans-serif', '#ffe9a0', 'center', '#ffb040');
    else this.text(ctx, 'YOU DIED', V.width / 2, 150, 'bold 58px "Segoe UI", sans-serif', '#e23b3b', 'center', '#800');
    // 기록
    const r = game.run || {}, S = CONFIG.style.ranks;
    const sec = Math.floor((r.frames || 0) / 60);
    const rows = [
      ['도달', game.mode === 'practice' ? '콤보 연습장' : `${(game.floorIndex || 0) + 1}층${win ? ' (전 층 돌파)' : ''}`],
      ['플레이 시간', `${Math.floor(sec / 60)}분 ${sec % 60}초`],
      ['처치', `${game.kills}`],
      ['최대 히트', `${r.maxCombo || 0}`],
      ['최고 스타일 랭크', r.bestRank >= 0 ? S[r.bestRank].name : '-'],
    ];
    ctx.font = '15px "Segoe UI", sans-serif';
    rows.forEach((row, i) => {
      const y = 200 + i * 24;
      this.text(ctx, row[0], V.width / 2 - 14, y, '14px "Segoe UI", sans-serif', 'rgba(255,255,255,0.6)', 'right');
      const col = i === 4 && r.bestRank >= 0 ? S[r.bestRank].color : '#fff';
      this.text(ctx, row[1], V.width / 2 + 14, y, 'bold 15px "Segoe UI", sans-serif', col, 'left');
    });
    ctx.restore();
    if (this.t > 30) this.drawItems(ctx, this.items(game), V.width / 2, 362, 42, clamp01((this.t - 30) / 20), 'center');
    if (!win && this.t > 30) this.text(ctx, `${Input.label('restart')}: 바로 다시 시작`, V.width / 2, V.height - 30, '12px "Segoe UI", sans-serif', 'rgba(255,255,255,0.45)');
  },

  // ---------- 조작법 ----------
  panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = 'rgba(12,12,16,0.95)';
    ctx.strokeStyle = 'rgba(120,240,255,0.35)';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.text(ctx, title, x + 24, y + 34, 'bold 20px "Segoe UI", sans-serif', '#fff', 'left', '#3ff');
  },

  drawControls(ctx) {
    const V = CONFIG.view, k = (a) => Input.label(a);
    const x = 60, y = 28, w = V.width - 120, h = V.height - 56;
    this.panel(ctx, x, y, w, h, '조작법');
    const groups = [
      ['이동', [
        [`${k('left')} / ${k('right')}`, '이동'],
        [k('jump'), '점프 (2단 점프, 길게 = 높이)'],
        [`${k('down')} + ${k('jump')}`, '발판 아래로 내려가기'],
        [k('dash'), '대시 (무적, 공중 1회)'],
      ]],
      ['공격', [
        [k('light'), '약공격 콤보'],
        [k('heavy'), '강공격 (길게 누르면 차지)'],
        [`약공 2타 → ${k('heavy')}`, '전진 찌르기'],
        [`${k('down')} + ${k('heavy')}`, `런처 (${k('heavy')} 유지 = 같이 뜨기)`],
        [`공중 ${k('light')} / ${k('heavy')}`, '공중 콤보 / 공중 강공'],
        [`공중 ${k('down')} + ${k('heavy')}`, '내려찍기'],
      ]],
      ['검극', [
        [`${k('parry')} 탭`, '퍼펙트 패링 (노랑·흰색 예고)'],
        [`${k('parry')} 누르기`, '가드 (내 체간이 참)'],
        [`패링 직후 ${k('light')}/${k('heavy')}`, '반격 일섬 / 반격 런처'],
        [`체간 붕괴 시 ${k('light')}`, '처형'],
      ]],
      ['무기', [
        [`${k('swap')} / 휠`, '무기 교체 (공격 중이면 전환기 + 공명)'],
        [`${k('skill1')} / ${k('skill2')}`, '현재 무기의 스킬'],
        [k('inventory'), '각인·인벤토리'],
        [k('up'), '보상 상자 열기 (공격으로 쳐도 됨)'],
        [k('map'), '층 지도'],
        [k('pause'), '일시정지'],
      ]],
    ];
    const cols = [[groups[0], groups[1]], [groups[2], groups[3]]];
    cols.forEach((col, ci) => {
      let yy = y + 70;
      const cx = x + 28 + ci * (w / 2);
      for (const [name, rows] of col) {
        this.text(ctx, name, cx, yy, 'bold 13px "Segoe UI", sans-serif', '#7ff', 'left');
        yy += 20;
        for (const [key, what] of rows) {
          this.keyCap(ctx, key, cx, yy - 13);
          this.text(ctx, what, cx + 150, yy, '12px "Segoe UI", sans-serif', 'rgba(255,255,255,0.85)', 'left');
          yy += 20;
        }
        yy += 10;
      }
    });
    // 예고 색 + 무기 스킬
    let yy = y + h - 96;
    const tele = [['#ff3b3b', '빨강 = 피하기'], ['#ffd23a', '노랑 = 패링·가드'], ['#ffffff', '흰색 섬광 = 간파 (보스)']];
    let tx = x + 28;
    this.text(ctx, '적 공격 예고', tx, yy, 'bold 12px "Segoe UI", sans-serif', '#7ff', 'left');
    tx += 90;
    for (const [c, s] of tele) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(tx + 5, yy - 4, 5, 0, Math.PI * 2);
      ctx.fill();
      this.text(ctx, s, tx + 15, yy, '12px "Segoe UI", sans-serif', 'rgba(255,255,255,0.85)', 'left');
      tx += 150;
    }
    yy += 22;
    for (const t of WEAPON_ORDER) {
      const W = CONFIG.weapons[t];
      this.text(ctx, `${W.name}`, x + 28, yy, 'bold 12px "Segoe UI", sans-serif', `rgb(${W.trail.inner})`, 'left');
      this.text(ctx, `${k('skill1')} ${W.skills.q.name} · ${k('skill2')} ${W.skills.e.name}   — ${W.desc}`, x + 90, yy, '11px "Segoe UI", sans-serif', 'rgba(255,255,255,0.7)', 'left');
      yy += 16;
    }
    this.text(ctx, `개발용: ${k('spawn1')}~${k('spawn7')} 적·보스 소환 · ${k('spawn8')} 무작위 각인 · ${k('debug')} 히트박스 · ${k('debugMode')} 패링 디버그 · ${k('help')} 게임 중 도움말 · ${k('mode')} 던전↔연습장`,
      x + w - 24, y + 34, '10px "Segoe UI", sans-serif', 'rgba(255,255,255,0.35)', 'right');
    this.text(ctx, `${k('back')} / ${k('confirm')} / 클릭: 돌아가기`, V.width / 2, y + h + 18, '11px "Segoe UI", sans-serif', 'rgba(255,255,255,0.5)');
  },

  // 키 모양 상자
  keyCap(ctx, label, x, y) {
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    const w = Math.min(140, ctx.measureText(label).width + 14);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x, y, w, 17);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 16);
    this.text(ctx, label, x + w / 2, y + 12.5, 'bold 11px "Segoe UI", sans-serif', '#fff');
  },

  // ---------- 설정 ----------
  drawSettings(ctx) {
    const V = CONFIG.view;
    const w = 460, h = 300, x = (V.width - w) / 2, y = (V.height - h) / 2;
    this.panel(ctx, x, y, w, h, '설정');
    const rows = [
      ['효과음', Settings.sfx],
      ['음악', Settings.music],
      ['화면 흔들림', Settings.shake ? '켜기' : '끄기'],
      ['돌아가기', null],
    ];
    this.subRects = [];
    rows.forEach((row, i) => {
      const yy = y + 90 + i * 46, on = i === this.subSel;
      this.subRects.push({ x: x + 20, y: yy - 26, w: w - 40, h: 40 });
      if (on) {
        ctx.fillStyle = 'rgba(120,240,255,0.08)';
        ctx.fillRect(x + 20, yy - 26, w - 40, 40);
      }
      this.text(ctx, row[0], x + 40, yy, on ? 'bold 16px "Segoe UI", sans-serif' : '16px "Segoe UI", sans-serif', on ? '#fff' : 'rgba(255,255,255,0.65)', 'left', on ? '#3ff' : null);
      const v = row[1];
      if (typeof v === 'number') {
        // 10칸 막대
        for (let j = 0; j < 10; j++) {
          ctx.fillStyle = j < Math.round(v * 10) ? (on ? '#7ff' : '#4aa') : 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + 210 + j * 18, yy - 14, 14, 14);
        }
        this.text(ctx, `${Math.round(v * 100)}%`, x + w - 14, yy, '13px "Segoe UI", sans-serif', 'rgba(255,255,255,0.7)', 'right');
        if (on) {
          this.text(ctx, '◀', x + 192, yy, '12px "Segoe UI", sans-serif', '#7ff', 'center');
          this.text(ctx, '▶', x + 404, yy, '12px "Segoe UI", sans-serif', '#7ff', 'center');
        }
      } else if (v) {
        this.text(ctx, `◀  ${v}  ▶`, x + 300, yy, 'bold 14px "Segoe UI", sans-serif', on ? '#7ff' : 'rgba(255,255,255,0.7)', 'center');
      }
    });
    this.text(ctx, `${Input.label('menuLeft')}/${Input.label('menuRight')}: 조절   ${Input.label('back')}: 돌아가기   (브라우저에 저장됨)`, V.width / 2, y + h - 18, '11px "Segoe UI", sans-serif', 'rgba(255,255,255,0.45)');
  },
};

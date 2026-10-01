'use strict';
// 게임 루프, 상태 관리, 카메라, 렌더링 순서

const Game = {
  state: 'title', // title | playing | levelup | paused | gameover
  time: 0,
  kills: 0,
  bossKills: 0,
  cam: { x: 0, y: 0 },
  view: { left: 0, top: 0, right: 0, bottom: 0 },
  choices: null,
  fps: 0,
  showFps: CONFIG.display.showFps,
  best: null,
  newBest: false,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    Effects.init();
    Enemies.init();
    Projectiles.init();
    Pickups.init();
    this.player = new Player();
    this.loadBest();

    Input.init(this.canvas,
      (code) => this.onKey(code),
      (x, y) => this.onClick(x, y),
      (x, y) => { if (this.state === 'levelup') UI.hover = UI.hitCard(x, y); });

    this._last = performance.now();
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    requestAnimationFrame((t) => this.loop(t));
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
  },

  newGame() {
    this.time = 0;
    this.kills = 0;
    this.bossKills = 0;
    this.newBest = false;
    this.choices = null;
    Effects.reset();
    Enemies.reset();
    Projectiles.reset();
    Pickups.reset();
    UI.reset();
    this.player.reset();
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.state = 'playing';
  },

  loadBest() {
    try {
      const s = localStorage.getItem('nightSurvivorsBest');
      this.best = s ? JSON.parse(s) : null;
    } catch (e) { this.best = null; }
  },

  saveBest() {
    const rec = { time: this.time, level: this.player.level, kills: this.kills };
    if (!this.best || rec.time > this.best.time) {
      this.newBest = true;
      this.best = rec;
      try { localStorage.setItem('nightSurvivorsBest', JSON.stringify(rec)); } catch (e) { /* 저장 불가 환경 무시 */ }
    }
  },

  onKey(code) {
    if (code === 'KeyF') { this.showFps = !this.showFps; return; }
    switch (this.state) {
      case 'title':
        if (code === 'Enter' || code === 'Space') this.newGame();
        break;
      case 'playing':
        if (code === 'Escape') this.state = 'paused';
        else if (code === 'KeyR') this.newGame();
        break;
      case 'paused':
        if (code === 'Escape') this.state = 'playing';
        else if (code === 'KeyR') this.newGame();
        break;
      case 'levelup': {
        const map = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };
        if (code in map) this.choose(map[code]);
        break;
      }
      case 'gameover':
        if (code === 'KeyR' || code === 'Enter') this.newGame();
        break;
    }
  },

  onClick(x, y) {
    if (this.state === 'title') this.newGame();
    else if (this.state === 'levelup') {
      const i = UI.hitCard(x, y);
      if (i >= 0) this.choose(i);
    }
  },

  openLevelUp() {
    this.choices = Upgrades.buildChoices(this.player, 3);
    UI.hover = -1;
    this.state = 'levelup';
  },

  choose(i) {
    if (!this.choices || i < 0 || i >= this.choices.length) return;
    Upgrades.apply(this.choices[i], this.player);
    this.player.pendingLevelUps--;
    this.choices = null;
    if (this.player.pendingLevelUps > 0) this.openLevelUp();
    else this.state = 'playing';
  },

  updateView() {
    const m = 40;
    const v = this.view;
    v.left = this.cam.x - this.W / 2 - m;
    v.right = this.cam.x + this.W / 2 + m;
    v.top = this.cam.y - this.H / 2 - m;
    v.bottom = this.cam.y + this.H / 2 + m;
  },

  update(dt) {
    UI.update(dt);
    if (this.state === 'gameover') { Effects.update(dt); return; }
    if (this.state !== 'playing') return;

    this.time += dt;
    const p = this.player;
    p.update(dt);

    // 카메라는 플레이어를 부드럽게 따라감
    const k = 1 - Math.exp(-12 * dt);
    this.cam.x += (p.x - this.cam.x) * k;
    this.cam.y += (p.y - this.cam.y) * k;
    this.updateView();

    Enemies.update(dt, this);
    for (const w of p.weapons) w.update(dt, p);
    Projectiles.update(dt);
    Enemies.checkPlayerContact(p);
    Pickups.update(dt, p);
    Enemies.cleanup();
    Effects.update(dt);

    if (p.dead) {
      this.saveBest();
      this.state = 'gameover';
    } else if (p.pendingLevelUps > 0) {
      this.openLevelUp();
    }
  },

  drawBackground(ctx) {
    const D = CONFIG.display;
    ctx.fillStyle = D.bgColor;
    ctx.fillRect(this.view.left - 60, this.view.top - 60, this.W + 200, this.H + 200);
    const g = D.gridSize;
    ctx.strokeStyle = D.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.floor(this.view.left / g) * g, x1 = this.view.right;
    const y0 = Math.floor(this.view.top / g) * g, y1 = this.view.bottom;
    for (let x = x0; x <= x1; x += g) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = y0; y <= y1; y += g) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
  },

  draw() {
    const ctx = this.ctx;
    const p = this.player;
    this.updateView();

    // 월드 (카메라 + 흔들림 적용)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(Math.round(this.W / 2 - this.cam.x + Effects.shakeX), Math.round(this.H / 2 - this.cam.y + Effects.shakeY));

    this.drawBackground(ctx);
    if (this.state !== 'title') {
      if (!p.dead) for (const w of p.weapons) w.drawUnder(ctx, p);
      Pickups.draw(ctx, this.view);
      Enemies.draw(ctx, this.view);
      if (!p.dead) {
        p.draw(ctx);
        p.drawHpBar(ctx);
        for (const w of p.weapons) w.draw(ctx, p);
      }
      Projectiles.draw(ctx);
      Effects.draw(ctx);
    }

    // 화면 고정 UI
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    switch (this.state) {
      case 'title': UI.drawTitle(ctx, this); break;
      case 'playing': UI.drawHUD(ctx, this); break;
      case 'levelup': UI.drawHUD(ctx, this); UI.drawLevelUp(ctx, this); break;
      case 'paused': UI.drawHUD(ctx, this); UI.drawPause(ctx, this); break;
      case 'gameover': UI.drawHUD(ctx, this); UI.drawGameOver(ctx, this); break;
    }
  },

  loop(t) {
    let dt = (t - this._last) / 1000;
    this._last = t;
    if (dt > 0.05) dt = 0.05; // 탭 전환 등으로 인한 큰 dt 방지
    if (dt < 0) dt = 0;

    this._fpsAcc += dt;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    this.update(dt);
    this.draw();
    requestAnimationFrame((t2) => this.loop(t2));
  },
};

window.addEventListener('load', () => Game.init());

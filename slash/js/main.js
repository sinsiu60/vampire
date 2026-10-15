'use strict';
// 게임 루프 (60fps 고정 타임스텝), 상태 관리, 카메라

const Game = {
  state: 'playing',     // playing | paused | gameover
  stateTime: 0,
  hitstop: 0,           // >0 이면 엔티티 정지 (역경직)
  timeScale: 1,         // 슬로모션용 (패링 등, 4단계)
  cam: { x: 0, y: 0 },
  enemies: [],
  combo: { count: 0, timer: 0, pop: 0 },
  wave: 0,
  kills: 0,
  waveTimer: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.init();
    Input.onFirstInput = () => Sound.unlock();

    this.newGame();
    this._last = performance.now();
    this._acc = 0;
    requestAnimationFrame((t) => this.loop(t));
  },

  resize() {
    const V = CONFIG.view;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    this.canvas.width = Math.floor(W * this.dpr);
    this.canvas.height = Math.floor(H * this.dpr);
    // 비율 유지 + 레터박스
    this.scale = Math.min(W / V.width, H / V.height);
    this.offX = (W - V.width * this.scale) / 2;
    this.offY = (H - V.height * this.scale) / 2;
  },

  newGame() {
    const level = Dungeon.buildArena();
    this.level = level;
    this.player = new Player(200, level.groundY);
    this.enemies = [];
    this.combo = { count: 0, timer: 0, pop: 0 };
    this.wave = 0;
    this.kills = 0;
    this.waveTimer = 30;
    this.hitstop = 0;
    this.timeScale = 1;
    Effects.reset();
    this.setState('playing');
    this.cam.x = this.player.x - CONFIG.view.width / 2;
    this.cam.y = 0;
  },

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  },

  spawnWave() {
    const A = CONFIG.arena;
    const n = A.waveSizes[Math.min(this.wave, A.waveSizes.length - 1)];
    this.wave++;
    for (let i = 0; i < n; i++) {
      // 플레이어와 떨어진 쪽에 스폰
      const side = (i % 2 === 0) ? 1 : -1;
      let x = this.player.x + side * (380 + i * 70 + Math.random() * 120);
      x = Math.max(80, Math.min(A.width - 80, x));
      const e = new Enemy('grunt', x, A.groundY);
      this.enemies.push(e);
      Effects.dust(x, A.groundY, 6, 0);
    }
  },

  // ---------- 이벤트 (전투에서 호출) ----------
  registerHit() {
    this.combo.count++;
    this.combo.timer = CONFIG.feel.comboResetFrames;
    this.combo.pop = 6;
  },

  onEnemyKilled(enemy) {
    this.kills++;
  },

  onPlayerHurt() {
    this.combo.count = 0;
    this.combo.timer = 0;
  },

  // ---------- 고정 스텝 ----------
  step() {
    Input.update();
    this.stateTime++;

    if (Input.isPressed('help')) UI.showHelp = !UI.showHelp;
    if (Input.isPressed('debug')) CONFIG.debug.showHitboxes = !CONFIG.debug.showHitboxes;

    if (this.state === 'paused') {
      if (Input.isPressed('pause')) this.setState('playing');
      if (Input.isPressed('restart')) this.newGame();
      return;
    }
    if (this.state === 'playing' && Input.isPressed('pause')) {
      this.setState('paused');
      return;
    }
    if (this.state === 'gameover' && Input.isPressed('restart')) {
      this.newGame();
      return;
    }

    const p = this.player;
    p.readInput(Input);
    Effects.update(this.hitstop > 0);

    // 히트스톱: 엔티티는 멈추고 이펙트만 진행
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    p.update(this, Input);
    Combat.playerAttack(this, p);
    for (const e of this.enemies) e.update(this);
    this.enemies = this.enemies.filter((e) => !e.remove);

    // 히트 수
    if (this.combo.timer > 0 && --this.combo.timer === 0) this.combo.count = 0;
    if (this.combo.pop > 0) this.combo.pop--;

    // 웨이브
    if (this.enemies.length === 0) {
      if (--this.waveTimer <= 0) {
        this.spawnWave();
        this.waveTimer = CONFIG.arena.waveDelay;
      }
    }

    if (p.dead && this.state === 'playing' && p.stateFrame > 40) this.setState('gameover');

    this.updateCamera();
  },

  updateCamera() {
    const V = CONFIG.view, p = this.player;
    const lookAhead = p.facing * 60;
    const tx = p.x + lookAhead - V.width / 2;
    this.cam.x += (tx - this.cam.x) * 0.1;
    this.cam.x = Math.max(0, Math.min(this.level.width - V.width, this.cam.x));
    this.cam.y = 0;
  },

  // ---------- 루프 ----------
  loop(now) {
    const STEP = 1000 / CONFIG.fps;
    let dt = now - this._last;
    this._last = now;
    if (dt > STEP * CONFIG.maxFrameSkip) dt = STEP * CONFIG.maxFrameSkip;
    this._acc += dt * this.timeScale;
    while (this._acc >= STEP) {
      this.step();
      this._acc -= STEP;
    }
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  },

  render() {
    const ctx = this.ctx;
    const k = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, this.offX * this.dpr, this.offY * this.dpr);

    // 화면 밖으로 그리지 않게 클립
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CONFIG.view.width, CONFIG.view.height);
    ctx.clip();

    const cam = { x: Math.round(this.cam.x + Effects.shakeX), y: Math.round(this.cam.y + Effects.shakeY) };
    Render.background(ctx, cam);

    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    Render.level(ctx, this.level);
    Effects.drawBack(ctx);
    for (const e of this.enemies) Render.enemy(ctx, e);
    Render.player(ctx, this.player);
    Effects.drawFront(ctx);
    if (CONFIG.debug.showHitboxes) Render.hitboxes(ctx, this);
    ctx.restore();

    // 임팩트 프레임: 색 반전
    if (Effects.impact > 0) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, CONFIG.view.width, CONFIG.view.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    UI.hud(ctx, this);
    UI.overlay(ctx, this);
    ctx.restore();
  },
};

window.addEventListener('load', () => Game.init());

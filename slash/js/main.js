'use strict';
// 게임 루프 (60fps 고정 타임스텝), 상태 관리, 카메라

const Game = {
  state: 'playing',     // playing | paused | gameover
  stateTime: 0,
  frame: 0,             // 전체 프레임 카운터 (애니메이션용)
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
    this.projectiles = [];
    this.combo = { count: 0, timer: 0, pop: 0 };
    this.wave = 0;
    this.kills = 0;
    this.waveTimer = 30;
    this.hitstop = 0;
    this.timeScale = 1;
    this.slowmoMs = 0;
    Effects.reset();
    this.setState('playing');
    this.updateCamera(true);
  },

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  },

  spawnWave() {
    const A = CONFIG.arena;
    let types = A.waves[this.wave];
    if (!types) {
      const all = Object.keys(CONFIG.enemies);
      types = [];
      for (let i = 0; i < A.randomWaveSize; i++) types.push(all[(Math.random() * all.length) | 0]);
    }
    this.wave++;
    types.forEach((t, i) => {
      // 플레이어와 떨어진 곳에 스폰
      const side = (i % 2 === 0) ? 1 : -1;
      this.spawnEnemy(t, this.player.x + side * (380 + i * 60 + Math.random() * 120));
    });
  },

  spawnEnemy(type, x) {
    const A = CONFIG.arena;
    x = Math.max(80, Math.min(A.width - 80, x));
    const e = new Enemy(type, x, A.groundY);
    this.enemies.push(e);
    Effects.dust(x, A.groundY, 6, 0);
    return e;
  },

  // 슬로모션 (실제 시간 기준)
  slowmo(ms) {
    this.slowmoMs = Math.max(this.slowmoMs, ms);
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

  onParry(enemy) {},

  onPlayerHurt() {
    this.combo.count = 0;
    this.combo.timer = 0;
  },

  // ---------- 고정 스텝 ----------
  step() {
    Input.update();
    this.stateTime++;
    this.frame++;
    Render.updateAmbient();

    if (Input.isPressed('help')) UI.showHelp = !UI.showHelp;
    if (Input.isPressed('debug')) CONFIG.debug.showHitboxes = !CONFIG.debug.showHitboxes;
    if (Input.isPressed('theme')) Render.setTheme((Render.themeIndex + 1) % THEMES.length);
    // 개발용: 숫자키로 적 소환
    if (this.state === 'playing') {
      const types = ['grunt', 'shield', 'flyer', 'heavy', 'archer', 'charger'];
      for (let i = 0; i < types.length; i++) {
        if (Input.isPressed('spawn' + (i + 1))) this.spawnEnemy(types[i], this.player.x + this.player.facing * 260);
      }
    }

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
    for (const pr of this.projectiles) pr.update(this);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);

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

  // 화면에 보이는 월드 크기 (줌 반영)
  viewW() { return CONFIG.view.width / CONFIG.view.zoom; },
  viewH() { return CONFIG.view.height / CONFIG.view.zoom; },
  // 카메라 기본 높이: 바닥 아래가 조금 보이는 위치
  restCamY() { return this.level.groundY + CONFIG.camera.groundMargin - this.viewH(); },

  updateCamera(snap) {
    const C = CONFIG.camera, p = this.player;
    const vw = this.viewW(), vh = this.viewH();
    const tx = p.x + p.facing * C.lookAhead - vw / 2;
    // 세로: 플레이어가 화면 아래쪽 2/3 지점 근처, 바닥보다 아래로는 안 내려감
    const ty = Math.min(this.restCamY(), p.y - vh * C.playerScreenY);
    this.cam.x += (tx - this.cam.x) * (snap ? 1 : C.followX);
    this.cam.y += (ty - this.cam.y) * (snap ? 1 : C.followY);
    this.cam.x = Math.max(0, Math.min(this.level.width - vw, this.cam.x));
  },


  // ---------- 루프 ----------
  loop(now) {
    const STEP = 1000 / CONFIG.fps;
    let dt = now - this._last;
    this._last = now;
    if (dt > STEP * CONFIG.maxFrameSkip) dt = STEP * CONFIG.maxFrameSkip;
    // 슬로모션: 실제 시간으로 줄어듦
    if (this.slowmoMs > 0) {
      this.slowmoMs -= dt;
      this.timeScale = CONFIG.parry.slowmoScale;
    } else {
      this.timeScale = 1;
    }
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

    const cam = { x: this.cam.x + Effects.shakeX, y: this.cam.y + Effects.shakeY };
    // 배경 패럴랙스는 기본 카메라 높이 기준의 상대값으로
    Render.background(ctx, { x: cam.x, y: cam.y - this.restCamY() });

    ctx.save();
    const z = CONFIG.view.zoom;
    ctx.scale(z, z);
    ctx.translate(-Math.round(cam.x * z) / z, -Math.round(cam.y * z) / z);
    Render.level(ctx, this.level, cam);
    Effects.drawBack(ctx);
    for (const e of this.enemies) Render.enemy(ctx, e);
    Render.player(ctx, this.player);
    for (const pr of this.projectiles) pr.draw(ctx);
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
    // 화면 번쩍 (패링 등)
    if (Effects.flash) {
      const f = Effects.flash;
      ctx.fillStyle = f.color + (0.42 * f.life / f.max).toFixed(3) + ')';
      ctx.fillRect(0, 0, CONFIG.view.width, CONFIG.view.height);
    }

    UI.hud(ctx, this);
    UI.overlay(ctx, this);
    ctx.restore();
  },
};

window.addEventListener('load', () => Game.init());

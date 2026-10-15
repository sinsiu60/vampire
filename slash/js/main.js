'use strict';
// 게임 루프 (60fps 고정 타임스텝), 상태 관리, 카메라

const Game = {
  state: 'playing',     // playing | paused | gameover
  stateTime: 0,
  frame: 0,             // 전체 프레임 카운터 (애니메이션용)
  simTime: 0,           // 게임 시간 (ms). 히트스톱 중엔 멈추고 슬로모션 중엔 느리게 흐름 → 패링 판정 기준
  stepRealTime: 0,      // 지금 처리 중인 스텝이 해당하는 실제 시각 (performance.now 기준)
  parryLog: [],         // 디버그: 패링 시도 기록 { text, ok, life }
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
    this.parryLog = [];
    this.lastParryHitSim = -1e9;   // 디버그: 마지막으로 맞은(패링 가능한) 공격 시각
    this.zoomPulse = 0;     // 퍼펙트 패링 체인 줌인 (화면 배율 +)
    this.dim = 0;           // 배경 어두워짐 (0~1)
    this.exec = null;       // 처형 연출 진행 상태
    this.execDark = 0;      // 처형 암전 (0~1)
    this.waveCleared = true;
    this.clearBanner = null;   // 방(웨이브) 클리어 결과 표시
    Effects.reset();
    Style.reset();
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
    this.waveCleared = false;
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
    this.waveCleared = false;
    Effects.dust(x, A.groundY, 6, 0);
    return e;
  },

  // 실제 시각(이벤트 타임스탬프) → 게임 시간. 같은 프레임 안에서 먼저 눌린 입력은 그만큼 앞당겨 기록
  // 히트스톱 중엔 게임 시간이 멈춰 있으므로 현재 게임 시간 그대로
  realToSim(tReal) {
    if (tReal === null || tReal === undefined || !this.stepRealTime || this.hitstop > 0) return this.simTime;
    const age = Math.max(0, Math.min(50, this.stepRealTime - tReal));
    return this.simTime - age * this.timeScale;
  },

  // 디버그: 패링 시도 결과 기록 (delta: 누른 시각 - 타격 시각, ms. 음수 = 일찍, 양수 = 늦게)
  logParry(delta, ok, kind) {
    const sec = Math.abs(delta / 1000).toFixed(3);
    const when = Math.abs(delta) < 5 ? '정확히' : delta < 0 ? `${sec}초 일찍` : `${sec}초 늦게`;
    const text = `${ok ? '성공' : '실패'} ${when}${kind ? ' (' + kind + ')' : ''}`;
    this.parryLog.unshift({ text, ok, life: 600 });
    if (this.parryLog.length > 6) this.parryLog.length = 6;
    if (CONFIG.debug.parry) {
      const p = this.player;
      Effects.popText(p.x, p.y - p.h - 46, `${delta >= 0 ? '+' : ''}${(delta / 1000).toFixed(3)}s`, ok ? '#7f7' : '#f77', 15);
    }
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

  onEnemyKilled(enemy, how) {
    if (how !== 'execute') {
      this.kills++;
      Style.onKill();
    }
  },

  onParry(enemy, tier) {
    Style.onParry(tier, this.player.parryChain);
  },

  onPostureBreak(enemy) {
    Style.onPostureBreak();
  },

  // 방(웨이브) 클리어: 최고 랭크에 따라 보상 (지금은 체력 회복, 8단계에서 아이템)
  onRoomClear() {
    const S = CONFIG.style, p = this.player;
    const best = Style.clearRoom();
    const heal = best >= 0 ? S.clearHeal[best] : 0;
    p.hp = Math.min(CONFIG.player.maxHp, p.hp + heal);
    p.stamina = CONFIG.player.maxStamina;
    this.clearBanner = { rank: best, heal, life: S.clearBannerFrames, max: S.clearBannerFrames };
    if (heal > 0) Effects.popText(p.x, p.y - p.h - 20, `+${heal} HP`, '#7f7', 16);
    Sound.play('clear');
  },

  // ---------- 처형 ----------
  // 체간이 무너진 적 중 가까운 것
  findExecutable(p) {
    if (this.exec) return null;
    const R = CONFIG.posture.executeRange;
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.executed || e.state !== 'broken') continue;
      const d = Math.abs(e.x - p.x);
      if (d <= R && Math.abs(e.y - p.y) < 70 && d < bd) { best = e; bd = d; }
    }
    return best;
  },

  startExecution(e) {
    const X = CONFIG.execution, p = this.player;
    const dir = Math.sign(e.x - p.x) || p.facing;
    let toX = e.x + dir * X.dashOffset;
    toX = Math.max(30, Math.min(this.level.width - 30, toX));
    e.executed = true;
    e.vx = 0; e.vy = 0;
    p.move = null;
    p.vx = 0; p.vy = 0;
    p.facing = dir;
    p.execPose = 'wind';
    p.setState('execute');
    this.exec = {
      target: e, f: 0, dir, fromX: p.x, toX,
      cutY: e.y - e.h * 0.55, split: 0, line: 0,
    };
    Sound.play('execPrep');
  },

  // 처형 연출 진행 (다른 모든 것은 정지)
  updateExecution() {
    const X = CONFIG.execution, ex = this.exec, p = this.player, e = ex.target;
    const slashAt = X.prepFrames, splitAt = slashAt + X.stillFrames;
    const outroAt = splitAt + X.splitFrames, endAt = outroAt + X.outroFrames;
    ex.f++;
    p.stateFrame++;
    Style.update(true);
    p.updateScarf();
    Effects.update(ex.f < splitAt);   // 일섬 전후 정적: 검기 잔상도 멈춤

    // 암전
    if (ex.f < outroAt) this.execDark = Math.min(1, this.execDark + 0.09);
    else this.execDark = Math.max(0, this.execDark - 1 / X.outroFrames);

    if (ex.f === slashAt) {
      // 순간이동 일섬: 적을 지나쳐 반대편으로
      for (let i = 1; i <= 6; i++) {
        p.x = ex.fromX + (ex.toX - ex.fromX) * (i / 7);
        Effects.afterimage(Anim.snapshot(Anim.playerFigure(p)), 'rgb(80,240,255)', 40);
      }
      p.x = ex.toX;
      p.execPose = 'strike';
      p.stateFrame = 0;
      ex.line = 1;
      Effects.streak(ex.fromX, ex.cutY, ex.toX, ex.cutY, '#bff');
      Effects.addShake(4);
      this.zoomPulse = Math.max(this.zoomPulse, 0.08);
      Sound.play('execSlash');
    }
    if (ex.f > slashAt) ex.line = Math.max(0, ex.line - 1 / (X.stillFrames + 20));

    if (ex.f === splitAt) {
      // 두 동강 → 파편
      e.hp = 0;
      e.dead = true;
      const cx = e.x, cy = ex.cutY;
      Effects.shards(cx, cy, ex.dir, X.shards, '#0c0a0b');
      Effects.radialSparks(cx, cy, 26, '#ff3030', 1);
      Effects.ring(cx, cy, '#ff5040', 110);
      Effects.addShake(X.shake);
      Effects.impactFrame(1);
      Effects.popText(cx, e.y - e.h - 30, '처형', '#ff4a3a', 30);
      // 칼 털어내기 + 청록 잔광
      p.execPose = 'flick';
      p.stateFrame = 0;
      for (let i = 0; i < 3; i++) Effects.afterimage(Anim.snapshot(Anim.playerFigure(p)), 'rgb(80,240,255)', 50);
      Sound.play('execSplit');
      this.kills++;
      this.registerHit();
      this.onEnemyKilled(e, 'execute');
      this.onExecution(e);
    }
    if (ex.f > splitAt) ex.split += X.splitSpeed * Math.max(0.2, 1 - (ex.f - splitAt) / X.splitFrames);

    if (ex.f >= endAt) {
      e.remove = true;
      this.enemies = this.enemies.filter((o) => !o.remove);
      this.exec = null;
      this.execDark = 0;
      p.execPose = null;
      p.invuln = 30;
      p.setState('free');
    }
    this.updateCamera();
  },

  // 처형 성공 (5단계 스타일 랭크에서 대폭 상승 처리)
  onExecution(enemy) {
    Style.onExecution();
  },

  onPlayerHurt() {
    Style.onPlayerHit();
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
    if (Input.isPressed('debugMode')) CONFIG.debug.parry = !CONFIG.debug.parry;
    for (let i = this.parryLog.length - 1; i >= 0; i--) if (--this.parryLog[i].life <= 0) this.parryLog.splice(i, 1);
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

    // 줌인 / 배경 어두워짐: 서서히 원래대로 (연속 패링 5회 이상이면 살짝 어둡게 유지)
    const C = CONFIG.parry.chain;
    this.zoomPulse *= C.zoomDecay;
    const dimFloor = this.player.parryChain >= C.tier3 ? 0.22 : 0;
    this.dim = Math.max(dimFloor, this.dim * C.dimDecay);

    const p = this.player;
    // 처형 연출 중엔 다른 것들은 멈춤
    if (this.exec) { this.updateExecution(); return; }
    // 게임 시간: 히트스톱이 아닐 때만 흐름 (이번 스텝의 "지금")
    if (this.hitstop <= 0) this.simTime += 1000 / CONFIG.fps;
    p.readInput(Input, this);
    Effects.update(this.hitstop > 0);

    // 히트스톱: 엔티티는 멈추고 이펙트만 진행
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    Style.update();
    if (this.clearBanner && --this.clearBanner.life <= 0) this.clearBanner = null;

    p.update(this, Input);
    Combat.playerAttack(this, p);
    for (const e of this.enemies) e.update(this);
    this.enemies = this.enemies.filter((e) => !e.remove);
    for (const pr of this.projectiles) pr.update(this);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);

    // 히트 수
    if (this.combo.timer > 0 && --this.combo.timer === 0) this.combo.count = 0;
    if (this.combo.pop > 0) this.combo.pop--;

    // 웨이브: 전멸하면 클리어 보상 → 잠시 후 다음 웨이브
    if (this.enemies.length === 0 && !this.waveCleared && !this.exec) {
      this.waveCleared = true;
      this.onRoomClear();
    }
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
      // 이 스텝이 해당하는 실제 시각 (뒤로 밀린 스텝일수록 과거)
      this.stepRealTime = now - (this._acc - STEP) / this.timeScale;
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

    const V = CONFIG.view;
    ctx.save();
    // 퍼펙트 패링 체인 줌인 (화면 중앙 기준)
    if (this.zoomPulse > 0.001) {
      ctx.translate(V.width / 2, V.height / 2);
      ctx.scale(1 + this.zoomPulse, 1 + this.zoomPulse);
      ctx.translate(-V.width / 2, -V.height / 2);
    }
    // 배경 어두워짐 (체인 5회 이상)
    if (this.dim > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${this.dim.toFixed(3)})`;
      ctx.fillRect(-20, -20, V.width + 40, V.height + 40);
    }
    const z = V.zoom;
    ctx.scale(z, z);
    ctx.translate(-Math.round(cam.x * z) / z, -Math.round(cam.y * z) / z);
    Render.level(ctx, this.level, cam);
    Render.lit = this.dim * 0.6;
    Effects.drawBack(ctx);
    const ex = this.exec;
    for (const e of this.enemies) if (!e.executed) Render.enemy(ctx, e);
    for (const pr of this.projectiles) pr.draw(ctx);
    // 처형 암전: 배경과 다른 적은 검게, 플레이어와 대상만 밝은 실루엣으로
    if (this.execDark > 0) {
      const camX = cam.x, camY = cam.y;
      ctx.fillStyle = `rgba(0,0,0,${this.execDark.toFixed(3)})`;
      ctx.fillRect(camX - 200, camY - 200, V.width / z + 400, V.height / z + 400);
      Render.lit = this.execDark;
      if (ex) Effects.drawBack(ctx);
    }
    if (ex) Render.executionTarget(ctx, ex);
    Render.player(ctx, this.player);
    Effects.drawFront(ctx);
    Render.lit = 0;
    if (CONFIG.debug.showHitboxes) Render.hitboxes(ctx, this);
    if (CONFIG.debug.parry) Render.parryDebug(ctx, this);
    ctx.restore();
    // 처형 일섬: 화면을 가로지르는 하얀 선
    if (ex && ex.line > 0) {
      const sy = (ex.cutY - cam.y) * z;
      ctx.save();
      ctx.globalAlpha = Math.min(1, ex.line * 1.4);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#bff';
      ctx.shadowBlur = 18;
      const h = 1 + 7 * ex.line;
      ctx.fillRect(0, sy - h / 2, V.width, h);
      ctx.restore();
    }

    // 흑백 반전 (퍼펙트 패링 1프레임)
    if (Effects.mono > 0) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, V.width, V.height);
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, V.width, V.height);
      ctx.globalCompositeOperation = 'source-over';
    }

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

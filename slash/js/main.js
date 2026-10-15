'use strict';
// 게임 루프 (60fps 고정 타임스텝), 상태 관리, 카메라

const Game = {
  state: 'gate',        // gate(첫 입력) | logo | title | playing | paused | inventory | gameover | victory
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
  kills: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.init();
    Input.onFirstInput = () => { Sound.unlock(); Music.resume(); };

    // 첫 입력(소리 허용) → "시우 공방" 로고 → 타이틀
    Menu.enter(this, 'gate');
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

  // mode: 'dungeon' (던전) | 'practice' (콤보 연습장: 아레나 + 웨이브)
  newGame(mode) {
    this.mode = mode || this.mode || 'dungeon';
    this.player = null;
    this.enemies = [];
    this.projectiles = [];
    this.drops = [];        // 바닥에 떨어진 아이템
    this.combo = { count: 0, timer: 0, pop: 0 };
    this.kills = 0;
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
    this.floorBanner = null;   // 층 시작 표시
    this.bossIntro = null;     // 보스 등장 표시
    this.bossPhaseBanner = null;
    this.transition = null;    // 방 이동 페이드
    this.floor = null;
    this.room = null;
    this.run = { frames: 0, bestRank: -1, maxCombo: 0 };   // 게임오버/클리어 화면 기록
    this.hint = CONFIG.ui.startHintFrames;
    Effects.reset();
    Style.reset();
    Skills.reset();
    Inventory.reset();
    if (this.mode === 'practice') {
      Render.setTheme(0);
      const level = Dungeon.buildArena();
      this.level = level;
      this.player = new Player(200, level.groundY);
      this.player.lastSafe = { x: 200, y: level.groundY };
      Practice.reset(this);
    } else {
      this.startFloor(0);
    }
    this.setState('playing');
    this.updateCamera(true);
  },

  // 메뉴에서 시작 (던전 / 콤보 연습장)
  startRun(mode) {
    this.newGame(mode);
    this.fadeIn = 30;
    Sound.play('gameStart');
    Music.play('dungeon');
  },

  toTitle() {
    this.enemies = [];
    this.projectiles = [];
    Effects.reset();
    Skills.reset();
    Menu.enter(this, 'title');
  },

  // ---------- 던전: 층 / 방 ----------
  startFloor(fi) {
    this.floorIndex = fi;
    this.floor = Dungeon.generateFloor(fi);
    this.prevRoom = null;
    Render.setTheme(fi % THEMES.length);
    this.enterRoom(0, 'left');
    this.floorBanner = { text: `${fi + 1}층`, sub: THEMES[fi % THEMES.length].name, life: 150, max: 150 };
  },

  enterRoom(i, side) {
    const D = CONFIG.dungeon;
    const room = this.floor.rooms[i];
    this.room = room;
    this.level = room.level;
    Dungeon.setLevel(room.level);
    Render.resetLevelCache();
    const en = room.level.entry[side];
    if (!this.player) this.player = new Player(en.x, en.y);
    const p = this.player;
    p.x = en.x; p.y = en.y; p.vx = 0; p.vy = 0;
    p.facing = side === 'left' ? 1 : -1;
    p.move = null;
    if (!p.dead) p.setState('free');
    p.initScarf();
    p.lastSafe = { x: en.x, y: en.y };
    this.enemies = [];
    this.projectiles = [];
    // 주우지 않은 아이템은 방을 나가면 그 방에 남음
    if (this.prevRoom) this.prevRoom.drops = this.drops;
    this.drops = room.drops || [];
    this.prevRoom = room;
    Skills.reset();
    room.visited = true;
    if (!room.cleared) {
      // 들어오면 양쪽 문이 잠기고 적 등장
      Dungeon.setLocked(room.level, true);
      this.roomWave = 0;
      this.roomTimer = D.spawnDelay;
      Sound.play('gate');
      Effects.addShake(4);
      Effects.popText(p.x + p.facing * 60, p.y - 70, room.kind === 'boss' ? '보스방' : '문이 잠겼다', room.kind === 'boss' ? '#ff5050' : '#ffb070', 16);
    } else {
      Dungeon.setLocked(room.level, false);
    }
    this.updateCamera(true);
  },

  // 다음 방으로 (페이드 아웃 → 이동 → 페이드 인)
  goToRoom(i, side) {
    if (this.transition) return;
    this.transition = { f: 0, to: i, side, nextFloor: false };
  },

  goNextFloor() {
    if (this.transition) return;
    if (this.floorIndex + 1 >= CONFIG.dungeon.floors) {
      Menu.enter(this, 'victory');
      Sound.play('victory');
      Music.play('title');
      return;
    }
    this.transition = { f: 0, nextFloor: true };
  },

  updateTransition() {
    const F = CONFIG.dungeon.fadeFrames, t = this.transition;
    t.f++;
    if (t.f === F) {
      if (t.nextFloor) this.startFloor(this.floorIndex + 1);
      else this.enterRoom(t.to, t.side);
    }
    if (t.f >= F * 2) this.transition = null;
  },

  // 웨이브 진행 / 클리어 / 문 출입
  updateRoom() {
    const D = CONFIG.dungeon, room = this.room, p = this.player;
    if (!room.cleared && !this.exec) {
      if (this.enemies.length === 0) {
        if (this.roomWave < room.waves.length) {
          if (--this.roomTimer <= 0) {
            this.spawnRoomWave(room.waves[this.roomWave]);
            this.roomWave++;
            this.roomTimer = D.waveDelay;
          }
        } else if (room.kind === 'boss' && !room.bossSpawned) {
          if (--this.roomTimer <= 0) this.spawnBoss();
        } else {
          this.clearRoom();
        }
      }
    }
    // 문 출입 (잠기지 않았을 때만 지나갈 수 있음)
    if (!room.level.locked && !p.dead && !this.exec) {
      if (p.x < -4 && room.index > 0) this.goToRoom(room.index - 1, 'right');
      else if (p.x > room.width + 4) {
        if (room.index < this.floor.rooms.length - 1) this.goToRoom(room.index + 1, 'left');
        else this.goNextFloor();
      }
    }
  },

  spawnRoomWave(types) {
    for (const t of types) {
      const pt = Dungeon.spawnPoint(this.level, this.player.x);
      const e = this.spawnEnemy(t, pt.x, pt.y);
      Effects.ring(e.x, e.y - e.h / 2, '#ff4040', 40);
      Effects.dust(e.x, pt.y, 10, 0);
    }
    Sound.play('spawn');
  },

  // 보스 등장: 하늘에서 떨어지며 이름 표시
  spawnBoss(id, x) {
    id = id || (this.room && this.room.bossId) || 'dusk';
    if (this.room) this.room.bossSpawned = true;
    const L = this.level;
    x = x !== undefined ? x : L.width * 0.68;
    const g = this.groundAt(x);
    const b = new Boss(id, g.x, g.y - 380);
    this.enemies.push(b);
    this.waveCleared = false;
    this.bossIntro = { name: b.name, title: b.cfg.title, life: CONFIG.boss.introFrames + 40, max: CONFIG.boss.introFrames + 40 };
    Sound.play('bossIntro');
    return b;
  },

  // 화면에 표시할 보스 (살아 있거나 격파 연출 중)
  get boss() {
    for (const e of this.enemies) if (e.isBoss && !e.remove) return e;
    return null;
  },

  // 방 클리어: 문 열림 + 최고 랭크에 따른 보상 상자
  clearRoom() {
    const room = this.room;
    room.cleared = true;
    Dungeon.setLocked(room.level, false);
    const best = Style.clearRoom();
    const cs = room.level.chestSpot;
    room.chest = { x: cs.x, y: cs.y, w: 30, h: 24, rank: best, opened: false, shake: 0, boss: room.kind === 'boss' };
    Effects.dust(cs.x, cs.y, 12, 0);
    Effects.ring(cs.x, cs.y - 12, '#ffd860', 50);
    this.clearBanner = {
      rank: best, heal: 0, life: CONFIG.style.clearBannerFrames, max: CONFIG.style.clearBannerFrames,
      note: room.kind === 'boss'
        ? (this.floorIndex + 1 >= CONFIG.dungeon.floors ? '오른쪽 문: 던전 탈출' : '오른쪽 문: 다음 층')
        : '보상 상자를 열어라',
    };
    Sound.play('gateOpen');
    Sound.play('clear');
  },

  // 보상 상자 열기 (공격으로 치거나 위 키): 장비 1개 (방 최고 랭크가 높을수록 좋은 등급) + 체력 조금
  openChest(chest) {
    if (chest.opened) return;
    chest.opened = true;
    const S = CONFIG.style, L = CONFIG.loot, p = this.player;
    const heal = Math.round((chest.rank >= 0 ? S.clearHeal[chest.rank] : 3) * L.chestHealMult);
    p.heal(heal);
    p.stamina = p.maxStamina;
    const item = Loot.roll(this.floorIndex || 0, Math.max(0, chest.rank), chest.boss ? L.bossMinRarity : 0);
    Loot.spawnDrop(this, item, chest.x, chest.y - 20, p.x < chest.x ? -1.5 : 1.5);
    Effects.radialSparks(chest.x, chest.y - 14, 20, '#ffd860', 1);
    Effects.ring(chest.x, chest.y - 14, '#ffe9a0', 60);
    if (heal > 0) Effects.popText(chest.x, chest.y - 46, `+${heal} HP`, '#7f7', 16);
    Sound.play('chest');
  },

  updateChest() {
    const ch = this.room && this.room.chest, p = this.player;
    if (!ch || ch.opened) return;
    if (ch.shake > 0) ch.shake--;
    const near = Math.abs(p.x - ch.x) < 30 && Math.abs(p.y - ch.y) < 30;
    if (near && Input.isPressed('up')) this.openChest(ch);
  },

  // 플레이어가 낭떠러지에 떨어짐: 데미지 + 직전 발판으로 복귀
  playerFell() {
    const D = CONFIG.dungeon, p = this.player;
    p.hp = Math.max(0, p.hp - D.fallDamage);
    Effects.damageNumber(p.x, p.y - 60, D.fallDamage, false);
    const s = p.lastSafe || (this.level.entry ? this.level.entry.left : { x: 200, y: this.level.groundY });
    p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0;
    p.move = null;
    p.invuln = D.fallInvuln;
    p.flash = 8;
    p.initScarf();
    Effects.dust(p.x, p.y, 10, 0);
    Effects.addShake(6);
    Sound.play('hurt');
    Style.onPlayerHit();
    this.combo.count = 0;
    if (p.hp <= 0) { p.dead = true; p.setState('dead'); }
    else p.setState('free');
    this.updateCamera(true);
  },

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  },

  spawnEnemy(type, x, y) {
    x = Math.max(80, Math.min(this.level.width - 80, x));
    if (y === undefined) {
      const g = this.groundAt(x);
      x = g.x; y = g.y;
    }
    const e = new Enemy(type, x, y);
    this.enemies.push(e);
    this.waveCleared = false;
    Effects.dust(x, y, 6, 0);
    return e;
  },

  // x 위치의 땅 높이 (낭떠러지면 가장 가까운 땅으로)
  groundAt(x) {
    const L = this.level;
    if (!L.segs) return { x, y: L.groundY };
    let best = null, bd = 1e9;
    for (const sg of L.segs) {
      if (sg.pit) continue;
      if (x >= sg.x0 && x <= sg.x1) return { x, y: CONFIG.dungeon.baseY - sg.h };
      const cx = Math.max(sg.x0 + 20, Math.min(sg.x1 - 20, x)), d = Math.abs(cx - x);
      if (d < bd) { bd = d; best = { x: cx, y: CONFIG.dungeon.baseY - sg.h }; }
    }
    return best;
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
  // weapon: 맞힌 무기 (플레이어 공격일 때). 한 콤보에 무기 3개를 모두 맞히면 TRINITY
  registerHit(weapon) {
    const c = this.combo;
    if (c.count === 0) { c.weapons = new Set(); c.trinity = false; }
    if (weapon && c.weapons) {
      c.weapons.add(weapon);
      if (!c.trinity && c.weapons.size >= WEAPON_ORDER.length) { c.trinity = true; Style.onTrinity(); }
    }
    this.combo.count++;
    this.combo.timer = CONFIG.feel.comboResetFrames;
    this.combo.pop = 6;
  },

  onEnemyKilled(enemy, how) {
    if (how !== 'execute') {
      this.kills++;
      Style.onKill();
    }
    if (how === 'pit') Style.pushFeed('RING OUT', '#ffb070');
    // 전설 '피의 갈망': 처치 시 회복
    const p = this.player;
    if (p.stats.uniques.bloodthirst) {
      const h = CONFIG.loot.uniques.bloodthirst.heal;
      p.heal(h);
      Effects.popText(p.x, p.y - p.h - 30, `+${h}`, '#f66', 12);
    }
    // 아이템 드랍
    if (enemy.isBoss) Loot.bossDrop(this, enemy);
    else Loot.enemyDrop(this, enemy);
  },

  onParry(enemy, tier) {
    Style.onParry(tier, this.player.parryChain);
  },

  onPostureBreak(enemy) {
    Style.onPostureBreak();
  },

  // ---------- 처형 ----------
  // 체간이 무너진 적 중 가까운 것
  findExecutable(p) {
    if (this.exec) return null;
    const R = CONFIG.posture.executeRange;
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.executed || (e.state !== 'broken' && e.state !== 'groggy')) continue;
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

    // 보스 처형: 체력이 충분하면 큰 데미지만 주고 날려버림 (두 동강은 마지막 일격일 때만)
    if (ex.f === splitAt && e.isBoss && e.hp > e.maxHp * CONFIG.boss.executeDamage) {
      const dmg = e.maxHp * CONFIG.boss.executeDamage;
      e.hp -= dmg;
      ex.survived = true;
      e.executed = false;
      e.groggyTimer = 0;
      e.posture = 0;
      e.armorBroken = 30;
      e.vx = ex.dir * 7; e.vy = -7;
      e.onGround = false;
      e.setState('launched');
      if (e.phase === 1 && e.hp <= e.maxHp * CONFIG.boss.phase2At) e.pendingPhase2 = true;
      Effects.damageNumber(e.x, e.y - e.h - 10, dmg, true);
      Effects.radialSparks(e.x, ex.cutY, 30, '#ff3030', 2);
      Effects.ring(e.x, ex.cutY, '#ff5040', 130);
      Effects.addShake(X.shake);
      Effects.impactFrame(1);
      Effects.popText(e.x, e.y - e.h - 34, '처형', '#ff4a3a', 30);
      p.execPose = 'flick';
      p.stateFrame = 0;
      for (let i = 0; i < 3; i++) Effects.afterimage(Anim.snapshot(Anim.playerFigure(p)), 'rgb(80,240,255)', 50);
      Sound.play('execSplit');
      this.registerHit();
      this.onExecution(e);
    } else if (ex.f === splitAt) {
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
      if (!ex.survived) e.remove = true;
      if (e.pendingPhase2) { e.pendingPhase2 = false; e.startPhase2(); }
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
    // 로고 / 타이틀
    if (this.state === 'gate' || this.state === 'logo' || this.state === 'title') { Menu.update(this); return; }
    if (this.fadeIn > 0) this.fadeIn--;

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
      // 7: 보스 소환 (층 번호에 맞는 보스)
      if (Input.isPressed('spawn7') && !this.boss) {
        this.spawnBoss(CONFIG.dungeon.bossByFloor[(this.floorIndex || 0) % 3], this.player.x + this.player.facing * 300);
      }
      // 8: 아이템 떨어뜨리기 (높은 등급이 잘 나옴)
      if (Input.isPressed('spawn8')) {
        const p = this.player;
        Loot.spawnDrop(this, Loot.roll(2, 4, 0), p.x + p.facing * 50, p.y - 10, p.facing * 1.5);
      }
    }

    // 인벤토리 (Tab): 게임 정지
    if (this.state === 'inventory') {
      Inventory.update(this);
      return;
    }
    if (this.state === 'playing' && Input.isPressed('inventory') && !this.exec && !this.transition && !this.player.dead) {
      Inventory.open(this);
      return;
    }

    // 일시정지 / 게임오버 / 클리어 메뉴
    if (this.state === 'paused') { Menu.update(this); return; }
    if (this.state === 'playing' && Input.isPressed('pause')) {
      Menu.enter(this, 'paused');
      Sound.play('menuSelect');
      return;
    }
    if (this.state === 'victory') { Menu.update(this); Effects.update(false); return; }
    if (this.state === 'gameover') {
      Menu.update(this);
      if (this.state !== 'gameover') return;
    }
    if (Input.isPressed('mode')) { this.startRun(this.mode === 'practice' ? 'dungeon' : 'practice'); return; }
    if (this.hint > 0) this.hint--;
    // 방 이동 페이드 중엔 정지
    if (this.transition) { this.updateTransition(); Effects.update(false); return; }

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
    // 기록
    if (this.state === 'playing') {
      this.run.frames++;
      this.run.bestRank = Math.max(this.run.bestRank, Style.rank);
      this.run.maxCombo = Math.max(this.run.maxCombo, this.combo.count);
    }

    p.update(this, Input);
    Combat.playerAttack(this, p);
    for (const e of this.enemies) e.update(this);
    this.enemies = this.enemies.filter((e) => !e.remove);
    for (const pr of this.projectiles) pr.update(this);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
    Skills.update(this);
    Loot.updateDrops(this);

    // 히트 수
    if (this.combo.timer > 0 && --this.combo.timer === 0) this.combo.count = 0;
    if (this.combo.pop > 0) this.combo.pop--;

    if (this.floorBanner && --this.floorBanner.life <= 0) this.floorBanner = null;
    if (this.bossIntro && --this.bossIntro.life <= 0) this.bossIntro = null;
    if (this.bossPhaseBanner && --this.bossPhaseBanner.life <= 0) this.bossPhaseBanner = null;
    // 낭떠러지 낙사
    if (p.y > this.level.killY && !p.dead) this.playerFell();
    if (this.mode === 'dungeon') {
      this.updateRoom();
      this.updateChest();
      // 음악: 보스가 있으면 보스 곡
      const b = this.boss;
      if (this.state === 'playing') Music.play(b && b.state !== 'bossDeath' ? 'boss' : 'dungeon');
    } else {
      // 콤보 연습장: 허수아비
      Practice.update(this);
    }
    if (p.dead && this.state === 'playing' && p.stateFrame > 40) {
      Menu.enter(this, 'gameover');
      Sound.play('gameOver');
      Music.stop();
    }
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

    // 로고 / 타이틀은 메뉴만
    if (this.state === 'gate' || this.state === 'logo' || this.state === 'title' || !this.player) {
      Menu.draw(ctx, this);
      ctx.restore();
      return;
    }

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
    if (this.room) Render.chest(ctx, this.room.chest);
    Loot.drawDrops(ctx, this);
    Skills.draw(ctx);
    for (const e of this.enemies) if (e.isBoss) Render.bossHazards(ctx, e);
    for (const e of this.enemies) if (!e.executed) Render.enemy(ctx, e);
    if (!ex) for (const e of this.enemies) Render.weakIcon(ctx, e, this.player);
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
    if (this.state === 'inventory') Inventory.draw(ctx, this);
    if (this.state === 'paused' || this.state === 'gameover' || this.state === 'victory') Menu.draw(ctx, this);
    // 시작 페이드 인
    if (this.fadeIn > 0) {
      ctx.fillStyle = `rgba(0,0,0,${(this.fadeIn / 30).toFixed(3)})`;
      ctx.fillRect(0, 0, V.width, V.height);
    }
    // 방 이동 페이드
    if (this.transition) {
      const F = CONFIG.dungeon.fadeFrames, f = this.transition.f;
      const a = f < F ? f / F : 1 - (f - F) / F;
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, a)).toFixed(3)})`;
      ctx.fillRect(0, 0, V.width, V.height);
    }
    ctx.restore();
  },
};

window.addEventListener('load', () => Game.init());

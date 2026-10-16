'use strict';
// =============================================================
//  PARRY — 패링 특화 2D 원히트 액션 플랫포머 (프로토타입)
//  모든 조정 가능한 수치는 아래 CONFIG 에 모여 있음.
// =============================================================

const CONFIG = {
  view: { w: 480, h: 270 },          // 내부 해상도 (정수 배율로 확대)
  fps: 60,                            // 고정 업데이트 주기
  room: { w: 960, h: 270 },           // 테스트 방 크기
  camera: { lerp: 0.12 },             // 카메라 추적 부드러움 (0~1)

  player: {
    w: 8, h: 16,                      // 충돌 박스
    runSpeed: 125,                    // 최고 달리기 속도 (px/s)
    groundAccel: 1500, groundDecel: 1800,
    airAccel: 950, airDecel: 450,
    gravity: 1000,                    // 상승 중 중력
    fallGravityMul: 1.35,             // 하강 중 중력 배수 (묵직한 낙하)
    maxFall: 380,
    jumpSpeed: 340,                   // 점프 초속 → 최대 높이 ≈ 58px
    jumpCutMul: 0.42,                 // Space 를 일찍 떼면 상승 속도에 곱함
    coyoteTime: 0.1,                  // 발판을 벗어난 뒤에도 점프 가능한 시간
    jumpBuffer: 0.1,                  // 착지 직전 누른 점프를 기억하는 시간
  },

  slash: {
    duration: 0.22,                   // 베기 모션 전체 길이
    parryWindow: 0.12,                // 베기 시작 후 패링 판정 창
    cooldown: 0.3,                    // 다음 베기까지 (베기 시작 기준)
    radius: 26,                       // 칼이 닿는 거리 (플레이어 중심 기준)
    arcHalf: 1.15,                    // 부채꼴 반각 (라디안, ≈66°)
    dashSpeed: 330,                   // 베는 방향 돌진 속도
    dashTime: 0.085,                  // 돌진 지속 (이동 입력/중력 무시)
    dashKeep: 0.35,                   // 돌진 종료 후 남기는 속도 비율
    airUpOnce: true,                  // 공중에서 위로 돌진은 착지 전까지 1회만
  },

  colors: {
    bg: '#05060d',
    terrain: '#000000',
    terrainEdge: '#1b2547',
    player: '#ffffff',
    ui: '#5fd8ff',
  },
};

// -------------------------------------------------------------
//  공용 유틸
// -------------------------------------------------------------
const W = CONFIG.view.w, H = CONFIG.view.h;
const STEP = 1 / CONFIG.fps;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, target, d) => (v < target ? Math.min(v + d, target) : Math.max(v - d, target));
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// -------------------------------------------------------------
//  화면: 480×270 버퍼에 그린 뒤 정수 배율로 확대
// -------------------------------------------------------------
const screen = document.getElementById('screen');
const sctx = screen.getContext('2d');
const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
const ctx = buf.getContext('2d');
let scale = 1;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  // 실제 장치 픽셀 기준으로 정수 배율을 잡아야 픽셀이 고르게 나옴
  scale = Math.max(1, Math.floor(Math.min(window.innerWidth * dpr / W, window.innerHeight * dpr / H)));
  screen.width = W * scale;
  screen.height = H * scale;
  screen.style.width = (W * scale / dpr) + 'px';
  screen.style.height = (H * scale / dpr) + 'px';
  sctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();
ctx.imageSmoothingEnabled = false;

// -------------------------------------------------------------
//  입력
// -------------------------------------------------------------
const Input = {
  down: new Set(),
  pressed: new Set(),     // 이번 틱에 새로 눌린 키 (틱마다 비움)
  mouse: { x: W / 2, y: H / 2, down: false, clicked: false },

  init() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    const toLocal = (e) => {
      const r = screen.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) / r.width * W;
      this.mouse.y = (e.clientY - r.top) / r.height * H;
    };
    window.addEventListener('mousemove', toLocal);
    screen.addEventListener('mousedown', (e) => {
      toLocal(e);
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    screen.addEventListener('contextmenu', (e) => e.preventDefault());
  },
  held(code) { return this.down.has(code); },
  hit(code) { return this.pressed.has(code); },
  endTick() { this.pressed.clear(); this.mouse.clicked = false; },
};
Input.init();

// -------------------------------------------------------------
//  방 (지형) 정의 — 재시작 시 이 정의로부터 즉시 다시 만든다
// -------------------------------------------------------------
const ROOM = {
  spawn: { x: 40, y: 238 },
  solids: [
    { x: 0, y: 238, w: 960, h: 32 },              // 바닥
    { x: -40, y: -200, w: 48, h: 470 },           // 왼쪽 벽
    { x: 952, y: -200, w: 48, h: 470 },           // 오른쪽 벽
    { x: 520, y: 214, w: 40, h: 24 },             // 낮은 엄폐물
    { x: 150, y: 190, w: 96, h: 6, oneWay: true }, // 발판 A
    { x: 350, y: 146, w: 124, h: 6, oneWay: true }, // 발판 B
    { x: 640, y: 188, w: 112, h: 6, oneWay: true }, // 발판 C
  ],
};

// 몸체를 지형과 충돌시키며 이동. 큰 속도에서도 뚫지 않도록 4px 단위로 나눠 이동.
function moveBody(b, dt) {
  const solids = ROOM.solids;
  let mx = b.vx * dt;
  const nx = Math.max(1, Math.ceil(Math.abs(mx) / 4));
  b.hitWall = 0;
  for (let i = 0; i < nx; i++) {
    b.x += mx / nx;
    for (const s of solids) {
      if (s.oneWay || !overlap(b, s)) continue;
      if (mx > 0) { b.x = s.x - b.w; b.hitWall = 1; } else { b.x = s.x + s.w; b.hitWall = -1; }
      b.vx = 0; mx = 0;
    }
  }
  let my = b.vy * dt;
  const ny = Math.max(1, Math.ceil(Math.abs(my) / 4));
  b.onGround = false;
  for (let i = 0; i < ny; i++) {
    const prevBottom = b.y + b.h;
    b.y += my / ny;
    for (const s of solids) {
      if (!overlap(b, s)) continue;
      if (s.oneWay) {
        // 일방향 발판: 위에서 내려올 때만 착지
        if (my > 0 && prevBottom <= s.y + 0.5) {
          b.y = s.y - b.h; b.vy = 0; b.onGround = true; my = 0;
        }
      } else if (my > 0) {
        b.y = s.y - b.h; b.vy = 0; b.onGround = true; my = 0;
      } else if (my < 0) {
        b.y = s.y + s.h; b.vy = 0; my = 0;
      }
    }
  }
}

// -------------------------------------------------------------
//  플레이어
// -------------------------------------------------------------
class Player {
  constructor(x, y) {
    const c = CONFIG.player;
    this.w = c.w; this.h = c.h;
    this.x = x - c.w / 2; this.y = y - c.h;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumping = false;     // 점프로 상승 중 (점프 컷 대상)
    this.facing = 1;
    // 베기
    this.slashT = -1;         // 베기 경과 시간 (-1 = 베는 중 아님)
    this.slashAngle = 0;
    this.slashFlip = 1;       // 베는 방향(위→아래 / 아래→위)을 번갈아
    this.slashCd = 0;
    this.dashT = 0;
    this.airUpUsed = false;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get slashing() { return this.slashT >= 0; }
  get inParryWindow() { return this.slashT >= 0 && this.slashT < CONFIG.slash.parryWindow; }
  // 칼 끝 위치 (충격파 링 등 연출 기준점)
  get tipX() { return this.cx + Math.cos(this.slashAngle) * CONFIG.slash.radius * 0.8; }
  get tipY() { return this.cy + Math.sin(this.slashAngle) * CONFIG.slash.radius * 0.8; }

  // 점(반지름 r)이 현재 칼 부채꼴 안에 있는가
  slashHits(px, py, r = 0) {
    if (!this.slashing) return false;
    const S = CONFIG.slash;
    const dx = px - this.cx, dy = py - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > S.radius + r) return false;
    if (d < 6 + r) return true;
    return Math.abs(angDiff(Math.atan2(dy, dx), this.slashAngle)) <= S.arcHalf + Math.asin(Math.min(1, r / d));
  }

  startSlash(aimX, aimY) {
    const S = CONFIG.slash;
    const a = Math.atan2(aimY - this.cy, aimX - this.cx);
    this.slashAngle = a;
    this.slashT = 0;
    this.slashCd = S.cooldown;
    this.slashFlip = -this.slashFlip;
    let dx = Math.cos(a), dy = Math.sin(a);
    if (Math.abs(dx) > 0.15) this.facing = Math.sign(dx);
    // 공중 위쪽 돌진은 착지 전까지 1회 — 무한 체공 방지
    if (!this.onGround && dy < 0) {
      if (S.airUpOnce && this.airUpUsed) dy = 0;
      this.airUpUsed = true;
    }
    if (this.onGround && dy > 0) dy = 0;
    this.vx = dx * S.dashSpeed;
    this.vy = dy * S.dashSpeed;
    this.dashT = S.dashTime;
    this.jumping = false;
  }

  update(dt, aimX, aimY) {
    const c = CONFIG.player, S = CONFIG.slash;
    const ax = (Input.held('KeyD') ? 1 : 0) - (Input.held('KeyA') ? 1 : 0);

    // 베기 타이머
    this.slashCd = Math.max(0, this.slashCd - dt);
    if (this.slashing) {
      this.slashT += dt;
      if (this.slashT >= S.duration) this.slashT = -1;
    }
    if (Input.mouse.clicked && this.slashCd <= 0) this.startSlash(aimX, aimY);

    // 점프 입력 타이머
    if (Input.hit('Space')) this.jumpBuf = c.jumpBuffer;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.onGround) { this.coyote = c.coyoteTime; this.airUpUsed = false; }
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.dashT > 0) {
      // 돌진 중: 입력·중력 무시하고 베는 방향으로 쭉
      this.dashT -= dt;
      if (this.dashT <= 0) { this.vx *= S.dashKeep; this.vy *= S.dashKeep; }
      moveBody(this, dt);
      return;
    }

    if (ax && !this.slashing) this.facing = ax;

    // 수평 이동
    const target = ax * c.runSpeed;
    let accel;
    if (this.onGround) accel = ax ? c.groundAccel : c.groundDecel;
    else accel = ax ? c.airAccel : c.airDecel;
    if (ax && Math.sign(this.vx) === -ax) accel *= 1.6; // 방향 전환은 더 빠릿하게
    this.vx = approach(this.vx, target, accel * dt);

    // 점프 (코요테 타임 + 점프 버퍼)
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = -c.jumpSpeed;
      this.jumpBuf = 0; this.coyote = 0;
      this.jumping = true; this.onGround = false;
    }
    // 가변 점프: 상승 중 Space 를 떼면 상승 속도를 깎음
    if (this.jumping && this.vy < 0 && !Input.held('Space')) {
      this.vy *= c.jumpCutMul;
      this.jumping = false;
    }
    if (this.vy >= 0) this.jumping = false;

    // 중력
    const g = c.gravity * (this.vy > 0 ? c.fallGravityMul : 1);
    this.vy = Math.min(this.vy + g * dt, c.maxFall);

    moveBody(this, dt);
  }

  draw(g) {
    g.fillStyle = CONFIG.colors.player;
    g.fillRect(Math.round(this.x), Math.round(this.y), this.w, this.h);
    this.drawSlash(g);
  }

  // 칼 궤적: 부채꼴을 따라 빠르게 휘두르는 초승달
  drawSlash(g) {
    if (!this.slashing) return;
    const S = CONFIG.slash;
    const p = this.slashT / S.duration;
    const sweep = Math.min(1, this.slashT / (S.parryWindow * 0.8)); // 판정 창 안에 휘두름 완료
    const a0 = this.slashAngle - S.arcHalf * this.slashFlip;
    const a1 = a0 + S.arcHalf * 2 * this.slashFlip * sweep;
    const cx = this.cx, cy = this.cy, R = S.radius;
    g.save();
    g.shadowColor = CONFIG.colors.player;
    g.shadowBlur = 8;
    g.globalAlpha = 1 - p * p;
    g.fillStyle = CONFIG.colors.player;
    g.beginPath();
    g.arc(cx, cy, R, a0, a1, this.slashFlip < 0);
    // 안쪽 호를 중심을 칼 방향으로 밀어 그려 초승달 모양
    const ox = Math.cos(this.slashAngle) * -R * 0.5, oy = Math.sin(this.slashAngle) * -R * 0.5;
    g.arc(cx + ox, cy + oy, R * 0.95, a1, a0, this.slashFlip > 0);
    g.closePath();
    g.fill();
    // 판정 창 동안 칼날 끝선을 더 밝게
    if (this.inParryWindow) {
      g.lineWidth = 1;
      g.strokeStyle = CONFIG.colors.player;
      g.beginPath();
      g.arc(cx, cy, R + 1, a0, a1, this.slashFlip < 0);
      g.stroke();
    }
    g.restore();
  }
}

// -------------------------------------------------------------
//  게임 상태
// -------------------------------------------------------------
const Game = {
  player: null,
  cam: { x: 0, y: 0 },

  reset() {
    this.player = new Player(ROOM.spawn.x, ROOM.spawn.y);
    this.cam.x = this.camTarget();
  },

  mouseWorld() {
    return { x: Input.mouse.x + this.cam.x, y: Input.mouse.y + this.cam.y };
  },

  camTarget() {
    return clamp(this.player.cx - W / 2, 0, CONFIG.room.w - W);
  },

  update(dt) {
    if (Input.hit('KeyR')) this.reset();
    const m = this.mouseWorld();
    this.player.update(dt, m.x, m.y);
    this.cam.x = lerp(this.cam.x, this.camTarget(), CONFIG.camera.lerp);
  },

  render() {
    const C = CONFIG.colors;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
    drawTerrain(ctx);
    this.player.draw(ctx);
    ctx.restore();

    // 확대 출력
    sctx.drawImage(buf, 0, 0, W * scale, H * scale);
  },
};

function drawTerrain(g) {
  const C = CONFIG.colors;
  for (const s of ROOM.solids) {
    g.fillStyle = C.terrain;
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = C.terrainEdge;
    g.fillRect(s.x, s.y, s.w, 1);
  }
}

// -------------------------------------------------------------
//  고정 60fps 루프
// -------------------------------------------------------------
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    Game.update(STEP);
    Input.endTick();
    acc -= STEP;
  }
  Game.render();
  requestAnimationFrame(frame);
}

Game.reset();
window.__game = Game; // 디버그용
requestAnimationFrame(frame);

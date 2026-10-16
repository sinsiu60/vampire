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
    hitTime: 0.15,                    // 베기 시작 후 적 몸통을 직접 벨 수 있는 시간
    directKill: true,                 // false 로 바꾸면 '패링으로만' 적을 죽일 수 있음
  },

  enemy: {
    gravity: 1000, maxFall: 380,
    edgeStop: true,                   // 발판 끝에서 멈춤 (떨어지지 않음)
  },

  melee: {                            // 근접 적: 크고 각진 실루엣
    w: 14, h: 22,
    speed: 62, accel: 700,
    aggroRange: 210, aggroHeight: 70, // 이 범위 안에 들어오면 추적 시작
    attackRange: 20,                  // 몸 사이 간격이 이 이하면 공격 시작
    attackHeight: 18,
    telegraph: 0.4,                   // 공격 예고 (무기 빨간 점멸)
    blinkRate: 0.05,                  // 점멸 간격
    active: 0.13,                     // 공격 판정 지속
    lunge: 170,                       // 공격 순간 앞으로 내딛는 속도
    recover: 0.6,                     // 공격 후 경직
    hitbox: { w: 24, h: 24 },         // 몸 앞쪽 공격 판정
    unparryableChance: 0,             // 패링 불가(보라) 공격 확률 — 프로토타입에선 0 (구조만)
  },

  gunner: {                           // 총잡이: 가늘고 총이 튀어나온 실루엣
    w: 8, h: 20,
    speed: 48, accel: 500,
    aggroRange: 290, aggroHeight: 130,
    keepMin: 85, keepMax: 175,        // 이 거리 사이를 유지하며 사격
    firstDelay: 0.5,                  // 발견 후 첫 사격 준비까지
    telegraph: 0.4,                   // 발사 예고 (총구 빨간 점멸)
    aimLock: 0.12,                    // 발사 직전 이 시간 동안은 조준 고정 (피할 틈)
    blinkRate: 0.05,
    cooldown: 1.35,                   // 발사 후 다음 예고까지
    gunLength: 15,
    unparryableChance: 0,             // 패링 불가(보라) 총알 확률 — 프로토타입에선 0 (구조만)
  },

  bullet: {
    speed: 150,                       // 적 총알 속도 (피할 수 있을 정도)
    radius: 2,
    life: 4,
    reflectSpeedMul: 1.9,             // 반사된 총알 속도 배수
  },

  parry: {
    bulletLeniency: 3,                // 총알 패링 판정 여유 (px)
    meleeEarly: 0.1,                  // 근접 적 예고 마지막 이 시간 동안 베어도 '패링'으로 인정
  },

  restartFade: 0.18,                  // 재시작 직후 화면이 밝아지는 짧은 페이드 (입력은 즉시 받음)

  colors: {
    bg: '#05060d',
    terrain: '#000000',
    terrainEdge: '#1b2547',
    player: '#ffffff',
    enemyBody: '#10121c',
    enemyRim: '#4a5170',
    enemyWeapon: '#2c3350',
    attack: '#ff2b3d',
    unparryable: '#b14dff',
    parry: '#ffd23a',
    parryHot: '#ff9a1f',
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
const circleRect = (cx, cy, r, b) => {
  const qx = clamp(cx, b.x, b.x + b.w), qy = clamp(cy, b.y, b.y + b.h);
  return (cx - qx) ** 2 + (cy - qy) ** 2 <= r * r;
};
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
  // x = 발 중심, y = 발이 닿는 지면 높이
  enemies: [
    { type: 'melee', x: 300, y: 238 },
    { type: 'melee', x: 830, y: 238 },
    { type: 'gunner', x: 440, y: 146 },   // 발판 B 위
    { type: 'gunner', x: 720, y: 188 },   // 발판 C 위
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

// 점이 지형(발판 포함) 안에 있는가
function solidAt(x, y, includeOneWay = true) {
  for (const s of ROOM.solids) {
    if (!includeOneWay && s.oneWay) continue;
    if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return true;
  }
  return false;
}

// -------------------------------------------------------------
//  파티클
// -------------------------------------------------------------
const Particles = {
  list: [],
  reset() { this.list.length = 0; },
  spawn(x, y, vx, vy, life, color, size = 1, grav = 0, glow = false) {
    this.list.push({ x, y, vx, vy, life, max: life, color, size, grav, glow });
  },
  burst(x, y, n, color, speed, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = (opts.angle ?? 0) + rand(-1, 1) * (opts.spread ?? Math.PI);
      const v = speed * rand(0.35, 1);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.6, 1) * (opts.life ?? 0.4),
        color, opts.size ?? 1, opts.grav ?? 0, opts.glow ?? false);
    }
  },
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy += p.grav * dt;
      p.vx *= 0.96; p.vy *= 0.98;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  },
  draw(g) {
    for (const p of this.list) {
      g.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      g.fillStyle = p.color;
      if (p.glow) { g.shadowColor = p.color; g.shadowBlur = 4; }
      g.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
      if (p.glow) g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
  },
};

// -------------------------------------------------------------
//  총알
// -------------------------------------------------------------
class Bullet {
  constructor(x, y, angle, speed, parryable = true) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.r = CONFIG.bullet.radius;
    this.owner = 'enemy';     // enemy | player(반사됨)
    this.parryable = parryable;
    this.life = CONFIG.bullet.life;
    this.dead = false;
    this.trail = [];
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.trail.unshift(this.x, this.y);
    if (this.trail.length > 24) this.trail.length = 24;
    // 빠른 총알이 벽을 뚫지 않도록 나눠서 이동. 일방향 발판은 통과.
    const n = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy) * dt / 3));
    for (let i = 0; i < n; i++) {
      this.x += this.vx * dt / n; this.y += this.vy * dt / n;
      if (solidAt(this.x, this.y, false)) {
        this.dead = true;
        Particles.burst(this.x, this.y, 5, this.color, 80, { life: 0.2 });
        return;
      }
    }
  }
  get color() {
    const C = CONFIG.colors;
    if (this.owner === 'player') return C.parry;
    return this.parryable ? C.attack : C.unparryable;
  }
  reflect(angle) {
    const sp = Math.hypot(this.vx, this.vy) * CONFIG.bullet.reflectSpeedMul;
    this.vx = Math.cos(angle) * sp; this.vy = Math.sin(angle) * sp;
    this.owner = 'player';
    this.life = CONFIG.bullet.life;
  }
  draw(g) {
    const col = this.color;
    g.save();
    g.shadowColor = col; g.shadowBlur = 6;
    g.strokeStyle = col; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(this.x, this.y);
    const len = Math.min(this.trail.length, 6);
    if (len >= 2) g.lineTo(this.trail[len - 2], this.trail[len - 1]);
    g.stroke();
    g.fillStyle = col;
    g.beginPath(); g.arc(this.x, this.y, this.r, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

// 두 점 사이 시야가 트였는가 (일방향 발판은 막지 않음)
function lineOfSight(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / 4);
  for (let i = 1; i < n; i++) {
    if (solidAt(lerp(x0, x1, i / n), lerp(y0, y1, i / n), false)) return false;
  }
  return true;
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
    this.dead = false;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get slashing() { return this.slashT >= 0; }
  get inParryWindow() { return this.slashT >= 0 && this.slashT < CONFIG.slash.parryWindow; }
  // 칼 끝 위치 (충격파 링 등 연출 기준점)
  get tipX() { return this.cx + Math.cos(this.slashAngle) * CONFIG.slash.radius * 0.8; }
  get tipY() { return this.cy + Math.sin(this.slashAngle) * CONFIG.slash.radius * 0.8; }

  // 사각형(적 몸통)이 칼에 닿았는가: 가장 가까운 점 + 중심점으로 판정
  slashHitsRect(r) {
    const qx = clamp(this.cx, r.x, r.x + r.w), qy = clamp(this.cy, r.y, r.y + r.h);
    return this.slashHits(qx, qy, 0) || this.slashHits(r.x + r.w / 2, r.y + r.h / 2, 3);
  }

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
    if (this.dead) return;
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
//  적 공통
// -------------------------------------------------------------
// 실루엣을 1px 테두리(림 라이트)와 함께 그림: 림 색으로 상하좌우 1px 밀어 그린 뒤 본체색으로 덮음
function drawRimmed(g, fn, body, rim) {
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.save(); g.translate(ox, oy); fn(g, rim); g.restore();
  }
  fn(g, body);
}
function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}

class Enemy {
  constructor(def, cfg) {
    this.cfg = cfg;
    this.w = cfg.w; this.h = cfg.h;
    this.x = def.x - cfg.w / 2; this.y = def.y - cfg.h;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.facing = def.facing ?? -1;
    this.state = 'idle';
    this.t = 0;
    this.dead = false;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  setState(s) { this.state = s; this.t = 0; }

  // 진행 방향 발밑에 지형이 있는가 (발판 끝에서 멈추기)
  canStep(dir) {
    if (!CONFIG.enemy.edgeStop || !this.onGround) return true;
    const fx = dir > 0 ? this.x + this.w + 1 : this.x - 1;
    return solidAt(fx, this.y + this.h + 2);
  }
  walk(dir, speed, accel, dt) {
    let target = dir * speed;
    if (dir && !this.canStep(dir)) target = 0;
    this.vx = approach(this.vx, target, accel * dt);
  }
  physics(dt) {
    const E = CONFIG.enemy;
    this.vy = Math.min(this.vy + E.gravity * dt, E.maxFall);
    moveBody(this, dt);
  }
  attackBox() { return null; }
}

// -------------------------------------------------------------
//  근접 적: 크고 각진 몸 + 거대한 식칼. 공격 0.4초 전 무기가 빨갛게 점멸
// -------------------------------------------------------------
class Melee extends Enemy {
  constructor(def) {
    super(def, CONFIG.melee);
    this.kind = 'melee';
    this.parryable = true;
  }

  // 지금 칼을 맞대면 패링으로 인정되는가 (공격 중 / 예고 마지막 순간)
  parryVulnerable() {
    if (!this.parryable) return false;
    return this.state === 'attack' ||
      (this.state === 'windup' && this.t >= this.cfg.telegraph - CONFIG.parry.meleeEarly);
  }
  // 예고 중/공격 중 무기가 차지하는 영역 (패링 판정용)
  threatBox() {
    const hb = this.cfg.hitbox;
    const x = this.facing > 0 ? this.x + this.w - 4 : this.x - hb.w + 4;
    return { x, y: this.y + this.h - hb.h - 6, w: hb.w, h: hb.h + 6 };
  }

  update(dt, player) {
    const C = this.cfg;
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    this.t += dt;
    switch (this.state) {
      case 'idle':
        this.walk(0, 0, C.accel, dt);
        if (!player.dead && Math.abs(dx) < C.aggroRange && Math.abs(dy) < C.aggroHeight) this.setState('chase');
        break;
      case 'chase': {
        if (player.dead) { this.setState('idle'); break; }
        this.facing = dx >= 0 ? 1 : -1;
        const gap = Math.abs(dx) - (this.w + player.w) / 2;
        if (gap <= C.attackRange && Math.abs(dy) < C.attackHeight && this.onGround) {
          this.setState('windup');
          this.parryable = Math.random() >= C.unparryableChance;
        } else {
          this.walk(this.facing, C.speed, C.accel, dt);
        }
        break;
      }
      case 'windup': // 예고: 방향 고정 — 뒤로 넘어가면 헛친다
        this.walk(0, 0, C.accel * 2, dt);
        if (this.t >= C.telegraph) {
          this.setState('attack');
          if (this.canStep(this.facing)) this.vx = this.facing * C.lunge;
        }
        break;
      case 'attack':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (!this.canStep(Math.sign(this.vx))) this.vx = 0;
        if (this.t >= C.active) this.setState('recover');
        break;
      case 'recover':
        this.walk(0, 0, C.accel, dt);
        if (this.t >= C.recover) this.setState(player.dead ? 'idle' : 'chase');
        break;
    }
    this.physics(dt);
  }

  attackBox() {
    if (this.state !== 'attack') return null;
    const hb = this.cfg.hitbox;
    const x = this.facing > 0 ? this.x + this.w - 4 : this.x - hb.w + 4;
    return { x, y: this.y + this.h - hb.h, w: hb.w, h: hb.h };
  }

  // 무기 각도 (오른쪽을 볼 때 기준, 0 = 정면, 음수 = 위쪽)
  weaponAngle() {
    const C = this.cfg;
    switch (this.state) {
      case 'windup': {
        const k = Math.min(1, this.t / (C.telegraph * 0.35));
        return lerp(-0.5, -2.4, 1 - (1 - k) * (1 - k)) + Math.sin(this.t * 90) * 0.04;
      }
      case 'attack': return lerp(-2.4, 1.1, Math.min(1, this.t / (C.active * 0.45)));
      case 'recover': return lerp(1.1, -0.5, Math.min(1, this.t / C.recover));
      default: return -0.5 + Math.sin(this.t * 3) * 0.05;
    }
  }
  // 무기 빨간 점멸 여부
  weaponHot() {
    if (this.state === 'attack') return true;
    if (this.state === 'windup') return Math.floor(this.t / this.cfg.blinkRate) % 2 === 0 || this.t > this.cfg.telegraph - 0.08;
    return false;
  }

  draw(g) {
    const Col = CONFIG.colors;
    const fx = Math.round(this.cx), fy = Math.round(this.y + this.h);
    const wa = this.weaponAngle();
    const hot = this.weaponHot();
    const atkCol = this.parryable ? Col.attack : Col.unparryable;
    g.save();
    g.translate(fx, fy);
    g.scale(this.facing, 1);
    const crouch = this.state === 'windup' ? 1 : 0;
    // 몸통 실루엣
    drawRimmed(g, (g, c) => {
      g.fillStyle = c;
      g.fillRect(-6, -7, 5, 7);
      g.fillRect(1, -7, 5, 7);
      poly(g, [-8, -20 + crouch, 8, -20 + crouch, 7, -13, 5, -7, -5, -7, -7, -13]);
      poly(g, [-3, -25 + crouch, 3, -25 + crouch, 4, -21 + crouch, -4, -21 + crouch]);
      g.fillRect(-1, -21 + crouch, 2, 1);
    }, Col.enemyBody, Col.enemyRim);
    // 휘두른 궤적 (빨강)
    if (this.state === 'attack') {
      g.save();
      g.globalAlpha = 0.55;
      g.fillStyle = atkCol;
      g.shadowColor = atkCol; g.shadowBlur = 8;
      g.beginPath();
      g.arc(6, -15, 20, -2.4, wa);
      g.arc(6, -15, 9, wa, -2.4, true);
      g.closePath(); g.fill();
      g.restore();
    }
    // 무기
    g.translate(6, -15);
    g.rotate(wa);
    const blade = (g, c) => {
      g.fillStyle = c;
      g.fillRect(0, -1, 7, 2);
      poly(g, [6, -3, 17, -4, 20, 0, 17, 3, 6, 3]);
    };
    if (hot) {
      g.shadowColor = atkCol; g.shadowBlur = 8;
      blade(g, atkCol);
      g.shadowBlur = 0;
    } else {
      drawRimmed(g, blade, Col.enemyWeapon, Col.enemyRim);
    }
    g.restore();
  }
}

// -------------------------------------------------------------
//  총잡이: 가는 몸 + 긴 코트 + 앞으로 튀어나온 총. 발사 0.4초 전 총구 빨간 점멸
// -------------------------------------------------------------
class Gunner extends Enemy {
  constructor(def) {
    super(def, CONFIG.gunner);
    this.kind = 'gunner';
    this.aim = this.facing > 0 ? 0 : Math.PI;
    this.cool = 0;
    this.nextParryable = true;
  }
  get pivotX() { return this.cx + this.facing; }
  get pivotY() { return this.y + this.h - 14; }
  get muzzleX() { return this.pivotX + Math.cos(this.aim) * this.cfg.gunLength; }
  get muzzleY() { return this.pivotY + Math.sin(this.aim) * this.cfg.gunLength; }

  aimAt(player) {
    this.aim = Math.atan2(player.cy - this.pivotY, player.cx - this.pivotX);
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  update(dt, player, game) {
    const C = this.cfg;
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    const sees = !player.dead && Math.abs(dx) < C.aggroRange && Math.abs(dy) < C.aggroHeight &&
      lineOfSight(this.pivotX, this.pivotY, player.cx, player.cy);
    this.t += dt;
    switch (this.state) {
      case 'idle':
        this.walk(0, 0, C.accel, dt);
        if (sees) { this.setState('engage'); this.cool = C.firstDelay; }
        break;
      case 'engage': {
        if (player.dead) { this.setState('idle'); break; }
        this.aimAt(player);
        const dist = Math.abs(dx);
        let dir = 0;
        if (dist < C.keepMin) dir = -Math.sign(dx);
        else if (dist > C.keepMax) dir = Math.sign(dx);
        this.walk(dir, C.speed, C.accel, dt);
        this.cool -= dt;
        if (this.cool <= 0 && sees) {
          this.setState('windup');
          this.nextParryable = Math.random() >= C.unparryableChance;
        }
        break;
      }
      case 'windup':
        this.walk(0, 0, C.accel * 2, dt);
        if (this.t < C.telegraph - C.aimLock && !player.dead) this.aimAt(player);
        if (this.t >= C.telegraph) {
          game.bullets.push(new Bullet(this.muzzleX, this.muzzleY, this.aim, CONFIG.bullet.speed, this.nextParryable));
          Particles.burst(this.muzzleX, this.muzzleY, 4, this.nextParryable ? CONFIG.colors.attack : CONFIG.colors.unparryable,
            70, { angle: this.aim, spread: 0.5, life: 0.12, glow: true });
          this.vx -= Math.cos(this.aim) * 40; // 반동
          this.cool = C.cooldown;
          this.setState('engage');
        }
        break;
    }
    this.physics(dt);
  }

  muzzleHot() {
    return this.state === 'windup' &&
      (Math.floor(this.t / this.cfg.blinkRate) % 2 === 0 || this.t > this.cfg.telegraph - 0.08);
  }

  draw(g) {
    const Col = CONFIG.colors;
    const fx = Math.round(this.cx), fy = Math.round(this.y + this.h);
    const atkCol = this.nextParryable ? Col.attack : Col.unparryable;
    // 조준선 (예고 중, 옅게)
    if (this.state === 'windup') {
      g.save();
      g.globalAlpha = this.t > this.cfg.telegraph - this.cfg.aimLock ? 0.5 : 0.2;
      g.strokeStyle = atkCol; g.lineWidth = 1;
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(this.muzzleX, this.muzzleY);
      g.lineTo(this.muzzleX + Math.cos(this.aim) * 70, this.muzzleY + Math.sin(this.aim) * 70);
      g.stroke();
      g.restore();
    }
    g.save();
    g.translate(fx, fy);
    g.scale(this.facing, 1);
    drawRimmed(g, (g, c) => {
      g.fillStyle = c;
      g.fillRect(-3, -8, 2, 8);
      g.fillRect(1, -8, 2, 8);
      poly(g, [-3, -16, 3, -16, 3, -6, -5, -5]);   // 뒤로 날리는 긴 코트
      g.fillRect(-2, -20, 4, 4);                   // 머리
      g.fillRect(-4, -20, 8, 1);                   // 모자 챙
      g.fillRect(-2, -23, 4, 3);                   // 모자
    }, Col.enemyBody, Col.enemyRim);
    // 팔 + 총 (조준 각도로 회전)
    const local = this.facing > 0 ? this.aim : Math.PI - this.aim;
    g.translate(1, -14);
    g.rotate(local);
    drawRimmed(g, (g, c) => {
      g.fillStyle = c;
      g.fillRect(0, -1, 5, 2);
      g.fillRect(4, -2, 8, 3);
      g.fillRect(5, 1, 2, 2);   // 손잡이
      g.fillRect(12, -1, 3, 1); // 총열
    }, Col.enemyBody, Col.enemyRim);
    if (this.muzzleHot()) {
      g.shadowColor = atkCol; g.shadowBlur = 8;
      g.fillStyle = atkCol;
      g.fillRect(11, -2, 5, 3);
    }
    g.restore();
  }
}

const ENEMY_TYPES = { melee: Melee, gunner: Gunner };

// -------------------------------------------------------------
//  게임 상태
// -------------------------------------------------------------
const Game = {
  state: 'play',          // play | dead | clear
  player: null,
  enemies: [],
  bullets: [],
  cam: { x: 0, y: 0 },
  fade: 0,

  reset() {
    this.state = 'play';
    this.player = new Player(ROOM.spawn.x, ROOM.spawn.y);
    this.enemies = ROOM.enemies.map((d) => new ENEMY_TYPES[d.type](d));
    this.bullets = [];
    Particles.reset();
    this.cam.x = this.camTarget();
    this.fade = CONFIG.restartFade;
  },

  mouseWorld() {
    return { x: Input.mouse.x + this.cam.x, y: Input.mouse.y + this.cam.y };
  },

  camTarget() {
    return clamp(this.player.cx - W / 2, 0, CONFIG.room.w - W);
  },

  update(dt) {
    if (Input.hit('KeyR')) { this.reset(); return; }
    this.fade = Math.max(0, this.fade - dt);
    const p = this.player;
    if (!p.dead) {
      const m = this.mouseWorld();
      p.update(dt, m.x, m.y);
    }
    for (const e of this.enemies) e.update(dt, p, this);
    for (const b of this.bullets) b.update(dt);
    this.resolveCombat();
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
    Particles.update(dt);
    if (this.state === 'play' && this.enemies.length === 0) this.state = 'clear';
    this.cam.x = lerp(this.cam.x, this.camTarget(), CONFIG.camera.lerp);
  },

  resolveCombat() {
    const p = this.player;
    const S = CONFIG.slash, P = CONFIG.parry;

    if (!p.dead && p.inParryWindow) {
      // 1) 패링: 총알 → 마우스 방향으로 반사
      for (const b of this.bullets) {
        if (b.dead || b.owner !== 'enemy' || !b.parryable) continue;
        if (p.slashHits(b.x, b.y, b.r + P.bulletLeniency)) this.parryBullet(b);
      }
      // 2) 패링: 근접 공격 → 적 즉사
      for (const e of this.enemies) {
        if (e.dead || !e.parryVulnerable || !e.parryVulnerable()) continue;
        if (p.slashHitsRect(e.threatBox()) || p.slashHitsRect(e)) this.parryMelee(e);
      }
    }

    // 3) 칼이 적 몸통에 직접 닿음 → 즉사
    if (!p.dead && S.directKill && p.slashing && p.slashT < S.hitTime) {
      for (const e of this.enemies) {
        if (!e.dead && p.slashHitsRect(e)) this.killEnemy(e, p.slashAngle);
      }
    }

    // 4) 총알 명중
    for (const b of this.bullets) {
      if (b.dead) continue;
      if (b.owner === 'player') {
        for (const e of this.enemies) {
          if (!e.dead && circleRect(b.x, b.y, b.r, e)) {
            this.killEnemy(e, Math.atan2(b.vy, b.vx), true);
            b.dead = true;
            break;
          }
        }
      } else if (!p.dead && circleRect(b.x, b.y, b.r - 1, p)) {
        b.dead = true;
        this.killPlayer(Math.atan2(b.vy, b.vx));
      }
    }

    // 5) 근접 공격 명중
    if (p.dead) return;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const box = e.attackBox();
      if (box && overlap(p, box)) { this.killPlayer(Math.atan2(p.cy - e.cy, p.cx - e.cx)); return; }
    }
  },

  parryBullet(b) {
    const m = this.mouseWorld(), p = this.player;
    b.reflect(Math.atan2(m.y - p.cy, m.x - p.cx));
    Particles.burst(b.x, b.y, 10, CONFIG.colors.parry, 160, { life: 0.3, glow: true });
  },

  parryMelee(e) {
    Particles.burst(this.player.tipX, this.player.tipY, 12, CONFIG.colors.parry, 180, { life: 0.3, glow: true });
    this.killEnemy(e, this.player.slashAngle, true);
  },

  killEnemy(e, angle, byParry = false) {
    if (e.dead) return;
    e.dead = true;
    Particles.burst(e.cx, e.cy, 18, CONFIG.colors.enemyRim, 160, { angle, spread: 1.0, life: 0.5, grav: 400, size: 2 });
    Particles.burst(e.cx, e.cy, 10, CONFIG.colors.player, 220, { angle, spread: 0.5, life: 0.25, glow: true });
  },

  killPlayer(angle) {
    const p = this.player;
    p.dead = true;
    this.state = 'dead';
    Particles.burst(p.cx, p.cy, 24, CONFIG.colors.player, 180, { angle, spread: 1.2, life: 0.6, grav: 400, size: 2 });
  },

  render() {
    const C = CONFIG.colors;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
    drawTerrain(ctx);
    for (const e of this.enemies) e.draw(ctx);
    this.player.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    Particles.draw(ctx);
    ctx.restore();

    this.drawUI(ctx);
    if (this.fade > 0) {
      ctx.fillStyle = '#000';
      ctx.globalAlpha = this.fade / CONFIG.restartFade;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // 확대 출력
    sctx.drawImage(buf, 0, 0, W * scale, H * scale);
  },

  drawUI(g) {
    if (this.state === 'play') return;
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = CONFIG.colors.ui;
    g.shadowColor = CONFIG.colors.ui; g.shadowBlur = 6;
    if (this.state === 'clear') {
      g.font = 'bold 28px monospace';
      g.fillText('CLEAR', W / 2, H / 2 - 18);
      g.font = 'bold 12px sans-serif';
      g.fillText('방의 적을 모두 처치했다  ·  R 다시 하기', W / 2, H / 2 + 10);
    } else {
      g.font = 'bold 12px sans-serif';
      g.fillText('R  —  재시작', W / 2, H / 2);
    }
    g.restore();
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

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
    w: 16, h: 26,
    speed: 62, accel: 700,
    aggroRange: 210, aggroHeight: 70, // 이 범위 안에 들어오면 추적 시작
    attackRange: 20,                  // 몸 사이 간격이 이 이하면 공격 시작
    attackHeight: 18,
    telegraph: 0.4,                   // 공격 예고 (무기 빨간 점멸)
    blinkRate: 0.05,                  // 점멸 간격
    active: 0.13,                     // 공격 판정 지속
    lunge: 170,                       // 공격 순간 앞으로 내딛는 속도
    recover: 0.6,                     // 공격 후 경직
    hitbox: { w: 26, h: 28 },         // 몸 앞쪽 공격 판정
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

  fx: {
    // 패링 성공 연출
    parryHitstop: 0.08,               // 1) 히트스톱: 화면 전체 정지
    flashTime: 1 / 60,                // 2) 흰 섬광 (한 프레임)
    flashAlpha: 0.85,
    ringRadius: 38, ringTime: 0.3, ringWidth: 3,   // 3) 칼 끝 노란 충격파 링
    reflectColorTime: 0.12,           // 4) 반사 총알 빨강 → 노랑 전환 시간
    trailLength: 14,                  //    반사 총알 꼬리 길이 (프레임)
    parryShake: 4.5, parryShakeTime: 0.18,          // 5) 짧고 강한 화면 흔들림
    pieceSpeed: 90, pieceSpin: 9,     // 6) 두 조각으로 갈라지는 속도/회전
    debris: 14,                       //    흩어지는 파편 수
    // 일반 처치/사망
    killHitstop: 0.035, killShake: 2, killShakeTime: 0.1,
    deathHitstop: 0.06, deathShake: 3.5,
  },

  anim: {
    leanMax: 0.2,                     // 달릴 때 몸 기울기 (라디안)
    jumpStretch: 0.32,                // 점프 순간 세로로 늘어남
    landSquash: 0.38,                 // 착지 순간 납작해짐 (낙하 속도에 비례)
    dashStretch: 0.3,
    springBack: 0.22,                 // 원래 모양으로 돌아오는 속도 (0~1)
    ghostTime: 0.16,                  // 잔상 유지 시간
    ghostEveryRun: 4,                 // 전력 질주 시 몇 틱마다 잔상
    scarfNodes: 7, scarfSeg: 2.3,     // 머플러 마디 수 / 마디 길이
    scarfDrag: 0.86, scarfGravity: 9, scarfWave: 26,
    scarfTrail: 22,                   // 가만히 있어도 등 뒤로 살짝 흩날리는 힘
  },

  logo: { text: '시우 공방', fadeIn: 0.6, hold: 0.8, fadeOut: 0.6 }, // 합계 2초

  scanline: { alpha: 0.2 },           // 은은한 스캔라인

  hintTime: 7,                        // 시작 후 조작법 안내 표시 시간

  audio: { enabled: true, volume: 0.35 }, // M 키로 음소거 토글

  restartFade: 0.18,                  // 재시작 직후 화면이 밝아지는 짧은 페이드 (입력은 즉시 받음)

  colors: {
    // ── 색 규칙 (게임 전체 고정) ──
    // 검정/짙은 남색: 배경·지형 | 흰색: 플레이어·칼 궤적·머플러 | 빨강: 패링 가능한 적 공격·예고·총알
    // 보라: 패링 불가 공격 | 노랑/주황: 패링 성공·반사된 공격 | 하늘색: UI
    bg: '#05060d',
    skyTop: '#020309', skyBottom: '#0d1330',
    farCity: '#0a1029', nearCity: '#050812', window: '#141d3d', star: '#1f2a52',
    terrain: '#000000',
    terrainEdge: '#1b2547',
    terrainLine: '#0a0f22',
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
// 시드 고정 난수 (배경이 매번 같은 모양이 되도록)
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixColor = (a, b, t) => {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp(t, 0, 1)))).join(',')})`;
};
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
    // 브라우저 정책상 오디오는 사용자 입력 이벤트 안에서 시작해야 함
    const unlock = () => Sfx.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
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
  spawn(x, y, vx, vy, life, color, size = 1, grav = 0, glow = false, streak = false) {
    this.list.push({ x, y, vx, vy, life, max: life, color, size, grav, glow, streak });
  },
  burst(x, y, n, color, speed, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = (opts.angle ?? 0) + rand(-1, 1) * (opts.spread ?? Math.PI);
      const v = speed * rand(0.35, 1);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.6, 1) * (opts.life ?? 0.4),
        color, opts.size ?? 1, opts.grav ?? 0, opts.glow ?? false, opts.streak ?? false);
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
      if (p.streak) {
        // 속도 방향으로 늘어진 불꽃 선
        g.strokeStyle = p.color; g.lineWidth = p.size;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        g.stroke();
      } else {
        g.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
      }
      if (p.glow) g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
  },
};

// -------------------------------------------------------------
//  충격파 링
// -------------------------------------------------------------
const Rings = {
  list: [],
  reset() { this.list.length = 0; },
  spawn(x, y, radius, time, width, color) {
    this.list.push({ x, y, radius, time, t: 0, width, color });
  },
  update(dt) {
    for (const r of this.list) r.t += dt;
    this.list = this.list.filter((r) => r.t < r.time);
  },
  draw(g) {
    g.save();
    for (const r of this.list) {
      const k = r.t / r.time;
      const e = 1 - (1 - k) ** 3;                 // 처음에 확 퍼지고 감속
      g.globalAlpha = 1 - k * k;
      g.strokeStyle = r.color;
      g.shadowColor = r.color; g.shadowBlur = 8;
      g.lineWidth = Math.max(1, r.width * (1 - k));
      g.beginPath();
      g.arc(r.x, r.y, 3 + (r.radius - 3) * e, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  },
};

// -------------------------------------------------------------
//  시체 조각: 실루엣을 베인 방향의 직선으로 잘라 두 조각으로
// -------------------------------------------------------------
const Pieces = {
  list: [],
  slices: [],               // 잘린 순간 그어지는 빛나는 절단선
  reset() { this.list.length = 0; this.slices.length = 0; },

  // drawFn(g) 이 그리는 실루엣을 (cx, cy) 중심, angle 방향으로 절단
  split(drawFn, cx, cy, angle, color, power = 1) {
    const S = 64;
    const img = document.createElement('canvas');
    img.width = S; img.height = S;
    const g = img.getContext('2d');
    g.translate(S / 2 - Math.round(cx), S / 2 - Math.round(cy));
    drawFn(g);
    const F = CONFIG.fx;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (const side of [1, -1]) {
      const nx = -dy * side, ny = dx * side;   // 절단선의 법선 (이 조각이 날아갈 쪽)
      const sp = F.pieceSpeed * power * rand(0.7, 1.2);
      this.list.push({
        img, side, angle,
        x: cx + nx * 1.5, y: cy + ny * 1.5,
        w: 6, h: 6,
        vx: nx * sp * 0.6 + dx * sp * rand(0.6, 1.1),
        vy: ny * sp * 0.6 + dy * sp * rand(0.6, 1.1) - 70 * power,
        rot: 0, vrot: side * F.pieceSpin * rand(0.5, 1.2) * (dx >= 0 ? 1 : -1),
        rest: false,
      });
    }
    this.slices.push({ x: cx, y: cy, angle, t: 0, time: 0.14, color });
  },

  update(dt) {
    for (const p of this.list) {
      if (p.rest) continue;
      p.vy = Math.min(p.vy + CONFIG.enemy.gravity * dt, CONFIG.enemy.maxFall);
      // 몸체 좌표(x,y)는 조각 중심. moveBody 용 박스로 변환해 지형과 충돌
      const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h, vx: p.vx, vy: p.vy };
      const vyBefore = p.vy;
      moveBody(box, dt);
      p.x = box.x + p.w / 2; p.y = box.y + p.h / 2;
      p.vx = box.vx; p.vy = box.vy;
      if (box.hitWall) p.vx = -p.vx * 0.4;
      p.rot += p.vrot * dt;
      if (box.onGround) {
        if (vyBefore > 80) p.vy = -vyBefore * 0.3;   // 튕김
        p.vx *= 0.8; p.vrot *= 0.7;
        if (Math.abs(p.vx) < 4 && Math.abs(p.vrot) < 0.3 && vyBefore < 80) p.rest = true;
      }
    }
    for (const sl of this.slices) sl.t += dt;
    this.slices = this.slices.filter((sl) => sl.t < sl.time);
  },

  draw(g) {
    const L = 40;
    for (const p of this.list) {
      const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
      const nx = -dy * p.side, ny = dx * p.side;
      g.save();
      g.translate(Math.round(p.x), Math.round(p.y));
      g.rotate(p.rot);
      // 절단선 한쪽 반평면만 남기는 클립
      g.beginPath();
      g.moveTo(dx * L, dy * L);
      g.lineTo(-dx * L, -dy * L);
      g.lineTo(-dx * L + nx * L, -dy * L + ny * L);
      g.lineTo(dx * L + nx * L, dy * L + ny * L);
      g.closePath();
      g.clip();
      g.drawImage(p.img, -p.img.width / 2, -p.img.height / 2);
      g.restore();
    }
    // 절단선 섬광
    g.save();
    for (const sl of this.slices) {
      const k = sl.t / sl.time;
      const len = 22 * (1 - k * 0.5);
      g.globalAlpha = 1 - k;
      g.strokeStyle = sl.color;
      g.shadowColor = sl.color; g.shadowBlur = 8;
      g.lineWidth = Math.max(1, 2 * (1 - k));
      g.beginPath();
      g.moveTo(sl.x - Math.cos(sl.angle) * len, sl.y - Math.sin(sl.angle) * len);
      g.lineTo(sl.x + Math.cos(sl.angle) * len, sl.y + Math.sin(sl.angle) * len);
      g.stroke();
    }
    g.restore();
  },
};

// -------------------------------------------------------------
//  효과음 (WebAudio 로 즉석 합성, 파일 없음)
// -------------------------------------------------------------
const Sfx = {
  ac: null, master: null, noiseBuf: null,
  muted: false,
  ensure() {
    if (!CONFIG.audio.enabled) return false;
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = CONFIG.audio.volume;
      this.master.connect(this.ac.destination);
      const n = this.ac.sampleRate * 0.5;
      this.noiseBuf = this.ac.createBuffer(1, n, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    return !this.muted;
  },
  toggleMute() { this.muted = !this.muted; },
  tone(type, f0, f1, dur, vol, delay = 0) {
    const ac = this.ac, t = ac.currentTime + delay;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, filterType, f0, f1, delay = 0) {
    const ac = this.ac, t = ac.currentTime + delay;
    const src = ac.createBufferSource(), flt = ac.createBiquadFilter(), gn = ac.createGain();
    src.buffer = this.noiseBuf;
    flt.type = filterType;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(gn).connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  play(name) {
    if (!this.ensure()) return;
    switch (name) {
      case 'slash': this.noise(0.12, 0.5, 'bandpass', 2500, 700); break;
      case 'parry': // 날카로운 금속 충돌음
        this.tone('square', 1900, 1500, 0.25, 0.25);
        this.tone('triangle', 3100, 2600, 0.35, 0.3);
        this.tone('sine', 140, 50, 0.2, 0.6);
        this.noise(0.08, 0.7, 'highpass', 3000, 6000);
        break;
      case 'shot': this.noise(0.1, 0.5, 'lowpass', 3000, 300); this.tone('square', 220, 60, 0.08, 0.15); break;
      case 'charge': this.tone('sine', 900, 1400, 0.3, 0.06); break;
      case 'kill': this.noise(0.18, 0.6, 'lowpass', 1800, 120); this.tone('sine', 120, 40, 0.2, 0.5); break;
      case 'death': this.noise(0.4, 0.7, 'lowpass', 1200, 60); this.tone('sawtooth', 200, 40, 0.4, 0.2); break;
      case 'clear': [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.15, i * 0.08)); break;
    }
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
    this.trail = [];          // 지난 위치 [x0,y0,x1,y1,...] (최신이 앞)
    this.reflectT = 0;        // 반사 후 경과 시간 (색 전환용)
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.owner === 'player') this.reflectT += dt;
    this.trail.unshift(this.x, this.y);
    const maxTrail = (this.owner === 'player' ? CONFIG.fx.trailLength : 3) * 2;
    if (this.trail.length > maxTrail) this.trail.length = maxTrail;
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
    if (this.owner === 'player') return mixColor(C.attack, C.parry, this.reflectT / CONFIG.fx.reflectColorTime);
    return this.parryable ? C.attack : C.unparryable;
  }
  reflect(angle) {
    const sp = Math.hypot(this.vx, this.vy) * CONFIG.bullet.reflectSpeedMul;
    this.vx = Math.cos(angle) * sp; this.vy = Math.sin(angle) * sp;
    this.owner = 'player';
    this.life = CONFIG.bullet.life;
    this.reflectT = 0;
    this.trail = [];
  }
  draw(g) {
    const col = this.color;
    g.save();
    g.shadowColor = col; g.shadowBlur = 6;
    g.lineCap = 'round';
    // 꼬리 궤적: 머리에서 멀어질수록 가늘고 옅게 (반사 총알은 주황으로 식어감)
    const n = this.trail.length / 2;
    let px = this.x, py = this.y;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const tx = this.trail[i * 2], ty = this.trail[i * 2 + 1];
      g.globalAlpha = 1 - k;
      g.strokeStyle = this.owner === 'player' && k > 0.3 ? CONFIG.colors.parryHot : col;
      g.lineWidth = Math.max(1, (this.owner === 'player' ? 3 : 2) * (1 - k));
      g.beginPath(); g.moveTo(px, py); g.lineTo(tx, ty); g.stroke();
      px = tx; py = ty;
    }
    g.globalAlpha = 1;
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
    // 애니메이션
    this.lean = 0;
    this.sx = 1; this.sy = 1;  // squash & stretch
    this.runPhase = 0;
    this.ghosts = [];
    this.tick = 0;
    this.scarf = [];
    for (let i = 0; i < CONFIG.anim.scarfNodes; i++) {
      const n = { x: this.cx, y: this.y + 4 + i };
      this.scarf.push({ x: n.x, y: n.y, px: n.x, py: n.y });
    }
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
    Sfx.play('slash');
  }

  update(dt, aimX, aimY) {
    const wasGround = this.onGround, vyBefore = this.vy, slashBefore = this.slashT;
    this.move(dt, aimX, aimY);
    this.animate(dt, wasGround, vyBefore, slashBefore);
  }

  animate(dt, wasGround, vyBefore, slashBefore) {
    const A = CONFIG.anim, c = CONFIG.player;
    this.tick++;
    // 기울이기: 속도 방향으로
    const targetLean = this.dashT > 0 ? 0 : clamp(this.vx / c.runSpeed, -1, 1) * A.leanMax;
    this.lean = lerp(this.lean, targetLean, 0.25);
    // 늘이고 줄이기
    if (this.jumping && wasGround) { this.sy = 1 + A.jumpStretch; this.sx = 1 - A.jumpStretch * 0.6; }
    if (this.onGround && !wasGround && vyBefore > 60) {
      const k = clamp(vyBefore / c.maxFall, 0.3, 1) * A.landSquash;
      this.sy = 1 - k; this.sx = 1 + k;
    }
    if (this.slashT === 0 && slashBefore < 0) { this.sx = 1 + A.dashStretch; this.sy = 1 - A.dashStretch * 0.5; }
    this.sx = lerp(this.sx, 1, A.springBack);
    this.sy = lerp(this.sy, 1, A.springBack);
    // 달리기 다리 주기
    if (this.onGround) this.runPhase += Math.abs(this.vx) * dt * 0.28;
    // 잔상
    const sp = Math.hypot(this.vx, this.vy);
    const dashing = this.dashT > 0 || sp > c.runSpeed * 1.4;
    if (dashing || (this.onGround && Math.abs(this.vx) > c.runSpeed * 0.9 && this.tick % A.ghostEveryRun === 0)) {
      this.ghosts.push({ ...this.pose(), t: 0, strong: dashing });
    }
    for (const gh of this.ghosts) gh.t += dt;
    this.ghosts = this.ghosts.filter((gh) => gh.t < A.ghostTime);
    // 머플러 (verlet 로프): 목에 고정, 나머지는 관성+중력+펄럭임
    const nk = this.neck();
    const sc = this.scarf;
    sc[0].x = nk.x; sc[0].y = nk.y;
    const moving = Math.max(0.2, Math.min(1, sp / c.runSpeed)); // 서 있어도 살짝 펄럭임
    for (let i = 1; i < sc.length; i++) {
      const n = sc[i];
      const vx = (n.x - n.px) * A.scarfDrag, vy = (n.y - n.py) * A.scarfDrag;
      n.px = n.x; n.py = n.y;
      n.x += vx - this.facing * A.scarfTrail * dt * dt * 60;
      n.y += vy + A.scarfGravity * dt * dt * 60 + Math.sin(this.tick * 0.35 + i * 0.9) * A.scarfWave * moving * dt * dt * 60 * (i / sc.length);
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 1; i < sc.length; i++) {
        const a = sc[i - 1], b = sc[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const diff = (d - A.scarfSeg) / d;
        if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
        else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
      }
    }
  }

  neck() {
    return { x: this.cx - this.facing * 1 + Math.sin(this.lean) * 12, y: this.y + this.h - 12 * this.sy };
  }

  pose() {
    return {
      x: this.cx, y: this.y + this.h, lean: this.lean, sx: this.sx, sy: this.sy, facing: this.facing,
      phase: this.runPhase, air: !this.onGround, vy: this.vy, slashing: this.slashing,
    };
  }

  move(dt, aimX, aimY) {
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
    // 잔상 (흰 실루엣이 옅게 남음)
    for (const gh of this.ghosts) {
      const k = 1 - gh.t / CONFIG.anim.ghostTime;
      Player.drawBody(g, gh, CONFIG.colors.player, k * (gh.strong ? 0.45 : 0.22));
    }
    this.drawScarf(g);
    Player.drawBody(g, this.pose(), CONFIG.colors.player, 1);
    this.drawSlash(g);
  }

  drawScarf(g) {
    const sc = this.scarf;
    g.save();
    g.strokeStyle = CONFIG.colors.player;
    g.lineCap = 'round';
    for (let i = 1; i < sc.length; i++) {
      g.lineWidth = i < sc.length * 0.5 ? 2 : 1;
      g.beginPath();
      g.moveTo(sc[i - 1].x, sc[i - 1].y);
      g.lineTo(sc[i].x, sc[i].y);
      g.stroke();
    }
    g.restore();
  }

  // 흰 실루엣 본체. 발 위치 기준으로 기울이고 늘리고 줄임
  static drawBody(g, P, color, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.translate(Math.round(P.x), Math.round(P.y));
    g.rotate(P.lean);
    g.scale(P.facing * P.sx, P.sy);
    g.fillStyle = color;
    // 다리
    if (P.air) {
      const tuck = P.vy < 0 ? 1 : 0;
      g.fillRect(-3, -6, 2, 5 - tuck);
      g.fillRect(1, -6, 2, 4);
      g.fillRect(2, -3, 2, 1);
    } else {
      const s1 = Math.sin(P.phase), s2 = Math.sin(P.phase + Math.PI);
      g.fillRect(-2 + Math.round(s1 * 2.5) - 1, -6, 2, 6 - Math.max(0, Math.round(-Math.cos(P.phase) * 1.5)));
      g.fillRect(-1 + Math.round(s2 * 2.5) + 1, -6, 2, 6 - Math.max(0, Math.round(Math.cos(P.phase) * 1.5)));
    }
    // 몸통 + 머리 + 머리끈 뒷머리
    poly(g, [-3, -13, 3, -13, 3, -6, -3, -6]);
    g.fillRect(-2, -17, 5, 4);
    g.fillRect(-4, -17, 2, 2);
    // 칼집 (베지 않을 때 등 뒤에 비스듬히)
    if (!P.slashing) {
      g.fillRect(-4, -11, 1, 1);
      g.fillRect(-5, -10, 1, 1);
      g.fillRect(-6, -9, 1, 1);
      g.fillRect(-3, -12, 1, 1);
    }
    g.restore();
  }

  // 칼 궤적: 부채꼴을 따라 휘두르는 초승달. 가운데가 두껍고 양끝이 가늘다.
  drawSlash(g) {
    if (!this.slashing) return;
    const S = CONFIG.slash;
    const p = this.slashT / S.duration;
    const sweep = Math.min(1, this.slashT / (S.parryWindow * 0.7)); // 판정 창 안에 휘두름 완료
    const tail = Math.max(0, (this.slashT - S.parryWindow * 0.5) / (S.duration - S.parryWindow * 0.5)); // 꼬리부터 사라짐
    const R = S.radius, cx = this.cx, cy = this.cy;
    const a0 = this.slashAngle - S.arcHalf * this.slashFlip;
    const span = S.arcHalf * 2 * this.slashFlip;
    const N = 14;
    const u0 = tail, u1 = Math.max(u0, sweep);
    if (u1 - u0 < 0.01) return;
    const outer = [], inner = [];
    for (let i = 0; i <= N; i++) {
      const u = lerp(u0, u1, i / N);
      const a = a0 + span * u;
      const thick = Math.sin(Math.PI * u) * R * 0.55;   // 가운데가 가장 두꺼움
      outer.push(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      inner.push(cx + Math.cos(a) * (R - thick), cy + Math.sin(a) * (R - thick));
    }
    g.save();
    g.globalAlpha = 1 - p * p * 0.6;
    g.fillStyle = CONFIG.colors.player;
    g.shadowColor = CONFIG.colors.player;
    g.shadowBlur = this.inParryWindow ? 10 : 5;
    g.beginPath();
    g.moveTo(outer[0], outer[1]);
    for (let i = 2; i < outer.length; i += 2) g.lineTo(outer[i], outer[i + 1]);
    for (let i = inner.length - 2; i >= 0; i -= 2) g.lineTo(inner[i], inner[i + 1]);
    g.closePath();
    g.fill();
    // 칼날 본체: 휘두르는 끝 각도 쪽으로 뻗은 선
    const ab = a0 + span * u1;
    g.globalAlpha = 1;
    g.strokeStyle = CONFIG.colors.player;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx + Math.cos(ab) * 4, cy + Math.sin(ab) * 4);
    g.lineTo(cx + Math.cos(ab) * (R + 1), cy + Math.sin(ab) * (R + 1));
    g.stroke();
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
      g.fillRect(-7, -8, 6, 8);                                                  // 굵은 다리
      g.fillRect(1, -8, 6, 8);
      poly(g, [-10, -23 + crouch, 10, -23 + crouch, 9, -16, 6, -8, -6, -8, -9, -16]); // 역삼각 상체
      poly(g, [-12, -25 + crouch, -5, -25 + crouch, -5, -20 + crouch, -11, -20 + crouch]); // 각진 어깨 갑옷
      poly(g, [-3, -29 + crouch, 4, -29 + crouch, 5, -23 + crouch, -4, -23 + crouch]);     // 투구
    }, Col.enemyBody, Col.enemyRim);
    // 휘두른 궤적 (빨강)
    if (this.state === 'attack') {
      g.save();
      g.globalAlpha = 0.55;
      g.fillStyle = atkCol;
      g.shadowColor = atkCol; g.shadowBlur = 8;
      g.beginPath();
      g.arc(7, -17, 24, -2.4, wa);
      g.arc(7, -17, 10, wa, -2.4, true);
      g.closePath(); g.fill();
      g.restore();
    }
    // 무기
    g.translate(7, -17);
    g.rotate(wa);
    const blade = (g, c) => {
      g.fillStyle = c;
      g.fillRect(0, -1, 8, 2);
      poly(g, [7, -3, 19, -5, 23, 0, 19, 4, 7, 4]);
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
          Sfx.play('charge');
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
          Sfx.play('shot');
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
  state: 'logo',          // logo | play | dead | clear
  logoT: 0,
  playT: 0,               // 첫 판 시작 후 경과 (조작 안내 표시용)
  player: null,
  enemies: [],
  bullets: [],
  cam: { x: 0, y: 0 },
  fade: 0,
  hitstop: 0,             // 남은 정지 시간
  flash: 0, flashShown: false,
  shake: { t: 0, time: 1, amp: 0, angle: 0, ox: 0, oy: 0 },

  reset() {
    this.state = 'play';
    this.player = new Player(ROOM.spawn.x, ROOM.spawn.y);
    this.enemies = ROOM.enemies.map((d) => new ENEMY_TYPES[d.type](d));
    this.bullets = [];
    Particles.reset();
    Rings.reset();
    Pieces.reset();
    this.hitstop = 0;
    this.flash = 0;
    this.shake.t = 0; this.shake.ox = this.shake.oy = 0;
    this.cam.x = this.camTarget();
    this.fade = CONFIG.restartFade;
  },

  mouseWorld() {
    return { x: Input.mouse.x + this.cam.x, y: Input.mouse.y + this.cam.y };
  },

  camTarget() {
    return clamp(this.player.cx - W / 2, 0, CONFIG.room.w - W);
  },

  // 반환값: 이번 틱에 입력을 소비했는가 (히트스톱 중 누른 클릭은 다음 틱까지 보존)
  update(dt) {
    if (this.state === 'logo') {
      const L = CONFIG.logo;
      this.logoT += dt;
      if (this.logoT >= L.fadeIn + L.hold + L.fadeOut) this.reset();
      return true;
    }
    this.playT += dt;
    if (Input.hit('KeyR')) { this.reset(); return true; }
    if (Input.hit('KeyM')) Sfx.toggleMute();
    this.fade = Math.max(0, this.fade - dt);
    if (this.flash > 0 && this.flashShown) this.flash -= dt;

    // 히트스톱: 월드 전체 정지
    if (this.hitstop > 0) { this.hitstop -= dt; return false; }

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
    Rings.update(dt);
    Pieces.update(dt);
    if (this.state === 'play' && this.enemies.length === 0) { this.state = 'clear'; Sfx.play('clear'); }
    this.cam.x = lerp(this.cam.x, this.camTarget(), CONFIG.camera.lerp);

    // 화면 흔들림: 흔들 방향 위주로, 제곱 감쇠
    const sh = this.shake;
    if (sh.t > 0) {
      sh.t -= dt;
      const k = Math.max(0, sh.t / sh.time) ** 2;
      const along = rand(-1, 1) * sh.amp * k, side = rand(-1, 1) * sh.amp * k * 0.4;
      sh.ox = Math.cos(sh.angle) * along - Math.sin(sh.angle) * side;
      sh.oy = Math.sin(sh.angle) * along + Math.cos(sh.angle) * side;
    } else { sh.ox = sh.oy = 0; }
    return true;
  },

  addShake(amp, time, angle = rand(0, Math.PI * 2)) {
    const sh = this.shake;
    if (sh.t > 0 && sh.amp * (sh.t / sh.time) ** 2 > amp) return; // 더 센 흔들림 유지
    sh.amp = amp; sh.time = time; sh.t = time; sh.angle = angle;
    sh.ox = Math.cos(angle) * amp; sh.oy = Math.sin(angle) * amp; // 첫 프레임에 바로 튕김
  },

  // 패링 성공 공통 연출 (x, y = 칼에 맞부딪힌 지점)
  parryFx(x, y, angle) {
    const F = CONFIG.fx, C = CONFIG.colors;
    this.hitstop = Math.max(this.hitstop, F.parryHitstop);       // 1) 히트스톱
    this.flash = F.flashTime; this.flashShown = false;           // 2) 흰 섬광
    Rings.spawn(x, y, F.ringRadius, F.ringTime, F.ringWidth, C.parry);            // 3) 충격파 링
    Rings.spawn(x, y, F.ringRadius * 0.55, F.ringTime * 0.7, F.ringWidth - 1, C.parryHot);
    this.addShake(F.parryShake, F.parryShakeTime, angle);         // 5) 화면 흔들림
    Particles.burst(x, y, 14, C.parry, 260, { angle, spread: 1.3, life: 0.28, glow: true, streak: true });
    Particles.burst(x, y, 6, C.parryHot, 120, { life: 0.35, glow: true });
    Sfx.play('parry');
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
    const out = Math.atan2(m.y - p.cy, m.x - p.cx);
    // 맞부딪힌 지점: 총알 방향의 칼날 위
    const a = Math.atan2(b.y - p.cy, b.x - p.cx), r = CONFIG.slash.radius * 0.8;
    b.reflect(out);                                                // 4) 마우스 방향 반사 (색/꼬리는 Bullet 에서)
    this.parryFx(p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r, out);
  },

  parryMelee(e) {
    const p = this.player;
    this.parryFx(p.tipX, p.tipY, p.slashAngle);
    this.killEnemy(e, p.slashAngle, true);
  },

  // 6) 적 사망: 베인 방향으로 두 조각 + 파편
  killEnemy(e, angle, byParry = false) {
    if (e.dead) return;
    e.dead = true;
    const F = CONFIG.fx, C = CONFIG.colors;
    e.setState('dead');                // 무기 발광을 끄고 시체 자세로
    Pieces.split((g) => e.draw(g), e.cx, e.cy, angle, byParry ? C.parry : C.player, byParry ? 1.4 : 1);
    Particles.burst(e.cx, e.cy, F.debris, C.enemyRim, 170, { angle, spread: 1.1, life: 0.7, grav: 500, size: 2 });
    Particles.burst(e.cx, e.cy, F.debris, C.enemyBody, 130, { angle, spread: 1.4, life: 0.8, grav: 500, size: 2 });
    Particles.burst(e.cx, e.cy, 8, byParry ? C.parry : C.player, 240, { angle, spread: 0.4, life: 0.2, glow: true, streak: true });
    this.hitstop = Math.max(this.hitstop, F.killHitstop);
    this.addShake(F.killShake, F.killShakeTime, angle);
    Sfx.play('kill');
  },

  killPlayer(angle) {
    const p = this.player, F = CONFIG.fx, C = CONFIG.colors;
    p.dead = true;
    this.state = 'dead';
    Pieces.split((g) => Player.drawBody(g, { ...p.pose(), slashing: false }, C.player, 1), p.cx, p.cy, angle, C.attack, 1.1);
    Particles.burst(p.cx, p.cy, 16, C.player, 180, { angle, spread: 1.0, life: 0.6, grav: 400, size: 1 });
    this.hitstop = Math.max(this.hitstop, F.deathHitstop);
    this.addShake(F.deathShake, 0.2, angle);
    Sfx.play('death');
  },

  render() {
    if (this.state === 'logo') { this.renderLogo(); return; }
    const sx = this.shake.ox, sy = this.shake.oy;
    Backdrop.draw(ctx, this.cam.x - sx);

    ctx.save();
    ctx.translate(-Math.round(this.cam.x - sx), -Math.round(this.cam.y - sy));
    drawTerrain(ctx);
    Pieces.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    this.player.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    Particles.draw(ctx);
    Rings.draw(ctx);
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = CONFIG.fx.flashAlpha;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      this.flashShown = true;
    }

    this.drawUI(ctx);
    if (this.fade > 0) {
      ctx.fillStyle = '#000';
      ctx.globalAlpha = this.fade / CONFIG.restartFade;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    this.present();
  },

  // 버퍼를 정수 배율로 확대 + 스캔라인
  present() {
    sctx.drawImage(buf, 0, 0, W * scale, H * scale);
    drawScanlines();
  },

  renderLogo() {
    const L = CONFIG.logo, t = this.logoT;
    let a = 1;
    if (t < L.fadeIn) a = t / L.fadeIn;
    else if (t > L.fadeIn + L.hold) a = 1 - (t - L.fadeIn - L.hold) / L.fadeOut;
    a = clamp(a, 0, 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = a * a * (3 - 2 * a);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = CONFIG.colors.ui;
    ctx.shadowColor = CONFIG.colors.ui; ctx.shadowBlur = 10;
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(L.text, W / 2, H / 2 - 4);
    // 글자 아래로 그어지는 한 줄
    const k = clamp(t / (L.fadeIn + L.hold), 0, 1);
    const lw = 90 * (1 - (1 - k) ** 3);
    ctx.fillRect(Math.round(W / 2 - lw / 2), Math.round(H / 2 + 14), Math.round(lw), 1);
    ctx.restore();
    this.present();
  },

  drawUI(g) {
    const C = CONFIG.colors;
    g.save();
    g.fillStyle = C.ui;
    g.textBaseline = 'middle';
    // 남은 적 수
    g.font = 'bold 10px monospace';
    g.textAlign = 'left';
    g.globalAlpha = 0.85;
    g.fillText('남은 적 ' + this.enemies.length, 8, 10);
    if (Sfx.muted) { g.textAlign = 'right'; g.fillText('MUTE', W - 8, 10); }
    // 조작 안내 (첫 판 몇 초)
    if (this.playT < CONFIG.hintTime) {
      g.globalAlpha = 0.75 * clamp(CONFIG.hintTime - this.playT, 0, 1);
      g.textAlign = 'center';
      g.font = '10px sans-serif';
      g.fillText('A/D 이동 · Space 점프 · 클릭 베기 — 빨간 공격이 닿는 순간 베면 패링', W / 2, H - 10);
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.shadowColor = C.ui; g.shadowBlur = 6;
    if (this.state === 'clear') {
      g.font = 'bold 28px monospace';
      g.fillText('CLEAR', W / 2, H / 2 - 18);
      g.font = 'bold 12px sans-serif';
      g.fillText('방의 적을 모두 처치했다  ·  R 다시 하기', W / 2, H / 2 + 10);
    } else if (this.state === 'dead') {
      g.font = 'bold 12px sans-serif';
      g.fillText('R  —  재시작', W / 2, H / 2);
    }
    // 조준점
    g.shadowBlur = 0;
    const mx = Math.round(Input.mouse.x), my = Math.round(Input.mouse.y);
    g.fillRect(mx - 4, my, 3, 1); g.fillRect(mx + 2, my, 3, 1);
    g.fillRect(mx, my - 4, 1, 3); g.fillRect(mx, my + 2, 1, 3);
    g.restore();
  },
};

// -------------------------------------------------------------
//  배경: 하늘 + 2겹 도시 실루엣 시차 스크롤 (한 번만 미리 그려둠)
// -------------------------------------------------------------
const Backdrop = {
  layers: [],
  build() {
    const C = CONFIG.colors, rng = seeded(1337);
    const r = (a, b) => a + rng() * (b - a);
    // 0) 하늘 (고정): 위가 더 어두운 남색 그라디언트 + 희미한 별
    const sky = document.createElement('canvas');
    sky.width = W; sky.height = H;
    let g = sky.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, C.skyTop);
    grad.addColorStop(0.85, C.skyBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.fillStyle = C.star;
    for (let i = 0; i < 60; i++) g.fillRect(Math.floor(r(0, W)), Math.floor(r(0, H * 0.55)), 1, 1);
    this.layers = [{ img: sky, factor: 0 }];
    // 1) 먼 도시 / 2) 가까운 도시 (창문 몇 개)
    const city = (factor, color, minH, maxH, minW, maxW, windows) => {
      const cw = Math.ceil(W + (CONFIG.room.w - W) * factor) + 16;
      const c = document.createElement('canvas');
      c.width = cw; c.height = H;
      g = c.getContext('2d');
      const base = 240;
      let x = -4;
      while (x < cw) {
        const bw = Math.floor(r(minW, maxW)), bh = Math.floor(r(minH, maxH));
        g.fillStyle = color;
        g.fillRect(x, base - bh, bw, bh + 40);
        if (rng() < 0.4) g.fillRect(x + Math.floor(bw * 0.25), base - bh - 4, Math.floor(bw * 0.5), 4); // 계단식 옥상
        if (rng() < 0.3) g.fillRect(x + Math.floor(r(2, bw - 2)), base - bh - Math.floor(r(6, 16)), 1, 16); // 안테나
        if (windows) {
          g.fillStyle = C.window;
          for (let wy = base - bh + 4; wy < base - 4; wy += 5) {
            for (let wx = x + 3; wx < x + bw - 3; wx += 4) if (rng() < 0.1) g.fillRect(wx, wy, 2, 1);
          }
        }
        x += bw + Math.floor(r(0, 6));
      }
      return { img: c, factor };
    };
    this.layers.push(city(0.15, C.farCity, 50, 150, 16, 40, false));
    this.layers.push(city(0.45, C.nearCity, 30, 110, 22, 56, true));
  },
  draw(g, camX) {
    for (const L of this.layers) g.drawImage(L.img, -Math.round(camX * L.factor), 0);
  },
};
Backdrop.build();

function drawTerrain(g) {
  const C = CONFIG.colors;
  for (const s of ROOM.solids) {
    g.fillStyle = C.terrain;
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = C.terrainEdge;
    g.fillRect(s.x, s.y, s.w, 1);
    if (s.oneWay) {
      // 발판: 아래 지지대
      g.fillStyle = C.terrainLine;
      for (let x = s.x + 6; x < s.x + s.w - 4; x += 18) g.fillRect(x, s.y + s.h, 1, 4);
    } else if (s.h > 12) {
      // 바닥/엄폐물: 희미한 벽돌 줄눈
      g.fillStyle = C.terrainLine;
      for (let y = s.y + 6, row = 0; y < s.y + s.h; y += 6, row++) {
        g.fillRect(s.x, y, s.w, 1);
        for (let x = s.x + (row % 2) * 12; x < s.x + s.w; x += 24) g.fillRect(x, y - 5, 1, 5);
      }
    }
  }
}

// 은은한 스캔라인: 확대된 화면에서 픽셀 한 줄마다 아래쪽을 살짝 어둡게
let scanPattern = null, scanScale = 0;
function drawScanlines() {
  if (scanScale !== scale) {
    const c = document.createElement('canvas');
    c.width = 1; c.height = Math.max(2, scale);
    const g = c.getContext('2d');
    g.fillStyle = `rgba(0,0,0,${CONFIG.scanline.alpha})`;
    g.fillRect(0, c.height - Math.max(1, Math.floor(scale / 3)), 1, Math.max(1, Math.floor(scale / 3)));
    scanPattern = sctx.createPattern(c, 'repeat');
    scanScale = scale;
  }
  sctx.fillStyle = scanPattern;
  sctx.fillRect(0, 0, screen.width, screen.height);
}

// -------------------------------------------------------------
//  고정 60fps 루프
// -------------------------------------------------------------
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    if (Game.update(STEP)) Input.endTick();
    acc -= STEP;
  }
  Game.render();
  requestAnimationFrame(frame);
}

window.__game = Game; // 디버그용
requestAnimationFrame(frame);

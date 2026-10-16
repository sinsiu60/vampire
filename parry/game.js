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
    firstDelay: 0.5,                  // 발견 후 첫 조준까지
    AIM_TIME: 0.8,                    // 조준 시작 → 발사 (빨간 조준선이 플레이어 추적)
    AIM_LOCK_TIME: 0.15,              // 발사 이 시간 전부터 조준 고정 (흰색 깜빡 + 총구 빨간 빛)
    LASER_ALPHA_MIN: 0.4,             // 조준선 시작 투명도 (고정 직전 1.0)
    LOCK_BLINKS: 2,                   // 조준 고정 시 흰색 깜빡임 횟수
    LOCK_BLINK_TIME: 0.025,           // 깜빡임 한 번 길이 (초)
    cooldown: 1.35,                   // 발사 후 다음 조준까지
    gunLength: 15,
    unparryableChance: 0,             // 패링 불가(보라) 사격 확률 — 프로토타입에선 0 (구조만)
  },

  // 적 사격 = 히트스캔 (발사 즉시 명중) + 타이밍 패링
  shot: {
    PARRY_EARLY: 0.10,                // 발사 이 시간 전부터 베기를 시작했으면 패링
    PARRY_LATE: 0.05,                 // 발사 후 이 시간까지 베기를 시작해도 패링 (그동안 피격 판정 보류)
    WHIFF_COOLDOWN: 0.3,              // 헛스윙(패링·처치 없음)이면 이 시간 동안 베기 불가 → 연타 패링 방지
    MIN_SHOT_GAP: 0.3,                // 여러 총잡이의 발사 순간 최소 간격 (자동으로 벌림)
    RANGE: 480,                       // 사격/반사 사거리 (px)
    TRACER_FRAMES: 3,                 // 탄 궤적 표시 프레임
    TRACER_WIDTH: 2,                  // 적 탄 궤적 두께
    REFLECT_TRACER_WIDTH: 3,          // 반사탄 궤적 두께
    PLAYER_HIT_PAD: 1,                // 플레이어 피격 판정 여유 (px)
  },

  parry: {
    meleeEarly: 0.1,                  // 근접 적 예고 마지막 이 시간 동안 베어도 '패링'으로 인정
  },

  // 패링 반사 보정: 원하는 방향으로 쳤다고 느끼면서도 잘 맞도록. 강하게, 하지만 티 안 나게.
  aimAssist: {
    AIM_SNAP_ANGLE: 35,               // 마우스 방향 ±이 각도(°) 안의 적을 스냅 후보로
    OWNER_PRIORITY_ANGLE: 50,         // 그 총알을 쏜 적이 ±이 각도(°) 안이면 최우선
    AIM_SNAP_RANGE: 300,              // 후보 최대 거리 (px)
    MELEE_PARRY_RANGE_BONUS: 0.2,     // 근접 패링 판정 거리 +20%
  },

  // 타격감: 처치/패링 순간 아래 요소가 '동시에' 터진다. F2 패널에서 하나씩 끄고 켜며 비교 가능.
  // 킬 연출 타임라인 (60fps 프레임 기준, 카타나 제로 실측)
  //  0f      처치 → 타임스톱 시작: 플레이어·적은 베는 자세로 정지, 빛줄기/피/먼지/흔들림/궤적만 움직임
  //  0~10f   빛줄기가 화면 밖 → 화면 밖으로 쓸고 지나감
  //  16f     해제: 적 두 조각이 공격 방향으로 날아감, 3겹 궤적 사라짐, 조작 재개
  //  16~22f  흔들림 꼬리가 0 으로
  kill: {
    KILL_HITSTOP_FRAMES: 16,          // 1) 타임스톱 길이
    FREEZE_OTHERS: true,              //    다른 적·총알도 함께 정지 (false 면 계속 움직이되 그동안 플레이어는 무적)
    BEAM_FRAMES: 11,                  // 2) 빛줄기가 쓸고 지나가는 프레임 수
    BEAM_WIDTH: 2,                    //    빛줄기 두께 (내부 해상도 px)
    BEAM_GLOW: 6,
    BEAM_MARGIN: 12,                  //    화면 밖 시작/끝 여유 (px)
    DUST_COUNT: 12,                   //    빛줄기가 바닥을 지나는 지점의 흙먼지 개수
    DUST_SPEED: 70,
    TRAIL_RADIUS: 34,                 // 3) 3겹 궤적 반지름
    TRAIL_ARC: 80,                    //    반각 (°)
    TRAIL_SWEEP_FRAMES: 3,            //    궤적이 휘둘러지는 프레임 수 (타임스톱 중 재생)
    TRAIL_PINK_LAG: 1.5,              //    분홍 잔상이 늦게 따라오는 프레임 수
    TRAIL_MIN_FRAMES: 4,              //    타임스톱을 끈 경우에도 최소한 보이는 프레임 수
    BLOOD_MIN: 30, BLOOD_MAX: 40,     // 4) 피 덩어리 개수
    BLOOD_CONE: 28,                   //    원뿔 반각 (°)
    BLOOD_SPEED_MIN: 60, BLOOD_SPEED_MAX: 330,
    BLOOD_STOP_SPEED: 0.12,           //    타임스톱 중 퍼지는 속도 배율 (천천히)
    BLOOD_GRAVITY: 700,
    BLOOD_LIFE: 1.6,
    SHAKE_START: 8,                   // 5) 처치 흔들림 시작 강도 (px)
    SHAKE_TAIL_FRAMES: 6,             //    해제 후 이 프레임 안에 0
    SHAKE_CURVE: 2.5,                 //    감쇠 곡선 지수 (클수록 초반에 몰림)
    SHAKE_BIAS: 0.55,                 //    공격 방향 쪽 치우침 (0 = 완전 랜덤, 1 = 공격 방향으로만)
  },

  debug: {
    SLOW_SCALE: 0.1,                  // 7) F3 슬로우 모드 게임 속도
  },

  // 사격 패링 성공 시퀀스 (실제 시간 기준)
  //  0초                parry_chang + 히트스톱 6f + 흰 섬광 + 노란 불꽃 /
  //                     slowmo_in, 시간 속도 1.0 → 0.1 (SLOWMO_IN 동안), 채도 감소 + 비네트
  //  SLOWMO_IN           slowmo_loop 반복 시작, 노란 반사 궤적이 대상 쪽으로 천천히 뻗어감
  //  + SLOWMO_HOLD       time_return 재생, slowmo 소리 LOOP_FADE 동안 줄이며 정지,
  //                      시간 속도 0.1 → 1.0 (ease-in) — 길이는 time_return.wav 의 실제 길이.
  //                      채도·비네트 원상복구, 화면 살짝 줌인
  //  + time_return 길이   반사탄(히트스캔) 명중 → 3px 노란 궤적 + kill_sound + 16프레임 킬 연출
  parrySeq: {
    LOCK_INPUT_DURING_SLOWMO: true,   // 시퀀스 중 플레이어 입력 잠금 (그동안 플레이어는 맞지 않음)
    DESATURATE: 0.4,                  // 슬로우 중 채도 감소량 (0.4 = 40%)
    VIGNETTE: 0.6,                    // 슬로우 중 가장자리 어둡게 (0~1)
    ZOOM: 0.06,                       // 시간 복귀 동안 줌인 정도 (0.06 = 6%)
    ZOOM_OUT_FRAMES: 16,              // 명중 후 줌 원상복구 프레임
    REFLECT_LINE_WIDTH: 1,            // 뻗어가는 반사 궤적 두께
    SLOWMO_IN: 0.15,                  // 슬로우 진입 시간 (초)
    SLOWMO_HOLD: 0.45,                // 슬로우 유지 시간 (초)
    SLOWMO_SCALE: 0.1,                // 슬로우 중 시간 속도
    LOOP_FADE: 0.2,                   // 복귀 시작 시 slowmo_in/loop 페이드아웃 시간 (초)
    RETURN_FALLBACK: 0.9,             // time_return.wav 를 못 읽었을 때만 쓰는 복귀 길이 (초)
  },

  juice: {
    HITSTOP_PARRY_FRAMES: 6,          //    패링 성공 히트스톱 (프레임) — 흔들림/섬광은 히트스톱 중에도 재생
    ENEMY_FLASH_FRAMES: 2,            // 2) 맞은 적 실루엣을 완전 흰색으로 보이는 프레임 수
    KILL_KNOCKBACK: 400,              // 3) 처치된 적(두 조각)이 공격 방향으로 튕겨 나가는 속도
    KNOCKBACK_LIFT: 140,              //    위로 띄우는 속도
    KNOCKBACK_SPLIT: 70,              //    두 조각이 서로 벌어지는 속도
    PIECE_SPIN: 16,                   //    조각 회전 속도 (rad/s)
    PIECE_BOUNCE: 0.45,               //    바닥 반발 계수
    PIECE_MAX_BOUNCES: 2,             //    최대 튕김 횟수
    PIECE_MIN_BOUNCE: 90,             //    이 낙하 속도 미만이면 튕기지 않고 미끄러짐
    PIECE_FRICTION: 650,              //    바닥 미끄럼 감속 (px/s²)
    PIECE_WALL_BOUNCE: 0.5,
    SLASH_TRAIL_RADIUS: 32,           // 5) 반달 베기 궤적 반지름
    SLASH_TRAIL_ARC: 80,              //    궤적 반각 (°)
    SLASH_TRAIL_THICK: 0.5,           //    가장 두꺼운 곳 두께 (반지름 비율)
    SLASH_TRAIL_HOLD: 3,              //    꽉 찬 상태로 보이는 프레임 수
    SLASH_TRAIL_FADE: 0.09,           //    그 뒤 사라지는 시간
    SHAKE_PARRY: 10,                  // 6) 방향성 흔들림: 패링 강도 (px) (처치는 kill.SHAKE_*)
    SHAKE_TIME: 0.15,                 //    감쇠 시간
    SHAKE_OVERSHOOT: 1,               //    되돌아올 때 반대쪽으로 살짝 넘어가는 정도 (0 = 안 넘어감)
    RECOIL_SPEED: 150,                // 7) 적을 벤 순간 플레이어가 반대 방향으로 밀리는 속도
    RECOIL_LIFT: 60,                  //    공중이면 살짝 위로
  },

  fx: {
    // 패링 성공 연출 (히트스톱/흔들림 세기는 juice 참고)
    flashTime: 1 / 60,                // 흰 화면 섬광 (한 프레임)
    flashAlpha: 0.85,
    ringRadius: 38, ringTime: 0.3, ringWidth: 3,   // 3) 칼 끝 노란 충격파 링
    pieceSpeed: 90, pieceSpin: 9,     // '날아가기'를 끈 경우의 약한 분리 속도/회전
    // 플레이어 사망
    deathHitstop: 0.06, deathShake: 5,
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

  audio: {
    enabled: true, volume: 0.7,       // 합성음 마스터 볼륨. M 키로 전체 음소거 토글
    // 효과음 파일 (sounds/*.wav). 모두 실제 시간으로 재생 — 슬로우모션 영향 없음
    samples: {
      dir: 'sounds/',
      SFX_GUN: 0.8, SFX_PARRY: 1.0, SFX_SLOWMO_IN: 0.8, SFX_SLOWMO_LOOP: 0.5, SFX_TIME_RETURN: 1.0, SFX_KILL: 1.0,
      GUN_PITCH: [0.95, 1.05],        // 적 발사음 피치 랜덤 범위
      KILL_PITCH: [0.92, 1.08],       // 처치음 피치 랜덤 범위
    },
    // 아래는 파일이 없는 소리(휘두르기/사망/클리어)와, 파일을 못 읽었을 때의 대체 합성음
    // 휘두르기: 짧은 바람 소리 '쉭' — 걸러낸 잡음의 대역이 낮→높→낮으로 휩쓸림
    swing: { dur: 0.16, vol: 0.9, sweep: [650, 2900, 850], q: 1.3, pitchJitter: 0.12 },
    // 처치: 날카로운 고음 '칭' + 묵직한 저음 '쿵' 두 겹
    kill: { high: 3400, highVol: 0.9, highDur: 0.16, low: 130, lowEnd: 36, lowVol: 1.0, lowDur: 0.42, drive: 3 },
    // 패링: 금속이 부딪치는 높은 '챙' — 비정수배 배음이 길게 울리고 살짝 맥놀이
    parry: { base: 2150, vol: 1.0, ring: 0.85 },
  },

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
    // 킬 연출 전용 색 (요청에 따라 원래 색 규칙의 예외)
    blood: ['#d0102a', '#9a0c20', '#ff3a45'],
    beamCore: '#ffffff', beamEdge: '#5fd8ff',
    trailOuter: '#5fd8ff', trailMid: '#ff6fcf', trailCore: '#ffd23a',
    dust: ['#9a8f78', '#6e6656', '#b8ae96'],
    attack: '#ff2b3d',
    unparryable: '#b14dff',
    parry: '#ffd23a',
    parryHot: '#ff9a1f',
    ui: '#5fd8ff',
  },
};

// F2 패널에서 켜고 끄는 타격감 요소 (키 1~9, 0 = 10번째, - = 전부 토글)
const JUICE = [
  { key: 'hitstop', label: '타임스톱/히트스톱' },
  { key: 'enemyFlash', label: '피격 흰 섬광' },
  { key: 'knockback', label: '적 날아가기' },
  { key: 'gore', label: '피 + 자국' },
  { key: 'slashTrail', label: '베기 궤적(반달/3겹)' },
  { key: 'shake', label: '화면 흔들림' },
  { key: 'recoil', label: '플레이어 반동' },
  { key: 'sound', label: '사운드' },
  { key: 'screenFlash', label: '화면 섬광(패링)' },
  { key: 'beam', label: '빛줄기 + 흙먼지' },
];
const JUICE_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

// 옵션 (ESC 메뉴). 브라우저에 저장 — 못 쓰는 환경이면 기본값으로
const Settings = {
  shake: 1,                           // 화면 흔들림 강도 배율 0 ~ 1.5
  load() { try { const v = parseFloat(localStorage.getItem('parry.shake')); if (v >= 0 && v <= 1.5) this.shake = v; } catch (e) { /* 저장소 없음 */ } },
  save() { try { localStorage.setItem('parry.shake', String(this.shake)); } catch (e) { /* 저장소 없음 */ } },
};
Settings.load();

// F3 슬로우 / F4 프레임 단위 진행
const Debug = { slow: false, step: false, stepQueue: 0, frame: 0 };
const juiceOn = Object.fromEntries(JUICE.map((j) => [j.key, true]));

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
      if (['Space', 'F1', 'F2', 'F3', 'F4', 'F5', 'Escape'].includes(e.code)) e.preventDefault(); // 브라우저 기본 동작(도움말/찾기 등) 막기
      // 디버그 시간 조작은 게임 루프 밖에서 처리 (정지 중에도 받아야 함)
      if (!e.repeat) {
        if (e.code === 'F3') { Debug.slow = !Debug.slow; Debug.step = false; }
        if (e.code === 'F4') { Debug.step = true; Debug.stepQueue++; }
        if (e.code === 'Enter') Debug.step = false;
      }
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
  spawn(x, y, vx, vy, life, color, size = 1, grav = 0, glow = false, streak = false, stain = false) {
    this.list.push({ x, y, vx, vy, life, max: life, color, size, grav, glow, streak, stain, drag: !stain });
  },
  burst(x, y, n, color, speed, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = (opts.angle ?? 0) + rand(-1, 1) * (opts.spread ?? Math.PI);
      const v = speed * rand(0.35, 1);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.6, 1) * (opts.life ?? 0.4),
        color, opts.size ?? 1, opts.grav ?? 0, opts.glow ?? false, opts.streak ?? false);
    }
  },
  // stopped = 킬 타임스톱 중. 피(slowInStop)는 중력 없이 천천히 퍼지기만 함
  update(dt, stopped = false) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      if (stopped && p.slowInStop) {
        const k = CONFIG.kill.BLOOD_STOP_SPEED;
        p.x += p.vx * dt * k; p.y += p.vy * dt * k;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy += p.grav * dt;
      if (p.drag) { p.vx *= 0.96; p.vy *= 0.98; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      // 파편: 바닥/벽/발판에 닿으면 자국으로 남기고 사라짐
      if (p.stain && solidAt(p.x, p.y)) {
        Stains.add(p.x, p.y, p.vx, p.vy, p.color);
        L[i] = L[L.length - 1]; L.pop();
      }
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
//  파편 자국: 방 크기 캔버스에 누적해서 그림 (재시작 시 지움)
// -------------------------------------------------------------
const Stains = {
  canvas: null, g: null,
  reset() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = CONFIG.room.w; this.canvas.height = CONFIG.room.h;
      this.g = this.canvas.getContext('2d');
    }
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },
  add(x, y, vx, vy, color) {
    const g = this.g;
    g.fillStyle = color;
    // 지형 표면에 붙도록 진행 방향 반대로 1px 되돌린 곳에서 진행 방향으로 번지게
    const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
    const bx = Math.round(x - ux), by = Math.round(y - uy);
    const len = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < len; i++) g.fillRect(Math.round(bx + ux * i * 0.8), Math.round(by + uy * i * 0.8), 1, 1);
    if (Math.random() < 0.4) g.fillRect(bx, by, 2, 1);
  },
  draw(g) { g.drawImage(this.canvas, 0, 0); },
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

  // drawFn(g) 이 그리는 실루엣을 (cx, cy) 중심, angle 방향으로 절단해 두 조각으로.
  // knock = true 면 공격 방향으로 강하게 날아감 (KILL_KNOCKBACK)
  split(drawFn, cx, cy, angle, color, power = 1, knock = false) {
    const S = 64;
    const img = document.createElement('canvas');
    img.width = S; img.height = S;
    const g = img.getContext('2d');
    g.translate(S / 2 - Math.round(cx), S / 2 - Math.round(cy));
    drawFn(g);
    // 피격 섬광용 단색 실루엣 (흰색 본체 + 검은 테두리용)
    const tint = (color) => {
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const tg = c.getContext('2d');
      tg.drawImage(img, 0, 0);
      tg.globalCompositeOperation = 'source-in';
      tg.fillStyle = color;
      tg.fillRect(0, 0, S, S);
      return c;
    };
    const white = tint('#fff'), black = tint('#000');

    const F = CONFIG.fx, J = CONFIG.juice;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (const side of [1, -1]) {
      const nx = -dy * side, ny = dx * side;   // 절단선의 법선 (이 조각이 벌어질 쪽)
      let vx, vy, vrot;
      if (knock) {
        const sp = J.KILL_KNOCKBACK * power * rand(0.85, 1.1);
        vx = dx * sp + nx * J.KNOCKBACK_SPLIT * rand(0.6, 1.2);
        vy = dy * sp * 0.6 + ny * J.KNOCKBACK_SPLIT * rand(0.6, 1.2) - J.KNOCKBACK_LIFT;
        vrot = side * J.PIECE_SPIN * rand(0.6, 1.2) * (dx >= 0 ? 1 : -1);
      } else {
        const sp = F.pieceSpeed * power * rand(0.7, 1.2);
        vx = nx * sp * 0.6 + dx * sp * rand(0.6, 1.1);
        vy = ny * sp * 0.6 + dy * sp * rand(0.6, 1.1) - 70 * power;
        vrot = side * F.pieceSpin * rand(0.5, 1.2) * (dx >= 0 ? 1 : -1);
      }
      this.list.push({
        img, white, black, side, angle,
        x: cx + nx * 1.5, y: cy + ny * 1.5,
        w: 6, h: 6, vx, vy, rot: 0, vrot,
        bounces: 0, rest: false,
        flash: juiceOn.enemyFlash ? J.ENEMY_FLASH_FRAMES : 0,   // 남은 흰 섬광 프레임
      });
    }
    this.slices.push({ x: cx, y: cy, angle, t: 0, time: 0.14, color });
  },

  // 실제 시간 기준 (히트스톱 중에도 흐름): 흰 섬광 프레임 소모
  tickRealtime() {
    for (const p of this.list) if (p.flash > 0) p.flash--;
  },

  update(dt) {
    const J = CONFIG.juice;
    for (const p of this.list) {
      if (p.rest) continue;
      p.vy = Math.min(p.vy + CONFIG.enemy.gravity * dt, CONFIG.enemy.maxFall * 1.4);
      // 몸체 좌표(x,y)는 조각 중심. moveBody 용 박스로 변환해 지형과 충돌
      const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h, vx: p.vx, vy: p.vy };
      const vxBefore = p.vx, vyBefore = p.vy;
      moveBody(box, dt);
      p.x = box.x + p.w / 2; p.y = box.y + p.h / 2;
      p.vx = box.vx; p.vy = box.vy;
      if (box.hitWall) { p.vx = -vxBefore * J.PIECE_WALL_BOUNCE; p.vrot = -p.vrot * 0.6; }
      p.rot += p.vrot * dt;
      if (box.onGround) {
        if (vyBefore > J.PIECE_MIN_BOUNCE && p.bounces < J.PIECE_MAX_BOUNCES) {
          p.vy = -vyBefore * J.PIECE_BOUNCE;           // 튕김
          p.bounces++;
          p.vrot *= 0.6;
        } else {
          // 미끄러지다 멈춤
          p.vx = approach(p.vx, 0, J.PIECE_FRICTION * dt);
          p.vrot = approach(p.vrot, 0, 30 * dt);
          if (p.vx === 0) p.rest = true;
        }
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
      const o = -p.img.width / 2;
      if (p.flash > 0) {
        // 피격 섬광: 완전 흰 실루엣 + 검은 1px 테두리 (흰 베기 궤적 위에서도 보이게)
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.drawImage(p.black, o + ox, o + oy);
        g.drawImage(p.white, o, o);
      } else {
        g.drawImage(p.img, o, o);
      }
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
// -------------------------------------------------------------
//  효과음 파일: http(s) 로 열면 Web Audio 로 디코딩해 정확하게 재생,
//  index.html 을 직접 연 경우(file://)는 브라우저가 파일 읽기를 막으므로 <audio> 요소로 재생
// -------------------------------------------------------------
const Samples = {
  names: ['gun_fire', 'parry_chang', 'slowmo_in', 'slowmo_loop', 'time_return', 'kill_sound'],
  map: {},
  load() {
    for (const n of this.names) {
      const url = CONFIG.audio.samples.dir + n + '.wav';
      const smp = this.map[n] = { buffer: null, el: null, duration: NaN };
      const useElement = () => {
        const el = new Audio();
        el.preload = 'auto';
        el.addEventListener('loadedmetadata', () => { if (!smp.buffer) smp.duration = el.duration; });
        el.src = url;
        smp.el = el;
      };
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (location.protocol === 'file:' || !window.fetch || !OAC) { useElement(); continue; }
      fetch(url)
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then((ab) => new OAC(2, 1, 48000).decodeAudioData(ab))
        .then((buf) => { smp.buffer = buf; smp.duration = buf.duration; })
        .catch(() => useElement());
    }
  },
  ready(n) { const m = this.map[n]; return !!m && (!!m.buffer || !!m.el); },
  // 실제 재생 길이 (초). 아직 못 읽었으면 NaN
  duration(n) { const m = this.map[n]; return m && m.duration > 0 ? m.duration : NaN; },
};
Samples.load();

const Sfx = {
  ac: null, master: null, noiseBuf: null, shaper: null,
  sampleBus: null,          // 효과음 파일 전용 출력 (클리핑만 막는 리미터 경유)
  handles: [],              // <audio> 로 재생 중인 소리 (페이드 처리용)
  muted: false,

  // 오디오 그래프 준비: 마스터 볼륨 → 컴프레서(여러 겹이 동시에 나도 찢어지지 않게) → 출력
  // (테스트에서 OfflineAudioContext 로 같은 코드를 렌더링할 수 있도록 분리)
  init(ac, dest) {
    this.ac = ac;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4;
    comp.attack.value = 0.002; comp.release.value = 0.12;
    comp.connect(dest);
    this.master = ac.createGain();
    this.master.gain.value = this.muted ? 0 : CONFIG.audio.volume;
    this.master.connect(comp);
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20;
    lim.attack.value = 0.001; lim.release.value = 0.08;
    lim.connect(dest);
    this.sampleBus = ac.createGain();
    this.sampleBus.gain.value = this.muted ? 0 : 1;
    this.sampleBus.connect(lim);
    const n = Math.floor(ac.sampleRate * 0.6);
    this.noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // 저음을 묵직하게 만드는 소프트 클리핑 곡선
    const drive = CONFIG.audio.kill.drive, curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = i / (curve.length - 1) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    this.shaper = curve;
  },
  ensure() {
    if (!CONFIG.audio.enabled) return false;
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ac = new AC();
      this.init(ac, ac.destination);
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    return !this.muted;
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : CONFIG.audio.volume;
    if (this.sampleBus) this.sampleBus.gain.value = this.muted ? 0 : 1;
  },

  // 효과음 파일 재생. 반환값 = { stop(), fadeOut(초) } (재생 못 하면 null)
  // 피치(rate)는 재생 속도로 바꾸며, 게임의 시간 속도와는 무관하게 실제 시간으로 재생됨
  playSample(name, { vol = 1, rate = 1, loop = false } = {}) {
    if (!juiceOn.sound || !CONFIG.audio.enabled || this.muted) return null;
    const smp = Samples.map[name];
    if (!smp) return null;
    this.ensure();
    if (smp.buffer && this.ac) {
      const ac = this.ac, src = ac.createBufferSource(), gn = ac.createGain();
      src.buffer = smp.buffer; src.loop = loop; src.playbackRate.value = rate;
      gn.gain.value = vol;
      src.connect(gn).connect(this.sampleBus);
      src.start();
      return {
        stop() { try { src.stop(); } catch (e) { /* 이미 멈춤 */ } },
        fadeOut(sec) {
          const t = ac.currentTime;
          gn.gain.cancelScheduledValues(t);
          gn.gain.setValueAtTime(gn.gain.value, t);
          gn.gain.linearRampToValueAtTime(0, t + sec);
          try { src.stop(t + sec + 0.02); } catch (e) { /* 이미 멈춤 */ }
        },
      };
    }
    if (!smp.el) return null;
    const el = smp.el.cloneNode();
    el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false;
    el.playbackRate = rate;
    el.loop = loop;
    el.volume = clamp(vol, 0, 1);
    const h = {
      el, vol: clamp(vol, 0, 1), fade: null, done: false,
      stop() { el.pause(); h.done = true; },
      fadeOut(sec) { h.fade = { t: 0, time: sec, from: h.vol }; },
    };
    el.addEventListener('ended', () => { h.done = true; });
    el.play().catch(() => { h.done = true; });
    this.handles.push(h);
    return h;
  },
  // <audio> 재생분의 페이드/음소거 (실제 경과 시간으로 매 화면 프레임 호출)
  updateElements(dt) {
    for (const h of this.handles) {
      if (h.fade) {
        h.fade.t += dt;
        h.vol = h.fade.from * Math.max(0, 1 - h.fade.t / h.fade.time);
        if (h.fade.t >= h.fade.time) h.stop();
      }
      h.el.volume = this.muted ? 0 : h.vol;
    }
    this.handles = this.handles.filter((h) => !h.done);
  },
  // 옵션 메뉴 등으로 게임이 멈출 때 소리도 같이 멈춤
  pauseAll(paused) {
    if (this.ac) { if (paused) this.ac.suspend(); else this.ac.resume(); }
    for (const h of this.handles) { if (paused) h.el.pause(); else h.el.play().catch(() => {}); }
  },

  // 볼륨 엔벨로프: 0 → (attack) vol → (지수 감쇠) 0
  env(param, t, vol, attack, dur) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(vol, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + dur);
  },
  // 오실레이터 한 겹. f 는 [시작, 끝] 주파수, drive 면 소프트 클리핑
  osc({ type = 'sine', f, dur, vol, attack = 0.001, delay = 0, drive = false }) {
    const ac = this.ac, t = ac.currentTime + delay;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f[0], t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f[1] ?? f[0]), t + dur);
    this.env(gn.gain, t, vol, attack, dur);
    let node = o;
    if (drive) { const ws = ac.createWaveShaper(); ws.curve = this.shaper; node = node.connect(ws); }
    node.connect(gn).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  // 걸러낸 잡음 한 겹. sweep = 필터 주파수가 시간에 따라 지나가는 점들
  noise({ type, sweep, q = 1, dur, vol, attack = 0.001, delay = 0 }) {
    const ac = this.ac, t = ac.currentTime + delay;
    const src = ac.createBufferSource(), flt = ac.createBiquadFilter(), gn = ac.createGain();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rand(0.9, 1.1);
    flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(sweep[0], t);
    for (let i = 1; i < sweep.length; i++) {
      flt.frequency.exponentialRampToValueAtTime(sweep[i], t + dur * i / (sweep.length - 1));
    }
    this.env(gn.gain, t, vol, attack, dur);
    src.connect(flt).connect(gn).connect(this.master);
    src.start(t, rand(0, 0.1)); src.stop(t + dur + 0.05);
  },

  play(name) {
    if (!juiceOn.sound) return;
    // 파일이 있는 소리는 파일로 (피치 랜덤)
    const S = CONFIG.audio.samples;
    const FILES = {
      shot: ['gun_fire', S.SFX_GUN, S.GUN_PITCH],
      kill: ['kill_sound', S.SFX_KILL, S.KILL_PITCH],
      parry: ['parry_chang', S.SFX_PARRY, null],
    };
    const f = FILES[name];
    if (f && Samples.ready(f[0])) {
      this.playSample(f[0], { vol: f[1], rate: f[2] ? rand(f[2][0], f[2][1]) : 1 });
      return;
    }
    if (!this.ensure()) return;
    this.synth(name);   // 파일이 없거나 못 읽었을 때만 합성음
  },

  synth(name) {
    const A = CONFIG.audio;
    switch (name) {
      case 'slash': { // 휘두르기: 짧은 바람 소리 '쉭'
        const S = A.swing, k = 1 + rand(-1, 1) * S.pitchJitter;   // 매번 살짝 다른 높이
        this.noise({ type: 'bandpass', q: S.q, sweep: S.sweep.map((f) => f * k), dur: S.dur, vol: S.vol, attack: S.dur * 0.25 });
        this.noise({ type: 'highpass', q: 0.7, sweep: [7000 * k, 3800 * k], dur: S.dur * 0.7, vol: S.vol * 0.3, attack: S.dur * 0.15 });
        break;
      }
      case 'kill': { // 처치: 날카로운 고음 + 묵직한 저음 두 겹
        const K = A.kill;
        // 고음 '칭': 짧게 떨어지는 금속성 음 + 아주 짧은 고역 잡음
        this.osc({ type: 'triangle', f: [K.high, K.high * 0.68], dur: K.highDur, vol: K.highVol });
        this.osc({ type: 'sine', f: [K.high * 1.5, K.high * 1.3], dur: K.highDur * 0.6, vol: K.highVol * 0.35 });
        this.noise({ type: 'highpass', q: 0.8, sweep: [6500, 9000], dur: 0.035, vol: K.highVol * 1.2 });
        // 저음 '쿵': 음높이가 뚝 떨어지는 사인파를 클리핑해 두껍게 + 낮은 잡음 덩어리
        this.osc({ type: 'sine', f: [K.low, K.lowEnd], dur: K.lowDur, vol: K.lowVol, attack: 0.003, drive: true });
        this.noise({ type: 'lowpass', q: 0.9, sweep: [520, 60], dur: K.lowDur * 0.65, vol: K.lowVol * 0.8, attack: 0.002 });
        break;
      }
      case 'parry': { // 패링: 금속 '챙'
        const P = A.parry, f = P.base;
        // 금속 막대의 비정수배 배음 [비율, 볼륨, 울림 길이]. 1과 1.0045 가 겹쳐 '웅~' 하는 맥놀이
        const partials = [[1, 0.26, 1], [1.0045, 0.2, 1], [2.33, 0.15, 0.7], [2.76, 0.13, 0.6], [4.07, 0.07, 0.4], [5.4, 0.04, 0.25]];
        for (const [r, v, d] of partials) {
          this.osc({ type: 'sine', f: [f * r, f * r * 0.997], dur: P.ring * d, vol: v * P.vol });
        }
        // 부딪치는 순간의 '칭' 타격음
        this.noise({ type: 'highpass', q: 0.7, sweep: [4500, 9000], dur: 0.03, vol: 0.9 * P.vol });
        this.osc({ type: 'square', f: [f * 1.7], dur: 0.014, vol: 0.18 * P.vol });
        // 손에 전해지는 짧은 몸통 울림
        this.osc({ type: 'sine', f: [240, 90], dur: 0.1, vol: 0.35 * P.vol });
        break;
      }
      case 'shot':
        this.noise({ type: 'lowpass', sweep: [3000, 300], dur: 0.1, vol: 0.5 });
        this.osc({ type: 'square', f: [220, 60], dur: 0.08, vol: 0.12 });
        break;
      case 'death':
        this.noise({ type: 'lowpass', sweep: [1200, 60], dur: 0.4, vol: 0.7 });
        this.osc({ type: 'sawtooth', f: [200, 40], dur: 0.4, vol: 0.18 });
        break;
      case 'clear': [523, 659, 784, 1046].forEach((fr, i) => this.osc({ type: 'triangle', f: [fr], dur: 0.25, vol: 0.15, attack: 0.005, delay: i * 0.08 })); break;
    }
  },
};

// -------------------------------------------------------------
//  초승달/반달 궤적 그리기 공용 함수
//  (cx, cy) 중심, 반지름 R, a0 에서 span 만큼. u0~u1 구간만 그림 (휘두르는 중간 모습)
// -------------------------------------------------------------
function drawCrescent(g, cx, cy, R, a0, span, u0, u1, thickMax, color, glow, alpha = 1) {
  if (u1 - u0 < 0.01) return;
  const N = 18, outer = [], inner = [];
  for (let i = 0; i <= N; i++) {
    const u = lerp(u0, u1, i / N), a = a0 + span * u;
    const th = Math.sin(Math.PI * u) ** 0.8 * thickMax;
    outer.push(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    inner.push(cx + Math.cos(a) * (R - th), cy + Math.sin(a) * (R - th));
  }
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.shadowColor = color; g.shadowBlur = glow;
  g.beginPath();
  g.moveTo(outer[0], outer[1]);
  for (let i = 2; i < outer.length; i += 2) g.lineTo(outer[i], outer[i + 1]);
  for (let i = inner.length - 2; i >= 0; i -= 2) g.lineTo(inner[i], inner[i + 1]);
  g.closePath();
  g.fill();
  g.restore();
}

// -------------------------------------------------------------
//  빛줄기 (Slash Beam): 공격 방향을 따라 타격 지점을 지나는 얇고 긴 직선.
//  플레이어 뒤쪽 화면 밖 → 적 너머 화면 밖. 머리가 먼저 빠르게, 꼬리가 따라오며 사라짐.
// -------------------------------------------------------------
const Beams = {
  list: [],
  reset() { this.list.length = 0; },
  spawn(hx, hy, angle, view) {
    const K = CONFIG.kill, dx = Math.cos(angle), dy = Math.sin(angle);
    // 화면(+여유) 사각형을 나가기까지의 거리: 뒤쪽(back), 앞쪽(fwd)
    const m = K.BEAM_MARGIN, x0 = view.x - m, x1 = view.x + W + m, y0 = view.y - m, y1 = view.y + H + m;
    const exitDist = (sx, sy) => {
      let t = Infinity;
      if (sx > 0) t = Math.min(t, (x1 - hx) / sx); else if (sx < 0) t = Math.min(t, (x0 - hx) / sx);
      if (sy > 0) t = Math.min(t, (y1 - hy) / sy); else if (sy < 0) t = Math.min(t, (y0 - hy) / sy);
      return Math.max(0, t);
    };
    const back = exitDist(-dx, -dy), fwd = exitDist(dx, dy);
    const ox = hx - dx * back, oy = hy - dy * back, len = back + fwd;
    // 빛줄기가 지형 윗면(바닥·발판·엄폐물)과 만나는 지점 → 머리가 지나갈 때 흙먼지
    const dust = [];
    if (Math.abs(dy) > 0.05) {
      for (const s of ROOM.solids) {
        const t = (s.y - oy) / dy;
        if (t < 0 || t > len) continue;
        const ix = ox + dx * t;
        if (ix >= s.x && ix <= s.x + s.w) dust.push({ t, x: ix, y: s.y, done: false });
      }
    }
    this.list.push({ ox, oy, dx, dy, len, f: 0, dust, fresh: true });
  },
  // 머리/꼬리 위치 (시작점에서의 거리). 머리는 빨리 나가고(ease-out), 꼬리는 늦게 따라옴(ease-in)
  span(b) {
    const u = (b.f + 1) / (CONFIG.kill.BEAM_FRAMES + 1);
    return { head: b.len * (1 - (1 - u) ** 3), tail: b.len * u * u * u };
  },
  update() {
    const K = CONFIG.kill, C = CONFIG.colors;
    for (const b of this.list) {
      const { head } = this.span(b);
      for (const d of b.dust) {
        if (d.done || d.t > head) continue;
        d.done = true;
        // 흙먼지: 바닥에서 위로 뭉게뭉게, 빛줄기 진행 방향으로 살짝 끌려감
        for (let i = 0; i < K.DUST_COUNT; i++) {
          const a = -Math.PI / 2 + rand(-1.1, 1.1);
          const v = K.DUST_SPEED * rand(0.3, 1);
          Particles.spawn(d.x + rand(-3, 3), d.y - 1, Math.cos(a) * v + b.dx * 40, Math.sin(a) * v,
            rand(0.35, 0.7), C.dust[i % C.dust.length], Math.random() < 0.5 ? 2 : 3, 60);
        }
      }
      // 생긴 틱에는 프레임을 넘기지 않음 → 첫 프레임(f=0)부터 BEAM_FRAMES 장이 모두 그려짐
      if (b.fresh) b.fresh = false; else b.f++;
    }
    this.list = this.list.filter((b) => b.f < K.BEAM_FRAMES);
  },
  draw(g) {
    const K = CONFIG.kill, C = CONFIG.colors;
    for (const b of this.list) {
      const { head, tail } = this.span(b);
      if (head - tail < 0.5) continue;
      const x0 = b.ox + b.dx * tail, y0 = b.oy + b.dy * tail, x1 = b.ox + b.dx * head, y1 = b.oy + b.dy * head;
      g.save();
      g.lineCap = 'butt';
      // 하늘색 테두리 + 글로우
      g.strokeStyle = C.beamEdge; g.shadowColor = C.beamEdge; g.shadowBlur = K.BEAM_GLOW;
      g.lineWidth = K.BEAM_WIDTH + 2;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      // 흰색 중심
      g.shadowBlur = 0;
      g.strokeStyle = C.beamCore; g.lineWidth = K.BEAM_WIDTH;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.restore();
    }
  },
};

// -------------------------------------------------------------
//  3겹 킬 궤적: 바깥 하늘색 / 중간 분홍 잔상(늦게 따라옴) / 중심 노랑.
//  타임스톱 동안 화면에 남아 있다가 해제 시 사라짐
// -------------------------------------------------------------
const KillTrail = {
  t: null,
  reset() { this.t = null; },
  spawn(cx, cy, angle, flip) { this.t = { cx, cy, angle, flip, f: 0, released: false, fresh: true }; },
  update() {
    const t = this.t;
    if (t) { if (t.fresh) t.fresh = false; else t.f++; }
  },
  release() { if (this.t) this.t.released = true; },
  // 해제됐고 최소 표시 프레임도 지났으면 제거
  prune() {
    const t = this.t;
    if (t && t.released && t.f >= CONFIG.kill.TRAIL_MIN_FRAMES) this.t = null;
  },
  draw(g) {
    const t = this.t;
    if (!t) return;
    const K = CONFIG.kill, C = CONFIG.colors, R = K.TRAIL_RADIUS;
    const half = K.TRAIL_ARC * Math.PI / 180;
    const a0 = t.angle - half * t.flip, span = half * 2 * t.flip;
    const sweep = (lag) => clamp((t.f + 1 - lag) / K.TRAIL_SWEEP_FRAMES, 0, 1);
    const u = sweep(0), up = sweep(K.TRAIL_PINK_LAG);
    drawCrescent(g, t.cx, t.cy, R * 1.12, a0, span, 0, u, R * 0.62, C.trailOuter, 10, 0.9); // 바깥: 하늘색
    drawCrescent(g, t.cx, t.cy, R, a0, span, 0, up, R * 0.46, C.trailMid, 6, 0.95);         // 중간: 분홍 잔상
    drawCrescent(g, t.cx, t.cy, R * 0.97, a0, span, 0, u, R * 0.22, C.trailCore, 8, 1);       // 중심: 노랑
  },
};

// -------------------------------------------------------------
//  탄 궤적 (히트스캔): 정해진 프레임 수만큼 실제 시간으로 표시
// -------------------------------------------------------------
const Tracers = {
  list: [],
  reset() { this.list.length = 0; },
  add(x0, y0, x1, y1, width, color, frames, muzzle = false) {
    this.list.push({ x0, y0, x1, y1, width, color, frames, muzzle, f: 0 });
  },
  tick() {
    for (const t of this.list) t.f++;
    this.list = this.list.filter((t) => t.f < t.frames);
  },
  draw(g) {
    for (const t of this.list) {
      g.save();
      g.lineCap = 'butt';
      g.strokeStyle = t.color; g.shadowColor = t.color; g.shadowBlur = 6;
      g.lineWidth = t.width;
      g.globalAlpha = 1 - t.f / (t.frames + 1) * 0.5;
      g.beginPath(); g.moveTo(t.x0, t.y0); g.lineTo(t.x1, t.y1); g.stroke();
      if (t.muzzle && t.f < 2) {
        // 총구 섬광
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(t.x0, t.y0, 3 - t.f, 0, Math.PI * 2); g.fill();
        g.fillStyle = t.color;
        g.beginPath(); g.arc(t.x0, t.y0, 5 - t.f * 2, 0, Math.PI * 2); g.globalAlpha = 0.5; g.fill();
      }
      g.restore();
    }
  },
};

// -------------------------------------------------------------
//  총알 패링 성공 시퀀스 (CONFIG.parrySeq 참고). 실제 시간 = 게임 틱(60fps) 기준으로 진행.
//  k = 패링한 틱부터 센 실제 틱 수. scale = 지금 틱의 월드 시간 속도.
//  killTick 에 Game 이 반사탄(히트스캔)을 쏜다 (fireNow).
// -------------------------------------------------------------
const ParrySeq = {
  active: false, k: 0, scale: 1,
  target: null, dir: 0, dist: 0,     // 반사 대상 (없으면 dir 방향으로 dist 까지)
  inTick: 0, returnTick: 0, killTick: 0, returnDur: 0,
  future: null,             // future[k] = k 틱 이후 killTick 까지 월드가 쓸 게임 시간 합
  growTotal: 0,             // 반사 궤적이 뻗어가는 동안의 게임 시간 합
  fireNow: false,
  hIn: null, hLoop: null,   // slowmo_in / slowmo_loop 재생 핸들

  start(target, dir, dist, hitstopFrames) {
    const P = CONFIG.parrySeq, S = CONFIG.audio.samples, fps = CONFIG.fps;
    this.cancel();
    // 복귀 구간 길이 = time_return.wav 의 실제 재생 길이
    const d = Samples.duration('time_return');
    this.returnDur = isFinite(d) ? d : P.RETURN_FALLBACK;
    this.inTick = Math.round(P.SLOWMO_IN * fps);
    this.returnTick = Math.round((P.SLOWMO_IN + P.SLOWMO_HOLD) * fps);
    this.killTick = this.returnTick + Math.round(this.returnDur * fps);
    this.k = 0;
    this.active = true;
    this.fireNow = false;
    this.scale = this.scaleAt(0);
    // 반사 궤적이 게임 시간에 맞춰 뻗어가도록 (느릴 땐 천천히, 시간이 돌아오면 빠르게)
    this.future = new Float64Array(this.killTick + 1);
    for (let j = this.killTick; j >= 1; j--) {
      this.future[j - 1] = this.future[j] + (j > hitstopFrames ? this.scaleAt(j) * STEP : 0);
    }
    this.growTotal = this.future[this.inTick - 1] || 1e-6;
    this.target = target; this.dir = dir; this.dist = dist;
    // 0초: slowmo_in (parry_chang 은 parryFx 에서)
    this.hIn = Sfx.playSample('slowmo_in', { vol: S.SFX_SLOWMO_IN });
    this.hLoop = null;
  },

  // k 번째 틱의 시간 속도
  scaleAt(k) {
    const P = CONFIG.parrySeq, lo = P.SLOWMO_SCALE;
    if (k < this.inTick) {
      const u = k / this.inTick;
      return 1 - (1 - lo) * (1 - (1 - u) * (1 - u));        // 1.0 → 0.1 (빠르게 감속)
    }
    if (k < this.returnTick) return lo;                       // 유지
    if (k < this.killTick) {
      const u = (k - this.returnTick) / (this.killTick - this.returnTick);
      return lo + (1 - lo) * u * u;                           // 0.1 → 1.0 (ease-in, 끝으로 갈수록 빠르게)
    }
    return 1;
  },
  // 복귀 구간 진행도 0~1 (복귀 전 0)
  returnU() {
    if (!this.active || this.k < this.returnTick) return 0;
    return clamp((this.k - this.returnTick) / (this.killTick - this.returnTick), 0, 1);
  },
  // 채도 감소·비네트 세기 0~1: 진입 동안 올라가고, 복귀 동안 원상복구
  fxAmount() {
    if (!this.active) return 0;
    if (this.k < this.inTick) return this.k / this.inTick;
    if (this.k < this.returnTick) return 1;
    return 1 - this.returnU();
  },
  // 반사 궤적이 뻗어간 정도 0~1 (SLOWMO_IN 부터)
  growth() {
    if (!this.active || this.k < this.inTick) return 0;
    return clamp(1 - this.future[this.k] / this.growTotal, 0, 1);
  },

  // 실제 시간 한 틱 (히트스톱/킬스톱 중에도 Game.update 에서 매 틱 호출)
  tick() {
    if (!this.active) { this.scale = 1; return; }
    const P = CONFIG.parrySeq, S = CONFIG.audio.samples;
    const k = ++this.k;
    if (k === this.inTick) {
      this.hLoop = Sfx.playSample('slowmo_loop', { vol: S.SFX_SLOWMO_LOOP, loop: true });
    }
    if (k === this.returnTick) {
      Sfx.playSample('time_return', { vol: S.SFX_TIME_RETURN });
      if (this.hIn) this.hIn.fadeOut(P.LOOP_FADE);
      if (this.hLoop) this.hLoop.fadeOut(P.LOOP_FADE);
      this.hIn = this.hLoop = null;
    }
    this.scale = this.scaleAt(k);
    // time_return 재생이 끝나는 바로 그 틱: 반사탄 명중
    if (k >= this.killTick) { this.fireNow = true; this.active = false; }
  },

  // 재시작/사망/새 시퀀스: 소리 정리하고 정상 속도로
  cancel() {
    if (this.hIn) this.hIn.fadeOut(0.08);
    if (this.hLoop) this.hLoop.fadeOut(0.08);
    this.hIn = this.hLoop = null;
    this.target = null;
    this.active = false;
    this.fireNow = false;
    this.scale = 1;
  },
};

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
    this.lastSlashT = -Infinity;  // 마지막 베기 시작 시각 (월드 시간) — 타이밍 패링 판정
    this.slashUsed = false;       // 이번 베기가 패링/처치에 쓰였는가 (아니면 헛스윙)
    this.whiffChecked = false;
    this.trail = null;        // 반달 베기 궤적 (월드 시간으로 흐름 → 히트스톱 중엔 멈춘 채 보임)
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
  slashHitsRect(r, rangeMul = 1) {
    const qx = clamp(this.cx, r.x, r.x + r.w), qy = clamp(this.cy, r.y, r.y + r.h);
    return this.slashHits(qx, qy, 0, rangeMul) || this.slashHits(r.x + r.w / 2, r.y + r.h / 2, 3, rangeMul);
  }

  // 점(반지름 r)이 현재 칼 부채꼴 안에 있는가
  slashHits(px, py, r = 0, rangeMul = 1) {
    if (!this.slashing) return false;
    const S = CONFIG.slash;
    const dx = px - this.cx, dy = py - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > S.radius * rangeMul + r) return false;
    if (d < 6 + r) return true;
    return Math.abs(angDiff(Math.atan2(dy, dx), this.slashAngle)) <= S.arcHalf + Math.asin(Math.min(1, r / d));
  }

  startSlash(aimX, aimY) {
    const S = CONFIG.slash;
    const a = Math.atan2(aimY - this.cy, aimX - this.cx);
    this.slashAngle = a;
    this.slashT = 0;
    this.slashCd = S.cooldown;
    this.lastSlashT = Game.worldT;
    this.slashUsed = false;
    this.whiffChecked = false;
    this.slashFlip = -this.slashFlip;
    this.trail = { ticks: 0, angle: a, flip: this.slashFlip, hit: false };
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
    const A = CONFIG.anim, c = CONFIG.player, J = CONFIG.juice;
    this.tick++;
    if (this.trail && ++this.trail.ticks > J.SLASH_TRAIL_HOLD + J.SLASH_TRAIL_FADE * CONFIG.fps) this.trail = null;
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
      phase: this.runPhase, air: !this.onGround, vy: this.vy, slashing: !!this.trail || this.slashing,
    };
  }

  move(dt, aimX, aimY) {
    const c = CONFIG.player, S = CONFIG.slash;
    const ctl = !Game.inputLocked;                 // 패링 시퀀스 중 입력 잠금
    const ax = ctl ? (Input.held('KeyD') ? 1 : 0) - (Input.held('KeyA') ? 1 : 0) : 0;

    // 베기 타이머
    this.slashCd = Math.max(0, this.slashCd - dt);
    if (this.slashing) {
      this.slashT += dt;
      // 헛스윙: 패링 창(PARRY_EARLY)과 직접 베기 판정(hitTime)이 끝날 때까지 아무것도 못 쳤으면 잠시 베기 불가
      if (!this.whiffChecked && this.slashT >= Math.max(CONFIG.shot.PARRY_EARLY, S.hitTime)) {
        this.whiffChecked = true;
        if (!this.slashUsed) this.slashCd = Math.max(this.slashCd, CONFIG.shot.WHIFF_COOLDOWN);
      }
      if (this.slashT >= S.duration) this.slashT = -1;
    }
    if (ctl && Input.mouse.clicked && this.slashCd <= 0) this.startSlash(aimX, aimY);

    // 점프 입력 타이머
    if (ctl && Input.hit('Space')) this.jumpBuf = c.jumpBuffer;
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
    // 베기 궤적은 Game.render 에서 시체 조각 아래에 따로 그림 (피격 섬광이 가려지지 않게)
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

  // 반달 베기 궤적: SLASH_TRAIL_HOLD 프레임 동안 꽉 찬 채로 보인 뒤 빠르게 가늘어지며 사라짐.
  // 가운데가 두껍고 양끝이 가는 반달. F2 에서 끄면 작고 얇은 기본 궤적. (적을 베면 3겹 KillTrail 로 바뀜)
  drawSlash(g) {
    const tr = this.trail;
    if (!tr) return;
    const J = CONFIG.juice, S = CONFIG.slash;
    const big = juiceOn.slashTrail;
    const fadeTicks = J.SLASH_TRAIL_FADE * CONFIG.fps;
    const k = tr.ticks <= J.SLASH_TRAIL_HOLD ? 0 : (tr.ticks - J.SLASH_TRAIL_HOLD) / fadeTicks; // 0 → 1 사라짐
    if (k >= 1) return;
    const R = (big ? J.SLASH_TRAIL_RADIUS : S.radius) + k * 4;   // 사라지며 살짝 퍼짐
    const thick = R * (big ? J.SLASH_TRAIL_THICK : 0.3) * (1 - k);
    const half = big ? J.SLASH_TRAIL_ARC * Math.PI / 180 : S.arcHalf;
    drawCrescent(g, this.cx, this.cy, R, tr.angle - half * tr.flip, half * 2 * tr.flip, 0, 1,
      thick, CONFIG.colors.player, big ? 8 : 4, 1 - k * k);
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
//  총잡이: 가는 몸 + 긴 코트 + 앞으로 튀어나온 총. 히트스캔 사격.
//  조준(AIM_TIME) 동안 빨간 조준선이 플레이어를 추적하며 점점 굵고 밝아지고,
//  발사 AIM_LOCK_TIME 전 조준 고정 → 흰색 두 번 깜빡 + 총구에 빨간 빛 → 발사
// -------------------------------------------------------------
class Gunner extends Enemy {
  constructor(def) {
    super(def, CONFIG.gunner);
    this.kind = 'gunner';
    this.aim = this.facing > 0 ? 0 : Math.PI;
    this.cool = 0;
    this.nextParryable = true;
    this.lastFireT = -Infinity;     // 마지막 발사 시각 (월드 시간)
    this.laser = null;              // 조준선 끝점 (벽까지)
  }
  get pivotX() { return this.cx + this.facing; }
  get pivotY() { return this.y + this.h - 14; }
  get muzzleX() { return this.pivotX + Math.cos(this.aim) * this.cfg.gunLength; }
  get muzzleY() { return this.pivotY + Math.sin(this.aim) * this.cfg.gunLength; }
  get lockStart() { return this.cfg.AIM_TIME - this.cfg.AIM_LOCK_TIME; }
  get locked() { return this.state === 'aim' && this.t >= this.lockStart; }

  aimAt(player) {
    this.aim = Math.atan2(player.cy - this.pivotY, player.cx - this.pivotX);
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }
  // 예정된(또는 마지막) 발사 시각 — 여러 총잡이 발사 간격 조정용
  expectedFireT(worldT) {
    return this.state === 'aim' ? worldT + (this.cfg.AIM_TIME - this.t) : this.lastFireT;
  }

  update(dt, player, game) {
    const C = this.cfg;
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    // 벽에 가려 플레이어가 안 보이면 조준을 시작하지 않음
    const sees = !player.dead && Math.abs(dx) < C.aggroRange && Math.abs(dy) < C.aggroHeight &&
      lineOfSight(this.pivotX, this.pivotY, player.cx, player.cy);
    if (this.state !== 'aim') this.t += dt;
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
          this.setState('aim');
          this.nextParryable = Math.random() >= C.unparryableChance;
        }
        break;
      }
      case 'aim': {
        this.walk(0, 0, C.accel * 2, dt);
        if (player.dead) { this.setState('idle'); this.laser = null; break; }
        let nt = this.t + dt;
        // 다른 총잡이와 발사가 MIN_SHOT_GAP 안으로 겹치거나 패링 시퀀스 중이면, 조준 고정 직전에서 기다림
        if (game.shouldHoldAim(this, nt)) nt = Math.min(nt, Math.max(this.t, this.lockStart - 1e-4));
        this.t = nt;
        if (this.t < this.lockStart) this.aimAt(player);            // 고정 전까지 추적
        this.laser = game.raycast(this.muzzleX, this.muzzleY, this.aim, CONFIG.shot.RANGE, null);
        if (this.t >= C.AIM_TIME) {
          game.fireShot(this);
          this.lastFireT = game.worldT;
          this.cool = C.cooldown;
          this.laser = null;
          this.setState('engage');
        }
        break;
      }
    }
    this.physics(dt);
  }

  draw(g) {
    const Col = CONFIG.colors, C = this.cfg;
    const fx = Math.round(this.cx), fy = Math.round(this.y + this.h);
    const atkCol = this.nextParryable ? Col.attack : Col.unparryable;
    const aiming = this.state === 'aim' && this.laser;
    // 조준선: 0.8 → 0.15초 전 1px→2px, 투명도 40%→100%. 고정 후 흰색 두 번 깜빡
    if (aiming) {
      const k = clamp(this.t / this.lockStart, 0, 1);
      let color = atkCol, alpha = lerp(C.LASER_ALPHA_MIN, 1, k), width = k < 0.5 ? 1 : 2;
      if (this.locked) {
        const lt = this.t - this.lockStart, period = C.LOCK_BLINK_TIME * 2;
        if (lt < period * C.LOCK_BLINKS && (lt % period) < C.LOCK_BLINK_TIME) color = '#ffffff';
        alpha = 1; width = 2;
      }
      g.save();
      g.globalAlpha = alpha;
      g.strokeStyle = color; g.lineWidth = width;
      if (this.locked) { g.shadowColor = color; g.shadowBlur = 4; }
      g.beginPath();
      g.moveTo(this.muzzleX, this.muzzleY);
      g.lineTo(this.laser.x, this.laser.y);
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
    // 조준 고정 = "지금 친다": 총구에 작은 빨간 빛이 맺힘
    if (this.locked) {
      const u = clamp((this.t - this.lockStart) / C.AIM_LOCK_TIME, 0, 1);
      g.shadowColor = atkCol; g.shadowBlur = 8;
      g.fillStyle = atkCol;
      g.beginPath(); g.arc(15, 0, 1 + u * 1.5, 0, Math.PI * 2); g.fill();
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
  pendingShots: [],       // 플레이어에 닿아 패링 입력을 기다리는 탄
  worldT: 0,              // 월드 시간 (슬로우모션이면 느리게 흐름) — 사격·패링 타이밍 기준
  realT: 0,               // 실제 시간 (히트스톱·슬로우와 무관하게 틱마다 STEP 씩)
  lastClickReal: -Infinity, clickNoted: false,  // 마지막 클릭 실제 시각 (베기가 막혔어도) — 실패 오차 표시용
  inputLocked: false,
  zoom: 1,
  timingDebug: false,     // F5: 패링 판정 창 타이밍 바 + 입력 오차 표시
  timingMsg: null, lateWatch: null,
  cam: { x: 0, y: 0 },
  fade: 0,
  hitstop: 0,             // 남은 정지 시간 (패링/사망)
  killStop: 0,            // 킬 타임스톱 남은 프레임
  killFrame: -1,          // 마지막 처치 후 지난 프레임 (디버그 표시용)
  killShake: { f: 0, total: 0, angle: 0 },
  menu: false, menuDrag: false,
  debug: false,           // F1: 반사 보정 범위/대상 표시
  juicePanel: false,      // F2: 타격감 요소 토글 패널
  flash: 0, flashShown: false,
  shake: { t: 0, time: 1, amp: 0, angle: 0, ox: 0, oy: 0 },

  reset() {
    this.state = 'play';
    this.player = new Player(ROOM.spawn.x, ROOM.spawn.y);
    this.enemies = ROOM.enemies.map((d) => new ENEMY_TYPES[d.type](d));
    this.pendingShots = [];
    this.worldT = 0;
    this.lastClickReal = -Infinity;
    this.lateWatch = null;
    this.zoom = 1;
    Tracers.reset();
    Particles.reset();
    Rings.reset();
    Pieces.reset();
    Stains.reset();
    Beams.reset();
    KillTrail.reset();
    this.hitstop = 0;
    this.killStop = 0;
    this.killFrame = -1;
    this.killShake.total = 0;
    ParrySeq.cancel();
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
    if (Input.hit('Escape')) { this.menu = !this.menu; this.menuDrag = false; Settings.save(); Sfx.pauseAll(this.menu); }
    if (this.menu) {
      // 옵션 메뉴: 게임 정지, 흔들림만 미리보기로 재생
      this.handleMenu();
      this.updateShake(dt);
      return true;
    }
    if (Input.hit('KeyR')) { this.reset(); return true; }
    if (Input.hit('KeyM')) Sfx.toggleMute();
    if (Input.hit('F1')) this.debug = !this.debug;
    if (Input.hit('F2')) this.juicePanel = !this.juicePanel;
    if (Input.hit('F5')) this.timingDebug = !this.timingDebug;
    if (this.juicePanel) this.handleJuiceKeys();
    this.fade = Math.max(0, this.fade - dt);

    // 실제 시간으로 흐르는 연출: 히트스톱 중에도 섬광/흔들림/피격 섬광은 재생
    if (this.flash > 0 && this.flashShown) this.flash -= dt;
    this.updateShake(dt);
    Pieces.tickRealtime();
    if (this.killFrame >= 0) this.killFrame++;
    ParrySeq.tick();                   // 패링 시퀀스는 실제 시간으로 진행 (히트스톱/킬스톱 중에도)
    Tracers.tick();
    if (this.timingMsg) this.timingMsg.t += dt;
    this.realT += dt;
    // 클릭 시각은 실제 시간으로 기록 (히트스톱으로 월드가 멈춘 동안 누른 것도 정확하게)
    if (Input.mouse.clicked && !this.clickNoted) {
      this.clickNoted = true;
      this.lastClickReal = this.realT;
      const lw = this.lateWatch;   // 패링 실패 후 늦게 누른 클릭 → '+xxms 늦음'
      if (lw && this.realT <= lw.until) { this.reportTiming(this.realT - lw.fireReal, 'late'); this.lateWatch = null; }
    }
    if (this.lateWatch && this.realT > this.lateWatch.until) this.lateWatch = null;
    this.inputLocked = ParrySeq.active && CONFIG.parrySeq.LOCK_INPUT_DURING_SLOWMO;
    // 줌: 시간 복귀 동안 살짝 줌인, 명중 후 원상복구
    const PS = CONFIG.parrySeq;
    if (ParrySeq.active) this.zoom = 1 + PS.ZOOM * ParrySeq.returnU() ** 2;
    else this.zoom = approach(this.zoom, 1, PS.ZOOM / PS.ZOOM_OUT_FRAMES);
    if (ParrySeq.fireNow) { ParrySeq.fireNow = false; this.reflectHit(); }

    // 킬 타임스톱: 플레이어·맞은 적(조각)은 베는 자세로 정지. 빛줄기·피·먼지·궤적만 움직임
    if (this.killStop > 0) {
      this.killStop--;
      this.hitstop = Math.max(0, this.hitstop - dt);
      if (!CONFIG.kill.FREEZE_OTHERS) {
        // 다른 적은 계속 움직이되 그동안 플레이어는 공격하지도 맞지도 않음 (사격도 보류)
        for (const e of this.enemies) e.update(dt, this.player, this);
        this.pendingShots.length = 0;
        this.enemies = this.enemies.filter((e) => !e.dead);
      }
      this.updateFx(dt, true);
      if (this.killStop === 0) KillTrail.release();   // 해제: 조각이 날아가고 조작 재개 (다음 틱부터)
      return false;
    }

    // 히트스톱(패링/사망): 월드 전체 정지
    if (this.hitstop > 0) { this.hitstop -= dt; return false; }
    // 패링 시퀀스 슬로우모션: 월드 시간만 느리게 (소리·흔들림·섬광은 실제 시간)
    const realDt = dt;
    dt *= ParrySeq.scale;
    this.worldT += dt;

    const p = this.player;
    if (!p.dead) {
      const m = this.mouseWorld();
      p.update(dt, m.x, m.y);
    }
    for (const e of this.enemies) e.update(dt, p, this);
    this.resolveShots();
    this.resolveCombat();
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.updateFx(dt, false);
    Pieces.update(dt);
    dt = realDt;
    if (this.state === 'play' && this.enemies.length === 0) { this.state = 'clear'; Sfx.play('clear'); }
    this.cam.x = lerp(this.cam.x, this.camTarget(), CONFIG.camera.lerp);
    return true;
  },

  // 연출 레이어 갱신 (타임스톱 중에도 호출됨)
  updateFx(dt, stopped) {
    Particles.update(dt, stopped);
    Rings.update(dt);
    Beams.update();
    KillTrail.update();
    KillTrail.prune();
  },

  // ESC 옵션 메뉴: 흔들림 강도 슬라이더
  menuSlider() { return { x: W / 2 - 80, y: H / 2 + 2, w: 160, h: 8 }; },
  handleMenu() {
    const sl = this.menuSlider(), m = Input.mouse;
    const before = Settings.shake;
    if (Input.hit('ArrowLeft') || Input.hit('KeyA')) Settings.shake -= 0.1;
    if (Input.hit('ArrowRight') || Input.hit('KeyD')) Settings.shake += 0.1;
    if (m.clicked && m.x >= sl.x - 6 && m.x <= sl.x + sl.w + 6 && m.y >= sl.y - 8 && m.y <= sl.y + sl.h + 8) this.menuDrag = true;
    if (!m.down) this.menuDrag = false;
    if (this.menuDrag) Settings.shake = (m.x - sl.x) / sl.w * 1.5;
    Settings.shake = Math.round(clamp(Settings.shake, 0, 1.5) * 20) / 20;   // 5% 단위
    // 값이 바뀌면 그 강도로 흔들림을 미리 보여줌
    if (Settings.shake !== before && !this.menuDrag) this.startKillShake(rand(0, Math.PI * 2), 10);
  },

  handleJuiceKeys() {
    for (let i = 0; i < JUICE.length; i++) {
      if (Input.hit(JUICE_KEYS[i])) juiceOn[JUICE[i].key] = !juiceOn[JUICE[i].key];
    }
    if (Input.hit('Minus')) {
      const all = JUICE.every((j) => juiceOn[j.key]);
      for (const j of JUICE) juiceOn[j.key] = !all;
    }
    // 사운드 미리 듣기
    if (Input.hit('KeyZ')) Sfx.play('slash');
    if (Input.hit('KeyX')) Sfx.play('kill');
    if (Input.hit('KeyC')) Sfx.play('parry');
    if (Input.hit('KeyV')) Sfx.play('shot');
  },

  // 방향성 흔들림 엔벨로프: 공격 방향으로 확 밀렸다가 (1-k)² 로 되돌아옴. 끝에 반대쪽으로 살짝 넘어감.
  shakeEnvelope(k) {
    return (1 - k) ** 2 * Math.cos(k * Math.PI * CONFIG.juice.SHAKE_OVERSHOOT);
  },
  // 화면 흔들림 = 방향성 흔들림(패링/사망) + 킬 흔들림. 옵션의 강도 배율 적용
  updateShake(dt) {
    const sh = this.shake;
    let ox = 0, oy = 0;
    if (sh.t > 0) {
      sh.t = Math.max(0, sh.t - dt);
      const e = sh.amp * this.shakeEnvelope(1 - sh.t / sh.time);
      ox += Math.cos(sh.angle) * e;
      oy += Math.sin(sh.angle) * e;
    }
    // 킬 흔들림: 매 프레임 랜덤 방향이되 공격 방향으로 치우침. 타임스톱 16f 동안 감쇠, 해제 후 6f 안에 0
    const ks = this.killShake;
    if (ks.f < ks.total) {
      const K = CONFIG.kill;
      const amp = K.SHAKE_START * (1 - ks.f / ks.total) ** K.SHAKE_CURVE;
      const r = rand(0, Math.PI * 2);
      const vx = Math.cos(ks.angle) * K.SHAKE_BIAS + Math.cos(r) * (1 - K.SHAKE_BIAS);
      const vy = Math.sin(ks.angle) * K.SHAKE_BIAS + Math.sin(r) * (1 - K.SHAKE_BIAS);
      const n = Math.hypot(vx, vy) || 1, a = amp * rand(0.6, 1);
      ox += vx / n * a; oy += vy / n * a;
      ks.f++;
    }
    sh.ox = ox * Settings.shake;
    sh.oy = oy * Settings.shake;
  },
  startKillShake(angle, stopFrames) {
    const ks = this.killShake;
    ks.f = 0; ks.total = stopFrames + CONFIG.kill.SHAKE_TAIL_FRAMES; ks.angle = angle;
    this.updateShake(0);   // 처치 프레임부터 바로 흔들림
  },
  addShake(amp, time, angle = rand(0, Math.PI * 2)) {
    if (!juiceOn.shake) return;
    const sh = this.shake;
    if (sh.t > 0 && sh.amp * this.shakeEnvelope(1 - sh.t / sh.time) > amp) return; // 더 센 흔들림 유지
    sh.amp = amp; sh.time = time; sh.t = time; sh.angle = angle;
    sh.ox = Math.cos(angle) * amp * Settings.shake; sh.oy = Math.sin(angle) * amp * Settings.shake; // 첫 프레임에 바로 밀림
  },
  addHitstop(t) {
    if (juiceOn.hitstop) this.hitstop = Math.max(this.hitstop, t);
  },
  // 프레임 단위 히트스톱 (부동소수 오차로 한 프레임 더 멈추지 않게 살짝 덜어냄)
  addHitstopFrames(n) { this.addHitstop(n * STEP - 1e-6); },

  // 패링 성공 공통 연출 (x, y = 칼에 맞부딪힌 지점)
  parryFx(x, y, angle) {
    const F = CONFIG.fx, C = CONFIG.colors, J = CONFIG.juice;
    this.addHitstopFrames(J.HITSTOP_PARRY_FRAMES);               // 1) 히트스톱 6프레임
    if (juiceOn.screenFlash) { this.flash = F.flashTime; this.flashShown = false; } // 2) 흰 섬광
    Rings.spawn(x, y, F.ringRadius, F.ringTime, F.ringWidth, C.parry);            // 3) 충격파 링
    Rings.spawn(x, y, F.ringRadius * 0.55, F.ringTime * 0.7, F.ringWidth - 1, C.parryHot);
    this.addShake(J.SHAKE_PARRY, J.SHAKE_TIME, angle);            // 5) 방향성 흔들림
    Particles.burst(x, y, 14, C.parry, 260, { angle, spread: 1.3, life: 0.28, glow: true, streak: true });
    Particles.burst(x, y, 6, C.parryHot, 120, { life: 0.35, glow: true });
    Sfx.play('parry');
  },

  resolveCombat() {
    const p = this.player;
    const S = CONFIG.slash;

    if (!p.dead && p.inParryWindow) {
      // 1) 패링: 근접 공격 → 적 즉사 (사격 패링은 resolveShots 의 타이밍 판정)
      for (const e of this.enemies) {
        if (e.dead || !e.parryVulnerable || !e.parryVulnerable()) continue;
        const reach = 1 + CONFIG.aimAssist.MELEE_PARRY_RANGE_BONUS;
        if (p.slashHitsRect(e.threatBox(), reach) || p.slashHitsRect(e, reach)) this.parryMelee(e);
      }
    }

    // 2) 칼이 적 몸통에 직접 닿음 → 즉사
    if (!p.dead && S.directKill && p.slashing && p.slashT < S.hitTime) {
      for (const e of this.enemies) {
        if (!e.dead && p.slashHitsRect(e)) { p.slashUsed = true; this.killEnemy(e, p.slashAngle, 'slash'); }
      }
    }

    // 3) 근접 공격 명중 (패링 시퀀스로 입력이 잠긴 동안은 맞지 않음)
    if (p.dead || this.inputLocked) return;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const box = e.attackBox();
      if (box && overlap(p, box)) { this.killPlayer(Math.atan2(p.cy - e.cy, p.cx - e.cx)); return; }
    }
  },

  // 반사 대상 고르기. 기준 방향 = 플레이어 → 마우스, 거리/시야는 반사 시작점(총알 위치) 기준.
  //  1) 그 총알을 쏜 적이 ±OWNER_PRIORITY_ANGLE 안이면 최우선
  //  2) 아니면 ±AIM_SNAP_ANGLE 안에서 마우스 방향과 각도 차가 가장 작은 적
  //  거리 AIM_SNAP_RANGE 초과, 벽에 가려진 적은 제외. 없으면 null (마우스 방향 그대로).
  pickReflectTarget(ox, oy, aimAngle, shooter) {
    const A = CONFIG.aimAssist, deg = Math.PI / 180;
    let best = null, bestDiff = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.cx - ox, dy = e.cy - oy;
      if (dx * dx + dy * dy > A.AIM_SNAP_RANGE * A.AIM_SNAP_RANGE) continue;
      const diff = Math.abs(angDiff(Math.atan2(dy, dx), aimAngle));
      const limit = (e === shooter ? A.OWNER_PRIORITY_ANGLE : A.AIM_SNAP_ANGLE) * deg;
      if (diff > limit) continue;
      if (!lineOfSight(ox, oy, e.cx, e.cy)) continue;
      if (e === shooter) return e;
      if (diff < bestDiff) { best = e; bestDiff = diff; }
    }
    return best;
  },

  // 히트스캔 레이: (x, y) 에서 angle 방향으로 range 까지. 지형(일방향 발판 제외)에 막힘.
  //  player 를 주면 플레이어 판정, enemies 를 주면 적 판정 (먼저 닿는 것)
  raycast(x, y, angle, range, player, enemies = null) {
    const dx = Math.cos(angle), dy = Math.sin(angle), step = 1.5, pad = CONFIG.shot.PLAYER_HIT_PAD;
    for (let d = 0; d <= range; d += step) {
      const px = x + dx * d, py = y + dy * d;
      if (solidAt(px, py, false)) return { x: px, y: py, wall: true, player: false, enemy: null };
      if (player && px >= player.x - pad && px <= player.x + player.w + pad && py >= player.y - pad && py <= player.y + player.h + pad) {
        return { x: px, y: py, wall: false, player: true, enemy: null };
      }
      if (enemies) {
        for (const e of enemies) {
          if (!e.dead && px >= e.x && px <= e.x + e.w && py >= e.y && py <= e.y + e.h) return { x: px, y: py, wall: false, player: false, enemy: e };
        }
      }
    }
    return { x: x + dx * range, y: y + dy * range, wall: false, player: false, enemy: null };
  },

  // 총잡이 g 가 지금 조준을 더 진행하면 안 되는가
  //  - 패링 시퀀스 중 (플레이어 입력이 잠겨 피할 수 없으므로)
  //  - 다른 총잡이의 (예정된) 발사와 MIN_SHOT_GAP 안으로 겹칠 때, 나중 순서인 쪽이 기다림
  shouldHoldAim(g, nt) {
    if (ParrySeq.active) return true;
    const gap = CONFIG.shot.MIN_SHOT_GAP;
    const mine = this.worldT + (g.cfg.AIM_TIME - nt);
    const gi = this.enemies.indexOf(g);
    for (const o of this.enemies) {
      if (o === g || o.kind !== 'gunner' || o.dead) continue;
      const of = o.expectedFireT(this.worldT);
      if (!isFinite(of)) continue;
      const otherFirst = of < mine || (of === mine && this.enemies.indexOf(o) < gi);
      if (otherFirst && mine - of < gap) return true;
    }
    return false;
  },

  // 적 발사: 즉시 레이캐스트. 플레이어에 닿으면 PARRY_LATE 동안 패링 입력을 기다린 뒤 판정
  fireShot(g) {
    const Sh = CONFIG.shot, C = CONFIG.colors, p = this.player;
    const col = g.nextParryable ? C.attack : C.unparryable;
    const hit = this.raycast(g.muzzleX, g.muzzleY, g.aim, Sh.RANGE, p.dead ? null : p);
    Tracers.add(g.muzzleX, g.muzzleY, hit.x, hit.y, Sh.TRACER_WIDTH, col, Sh.TRACER_FRAMES, true);
    Particles.burst(g.muzzleX, g.muzzleY, 5, col, 90, { angle: g.aim, spread: 0.5, life: 0.12, glow: true });
    g.vx -= Math.cos(g.aim) * 40;    // 반동
    Sfx.play('shot');
    if (hit.wall) Particles.burst(hit.x, hit.y, 7, col, 110, { angle: g.aim + Math.PI, spread: 1.1, life: 0.2, glow: true, streak: true });
    if (hit.player) {
      this.pendingShots.push({ shooter: g, fireT: this.worldT, fireReal: this.realT, angle: g.aim, parryable: g.nextParryable, x: hit.x, y: hit.y, done: false });
    }
  },

  // 플레이어에 닿은 탄: 발사 -PARRY_EARLY ~ +PARRY_LATE 안에 베기를 시작했으면 패링, 아니면 즉사
  resolveShots() {
    const p = this.player, Sh = CONFIG.shot, eps = 1e-9;
    for (const s of this.pendingShots) {
      if (s.done) continue;
      if (p.dead) { s.done = true; continue; }
      const ts = p.lastSlashT;
      if (s.parryable && !p.slashUsed && ts >= s.fireT - Sh.PARRY_EARLY - eps && ts <= s.fireT + Sh.PARRY_LATE + eps) {
        s.done = true;
        p.slashUsed = true;
        this.reportTiming(ts - s.fireT, 'ok');
        this.parryShot(s);
        continue;
      }
      if (this.worldT > s.fireT + Sh.PARRY_LATE + eps) {
        s.done = true;
        this.reportShotFail(s);
        this.killPlayer(s.angle);
      }
    }
    this.pendingShots = this.pendingShots.filter((s) => !s.done);
  },

  // 패링 성공: 반사 대상 고르고 슬로우모션 시퀀스 시작 (명중은 time_return 이 끝나는 틱)
  parryShot(s) {
    const p = this.player, m = this.mouseWorld();
    const aim = Math.atan2(m.y - p.cy, m.x - p.cx);
    // 쏜 적 우선 → 가려져 있으면 조준 스냅 → 없으면 마우스 방향
    const target = this.pickReflectTarget(p.cx, p.cy, aim, s.shooter);
    const ray = this.raycast(p.cx, p.cy, aim, CONFIG.shot.RANGE, null);
    // 노란 불꽃은 탄이 날아온 쪽 칼날 위에서
    const back = s.angle + Math.PI, r = CONFIG.slash.radius * 0.6;
    this.parryFx(p.cx + Math.cos(back) * r, p.cy + Math.sin(back) * r, back);
    ParrySeq.start(target, aim, Math.hypot(ray.x - p.cx, ray.y - p.cy),
      juiceOn.hitstop ? CONFIG.juice.HITSTOP_PARRY_FRAMES : 0);
  },

  // 시퀀스 끝 프레임: 반사탄(히트스캔) 명중
  reflectHit() {
    const p = this.player, Sh = CONFIG.shot, C = CONFIG.colors;
    const t = ParrySeq.target;
    ParrySeq.target = null;
    if (p.dead) return;
    const ox = p.cx, oy = p.cy;
    let angle, hx, hy, victim = null;
    if (t && !t.dead) {
      // 정해 둔 대상은 이 프레임에 반드시 명중
      angle = Math.atan2(t.cy - oy, t.cx - ox); hx = t.cx; hy = t.cy; victim = t;
    } else {
      angle = ParrySeq.dir;
      const r = this.raycast(ox, oy, angle, Sh.RANGE, null, this.enemies);
      hx = r.x; hy = r.y; victim = r.enemy;
      if (r.wall) Particles.burst(hx, hy, 8, C.parry, 120, { angle: angle + Math.PI, spread: 1.1, life: 0.22, glow: true, streak: true });
    }
    Tracers.add(ox, oy, hx, hy, Sh.REFLECT_TRACER_WIDTH, C.parry, Sh.TRACER_FRAMES);
    if (victim) {
      this.killEnemy(victim, angle, 'reflect');
      this.enemies = this.enemies.filter((e) => !e.dead);   // 월드 갱신 전이라 여기서 바로 정리 (온전한 몸이 남지 않게)
      // 이 틱은 월드 갱신 전에 처치됐으므로, 킬 연출 정지가 이 틱 + 16프레임이 되도록 1 보탬
      if (this.killStop > 0) this.killStop++;
    }
  },

  // 패링 입력 오차 표시 (F5 디버그). err = 베기 시작 - 발사 (초, 게임 시간)
  reportTiming(err, kind) {
    const ms = Math.round(err * 1000), sign = ms > 0 ? '+' : '';
    const label = { ok: '성공', early: '이름', late: '늦음', locked: '헛스윙 잠금', none: '입력 없음' }[kind];
    this.timingMsg = { text: kind === 'none' ? label : `${sign}${ms}ms ${label}`, ok: kind === 'ok', t: 0 };
  },
  // 패링 실패: 가장 가까운 클릭으로 원인 표시. 아직 안 눌렀으면 잠시 기다렸다가 '늦음'
  reportShotFail(s) {
    const Sh = CONFIG.shot, f = s.fireReal, c = this.lastClickReal, eps = 1e-9;
    if (c > f + Sh.PARRY_LATE + eps) this.reportTiming(c - f, 'late');                       // 이번 틱에 늦게 누름
    else if (c >= f - Sh.PARRY_EARLY - eps) this.reportTiming(c - f, 'locked');              // 창 안에 눌렀지만 헛스윙 잠금 등으로 베기 못 함
    else if (c > f - 0.5) this.reportTiming(c - f, 'early');
    else { this.lateWatch = { fireReal: f, until: f + 0.5 }; this.reportTiming(0, 'none'); }
  },

  parryMelee(e) {
    const p = this.player;
    p.slashUsed = true;
    this.parryFx(p.tipX, p.tipY, p.slashAngle);
    this.killEnemy(e, p.slashAngle, 'parry');
  },

  // 적 처치: 킬 연출 타임라인 시작 (CONFIG.kill 참고)
  //  타임스톱 · 빛줄기+흙먼지 · 3겹 궤적 · 피 구름 · 킬 흔들림 · 피격 흰 섬광 · 두 조각(해제 후 날아감) · 반동 · 사운드
  //  cause: 'slash'(직접 베기) | 'parry'(근접 패링) | 'reflect'(반사 총알)
  killEnemy(e, angle, cause = 'slash') {
    if (e.dead) return;
    e.dead = true;
    const C = CONFIG.colors, J = CONFIG.juice, K = CONFIG.kill;
    const p = this.player;
    const byParry = cause !== 'slash';
    e.setState('dead');                // 무기 발광을 끄고 시체 자세로
    // 두 조각: 속도는 지금 정해지지만 타임스톱이 끝나야 움직이기 시작
    Pieces.split((g) => e.draw(g), e.cx, e.cy, angle, byParry ? C.parry : C.player, 1, juiceOn.knockback);
    // 1) 타임스톱
    const stop = juiceOn.hitstop ? K.KILL_HITSTOP_FRAMES : 0;
    this.killStop = Math.max(this.killStop, stop);
    this.killFrame = 0;
    // 2) 빛줄기: 타격 지점(적 중심)을 지나 화면 밖에서 화면 밖으로
    if (juiceOn.beam) Beams.spawn(e.cx, e.cy, angle, this.cam);
    // 3) 3겹 궤적 (칼로 벤 경우) + 반동
    if (cause !== 'reflect' && !p.dead) {
      if (juiceOn.slashTrail) {
        KillTrail.spawn(p.cx, p.cy, p.trail ? p.trail.angle : angle, p.trail ? p.trail.flip : 1);
        if (!stop) KillTrail.release();
        p.trail = null;                // 흰 반달 대신 3겹 궤적
      }
      // 반동: 지금 속도만 정해 두면 타임스톱이 끝난 뒤부터 적용됨
      if (juiceOn.recoil) {
        p.dashT = 0;
        p.vx = -Math.cos(angle) * J.RECOIL_SPEED;
        if (!p.onGround) p.vy = -Math.sin(angle) * J.RECOIL_SPEED * 0.5 - J.RECOIL_LIFT;
      }
    }
    // 4) 피: 공격 방향 앞쪽 원뿔로 빨간 덩어리 구름 (타임스톱 중엔 천천히 퍼짐 → 해제 후 떨어져 자국)
    if (juiceOn.gore) {
      const n = K.BLOOD_MIN + Math.floor(Math.random() * (K.BLOOD_MAX - K.BLOOD_MIN + 1));
      const cone = K.BLOOD_CONE * Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const a = angle + rand(-1, 1) * cone * (Math.random() < 0.65 ? 0.55 : 1); // 가운데가 짙은 구름
        const v = rand(K.BLOOD_SPEED_MIN, K.BLOOD_SPEED_MAX);
        Particles.spawn(e.cx + rand(-3, 3), e.cy + rand(-4, 4), Math.cos(a) * v, Math.sin(a) * v - 30,
          K.BLOOD_LIFE * rand(0.75, 1), C.blood[i % C.blood.length],
          Math.random() < 0.45 ? 3 : 2, K.BLOOD_GRAVITY, false, false, true);
        Particles.list[Particles.list.length - 1].slowInStop = true;
      }
    }
    Particles.burst(e.cx, e.cy, 8, byParry ? C.parry : C.player, 260, { angle, spread: 0.35, life: 0.18, glow: true, streak: true });
    // 5) 킬 흔들림
    if (juiceOn.shake) this.startKillShake(angle, stop);
    Sfx.play('kill');
  },

  killPlayer(angle) {
    const p = this.player, F = CONFIG.fx, C = CONFIG.colors;
    p.dead = true;
    ParrySeq.cancel();
    this.pendingShots.length = 0;
    this.state = 'dead';
    Pieces.split((g) => Player.drawBody(g, { ...p.pose(), slashing: false }, C.player, 1), p.cx, p.cy, angle, C.attack, 1.1);
    Particles.burst(p.cx, p.cy, 16, C.player, 180, { angle, spread: 1.0, life: 0.6, grav: 400, size: 1 });
    this.addHitstop(F.deathHitstop);
    this.addShake(F.deathShake, 0.2, angle);
    Sfx.play('death');
  },

  render() {
    if (this.state === 'logo') { this.renderLogo(); return; }
    const sx = this.shake.ox, sy = this.shake.oy;
    // 줌 (시간 복귀 동안): 플레이어를 중심으로 화면 전체를 살짝 확대
    ctx.save();
    if (this.zoom > 1.0001) {
      const fx = this.player.cx - this.cam.x, fy = this.player.cy - this.cam.y;
      ctx.translate(fx, fy); ctx.scale(this.zoom, this.zoom); ctx.translate(-fx, -fy);
    }
    Backdrop.draw(ctx, this.cam.x - sx);

    ctx.save();
    ctx.translate(-Math.round(this.cam.x - sx), -Math.round(this.cam.y - sy));
    drawTerrain(ctx);
    Stains.draw(ctx);
    if (!this.player.dead) this.player.drawSlash(ctx);
    KillTrail.draw(ctx);
    Pieces.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    this.player.draw(ctx);
    this.drawReflectLine(ctx);
    Tracers.draw(ctx);
    Particles.draw(ctx);
    Beams.draw(ctx);
    Rings.draw(ctx);
    if (this.debug) this.drawAimDebug(ctx);
    if (this.timingDebug) this.drawTimingBars(ctx);
    ctx.restore();
    ctx.restore();
    this.drawSlowmoFx(ctx);

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

  // 슬로우 중: 플레이어에서 반사 대상 쪽으로 노란 반사 궤적이 뻗어감 (게임 시간에 맞춰)
  drawReflectLine(g) {
    const u = ParrySeq.growth();
    if (u <= 0 || this.player.dead) return;
    const p = this.player, t = ParrySeq.target, C = CONFIG.colors;
    let ang, len;
    if (t && !t.dead) { ang = Math.atan2(t.cy - p.cy, t.cx - p.cx); len = Math.hypot(t.cx - p.cx, t.cy - p.cy); }
    else { ang = ParrySeq.dir; len = ParrySeq.dist; }
    const hx = p.cx + Math.cos(ang) * len * u, hy = p.cy + Math.sin(ang) * len * u;
    g.save();
    g.strokeStyle = C.parry; g.shadowColor = C.parry; g.shadowBlur = 6;
    g.lineWidth = CONFIG.parrySeq.REFLECT_LINE_WIDTH;
    g.globalAlpha = 0.85;
    g.beginPath(); g.moveTo(p.cx, p.cy); g.lineTo(hx, hy); g.stroke();
    g.globalAlpha = 1; g.fillStyle = C.parry;
    g.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 2);
    g.restore();
  },

  // 슬로우 중 화면 채도 감소 + 비네트 (진입 때 들어오고 시간 복귀 동안 원상복구)
  drawSlowmoFx(g) {
    const a = ParrySeq.fxAmount();
    if (a <= 0.001) return;
    const PS = CONFIG.parrySeq;
    g.save();
    g.globalCompositeOperation = 'saturation';
    g.globalAlpha = PS.DESATURATE * a;
    g.fillStyle = '#808080';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    const grad = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${PS.VIGNETTE * a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.restore();
  },

  // F5: 조준선 옆에 패링 판정 창(초록) 타이밍 바. 흰 선 = 지금, 빨간 선 = 발사 순간
  drawTimingBars(g) {
    const Sh = CONFIG.shot;
    const bar = (cx, cy, cur) => {
      const span = CONFIG.gunner.AIM_TIME + Sh.PARRY_LATE + 0.05, w = 48, x0 = Math.round(cx - w / 2), y0 = Math.round(cy);
      const X = (t) => x0 + Math.round(clamp(t / span, 0, 1) * w);
      const fire = CONFIG.gunner.AIM_TIME;
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x0 - 1, y0 - 1, w + 2, 5);
      g.fillStyle = '#2a3350'; g.fillRect(x0, y0, w, 3);
      g.fillStyle = '#39e36b'; g.fillRect(X(fire - Sh.PARRY_EARLY), y0, X(fire + Sh.PARRY_LATE) - X(fire - Sh.PARRY_EARLY), 3);
      g.fillStyle = CONFIG.colors.attack; g.fillRect(X(fire), y0 - 1, 1, 5);
      g.fillStyle = '#ffffff'; g.fillRect(X(cur), y0 - 2, 1, 7);
    };
    for (const e of this.enemies) {
      if (e.kind !== 'gunner' || e.state !== 'aim' || !e.laser) continue;
      // 조준선 위, 총구에서 조금 떨어진 곳
      const d = 34, nx = -Math.sin(e.aim), ny = Math.cos(e.aim), side = ny > 0 ? -1 : 1;
      bar(e.muzzleX + Math.cos(e.aim) * d + nx * 8 * side, e.muzzleY + Math.sin(e.aim) * d + ny * 8 * side, e.t);
    }
    for (const s of this.pendingShots) bar(s.shooter.cx, s.shooter.y - 10, CONFIG.gunner.AIM_TIME + (this.worldT - s.fireT));
  },

  // F1 디버그: 스냅 범위 부채꼴(실선 = 일반 ±35°, 점선 = 쏜 적 우선 ±50°)과 대상 표시
  drawAimDebug(g) {
    const p = this.player;
    if (p.dead) return;
    const A = CONFIG.aimAssist, deg = Math.PI / 180, C = CONFIG.colors;
    const m = this.mouseWorld();
    const aim = Math.atan2(m.y - p.cy, m.x - p.cx);
    // 지금 패링한다면: 가장 먼저 쏠 총잡이를 '쏜 적'으로 보고 미리 계산
    const ox = p.cx, oy = p.cy;
    let shooter = null, soonest = Infinity;
    for (const e of this.enemies) {
      if (e.kind !== 'gunner' || e.state !== 'aim') continue;
      const ft = e.expectedFireT(this.worldT);
      if (ft < soonest) { soonest = ft; shooter = e; }
    }
    const preview = this.pickReflectTarget(ox, oy, aim, shooter);
    g.save();
    g.strokeStyle = C.ui; g.fillStyle = C.ui;
    g.lineWidth = 1;
    const R = A.AIM_SNAP_RANGE, s = A.AIM_SNAP_ANGLE * deg, o = A.OWNER_PRIORITY_ANGLE * deg;
    g.globalAlpha = 0.08;
    g.beginPath(); g.moveTo(ox, oy); g.arc(ox, oy, R, aim - s, aim + s); g.closePath(); g.fill();
    g.globalAlpha = 0.45;
    g.stroke();
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(ox, oy); g.arc(ox, oy, R, aim - o, aim + o); g.closePath(); g.stroke();
    g.setLineDash([]);
    // 근접 패링 확대 판정 (칼 반경 × (1 + 보너스))
    g.globalAlpha = 0.35;
    g.beginPath(); g.arc(p.cx, p.cy, CONFIG.slash.radius * (1 + A.MELEE_PARRY_RANGE_BONUS), 0, Math.PI * 2); g.stroke();
    // 쏜 적 표시
    if (shooter && !shooter.dead) {
      g.globalAlpha = 0.6;
      g.setLineDash([2, 2]);
      g.strokeRect(Math.round(shooter.x) - 3.5, Math.round(shooter.y) - 3.5, shooter.w + 7, shooter.h + 7);
      g.setLineDash([]);
    }
    // 지금 패링하면 선택될 대상
    const mark = (e, a) => {
      g.globalAlpha = a;
      const x = Math.round(e.x) - 2.5, y = Math.round(e.y) - 2.5, w = e.w + 5, h = e.h + 5, k = 4;
      for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
        g.beginPath(); g.moveTo(cx + sx * k, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * k); g.stroke();
      }
    };
    if (preview) mark(preview, 1);
    // 패링 시퀀스 중 → 반사 대상
    if (ParrySeq.active && ParrySeq.target && !ParrySeq.target.dead) mark(ParrySeq.target, 0.8);
    g.restore();
  },

  // F3/F4: 시간 조작 상태 + 킬 연출 타임라인 위치
  drawTimeDebug(g) {
    const K = CONFIG.kill;
    const mode = Debug.step ? 'F4 프레임 진행 (F4 다음 · Enter 해제)' : `F3 슬로우 ${Math.round(CONFIG.debug.SLOW_SCALE * 100)}%`;
    const kf = this.killFrame;
    const parts = [mode, `#${Debug.frame}`];
    if (ParrySeq.active) parts.push(`패링 시퀀스 ${ParrySeq.k}/${ParrySeq.killTick}f ×${ParrySeq.scale.toFixed(2)}`);
    if (kf >= 0 && kf < 40) {
      parts.push(`킬 +${kf}f`);
      parts.push(this.killStop > 0 ? `타임스톱 ${K.KILL_HITSTOP_FRAMES - this.killStop}/${K.KILL_HITSTOP_FRAMES}` : '조작 가능');
      if (Beams.list.length) parts.push(`빛줄기 ${Beams.list[0].f}/${K.BEAM_FRAMES}`);
      parts.push(`흔들림 ${Math.hypot(this.shake.ox, this.shake.oy).toFixed(1)}px`);
    }
    g.save();
    g.textAlign = 'center';
    g.font = 'bold 10px sans-serif';
    g.fillStyle = '#000'; g.globalAlpha = 0.6;
    g.fillRect(0, 18, W, 13);
    g.globalAlpha = 1; g.fillStyle = CONFIG.colors.ui;
    g.fillText(parts.join('  ·  '), W / 2, 25);
    g.restore();
  },

  // ESC 옵션 메뉴
  drawMenu(g) {
    const C = CONFIG.colors, sl = this.menuSlider();
    g.save();
    g.shadowBlur = 0;
    g.globalAlpha = 0.75; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
    g.fillStyle = C.ui; g.strokeStyle = C.ui;
    g.textAlign = 'center';
    g.font = 'bold 16px sans-serif';
    g.fillText('옵션', W / 2, H / 2 - 40);
    g.font = '11px sans-serif';
    g.textAlign = 'left';
    g.fillText('화면 흔들림', sl.x, sl.y - 10);
    g.textAlign = 'right';
    g.fillText(Math.round(Settings.shake * 100) + '%', sl.x + sl.w, sl.y - 10);
    // 슬라이더 (0 ~ 150%, 100% 위치에 눈금)
    g.lineWidth = 1;
    g.strokeRect(sl.x + 0.5, sl.y + 0.5, sl.w - 1, sl.h - 1);
    const fx = Math.round(sl.x + sl.w * Settings.shake / 1.5);
    g.globalAlpha = 0.5; g.fillRect(sl.x + 1, sl.y + 1, Math.max(0, fx - sl.x - 1), sl.h - 2);
    g.globalAlpha = 1;
    const tick100 = Math.round(sl.x + sl.w / 1.5);
    g.fillRect(tick100, sl.y + sl.h + 1, 1, 3);
    g.fillRect(fx - 2, sl.y - 2, 4, sl.h + 4);
    g.font = '9px sans-serif'; g.textAlign = 'center';
    g.fillText('0', sl.x, sl.y + sl.h + 10);
    g.fillText('100', tick100, sl.y + sl.h + 10);
    g.fillText('150', sl.x + sl.w, sl.y + sl.h + 10);
    g.font = '10px sans-serif';
    g.globalAlpha = 0.8;
    g.fillText('드래그 또는 ← → / A D 로 조절  ·  ESC 닫기', W / 2, H / 2 + 40);
    g.restore();
  },

  // F2: 타격감 요소 토글 패널
  drawJuicePanel(g) {
    const x = 8, y0 = 24, lh = 11;
    g.save();
    g.globalAlpha = 0.7;
    g.fillStyle = '#000';
    g.fillRect(x - 4, y0 - 8, 148, lh * (JUICE.length + 3) + 4);
    g.globalAlpha = 1;
    g.fillStyle = CONFIG.colors.ui;
    g.font = 'bold 10px sans-serif';
    g.textAlign = 'left';
    g.fillText('F2 타격감 토글', x, y0);
    g.font = '10px sans-serif';
    JUICE.forEach((j, i) => {
      g.globalAlpha = juiceOn[j.key] ? 1 : 0.4;
      g.fillText(`${(i + 1) % 10} ${juiceOn[j.key] ? '■' : '□'} ${j.label}`, x, y0 + lh * (i + 1));
    });
    g.globalAlpha = 0.7;
    g.fillText('-  전부 켜기/끄기', x, y0 + lh * (JUICE.length + 1));
    g.fillText('듣기: Z 휘두르기 X 처치 C 패링 V 사격', x, y0 + lh * (JUICE.length + 2));
    g.restore();
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
    g.textAlign = 'right';
    g.fillText([this.debug ? 'AIM DEBUG' : '', this.timingDebug ? 'TIMING' : '', Sfx.muted ? 'MUTE' : ''].filter(Boolean).join('  '), W - 8, 10);
    // F5: 패링 입력 오차 (화면 오른쪽 아래)
    if (this.timingDebug && this.timingMsg && this.timingMsg.t < 2.5) {
      g.save();
      g.globalAlpha = clamp(2.5 - this.timingMsg.t, 0, 1);
      g.font = 'bold 12px monospace';
      g.fillStyle = this.timingMsg.ok ? CONFIG.colors.parry : CONFIG.colors.attack;
      g.fillText(this.timingMsg.text, W - 8, H - 24);
      g.restore();
    }
    if (this.juicePanel) this.drawJuicePanel(g);
    if (Debug.slow || Debug.step) this.drawTimeDebug(g);
    // 조작 안내 (첫 판 몇 초)
    if (this.playT < CONFIG.hintTime) {
      g.globalAlpha = 0.75 * clamp(CONFIG.hintTime - this.playT, 0, 1);
      g.textAlign = 'center';
      g.font = '10px sans-serif';
      g.fillText('A/D 이동 · Space 점프 · 클릭 베기 — 칼이 닿는 순간 / 총을 쏘는 순간 베면 패링', W / 2, H - 10);
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
    if (this.menu) this.drawMenu(g);
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
function tick() {
  if (Game.update(STEP)) { Input.endTick(); Game.clickNoted = false; }
  Debug.frame++;
}
function frame(now) {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  Sfx.updateElements(elapsed);
  if (Debug.step) {
    // F4: 누를 때마다 정확히 한 프레임
    acc = 0;
    while (Debug.stepQueue > 0) { Debug.stepQueue--; tick(); }
  } else {
    Debug.stepQueue = 0;
    // F3: 실제 흐르는 시간 자체를 줄여 모든 프레임 단위 연출이 같은 비율로 느려짐
    acc += elapsed * (Debug.slow ? CONFIG.debug.SLOW_SCALE : 1);
    while (acc >= STEP) { tick(); acc -= STEP; }
  }
  Game.render();
  requestAnimationFrame(frame);
}

window.__game = Game; // 디버그용
requestAnimationFrame(frame);

'use strict';
// 모든 밸런스 수치는 여기 한 곳에서 관리한다.
// 시간 단위: 프레임 (60프레임 = 1초)  /  속도 단위: px/프레임
// 히트박스: { x: 몸 중심에서 앞쪽으로의 시작 거리, y: 발밑 기준 위쪽(음수), w, h }

// ---------- 조작키 ----------
// 동작 → 키 코드 목록 (여러 개 지정 가능)
// 키보드: KeyboardEvent.code 값 ('KeyA', 'Space', 'ShiftLeft', 'Enter', 'Escape', 'Tab', 'F1' ...)
// 마우스: 'Mouse0' = 좌클릭, 'Mouse1' = 휠클릭, 'Mouse2' = 우클릭
// 조합 기술(S + 우클릭 런처 등)은 'down' + 'heavy' 조합으로 자동 처리된다
const KEYBINDS = {
  left: ['KeyA'],
  right: ['KeyD'],
  down: ['KeyS'],               // S + 강공 = 런처 / 공중 내려찍기, S + 점프 = 발판 내려가기
  up: ['KeyW'],
  jump: ['Space'],              // 2단 점프, 길게 누르면 높이 점프
  light: ['Mouse0'],            // 약공격
  heavy: ['Mouse2'],            // 강공격 (길게 누르면 차지)
  dash: ['ShiftLeft', 'ShiftRight'],
  parry: ['KeyF'],
  skill1: ['KeyQ'],
  skill2: ['KeyE'],
  swap: ['KeyR'],               // 무기 교체
  inventory: ['Tab'],
  pause: ['Escape'],
  restart: ['Enter', 'NumpadEnter'],   // 게임오버 / 일시정지에서 재시작
  debug: ['KeyH'],              // 히트박스 표시 (개발용)
  theme: ['KeyT'],              // 배경 테마 미리보기 (개발용: 노을 → 달밤 → 불타는 성)
  help: ['F1'],                 // 조작 도움말 표시/숨기기
};

const CONFIG = {
  // ---------- 화면 / 루프 ----------
  view: { width: 960, height: 540, zoom: 1.3 },   // zoom: 클수록 캐릭터가 크게 보임
  camera: {
    lookAhead: 50,             // 바라보는 쪽으로 미리 보여주는 거리
    followX: 0.1,              // 따라가는 속도 (0~1)
    followY: 0.08,
    playerScreenY: 0.68,       // 플레이어를 화면 위에서 몇 % 지점에 둘지
    groundMargin: 64,          // 바닥 아래로 보이는 두께
  },
  fps: 60,
  maxFrameSkip: 5,            // 렉 걸렸을 때 한 번에 따라잡는 최대 스텝 수

  debug: {
    showHitboxes: false,       // H 키로 토글
  },

  // ---------- 물리 ----------
  physics: {
    gravity: 0.55,
    maxFall: 13,
  },

  // ---------- 플레이어 ----------
  player: {
    width: 22,
    height: 48,
    maxHp: 100,

    runSpeed: 4.4,
    groundAccel: 1.0,
    groundDecel: 0.9,
    airAccel: 0.6,
    airDecel: 0.25,

    jumpVel: -10.8,
    doubleJumpVel: -9.6,
    jumpCutMult: 0.42,         // 점프 키를 일찍 떼면 상승 속도에 곱함 (짧은 점프)
    coyoteFrames: 6,           // 발판에서 떨어진 직후에도 점프 가능한 프레임
    jumpBufferFrames: 8,       // 착지 전 미리 누른 점프 입력 유지
    attackBufferFrames: 12,    // 공격 입력 버퍼
    dropThroughFrames: 12,     // 아래 + 점프 로 통과 발판 내려가기

    // 대시
    dashSpeed: 11.5,
    dashFrames: 11,
    dashIFrames: 10,           // 무적 프레임
    dashEndSpeedMult: 0.35,    // 대시 종료 후 남는 관성
    dashCooldown: 8,
    dashStamina: 22,
    airDashes: 1,              // 공중 대시 횟수

    // 스태미나
    maxStamina: 100,
    staminaRegen: 0.55,        // 프레임당 회복량
    staminaRegenDelay: 35,     // 소모 후 회복 시작까지 대기

    // 피격
    hurtFrames: 20,            // 피격 경직
    hurtInvuln: 50,            // 피격 후 무적
    hurtKnockX: 5,
    hurtKnockY: -4,

    chainDelay: 4,             // 판정 끝난 뒤 다음 타까지 최소 프레임 (콤보 리듬)
    comboGraceFrames: 14,      // 공격이 끝난 뒤에도 다음 타로 이어지는 유예 프레임
    critChance: 0.06,

    // 칼 / 검기 표시
    bladeLength: 40,           // 평소 칼 길이
    bladeRestAngle: 50,        // 평소 칼 각도 (앞쪽 아래)
    trailInner: 14,            // 검기 안쪽 반지름 (칼 손잡이 쪽)
    trailSubsteps: 6,          // 프레임 사이 검기 샘플 수 (부드러움)
    trailLife: 9,              // 검기 잔류 프레임
    trailLifeHeavy: 13,

    // 연출
    flipFrames: 20,            // 2단 점프 공중제비 시간
    scarfSegments: 8,          // 목도리 마디 수
    scarfSegLen: 5,            // 마디 길이
    scarfWind: 0.3,            // 뒤로 날리는 힘
    critMult: 1.6,
  },

  // ---------- 플레이어 기술 (검) ----------
  // startup: 선딜(예비동작) / active: 판정 / recovery: 후딜
  // chainDelay: 판정이 끝나고 몇 프레임 뒤부터 다음 타가 나가는지 (없으면 player.chainDelay)
  // 후딜(recovery) 동안은 대시/점프로 캔슬 가능
  // lunge: 판정 시작 시 앞으로 미끄러지는 속도
  // knock: 적에게 주는 넉백 {x, y}, hitstun: 적 경직, hitstop: 역경직(멈춤)
  // shake: 화면 흔들림 세기
  // swing: 칼 궤적 { from/to: 칼 각도(도, 0=앞 / -90=위 / 90=아래), r: 검기 바깥 반지름,
  //                  squash: 세로 납작함(1=원, 0.3=가로 회전베기), py: 어깨 높이 }
  //   → 칼이 from 에서 to 로 휘둘러지고 검기가 칼끝을 따라 그려진다
  // launch: 적을 띄움(공중 상태로), air: 공중 기술
  moves: {
    L1: {
      name: '내려베기', startup: 5, active: 3, recovery: 11,
      damage: 8, hitbox: { x: 2, y: -50, w: 54, h: 44 },
      knock: { x: 2.2, y: 0 }, hitstun: 20, hitstop: 4, shake: 2,
      lunge: 2.6, next: 'L2', sfx: 'swing',
      swing: { from: -115, to: 40, r: 56, squash: 1 },
    },
    L2: {
      name: '역올려베기', startup: 4, active: 3, recovery: 12,
      damage: 9, hitbox: { x: 2, y: -56, w: 58, h: 50 },
      knock: { x: 2.4, y: 0 }, hitstun: 20, hitstop: 4, shake: 2,
      lunge: 2.4, next: 'L3', sfx: 'swing',
      swing: { from: 60, to: -120, r: 58, squash: 1 },
    },
    L3: {
      name: '회전 가로베기', startup: 5, active: 5, recovery: 13,
      damage: 11, hitbox: { x: -40, y: -46, w: 108, h: 30 },
      knock: { x: 3, y: 0 }, hitstun: 24, hitstop: 5, shake: 3,
      lunge: 3, next: 'L4', sfx: 'swing',
      swing: { from: 180, to: -180, r: 62, squash: 0.28, py: -26 },
    },
    L4: {
      name: '대각 내려찍기', startup: 11, active: 5, recovery: 22,
      damage: 18, hitbox: { x: 0, y: -74, w: 80, h: 74 },
      knock: { x: 10, y: -4 }, hitstun: 34, hitstop: 9, shake: 7,
      lunge: 5.5, next: null, sfx: 'swingHeavy', heavy: true,
      swing: { from: -170, to: 75, r: 80, squash: 1 },
    },
    // 약공 2타 후 강공: 전진 찌르기
    THRUST: {
      name: '전진 찌르기', startup: 8, active: 6, recovery: 18,
      damage: 20, hitbox: { x: 4, y: -36, w: 92, h: 18 },
      knock: { x: 8, y: -1 }, hitstun: 30, hitstop: 7, shake: 5,
      lunge: 10, next: null, sfx: 'swingHeavy', heavy: true,
      swing: { from: 0, to: 0, r: 96, thrust: true },
    },
    // 강공격: 차지 단계별 (0 = 탭)
    HEAVY: [
      {
        name: '강베기', startup: 10, active: 5, recovery: 22,
        damage: 22, hitbox: { x: -6, y: -76, w: 78, h: 74 },
        knock: { x: 7, y: -2 }, hitstun: 32, hitstop: 8, shake: 6,
        lunge: 3, sfx: 'swingHeavy', heavy: true,
        swing: { from: -160, to: 70, r: 74, squash: 1 },
      },
      {
        name: '차지 베기 Lv1', startup: 6, active: 6, recovery: 22,
        damage: 36, hitbox: { x: -10, y: -90, w: 100, h: 88 },
        knock: { x: 10, y: -4 }, hitstop: 11, hitstun: 38, shake: 9,
        lunge: 4, sfx: 'swingHeavy', heavy: true,
        swing: { from: -170, to: 80, r: 92, squash: 1 },
      },
      {
        name: '차지 베기 Lv2', startup: 6, active: 7, recovery: 26,
        damage: 58, hitbox: { x: -14, y: -110, w: 128, h: 108 },
        knock: { x: 14, y: -6 }, hitstun: 46, hitstop: 15, shake: 14,
        lunge: 5, sfx: 'swingHeavy', heavy: true, impactFrame: true,
        swing: { from: -175, to: 85, r: 112, squash: 1 },
      },
    ],

    // ----- 2단계: 공중 콤보 -----
    // 아래 + 강공 (지상): 런처. 강공 버튼을 계속 누르고 있으면 플레이어도 같이 뜬다
    LAUNCHER: {
      name: '런처', startup: 8, active: 5, recovery: 20,
      damage: 10, hitbox: { x: -6, y: -96, w: 66, h: 96 },
      knock: { x: 0.8, y: -12.8 }, hitstun: 30, hitstop: 6, shake: 5,
      lunge: 1.5, sfx: 'launcher', launch: true,
      swing: { from: 100, to: -105, r: 78, squash: 1 },
    },
    // 공중 약공 3타
    A1: {
      name: '공중 베기 1', startup: 4, active: 3, recovery: 12, air: true,
      damage: 8, hitbox: { x: -2, y: -60, w: 60, h: 60 },
      knock: { x: 1.2, y: -4.2 }, hitstun: 30, hitstop: 4, shake: 2,
      lunge: 1.5, next: 'A2', sfx: 'swing',
      swing: { from: -110, to: 50, r: 58, squash: 1 },
    },
    A2: {
      name: '공중 베기 2', startup: 4, active: 3, recovery: 12, air: true,
      damage: 9, hitbox: { x: -2, y: -60, w: 62, h: 60 },
      knock: { x: 1.2, y: -4.4 }, hitstun: 30, hitstop: 4, shake: 2,
      lunge: 1.5, next: 'A3', sfx: 'swing',
      swing: { from: 70, to: -110, r: 60, squash: 1 },
    },
    A3: {
      name: '공중 회전베기', startup: 6, active: 6, recovery: 16, air: true,
      damage: 13, hitbox: { x: -34, y: -70, w: 96, h: 74 },
      knock: { x: 3.5, y: -3 }, hitstun: 34, hitstop: 7, shake: 5,
      lunge: 2, next: null, sfx: 'swingHeavy', heavy: true,
      swing: { from: -200, to: 160, r: 66, squash: 1 },
    },
    // 공중 강공 (아래 없이): 날려베기
    AIR_HEAVY: {
      name: '공중 날려베기', startup: 8, active: 5, recovery: 18, air: true,
      damage: 16, hitbox: { x: -4, y: -70, w: 76, h: 70 },
      knock: { x: 9, y: 2 }, hitstun: 30, hitstop: 8, shake: 6,
      lunge: 2, sfx: 'swingHeavy', heavy: true,
      swing: { from: -150, to: 70, r: 76, squash: 1 },
    },
    // 공중 아래 + 강공: 내려찍기 (낙하 중 판정, 맞은 적은 같이 바닥으로)
    SLAM: {
      name: '내려찍기', startup: 7, active: 999, recovery: 16,
      damage: 14, hitbox: { x: -22, y: -40, w: 70, h: 60 },
      knock: { x: 0, y: 0 }, hitstun: 40, hitstop: 5, shake: 4,
      lunge: 0, sfx: 'swingHeavy', heavy: true, slam: true,
      swing: { from: -80, to: 90, r: 70, squash: 1 },
    },
    // 내려찍기 착지 충격파
    SLAM_WAVE: {
      name: '충격파', damage: 12, radius: 110, height: 50,
      knock: { x: 4, y: -5 }, hitstun: 30, hitstop: 9, shake: 11,
    },
  },

  // ---------- 공중 전투 ----------
  air: {
    attackGravityMult: 0.35,   // 공중 공격 중 플레이어 중력 배율 (체공)
    hitHangVy: -1.6,           // 공중 공격이 맞으면 플레이어 세로속도를 이 값으로 (살짝 머무름)
    launcherFollowVy: -12.6,   // 런처 때 K 유지 시 플레이어 상승 속도
    launchedGravityMult: 0.85, // 띄워진 적 중력 배율
    defaultLift: 3.5,          // 지상기로 공중의 적을 때렸을 때 띄우는 양
    // 무한콤 방지: 같은 적의 공중 체류 시간이 길수록 띄우는 힘 감소
    juggleDecayFrames: 220,    // 이만큼 떠 있으면 최소 배율까지 감소
    juggleMinMult: 0.12,
    downFrames: 46,            // 바닥에 떨어진 뒤 누워 있는 시간
    getupFrames: 22,           // 기상 동작
    landBounceVy: -3.5,        // 떨어질 때 살짝 튕김
    slamHangFrames: 7,         // 내려찍기 직전 공중 정지
    slamFallSpeed: 17,         // 내려찍기 낙하 속도
    slamEnemySpeed: 19,        // 같이 꽂히는 적 낙하 속도
  },

  // 강공격 차지
  charge: {
    framesPerLevel: 28,        // 이만큼 누르고 있으면 다음 단계
    staminaPerLevel: 18,
    maxLevel: 2,
    moveSpeedMult: 0,          // 차지 중 이동 (0 = 제자리)
  },

  // ---------- 적 ----------
  enemies: {
    grunt: {
      name: '근접 잡몹',
      width: 26,
      height: 46,
      hp: 70,
      speed: 1.7,
      accel: 0.25,
      aggroRange: 520,
      attackRange: 56,         // 이 거리 안이면 공격 시작
      windup: 30,              // 공격 예고 (0.5초)
      active: 6,
      recovery: 32,
      cooldown: 55,            // 공격 후 다음 공격까지
      attackLunge: 3.5,
      damage: 12,
      hitbox: { x: 4, y: -40, w: 50, h: 32 },
      knock: { x: 6, y: -3.5 },
      weight: 1,               // 넉백 저항 (클수록 덜 밀림)
      friction: 0.82,
      color: '#0b0809',
    },
  },

  // ---------- 타격감 ----------
  feel: {
    killHitstop: 10,           // 처치 타격 추가 역경직
    hurtHitstop: 6,            // 플레이어 피격 역경직
    hurtShake: 8,
    flashFrames: 6,            // 흰색 번쩍
    shakeDecay: 0.86,
    maxShake: 18,
    damageNumberLife: 42,
    comboResetFrames: 100,     // 이 시간 동안 못 때리면 히트수 리셋
    clashHitstop: 9,           // 칼끼리 부딪힘 역경직
    clashKnock: 5,             // 부딪힘 밀려남
    clashStun: 26,             // 부딪힌 적 경직
  },

  // ---------- 연습/테스트 아레나 (1단계) ----------
  arena: {
    width: 1920,
    groundY: 460,
    waveDelay: 90,             // 적 전멸 후 다음 웨이브까지
    waveSizes: [2, 3, 4],
  },
};

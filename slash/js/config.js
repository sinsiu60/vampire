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
  // 적 소환 (개발용): 1 잡몹 / 2 방패병 / 3 비행형 / 4 중갑병 / 5 원거리형 / 6 돌진형
  spawn1: ['Digit1'], spawn2: ['Digit2'], spawn3: ['Digit3'],
  spawn4: ['Digit4'], spawn5: ['Digit5'], spawn6: ['Digit6'],
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

    // ----- 패링 반격 (퍼펙트 패링 후 counterWindow 안에) -----
    // 좌클릭: 적 반대편으로 순간이동하며 베기
    COUNTER: {
      name: '반격 일섬', startup: 2, active: 4, recovery: 16,
      damage: 24, posture: 26, hitbox: { x: -10, y: -60, w: 80, h: 60 },
      knock: { x: 4, y: -1 }, hitstun: 30, hitstop: 8, shake: 6,
      lunge: 2, sfx: 'swingHeavy', heavy: true,
      swing: { from: 170, to: -60, r: 76, squash: 0.45, py: -30 },
      teleport: 64,            // 적 중심에서 반대편으로 이 거리만큼
    },
    // 우클릭: 카운터 런처 (같이 떠올라 공중 콤보로)
    COUNTER_LAUNCH: {
      name: '반격 런처', startup: 3, active: 5, recovery: 16,
      damage: 14, posture: 18, hitbox: { x: -6, y: -100, w: 70, h: 100 },
      knock: { x: 0.8, y: -12.8 }, hitstun: 30, hitstop: 7, shake: 6,
      lunge: 2, sfx: 'launcher', launch: true, autoFollow: true,
      swing: { from: 100, to: -105, r: 82, squash: 1 },
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

  // ---------- 패링 / 가드 (세키로식 검극) ----------
  // F 탭: 누른 직후 perfectWindow 프레임 안에 노랑 공격이 닿으면 퍼펙트 패링 (데미지 0, 적 체간 크게 증가)
  // F 유지: 가드 (데미지 감소, 대신 내 체간 증가). 빨강 공격은 가드·패링 모두 불가
  parry: {
    perfectWindow: 6,          // 퍼펙트 패링 판정: 누른 프레임 포함 7프레임 ≈ 0.12초
    whiffRecovery: 18,         // 퍼펙트 패링 실패(F 를 떼었을 때) 후딜 (0.3초) — 난사 방지
    guardDamageMult: 0.3,      // 가드 시 받는 데미지 배율 (70% 감소)
    guardPostureMult: 1.8,     // 가드로 받은 공격 데미지 → 내 체간 증가 배율
    guardPostureFlat: 6,       // 가드로 받을 때 추가 체간
    guardPush: 3.5,            // 가드로 받을 때 밀려남
    perfectSelfPosture: 2,     // 퍼펙트 패링 시 내 체간 (아주 조금)
    hitstop: 9,                // 칼이 맞닿은 채 멈추는 시간 (0.15초)
    shake: 6,
    enemyPosture: 34,          // 퍼펙트 패링 시 적 체간 증가
    whitePostureMult: 3,       // 흰색 섬광(간파) 공격을 퍼펙트 패링하면 체간 배율
    deflectStagger: 34,        // 퍼펙트 패링 당한 적의 휘청 경직
    deflectPush: 3,            // 휘청일 때 밀려남
    counterWindow: 30,         // 퍼펙트 패링 후 반격 입력 시간 (0.5초)
    critReadyFrames: 300,      // 퍼펙트 패링 후 다음 공격 크리티컬 확정 유지 시간
    armorBreakFrames: 420,     // 중갑병 슈퍼아머 해제 시간
    invulnFrames: 10,          // 퍼펙트 패링 직후 무적
    slowmoMs: 0,               // 퍼펙트 패링 슬로모션 (0 = 없음, 히트스톱으로 대신함)
    slowmoScale: 0.25,         // 슬로모션 속도 배율 (체간 붕괴·처형 등에서 사용)
    // 연속 퍼펙트 패링 체인
    chain: {
      tier2: 3,                // 3회부터: 노란 불꽃 + 살짝 줌인
      tier3: 5,                // 5회부터: 주황 불꽃 폭발 + 배경 어두워짐 + 체간 증가 2배
      tier3PostureMult: 2,
      zoom2: 0.05,             // 줌인 세기 (화면 배율 +5%)
      zoom3: 0.09,
      zoomDecay: 0.92,
      dim3: 0.55,              // 배경 어두워지는 정도 (0~1)
      dimDecay: 0.985,
      sparks: [14, 22, 34],    // 단계별 불꽃 개수
      colors: ['#ffffff', '#ffd23a', '#ff8a1a'],
      displayFrames: 240,      // 화면에 체인 수가 남아 있는 시간
    },
  },

  // ---------- 체간 ----------
  posture: {
    hitMult: 0.45,             // 내 공격 데미지 → 적 체간 증가 배율 (기술에 posture 값이 있으면 그 값)
    blockMult: 0.8,            // 방패에 막힌 공격 → 방패병 체간 증가 배율
    enemyRegenDelay: 90,       // 체간이 오른 뒤 회복 시작까지
    enemyRegen: 0.3,           // 프레임당 회복량
    regenHpFactor: 0.6,        // 체력이 적을수록 체간 회복이 느려짐 (0 = 영향 없음)
    breakFrames: 120,          // 체간 붕괴: 무릎 꿇고 비틀거리는 시간 (2초)
    breakSlowmoMs: 220,        // 체간 붕괴 순간 슬로모션
    resetRatio: 0.35,          // 붕괴에서 회복하면 체간이 이 비율로
    executeRange: 120,         // 처형 가능 거리
    // 플레이어 체간
    player: {
      max: 100,
      regenDelay: 50,
      regen: 0.4,
      guardRegenMult: 1.6,     // 가드 중엔 더 빨리 회복
      breakFrames: 60,         // 가득 차면 1초 경직
      breakKnock: 3,
    },
  },

  // ---------- 처형 연출 ----------
  execution: {
    prepFrames: 26,            // 암전 + 붉은 일섬 표시
    stillFrames: 30,           // 일섬 후 정적 (0.5초)
    splitFrames: 50,           // 두 동강 → 파편
    outroFrames: 34,           // 배경 복귀
    dashOffset: 70,            // 일섬 후 적 반대편 거리
    splitSpeed: 2.2,           // 두 동강 난 몸이 벌어지는 속도
    shards: 46,
    shake: 14,
    hitstop: 0,
  },

  // ---------- 스타일 랭크 (DMC 방식) ----------
  style: {
    // 랭크: need = 이 점수 이상이면 해당 랭크. 마지막 랭크 게이지는 max 까지
    ranks: [
      { name: 'D', title: 'Dull', need: 0, color: '#9aa4ad' },
      { name: 'C', title: 'Cool', need: 80, color: '#6fd0ff' },
      { name: 'B', title: 'Bravo', need: 180, color: '#59ffb0' },
      { name: 'A', title: 'Absolute', need: 300, color: '#ffe14a' },
      { name: 'S', title: 'Stylish', need: 440, color: '#ffa53a' },
      { name: 'SS', title: 'Spectacular', need: 600, color: '#ff6a3a' },
      { name: 'SSS', title: 'Sensational', need: 780, color: '#ff3a6a' },
    ],
    max: 960,
    // 기술별 기본 점수 (맞힐 때)
    movePoints: {
      L1: 6, L2: 6, L3: 8, L4: 12, THRUST: 14,
      HEAVY0: 12, HEAVY1: 18, HEAVY2: 26,
      LAUNCHER: 14, A1: 8, A2: 8, A3: 14, AIR_HEAVY: 12, SLAM: 16, SLAM_WAVE: 10,
      COUNTER: 24, COUNTER_LAUNCH: 22, REFLECT: 22,
    },
    defaultPoints: 8,
    // 다양성: 최근 history 개의 기술 중 같은 기술이 있을수록 점수 감소
    history: 7,
    repeatMult: [1, 0.6, 0.35, 0.2, 0.1],   // 최근에 같은 기술을 0번/1번/2번… 쓴 경우의 배율
    freshBonus: 1.25,          // 최근에 안 쓴 기술이면 보너스
    armorMult: 0.5,            // 슈퍼아머에 맞은 공격
    // 보너스
    airMult: 1.35,             // 공중 콤보 (내가 공중이거나 적이 떠 있음)
    parry: 40,                 // 퍼펙트 패링
    parryChainBonus: 6,        // 체인 1회당 추가
    clash: 15,                 // 칼 부딪힘
    dodge: 10,                 // 대시 무적으로 공격 회피
    dodgeCounter: 32,          // 회피 직후 반격 보너스
    dodgeCounterFrames: 60,    // 회피 후 이 시간 안에 맞히면 반격 보너스
    kill: 18,
    postureBreak: 30,
    execution: 160,            // 처형: 대폭 상승
    executionMinRanks: 1,      // 처형 시 최소 이만큼 랭크 상승 보장
    // 하락
    decayDelay: 120,           // 마지막 득점 후 이 시간이 지나면 서서히 하락
    decayBase: 0.18,           // 프레임당 하락량
    decayPerRank: 0.1,         // 랭크가 높을수록 빨리 떨어짐
    hitDropRanks: 2,           // 피격 시 떨어지는 랭크 수
    guardLoss: 4,              // 가드로 받을 때 약간 하락
    rankUpAnim: 26,            // 랭크 오를 때 글자가 튀는 시간
    feedLife: 70,              // 보너스 문구 표시 시간
    // 방(웨이브) 클리어 보상: 최고 랭크별 (지금은 체력 회복, 8단계에서 아이템 보상 추가)
    clearHeal: [0, 5, 10, 16, 24, 34, 50],
    clearBannerFrames: 150,
  },

  // ---------- 적 ----------
  // 공통: hp, posture(체간 최대치), speed(이동), accel, aggroRange(인식 거리), weight(넉백 저항), friction
  // attacks: 공격 목록. AI 가 사거리 안의 공격 중 하나를 고른다
  //   kind: melee(근접) | rush(돌진) | dive(급강하) | shoot(투사체)
  //   parryable: true = 노랑 예고(패링·가드 가능) / false = 빨강 예고(패링·가드 불가, 피해야 함)
  //   telegraph: 'white' = 흰색 섬광 간파 공격 (보스 전용, 퍼펙트 패링 시 체간 대폭 증가)
  //   range: 이 거리 안이면 시작, windup: 예고 시간, active: 판정 시간, recovery: 후딜, cooldown: 다음 공격까지
  // look: 그래픽 (체형 / 무기)
  enemies: {
    grunt: {
      name: '근접 잡몹',
      width: 26, height: 46, hp: 70, posture: 100,
      speed: 1.7, accel: 0.25, aggroRange: 520, weight: 1, friction: 0.82,
      look: { body: 'grunt', weapon: 'blade' },
      attacks: [
        { id: 'slash', kind: 'melee', parryable: true, range: 56,
          windup: 30, active: 6, recovery: 32, cooldown: 55, lunge: 3.5,
          damage: 12, hitbox: { x: 4, y: -40, w: 50, h: 32 }, knock: { x: 6, y: -3.5 } },
      ],
    },
    // 방패병: 정면 공격을 막음 → 런처로 띄우거나 등 뒤로 넘어가서 공략
    shield: {
      name: '방패병',
      width: 28, height: 48, hp: 90, posture: 130,
      speed: 1.2, accel: 0.2, aggroRange: 480, weight: 1.6, friction: 0.8,
      shield: true,            // 정면 공격 막음 (런처·내려찍기·등 뒤 공격은 통함)
      turnDelay: 40,           // 등 뒤로 넘어간 플레이어를 돌아보기까지 걸리는 시간
      blockPush: 3.5,          // 막았을 때 플레이어가 밀려나는 힘
      look: { body: 'grunt', weapon: 'shield' },
      attacks: [
        { id: 'bash', kind: 'melee', parryable: true, range: 50,
          windup: 28, active: 6, recovery: 34, cooldown: 70, lunge: 4.5,
          damage: 10, hitbox: { x: 4, y: -46, w: 40, h: 44 }, knock: { x: 9, y: -2 } },
      ],
    },
    // 비행형: 공중에 떠 있음 → 점프해서 공중 콤보로
    flyer: {
      name: '비행형',
      width: 24, height: 36, hp: 50, posture: 80,
      speed: 2.4, accel: 0.18, aggroRange: 560, weight: 0.8, friction: 0.9,
      flying: true,
      hoverHeight: 150,        // 바닥에서 떠 있는 높이
      hoverSide: 120,          // 플레이어 옆으로 유지하는 거리
      look: { body: 'flyer', weapon: 'claws' },
      attacks: [
        { id: 'dive', kind: 'dive', parryable: false, range: 230,
          windup: 36, active: 40, recovery: 40, cooldown: 90, diveSpeed: 9,
          damage: 12, hitbox: { x: -14, y: -40, w: 28, h: 44 }, knock: { x: 6, y: -4 } },
      ],
    },
    // 중갑병: 슈퍼아머 (경직·넉백 없음). 노랑 공격을 패링하면 슈퍼아머 해제
    heavy: {
      name: '중갑병',
      width: 34, height: 58, hp: 260, posture: 220,
      speed: 0.9, accel: 0.12, aggroRange: 480, weight: 2.5, friction: 0.78,
      superArmor: true,
      look: { body: 'heavy', weapon: 'hammer' },
      attacks: [
        { id: 'smash', kind: 'melee', parryable: true, range: 72,
          windup: 40, active: 7, recovery: 40, cooldown: 70, lunge: 3,
          damage: 22, hitbox: { x: 0, y: -70, w: 80, h: 70 }, knock: { x: 9, y: -5 } },
        { id: 'sweep', kind: 'melee', parryable: false, range: 84,
          windup: 46, active: 9, recovery: 44, cooldown: 80, lunge: 2,
          damage: 26, hitbox: { x: -20, y: -34, w: 120, h: 34 }, knock: { x: 11, y: -6 } },
      ],
    },
    // 원거리형: 거리를 벌리고 투사체. 투사체를 베거나 패링하면 반사
    archer: {
      name: '원거리형',
      width: 22, height: 44, hp: 45, posture: 70,
      speed: 1.6, accel: 0.22, aggroRange: 620, weight: 0.9, friction: 0.82,
      keepMin: 200, keepMax: 360,   // 이 거리를 유지하려 함
      look: { body: 'slim', weapon: 'bow' },
      attacks: [
        { id: 'shot', kind: 'shoot', parryable: true, range: 460,
          windup: 40, active: 4, recovery: 30, cooldown: 80,
          damage: 11, projectile: { speed: 6.5, radius: 6, life: 150, reflectMult: 1.6, reflectDamage: 30 } },
      ],
    },
    // 돌진형: 직선 돌진, 벽에 박으면 기절
    charger: {
      name: '돌진형',
      width: 30, height: 46, hp: 110, posture: 140,
      speed: 1.3, accel: 0.2, aggroRange: 640, weight: 1.4, friction: 0.82,
      look: { body: 'grunt', weapon: 'horns' },
      // 돌진은 벽에 박거나 active 프레임이 끝날 때까지 계속된다
      attacks: [
        { id: 'rush', kind: 'rush', parryable: false, range: 420,
          windup: 45, active: 150, recovery: 36, cooldown: 100, rushSpeed: 10.5, wallStun: 150,
          damage: 18, hitbox: { x: -6, y: -44, w: 36, h: 42 }, knock: { x: 10, y: -5 } },
      ],
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
    // 웨이브별 등장 적 (마지막 웨이브 이후는 전체에서 무작위)
    waves: [
      ['grunt', 'grunt'],
      ['grunt', 'shield', 'archer'],
      ['flyer', 'flyer', 'grunt'],
      ['charger', 'grunt', 'archer'],
      ['heavy', 'grunt'],
      ['shield', 'heavy', 'flyer', 'archer'],
    ],
    randomWaveSize: 5,
  },
};

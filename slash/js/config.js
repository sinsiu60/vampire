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
  skill1: ['KeyQ'],             // 현재 무기의 Q 스킬
  skill2: ['KeyE'],             // 현재 무기의 E 스킬
  swap: ['KeyR'],               // 다음 무기로 교체 (검 → 대검 → 건틀릿 → 검)
  swapNext: ['WheelDown'],      // 마우스 휠 아래: 다음 무기
  swapPrev: ['WheelUp'],        // 마우스 휠 위: 이전 무기
  inventory: ['Tab'],
  pause: ['Escape'],
  restart: ['Enter', 'NumpadEnter'],   // 게임오버 / 일시정지에서 재시작
  debug: ['KeyH'],              // 히트박스 표시 (개발용)
  debugMode: ['Backquote'],     // ` 키: 패링 디버그 (패링 창 원, 적 공격 판정, 입력 타이밍 표시)
  mode: ['F2'],                 // 던전 ↔ 콤보 연습장 전환 (개발용, 9단계 타이틀 메뉴 전까지)
  theme: ['KeyT'],              // 배경 테마 미리보기 (개발용: 노을 → 달밤 → 불타는 성)
  // 적 소환 (개발용): 1 잡몹 / 2 방패병 / 3 비행형 / 4 중갑병 / 5 원거리형 / 6 돌진형
  spawn1: ['Digit1'], spawn2: ['Digit2'], spawn3: ['Digit3'],
  spawn4: ['Digit4'], spawn5: ['Digit5'], spawn6: ['Digit6'],
  spawn7: ['Digit7'],           // 보스 소환 (개발용)
  spawn8: ['Digit8'],           // 아이템 떨어뜨리기 (개발용)
  discard: ['KeyX'],            // 인벤토리: 아이템 버리기
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
    parry: false,              // ` 키로 토글: 패링 디버그
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

  // ---------- 무기 3종 (8단계) ----------
  // 세 무기를 모두 들고 다니며 R / 마우스 휠로 바꿔 쓴다 (순서: 검 → 대검 → 건틀릿).
  // 무기마다: 기술표(moves), 스킬 Q/E (쿨타임은 무기마다 따로), 전환기(swapIn: 공격·스킬·공중 콤보 도중 스왑하면 자동 발동),
  //          약점 상성(strongVs: 이 적들에게 weakness 배율)
  // 여기 없는 기술은 위의 moves(검)를 그대로 쓴다.
  // 스킬 kind: 'move' = 기술 하나 / 'stance' = 간파 자세 / 'meteor' = 유성 낙하. cooldown 은 프레임 (60 = 1초)
  // pose: 애니메이션 [예비 포즈, 휘두름 포즈, 특수] (anim.js POSES 이름) / pts: 스타일 점수
  // multiHit: { interval, count } 판정 동안 interval 프레임마다 다시 맞힘
  // quake: 판정 시작 때 앞으로 지면 충격파 발사 { damage, range, speed, height, stun }
  // armor: 이 기술(차지 포함) 중엔 맞아도 경직 없음 (데미지 armorMult 배)
  weapons: {
    sword: {
      name: '검', desc: '균형 · 패링 특화 · 4타 콤보 · 찌르기 · 차지 2단',
      blade: { length: 40, hand: 14, w0: 2.4, w1: 1.1, guard: true },
      trail: { glow: '#3ff', outer: '90,230,255', inner: '200,255,255' },
      charge: { framesPerLevel: 28, staminaPerLevel: 18, maxLevel: 2 },
      speedMult: 1,
      strongVs: ['archer'],      // 약점: 원거리형
      // 전환기: 칼을 뽑으며 원형 베기 (공중에서도 같은 기술)
      swapIn: {
        name: '전환 · 발검 원형베기', startup: 3, active: 6, recovery: 14,
        damage: 18, posture: 22, hitbox: { x: -72, y: -68, w: 144, h: 72 }, omni: true,
        knock: { x: 4, y: -2.5 }, hitstun: 32, hitstop: 7, shake: 5,
        lunge: 2, sfx: 'swingHeavy', heavy: true, pts: 20, swapAttack: true,
        swing: { from: 0, to: -360, r: 82, squash: 0.32, py: -30 }, pose: ['spinWind', 'spinStrike', 'spinX'],
      },
      skills: {
        q: {
          name: '간파 자세', kind: 'stance', cooldown: 360, desc: '2초간 자세 — 들어오는 공격을 자동 퍼펙트 패링',
          duration: 120,         // 자세 유지 (2초). 공격·대시·점프·스왑으로 바로 풀 수 있음
          parryRed: true,        // 빨강(패링 불가) 근접 공격도 받아냄 (바닥 폭발 같은 범위 공격은 제외)
        },
        e: {
          name: '발도 일섬', kind: 'move', cooldown: 600, desc: '앞으로 순간이동하며 경로상의 적을 관통해 벰',
          move: {
            name: '발도 일섬', startup: 8, active: 1, recovery: 22, noHit: true,
            damage: 0, hitbox: { x: 0, y: -40, w: 1, h: 1 }, knock: { x: 0, y: 0 }, hitstun: 0, hitstop: 0, shake: 0,
            lunge: 0, sfx: 'iai', pts: 0, skill: true,
            swing: { from: 160, to: 5, r: 92, squash: 0.4, py: -30 }, pose: ['thrustWind', 'thrustStrike'],
          },
          // 순간이동 거리(벽·낭떠러지 앞에서 멈춤) / 베기가 터지는 지연 / 경로 판정 높이
          iai: { distance: 250, delay: 12, height: 70, damage: 42, posture: 34, knock: { x: 3, y: -3 }, hitstun: 44, hitstop: 10, shake: 9 },
        },
      },
      moves: {},
    },
    greatsword: {
      name: '대검', desc: '느림 · 체간 파괴 · 3타 콤보 · 차지 3단 (차지 중 경직 없음)',
      // rest / runAng / airAng: 평소 칼 각도 (대검은 어깨에 걸침, 바닥에 박히지 않게)
      blade: { length: 64, hand: 14, w0: 4.6, w1: 3.2, guard: true, rest: -150, runAng: -165, airAng: -140 },
      trail: { glow: '#f83', outer: '255,140,60', inner: '255,225,180' },
      charge: { framesPerLevel: 24, staminaPerLevel: 16, maxLevel: 3, armor: true },
      armorMult: 0.6,            // 경직 없이 버틸 때 받는 데미지 배율
      speedMult: 0.9,            // 이동 속도 배율
      strongVs: ['shield', 'heavy'],   // 약점: 방패병, 중갑병
      // 전환기: 내려찍기 + 충격파 / 공중이면 낙하 쪼개기
      swapIn: {
        name: '전환 · 내려찍기', startup: 6, active: 6, recovery: 20,
        damage: 30, posture: 30, hitbox: { x: -10, y: -106, w: 122, h: 106 },
        knock: { x: 8, y: -4 }, hitstun: 40, hitstop: 11, shake: 10,
        lunge: 5, sfx: 'swingHeavy', heavy: true, impactFrame: true, pts: 22, swapAttack: true, armor: true,
        swing: { from: -175, to: 85, r: 114, squash: 1 }, pose: ['cutWind', 'cutStrike'],
        quake: { damage: 18, range: 220, speed: 9, height: 70, stun: 40, bossPosture: 15 },
      },
      swapInAir: {
        name: '전환 · 낙하 쪼개기', startup: 5, active: 6, recovery: 18, air: true,
        damage: 26, posture: 26, hitbox: { x: -6, y: -82, w: 98, h: 98 },
        knock: { x: 3, y: 10 }, hitstun: 36, hitstop: 10, shake: 8,
        lunge: 2, sfx: 'swingHeavy', heavy: true, pts: 22, swapAttack: true,
        swing: { from: -170, to: 90, r: 104, squash: 1 }, pose: ['airWind', 'airStrike'],
      },
      skills: {
        q: {
          name: '철벽', kind: 'move', cooldown: 480, desc: '3초 슈퍼아머 — 받은 데미지 일부를 주변에 반격',
          move: {
            name: '철벽', startup: 8, active: 3, recovery: 10,
            damage: 6, hitbox: { x: -44, y: -40, w: 88, h: 40 }, omni: true,
            knock: { x: 4, y: -2 }, hitstun: 20, hitstop: 5, shake: 6,
            lunge: 0, sfx: 'ironWall', heavy: true, pts: 10, skill: true,
            swing: { from: -100, to: 90, r: 84, squash: 1 }, pose: ['charge', 'cutStrike'],
            buff: 'ironWall',
          },
          // duration: 슈퍼아머 시간 / damageMult: 받는 데미지 배율 / reflectMult: 받은 데미지 → 주변 반격 배율
          ironWall: { duration: 180, damageMult: 0.5, reflectMult: 0.8, reflectMin: 10, radius: 120, posture: 12 },
        },
        e: {
          name: '대지 분쇄', kind: 'move', cooldown: 720, desc: '차지 내려찍기 — 체간 대폭 증가, 방패 파괴',
          move: {
            name: '대지 분쇄', startup: 34, active: 7, recovery: 28,
            damage: 48, posture: 95, hitbox: { x: -14, y: -122, w: 152, h: 122 },
            knock: { x: 9, y: -5 }, hitstun: 50, hitstop: 16, shake: 16,
            lunge: 5, sfx: 'swingHeavy', heavy: true, impactFrame: true, armor: true, pts: 26, skill: true,
            shieldBreak: 360,      // 방패를 이 시간 동안 못 씀 (방패도 무시하고 맞음)
            chargeFx: true,        // 선딜 동안 힘 모으는 불꽃
            swing: { from: -178, to: 88, r: 134, squash: 1 }, pose: ['charge', 'cutStrike'],
            quake: { damage: 16, range: 180, speed: 10, height: 70, stun: 30, bossPosture: 10 },
          },
        },
      },
      moves: {
        L1: {
          name: '대검 내려치기', startup: 11, active: 5, recovery: 18, chainDelay: 6,
          damage: 20, hitbox: { x: -4, y: -80, w: 94, h: 80 },
          knock: { x: 5, y: -1 }, hitstun: 30, hitstop: 8, shake: 5,
          lunge: 3, next: 'L2', sfx: 'swingHeavy', heavy: true, pts: 10,
          swing: { from: -150, to: 70, r: 90, squash: 1 }, pose: ['cutWind', 'cutStrike'],
        },
        L2: {
          name: '대검 올려베기', startup: 10, active: 5, recovery: 18, chainDelay: 6,
          damage: 22, hitbox: { x: -4, y: -92, w: 92, h: 92 },
          knock: { x: 4, y: -5 }, hitstun: 32, hitstop: 8, shake: 5,
          lunge: 2.5, next: 'L3', sfx: 'swingHeavy', heavy: true, pts: 10,
          swing: { from: 70, to: -140, r: 92, squash: 1 }, pose: ['riseWind', 'riseStrike'],
        },
        L3: {
          name: '대회전 베기', startup: 14, active: 8, recovery: 26,
          damage: 34, hitbox: { x: -72, y: -66, w: 176, h: 58 },
          knock: { x: 11, y: -5 }, hitstun: 40, hitstop: 12, shake: 9,
          lunge: 4, next: null, sfx: 'swingHeavy', heavy: true, pts: 16, armor: true,
          swing: { from: 180, to: -180, r: 104, squash: 0.3, py: -28 }, pose: ['spinWind', 'spinStrike', 'spinX'],
        },
        THRUST: {
          name: '파쇄 찌르기', startup: 12, active: 7, recovery: 22,
          damage: 38, posture: 40, hitbox: { x: 4, y: -46, w: 124, h: 30 },
          knock: { x: 12, y: -2 }, hitstun: 36, hitstop: 11, shake: 8,
          lunge: 11, next: null, sfx: 'swingHeavy', heavy: true, pts: 16,
          swing: { from: 0, to: 0, r: 128, thrust: true }, pose: ['thrustWind', 'thrustStrike'],
        },
        HEAVY: [
          {
            name: '대검 강베기', startup: 16, active: 6, recovery: 26,
            damage: 34, hitbox: { x: -8, y: -92, w: 104, h: 92 },
            knock: { x: 8, y: -3 }, hitstun: 36, hitstop: 10, shake: 7,
            lunge: 3, sfx: 'swingHeavy', heavy: true, pts: 14, armor: true,
            swing: { from: -165, to: 75, r: 98, squash: 1 },
          },
          {
            name: '대검 차지 Lv1', startup: 8, active: 6, recovery: 24,
            damage: 52, hitbox: { x: -10, y: -104, w: 120, h: 104 },
            knock: { x: 11, y: -4 }, hitstun: 40, hitstop: 12, shake: 10,
            lunge: 4, sfx: 'swingHeavy', heavy: true, pts: 20, armor: true,
            swing: { from: -170, to: 80, r: 110, squash: 1 },
          },
          {
            name: '대검 차지 Lv2', startup: 8, active: 7, recovery: 26,
            damage: 76, hitbox: { x: -14, y: -120, w: 140, h: 120 },
            knock: { x: 14, y: -6 }, hitstun: 46, hitstop: 15, shake: 13,
            lunge: 5, sfx: 'swingHeavy', heavy: true, pts: 28, armor: true, impactFrame: true,
            swing: { from: -175, to: 85, r: 124, squash: 1 },
          },
          {
            name: '대검 차지 Lv3 · 천붕', startup: 8, active: 8, recovery: 30,
            damage: 110, hitbox: { x: -20, y: -144, w: 176, h: 144 },
            knock: { x: 16, y: -8 }, hitstun: 54, hitstop: 18, shake: 18,
            lunge: 6, sfx: 'swingHeavy', heavy: true, pts: 38, armor: true, impactFrame: true,
            swing: { from: -178, to: 88, r: 142, squash: 1 },
            quake: { damage: 30, range: 300, speed: 9, height: 70, stun: 70, bossPosture: 30 },
          },
        ],
        LAUNCHER: {
          name: '대검 올려치기', startup: 12, active: 6, recovery: 24,
          damage: 18, hitbox: { x: -6, y: -106, w: 84, h: 106 },
          knock: { x: 1, y: -12.6 }, hitstun: 32, hitstop: 8, shake: 6,
          lunge: 1.5, sfx: 'launcher', launch: true, pts: 16,
          swing: { from: 100, to: -110, r: 96, squash: 1 }, pose: ['launchWind', 'launchStrike'],
        },
        A1: {
          name: '공중 내려치기', startup: 8, active: 5, recovery: 16, air: true,
          damage: 16, hitbox: { x: -4, y: -72, w: 86, h: 78 },
          knock: { x: 2, y: -3.8 }, hitstun: 32, hitstop: 7, shake: 4,
          lunge: 1.5, next: 'A2', sfx: 'swingHeavy', heavy: true, pts: 10,
          swing: { from: -120, to: 60, r: 86, squash: 1 }, pose: ['airWind', 'airStrike'],
        },
        A2: {
          name: '공중 대회전', startup: 10, active: 7, recovery: 20, air: true,
          damage: 22, hitbox: { x: -48, y: -80, w: 132, h: 88 },
          knock: { x: 5, y: -2.5 }, hitstun: 36, hitstop: 9, shake: 6,
          lunge: 2, next: null, sfx: 'swingHeavy', heavy: true, pts: 16,
          swing: { from: -200, to: 160, r: 92, squash: 1 }, pose: ['tuck', 'tuck', 'flip'],
        },
        AIR_HEAVY: {
          name: '투구 깨기', startup: 12, active: 6, recovery: 22, air: true,
          damage: 28, hitbox: { x: -4, y: -74, w: 90, h: 84 },
          knock: { x: 4, y: 9 }, hitstun: 34, hitstop: 11, shake: 8,
          lunge: 2, sfx: 'swingHeavy', heavy: true, pts: 14,
          swing: { from: -160, to: 80, r: 96, squash: 1 }, pose: ['airWind', 'airStrike'],
        },
        SLAM_WAVE: {
          name: '대검 충격파', damage: 20, radius: 150, height: 56,
          knock: { x: 5, y: -6 }, hitstun: 34, hitstop: 11, shake: 14,
        },
      },
    },
    gauntlet: {
      name: '건틀릿', desc: '빠름 · 공중 특화 · 6타 연타 · 공중 5타 (체공 길게)',
      blade: { length: 0, hand: 18, fist: true, rest: -20, runAng: 30 },   // 주먹을 들어 가드
      trail: { glow: '#b6f', outer: '180,120,255', inner: '235,215,255' },
      charge: { framesPerLevel: 22, staminaPerLevel: 16, maxLevel: 1 },
      speedMult: 1.08,
      airGravityMult: 0.22,      // 공중 공격 중 중력 (검은 air.attackGravityMult)
      airHangMult: 1.3,          // 공중 적중 시 머무는 힘 배율
      strongVs: ['flyer'],       // 약점: 비행형
      // 전환기: 돌진 펀치 / 공중이면 공중 연타
      swapIn: {
        name: '전환 · 돌진 펀치', startup: 3, active: 7, recovery: 14,
        damage: 16, posture: 18, hitbox: { x: 0, y: -52, w: 64, h: 34 },
        knock: { x: 9, y: -2 }, hitstun: 30, hitstop: 7, shake: 5,
        lunge: 13, sfx: 'punchHeavy', heavy: true, pts: 20, swapAttack: true,
        swing: { thrust: true, r: 66, from: 0, to: 0 }, pose: ['thrustWind', 'thrustStrike'],
      },
      swapInAir: {
        name: '전환 · 공중 연타', startup: 2, active: 15, recovery: 10, air: true,
        damage: 5, posture: 6, hitbox: { x: -4, y: -62, w: 62, h: 58 }, multiHit: { interval: 3, count: 5 },
        knock: { x: 0.6, y: -4.4 }, hitstun: 30, hitstop: 2, shake: 1,
        lunge: 1, sfx: 'punch', pts: 20, swapAttack: true,
        swing: { thrust: true, r: 56, from: 0, to: 0 }, pose: ['jabStrike', 'crossStrike', 'rapid'],
      },
      skills: {
        q: {
          name: '승룡권', kind: 'move', cooldown: 300, desc: '수직 어퍼컷 — 주변 적을 전부 띄움 (같이 떠오름)',
          move: {
            name: '승룡권', startup: 4, active: 7, recovery: 16,
            damage: 16, posture: 16, hitbox: { x: -92, y: -124, w: 184, h: 130 }, omni: true,
            knock: { x: 0.4, y: -13.6 }, hitstun: 36, hitstop: 8, shake: 7,
            lunge: 1, sfx: 'launcher', launch: true, autoFollow: true, pts: 20, skill: true,
            swing: { from: 80, to: -110, r: 60, squash: 1 }, pose: ['launchWind', 'launchStrike'],
          },
        },
        e: {
          name: '유성 낙하', kind: 'meteor', cooldown: 540, desc: '공중에서 급강하 연타 후 착지 폭발 (지상이면 뛰어올라서)',
          hopVy: -10,            // 지상에서 쓰면 먼저 뛰어오름
          hangFrames: 10,        // 급강하 직전 멈춤
          fallVx: 5.5, fallSpeed: 13,
          hitInterval: 4,        // 급강하 중 연타 간격
          move: {
            name: '유성 낙하', startup: 0, active: 999, recovery: 18,
            damage: 6, posture: 6, hitbox: { x: -26, y: -58, w: 78, h: 76 },
            knock: { x: 0, y: 0 }, hitstun: 40, hitstop: 2, shake: 2,
            lunge: 0, sfx: 'punch', slam: true, pts: 8, skill: true,
            swing: { thrust: true, r: 56, from: 0, to: 0 },
          },
          wave: { name: '유성 폭발', damage: 30, radius: 140, height: 70, knock: { x: 6, y: -7 }, hitstun: 40, hitstop: 12, shake: 14, posture: 20 },
        },
      },
      moves: {
        L1: {
          name: '잽', startup: 3, active: 2, recovery: 9, chainDelay: 2,
          damage: 5, hitbox: { x: 2, y: -46, w: 46, h: 24 },
          knock: { x: 1.2, y: 0 }, hitstun: 16, hitstop: 3, shake: 1,
          lunge: 2, next: 'L2', sfx: 'punch', pts: 4,
          swing: { thrust: true, r: 48, from: 0, to: 0 }, pose: ['jabWind', 'jabStrike'],
        },
        L2: {
          name: '스트레이트', startup: 3, active: 2, recovery: 9, chainDelay: 2,
          damage: 6, hitbox: { x: 2, y: -46, w: 50, h: 24 },
          knock: { x: 1.6, y: 0 }, hitstun: 18, hitstop: 3, shake: 1,
          lunge: 2.4, next: 'L3', sfx: 'punch', pts: 4,
          swing: { thrust: true, r: 52, from: 0, to: 0 }, pose: ['jabWind', 'crossStrike'],
        },
        L3: {
          name: '훅', startup: 4, active: 3, recovery: 10, chainDelay: 2,
          damage: 7, hitbox: { x: -4, y: -52, w: 54, h: 34 },
          knock: { x: 2, y: 0 }, hitstun: 20, hitstop: 4, shake: 2,
          lunge: 2.4, next: 'L4', sfx: 'punch', pts: 5,
          swing: { from: -70, to: 40, r: 46, squash: 0.5, py: -34 }, pose: ['hookWind', 'hookStrike'],
        },
        L4: {
          name: '어퍼컷', startup: 4, active: 3, recovery: 10, chainDelay: 2,
          damage: 7, hitbox: { x: -2, y: -66, w: 50, h: 56 },
          knock: { x: 1.4, y: -3 }, hitstun: 22, hitstop: 4, shake: 2,
          lunge: 2, next: 'L5', sfx: 'punch', pts: 5,
          swing: { from: 80, to: -100, r: 46, squash: 1 }, pose: ['riseWind', 'riseStrike'],
        },
        L5: {
          name: '연타 러시', startup: 4, active: 16, recovery: 12, chainDelay: 2,
          damage: 4, hitbox: { x: 2, y: -52, w: 56, h: 34 }, multiHit: { interval: 4, count: 4 },
          knock: { x: 0.8, y: 0 }, hitstun: 20, hitstop: 2, shake: 1,
          lunge: 1.2, next: 'L6', sfx: 'punch', pts: 8,
          swing: { thrust: true, r: 54, from: 0, to: 0 }, pose: ['jabStrike', 'crossStrike', 'rapid'],
        },
        L6: {
          name: '붕권', startup: 8, active: 4, recovery: 18,
          damage: 16, hitbox: { x: 2, y: -50, w: 66, h: 30 },
          knock: { x: 9, y: -3 }, hitstun: 30, hitstop: 8, shake: 6,
          lunge: 5, next: null, sfx: 'punchHeavy', heavy: true, pts: 12,
          swing: { thrust: true, r: 68, from: 0, to: 0 }, pose: ['thrustWind', 'thrustStrike'],
        },
        THRUST: {
          name: '돌진 정권', startup: 6, active: 8, recovery: 16,
          damage: 16, hitbox: { x: 0, y: -48, w: 64, h: 28 },
          knock: { x: 9, y: -2 }, hitstun: 30, hitstop: 7, shake: 5,
          lunge: 13, next: null, sfx: 'punchHeavy', heavy: true, pts: 12,
          swing: { thrust: true, r: 64, from: 0, to: 0 }, pose: ['thrustWind', 'thrustStrike'],
        },
        HEAVY: [
          {
            name: '강펀치', startup: 9, active: 4, recovery: 18,
            damage: 15, hitbox: { x: 2, y: -50, w: 62, h: 30 },
            knock: { x: 8, y: -2 }, hitstun: 30, hitstop: 7, shake: 5,
            lunge: 4, sfx: 'punchHeavy', heavy: true, pts: 10,
            swing: { thrust: true, r: 62, from: 0, to: 0 }, pose: ['thrustWind', 'thrustStrike'],
          },
          {
            name: '폭쇄권', startup: 5, active: 5, recovery: 20,
            damage: 30, hitbox: { x: 0, y: -60, w: 80, h: 44 },
            knock: { x: 13, y: -5 }, hitstun: 38, hitstop: 12, shake: 10,
            lunge: 6, sfx: 'punchHeavy', heavy: true, pts: 18, impactFrame: true,
            swing: { thrust: true, r: 80, from: 0, to: 0 }, pose: ['thrustWind', 'thrustStrike'],
          },
        ],
        LAUNCHER: {
          name: '승천권', startup: 5, active: 5, recovery: 16,
          damage: 10, hitbox: { x: -6, y: -100, w: 58, h: 100 },
          knock: { x: 0.6, y: -13.4 }, hitstun: 32, hitstop: 6, shake: 5,
          lunge: 1.5, sfx: 'launcher', launch: true, pts: 14,
          swing: { from: 80, to: -100, r: 52, squash: 1 }, pose: ['launchWind', 'launchStrike'],
        },
        A1: {
          name: '공중 잽', startup: 3, active: 2, recovery: 9, chainDelay: 2, air: true,
          damage: 5, hitbox: { x: 0, y: -54, w: 50, h: 40 },
          knock: { x: 0.8, y: -4.6 }, hitstun: 30, hitstop: 3, shake: 1,
          lunge: 1, next: 'A2', sfx: 'punch', pts: 5,
          swing: { thrust: true, r: 48, from: 0, to: 0 }, pose: ['airWind', 'jabStrike'],
        },
        A2: {
          name: '공중 스트레이트', startup: 3, active: 2, recovery: 9, chainDelay: 2, air: true,
          damage: 5, hitbox: { x: 0, y: -54, w: 52, h: 40 },
          knock: { x: 0.8, y: -4.6 }, hitstun: 30, hitstop: 3, shake: 1,
          lunge: 1, next: 'A3', sfx: 'punch', pts: 5,
          swing: { thrust: true, r: 52, from: 0, to: 0 }, pose: ['airWind', 'crossStrike'],
        },
        A3: {
          name: '공중 훅', startup: 4, active: 3, recovery: 10, chainDelay: 2, air: true,
          damage: 6, hitbox: { x: -6, y: -60, w: 58, h: 46 },
          knock: { x: 1, y: -4.8 }, hitstun: 30, hitstop: 4, shake: 2,
          lunge: 1, next: 'A4', sfx: 'punch', pts: 6,
          swing: { from: -70, to: 40, r: 46, squash: 0.5, py: -34 }, pose: ['hookWind', 'hookStrike'],
        },
        A4: {
          name: '공중 니킥', startup: 4, active: 3, recovery: 10, chainDelay: 2, air: true,
          damage: 7, hitbox: { x: -4, y: -50, w: 50, h: 46 },
          knock: { x: 1, y: -5 }, hitstun: 30, hitstop: 4, shake: 2,
          lunge: 1.4, next: 'A5', sfx: 'punch', pts: 6,
          swing: { from: 90, to: -60, r: 44, squash: 1 }, pose: ['airRiseWind', 'knee'],
        },
        A5: {
          name: '공중 회축', startup: 5, active: 6, recovery: 14, air: true,
          damage: 12, hitbox: { x: -34, y: -70, w: 90, h: 78 },
          knock: { x: 4, y: -3 }, hitstun: 34, hitstop: 7, shake: 5,
          lunge: 2, next: null, sfx: 'punchHeavy', heavy: true, pts: 12,
          swing: { from: -200, to: 160, r: 56, squash: 1 }, pose: ['tuck', 'tuck', 'flip'],
        },
        AIR_HEAVY: {
          name: '유성 낙하권', startup: 7, active: 5, recovery: 16, air: true,
          damage: 14, hitbox: { x: -4, y: -56, w: 64, h: 70 },
          knock: { x: 2, y: 10 }, hitstun: 32, hitstop: 8, shake: 6,
          lunge: 2, sfx: 'punchHeavy', heavy: true, pts: 12,
          swing: { from: -40, to: 100, r: 56, squash: 1 }, pose: ['airWind', 'airStrike'],
        },
      },
    },
  },

  // ---------- 무기 교체 / 공명 ----------
  swap: {
    cooldown: 24,              // 스왑 자체 쿨타임 (0.4초)
    sheatheMult: 2,            // 칼집 회복: 장착하지 않은 무기의 스킬 쿨타임은 이 배속으로 감소
    // 공명: 스왑 직후 duration 동안. 공명 중 다시 스왑하면 단계 상승 (최대 maxLevel)
    resonance: {
      duration: 180,           // 3초
      maxLevel: 3,
      atk: [25, 40, 60],       // 단계별 공격력 +%
      cdCut: [30, 40, 50],     // 단계별 '다음 스킬' 쿨타임 감소 % (스킬 한 번 쓰면 소모)
      glow: [0.45, 0.75, 1],   // 단계별 무기 청록 글로우 밝기
      requireHit: true,        // true: 지난 스왑 이후 적을 한 번 이상 맞혀야 단계 상승 (R 연타만으로는 안 오름)
    },
  },

  // ---------- 적 상성 ----------
  // 약점 무기(weapons.*.strongVs, 보스는 bosses.*.weakness)로 공격하면
  weakness: {
    damageMult: 1.5,           // 데미지 +50%
    postureMult: 1.5,          // 체간 +50%
    hitstopAdd: 3,             // 타격 멈춤 추가 (타격감 강화)
    pierceShield: true,        // 약점 무기는 방패로 막을 수 없음 (방패병 → 대검)
  },

  // ---------- 장비 / 루팅 ----------
  loot: {
    // 등급: opts = 랜덤 옵션 수, power = 무기 공격력 배율, optMult = 옵션 수치 배율
    rarities: [
      { name: '일반', color: '#e8e8e8', opts: 1, power: 1.0, optMult: 1 },
      { name: '희귀', color: '#4aa8ff', opts: 2, power: 1.1, optMult: 1.2 },
      { name: '영웅', color: '#b45cff', opts: 3, power: 1.22, optMult: 1.45 },
      { name: '전설', color: '#ff9a2a', opts: 4, power: 1.38, optMult: 1.75 },
    ],
    // 랜덤 옵션 (일반 등급 기준 굴림 범위 × optMult)
    options: {
      atk: { name: '공격력', min: 4, max: 9, unit: '%' },
      aspd: { name: '공격 속도', min: 3, max: 7, unit: '%' },
      crit: { name: '치명타 확률', min: 2, max: 5, unit: '%' },
      lifesteal: { name: '흡혈', min: 1, max: 2.5, unit: '%', dec: 1 },
      cdr: { name: '스킬 쿨타임 감소', min: 4, max: 9, unit: '%' },
      stamina: { name: '최대 스태미나', min: 8, max: 18, unit: '' },
      maxHp: { name: '최대 체력', min: 6, max: 14, unit: '' },
      posture: { name: '체간 피해', min: 5, max: 12, unit: '%' },
    },
    limits: { aspd: 40, crit: 60, lifesteal: 15, cdr: 50 },   // 합계 상한
    // 장비 기본 능력치 (등급별)
    armorBase: [{ maxHp: 10, reduce: 3 }, { maxHp: 16, reduce: 5 }, { maxHp: 24, reduce: 8 }, { maxHp: 34, reduce: 12 }],
    ringBase: [{ crit: 2 }, { crit: 3 }, { crit: 4 }, { crit: 6 }],
    // 전설 고유 효과
    uniques: {
      thunder: { name: '뇌신', desc: '3번째 타격마다 번개가 내리꽂힘', every: 3, damage: 16, stun: 24 },
      parryBlast: { name: '폭염', desc: '퍼펙트 패링 성공 시 주변 폭발', damage: 30, radius: 130, posture: 20 },
      bloodthirst: { name: '피의 갈망', desc: '적 처치 시 체력 6 회복', heal: 6 },
      phantom: { name: '그림자', desc: '대시로 통과한 적에게 피해', damage: 14 },
      frenzy: { name: '광란', desc: 'S 랭크 이상일 때 공격력 +25%', atk: 25, minRank: 4 },
    },
    slotWeights: { weapon: 4, armor: 3, ring: 3 },
    weaponTypes: ['sword', 'greatsword', 'gauntlet'],
    nouns: { sword: '검', greatsword: '대검', gauntlet: '건틀릿', armor: '갑옷', ring: '반지' },
    // 일반 / 희귀 / 영웅 이름 (전설은 '<고유효과>의 <종류>')
    names: {
      sword: ['녹슨 검', '강철 검', '명장의 검'],
      greatsword: ['무딘 대검', '강철 대검', '용살의 대검'],
      gauntlet: ['가죽 건틀릿', '강철 건틀릿', '수라의 건틀릿'],
      armor: ['가죽 갑옷', '사슬 갑옷', '흑철 갑옷'],
      ring: ['구리 반지', '은 반지', '흑요석 반지'],
    },
    // 등급 확률 가중치 (층별) [일반, 희귀, 영웅, 전설]
    rarityWeights: [[70, 25, 5, 0.6], [55, 32, 11, 2.2], [42, 36, 18, 4.5]],
    chestLuck: 0.35,           // 상자: 방 최고 랭크 1당 높은 등급 가중치 +35%
    enemyDropChance: [0.1, 0.12, 0.14],   // 층별 일반 적 드랍 확률
    bossDrops: 2,              // 보스 드랍 수 (영웅 이상 확정)
    bossMinRarity: 2,
    chestHealMult: 0.5,        // 상자 체력 회복 (스타일 clearHeal × 이 배율)
    pickupDelay: 30,           // 떨어진 뒤 주울 수 있을 때까지
    pickupRange: 26,
    bagSize: 12,
  },

  // ---------- 패링 / 가드 (세키로식 검극) ----------
  // 판정은 모두 "게임 시간(ms)" 기준: 히트스톱 중엔 멈추고, 슬로모션 중엔 같이 느려짐
  // 키 입력은 keydown 이벤트 시각(타임스탬프)으로 기록해서 프레임 단위 오차 없이 비교
  //  · F 를 누른 순간부터 windowMs 동안 패링 활성 → 이 동안 노랑/흰색 공격이 닿으면 퍼펙트 패링
  //    (데미지 0, 적 체간 크게 증가)
  //  · 늦은 입력 보정: 노랑/흰색 공격에 맞은 뒤 lateGraceMs 안에 F 를 누르면 퍼펙트 패링으로 처리
  //    (그래서 패링 가능한 공격의 데미지·경직은 lateGraceMs 만큼 보류했다가 확정)
  //  · 창이 끝난 뒤에도 F 를 누르고 있으면 가드 (데미지 감소, 대신 내 체간 증가)
  //  · 창 안에 공격이 안 오면 lockoutMs 동안 다시 패링 불가 (난사 방지)
  //  · 빨강 공격은 가드·패링 모두 불가
  parry: {
    windowMs: 180,             // PARRY_WINDOW: 패링 활성 시간 (0.18초)
    lateGraceMs: 70,           // LATE_PARRY_GRACE: 맞은 뒤 늦게 눌러도 인정하는 시간 (0.07초)
    lockoutMs: 250,            // 퍼펙트 실패 후 다시 패링 불가 시간 (0.25초)
    debugReportMs: 1000,       // 디버그: 이 시간 안의 입력/타격을 "몇 초 일찍/늦게" 로 비교
    guardDamageMult: 0.3,      // 가드 시 받는 데미지 배율 (70% 감소)
    guardPostureMult: 1.8,     // 가드로 받은 공격 데미지 → 내 체간 증가 배율
    guardPostureFlat: 6,       // 가드로 받을 때 추가 체간
    guardPush: 3.5,            // 가드로 받을 때 밀려남
    perfectSelfPosture: 2,     // 퍼펙트 패링 시 내 체간 (아주 조금)
    hitstop: 9,                // 칼이 맞닿은 채 멈추는 시간 (0.15초)
    shake: 6,
    enemyPosture: 50,          // 퍼펙트 패링 시 적 체간 증가 (잡몹 2번이면 붕괴)
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
    hitMult: 0.6,              // 내 공격 데미지 → 적 체간 증가 배율 (기술에 posture 값이 있으면 그 값)
    deflectedHitMult: 1.6,     // 패링으로 휘청이는 적을 때리면 체간 배율 (빈틈 공략)
    blockMult: 0.8,            // 방패에 막힌 공격 → 방패병 체간 증가 배율
    enemyRegenDelay: 200,      // 체간이 오른 뒤 회복 시작까지 (휘청·경직 중엔 회복 안 함)
    enemyRegen: 0.12,          // 프레임당 회복량
    regenHpFactor: 0.6,        // 체력이 적을수록 체간 회복이 느려짐 (0 = 영향 없음)
    breakFrames: 120,          // 체간 붕괴: 무릎 꿇고 비틀거리는 시간 (2초)
    breakSlowmoMs: 220,        // 체간 붕괴 순간 슬로모션
    resetRatio: 0.35,          // 붕괴에서 회복하면 체간이 이 비율로
    executeRange: 150,         // 처형 가능 거리
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
    swapAttack: 20,            // 스왑 어택(전환기) 적중 보너스
    resonanceMax: 70,          // 공명 3단계 도달
    trinity: 100,              // 한 콤보(히트 수가 끊기기 전)에 무기 3개를 모두 맞힘
    skill: 6,                  // 스킬 적중 추가
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
    // 방(웨이브) 클리어 보상: 최고 랭크별 체력 회복 (던전에선 상자에서 아이템 + 이 값의 절반 회복)
    clearHeal: [0, 5, 10, 16, 24, 34, 50],
    clearBannerFrames: 150,
  },

  // ---------- 적 ----------
  // 공통: hp, posture(체간 최대치), speed(이동), accel, aggroRange(인식 거리), weight(넉백 저항), friction
  // attacks: 공격 목록. AI 가 사거리 안의 공격 중 하나를 고른다
  //   kind: melee(근접) | rush(돌진) | dive(급강하) | shoot(투사체)
  //   parryable: true = 노랑 예고(패링·가드 가능) / false = 빨강 예고(패링·가드 불가, 피해야 함)
  //   telegraph: 'white' = 흰색 섬광 간파 공격 (보스 전용, 퍼펙트 패링 시 체간 대폭 증가)
  //   range: 이 거리 안이면 시작
  //   telegraphMs: 예고 시작 → 실제 타격까지 시간 (공격마다 고정, ms). 예고 프레임(windup)은 여기서 자동 계산
  //   active: 판정 프레임, recovery: 후딜, cooldown: 다음 공격까지
  //   weight: 고를 확률 가중치 (기본 1). 빨강 공격은 두 번 연속으로 쓰지 않음 (노랑이 있으면)
  // look: 그래픽 (체형 / 무기)
  // 적 공격 공통 연출 타이밍
  enemyTiming: {
    whooshLeadMs: 110,         // 타격 이만큼 전에 "슉" 바람 가르는 소리
    swingLeadMs: 90,           // 타격 이만큼 전부터 무기를 휘두르기 시작 (칼이 닿는 모습 = 실제 타격 시점)
  },

  enemies: {
    grunt: {
      name: '근접 잡몹',
      width: 26, height: 46, hp: 70, posture: 100,
      speed: 1.7, accel: 0.25, aggroRange: 520, weight: 1, friction: 0.82,
      look: { body: 'grunt', weapon: 'blade' },
      attacks: [
        { id: 'slash', kind: 'melee', parryable: true, range: 56,
          telegraphMs: 500, active: 6, recovery: 32, cooldown: 55, lunge: 3.5,
          damage: 12, hitbox: { x: 4, y: -40, w: 50, h: 32 }, knock: { x: 6, y: -3.5 } },
      ],
    },
    // 방패병: 정면 공격을 막음 → 런처로 띄우거나 등 뒤로 넘어가서 공략
    shield: {
      name: '방패병',
      width: 28, height: 48, hp: 90, posture: 110,
      speed: 1.2, accel: 0.2, aggroRange: 480, weight: 1.6, friction: 0.8,
      shield: true,            // 정면 공격 막음 (런처·내려찍기·등 뒤 공격은 통함)
      turnDelay: 40,           // 등 뒤로 넘어간 플레이어를 돌아보기까지 걸리는 시간
      blockPush: 3.5,          // 막았을 때 플레이어가 밀려나는 힘
      look: { body: 'grunt', weapon: 'shield' },
      attacks: [
        { id: 'bash', kind: 'melee', parryable: true, range: 50,
          telegraphMs: 480, active: 6, recovery: 34, cooldown: 70, lunge: 4.5,
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
          telegraphMs: 600, active: 40, recovery: 40, cooldown: 90, diveSpeed: 9,
          damage: 12, hitbox: { x: -14, y: -40, w: 28, h: 44 }, knock: { x: 6, y: -4 } },
      ],
    },
    // 중갑병: 슈퍼아머 (경직·넉백 없음). 노랑 공격을 패링하면 슈퍼아머 해제
    heavy: {
      name: '중갑병',
      width: 34, height: 58, hp: 260, posture: 150,
      speed: 0.9, accel: 0.12, aggroRange: 480, weight: 2.5, friction: 0.78,
      superArmor: true,
      look: { body: 'heavy', weapon: 'hammer' },
      attacks: [
        // 노랑 내려찍기가 주력 (weight 3), 빨강 휩쓸기는 가끔 + 연속으로는 안 씀
        { id: 'smash', kind: 'melee', parryable: true, range: 84, weight: 3,
          telegraphMs: 680, active: 7, recovery: 40, cooldown: 70, lunge: 3,
          damage: 22, hitbox: { x: 0, y: -70, w: 80, h: 70 }, knock: { x: 9, y: -5 } },
        { id: 'sweep', kind: 'melee', parryable: false, range: 84, weight: 1,
          telegraphMs: 850, active: 9, recovery: 44, cooldown: 80, lunge: 2,
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
          telegraphMs: 680, active: 4, recovery: 30, cooldown: 80,
          damage: 11, projectile: { speed: 6.5, radius: 6, life: 150, reflectMult: 1.6, reflectDamage: 30 } },
      ],
    },
    // 돌진형: 직선 돌진, 벽에 박으면 기절
    charger: {
      name: '돌진형',
      width: 30, height: 46, hp: 110, posture: 120,
      speed: 1.3, accel: 0.2, aggroRange: 640, weight: 1.4, friction: 0.82,
      look: { body: 'grunt', weapon: 'horns' },
      // 돌진은 벽에 박거나 active 프레임이 끝날 때까지 계속된다
      attacks: [
        { id: 'rush', kind: 'rush', parryable: false, range: 420,
          telegraphMs: 760, active: 150, recovery: 36, cooldown: 100, rushSpeed: 10.5, wallStun: 150,
          wallPosture: 0.6,       // 벽에 박으면 체간 최대치의 이 비율만큼 증가
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

  // ---------- 던전 ----------
  dungeon: {
    floors: 3,
    roomsMin: 5,               // 한 층의 방 수 (시작방 + 전투방 + 보스방)
    roomsMax: 6,
    baseY: 460,                // 기본 바닥 높이
    startWidth: 900,
    roomWidthMin: 1300,
    roomWidthMax: 2000,
    bossWidth: 1500,
    landing: 220,              // 문 앞 평지 폭
    ledgeH: 150,               // 높은 문(언덕 위) 높이
    highDoorChance: 0.35,      // 문이 높은 곳에 있을 확률
    segMin: 160, segMax: 340,  // 지형 구간 폭
    heights: [0, 0, 0, 50, 90],// 지형 높이 후보
    maxStep: 90,               // 이보다 높이 차가 크면 디딤 발판 자동 배치
    pitChance: 0.32,
    pitMin: 110, pitMax: 160,  // 낭떠러지 폭 (2단 점프로 넘을 수 있게)
    platformChance: 0.55,      // 평지 위 통과 발판
    doorHeight: 96,
    killDepth: 220,            // 바닥 아래로 이만큼 떨어지면 낙사 판정
    fallDamage: 12,            // 낭떠러지에 떨어지면 데미지 + 직전 발판으로 복귀
    fallInvuln: 60,
    spawnDelay: 40,            // 문이 잠기고 적이 나타나기까지
    waveDelay: 50,             // 웨이브 사이
    fadeFrames: 14,            // 방 이동 페이드
    // 층별 등장 적 (가중치)
    pools: [
      { grunt: 4, shield: 2, archer: 2, flyer: 1 },
      { grunt: 3, shield: 2, archer: 2, flyer: 2, charger: 2, heavy: 1 },
      { grunt: 2, shield: 2, archer: 2, flyer: 2, charger: 2, heavy: 2 },
    ],
    roomEnemies: [3, 4, 5],    // 층별 웨이브당 적 수 (방이 넓으면 +1)
    twoWaveWidth: 1700,        // 이보다 넓은 방은 웨이브 2번
    // 층별 보스 (bosses 의 이름)
    bossByFloor: ['dusk', 'moon', 'flame'],
  },

  // ---------- 보스 ----------
  // 패턴 기본값. 보스마다 patterns 에서 일부만 덮어씀
  //  telegraphMs: 예고 시작 → 타격까지 (페이즈 2 에선 phase2Speed 배 빨라짐)
  //  parryable: true = 노랑(패링·가드 가능) / false = 빨강(회피) / telegraph: 'white' = 간파(퍼펙트 패링 시 체간 대폭)
  bossPatterns: {
    // 돌진베기: 웅크렸다가 순식간에 붙어서 벰 (노랑)
    dashSlash: { weight: 3, telegraphMs: 640, dashFrames: 10, maxDist: 380, active: 5, recovery: 42,
      damage: 20, hitbox: { x: -10, y: -84, w: 104, h: 84 }, knock: { x: 9, y: -4 }, parryable: true },
    // 점프 내려찍기: 플레이어 위치로 뛰어올라 내려찍고 충격파 (빨강, 점프로 피하기)
    jumpSlam: { weight: 2, windFrames: 30, airFrames: 42, peak: 220, radius: 120, recovery: 46,
      damage: 24, knock: { x: 10, y: -7 }, parryable: false, minDist: 110 },
    // 검기 3연발: 낮게(점프) / 높게(가만히) / 가운데 (노랑, 패링하면 반사)
    swordWaves: { weight: 2, count: 3, telegraphMs: 430, gapFrames: 12, speed: 7.5, heights: [-16, -66, -36],
      damage: 14, recovery: 36, parryable: true, reflectDamage: 45, minDist: 160 },
    // 광역 경고 후 폭발: 바닥에 붉은 원 → 잠시 뒤 폭발 (빨강)
    areaBlast: { weight: 2, zones: 4, spread: 170, radius: 74, warnFrames: 68, recovery: 50,
      damage: 26, knock: { x: 8, y: -8 }, parryable: false },
    // ----- 페이즈 2 추가 패턴 (보스마다 하나) -----
    // 난무: 노랑 → 노랑 → 흰색 섬광 찌르기 (리듬 패링)
    flurry: { weight: 3, phase2: true, hits: [
      { telegraphMs: 400, telegraph: 'yellow' },
      { telegraphMs: 320, telegraph: 'yellow' },
      { telegraphMs: 560, telegraph: 'white', thrust: true },
    ], lunge: 5, damage: 16, hitbox: { x: -6, y: -80, w: 96, h: 80 }, thrustBox: { x: 0, y: -60, w: 150, h: 26 },
      knock: { x: 8, y: -3 }, recovery: 46, maxDist: 260 },
    // 연속 내려찍기 3회 (빨강)
    triSlam: { weight: 3, phase2: true, count: 3, windFrames: 16, airFrames: 34, peak: 170, radius: 110, recovery: 54,
      damage: 20, knock: { x: 9, y: -6 }, parryable: false },
    // 화염 기둥: 보스에서 플레이어 쪽으로 연달아 폭발이 번져감 (빨강)
    pillars: { weight: 3, phase2: true, count: 8, step: 110, interval: 12, warnFrames: 42, radius: 58, recovery: 54,
      damage: 22, knock: { x: 7, y: -8 }, parryable: false },
  },

  bosses: {
    dusk: {
      name: '황혼의 검귀', title: '1층 · 노을',
      width: 40, height: 72, hp: 900, posture: 240,
      weight: 4, friction: 0.8, walkSpeed: 1.6, spacing: [110, 250],
      idleMin: 36, idleMax: 70,              // 패턴 사이 대기
      look: { body: 'boss', weapon: 'greatsword' }, aura: '#ff7a3a',
      weakness: ['gauntlet', 'sword'],       // 페이즈별 약점 무기 [1페이즈, 2페이즈]
      patterns: { dashSlash: {}, jumpSlam: {}, swordWaves: {}, areaBlast: {}, flurry: {} },
    },
    moon: {
      name: '월야의 창기사', title: '2층 · 달밤',
      width: 38, height: 74, hp: 1100, posture: 270,
      weight: 4, friction: 0.8, walkSpeed: 1.9, spacing: [130, 280],
      idleMin: 30, idleMax: 60,
      look: { body: 'boss', weapon: 'lance' }, aura: '#8fb4ff',
      weakness: ['greatsword', 'gauntlet'],
      patterns: { dashSlash: { telegraphMs: 600, maxDist: 460, hitbox: { x: -10, y: -70, w: 140, h: 40 } },
        jumpSlam: { weight: 3 }, swordWaves: { speed: 9 }, areaBlast: {}, triSlam: {} },
    },
    flame: {
      name: '불꽃 성주', title: '3층 · 불타는 성',
      width: 44, height: 78, hp: 1300, posture: 300,
      weight: 5, friction: 0.8, walkSpeed: 1.5, spacing: [110, 240],
      idleMin: 28, idleMax: 56,
      look: { body: 'boss', weapon: 'flameblade' }, aura: '#ff5020',
      weakness: ['sword', 'greatsword'],
      patterns: { dashSlash: { damage: 24 }, jumpSlam: { radius: 140 }, swordWaves: { count: 4, heights: [-16, -66, -36, -16] },
        areaBlast: { weight: 3, zones: 5, radius: 84 }, pillars: {} },
    },
  },
  // 보스 공통
  boss: {
    phase2At: 0.5,             // 체력 50% 이하 → 2페이즈
    phase2Speed: 1.3,          // 2페이즈 예고·동작 속도 배율
    roarFrames: 80,            // 2페이즈 전환 포효 (그동안 무적)
    roarPush: 9,               // 포효로 플레이어를 밀어냄
    groggyFrames: 220,         // 그로기 게이지(체간)가 차면 쓰러져 있는 시간 → 런처로 띄우기 / 처형 가능
    groggyDamageMult: 1.5,     // 그로기 중 받는 데미지 배율
    hitPostureMult: 0.35,      // 일반 공격으로 쌓이는 그로기(체간) 배율 — 보스는 패링 위주로 무너뜨리게
    executeDamage: 0.3,        // 처형 데미지 = 최대 체력의 비율 (체력이 그보다 적으면 처형으로 격파)
    deflectStagger: 26,        // 퍼펙트 패링 당하면 휘청 (패턴이 끊김)
    introFrames: 100,          // 등장 연출
    deathFrames: 110,
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

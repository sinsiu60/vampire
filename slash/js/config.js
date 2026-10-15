'use strict';
// 모든 밸런스 수치는 여기 한 곳에서 관리한다.
// 시간 단위: 프레임 (60프레임 = 1초)  /  속도 단위: px/프레임
// 히트박스: { x: 몸 중심에서 앞쪽으로의 시작 거리, y: 발밑 기준 위쪽(음수), w, h }

const CONFIG = {
  // ---------- 화면 / 루프 ----------
  view: { width: 960, height: 540 },
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
    dropThroughFrames: 12,     // S+스페이스 로 통과 발판 내려가기

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
    critMult: 1.6,
  },

  // ---------- 플레이어 기술 (검) ----------
  // startup: 선딜(예비동작) / active: 판정 / recovery: 후딜
  // chainDelay: 판정이 끝나고 몇 프레임 뒤부터 다음 타가 나가는지 (없으면 player.chainDelay)
  // 후딜(recovery) 동안은 대시/점프로 캔슬 가능
  // lunge: 판정 시작 시 앞으로 미끄러지는 속도
  // knock: 적에게 주는 넉백 {x, y}, hitstun: 적 경직, hitstop: 역경직(멈춤)
  // shake: 화면 흔들림 세기, arc: 베기 궤적 {r: 반지름, from/to: 각도(도), 위=-90}
  moves: {
    L1: {
      name: '베기 1', startup: 4, active: 3, recovery: 11,
      damage: 8, hitbox: { x: 2, y: -46, w: 54, h: 36 },
      knock: { x: 2.2, y: 0 }, hitstun: 20, hitstop: 4, shake: 2,
      lunge: 2.6, next: 'L2', arc: { r: 46, from: -120, to: 40 }, sfx: 'swing',
    },
    L2: {
      name: '베기 2', startup: 4, active: 3, recovery: 12,
      damage: 9, hitbox: { x: 2, y: -40, w: 58, h: 34 },
      knock: { x: 2.4, y: 0 }, hitstun: 20, hitstop: 4, shake: 2,
      lunge: 2.4, next: 'L3', arc: { r: 50, from: 50, to: -100 }, sfx: 'swing',
    },
    L3: {
      name: '올려베기', startup: 5, active: 4, recovery: 13,
      damage: 11, hitbox: { x: -4, y: -64, w: 60, h: 62 },
      knock: { x: 2.6, y: -2.5 }, hitstun: 24, hitstop: 5, shake: 3,
      lunge: 3, next: 'L4', arc: { r: 54, from: 80, to: -110 }, sfx: 'swing',
    },
    L4: {
      name: '마무리 베기', startup: 10, active: 5, recovery: 22,
      damage: 18, hitbox: { x: 0, y: -60, w: 74, h: 58 },
      knock: { x: 10, y: -4 }, hitstun: 34, hitstop: 9, shake: 7,
      lunge: 5.5, next: null, arc: { r: 66, from: -150, to: 70 }, sfx: 'swingHeavy',
      heavy: true,
    },
    // 약공 2타 후 K: 전진 찌르기
    THRUST: {
      name: '전진 찌르기', startup: 8, active: 6, recovery: 18,
      damage: 20, hitbox: { x: 4, y: -36, w: 92, h: 18 },
      knock: { x: 8, y: -1 }, hitstun: 30, hitstop: 7, shake: 5,
      lunge: 10, next: null, arc: { r: 90, from: -4, to: 4, thrust: true }, sfx: 'swingHeavy',
      heavy: true,
    },
    // 강공격: 차지 단계별 (0 = 탭)
    HEAVY: [
      {
        name: '강베기', startup: 10, active: 5, recovery: 22,
        damage: 22, hitbox: { x: -6, y: -70, w: 74, h: 68 },
        knock: { x: 7, y: -2 }, hitstun: 32, hitstop: 8, shake: 6,
        lunge: 3, arc: { r: 64, from: -150, to: 60 }, sfx: 'swingHeavy', heavy: true,
      },
      {
        name: '차지 베기 Lv1', startup: 6, active: 6, recovery: 22,
        damage: 36, hitbox: { x: -10, y: -82, w: 96, h: 80 },
        knock: { x: 10, y: -4 }, hitstun: 38, hitstop: 11, shake: 9,
        lunge: 4, arc: { r: 80, from: -160, to: 70 }, sfx: 'swingHeavy', heavy: true,
      },
      {
        name: '차지 베기 Lv2', startup: 6, active: 7, recovery: 26,
        damage: 58, hitbox: { x: -14, y: -100, w: 124, h: 98 },
        knock: { x: 14, y: -6 }, hitstun: 46, hitstop: 15, shake: 14,
        lunge: 5, arc: { r: 100, from: -170, to: 80 }, sfx: 'swingHeavy', heavy: true,
        impactFrame: true,
      },
    ],
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
      color: '#1a1416',
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
  },

  // ---------- 연습/테스트 아레나 (1단계) ----------
  arena: {
    width: 1920,
    groundY: 460,
    waveDelay: 90,             // 적 전멸 후 다음 웨이브까지
    waveSizes: [2, 3, 4],
  },
};

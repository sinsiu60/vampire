'use strict';
// =====================================================================
//  게임 밸런스 설정 — 모든 수치는 이 파일에서 조정하세요.
//
//  "곡선" 형식: [[시간(초), 값], [시간(초), 값], ...]
//   - 지정된 시간 사이의 값은 선형 보간됩니다.
//   - 마지막 지점 이후에는 마지막 구간의 기울기로 계속 증가합니다(무한 난이도 상승).
// =====================================================================
const CONFIG = {
  // ---------------------------------------------------------------
  // 화면 표시
  // ---------------------------------------------------------------
  display: {
    bgColor: '#15171e',
    gridColor: 'rgba(255,255,255,0.045)',
    gridSize: 64,
    showFps: false, // 게임 중 F 키로 토글
  },

  // ---------------------------------------------------------------
  // 플레이어 기본 능력치
  // ---------------------------------------------------------------
  player: {
    radius: 14,
    speed: 170,          // 이동 속도 (픽셀/초)
    maxHp: 100,
    regen: 0,            // 초당 체력 회복 (기본값)
    invulnTime: 0.7,     // 피격 후 무적 시간 (초)
    pickupRadius: 16,    // 보석을 실제로 먹는 거리 (몸 반지름에 더해짐)
    magnetRadius: 90,    // 보석이 끌려오기 시작하는 거리
    color: '#4fc3f7',
    startWeapon: 'magicBolt',
  },

  // 레벨 L → L+1 필요 경험치 = base + linear*(L-1) + quad*(L-1)^2
  exp: { base: 5, linear: 3, quad: 0.3 },

  // ---------------------------------------------------------------
  // 경험치 보석
  // ---------------------------------------------------------------
  gem: {
    magnetAccel: 1400,   // 끌려올 때 가속도
    maxSpeed: 900,
    maxCount: 400,       // 이 이상이면 기존 보석에 경험치를 합침 (성능용)
    // 경험치 값에 따른 색/크기 (min 이상이면 해당 단계)
    tiers: [
      { min: 1,  color: '#5ab4ff', size: 4 },
      { min: 5,  color: '#6ee07a', size: 5 },
      { min: 20, color: '#ffd54f', size: 6 },
      { min: 60, color: '#ff7a5c', size: 8 },
    ],
  },

  // ---------------------------------------------------------------
  // 적 스폰 / 난이도 곡선
  //  - 0~60초: 쉬움 (기본 몹만, 적은 수)
  //  - 60~300초: 점진적 증가
  //  - 300초(5분) 이후: 확실히 어려워짐
  // ---------------------------------------------------------------
  spawn: {
    // 초당 스폰 수
    rate: [[0, 0.6], [30, 0.9], [60, 1.6], [120, 3.0], [180, 4.2], [300, 7.5], [420, 11], [600, 16], [900, 24]],
    // 동시에 존재 가능한 최대 적 수
    maxAlive: [[0, 25], [60, 50], [120, 90], [180, 140], [300, 260], [600, 400], [900, 500]],
    hardCap: 650,        // 어떤 경우에도 넘지 않는 최대치 (군단 포함)
    // 적 체력 배율
    hpMult: [[0, 1], [60, 1.1], [120, 1.4], [180, 1.8], [300, 3.0], [420, 4.5], [600, 7.5], [900, 13]],
    // 적 공격력 배율
    damageMult: [[0, 1], [180, 1.2], [300, 1.6], [600, 2.2], [900, 3.0]],
    // 적 이동속도 배율
    speedMult: [[0, 1], [300, 1.1], [600, 1.2], [900, 1.25]],
    // 시간대별 적 종류 가중치 (해당 시간 이후 적용, 보간 없음)
    weights: [
      [0,   { basic: 1, fast: 0,   tank: 0 }],
      [45,  { basic: 1, fast: 0.3, tank: 0 }],
      [90,  { basic: 1, fast: 0.6, tank: 0.12 }],
      [180, { basic: 1, fast: 0.8, tank: 0.25 }],
      [300, { basic: 1, fast: 1.0, tank: 0.45 }],
      [600, { basic: 1, fast: 1.2, tank: 0.7 }],
    ],
    // 군단: 일정 주기로 빠른 몹이 플레이어를 원형으로 포위
    swarm: {
      startTime: 90,
      interval: 70,
      type: 'fast',
      count: [[90, 12], [300, 30], [600, 55], [900, 80]],
    },
    margin: 60,            // 화면 밖 얼마나 떨어진 곳에서 스폰할지
    despawnDistance: 1300, // 플레이어와 이 거리 이상 멀어지면 화면 밖 근처로 재배치
  },

  // ---------------------------------------------------------------
  // 적 종류
  // ---------------------------------------------------------------
  enemies: {
    basic: { name: '기본 몹', hp: 10, speed: 58,  damage: 8,  radius: 12, exp: 1, color: '#e05555', knockbackResist: 0 },
    fast:  { name: '빠른 몹', hp: 5,  speed: 125, damage: 5,  radius: 9,  exp: 1, color: '#b26ae0', knockbackResist: 0 },
    tank:  { name: '탱커 몹', hp: 75, speed: 34,  damage: 16, radius: 20, exp: 6, color: '#4f9d63', knockbackResist: 0.75 },
  },
  separation: 0.6, // 적끼리 밀어내는 강도 (0~1)

  // ---------------------------------------------------------------
  // 보스
  // ---------------------------------------------------------------
  boss: {
    interval: 180,       // 몇 초마다 등장하는지
    hp: 1200,
    hpGrowth: 2.4,       // 보스가 나올 때마다 체력 배율
    speed: 64,
    damage: 25,
    radius: 42,
    exp: 60,
    color: '#b71c1c',
    knockbackResist: 0.97,
    dashInterval: 4.5,   // 돌진 주기
    dashWindup: 0.8,     // 돌진 전 예고 시간
    dashSpeed: 430,
    dashTime: 0.6,
  },

  // ---------------------------------------------------------------
  // 전투 공통
  // ---------------------------------------------------------------
  combat: {
    knockback: 170,        // 기본 넉백 속도
    knockbackDecay: 9,     // 넉백 감쇠 (클수록 빨리 멈춤)
    flashTime: 0.09,       // 피격 시 하얗게 깜빡이는 시간
    damageVariance: 0.12,  // 데미지 랜덤 편차 (±12%)
  },

  // ---------------------------------------------------------------
  // 무기 (각 5레벨). cooldown은 초 단위, 쿨타임 감소 패시브의 영향을 받음
  // damage는 공격력 패시브의 영향을 받음
  // ---------------------------------------------------------------
  weapons: {
    magicBolt: {
      name: '마법탄',
      color: '#6ec8ff',
      desc: '가장 가까운 적에게 마법탄을 자동 발사합니다.',
      levels: [
        { damage: 10, cooldown: 0.85, count: 1, pierce: 1, speed: 430, desc: '가장 가까운 적에게 마법탄 발사' },
        { damage: 12, cooldown: 0.9,  count: 2, pierce: 1, speed: 450, desc: '발사 수 +1, 피해 증가' },
        { damage: 15, cooldown: 0.85, count: 2, pierce: 2, speed: 470, desc: '관통 +1, 피해 증가' },
        { damage: 18, cooldown: 0.72, count: 3, pierce: 2, speed: 490, desc: '발사 수 +1, 쿨타임 감소' },
        { damage: 25, cooldown: 0.6,  count: 4, pierce: 3, speed: 520, desc: '발사 수 +1, 관통 +1, 피해 대폭 증가' },
      ],
    },
    orbitBlade: {
      name: '회전 칼날',
      color: '#e0e6f0',
      desc: '플레이어 주위를 공전하는 칼날입니다.',
      levels: [
        { damage: 8,  count: 2, radius: 72,  rotSpeed: 3.0, hitInterval: 0.45, size: 12, desc: '칼날 2개가 주위를 공전' },
        { damage: 10, count: 3, radius: 78,  rotSpeed: 3.2, hitInterval: 0.42, size: 12, desc: '칼날 +1, 피해 증가' },
        { damage: 13, count: 3, radius: 88,  rotSpeed: 3.6, hitInterval: 0.4,  size: 14, desc: '범위·회전속도 증가' },
        { damage: 16, count: 4, radius: 95,  rotSpeed: 4.0, hitInterval: 0.36, size: 14, desc: '칼날 +1, 피해 증가' },
        { damage: 22, count: 6, radius: 105, rotSpeed: 4.5, hitInterval: 0.32, size: 16, desc: '칼날 +2, 모든 능력 강화' },
      ],
    },
    lightning: {
      name: '번개',
      color: '#ffe066',
      desc: '화면 안의 랜덤한 적에게 낙뢰를 떨어뜨립니다. (범위 피해)',
      levels: [
        { damage: 20, cooldown: 2.2, strikes: 1, radius: 50, desc: '랜덤한 적에게 낙뢰 1회' },
        { damage: 24, cooldown: 2.0, strikes: 2, radius: 55, desc: '낙뢰 +1, 피해 증가' },
        { damage: 30, cooldown: 1.8, strikes: 2, radius: 66, desc: '범위·피해 증가' },
        { damage: 36, cooldown: 1.6, strikes: 3, radius: 72, desc: '낙뢰 +1, 쿨타임 감소' },
        { damage: 50, cooldown: 1.3, strikes: 5, radius: 85, desc: '낙뢰 +2, 모든 능력 강화' },
      ],
    },
    aura: {
      name: '오라',
      color: '#7dff9a',
      desc: '플레이어 주변의 적에게 지속 피해를 줍니다.',
      levels: [
        { damage: 4,  tick: 0.5,  radius: 62,  slow: 0.0,  desc: '주변 적에게 지속 피해' },
        { damage: 5,  tick: 0.5,  radius: 72,  slow: 0.1,  desc: '범위 증가, 적 둔화 10%' },
        { damage: 7,  tick: 0.45, radius: 82,  slow: 0.15, desc: '피해·범위 증가' },
        { damage: 9,  tick: 0.4,  radius: 96,  slow: 0.2,  desc: '피해·범위 증가, 둔화 20%' },
        { damage: 13, tick: 0.35, radius: 118, slow: 0.3,  desc: '모든 능력 강화, 둔화 30%' },
      ],
    },
  },

  // ---------------------------------------------------------------
  // 패시브 업그레이드 (perLevel = 레벨당 증가량)
  // ---------------------------------------------------------------
  passives: {
    speed:    { name: '이동속도',   maxLevel: 5, perLevel: 0.10, desc: (v) => `이동속도 +${Math.round(v * 100)}%` },
    maxHp:    { name: '최대 체력',  maxLevel: 5, perLevel: 20,   desc: (v) => `최대 체력 +${v} (즉시 회복)` },
    might:    { name: '공격력',     maxLevel: 5, perLevel: 0.12, desc: (v) => `모든 피해 +${Math.round(v * 100)}%` },
    cooldown: { name: '쿨타임 감소', maxLevel: 5, perLevel: 0.08, desc: (v) => `무기 쿨타임 -${Math.round(v * 100)}%` },
    magnet:   { name: '자석 범위',  maxLevel: 5, perLevel: 0.35, desc: (v) => `보석 흡수 범위 +${Math.round(v * 100)}%` },
    regen:    { name: '체력 재생',  maxLevel: 5, perLevel: 0.5,  desc: (v) => `초당 체력 +${v} 회복` },
  },
  minCooldownMult: 0.4, // 쿨타임 배율 하한

  // ---------------------------------------------------------------
  // 보스 상자
  // ---------------------------------------------------------------
  chest: {
    weaponUpgrades: 1,     // 상자 하나당 무기 강화 횟수
    healPercent: 0.3,      // 상자 획득 시 회복량 (최대체력 비율)
  },

  // 업그레이드 선택지가 모두 소진되었을 때 회복량
  fallbackHeal: 30,

  // ---------------------------------------------------------------
  // 연출
  // ---------------------------------------------------------------
  effects: {
    maxParticles: 500,
    maxDamageTexts: 140,
    shakeOnHurt: 9,
    shakeOnBossDeath: 20,
    shakeOnLightning: 2.5,
  },
};

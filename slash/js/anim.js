'use strict';
// 실루엣 캐릭터: 관절 막대 인형 (머리, 몸통, 팔 2마디, 다리 2마디) + 포즈 키프레임 애니메이션
//
// 포즈 각도 규칙 (오른쪽을 바라볼 때 기준, 단위: 도)
//   torso       : 몸통 기울기. 0 = 똑바로, + = 앞으로 숙임, - = 뒤로 젖힘
//   head        : 몸통 대비 머리 기울기
//   thF / thB   : 앞다리 / 뒷다리 허벅지. 0 = 수직 아래, + = 앞으로
//   shF / shB   : 정강이 (허벅지 대비). - = 무릎이 접힘
//   arB1 / arB2 : 뒷팔 위팔(0 = 아래, + = 앞) / 아래팔(위팔 대비)
//   arF1 / arF2 : 앞팔 (무기를 안 들었을 때만 사용. 무기를 들면 손이 무기 손잡이를 따라감)
//   wpn         : 적 무기 각도 (0 = 앞, -90 = 위, 90 = 아래)
// 추가 연출 값(포즈 밖): rot(몸 전체 회전), sx/sy(스쿼시&스트레치)

const DEG = Math.PI / 180;
const ease = {
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
// ref 에 가장 가까운 (target + 360*k)
function nearestAngle(target, ref) {
  return target + Math.round((ref - target) / 360) * 360;
}

const Anim = (() => {
  const BASE = { torso: 4, head: 0, thF: 12, shF: -14, thB: -10, shB: -8, arB1: -12, arB2: 28, arF1: 10, arF2: 30, wpn: 50 };
  const P = (o) => Object.assign({}, BASE, o);

  // ---------- 체형 ----------
  const DIMS = {
    player: { thigh: 12, shin: 12, torso: 15, neck: 4, headR: 5.5, upper: 10, fore: 10, limbW: 4.2, torsoW: 8, foot: 4 },
    grunt: { thigh: 12, shin: 11, torso: 15, neck: 3, headR: 6.5, upper: 10.5, fore: 10, limbW: 5.5, torsoW: 12, foot: 5 },
    heavy: { thigh: 14, shin: 13, torso: 19, neck: 2, headR: 7.5, upper: 12, fore: 12, limbW: 8, torsoW: 19, foot: 6 },
    slim: { thigh: 12, shin: 12, torso: 15, neck: 4, headR: 5.5, upper: 10, fore: 10, limbW: 3.8, torsoW: 7, foot: 4 },
    flyer: { thigh: 8, shin: 8, torso: 13, neck: 3, headR: 6, upper: 9, fore: 9, limbW: 4, torsoW: 9, foot: 3 },
    boss: { thigh: 17, shin: 16, torso: 23, neck: 3, headR: 8, upper: 14, fore: 13, limbW: 7.5, torsoW: 15, foot: 7 },
  };

  // ---------- 포즈 라이브러리 ----------
  const POSES = {
    // 공통
    idle: P({}),
    crouch: P({ torso: 22, head: -8, thF: 70, shF: -120, thB: 35, shB: -110, arB1: 15, arB2: 35 }),
    jump: P({ torso: 8, thF: 55, shF: -85, thB: -12, shB: -45, arB1: -60, arB2: 40 }),
    fall: P({ torso: 0, head: -5, thF: 25, shF: -30, thB: -18, shB: -25, arB1: -115, arB2: 25 }),
    dash: P({ torso: 50, head: -25, thF: 75, shF: -70, thB: -55, shB: -30, arB1: -125, arB2: 5 }),
    charge: P({ torso: -14, head: 6, thF: 42, shF: -55, thB: -32, shB: -20, arB1: 35, arB2: 25 }),
    hurt: P({ torso: -26, head: -22, thF: 22, shF: -12, thB: -12, shB: -30, arB1: -65, arB2: -25 }),
    dead: P({ torso: 0, head: 10, thF: 15, shF: -20, thB: -8, shB: -15, arB1: -160, arB2: 10 }),
    flail: P({ torso: -10, head: -25, thF: 35, shF: -50, thB: -30, shB: -40, arB1: -140, arB2: 40, arF1: -100, arF2: 50 }),
    tuck: P({ torso: 30, head: 10, thF: 95, shF: -140, thB: 70, shB: -130, arB1: 30, arB2: 60 }),
    slamFall: P({ torso: 18, head: 10, thF: 8, shF: -10, thB: -6, shB: -16, arB1: -155, arB2: 15 }),

    // 공격: wind(예비동작, 크게 뒤로 젖힘) → strike(휘두름)
    cutWind: P({ torso: -24, head: -12, thF: 30, shF: -22, thB: -22, shB: -28, arB1: -40, arB2: 30 }),
    cutStrike: P({ torso: 32, head: 12, thF: 50, shF: -45, thB: -42, shB: -10, arB1: -75, arB2: 10 }),
    riseWind: P({ torso: 28, head: 5, thF: 55, shF: -95, thB: -8, shB: -85, arB1: 20, arB2: 40 }),
    riseStrike: P({ torso: -16, head: -14, thF: 18, shF: -6, thB: -28, shB: -12, arB1: -150, arB2: 20 }),
    spinWind: P({ torso: 10, head: 0, thF: 38, shF: -40, thB: -30, shB: -30, arB1: 40, arB2: 30 }),
    spinStrike: P({ torso: 16, head: 4, thF: 40, shF: -30, thB: -40, shB: -14, arB1: -95, arB2: 5 }),
    thrustWind: P({ torso: -12, head: -6, thF: 22, shF: -24, thB: -30, shB: -30, arB1: -20, arB2: 30 }),
    thrustStrike: P({ torso: 38, head: 18, thF: 72, shF: -72, thB: -62, shB: -8, arB1: -105, arB2: 0 }),
    launchWind: P({ torso: 34, head: 8, thF: 70, shF: -115, thB: 25, shB: -105, arB1: 25, arB2: 45 }),
    launchStrike: P({ torso: -20, head: -20, thF: 10, shF: -4, thB: -20, shB: -6, arB1: -165, arB2: 10 }),
    airWind: P({ torso: -18, head: -10, thF: 55, shF: -95, thB: -8, shB: -60, arB1: -50, arB2: 40 }),
    airStrike: P({ torso: 28, head: 10, thF: 35, shF: -45, thB: -28, shB: -55, arB1: -100, arB2: 20 }),
    airRiseWind: P({ torso: 20, head: 6, thF: 60, shF: -100, thB: 10, shB: -80, arB1: 10, arB2: 40 }),
    airRiseStrike: P({ torso: -14, head: -14, thF: 25, shF: -30, thB: -25, shB: -40, arB1: -140, arB2: 20 }),

    // 잡몹
    gIdle: P({ torso: 16, head: -6, thF: 16, shF: -20, thB: -12, shB: -12, arB1: 8, arB2: 35, wpn: 60 }),
    gWind: P({ torso: -28, head: -18, thF: 30, shF: -22, thB: -26, shB: -26, arB1: 30, arB2: 20, wpn: -150 }),
    gStrike: P({ torso: 40, head: 12, thF: 52, shF: -48, thB: -44, shB: -8, arB1: -60, arB2: 10, wpn: 70 }),
    gHurt: P({ torso: -26, head: -26, thF: 24, shF: -14, thB: -14, shB: -30, arB1: -70, arB2: -20, wpn: -70 }),
    gDown: P({ torso: 0, head: 15, thF: 20, shF: -30, thB: -10, shB: -10, arB1: -150, arB2: 20, wpn: 140 }),
    gGetup: P({ torso: 40, head: 0, thF: 80, shF: -130, thB: 20, shB: -100, arB1: 30, arB2: 40, wpn: 80 }),
    gStun: P({ torso: 30, head: 35, thF: 28, shF: -40, thB: -8, shB: -30, arB1: 5, arB2: 10, arF1: 10, arF2: 10, wpn: 95 }),
    // 방패 밀치기
    bashWind: P({ torso: -12, head: -6, thF: 30, shF: -30, thB: -24, shB: -24, arB1: -30, arB2: 40, wpn: 15 }),
    bashStrike: P({ torso: 30, head: 8, thF: 55, shF: -50, thB: -45, shB: -8, arB1: -50, arB2: 20, wpn: -5 }),
    // 중갑병: 내려찍기 / 휩쓸기
    smashWind: P({ torso: -30, head: -20, thF: 26, shF: -18, thB: -26, shB: -22, arB1: -170, arB2: 10, wpn: -110 }),
    smashStrike: P({ torso: 45, head: 18, thF: 55, shF: -60, thB: -40, shB: -20, arB1: 40, arB2: 20, wpn: 80 }),
    sweepWind: P({ torso: 20, head: -10, thF: 50, shF: -80, thB: -20, shB: -60, arB1: 60, arB2: 20, wpn: 175 }),
    sweepStrike: P({ torso: 26, head: 6, thF: 50, shF: -70, thB: -40, shB: -40, arB1: -80, arB2: 10, wpn: 15 }),
    // 원거리형: 활 겨누기
    aimWind: P({ torso: -4, head: 0, thF: 26, shF: -12, thB: -22, shB: -10, arB1: -80, arB2: -10, wpn: -6 }),
    aimRelease: P({ torso: -10, head: -6, thF: 26, shF: -12, thB: -22, shB: -10, arB1: -130, arB2: 30, wpn: -6 }),
    // 돌진형: 앞발 구르기 → 고개 숙이고 돌진
    rushWind: P({ torso: 55, head: -30, thF: 60, shF: -90, thB: -30, shB: -50, arB1: -70, arB2: 20, arF1: 40, arF2: 40 }),
    rushRun: P({ torso: 65, head: -40, thF: 60, shF: -60, thB: -50, shB: -40, arB1: -100, arB2: 10, arF1: -40, arF2: 30 }),
    // 비행형: 급강하
    diveWind: P({ torso: -20, head: -20, thF: 40, shF: -70, thB: 20, shB: -60, arB1: -150, arB2: 20, arF1: -150, arF2: 20 }),
    dive: P({ torso: 70, head: -40, thF: -20, shF: -20, thB: -30, shB: -20, arB1: 40, arB2: 30, arF1: 30, arF2: 30 }),
    flyIdle: P({ torso: 10, head: -5, thF: 25, shF: -50, thB: 5, shB: -60, arB1: 20, arB2: 50, arF1: 30, arF2: 50 }),
    // 가드: 낮게 버티며 칼을 앞으로
    guard: P({ torso: 6, head: 2, thF: 46, shF: -62, thB: -30, shB: -34, arB1: -20, arB2: 80 }),
    // 처형: 칼 털어내기
    flick: P({ torso: 12, head: 8, thF: 40, shF: -40, thB: -30, shB: -20, arB1: -30, arB2: 40 }),
    // 적: 퍼펙트 패링 당해 휘청 / 체간 붕괴로 무릎 꿇음
    gDeflect: P({ torso: -34, head: -30, thF: 30, shF: -18, thB: -24, shB: -36, arB1: -120, arB2: 20, wpn: -120 }),
    gKneel: P({ torso: 34, head: 34, thF: 85, shF: -150, thB: -40, shB: -100, arB1: 10, arB2: 10, arF1: 20, arF2: 10, wpn: 105 }),
    // 플레이어 패링 자세: 칼을 세워 막음
    parry: P({ torso: -8, head: -4, thF: 34, shF: -40, thB: -26, shB: -24, arB1: -40, arB2: 70 }),
  };

  // 기술 → (예비, 휘두름) 포즈와 특수 연출
  const MOVE_POSES = {
    L1: ['cutWind', 'cutStrike'],
    L2: ['riseWind', 'riseStrike'],
    L3: ['spinWind', 'spinStrike', 'spinX'],
    L4: ['cutWind', 'cutStrike'],
    THRUST: ['thrustWind', 'thrustStrike'],
    HEAVY0: ['cutWind', 'cutStrike'],
    HEAVY1: ['cutWind', 'cutStrike'],
    HEAVY2: ['cutWind', 'cutStrike'],
    LAUNCHER: ['launchWind', 'launchStrike'],
    A1: ['airWind', 'airStrike'],
    A2: ['airRiseWind', 'airRiseStrike'],
    A3: ['tuck', 'tuck', 'flip'],
    AIR_HEAVY: ['airWind', 'airStrike'],
  };

  function lerpPose(a, b, t, out) {
    out = out || {};
    for (const k in BASE) out[k] = a[k] + (b[k] - a[k]) * t;
    return out;
  }

  // ---------- 순환 동작 (달리기 / 숨쉬기) ----------
  function runPose(phase, out) {
    const s = Math.sin(phase);
    out = Object.assign(out || {}, BASE);
    out.torso = 18 + Math.sin(phase * 2) * 2;
    out.head = -6;
    out.thF = 40 * s;
    out.thB = -40 * s;
    out.shF = -22 - 60 * Math.max(0, Math.sin(phase + 1.3));
    out.shB = -22 - 60 * Math.max(0, Math.sin(phase + 1.3 + Math.PI));
    out.arB1 = 40 * s - 10;
    out.arB2 = 55;
    return out;
  }
  function walkPose(phase, base, out) {
    const s = Math.sin(phase);
    out = Object.assign(out || {}, base);
    out.thF = base.thF + 26 * s;
    out.thB = base.thB - 26 * s;
    out.shF = -15 - 35 * Math.max(0, Math.sin(phase + 1.3));
    out.shB = -15 - 35 * Math.max(0, Math.sin(phase + 1.3 + Math.PI));
    out.arB1 = base.arB1 + 20 * s;
    return out;
  }
  function breathe(base, t, out) {
    out = Object.assign(out || {}, base);
    const b = Math.sin(t * 0.06);
    out.torso += b * 1.5;
    out.arB1 += b * 3;
    out.head -= b * 1.5;
    return out;
  }

  // ---------- 플레이어 포즈 선택 ----------
  function playerPose(p) {
    const r = { pose: null, rot: 0, sx: 1, sy: 1, grounded: p.onGround };
    const f = p.stateFrame;
    const t = Game.frame || 0;
    const groundBase = () => (Math.abs(p.vx) > 0.6 ? runPose(p.runPhase) : breathe(POSES.idle, t));
    const airBase = () => lerpPose(POSES.jump, POSES.fall, clamp01((p.vy + 3) / 7));

    switch (p.state) {
      case 'attack': {
        const m = p.move;
        const set = MOVE_POSES[p.moveId] || MOVE_POSES.L1;
        const wind = POSES[set[0]], strike = POSES[set[1]];
        const base = p.onGround ? breathe(POSES.idle, t) : airBase();
        const end = m.startup + m.active;
        if (f < m.startup) r.pose = lerpPose(base, wind, ease.outCubic(f / m.startup));
        else if (f < end) r.pose = lerpPose(wind, strike, ease.outCubic((f - m.startup + 1) / m.active));
        else r.pose = lerpPose(strike, base, ease.inOut(clamp01((f - end) / m.recovery)));
        if (set[2] === 'spinX' && f >= m.startup && f < end + 3) {
          // 가로 회전베기: 몸이 한 바퀴 도는 느낌 (좌우 뒤집힘)
          const c = Math.cos(2 * Math.PI * clamp01((f - m.startup) / (m.active + 3)));
          r.sx = Math.sign(c || 1) * Math.max(0.25, Math.abs(c));
        }
        if (set[2] === 'flip' && f >= m.startup) {
          // 공중 회전베기: 앞으로 한 바퀴
          r.rot = 360 * ease.outQuad(clamp01((f - m.startup) / (m.active + 6)));
        }
        if (f < m.startup && m.heavy) r.sy = 1 - 0.06 * (f / m.startup);   // 힘 모으며 살짝 눌림
        break;
      }
      case 'charge': {
        r.pose = lerpPose(breathe(POSES.idle, t), POSES.charge, ease.outCubic(clamp01(f / 10)));
        if (p.chargeLevel > 0) {
          const k = p.chargeLevel;
          r.pose.torso += Math.sin(f * 1.7) * k * 1.2;  // 힘이 차서 떨림
          r.sy = 1 - 0.04 * k;
          r.sx = 1 + 0.04 * k;
        }
        break;
      }
      case 'slam':
        r.pose = p.slamPhase === 'hang' ? POSES.tuck : p.slamPhase === 'fall' ? POSES.slamFall : POSES.crouch;
        if (p.slamPhase === 'hang') r.rot = -20 + 40 * clamp01(f / 7);
        if (p.slamPhase === 'fall') { r.sy = 1.15; r.sx = 0.88; }
        break;
      case 'dash':
        r.pose = POSES.dash;
        r.sx = 1.12; r.sy = 0.9;
        break;
      case 'hurt':
        r.pose = POSES.hurt;
        break;
      case 'parry':
        r.pose = lerpPose(p.onGround ? breathe(POSES.idle, t) : airBase(), POSES.parry, ease.outCubic(clamp01(f / 3)));
        break;
      case 'guard':
        r.pose = lerpPose(POSES.parry, POSES.guard, ease.outCubic(clamp01(f / 6)));
        if (p.guardFlash > 0) { r.pose = Object.assign({}, r.pose); r.pose.torso -= p.guardFlash * 1.5; }   // 받을 때 밀림
        break;
      case 'guardBreak':
        // 자세 붕괴: 뒤로 휘청
        r.pose = Object.assign({}, POSES.hurt);
        r.pose.torso += Math.sin(f * 0.35) * 10;
        r.pose.head += Math.sin(f * 0.35 + 1) * 12;
        break;
      case 'execute':
        if (p.execPose === 'wind') r.pose = lerpPose(breathe(POSES.idle, t), POSES.cutWind, ease.outCubic(clamp01(f / 10)));
        else if (p.execPose === 'strike') r.pose = POSES.thrustStrike;
        else r.pose = lerpPose(POSES.thrustStrike, POSES.flick, ease.outCubic(clamp01(f / 10)));
        r.grounded = true;
        break;
      case 'dead':
        r.pose = POSES.dead;
        r.rot = -90 * ease.outQuad(clamp01(f / 20));
        r.grounded = p.onGround;
        break;
      default:
        if (p.onGround) {
          r.pose = groundBase();
          if (p.landSquash > 0) {
            const k = p.landSquash / 8;
            r.pose = lerpPose(r.pose, POSES.crouch, k * 0.8);
            r.sx = 1 + 0.18 * k; r.sy = 1 - 0.14 * k;
          }
        } else {
          r.pose = airBase();
          if (p.vy < -4) { r.sx = 0.9; r.sy = 1.12; }   // 점프 스트레치
          if (p.flipTimer > 0) {
            // 2단 점프: 앞으로 한 바퀴
            r.pose = POSES.tuck;
            r.rot = 360 * ease.outQuad(1 - p.flipTimer / CONFIG.player.flipFrames);
          }
        }
    }
    return r;
  }

  // ---------- 적 포즈 선택 ----------
  // 공격별 (예비, 휘두름) 포즈
  const ATTACK_POSES = {
    slash: ['gWind', 'gStrike'],
    bash: ['bashWind', 'bashStrike'],
    smash: ['smashWind', 'smashStrike'],
    sweep: ['sweepWind', 'sweepStrike'],
    shot: ['aimWind', 'aimRelease'],
    rush: ['rushWind', 'rushRun'],
    dive: ['diveWind', 'dive'],
  };

  function enemyPose(e) {
    const r = { pose: null, rot: 0, sx: 1, sy: 1, grounded: e.onGround && !e.hovering };
    // 보스 패턴이 직접 지정한 포즈
    if (e.animPose) {
      const ap = e.animPose;
      r.pose = lerpPose(POSES[ap.a], POSES[ap.b], ease.inOut(clamp01(ap.t)));
      if (ap.shake) r.pose.torso += Math.sin((Game.frame || 0) * 1.9) * 2.5;
      r.rot = ap.rot || 0;
      if (r.rot) r.grounded = false;
      return r;
    }
    const f = e.stateFrame, A = e.atk;
    const t = (Game.frame || 0) + e.seed;
    const flying = e.hovering;
    const idle = flying ? POSES.flyIdle : POSES.gIdle;
    const base = breathe(idle, t);
    const set = ATTACK_POSES[A.id] || ATTACK_POSES.slash;
    const wind = POSES[set[0]], strike = POSES[set[1]];
    switch (e.state) {
      case 'chase':
      case 'bossIdle':
        r.pose = !flying && Math.abs(e.vx) > 0.3 ? walkPose(e.walkPhase, POSES.gIdle) : base;
        break;
      case 'groggy':
        // 보스 그로기: 무릎 꿇고 크게 휘청
        r.pose = lerpPose(POSES.gDeflect, POSES.gKneel, ease.outCubic(clamp01(f / 12)));
        r.pose.torso += Math.sin(t * 0.12) * 9;
        r.pose.head += Math.sin(t * 0.12 + 1.2) * 10;
        break;
      case 'windup': {
        // 예고: 크게 들어 올리고 뒤로 젖힘, 막판엔 부들부들
        const k = ease.outCubic(clamp01(f / (A.windup * 0.6)));
        r.pose = lerpPose(base, wind, k);
        if (f > A.windup * 0.6) r.pose.torso += Math.sin(f * 2.1) * 1.5;
        // 타격 직전 swingLeadMs 부터 휘두르기 시작 → 무기가 닿는 모습 = 실제 타격 순간
        const lead = Math.round(CONFIG.enemyTiming.swingLeadMs * CONFIG.fps / 1000);
        const s0 = A.windup + 1 - lead;
        if (A.kind === 'melee' && f > s0) r.pose = lerpPose(r.pose, strike, ease.inOut(clamp01((f - s0) / lead)) * 0.85);
        if (A.kind === 'rush') r.pose.thF += Math.sin(f * 0.6) * 18;   // 앞발 구르기
        r.sy = 1 - 0.05 * k;
        break;
      }
      case 'attack':
        if (A.kind === 'rush') {
          r.pose = runPose(f * 0.5);
          r.pose = lerpPose(r.pose, strike, 0.6);
        } else if (A.kind === 'dive') {
          r.pose = strike;
          r.rot = 25;
        } else {
          // 예고 막판에 85% 까지 휘두른 상태에서 이어서 끝까지
          r.pose = lerpPose(wind, strike, 0.85 + 0.15 * ease.outCubic(clamp01((f + 1) / 2)));
        }
        break;
      case 'recover':
        r.pose = lerpPose(A.kind === 'rush' ? POSES.gStrike : strike, base, ease.inOut(clamp01(f / A.recovery)));
        break;
      case 'hurt':
        r.pose = lerpPose(POSES.gHurt, base, clamp01((f - e.hitstun * 0.5) / (e.hitstun * 0.5)));
        break;
      case 'deflected': {
        // 퍼펙트 패링 당함: 크게 젖혀졌다 돌아옴
        const k = clamp01(f / CONFIG.parry.deflectStagger);
        r.pose = lerpPose(POSES.gDeflect, base, ease.inOut(Math.max(0, (k - 0.4) / 0.6)));
        r.pose.torso += Math.sin(f * 0.6) * 4 * (1 - k);
        break;
      }
      case 'broken':
        // 체간 붕괴: 무릎 꿇고 비틀거림
        r.pose = lerpPose(POSES.gDeflect, POSES.gKneel, ease.outCubic(clamp01(f / 10)));
        r.pose.torso += Math.sin(t * 0.15) * 6;
        r.pose.head += Math.sin(t * 0.15 + 1.2) * 8;
        r.grounded = e.onGround;
        break;
      case 'stun':
        // 그로기: 고개 숙이고 휘청휘청
        r.pose = Object.assign({}, POSES.gStun);
        r.pose.torso += Math.sin(t * 0.12) * 8;
        r.pose.head += Math.sin(t * 0.12 + 1) * 10;
        break;
      case 'launched':
        r.pose = POSES.flail;
        r.rot = Math.max(-80, Math.min(40, -30 + e.vy * 6));
        break;
      case 'down':
        r.pose = POSES.gDown;
        r.rot = -90;
        break;
      case 'getup': {
        const k = clamp01(f / CONFIG.air.getupFrames);
        r.pose = k < 0.5 ? lerpPose(POSES.gDown, POSES.gGetup, k * 2) : lerpPose(POSES.gGetup, POSES.gIdle, (k - 0.5) * 2);
        r.rot = -90 * (1 - ease.outQuad(clamp01(k * 1.6)));
        break;
      }
      case 'dead':
        r.pose = POSES.flail;
        r.rot = e.onGround ? -90 : Math.max(-90, -30 + e.vy * 6);
        break;
      default:
        r.pose = base;
    }
    return r;
  }

  // ---------- 골격 계산 (순운동학) ----------
  function down(len, ang, o, out) {     // ang: 수직 아래 기준
    out.x = o.x + Math.sin(ang * DEG) * len;
    out.y = o.y + Math.cos(ang * DEG) * len;
    return out;
  }
  function up(len, ang, o, out) {       // ang: 수직 위 기준
    out.x = o.x + Math.sin(ang * DEG) * len;
    out.y = o.y - Math.cos(ang * DEG) * len;
    return out;
  }

  // 로컬(오른쪽 바라봄, 발밑 원점) 관절 → 회전/착지 보정/스쿼시 → 월드
  function build(pa, dim, x, y, facing) {
    const ps = pa.pose;
    const j = {
      hip: { x: 0, y: -(dim.thigh + dim.shin) },
      kneeF: {}, footF: {}, kneeB: {}, footB: {},
      neck: {}, head: {}, shoulder: {}, elbowB: {}, handB: {}, elbowF: {}, handF: {},
    };
    down(dim.thigh, ps.thF, j.hip, j.kneeF);
    down(dim.shin, ps.thF + ps.shF, j.kneeF, j.footF);
    down(dim.thigh, ps.thB, j.hip, j.kneeB);
    down(dim.shin, ps.thB + ps.shB, j.kneeB, j.footB);
    up(dim.torso, ps.torso, j.hip, j.neck);
    up(dim.torso - 2, ps.torso, j.hip, j.shoulder);
    up(dim.neck + dim.headR, ps.torso + ps.head, j.neck, j.head);
    down(dim.upper, ps.arB1, j.shoulder, j.elbowB);
    down(dim.fore, ps.arB1 + ps.arB2, j.elbowB, j.handB);
    down(dim.upper, ps.arF1, j.shoulder, j.elbowF);
    down(dim.fore, ps.arF1 + ps.arF2, j.elbowF, j.handF);

    const pts = [j.hip, j.kneeF, j.footF, j.kneeB, j.footB, j.neck, j.head, j.shoulder, j.elbowB, j.handB, j.elbowF, j.handF];
    // 몸 전체 회전 (엉덩이 기준)
    if (pa.rot) {
      const c = Math.cos(pa.rot * DEG), s = Math.sin(pa.rot * DEG);
      const hx = j.hip.x, hy = j.hip.y;
      for (const q of pts) {
        const dx = q.x - hx, dy = q.y - hy;
        q.x = hx + dx * c - dy * s;
        q.y = hy + dx * s + dy * c;
      }
    }
    // 땅에 서 있으면 가장 낮은 지점이 바닥에 닿게
    if (pa.grounded) {
      let maxY = -1e9;
      for (const q of [j.footF, j.footB, j.kneeF, j.kneeB, j.hip, j.neck]) if (q.y > maxY) maxY = q.y;
      maxY = Math.max(maxY, j.head.y + dim.headR);
      const lie = Math.abs(Math.sin((pa.rot || 0) * DEG));
      const off = -maxY - lie * dim.torsoW * 0.45;
      for (const q of pts) q.y += off;
    }
    // 스쿼시 & 스트레치 (발밑 기준) → 월드
    for (const q of pts) {
      q.x = x + facing * q.x * pa.sx;
      q.y = y + q.y * pa.sy;
    }
    return { j, dim, facing, sx: pa.sx };
  }

  // 2관절 IK: 어깨에서 target 으로 팔을 뻗음 (팔꿈치는 아래쪽으로 굽힘)
  function reach(fig, target) {
    const j = fig.j, d = fig.dim;
    const s = j.shoulder;
    let dx = target.x - s.x, dy = target.y - s.y;
    let dist = Math.hypot(dx, dy) || 0.001;
    const a = d.upper, b = d.fore;
    const maxR = a + b - 0.01;
    if (dist > maxR) { dx *= maxR / dist; dy *= maxR / dist; dist = maxR; }
    const cosA = clampCos((a * a + dist * dist - b * b) / (2 * a * dist));
    const base = Math.atan2(dy, dx), off = Math.acos(cosA);
    const e1 = { x: s.x + Math.cos(base + off) * a, y: s.y + Math.sin(base + off) * a };
    const e2 = { x: s.x + Math.cos(base - off) * a, y: s.y + Math.sin(base - off) * a };
    const el = e1.y > e2.y ? e1 : e2;
    j.elbowF.x = el.x; j.elbowF.y = el.y;
    j.handF.x = s.x + dx; j.handF.y = s.y + dy;
  }
  function clampCos(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

  // ---------- 그리기 ----------
  // style: { color, back, glow, glowBlur }
  function drawFigure(ctx, fig, style, scarf) {
    const j = fig.j, d = fig.dim;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (style.glow) { ctx.shadowColor = style.glow; ctx.shadowBlur = style.glowBlur || 14; }
    const line = (pts, w, col) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    };
    const toe = (foot, knee) => ({ x: foot.x + fig.facing * d.foot * Math.abs(fig.sx), y: foot.y + (foot.y - knee.y) * 0.05 });

    // 뒤쪽 팔다리 (살짝 밝게 해서 앞뒤 구분)
    line([j.hip, j.kneeB, j.footB, toe(j.footB, j.kneeB)], d.limbW, style.back);
    line([j.shoulder, j.elbowB, j.handB], d.limbW * 0.9, style.back);
    // 목도리 (몸 뒤)
    if (scarf) drawScarf(ctx, scarf, style.color);
    // 몸통 + 머리
    line([j.hip, j.neck], d.torsoW, style.color);
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, d.headR, 0, Math.PI * 2);
    ctx.fill();
    // 앞쪽 팔다리
    line([j.hip, j.kneeF, j.footF, toe(j.footF, j.kneeF)], d.limbW, style.color);
    line([j.shoulder, j.elbowF, j.handF], d.limbW * 0.9, style.color);
    ctx.restore();
  }

  function drawScarf(ctx, s, color) {
    if (!s || s.length < 2) return;
    ctx.strokeStyle = color;
    for (let i = 0; i < s.length - 1; i++) {
      ctx.lineWidth = 5 - (i / s.length) * 3.6;
      ctx.beginPath();
      ctx.moveTo(s[i].x, s[i].y);
      ctx.lineTo(s[i + 1].x, s[i + 1].y);
      ctx.stroke();
    }
  }

  // 눈: 머리 앞쪽의 가는 빛
  function drawEye(ctx, fig, color, glow, size) {
    const j = fig.j, d = fig.dim;
    const dx = j.head.x - j.neck.x, dy = j.head.y - j.neck.y;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;               // 목 → 머리 방향 (위)
    const fx = -uy * fig.facing, fy = ux * fig.facing;            // 얼굴 앞 방향 (위 방향을 바라보는 쪽으로 90도)
    const ex = j.head.x + fx * d.headR * 0.5 + ux * 0.8;
    const ey = j.head.y + fy * d.headR * 0.5 + uy * 0.8;
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = size || 2;
    ctx.beginPath();
    ctx.moveTo(ex - fx * 1.6, ey - fy * 1.6);
    ctx.lineTo(ex + fx * 2.4, ey + fy * 2.4);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 캐릭터별 조립 ----------
  function playerFigure(p) {
    const pa = playerPose(p);
    const fig = build(pa, DIMS.player, p.x, p.y, p.facing);
    const bp = p.bladePose();
    fig.blade = {
      pose: bp,
      base: p.bladePoint(bp, 8, {}),
      hand: p.bladePoint(bp, CONFIG.player.trailInner, {}),
      guard: p.bladePoint(bp, CONFIG.player.trailInner + 2, {}),
      tip: p.bladePoint(bp, CONFIG.player.trailInner + CONFIG.player.bladeLength, {}),
    };
    reach(fig, fig.blade.hand);
    return fig;
  }

  // 무기 종류별 손 위치 / 길이 (어깨 기준)
  const WEAPONS = {
    blade: { hand: 13, base: 9, tip: 42 },
    shield: { hand: 15, base: 15, tip: 15 },
    hammer: { hand: 16, base: 6, tip: 56 },
    greatsword: { hand: 16, base: 8, tip: 74 },
    lance: { hand: 15, base: -26, tip: 92 },
    flameblade: { hand: 16, base: 8, tip: 70 },
    bow: { hand: 19, base: 19, tip: 19 },
    horns: null,
    claws: null,
  };

  function enemyFigure(e) {
    const pa = enemyPose(e);
    const look = e.cfg.look;
    // 방패는 평소엔 몸 앞에 세워 듦
    if (look.weapon === 'shield' && e.state !== 'windup' && e.state !== 'attack' && e.state !== 'recover') {
      pa.pose = Object.assign({}, pa.pose, { wpn: 10 });
    }
    const fig = build(pa, DIMS[look.body] || DIMS.grunt, e.x, e.y, e.facing);
    fig.look = look;
    const W = WEAPONS[look.weapon];
    if (W) {
      // 무기: 어깨 기준 wpn 각도로 손을 뻗고 무기는 손에서 바깥으로
      const a = (pa.pose.wpn + (pa.rot || 0)) * DEG;
      const s = fig.j.shoulder;
      const at = (r) => ({ x: s.x + fig.facing * Math.cos(a) * r * pa.sx, y: s.y + Math.sin(a) * r });
      const hand = at(W.hand);
      reach(fig, hand);
      fig.weapon = { hand, base: at(W.base), tip: at(W.tip), ang: a };
    }
    return fig;
  }

  // 칼날: 손잡이~칼끝 가늘어지는 다각형
  function drawBlade(ctx, base, tip, w0, w1, color) {
    const dx = tip.x - base.x, dy = tip.y - base.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(base.x + nx * w0, base.y + ny * w0);
    ctx.lineTo(tip.x + nx * w1, tip.y + ny * w1);
    ctx.lineTo(tip.x + dx / L * 3, tip.y + dy / L * 3);
    ctx.lineTo(tip.x - nx * w1, tip.y - ny * w1);
    ctx.lineTo(base.x - nx * w0, base.y - ny * w0);
    ctx.closePath();
    ctx.fill();
  }

  // 잔상 등에서 쓰는 골격 복사
  function snapshot(fig) {
    const j = {};
    for (const k in fig.j) j[k] = { x: fig.j[k].x, y: fig.j[k].y };
    const out = { j, dim: fig.dim, facing: fig.facing, sx: fig.sx };
    if (fig.blade) out.blade = { base: { ...fig.blade.base }, tip: { ...fig.blade.tip } };
    return out;
  }

  return { POSES, DIMS, playerFigure, enemyFigure, drawFigure, drawEye, drawBlade, drawScarf, snapshot, lerpPose };
})();

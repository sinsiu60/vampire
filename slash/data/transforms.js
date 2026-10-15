'use strict';
// 무기 변형 데이터 — 무기마다 변형 칸 1개 (각인 칸과 별도). 런 동안 유지, 대장간에서만 바꿀 수 있음
//   id / weapon: 대상 무기 / name / tagline: 한 줄 소개
//   mech: 특수 동작 종류 (js/transform.js 가 처리) — iaido 발도술 / dual 쌍검 / chain 사슬검
//   card: 보상 카드에 쓰는 짧은 줄 (3줄) / changes: Tab 화면 등에 쓰는 자세한 설명
//   preview: 카드에서 반복 재생할 기술 (moves 이름, HEAVY0~2 = 강공 차지 단계, Q / E = 스킬)
//   patch: 무기 설정(config.js weapons.*)에 덮어쓸 내용
//     moves: 기술 이름별로 통째로 교체 (여기 없는 기술은 원래 무기 것 그대로)
//     skills: q / e 중 바꾸는 쪽만 통째로 교체
//     blade / charge / swapIn / swapInAir / speedMult: 통째로 교체
//   기술 필드는 config.js moves 와 같음 + special(특수 동작) / sheathe(끝나면 납도)
//     hand: 사슬검 손 궤적 { keys: [[프레임, 앞 x, 발 기준 y], ...] } 또는 { circle: { start, end, cx, cy, r, turns, a0, squash, after } } — 손이 먼저 움직임
//     blade: 사슬검 칼날 키프레임 { pivot: [x, y], keys: [{ f, a, r, sq } 또는 { f, x, y }, e: slow|whip|lin|hold, o: 오버슈트, fx: impact|tang ] }
//            (칼날은 손보다 3~4프레임 늦게 출발. whip = 시간 20% 에 경로 80% 급가속 → 감속하며 o 만큼 지나쳤다 돌아옴)
//     throw: 던지기 (활성 프레임에 적·벽에 닿으면 박힘) / taut: 사슬을 직선으로 팽팽하게 / impact: fx impact 키에서 충격파
//     rehit: 같은 적을 다시 맞히는 간격 / spinRelease: 회전 중 우클릭 → HEAVY_SPIN
//   aim (사슬검): 마우스 조준 { range: 최대 사거리, bindSlow: Q 조준 중 시간 배율, bindAimSec: Q 조준 최대 시간, visLerp: 조준점 따라가는 속도 }
//   스킬 kind "aimBind": Q 누름 → 조준, 뗌 → 발사 / bind: 묶은 적 { orbitSpeed, radius, autoThrowSec, throwSpeed, gravity, maxFlight,
//     damage·posture(적끼리 충돌), wallDamage·wallPosture·wallStun(벽꽝), landDamage, heavyPosture·bossPosture(묶지 못할 때 체간) }
//     hold: 타격 끝 포즈로 멈추는 프레임 (예비동작 startup → 타격 active → 홀드 hold → 후딜 recovery). hold 가 있으면 공속 증가는 후딜만 줄임
//     dual: 쌍검 손별 궤적 { R: 오른손, L: 왼손 } — { from, to: 칼 각도, r: 궤적 반지름, squash, py, reach: 팔 뻗는 길이, hold: 홀드 각도,
//           windAng: 예비동작 각도, linear: 일정 속도 회전 } 또는 { rest: 쉬는 손 각도 }
//     then: 끝나면 바로 이어지는 기술 / dashCancel: 판정 도중에도 대시로 캔슬
//   나머지(iaido / dual / chain 등): 그 변형의 특수 수치. 스킬의 chain / bind / fallback 도 특수 동작 수치
// (= 뒤는 순수 JSON. 브라우저가 file:// 에서 .json 을 못 읽어서 이 한 줄로 감쌌다)
DATA.transforms = [
  {
    "id": "sword_iaido", "weapon": "sword", "name": "발도술", "mech": "iaido",
    "tagline": "칼집에서 뽑는 한 번의 베기",
    "card": ["평소엔 납도 — 뽑는 첫 타 ×1.5", "강공: 거합 차지 → 긴 일격", "납도 중 패링 → 자동 거합 반격", "E: 일섬 연쇄 (적 사이 순간이동)"],
    "changes": [
      "평소엔 칼을 칼집에 넣고 있다 (공격이 끝나고 잠시 뒤 자동 납도)",
      "약공 3타: 발도 베기 → 되베기 → 납도 일섬. 칼집에서 뽑는 첫 타는 데미지·체간 ×1.5",
      "강공: 칼자루를 잡고 거합 차지 → 앞으로 긴 일격 (차지할수록 길고 강함)",
      "칼집 상태에서 퍼펙트 패링 → 자동 거합 반격",
      "E 일섬 연쇄: 화면 안의 적 사이를 순간이동하며 하나씩 벤다 (최대 6명)"
    ],
    "preview": ["L1", "L2", "L3", "HEAVY2"],
    "iaido": { "sheatheDelay": 70, "drawMult": 1.5 },
    "patch": {
      "blade": { "length": 40, "hand": 14, "w0": 2.4, "w1": 1.1, "guard": true, "sheath": true },
      "charge": { "framesPerLevel": 30, "staminaPerLevel": 18, "maxLevel": 2 },
      "chargePose": "stance",
      "swapIn": {
        "name": "전환 · 발도 섬광", "startup": 3, "active": 5, "recovery": 14,
        "damage": 20, "posture": 24, "hitbox": { "x": -10, "y": -60, "w": 124, "h": 50 },
        "knock": { "x": 6, "y": -2 }, "hitstun": 32, "hitstop": 8, "shake": 5,
        "lunge": 6, "sfx": "iai", "heavy": true, "pts": 20, "swapAttack": true, "sheathe": true,
        "swing": { "from": 160, "to": -20, "r": 96, "squash": 0.35, "py": -30 }, "pose": ["stance", "spinStrike"]
      },
      "skills": {
        "e": {
          "name": "일섬 연쇄", "kind": "move", "cooldown": 660, "desc": "화면 안의 적 사이를 순간이동하며 하나씩 벤다 (최대 6명)",
          "move": {
            "name": "일섬 연쇄", "startup": 6, "active": 999, "recovery": 18, "noHit": true,
            "damage": 0, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 }, "knock": { "x": 0, "y": 0 }, "hitstun": 0, "hitstop": 0, "shake": 0,
            "lunge": 0, "sfx": "iai", "pts": 0, "skill": true, "special": "iaiChain", "sheathe": true,
            "swing": { "from": 160, "to": 5, "r": 92, "squash": 0.4, "py": -30 }, "pose": ["stance", "thrustStrike"]
          },
          "chain": { "max": 6, "interval": 7, "offset": 46, "delay": 16, "damage": 34, "posture": 30,
            "knock": { "x": 3, "y": -3 }, "hitstun": 44, "hitstop": 8, "shake": 8 },
          "fallback": { "distance": 250, "delay": 12, "height": 70, "damage": 42, "posture": 34, "knock": { "x": 3, "y": -3 }, "hitstun": 44, "hitstop": 10, "shake": 9 }
        }
      },
      "moves": {
        "L1": {
          "name": "발도 베기", "startup": 3, "active": 4, "recovery": 12,
          "damage": 12, "hitbox": { "x": -4, "y": -56, "w": 86, "h": 40 },
          "knock": { "x": 3, "y": 0 }, "hitstun": 22, "hitstop": 6, "shake": 3,
          "lunge": 4, "next": "L2", "sfx": "iai", "pts": 6,
          "swing": { "from": 150, "to": -30, "r": 76, "squash": 0.45, "py": -30 }, "pose": ["stance", "spinStrike"]
        },
        "L2": {
          "name": "되베기", "startup": 4, "active": 3, "recovery": 12,
          "damage": 10, "hitbox": { "x": 0, "y": -64, "w": 72, "h": 58 },
          "knock": { "x": 2.4, "y": 0 }, "hitstun": 22, "hitstop": 4, "shake": 2,
          "lunge": 2.4, "next": "L3", "sfx": "swing", "pts": 6,
          "swing": { "from": 60, "to": -120, "r": 66, "squash": 1 }, "pose": ["riseWind", "riseStrike"]
        },
        "L3": {
          "name": "납도 일섬", "startup": 8, "active": 4, "recovery": 20,
          "damage": 18, "posture": 22, "hitbox": { "x": -6, "y": -58, "w": 112, "h": 40 },
          "knock": { "x": 8, "y": -2 }, "hitstun": 34, "hitstop": 10, "shake": 7,
          "lunge": 9, "next": null, "sfx": "iai", "heavy": true, "sheathe": true, "pts": 12,
          "swing": { "from": 160, "to": -10, "r": 98, "squash": 0.35, "py": -30 }, "pose": ["stance", "spinStrike"]
        },
        "HEAVY": [
          {
            "name": "거합 베기", "startup": 3, "active": 4, "recovery": 22,
            "damage": 26, "posture": 30, "hitbox": { "x": -6, "y": -60, "w": 124, "h": 50 },
            "knock": { "x": 8, "y": -2 }, "hitstun": 32, "hitstop": 9, "shake": 6,
            "lunge": 8, "sfx": "iai", "heavy": true, "sheathe": true,
            "swing": { "from": 165, "to": -15, "r": 110, "squash": 0.3, "py": -30 }, "pose": ["stance", "spinStrike"]
          },
          {
            "name": "거합 Lv1", "startup": 3, "active": 5, "recovery": 24,
            "damage": 44, "posture": 50, "hitbox": { "x": -6, "y": -62, "w": 174, "h": 52 },
            "knock": { "x": 12, "y": -3 }, "hitstun": 40, "hitstop": 12, "shake": 9,
            "lunge": 13, "sfx": "iai", "heavy": true, "sheathe": true,
            "swing": { "from": 165, "to": -15, "r": 150, "squash": 0.3, "py": -30 }, "pose": ["stance", "spinStrike"]
          },
          {
            "name": "극 발도 Lv2", "startup": 3, "active": 6, "recovery": 28,
            "damage": 72, "posture": 80, "hitbox": { "x": -6, "y": -66, "w": 234, "h": 56 },
            "knock": { "x": 16, "y": -5 }, "hitstun": 48, "hitstop": 16, "shake": 14,
            "lunge": 18, "sfx": "iai", "heavy": true, "sheathe": true, "impactFrame": true,
            "swing": { "from": 165, "to": -15, "r": 190, "squash": 0.3, "py": -30 }, "pose": ["stance", "spinStrike"]
          }
        ],
        "COUNTER_IAI": {
          "name": "거합 반격", "startup": 1, "active": 5, "recovery": 14,
          "damage": 30, "posture": 40, "hitbox": { "x": -10, "y": -64, "w": 132, "h": 60 },
          "knock": { "x": 7, "y": -2 }, "hitstun": 36, "hitstop": 10, "shake": 8,
          "lunge": 6, "sfx": "iai", "heavy": true, "sheathe": true, "pts": 25,
          "swing": { "from": 160, "to": -20, "r": 100, "squash": 0.35, "py": -30 }, "pose": ["stance", "spinStrike"]
        }
      }
    }
  },

  {
    "id": "sword_dual", "weapon": "sword", "name": "쌍검", "mech": "dual",
    "tagline": "멈추지 않을수록 빨라지는 칼날",
    "card": ["6타: 좌우 번갈아 베기 → 회전 전진", "맞힐수록 공격 속도↑ (최대 +60%)", "강공: 쌍월 베기 (다단)", "Q: 난무 (앞으로 나아가며 14연타)"],
    "changes": [
      "약공 6타: 오른손 사선 → 왼손 올려베기 → 오른손 수평 → 왼손 역수평 → 양손 X자 → 회전 전진(8히트) + X자 마무리",
      "적을 맞힐 때마다 공격 속도 +6% (최대 +60%, 후딜만 짧아짐). 0.75초 동안 못 맞히면 초기화",
      "6타 회전 중 A/D 로 방향 조절, 대시로 캔슬 가능 (슈퍼아머 없음)",
      "강공: 쌍월 베기 (두 칼로 2~3번 연속 베기)",
      "Q 난무: 앞으로 나아가며 쉴 새 없이 벤다 (14연타)"
    ],
    "preview": ["L1", "L2", "L3", "L4", "L5", "L6", "L6F"],
    "dual": { "rampMax": 10, "rampAspd": 6, "rampWindow": 45, "spinSpeed": 1.8, "spinSteer": 0.9 },
    "patch": {
      "blade": { "length": 32, "hand": 13, "w0": 2, "w1": 0.9, "guard": true, "dual": true, "restL": 150 },
      "dualTrail": {
        "R": { "glow": "#3ff", "outer": "60,235,240", "inner": "200,255,255" },
        "L": { "glow": "#8cf", "outer": "120,185,255", "inner": "215,235,255" }
      },
      "charge": { "framesPerLevel": 24, "staminaPerLevel": 14, "maxLevel": 1 },
      "speedMult": 1.1,
      "swapIn": {
        "name": "전환 · 쌍검 회오리", "startup": 3, "active": 9, "hold": 2, "recovery": 12,
        "damage": 6, "posture": 10, "hitbox": { "x": -72, "y": -66, "w": 144, "h": 66 }, "omni": true, "multiHit": { "interval": 3, "count": 3 },
        "knock": { "x": 3, "y": -2 }, "hitstun": 30, "hitstop": 4, "shake": 3,
        "lunge": 2, "sfx": "swingHeavy", "heavy": true, "pts": 20, "swapAttack": true, "spins": 2,
        "swing": { "from": 0, "to": -720, "r": 74, "squash": 0.32, "py": -30 }, "pose": ["spinWind", "spinStrike", "spinX"],
        "dual": {
          "R": { "from": 0, "to": -720, "r": 70, "squash": 0.32, "py": -30, "linear": true },
          "L": { "from": 180, "to": -540, "r": 70, "squash": 0.32, "py": -30, "linear": true }
        }
      },
      "skills": {
        "q": {
          "name": "난무", "kind": "move", "cooldown": 420, "desc": "앞으로 나아가며 쉴 새 없이 벤다 (14연타)",
          "move": {
            "name": "난무", "startup": 4, "active": 42, "recovery": 14,
            "damage": 3.5, "posture": 4, "hitbox": { "x": -40, "y": -66, "w": 124, "h": 66 }, "multiHit": { "interval": 3, "count": 14 },
            "knock": { "x": 1.5, "y": -0.5 }, "hitstun": 24, "hitstop": 2, "shake": 1,
            "lunge": 2, "sfx": "swing", "pts": 30, "skill": true, "special": "flurry", "spins": 5,
            "swing": { "from": 180, "to": -1620, "r": 64, "squash": 0.35, "py": -30 }, "pose": ["spinWind", "spinStrike", "spinX"],
            "dual": {
              "R": { "from": 180, "to": -1620, "r": 62, "squash": 0.35, "py": -30, "linear": true },
              "L": { "from": 0, "to": -1800, "r": 62, "squash": 0.35, "py": -34, "linear": true }
            }
          }
        }
      },
      "moves": {
        "L1": {
          "name": "오른손 사선 베기", "startup": 2, "active": 2, "hold": 3, "recovery": 8, "chainDelay": 0,
          "damage": 5, "hitbox": { "x": 0, "y": -64, "w": 58, "h": 56 },
          "knock": { "x": 1.4, "y": 0 }, "hitstun": 18, "hitstop": 3, "shake": 1,
          "lunge": 2, "next": "L2", "sfx": "swing", "pts": 4,
          "swing": { "from": -125, "to": 50, "r": 54, "squash": 1 }, "pose": ["cutWind", "cutStrike"],
          "dual": {
            "R": { "from": -125, "to": 50, "r": 54, "reach": 19 },
            "L": { "rest": 165, "reach": 11 }
          }
        },
        "L2": {
          "name": "왼손 올려베기", "startup": 2, "active": 2, "hold": 3, "recovery": 8, "chainDelay": 0,
          "damage": 5, "hitbox": { "x": 0, "y": -66, "w": 58, "h": 58 },
          "knock": { "x": 1.4, "y": -1 }, "hitstun": 18, "hitstop": 3, "shake": 1,
          "lunge": 2, "next": "L3", "sfx": "swing", "pts": 4,
          "swing": { "from": 80, "to": -115, "r": 54, "squash": 1 }, "pose": ["riseWind", "riseStrike"],
          "dual": {
            "R": { "rest": 170, "reach": 11 },
            "L": { "from": 80, "to": -115, "r": 54, "reach": 19 }
          }
        },
        "L3": {
          "name": "오른손 수평 베기", "startup": 2, "active": 2, "hold": 3, "recovery": 8, "chainDelay": 0,
          "damage": 6, "hitbox": { "x": -4, "y": -54, "w": 64, "h": 30 },
          "knock": { "x": 1.8, "y": 0 }, "hitstun": 20, "hitstop": 4, "shake": 2,
          "lunge": 2.2, "next": "L4", "sfx": "swing", "pts": 5,
          "swing": { "from": 175, "to": 10, "r": 58, "squash": 0.3, "py": -30 }, "pose": ["spinWind", "spinStrike"],
          "dual": {
            "R": { "from": 175, "to": 10, "r": 58, "squash": 0.3, "py": -30, "reach": 19 },
            "L": { "rest": 160, "reach": 11 }
          }
        },
        "L4": {
          "name": "왼손 역수평 베기", "startup": 2, "active": 2, "hold": 3, "recovery": 8, "chainDelay": 0,
          "damage": 6, "hitbox": { "x": -4, "y": -60, "w": 64, "h": 32 },
          "knock": { "x": 1.8, "y": 0 }, "hitstun": 20, "hitstop": 4, "shake": 2,
          "lunge": 2.2, "next": "L5", "sfx": "swing", "pts": 5,
          "swing": { "from": -10, "to": -185, "r": 58, "squash": 0.3, "py": -34 }, "pose": ["spinStrike", "spinWind"],
          "dual": {
            "R": { "rest": 165, "reach": 11 },
            "L": { "from": 15, "to": -175, "r": 58, "squash": 0.3, "py": -36, "reach": 19 }
          }
        },
        "L5": {
          "name": "양손 X자 교차 베기", "startup": 2, "active": 2, "hold": 3, "recovery": 9, "chainDelay": 0,
          "damage": 7, "posture": 9, "hitbox": { "x": -2, "y": -70, "w": 70, "h": 66 },
          "knock": { "x": 3, "y": -1 }, "hitstun": 24, "hitstop": 5, "shake": 3,
          "lunge": 4.5, "next": "L6", "sfx": "swingHeavy", "pts": 7,
          "swing": { "from": -130, "to": 45, "r": 60, "squash": 1 }, "pose": ["cutWind", "cutStrike"],
          "dual": {
            "R": { "from": -130, "to": 45, "r": 60, "reach": 19 },
            "L": { "from": 125, "to": -50, "r": 60, "reach": 19 }
          }
        },
        "L6": {
          "name": "쌍검 회전 전진", "startup": 4, "active": 48, "hold": 0, "recovery": 0,
          "damage": 3.5, "posture": 4, "hitbox": { "x": -48, "y": -64, "w": 96, "h": 64 }, "omni": true, "multiHit": { "interval": 6, "count": 8 },
          "knock": { "x": 1.2, "y": -0.5 }, "hitstun": 22, "hitstop": 2, "shake": 1,
          "lunge": 0, "next": null, "then": "L6F", "sfx": "swing", "pts": 4, "spins": 4,
          "special": "dualSpin", "dashCancel": true, "trailLife": 22,
          "swing": { "from": 0, "to": -1440, "r": 58, "squash": 0.35, "py": -30 }, "pose": ["crouch", "spinStrike", "spinX"],
          "dual": {
            "R": { "from": 0, "to": -1440, "r": 58, "squash": 0.35, "py": -30, "linear": true, "windAng": 70, "reach": 18 },
            "L": { "from": 180, "to": -1260, "r": 58, "squash": 0.35, "py": -30, "linear": true, "windAng": 20, "reach": 18 }
          }
        },
        "L6F": {
          "name": "X자 마무리", "startup": 2, "active": 3, "hold": 12, "recovery": 10,
          "damage": 14, "posture": 22, "hitbox": { "x": -6, "y": -72, "w": 88, "h": 72 },
          "knock": { "x": 12, "y": -4 }, "hitstun": 36, "hitstop": 14, "shake": 9,
          "lunge": 2, "next": null, "sfx": "swingHeavy", "heavy": true, "impactFrame": true, "pts": 12,
          "swing": { "from": -140, "to": 40, "r": 66, "squash": 1 }, "pose": ["crouch", "cutStrike"],
          "dual": {
            "R": { "from": -140, "to": 40, "r": 66, "hold": 0, "reach": 19 },
            "L": { "from": 140, "to": -40, "r": 66, "hold": 180, "reach": 19 }
          }
        },
        "HEAVY": [
          {
            "name": "쌍월 베기", "startup": 7, "active": 6, "hold": 3, "recovery": 16,
            "damage": 9, "posture": 12, "hitbox": { "x": -6, "y": -72, "w": 86, "h": 72 }, "multiHit": { "interval": 3, "count": 2 },
            "knock": { "x": 5, "y": -2 }, "hitstun": 30, "hitstop": 6, "shake": 5,
            "lunge": 3, "sfx": "swingHeavy", "heavy": true,
            "swing": { "from": -160, "to": 70, "r": 72, "squash": 1 }, "pose": ["cutWind", "cutStrike"],
            "dual": {
              "R": { "from": -160, "to": 70, "r": 72, "reach": 19 },
              "L": { "from": -120, "to": 95, "r": 66, "reach": 18 }
            }
          },
          {
            "name": "쌍월 베기 Lv1", "startup": 5, "active": 9, "hold": 3, "recovery": 18,
            "damage": 12, "posture": 16, "hitbox": { "x": -10, "y": -86, "w": 104, "h": 86 }, "multiHit": { "interval": 3, "count": 3 },
            "knock": { "x": 9, "y": -3 }, "hitstun": 36, "hitstop": 8, "shake": 8,
            "lunge": 4, "sfx": "swingHeavy", "heavy": true,
            "swing": { "from": -170, "to": 80, "r": 88, "squash": 1 }, "pose": ["cutWind", "cutStrike"],
            "dual": {
              "R": { "from": -170, "to": 80, "r": 88, "reach": 19 },
              "L": { "from": -130, "to": 110, "r": 80, "reach": 18 }
            }
          }
        ]
      }
    }
  },

  {
    "id": "sword_chain", "weapon": "sword", "name": "사슬검", "mech": "chain",
    "tagline": "늦게 따라와 휘감기는 쇠사슬 칼날",
    "card": ["사거리 길고 칼날이 늦게 따라와 휘감김", "우클릭: 마우스 조준 → 던지기, 박히면 당김", "Q: 조준 포박 → 회전 → Q 로 조준 투척", "던진 적이 벽에 부딪히면 벽꽝"],
    "changes": [
      "손이 먼저 움직이고 칼날은 늦게 출발해 급가속 → 지나쳤다 튕기듯 돌아옴. 사슬은 속도만큼 휘어 보임",
      "약공 3타: 몸 뒤 → 앞 수평 → 머리 위 큰 호에서 멈칫 후 내리꽂기 (착지 충격파) → 몸 주변 2바퀴 회전 (다단히트)",
      "우클릭: 누르는 동안 마우스 방향 조준 → 떼면 사슬 던지기 (3타 회전 중 우클릭이면 바로 더 멀리). 적·벽에 박힌 뒤 우클릭 유지: 끌어오기 / 그쪽으로 날아감",
      "Q 포박: 누르면 조준(0.5배속, 최대 1.5초) → 떼면 발사. 맞은 적은 묶여 주변을 회전 → Q 다시 누르면 투척 조준(예측선) → 떼면 투척 (2초 지나면 자동)",
      "던진 적: 경로의 적과 부딪히면 둘 다 피해·체간 / 벽에 부딪히면 벽꽝 (큰 피해·기절). 보스·중갑병은 묶이지 않고 체간만 크게"
    ],
    "preview": ["L1", "L2", "L3", "HEAVY0"],
    "aim": { "range": 330, "bindSlow": 0.5, "bindAimSec": 1.5, "visLerp": 0.25 },
    "chain": {
      "nodes": 14, "length": 150, "idleLength": 24, "bladeMass": 3, "gravity": 0.34, "idleDrag": 0.9, "iterations": 14, "groundFriction": 0.8,
      "handRest": [9, -30], "handR": 20, "pivot": [2, -32], "blendFrames": 3, "genericReach": 110,
      "hitRadius": 16, "crackSpeed": 24, "blurSpeed": 12,
      "curveK": 2.2, "curveMax": 46, "embedSag": 18,
      "retract": 9, "reelSpeed": 5, "minLen": 46, "embedFrames": 90, "zipSpeed": 10,
      "linkGap": 5, "bladeTip": 16, "bladeBack": 7, "jingleSpeed": 3, "jingleLoud": 30
    },
    "patch": {
      "blade": { "length": 40, "hand": 14, "w0": 2.4, "w1": 1.1, "guard": true, "chain": true },
      "charge": { "framesPerLevel": 28, "staminaPerLevel": 18, "maxLevel": 0 },
      "instantHeavy": true,
      "speedMult": 0.95,
      "swapIn": {
        "name": "전환 · 사슬 회전", "startup": 3, "active": 18, "recovery": 12,
        "damage": 14, "posture": 18, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 }, "omni": true,
        "knock": { "x": 4, "y": -2.5 }, "hitstun": 32, "hitstop": 7, "shake": 5,
        "lunge": 1, "sfx": "chain", "heavy": true, "pts": 20, "swapAttack": true, "rehit": 99, "taut": true,
        "swing": { "from": 0, "to": -360, "r": 60, "squash": 0.3, "py": -30 }, "pose": ["spinWind", "spinStrike", "spinX"],
        "hand": { "circle": { "start": 3, "end": 21, "cx": 2, "cy": -40, "r": 18, "turns": 1, "a0": 180, "after": 8 } },
        "blade": { "pivot": [0, -40], "keys": [
          { "f": 0, "a": 110, "r": 30 }, { "f": 3, "a": 180, "r": 90, "sq": 0.4, "e": "slow" },
          { "f": 21, "a": -180, "r": 140, "sq": 0.4, "e": "lin" }, { "f": 33, "a": -270, "r": 40, "e": "slow" } ] }
      },
      "skills": {
        "q": {
          "name": "포박", "kind": "aimBind", "cooldown": 480, "desc": "Q 누름: 조준(0.5배속) → 뗌: 사슬 발사. 묶은 뒤 Q 누름: 투척 조준 → 뗌: 투척",
          "move": {
            "name": "포박", "startup": 7, "active": 7, "recovery": 24,
            "damage": 6, "posture": 10, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 },
            "knock": { "x": 0, "y": 0 }, "hitstun": 60, "hitstop": 6, "shake": 3,
            "lunge": 0, "sfx": "chain", "pts": 20, "skill": true, "special": "bind", "throw": true,
            "swing": { "from": 0, "to": 0, "r": 60 }, "pose": ["thrustWind", "thrustStrike"],
            "hand": { "keys": [[0, 9, -30], [4, -14, -34], [7, 24, -34], [24, 24, -32], [32, 9, -30]] },
            "blade": { "keys": [
              { "f": 0, "a": 110, "r": 30 }, { "f": 4, "a": 170, "r": 45, "e": "slow" }, { "f": 7, "x": -30, "y": 0, "e": "slow" },
              { "f": 14, "x": 330, "y": 0, "e": "whip", "o": 0.05, "fx": "tang" }, { "f": 24, "x": 290, "y": 14, "e": "slow" },
              { "f": 38, "x": 40, "y": 24, "e": "slow" } ] }
          },
          "bind": { "orbitSpeed": 0.16, "radius": 66, "autoThrowSec": 2, "throwSpeed": 18, "gravity": 0.12, "maxFlight": 60,
            "damage": 30, "posture": 30, "wallDamage": 55, "wallPosture": 45, "wallStun": 90, "landDamage": 10,
            "heavyPosture": 70, "bossPosture": 60 }
        }
      },
      "moves": {
        "L1": {
          "name": "수평 휘두르기", "startup": 8, "active": 7, "recovery": 19,
          "damage": 13, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 },
          "knock": { "x": 4, "y": -1 }, "hitstun": 26, "hitstop": 6, "shake": 3,
          "lunge": 1, "next": "L2", "sfx": "chain", "pts": 6,
          "swing": { "from": 160, "to": 0, "r": 60, "squash": 0.5 }, "pose": ["spinWind", "cutStrike"],
          "hand": { "keys": [[0, 9, -30], [4, -16, -38], [8, 26, -32], [9, 28, -32], [30, 24, -32], [34, 9, -30]] },
          "blade": { "keys": [
            { "f": 0, "a": 110, "r": 30 }, { "f": 5, "a": 170, "r": 60, "sq": 0.6, "e": "slow" }, { "f": 8, "a": 182, "r": 80, "sq": 0.3, "e": "slow" },
            { "f": 15, "a": 362, "r": 150, "sq": 0.3, "e": "whip", "o": 0.1 }, { "f": 24, "a": 380, "r": 130, "sq": 0.5, "e": "slow" },
            { "f": 34, "a": 440, "r": 40, "e": "slow" } ] }
        },
        "L2": {
          "name": "내려치기", "startup": 15, "active": 7, "recovery": 18,
          "damage": 16, "posture": 16, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 },
          "knock": { "x": 3, "y": -2 }, "hitstun": 30, "hitstop": 8, "shake": 5,
          "lunge": 1, "next": "L3", "sfx": "chain", "heavy": true, "pts": 8,
          "swing": { "from": -100, "to": 60, "r": 60 }, "pose": ["riseStrike", "cutStrike"],
          "hand": { "keys": [[0, 9, -30], [5, -8, -22], [10, -2, -70], [13, -2, -70], [15, 30, -36], [16, 31, -35], [36, 26, -32], [40, 9, -30]] },
          "blade": { "keys": [
            { "f": 0, "a": 110, "r": 30 }, { "f": 6, "a": 150, "r": 50, "e": "slow" }, { "f": 13, "a": 265, "r": 118, "e": "slow" },
            { "f": 15, "a": 265, "r": 118, "e": "hold" }, { "f": 22, "a": 375, "r": 122, "e": "whip", "o": 0.05, "fx": "impact" },
            { "f": 30, "a": 380, "r": 118, "e": "slow" }, { "f": 40, "a": 450, "r": 40, "e": "slow" } ] },
          "impact": { "damage": 10, "radius": 60, "posture": 12 }
        },
        "L3": {
          "name": "몸 주변 회전", "startup": 4, "active": 40, "recovery": 12,
          "damage": 9, "posture": 8, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 }, "omni": true,
          "knock": { "x": 3, "y": -2 }, "hitstun": 24, "hitstop": 4, "shake": 2,
          "lunge": 0, "next": null, "sfx": "chain", "pts": 6, "rehit": 10, "spinRelease": true, "taut": true,
          "swing": { "from": 180, "to": -540, "r": 60, "squash": 0.3, "py": -40 }, "pose": ["riseWind", "riseStrike"],
          "hand": { "circle": { "start": 4, "end": 44, "cx": 0, "cy": -56, "r": 14, "turns": 2, "a0": 180, "squash": 0.6, "after": 10 } },
          "blade": { "pivot": [0, -50], "keys": [
            { "f": 0, "a": 110, "r": 30 }, { "f": 4, "a": 180, "r": 80, "sq": 0.45, "e": "slow" },
            { "f": 44, "a": -540, "r": 112, "sq": 0.45, "e": "lin" }, { "f": 56, "a": -630, "r": 40, "e": "slow" } ] }
        },
        "THRUST": {
          "name": "사슬 던지기", "startup": 7, "active": 7, "recovery": 22,
          "damage": 16, "posture": 14, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 },
          "knock": { "x": 2, "y": -1 }, "hitstun": 40, "hitstop": 7, "shake": 4,
          "lunge": 0, "next": null, "sfx": "chain", "heavy": true, "pts": 10, "throw": true,
          "swing": { "from": 0, "to": 0, "r": 60 }, "pose": ["thrustWind", "thrustStrike"],
          "hand": { "keys": [[0, 9, -30], [4, -14, -34], [7, 24, -34], [28, 24, -32], [36, 9, -30]] },
          "blade": { "keys": [
            { "f": 0, "a": 110, "r": 30 }, { "f": 4, "a": 170, "r": 45, "e": "slow" }, { "f": 7, "x": -30, "y": 0, "e": "slow" },
            { "f": 14, "x": 330, "y": 0, "e": "whip", "o": 0.05, "fx": "tang" }, { "f": 24, "x": 300, "y": 16, "e": "slow" },
            { "f": 36, "x": 50, "y": 24, "e": "slow" } ] }
        },
        "A1": {
          "name": "공중 휘두르기", "startup": 5, "active": 7, "recovery": 14, "air": true,
          "damage": 10, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 },
          "knock": { "x": 1.2, "y": -4.2 }, "hitstun": 30, "hitstop": 4, "shake": 2,
          "lunge": 1, "next": "A2", "sfx": "chain",
          "swing": { "from": -110, "to": 50, "r": 60 }, "pose": ["airWind", "airStrike"],
          "hand": { "keys": [[0, 9, -30], [3, -16, -46], [6, 26, -22], [7, 27, -22], [26, 9, -30]] },
          "blade": { "keys": [
            { "f": 0, "a": 110, "r": 30 }, { "f": 5, "a": 210, "r": 70, "e": "slow" },
            { "f": 12, "a": 400, "r": 140, "e": "whip", "o": 0.1 }, { "f": 26, "a": 450, "r": 40, "e": "slow" } ] }
        },
        "A2": {
          "name": "공중 올려치기", "startup": 5, "active": 7, "recovery": 14, "air": true,
          "damage": 11, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 },
          "knock": { "x": 1.4, "y": -4.4 }, "hitstun": 30, "hitstop": 4, "shake": 2,
          "lunge": 1, "next": null, "sfx": "chain",
          "swing": { "from": 70, "to": -110, "r": 60 }, "pose": ["airRiseWind", "airRiseStrike"],
          "hand": { "keys": [[0, 9, -30], [3, -14, -10], [6, 24, -56], [7, 25, -57], [26, 9, -30]] },
          "blade": { "keys": [
            { "f": 0, "a": 110, "r": 30 }, { "f": 5, "a": 150, "r": 60, "e": "slow" },
            { "f": 12, "a": -70, "r": 140, "e": "whip", "o": 0.1 }, { "f": 26, "a": -270, "r": 40, "e": "slow" } ] }
        },
        "HEAVY": [
          {
            "name": "사슬 던지기", "startup": 7, "active": 7, "recovery": 22,
            "damage": 16, "posture": 14, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 },
            "knock": { "x": 2, "y": -1 }, "hitstun": 40, "hitstop": 7, "shake": 4,
            "lunge": 0, "sfx": "chain", "heavy": true, "throw": true,
            "swing": { "from": 0, "to": 0, "r": 60 }, "pose": ["thrustWind", "thrustStrike"],
            "hand": { "keys": [[0, 9, -30], [4, -14, -34], [7, 24, -34], [28, 24, -32], [36, 9, -30]] },
            "blade": { "keys": [
              { "f": 0, "a": 110, "r": 30 }, { "f": 4, "a": 170, "r": 45, "e": "slow" }, { "f": 7, "x": -30, "y": 0, "e": "slow" },
              { "f": 14, "x": 330, "y": 0, "e": "whip", "o": 0.05, "fx": "tang" }, { "f": 24, "x": 300, "y": 16, "e": "slow" },
              { "f": 36, "x": 50, "y": 24, "e": "slow" } ] }
          }
        ],
        "HEAVY_SPIN": {
          "name": "회전 던지기", "startup": 1, "active": 7, "recovery": 22,
          "damage": 22, "posture": 20, "hitbox": { "x": 0, "y": -40, "w": 1, "h": 1 },
          "knock": { "x": 4, "y": -2 }, "hitstun": 44, "hitstop": 9, "shake": 6,
          "lunge": 0, "sfx": "chain", "heavy": true, "pts": 14, "throw": true,
          "swing": { "from": 0, "to": 0, "r": 60 }, "pose": ["thrustWind", "thrustStrike"],
          "hand": { "keys": [[0, 0, -54], [3, 26, -40], [22, 24, -34], [30, 9, -30]] },
          "blade": { "keys": [
            { "f": 0, "x": -10, "y": -40 }, { "f": 1, "x": -10, "y": -40, "e": "slow" },
            { "f": 8, "x": 350, "y": 0, "e": "whip", "o": 0.05, "fx": "tang" }, { "f": 18, "x": 320, "y": 16, "e": "slow" },
            { "f": 30, "x": 50, "y": 24, "e": "slow" } ] }
        }
      }
    }
  }
];

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
    "card": ["약공 6타 초고속 콤보", "맞힐수록 공격 속도↑ (최대 +60%)", "강공: 쌍월 베기 (다단)", "Q: 난무 (앞으로 나아가며 14연타)"],
    "changes": [
      "약공 6타: 아주 빠른 쌍검 콤보 (마지막 십자 베기)",
      "적을 맞힐 때마다 공격 속도 +6% (최대 +60%). 0.75초 동안 못 맞히면 초기화",
      "강공: 쌍월 베기 (두 칼로 2~3번 연속 베기)",
      "Q 난무: 앞으로 나아가며 쉴 새 없이 벤다 (14연타)"
    ],
    "preview": ["L1", "L2", "L3", "L4", "L5", "L6"],
    "dual": { "rampMax": 10, "rampAspd": 6, "rampWindow": 45 },
    "patch": {
      "blade": { "length": 32, "hand": 13, "w0": 2, "w1": 0.9, "guard": true, "dual": true },
      "charge": { "framesPerLevel": 24, "staminaPerLevel": 14, "maxLevel": 1 },
      "speedMult": 1.1,
      "swapIn": {
        "name": "전환 · 쌍검 회오리", "startup": 3, "active": 9, "recovery": 12,
        "damage": 6, "posture": 10, "hitbox": { "x": -72, "y": -66, "w": 144, "h": 66 }, "omni": true, "multiHit": { "interval": 3, "count": 3 },
        "knock": { "x": 3, "y": -2 }, "hitstun": 30, "hitstop": 4, "shake": 3,
        "lunge": 2, "sfx": "swingHeavy", "heavy": true, "pts": 20, "swapAttack": true, "spins": 2,
        "swing": { "from": 0, "to": -720, "r": 74, "squash": 0.32, "py": -30 }, "pose": ["spinWind", "spinStrike", "spinX"]
      },
      "skills": {
        "q": {
          "name": "난무", "kind": "move", "cooldown": 420, "desc": "앞으로 나아가며 쉴 새 없이 벤다 (14연타)",
          "move": {
            "name": "난무", "startup": 4, "active": 42, "recovery": 14,
            "damage": 3.5, "posture": 4, "hitbox": { "x": -40, "y": -66, "w": 124, "h": 66 }, "multiHit": { "interval": 3, "count": 14 },
            "knock": { "x": 1.5, "y": -0.5 }, "hitstun": 24, "hitstop": 2, "shake": 1,
            "lunge": 2, "sfx": "swing", "pts": 30, "skill": true, "special": "flurry", "spins": 5,
            "swing": { "from": 180, "to": -1620, "r": 64, "squash": 0.35, "py": -30 }, "pose": ["spinWind", "spinStrike", "spinX"]
          }
        }
      },
      "moves": {
        "L1": {
          "name": "쌍검 베기", "startup": 2, "active": 2, "recovery": 7, "chainDelay": 1,
          "damage": 5, "hitbox": { "x": 2, "y": -56, "w": 56, "h": 44 },
          "knock": { "x": 1.4, "y": 0 }, "hitstun": 18, "hitstop": 3, "shake": 1,
          "lunge": 2, "next": "L2", "sfx": "swing", "pts": 4,
          "swing": { "from": -110, "to": 40, "r": 52, "squash": 1 }, "pose": ["cutWind", "cutStrike"]
        },
        "L2": {
          "name": "쌍검 올려베기", "startup": 2, "active": 2, "recovery": 7, "chainDelay": 1,
          "damage": 5, "hitbox": { "x": 2, "y": -60, "w": 56, "h": 50 },
          "knock": { "x": 1.4, "y": 0 }, "hitstun": 18, "hitstop": 3, "shake": 1,
          "lunge": 2, "next": "L3", "sfx": "swing", "pts": 4,
          "swing": { "from": 60, "to": -110, "r": 54, "squash": 1 }, "pose": ["riseWind", "riseStrike"]
        },
        "L3": {
          "name": "교차 베기", "startup": 3, "active": 3, "recovery": 8, "chainDelay": 1,
          "damage": 6, "hitbox": { "x": -2, "y": -58, "w": 62, "h": 46 },
          "knock": { "x": 1.8, "y": 0 }, "hitstun": 20, "hitstop": 4, "shake": 2,
          "lunge": 2.2, "next": "L4", "sfx": "swing", "pts": 5,
          "swing": { "from": -70, "to": 70, "r": 56, "squash": 0.55, "py": -32 }, "pose": ["cutWind", "cutStrike"]
        },
        "L4": {
          "name": "회전 쌍격", "startup": 3, "active": 4, "recovery": 8, "chainDelay": 1,
          "damage": 6, "hitbox": { "x": -52, "y": -52, "w": 108, "h": 38 }, "omni": true,
          "knock": { "x": 2, "y": 0 }, "hitstun": 20, "hitstop": 4, "shake": 2,
          "lunge": 2.4, "next": "L5", "sfx": "swing", "pts": 6,
          "swing": { "from": 180, "to": -180, "r": 58, "squash": 0.28, "py": -26 }, "pose": ["spinWind", "spinStrike", "spinX"]
        },
        "L5": {
          "name": "연속 찌르기", "startup": 3, "active": 9, "recovery": 8, "chainDelay": 1,
          "damage": 4, "hitbox": { "x": 4, "y": -46, "w": 66, "h": 22 }, "multiHit": { "interval": 3, "count": 3 },
          "knock": { "x": 1, "y": 0 }, "hitstun": 20, "hitstop": 2, "shake": 1,
          "lunge": 1.6, "next": "L6", "sfx": "swing", "pts": 6,
          "swing": { "thrust": true, "r": 66, "from": 0, "to": 0 }, "pose": ["thrustWind", "thrustStrike", "rapid"]
        },
        "L6": {
          "name": "십자 베기", "startup": 6, "active": 4, "recovery": 16,
          "damage": 13, "posture": 16, "hitbox": { "x": -4, "y": -72, "w": 82, "h": 72 },
          "knock": { "x": 7, "y": -3 }, "hitstun": 30, "hitstop": 8, "shake": 6,
          "lunge": 4, "next": null, "sfx": "swingHeavy", "heavy": true, "pts": 10,
          "swing": { "from": -160, "to": 70, "r": 68, "squash": 1 }, "pose": ["cutWind", "cutStrike"]
        },
        "HEAVY": [
          {
            "name": "쌍월 베기", "startup": 7, "active": 6, "recovery": 18,
            "damage": 9, "posture": 12, "hitbox": { "x": -6, "y": -72, "w": 86, "h": 72 }, "multiHit": { "interval": 3, "count": 2 },
            "knock": { "x": 5, "y": -2 }, "hitstun": 30, "hitstop": 6, "shake": 5,
            "lunge": 3, "sfx": "swingHeavy", "heavy": true,
            "swing": { "from": -160, "to": 70, "r": 72, "squash": 1 }, "pose": ["cutWind", "cutStrike"]
          },
          {
            "name": "쌍월 베기 Lv1", "startup": 5, "active": 9, "recovery": 20,
            "damage": 12, "posture": 16, "hitbox": { "x": -10, "y": -86, "w": 104, "h": 86 }, "multiHit": { "interval": 3, "count": 3 },
            "knock": { "x": 9, "y": -3 }, "hitstun": 36, "hitstop": 8, "shake": 8,
            "lunge": 4, "sfx": "swingHeavy", "heavy": true,
            "swing": { "from": -170, "to": 80, "r": 88, "squash": 1 }, "pose": ["cutWind", "cutStrike"]
          }
        ]
      }
    }
  },

  {
    "id": "sword_chain", "weapon": "sword", "name": "사슬검", "mech": "chain",
    "tagline": "멀리서 휘감는 쇠사슬 칼날",
    "card": ["사거리 3배, 대신 느림", "강공: 적을 끌어당김 / 벽으로 날아감", "Q: 포박 (묶어서 휘두른 뒤 던짐)"],
    "changes": [
      "약공 3타: 사슬로 휘두르는 긴 공격 (사거리 약 3배, 느림). 마지막 타는 360° 회전",
      "강공: 사슬 당기기 — 맞은 적을 내 앞으로 끌어옴 (보스는 내가 끌려감). 적이 없고 앞에 벽이 있으면 벽으로 날아감",
      "Q 포박: 적을 사슬로 묶어 크게 휘두른 뒤 가까운 다른 적에게 던진다 (둘 다 피해)"
    ],
    "preview": ["L1", "L2", "L3", "HEAVY0"],
    "chain": { "pullRange": 260, "zipVx": 15, "zipVy": -7 },
    "patch": {
      "blade": { "length": 40, "hand": 14, "w0": 2.4, "w1": 1.1, "guard": true, "chain": true },
      "charge": { "framesPerLevel": 28, "staminaPerLevel": 18, "maxLevel": 0 },
      "speedMult": 0.95,
      "swapIn": {
        "name": "전환 · 사슬 회전", "startup": 4, "active": 7, "recovery": 14,
        "damage": 14, "posture": 18, "hitbox": { "x": -170, "y": -64, "w": 340, "h": 60 }, "omni": true,
        "knock": { "x": 4, "y": -2.5 }, "hitstun": 32, "hitstop": 7, "shake": 5,
        "lunge": 1, "sfx": "chain", "heavy": true, "pts": 20, "swapAttack": true,
        "swing": { "from": 0, "to": -360, "r": 175, "squash": 0.3, "py": -30 }, "pose": ["spinWind", "spinStrike", "spinX"]
      },
      "skills": {
        "q": {
          "name": "포박", "kind": "move", "cooldown": 480, "desc": "사슬로 적을 묶어 휘두른 뒤 다른 적에게 던진다",
          "move": {
            "name": "포박", "startup": 8, "active": 6, "recovery": 14,
            "damage": 6, "posture": 10, "hitbox": { "x": 4, "y": -62, "w": 244, "h": 46 },
            "knock": { "x": 0, "y": 0 }, "hitstun": 60, "hitstop": 6, "shake": 3,
            "lunge": 0, "sfx": "chain", "pts": 20, "skill": true, "special": "bind",
            "swing": { "thrust": true, "r": 244, "from": 0, "to": 0 }, "pose": ["thrustWind", "thrustStrike"]
          },
          "bind": { "spinFrames": 40, "radius": 66, "throwSpeed": 17, "damage": 30, "posture": 30, "bossDamage": 20, "bossPosture": 30 }
        }
      },
      "moves": {
        "L1": {
          "name": "사슬 휘두르기", "startup": 9, "active": 5, "recovery": 16,
          "damage": 11, "hitbox": { "x": 10, "y": -74, "w": 172, "h": 64 },
          "knock": { "x": 3, "y": 0 }, "hitstun": 24, "hitstop": 5, "shake": 3,
          "lunge": 1, "next": "L2", "sfx": "chain", "pts": 6,
          "swing": { "from": -100, "to": 30, "r": 176, "squash": 0.55, "py": -34 }, "pose": ["cutWind", "cutStrike"]
        },
        "L2": {
          "name": "되감아 치기", "startup": 8, "active": 5, "recovery": 16,
          "damage": 11, "hitbox": { "x": 10, "y": -80, "w": 172, "h": 70 },
          "knock": { "x": 3, "y": -1 }, "hitstun": 24, "hitstop": 5, "shake": 3,
          "lunge": 1, "next": "L3", "sfx": "chain", "pts": 6,
          "swing": { "from": 40, "to": -110, "r": 176, "squash": 0.55, "py": -34 }, "pose": ["riseWind", "riseStrike"]
        },
        "L3": {
          "name": "사슬 회전", "startup": 10, "active": 8, "recovery": 22,
          "damage": 15, "posture": 18, "hitbox": { "x": -178, "y": -62, "w": 356, "h": 58 }, "omni": true,
          "knock": { "x": 5, "y": -2 }, "hitstun": 30, "hitstop": 8, "shake": 6,
          "lunge": 0, "next": null, "sfx": "chain", "heavy": true, "pts": 10,
          "swing": { "from": 180, "to": -180, "r": 180, "squash": 0.25, "py": -26 }, "pose": ["spinWind", "spinStrike", "spinX"]
        },
        "THRUST": {
          "name": "사슬 찌르기", "startup": 10, "active": 6, "recovery": 20,
          "damage": 18, "hitbox": { "x": 4, "y": -42, "w": 214, "h": 22 },
          "knock": { "x": 7, "y": -1 }, "hitstun": 30, "hitstop": 7, "shake": 5,
          "lunge": 3, "next": null, "sfx": "chain", "heavy": true, "pts": 10,
          "swing": { "thrust": true, "r": 214, "from": 0, "to": 0 }, "pose": ["thrustWind", "thrustStrike"]
        },
        "A1": {
          "name": "공중 사슬 1", "startup": 6, "active": 4, "recovery": 14, "air": true,
          "damage": 9, "hitbox": { "x": -4, "y": -90, "w": 150, "h": 100 },
          "knock": { "x": 1.2, "y": -4.2 }, "hitstun": 30, "hitstop": 4, "shake": 2,
          "lunge": 1, "next": "A2", "sfx": "chain",
          "swing": { "from": -110, "to": 50, "r": 150, "squash": 0.7 }, "pose": ["airWind", "airStrike"]
        },
        "A2": {
          "name": "공중 사슬 2", "startup": 6, "active": 4, "recovery": 14, "air": true,
          "damage": 10, "hitbox": { "x": -4, "y": -96, "w": 150, "h": 104 },
          "knock": { "x": 1.4, "y": -4.4 }, "hitstun": 30, "hitstop": 4, "shake": 2,
          "lunge": 1, "next": null, "sfx": "chain",
          "swing": { "from": 70, "to": -110, "r": 150, "squash": 0.7 }, "pose": ["airRiseWind", "airRiseStrike"]
        },
        "HEAVY": [
          {
            "name": "사슬 당기기", "startup": 8, "active": 6, "recovery": 18,
            "damage": 8, "posture": 10, "hitbox": { "x": 4, "y": -58, "w": 262, "h": 36 },
            "knock": { "x": 0, "y": 0 }, "hitstun": 34, "hitstop": 6, "shake": 3,
            "lunge": 0, "sfx": "chain", "heavy": true, "special": "pull",
            "swing": { "thrust": true, "r": 262, "from": 0, "to": 0 }, "pose": ["thrustWind", "thrustStrike"]
          }
        ]
      }
    }
  }
];

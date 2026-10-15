'use strict';
// 적 데이터. 키 = 적 종류 이름 (던전 층 데이터 pools 에서 이 이름으로 부름)
// 공통: hp, posture(체간 최대치), speed(이동), accel, aggroRange(인식 거리), weight(넉백 저항), friction
// shield / flying / superArmor: 특수 성질, look: 그래픽 (body 체형 / weapon 무기)
// attacks: 공격 목록 — kind: melee | rush | dive | shoot, parryable: true=노랑(패링 가능) false=빨강
//   range: 사거리, telegraphMs: 예고→타격 시간(ms), active/recovery/cooldown: 프레임, damage, hitbox, knock, weight: 고를 확률
// (= 뒤는 순수 JSON. 브라우저가 file:// 에서 .json 을 못 읽어서 이 한 줄로 감쌌다)
DATA.enemies = {
  "grunt": {
    "name": "근접 잡몹",
    "width": 26,
    "height": 46,
    "hp": 70,
    "posture": 100,
    "speed": 1.7,
    "accel": 0.25,
    "aggroRange": 520,
    "weight": 1,
    "friction": 0.82,
    "look": {"body":"grunt","weapon":"blade"},
    "attacks": [
      {
        "id": "slash",
        "kind": "melee",
        "parryable": true,
        "range": 56,
        "telegraphMs": 500,
        "active": 6,
        "recovery": 32,
        "cooldown": 55,
        "lunge": 3.5,
        "damage": 12,
        "hitbox": {"x":4,"y":-40,"w":50,"h":32},
        "knock": {"x":6,"y":-3.5}
      }
    ]
  },
  "shield": {
    "name": "방패병",
    "width": 28,
    "height": 48,
    "hp": 90,
    "posture": 110,
    "speed": 1.2,
    "accel": 0.2,
    "aggroRange": 480,
    "weight": 1.6,
    "friction": 0.8,
    "shield": true,
    "turnDelay": 40,
    "blockPush": 3.5,
    "look": {"body":"grunt","weapon":"shield"},
    "attacks": [
      {
        "id": "bash",
        "kind": "melee",
        "parryable": true,
        "range": 50,
        "telegraphMs": 480,
        "active": 6,
        "recovery": 34,
        "cooldown": 70,
        "lunge": 4.5,
        "damage": 10,
        "hitbox": {"x":4,"y":-46,"w":40,"h":44},
        "knock": {"x":9,"y":-2}
      }
    ]
  },
  "flyer": {
    "name": "비행형",
    "width": 24,
    "height": 36,
    "hp": 50,
    "posture": 80,
    "speed": 2.4,
    "accel": 0.18,
    "aggroRange": 560,
    "weight": 0.8,
    "friction": 0.9,
    "flying": true,
    "hoverHeight": 150,
    "hoverSide": 120,
    "look": {"body":"flyer","weapon":"claws"},
    "attacks": [
      {
        "id": "dive",
        "kind": "dive",
        "parryable": false,
        "range": 230,
        "telegraphMs": 600,
        "active": 40,
        "recovery": 40,
        "cooldown": 90,
        "diveSpeed": 9,
        "damage": 12,
        "hitbox": {"x":-14,"y":-40,"w":28,"h":44},
        "knock": {"x":6,"y":-4}
      }
    ]
  },
  "heavy": {
    "name": "중갑병",
    "width": 34,
    "height": 58,
    "hp": 260,
    "posture": 150,
    "speed": 0.9,
    "accel": 0.12,
    "aggroRange": 480,
    "weight": 2.5,
    "friction": 0.78,
    "superArmor": true,
    "look": {"body":"heavy","weapon":"hammer"},
    "attacks": [
      {
        "id": "smash",
        "kind": "melee",
        "parryable": true,
        "range": 84,
        "weight": 3,
        "telegraphMs": 680,
        "active": 7,
        "recovery": 40,
        "cooldown": 70,
        "lunge": 3,
        "damage": 22,
        "hitbox": {"x":0,"y":-70,"w":80,"h":70},
        "knock": {"x":9,"y":-5}
      },
      {
        "id": "sweep",
        "kind": "melee",
        "parryable": false,
        "range": 84,
        "weight": 1,
        "telegraphMs": 850,
        "active": 9,
        "recovery": 44,
        "cooldown": 80,
        "lunge": 2,
        "damage": 26,
        "hitbox": {"x":-20,"y":-34,"w":120,"h":34},
        "knock": {"x":11,"y":-6}
      }
    ]
  },
  "archer": {
    "name": "원거리형",
    "width": 22,
    "height": 44,
    "hp": 45,
    "posture": 70,
    "speed": 1.6,
    "accel": 0.22,
    "aggroRange": 620,
    "weight": 0.9,
    "friction": 0.82,
    "keepMin": 200,
    "keepMax": 360,
    "look": {"body":"slim","weapon":"bow"},
    "attacks": [
      {
        "id": "shot",
        "kind": "shoot",
        "parryable": true,
        "range": 460,
        "telegraphMs": 680,
        "active": 4,
        "recovery": 30,
        "cooldown": 80,
        "damage": 11,
        "projectile": {"speed":6.5,"radius":6,"life":150,"reflectMult":1.6,"reflectDamage":30}
      }
    ]
  },
  "dummy": {
    "name": "허수아비",
    "practiceOnly": true,
    "width": 26,
    "height": 50,
    "hp": 400,
    "posture": 120,
    "speed": 0,
    "accel": 0,
    "aggroRange": 0,
    "weight": 1.1,
    "friction": 0.8,
    "dummy": true,
    "look": {"body":"dummy","weapon":"none"},
    "attackAggro": 260,
    "attacks": [
      {
        "id": "slash",
        "kind": "melee",
        "parryable": true,
        "range": 70,
        "telegraphMs": 520,
        "active": 6,
        "recovery": 30,
        "cooldown": 70,
        "lunge": 0,
        "damage": 6,
        "hitbox": {"x":0,"y":-44,"w":66,"h":36},
        "knock": {"x":4,"y":-2}
      }
    ]
  },
  "charger": {
    "name": "돌진형",
    "width": 30,
    "height": 46,
    "hp": 110,
    "posture": 120,
    "speed": 1.3,
    "accel": 0.2,
    "aggroRange": 640,
    "weight": 1.4,
    "friction": 0.82,
    "look": {"body":"grunt","weapon":"horns"},
    "attacks": [
      {
        "id": "rush",
        "kind": "rush",
        "parryable": false,
        "range": 420,
        "telegraphMs": 760,
        "active": 150,
        "recovery": 36,
        "cooldown": 100,
        "rushSpeed": 10.5,
        "wallStun": 150,
        "wallPosture": 0.6,
        "damage": 18,
        "hitbox": {"x":-6,"y":-44,"w":36,"h":42},
        "knock": {"x":10,"y":-5}
      }
    ]
  }
};

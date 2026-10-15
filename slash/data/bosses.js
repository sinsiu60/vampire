'use strict';
// 보스 데이터
// patterns: 보스 패턴 기본값 (키 = 패턴 이름, 코드의 pat_<이름> 과 짝). 보스마다 bosses.<id>.patterns 에서 일부만 덮어씀
//   telegraphMs: 예고→타격 (2페이즈에선 boss.phase2Speed 배 빨라짐), parryable / telegraph:"white"(간파), phase2: 2페이즈 전용
// bosses: 보스별 — hp, posture(그로기), look, aura(색), weakness: 페이즈별 약점 무기, patterns: 쓰는 패턴과 덮어쓸 값
// (= 뒤는 순수 JSON. 브라우저가 file:// 에서 .json 을 못 읽어서 이 한 줄로 감쌌다)
DATA.bossPatterns = {
  "dashSlash": {
    "weight": 3,
    "telegraphMs": 640,
    "dashFrames": 10,
    "maxDist": 380,
    "active": 5,
    "recovery": 42,
    "damage": 20,
    "hitbox": {"x":-10,"y":-84,"w":104,"h":84},
    "knock": {"x":9,"y":-4},
    "parryable": true
  },
  "jumpSlam": {
    "weight": 2,
    "windFrames": 30,
    "airFrames": 42,
    "peak": 220,
    "radius": 120,
    "recovery": 46,
    "damage": 24,
    "knock": {"x":10,"y":-7},
    "parryable": false,
    "minDist": 110
  },
  "swordWaves": {
    "weight": 2,
    "count": 3,
    "telegraphMs": 430,
    "gapFrames": 12,
    "speed": 7.5,
    "heights": [-16,-66,-36],
    "damage": 14,
    "recovery": 36,
    "parryable": true,
    "reflectDamage": 45,
    "minDist": 160
  },
  "areaBlast": {
    "weight": 2,
    "zones": 4,
    "spread": 170,
    "radius": 74,
    "warnFrames": 68,
    "recovery": 50,
    "damage": 26,
    "knock": {"x":8,"y":-8},
    "parryable": false
  },
  "flurry": {
    "weight": 3,
    "phase2": true,
    "hits": [
      {"telegraphMs":400,"telegraph":"yellow"},
      {"telegraphMs":320,"telegraph":"yellow"},
      {"telegraphMs":560,"telegraph":"white","thrust":true}
    ],
    "lunge": 5,
    "damage": 16,
    "hitbox": {"x":-6,"y":-80,"w":96,"h":80},
    "thrustBox": {"x":0,"y":-60,"w":150,"h":26},
    "knock": {"x":8,"y":-3},
    "recovery": 46,
    "maxDist": 260
  },
  "triSlam": {
    "weight": 3,
    "phase2": true,
    "count": 3,
    "windFrames": 16,
    "airFrames": 34,
    "peak": 170,
    "radius": 110,
    "recovery": 54,
    "damage": 20,
    "knock": {"x":9,"y":-6},
    "parryable": false
  },
  "pillars": {
    "weight": 3,
    "phase2": true,
    "count": 8,
    "step": 110,
    "interval": 12,
    "warnFrames": 42,
    "radius": 58,
    "recovery": 54,
    "damage": 22,
    "knock": {"x":7,"y":-8},
    "parryable": false
  }
};

DATA.bosses = {
  "dusk": {
    "name": "황혼의 검귀",
    "title": "1층 · 노을",
    "width": 40,
    "height": 72,
    "hp": 1600,
    "posture": 240,
    "weight": 4,
    "friction": 0.8,
    "walkSpeed": 1.6,
    "spacing": [110,250],
    "idleMin": 36,
    "idleMax": 70,
    "look": {"body":"boss","weapon":"greatsword"},
    "aura": "#ff7a3a",
    "weakness": ["gauntlet","sword"],
    "patterns": {"dashSlash":{},"jumpSlam":{},"swordWaves":{},"areaBlast":{},"flurry":{}}
  },
  "moon": {
    "name": "월야의 창기사",
    "title": "2층 · 달밤",
    "width": 38,
    "height": 74,
    "hp": 2000,
    "posture": 270,
    "weight": 4,
    "friction": 0.8,
    "walkSpeed": 1.9,
    "spacing": [130,280],
    "idleMin": 30,
    "idleMax": 60,
    "look": {"body":"boss","weapon":"lance"},
    "aura": "#8fb4ff",
    "weakness": ["greatsword","gauntlet"],
    "patterns": {
      "dashSlash": {"telegraphMs":600,"maxDist":460,"hitbox":{"x":-10,"y":-70,"w":140,"h":40}},
      "jumpSlam": {"weight":3},
      "swordWaves": {"speed":9},
      "areaBlast": {},
      "triSlam": {}
    }
  },
  "flame": {
    "name": "불꽃 성주",
    "title": "3층 · 불타는 성",
    "width": 44,
    "height": 78,
    "hp": 2400,
    "posture": 300,
    "weight": 5,
    "friction": 0.8,
    "walkSpeed": 1.5,
    "spacing": [110,240],
    "idleMin": 28,
    "idleMax": 56,
    "look": {"body":"boss","weapon":"flameblade"},
    "aura": "#ff5020",
    "weakness": ["sword","greatsword"],
    "patterns": {
      "dashSlash": {"damage":24},
      "jumpSlam": {"radius":140},
      "swordWaves": {"count":4,"heights":[-16,-66,-36,-16]},
      "areaBlast": {"weight":3,"zones":5,"radius":84},
      "pillars": {}
    }
  }
};

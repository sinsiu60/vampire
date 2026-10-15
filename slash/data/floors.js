'use strict';
// 층 데이터 (런은 이 배열 길이만큼의 층)
// name / desc: 층 이름·설명, theme: 배경 테마 번호 (render.js THEMES), rooms: [최소, 최대] 이 층에서 지나가는 방 수 (시작방·보스방 포함)
// enemy: 일반 적 능력치 배율, pools: 등장 적 가중치 (data/enemies.js 이름), waveSize: 웨이브당 적 수
// eliteRoom: 엘리트 방 구성 (정예 수 / 호위 일반 적 수), eliteChance: 일반 전투방 적이 정예로 나올 확률
// traps: 함정 (config.js traps 의 종류, 방마다 개수 min~max), boss: 보스 (data/bosses.js), bossHp: 보스 체력 배율
// music / bossMusic: 곡 (config.js audio.music), gold: 골드 배율, roomWeights: 갈림길 방 종류 가중치 (data/rooms.js)
// (= 뒤는 순수 JSON. 브라우저가 file:// 에서 .json 을 못 읽어서 이 한 줄로 감쌌다)
DATA.floors = [
  {
    "name": "노을의 성벽", "desc": "기본기를 익히는 층", "theme": 0, "rooms": [7, 8],
    "enemy": { "hp": 1, "damage": 1, "posture": 1 },
    "pools": { "grunt": 4, "shield": 2, "archer": 2, "flyer": 1 }, "waveSize": 3,
    "eliteRoom": { "elites": 1, "escorts": 2 }, "eliteChance": 0, "traps": null,
    "boss": "dusk", "bossHp": 1, "music": "dungeon", "bossMusic": "boss", "gold": 1,
    "roomWeights": { "combat": 6, "elite": 1.2, "curse": 0.5, "rest": 1, "shop": 1, "forge": 0.8 }
  },
  {
    "name": "달빛 회랑", "desc": "가시 함정", "theme": 1, "rooms": [7, 9],
    "enemy": { "hp": 1.3, "damage": 1.15, "posture": 1.1 },
    "pools": { "grunt": 3, "shield": 2, "archer": 2, "flyer": 2, "charger": 2, "heavy": 1 }, "waveSize": 4,
    "eliteRoom": { "elites": 1, "escorts": 3 }, "eliteChance": 0.05, "traps": { "kind": "spikes", "min": 1, "max": 2 },
    "boss": "moon", "bossHp": 1, "music": "dungeon2", "bossMusic": "boss2", "gold": 1.15,
    "roomWeights": { "combat": 6, "elite": 1.4, "curse": 0.8, "rest": 1, "shop": 1, "forge": 1 }
  },
  {
    "name": "불타는 왕좌", "desc": "화염 분출구", "theme": 2, "rooms": [8, 9],
    "enemy": { "hp": 1.6, "damage": 1.3, "posture": 1.2 },
    "pools": { "grunt": 2, "shield": 2, "archer": 2, "flyer": 2, "charger": 2, "heavy": 2 }, "waveSize": 4,
    "eliteRoom": { "elites": 2, "escorts": 2 }, "eliteChance": 0.08, "traps": { "kind": "flames", "min": 1, "max": 3 },
    "boss": "flame", "bossHp": 1, "music": "dungeon3", "bossMusic": "boss3", "gold": 1.3,
    "roomWeights": { "combat": 6, "elite": 1.5, "curse": 1, "rest": 1, "shop": 1, "forge": 1 }
  },
  {
    "name": "서리 묘역", "desc": "가시 함정 · 강한 적", "theme": 3, "rooms": [8, 9],
    "enemy": { "hp": 1.9, "damage": 1.45, "posture": 1.3 },
    "pools": { "grunt": 2, "shield": 2, "archer": 2, "flyer": 3, "charger": 2, "heavy": 2 }, "waveSize": 5,
    "eliteRoom": { "elites": 2, "escorts": 3 }, "eliteChance": 0.1, "traps": { "kind": "spikes", "min": 2, "max": 3 },
    "boss": "moon", "bossHp": 1.5, "music": "dungeon2", "bossMusic": "boss2", "gold": 1.45,
    "roomWeights": { "combat": 6, "elite": 1.6, "curse": 1, "rest": 1, "shop": 1, "forge": 1 }
  },
  {
    "name": "공허의 첨탑", "desc": "화염 분출구 · 마지막 층", "theme": 4, "rooms": [8, 9],
    "enemy": { "hp": 2.2, "damage": 1.6, "posture": 1.4 },
    "pools": { "grunt": 2, "shield": 2, "archer": 2, "flyer": 2, "charger": 3, "heavy": 3 }, "waveSize": 5,
    "eliteRoom": { "elites": 2, "escorts": 3 }, "eliteChance": 0.12, "traps": { "kind": "flames", "min": 2, "max": 3 },
    "boss": "flame", "bossHp": 1.8, "music": "dungeon3", "bossMusic": "boss3", "gold": 1.6,
    "roomWeights": { "combat": 6, "elite": 1.6, "curse": 1.2, "rest": 1, "shop": 1, "forge": 1 }
  }
];

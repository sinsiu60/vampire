'use strict';
// 각인 데이터
// elements: 속성 (화염/번개/서리/피) — 3단계에서 장착한 각인의 속성 개수로 세트 효과
// engravings: 각인 목록
//   id: 코드에서 효과를 찾는 이름 (js/engrave.js 와 각 시스템의 Engrave.get(p, id))
//   weapon: 장착 가능한 무기 (sword / greatsword / gauntlet, null = 공용 — 3단계)
//   element: 속성, scope: "held" = 그 무기를 들고 있을 때만 / "always" = 항상
//   desc: 설명 ({이름} 자리에 values 의 값이 들어감)
//   values: 효과 수치 (등급 배율 config.engrave.rarityMult 를 곱함, fixed 에 적은 것은 안 곱함)
//   perLevel: 강화 1단계마다 더하는 값 (+1 ~ +3)
//   weight: 등장 가중치, minRarity: 최소 등급 (0 일반 / 1 희귀 / 2 영웅)
// (= 뒤는 순수 JSON. 브라우저가 file:// 에서 .json 을 못 읽어서 이 한 줄로 감쌌다)
DATA.elements = {
  "fire": { "name": "화염", "color": "#ff7a3a" },
  "lightning": { "name": "번개", "color": "#ffe14a" },
  "frost": { "name": "서리", "color": "#8fd8ff" },
  "blood": { "name": "피", "color": "#ff4a6a" }
};

DATA.engravings = [
  {
    "id": "sword_parry_wave", "name": "반격의 검기", "weapon": "sword", "element": "lightning", "scope": "held",
    "desc": "퍼펙트 패링 시 전방으로 검기 발사\n(데미지 {dmg}, 체간 {posture})",
    "values": { "dmg": 24, "posture": 16 }, "perLevel": { "dmg": 8, "posture": 4 }, "weight": 1
  },
  {
    "id": "sword_mushin", "name": "무념", "weapon": "sword", "element": "frost", "scope": "held",
    "desc": "간파 자세 중 패링하면\n자세 지속 +{sec}초",
    "values": { "sec": 1 }, "perLevel": { "sec": 0.3 }, "weight": 1
  },
  {
    "id": "sword_iai_mastery", "name": "발도의 극", "weapon": "sword", "element": "fire", "scope": "held",
    "desc": "발도 일섬 데미지 +{pct}%\n순간이동 거리 +{dist}",
    "values": { "pct": 40, "dist": 60 }, "perLevel": { "pct": 15 }, "fixed": ["dist"], "weight": 1
  },
  {
    "id": "sword_blood_dance", "name": "혈무", "weapon": "sword", "element": "blood", "scope": "held",
    "desc": "약공 4타째·질풍 베기 적중 시\n체력 {heal} 회복",
    "values": { "heal": 3 }, "perLevel": { "heal": 1 }, "weight": 1
  },
  {
    "id": "sword_keen", "name": "예리함", "weapon": "sword", "element": "lightning", "scope": "held",
    "desc": "치명타 확률 +{crit}%\n치명타는 체간 피해 +{cpost}%",
    "values": { "crit": 8, "cpost": 50 }, "perLevel": { "crit": 3 }, "fixed": ["cpost"], "weight": 1
  },
  {
    "id": "sword_riposte", "name": "역습", "weapon": "sword", "element": "frost", "scope": "held",
    "desc": "반격 일섬·반격 런처\n데미지 +{pct}%, 체간 +{post}%",
    "values": { "pct": 60, "post": 40 }, "perLevel": { "pct": 20 }, "fixed": ["post"], "weight": 1
  },

  {
    "id": "gs_shatter", "name": "파쇄", "weapon": "greatsword", "element": "fire", "scope": "held",
    "desc": "적의 체간이 무너지면 폭발\n(주변 데미지 {dmg}, 체간 {posture})",
    "values": { "dmg": 30, "posture": 20, "radius": 120 }, "perLevel": { "dmg": 10 }, "fixed": ["radius"], "weight": 1
  },
  {
    "id": "gs_giant", "name": "거인의 일격", "weapon": "greatsword", "element": "blood", "scope": "held",
    "desc": "차지 단계 +1 (Lv4 붕천)\n차지 속도 +{speed}%",
    "values": { "speed": 15 }, "perLevel": { "speed": 10 }, "weight": 1
  },
  {
    "id": "gs_tremor", "name": "대지 울림", "weapon": "greatsword", "element": "frost", "scope": "held",
    "desc": "강공·차지 공격에 맞은 적\n{sec}초 둔화",
    "values": { "sec": 2 }, "perLevel": { "sec": 0.5 }, "weight": 1
  },
  {
    "id": "gs_unyielding", "name": "불굴", "weapon": "greatsword", "element": "blood", "scope": "held",
    "desc": "철벽 지속 +{sec}초\n반격 데미지 +{pct}%",
    "values": { "sec": 1.5, "pct": 50 }, "perLevel": { "sec": 0.5 }, "fixed": ["pct"], "weight": 1
  },
  {
    "id": "gs_breaker", "name": "체간 분쇄", "weapon": "greatsword", "element": "lightning", "scope": "held",
    "desc": "체간 피해 +{pct}%",
    "values": { "pct": 30 }, "perLevel": { "pct": 10 }, "weight": 1
  },
  {
    "id": "gs_quake_swap", "name": "지진 전환", "weapon": "greatsword", "element": "fire", "scope": "held",
    "desc": "대검 전환기 충격파\n거리 +{range}%, 데미지 +{pct}%",
    "values": { "range": 60, "pct": 50 }, "perLevel": { "pct": 20 }, "fixed": ["range"], "weight": 1
  },

  {
    "id": "gt_zero_g", "name": "무중력", "weapon": "gauntlet", "element": "lightning", "scope": "held",
    "desc": "공중에 떠 있는 동안\n공격 속도 +{aspd}%",
    "values": { "aspd": 30 }, "perLevel": { "aspd": 10 }, "weight": 1
  },
  {
    "id": "gt_meteor_shower", "name": "유성우", "weapon": "gauntlet", "element": "fire", "scope": "held",
    "desc": "유성 낙하 착지 후\n작은 유성 {count}개 (각 {dmg})",
    "values": { "count": 3, "dmg": 14 }, "perLevel": { "count": 1, "dmg": 4 }, "fixed": ["count"], "weight": 1
  },
  {
    "id": "gt_vampiric", "name": "연타 흡혈", "weapon": "gauntlet", "element": "blood", "scope": "held",
    "desc": "건틀릿 공격 5번 맞힐 때마다\n체력 {heal} 회복",
    "values": { "heal": 3 }, "perLevel": { "heal": 1 }, "weight": 1
  },
  {
    "id": "gt_ascension", "name": "승천", "weapon": "gauntlet", "element": "frost", "scope": "held",
    "desc": "승룡권 쿨타임 -{cdr}%\n띄운 적 {sec}초 둔화",
    "values": { "cdr": 30, "sec": 1.5 }, "perLevel": { "sec": 0.5 }, "fixed": ["cdr"], "weight": 1
  },
  {
    "id": "gt_air_breaker", "name": "공중 연격", "weapon": "gauntlet", "element": "lightning", "scope": "held",
    "desc": "공중 공격 체간 피해 +{pct}%",
    "values": { "pct": 50 }, "perLevel": { "pct": 15 }, "weight": 1
  },
  {
    "id": "gt_wind_dance", "name": "바람의 춤", "weapon": "gauntlet", "element": "frost", "scope": "held",
    "desc": "공중 대시 +1회\n공중 대시 후 {sec}초 안의 첫 공격 치명타",
    "values": { "sec": 1 }, "perLevel": { "sec": 0.3 }, "weight": 1
  }
];

'use strict';
// 각인 데이터
// elements: 속성 (화염/번개/서리/피). 장착한 모든 각인(무기 상관없이)의 속성 개수가 sets[].n 이상이면 세트 효과
//   sets: { n: 필요 개수, name, short: HUD·목록용 짧은 설명, desc: 자세한 설명, values: 효과 수치 }
// engravings: 각인 목록
//   id: 코드에서 효과를 찾는 이름 (js/engrave.js 와 각 시스템의 Engrave.get(p, id))
//   weapon: 장착 가능한 무기 (sword / greatsword / gauntlet, null = 공용: 아무 무기 칸에나)
//   element: 속성, scope: "held" = 그 무기를 들고 있을 때만 / "always" = 항상
//   desc: 설명 ({이름} 자리에 values 의 값이 들어감)
//   values: 효과 수치 (등급 배율 config.engrave.rarityMult 를 곱함, fixed 에 적은 것은 안 곱함)
//   perLevel: 강화 1단계마다 더하는 값 (+1 ~ +3)
//   weight: 등장 가중치, minRarity: 최소 등급 (0 일반 / 1 희귀 / 2 영웅 / 3 전설)
//   legend: 전설 각인 (보스·엘리트 보상에 낮은 확률로), curse: 저주 각인 (저주 제단에서만), round: 정수로 반올림할 수치
// (= 뒤는 순수 JSON. 브라우저가 file:// 에서 .json 을 못 읽어서 이 한 줄로 감쌌다)
DATA.elements = {
  "fire": { "name": "화염", "color": "#ff7a3a", "sets": [
    { "n": 2, "name": "점화", "short": "적중 시 화상", "desc": "공격 적중 시 화상 {sec}초 (초당 {dps})", "values": { "sec": 3, "dps": 5 } },
    { "n": 4, "name": "산화", "short": "불탄 적 사망 시 폭발", "desc": "화상 입은 적이 죽으면 폭발 (데미지 {dmg}, 반경 {r})", "values": { "dmg": 30, "r": 120 } },
    { "n": 6, "name": "연쇄 폭발", "short": "폭발이 불을 옮김", "desc": "폭발에 맞은 적도 화상 → 죽으면 또 폭발", "values": {} }
  ] },
  "lightning": { "name": "번개", "color": "#ffe14a", "sets": [
    { "n": 2, "name": "정전기", "short": "5타마다 번개", "desc": "{every}번 적중할 때마다 번개 (데미지 {dmg})", "values": { "every": 5, "dmg": 22 } },
    { "n": 4, "name": "연쇄 번개", "short": "번개가 주변 적에게 튐", "desc": "번개가 주변 적 {jumps}명에게 튐 (반경 {r}, 데미지 {pct}%)", "values": { "jumps": 2, "r": 220, "pct": 60 } },
    { "n": 6, "name": "뇌운", "short": "퍼펙트 패링 시 낙뢰 3번", "desc": "퍼펙트 패링 시 주변 적에게 번개 {bolts}개", "values": { "bolts": 3, "r": 360 } }
  ] },
  "frost": { "name": "서리", "color": "#8fd8ff", "sets": [
    { "n": 2, "name": "냉기", "short": "적중 시 둔화", "desc": "공격 적중 시 {sec}초 둔화", "values": { "sec": 1 } },
    { "n": 4, "name": "동결 균열", "short": "체간 붕괴 +1초", "desc": "체간 붕괴(그로기) 지속 +{sec}초", "values": { "sec": 1 } },
    { "n": 6, "name": "절대영도", "short": "처형 시 주변 빙결", "desc": "처형 시 주변 적 {sec}초 빙결 (반경 {r})", "values": { "sec": 3, "r": 320 } }
  ] },
  "blood": { "name": "피", "color": "#ff4a6a", "sets": [
    { "n": 2, "name": "갈증", "short": "흡혈", "desc": "준 피해의 {pct}% 회복", "values": { "pct": 3 } },
    { "n": 4, "name": "광혈", "short": "체력 낮을수록 공격력↑", "desc": "잃은 체력에 비례해 공격력 최대 +{pct}%", "values": { "pct": 50 } },
    { "n": 6, "name": "피의 축적", "short": "처형 시 최대 체력 +2", "desc": "처형할 때마다 최대 체력 +{hp} (이번 런 동안 영구)", "values": { "hp": 2 } }
  ] }
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
    "desc": "약공 마지막 타·전환기 적중 시\n체력 {heal} 회복",
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
  },

  {
    "id": "common_resonance", "name": "공명 증폭", "weapon": null, "element": "blood", "scope": "always",
    "desc": "공명 최대 단계 3 → 5\n공명 지속 +{sec}초",
    "values": { "sec": 0.5 }, "perLevel": { "sec": 0.5 }, "weight": 1
  },
  {
    "id": "common_chain", "name": "연환", "weapon": null, "element": "lightning", "scope": "always",
    "desc": "전환기(스왑 어택) 데미지 +{pct}%",
    "values": { "pct": 100 }, "perLevel": { "pct": 25 }, "weight": 1
  },
  {
    "id": "common_frost_parry", "name": "서리 반격", "weapon": null, "element": "frost", "scope": "always",
    "desc": "퍼펙트 패링한 적 {sec}초 둔화\n체간 +{post}",
    "values": { "sec": 2, "post": 10 }, "perLevel": { "sec": 0.5, "post": 4 }, "weight": 1
  },
  {
    "id": "common_ignite_swap", "name": "점화 전환", "weapon": null, "element": "fire", "scope": "always",
    "desc": "전환기 적중 시 화상 {sec}초\n(초당 {dps})",
    "values": { "sec": 4, "dps": 6 }, "perLevel": { "dps": 2 }, "fixed": ["sec"], "weight": 1
  },
  {
    "id": "common_blood_parry", "name": "피의 반격", "weapon": null, "element": "blood", "scope": "always",
    "desc": "퍼펙트 패링 시 체력 {heal} 회복",
    "values": { "heal": 3 }, "perLevel": { "heal": 1 }, "weight": 1
  },
  {
    "id": "common_air_tempo", "name": "공중 곡예", "weapon": null, "element": "lightning", "scope": "always",
    "desc": "공중 공격 데미지 +{pct}%\n공중 적중 시 스태미나 {sta} 회복",
    "values": { "pct": 15, "sta": 4 }, "perLevel": { "pct": 5, "sta": 1 }, "weight": 1
  },
  {
    "id": "common_pressure", "name": "압박", "weapon": null, "element": "frost", "scope": "always",
    "desc": "모든 무기 체간 피해 +{pct}%",
    "values": { "pct": 20 }, "perLevel": { "pct": 7 }, "weight": 1
  },
  {
    "id": "common_pyre", "name": "화장", "weapon": null, "element": "fire", "scope": "always",
    "desc": "처형 시 주변 폭발\n(데미지 {dmg}, 반경 {r})",
    "values": { "dmg": 40, "r": 170 }, "perLevel": { "dmg": 12 }, "fixed": ["r"], "weight": 1
  },

  {
    "id": "legend_tenui", "name": "천의무봉", "weapon": "sword", "element": "frost", "scope": "held", "legend": true, "minRarity": 3,
    "desc": "퍼펙트 패링 {n}연속마다\n다음 공격이 즉시 처형\n(맞으면 연속 초기화)",
    "values": { "n": 5 }, "perLevel": { "n": -0.67 }, "fixed": ["n"], "round": ["n"], "weight": 1
  },
  {
    "id": "legend_mezzan", "name": "멸산", "weapon": "greatsword", "element": "fire", "scope": "held", "legend": true, "minRarity": 3,
    "desc": "대지 분쇄가 화면 안\n모든 적의 체간 +{post}",
    "values": { "post": 45 }, "perLevel": { "post": 10 }, "weight": 1
  },
  {
    "id": "legend_thunder_god", "name": "천둥신", "weapon": "gauntlet", "element": "lightning", "scope": "held", "legend": true, "minRarity": 3,
    "desc": "공중에서 맞은 적이 착지하면\n낙뢰 (데미지 {dmg})",
    "values": { "dmg": 20 }, "perLevel": { "dmg": 5 }, "weight": 1
  },
  {
    "id": "legend_trinity", "name": "삼위일체", "weapon": null, "element": "blood", "scope": "always", "legend": true, "minRarity": 3,
    "desc": "한 콤보에 무기 3개를 모두 맞히면\n스킬 쿨타임 초기화 + {sec}초 동안 쿨타임 없음",
    "values": { "sec": 3 }, "perLevel": { "sec": 0.5 }, "fixed": ["sec"], "weight": 1
  },

  {
    "id": "curse_berserker", "name": "광전사", "weapon": null, "element": "fire", "scope": "always", "curse": true,
    "desc": "공격력 +{atk}%\n가드 불가 (퍼펙트 패링만 가능)",
    "values": { "atk": 60 }, "perLevel": { "atk": 10 }, "weight": 1
  },
  {
    "id": "curse_glass", "name": "유리 칼날", "weapon": null, "element": "lightning", "scope": "always", "curse": true,
    "desc": "치명타 확률 100%\n최대 체력 -{hp}%",
    "values": { "hp": 50 }, "perLevel": { "hp": -5 }, "fixed": ["hp"], "weight": 1
  },
  {
    "id": "curse_blood_oath", "name": "피의 서약", "weapon": null, "element": "blood", "scope": "always", "curse": true,
    "desc": "처형 시 체력 {heal}% 회복\n체력이 초당 {drain}씩 감소 (1 미만으로는 안 줄어듦)",
    "values": { "heal": 30, "drain": 0.6 }, "perLevel": { "heal": 5 }, "fixed": ["heal", "drain"], "weight": 1
  }
];

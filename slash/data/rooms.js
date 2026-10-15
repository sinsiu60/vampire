'use strict';
// 방 종류. 키 = 종류 이름 (층 데이터 roomWeights, 지도 아이콘)
// name: 이름, color: 아이콘·문 색, desc: 갈림길에서 보이는 설명, width: 방 폭 (숫자 또는 [최소, 최대])
// combat: 적과 싸우는 방인가, station: 방 가운데 놓이는 시설 (휴식=모닥불 / 상점 / 대장간 / 제단)
// (= 뒤는 순수 JSON. 브라우저가 file:// 에서 .json 을 못 읽어서 이 한 줄로 감쌌다)
DATA.rooms = {
  "start": { "name": "입구", "color": "#cfe6ff", "desc": "층의 시작", "width": 900, "combat": false },
  "combat": { "name": "전투", "color": "#e8e8e8", "desc": "일반 적 · 골드", "width": [1300, 1900], "combat": true },
  "elite": { "name": "엘리트", "color": "#ff9a2a", "desc": "강화된 적 · 클리어하면 각인 1개", "width": [1300, 1600], "combat": true },
  "curse": { "name": "저주 제단", "color": "#b45cff", "desc": "저주 각인 또는 공용 변형", "width": 1000, "combat": false, "station": "altar" },
  "rest": { "name": "휴식", "color": "#7fe08a", "desc": "체력 회복 또는 각인 강화", "width": 1000, "combat": false, "station": "fire" },
  "shop": { "name": "상점", "color": "#ffd23a", "desc": "각인 · 체력 회복 · 리롤", "width": 1100, "combat": false, "station": "shop" },
  "forge": { "name": "대장간", "color": "#ff6a3a", "desc": "변형 구매 · 교체", "width": 1000, "combat": false, "station": "anvil" },
  "boss": { "name": "보스", "color": "#ff3b3b", "desc": "층의 끝", "width": 1500, "combat": true }
};

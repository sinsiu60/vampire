'use strict';
// 지형(바닥·벽·발판)과 충돌 처리 + 던전 생성
//  - 층(floor) = 방 5~6개를 왼쪽 → 오른쪽으로 잇는 길. 첫 방은 시작방, 마지막은 보스방
//  - 방(room) 지형은 구간(segment)들로 만든다: 평지 / 높은 지대 / 낭떠러지
//  - 문: 방 양쪽 벽의 구멍. 잠기면 철창(gate)이 막는다
// 수치는 config.js 의 dungeon

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
// 가중치 표 { 이름: 가중치 } 에서 하나
function pickWeighted(table) {
  let total = 0;
  for (const k in table) total += table[k];
  let r = Math.random() * total;
  for (const k in table) { r -= table[k]; if (r <= 0) return k; }
  return Object.keys(table)[0];
}

const Dungeon = {
  level: null,

  // ---------- 연습 아레나 (콤보 연습장 / 테스트) ----------
  buildArena() {
    const A = CONFIG.arena;
    const gy = A.groundY;
    const solids = [
      { x: -200, y: gy, w: A.width + 400, h: 400 },   // 바닥
      { x: -200, y: -600, w: 200, h: gy + 600 },      // 왼쪽 벽
      { x: A.width, y: -600, w: 200, h: gy + 600 },   // 오른쪽 벽
    ];
    // oneWay: 아래에서 뚫고 올라갈 수 있는 발판
    const platforms = [
      { x: 360, y: gy - 120, w: 200, h: 14, oneWay: true },
      { x: 860, y: gy - 190, w: 220, h: 14, oneWay: true },
      { x: 1360, y: gy - 120, w: 200, h: 14, oneWay: true },
    ];
    const level = {
      width: A.width,
      height: CONFIG.view.height,
      groundY: gy,
      killY: gy + 400,
      rects: solids.concat(platforms),
      gates: [],
      locked: false,
    };
    this.setLevel(level);
    return level;
  },

  setLevel(level) {
    this.level = level;
    this.refreshSolids(level);
  },

  // 충돌 대상 = 지형 + (잠겼으면) 철창
  refreshSolids(level) {
    level.active = level.locked ? level.rects.concat(level.gates) : level.rects;
  },

  setLocked(level, locked) {
    level.locked = locked;
    this.refreshSolids(level);
  },

  // ---------- 층 생성 ----------
  generateFloor(fi) {
    const D = CONFIG.dungeon;
    const n = randInt(D.roomsMin, D.roomsMax);
    const rooms = [];
    for (let i = 0; i < n; i++) {
      const kind = i === 0 ? 'start' : i === n - 1 ? 'boss' : 'combat';
      const width = kind === 'start' ? D.startWidth : kind === 'boss' ? D.bossWidth : randInt(D.roomWidthMin, D.roomWidthMax);
      const high = () => (Math.random() < D.highDoorChance ? D.ledgeH : 0);
      rooms.push({
        index: i, kind, width,
        leftH: kind === 'combat' ? high() : 0,
        rightH: kind === 'boss' ? 0 : high(),
        visited: false,
        cleared: kind === 'start',
        waves: [],
        chest: null,          // { x, y, rank, opened }
        level: null,
      });
    }
    // 웨이브 구성
    for (const r of rooms) {
      if (r.kind === 'combat') {
        const count = D.roomEnemies[Math.min(fi, D.roomEnemies.length - 1)] + (r.width > 1750 ? 1 : 0);
        const waves = r.width >= D.twoWaveWidth ? 2 : 1;
        for (let w = 0; w < waves; w++) {
          const list = [];
          for (let k = 0; k < count - (waves === 2 ? 1 : 0); k++) list.push(pickWeighted(D.pools[Math.min(fi, D.pools.length - 1)]));
          r.waves.push(list);
        }
      } else if (r.kind === 'boss') {
        r.waves.push(D.bossRoom[Math.min(fi, D.bossRoom.length - 1)].slice());
      }
      r.level = this.genRoom(r);
    }
    this.layoutMinimap(rooms);
    return { index: fi, rooms };
  },

  // 미니맵 좌표: 방 폭에 비례, 문 높이에 맞춰 위아래로 어긋나게
  layoutMinimap(rooms) {
    const s = 1 / 40, H = 14, shift = 8;
    let x = 0, prevDoorY = H;
    for (const r of rooms) {
      r.mapW = Math.max(14, r.width * s);
      r.mapH = H;
      r.mapX = x;
      r.mapY = prevDoorY - H + (r.leftH ? shift : 0);
      prevDoorY = r.mapY + H - (r.rightH ? shift : 0);
      x += r.mapW + 5;
    }
  },

  // ---------- 방 지형 생성 ----------
  genRoom(room) {
    const D = CONFIG.dungeon, base = D.baseY, W = room.width;
    const flat = room.kind !== 'combat';
    const segs = [{ x0: 0, x1: D.landing, h: room.leftH }];
    let x = D.landing, prevH = room.leftH, prevPit = false;
    const end = W - D.landing;
    while (x < end - 60) {
      const remain = end - x;
      // 낭떠러지: 바로 앞이 낮은 평지일 때만, 뒤에 땅이 올 자리가 있을 때만
      if (!flat && !prevPit && prevH <= 50 && remain > D.pitMax + D.segMin && Math.random() < D.pitChance) {
        const w = randInt(D.pitMin, D.pitMax);
        segs.push({ x0: x, x1: x + w, h: prevH, pit: true });
        x += w;
        prevPit = true;
        continue;
      }
      let w = Math.min(remain, randInt(D.segMin, D.segMax));
      if (end - (x + w) < D.segMin) w = end - x;
      const h = prevPit ? prevH : flat ? 0 : pick(D.heights);   // 낭떠러지 건너편은 같은 높이
      segs.push({ x0: x, x1: x + w, h });
      prevH = h;
      prevPit = false;
      x += w;
    }
    segs.push({ x0: x, x1: W, h: room.rightH });

    const rects = [];
    // 땅 (낭떠러지 구간은 비움)
    for (const sg of segs) {
      if (sg.pit) continue;
      rects.push({ x: sg.x0, y: base - sg.h, w: sg.x1 - sg.x0, h: 600 + sg.h, ground: true });
    }
    // 높이 차가 크면 디딤 발판
    const solids = segs.filter((sg) => !sg.pit);
    for (let i = 0; i < segs.length - 1; i++) {
      const a = segs[i], b = segs[i + 1];
      if (a.pit || b.pit) continue;
      const diff = Math.abs(a.h - b.h);
      if (diff <= D.maxStep) continue;
      const lowH = Math.min(a.h, b.h);
      const px = a.h < b.h ? a.x1 - 92 : b.x0 + 12;
      rects.push({ x: px, y: base - lowH - Math.round(diff / 2) - 4, w: 80, h: 12, oneWay: true });
    }
    // 평지 위 통과 발판 / 낭떠러지 위 디딤돌
    for (const sg of segs) {
      const w = sg.x1 - sg.x0;
      if (sg.pit) {
        if (Math.random() < 0.35) rects.push({ x: (sg.x0 + sg.x1) / 2 - 40, y: base - sg.h - 64, w: 80, h: 12, oneWay: true });
        continue;
      }
      if (sg === segs[0] || sg === segs[segs.length - 1]) continue;
      if (w >= 200 && Math.random() < D.platformChance) {
        const pw = randInt(100, 160);
        rects.push({ x: sg.x0 + rand(20, w - pw - 20), y: base - sg.h - randInt(110, 140), w: pw, h: 12, oneWay: true });
      }
    }
    // 벽과 문 (방 밖 바닥은 문을 지나갈 수 있게)
    const dh = D.doorHeight;
    const lFloor = base - room.leftH, rFloor = base - room.rightH;
    const gates = [];
    if (room.index === 0) {
      rects.push({ x: -200, y: -800, w: 200, h: lFloor + 800 });
    } else {
      rects.push({ x: -200, y: -800, w: 200, h: lFloor - dh + 800 });
      rects.push({ x: -200, y: lFloor, w: 200, h: 600 });
      gates.push({ x: 0, y: lFloor - dh, w: 12, h: dh, gate: 'left' });
    }
    rects.push({ x: W, y: -800, w: 200, h: rFloor - dh + 800 });
    rects.push({ x: W, y: rFloor, w: 200, h: 600 });
    gates.push({ x: W - 12, y: rFloor - dh, w: 12, h: dh, gate: 'right' });

    // 적 소환 위치: 입구에서 떨어진 땅 위
    const spawnSegs = solids.filter((sg) => sg.x1 - sg.x0 >= 80 && sg.x1 > 340);
    // 보상 상자 자리: 방 가운데에 가장 가까운 땅
    let best = solids[0], bd = 1e9;
    for (const sg of solids) {
      const cx = (sg.x0 + sg.x1) / 2, d = Math.abs(cx - W / 2);
      if (d < bd && sg.x1 - sg.x0 >= 60) { bd = d; best = sg; }
    }

    const level = {
      width: W,
      height: CONFIG.view.height,
      groundY: base,
      killY: base + D.killDepth,
      rects, gates,
      locked: false,
      segs,
      spawnSegs,
      chestSpot: { x: (best.x0 + best.x1) / 2, y: base - best.h },
      entry: { left: { x: 50, y: lFloor }, right: { x: W - 50, y: rFloor } },
    };
    this.refreshSolids(level);
    return level;
  },

  // 적 소환 위치 하나 (입구 근처 피함)
  spawnPoint(level, avoidX) {
    const segs = level.spawnSegs.length ? level.spawnSegs : level.segs.filter((s) => !s.pit);
    for (let tries = 0; tries < 12; tries++) {
      const sg = pick(segs);
      const x = rand(sg.x0 + 30, sg.x1 - 30);
      if (avoidX === undefined || Math.abs(x - avoidX) > 220) return { x, y: CONFIG.dungeon.baseY - sg.h };
    }
    const sg = segs[segs.length - 1];
    return { x: (sg.x0 + sg.x1) / 2, y: CONFIG.dungeon.baseY - sg.h };
  },

  // (x, y) 바로 아래에 디딜 땅이 있는가 (적이 낭떠러지로 걸어가지 않게)
  hasGround(x, y) {
    const rects = this.level.active;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y - 2 && y <= r.y + 24) return true;
    }
    return false;
  },

  // 엔티티 이동 + 충돌. ent: {x(중심), y(발), w, h, vx, vy, dropThrough}
  // 결과로 ent.onGround, ent.hitWall(-1/0/1) 갱신
  moveAndCollide(ent) {
    const rects = this.level.active;
    const hw = ent.w / 2;

    // --- 가로 ---
    ent.hitWall = 0;
    ent.x += ent.vx;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.oneWay) continue;
      if (ent.y > r.y && ent.y - ent.h < r.y + r.h &&
          ent.x + hw > r.x && ent.x - hw < r.x + r.w) {
        if (ent.vx > 0 || (ent.vx === 0 && ent.x < r.x + r.w / 2)) {
          ent.x = r.x - hw;
          ent.hitWall = 1;
        } else {
          ent.x = r.x + r.w + hw;
          ent.hitWall = -1;
        }
        ent.vx = 0;
      }
    }

    // --- 세로 ---
    const prevY = ent.y;
    ent.y += ent.vy;
    ent.onGround = false;
    ent.groundRect = null;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!(ent.x + hw > r.x && ent.x - hw < r.x + r.w)) continue;
      if (r.oneWay) {
        // 위에서 떨어지는 중이고, 이전 프레임에 발판 위였을 때만 착지
        if (ent.vy >= 0 && prevY <= r.y + 0.01 && ent.y >= r.y && !(ent.dropThrough > 0)) {
          ent.y = r.y;
          ent.vy = 0;
          ent.onGround = true;
          ent.groundRect = r;
        }
        continue;
      }
      if (ent.y > r.y && ent.y - ent.h < r.y + r.h) {
        if (ent.vy >= 0 && prevY <= r.y + 0.01) {
          ent.y = r.y;
          ent.vy = 0;
          ent.onGround = true;
          ent.groundRect = r;
        } else if (ent.vy < 0) {
          ent.y = r.y + r.h + ent.h;
          ent.vy = 0;
        }
      }
    }
  },
};

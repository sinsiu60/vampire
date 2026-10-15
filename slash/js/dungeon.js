'use strict';
// 지형(바닥·벽·발판)과 충돌 처리.
// 1단계: 단일 연습 아레나. 6단계에서 방 단위 던전으로 확장.

const Dungeon = {
  level: null,

  // 1단계 테스트 아레나
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
    this.level = {
      width: A.width,
      height: CONFIG.view.height,
      groundY: gy,
      rects: solids.concat(platforms),
    };
    return this.level;
  },

  // 엔티티 이동 + 충돌. ent: {x(중심), y(발), w, h, vx, vy, dropThrough}
  // 결과로 ent.onGround, ent.hitWall(-1/0/1) 갱신
  moveAndCollide(ent) {
    const rects = this.level.rects;
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

'use strict';
// 공용 유틸리티: 수학 헬퍼, 오브젝트 풀, 공간 분할 그리드

const U = {
  TAU: Math.PI * 2,

  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },

  // [[t, v], ...] 곡선 보간. 마지막 지점 이후에는 마지막 구간 기울기로 외삽
  curve(points, t) {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (t < points[i][0]) {
        const t0 = points[i - 1][0], v0 = points[i - 1][1];
        const t1 = points[i][0], v1 = points[i][1];
        return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
      }
    }
    const n = points.length;
    if (n < 2) return points[0][1];
    const a = points[n - 2], b = points[n - 1];
    return b[1] + (b[1] - a[1]) / (b[0] - a[0]) * (t - b[0]);
  },

  // [[t, value], ...] 에서 t 이하인 마지막 항목의 값
  step(table, t) {
    let v = table[0][1];
    for (let i = 0; i < table.length; i++) {
      if (table[i][0] <= t) v = table[i][1];
      else break;
    }
    return v;
  },

  // { key: weight } 에서 가중치 랜덤 선택
  pickWeighted(weights) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = Math.random() * total;
    for (const k in weights) {
      r -= weights[k];
      if (r <= 0 && weights[k] > 0) return k;
    }
    for (const k in weights) if (weights[k] > 0) return k;
    return null;
  },

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  },
};

// ---------------------------------------------------------------------
// 오브젝트 풀: 미리 만든 객체를 재사용하여 GC 부담을 없앰
//  - active 배열을 뒤에서부터 순회하며 releaseAt(i) 로 제거 (swap-pop)
// ---------------------------------------------------------------------
class Pool {
  constructor(factory, initialSize) {
    this.factory = factory;
    this.free = [];
    this.active = [];
    for (let i = 0; i < initialSize; i++) this.free.push(factory());
  }
  get() {
    const o = this.free.length > 0 ? this.free.pop() : this.factory();
    this.active.push(o);
    return o;
  }
  releaseAt(i) {
    const a = this.active;
    const o = a[i];
    a[i] = a[a.length - 1];
    a.pop();
    this.free.push(o);
  }
  clear() {
    while (this.active.length) this.free.push(this.active.pop());
  }
  get count() { return this.active.length; }
}

// ---------------------------------------------------------------------
// 공간 분할 그리드 (해시 그리드)
//  - 무한 맵에서도 동작하도록 셀 좌표를 해시하여 고정 크기 버킷에 저장
//  - 연결 리스트를 Int32Array로 구현해서 매 프레임 할당이 없음
// ---------------------------------------------------------------------
class SpatialGrid {
  constructor(cellSize, bucketCount = 4096, capacity = 1024) {
    this.cellSize = cellSize;
    this.inv = 1 / cellSize;
    this.mask = bucketCount - 1; // bucketCount는 2의 거듭제곱이어야 함
    this.head = new Int32Array(bucketCount).fill(-1);
    this._alloc(capacity);
    this.items = [];
  }
  _alloc(capacity) {
    const oldNext = this.next, oldCx = this.cx, oldCy = this.cy;
    this.next = new Int32Array(capacity);
    this.cx = new Int32Array(capacity);
    this.cy = new Int32Array(capacity);
    if (oldNext) {
      this.next.set(oldNext);
      this.cx.set(oldCx);
      this.cy.set(oldCy);
    }
  }
  _hash(cx, cy) {
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & this.mask;
  }
  clear() {
    this.head.fill(-1);
    this.items.length = 0;
  }
  insert(obj) {
    const idx = this.items.length;
    if (idx >= this.next.length) this._alloc(this.next.length * 2);
    this.items.push(obj);
    const cx = Math.floor(obj.x * this.inv);
    const cy = Math.floor(obj.y * this.inv);
    const h = this._hash(cx, cy);
    this.cx[idx] = cx;
    this.cy[idx] = cy;
    this.next[idx] = this.head[h];
    this.head[h] = idx;
  }
  // (x, y) 중심 반경 r 과 겹치는(obj.radius 포함) 살아있는 객체를 out 에 채움
  query(x, y, r, out) {
    out.length = 0;
    const inv = this.inv;
    const pad = r + 48; // 가장 큰 적(보스 포함) 반지름 여유분
    const minX = Math.floor((x - pad) * inv), maxX = Math.floor((x + pad) * inv);
    const minY = Math.floor((y - pad) * inv), maxY = Math.floor((y + pad) * inv);
    const items = this.items, next = this.next, cxs = this.cx, cys = this.cy;
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        let i = this.head[this._hash(cx, cy)];
        while (i !== -1) {
          if (cxs[i] === cx && cys[i] === cy) {
            const o = items[i];
            if (o.alive) {
              const dx = o.x - x, dy = o.y - y;
              const rr = r + o.radius;
              if (dx * dx + dy * dy < rr * rr) out.push(o);
            }
          }
          i = next[i];
        }
      }
    }
    return out;
  }
}

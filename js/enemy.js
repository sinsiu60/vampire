'use strict';
// 적: 스폰, 추격 AI, 분리(밀어내기), 피격/사망, 보스

function createEnemy() {
  return {
    id: 0, type: 'basic', alive: false, isBoss: false,
    x: 0, y: 0, radius: 10, color: '#fff',
    hp: 1, maxHp: 1, speed: 50, damage: 1, exp: 1,
    kx: 0, ky: 0, kbResist: 0,
    flash: 0, bladeCd: 0, slowTimer: 0, slowAmt: 0,
    dirX: 1, dirY: 0,
    // 보스 전용
    dashState: 0, dashTimer: 0, dashT: 0, dashDx: 0, dashDy: 0,
  };
}

const Enemies = {
  init() {
    this.pool = new Pool(createEnemy, 500);
    this.grid = new SpatialGrid(64, 4096, 1024);
    this._q = [];
    this._pos = { x: 0, y: 0 };
    this.nextId = 1;
    this.reset();
  },

  reset() {
    this.pool.clear();
    this.boss = null;
    this.spawnAcc = 0;
    this.bossCount = 0;
    this.nextBossTime = CONFIG.boss.interval;
    this.nextSwarmTime = CONFIG.spawn.swarm.startTime;
  },

  get list() { return this.pool.active; },

  // 화면 바로 바깥의 랜덤 위치
  spawnPos(game, out) {
    const m = CONFIG.spawn.margin;
    const hw = game.W / 2 + m, hh = game.H / 2 + m;
    const cx = game.player.x, cy = game.player.y;
    const perim = hw * 2 + hh * 2;
    const r = Math.random() * perim;
    if (r < hw * 2) {
      out.x = cx + U.rand(-hw, hw);
      out.y = cy + (Math.random() < 0.5 ? -hh : hh);
    } else {
      out.x = cx + (Math.random() < 0.5 ? -hw : hw);
      out.y = cy + U.rand(-hh, hh);
    }
    return out;
  },

  spawn(typeKey, x, y, time) {
    const def = CONFIG.enemies[typeKey];
    const S = CONFIG.spawn;
    const e = this.pool.get();
    e.id = this.nextId++;
    e.type = typeKey;
    e.alive = true;
    e.isBoss = false;
    e.x = x;
    e.y = y;
    e.radius = def.radius;
    e.color = def.color;
    e.maxHp = e.hp = Math.max(1, Math.round(def.hp * U.curve(S.hpMult, time)));
    e.speed = def.speed * U.curve(S.speedMult, time) * U.rand(0.92, 1.08);
    e.damage = def.damage * U.curve(S.damageMult, time);
    e.exp = def.exp;
    e.kbResist = def.knockbackResist;
    e.kx = e.ky = 0;
    e.flash = 0;
    e.bladeCd = 0;
    e.slowTimer = 0;
    e.slowAmt = 0;
    return e;
  },

  spawnBoss(game) {
    const B = CONFIG.boss;
    const p = this.spawnPos(game, this._pos);
    const e = this.spawn('basic', p.x, p.y, game.time);
    e.isBoss = true;
    e.type = 'boss';
    e.radius = B.radius;
    e.color = B.color;
    e.maxHp = e.hp = Math.round(B.hp * Math.pow(B.hpGrowth, this.bossCount));
    e.speed = B.speed;
    e.damage = B.damage * U.curve(CONFIG.spawn.damageMult, game.time);
    e.exp = B.exp;
    e.kbResist = B.knockbackResist;
    e.dashState = 0;
    e.dashTimer = B.dashInterval;
    this.bossCount++;
    this.boss = e;
    UI.notify('!! 보스 등장 !!', '#ff5252', 3);
    Effects.shake(10);
  },

  spawnSwarm(game) {
    const S = CONFIG.spawn.swarm;
    const n = Math.round(U.curve(S.count, game.time));
    const R = Math.max(game.W, game.H) * 0.6 + 40;
    const p = game.player;
    for (let i = 0; i < n; i++) {
      if (this.pool.count >= CONFIG.spawn.hardCap) break;
      const a = (i / n) * U.TAU;
      this.spawn(S.type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, game.time);
    }
    UI.notify('적 군단이 포위합니다!', '#d18cff', 2);
  },

  rebuildGrid() {
    const g = this.grid;
    g.clear();
    const a = this.pool.active;
    for (let i = 0; i < a.length; i++) if (a[i].alive) g.insert(a[i]);
  },

  update(dt, game) {
    const t = game.time;
    const S = CONFIG.spawn;
    const B = CONFIG.boss;
    const p = game.player;

    // ---- 스폰 ----
    if (t >= this.nextBossTime) {
      this.spawnBoss(game);
      this.nextBossTime += B.interval;
    }
    if (t >= this.nextSwarmTime) {
      this.spawnSwarm(game);
      this.nextSwarmTime += S.swarm.interval;
    }
    const maxAlive = Math.min(S.hardCap, Math.round(U.curve(S.maxAlive, t)));
    this.spawnAcc += U.curve(S.rate, t) * dt;
    if (this.pool.count >= maxAlive) this.spawnAcc = Math.min(this.spawnAcc, 1);
    const weights = U.step(S.weights, t);
    while (this.spawnAcc >= 1 && this.pool.count < maxAlive) {
      this.spawnAcc -= 1;
      const pos = this.spawnPos(game, this._pos);
      this.spawn(U.pickWeighted(weights), pos.x, pos.y, t);
    }

    // ---- 이동 ----
    this.rebuildGrid();
    const a = this.pool.active;
    const q = this._q;
    const sepK = CONFIG.separation;
    const decay = Math.max(0, 1 - CONFIG.combat.knockbackDecay * dt);
    const despawn2 = S.despawnDistance * S.despawnDistance;

    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.bladeCd > 0) e.bladeCd -= dt;
      if (e.slowTimer > 0) e.slowTimer -= dt;

      let dx = p.x - e.x, dy = p.y - e.y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) || 1;
      dx /= d;
      dy /= d;
      e.dirX = dx;
      e.dirY = dy;

      // 너무 멀어지면 화면 근처로 재배치 (보스 제외)
      if (!e.isBoss && d2 > despawn2) {
        const pos = this.spawnPos(game, this._pos);
        e.x = pos.x;
        e.y = pos.y;
        continue;
      }

      let speed = e.speed * (e.slowTimer > 0 ? 1 - e.slowAmt : 1);
      let mx = dx * speed, my = dy * speed;

      if (e.isBoss) {
        if (e.dashState === 0) {
          e.dashTimer -= dt;
          if (e.dashTimer <= 0) {
            e.dashState = 1;
            e.dashT = B.dashWindup;
            e.dashDx = dx;
            e.dashDy = dy;
          }
        } else if (e.dashState === 1) { // 예고 (멈춤)
          mx *= 0.1;
          my *= 0.1;
          e.dashT -= dt;
          if (e.dashT <= 0) {
            e.dashState = 2;
            e.dashT = B.dashTime;
          }
        } else { // 돌진
          mx = e.dashDx * B.dashSpeed;
          my = e.dashDy * B.dashSpeed;
          e.dashT -= dt;
          if (e.dashT <= 0) {
            e.dashState = 0;
            e.dashTimer = B.dashInterval;
          }
        }
      }

      // 분리: 겹친 이웃에게서 밀려남 (무거운 쪽이 덜 밀림)
      if (!e.isBoss) {
        this.grid.query(e.x, e.y, e.radius, q);
        let sx = 0, sy = 0;
        for (let j = 0; j < q.length; j++) {
          const o = q[j];
          if (o === e) continue;
          let ox = e.x - o.x, oy = e.y - o.y;
          let od = Math.sqrt(ox * ox + oy * oy);
          if (od < 0.01) { ox = Math.random() - 0.5; oy = Math.random() - 0.5; od = 0.5; }
          const overlap = e.radius + o.radius - od;
          const w = o.radius / (e.radius + o.radius);
          sx += (ox / od) * overlap * w;
          sy += (oy / od) * overlap * w;
        }
        e.x += sx * sepK;
        e.y += sy * sepK;
      }

      e.x += (mx + e.kx) * dt;
      e.y += (my + e.ky) * dt;
      e.kx *= decay;
      e.ky *= decay;
    }

    this.rebuildGrid();
  },

  // 플레이어와 접촉한 적이 있으면 피해
  checkPlayerContact(p) {
    if (p.invuln > 0 || p.dead) return;
    const q = this.grid.query(p.x, p.y, p.radius - 2, this._q);
    let maxDmg = 0;
    for (let i = 0; i < q.length; i++) if (q[i].damage > maxDmg) maxDmg = q[i].damage;
    if (maxDmg > 0) p.takeDamage(maxDmg);
  },

  // 피해 처리: 깜빡임 + 넉백 + 데미지 숫자
  damage(e, amount, srcX, srcY, knock) {
    if (!e.alive) return;
    const C = CONFIG.combat;
    amount = Math.max(1, Math.round(amount * (1 + (Math.random() * 2 - 1) * C.damageVariance)));
    e.hp -= amount;
    e.flash = C.flashTime;
    if (knock > 0) {
      let dx = e.x - srcX, dy = e.y - srcY;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = C.knockback * knock * (1 - e.kbResist);
      e.kx += (dx / d) * k;
      e.ky += (dy / d) * k;
    }
    const big = amount >= 40 || e.isBoss;
    Effects.damageText(e.x, e.y - e.radius - 4, amount, e.isBoss ? '#ffb74d' : (amount >= 40 ? '#ffe066' : '#ffffff'), big);
    if (e.hp <= 0) this.kill(e);
  },

  kill(e) {
    e.alive = false;
    Game.kills++;
    Pickups.gem(e.x, e.y, e.exp);
    Effects.particle(e.x, e.y, e.color, e.isBoss ? 60 : 6, e.isBoss ? 380 : 140, e.isBoss ? 1.2 : 0.4, e.isBoss ? 6 : 3);
    if (e.isBoss) {
      Game.bossKills++;
      Pickups.chest(e.x, e.y);
      Effects.ring(e.x, e.y, 20, 260, '#ffcc80', 0.9, 6);
      Effects.shake(CONFIG.effects.shakeOnBossDeath);
      UI.notify('보스 처치! 상자를 획득하세요', '#ffcc80', 3);
      if (this.boss === e) this.boss = null;
    }
  },

  // 죽은 적을 풀로 반환 (프레임 끝에 호출)
  cleanup() {
    const a = this.pool.active;
    for (let i = a.length - 1; i >= 0; i--) if (!a[i].alive) this.pool.releaseAt(i);
  },

  nearest(x, y, maxR) {
    let best = null, bestD = maxR * maxR;
    const a = this.pool.active;
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.alive) continue;
      const dx = e.x - x, dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  },

  draw(ctx, view) {
    const a = this.pool.active;
    const C = CONFIG.enemies;
    const inView = (e) => e.x + e.radius > view.left && e.x - e.radius < view.right &&
                          e.y + e.radius > view.top && e.y - e.radius < view.bottom;

    // 그림자 (일괄)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.alive || e.isBoss || !inView(e)) continue;
      ctx.moveTo(e.x + e.radius, e.y + e.radius * 0.8);
      ctx.ellipse(e.x, e.y + e.radius * 0.8, e.radius, e.radius * 0.35, 0, 0, U.TAU);
    }
    ctx.fill();

    // 종류별로 한 번에 그려서 드로우콜 최소화 (깜빡이는 적은 흰색으로 따로)
    // 기본 몹: 원
    ctx.fillStyle = C.basic.color;
    ctx.beginPath();
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.alive || e.type !== 'basic' || e.flash > 0 || !inView(e)) continue;
      ctx.moveTo(e.x + e.radius, e.y);
      ctx.arc(e.x, e.y, e.radius, 0, U.TAU);
    }
    ctx.fill();
    ctx.strokeStyle = '#7a1f1f';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 빠른 몹: 플레이어를 향하는 삼각형
    ctx.fillStyle = C.fast.color;
    ctx.beginPath();
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.alive || e.type !== 'fast' || e.flash > 0 || !inView(e)) continue;
      this._tri(ctx, e);
    }
    ctx.fill();

    // 탱커 몹: 사각형
    ctx.fillStyle = C.tank.color;
    ctx.beginPath();
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.alive || e.type !== 'tank' || e.flash > 0 || !inView(e)) continue;
      const r = e.radius;
      ctx.rect(e.x - r, e.y - r, r * 2, r * 2);
    }
    ctx.fill();
    ctx.strokeStyle = '#1e4a2a';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 피격 깜빡임 (흰색)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.alive || e.isBoss || e.flash <= 0 || !inView(e)) continue;
      if (e.type === 'fast') this._tri(ctx, e);
      else if (e.type === 'tank') ctx.rect(e.x - e.radius, e.y - e.radius, e.radius * 2, e.radius * 2);
      else { ctx.moveTo(e.x + e.radius, e.y); ctx.arc(e.x, e.y, e.radius, 0, U.TAU); }
    }
    ctx.fill();

    // 눈 (기본/탱커)
    ctx.fillStyle = '#1a0d0d';
    ctx.beginPath();
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.alive || e.isBoss || e.type === 'fast' || !inView(e)) continue;
      const r = e.radius, fx = e.dirX, fy = e.dirY;
      const ex = e.x + fx * r * 0.4, ey = e.y + fy * r * 0.4;
      const er = r * 0.17;
      ctx.moveTo(ex - fy * r * 0.35 + er, ey + fx * r * 0.35);
      ctx.arc(ex - fy * r * 0.35, ey + fx * r * 0.35, er, 0, U.TAU);
      ctx.moveTo(ex + fy * r * 0.35 + er, ey - fx * r * 0.35);
      ctx.arc(ex + fy * r * 0.35, ey - fx * r * 0.35, er, 0, U.TAU);
    }
    ctx.fill();

    // 피해 입은 탱커 체력바
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.alive || e.type !== 'tank' || e.hp >= e.maxHp || !inView(e)) continue;
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 8, w, 4);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 8, w * Math.max(0, e.hp / e.maxHp), 4);
    }

    if (this.boss && this.boss.alive) this._drawBoss(ctx, this.boss);
  },

  _tri(ctx, e) {
    const r = e.radius * 1.25, fx = e.dirX, fy = e.dirY;
    ctx.moveTo(e.x + fx * r, e.y + fy * r);
    ctx.lineTo(e.x - fx * r * 0.7 - fy * r * 0.75, e.y - fy * r * 0.7 + fx * r * 0.75);
    ctx.lineTo(e.x - fx * r * 0.7 + fy * r * 0.75, e.y - fy * r * 0.7 - fx * r * 0.75);
    ctx.closePath();
  },

  _drawBoss(ctx, e) {
    const r = e.radius;
    const time = Game.time;

    // 돌진 예고선
    if (e.dashState === 1) {
      const k = 1 - e.dashT / CONFIG.boss.dashWindup;
      ctx.strokeStyle = `rgba(255,60,60,${0.25 + 0.5 * k})`;
      ctx.lineWidth = r * 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      const len = CONFIG.boss.dashSpeed * CONFIG.boss.dashTime;
      ctx.lineTo(e.x + e.dashDx * len, e.y + e.dashDy * len);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + r * 0.85, r, r * 0.35, 0, 0, U.TAU);
    ctx.fill();

    // 가시 달린 몸
    const spikes = 12;
    const rot = time * (e.dashState === 2 ? 8 : 1.2);
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const ang = rot + (i / (spikes * 2)) * U.TAU;
      const rr = i % 2 === 0 ? r * 1.22 : r * 0.92;
      const px = e.x + Math.cos(ang) * rr, py = e.y + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3d0000';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#7f0000';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 0.7, 0, U.TAU);
    ctx.fill();

    // 눈
    const fx = e.dirX, fy = e.dirY;
    ctx.fillStyle = e.dashState === 1 ? '#ffffff' : '#ffeb3b';
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.arc(e.x + fx * r * 0.3 - fy * r * 0.3 * s, e.y + fy * r * 0.3 + fx * r * 0.3 * s, r * 0.13, 0, U.TAU);
      ctx.fill();
    }
  },
};

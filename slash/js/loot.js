'use strict';
// 장비 아이템: 생성(등급·랜덤 옵션·전설 고유 효과), 장비 → 능력치 계산, 바닥 드랍(빛기둥)·줍기
// 아이템: { id, slot: 'weapon'|'armor'|'ring', type(무기 종류), rarity: 0~3, name, opts: [{k, v}], base, unique }

// 무기 칸 순서 (R / 휠 교체 순서)
const WEAPON_ORDER = CONFIG.loot.weaponTypes;

const Loot = {
  nextId: 1,

  // ---------- 생성 ----------
  // floor: 층 번호(0~), luck: 높은 등급 보정(상자 랭크), minRarity: 최소 등급
  rollRarity(floor, luck, minRarity) {
    const L = CONFIG.loot;
    const w = L.rarityWeights[Math.min(floor || 0, L.rarityWeights.length - 1)].slice();
    for (let i = 1; i < w.length; i++) w[i] *= 1 + (luck || 0) * L.chestLuck * i;
    for (let i = 0; i < (minRarity || 0); i++) w[i] = 0;
    let sum = 0;
    for (const x of w) sum += x;
    let r = Math.random() * sum;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return w.length - 1;
  },

  roll(floor, luck, minRarity, slot) {
    const L = CONFIG.loot;
    slot = slot || pickWeighted(L.slotWeights);
    const type = slot === 'weapon' ? pick(L.weaponTypes) : slot;
    return this.make(slot, type, this.rollRarity(floor, luck, minRarity));
  },

  // 아이템 하나 만들기. opts 를 주면 그대로 (시작 장비 등)
  make(slot, type, rarity, opts) {
    const L = CONFIG.loot, R = L.rarities[rarity];
    const item = { id: this.nextId++, slot, type, rarity, opts: [], base: null, unique: null };
    if (slot === 'armor') item.base = Object.assign({}, L.armorBase[rarity]);
    if (slot === 'ring') item.base = Object.assign({}, L.ringBase[rarity]);
    if (opts) item.opts = opts.map((o) => ({ k: o.k, v: o.v }));
    else {
      // 서로 다른 옵션 R.opts 개
      const keys = Object.keys(L.options);
      for (let i = 0; i < R.opts && keys.length; i++) {
        const k = keys.splice((Math.random() * keys.length) | 0, 1)[0];
        const O = L.options[k];
        const raw = (O.min + Math.random() * (O.max - O.min)) * R.optMult;
        const v = O.dec ? Math.round(raw * 10) / 10 : Math.round(raw);
        item.opts.push({ k, v });
      }
    }
    if (rarity === 3) item.unique = pick(Object.keys(L.uniques));
    item.name = this.nameOf(item);
    return item;
  },

  nameOf(item) {
    const L = CONFIG.loot;
    if (item.unique) return `${L.uniques[item.unique].name}의 ${L.nouns[item.type]}`;
    return L.names[item.type][Math.min(item.rarity, 2)];
  },

  color(item) { return CONFIG.loot.rarities[item.rarity].color; },

  // 옵션 한 줄 ("공격력 +7%")
  optText(k, v) {
    const O = CONFIG.loot.options[k];
    if (O) return `${O.name} +${v}${O.unit}`;
    if (k === 'reduce') return `받는 피해 -${v}%`;
    return `${k} +${v}`;
  },

  // ---------- 장비 → 능력치 ----------
  // gear: { weapons: [a, b], armor, ring }, active: 사용 중인 무기 칸
  computeStats(gear, active) {
    const L = CONFIG.loot;
    const s = { atk: 0, aspd: 0, crit: 0, lifesteal: 0, cdr: 0, stamina: 0, maxHp: 0, posture: 0, reduce: 0, power: 1, uniques: {} };
    const items = gear.weapons.concat([gear.armor, gear.ring]);
    for (const it of items) {
      if (!it) continue;
      for (const o of it.opts) s[o.k] = (s[o.k] || 0) + o.v;
      if (it.base) for (const k in it.base) s[k] = (s[k] || 0) + it.base[k];
      if (it.unique) s.uniques[it.unique] = true;
    }
    for (const k in L.limits) s[k] = Math.min(L.limits[k], s[k]);
    const w = gear.weapons[active];
    s.power = w ? L.rarities[w.rarity].power : 1;
    return s;
  },

  // 아이템 설명 줄 목록 (툴팁용): [{ text, color }]
  describe(item) {
    const L = CONFIG.loot, lines = [];
    const R = L.rarities[item.rarity];
    if (item.slot === 'weapon') {
      const W = CONFIG.weapons[item.type];
      lines.push({ text: `무기 · ${W.name}   공격력 ×${R.power.toFixed(2)}`, color: '#ddd' });
      lines.push({ text: W.desc, color: '#999' });
    } else if (item.slot === 'armor') {
      lines.push({ text: `갑옷 · 최대 체력 +${item.base.maxHp}   받는 피해 -${item.base.reduce}%`, color: '#ddd' });
    } else {
      lines.push({ text: `반지 · 치명타 확률 +${item.base.crit}%`, color: '#ddd' });
    }
    for (const o of item.opts) lines.push({ text: this.optText(o.k, o.v), color: '#9fd8ff' });
    if (item.unique) {
      const U = L.uniques[item.unique];
      lines.push({ text: `★ ${U.name}: ${U.desc}`, color: R.color });
    }
    return lines;
  },

  // ---------- 바닥 드랍 ----------
  spawnDrop(game, item, x, y, vx) {
    const d = {
      item, x, y: y - 10, w: 14, h: 14,
      vx: vx !== undefined ? vx : (Math.random() - 0.5) * 4, vy: -6 - Math.random() * 2,
      t: 0, onGround: false,
    };
    game.drops.push(d);
    if (item.rarity >= 2) {
      Effects.ring(x, y - 20, this.color(item), 40 + item.rarity * 10);
      Sound.play(item.rarity === 3 ? 'dropLegend' : 'dropRare');
    }
    return d;
  },

  // 일반 적 처치 시 확률 드랍
  enemyDrop(game, e) {
    if (game.mode !== 'dungeon' || e.isBoss) return;
    const L = CONFIG.loot, fl = game.floorIndex || 0;
    if (Math.random() < L.enemyDropChance[Math.min(fl, L.enemyDropChance.length - 1)]) {
      this.spawnDrop(game, this.roll(fl, 0, 0), e.x, e.y);
    }
  },

  // 보스 격파: 영웅 이상 확정 여러 개
  bossDrop(game, b) {
    const L = CONFIG.loot, fl = game.floorIndex || 0;
    for (let i = 0; i < L.bossDrops; i++) {
      this.spawnDrop(game, this.roll(fl, 2, L.bossMinRarity), b.x, b.y, (i - (L.bossDrops - 1) / 2) * 3.5);
    }
  },

  updateDrops(game) {
    const L = CONFIG.loot, p = game.player;
    for (let i = game.drops.length - 1; i >= 0; i--) {
      const d = game.drops[i];
      d.t++;
      if (!d.onGround || d.vy < 0) {
        d.vy = Math.min(d.vy + CONFIG.physics.gravity, CONFIG.physics.maxFall);
        Dungeon.moveAndCollide(d);
        d.vx *= d.onGround ? 0.6 : 0.98;
      }
      // 낭떠러지에 떨어지면 플레이어 근처 땅으로
      if (d.y > game.level.killY) {
        const g = game.groundAt(p.x);
        d.x = g.x; d.y = g.y - 60; d.vy = 0; d.vx = 0;
      }
      if (d.t < L.pickupDelay || p.dead) continue;
      if (Math.abs(p.x - d.x) < L.pickupRange && Math.abs(p.y - d.y) < 50) {
        if (p.pickup(d.item)) {
          game.drops.splice(i, 1);
          const c = this.color(d.item);
          Effects.popText(d.x, d.y - 40, d.item.name, c, d.item.rarity >= 2 ? 17 : 14);
          Effects.radialSparks(d.x, d.y - 10, 10 + d.item.rarity * 6, c, Math.min(2, d.item.rarity));
          Sound.play('pickup');
        } else if (!d.fullShown || d.t - d.fullShown > 120) {
          d.fullShown = d.t;
          Effects.popText(p.x, p.y - p.h - 24, `가방이 가득 참 (${Input.label('inventory')})`, '#f99', 13);
        }
      }
    }
  },

  // 바닥 아이템: 등급 색 빛기둥 + 떠 있는 아이콘 + 가까우면 이름
  drawDrops(ctx, game) {
    const t = Game.frame || 0, p = game.player;
    for (const d of game.drops) {
      const c = this.color(d.item), r = d.item.rarity;
      const bob = Math.sin(t * 0.08 + d.item.id) * 2.5;
      ctx.save();
      // 빛기둥 (등급이 높을수록 높고 진하게)
      const H = 70 + r * 45, pw = 10 + r * 3;
      const g = ctx.createLinearGradient(0, d.y - H, 0, d.y);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, c);
      ctx.globalAlpha = (0.32 + r * 0.1) * (0.85 + Math.sin(t * 0.1 + d.item.id) * 0.15);
      ctx.fillStyle = g;
      ctx.fillRect(d.x - pw / 2, d.y - H, pw, H);
      ctx.globalAlpha *= 0.6;
      ctx.fillRect(d.x - 1.5, d.y - H * 1.25, 3, H * 1.25);
      // 바닥 빛
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 14 + r * 3, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // 아이콘
      ctx.shadowColor = c;
      ctx.shadowBlur = 10 + r * 3;
      this.drawIcon(ctx, d.item, d.x, d.y - 14 + bob, 1);
      ctx.restore();
      // 가까우면 이름
      if (Math.abs(p.x - d.x) < 90 && Math.abs(p.y - d.y) < 80) {
        ctx.save();
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.strokeText(d.item.name, d.x, d.y - 34 + bob);
        ctx.fillStyle = c;
        ctx.fillText(d.item.name, d.x, d.y - 34 + bob);
        ctx.restore();
      }
    }
  },

  // 아이템 아이콘 (s = 배율, 중심 x,y). 실루엣 + 등급 색 테두리
  drawIcon(ctx, item, x, y, s) {
    const c = item.tint || this.color(item);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#0a0809';
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (item.type === 'sword') {
      ctx.rotate(-0.78);
      ctx.moveTo(-1.6, 6); ctx.lineTo(-1.6, -11); ctx.lineTo(0, -14); ctx.lineTo(1.6, -11); ctx.lineTo(1.6, 6);
      ctx.moveTo(-5, 6); ctx.lineTo(5, 6); ctx.lineTo(5, 8); ctx.lineTo(-5, 8); ctx.closePath();
      ctx.moveTo(-1.2, 8); ctx.lineTo(1.2, 8); ctx.lineTo(1.2, 13); ctx.lineTo(-1.2, 13); ctx.closePath();
    } else if (item.type === 'greatsword') {
      ctx.rotate(-0.78);
      ctx.moveTo(-3.4, 5); ctx.lineTo(-3.4, -12); ctx.lineTo(0, -16); ctx.lineTo(3.4, -12); ctx.lineTo(3.4, 5);
      ctx.moveTo(-7, 5); ctx.lineTo(7, 5); ctx.lineTo(7, 8); ctx.lineTo(-7, 8); ctx.closePath();
      ctx.moveTo(-1.5, 8); ctx.lineTo(1.5, 8); ctx.lineTo(1.5, 14); ctx.lineTo(-1.5, 14); ctx.closePath();
    } else if (item.type === 'gauntlet') {
      ctx.moveTo(-7, -3); ctx.lineTo(-7, -8); ctx.lineTo(6, -9); ctx.lineTo(8, -4); ctx.lineTo(8, 4);
      ctx.lineTo(4, 6); ctx.lineTo(4, 12); ctx.lineTo(-5, 12); ctx.lineTo(-5, 6); ctx.lineTo(-8, 3); ctx.closePath();
    } else if (item.type === 'armor') {
      ctx.moveTo(-9, -9); ctx.lineTo(-4, -11); ctx.lineTo(0, -8); ctx.lineTo(4, -11); ctx.lineTo(9, -9);
      ctx.lineTo(8, -2); ctx.lineTo(6, -2); ctx.lineTo(6, 11); ctx.lineTo(-6, 11); ctx.lineTo(-6, -2); ctx.lineTo(-8, -2); ctx.closePath();
    } else {
      ctx.arc(0, 2, 7, 0, Math.PI * 2);
      ctx.moveTo(4, 2);
      ctx.arc(0, 2, 4, 0, Math.PI * 2, true);
      ctx.moveTo(-3, -5); ctx.lineTo(0, -10); ctx.lineTo(3, -5); ctx.closePath();
    }
    ctx.fill('evenodd');
    ctx.stroke();
    ctx.restore();
  },
};

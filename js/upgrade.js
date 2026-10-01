'use strict';
// 레벨업 선택지 생성 / 적용, 보스 상자 보상

const Upgrades = {
  buildChoices(p, n) {
    const pool = [];
    for (const key in CONFIG.weapons) {
      const w = p.getWeapon(key);
      const max = CONFIG.weapons[key].levels.length;
      if (!w) pool.push({ kind: 'weapon', key, level: 1, weight: 1.0 });
      else if (w.level < max) pool.push({ kind: 'weapon', key, level: w.level + 1, weight: 1.3 });
    }
    for (const key in CONFIG.passives) {
      const lvl = p.passives[key];
      if (lvl < CONFIG.passives[key].maxLevel) pool.push({ kind: 'passive', key, level: lvl + 1, weight: 1.0 });
    }

    const choices = [];
    while (choices.length < n && pool.length > 0) {
      let total = 0;
      for (const c of pool) total += c.weight;
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < pool.length - 1; idx++) {
        r -= pool[idx].weight;
        if (r <= 0) break;
      }
      choices.push(pool[idx]);
      pool.splice(idx, 1);
    }
    if (choices.length === 0) choices.push({ kind: 'heal', key: 'heal', level: 0 });
    for (const c of choices) this.describe(c);
    return choices;
  },

  // 카드에 표시할 제목/설명/태그 채우기
  describe(c) {
    if (c.kind === 'weapon') {
      const def = CONFIG.weapons[c.key];
      c.title = def.name;
      c.color = def.color;
      c.tag = c.level === 1 ? 'NEW 무기' : `Lv ${c.level - 1} → ${c.level}`;
      c.desc = c.level === 1 ? def.desc : def.levels[c.level - 1].desc;
    } else if (c.kind === 'passive') {
      const def = CONFIG.passives[c.key];
      c.title = def.name;
      c.color = '#ffcc80';
      c.tag = c.level === 1 ? 'NEW 패시브' : `Lv ${c.level - 1} → ${c.level}`;
      c.desc = def.desc(+def.perLevel.toFixed(2));
    } else {
      c.title = '회복';
      c.color = '#ef9a9a';
      c.tag = '보너스';
      c.desc = `체력 ${CONFIG.fallbackHeal} 회복`;
    }
    return c;
  },

  apply(c, p) {
    if (c.kind === 'weapon') {
      const w = p.getWeapon(c.key);
      if (w) w.level = Math.min(w.maxLevel, w.level + 1);
      else p.addWeapon(c.key);
    } else if (c.kind === 'passive') {
      p.passives[c.key]++;
      p.recalc();
    } else {
      p.heal(CONFIG.fallbackHeal);
    }
  },

  // 보스 상자: 보유 무기 강화 → 없으면 새 무기 → 그것도 없으면 완전 회복
  openChest(p) {
    const msgs = [];
    for (let i = 0; i < CONFIG.chest.weaponUpgrades; i++) {
      const up = p.weapons.filter((w) => w.level < w.maxLevel);
      if (up.length > 0) {
        const w = up[Math.floor(Math.random() * up.length)];
        w.level++;
        msgs.push(`${w.def.name} Lv ${w.level}`);
        continue;
      }
      const unowned = Object.keys(CONFIG.weapons).filter((k) => !p.getWeapon(k));
      if (unowned.length > 0) {
        const w = p.addWeapon(unowned[Math.floor(Math.random() * unowned.length)]);
        msgs.push(`${w.def.name} 획득`);
        continue;
      }
      p.heal(p.maxHp);
      msgs.push('체력 완전 회복');
      break;
    }
    p.heal(p.maxHp * CONFIG.chest.healPercent);
    return '상자: ' + msgs.join(', ') + '!';
  },
};

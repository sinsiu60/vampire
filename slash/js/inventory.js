'use strict';
// 인벤토리 (Tab): 장비 칸 4개(무기1·무기2·갑옷·반지) + 가방 + 능력치 + 비교 툴팁
// 마우스: 좌클릭 = 장착/해제, 우클릭 = 무기를 보조 칸에 장착, X 두 번 = 버리기
// 키보드: A/D/W/S 이동, 스페이스/Enter 장착·해제, X 버리기, Tab/Esc 닫기

const Inventory = {
  sel: { area: 'bag', i: 0 },
  discardArm: 0,      // X 를 한 번 누른 뒤 남은 시간 (한 번 더 누르면 버림)
  msg: null,          // 안내 문구 { text, color, life }

  // 화면 배치 (960×540 기준)
  L: {
    x: 110, y: 46, w: 740, h: 450,
    eqX: 140, eqY: 112, eqS: 56, eqGap: 74,
    bagX: 486, bagY: 112, cell: 56, gap: 10, cols: 4,
    statX: 222, statY: 120,
  },
  EQUIP: [
    { key: 'w0', label: '무기 1' }, { key: 'w1', label: '무기 2' },
    { key: 'armor', label: '갑옷' }, { key: 'ring', label: '반지' },
  ],

  reset() {
    this.sel = { area: 'bag', i: 0 };
    this.discardArm = 0;
    this.msg = null;
  },

  open(game) {
    game.setState('inventory');
    this.discardArm = 0;
    Input.mouseMoved = false;
    Sound.play('invOpen');
  },

  close(game) {
    game.setState('playing');
    Sound.play('invClose');
  },

  // ---------- 장비 칸 접근 ----------
  equipGet(p, key) {
    if (key === 'w0') return p.gear.weapons[0];
    if (key === 'w1') return p.gear.weapons[1];
    return p.gear[key];
  },
  equipSet(p, key, item) {
    if (key === 'w0') p.gear.weapons[0] = item;
    else if (key === 'w1') p.gear.weapons[1] = item;
    else p.gear[key] = item;
  },
  // 가방 아이템을 장착하면 들어갈 칸 (무기: 사용 중인 칸, toOther 면 반대 칸)
  targetKey(p, item, toOther) {
    if (item.slot === 'weapon') return 'w' + (toOther ? 1 - p.activeWeapon : p.activeWeapon);
    return item.slot;
  },

  equipFromBag(p, i, toOther) {
    const item = p.bag[i];
    if (!item) return;
    const key = this.targetKey(p, item, toOther);
    const old = this.equipGet(p, key);
    this.equipSet(p, key, item);
    if (old) p.bag[i] = old; else p.bag.splice(i, 1);
    p.recalcStats();
    this.say(`${item.name} 장착`, Loot.color(item));
    Sound.play('equip');
  },

  unequip(p, key) {
    const item = this.equipGet(p, key);
    if (!item) return;
    if (item.slot === 'weapon' && !(key === 'w0' ? p.gear.weapons[1] : p.gear.weapons[0])) {
      this.say('무기는 최소 1개 장착해야 합니다', '#f99');
      Sound.play('deny');
      return;
    }
    if (p.bag.length >= CONFIG.loot.bagSize) { this.say('가방이 가득 찼습니다', '#f99'); Sound.play('deny'); return; }
    this.equipSet(p, key, null);
    p.bag.push(item);
    p.recalcStats();
    this.say(`${item.name} 해제`, '#ccc');
    Sound.play('equip');
  },

  discard(p, i) {
    const item = p.bag[i];
    if (!item) return;
    p.bag.splice(i, 1);
    this.say(`${item.name} 버림`, '#f99');
    Sound.play('discard');
    this.discardArm = 0;
  },

  say(text, color) { this.msg = { text, color, life: 120 }; },

  // ---------- 입력 ----------
  update(game) {
    const p = game.player, L = this.L;
    if (this.msg && --this.msg.life <= 0) this.msg = null;
    if (this.discardArm > 0) this.discardArm--;
    if (Input.isPressed('inventory') || Input.isPressed('pause')) { this.close(game); return; }

    // 마우스로 가리키기
    if (Input.mouseMoved) {
      Input.mouseMoved = false;
      const h = this.hitTest(Input.mouse());
      if (h) { if (h.area !== this.sel.area || h.i !== this.sel.i) this.discardArm = 0; this.sel = h; }
    }
    // 키보드 이동
    const s = this.sel;
    const mv = (dx, dy) => {
      this.discardArm = 0;
      if (s.area === 'equip') {
        if (dx > 0) { s.area = 'bag'; s.i = Math.min(CONFIG.loot.bagSize - 1, Math.min(s.i, 2) * L.cols); }
        else s.i = (s.i + dy + 4) % 4;
      } else {
        const c = s.i % L.cols, r = Math.floor(s.i / L.cols), rows = Math.ceil(CONFIG.loot.bagSize / L.cols);
        if (dx < 0 && c === 0) { s.area = 'equip'; s.i = Math.min(3, r); return; }
        const nc = Math.max(0, Math.min(L.cols - 1, c + dx)), nr = (r + dy + rows) % rows;
        s.i = Math.min(CONFIG.loot.bagSize - 1, nr * L.cols + nc);
      }
    };
    if (Input.isPressed('left')) mv(-1, 0);
    if (Input.isPressed('right')) mv(1, 0);
    if (Input.isPressed('up')) mv(0, -1);
    if (Input.isPressed('down')) mv(0, 1);

    const click = Input.isPressed('light'), rclick = Input.isPressed('heavy');
    const confirm = Input.isPressed('jump') || Input.isPressed('restart');
    if (click || rclick) {
      const h = this.hitTest(Input.mouse());
      if (!h) return;
      this.sel = h;
    }
    if (click || rclick || confirm) {
      if (this.sel.area === 'bag') {
        const it = p.bag[this.sel.i];
        if (it) this.equipFromBag(p, this.sel.i, rclick && it.slot === 'weapon');
      } else {
        this.unequip(p, this.EQUIP[this.sel.i].key);
      }
    }
    if (Input.isPressed('discard') && this.sel.area === 'bag' && p.bag[this.sel.i]) {
      if (this.discardArm > 0) this.discard(p, this.sel.i);
      else { this.discardArm = 90; this.say(`한 번 더 ${Input.label('discard')}: 버리기`, '#fc8'); }
    }
  },

  rectOf(area, i) {
    const L = this.L;
    if (area === 'equip') return { x: L.eqX, y: L.eqY + i * L.eqGap, w: L.eqS, h: L.eqS };
    const c = i % L.cols, r = Math.floor(i / L.cols);
    return { x: L.bagX + c * (L.cell + L.gap), y: L.bagY + r * (L.cell + L.gap), w: L.cell, h: L.cell };
  },

  hitTest(m) {
    for (let i = 0; i < 4; i++) { const r = this.rectOf('equip', i); if (this.inRect(m, r)) return { area: 'equip', i }; }
    for (let i = 0; i < CONFIG.loot.bagSize; i++) { const r = this.rectOf('bag', i); if (this.inRect(m, r)) return { area: 'bag', i }; }
    return null;
  },
  inRect(m, r) { return m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h; },

  // ---------- 그리기 ----------
  draw(ctx, game) {
    const p = game.player, L = this.L, V = CONFIG.view;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, V.width, V.height);
    // 패널
    ctx.fillStyle = 'rgba(14,12,16,0.94)';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.fillRect(L.x, L.y, L.w, L.h);
    ctx.strokeRect(L.x + 0.5, L.y + 0.5, L.w - 1, L.h - 1);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('인벤토리', L.x + 24, L.y + 36);
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('장비', L.eqX, L.eqY - 12);
    ctx.fillText(`가방 ${p.bag.length}/${CONFIG.loot.bagSize}`, L.bagX, L.bagY - 12);

    // 장비 칸
    for (let i = 0; i < 4; i++) {
      const E = this.EQUIP[i], r = this.rectOf('equip', i);
      const it = this.equipGet(p, E.key);
      this.slot(ctx, r, it, this.sel.area === 'equip' && this.sel.i === i);
      ctx.font = '10px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText(E.label, r.x + r.w / 2, r.y + r.h + 11);
      // 사용 중인 무기 표시
      if ((E.key === 'w0' && p.activeWeapon === 0) || (E.key === 'w1' && p.activeWeapon === 1)) {
        ctx.fillStyle = '#5ff';
        ctx.font = 'bold 9px "Segoe UI", sans-serif';
        ctx.fillText('사용 중', r.x + r.w / 2, r.y - 3);
      }
    }
    // 가방
    for (let i = 0; i < CONFIG.loot.bagSize; i++) {
      this.slot(ctx, this.rectOf('bag', i), p.bag[i], this.sel.area === 'bag' && this.sel.i === i);
    }

    // 능력치 요약
    this.statsPanel(ctx, p);

    // 툴팁 (선택한 아이템)
    const it = this.sel.area === 'bag' ? p.bag[this.sel.i] : this.equipGet(p, this.EQUIP[this.sel.i].key);
    if (it) this.tooltip(ctx, p, it, this.sel.area === 'bag');

    // 안내
    ctx.textAlign = 'center';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const k = (a) => Input.label(a);
    ctx.fillText(`${k('light')}/${k('jump')}: 장착·해제   ${k('heavy')}: 무기를 보조 칸에 장착   ${k('discard')} 두 번: 버리기   ${k('left')}${k('up')}${k('down')}${k('right')}: 이동   ${k('inventory')}/${k('pause')}: 닫기`, V.width / 2, L.y + L.h - 14);
    if (this.msg) {
      ctx.globalAlpha = Math.min(1, this.msg.life / 30);
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.fillStyle = this.msg.color;
      ctx.fillText(this.msg.text, V.width / 2, L.y + L.h - 34);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  slot(ctx, r, it, selected) {
    ctx.fillStyle = selected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = it ? Loot.color(it) : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (selected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5);
    }
    if (it) {
      ctx.save();
      // 등급 색 은은한 배경
      const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 2, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.7);
      g.addColorStop(0, Loot.color(it) + '44');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.shadowColor = Loot.color(it);
      ctx.shadowBlur = it.rarity * 3;
      Loot.drawIcon(ctx, it, r.x + r.w / 2, r.y + r.h / 2, r.w / 34);
      ctx.restore();
      if (it.unique) {
        ctx.fillStyle = Loot.color(it);
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('★', r.x + r.w - 3, r.y + 11);
      }
    }
  },

  // 능력치 표시용 목록 [이름, 값 문자열]
  statRows(p, s) {
    const P = CONFIG.player;
    return [
      ['최대 체력', `${P.maxHp + s.maxHp}`],
      ['최대 스태미나', `${P.maxStamina + s.stamina}`],
      ['무기 공격력', `×${s.power.toFixed(2)}`],
      ['공격력', `+${s.atk}%`],
      ['공격 속도', `+${s.aspd}%`],
      ['치명타 확률', `${Math.round(P.critChance * 100 + s.crit)}%`],
      ['흡혈', `${s.lifesteal.toFixed(1)}%`],
      ['스킬 쿨감', `${s.cdr}%`],
      ['체간 피해', `+${s.posture}%`],
      ['받는 피해', `-${s.reduce}%`],
    ];
  },

  statsPanel(ctx, p) {
    const L = this.L, s = p.stats;
    const x = L.statX, y = L.statY;
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.fillStyle = '#fff';
    const W = p.weaponCfg();
    ctx.fillText(`능력치 · ${W.name}`, x, y - 4);
    ctx.font = '11px "Segoe UI", sans-serif';
    this.statRows(p, s).forEach((row, i) => {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(row[0], x, y + 16 + i * 17);
      ctx.fillStyle = '#e8f6ff';
      ctx.textAlign = 'right';
      ctx.fillText(row[1], x + 200, y + 16 + i * 17);
      ctx.textAlign = 'left';
    });
    // 고유 효과
    const us = Object.keys(s.uniques);
    let yy = y + 16 + 10 * 17 + 8;
    for (const u of us) {
      const U = CONFIG.loot.uniques[u];
      ctx.fillStyle = CONFIG.loot.rarities[3].color;
      ctx.fillText(`★ ${U.name}: ${U.desc}`, x, yy);
      yy += 15;
    }
    // 스킬
    yy += 4;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const key of ['skill1', 'skill2']) {
      const S = CONFIG.skills[key];
      const cd = (S.cooldown * (1 - s.cdr / 100) / 60).toFixed(1);
      ctx.fillText(`${Input.label(key)} ${S.name} (${cd}초)`, x, yy);
      yy += 15;
    }
  },

  // 툴팁: 아이템 정보 + (가방 아이템이면) 장착 중인 것과 비교
  tooltip(ctx, p, it, fromBag) {
    const L = this.L;
    const lines = [];
    const R = CONFIG.loot.rarities[it.rarity];
    lines.push({ text: it.name, color: R.color, font: 'bold 14px' });
    lines.push({ text: `${R.name} 등급`, color: R.color, font: '11px' });
    for (const l of Loot.describe(it)) lines.push({ text: l.text, color: l.color, font: '11px' });

    if (fromBag) {
      const key = this.targetKey(p, it, false);
      const cur = this.equipGet(p, key);
      lines.push({ gap: 6 });
      lines.push({ text: cur ? `장착 중 (${key === 'w0' || key === 'w1' ? '사용 중인 무기' : CONFIG.loot.nouns[it.slot]}): ${cur.name}` : '빈 칸에 장착', color: cur ? Loot.color(cur) : '#aaa', font: '11px' });
      // 바꿨을 때 능력치 변화
      const g = { weapons: p.gear.weapons.slice(), armor: p.gear.armor, ring: p.gear.ring };
      if (key === 'w0') g.weapons[0] = it; else if (key === 'w1') g.weapons[1] = it; else g[key] = it;
      const before = p.stats, after = Loot.computeStats(g, p.activeWeapon);
      const diffs = this.diff(p, before, after);
      if (diffs.length === 0) lines.push({ text: '능력치 변화 없음', color: '#888', font: '11px' });
      for (const d of diffs) lines.push({ text: d.text, color: d.up ? '#7f7' : '#f77', font: 'bold 11px' });
      if (it.slot === 'weapon' && it.type !== p.weaponType()) {
        lines.push({ text: `무기 종류가 바뀜: ${p.weaponCfg().name} → ${CONFIG.weapons[it.type].name}`, color: '#fd8', font: '11px' });
      }
    }

    // 크기 계산
    let h = 14, w = 0;
    for (const l of lines) {
      if (l.gap) { h += l.gap; continue; }
      ctx.font = `${l.font} "Segoe UI", sans-serif`;
      w = Math.max(w, ctx.measureText(l.text).width);
      h += l.font.indexOf('14') >= 0 ? 19 : 15;
    }
    w += 24;
    // 선택 칸 옆 (화면 밖으로 안 나가게)
    const r = this.rectOf(this.sel.area, this.sel.i);
    let x = r.x + r.w + 12, y = r.y;
    if (x + w > CONFIG.view.width - 8) x = r.x - w - 12;
    if (y + h > L.y + L.h - 50) y = L.y + L.h - 50 - h;
    ctx.save();
    ctx.fillStyle = 'rgba(6,6,10,0.96)';
    ctx.strokeStyle = R.color;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.textAlign = 'left';
    let yy = y + 4;
    for (const l of lines) {
      if (l.gap) {
        yy += l.gap;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x + 10, yy - 3, w - 20, 1);
        continue;
      }
      const big = l.font.indexOf('14') >= 0;
      yy += big ? 19 : 15;
      ctx.font = `${l.font} "Segoe UI", sans-serif`;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x + 12, yy - 3);
    }
    ctx.restore();
  },

  // 능력치 차이 목록
  diff(p, a, b) {
    const P = CONFIG.player, out = [];
    const num = (k, name, unit, dec) => {
      const d = (b[k] || 0) - (a[k] || 0);
      if (Math.abs(d) < 0.05) return;
      const v = dec ? d.toFixed(dec) : Math.round(d);
      out.push({ text: `${name} ${d > 0 ? '+' : ''}${v}${unit}`, up: k === 'reduce' ? d > 0 : d > 0 });
    };
    if (Math.abs(b.power - a.power) > 0.001) out.push({ text: `무기 공격력 ×${a.power.toFixed(2)} → ×${b.power.toFixed(2)}`, up: b.power > a.power });
    num('atk', '공격력', '%');
    num('aspd', '공격 속도', '%');
    num('crit', '치명타 확률', '%');
    num('lifesteal', '흡혈', '%', 1);
    num('cdr', '스킬 쿨감', '%');
    num('maxHp', '최대 체력', '');
    num('stamina', '최대 스태미나', '');
    num('posture', '체간 피해', '%');
    num('reduce', '받는 피해 감소', '%');
    for (const u in b.uniques) if (!a.uniques[u]) out.push({ text: `+ ${CONFIG.loot.uniques[u].name}`, up: true });
    for (const u in a.uniques) if (!b.uniques[u]) out.push({ text: `- ${CONFIG.loot.uniques[u].name}`, up: false });
    return out;
  },
};

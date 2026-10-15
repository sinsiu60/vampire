'use strict';
// 각인: 무기에 붙이는 추가 효과 (데이터: data/engravings.js, 수치: config.js engrave)
//  · 무기마다 슬롯 3칸. 무기 전용 각인은 그 무기에만, 공용 각인은 아무 무기에
//  · 전설 각인: 보스·엘리트 보상에 낮은 확률로 / 저주 각인: 저주 제단에서만 (큰 이득 + 큰 대가)
//  · 속성 세트 효과·공용/전설/저주 각인 동작은 synergy.js
//  · 각인 하나 = { id, rarity(등급), level(강화 0~3) }. 수치 = (기본 + 강화×perLevel) × 등급 배율
//  · scope "held": 그 무기를 들고 있을 때만 효과 / "always": 항상
// 효과는 각 시스템에서 Engrave.get(player, id) 로 확인한다 (combat.js, player.js, skills.js 등)
// 화면: 보상 카드(Choice), 장착·교체·강화 화면, Tab 인벤토리(보기)

const Engrave = {
  byId: {},

  init() {
    for (const e of DATA.engravings) this.byId[e.id] = e;
  },

  def(inst) { return this.byId[inst.id]; },

  make(id, rarity) { return { id, rarity: rarity || 0, level: 0, uid: Math.random().toString(36).slice(2, 9) }; },

  emptySlots() {
    const o = {};
    for (const t of WEAPON_ORDER) o[t] = new Array(CONFIG.engrave.slots).fill(null);
    return o;
  },

  // 수치 하나 (등급·강화 반영)
  val(inst, key) {
    const d = this.def(inst);
    const base = d.values[key] + ((d.perLevel && d.perLevel[key]) || 0) * inst.level;
    const v = d.fixed && d.fixed.indexOf(key) >= 0 ? base : base * CONFIG.engrave.rarityMult[inst.rarity];
    return d.round && d.round.indexOf(key) >= 0 ? Math.round(v) : v;
  },

  fmt(v) { return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1); },

  desc(inst) {
    const d = this.def(inst);
    return d.desc.replace(/\{(\w+)\}/g, (m, k) => (d.values[k] !== undefined ? this.fmt(this.val(inst, k)) : m));
  },

  // 지금 효과가 있는 각인 (들고 있는 무기의 것, 또는 scope always)
  get(p, id) {
    if (!p || !p.engr) return null;
    const held = p.weaponType();
    for (const t of WEAPON_ORDER) {
      for (const inst of p.engr[t]) {
        if (inst && inst.id === id && (t === held || this.def(inst).scope === 'always')) return inst;
      }
    }
    return null;
  },
  // 효과 수치 (없으면 0)
  v(p, id, key) { const i = this.get(p, id); return i ? this.val(i, key) : 0; },

  // 장착된 모든 각인 [{ inst, weapon, slot }]
  all(p) {
    const out = [];
    for (const t of WEAPON_ORDER) p.engr[t].forEach((inst, s) => { if (inst) out.push({ inst, weapon: t, slot: s }); });
    return out;
  },

  // 둔화: 적 행동이 느려짐 (sec 초). 보스는 덜 느려짐. mult 를 주면 그 배율 (빙결 = freezeMult)
  slow(e, sec, mult) {
    if (!sec || e.dead) return;
    const E = CONFIG.engrave;
    const freeze = mult !== undefined && mult <= E.freezeMult;
    const m = freeze ? (e.isBoss ? E.bossFreezeMult : mult) : mult !== undefined ? mult : e.isBoss ? E.bossSlowMult : E.slowMult;
    // 이미 더 강하게 느려져 있으면 시간만 늘림
    if (e.slowTimer > 0 && e.slowMult < m) { e.slowTimer = Math.max(e.slowTimer, Math.round(sec * 60)); return; }
    e.slowTimer = Math.max(e.slowTimer || 0, Math.round(sec * 60));
    e.slowMult = m;
    e.frozen = freeze;
  },

  // 능력치에 더하는 각인 (player.recalcStats 에서)
  applyStats(p, s) {
    s.crit += this.v(p, 'sword_keen', 'crit');
  },

  // ---------- 보상 ----------
  rollRarity(fi, luck) {
    const E = CONFIG.engrave;
    const w = E.rarityWeights[Math.min(fi, E.rarityWeights.length - 1)].slice();
    for (let k = 0; k < (luck || 0); k++) { w[2] += w[1] * 0.4; w[1] += w[0] * 0.4; w[0] *= 0.6; }
    let sum = 0;
    for (const x of w) sum += x;
    let r = Math.random() * sum;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return 0;
  },

  // 서로 다른 각인 n개 (이미 장착한 것은 제외). legend: 전설 각인이 나올 확률 (한 장만)
  // kind: 'normal' (일반·무기·공용) / 'curse' (저주 제단)
  offer(game, n, luck, legend, kind) {
    const p = game.player, owned = new Set(this.all(p).map((a) => a.inst.id));
    const ok = (d) => !owned.has(d.id) && (kind === 'curse' ? d.curse : !d.curse && !d.legend);
    const pool = DATA.engravings.filter(ok);
    const legends = DATA.engravings.filter((d) => d.legend && !owned.has(d.id));
    const out = [];
    const pick = (list) => {
      let sum = 0;
      for (const d of list) sum += d.weight || 1;
      let r = Math.random() * sum, idx = 0;
      for (let i = 0; i < list.length; i++) { r -= list[i].weight || 1; if (r <= 0) { idx = i; break; } }
      return list.splice(idx, 1)[0];
    };
    if (legend && legends.length && Math.random() < legend) out.push(this.make(pick(legends).id, 3));
    while (out.length < n && pool.length) {
      const d = pick(pool);
      out.push(this.make(d.id, d.curse ? 0 : Math.max(d.minRarity || 0, this.rollRarity(game.floorIndex || 0, luck))));
    }
    // 전설 카드는 무작위 위치에
    if (out.length > 1 && this.def(out[0]).legend) {
      const j = Math.floor(Math.random() * out.length);
      [out[0], out[j]] = [out[j], out[0]];
    }
    return out;
  },

  // 카드 선택지 (Choice 옵션)
  cardOption(game, inst, then) {
    return {
      label: this.def(inst).name, desc: this.desc(inst),
      draw: (ctx, x, y, w, h, on) => this.drawCard(ctx, inst, x, y, w, h, on),
      act: () => { this.beginEquip(game, inst, then); return true; },
    };
  },

  // 엘리트: 각인 1개 (받기 / 거절)
  rewardElite(game) {
    const [inst] = this.offer(game, 1, 0, CONFIG.engrave.legendChance.elite);
    if (!inst) return;
    const gold = Math.round(CONFIG.engrave.declineGold * game.floorCfg.gold);
    Choice.open(game, {
      title: '엘리트 보상', sub: '각인을 받거나, 거절하고 골드를 받는다', color: '#ff9a2a', closable: false,
      options: [
        this.cardOption(game, inst),
        { label: '거절', icon: 'shop', color: '#ffd23a', desc: `각인 대신\n골드 +${gold}`, act: () => { game.gold += gold; Sound.play('coin'); } },
      ],
    });
  },

  // 보스: 각인 카드 3장 중 하나
  rewardBoss(game) {
    const E = CONFIG.engrave;
    const L = E.legendChance.boss;
    const cards = this.offer(game, E.bossCards, E.bossLuck, L[Math.min(game.floorIndex || 0, L.length - 1)]);
    const options = cards.map((inst) => this.cardOption(game, inst));
    // 확률로 한 장은 변형 카드 (변형이 없는 무기의 것)
    const tf = Transform.available(game.player);
    if (tf.length && Math.random() < CONFIG.transform.bossChance) {
      const d = tf[(Math.random() * tf.length) | 0];
      const at = (Math.random() * Math.max(1, options.length)) | 0;
      if (options.length >= E.bossCards) options[at] = Transform.cardOption(game, d);
      else options.splice(at, 0, Transform.cardOption(game, d));
    }
    if (!options.length) return;
    Choice.open(game, {
      title: '보스 보상', sub: '각인 또는 무기 변형 하나를 고른다', color: '#ff3b3b', closable: false,
      options,
    });
  },

  beginEquip(game, inst, then) {
    EngraveUI.open(game, { mode: 'equip', inst, then });
  },

  // ---------- 그리기 ----------
  // 속성 아이콘
  elemIcon(ctx, el, x, y, s) {
    const E = DATA.elements[el];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 10, s / 10);
    ctx.fillStyle = E.color;
    ctx.strokeStyle = E.color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (el === 'fire') {
      ctx.moveTo(0, -9); ctx.quadraticCurveTo(7, -1, 5, 5); ctx.quadraticCurveTo(0, 10, -5, 5); ctx.quadraticCurveTo(-7, -1, 0, -9); ctx.fill();
    } else if (el === 'lightning') {
      ctx.moveTo(2, -10); ctx.lineTo(-5, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 10); ctx.lineTo(5, -2); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill();
    } else if (el === 'frost') {
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3;
        ctx.moveTo(Math.cos(a) * -9, Math.sin(a) * -9); ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
      }
      ctx.stroke();
    } else {
      ctx.moveTo(0, -9); ctx.quadraticCurveTo(7, 2, 5, 5); ctx.arc(0, 4, 5, 0, Math.PI); ctx.quadraticCurveTo(-7, 2, 0, -9); ctx.fill();
    }
    ctx.restore();
  },

  rarityColor(inst) { return this.def(inst).curse ? CONFIG.engrave.curseColor : CONFIG.loot.rarities[inst.rarity].color; },
  rarityName(inst) { return this.def(inst).curse ? '저주' : CONFIG.loot.rarities[inst.rarity].name; },

  // 큰 카드 (보상 선택 / 장착 화면)
  drawCard(ctx, inst, x, y, w, h, on) {
    const d = this.def(inst), col = this.rarityColor(inst), E = DATA.elements[d.element];
    ctx.save();
    ctx.fillStyle = on ? 'rgba(28,26,36,0.98)' : 'rgba(16,15,22,0.96)';
    ctx.fillRect(x, y, w, h);
    // 등급 색 테두리 + 위쪽 띠
    ctx.strokeStyle = col;
    ctx.lineWidth = on ? 2.5 : 1.5;
    if (on) { ctx.shadowColor = col; ctx.shadowBlur = 16; }
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(0, y, 0, y + 70);
    g.addColorStop(0, col + '33');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x + 1, y + 1, w - 2, 70);
    // 속성 아이콘
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(x + w / 2, y + 42, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = E.color; ctx.lineWidth = 1.5; ctx.stroke();
    this.elemIcon(ctx, d.element, x + w / 2, y + 42, 13);
    // 이름 / 등급 / 무기
    Menu.text(ctx, d.name + (inst.level ? ` +${inst.level}` : ''), x + w / 2, y + 92, 'bold 17px "Segoe UI", sans-serif', '#fff');
    const wname = d.weapon ? CONFIG.weapons[d.weapon].name + ' 전용' : '공용';
    Menu.text(ctx, `${this.rarityName(inst)} · ${E.name} · ${wname}`, x + w / 2, y + 111, '11px "Segoe UI", sans-serif', col);
    // 전설·저주 표시
    if (d.legend || d.curse) {
      Menu.text(ctx, d.legend ? '★ 전설 각인' : '✦ 저주 각인', x + w / 2, y + 16, 'bold 10px "Segoe UI", sans-serif', col);
    }
    // 설명
    ctx.font = '12px "Segoe UI", sans-serif';
    const lines = Choice.wrap(ctx, this.desc(inst), w - 24);
    lines.forEach((l, i) => Menu.text(ctx, l, x + w / 2, y + 138 + i * 17, '12px "Segoe UI", sans-serif', 'rgba(232,240,250,0.9)'));
    // 강화 표시
    this.pips(ctx, inst, x + w / 2, y + h - 18);
    ctx.restore();
  },

  // 강화 단계 점 (+0 ~ +3)
  pips(ctx, inst, cx, cy) {
    const M = CONFIG.engrave.maxLevel;
    for (let i = 0; i < M; i++) {
      ctx.fillStyle = i < inst.level ? '#fff' : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(cx - (M - 1) * 7 + i * 14, cy - 4);
      ctx.lineTo(cx - (M - 1) * 7 + i * 14 + 4, cy);
      ctx.lineTo(cx - (M - 1) * 7 + i * 14, cy + 4);
      ctx.lineTo(cx - (M - 1) * 7 + i * 14 - 4, cy);
      ctx.closePath();
      ctx.fill();
    }
  },

  // 작은 슬롯
  drawSlot(ctx, inst, x, y, w, h, sel, enabled) {
    ctx.save();
    ctx.globalAlpha = enabled === false ? 0.35 : 1;
    ctx.fillStyle = sel ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.035)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = inst ? this.rarityColor(inst) : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = sel ? 2 : 1;
    if (!inst) ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5); }
    if (inst) {
      const d = this.def(inst);
      this.elemIcon(ctx, d.element, x + 18, y + h / 2, 9);
      Menu.text(ctx, d.name + (inst.level ? ` +${inst.level}` : ''), x + 34, y + h / 2 - 2, 'bold 12px "Segoe UI", sans-serif', '#fff', 'left');
      Menu.text(ctx, this.rarityName(inst) + (d.weapon ? '' : ' · 공용'), x + 34, y + h / 2 + 13, '10px "Segoe UI", sans-serif', this.rarityColor(inst), 'left');
    } else {
      Menu.text(ctx, '빈 칸', x + w / 2, y + h / 2 + 4, '11px "Segoe UI", sans-serif', 'rgba(255,255,255,0.3)');
    }
    ctx.restore();
  },
};

// ---------- 장착 · 교체 · 강화 · 보기 화면 ----------
// mode 'equip': 새 각인(inst)을 무기 슬롯에 장착 / 교체 / 다른 각인 강화(+1)에 쓰기 / 버리기
// mode 'upgrade': (휴식) 장착한 각인 하나 +1
// mode 'view': (Tab) 보기만
const EngraveUI = {
  cfg: null,
  sel: { w: 0, s: 0 },
  rects: [],
  msg: null,
  t: 0,

  open(game, cfg) {
    this.cfg = cfg;
    this.t = 0;
    this.msg = null;
    const p = game.player;
    // 처음 커서: 장착 가능한 무기의 빈 칸
    let w = WEAPON_ORDER.indexOf(p.weaponType()), s = 0;
    if (cfg.mode === 'equip') {
      const d = Engrave.def(cfg.inst);
      if (d.weapon) w = WEAPON_ORDER.indexOf(d.weapon);
      const empty = p.engr[WEAPON_ORDER[w]].indexOf(null);
      s = empty >= 0 ? empty : 0;
    }
    this.sel = { w, s };
    game.setState('engrave');
    Input.mouseMoved = false;
  },

  close(game, result) {
    const c = this.cfg;
    this.cfg = null;
    if (game.state === 'engrave') game.setState('playing');
    p_recalc(game);
    if (c && c.then) c.then(game, result);
    if (c && result === 'cancel' && c.onCancel) c.onCancel(game);
  },

  say(text, color) { this.msg = { text, color: color || '#f99', life: 140 }; },

  canEquip(p, inst, w) {
    const d = Engrave.def(inst);
    return !d.weapon || d.weapon === WEAPON_ORDER[w];
  },

  update(game) {
    const c = this.cfg, p = game.player;
    if (!c) { game.setState('playing'); return; }
    this.t++;
    if (this.msg && --this.msg.life <= 0) this.msg = null;
    const k = (a) => Input.isPressed(a);
    if (c.mode === 'view' && (k('inventory') || k('back') || k('pause'))) { this.close(game); Sound.play('invClose'); return; }
    if ((c.mode === 'upgrade' || c.cancelable) && (k('back') || k('pause'))) { this.close(game, 'cancel'); Sound.play('menuBack'); return; }
    // 이동 (s.s = -1: 변형 칸)
    const S = CONFIG.engrave.slots, s = this.sel, N = S + 1;
    if (k('menuLeft')) { s.w = (s.w + 2) % 3; Sound.play('menuMove'); }
    if (k('menuRight')) { s.w = (s.w + 1) % 3; Sound.play('menuMove'); }
    if (k('menuUp')) { s.s = (s.s + 1 + N - 1) % N - 1; Sound.play('menuMove'); }
    if (k('menuDown')) { s.s = (s.s + 1 + 1) % N - 1; Sound.play('menuMove'); }
    const click = Input.pressed.Mouse0 !== undefined, rclick = Input.pressed.Mouse2 !== undefined;
    if (Input.mouseMoved || click || rclick) {
      Input.mouseMoved = false;
      const h = Menu.hit(this.rects);
      if (h >= 0) { const nw = Math.floor(h / N), ns = h % N - 1; if (nw !== s.w || ns !== s.s) Sound.play('menuMove'); s.w = nw; s.s = ns; }
      if (h < 0 && (click || rclick)) return;
    }
    if (this.t < 6) return;
    const t = WEAPON_ORDER[s.w], cur = s.s >= 0 ? p.engr[t][s.s] : null;
    const M = CONFIG.engrave.maxLevel;
    if (c.mode === 'view') return;
    if (s.s < 0) {
      if (k('confirm') || click || k('upgrade') || rclick) { this.say('변형 칸입니다 (변형은 대장간에서 바꾼다)'); Sound.play('deny'); }
      if (c.mode === 'upgrade' || !k('discard')) return;
    }
    if (c.mode === 'upgrade') {
      if (k('confirm') || click) {
        if (!cur) { this.say('빈 칸입니다'); Sound.play('deny'); return; }
        if (cur.level >= M) { this.say(`이미 +${M} 입니다`); Sound.play('deny'); return; }
        cur.level++;
        Effects.popText(p.x, p.y - 70, `${Engrave.def(cur).name} +${cur.level}`, '#fff', 16);
        Sound.play('engraveUp');
        this.close(game, 'done');
      }
      return;
    }
    // equip
    const inst = c.inst;
    if (k('discard')) {
      const g = CONFIG.engrave.discardGold;
      game.gold += g;
      Effects.popText(p.x, p.y - 70, `버림 +${g} 골드`, '#ffd860', 14);
      Sound.play('discard');
      this.close(game, 'discard');
      return;
    }
    if (k('upgrade') || rclick) {
      if (!cur) { this.say('강화할 각인이 없는 칸입니다'); Sound.play('deny'); return; }
      if (cur.level >= M) { this.say(`이미 +${M} 입니다`); Sound.play('deny'); return; }
      cur.level++;
      Effects.popText(p.x, p.y - 70, `${Engrave.def(cur).name} +${cur.level}`, '#fff', 16);
      Sound.play('engraveUp');
      this.close(game, 'upgrade');
      return;
    }
    if (k('confirm') || click) {
      if (!this.canEquip(p, inst, s.w)) { this.say(`${CONFIG.weapons[Engrave.def(inst).weapon].name} 전용 각인입니다`); Sound.play('deny'); return; }
      const old = p.engr[t][s.s];
      p.engr[t][s.s] = inst;
      Effects.popText(p.x, p.y - 70, `${Engrave.def(inst).name} 각인`, Engrave.rarityColor(inst), 16);
      if (old) Effects.popText(p.x, p.y - 92, `${Engrave.def(old).name} 제거`, '#aaa', 12);
      Sound.play('engrave');
      this.close(game, 'equip');
    }
  },

  draw(ctx, game) {
    const c = this.cfg, p = game.player, V = CONFIG.view;
    if (!c) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, V.width, V.height);
    const title = c.mode === 'equip' ? '각인 장착' : c.mode === 'upgrade' ? '각인 강화' : '무기 · 각인';
    Menu.text(ctx, title, 40, 46, 'bold 24px "Segoe UI", sans-serif', '#fff', 'left', '#3ff');
    Run.drawGold(ctx, V.width - 30, 40, game.gold, 'right');
    // 새 각인 카드
    let gx = 40;
    if (c.mode === 'equip') {
      Menu.text(ctx, '새 각인', 40 + 105, 76, '12px "Segoe UI", sans-serif', 'rgba(255,255,255,0.6)');
      Engrave.drawCard(ctx, c.inst, 40, 86, 210, 300, true);
      gx = 280;
    }
    // 무기 3칸 × 슬롯 3칸
    const S = CONFIG.engrave.slots;
    const colW = (V.width - gx - 30) / 3;
    this.rects = [];
    WEAPON_ORDER.forEach((t, wi) => {
      const W = CONFIG.weapons[t], x = gx + wi * colW, held = t === p.weaponType();
      const ok = c.mode !== 'equip' || this.canEquip(p, c.inst, wi);
      ctx.globalAlpha = ok ? 1 : 0.4;
      Menu.text(ctx, W.name + (held ? ' (사용 중)' : ''), x + 8, 84, 'bold 15px "Segoe UI", sans-serif', `rgb(${W.trail.inner})`, 'left');
      // 변형 칸
      const td = Transform.def(p.trans[t]), tr = { x: x + 8, y: 94, w: colW - 24, h: 30 }, tsel = this.sel.w === wi && this.sel.s === -1;
      this.rects.push(tr);
      ctx.fillStyle = tsel ? 'rgba(255,255,255,0.1)' : td ? 'rgba(80,200,220,0.08)' : 'rgba(255,255,255,0.02)';
      ctx.fillRect(tr.x, tr.y, tr.w, tr.h);
      ctx.strokeStyle = td ? W.trail.glow : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = tsel ? 2 : 1;
      ctx.strokeRect(tr.x + 0.5, tr.y + 0.5, tr.w - 1, tr.h - 1);
      if (tsel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(tr.x - 2.5, tr.y - 2.5, tr.w + 5, tr.h + 5); }
      Menu.text(ctx, td ? `◆ 변형: ${td.name}` : '변형: 기본 형태', x + 16, 113, td ? 'bold 12px "Segoe UI", sans-serif' : '11px "Segoe UI", sans-serif', td ? `rgb(${W.trail.inner})` : 'rgba(255,255,255,0.45)', 'left');
      for (let si = 0; si < S; si++) {
        const r = { x: x + 8, y: 134 + si * 66, w: colW - 24, h: 56 };
        this.rects.push(r);
        Engrave.drawSlot(ctx, p.engr[t][si], r.x, r.y, r.w, r.h, this.sel.w === wi && this.sel.s === si, ok);
      }
      ctx.globalAlpha = 1;
    });
    // 선택한 칸 설명
    const st = WEAPON_ORDER[this.sel.w], inst = this.sel.s >= 0 ? p.engr[st][this.sel.s] : null;
    const by = 330;
    if (this.sel.s < 0) {
      this.drawTransformInfo(ctx, game, st, gx + 8, by, V.width - gx - 46);
    } else if (inst) {
      const d = Engrave.def(inst);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(gx + 8, by, V.width - gx - 46, 56);
      Engrave.elemIcon(ctx, d.element, gx + 26, by + 18, 10);
      Menu.text(ctx, `${d.name}${inst.level ? ' +' + inst.level : ''}  ·  ${Engrave.rarityName(inst)}  ·  ${DATA.elements[d.element].name}`, gx + 44, by + 22, 'bold 13px "Segoe UI", sans-serif', Engrave.rarityColor(inst), 'left');
      Menu.text(ctx, Engrave.desc(inst).replace(/\n/g, '  '), gx + 44, by + 42, '12px "Segoe UI", sans-serif', 'rgba(232,240,250,0.9)', 'left');
      Engrave.pips(ctx, inst, V.width - 70, by + 18);
    }
    // 속성 세트 효과
    if (this.sel.s >= 0) Synergy.drawPanel(ctx, p, gx + 8, by + 72, V.width - gx - 46);
    // 안내
    const kk = (a) => Input.label(a);
    const help = c.mode === 'equip'
      ? `${kk('confirm')}·클릭: 장착 (있으면 교체)    ${kk('upgrade')}·우클릭: 이 칸 각인 +1 강화 (새 각인 소모)    ${kk('discard')}: 버리기 (+${CONFIG.engrave.discardGold} 골드)${c.cancelable ? `    ${kk('back')}: 취소 (환불)` : ''}`
      : c.mode === 'upgrade' ? `${kk('confirm')}·클릭: 이 각인 +1 강화    ${kk('back')}: 취소`
        : `방향키·마우스: 살펴보기    ${kk('inventory')}/${kk('back')}: 닫기`;
    Menu.text(ctx, help, V.width / 2, V.height - 22, '12px "Segoe UI", sans-serif', 'rgba(255,255,255,0.6)');
    if (this.msg) {
      ctx.globalAlpha = Math.min(1, this.msg.life / 30);
      Menu.text(ctx, this.msg.text, V.width / 2, V.height - 48, 'bold 14px "Segoe UI", sans-serif', this.msg.color);
    }
    ctx.restore();
  },
};

// (EngraveUI) 변형 칸 설명: 이름·바뀌는 점 + 움직이는 미리보기
EngraveUI.drawTransformInfo = function (ctx, game, t, x, y, w) {
  const p = game.player, d = Transform.def(p.trans[t]), W = CONFIG.weapons[t];
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(x, y, w, 160);
  if (!d) {
    Menu.text(ctx, `${W.name} — 기본 형태`, x + 14, y + 24, 'bold 13px "Segoe UI", sans-serif', `rgb(${W.trail.inner})`, 'left');
    Menu.text(ctx, '변형이 없다. 보스 보상(변형 카드)이나 대장간에서 얻는다', x + 14, y + 46, '12px "Segoe UI", sans-serif', 'rgba(232,240,250,0.7)', 'left');
    return;
  }
  Menu.text(ctx, `◆ ${d.name}  ·  ${d.tagline}`, x + 14, y + 22, 'bold 13px "Segoe UI", sans-serif', `rgb(${W.trail.inner})`, 'left');
  const pw = Math.min(220, w * 0.34);
  ctx.font = '11px "Segoe UI", sans-serif';
  let ly = y + 44;
  for (const l of d.changes) {
    for (const ln of Choice.wrap(ctx, '· ' + l, w - pw - 40)) {
      Menu.text(ctx, ln, x + 14, ly, '11px "Segoe UI", sans-serif', 'rgba(232,240,250,0.88)', 'left');
      ly += 15;
    }
  }
  Transform.drawPreview(ctx, d, x + w - pw - 10, y + 34, pw, 116, this.t);
};

function p_recalc(game) { if (game.player) game.player.recalcStats(); }

Engrave.init();

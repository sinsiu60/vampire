'use strict';
// 각인: 무기에 붙이는 추가 효과 (데이터: data/engravings.js, 수치: config.js engrave)
//  · 무기마다 슬롯 3칸. 무기 전용 각인은 그 무기에만, 공용 각인(3단계)은 아무 무기에
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
    return d.fixed && d.fixed.indexOf(key) >= 0 ? base : base * CONFIG.engrave.rarityMult[inst.rarity];
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

  // 둔화: 적 행동이 느려짐 (sec 초). 보스는 덜 느려짐
  slow(e, sec) {
    if (!sec || e.dead) return;
    const E = CONFIG.engrave;
    e.slowTimer = Math.max(e.slowTimer || 0, Math.round(sec * 60));
    e.slowMult = e.isBoss ? E.bossSlowMult : E.slowMult;
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

  // 서로 다른 각인 n개 (이미 장착한 것은 제외)
  offer(game, n, luck) {
    const p = game.player, owned = new Set(this.all(p).map((a) => a.inst.id));
    const pool = DATA.engravings.filter((d) => !owned.has(d.id) && !d.curse && !d.legend);
    const out = [];
    while (out.length < n && pool.length) {
      let sum = 0;
      for (const d of pool) sum += d.weight || 1;
      let r = Math.random() * sum, idx = 0;
      for (let i = 0; i < pool.length; i++) { r -= pool[i].weight || 1; if (r <= 0) { idx = i; break; } }
      const d = pool.splice(idx, 1)[0];
      out.push(this.make(d.id, Math.max(d.minRarity || 0, this.rollRarity(game.floorIndex || 0, luck))));
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
    const [inst] = this.offer(game, 1, 0);
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
    const cards = this.offer(game, E.bossCards, E.bossLuck);
    if (!cards.length) return;
    Choice.open(game, {
      title: '보스 보상', sub: '각인 하나를 고른다', color: '#ff3b3b', closable: false,
      options: cards.map((inst) => this.cardOption(game, inst)),
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

  rarityColor(inst) { return CONFIG.loot.rarities[inst.rarity].color; },

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
    const R = CONFIG.loot.rarities[inst.rarity];
    const wname = d.weapon ? CONFIG.weapons[d.weapon].name + ' 전용' : '공용';
    Menu.text(ctx, `${R.name} · ${E.name} · ${wname}`, x + w / 2, y + 111, '11px "Segoe UI", sans-serif', col);
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
      Menu.text(ctx, CONFIG.loot.rarities[inst.rarity].name, x + 34, y + h / 2 + 13, '10px "Segoe UI", sans-serif', this.rarityColor(inst), 'left');
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
    if (c.mode === 'upgrade' && (k('back') || k('pause'))) { this.close(game, 'cancel'); Sound.play('menuBack'); return; }
    // 이동
    const S = CONFIG.engrave.slots, s = this.sel;
    if (k('menuLeft')) { s.w = (s.w + 2) % 3; Sound.play('menuMove'); }
    if (k('menuRight')) { s.w = (s.w + 1) % 3; Sound.play('menuMove'); }
    if (k('menuUp')) { s.s = (s.s + S - 1) % S; Sound.play('menuMove'); }
    if (k('menuDown')) { s.s = (s.s + 1) % S; Sound.play('menuMove'); }
    const click = Input.pressed.Mouse0 !== undefined, rclick = Input.pressed.Mouse2 !== undefined;
    if (Input.mouseMoved || click || rclick) {
      Input.mouseMoved = false;
      const h = Menu.hit(this.rects);
      if (h >= 0) { const nw = Math.floor(h / S), ns = h % S; if (nw !== s.w || ns !== s.s) Sound.play('menuMove'); s.w = nw; s.s = ns; }
      if (h < 0 && (click || rclick)) return;
    }
    if (this.t < 6) return;
    const t = WEAPON_ORDER[s.w], cur = p.engr[t][s.s];
    const M = CONFIG.engrave.maxLevel;
    if (c.mode === 'view') return;
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
      // 변형 칸 (5단계)
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.strokeRect(x + 8.5, 94.5, colW - 24, 28);
      Menu.text(ctx, '변형: 기본 형태', x + 16, 113, '11px "Segoe UI", sans-serif', 'rgba(255,255,255,0.45)', 'left');
      for (let si = 0; si < S; si++) {
        const r = { x: x + 8, y: 134 + si * 66, w: colW - 24, h: 56 };
        this.rects.push(r);
        Engrave.drawSlot(ctx, p.engr[t][si], r.x, r.y, r.w, r.h, this.sel.w === wi && this.sel.s === si, ok);
      }
      ctx.globalAlpha = 1;
    });
    // 선택한 칸 설명
    const st = WEAPON_ORDER[this.sel.w], inst = p.engr[st][this.sel.s];
    const by = 340;
    if (inst) {
      const d = Engrave.def(inst);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(gx + 8, by, V.width - gx - 46, 70);
      Engrave.elemIcon(ctx, d.element, gx + 26, by + 22, 10);
      Menu.text(ctx, `${d.name}${inst.level ? ' +' + inst.level : ''}  ·  ${CONFIG.loot.rarities[inst.rarity].name}  ·  ${DATA.elements[d.element].name}`, gx + 44, by + 26, 'bold 13px "Segoe UI", sans-serif', Engrave.rarityColor(inst), 'left');
      Menu.text(ctx, Engrave.desc(inst).replace(/\n/g, '  '), gx + 44, by + 48, '12px "Segoe UI", sans-serif', 'rgba(232,240,250,0.9)', 'left');
      Engrave.pips(ctx, inst, V.width - 70, by + 22);
    }
    // 속성 개수 (3단계: 세트 효과)
    const cnt = {};
    for (const a of Engrave.all(p)) { const el = Engrave.def(a.inst).element; cnt[el] = (cnt[el] || 0) + 1; }
    let ex = gx + 8;
    for (const el in DATA.elements) {
      Engrave.elemIcon(ctx, el, ex + 8, by + 96, 8);
      Menu.text(ctx, `${DATA.elements[el].name} ${cnt[el] || 0}`, ex + 20, by + 100, '12px "Segoe UI", sans-serif', DATA.elements[el].color, 'left');
      ex += 86;
    }
    Menu.text(ctx, '(속성 세트 효과는 3단계)', ex + 4, by + 100, '11px "Segoe UI", sans-serif', 'rgba(255,255,255,0.35)', 'left');
    // 안내
    const kk = (a) => Input.label(a);
    const help = c.mode === 'equip'
      ? `${kk('confirm')}·클릭: 이 칸에 장착 (있으면 교체)    ${kk('upgrade')}·우클릭: 이 칸의 각인 강화 +1 (새 각인은 사라짐)    ${kk('discard')}: 버리기 (+${CONFIG.engrave.discardGold} 골드)`
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

function p_recalc(game) { if (game.player) game.player.recalcStats(); }

Engrave.init();

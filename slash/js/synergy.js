'use strict';
// 속성 세트 효과 + 공용·전설·저주 각인의 실제 동작
//  · 장착한 모든 각인(무기 상관없이)의 속성 개수를 세서 DATA.elements[*].sets 의 n 이상이면 세트 효과
//  · 화염: 화상 / 불탄 적 사망 폭발 / 연쇄 폭발
//  · 번개: N타마다 번개 / 번개 전이 / 퍼펙트 패링 낙뢰
//  · 서리: 둔화 / 체간 붕괴 연장 / 처형 시 빙결
//  · 피: 흡혈 / 체력 낮을수록 공격력 / 처형 시 최대 체력 영구 증가
// 효과(번개·폭발·화상)로 들어간 피해는 fx.proc 로 표시해서 다시 효과를 부르지 않게 한다

const Synergy = {
  booms: [],       // 잠깐 뒤에 터지는 폭발 (산화·연쇄 폭발)
  exploding: false,

  reset() { this.booms.length = 0; this.exploding = false; },

  // 속성 개수 (recalcStats 때 다시 셈)
  count(p) {
    const c = { fire: 0, lightning: 0, frost: 0, blood: 0 };
    if (p && p.engr) for (const a of Engrave.all(p)) c[Engrave.def(a.inst).element]++;
    return c;
  },
  // 켜진 세트 효과 (없으면 null). k: 0/1/2 = 2/4/6개 세트
  set(p, el, k) {
    const S = DATA.elements[el].sets[k];
    return p.elem && p.elem[el] >= S.n ? S.values : null;
  },
  on(p, el, k) { return !!this.set(p, el, k); },
  tiers(p, el) {
    let n = 0;
    for (let k = 0; k < 3; k++) if (this.on(p, el, k)) n++;
    return n;
  },
  setDesc(el, k) {
    const S = DATA.elements[el].sets[k];
    return S.desc.replace(/\{(\w+)\}/g, (m, key) => (S.values[key] !== undefined ? Engrave.fmt(S.values[key]) : m));
  },

  // ---------- 능력치 ----------
  applyStats(p, s) {
    const bl = this.set(p, 'blood', 0);
    if (bl) s.lifesteal += bl.pct;
  },
  // 공격력 +% (damageMult 에서)
  atkBonus(p) {
    let a = Engrave.v(p, 'curse_berserker', 'atk');
    const b4 = this.set(p, 'blood', 1);
    if (b4) a += b4.pct * Math.max(0, 1 - p.hp / p.maxHp);
    return a;
  },
  // 체간 붕괴 연장 (프레임)
  breakBonus(p) {
    const f = this.set(p, 'frost', 1);
    return f ? Math.round(f.sec * 60) : 0;
  },

  // ---------- 화상 ----------
  burn(e, sec, dps) {
    if (e.dead || !sec) return;
    e.burnDps = e.burnTimer > 0 ? Math.max(e.burnDps || 0, dps) : dps;
    e.burnTimer = Math.max(e.burnTimer || 0, Math.round(sec * 60));
    if (!(e.burnTick > 0)) e.burnTick = 30;
  },

  // 효과 피해 (경직 없음). 죽이거나 보스 페이즈가 바뀌는 피해만 일반 판정으로
  dot(game, e, dmg, color) {
    if (e.dead || e.executed || dmg <= 0) return;
    const phase = e.isBoss && e.phase === 1 && e.hp - dmg <= e.maxHp * CONFIG.boss.phase2At;
    if (e.hp - dmg <= 0 || phase || (e.isBoss && (e.state === 'intro' || e.state === 'roar' || e.state === 'bossDeath'))) {
      Combat.applyHit(game, e, dmg, false, { dir: 1, knockX: 0, knockY: 0, hitstun: 0, launch: false, attackerX: e.x },
        { hitstop: 0, shake: 0, x: e.x, y: e.y - e.h * 0.5, styleId: 'BURN', proc: true, noWeak: true, quiet: true });
      return;
    }
    e.hp -= dmg;
    e.hpShow = 180;
    e.flash = Math.max(e.flash || 0, 2);
    Effects.popText(e.x + (Math.random() - 0.5) * 16, e.y - e.h - 6, String(Math.max(1, Math.round(dmg))), color || '#ff9a4a', 11);
    if (game.mode === 'practice') Practice.onDamage(dmg);
  },

  // ---------- 번개 ----------
  zap(game, p, e, dmg, chain) {
    if (e.dead || e.executed) return;
    Skills.thunder(game, p, e, dmg);
    const L = this.set(p, 'lightning', 1);
    if (!L || chain === false) return;
    // 연쇄 번개: 가까운 적에게 튐
    const near = game.enemies.filter((o) => o !== e && !o.dead && !o.executed && Math.abs(o.x - e.x) < L.r && Math.abs(o.y - e.y) < L.r * 0.6)
      .sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x)).slice(0, L.jumps);
    for (const o of near) {
      Effects.streak(e.x, e.y - e.h * 0.5, o.x, o.y - o.h * 0.5, '#ffe97a');
      Skills.thunder(game, p, o, dmg * L.pct / 100, true);
    }
  },

  // ---------- 폭발 ----------
  explode(game, x, y, dmg, r, color) {
    const p = game.player;
    this.exploding = true;
    const hit = Skills.blast(game, x, y, r, dmg, 0, null, color || '#ff7a3a', 'BURN_BOOM');
    this.exploding = false;
    // 연쇄 폭발: 폭발에 맞은 적도 불붙음
    const f2 = this.set(p, 'fire', 0);
    if (this.on(p, 'fire', 2) && f2) for (const e of hit) if (!e.dead) this.burn(e, f2.sec, f2.dps);
  },

  // ---------- 이벤트 ----------
  // 플레이어 공격이 적중 (효과 피해 제외)
  onHit(game, p, e, res, air) {
    const f = this.set(p, 'fire', 0);
    if (f && res !== 'kill') this.burn(e, f.sec, f.dps);
    const fr = this.set(p, 'frost', 0);
    if (fr && res !== 'kill') Engrave.slow(e, fr.sec);
    const L = this.set(p, 'lightning', 0);
    if (L && ++p.zapCount % L.every === 0) this.zap(game, p, e, L.dmg * p.damageMult());
    // 공중 곡예: 스태미나
    if (air) {
      const sta = Engrave.v(p, 'common_air_tempo', 'sta');
      if (sta) p.stamina = Math.min(p.maxStamina, p.stamina + sta);
    }
  },

  onKill(game, e) {
    const p = game.player, f = this.set(p, 'fire', 1);
    // 산화: 불탄 적이 죽으면 폭발 (연쇄 폭발이면 폭발로 죽은 적도)
    if (f && (e.burnTimer > 0 || (this.exploding && this.on(p, 'fire', 2)))) {
      this.booms.push({ x: e.x, y: e.y - e.h * 0.5, t: 8, dmg: f.dmg * p.damageMult(), r: f.r });
      e.burnTimer = 0;
    }
  },

  onParry(game, p, enemy) {
    // 뇌운: 주변 적에게 번개
    const L = this.set(p, 'lightning', 2);
    if (L) {
      const near = game.enemies.filter((o) => !o.dead && !o.executed && Math.abs(o.x - p.x) < L.r)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
      const dmg = this.set(p, 'lightning', 0).dmg * p.damageMult();
      for (let i = 0; i < L.bolts && near.length; i++) this.zap(game, p, near[i % near.length], dmg, false);
    }
    // 서리 반격
    const fp = Engrave.get(p, 'common_frost_parry');
    if (fp && enemy) {
      Engrave.slow(enemy, Engrave.val(fp, 'sec'));
      enemy.addPosture(Engrave.val(fp, 'post'), game);
    }
    // 피의 반격
    const h = Engrave.v(p, 'common_blood_parry', 'heal');
    if (h) { p.heal(h); Effects.popText(p.x, p.y - p.h - 26, `+${Math.round(h)}`, '#f66', 12); }
    // 천의무봉: 연속 패링 카운트
    const tn = Engrave.get(p, 'legend_tenui');
    if (tn && !p.autoExec) {
      const need = Math.round(Engrave.val(tn, 'n'));
      if (++p.tenuiCount >= need) {
        p.tenuiCount = 0;
        p.autoExec = true;
        Effects.popText(p.x, p.y - p.h - 56, '천의무봉', '#bff', 20);
        Effects.ring(p.x, p.y - p.h * 0.5, '#bff', 90);
        Sound.play('resonanceMax');
      }
    }
  },

  onPlayerHurt(game, p) {
    if (p.tenuiCount) p.tenuiCount = 0;
  },

  onExecution(game, e) {
    const p = game.player;
    // 절대영도: 주변 빙결
    const fz = this.set(p, 'frost', 2);
    if (fz) {
      Effects.ring(e.x, e.y - e.h * 0.5, '#bfefff', fz.r);
      for (const o of game.enemies) {
        if (o === e || o.dead || Math.abs(o.x - e.x) > fz.r) continue;
        Engrave.slow(o, fz.sec, CONFIG.engrave.freezeMult);
        Effects.popText(o.x, o.y - o.h - 20, '빙결', '#bfefff', 13);
      }
    }
    // 피의 축적
    const b6 = this.set(p, 'blood', 2);
    if (b6) {
      p.bonusMaxHp += b6.hp;
      p.recalcStats();
      p.heal(b6.hp);
      Effects.popText(p.x, p.y - p.h - 46, `최대 체력 +${b6.hp}`, '#ff4a6a', 14);
    }
    // 피의 서약
    const bo = Engrave.get(p, 'curse_blood_oath');
    if (bo) {
      const h = p.maxHp * Engrave.val(bo, 'heal') / 100;
      p.heal(h);
      Effects.popText(p.x, p.y - p.h - 30, `+${Math.round(h)}`, '#f44', 16);
    }
    // 화장: 처형 폭발
    const py = Engrave.get(p, 'common_pyre');
    if (py) this.explode(game, e.x, e.y - e.h * 0.5, Engrave.val(py, 'dmg') * p.damageMult(), Engrave.val(py, 'r'), '#ff9a3a');
  },

  // 삼위일체: 한 콤보에 무기 3개
  onTrinity(game) {
    const p = game.player, tr = Engrave.get(p, 'legend_trinity');
    if (!tr) return;
    p.trinityTimer = Math.round(Engrave.val(tr, 'sec') * 60);
    this.clearCooldowns(p);
    Effects.popText(p.x, p.y - p.h - 56, '삼위일체', '#ffe14a', 18);
  },
  clearCooldowns(p) {
    for (const t of WEAPON_ORDER) { p.skillCd[t].q = 0; p.skillCd[t].e = 0; }
  },

  // 천둥신: 공중에서 맞은 적 표시
  markThunder(p, e) {
    const tg = Engrave.get(p, 'legend_thunder_god');
    if (!tg || e.dead || e.hovering) return;
    if (e.state === 'launched' || !e.onGround) e.thunderMark = { dmg: Engrave.val(tg, 'dmg') * p.damageMult(), t: 360 };
  },

  // 멸산: 화면 안 모든 적 체간
  mezzan(game, p) {
    const mz = Engrave.get(p, 'legend_mezzan');
    if (!mz) return;
    const V = CONFIG.view, x0 = game.cam.x, x1 = x0 + V.width;
    Effects.screenFlash('rgba(255,140,60,', 8);
    for (const e of game.enemies) {
      if (e.dead || e.executed || e.x < x0 || e.x > x1) continue;
      e.addPosture(Engrave.val(mz, 'post'), game);
      Effects.ring(e.x, e.y - e.h * 0.5, '#ff8a3a', 40);
    }
  },

  // 천의무봉: 다음 공격이 즉시 처형
  tryAutoExec(game, p, e) {
    if (!p.autoExec || e.dead || e.executed || game.exec) return false;
    if (e.isBoss && (e.state === 'intro' || e.state === 'roar' || e.state === 'bossDeath')) return false;
    p.autoExec = false;
    if (e.state !== 'broken' && e.state !== 'groggy') e.breakPosture(game);
    game.startExecution(e);
    return true;
  },

  // ---------- 매 프레임 ----------
  update(game) {
    const p = game.player;
    for (const e of game.enemies) {
      // 화상
      if (e.burnTimer > 0 && !e.dead) {
        e.burnTimer--;
        if (--e.burnTick <= 0) {
          e.burnTick = 30;
          this.dot(game, e, e.burnDps * 0.5 * p.damageMult(), '#ff8a3a');
        }
        if (game.frame % 5 === 0) Effects.sparks(e.x + (Math.random() - 0.5) * e.w, e.y - Math.random() * e.h, 0, 1, '#ff8a3a');
      }
      // 천둥신: 착지하면 낙뢰
      const m = e.thunderMark;
      if (m) {
        if (e.dead || --m.t <= 0) e.thunderMark = null;
        else if (e.onGround && e.state !== 'launched') { e.thunderMark = null; this.zap(game, p, e, m.dmg); }
      }
    }
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      if (--b.t > 0) continue;
      this.booms.splice(i, 1);
      this.explode(game, b.x, b.y, b.dmg, b.r);
    }
    // 삼위일체: 쿨타임 없음
    if (p.trinityTimer > 0) { p.trinityTimer--; this.clearCooldowns(p); }
    // 피의 서약: 체력 감소 (1 미만으로는 안 줄어듦)
    const bo = Engrave.get(p, 'curse_blood_oath');
    if (bo && !p.dead && game.state === 'playing' && !game.transition && game.mode === 'dungeon') {
      p.hp = Math.max(Math.min(p.hp, 1), p.hp - Engrave.val(bo, 'drain') / 60);
    }
  },

  // ---------- 그리기 ----------
  // HUD: 속성 개수 + 켜진 세트 단계 (작은 막대 3칸)
  drawHud(ctx, game, x, y) {
    const p = game.player;
    if (!p.elem) return;
    let cx = x;
    ctx.save();
    for (const el in DATA.elements) {
      const n = p.elem[el];
      if (!n) continue;
      const E = DATA.elements[el], tiers = this.tiers(p, el);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(cx, y, 56, 22);
      Engrave.elemIcon(ctx, el, cx + 11, y + 11, 7);
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = tiers ? E.color : 'rgba(255,255,255,0.6)';
      ctx.fillText(n, cx + 22, y + 15);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k < tiers ? E.color : 'rgba(255,255,255,0.16)';
        ctx.fillRect(cx + 36 + k * 6, y + 6, 4, 10);
      }
      cx += 60;
    }
    // 상태: 천의무봉 / 삼위일체 / 피의 서약
    const st = [];
    const tn = Engrave.get(p, 'legend_tenui');
    if (p.autoExec) st.push(['천의무봉: 다음 공격 처형', '#bff']);
    else if (tn) st.push([`천의무봉 ${p.tenuiCount}/${Math.round(Engrave.val(tn, 'n'))}`, 'rgba(190,255,255,0.75)']);
    if (p.trinityTimer > 0) st.push([`삼위일체 ${(p.trinityTimer / 60).toFixed(1)}초`, '#ffe14a']);
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    st.forEach(([t, c], i) => { ctx.fillStyle = c; ctx.fillText(t, x + 2, y + 36 + i * 13); });
    ctx.restore();
  },

  // Tab / 장착 화면: 속성별 세트 효과 목록
  drawPanel(ctx, p, x, y, w) {
    const cw = w / 4;
    let i = 0;
    for (const el in DATA.elements) {
      const E = DATA.elements[el], n = (p.elem && p.elem[el]) || 0, cx = x + i * cw;
      Engrave.elemIcon(ctx, el, cx + 9, y + 2, 8);
      Menu.text(ctx, `${E.name} ${n}`, cx + 22, y + 7, 'bold 13px "Segoe UI", sans-serif', E.color, 'left');
      E.sets.forEach((S, k) => {
        const on = n >= S.n;
        Menu.text(ctx, `${S.n}  ${S.name}`, cx + 4, y + 24 + k * 25, `${on ? 'bold ' : ''}11px "Segoe UI", sans-serif`, on ? E.color : 'rgba(255,255,255,0.38)', 'left');
        Menu.text(ctx, S.short, cx + 16, y + 35 + k * 25, '10px "Segoe UI", sans-serif', on ? 'rgba(240,245,255,0.9)' : 'rgba(255,255,255,0.3)', 'left');
      });
      i++;
    }
  },
};

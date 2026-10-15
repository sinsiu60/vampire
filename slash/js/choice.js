'use strict';
// 선택 창 (게임 정지): 휴식·상점·대장간·제단 메뉴, 보상 카드 등에서 같이 쓴다
// Choice.open(game, { title, sub, options: [{ label, desc, cost, disabled, note, color, icon, act }], closable, onClose })
//   act(game) 가 true 를 돌려주면 창을 유지 (예: 상점에서 계속 사기)
// 조작: ←/→ (A/D) 또는 ↑/↓ 이동, 스페이스/Enter/클릭 선택, Esc 닫기 (closable 일 때)

const Choice = {
  cfg: null,
  sel: 0,
  t: 0,
  rects: [],
  msg: null,

  open(game, cfg) {
    this.cfg = cfg;
    this.sel = Math.max(0, cfg.options.findIndex((o) => !o.disabled));
    this.t = 0;
    this.rects = [];
    this.msg = null;
    this.prevState = game.state;
    game.setState('choice');
    Input.mouseMoved = false;
    Sound.play('invOpen');
  },

  close(game) {
    const cb = this.cfg && this.cfg.onClose;
    this.cfg = null;
    game.setState('playing');
    Sound.play('invClose');
    if (cb) cb(game);
  },

  say(text, color) { this.msg = { text, color: color || '#f99', life: 120 }; },

  update(game) {
    const c = this.cfg;
    if (!c) { game.setState('playing'); return; }
    this.t++;
    if (this.msg && --this.msg.life <= 0) this.msg = null;
    if (c.closable !== false && (Input.isPressed('back') || Input.isPressed('pause'))) { this.close(game); return; }
    const n = c.options.length;
    let i = this.sel;
    if (Input.isPressed('menuLeft') || Input.isPressed('menuUp')) { i = (i - 1 + n) % n; Sound.play('menuMove'); }
    if (Input.isPressed('menuRight') || Input.isPressed('menuDown')) { i = (i + 1) % n; Sound.play('menuMove'); }
    const click = Input.pressed.Mouse0 !== undefined;
    if (Input.mouseMoved || click) {
      Input.mouseMoved = false;
      const h = Menu.hit(this.rects);
      if (h >= 0 && h !== i) { i = h; Sound.play('menuMove'); }
    }
    this.sel = i;
    if (this.t > 6 && (Input.isPressed('confirm') || (click && Menu.hit(this.rects) === i))) {
      const o = c.options[i];
      if (o.disabled) { this.say(o.note || '지금은 고를 수 없습니다'); Sound.play('deny'); return; }
      if (o.cost && game.gold < o.cost) { this.say(`골드가 부족합니다 (${o.cost} 필요)`); Sound.play('deny'); return; }
      if (o.cost) game.gold -= o.cost;
      Sound.play('menuSelect');
      const keep = o.act ? o.act(game) : false;
      if (!keep && this.cfg === c) this.close(game);
    }
  },

  draw(ctx, game) {
    const c = this.cfg;
    if (!c) return;
    const V = CONFIG.view, n = c.options.length;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, V.width, V.height);
    Menu.text(ctx, c.title, V.width / 2, 92, 'bold 28px "Segoe UI", sans-serif', '#fff', 'center', c.color || '#3ff');
    if (c.sub) Menu.text(ctx, c.sub, V.width / 2, 120, '13px "Segoe UI", sans-serif', 'rgba(255,255,255,0.65)');
    // 골드
    Run.drawGold(ctx, V.width - 30, 30, game.gold, 'right');
    // 카드
    const w = Math.min(220, (V.width - 120) / n - 16), h = 230, gap = 18;
    const x0 = V.width / 2 - (n * w + (n - 1) * gap) / 2, y = 156;
    this.rects = [];
    c.options.forEach((o, k) => {
      const x = x0 + k * (w + gap), on = k === this.sel;
      const col = o.color || '#9fd8ff';
      this.rects.push({ x, y, w, h });
      ctx.save();
      ctx.translate(0, on ? -6 : 0);
      ctx.fillStyle = on ? 'rgba(26,26,34,0.97)' : 'rgba(16,16,22,0.94)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = o.disabled ? 'rgba(255,255,255,0.15)' : col;
      ctx.lineWidth = on ? 2.5 : 1.2;
      if (on && !o.disabled) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = o.disabled ? 0.45 : 1;
      if (o.icon) Run.icon(ctx, o.icon, x + w / 2, y + 52, 26, col);
      Menu.text(ctx, o.label, x + w / 2, y + 108, 'bold 17px "Segoe UI", sans-serif', '#fff');
      // 설명 (줄바꿈)
      ctx.font = '12px "Segoe UI", sans-serif';
      const lines = this.wrap(ctx, o.desc || '', w - 24);
      lines.forEach((l, li) => Menu.text(ctx, l, x + w / 2, y + 134 + li * 17, '12px "Segoe UI", sans-serif', 'rgba(230,240,250,0.85)'));
      if (o.cost) {
        const can = game.gold >= o.cost;
        Run.drawGold(ctx, x + w / 2, y + h - 22, o.cost, 'center', can ? '#ffd860' : '#a55');
      }
      if (o.disabled && o.note) Menu.text(ctx, o.note, x + w / 2, y + h - 20, '11px "Segoe UI", sans-serif', '#aaa');
      ctx.restore();
    });
    if (this.msg) {
      ctx.globalAlpha = Math.min(1, this.msg.life / 30);
      Menu.text(ctx, this.msg.text, V.width / 2, y + h + 34, 'bold 14px "Segoe UI", sans-serif', this.msg.color);
      ctx.globalAlpha = 1;
    }
    const k = (a) => Input.label(a);
    Menu.text(ctx, `${k('menuLeft')}/${k('menuRight')} 고르기   ${k('confirm')}·클릭 선택${c.closable !== false ? `   ${k('back')} 닫기` : ''}`,
      V.width / 2, V.height - 26, '12px "Segoe UI", sans-serif', 'rgba(255,255,255,0.5)');
    ctx.restore();
  },

  // 글자를 폭에 맞게 줄바꿈 (한글은 글자 단위)
  wrap(ctx, text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const ch of para) {
        if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch.trim() ? ch : ''; }
        else line += ch;
      }
      out.push(line);
    }
    return out;
  },
};

'use strict';
// 콤보 연습장: 허수아비만 서 있는 아레나
//  · 허수아비는 움직이지 않고, 안 맞으면 체력·체간이 금방 회복, 쓰러지면 다시 섬
//  · P: 허수아비 공격 켜기/끄기 (노랑 베기 → 패링 연습) / O: 되살리기 + 기록 초기화
//  · 위쪽에 이번 콤보 데미지, 최고 기록, DPS 표시
// 수치는 CONFIG.practice, 허수아비는 CONFIG.enemies.dummy

const Practice = {
  off: false,         // (테스트용) 허수아비 자동 배치 끄기
  spots: [],
  attack: false,
  dmgLog: [],
  comboDmg: 0,
  lastComboDmg: 0,
  bestHits: 0,
  bestDmg: 0,
  hint: 0,

  reset(game) {
    this.spots = CONFIG.practice.dummies.map((x) => ({ x, e: null, timer: 1 }));
    this.attack = false;
    this.clearStats();
    this.hint = CONFIG.practice.hintFrames;
  },

  clearStats() {
    this.dmgLog = [];
    this.comboDmg = 0;
    this.lastComboDmg = 0;
    this.bestHits = 0;
    this.bestDmg = 0;
  },

  update(game) {
    if (this.off) return;
    const P = CONFIG.practice;
    if (this.hint > 0) this.hint--;
    if (Input.isPressed('dummyAttack')) {
      this.attack = !this.attack;
      for (const s of this.spots) if (s.e && !s.e.dead) this.arm(s.e);
      Effects.popText(game.player.x, game.player.y - 80, this.attack ? '허수아비 공격: 켜짐 (패링 연습)' : '허수아비 공격: 꺼짐', this.attack ? '#ffd23a' : '#ccc', 14);
      Sound.play('menuSelect');
    }
    if (Input.isPressed('dummyReset')) {
      game.enemies = game.enemies.filter((e) => !e.cfg.dummy);
      for (const s of this.spots) { s.e = null; s.timer = 1; }
      this.clearStats();
      Effects.popText(game.player.x, game.player.y - 80, '허수아비 초기화', '#fff', 14);
      Sound.play('spawn');
    }
    // 쓰러진 허수아비 다시 세우기
    for (const s of this.spots) {
      if (s.e && (s.e.remove || game.enemies.indexOf(s.e) < 0)) { s.e = null; s.timer = P.respawnFrames; }
      if (!s.e && --s.timer <= 0) this.spawn(game, s);
    }
    // 콤보 기록: 히트 수가 끊기면 이번 콤보 데미지를 기록
    const c = game.combo;
    if (c.count > this.bestHits) this.bestHits = c.count;
    if (c.count === 0 && this.comboDmg > 0) {
      this.lastComboDmg = this.comboDmg;
      this.comboDmg = 0;
    }
    const now = Game.frame;
    while (this.dmgLog.length && now - this.dmgLog[0].t > P.dpsWindow) this.dmgLog.shift();
  },

  spawn(game, s) {
    const e = game.spawnEnemy('dummy', s.x);
    e.facing = -1;
    s.e = e;
    this.arm(e);
    Effects.ring(e.x, e.y - e.h / 2, '#d8b060', 30);
    Effects.dust(e.x, e.y, 8, 0);
  },

  // 공격 모드: 인식 거리를 늘려 가까이 오면 베기
  arm(e) {
    const D = CONFIG.enemies.dummy;
    e.cfg = Object.assign({}, D, { aggroRange: this.attack ? D.attackAggro : 0 });
    if (!this.attack && (e.state === 'chase' || e.state === 'windup')) { e.setState('idle'); e.cooldown = 30; }
  },

  // 플레이어가 준 데미지 (combat.applyHit 에서)
  onDamage(dmg) {
    this.comboDmg += dmg;
    if (this.comboDmg > this.bestDmg) this.bestDmg = this.comboDmg;
    this.dmgLog.push({ t: Game.frame, d: dmg });
  },

  dps() {
    let sum = 0;
    for (const l of this.dmgLog) sum += l.d;
    return sum / (CONFIG.practice.dpsWindow / 60);
  },

  draw(ctx, game) {
    if (this.off) return;
    const V = CONFIG.view, cx = V.width / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(cx - 190, 12, 380, 44);
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.fillStyle = '#d8b060';
    ctx.fillText('콤보 연습장', cx, 28);
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const cur = this.comboDmg > 0 ? this.comboDmg : this.lastComboDmg;
    ctx.fillText(`콤보 데미지 ${Math.round(cur)}   최고 ${Math.round(this.bestDmg)} (${this.bestHits}히트)   DPS ${Math.round(this.dps())}`, cx, 46);
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillStyle = this.attack ? '#ffd23a' : 'rgba(255,255,255,0.45)';
    ctx.fillText(`${Input.label('dummyAttack')} 허수아비 공격 ${this.attack ? '켜짐' : '꺼짐'}   ${Input.label('dummyReset')} 초기화`, cx, 70);
    if (this.hint > 0) {
      ctx.globalAlpha = Math.min(1, this.hint / 60);
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`허수아비를 띄우고 저글링해 보세요 — ${Input.label('down')}+${Input.label('heavy')} 런처, ${Input.label('swap')} 무기 교체`, cx, 150);
    }
    ctx.restore();
  },
};

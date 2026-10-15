'use strict';
// 플레이어: 이동, 점프(코요테/버퍼/2단/가변 높이), 대시, 지상 콤보, 차지 강공격,
//          런처, 공중 3타, 공중 강공, 내려찍기
// 상태: free | attack | charge | slam | dash | parry | guard | guardBreak | execute | hurt | dead
// 8단계: 무기 2개 장착(R 교체 + 연계 공격), 무기별 기술표, Q/E 스킬, 장비 능력치(stats), 전설 고유 효과
//  parry     : F 를 누른 직후. windowMs(게임 시간) 동안 퍼펙트 패링 판정
//  guard     : F 를 계속 누르고 있음. 데미지 감소, 대신 체간 증가
//  guardBreak: 체간이 가득 차 경직
//  execute   : 처형 연출 중 (main.js 가 진행)

// (DEG, ease, nearestAngle 는 anim.js)

class Player {
  constructor(x, y) {
    const P = CONFIG.player;
    this.w = P.width;
    this.h = P.height;
    this.reset(x, y);
  }

  reset(x, y) {
    const P = CONFIG.player;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.wasOnGround = false;
    this.staminaDelay = 0;
    this.dead = false;

    this.state = 'free';
    this.stateFrame = 0;

    // 점프
    this.coyote = 0;
    this.jumpsUsed = 0;
    this.jumpCut = false;
    this.dropThrough = 0;

    // 대시
    this.airDashesLeft = P.airDashes;
    this.dashCooldown = 0;
    this.dashDir = 1;

    // 입력 버퍼 (남은 프레임)
    this.buf = { jump: 0, light: 0, heavy: 0, dash: 0, parry: 0, skill1: 0, skill2: 0, swap: 0 };
    this.heavyDown = false;       // 강공을 누를 때 아래를 같이 눌렀는가

    // 공격
    this.move = null;
    this.moveId = null;
    this.hitList = new Set();
    this.lastMoveId = null;       // 방금 끝난 기술 (콤보 이어가기용)
    this.comboGrace = 0;
    this.chargeLevel = 0;
    this.chargeFrames = 0;
    this.swingId = 0;             // 검기 리본 구분용
    this.launchFollow = false;    // 런처 후 같이 떠오르는 중
    this.slamPhase = null;        // hang | fall | land

    // 피격
    this.invuln = 0;
    this.flash = 0;
    this.landSquash = 0;
    this.critReady = 0;           // 퍼펙트 패링 후 다음 공격 크리티컬 확정 남은 시간
    this.parryFlash = 0;          // 퍼펙트 패링 연출
    this.parryChain = 0;          // 연속 퍼펙트 패링 횟수 (피격 시 리셋)
    this.chainShow = 0;           // 체인 표시 남은 시간
    this.counterTimer = 0;        // 퍼펙트 패링 후 반격 입력 가능 시간
    this.counterTarget = null;
    this.guardFlash = 0;          // 가드로 막은 연출
    this.parryStart = -1e9;       // 패링 활성 시작 시각 (게임 시간 ms)
    this.parryPress = 0;          // F 를 누른 시각 (게임 시간 ms)
    this.lastParryPress = -1e9;
    this.parryLockedUntil = -1e9; // 이 시각까지 패링 불가 (실패 후)
    this.pendingHits = [];        // 늦은 패링 보정을 위해 잠시 보류 중인 피격

    // 체간
    this.posture = 0;
    this.postureDelay = 0;

    // 애니메이션
    this.runPhase = 0;            // 달리기 주기
    this.flipTimer = 0;           // 2단 점프 공중제비
    this.initScarf();

    // ----- 장비 / 무기 / 스킬 (8단계) -----
    // 무기 3개를 모두 장착 (칸 순서 = WEAPON_ORDER: 검 → 대검 → 건틀릿). 가방의 같은 종류 무기로만 교체
    this.gear = {
      weapons: [
        Loot.make('weapon', 'sword', 0, []),
        Loot.make('weapon', 'greatsword', 0, []),
        Loot.make('weapon', 'gauntlet', 0, []),
      ],
      armor: null,
      ring: null,
    };
    this.bag = [];
    this.activeWeapon = 0;
    this.swapCooldown = 0;
    this.swapDir = 1;
    this.swapFlash = 0;
    this.swapAttackPending = false; // 스왑 어택 적중 보너스 대기
    this.swapAttackCd = 0;        // 전환기 쿨타임
    // 스킬 쿨타임: 무기마다 따로 { sword: { q, e }, greatsword: {...}, gauntlet: {...} }
    this.skillCd = {}; this.skillCdMax = {}; this.skillFlash = {}; this.skillDeny = {};
    for (const t of WEAPON_ORDER) {
      this.skillCd[t] = { q: 0, e: 0 };
      this.skillCdMax[t] = { q: 1, e: 1 };
      this.skillFlash[t] = { q: 0, e: 0 };   // 쿨 완료 반짝임
      this.skillDeny[t] = { q: 0, e: 0 };    // 쿨타임 중 눌렀을 때 흔들림
    }
    this.engr = Engrave.emptySlots();   // 각인: { sword: [3칸], greatsword: [...], gauntlet: [...] }
    this.windCrit = 0;            // 각인 '바람의 춤': 공중 대시 후 첫 공격 치명타
    this.gtHits = 0;              // 각인 '연타 흡혈' 카운트
    this.zapCount = 0;            // 번개 세트: 적중 수
    this.tenuiCount = 0;          // 전설 '천의무봉': 연속 퍼펙트 패링
    this.autoExec = false;        //   다음 공격이 즉시 처형
    this.trinityTimer = 0;        // 전설 '삼위일체': 쿨타임 없음 남은 시간
    this.bonusMaxHp = 0;          // 피 6세트: 처형으로 늘어난 최대 체력 (런 동안)
    this.elem = null;             // 속성 개수 (recalcStats)
    this.res = { level: 0, timer: 0, cdCut: 0, hit: false };   // 공명 (단계 / 남은 시간 / 다음 스킬 쿨감% / 스왑 후 적중 여부)
    this.stanceTimer = 0;         // 검 Q: 간파 자세
    this.stanceCfg = null;
    this.ironWall = 0;            // 대검 Q: 철벽 남은 시간
    this.ironCfg = null;
    this.slamCfg = null;          // 건틀릿 E: 유성 낙하 (내려찍기 상태를 같이 씀)
    this.hitIndex = 0;            // 다단히트 기술의 몇 번째 타
    this.hitCount = 0;            // 전설 '뇌신' 카운트
    this.lifeAcc = 0;             // 흡혈 소수점 누적
    this.dashHits = new Set();    // 전설 '그림자': 이번 대시에 맞힌 적
    this.styleId = null;
    this.airSwings = 0;           // 이번 점프에서 휘두른 공중 공격 수
    this.lastHitAt = -1e9;        // 마지막으로 적을 맞힌 프레임
    this.recalcStats();
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
  }

  // ---------- 장비 / 무기 ----------
  weaponItem() { return this.gear.weapons[this.activeWeapon]; }
  weaponType() { return WEAPON_ORDER[this.activeWeapon]; }
  weaponCfg() { return CONFIG.weapons[this.weaponType()]; }
  // 현재 무기의 기술 데이터 (없으면 기본 검 기술)
  moveData(id) { return this.weaponCfg().moves[id] || CONFIG.moves[id]; }

  // 장비가 바뀌면 다시 계산
  recalcStats() {
    const P = CONFIG.player;
    this.stats = Loot.computeStats(this.gear, this.activeWeapon);
    if (this.engr) {
      this.elem = Synergy.count(this);
      Engrave.applyStats(this, this.stats);
      Synergy.applyStats(this, this.stats);
    }
    this.maxHp = P.maxHp + this.stats.maxHp + (this.bonusMaxHp || 0);
    // 저주 '유리 칼날': 최대 체력 감소
    const gl = this.engr && Engrave.get(this, 'curse_glass');
    if (gl) this.maxHp = Math.max(1, Math.round(this.maxHp * (1 - Engrave.val(gl, 'hp') / 100)));
    this.maxStamina = P.maxStamina + this.stats.stamina;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.stamina > this.maxStamina) this.stamina = this.maxStamina;
  }

  // 공격력 배율: 무기 등급 × (1 + 공격력% + 공명% (+ 전설 '광란'))
  damageMult() {
    const s = this.stats;
    let atk = s.atk;
    const F = CONFIG.loot.uniques.frenzy;
    if (s.uniques.frenzy && Style.rank >= F.minRank) atk += F.atk;
    if (this.res.timer > 0) atk += CONFIG.swap.resonance.atk[this.res.level - 1];
    if (this.engr) atk += Synergy.atkBonus(this);    // 광전사 / 광혈
    return s.power * (1 + atk / 100);
  }
  critChance() { return Engrave.get(this, 'curse_glass') ? 1 : CONFIG.player.critChance + this.stats.crit / 100; }
  // 공명 최대 단계 (각인 '공명 증폭'이면 5) / 지속 시간
  resMax() { return Engrave.get(this, 'common_resonance') ? CONFIG.swap.resonance.boostedMax : CONFIG.swap.resonance.maxLevel; }
  resDuration() { return CONFIG.swap.resonance.duration + Math.round(Engrave.v(this, 'common_resonance', 'sec') * 60); }
  // 가드 가능 (저주 '광전사'면 불가 — 퍼펙트 패링만)
  canGuard() { return !Engrave.get(this, 'curse_berserker'); }
  postureMult() { return 1 + this.stats.posture / 100; }

  // 흡혈: 준 피해의 일부 회복
  onDealDamage(dmg) {
    const ls = this.stats.lifesteal;
    if (ls <= 0 || this.dead) return;
    this.lifeAcc += dmg * ls / 100;
    if (this.lifeAcc >= 1) {
      const n = Math.floor(this.lifeAcc);
      this.lifeAcc -= n;
      this.heal(n);
    }
  }
  heal(n) {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  // 아이템 줍기: 빈 갑옷/반지 칸이면 바로 장착, 아니면 가방에 (무기 칸은 항상 차 있음)
  pickup(item) {
    const g = this.gear;
    if (item.slot === 'armor' && !g.armor) { g.armor = item; this.recalcStats(); return true; }
    if (item.slot === 'ring' && !g.ring) { g.ring = item; this.recalcStats(); return true; }
    if (this.bag.length >= CONFIG.loot.bagSize) return false;
    this.bag.push(item);
    return true;
  }

  // 대검 차지 / 철벽 / 일부 기술: 맞아도 경직 없음
  hasArmor() {
    if (this.ironWall > 0) return true;
    const W = this.weaponCfg();
    if (this.state === 'charge') return !!W.charge.armor;
    if (this.state === 'attack' && this.move && this.move.armor) return this.stateFrame < this.move.startup + this.move.active + 2;
    return false;
  }

  // 지금 공격·스킬·공중 콤보 도중인가 (스왑하면 전환기가 나가는 상황)
  inCombo() {
    return this.state === 'attack' || this.state === 'slam' || this.state === 'stance' ||
      (!this.onGround && this.comboGrace > 0 && !!this.lastMoveId);
  }

  // 무기 교체 (R / 휠): 즉시 바뀌고 공명 발동. 콤보 도중이면 새 무기의 전환기 자동 발동
  trySwap() {
    if (this.buf.swap <= 0 || this.swapCooldown > 0) return false;
    this.buf.swap = 0;
    const S = CONFIG.swap, R = S.resonance;
    const midCombo = this.inCombo();
    const n = WEAPON_ORDER.length;
    this.activeWeapon = (this.activeWeapon + this.swapDir + n) % n;
    this.recalcStats();
    this.swapCooldown = S.cooldown;
    this.swapFlash = 16;
    this.chargeLevel = 0;
    this.stanceTimer = 0;

    // 공명: 공명 중 다시 스왑하면 단계 상승 (requireHit 이면 그 사이 적을 맞혔어야 함)
    const r = this.res, prev = r.timer > 0 ? r.level : 0;
    const rMax = this.resMax();
    if (r.timer > 0) { if (!R.requireHit || r.hit) r.level = Math.min(rMax, r.level + 1); }
    else r.level = 1;
    r.timer = this.resDuration();
    r.dur = r.timer;
    r.hit = false;
    r.cdCut = R.cdCut[r.level - 1];
    if (r.level > prev && r.level > 1) {
      Effects.popText(this.x, this.y - this.h - 40, `공명 ${R.numerals[r.level - 1]}`, '#7ff', 14 + r.level * 2);
      Sound.play(r.level >= R.maxLevel ? 'resonanceMax' : 'resonance');
      if (r.level === R.maxLevel) Style.onResonanceMax();
    }

    const W = this.weaponCfg();
    Effects.afterimage(Anim.snapshot(Anim.playerFigure(this)), `rgb(${W.trail.outer})`, 20);
    Effects.ring(this.x, this.y - this.h * 0.55, '#5ff', 30 + r.level * 8);
    Effects.popText(this.x, this.y - this.h - 22, W.name, `rgb(${W.trail.inner})`, 13);
    Sound.play('swap');

    if (midCombo && this.swapAttackCd <= 0) {
      // 스왑 어택: 새 무기의 전환기 (히트 수 / 공중 저글링은 그대로 이어짐)
      this.swapAttackCd = S.attackCooldown;
      this.slamPhase = null;
      this.slamCfg = null;
      const air = !this.onGround;
      const base = air && W.swapInAir ? W.swapInAir : W.swapIn;
      const m = air && !base.air ? Object.assign({}, base, { air: true }) : base;
      this.startAttack('SWAPIN_' + this.weaponType().toUpperCase(), 0, m);
      this.swapAttackPending = true;
    } else if (!midCombo) {
      if (this.state === 'charge' || this.state === 'guard') { this.move = null; this.setState('free'); }
      this.lastMoveId = null;
      this.comboGrace = 0;
    }
    // (전환기 쿨타임 중 콤보 도중 스왑: 지금 동작은 그대로 이어지고 다음 공격부터 새 무기)
    return true;
  }

  // 스킬 (Q / E): 현재 무기의 스킬, 쿨타임은 무기마다 따로
  trySkill(ax) {
    for (const [key, slot] of [['skill1', 'q'], ['skill2', 'e']]) {
      if (this.buf[key] <= 0) continue;
      const t = this.weaponType(), S = this.weaponCfg().skills[slot];
      if (this.skillCd[t][slot] > 0) {
        this.buf[key] = 0;
        this.skillDeny[t][slot] = 14;
        Sound.play('deny');
        continue;
      }
      this.buf[key] = 0;
      // 쿨타임: 아이템 쿨감 × 공명 쿨감 (공명 쿨감은 한 번 쓰면 소모)
      let cd = S.cooldown * (1 - this.stats.cdr / 100);
      if (t === 'gauntlet' && slot === 'q') cd *= 1 - Engrave.v(this, 'gt_ascension', 'cdr') / 100;
      const r = this.res;
      if (r.timer > 0 && r.cdCut > 0) {
        cd *= 1 - r.cdCut / 100;
        Effects.popText(this.x, this.y - this.h - 40, `쿨타임 -${r.cdCut}%`, '#7ff', 11);
        r.cdCut = 0;
      }
      cd = Math.round(cd);
      this.skillCd[t][slot] = cd;
      this.skillCdMax[t][slot] = cd;
      const id = 'SKILL_' + t.toUpperCase() + '_' + slot.toUpperCase();
      if (S.kind === 'stance') this.startStance(S);
      else if (S.kind === 'meteor') this.startMeteor(S, ax, id);
      else {
        const m = Object.assign({}, S.move, { iai: S.iai, ironWall: S.ironWall });
        if (!this.onGround) m.air = true;
        this.startAttack(id, ax, m);
      }
      Effects.ring(this.x, this.y - this.h * 0.5, this.weaponCfg().trail.glow, 30);
      Effects.popText(this.x, this.y - this.h - 22, S.name, '#fff', 15);
      Sound.play('skill');
      return true;
    }
    return false;
  }

  // 검 Q: 간파 자세 — 이 동안 들어오는 공격은 자동 퍼펙트 패링
  startStance(S) {
    this.move = null;
    this.launchFollow = false;
    this.vx *= 0.3;
    if (this.vy > 0) this.vy *= 0.3;
    this.stanceCfg = S;
    this.stanceTimer = S.duration;
    this.setState('stance');
    Sound.play('stance');
  }

  // 자세 중 공격을 받아낼 수 있는가 (빨강 근접 공격도, 단 범위 폭발 같은 건 제외)
  stanceParries(attack, enemy) {
    if (this.state !== 'stance') return false;
    return !!(attack.parryable || attack.telegraph === 'white' || (enemy && this.stanceCfg && this.stanceCfg.parryRed));
  }

  updateStance(game, input, ax) {
    this.vx *= 0.75;
    if (!this.onGround) this.vy = Math.min(this.vy, 2);
    this.parryStart = game.simTime;          // 패링 디버그 표시용
    if (ax !== 0) this.facing = ax;
    if (--this.stanceTimer <= 0) { this.setState('free'); return; }
    if (this.tryDash(ax)) { this.stanceTimer = 0; return; }
    if (this.trySkill(ax)) return;
    if ((this.buf.light > 0 || this.buf.heavy > 0) && this.tryAttack(ax, input)) { this.stanceTimer = 0; return; }
    if (this.buf.jump > 0 && this.tryJump(input)) { this.stanceTimer = 0; this.setState('free'); }
  }

  // 건틀릿 E: 유성 낙하 — (지상이면 뛰어올라) 비스듬히 급강하하며 연타 → 착지 폭발
  startMeteor(S, ax, id) {
    if (ax !== 0) this.facing = ax;
    this.move = S.move;
    this.moveId = id;
    this.styleId = id;
    this.lastMoveId = null;
    this.hitList.clear();
    this.hitIndex = 0;
    this.swingId++;
    this.launchFollow = false;
    this.swapAttackPending = false;
    this.slamCfg = S;
    this.slamPhase = 'hang';
    this.vx *= 0.2;
    if (this.onGround) { this.vy = S.hopVy; this.onGround = false; this.coyote = 0; }
    else this.vy = -2;
    this.setState('slam');
  }

  // 검기 색 (무기별)
  trailPal() { return this.weaponCfg().trail; }

  // ---------- 목도리 (뒤로 휘날리는 사슬 물리) ----------
  initScarf() {
    const n = CONFIG.player.scarfSegments;
    this.scarf = [];
    for (let i = 0; i <= n; i++) {
      const x = this.x - this.facing * i * 4, y = this.y - 40;
      this.scarf.push({ x, y, px: x, py: y });
    }
  }

  updateScarf() {
    const P = CONFIG.player;
    const fig = Anim.playerFigure(this);
    const n = fig.j.neck;
    const s = this.scarf;
    s[0].x = n.x - this.facing * 1.5;
    s[0].y = n.y + 1.5;
    const t = (Game.frame || 0) * 0.25;
    for (let i = 1; i < s.length; i++) {
      const q = s[i];
      const vx = (q.x - q.px) * 0.86, vy = (q.y - q.py) * 0.86;
      q.px = q.x; q.py = q.y;
      // 항상 뒤로 살짝 날리고 + 펄럭임
      q.x += vx - this.facing * P.scarfWind;
      q.y += vy + 0.18 + Math.sin(t + i * 0.9) * 0.22 * (i / s.length);
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1], b = s[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const r = P.scarfSegLen / d;
        b.x = a.x + dx * r;
        b.y = a.y + dy * r;
      }
    }
  }

  addAfterimage() {
    Effects.afterimage(Anim.snapshot(Anim.playerFigure(this)));
  }

  // ---------- 입력 수집 (히트스톱 중에도 매 스텝 호출) ----------
  readInput(input, game) {
    const P = CONFIG.player;
    if (input.isPressed('jump')) this.buf.jump = P.jumpBufferFrames;
    if (input.isPressed('light')) this.buf.light = P.attackBufferFrames;
    if (input.isPressed('heavy')) {
      this.buf.heavy = P.attackBufferFrames;
      this.heavyDown = input.isDown('down');
    }
    if (input.isPressed('dash')) this.buf.dash = 6;
    if (input.isPressed('skill1')) this.buf.skill1 = P.attackBufferFrames;
    if (input.isPressed('skill2')) this.buf.skill2 = P.attackBufferFrames;
    if (input.isPressed('swap') || input.isPressed('swapNext')) { this.buf.swap = 8; this.swapDir = 1; }
    if (input.isPressed('swapPrev')) { this.buf.swap = 8; this.swapDir = -1; }
    if (input.isPressed('parry')) {
      // 누른 정확한 시각(게임 시간)을 기록
      const tp = game ? game.realToSim(input.pressTime('parry')) : 0;
      this.lastParryPress = tp;
      // 늦은 입력 보정: 방금 맞은(보류 중인) 공격이 있으면 바로 퍼펙트 패링으로 처리
      if (game && !this.dead && this.parryLockedUntil <= tp && Combat.tryLateParry(game, this, tp)) return;
      if (game && this.parryLockedUntil > tp) {
        if (CONFIG.debug.parry) game.logParry(0, false, '재입력 금지 중');
        return;
      }
      this.parryPress = tp;
      this.buf.parry = 4;
      // 늦게 누른 실패 (디버그 표시)
      if (game && tp - game.lastParryHitSim <= CONFIG.parry.debugReportMs) {
        game.logParry(tp - game.lastParryHitSim, false);
        game.lastParryHitSim = -1e9;
      }
    }
  }

  // 패링 불가(실패 후) 상태인가
  parryLocked() {
    return this.parryLockedUntil > Game.simTime;
  }

  isActiveFrame() {
    if (!this.move) return false;
    if (this.state === 'slam') return this.slamPhase === 'fall';
    if (this.state !== 'attack') return false;
    const f = this.stateFrame, m = this.move;
    return f >= m.startup && f < m.startup + m.active;
  }

  // 퍼펙트 패링 판정 창 안인가 (F 를 누른 시각부터 windowMs, 게임 시간 기준)
  isParrying() {
    if (this.state === 'stance') return true;    // 검 Q: 간파 자세
    return this.state === 'parry' && Game.simTime - this.parryStart <= CONFIG.parry.windowMs;
  }

  isGuarding() {
    return this.state === 'guard';
  }

  // 체간 증가. 가득 차면 경직 (가드 브레이크)
  addPosture(n) {
    const PP = CONFIG.posture.player;
    this.posture = Math.min(PP.max, this.posture + n);
    this.postureDelay = PP.regenDelay;
    if (this.posture >= PP.max && this.state !== 'guardBreak' && !this.dead) {
      this.move = null;
      this.vx = -this.facing * PP.breakKnock;
      this.setState('guardBreak');
      Effects.popText(this.x, this.y - this.h - 24, '자세 붕괴', '#ff8a5a', 18);
      Effects.sparks(this.x, this.y - this.h * 0.6, -this.facing, 16, '#ffb070');
      Effects.addShake(7);
      Sound.play('guardBreak');
    }
  }

  isInvulnerable() {
    if (this.invuln > 0) return true;
    if (this.state === 'dash' && this.stateFrame < CONFIG.player.dashIFrames) return true;
    return false;
  }

  setState(s) {
    this.state = s;
    this.stateFrame = 0;
  }

  useStamina(n) {
    if (this.stamina < n) return false;
    this.stamina -= n;
    this.staminaDelay = CONFIG.player.staminaRegenDelay;
    return true;
  }

  // ---------- 칼 자세 (렌더러와 검기가 같이 사용) ----------
  // fr: 공격 시작 후 경과 프레임 (소수 가능). 반환: 각도(도), 검기 반지름, 세로 납작함, 어깨 높이
  bladePose(fr) {
    const P = CONFIG.player;
    const B = this.weaponCfg().blade;
    const REST = B.rest !== undefined ? B.rest : P.bladeRestAngle;
    const pose = { ang: REST, r: P.bladeLength, squash: 1, py: -32 };
    if (fr === undefined) fr = this.stateFrame;

    if (this.state === 'attack' && this.move) {
      const m = this.move, sw = m.swing;
      pose.r = sw.r;
      pose.squash = sw.squash || 1;
      if (sw.py !== undefined) pose.py = sw.py;
      if (sw.thrust) {
        pose.ang = 0;
        return pose;
      }
      const dir = Math.sign(sw.to - sw.from) || 1;
      const wind = sw.from - dir * 22;           // 예비동작: 반대쪽으로 더 젖힘
      const endA = sw.to;
      if (fr < m.startup) {
        const start = nearestAngle(REST, wind);
        pose.ang = start + (wind - start) * ease.outCubic(fr / m.startup);
      } else if (fr < m.startup + m.active) {
        const t = (fr - m.startup) / m.active;
        pose.ang = sw.from + (endA - sw.from) * ease.outQuad(t);
      } else {
        const t = Math.min(1, (fr - m.startup - m.active) / m.recovery);
        // 복귀: 가까운 쪽으로 (대검은 위로 들어 올려 어깨에 다시 걸침 — 바닥을 긁지 않게)
        const rest = B.rest !== undefined && Math.abs(endA) <= 360 ? REST : nearestAngle(REST, endA);
        pose.ang = endA + (rest - endA) * ease.inOut(t);
      }
      return pose;
    }
    switch (this.state) {
      case 'charge': pose.ang = -165 + Math.sin(this.stateFrame * 0.6) * 3; break;
      case 'dash': pose.ang = 160; break;
      case 'hurt': pose.ang = -70; break;
      case 'parry': pose.ang = -55; break;   // 칼을 비스듬히 세워 막는 자세
      case 'stance': pose.ang = 165; pose.py = -26; break;   // 간파: 칼을 허리 뒤로 (발도 준비)
      case 'guard': pose.ang = -35; break;   // 칼을 앞으로 눕혀 받치는 자세
      case 'guardBreak': pose.ang = 110 + Math.sin(this.stateFrame * 0.5) * 10; break;
      case 'execute': pose.ang = this.execPose === 'flick' ? 40 + 50 * Math.max(0, 1 - this.stateFrame / 8) : this.execPose === 'strike' ? 20 : 160; break;
      case 'slam':
        // 머리 위로 들었다가 → 아래로 내리꽂기
        pose.ang = this.slamPhase === 'hang' && this.stateFrame < 4 ? -100 : 90;
        break;
      default:
        if (!this.onGround) pose.ang = B.airAng !== undefined ? B.airAng : this.vy < 0 ? 120 : 60;
        else if (Math.abs(this.vx) > 1) pose.ang = B.runAng !== undefined ? B.runAng : 140;   // 달릴 때 칼을 뒤로
    }
    return pose;
  }

  // 칼 어깨(피벗) / 칼끝 → 월드 좌표
  bladePoint(pose, radius, out) {
    const a = pose.ang * DEG;
    out = out || {};
    out.x = this.x + this.facing * (2 + Math.cos(a) * radius);
    out.y = this.y + pose.py + Math.sin(a) * radius * pose.squash;
    return out;
  }

  // 판정 프레임 동안 직전 프레임~현재 프레임 사이를 잘게 나눠 검기 점 추가
  emitTrail() {
    const m = this.move;
    if (this.state !== 'attack' || !m || !m.swing || m.swing.thrust) return;
    const f = this.stateFrame;
    if (f <= m.startup || f > m.startup + m.active) return;
    const P = CONFIG.player;
    const sub = P.trailSubsteps;
    const inner = P.trailInner;
    const life = m.heavy ? P.trailLifeHeavy : P.trailLife;
    const a = {}, b = {};
    for (let i = (f === m.startup + 1 ? 0 : 1); i <= sub; i++) {
      const fr = f - 1 + i / sub;
      const pose = this.bladePose(fr);
      this.bladePoint(pose, inner, a);
      this.bladePoint(pose, pose.r, b);
      Effects.trailPoint(this.swingId, a.x, a.y, b.x, b.y, life, m.heavy, this.trailPal());
    }
  }

  // ---------- 메인 갱신 ----------
  update(game, input) {
    const P = CONFIG.player, A = CONFIG.air;
    const ax = input.axisX();
    this.game = game;

    // 버퍼 / 타이머 감소
    for (const k in this.buf) if (this.buf[k] > 0) this.buf[k]--;
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;
    if (this.dashCooldown > 0) this.dashCooldown--;
    if (this.dropThrough > 0) this.dropThrough--;
    if (this.comboGrace > 0) this.comboGrace--; else if (this.state === 'free') this.lastMoveId = null;
    if (this.landSquash > 0) this.landSquash--;
    if (this.flipTimer > 0) this.flipTimer--;
    if (this.critReady > 0) this.critReady--;
    if (this.windCrit > 0) this.windCrit--;
    if (this.parryFlash > 0) this.parryFlash--;
    if (this.guardFlash > 0) this.guardFlash--;
    if (this.chainShow > 0) this.chainShow--;
    if (this.counterTimer > 0 && --this.counterTimer === 0) this.counterTarget = null;

    // 체간 회복 (가드 중엔 더 빨리)
    const PP = CONFIG.posture.player;
    if (this.postureDelay > 0) this.postureDelay--;
    else if (this.posture > 0 && this.state !== 'guardBreak') {
      this.posture = Math.max(0, this.posture - PP.regen * (this.state === 'guard' ? PP.guardRegenMult : 1));
    }

    // 스태미나 회복
    if (this.staminaDelay > 0) this.staminaDelay--;
    else if (this.state !== 'charge') this.stamina = Math.min(this.maxStamina, this.stamina + P.staminaRegen);

    // 무기 교체 / 공명 / 스킬 쿨타임 (칸에 넣어둔 무기는 sheatheMult 배속으로 회복)
    if (this.swapCooldown > 0) this.swapCooldown--;
    if (this.swapAttackCd > 0) this.swapAttackCd--;
    if (this.swapFlash > 0) this.swapFlash--;
    if (this.res.timer > 0 && --this.res.timer === 0) { this.res.level = 0; this.res.cdCut = 0; }
    if (this.ironWall > 0) this.ironWall--;
    const cur = this.weaponType();
    for (const t of WEAPON_ORDER) {
      const rate = t === cur ? 1 : CONFIG.swap.sheatheMult;
      for (const sl of ['q', 'e']) {
        if (this.skillCd[t][sl] > 0) {
          this.skillCd[t][sl] = Math.max(0, this.skillCd[t][sl] - rate);
          if (this.skillCd[t][sl] === 0) { this.skillFlash[t][sl] = 30; Sound.play('ready'); }
        }
        if (this.skillFlash[t][sl] > 0) this.skillFlash[t][sl]--;
        if (this.skillDeny[t][sl] > 0) this.skillDeny[t][sl]--;
      }
    }

    // 코요테 타임
    if (this.onGround) {
      this.coyote = P.coyoteFrames;
      this.jumpsUsed = 0;
      this.airDashesLeft = P.airDashes + (Engrave.get(this, 'gt_wind_dance') ? 1 : 0);
    } else if (this.coyote > 0) {
      this.coyote--;
      if (this.coyote === 0 && this.jumpsUsed === 0) this.jumpsUsed = 1; // 걸어서 떨어지면 공중 점프 1회만
    }

    // 무기 교체는 대부분의 상태에서 바로 (공격·스킬 도중이면 전환기)
    const st = this.state;
    if (st === 'free' || st === 'attack' || st === 'charge' || st === 'slam' || st === 'guard' || st === 'stance' || st === 'dash') this.trySwap();

    this.stateFrame++;
    switch (this.state) {
      case 'free': this.updateFree(game, input, ax); break;
      case 'stance': this.updateStance(game, input, ax); break;
      case 'attack': this.updateAttack(game, input, ax); break;
      case 'charge': this.updateCharge(game, input, ax); break;
      case 'slam': this.updateSlam(game, input, ax); break;
      case 'dash': this.updateDash(game, input, ax); break;
      case 'parry': this.updateParry(game, input, ax); break;
      case 'guard': this.updateGuard(game, input, ax); break;
      case 'guardBreak': this.updateGuardBreak(game); break;
      case 'execute': this.vx *= 0.8; break;
      case 'hurt': this.updateHurt(game); break;
      case 'dead': this.updateDead(game); break;
    }

    this.updatePendingHits(game);

    // 중력 (대시/내려찍기 중엔 직접 제어)
    const noGravity = this.state === 'dash' || this.state === 'execute' || (this.state === 'slam' && this.slamPhase !== 'land');
    if (!noGravity) {
      let g = CONFIG.physics.gravity;
      // 공중 공격 중엔 살짝 체공
      if (this.state === 'attack' && this.move && this.move.air && this.canFloat() &&
          this.stateFrame < this.move.startup + this.move.active + 4) {
        const W = this.weaponCfg();
        g *= W.airGravityMult !== undefined && !this.move.skill ? W.airGravityMult : A.attackGravityMult;
      }
      this.vy = Math.min(this.vy + g, CONFIG.physics.maxFall);
      // 가변 점프: 키를 떼면 상승 속도 감소
      if (this.vy < 0 && !input.isDown('jump') && this.jumpCut) {
        this.vy *= P.jumpCutMult;
        this.jumpCut = false;
      }
    }

    this.wasOnGround = this.onGround;
    Dungeon.moveAndCollide(this);
    // 마지막으로 안전하게 서 있던 곳 (낭떠러지에 떨어지면 여기로 복귀)
    const gr = this.groundRect;
    if (this.onGround && gr && this.x - gr.x > 22 && gr.x + gr.w - this.x > 22 && this.x > 0 && this.x < game.level.width) {
      this.lastSafe = { x: this.x, y: this.y };
    }

    // 착지
    if (this.onGround) this.airSwings = 0;
    if (this.onGround && !this.wasOnGround) {
      this.landSquash = 8;
      this.jumpCut = false;
      this.launchFollow = false;
      if (this.state !== 'slam') {
        Effects.dust(this.x, this.y, 6, 0);
        Sound.play('land');
      }
      // 공중 기술 도중 착지하면 기술 종료
      if (this.state === 'attack' && this.move && this.move.air && !this.move.skill) {
        this.move = null;
        this.setState('free');
      }
    }

    if (this.onGround) this.runPhase += Math.abs(this.vx) * 0.075;
    if (this.onGround || this.state !== 'free') this.flipTimer = 0;
    this.emitTrail();
    this.updateScarf();
  }

  // ---------- 공통 동작 ----------
  tryJump(input) {
    if (this.buf.jump <= 0) return false;
    const P = CONFIG.player;
    // 아래 + 점프: 통과 발판 내려가기
    if (this.onGround && input.isDown('down') && this.groundRect && this.groundRect.oneWay) {
      this.buf.jump = 0;
      this.dropThrough = P.dropThroughFrames;
      this.onGround = false;
      this.coyote = 0;
      this.jumpsUsed = 1;
      return true;
    }
    if (this.onGround || this.coyote > 0) {
      this.vy = P.jumpVel;
      this.jumpsUsed = 1;
    } else if (this.jumpsUsed < 2) {
      this.vy = P.doubleJumpVel;
      this.jumpsUsed = 2;
      this.flipTimer = P.flipFrames;
      Effects.dust(this.x, this.y, 5, 0);
    } else {
      return false;
    }
    this.buf.jump = 0;
    this.coyote = 0;
    this.onGround = false;
    this.jumpCut = true;
    this.landSquash = 0;
    if (this.jumpsUsed === 1) Effects.dust(this.x, this.y, 4, 0);
    this.airSwings = 0;
    Sound.play('jump');
    return true;
  }

  tryDash(ax) {
    if (this.buf.dash <= 0 || this.dashCooldown > 0) return false;
    if (!this.onGround && this.airDashesLeft <= 0) return false;
    if (!this.useStamina(CONFIG.player.dashStamina)) { this.buf.dash = 0; return false; }
    this.buf.dash = 0;
    if (!this.onGround) {
      this.airDashesLeft--;
      // 각인 '바람의 춤': 공중 대시 후 첫 공격 치명타
      const wd = Engrave.get(this, 'gt_wind_dance');
      if (wd) this.windCrit = Math.round(Engrave.val(wd, 'sec') * 60) + 11;
    }
    this.dashDir = ax !== 0 ? ax : this.facing;
    this.facing = this.dashDir;
    this.vy = 0;
    this.move = null;
    this.launchFollow = false;
    this.dashHits.clear();
    this.setState('dash');
    Effects.dust(this.x, this.y, 8, this.dashDir);
    Sound.play('dash');
    return true;
  }

  // 공격 입력 처리. 콤보 연결 규칙은 여기 한 곳에서.
  tryAttack(ax, input) {
    const downHeld = this.heavyDown || input.isDown('down');
    const game = this.game;

    // 처형: 체간이 무너진 적이 가까이 있으면 좌클릭으로 처형
    if (this.buf.light > 0 && game) {
      const t = game.findExecutable(this);
      if (t) {
        this.buf.light = 0;
        game.startExecution(t);
        return true;
      }
    }
    // 패링 반격: 퍼펙트 패링 직후 좌클릭 = 순간이동 베기 / 우클릭 = 카운터 런처
    const ct = this.counterTarget;
    if (this.counterTimer > 0 && ct && !ct.dead && ct.state !== 'broken') {
      if (this.buf.light > 0) {
        this.buf.light = 0;
        this.startCounter(ct);
        return true;
      }
      if (this.buf.heavy > 0) {
        this.buf.heavy = 0;
        this.counterTimer = 0;
        this.counterTarget = null;
        this.facing = Math.sign(ct.x - this.x) || this.facing;
        this.startAttack('COUNTER_LAUNCH', 0, CONFIG.moves.COUNTER_LAUNCH);
        Effects.popText(this.x, this.y - this.h - 20, 'COUNTER', '#7ff', 16);
        return true;
      }
    }
    // ----- 공중 -----
    if (!this.onGround) {
      if (this.buf.heavy > 0) {
        this.buf.heavy = 0;
        if (downHeld) this.startSlam(ax);
        else this.startAttack('AIR_HEAVY', ax);
        return true;
      }
      if (this.buf.light > 0) {
        this.buf.light = 0;
        const prev = this.lastMoveId && this.moveData(this.lastMoveId);
        const next = prev && prev.air && prev.next ? prev.next : 'A1';
        this.startAttack(next, ax);
        return true;
      }
      return false;
    }

    // ----- 지상 -----
    if (this.buf.heavy > 0 && downHeld) {
      this.buf.heavy = 0;
      this.startAttack('LAUNCHER', ax);
      return true;
    }
    // 약공 2타 후 강공 → 전진 찌르기
    if (this.buf.heavy > 0 && this.lastMoveId === 'L2') {
      this.buf.heavy = 0;
      this.startAttack('THRUST', ax);
      return true;
    }
    if (this.buf.light > 0) {
      this.buf.light = 0;
      const prev = this.lastMoveId && this.moveData(this.lastMoveId);
      const next = prev && !prev.air && prev.next ? prev.next : 'L1';
      this.startAttack(next, ax);
      return true;
    }
    if (this.buf.heavy > 0) {
      this.buf.heavy = 0;
      this.move = null;
      this.chargeLevel = 0;
      this.chargeFrames = 0;
      if (ax !== 0) this.facing = ax;
      this.setState('charge');
      return true;
    }
    return false;
  }

  startAttack(id, ax, moveData) {
    let move = moveData || this.moveData(id);
    // 공격 속도: 선딜·후딜이 짧아짐 (스킬 제외)
    // 공격 속도 (각인 '무중력': 공중에서 더 빠르게)
    const sp = 1 + (this.stats.aspd + (this.onGround ? 0 : Engrave.v(this, 'gt_zero_g', 'aspd'))) / 100;
    if (sp > 1.001 && !move.skill) {
      move = Object.assign({}, move);
      move.startup = Math.max(1, Math.round(move.startup / sp));
      move.recovery = Math.max(2, Math.round(move.recovery / sp));
      if (move.chainDelay !== undefined) move.chainDelay = Math.round(move.chainDelay / sp);
    }
    if (ax !== 0) this.facing = ax;    // 공격 시작 시 방향 전환 허용
    this.move = move;
    this.moveId = id;
    // 스타일 랭크용 이름: 무기가 다르면 다른 기술로 취급 (다양성)
    const pre = { greatsword: 'GS_', gauntlet: 'GT_' }[this.weaponType()];
    this.styleId = pre && !move.skill && !/^(SWAP|COUNTER)/.test(id) ? pre + id : id;
    this.hitIndex = 0;
    this.swapAttackPending = false;
    this.lastMoveId = null;
    this.hitList.clear();
    this.swingId++;
    this.launchFollow = false;
    this.setState('attack');
    this.vx *= 0.3;
    if (move.air && !this.onGround) this.airSwings++;
    if (move.air && this.vy > 0 && this.canFloat()) this.vy *= 0.3;   // 공중 공격 시작 시 낙하 멈칫
  }

  // 반격 일섬: 적의 반대편으로 순간이동하며 벤다
  startCounter(enemy) {
    const m = CONFIG.moves.COUNTER;
    const dir = Math.sign(enemy.x - this.x) || this.facing;
    const lvl = this.game.level;
    const fromX = this.x;
    let tx = enemy.x + dir * m.teleport;
    if (tx < 20 || tx > lvl.width - 20) tx = enemy.x - dir * m.teleport;   // 벽이면 이쪽에서
    // 지나가는 길에 청록 분신
    for (let i = 1; i <= 5; i++) {
      this.x = fromX + (tx - fromX) * (i / 6);
      this.addAfterimage();
    }
    this.x = tx;
    Effects.streak(fromX, this.y - this.h * 0.55, tx, this.y - this.h * 0.55, '#7ff');
    this.counterTimer = 0;
    this.counterTarget = null;
    this.facing = Math.sign(enemy.x - this.x) || -dir;
    this.startAttack('COUNTER', 0, CONFIG.moves.COUNTER);
    Effects.popText(this.x, this.y - this.h - 20, 'COUNTER', '#7ff', 16);
    Sound.play('teleport');
  }

  startSlam(ax) {
    if (ax !== 0) this.facing = ax;
    this.move = this.moveData('SLAM');
    this.moveId = 'SLAM';
    const pre = { greatsword: 'GS_', gauntlet: 'GT_' }[this.weaponType()];
    this.styleId = pre ? pre + 'SLAM' : 'SLAM';
    this.lastMoveId = null;
    this.hitList.clear();
    this.swingId++;
    this.launchFollow = false;
    this.slamPhase = 'hang';
    this.vx *= 0.2;
    this.vy = -2;
    this.setState('slam');
  }

  endMove() {
    this.lastMoveId = this.moveId;
    this.comboGrace = CONFIG.player.comboGraceFrames;
    this.move = null;
    this.setState('free');
  }

  // ---------- 상태별 ----------
  updateFree(game, input, ax) {
    const P = CONFIG.player;
    if (this.tryParry()) return;
    // 패링 불가 시간에 F 를 누르고 있으면 가드
    if (this.parryLocked() && input.isDown('parry') && this.canGuard()) { this.setState('guard'); return; }
    if (this.tryDash(ax)) return;
    if (this.trySkill(ax)) return;
    if (this.tryJump(input)) { /* 점프 후에도 이동은 계속 */ }
    if (this.tryAttack(ax, input)) return;

    const run = P.runSpeed * this.weaponCfg().speedMult;
    const accel = this.onGround ? P.groundAccel : P.airAccel;
    const decel = this.onGround ? P.groundDecel : P.airDecel;
    if (ax !== 0) {
      this.facing = ax;
      this.vx += ax * accel;
      if (Math.abs(this.vx) > run) this.vx = Math.sign(this.vx) * run;
    } else {
      const s = Math.abs(this.vx) - decel;
      this.vx = s > 0 ? Math.sign(this.vx) * s : 0;
    }
  }

  updateAttack(game, input, ax) {
    const m = this.move;
    const f = this.stateFrame;
    const end = m.startup + m.active;
    // 패링은 공격 도중 언제든 끊고 나갈 수 있음 (반응이 늦어지지 않게)
    if (this.buf.parry > 0 && this.tryParry()) return;

    // 예비동작 → 판정 시작 순간에 전진
    if (f === m.startup) {
      this.vx = this.facing * m.lunge;
      if (m.swing.thrust) Effects.thrust(this, m.swing.r, this.facing, (m.multiHit ? m.multiHit.interval : m.active) + 8, this.trailPal().glow, (m.swing.py || -32) + 32);
      if (m.quake) {
        // 각인 '지진 전환': 대검 전환기 충격파 강화
        const qs = this.moveId === 'SWAPIN_GREATSWORD' && Engrave.get(this, 'gs_quake_swap');
        Skills.quake(game, this, qs ? Object.assign({}, m.quake, {
          range: m.quake.range * (1 + Engrave.val(qs, 'range') / 100), damage: m.quake.damage * (1 + Engrave.val(qs, 'pct') / 100),
        }) : m.quake);
        if (this.moveId === 'SKILL_GREATSWORD_E') Synergy.mezzan(game, this);   // 전설 '멸산'
      }
      if (m.ironWall) {
        // 각인 '불굴': 철벽 지속·반격 강화
        const un = Engrave.get(this, 'gs_unyielding');
        this.ironCfg = un ? Object.assign({}, m.ironWall, { reflectMult: m.ironWall.reflectMult * (1 + Engrave.val(un, 'pct') / 100) }) : m.ironWall;
        this.ironWall = m.ironWall.duration + (un ? Math.round(Engrave.val(un, 'sec') * 60) : 0);
        Effects.ring(this.x, this.y - this.h * 0.5, '#ffb050', 70);
      }
      if (m.iai) Skills.iai(game, this, m.iai);
      Sound.play(m.sfx);
    }
    // 선딜 동안 힘 모으기 (대지 분쇄)
    if (m.chargeFx && f < m.startup && f % 3 === 0) {
      const a = Math.random() * Math.PI * 2;
      Effects.sparks(this.x + Math.cos(a) * 34, this.y - this.h * 0.5 + Math.sin(a) * 34, -Math.sign(Math.cos(a)) || 1, 1, '#ffb050');
      if (f % 9 === 0) Sound.play('charge');
    }
    // 다단히트: interval 마다 판정 초기화
    if (m.multiHit && f > m.startup && f < end && (f - m.startup) % m.multiHit.interval === 0 && this.hitIndex < m.multiHit.count - 1) {
      this.hitIndex++;
      this.hitList.clear();
      this.swingId++;
      if (m.swing.thrust) Effects.thrust(this, m.swing.r, this.facing, m.multiHit.interval + 6, this.trailPal().glow, (Math.random() - 0.5) * 14);
      Sound.play(m.sfx);
    }
    // 마찰
    if (f > m.startup) this.vx *= this.onGround ? 0.82 : 0.92;
    else this.vx *= 0.7;

    // 런처: 강공 버튼을 누르고 있으면 판정 직후 같이 떠오름 (카운터 런처는 자동)
    if (m.launch && f === m.startup + 2 && (m.autoFollow || input.isDown('heavy'))) {
      this.vy = CONFIG.air.launcherFollowVy;
      this.onGround = false;
      this.coyote = 0;
      this.jumpsUsed = 1;
      this.jumpCut = false;
      this.launchFollow = true;
      Effects.dust(this.x, this.y, 8, 0);
    }
    // 같이 떠오른 경우 판정이 끝나면 바로 공중 행동 가능
    if (this.launchFollow && f >= end) {
      this.endMove();
      this.lastMoveId = null;
      return;
    }

    // 후딜 캔슬 (패링 / 대시 / 점프)
    if (f >= end) {
      if (this.tryParry()) return;
      if (this.tryDash(ax)) return;
      if (this.trySkill(ax)) return;
      if (this.buf.jump > 0 && (this.onGround || this.coyote > 0 || this.jumpsUsed < 2)) {
        this.endMove();
        this.tryJump(input);
        return;
      }
      // 다음 타 연결 (판정 끝 + chainDelay 이후)
      const chainAt = end + (m.chainDelay !== undefined ? m.chainDelay : CONFIG.player.chainDelay);
      if (f >= chainAt && (this.buf.light > 0 || this.buf.heavy > 0)) {
        this.lastMoveId = this.moveId;
        if (this.tryAttack(ax, input)) return;
      }
    }

    if (f >= m.startup + m.active + m.recovery) this.endMove();
  }

  // 내려찍기 (공중 S+우클릭) / 유성 낙하 (건틀릿 E, slamCfg 있음)
  updateSlam(game, input, ax) {
    const A = CONFIG.air, C = this.slamCfg;
    if (this.slamPhase === 'hang') {
      // 공중에서 잠깐 멈췄다가
      this.vx *= 0.8;
      this.vy = Math.min(0, this.vy + 0.4);
      if (this.stateFrame >= (C ? C.hangFrames : A.slamHangFrames)) {
        this.slamPhase = 'fall';
        this.stateFrame = 0;
        Sound.play(C ? 'whooshHeavy' : 'swingHeavy');
      }
    } else if (this.slamPhase === 'fall') {
      if (C) {
        // 유성 낙하: 비스듬히 급강하하며 hitInterval 마다 다시 때림
        this.vx = this.facing * C.fallVx;
        this.vy = C.fallSpeed;
        if (this.stateFrame % C.hitInterval === 0) {
          this.hitList.clear();
          this.hitIndex++;
          Effects.thrust(this, 50, this.facing, C.hitInterval + 4, this.trailPal().glow, 14 + (Math.random() - 0.5) * 16);
          Sound.play('punch');
        }
        if (this.stateFrame % 2 === 0) Effects.afterimage(Anim.snapshot(Anim.playerFigure(this)), `rgb(${this.trailPal().outer})`, 14);
      } else {
        // 수직 낙하
        this.vx = 0;
        this.vy = A.slamFallSpeed;
        if (this.stateFrame % 2 === 0) this.addAfterimage();
        const a = {}, b = {};
        const pose = this.bladePose();
        this.bladePoint(pose, CONFIG.player.trailInner, a);
        this.bladePoint(pose, 70, b);
        Effects.trailPoint(this.swingId, a.x - this.facing * 6, a.y - 30, b.x, b.y, 10, true, this.trailPal());
      }
      if (this.onGround) {
        this.slamPhase = 'land';
        this.stateFrame = 0;
        this.landSquash = 10;
        Combat.slamWave(game, this, C ? C.wave : null);
        if (C) {
          // 착지 폭발
          Effects.ring(this.x, this.y - 20, `rgb(${this.trailPal().inner})`, C.wave.radius);
          Effects.radialSparks(this.x, this.y - 10, 28, `rgb(${this.trailPal().outer})`, 2);
          Effects.screenFlash('rgba(200,150,255,', 6);
          Sound.play('boom');
          // 각인 '유성우': 작은 유성
          const ms = Engrave.get(this, 'gt_meteor_shower');
          if (ms) Skills.meteorShower(game, this, Math.round(Engrave.val(ms, 'count')), Engrave.val(ms, 'dmg') * this.damageMult());
        }
      }
    } else {
      // 착지 후딜 (일정 시간 후 대시/점프로 캔슬)
      this.vx *= 0.7;
      const R = this.move.recovery;
      if (this.stateFrame > R / 2) {
        if (this.tryDash(ax)) return;
        if (this.buf.jump > 0) { this.endMove(); this.tryJump(input); return; }
      }
      if (this.stateFrame >= R) {
        this.slamPhase = null;
        this.slamCfg = null;
        this.endMove();
      }
    }
  }

  // 차지 설정 (각인 '거인의 일격': 단계 +1, 차지 속도)
  chargeCfg() {
    const C = this.weaponCfg().charge, g = Engrave.get(this, 'gs_giant');
    if (!g) return C;
    return Object.assign({}, C, { maxLevel: C.maxLevel + 1, framesPerLevel: Math.round(C.framesPerLevel / (1 + Engrave.val(g, 'speed') / 100)) });
  }

  updateCharge(game, input, ax) {
    const C = this.chargeCfg();
    this.vx *= 0.75;
    if (this.tryParry()) return;    // 차지 중 패링 / 대시 / 무기 교체로 취소 가능 (교체는 update 에서)
    if (this.tryDash(ax)) return;
    this.chargeFrames++;
    if (this.chargeLevel < C.maxLevel && this.chargeFrames >= (this.chargeLevel + 1) * C.framesPerLevel) {
      if (this.useStamina(C.staminaPerLevel)) {
        this.chargeLevel++;
        this.flash = 4;
        Effects.sparks(this.x, this.y - this.h * 0.6, this.facing, 8, '#5ff');
        Sound.play(this.chargeLevel === C.maxLevel ? 'chargeMax' : 'charge');
      } else {
        this.chargeFrames = (this.chargeLevel + 1) * C.framesPerLevel; // 스태미나 부족: 단계 유지
      }
    }
    if (!input.isDown('heavy')) {
      const lv = this.chargeLevel;
      this.startAttack('HEAVY' + lv, 0, this.moveData('HEAVY')[lv]);
    }
  }

  updateDash(game, input, ax) {
    const P = CONFIG.player;
    this.vx = this.dashDir * P.dashSpeed;
    this.vy = 0;
    if (this.stateFrame % 2 === 0) this.addAfterimage();
    if (this.stats.uniques.phantom) Skills.phantom(game, this);
    if (this.stateFrame >= P.dashFrames) {
      this.vx *= P.dashEndSpeedMult;
      this.dashCooldown = P.dashCooldown;
      this.setState('free');
    }
  }

  tryParry() {
    if (this.buf.parry <= 0) return false;
    this.buf.parry = 0;
    if (this.parryLocked()) return false;
    this.move = null;
    this.chargeLevel = 0;
    this.launchFollow = false;
    this.vx *= 0.3;
    if (this.vy > 0) this.vy *= 0.3;
    this.setState('parry');
    // 창은 F 를 누른 순간부터 (버퍼로 몇 프레임 늦게 시작해도 누른 시각 기준)
    this.parryStart = this.parryPress;
    Sound.play('parryStance');
    return true;
  }

  // 판정 창이 끝나면: F 를 누르고 있으면 가드, 아니면 실패 → lockoutMs 동안 패링 불가
  updateParry(game, input, ax) {
    const PR = CONFIG.parry;
    this.vx *= 0.8;
    const t = game.simTime - this.parryStart;
    if (!this.onGround && t <= PR.windowMs) this.vy = Math.min(this.vy, 1.5);  // 공중에선 잠깐 멈칫
    if (t > PR.windowMs) {
      if (input.isDown('parry') && this.canGuard()) { this.setState('guard'); return; }
      this.parryLockedUntil = game.simTime + PR.lockoutMs;
      this.setState('free');
    }
  }

  // 보류 중인 피격: lateGraceMs 가 지나도 F 가 안 눌렸으면 확정
  updatePendingHits(game) {
    const PR = CONFIG.parry;
    for (let i = this.pendingHits.length - 1; i >= 0; i--) {
      const h = this.pendingHits[i];
      if (game.simTime - h.time > PR.lateGraceMs) {
        this.pendingHits.splice(i, 1);
        Combat.applyPendingHit(game, this, h);
      }
    }
  }

  // 가드: 누르고 있는 동안 유지. 방향 전환만 가능
  updateGuard(game, input, ax) {
    this.vx *= 0.75;
    if (ax !== 0) this.facing = ax;
    // 가드 중에도 대시 / 공격으로 바로 전환 가능
    if (this.tryDash(ax)) return;
    if (this.trySkill(ax)) return;
    if ((this.buf.light > 0 || this.buf.heavy > 0) && this.tryAttack(ax, input)) return;
    if (!input.isDown('parry')) this.setState('free');
  }

  updateGuardBreak(game) {
    this.vx *= this.onGround ? 0.85 : 0.95;
    if (this.stateFrame >= CONFIG.posture.player.breakFrames) {
      this.posture = 0;
      this.setState('free');
    }
  }

  // 가드로 막음: 데미지 감소, 체간 증가, 밀려남
  onGuardBlock(dmg, dir) {
    const PR = CONFIG.parry;
    const taken = dmg * PR.guardDamageMult * (1 - this.stats.reduce / 100);
    this.hp = Math.max(0, this.hp - taken);
    this.vx = dir * PR.guardPush;
    this.guardFlash = 8;
    this.addPosture(dmg * PR.guardPostureMult + PR.guardPostureFlat);
    if (this.hp <= 0) { this.dead = true; this.setState('dead'); }
    return taken;
  }

  onPerfectParry(enemy) {
    const PR = CONFIG.parry;
    this.parryLockedUntil = -1e9;
    this.pendingHits.length = 0;
    this.invuln = PR.invulnFrames;
    this.critReady = PR.critReadyFrames;
    this.parryFlash = 14;
    this.parryChain++;
    this.chainShow = PR.chain.displayFrames;
    this.counterTimer = enemy ? PR.counterWindow : 0;
    this.counterTarget = enemy;
    this.posture = Math.min(CONFIG.posture.player.max - 1, this.posture + PR.perfectSelfPosture);
    if (enemy) this.facing = Math.sign(enemy.x - this.x) || this.facing;
    if (this.state !== 'stance') this.setState('free');
    else {
      // 각인 '무념': 자세 지속 연장
      const mu = Engrave.get(this, 'sword_mushin');
      if (mu) { this.stanceTimer += Math.round(Engrave.val(mu, 'sec') * 60); Effects.popText(this.x, this.y - this.h - 40, '무념', '#8fd8ff', 13); }
    }
  }

  updateHurt(game) {
    this.vx *= this.onGround ? 0.85 : 0.95;
    if (this.stateFrame >= CONFIG.player.hurtFrames) this.setState('free');
  }

  updateDead(game) {
    this.vx *= 0.9;
  }

  // 공중 체공 가능? 올라가는 중엔 안 됨, 헛손질만 계속하면 몇 번 뒤 그냥 떨어짐
  canFloat() {
    const A = CONFIG.air;
    if (this.vy < A.floatRiseVy) return false;
    return this.airSwings <= A.freeSwings || (Game.frame || 0) - this.lastHitAt <= A.floatHitWindow;
  }

  // 공중 공격이 적중했을 때: 살짝 머무름 (적의 저글링 감쇠와 같이 줄어듦)
  airHang(mult) {
    if (this.onGround || this.launchFollow) return;
    this.vy = CONFIG.air.hitHangVy * mult * (this.weaponCfg().airHangMult || 1);
    this.jumpCut = false;
  }

  // 반환: 실제로 받은 데미지
  takeHit(dmg, dir, knock) {
    const P = CONFIG.player;
    const raw = dmg;
    dmg *= 1 - this.stats.reduce / 100;
    // 경직 없이 버팀 (대검 차지 / 철벽 등)
    if (this.hasArmor()) {
      if (this.ironWall > 0) {
        dmg *= this.ironCfg.damageMult;
        if (this.game) Skills.ironReflect(this.game, this, raw);   // 받은 데미지 일부를 주변에 반격
      } else dmg *= this.weaponCfg().armorMult || 1;
      this.hp = Math.max(0, this.hp - dmg);
      this.flash = 4;
      this.invuln = 20;
      Effects.sparks(this.x, this.y - this.h * 0.6, dir, 8, '#ffb070');
      if (this.hp <= 0) { this.dead = true; this.move = null; this.setState('dead'); }
      return dmg;
    }
    this.parryChain = 0;          // 피격 시 연속 패링 체인 리셋
    this.counterTimer = 0;
    this.counterTarget = null;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = CONFIG.feel.flashFrames;
    this.invuln = P.hurtInvuln;
    this.vx = dir * (knock ? knock.x : P.hurtKnockX);
    this.vy = knock ? knock.y : P.hurtKnockY;
    this.move = null;
    this.lastMoveId = null;
    this.jumpCut = false;
    this.launchFollow = false;
    this.slamPhase = null;
    if (this.hp <= 0) {
      this.dead = true;
      this.setState('dead');
    } else {
      this.setState('hurt');
    }
    return dmg;
  }
}

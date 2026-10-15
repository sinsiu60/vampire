'use strict';
// 보스: 공통 패턴 4개(돌진베기 / 점프 내려찍기 / 검기 3연발 / 광역 폭발) + 2페이즈 추가 패턴
//  - 모든 패턴은 예고가 있고, 일부는 노랑(패링 가능) / 빨강(회피) / 흰색 섬광(간파)
//  - 체력 50% 이하: 포효 → 2페이즈 (패턴 속도 증가 + 새 패턴)
//  - 그로기 게이지(체간)가 차면 쓰러짐: 그동안 런처로 띄우기 / 처형(큰 데미지) 가능
//  상태: intro | bossIdle | pattern | roar | groggy | deflected | launched | down | getup | bossDeath
// 수치는 config.js 의 bossPatterns / bosses / boss

const BOSS_STEP = 1000 / 60;

class Boss extends Enemy {
  constructor(id, x, y) {
    const C = CONFIG.bosses[id];
    super('boss', x, y, Object.assign({ superArmor: true, hitPostureMult: CONFIG.boss.hitPostureMult }, C));
    this.isBoss = true;
    this.bossId = id;
    this.name = C.name;
    this.phase = 1;
    this.pat = null;          // 진행 중인 패턴 { id, cfg, step, f, ... }
    this.zones = [];          // 바닥 경고 → 폭발
    this.marker = null;       // 내려찍기 착지 예고
    this.idle = 50;
    this.lastPat = null;
    this.groggyTimer = 0;
    this.animPose = null;     // 패턴이 지정하는 포즈 { a, b, t, rot }
    this.deflectFrames = CONFIG.boss.deflectStagger;
    this.hpLag = this.hp;     // HP 바 흰색 잔상
    this.landed = false;
    // 패턴 설정 = 기본값 + 보스별 덮어쓰기
    this.patterns = {};
    for (const k in C.patterns) this.patterns[k] = Object.assign({}, CONFIG.bossPatterns[k], C.patterns[k]);
    this.setState('intro');
  }

  // 2페이즈면 예고·동작이 빨라짐
  // 약점 무기: 페이즈마다 다름 (bosses.*.weakness)
  get weakTo() {
    const w = this.cfg.weakness;
    return w ? w[Math.min(this.phase, w.length) - 1] : null;
  }

  get spd() { return this.phase === 2 ? CONFIG.boss.phase2Speed : 1; }
  frames(ms) { return Math.max(2, Math.round(ms / BOSS_STEP / this.spd)); }
  framesF(f) { return Math.max(2, Math.round(f / this.spd)); }

  get telegraphing() { return this.state === 'pattern' && !!this.pat && !!this.pat.tele; }
  get teleProgress() { return this.pat && this.pat.teleLen ? clamp01(this.pat.teleF / this.pat.teleLen) : 0; }
  isNeutral() { return this.state === 'bossIdle' || this.state === 'pattern'; }

  // 현재 공격 판정 정의 (예고 색은 telegraphColor 가 이걸 보고 정함)
  setAtk(c, over) {
    this.atk = Object.assign({ id: 'boss', kind: 'melee', windup: 30, recovery: 40 },
      { parryable: c.parryable, damage: c.damage, knock: c.knock, hitbox: c.hitbox }, over || {});
  }
  // 예고 시작 (색: 'yellow' | 'red' | 'white')
  tele(color, len) {
    const P = this.pat;
    P.tele = true; P.teleF = 0; P.teleLen = len;
    this.atk.parryable = color !== 'red';
    this.atk.telegraph = color === 'white' ? 'white' : undefined;
    Sound.play(color === 'white' ? 'telegraphWhite' : color === 'yellow' ? 'telegraphYellow' : 'telegraph');
  }

  update(game) {
    const B = CONFIG.boss, p = game.player;
    if (this.hpLag > this.hp) this.hpLag = Math.max(this.hp, this.hpLag - this.maxHp * 0.004);
    if (this.groggyTimer > 0) this.groggyTimer--;
    this.updateZones(game);
    this.animPose = null;
    const dx = p.x - this.x, dir = dx >= 0 ? 1 : -1;

    switch (this.state) {
      case 'intro':
        // 하늘에서 떨어져 착지 → 잠시 노려봄
        this.vx = 0;
        this.facing = dir;
        if (this.onGround && !this.landed) {
          this.landed = true;
          Effects.addShake(12);
          Effects.dust(this.x, this.y, 18, 0);
          Effects.shockwave(this.x, this.y, 120);
          Sound.play('bossLand');
        }
        this.animPose = this.onGround ? { a: 'crouch', b: 'gIdle', t: this.stateFrame / B.introFrames } : { a: 'tuck', b: 'tuck', t: 0 };
        if (this.stateFrame >= B.introFrames) { this.setState('bossIdle'); this.idle = 30; }
        break;

      case 'bossIdle': {
        // 거리 유지하며 다음 패턴 고르기
        const C = this.cfg, dist = Math.abs(dx);
        this.facing = dir;
        let tv = 0;
        if (dist < C.spacing[0]) tv = -dir * C.walkSpeed;
        else if (dist > C.spacing[1]) tv = dir * C.walkSpeed * this.spd;
        this.vx += (tv - this.vx) * 0.15;
        if (--this.idle <= 0 && !p.dead) this.startPattern(game);
        break;
      }

      case 'pattern':
        this.updatePattern(game);
        break;

      case 'roar': {
        // 2페이즈 전환: 포효하며 밀쳐냄 (무적)
        this.vx *= 0.8;
        this.animPose = { a: 'smashWind', b: 'riseStrike', t: Math.min(1, this.stateFrame / 12), shake: true };
        if (this.stateFrame === 12) {
          Effects.shockwave(this.x, this.y, 200);
          Effects.ring(this.x, this.y - this.h * 0.6, this.cfg.aura, 160);
          Effects.addShake(14);
          Sound.play('bossRoar');
          if (Math.abs(dx) < 240) { p.vx = dir * B.roarPush; p.vy = -4; }
        }
        if (this.stateFrame >= B.roarFrames) { this.setState('bossIdle'); this.idle = 20; }
        break;
      }

      case 'groggy':
        // 그로기: 쓰러져 있음 (런처로 띄우기 / 처형 가능)
        this.vx *= 0.8;
        if (this.groggyTimer <= 0) this.recoverGroggy();
        break;

      case 'bossDeath':
        this.updateDeath(game);
        break;
    }

    super.update(game);
  }

  // ---------- 패턴 ----------
  startPattern(game) {
    const p = game.player, dist = Math.abs(p.x - this.x);
    let list = Object.keys(this.patterns).filter((k) => {
      const c = this.patterns[k];
      if (c.phase2 && this.phase < 2) return false;
      if (c.minDist !== undefined && dist < c.minDist) return false;
      if (c.maxDist !== undefined && k !== 'dashSlash' && dist > c.maxDist) return false;
      return true;
    });
    if (list.length > 1) list = list.filter((k) => k !== this.lastPat);
    if (!list.length) list = ['dashSlash'];
    let total = 0;
    for (const k of list) total += this.patterns[k].weight || 1;
    let r = Math.random() * total, id = list[0];
    for (const k of list) { r -= this.patterns[k].weight || 1; if (r <= 0) { id = k; break; } }
    this.lastPat = id;
    this.pat = { id, cfg: this.patterns[id], step: 0, f: 0, tele: false, teleF: 0, teleLen: 0, rep: 0, hit: 0 };
    this.setAtk(this.pat.cfg);
    this.hitPlayer = false;
    this.setState('pattern');
  }

  endPattern() {
    this.pat = null;
    this.gravOverride = null;
    this.marker = null;
    this.setState('bossIdle');
    this.idle = Math.round((this.cfg.idleMin + Math.random() * (this.cfg.idleMax - this.cfg.idleMin)) / this.spd);
  }

  nextStep(P) { P.step++; P.f = 0; }

  updatePattern(game) {
    const P = this.pat;
    if (!P) { this.setState('bossIdle'); return; }
    P.f++;
    if (P.tele) P.teleF++;
    this['pat_' + P.id](game, P, P.cfg);
  }

  // 타격 직전 "슉"
  whoosh(P, impactF) {
    const lead = Math.round(CONFIG.enemyTiming.whooshLeadMs / BOSS_STEP);
    if (P.f === impactF - lead) Sound.play('whooshHeavy');
  }

  // 돌진베기 (노랑): 예고 → 순식간에 붙음 → 벰. 예고 시작 → 타격 = telegraphMs
  pat_dashSlash(game, P, c) {
    const p = game.player;
    if (P.step === 0) {
      if (P.f === 1) {
        P.wind = Math.max(6, this.frames(c.telegraphMs) - c.dashFrames);
        this.setAtk(c);
        this.tele('yellow', P.wind + c.dashFrames);
      }
      this.facing = Math.sign(p.x - this.x) || this.facing;
      this.vx *= 0.8;
      this.animPose = { a: 'gIdle', b: 'rushWind', t: P.f / Math.min(14, P.wind) };
      this.whoosh(P, P.wind + c.dashFrames);
      if (P.f >= P.wind) {
        const dx = p.x - this.x;
        const d = Math.max(0, Math.min(c.maxDist, Math.abs(dx) - 46));
        P.dashV = Math.sign(dx || this.facing) * d / c.dashFrames;
        this.facing = Math.sign(dx) || this.facing;
        this.nextStep(P);
      }
    } else if (P.step === 1) {
      this.vx = P.dashV;
      this.animPose = { a: 'rushWind', b: 'rushRun', t: 1 };
      if (P.f % 2 === 0) Effects.afterimage(Anim.snapshot(Anim.enemyFigure(this)), 'rgba(255,200,60,1)', 12);
      if (P.f >= c.dashFrames) { this.hitPlayer = false; this.nextStep(P); }
    } else if (P.step === 2) {
      this.vx *= 0.6;
      P.tele = false;
      this.animPose = { a: 'gWind', b: 'gStrike', t: 0.85 + P.f * 0.05 };
      Combat.enemyAttack(game, this, this.atk.hitbox, this.atk);
      if (P.f >= c.active) this.nextStep(P);
    } else {
      this.vx *= 0.85;
      this.animPose = { a: 'gStrike', b: 'gIdle', t: P.f / c.recovery };
      if (P.f >= this.framesF(c.recovery)) this.endPattern();
    }
  }

  // 점프 내려찍기 (빨강): 플레이어 위치로 뛰어 → 착지 충격파. triSlam 이 count 만큼 반복해서 씀
  pat_jumpSlam(game, P, c) {
    const p = game.player, L = game.level;
    const count = c.count || 1;
    if (P.step === 0) {
      const wind = this.framesF(c.windFrames);
      if (P.f === 1) { this.setAtk(c); this.tele('red', wind); }
      this.facing = Math.sign(p.x - this.x) || this.facing;
      this.vx *= 0.7;
      this.animPose = { a: 'gIdle', b: 'crouch', t: P.f / wind };
      if (P.f >= wind) {
        const T = this.framesF(c.airFrames);
        const tx = Math.max(60, Math.min(L.width - 60, p.x));
        P.T = T;
        this.gravOverride = 8 * c.peak / (T * T);
        this.vy = -this.gravOverride * T / 2;
        this.vx = (tx - this.x) / T;
        this.onGround = false;
        this.marker = { x: tx, y: game.groundAt(tx).y, t: 0, T };
        P.tele = false;
        Sound.play('dash');
        this.nextStep(P);
      }
    } else if (P.step === 1) {
      if (this.marker) this.marker.t++;
      this.animPose = this.vy < 0 ? { a: 'tuck', b: 'tuck', t: 0, rot: P.f * 6 } : { a: 'smashWind', b: 'smashStrike', t: 1 };
      if ((this.onGround && P.f > 3) || P.f > P.T * 2.5) {
        // 착지 충격파
        this.gravOverride = null;
        this.vx = 0;
        this.marker = null;
        Effects.shockwave(this.x, this.y, c.radius);
        Effects.addShake(11);
        Effects.dust(this.x, this.y, 16, 0);
        Sound.play('slam');
        if (!p.dead && Math.abs(p.x - this.x) <= c.radius && p.onGround && Math.abs(p.y - this.y) < 40) {
          Combat.resolveIncoming(game, p, c.damage, Math.sign(p.x - this.x) || 1, c.knock, this.atk, this, this.x);
        }
        this.nextStep(P);
      }
    } else {
      this.vx *= 0.8;
      this.animPose = { a: 'smashStrike', b: 'gIdle', t: P.f / c.recovery };
      if (P.f === 1) P.rep++;
      if (P.rep < count) { if (P.f >= 8) { P.step = 0; P.f = 0; } return; }   // 연속 내려찍기
      if (P.f >= this.framesF(c.recovery)) this.endPattern();
    }
  }
  pat_triSlam(game, P, c) { this.pat_jumpSlam(game, P, c); }

  // 검기 3연발 (노랑, 반사 가능): 높이를 바꿔가며 발사
  pat_swordWaves(game, P, c) {
    const p = game.player;
    if (P.step === 0) {
      const wind = this.frames(c.telegraphMs);
      if (P.f === 1) { this.setAtk(c); this.tele('yellow', wind); }
      this.facing = Math.sign(p.x - this.x) || this.facing;
      this.vx *= 0.7;
      this.animPose = { a: 'gIdle', b: 'gWind', t: P.f / wind };
      if (P.f >= wind) {
        const h = c.heights[P.hit % c.heights.length];
        const atk = {
          damage: c.damage, parryable: true, kind: 'wave',
          projectile: { speed: c.speed, radius: 10, height: 34, life: 220, reflectMult: 1.3, reflectDamage: c.reflectDamage },
        };
        const pr = new Projectile(this.x + this.facing * 34, this.y + h, this.facing * c.speed, 0, atk, this);
        pr.kind = 'wave';
        game.projectiles.push(pr);
        Sound.play('bossWave');
        P.tele = false;
        this.nextStep(P);
      }
    } else if (P.step === 1) {
      this.animPose = { a: 'gWind', b: 'gStrike', t: 0.6 + P.f * 0.1 };
      if (P.f >= this.framesF(c.gapFrames)) {
        P.hit++;
        if (P.hit < c.count) { P.step = 0; P.f = 0; } else this.nextStep(P);
      }
    } else {
      this.animPose = { a: 'gStrike', b: 'gIdle', t: P.f / c.recovery };
      if (P.f >= this.framesF(c.recovery)) this.endPattern();
    }
  }

  // 광역 경고 후 폭발 (빨강): 플레이어 주변과 보스 주변 바닥에 붉은 원
  pat_areaBlast(game, P, c) {
    const p = game.player;
    const warn = this.framesF(c.warnFrames);
    if (P.step === 0) {
      if (P.f === 1) {
        this.setAtk(c);
        this.tele('red', warn);
        const xs = [p.x, this.x];
        for (let i = 2; i < c.zones; i++) xs.push(p.x + (i % 2 ? -1 : 1) * c.spread * Math.ceil((i - 1) / 2));
        for (const x of xs) this.addZone(game, x, c.radius, warn, c);
        Sound.play('bossCast');
      }
      this.vx *= 0.7;
      this.animPose = { a: 'gIdle', b: 'smashWind', t: P.f / 14, shake: P.f > warn * 0.6 };
      if (P.f >= warn) { P.tele = false; this.nextStep(P); }
    } else {
      this.animPose = { a: 'smashStrike', b: 'gIdle', t: P.f / c.recovery };
      if (P.f >= this.framesF(c.recovery)) this.endPattern();
    }
  }

  // 화염 기둥 (빨강): 보스 앞에서부터 연달아 폭발이 번져감
  pat_pillars(game, P, c) {
    const L = game.level;
    if (P.step === 0) {
      const wind = this.framesF(30);
      if (P.f === 1) { this.setAtk(c); this.tele('red', wind); this.facing = Math.sign(game.player.x - this.x) || this.facing; }
      this.vx *= 0.7;
      this.animPose = { a: 'gIdle', b: 'smashWind', t: P.f / wind };
      if (P.f >= wind) {
        const warn = this.framesF(c.warnFrames), gap = this.framesF(c.interval);
        for (let k = 0; k < c.count; k++) {
          const x = this.x + this.facing * (70 + k * c.step);
          if (x < 20 || x > L.width - 20) break;
          this.addZone(game, x, c.radius, warn + k * gap, c);
        }
        P.last = warn + c.count * gap;
        P.tele = false;
        Effects.shockwave(this.x, this.y, 90);
        Sound.play('bossCast');
        this.nextStep(P);
      }
    } else {
      this.animPose = { a: 'smashStrike', b: 'gIdle', t: P.f / 20 };
      if (P.f >= Math.min(P.last, this.framesF(c.recovery) + 20)) this.endPattern();
    }
  }

  // 난무 (노랑 → 노랑 → 흰색 섬광 찌르기): 리듬 패링
  pat_flurry(game, P, c) {
    const p = game.player;
    const h = c.hits[P.hit];
    if (P.step === 0) {
      const wind = this.frames(h.telegraphMs);
      if (P.f === 1) {
        this.setAtk(c, { hitbox: h.thrust ? c.thrustBox : c.hitbox });
        this.tele(h.telegraph === 'white' ? 'white' : 'yellow', wind);
      }
      this.facing = Math.sign(p.x - this.x) || this.facing;
      this.vx *= 0.75;
      this.animPose = h.thrust ? { a: 'gIdle', b: 'thrustWind', t: P.f / wind } : { a: 'gIdle', b: P.hit % 2 ? 'riseWind' : 'gWind', t: P.f / wind };
      this.whoosh(P, wind);
      if (P.f >= wind) {
        this.vx = this.facing * c.lunge * (h.thrust ? 2.2 : 1);
        this.hitPlayer = false;
        this.nextStep(P);
      }
    } else if (P.step === 1) {
      this.vx *= 0.8;
      P.tele = false;
      this.animPose = h.thrust ? { a: 'thrustWind', b: 'thrustStrike', t: 0.6 + P.f * 0.1 } : { a: P.hit % 2 ? 'riseWind' : 'gWind', b: P.hit % 2 ? 'riseStrike' : 'gStrike', t: 0.6 + P.f * 0.1 };
      Combat.enemyAttack(game, this, this.atk.hitbox, this.atk);
      if (P.f >= 5) {
        P.hit++;
        if (P.hit < c.hits.length) { P.step = 0; P.f = 0; } else this.nextStep(P);
      }
    } else {
      this.vx *= 0.85;
      this.animPose = { a: 'gStrike', b: 'gIdle', t: P.f / c.recovery };
      if (P.f >= this.framesF(c.recovery)) this.endPattern();
    }
  }

  // ---------- 바닥 경고 → 폭발 ----------
  addZone(game, x, r, warn, c) {
    const L = game.level;
    x = Math.max(r * 0.5, Math.min(L.width - r * 0.5, x));
    this.zones.push({ x, y: game.groundAt(x).y, r, warn, t: 0, boom: 0, c });
  }

  updateZones(game) {
    const p = game.player;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (!z) continue;   // 판정 도중 반격(철벽 등)으로 페이즈가 바뀌어 목록이 비었을 수 있음
      z.t++;
      if (!z.boom && z.t >= z.warn) {
        z.boom = 1;
        Effects.radialSparks(z.x, z.y - 10, 16, '#ffa040', 1);
        Effects.ring(z.x, z.y - 6, '#ff6a2a', z.r * 1.2);
        Effects.dust(z.x, z.y, 8, 0);
        Effects.addShake(6);
        Sound.play('boom');
        if (!p.dead && Math.abs(p.x - z.x) <= z.r && p.y > z.y - 120 && p.y <= z.y + 4) {
          Combat.resolveIncoming(game, p, z.c.damage, Math.sign(p.x - z.x) || 1, z.c.knock, { parryable: false }, null, z.x);
        }
      }
      if (z.boom && ++z.boom > 22) this.zones.splice(i, 1);
    }
  }

  // ---------- 피격 / 패링 / 그로기 ----------
  takeHit(dmg, info) {
    const B = CONFIG.boss;
    if (this.state === 'intro' || this.state === 'roar' || this.state === 'bossDeath') {
      this.flash = 3;
      return 'armor';
    }
    if (this.groggyTimer > 0) dmg *= B.groggyDamageMult;
    const res = super.takeHit(dmg, info);
    if (this.dead) {
      this.dead = false;           // 사망 연출이 끝날 때까지는 남아 있음
      this.hp = 0;
      this.startDeath();
      return 'kill';
    }
    if (this.phase === 1 && this.hp <= this.maxHp * B.phase2At) this.startPhase2();
    return res;
  }

  // 퍼펙트 패링 당함: 난무 중간 타는 살짝 밀리기만, 마지막 타/단일 공격은 휘청 (패턴 끊김)
  parried(dir) {
    const P = this.pat;
    this.hitPlayer = true;
    if (P && P.id === 'flurry' && P.hit < P.cfg.hits.length - 1) {
      this.vx = dir * 2;
      this.flash = 3;
      return;
    }
    if (this.state === 'groggy' || this.state === 'launched' || this.state === 'down') return;
    this.pat = null;
    this.marker = null;
    this.gravOverride = null;
    this.vx = dir * CONFIG.parry.deflectPush;
    this.setState('deflected');
  }

  breakPosture(game) {
    const B = CONFIG.boss;
    this.posture = this.maxPosture;
    this.groggyTimer = B.groggyFrames;
    this.armorBroken = B.groggyFrames + 20;   // 그로기 동안은 런처로 띄울 수 있음
    this.pat = null;
    this.marker = null;
    this.gravOverride = null;
    this.hitPlayer = true;
    this.vx = 0;
    this.setState('groggy');
    Effects.popText(this.x, this.y - this.h - 34, '그로기!', '#ffd040', 24);
    Effects.radialSparks(this.x, this.y - this.h * 0.6, 24, '#ffd040', 1);
    Effects.addShake(10);
    Sound.play('postureBreak');
    if (game) {
      game.slowmo(CONFIG.posture.breakSlowmoMs);
      game.onPostureBreak(this);
    }
  }

  recoverGroggy() {
    this.groggyTimer = 0;
    this.posture = 0;
    this.armorBroken = 0;
    this.setState('bossIdle');
    this.idle = 20;
  }

  afterHurt() {
    if (this.groggyTimer > 0) this.setState('groggy');
    else { this.posture = Math.min(this.posture, this.maxPosture - 1); this.setState('bossIdle'); this.idle = 24; }
  }

  startPhase2() {
    this.phase = 2;
    this.pat = null;
    this.marker = null;
    this.gravOverride = null;
    this.groggyTimer = 0;
    this.armorBroken = 0;
    this.setState('roar');
    Effects.popText(this.x, this.y - this.h - 40, '분노', this.cfg.aura, 28);
    if (this.weakTo) Effects.popText(this.x, this.y - this.h - 70, `약점 변화: ${CONFIG.weapons[this.weakTo].name}`, `rgb(${CONFIG.weapons[this.weakTo].trail.inner})`, 16);
    Game.slowmo(400);
    Game.bossPhaseBanner = { life: 120, max: 120 };
  }

  // ---------- 격파 연출 ----------
  startDeath() {
    this.pat = null;
    this.zones.length = 0;
    this.marker = null;
    this.gravOverride = null;
    this.vx = 0;
    this.setState('bossDeath');
    Game.slowmo(900);
    Effects.screenFlash('rgba(255,255,255,', 16);
    Effects.addShake(16);
    Sound.play('bossDeath');
  }

  updateDeath(game) {
    const B = CONFIG.boss, f = this.stateFrame;
    this.vx = 0;
    this.flash = f % 6 < 3 ? 2 : 0;
    this.animPose = { a: 'gDeflect', b: 'gKneel', t: f / 30, shake: true };
    if (f % 10 === 0) {
      Effects.radialSparks(this.x + (Math.random() - 0.5) * 40, this.y - Math.random() * this.h, 10, this.cfg.aura, 1);
      Sound.play('boom');
    }
    if (f === B.deathFrames - 8) {
      Effects.shards(this.x, this.y - this.h / 2, 1, 40, '#0c0a0b');
      Effects.shards(this.x, this.y - this.h / 2, -1, 40, '#0c0a0b');
      Effects.ring(this.x, this.y - this.h / 2, this.cfg.aura, 200);
      Effects.impactFrame(1);
      Effects.addShake(18);
      Effects.popText(this.x, this.y - this.h - 30, '격파', '#ffe9a0', 34);
      Sound.play('execSplit');
    }
    if (f >= B.deathFrames) { this.dead = true; this.remove = true; }
  }
}

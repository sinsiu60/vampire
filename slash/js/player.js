'use strict';
// 플레이어: 이동, 점프(코요테/버퍼/2단/가변 높이), 대시, 지상 콤보, 차지 강공격,
//          런처, 공중 3타, 공중 강공, 내려찍기
// 상태: free | attack | charge | slam | dash | parry | hurt | dead

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
    this.hp = P.maxHp;
    this.stamina = P.maxStamina;
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
    this.buf = { jump: 0, light: 0, heavy: 0, dash: 0, parry: 0 };
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
    this.critReady = 0;           // 패링 성공 후 다음 공격 크리티컬 확정 남은 시간
    this.parryFlash = 0;          // 패링 성공 연출

    // 애니메이션
    this.runPhase = 0;            // 달리기 주기
    this.flipTimer = 0;           // 2단 점프 공중제비
    this.initScarf();
  }

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
  readInput(input) {
    const P = CONFIG.player;
    if (input.isPressed('jump')) this.buf.jump = P.jumpBufferFrames;
    if (input.isPressed('light')) this.buf.light = P.attackBufferFrames;
    if (input.isPressed('heavy')) {
      this.buf.heavy = P.attackBufferFrames;
      this.heavyDown = input.isDown('down');
    }
    if (input.isPressed('dash')) this.buf.dash = 6;
    if (input.isPressed('parry')) this.buf.parry = 4;
  }

  isActiveFrame() {
    if (!this.move) return false;
    if (this.state === 'slam') return this.slamPhase === 'fall';
    if (this.state !== 'attack') return false;
    const f = this.stateFrame, m = this.move;
    return f >= m.startup && f < m.startup + m.active;
  }

  // 패링 판정 창 안인가 (F 를 누른 직후 window 프레임)
  isParrying() {
    return this.state === 'parry' && this.stateFrame <= CONFIG.parry.window;
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
    const REST = P.bladeRestAngle;
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
        const rest = nearestAngle(REST, endA);
        pose.ang = endA + (rest - endA) * ease.inOut(t);
      }
      return pose;
    }
    switch (this.state) {
      case 'charge': pose.ang = -165 + Math.sin(this.stateFrame * 0.6) * 3; break;
      case 'dash': pose.ang = 160; break;
      case 'hurt': pose.ang = -70; break;
      case 'parry': pose.ang = -55; break;   // 칼을 비스듬히 세워 막는 자세
      case 'slam':
        // 머리 위로 들었다가 → 아래로 내리꽂기
        pose.ang = this.slamPhase === 'hang' && this.stateFrame < 4 ? -100 : 90;
        break;
      default:
        if (!this.onGround) pose.ang = this.vy < 0 ? 120 : 60;
        else if (Math.abs(this.vx) > 1) pose.ang = 140;   // 달릴 때 칼을 뒤로
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
      Effects.trailPoint(this.swingId, a.x, a.y, b.x, b.y, life, m.heavy);
    }
  }

  // ---------- 메인 갱신 ----------
  update(game, input) {
    const P = CONFIG.player, A = CONFIG.air;
    const ax = input.axisX();

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
    if (this.parryFlash > 0) this.parryFlash--;

    // 스태미나 회복
    if (this.staminaDelay > 0) this.staminaDelay--;
    else if (this.state !== 'charge') this.stamina = Math.min(P.maxStamina, this.stamina + P.staminaRegen);

    // 코요테 타임
    if (this.onGround) {
      this.coyote = P.coyoteFrames;
      this.jumpsUsed = 0;
      this.airDashesLeft = P.airDashes;
    } else if (this.coyote > 0) {
      this.coyote--;
      if (this.coyote === 0 && this.jumpsUsed === 0) this.jumpsUsed = 1; // 걸어서 떨어지면 공중 점프 1회만
    }

    this.stateFrame++;
    switch (this.state) {
      case 'free': this.updateFree(game, input, ax); break;
      case 'attack': this.updateAttack(game, input, ax); break;
      case 'charge': this.updateCharge(game, input, ax); break;
      case 'slam': this.updateSlam(game, input, ax); break;
      case 'dash': this.updateDash(game, input, ax); break;
      case 'parry': this.updateParry(game, input, ax); break;
      case 'hurt': this.updateHurt(game); break;
      case 'dead': this.updateDead(game); break;
    }

    // 중력 (대시/내려찍기 중엔 직접 제어)
    const noGravity = this.state === 'dash' || (this.state === 'slam' && this.slamPhase !== 'land');
    if (!noGravity) {
      let g = CONFIG.physics.gravity;
      // 공중 공격 중엔 살짝 체공
      if (this.state === 'attack' && this.move && this.move.air &&
          this.stateFrame < this.move.startup + this.move.active + 4) g *= A.attackGravityMult;
      this.vy = Math.min(this.vy + g, CONFIG.physics.maxFall);
      // 가변 점프: 키를 떼면 상승 속도 감소
      if (this.vy < 0 && !input.isDown('jump') && this.jumpCut) {
        this.vy *= P.jumpCutMult;
        this.jumpCut = false;
      }
    }

    this.wasOnGround = this.onGround;
    Dungeon.moveAndCollide(this);

    // 착지
    if (this.onGround && !this.wasOnGround) {
      this.landSquash = 8;
      this.jumpCut = false;
      this.launchFollow = false;
      if (this.state !== 'slam') {
        Effects.dust(this.x, this.y, 6, 0);
        Sound.play('land');
      }
      // 공중 기술 도중 착지하면 기술 종료
      if (this.state === 'attack' && this.move && this.move.air) {
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
    Sound.play('jump');
    return true;
  }

  tryDash(ax) {
    if (this.buf.dash <= 0 || this.dashCooldown > 0) return false;
    if (!this.onGround && this.airDashesLeft <= 0) return false;
    if (!this.useStamina(CONFIG.player.dashStamina)) { this.buf.dash = 0; return false; }
    this.buf.dash = 0;
    if (!this.onGround) this.airDashesLeft--;
    this.dashDir = ax !== 0 ? ax : this.facing;
    this.facing = this.dashDir;
    this.vy = 0;
    this.move = null;
    this.launchFollow = false;
    this.setState('dash');
    Effects.dust(this.x, this.y, 8, this.dashDir);
    Sound.play('dash');
    return true;
  }

  // 공격 입력 처리. 콤보 연결 규칙은 여기 한 곳에서.
  tryAttack(ax, input) {
    const M = CONFIG.moves;
    const downHeld = this.heavyDown || input.isDown('down');

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
        const prev = this.lastMoveId && M[this.lastMoveId];
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
      const prev = this.lastMoveId && M[this.lastMoveId];
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
    const move = moveData || CONFIG.moves[id];
    if (ax !== 0) this.facing = ax;    // 공격 시작 시 방향 전환 허용
    this.move = move;
    this.moveId = id;
    this.lastMoveId = null;
    this.hitList.clear();
    this.swingId++;
    this.launchFollow = false;
    this.setState('attack');
    this.vx *= 0.3;
    if (move.air && this.vy > 0) this.vy *= 0.3;   // 공중 공격 시작 시 낙하 멈칫
  }

  startSlam(ax) {
    if (ax !== 0) this.facing = ax;
    this.move = CONFIG.moves.SLAM;
    this.moveId = 'SLAM';
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
    if (this.tryDash(ax)) return;
    if (this.tryJump(input)) { /* 점프 후에도 이동은 계속 */ }
    if (this.tryAttack(ax, input)) return;

    const accel = this.onGround ? P.groundAccel : P.airAccel;
    const decel = this.onGround ? P.groundDecel : P.airDecel;
    if (ax !== 0) {
      this.facing = ax;
      this.vx += ax * accel;
      if (Math.abs(this.vx) > P.runSpeed) this.vx = Math.sign(this.vx) * P.runSpeed;
    } else {
      const s = Math.abs(this.vx) - decel;
      this.vx = s > 0 ? Math.sign(this.vx) * s : 0;
    }
  }

  updateAttack(game, input, ax) {
    const m = this.move;
    const f = this.stateFrame;
    const end = m.startup + m.active;

    // 예비동작 → 판정 시작 순간에 전진
    if (f === m.startup) {
      this.vx = this.facing * m.lunge;
      if (m.swing.thrust) Effects.thrust(this, m.swing.r, this.facing, m.active + 8);
      Sound.play(m.sfx);
    }
    // 마찰
    if (f > m.startup) this.vx *= this.onGround ? 0.82 : 0.92;
    else this.vx *= 0.7;

    // 런처: 강공 버튼을 누르고 있으면 판정 직후 같이 떠오름
    if (m.launch && f === m.startup + 2 && input.isDown('heavy')) {
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

  updateSlam(game, input, ax) {
    const A = CONFIG.air;
    if (this.slamPhase === 'hang') {
      // 공중에서 잠깐 멈췄다가
      this.vx *= 0.8;
      this.vy = Math.min(0, this.vy + 0.4);
      if (this.stateFrame >= A.slamHangFrames) {
        this.slamPhase = 'fall';
        this.stateFrame = 0;
        Sound.play('swingHeavy');
      }
    } else if (this.slamPhase === 'fall') {
      // 수직 낙하
      this.vx = 0;
      this.vy = A.slamFallSpeed;
      if (this.stateFrame % 2 === 0) this.addAfterimage();
      const a = {}, b = {};
      const pose = this.bladePose();
      this.bladePoint(pose, CONFIG.player.trailInner, a);
      this.bladePoint(pose, 70, b);
      Effects.trailPoint(this.swingId, a.x - this.facing * 6, a.y - 30, b.x, b.y, 10, true);
      if (this.onGround) {
        this.slamPhase = 'land';
        this.stateFrame = 0;
        this.landSquash = 10;
        Combat.slamWave(game, this);
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
        this.endMove();
      }
    }
  }

  updateCharge(game, input, ax) {
    const C = CONFIG.charge;
    this.vx *= 0.75;
    if (this.tryParry()) return;    // 차지 중 패링 / 대시로 취소 가능
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
      this.startAttack('HEAVY' + lv, 0, CONFIG.moves.HEAVY[lv]);
    }
  }

  updateDash(game, input, ax) {
    const P = CONFIG.player;
    this.vx = this.dashDir * P.dashSpeed;
    this.vy = 0;
    if (this.stateFrame % 2 === 0) this.addAfterimage();
    if (this.stateFrame >= P.dashFrames) {
      this.vx *= P.dashEndSpeedMult;
      this.dashCooldown = P.dashCooldown;
      this.setState('free');
    }
  }

  tryParry() {
    if (this.buf.parry <= 0) return false;
    this.buf.parry = 0;
    this.move = null;
    this.chargeLevel = 0;
    this.launchFollow = false;
    this.vx *= 0.3;
    if (this.vy > 0) this.vy *= 0.3;
    this.setState('parry');
    Sound.play('parryStance');
    return true;
  }

  updateParry(game, input, ax) {
    this.vx *= 0.8;
    if (!this.onGround && this.stateFrame <= CONFIG.parry.window) this.vy = Math.min(this.vy, 1.5);  // 공중에선 잠깐 멈칫
    if (this.stateFrame >= CONFIG.parry.whiffFrames) this.setState('free');
  }

  onParrySuccess(enemy) {
    const PR = CONFIG.parry;
    this.invuln = PR.invulnFrames;
    this.critReady = PR.critReadyFrames;
    this.parryFlash = 14;
    if (enemy) this.facing = Math.sign(enemy.x - this.x) || this.facing;
    this.setState('free');
  }

  updateHurt(game) {
    this.vx *= this.onGround ? 0.85 : 0.95;
    if (this.stateFrame >= CONFIG.player.hurtFrames) this.setState('free');
  }

  updateDead(game) {
    this.vx *= 0.9;
  }

  // 공중 공격이 적중했을 때: 살짝 머무름 (적의 저글링 감쇠와 같이 줄어듦)
  airHang(mult) {
    if (this.onGround || this.launchFollow) return;
    this.vy = CONFIG.air.hitHangVy * mult;
    this.jumpCut = false;
  }

  takeHit(dmg, dir, knock) {
    const P = CONFIG.player;
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
  }
}

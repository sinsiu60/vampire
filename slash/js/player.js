'use strict';
// 플레이어: 이동, 점프(코요테/버퍼/2단/가변 높이), 대시, 지상 콤보, 차지 강공격
// 상태: free | attack | charge | dash | hurt | dead

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
    this.buf = { jump: 0, light: 0, heavy: 0, dash: 0 };

    // 공격
    this.move = null;
    this.moveId = null;
    this.hitList = new Set();
    this.lastMoveId = null;       // 방금 끝난 기술 (콤보 이어가기용)
    this.comboGrace = 0;
    this.chargeLevel = 0;
    this.chargeFrames = 0;

    // 피격
    this.invuln = 0;
    this.flash = 0;
    this.landSquash = 0;
  }

  // ---------- 입력 수집 (히트스톱 중에도 매 스텝 호출) ----------
  readInput(input) {
    const P = CONFIG.player;
    if (input.isPressed('jump')) this.buf.jump = P.jumpBufferFrames;
    if (input.isPressed('light')) this.buf.light = P.attackBufferFrames;
    if (input.isPressed('heavy')) this.buf.heavy = P.attackBufferFrames;
    if (input.isPressed('dash')) this.buf.dash = 6;
  }

  isActiveFrame() {
    if (this.state !== 'attack' || !this.move) return false;
    const f = this.stateFrame, m = this.move;
    return f >= m.startup && f < m.startup + m.active;
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

  // ---------- 메인 갱신 ----------
  update(game, input) {
    const P = CONFIG.player;
    const ax = input.axisX();

    // 버퍼 / 타이머 감소
    for (const k in this.buf) if (this.buf[k] > 0) this.buf[k]--;
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;
    if (this.dashCooldown > 0) this.dashCooldown--;
    if (this.dropThrough > 0) this.dropThrough--;
    if (this.comboGrace > 0) this.comboGrace--; else if (this.state === 'free') this.lastMoveId = null;
    if (this.landSquash > 0) this.landSquash--;

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
      case 'dash': this.updateDash(game, input, ax); break;
      case 'hurt': this.updateHurt(game); break;
      case 'dead': this.updateDead(game); break;
    }

    // 중력 (대시 중엔 무중력)
    if (this.state !== 'dash') {
      this.vy = Math.min(this.vy + CONFIG.physics.gravity, CONFIG.physics.maxFall);
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
      Effects.dust(this.x, this.y, 6, 0);
      Sound.play('land');
    }
  }

  // ---------- 공통 동작 ----------
  tryJump(input) {
    if (this.buf.jump <= 0) return false;
    const P = CONFIG.player;
    // S + 점프: 통과 발판 내려가기
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
    this.setState('dash');
    Effects.dust(this.x, this.y, 8, this.dashDir);
    Sound.play('dash');
    return true;
  }

  // 공격 입력 처리. 콤보 연결 규칙은 여기 한 곳에서.
  tryAttack(ax) {
    const M = CONFIG.moves;
    // 약공 2타 후 K → 전진 찌르기
    if (this.buf.heavy > 0 && this.lastMoveId === 'L2') {
      this.buf.heavy = 0;
      this.startAttack('THRUST', ax);
      return true;
    }
    if (this.buf.light > 0) {
      this.buf.light = 0;
      const prev = this.lastMoveId && M[this.lastMoveId];
      const next = prev && prev.next ? prev.next : 'L1';
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
    this.setState('attack');
    this.vx *= 0.3;
  }

  // ---------- 상태별 ----------
  updateFree(game, input, ax) {
    const P = CONFIG.player;
    if (this.tryDash(ax)) return;
    if (this.tryJump(input)) { /* 점프 후에도 이동은 계속 */ }
    if (this.tryAttack(ax)) return;

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
      Effects.slash(this, m.arc, this.facing, m.active + 6, '#5ff', m.heavy ? 16 : 10);
      Sound.play(m.sfx);
    }
    // 마찰
    if (f > m.startup) this.vx *= this.onGround ? 0.82 : 0.92;
    else this.vx *= 0.7;

    // 후딜 캔슬 (대시 / 점프)
    if (f >= end) {
      if (this.tryDash(ax)) return;
      if (this.buf.jump > 0 && (this.onGround || this.coyote > 0 || this.jumpsUsed < 2)) {
        this.lastMoveId = this.moveId;
        this.comboGrace = CONFIG.player.comboGraceFrames;
        this.move = null;
        this.setState('free');
        this.tryJump(input);
        return;
      }
      // 다음 타 연결 (판정 끝 + chainDelay 이후)
      const chainAt = end + (m.chainDelay !== undefined ? m.chainDelay : CONFIG.player.chainDelay);
      if (f >= chainAt && (this.buf.light > 0 || this.buf.heavy > 0)) {
        this.lastMoveId = this.moveId;
        if (this.tryAttack(ax)) return;
      }
    }

    if (f >= m.startup + m.active + m.recovery) {
      this.lastMoveId = this.moveId;
      this.comboGrace = CONFIG.player.comboGraceFrames;
      this.move = null;
      this.setState('free');
    }
  }

  updateCharge(game, input, ax) {
    const C = CONFIG.charge;
    this.vx *= 0.75;
    if (this.tryDash(ax)) return;   // 차지 중 대시로 취소 가능
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
    if (this.stateFrame % 2 === 0) Effects.afterimage(this.x, this.y, this.w, this.h, this.facing);
    if (this.stateFrame >= P.dashFrames) {
      this.vx *= P.dashEndSpeedMult;
      this.dashCooldown = P.dashCooldown;
      this.setState('free');
    }
  }

  updateHurt(game) {
    this.vx *= this.onGround ? 0.85 : 0.95;
    if (this.stateFrame >= CONFIG.player.hurtFrames) this.setState('free');
  }

  updateDead(game) {
    this.vx *= 0.9;
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
    if (this.hp <= 0) {
      this.dead = true;
      this.setState('dead');
    } else {
      this.setState('hurt');
    }
  }
}

'use strict';
// HUD 와 오버레이 (화면 좌표)

const UI = {
  showHelp: false,     // F1: 게임 중 조작 도움말

  bar(ctx, x, y, w, h, t, color, back) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = back || '#2a1416';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, t)), h);
  },

  hud(ctx, game) {
    const p = game.player, P = CONFIG.player;
    ctx.textBaseline = 'alphabetic';
    // 체력 / 스태미나
    this.bar(ctx, 20, 20, 240, 14, p.hp / p.maxHp, '#e23b3b');
    this.bar(ctx, 20, 40, 180, 8, p.stamina / p.maxStamina,
      p.stamina < P.dashStamina ? '#8a7a3a' : '#e8d070', '#1c1a10');
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 26, 31);
    // 골드 (던전)
    if (game.mode === 'dungeon') {
      const pop = Run.goldPop;
      Run.drawGold(ctx, 210, 49, game.gold, 'left', pop > 0 ? '#ffffff' : null);
    }

    // 히트 수
    if (game.combo.count > 1) {
      const t = game.combo.timer / CONFIG.feel.comboResetFrames;
      const pop = game.combo.pop > 0 ? 1 + game.combo.pop * 0.05 : 1;
      ctx.save();
      ctx.translate(940, 236);
      ctx.scale(pop, pop);
      ctx.textAlign = 'right';
      ctx.globalAlpha = Math.min(1, t * 3);
      ctx.font = 'bold 34px "Segoe UI", sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000';
      ctx.strokeText(game.combo.count, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillText(game.combo.count, 0, 0);
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.fillStyle = '#5ff';
      ctx.fillText('HITS', 0, 18);
      ctx.restore();
    }

    this.parryHud(ctx, game);
    this.styleHud(ctx, game);
    if (CONFIG.debug.parry) this.parryDebugPanel(ctx, game);

    // 현재 기술 이름 (히트박스 디버그 중에만)
    if (!CONFIG.debug.showHitboxes) { /* 숨김 */ } else if (p.state === 'attack' && p.move) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.fillStyle = '#5ff';
      ctx.fillText(p.move.name, 20, 128);
    } else if (p.state === 'charge') {
      ctx.textAlign = 'left';
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.fillStyle = p.chargeLevel >= p.chargeCfg().maxLevel ? '#fff' : '#5ff';
      ctx.fillText('차지 Lv' + p.chargeLevel, 20, 128);
    }

    ctx.textAlign = 'right';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    if (game.mode === 'practice') Practice.draw(ctx, game);
    else ctx.fillText(`처치 ${game.kills}`, 720, 30);
    if (game.floor) this.minimap(ctx, game);
    // 속성 세트 (지도 아래)
    Synergy.drawHud(ctx, game, 16, game.floor ? 114 : 58);
    if (game.floorBanner) this.floorBanner(ctx, game.floorBanner);
    const boss = game.boss;
    if (boss) this.bossBar(ctx, game, boss);

    this.gearHud(ctx, game);

    // 시작 안내 (잠깐)
    if (game.hint > 0 && game.state === 'playing' && !this.showHelp && !boss) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, game.hint / 60) * 0.85;
      ctx.textAlign = 'center';
      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${Input.label('pause')} 일시정지·조작법   ${Input.label('inventory')} 각인   ${Input.label('help')} 도움말`, 580, 520);
      ctx.restore();
    }

    if (this.showHelp && !boss) {
      // 키 이름은 KEYBINDS 에서 가져온다 (config.js 에서 바꾸면 도움말도 같이 바뀜)
      const k = (a) => Input.label(a);
      const lines = [
        `${k('left')}/${k('right')} 이동  ${k('jump')} 점프(2단)  ${k('dash')} 대시(무적)  ${k('light')} 약공 콤보  ${k('heavy')} 강공(길게=차지)  약공 2타 후 ${k('heavy')} 찌르기`,
        `${k('down')}+${k('heavy')} 런처(${k('heavy')} 유지=같이 점프)  공중 ${k('light')} 콤보  공중 ${k('heavy')} 강공  공중 ${k('down')}+${k('heavy')} 내려찍기`,
        `${k('parry')} 탭 = 패링 / 누르기 = 가드  패링 직후 ${k('light')} 일섬 / ${k('heavy')} 런처  체간 붕괴 시 ${k('light')} 처형`,
        `${k('swap')}/휠 무기 교체(공격 중이면 전환기 + 공명)  ${k('skill1')}/${k('skill2')} 무기 스킬  머리 위 아이콘 = 약점 무기  ${k('inventory')} 각인`,
        `${k('spawn1')}~${k('spawn7')} 적·보스  ${k('spawn8')} 각인  ${k('debug')} 히트박스  ${k('debugMode')} 패링 디버그  ${k('mode')} 던전/연습장  ${k('help')} 도움말`,
      ];
      ctx.textAlign = 'center';
      ctx.font = '11px "Segoe UI", sans-serif';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(lines[i], 581, 471 + i * 14);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(lines[i], 580, 470 + i * 14);
      }
    }
  },

  // ---------- 무기 3개 / 스킬 쿨타임 / 공명 (왼쪽 아래) ----------
  // 무기 칸 순서대로 (R = 오른쪽으로). 현재 무기는 크게. 각 무기 아래 Q·E 쿨타임 (안 든 무기도 2배속 회복)
  gearHud(ctx, game) {
    const p = game.player, R = CONFIG.swap.resonance;
    const cur = p.activeWeapon, yb = 530;
    const res = p.res, g = res.timer > 0 ? R.glow[res.level - 1] : 0;
    let x = 14;
    ctx.save();
    WEAPON_ORDER.forEach((t, i) => {
      const big = i === cur, s = big ? 44 : 30, qs = big ? 20 : 14;
      const y = yb - qs - 4 - s;
      const W = CONFIG.weapons[t];
      this.iconBox(ctx, x, y, s, p.gear.weapons[i], null, big ? 1 : 0.7);
      // 장착한 각인: 속성 색 점 (아이콘 위쪽)
      p.engr[t].forEach((inst, k) => {
        const px = x + 4 + k * (big ? 9 : 7), py = y + 4, r = big ? 3 : 2.4;
        ctx.fillStyle = inst ? DATA.elements[Engrave.def(inst).element].color : 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(px + r, py + r, r, 0, Math.PI * 2); ctx.fill();
      });
      if (big) {
        // 공명: 테두리 청록 빛 (단계가 높을수록 밝게)
        if (g > 0) {
          ctx.save();
          ctx.strokeStyle = g >= 1 ? '#f0ffff' : '#7ff';
          ctx.shadowColor = '#3ff';
          ctx.shadowBlur = 6 + 16 * g;
          ctx.globalAlpha = 0.4 + 0.6 * g * Math.min(1, res.timer / 30);
          ctx.lineWidth = 1 + 2 * g;
          ctx.strokeRect(x - 2.5, y - 2.5, s + 5, s + 5);
          ctx.restore();
          // 단계 + 남은 시간
          ctx.fillStyle = '#7ff';
          ctx.font = 'bold 10px "Segoe UI", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`공명 ${R.numerals[res.level - 1]}${res.cdCut > 0 ? `  쿨-${res.cdCut}%` : ''}`, x, y - 14);
          ctx.fillStyle = 'rgba(120,255,255,0.8)';
          ctx.fillRect(x, y - 9, s * Math.min(1, res.timer / (res.dur || R.duration)), 2);
        }
        ctx.fillStyle = `rgb(${W.trail.inner})`;
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        if (g <= 0) ctx.fillText(W.name, x, y - 5);
      }
      // Q / E 쿨타임
      ['q', 'e'].forEach((sl, k) => {
        const bx = x + k * (qs + (s - 2 * qs)), by = yb - qs;
        const cd = p.skillCd[t][sl], max = p.skillCdMax[t][sl];
        const flash = p.skillFlash[t][sl], deny = p.skillDeny[t][sl];
        const dx = deny > 0 ? Math.sin(deny * 1.6) * 2 : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(bx + dx - 1, by - 1, qs + 2, qs + 2);
        ctx.fillStyle = cd > 0 ? '#16141c' : big ? '#2a3440' : '#20262e';
        ctx.fillRect(bx + dx, by, qs, qs);
        if (cd > 0) {
          // 시계 방향으로 걷히는 어둠
          ctx.save();
          ctx.beginPath();
          ctx.rect(bx + dx, by, qs, qs);
          ctx.clip();
          ctx.fillStyle = 'rgba(90,120,140,0.35)';
          ctx.beginPath();
          ctx.moveTo(bx + dx + qs / 2, by + qs / 2);
          ctx.arc(bx + dx + qs / 2, by + qs / 2, qs, -Math.PI / 2 + Math.PI * 2 * (cd / max), Math.PI * 1.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        if (flash > 0) {
          // 쿨 완료: 반짝
          ctx.save();
          ctx.globalAlpha = flash / 30;
          ctx.fillStyle = '#fff';
          ctx.shadowColor = `rgb(${W.trail.inner})`;
          ctx.shadowBlur = 12;
          ctx.fillRect(bx + dx, by, qs, qs);
          ctx.restore();
        }
        ctx.strokeStyle = cd > 0 ? 'rgba(255,255,255,0.15)' : `rgba(${W.trail.inner},${big ? 0.9 : 0.55})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + dx + 0.5, by + 0.5, qs - 1, qs - 1);
        ctx.textAlign = 'center';
        ctx.fillStyle = cd > 0 ? '#ddd' : '#fff';
        ctx.font = `bold ${big ? 10 : 8}px "Segoe UI", sans-serif`;
        const label = cd > 0 ? (cd / 60 >= 1 ? Math.ceil(cd / 60) : (cd / 60).toFixed(1)) : sl.toUpperCase();
        ctx.fillText(label, bx + dx + qs / 2, by + qs / 2 + (big ? 4 : 3));
      });
      x += s + 8;
    });
    // 스왑 쿨 / 키 안내
    ctx.textAlign = 'left';
    ctx.font = '9px "Segoe UI", sans-serif';
    ctx.fillStyle = p.swapCooldown > 0 ? '#666' : 'rgba(255,255,255,0.6)';
    ctx.fillText(`${Input.label('swap')}/휠 교체`, x, yb - 2);
    // 현재 무기 스킬 이름
    const SK = p.weaponCfg().skills;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillText(`${Input.label('skill1')} ${SK.q.name}   ${Input.label('skill2')} ${SK.e.name}`, 14, yb - 96);
    ctx.restore();
  },

  iconBox(ctx, x, y, s, item, glow, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha || 1;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - 2, y - 2, s + 4, s + 4);
    ctx.fillStyle = '#1c1a22';
    ctx.fillRect(x, y, s, s);
    if (item) {
      ctx.strokeStyle = Loot.color(item);
      ctx.lineWidth = 1.5;
      if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      ctx.shadowBlur = 0;
      Loot.drawIcon(ctx, item, x + s / 2, y + s / 2, s / 30);
    }
    ctx.restore();
  },

  // ---------- 런 진행 (왼쪽 위): 층 · 방 번호 · 지나온 길 아이콘 ----------
  minimap(ctx, game) {
    const fl = game.floor, cur = game.room.node, F = game.floorCfg;
    const x = 16, y = 58, w = 250, h = 50;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x, y, w, h);
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(`${game.floorIndex + 1}층 · ${F.name}   방 ${cur.layer + 1}/${fl.length}`, x + 6, y + 13);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`${Input.label('map')} 지도`, x + w - 6, y + 13);
    // 갈림길마다 한 칸: 지나온 방 아이콘 / 지금 방 / 앞으로 (점) / 보스
    const n = fl.length, step = (w - 24) / (n - 1);
    for (let li = 0; li < n; li++) {
      const cx = x + 12 + li * step, cy = y + 33;
      const visited = fl.layers[li].find((nd) => nd.visited);
      if (li < n - 1) {
        ctx.strokeStyle = li < cur.layer ? 'rgba(120,255,255,0.6)' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + step - 6, cy); ctx.stroke();
      }
      const nd = visited || (li === n - 1 ? fl.layers[li][0] : null);
      if (nd) {
        const col = CONFIG.rooms[nd.kind].color;
        if (nd === cur) {
          ctx.fillStyle = 'rgba(120,255,255,0.18)';
          ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
        }
        Run.icon(ctx, nd.kind, cx, cy, nd === cur ? 10 : 8, nd === cur ? '#bff' : col);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  },

  // ---------- 보스 체력바 (화면 아래) + 그로기 게이지 + 이름 ----------
  bossBar(ctx, game, b) {
    const V = CONFIG.view, B = CONFIG.boss;
    const w = 560, x = (V.width - w) / 2, y = 506;
    // 등장 연출: 위아래 검은 띠 + 큰 이름
    const intro = game.bossIntro;
    if (intro) {
      const t = 1 - intro.life / intro.max;
      const a = Math.min(1, t * 5, intro.life / 25);
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${(0.85 * a).toFixed(3)})`;
      ctx.fillRect(0, 0, V.width, 46 * a);
      ctx.fillRect(0, V.height - 46 * a, V.width, 46 * a);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '14px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ccc';
      ctx.fillText(intro.title, V.width / 2, 178);
      ctx.font = 'bold 44px "Segoe UI", sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000';
      ctx.strokeText(intro.name, V.width / 2, 222);
      ctx.fillStyle = b.cfg.aura;
      ctx.shadowColor = b.cfg.aura;
      ctx.shadowBlur = 16;
      ctx.fillText(intro.name, V.width / 2, 222);
      ctx.restore();
      return;
    }
    const pb = game.bossPhaseBanner;
    if (pb) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, pb.life / 30, (pb.max - pb.life) / 10);
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px "Segoe UI", sans-serif';
      ctx.fillStyle = b.cfg.aura;
      ctx.shadowColor = b.cfg.aura;
      ctx.shadowBlur = 14;
      ctx.fillText('2 페이즈', V.width / 2, 200);
      ctx.restore();
    }
    ctx.save();
    // 이름
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(b.name, x, y - 6);
    ctx.fillStyle = '#f2e6d8';
    ctx.fillText(b.name, x, y - 6);
    if (b.phase === 2) { ctx.fillStyle = b.cfg.aura; ctx.font = 'bold 11px "Segoe UI", sans-serif'; ctx.fillText('분노', x + ctx.measureText(b.name).width + 60, y - 6); }
    // 약점 무기 (페이즈마다 바뀜)
    if (b.weakTo) {
      const W = CONFIG.weapons[b.weakTo], on = game.player.weaponType() === b.weakTo;
      ctx.textAlign = 'right';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.fillStyle = on ? `rgb(${W.trail.inner})` : 'rgba(255,255,255,0.6)';
      ctx.fillText(`약점: ${W.name}`, x + w - 18, y - 6);
      Loot.drawIcon(ctx, { type: b.weakTo, rarity: 0, tint: ctx.fillStyle }, x + w - 7, y - 10, 0.42);
      ctx.textAlign = 'left';
    }
    // 체력 (흰색 잔상 + 빨강)
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x - 3, y - 3, w + 6, 16);
    ctx.fillStyle = '#3a1012';
    ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = 'rgba(255,240,220,0.8)';
    ctx.fillRect(x, y, w * clamp01(b.hpLag / b.maxHp), 10);
    ctx.fillStyle = b.phase === 2 ? '#e8402a' : '#c42a2a';
    ctx.fillRect(x, y, w * clamp01(b.hp / b.maxHp), 10);
    // 2페이즈 경계
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x + w * B.phase2At - 1, y - 2, 2, 14);
    // 그로기 게이지 (체간): 가운데서 양옆으로
    const gt = clamp01(b.posture / b.maxPosture), gy = y + 15;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(V.width / 2 - 180, gy - 1, 360, 6);
    const groggy = b.state === 'groggy' || b.groggyTimer > 0;
    ctx.fillStyle = groggy ? ((game.frame >> 2) % 2 ? '#ff3020' : '#ffd0a0') : `rgb(255,${Math.round(210 - 170 * gt)},${Math.round(60 - 50 * gt)})`;
    const gw = groggy ? 360 * (b.groggyTimer / B.groggyFrames) : 360 * gt;
    ctx.fillRect(V.width / 2 - gw / 2, gy, gw, 4);
    ctx.font = 'bold 9px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(groggy ? '그로기!' : '그로기', V.width / 2, gy + 14);
    ctx.restore();
  },

  floorBanner(ctx, b) {
    const V = CONFIG.view;
    const t = 1 - b.life / b.max;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 6, b.life / 30);
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px "Segoe UI", sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000';
    ctx.strokeText(b.text, V.width / 2, 200);
    ctx.fillStyle = '#fff';
    ctx.fillText(b.text, V.width / 2, 200);
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ddd';
    ctx.fillText(b.sub, V.width / 2, 228);
    ctx.restore();
  },

  // 패링 디버그 패널 (왼쪽): 설정값 + 최근 시도 기록 (일찍/늦게 몇 초)
  parryDebugPanel(ctx, game) {
    const PR = CONFIG.parry;
    const x = 20, y = 152;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 6, y - 14, 250, 34 + game.parryLog.length * 15);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff0';
    ctx.fillText(`PARRY DEBUG (${Input.label('debugMode')})`, x, y);
    ctx.fillStyle = '#ccc';
    ctx.font = '10px monospace';
    ctx.fillText(`창 ${PR.windowMs}ms  보정 ${PR.lateGraceMs}ms  금지 ${PR.lockoutMs}ms`, x, y + 14);
    ctx.font = 'bold 11px monospace';
    game.parryLog.forEach((l, i) => {
      ctx.globalAlpha = Math.min(1, l.life / 40);
      ctx.fillStyle = l.ok ? '#7f7' : '#f77';
      ctx.fillText(l.text, x, y + 30 + i * 15);
    });
    ctx.restore();
  },

  // ---------- 스타일 랭크 (오른쪽 위) ----------
  styleHud(ctx, game) {
    const S = CONFIG.style;
    const cx = 880, base = 88;
    if (Style.rank >= 0) {
      const R = S.ranks[Style.rank];
      const k = Style.anim / S.rankUpAnim;                 // 1 → 0
      const scale = 1 + 1.3 * k * k;
      const rot = Math.sin(k * 14) * 0.25 * k;
      const shakeX = Style.downAnim > 0 ? (Math.random() - 0.5) * 6 : 0;
      ctx.save();
      ctx.translate(cx + shakeX, base - 24);
      ctx.rotate(rot - 0.12);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const size = 46 + Style.rank * 3;
      ctx.font = `italic 900 ${size}px "Segoe UI", sans-serif`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#000';
      ctx.strokeText(R.name, 0, 0);
      ctx.shadowColor = R.color;
      ctx.shadowBlur = 14 + 10 * k;
      ctx.fillStyle = k > 0.75 ? '#ffffff' : R.color;   // 오를 때 하얗게 번쩍
      ctx.fillText(R.name, 0, 0);
      ctx.restore();

      // 게이지 (다음 랭크까지)
      const gw = 120, gx = cx - gw / 2, gy = base + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(gx - 2, gy - 2, gw + 4, 8);
      ctx.fillStyle = R.color;
      ctx.fillRect(gx, gy, gw * Style.gauge(), 4);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'italic bold 12px "Segoe UI", sans-serif';
      ctx.fillStyle = R.color;
      ctx.fillText(R.title, cx, gy + 20);
    }
    // 보너스 문구
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'italic bold 13px "Segoe UI", sans-serif';
    Style.feed.forEach((f, i) => {
      const a = Math.min(1, f.life / 20);
      const slide = Math.max(0, f.life - (S.feedLife - 8)) * 4;
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(f.text, 940 + slide, 132 + i * 17);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 940 + slide, 132 + i * 17);
    });
    ctx.globalAlpha = 1;

    // 방(웨이브) 클리어 결과
    const b = game.clearBanner;
    if (b) {
      const V = CONFIG.view;
      const t = 1 - b.life / b.max;
      const a = Math.min(1, b.life / 30, t * 8);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 150, V.width, 86);
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px "Segoe UI", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('CLEAR', V.width / 2 - 90, 196);
      if (b.rank >= 0) {
        const R = S.ranks[b.rank];
        ctx.font = 'italic 900 40px "Segoe UI", sans-serif';
        ctx.fillStyle = R.color;
        ctx.shadowColor = R.color;
        ctx.shadowBlur = 12;
        ctx.fillText(R.name, V.width / 2 + 40, 200);
        ctx.shadowBlur = 0;
        ctx.font = '13px "Segoe UI", sans-serif';
        ctx.fillStyle = '#ddd';
        ctx.fillText('최고 랭크', V.width / 2 + 40, 222);
      }
      ctx.font = '14px "Segoe UI", sans-serif';
      ctx.fillStyle = '#9f9';
      if (b.heal > 0) ctx.fillText(`보상: 체력 +${b.heal}`, V.width / 2 + 170, 196);
      if (b.gold > 0) { ctx.fillStyle = '#ffd860'; ctx.fillText(`랭크 보너스 +${b.gold} 골드`, V.width / 2 + 190, 186); }
      if (b.note) { ctx.fillStyle = '#ffe9a0'; ctx.fillText(b.note, V.width / 2 + 190, b.gold > 0 ? 208 : 196); }
      ctx.restore();
    }
  },

  // 체간 바 / 연속 패링 체인 / 반격 안내
  parryHud(ctx, game) {
    const p = game.player, V = CONFIG.view, PR = CONFIG.parry, C = PR.chain;
    // 플레이어 체간 (화면 아래 가운데, 가운데서 양옆으로)
    const pt = p.posture / CONFIG.posture.player.max;
    if (pt > 0.005 || p.state === 'guard' || p.state === 'guardBreak') {
      const w = 220, x = V.width / 2, y = 452;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 8);
      const broken = p.state === 'guardBreak';
      const g = Math.round(210 - 170 * pt), b = Math.round(60 - 50 * pt);
      ctx.fillStyle = broken ? ((game.frame >> 2) % 2 ? '#ff3020' : '#ffd0a0') : `rgb(255,${g},${b})`;
      ctx.fillRect(x - (w / 2) * pt, y, w * pt, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x - 0.5, y - 3, 1, 10);
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('체간', x, y - 5);
    }

    // 연속 퍼펙트 패링 체인
    if (p.parryChain > 0 && p.chainShow > 0) {
      const tier = Combat.chainTier(p.parryChain);
      const age = C.displayFrames - p.chainShow;
      const pop = age < 8 ? 1 + (8 - age) * 0.06 : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.chainShow / 40);
      ctx.translate(V.width / 2, 92);
      ctx.scale(pop, pop);
      ctx.textAlign = 'center';
      ctx.font = `bold ${28 + tier * 6}px "Segoe UI", sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000';
      const txt = `패링 ×${p.parryChain}`;
      ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = C.colors[tier];
      if (tier > 0) { ctx.shadowColor = C.colors[tier]; ctx.shadowBlur = 12; }
      ctx.fillText(txt, 0, 0);
      ctx.restore();
    }

    // 반격 입력 가능 시간
    if (p.counterTimer > 0) {
      const k = p.counterTimer / PR.counterWindow;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.fillStyle = `rgba(150,255,255,${(0.4 + 0.6 * k).toFixed(3)})`;
      ctx.fillText(`반격!  ${Input.label('light')} 일섬  /  ${Input.label('heavy')} 런처`, V.width / 2, 116);
      ctx.fillStyle = 'rgba(150,255,255,0.8)';
      ctx.fillRect(V.width / 2 - 60 * k, 122, 120 * k, 2);
      ctx.restore();
    }
  },
};

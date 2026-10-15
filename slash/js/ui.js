'use strict';
// HUD 와 오버레이 (화면 좌표)

const UI = {
  showHelp: true,

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
    this.bar(ctx, 20, 20, 240, 14, p.hp / P.maxHp, '#e23b3b');
    this.bar(ctx, 20, 40, 180, 8, p.stamina / P.maxStamina,
      p.stamina < P.dashStamina ? '#8a7a3a' : '#e8d070', '#1c1a10');
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.ceil(p.hp)} / ${P.maxHp}`, 26, 31);

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

    // 현재 기술 이름 (테스트용)
    if (p.state === 'attack' && p.move) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.fillStyle = '#5ff';
      ctx.fillText(p.move.name, 20, 128);
    } else if (p.state === 'charge') {
      ctx.textAlign = 'left';
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.fillStyle = p.chargeLevel >= 2 ? '#fff' : '#5ff';
      ctx.fillText('차지 Lv' + p.chargeLevel, 20, 128);
    }

    ctx.textAlign = 'right';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    if (game.mode === 'practice') ctx.fillText(`콤보 연습장  WAVE ${game.wave}   처치 ${game.kills}`, 720, 30);
    else ctx.fillText(`처치 ${game.kills}`, 720, 30);
    if (game.floor) this.minimap(ctx, game);
    if (game.floorBanner) this.floorBanner(ctx, game.floorBanner);
    const boss = game.boss;
    if (boss) this.bossBar(ctx, game, boss);

    if (this.showHelp && !boss) {
      // 키 이름은 KEYBINDS 에서 가져온다 (config.js 에서 바꾸면 도움말도 같이 바뀜)
      const k = (a) => Input.label(a);
      const lines = [
        `${k('left')}/${k('right')} 이동   ${k('jump')} 점프(2단, 길게=높이)   ${k('dash')} 대시(무적)   빨강 예고 = 회피 / 노랑 = 패링·가드`,
        `${k('light')} 약공 4타   ${k('heavy')} 강공(길게=차지)   약공 2타 후 ${k('heavy')} 찌르기   후딜 중 ${k('dash')}/${k('jump')} 캔슬`,
        `${k('down')}+${k('heavy')} 런처(${k('heavy')} 유지 = 같이 점프)   공중 ${k('light')} 3타   공중 ${k('heavy')} 날려베기   공중 ${k('down')}+${k('heavy')} 내려찍기`,
        `${k('parry')} 탭 = 퍼펙트 패링   ${k('parry')} 누르기 = 가드   패링 직후 ${k('light')} 반격 일섬 / ${k('heavy')} 반격 런처   체간 붕괴 시 ${k('light')} 처형`,
        `${k('spawn1')}~${k('spawn6')} 적 소환   ${k('debug')} 히트박스   ${k('debugMode')} 패링 디버그   ${k('mode')} 던전/연습장   ${k('help')} 도움말   ${k('pause')} 일시정지`,
      ];
      ctx.textAlign = 'center';
      ctx.font = '12px "Segoe UI", sans-serif';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(lines[i], 481, 471 + i * 14);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(lines[i], 480, 470 + i * 14);
      }
    }
  },

  // ---------- 미니맵 (왼쪽 위) ----------
  // 방 폭에 비례한 상자들. 현재 방 = 흰색, 클리어 = 회청색, 전투 중 = 빨강, 아직 모르는 방 = 점선
  minimap(ctx, game) {
    const rooms = game.floor.rooms, cur = game.room;
    const last = rooms[rooms.length - 1];
    const total = last.mapX + last.mapW;
    const k = Math.min(1.6, 236 / total);
    const minY = Math.min(...rooms.map((r) => r.mapY)), maxY = Math.max(...rooms.map((r) => r.mapY + r.mapH));
    const top = 58, ox = 22, oy = top + 20 - minY;   // 패널 위쪽은 고정, 방 상자는 그 아래로
    let maxVisited = 0;
    rooms.forEach((r) => { if (r.visited) maxVisited = Math.max(maxVisited, r.index); });
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(ox - 6, top, total * k + 12, maxY - minY + 28);
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`${game.floorIndex + 1}층 · ${THEMES[Render.themeIndex].name}   방 ${cur.index + 1}/${rooms.length}`, ox, top + 12);
    for (const r of rooms) {
      const known = r.visited || r.index <= maxVisited + 1;
      if (!known) continue;
      const x = ox + r.mapX * k, y = oy + r.mapY, w = r.mapW * k, h = r.mapH;
      // 이전 방과 연결선
      if (r.index > 0) {
        const pr = rooms[r.index - 1];
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ox + (pr.mapX + pr.mapW) * k, oy + pr.mapY + pr.mapH - (pr.rightH ? 8 : 0) - 2);
        ctx.lineTo(x, y + h - (r.leftH ? 8 : 0) - 2);
        ctx.stroke();
      }
      if (r === cur) ctx.fillStyle = 'rgba(255,255,255,0.45)';
      else if (r.cleared) ctx.fillStyle = 'rgba(150,180,200,0.35)';
      else if (r.visited) ctx.fillStyle = 'rgba(255,80,60,0.4)';
      else ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = r === cur ? '#fff' : r.visited ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = r === cur ? 1.5 : 1;
      if (!r.visited) ctx.setLineDash([2, 2]);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.setLineDash([]);
      // 보스방 표시
      if (r.kind === 'boss') {
        ctx.fillStyle = r.cleared ? '#888' : '#ff4a3a';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2 - 1, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + w / 2 - 2, y + h / 2 + 1, 4, 3);
      }
      // 안 연 보상 상자
      if (r.chest && !r.chest.opened) {
        ctx.fillStyle = '#ffd860';
        ctx.fillRect(x + w - 6, y + 2, 4, 4);
      }
    }
    // 플레이어 위치
    const px = ox + (cur.mapX + Math.max(0, Math.min(1, game.player.x / cur.width)) * cur.mapW) * k;
    ctx.fillStyle = '#5ff';
    ctx.beginPath();
    ctx.arc(px, oy + cur.mapY + cur.mapH / 2, 2.2, 0, Math.PI * 2);
    ctx.fill();
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
      if (b.note) { ctx.fillStyle = '#ffe9a0'; ctx.fillText(b.note, V.width / 2 + 190, 196); }
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

  overlay(ctx, game) {
    const V = CONFIG.view;
    if (game.state === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, V.width, V.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 40px "Segoe UI", sans-serif';
      ctx.fillText('일시정지', V.width / 2, V.height / 2 - 10);
      ctx.font = '16px "Segoe UI", sans-serif';
      ctx.fillText(`${Input.label('pause')}: 계속   ${Input.label('restart')}: 재시작`, V.width / 2, V.height / 2 + 26);
    } else if (game.state === 'victory') {
      const t = Math.min(1, game.stateTime / 60);
      ctx.fillStyle = `rgba(0,0,0,${0.65 * t})`;
      ctx.fillRect(0, 0, V.width, V.height);
      ctx.globalAlpha = t;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe9a0';
      ctx.font = 'bold 50px "Segoe UI", sans-serif';
      ctx.fillText('던전 클리어!', V.width / 2, V.height / 2 - 20);
      ctx.fillStyle = '#fff';
      ctx.font = '18px "Segoe UI", sans-serif';
      ctx.fillText(`처치 ${game.kills}`, V.width / 2, V.height / 2 + 16);
      ctx.fillText(`${Input.label('restart')} 키로 다시 시작`, V.width / 2, V.height / 2 + 46);
      ctx.globalAlpha = 1;
    } else if (game.state === 'gameover') {
      const t = Math.min(1, game.stateTime / 60);
      ctx.fillStyle = `rgba(20,0,0,${0.7 * t})`;
      ctx.fillRect(0, 0, V.width, V.height);
      ctx.globalAlpha = t;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e23b3b';
      ctx.font = 'bold 56px "Segoe UI", sans-serif';
      ctx.fillText('YOU DIED', V.width / 2, V.height / 2 - 10);
      ctx.fillStyle = '#fff';
      ctx.font = '18px "Segoe UI", sans-serif';
      ctx.fillText(`${Input.label('restart')} 키로 재시작`, V.width / 2, V.height / 2 + 30);
      ctx.globalAlpha = 1;
    }
  },
};

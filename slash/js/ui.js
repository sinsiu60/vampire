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
      ctx.translate(900, 120);
      ctx.scale(pop, pop);
      ctx.textAlign = 'right';
      ctx.globalAlpha = Math.min(1, t * 3);
      ctx.font = 'bold 44px "Segoe UI", sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000';
      ctx.strokeText(game.combo.count, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillText(game.combo.count, 0, 0);
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.fillStyle = '#5ff';
      ctx.fillText('HITS', 0, 20);
      ctx.restore();
    }

    this.parryHud(ctx, game);

    // 현재 기술 이름 (테스트용)
    if (p.state === 'attack' && p.move) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.fillStyle = '#5ff';
      ctx.fillText(p.move.name, 20, 70);
    } else if (p.state === 'charge') {
      ctx.textAlign = 'left';
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.fillStyle = p.chargeLevel >= 2 ? '#fff' : '#5ff';
      ctx.fillText('차지 Lv' + p.chargeLevel, 20, 70);
    }

    ctx.textAlign = 'right';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`WAVE ${game.wave}   처치 ${game.kills}`, 940, 30);

    if (this.showHelp) {
      // 키 이름은 KEYBINDS 에서 가져온다 (config.js 에서 바꾸면 도움말도 같이 바뀜)
      const k = (a) => Input.label(a);
      const lines = [
        `${k('left')}/${k('right')} 이동   ${k('jump')} 점프(2단, 길게=높이)   ${k('dash')} 대시(무적)   빨강 예고 = 회피 / 노랑 = 패링·가드`,
        `${k('light')} 약공 4타   ${k('heavy')} 강공(길게=차지)   약공 2타 후 ${k('heavy')} 찌르기   후딜 중 ${k('dash')}/${k('jump')} 캔슬`,
        `${k('down')}+${k('heavy')} 런처(${k('heavy')} 유지 = 같이 점프)   공중 ${k('light')} 3타   공중 ${k('heavy')} 날려베기   공중 ${k('down')}+${k('heavy')} 내려찍기`,
        `${k('parry')} 탭 = 퍼펙트 패링   ${k('parry')} 누르기 = 가드   패링 직후 ${k('light')} 반격 일섬 / ${k('heavy')} 반격 런처   체간 붕괴 시 ${k('light')} 처형`,
        `${k('spawn1')}~${k('spawn6')} 적 소환(잡몹/방패/비행/중갑/원거리/돌진)   ${k('debug')} 히트박스   ${k('help')} 도움말 숨기기   ${k('pause')} 일시정지`,
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

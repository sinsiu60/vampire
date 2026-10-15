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
      const lines = [
        'A/D 이동   스페이스 점프(2단, 길게=높이)   S+스페이스 발판 내려가기',
        'J 약공 4타   K 강공(길게=차지)   J,J 후 K 찌르기   L 대시(무적)   후딜 중 L/스페이스 캔슬',
        'S+K 런처(K 유지 = 같이 점프)   공중 J 3타   공중 K 날려베기   공중 S+K 내려찍기',
        'H 히트박스   F1 도움말 숨기기   Esc 일시정지',
      ];
      ctx.textAlign = 'center';
      ctx.font = '12px "Segoe UI", sans-serif';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(lines[i], 481, 481 + i * 16);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(lines[i], 480, 480 + i * 16);
      }
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
      ctx.fillText('Esc: 계속   R: 재시작', V.width / 2, V.height / 2 + 26);
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
      ctx.fillText('R 키로 재시작', V.width / 2, V.height / 2 + 30);
      ctx.globalAlpha = 1;
    }
  },
};

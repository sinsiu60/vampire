'use strict';
// 로그라이크 런: 층 지도 생성 (갈림길), 방 만들기, 갈림길 문, 시설(휴식·상점·대장간·제단), 골드, 지도 화면(M)
// 데이터: data/floors.js (층), data/rooms.js (방 종류), 수치: config.js run

const Run = {
  coins: [],
  goldPop: 0,          // 골드 HUD 반짝임
  goldGain: 0,         // 방금 주운 골드 합계 (HUD 표시)

  reset() {
    this.coins.length = 0;
    this.goldPop = 0;
    this.goldGain = 0;
  },

  // ---------- 지도 생성 ----------
  // 층 = 갈림길(layer) 의 줄. 0 = 시작방, 마지막 = 보스방, 그 사이 갈림길마다 2~3개
  // 방에서 나가면 다음 갈림길의 방들 중 하나를 고른다
  genFloor(fi) {
    const F = CONFIG.floors[fi], R = CONFIG.run;
    const L = randInt(F.rooms[0], F.rooms[1]);
    const layers = [[this.node(0, 0, 'start')]];
    for (let li = 1; li < L - 1; li++) {
      const n = randInt(R.choices[0], R.choices[1]), layer = [];
      for (let k = 0; k < n; k++) {
        const w = li === 1 ? { [R.firstLayer]: 1 } : li === L - 2 ? R.preBoss : F.roomWeights;
        let kind = pickWeighted(w);
        // 같은 갈림길에 같은 시설이 두 번 나오지 않게
        if (kind !== 'combat' && kind !== 'elite' && layer.some((nd) => nd.kind === kind)) kind = 'combat';
        layer.push(this.node(li, k, kind));
      }
      layers.push(layer);
    }
    layers.push([this.node(L - 1, 0, 'boss')]);

    // 보장: 엘리트 / 시설 (중간 갈림길의 전투방을 바꿈)
    const mid = () => layers.slice(2, L - 1).flat().filter((nd) => nd.kind === 'combat');
    const count = (k) => layers.flat().filter((nd) => nd.kind === k).length;
    while (count('elite') < R.guaranteeElite && mid().length) pick(mid()).kind = 'elite';
    let have = R.services.filter((k) => count(k) > 0);
    while (have.length < R.guaranteeServices && mid().length) {
      const missing = R.services.filter((k) => have.indexOf(k) < 0);
      pick(mid()).kind = pick(missing);
      have = R.services.filter((k) => count(k) > 0);
    }
    // 연결: 갈림길의 모든 방 → 다음 갈림길의 모든 방
    for (let li = 0; li < L - 1; li++) for (const a of layers[li]) a.next = layers[li + 1];
    return { index: fi, layers, length: L };
  },

  node(layer, slot, kind) {
    return { id: `${layer}-${slot}`, layer, slot, kind, next: [], visited: false, cleared: false, room: null };
  },

  // ---------- 방 만들기 (처음 들어갈 때) ----------
  buildRoom(node, fi) {
    const D = CONFIG.dungeon, R = CONFIG.run, F = CONFIG.floors[fi];
    const RD = CONFIG.rooms[node.kind];
    const width = Array.isArray(RD.width) ? randInt(RD.width[0], RD.width[1]) : RD.width;
    const room = {
      index: node.layer, kind: node.kind, width, leftH: 0, rightH: 0, waves: [], node,
      terrain: RD.combat && node.kind !== 'boss',   // 지형(낭떠러지·높낮이)이 있는 방
      walls: true,                                  // 양옆은 벽 (되돌아갈 수 없음)
      exitLanding: R.exitLanding,
      cleared: !RD.combat,
      visited: false,
    };
    if (node.kind === 'combat') {
      const count = F.waveSize + (width > 1750 ? 1 : 0);
      const waves = width >= R.twoWaveWidth ? 2 : 1;
      for (let w = 0; w < waves; w++) {
        const list = [];
        for (let k = 0; k < count - (waves === 2 ? 1 : 0); k++) list.push({ type: pickWeighted(F.pools) });
        room.waves.push(list);
      }
    } else if (node.kind === 'elite') {
      // 엘리트: 정예 + 호위
      const list = [];
      const strong = Object.assign({}, F.pools); delete strong.flyer;
      for (let k = 0; k < F.eliteRoom.elites; k++) list.push({ type: pickWeighted(strong), elite: true });
      for (let k = 0; k < F.eliteRoom.escorts; k++) list.push({ type: pickWeighted(F.pools) });
      room.waves.push(list);
    } else if (node.kind === 'boss') {
      room.bossId = F.boss;
      room.exitLanding = D.landing;
    }
    if (RD.station) room.station = { kind: RD.station, x: Math.round(width / 2), y: D.baseY, used: false };
    room.level = Dungeon.genRoom(room);
    Traps.place(room, room.level, fi);
    node.room = room;
    return room;
  },

  // 갈림길 문 (방을 클리어하면 열림). 보스방은 다음 층 계단 하나
  makePortals(game, room) {
    const R = CONFIG.run, node = room.node;
    const y = CONFIG.dungeon.baseY;
    if (node.kind === 'boss') {
      const last = game.floorIndex + 1 >= CONFIG.floors.length;
      room.portals = [{ kind: last ? 'exit' : 'stairs', x: room.width - 110, y, node: null }];
      return;
    }
    const n = node.next.length;
    room.portals = node.next.map((nx, i) => ({ kind: nx.kind, node: nx, x: room.width - 90 - (n - 1 - i) * R.portalGap, y }));
  },

  // ---------- 매 프레임 ----------
  update(game) {
    const p = game.player, room = game.room;
    this.updateCoins(game);
    if (this.goldPop > 0) this.goldPop--;
    if (!room || game.transition || game.exec || p.dead) return;
    // 갈림길 문: 앞에서 위 키
    if (room.cleared && room.portals) {
      for (const po of room.portals) {
        if (Math.abs(p.x - po.x) < 26 && Math.abs(p.y - po.y) < 30 && Input.isPressed('up')) {
          this.collectAll(game);
          if (po.node) game.goToNode(po.node);
          else game.goNextFloor();
          Sound.play('gateOpen');
          return;
        }
      }
    }
    // 시설
    const st = room.station;
    if (st && Math.abs(p.x - st.x) < 44 && Math.abs(p.y - st.y) < 40 && Input.isPressed('up') && p.onGround) this.useStation(game, st);
  },

  // 시설 메뉴 (각인·변형 관련은 해당 단계에서 열림)
  useStation(game, st) {
    const R = CONFIG.run, p = game.player, RD = CONFIG.rooms;
    if (st.kind === 'fire') {
      if (st.used) { Effects.popText(p.x, p.y - 70, '이미 쉬었다', '#aaa', 13); return; }
      Choice.open(game, {
        title: '휴식', sub: '모닥불 앞에서 한 번만 고를 수 있다', color: RD.rest.color,
        options: [
          { label: '쉬기', icon: 'rest', color: '#7fe08a', desc: `체력 ${Math.round(R.rest.heal * 100)}% 회복\n(${Math.round(p.maxHp * R.rest.heal)} HP)`,
            act: () => { st.used = true; const h = Math.round(p.maxHp * R.rest.heal); p.heal(h); Effects.popText(st.x, st.y - 70, `+${h} HP`, '#7f7', 18); Sound.play('rest'); } },
          { label: '각인 강화', icon: 'forge', color: '#b0c8ff', desc: '장착한 각인 하나를 +1 강화',
            disabled: !Engrave.all(p).some((a) => a.inst.level < CONFIG.engrave.maxLevel),
            note: Engrave.all(p).length ? '더 강화할 각인이 없음' : '장착한 각인이 없음',
            act: () => { EngraveUI.open(game, { mode: 'upgrade', then: (g, r) => { if (r === 'done') st.used = true; } }); return true; } },
        ],
      });
    } else if (st.kind === 'shop') {
      const healed = st.healBought;
      Choice.open(game, {
        title: '상점', sub: '골드로 거래한다', color: RD.shop.color,
        options: [
          { label: '회복약', icon: 'rest', color: '#7fe08a', desc: `체력 ${Math.round(R.shop.heal * 100)}% 회복`, cost: healed ? 0 : R.shop.healCost,
            disabled: healed || p.hp >= p.maxHp, note: healed ? '품절' : '체력이 가득 참',
            act: () => { st.healBought = true; const h = Math.round(p.maxHp * R.shop.heal); p.heal(h); Effects.popText(p.x, p.y - 70, `+${h} HP`, '#7f7', 18); Sound.play('rest'); } },
          { label: '각인 구매', icon: 'shop', color: '#ffd23a', desc: '각인 3개 중 골라 산다', disabled: true, note: '4단계에서 열림' },
          { label: '각인 리롤', icon: 'curse', color: '#c0a0ff', desc: '진열된 각인을 새로 바꾼다', disabled: true, note: '4단계에서 열림' },
        ],
      });
    } else if (st.kind === 'anvil') {
      Choice.open(game, {
        title: '대장간', sub: '무기의 공격 방식을 바꾼다', color: RD.forge.color,
        options: [
          { label: '변형 구매', icon: 'forge', color: '#ff9a5a', desc: '변형 2개 중 하나를 산다', disabled: true, note: '5·8단계에서 열림' },
          { label: '변형 교체', icon: 'forge', color: '#ff9a5a', desc: '지금 변형을 다른 변형으로', disabled: true, note: '8단계에서 열림' },
        ],
      });
    } else if (st.kind === 'altar') {
      if (st.used) { Effects.popText(p.x, p.y - 70, '제단의 힘이 다했다', '#aaa', 13); return; }
      // 저주 각인 한 장 (제단마다 한 번 굴림)
      if (st.curse === undefined) st.curse = Engrave.offer(game, 1, 0, 0, 'curse')[0] || null;
      const owned = st.curse && Engrave.all(p).some((a) => a.inst.id === st.curse.id);
      const cur = st.curse && !owned
        ? Engrave.cardOption(game, st.curse, (g, r) => { if (r !== 'cancel') st.used = true; })
        : { label: '저주 각인', icon: 'curse', color: CONFIG.engrave.curseColor, desc: '강력하지만 대가가 있는 각인', disabled: true, note: '남은 저주가 없음' };
      Choice.open(game, {
        title: '저주 제단', sub: '힘에는 대가가 따른다 — 하나만 고를 수 있다', color: RD.curse.color,
        options: [
          cur,
          { label: '공용 변형', icon: 'elite', color: '#b45cff', desc: '플레이어 자체를 바꾸는 변형', disabled: true, note: '8단계에서 열림' },
        ],
      });
    }
  },

  // ---------- 골드 ----------
  // 적 처치 시 동전 (maxHp 비례, 정예 ×, 보스 고정)
  dropGold(game, e) {
    if (game.mode !== 'dungeon') return;
    const G = CONFIG.run.gold, F = game.floorCfg;
    let amount;
    if (e.isBoss) amount = G.boss[Math.min(game.floorIndex, G.boss.length - 1)];
    else amount = e.maxHp * G.perHp * (0.75 + Math.random() * 0.5) * (e.elite ? G.eliteMult : 1);
    this.spawnCoins(game, e.x, e.y - e.h * 0.5, Math.max(1, Math.round(amount * F.gold)));
  },

  spawnCoins(game, x, y, amount) {
    const G = CONFIG.run.gold;
    while (amount > 0) {
      const v = amount >= G.coinValue ? G.coinValue : amount;
      amount -= v;
      this.coins.push({ x, y, w: 6, h: 6, vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 4, v, t: 0, big: v >= G.coinValue });
    }
  },

  updateCoins(game) {
    const G = CONFIG.run.gold, p = game.player;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t++;
      const dx = p.x - c.x, dy = (p.y - p.h * 0.5) - c.y, d = Math.hypot(dx, dy);
      if (c.t > G.magnetDelay && d < G.magnetRange && !p.dead) {
        // 플레이어에게 빨려 들어감
        const sp = 3 + (G.magnetRange - d) * 0.08;
        c.x += dx / d * sp; c.y += dy / d * sp;
        if (d < G.pickupRange) { this.gain(game, c.v); this.coins.splice(i, 1); }
        continue;
      }
      c.vy = Math.min(c.vy + CONFIG.physics.gravity, CONFIG.physics.maxFall);
      Dungeon.moveAndCollide(c);
      if (c.onGround) { c.vx *= 0.8; if (c.vy === 0 && Math.abs(c.vx) < 0.1 && c.t < G.magnetDelay) c.t = G.magnetDelay; }
      if (c.y > game.level.killY) { this.gain(game, c.v); this.coins.splice(i, 1); }
    }
  },

  gain(game, v) {
    game.gold += v;
    this.goldPop = 10;
    this.goldGain = (this.goldPop > 0 ? this.goldGain : 0) + v;
    if ((Game.frame || 0) - (this._sndAt || 0) > 3) { Sound.play('coin'); this._sndAt = Game.frame; }
  },

  // 방을 떠날 때 남은 동전은 자동으로 줍는다
  collectAll(game) {
    for (const c of this.coins) game.gold += c.v;
    this.coins.length = 0;
  },

  // ---------- 그리기 (월드) ----------
  drawWorld(ctx, game) {
    const room = game.room, p = game.player, t = Game.frame || 0;
    if (!room) return;
    // 시설
    if (room.station) this.drawStation(ctx, room.station, p);
    // 갈림길 문
    if (room.portals) for (const po of room.portals) this.drawPortal(ctx, po, room.cleared, p);
    // 동전
    for (const c of this.coins) {
      ctx.save();
      ctx.fillStyle = c.big ? '#ffd860' : '#e8b840';
      ctx.shadowColor = '#ffb000';
      ctx.shadowBlur = 6;
      const r = c.big ? 3.6 : 2.6, sq = Math.abs(Math.cos(t * 0.15 + c.x));
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - r, r * Math.max(0.3, sq), r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  drawPortal(ctx, po, open, p) {
    const col = po.node ? CONFIG.rooms[po.kind].color : '#ffe9a0';
    const name = po.node ? CONFIG.rooms[po.kind].name : po.kind === 'exit' ? '탈출' : '다음 층';
    const t = Game.frame || 0;
    ctx.save();
    ctx.translate(po.x, po.y);
    // 아치
    const w = 46, h = 84;
    ctx.fillStyle = '#060506';
    ctx.fillRect(-w / 2 - 6, -h - 8, w + 12, h + 8);
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(-w / 2, -h + w / 2);
    ctx.arc(0, -h + w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(w / 2, 0);
    ctx.closePath();
    if (open) {
      const g = ctx.createLinearGradient(0, -h, 0, 0);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 0.08 + po.x);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#18141a';
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // 아이콘
    ctx.globalAlpha = open ? 1 : 0.35;
    this.icon(ctx, po.node ? po.kind : 'stairs', 0, -h - 24, 15, col);
    const near = Math.abs(p.x - po.x) < 70;
    if (near || !open) {
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(name, 0, -h - 46);
      ctx.fillStyle = col;
      ctx.fillText(name, 0, -h - 46);
    }
    if (open && Math.abs(p.x - po.x) < 26) {
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.strokeText(`${Input.label('up')}: 들어가기`, 0, -h - 60);
      ctx.fillText(`${Input.label('up')}: 들어가기`, 0, -h - 60);
    }
    ctx.restore();
  },

  drawStation(ctx, st, p) {
    const t = Game.frame || 0;
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.fillStyle = '#060506';
    let label = '', col = '#fff';
    if (st.kind === 'fire') {
      Render.rest(ctx, { x: 0, y: 0, used: st.used, heal: CONFIG.run.rest.heal, quiet: true });
      label = '모닥불'; col = '#ffd080';
    } else if (st.kind === 'shop') {
      // 상인: 천막 + 좌판
      ctx.beginPath(); ctx.moveTo(-60, -90); ctx.lineTo(60, -90); ctx.lineTo(70, -70); ctx.lineTo(-70, -70); ctx.closePath(); ctx.fill();
      ctx.fillRect(-58, -70, 4, 70); ctx.fillRect(54, -70, 4, 70);
      ctx.fillRect(-50, -30, 100, 30);
      ctx.fillStyle = '#ffd23a';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-24 + i * 24, -36, 5, 0, Math.PI * 2); ctx.fill(); }
      label = '상점'; col = '#ffd23a';
    } else if (st.kind === 'anvil') {
      ctx.beginPath();
      ctx.moveTo(-30, -34); ctx.lineTo(34, -34); ctx.lineTo(22, -22); ctx.lineTo(10, -22); ctx.lineTo(14, 0); ctx.lineTo(-10, 0); ctx.lineTo(-6, -22); ctx.lineTo(-22, -22); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,120,40,${(0.5 + 0.3 * Math.sin(t * 0.2)).toFixed(3)})`;
      ctx.shadowColor = '#f60'; ctx.shadowBlur = 12;
      ctx.fillRect(-26, -36, 50, 2);
      label = '대장간'; col = '#ff9a5a';
    } else if (st.kind === 'altar') {
      ctx.fillRect(-30, -40, 60, 40);
      ctx.fillRect(-38, -46, 76, 8);
      ctx.fillStyle = `rgba(180,92,255,${(0.6 + 0.3 * Math.sin(t * 0.1)).toFixed(3)})`;
      ctx.shadowColor = '#b45cff'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(0, -64, 8 + Math.sin(t * 0.1) * 1.5, 0, Math.PI * 2); ctx.fill();
      label = '저주 제단'; col = '#c890ff';
    }
    ctx.shadowBlur = 0;
    if (Math.abs(p.x - st.x) < 90) {
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      const txt = st.used ? `${label} (사용함)` : `${Input.label('up')}: ${label}`;
      ctx.strokeText(txt, 0, -104);
      ctx.fillStyle = col;
      ctx.fillText(txt, 0, -104);
    }
    ctx.restore();
  },

  // ---------- 아이콘 (방 종류) ----------
  icon(ctx, kind, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = color || '#fff';
    ctx.fillStyle = color || '#fff';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const line = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); };
    switch (kind) {
      case 'start': line([-6, 12, -6, -12]); ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(10, -7); ctx.lineTo(-6, -2); ctx.closePath(); ctx.fill(); break;
      case 'combat': line([-11, 11, 9, -9]); line([11, 11, -9, -9]); line([-11, 4, -4, 11]); line([11, 4, 4, 11]); break;
      case 'elite':
        ctx.beginPath(); ctx.arc(0, 2, 8, 0, Math.PI * 2); ctx.fill();
        line([-6, -4, -12, -13, -2, -7]); line([6, -4, 12, -13, 2, -7]);
        ctx.fillStyle = '#000'; ctx.fillRect(-5, 0, 3, 3); ctx.fillRect(2, 0, 3, 3);
        break;
      case 'curse':
        line([-12, 10, 0, -12, 12, 10, -12, 10]);
        ctx.beginPath(); ctx.ellipse(0, 2, 5, 3, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 2, 1.6, 0, Math.PI * 2); ctx.fill();
        break;
      case 'rest':
        ctx.beginPath(); ctx.moveTo(-7, 8); ctx.quadraticCurveTo(-9, -2, 0, -12); ctx.quadraticCurveTo(9, -2, 7, 8); ctx.closePath(); ctx.fill();
        line([-11, 12, 11, 8]); line([-11, 8, 11, 12]);
        break;
      case 'shop':
        ctx.beginPath(); ctx.moveTo(-9, -4); ctx.quadraticCurveTo(-12, 12, 0, 12); ctx.quadraticCurveTo(12, 12, 9, -4); ctx.closePath(); ctx.fill();
        line([-5, -8, 0, -4, 5, -8]);
        ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('G', 0, 8);
        break;
      case 'forge':
        ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(12, -4); ctx.lineTo(7, 2); ctx.lineTo(3, 2); ctx.lineTo(5, 10); ctx.lineTo(-5, 10); ctx.lineTo(-3, 2); ctx.lineTo(-8, 2); ctx.closePath(); ctx.fill();
        line([2, -8, 10, -14]);
        break;
      case 'boss':
        ctx.beginPath(); ctx.moveTo(-12, 8); ctx.lineTo(-12, -8); ctx.lineTo(-6, 0); ctx.lineTo(0, -12); ctx.lineTo(6, 0); ctx.lineTo(12, -8); ctx.lineTo(12, 8); ctx.closePath(); ctx.fill();
        break;
      case 'stairs':
        line([-12, 10, -4, 10, -4, 2, 4, 2, 4, -6, 12, -6]);
        line([0, -12, 6, -12]);
        break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  // 골드 표시 (동전 + 숫자)
  drawGold(ctx, x, y, v, align, color) {
    ctx.save();
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    const txt = String(Math.floor(v)), w = ctx.measureText(txt).width + 16;
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    ctx.fillStyle = '#ffd860';
    ctx.shadowColor = '#ffb000';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(x0 + 6, y - 4, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#7a5a10';
    ctx.fillRect(x0 + 5, y - 7, 2, 6);
    ctx.textAlign = 'left';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(txt, x0 + 15, y + 1);
    ctx.fillStyle = color || '#ffe9a0';
    ctx.fillText(txt, x0 + 15, y + 1);
    ctx.restore();
  },

  // ---------- 지도 (M) ----------
  drawMap(ctx, game) {
    const V = CONFIG.view, fl = game.floor, F = game.floorCfg;
    if (!fl) return;
    const t = Game.frame || 0;
    ctx.save();
    ctx.fillStyle = 'rgba(4,4,8,0.96)';
    ctx.fillRect(0, 0, V.width, V.height);
    Menu.text(ctx, `${game.floorIndex + 1}층 · ${F.name}`, 40, 50, 'bold 24px "Segoe UI", sans-serif', '#fff', 'left', '#3ff');
    Menu.text(ctx, `방 ${game.room.index + 1} / ${fl.length}`, 40, 74, '13px "Segoe UI", sans-serif', 'rgba(255,255,255,0.6)', 'left');
    this.drawGold(ctx, V.width - 40, 50, game.gold, 'right');
    const L = fl.length, x0 = 90, x1 = V.width - 90;
    const pos = (nd) => {
      const n = fl.layers[nd.layer].length;
      return { x: x0 + (x1 - x0) * nd.layer / (L - 1), y: 270 + (nd.slot - (n - 1) / 2) * 92 };
    };
    const cur = game.room.node;
    // 연결선
    for (const layer of fl.layers) for (const a of layer) for (const b of a.next) {
      const pa = pos(a), pb = pos(b);
      const fromCur = a === cur && game.room.cleared;
      const walked = a.visited && b.visited;
      ctx.strokeStyle = walked ? 'rgba(120,255,255,0.8)' : fromCur ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = walked ? 3 : fromCur ? 2 : 1;
      if (fromCur && !walked) ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    // 방
    for (const layer of fl.layers) for (const nd of layer) {
      const p = pos(nd), RD = CONFIG.rooms[nd.kind];
      const past = nd.layer < cur.layer && !nd.visited;
      const isCur = nd === cur;
      const option = cur.next.indexOf(nd) >= 0 && game.room.cleared;
      const r = isCur ? 22 : 18;
      ctx.globalAlpha = past ? 0.25 : 1;
      ctx.fillStyle = nd.visited ? 'rgba(40,60,70,0.95)' : 'rgba(20,20,28,0.95)';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = isCur ? '#7ff' : RD.color;
      ctx.lineWidth = isCur ? 3 : option ? 2 : 1.2;
      if (isCur || option) { ctx.shadowColor = isCur ? '#3ff' : RD.color; ctx.shadowBlur = isCur ? 14 + 4 * Math.sin(t * 0.15) : 8; }
      ctx.stroke();
      ctx.shadowBlur = 0;
      this.icon(ctx, nd.kind, p.x, p.y, 15, RD.color);
      if (option || isCur) Menu.text(ctx, isCur ? '현재' : RD.name, p.x, p.y + r + 16, 'bold 11px "Segoe UI", sans-serif', isCur ? '#7ff' : RD.color);
      ctx.globalAlpha = 1;
    }
    // 범례
    const kinds = ['combat', 'elite', 'curse', 'rest', 'shop', 'forge', 'boss'];
    let lx = 70;
    for (const k of kinds) {
      const RD = CONFIG.rooms[k];
      this.icon(ctx, k, lx, V.height - 52, 12, RD.color);
      Menu.text(ctx, RD.name, lx + 14, V.height - 48, '12px "Segoe UI", sans-serif', 'rgba(255,255,255,0.75)', 'left');
      lx += 24 + ctx.measureText(RD.name).width + 30;
    }
    Menu.text(ctx, `${Input.label('map')} / ${Input.label('back')}: 닫기   방을 클리어하면 오른쪽 끝의 문 중 하나로 들어간다`, V.width / 2, V.height - 18, '11px "Segoe UI", sans-serif', 'rgba(255,255,255,0.45)');
    ctx.restore();
  },
};

'use strict';
// 스타일 랭크 (DMC 방식): D → C → B → A → S → SS → SSS
//  - 다양한 기술을 섞으면 많이 오르고, 같은 기술 반복은 덜 오름
//  - 공중 콤보 / 퍼펙트 패링 / 회피 직후 반격 / 처형은 보너스
//  - 피격 시 크게 하락, 가만히 있으면 서서히 하락
// 수치는 config.js 의 style

const Style = {
  points: 0,
  rank: -1,            // -1 = 아직 랭크 없음
  maxRank: -1,         // 이번 방(웨이브)에서의 최고 랭크
  idle: 0,             // 마지막 득점 후 경과
  history: [],         // 최근 쓴 기술
  dodgeTimer: 0,       // 회피 직후 반격 보너스 남은 시간
  anim: 0,             // 랭크 업 연출
  downAnim: 0,         // 랭크 다운 연출
  feed: [],            // 보너스 문구 { text, color, life }

  reset() {
    this.points = 0;
    this.rank = -1;
    this.maxRank = -1;
    this.idle = 0;
    this.history.length = 0;
    this.dodgeTimer = 0;
    this.anim = 0;
    this.downAnim = 0;
    this.feed.length = 0;
  },

  rankOf(points) {
    if (points <= 0) return -1;
    const R = CONFIG.style.ranks;
    let r = 0;
    for (let i = 0; i < R.length; i++) if (points >= R[i].need) r = i;
    return r;
  },

  // 현재 랭크 안에서의 게이지 진행도 (0~1)
  gauge() {
    const S = CONFIG.style, R = S.ranks;
    if (this.rank < 0) return 0;
    const lo = R[this.rank].need;
    const hi = this.rank + 1 < R.length ? R[this.rank + 1].need : S.max;
    return Math.max(0, Math.min(1, (this.points - lo) / (hi - lo)));
  },

  setPoints(p) {
    const S = CONFIG.style;
    this.points = Math.max(0, Math.min(S.max, p));
    const r = this.rankOf(this.points);
    if (r > this.rank) {
      this.anim = S.rankUpAnim;
      if (this.rank >= 0 || r > 0) Sound.play('rankUp');
    } else if (r < this.rank) {
      this.downAnim = 16;
    }
    this.rank = r;
    if (r > this.maxRank) this.maxRank = r;
  },

  gain(n) {
    this.idle = 0;
    this.setPoints(this.points + n);
  },

  pushFeed(text, color) {
    this.feed.unshift({ text, color: color || '#fff', life: CONFIG.style.feedLife });
    if (this.feed.length > 4) this.feed.length = 4;
  },

  // ---------- 득점 이벤트 ----------
  // 기술 적중. id: 기술 이름, air: 공중 콤보 여부, armor: 슈퍼아머에 맞음
  onHit(id, air, armor) {
    const S = CONFIG.style;
    const base = S.movePoints[id] !== undefined ? S.movePoints[id] : S.defaultPoints;
    // 다양성: 최근에 같은 기술을 몇 번 썼나
    const repeats = this.history.filter((h) => h === id).length;
    let mult = S.repeatMult[Math.min(repeats, S.repeatMult.length - 1)];
    if (repeats === 0 && this.history.length >= 2) mult *= S.freshBonus;
    if (air) mult *= S.airMult;
    if (armor) mult *= S.armorMult;
    this.history.push(id);
    if (this.history.length > S.history) this.history.shift();

    let pts = base * mult;
    if (this.dodgeTimer > 0) {
      pts += S.dodgeCounter;
      this.dodgeTimer = 0;
      this.pushFeed('DODGE COUNTER', '#7ff');
    }
    if (air && repeats === 0) this.pushFeed('AIR', '#9df');
    this.gain(pts);
  },

  onParry(tier, chain) {
    const S = CONFIG.style;
    this.gain(S.parry + S.parryChainBonus * Math.max(0, chain - 1));
    const C = CONFIG.parry.chain;
    this.pushFeed(chain > 1 ? `PARRY ×${chain}` : 'PARRY', C.colors[tier]);
  },

  onClash() {
    this.gain(CONFIG.style.clash);
    this.pushFeed('CLASH', '#ffd860');
  },

  onDodge() {
    const S = CONFIG.style;
    this.dodgeTimer = S.dodgeCounterFrames;
    this.gain(S.dodge);
    this.pushFeed('DODGE', '#7ff');
  },

  onKill() {
    this.gain(CONFIG.style.kill);
  },

  onPostureBreak() {
    this.gain(CONFIG.style.postureBreak);
    this.pushFeed('POSTURE BREAK', '#ff7050');
  },

  // 처형: 대폭 상승 + 최소 N랭크 상승 보장
  onExecution() {
    const S = CONFIG.style, R = S.ranks;
    const target = Math.min(R.length - 1, Math.max(0, this.rank) + S.executionMinRanks);
    const p = Math.max(this.points + S.execution, R[target].need + 1);
    this.idle = 0;
    this.setPoints(p);
    this.pushFeed('EXECUTION', '#ff4a3a');
  },

  // 피격: 크게 하락 (hitDropRanks 만큼 랭크 내려감)
  onPlayerHit() {
    const S = CONFIG.style, R = S.ranks;
    if (this.rank < 0) return;
    const r = this.rank - S.hitDropRanks;
    this.setPoints(r < 0 ? 0 : R[r].need + (this.points - R[this.rank].need) * 0.3);
    this.dodgeTimer = 0;
    this.history.length = 0;
  },

  onGuard() {
    this.setPoints(this.points - CONFIG.style.guardLoss);
  },

  // 방(웨이브) 클리어: 최고 랭크 반환 후 초기화
  clearRoom() {
    const best = this.maxRank;
    this.maxRank = this.rank;
    return best;
  },

  // ---------- 매 스텝 ----------
  // noDecay: 처형 연출 등 시간이 멈춘 동안 (연출만 진행)
  update(noDecay) {
    const S = CONFIG.style;
    if (this.anim > 0) this.anim--;
    if (this.downAnim > 0) this.downAnim--;
    if (this.dodgeTimer > 0) this.dodgeTimer--;
    for (let i = this.feed.length - 1; i >= 0; i--) if (--this.feed[i].life <= 0) this.feed.splice(i, 1);
    // 가만히 있으면 서서히 하락
    if (noDecay) return;
    if (++this.idle > S.decayDelay && this.points > 0) {
      this.setPoints(this.points - (S.decayBase + S.decayPerRank * Math.max(0, this.rank)));
    }
  },
};

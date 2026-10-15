'use strict';
// Web Audio API 로 직접 합성하는 효과음 (외부 파일 없음)

const Sound = {
  ctx: null,
  master: null,
  noiseBuf: null,
  volume: 0.5,

  // 브라우저 정책상 첫 키 입력 이후에 생성
  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // 잔향: 지수적으로 사라지는 노이즈로 만든 임펄스 응답 (금속음 울림용)
    const irLen = Math.floor(this.ctx.sampleRate * 1.8);
    const ir = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const b = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbOut = this.ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut);
    this.reverbOut.connect(this.master);
  },

  // 금속성 울림: 비정수배 배음 여러 개 + 잔향 (wet: 잔향으로 보내는 양)
  _metal(base, dur, gain, wet, partials) {
    const ratios = partials || [1, 1.48, 2.17, 2.93, 3.81];
    ratios.forEach((r, i) => {
      this._tone(dur * (1 - i * 0.12), i % 2 ? 'sine' : 'triangle', base * r, base * r * 0.995, gain / (1 + i * 0.6), 0, wet);
    });
  },

  // 노이즈 버스트 (필터 스윕)
  _noise(dur, type, f0, f1, gain, q, wet) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    if (wet && this.reverb) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.reverb); }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  },

  // 음정 있는 톤 (피치 스윕)
  _tone(dur, type, f0, f1, gain, delay, wet) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    if (wet && this.reverb) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.reverb); }
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'swing':
        this._noise(0.09, 'bandpass', 2400, 5200, 0.35, 1.2);
        break;
      case 'swingHeavy':
        this._noise(0.18, 'bandpass', 900, 3200, 0.5, 0.9);
        break;
      case 'hit':
        this._noise(0.08, 'lowpass', 3200, 600, 0.6);
        this._tone(0.08, 'square', 220, 90, 0.18);
        break;
      case 'heavyHit':
        this._noise(0.2, 'lowpass', 2200, 200, 0.8);
        this._tone(0.22, 'sine', 140, 40, 0.7);
        break;
      case 'launcher':
        this._noise(0.22, 'bandpass', 500, 3800, 0.45, 0.8);
        break;
      case 'launchHit':
        this._noise(0.14, 'lowpass', 2600, 400, 0.6);
        this._tone(0.2, 'sine', 120, 380, 0.45);
        break;
      case 'slam':
        this._noise(0.4, 'lowpass', 1600, 60, 1.0);
        this._tone(0.4, 'sine', 110, 30, 0.9);
        break;
      case 'bounce':
        this._tone(0.12, 'sine', 160, 60, 0.5);
        break;
      case 'clash':
        this._tone(0.25, 'square', 1900, 1500, 0.12);
        this._tone(0.3, 'triangle', 2900, 2600, 0.12);
        this._noise(0.08, 'highpass', 5000, 3000, 0.4);
        break;
      case 'crit':
        this._tone(0.12, 'triangle', 1400, 900, 0.25);
        break;
      case 'kill':
        this._noise(0.3, 'lowpass', 4000, 150, 0.7);
        this._tone(0.3, 'sawtooth', 300, 40, 0.25);
        break;
      case 'dash':
        this._noise(0.16, 'bandpass', 600, 2400, 0.35, 0.7);
        break;
      case 'jump':
        this._tone(0.08, 'sine', 300, 520, 0.12);
        break;
      case 'land':
        this._noise(0.06, 'lowpass', 600, 100, 0.25);
        break;
      case 'hurt':
        this._noise(0.16, 'lowpass', 1800, 300, 0.6);
        this._tone(0.18, 'sawtooth', 180, 70, 0.3);
        break;
      case 'charge':
        this._tone(0.12, 'triangle', 500, 1000, 0.18);
        break;
      case 'chargeMax':
        this._tone(0.18, 'triangle', 800, 1600, 0.22);
        this._tone(0.18, 'triangle', 1200, 2000, 0.12, 0.05);
        break;
      // ----- 패링 / 가드 / 체간 / 처형 -----
      case 'perfectParry':      // 날카로운 금속음 + 잔향
        this._noise(0.05, 'highpass', 7000, 4000, 0.7, 1, 0.3);
        this._metal(1850, 0.9, 0.22, 0.7);
        break;
      case 'perfectParry2':
        this._noise(0.06, 'highpass', 7000, 4000, 0.8, 1, 0.35);
        this._metal(2100, 1.1, 0.25, 0.8);
        this._tone(0.12, 'square', 700, 350, 0.08);
        break;
      case 'perfectParry3':     // 5회 이상: 더 묵직한 폭발 + 긴 울림
        this._noise(0.08, 'highpass', 7000, 3000, 0.9, 1, 0.4);
        this._metal(2350, 1.4, 0.26, 0.9);
        this._noise(0.35, 'lowpass', 1600, 80, 0.8, 1, 0.3);
        this._tone(0.4, 'sine', 120, 40, 0.6);
        break;
      case 'perfectParryWhite': // 간파: 높고 맑게 길게
        this._noise(0.06, 'highpass', 8000, 5000, 0.8, 1, 0.4);
        this._metal(2900, 1.8, 0.24, 1.0, [1, 1.5, 2, 3, 4.2]);
        this._tone(0.6, 'sine', 180, 60, 0.5);
        break;
      case 'guard':             // 막기: 둔탁한 금속음
        this._noise(0.08, 'bandpass', 2200, 1200, 0.5, 2);
        this._metal(620, 0.3, 0.12, 0.2);
        break;
      case 'guardBreak':
        this._noise(0.3, 'lowpass', 2500, 200, 0.8);
        this._metal(420, 0.6, 0.18, 0.4);
        this._tone(0.35, 'sawtooth', 200, 60, 0.25);
        break;
      case 'postureBreak':      // 체간 붕괴: 징 같은 낮은 울림
        this._metal(160, 1.6, 0.4, 0.8, [1, 2.03, 2.74, 3.6]);
        this._noise(0.25, 'lowpass', 1800, 120, 0.7);
        break;
      case 'teleport':
        this._noise(0.14, 'bandpass', 1200, 6000, 0.4, 2);
        this._tone(0.12, 'sine', 600, 1600, 0.15);
        break;
      case 'execPrep':          // 암전: 낮게 깔리는 울림
        this._tone(0.9, 'sine', 70, 50, 0.5, 0, 0.5);
        this._noise(0.6, 'lowpass', 400, 100, 0.3, 1, 0.5);
        break;
      case 'execSlash':         // 일섬: 아주 날카롭게
        this._noise(0.18, 'highpass', 9000, 2500, 0.9, 1, 0.6);
        this._metal(3200, 0.8, 0.12, 0.9);
        break;
      case 'execSplit':         // 두 동강
        this._noise(0.5, 'lowpass', 3000, 60, 1.0, 1, 0.4);
        this._tone(0.5, 'sine', 140, 30, 0.9);
        this._tone(0.3, 'sawtooth', 300, 50, 0.2);
        break;
      case 'rankUp':            // 랭크 업: 상승 아르페지오
        this._tone(0.1, 'square', 660, 660, 0.08);
        this._tone(0.1, 'square', 880, 880, 0.08, 0.06);
        this._tone(0.18, 'square', 1320, 1320, 0.09, 0.12, 0.3);
        break;
      case 'clear':             // 방 클리어
        this._tone(0.25, 'triangle', 523, 523, 0.18, 0, 0.3);
        this._tone(0.25, 'triangle', 659, 659, 0.18, 0.12, 0.3);
        this._tone(0.5, 'triangle', 784, 784, 0.2, 0.24, 0.5);
        break;
      case 'whoosh':            // 타격 직전 바람 가르는 소리
        this._noise(0.13, 'bandpass', 700, 3200, 0.45, 1.6);
        break;
      case 'whooshHeavy':
        this._noise(0.2, 'bandpass', 380, 1800, 0.6, 1.2);
        break;
      case 'gate':              // 문 잠김: 철창 내려옴
        this._noise(0.25, 'lowpass', 900, 120, 0.7);
        this._metal(240, 0.5, 0.18, 0.4, [1, 2.2, 3.1]);
        break;
      case 'gateOpen':
        this._noise(0.35, 'bandpass', 300, 1200, 0.4, 1.5);
        this._metal(330, 0.4, 0.12, 0.3, [1, 2.2]);
        break;
      case 'spawn':
        this._noise(0.3, 'lowpass', 300, 1500, 0.35);
        this._tone(0.3, 'sawtooth', 90, 180, 0.12);
        break;
      case 'chest':
        this._tone(0.12, 'triangle', 784, 784, 0.15);
        this._tone(0.12, 'triangle', 988, 988, 0.15, 0.08);
        this._tone(0.3, 'triangle', 1318, 1318, 0.18, 0.16, 0.5);
        break;
      case 'bossIntro':
        this._tone(1.2, 'sawtooth', 55, 45, 0.3, 0, 0.6);
        this._tone(1.2, 'sine', 82, 70, 0.3, 0.1, 0.6);
        break;
      case 'bossLand':
        this._noise(0.5, 'lowpass', 1200, 50, 1.0, 1, 0.4);
        this._tone(0.5, 'sine', 70, 30, 0.9);
        break;
      case 'bossRoar':
        this._noise(0.9, 'bandpass', 300, 120, 0.7, 0.8, 0.5);
        this._tone(0.9, 'sawtooth', 110, 60, 0.35, 0, 0.5);
        this._tone(0.9, 'sawtooth', 165, 80, 0.2, 0.05, 0.5);
        break;
      case 'bossWave':
        this._noise(0.25, 'bandpass', 1500, 4000, 0.5, 1.5);
        this._tone(0.2, 'triangle', 900, 400, 0.15);
        break;
      case 'bossCast':
        this._tone(0.6, 'sawtooth', 200, 400, 0.15, 0, 0.5);
        this._noise(0.5, 'bandpass', 400, 1600, 0.3, 2, 0.4);
        break;
      case 'boom':
        this._noise(0.4, 'lowpass', 1800, 60, 0.9, 1, 0.3);
        this._tone(0.35, 'sine', 90, 35, 0.7);
        break;
      case 'bossDeath':
        this._metal(130, 2.2, 0.4, 1.0, [1, 2.03, 2.74, 3.6]);
        this._noise(1.0, 'lowpass', 2500, 50, 0.9, 1, 0.6);
        break;
      case 'telegraphWhite':
        this._tone(0.3, 'sine', 2600, 2600, 0.12, 0, 0.6);
        break;
      case 'telegraphYellow':
        this._tone(0.08, 'triangle', 1300, 1500, 0.09);
        break;
      case 'parryStance':
        this._noise(0.05, 'highpass', 4000, 6000, 0.12);
        break;
      case 'parry':
        this._tone(0.5, 'triangle', 2200, 2100, 0.3);
        this._tone(0.5, 'sine', 3300, 3250, 0.18);
        this._tone(0.25, 'square', 600, 300, 0.12);
        this._noise(0.12, 'highpass', 6000, 3000, 0.5);
        break;
      case 'block':
        this._tone(0.12, 'square', 520, 380, 0.14);
        this._noise(0.08, 'bandpass', 1500, 900, 0.35, 2);
        break;
      case 'armorHit':
        this._tone(0.14, 'square', 340, 260, 0.14);
        this._noise(0.08, 'lowpass', 2500, 800, 0.4);
        break;
      case 'reflect':
        this._tone(0.15, 'triangle', 900, 1800, 0.2);
        break;
      case 'shoot':
        this._noise(0.12, 'bandpass', 3000, 1500, 0.3, 3);
        break;
      case 'rush':
        this._noise(0.35, 'lowpass', 400, 900, 0.5);
        break;
      case 'wallHit':
        this._noise(0.3, 'lowpass', 1200, 80, 0.9);
        this._tone(0.3, 'sine', 90, 35, 0.8);
        break;
      case 'telegraph':
        this._tone(0.07, 'square', 900, 700, 0.06);
        break;
      // ----- 8단계: 무기 / 스킬 / 아이템 -----
      case 'punch':             // 건틀릿 잽: 짧은 바람 + 둔탁
        this._noise(0.06, 'bandpass', 1400, 3000, 0.3, 1.4);
        break;
      case 'punchHeavy':
        this._noise(0.14, 'bandpass', 700, 2400, 0.45, 1);
        this._tone(0.1, 'sine', 180, 70, 0.25);
        break;
      case 'whirl':             // 회오리: 길게 휘감기는 바람
        this._noise(0.5, 'bandpass', 700, 3600, 0.45, 0.8, 0.3);
        this._noise(0.5, 'bandpass', 3600, 900, 0.25, 1.5);
        break;
      case 'swap':              // 무기 교체: 금속 스치는 소리
        this._metal(1300, 0.18, 0.12, 0.4, [1, 2.4, 3.9]);
        this._noise(0.08, 'highpass', 4000, 6000, 0.2);
        break;
      case 'skill':
        this._tone(0.18, 'triangle', 500, 1100, 0.15, 0, 0.4);
        break;
      case 'deny':              // 쿨타임 중
        this._tone(0.08, 'square', 180, 150, 0.08);
        break;
      case 'quake':             // 지면 강타: 묵직한 땅울림
        this._noise(0.5, 'lowpass', 900, 50, 1.0, 0, 0.3);
        this._tone(0.5, 'sine', 80, 30, 0.9);
        break;
      case 'thunder':           // 번개
        this._noise(0.35, 'highpass', 6000, 1200, 0.6, 0, 0.4);
        this._tone(0.3, 'sawtooth', 120, 40, 0.25);
        break;
      case 'pickup':
        this._tone(0.08, 'triangle', 700, 900, 0.15);
        this._tone(0.12, 'triangle', 1050, 1400, 0.13, 0.06);
        break;
      case 'dropRare':          // 영웅 아이템 떨어짐
        this._tone(0.3, 'triangle', 880, 880, 0.12, 0, 0.5);
        this._tone(0.4, 'triangle', 1320, 1320, 0.1, 0.1, 0.5);
        break;
      case 'dropLegend':        // 전설: 화음 + 긴 울림
        this._tone(0.6, 'triangle', 660, 660, 0.14, 0, 0.6);
        this._tone(0.6, 'triangle', 990, 990, 0.12, 0.08, 0.6);
        this._tone(0.8, 'triangle', 1320, 1320, 0.12, 0.16, 0.7);
        this._metal(1760, 0.9, 0.06, 0.8, [1, 2.76]);
        break;
      case 'equip':
        this._metal(900, 0.12, 0.12, 0.2, [1, 2.2]);
        break;
      case 'discard':
        this._noise(0.12, 'lowpass', 1200, 300, 0.3);
        break;
      case 'invOpen':
        this._noise(0.1, 'bandpass', 800, 1600, 0.2);
        this._tone(0.08, 'sine', 400, 600, 0.08);
        break;
      case 'invClose':
        this._tone(0.08, 'sine', 600, 400, 0.08);
        break;
      // ----- 무기 스왑 / 공명 / 무기별 스킬 -----
      case 'ready':             // 스킬 쿨 완료: 짧은 맑은 소리
        this._tone(0.09, 'triangle', 1500, 1500, 0.07, 0, 0.2);
        break;
      case 'resonance':         // 공명 단계 상승
        this._tone(0.25, 'sine', 700, 1050, 0.12, 0, 0.5);
        this._metal(1400, 0.3, 0.06, 0.5, [1, 2.01]);
        break;
      case 'resonanceMax':
        this._tone(0.3, 'sine', 700, 1050, 0.12, 0, 0.6);
        this._tone(0.4, 'sine', 1050, 1400, 0.1, 0.08, 0.6);
        this._metal(2100, 0.6, 0.07, 0.8, [1, 2.01, 3.03]);
        break;
      case 'trinity':           // 무기 3개 한 콤보
        this._tone(0.2, 'triangle', 880, 880, 0.12, 0, 0.5);
        this._tone(0.2, 'triangle', 1108, 1108, 0.11, 0.07, 0.5);
        this._tone(0.4, 'triangle', 1318, 1318, 0.11, 0.14, 0.6);
        break;
      case 'weakHit':           // 약점 타격: 날카로운 금속성 추가음
        this._metal(2600, 0.1, 0.06, 0.2, [1, 1.5]);
        break;
      case 'stance':            // 간파 자세: 칼집 소리 + 긴장된 울림
        this._metal(1800, 0.25, 0.08, 0.4, [1, 2.7]);
        this._tone(0.5, 'sine', 220, 200, 0.08, 0, 0.5);
        break;
      case 'iai':               // 발도: 칼 뽑는 소리
        this._noise(0.12, 'highpass', 3000, 7000, 0.3);
        this._metal(2200, 0.12, 0.08, 0.3, [1, 1.9]);
        break;
      case 'iaiCut':            // 일섬 터짐
        this._noise(0.25, 'bandpass', 5000, 1500, 0.6, 2, 0.4);
        this._tone(0.25, 'sawtooth', 600, 80, 0.15);
        break;
      case 'ironWall':          // 철벽: 묵직한 금속 울림
        this._metal(300, 0.6, 0.18, 0.6, [1, 1.48, 2.17]);
        this._noise(0.2, 'lowpass', 900, 100, 0.6);
        break;
      case 'ironReflect':
        this._metal(500, 0.25, 0.14, 0.4, [1, 1.48]);
        this._noise(0.15, 'lowpass', 1600, 200, 0.5);
        break;
    }
  },
};

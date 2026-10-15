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
  },

  // 노이즈 버스트 (필터 스윕)
  _noise(dur, type, f0, f1, gain, q) {
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
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  },

  // 음정 있는 톤 (피치 스윕)
  _tone(dur, type, f0, f1, gain, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
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
      case 'telegraph':
        this._tone(0.07, 'square', 900, 700, 0.06);
        break;
    }
  },
};

'use strict';
// 키보드 입력. 고정 타임스텝마다 update() 를 불러서
// pressed / released 는 정확히 한 스텝 동안만 true 가 된다.

const Input = {
  down: Object.create(null),
  pressed: Object.create(null),
  released: Object.create(null),
  _pressQ: Object.create(null),
  _releaseQ: Object.create(null),
  onFirstInput: null,

  // 게임 동작 → 키 코드
  map: {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    down: ['KeyS', 'ArrowDown'],
    up: ['KeyW', 'ArrowUp'],
    jump: ['Space'],
    light: ['KeyJ'],
    heavy: ['KeyK'],
    dash: ['KeyL'],
    parry: ['Semicolon'],
    skill1: ['KeyU'],
    skill2: ['KeyI'],
    swap: ['KeyQ'],
    inventory: ['Tab'],
    pause: ['Escape', 'KeyP'],
    restart: ['KeyR'],
    debug: ['KeyH'],
  },

  init() {
    const block = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    window.addEventListener('keydown', (e) => {
      if (block.has(e.code)) e.preventDefault();
      if (this.onFirstInput) { this.onFirstInput(); this.onFirstInput = null; }
      if (e.repeat) return;
      this.down[e.code] = true;
      this._pressQ[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.down[e.code] = false;
      this._releaseQ[e.code] = true;
    });
    // 포커스를 잃으면 눌린 키를 모두 뗀 것으로 처리
    window.addEventListener('blur', () => {
      for (const k in this.down) if (this.down[k]) this._releaseQ[k] = true;
      this.down = Object.create(null);
    });
  },

  // 고정 스텝 시작 시 호출
  update() {
    this.pressed = this._pressQ;
    this.released = this._releaseQ;
    this._pressQ = Object.create(null);
    this._releaseQ = Object.create(null);
  },

  isDown(action) {
    const codes = this.map[action];
    for (let i = 0; i < codes.length; i++) if (this.down[codes[i]]) return true;
    return false;
  },
  isPressed(action) {
    const codes = this.map[action];
    for (let i = 0; i < codes.length; i++) if (this.pressed[codes[i]]) return true;
    return false;
  },
  isReleased(action) {
    const codes = this.map[action];
    for (let i = 0; i < codes.length; i++) if (this.released[codes[i]]) return true;
    return false;
  },
  // -1 / 0 / 1
  axisX() {
    return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
  },
};

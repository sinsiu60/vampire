'use strict';
// 키보드 + 마우스 입력. 키 설정은 config.js 의 KEYBINDS.
// 고정 타임스텝마다 update() 를 불러서
// pressed / released 는 정확히 한 스텝 동안만 true 가 된다.
// 마우스 버튼은 'Mouse0'(좌) / 'Mouse1'(휠) / 'Mouse2'(우) 코드로 키보드와 똑같이 취급한다.
// 누른 순간은 이벤트 타임스탬프(performance.now 기준 ms)로 기록 → pressTime() 으로 정확한 시각 비교 (패링 판정용)

const Input = {
  down: Object.create(null),
  pressed: Object.create(null),
  released: Object.create(null),
  _pressQ: Object.create(null),
  _releaseQ: Object.create(null),
  onFirstInput: null,
  map: KEYBINDS,

  init() {
    window.addEventListener('keydown', (e) => {
      // 게임에 쓰는 키는 브라우저 기본 동작(스크롤, 포커스 이동, 도움말 등)을 막음.
      // 단, Ctrl/Alt/Meta 조합(새로고침 등)은 그대로 둔다.
      if (this._isBound(e.code) && !e.ctrlKey && !e.altKey && !e.metaKey) e.preventDefault();
      this._firstInput();
      if (e.repeat) return;
      this._press(e.code, this._stamp(e));
    });
    window.addEventListener('keyup', (e) => this._release(e.code));

    window.addEventListener('mousedown', (e) => {
      this._firstInput();
      const code = 'Mouse' + e.button;
      if (this._isBound(code)) e.preventDefault();   // 휠클릭 자동 스크롤 등 방지
      this._press(code, this._stamp(e));
    });
    window.addEventListener('mouseup', (e) => this._release('Mouse' + e.button));
    // 우클릭 시 브라우저 메뉴가 뜨지 않게
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // 포커스를 잃으면 눌린 키를 모두 뗀 것으로 처리
    window.addEventListener('blur', () => {
      for (const k in this.down) if (this.down[k]) this._releaseQ[k] = true;
      this.down = Object.create(null);
    });
  },

  _firstInput() {
    if (this.onFirstInput) { this.onFirstInput(); this.onFirstInput = null; }
  },
  // 이벤트 발생 시각 (ms, performance.now 와 같은 기준)
  _stamp(e) {
    const t = e && e.timeStamp;
    return t > 0 && t < performance.now() + 1000 ? t : performance.now();
  },
  _press(code, t) {
    if (this.down[code]) return;
    this.down[code] = true;
    if (this._pressQ[code] === undefined) this._pressQ[code] = t !== undefined ? t : performance.now();
  },
  _release(code) {
    this.down[code] = false;
    this._releaseQ[code] = true;
  },
  _isBound(code) {
    for (const a in this.map) if (this.map[a].indexOf(code) >= 0) return true;
    return false;
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
    for (let i = 0; i < codes.length; i++) if (this.pressed[codes[i]] !== undefined) return true;
    return false;
  },
  // 이번 스텝에 눌린 키의 실제 누른 시각 (ms). 없으면 null
  pressTime(action) {
    const codes = this.map[action];
    let t = null;
    for (let i = 0; i < codes.length; i++) {
      const v = this.pressed[codes[i]];
      if (v !== undefined && (t === null || v < t)) t = v;
    }
    return t;
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

  // ---------- 화면 표시용 키 이름 (도움말이 KEYBINDS 를 따라가도록) ----------
  _names: {
    Mouse0: '좌클릭', Mouse1: '휠클릭', Mouse2: '우클릭',
    Space: '스페이스', ShiftLeft: 'Shift', ShiftRight: 'Shift',
    ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
    Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  },
  keyName(code) {
    if (this._names[code]) return this._names[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  },
  // 동작에 묶인 키 이름 (중복 제거, '/' 로 연결). 예: label('dash') → 'Shift'
  label(action) {
    const names = [];
    for (const c of this.map[action] || []) {
      const n = this.keyName(c);
      if (names.indexOf(n) < 0) names.push(n);
    }
    return names.join('/');
  },
};

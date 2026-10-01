'use strict';
// 키보드 / 마우스 입력

const Input = {
  keys: Object.create(null),
  mouseX: 0,
  mouseY: 0,

  init(canvas, onKeyDown, onClick, onMouseMove) {
    window.addEventListener('keydown', (e) => {
      // 방향키/스페이스로 페이지가 스크롤되지 않게
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!e.repeat) onKeyDown(e.code);
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    // 창 포커스를 잃으면 키가 눌린 채로 남지 않도록
    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      onMouseMove(this.mouseX, this.mouseY);
    });
    canvas.addEventListener('mousedown', (e) => {
      const r = canvas.getBoundingClientRect();
      onClick(e.clientX - r.left, e.clientY - r.top);
    });
  },

  // 정규화된 이동 방향 벡터 (out 에 기록)
  axis(out) {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y -= 1;
    if (k.KeyS || k.ArrowDown) y += 1;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    out.x = x;
    out.y = y;
    return out;
  },
};

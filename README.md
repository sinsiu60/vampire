# Night Survivors

뱀파이어 서바이버 스타일의 2D 탑뷰 생존 게임. 순수 HTML + JavaScript(Canvas), 외부 라이브러리/이미지 없음.

## 실행
`index.html` 을 브라우저(Chrome/Edge/Firefox)로 더블클릭해서 열면 됩니다. 서버 불필요.

## 조작
| 키 | 동작 |
|---|---|
| WASD / 방향키 | 이동 (공격은 자동) |
| 1 / 2 / 3 또는 클릭 | 레벨업 카드 선택 |
| ESC | 일시정지 / 계속 |
| R | 재시작 |
| F | FPS·적 수 표시 |

## 파일 구조
- `js/config.js` — **모든 밸런스 수치** (스폰 곡선, 적/보스 능력치, 무기 레벨표, 패시브, 경험치 곡선)
- `js/utils.js` — 오브젝트 풀, 공간 분할 해시 그리드, 곡선 보간
- `js/main.js` — 게임 루프/상태/카메라
- `js/player.js`, `js/enemy.js`, `js/weapon.js`, `js/pickup.js`, `js/upgrade.js`, `js/effects.js`, `js/ui.js`, `js/input.js`

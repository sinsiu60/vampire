# 공백 (BLANK) — Godot 4

웹 프로토타입(`../parry/`)으로 검증한 패링 특화 원히트 액션을 Godot 4.x(GDScript)로 다시 만드는 프로젝트. 시우 공방.

## 열기 / 실행
1. Godot **4.5 이상** (TileMapLayer 사용 → 최소 4.3, 4.5.1 에서 확인)으로 `blank/project.godot` 를 연다.
2. 처음 열면 에디터가 `art/`, `sounds/` 를 자동으로 임포트한다 (`.godot/` 캐시는 git 에 넣지 않음).
3. F5 (프로젝트 실행) → `scenes/Main.tscn`.

## 프로젝트 설정 (project.godot)
| 항목 | 값 |
|---|---|
| 기본 뷰포트 | 480 × 270 |
| 창 크기 | 1920 × 1080 (window override) |
| Stretch | Mode = `viewport`, Aspect = `keep`, Scale Mode = `integer` (정수 배율 — 프로토타입과 같게 픽셀이 고르게) |
| 텍스처 필터 | Nearest |
| 물리 틱 | 60 |
| 픽셀 스냅 | 2D Transform / Vertex 모두 켬 |
| 렌더러 | Compatibility (2D 픽셀 게임에 충분, 저사양·웹 대응) |
| 배경색 | `#05060d` |

입력 맵 (Project Settings → Input Map 에서 바꿀 수 있음)

| 액션 | 키 |
|---|---|
| `move_left` / `move_right` | A / D (←/→) |
| `jump` | Space |
| `slash` | 마우스 왼쪽 |
| `restart` | R |
| `mute` | M |
| `menu` | ESC |

## 구조
```
blank/
  project.godot
  scripts/autoload/Config.gd   모든 수치 (프로토타입 CONFIG 를 그대로 옮김)
  scripts/Main.gd              방 + 플레이어 배치, 카메라 한계, R 재시작
  scripts/Player.gd            이동·가변 점프·코요테·버퍼, 흰 실루엣 그리기
  scripts/Room.gd              TileMapLayer 방, 시작 위치
  scenes/Main.tscn  Player.tscn  Room.tscn
  tiles/terrain.tres           TileSet: (0,0) 지형 윗면, (1,0) 지형 속, (2,0) 일방향 발판
  art/tiles.png                8×8 타일 3장
  sounds/*.wav                 gun_fire, parry_chang, slowmo_in, slowmo_loop, time_return, kill_sound
```
- `Config.gd` 이름 규칙: 프로토타입에서 대문자였던 이름(`AIM_TIME` 등)은 그대로, camelCase 는 snake_case (`runSpeed` → `run_speed`).
- 방은 `Room.tscn` 의 `Terrain` 레이어에 에디터에서 직접 칠해서 고칠 수 있다. 타일 8px, 테스트 방 120 × 34 칸.
  웹 프로토타입 좌표를 8px 격자에 맞추느라 바닥 윗면은 238 → 240, 발판 A/C 는 190/188 → 192, B 는 146 → 144 로 몇 px 옮겼다
  (점프 최대 높이 55px 안에 모두 닿음).

## 단계
| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 프로젝트 설정 + Config + 플레이어 이동·점프 + 테스트 방 + R 재시작 | ✅ |
| 2 | 마우스 방향 베기 + 돌진 + 헛스윙 잠금, 반달 베기 궤적 | |
| 3 | TimeManager(히트스톱·슬로우, 실제 시간 타이머) + Audio + 근접 적 + 원히트 사망 | |
| 4 | 히트스캔 총잡이 (조준선 + 줄어드는 원 + 판정 창 띠 + 발사 간격) + 타이밍 패링 | |
| 5 | 패링 슬로우 시퀀스 (time_return 길이에 맞춘 처치) + 화면 효과 셰이더 (채도·비네트·섬광) | |
| 6 | 16프레임 킬 연출, 빛줄기, 화면 흔들림, 피·파편·자국, 두 조각 | |
| 7 | 배경 시차, 스캔라인 셰이더, 머플러·잔상, "시우 공방" 로고, 옵션 메뉴, 디버그 키 | |

### 1단계 확인 (Godot 4.5.1, 60fps 물리)
| 항목 | 결과 | 프로토타입 |
|---|---|---|
| 달리기 최고 속도 | 125 px/s | 125 |
| 꾹 누른 점프 높이 | 55.1 px | 55 |
| 짧게 누른 점프 | 9~38 px (누른 시간에 따라) | 18~41 |
| 코요테 타임 | 발판을 벗어난 지 4프레임 → 점프, 9프레임 → 안 됨 (0.1초 = 6프레임) | 같음 |
| 점프 버퍼 | 착지 4프레임 전 입력 → 착지 즉시 점프, 9프레임 전 → 안 됨 | 같음 |
| 일방향 발판 | 아래에서 통과, 위에 착지 | 같음 |
| R 재시작 | 다음 프레임에 방 처음부터 | 같음 |

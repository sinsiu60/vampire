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
  scripts/autoload/TimeManager.gd  Engine.time_scale 로 히트스톱·슬로우, 실제 시간 틱(real_frames / real_time), 월드 시간
  scripts/autoload/Audio.gd    효과음 재생 (파일 6종 + 합성음), 실제 시간 페이드, 음소거
  scripts/audio/Synth.gd       파일 없는 소리(휘두르기·사망·클리어)를 시작할 때 PCM 으로 합성
  scripts/enemies/Enemy.gd     적 공통: 중력·충돌·발판 끝 멈춤·실루엣(림 라이트) 그리기
  scripts/enemies/EnemyMelee.gd  근접 적: 추적 → 0.4초 예고(무기 빨간 점멸) → 내딛으며 베기 → 경직
  scripts/Main.gd              배치·카메라, 전투 판정(근접 패링·직접 베기·피격), 사망·CLEAR·R 재시작
  scripts/Player.gd            이동·가변 점프·코요테·버퍼, 마우스 방향 베기·돌진·헛스윙 잠금, 칼 판정, 흰 실루엣·반달 궤적
  scripts/Room.gd              TileMapLayer 방, 시작 위치
  scripts/DrawUtil.gd          공용 그리기 (초승달/반달 궤적)
  scripts/Crosshair.gd         하늘색 조준점 (OS 커서 숨김)
  scenes/Main.tscn  Player.tscn  Room.tscn  EnemyMelee.tscn   (적 배치는 Room.tscn 의 Enemies 아래)
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
| 2 | 마우스 방향 베기 + 돌진 + 헛스윙 잠금, 반달 베기 궤적, 조준점 | ✅ |
| 3 | TimeManager(히트스톱·슬로우, 실제 시간 타이머) + Audio + 근접 적 + 근접 패링 + 원히트 사망 + CLEAR | ✅ |
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

### 2단계 확인
| 항목 | 결과 | 프로토타입 |
|---|---|---|
| 땅에서 베기 돌진 | 처음 5프레임 5.5px 씩 (330px/s) → 남은 속도 35% 로 미끄러짐, 총 32.2px | 33.6px (*) |
| 베는 방향으로 몸 돌림 | 오른쪽/왼쪽 베기 후 facing 1 / -1 | 같음 |
| 공중 위쪽 돌진 | 첫 번째 30px 상승, 착지 전 두 번째는 위로 안 솟음 | 같음 |
| 연타 (헛스윙) | 베기 사이 28프레임 ≈ 0.45초 (판정 0.15초 + 잠금 0.3초) | 같음 |
| 연타 (패링·처치에 쓰인 베기) | 20프레임 ≈ 0.3초 쿨타임 | 같음 |
| 반달 궤적 | 3프레임 꽉 찬 채 → 0.09초 동안 가늘어지며 사라짐 | 같음 |
| 칼 판정 | 베는 방향 20px 앞 = 맞음, 뒤 20px = 안 맞음, 앞쪽 적 크기 사각형 = 맞음 | 같음 |

(*) 프로토타입은 돌진 중 바닥 접촉이 꺼져 있어서 돌진이 끝난 첫 프레임만 공중 감속(450)을 씀 → 1.4px 더 미끄러짐.
의도한 규칙이 아니라 부작용이라 Godot 쪽은 바닥 감속(1800)을 바로 씀.

- 베기 효과음(합성 '쉭')은 3단계 Audio 와 함께 들어감.
- 근접 패링 판정 창(`in_parry_window`)·칼 판정(`slash_hits`, `slash_hits_rect`)은 3단계 근접 적이 사용.

### 3단계 확인
| 항목 | 결과 | 프로토타입 |
|---|---|---|
| 히트스톱 `hitstop(6)` | 정확히 6틱 월드 정지 후 time_scale 1.0 복귀 (언제 호출해도) | 같음 |
| 근접 적 | 추적 → 예고 25틱(0.4초) → 공격 → 플레이어 즉사 | 같음 |
| 플레이어 사망 | 사망음 + 히트스톱 4틱(0.06초) + "R — 재시작" | 같음 |
| 직접 베기 | 예고 시작 직후 베면 적 즉사 (휘두르기음 + 처치음) | 같음 |
| 근접 패링 | 예고 마지막 0.1초 안에 베면 패링음 + 히트스톱 6틱 + 적 즉사, 플레이어 생존 | 같음 |
| 히트스톱 중 클릭 | 멈춘 동안엔 안 베고, 풀리자마자 베기 | 같음 |
| 두 명 처치 | CLEAR + 클리어음 | 같음 |
| 효과음 | `time_return.wav` 길이 0.935초 읽음, `slowmo_loop` 반복 재생 설정, 합성음 휘두르기 0.16초·사망 0.4초·클리어 0.49초 | 같음 |

- **시간 처리**: 히트스톱·슬로우는 `Engine.time_scale`. time_scale 이 0 이어도 물리 틱은 실제 시간으로 계속 오고 delta 만 0
  (Godot 4.5.1 에서 확인) → 이때 게임 노드는 `TimeManager.frozen` 을 보고 입력만 모아 둔다. 실제 시간 연출은 `TimeManager.real_frames`.
- **효과음**: Godot 오디오는 time_scale 영향을 받지 않아 슬로우·히트스톱 중에도 실제 시간으로 재생. 페이드는 `Tween.set_ignore_time_scale`.
- `slowmo_loop.wav` 는 임포트 설정에서 Loop Mode = Forward.
- 처치 연출(16프레임 킬 스톱·두 조각·피·빛줄기)은 6단계 — 지금은 적이 바로 사라짐.

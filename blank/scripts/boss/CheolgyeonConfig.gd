class_name CheolgyeonConfig
extends RefCounted
## 보스 "철견" 수치 전부 (1장, 하운드 제1 사냥개 부대장). 시간은 초 — 따로 적지 않으면 월드 시간
## (슬로우 · 히트스톱이면 같이 느려짐). 프레임 수는 60fps 물리 틱 기준.
## 철견은 걷지 않는다: 대시 · 슬라이드 · 점프로만 움직임. 예고는 짧고 선명하게 (포즈 · 섬광 · 소리).

# ---------------------------------------------------------------- 기본
const NAME := "철견"
const TITLE := "하운드 제1 사냥개"
const HP := 9                          ## 체력 칸 9개 — 반격 베기 명중마다 1
const W := 20.0                        ## 몸통 판정 너비 (px)
const H := 54.0                        ## 몸통 판정 높이 (모자 끝까지 약 56px)
const FIRST_DELAY := 0.6               ## 방에 들어온 뒤 첫 이동까지

# ---------------------------------------------------------------- 이동 (걷기 없음)
const DASH_PREP := 0.15                ## 대시 전 웅크림 예고
const DASH_SPEED := 450.0              ## 대시 속도 (px/초)
const DASH_GHOST_EVERY := 0.04         ## 대시 잔상 간격
const DASH_STOP := 0.06                ## 대시가 끝나고 멈추는 시간 (속도를 0 으로)
const SLIDE_SPEED := 250.0             ## 슬라이드 속도
const SLIDE_DUST_EVERY := 0.03         ## 슬라이드 먼지 간격
const MOVE_MAX := 0.4                  ## 패턴 사이 이동 하나의 최대 시간 (이보다 멀면 거기까지만)
const JUMP_PREP := 0.1                 ## 점프 전 웅크림
const JUMP_TIME := 0.38                ## 점프 체공 시간 (포물선)
const JUMP_ARC := 26.0                 ## 포물선 꼭대기 추가 높이 (오르는 높이에 더함)
const LAND_TIME := 0.12                ## 착지 웅크림
const MOVE_GAP := 0.3                  ## (1단계 이동 데모) 이동 사이 정지
const DEMO_NEAR := 54.0                ## (데모) 다가갈 때 플레이어 앞 거리
const DEMO_PASS := 70.0                ## (데모) 슬라이드로 지나쳐 갈 거리
const DEMO_BACK := 110.0               ## (데모) 뒤로 빠지는 대시 거리
const EDGE := 20.0                     ## 방 양 끝 벽에서 이만큼 안쪽까지만 이동

# ---------------------------------------------------------------- 휘청 → 반격 (핵심)
const STAGGER_TIME := 0.7              ## 휘청 지속 — 이 안에 베면 반격 베기
const STAGGER_BLINK := 0.06            ## 휘청 중 흰 테두리 깜빡임 주기 (켜짐/꺼짐 각각)
const COUNTER_LUNGE_RANGE := 120.0     ## 이 안이면 플레이어가 철견에게 자동 돌진하며 벰
const COUNTER_LUNGE_TIME := 0.08       ## 자동 돌진 시간
const COUNTER_STOP := 15.0             ## 돌진이 멈추는 거리 (철견 몸 중심에서)
const COUNTER_HITSTOP := 8             ## 반격 명중 히트스톱 (프레임)
const COUNTER_SHAKE := 6.0             ## 반격 명중 화면 흔들림 (px)
const COUNTER_SHAKE_TIME := 0.25
const COUNTER_KNOCKBACK := 30.0        ## 반격 명중 철견 넉백 거리 (px)
const KNOCKBACK_TIME := 0.15           ## 넉백 시간 (감속하며 미끄러짐)
const COAT_SHARDS := 7                 ## 코트 조각 파편 수

# ---------------------------------------------------------------- 막기 (휘청 아닐 때 베면)
const BLOCK_TIME := 0.22               ## 막는 자세 유지
const BLOCK_PLAYER_STUN := 0.2         ## 플레이어 경직
const BLOCK_PUSH := 140.0              ## 플레이어가 밀려나는 속도 (px/초)
const BLOCK_PITCH := 1.15              ## boss_armor 피치

# ---------------------------------------------------------------- 패링 (이 보스전)
const PARRY_HITSTOP := 5               ## 일반 패링 (콤보 중간 공격) 히트스톱
const PARRY_SLOW := 0.5                ## 일반 패링 뒤 시간 속도
const PARRY_SLOW_TIME := 0.1           ## 그 지속 (실제 시간)
## 풀 패링 슬로우 시퀀스 (slowmo_in → loop → time_return) 는 페이즈 전환 · 피날레에만 (3·4단계)

# ---------------------------------------------------------------- 키포즈 (예고 정지 → 1프레임 전환 → 여운 정지)
const SNAP_GHOST_TIME := 0.16          ## 전환 순간 남는 이전 포즈 잔상 수명
const SNAP_GHOST_ALPHA := 0.55
const SMEAR_FRAMES := 1                ## 스미어(이전·다음 포즈를 잇는 덩어리)가 보이는 틱 수
const SMEAR_ALPHA := 0.45
const SMEAR_MIN_MOVE := 3.0            ## 이보다 덜 움직인 부위는 스미어 없음 (px)
const GHOST_TIME := 0.14               ## 대시 잔상 수명
const GHOST_ALPHA := 0.45
const BLEND_MOVE := 0.06               ## 이동 포즈끼리 (공격이 아닌 것) 부드럽게 바꾸는 시간

# ---------------------------------------------------------------- 색 (몸에 빨강 · 노랑 · 흰색 · 보라 금지)
const COL_BODY := Color("#121a33")     ## 몸통 · 머리
const COL_COAT := Color("#0b1124")     ## 코트 자락
const COL_LIMB_FRONT := Color("#1a2445")
const COL_LIMB_BACK := Color("#0e152c")
const COL_HAT := Color("#0a0f1f")
const COL_GUN := Color("#2b3552")
const COL_RIM := Color("#7aa6e6")      ## 옅은 파란 림라이트 (실루엣 테두리 1px)
const COL_RIM_FLASH := Color("#ffffff") ## 휘청 중 깜빡이는 흰 테두리
const COL_GHOST := Color("#7aa6e6")    ## 잔상 · 스미어 색
const COL_DUST := [Color("#3a4058"), Color("#545a72"), Color("#2a2f44")]

# ---------------------------------------------------------------- 배경음
const RAIN_VOL := 0.35                 ## 보스방 빗소리 (Config.audio.SFX_RAIN 과 같게)
const RAIN_VOL_STORM := 0.6            ## 페이즈 2 폭우 (3단계)
const RAIN_FADE := 0.6                 ## 빗소리 페이드인 (실제 시간)

# ---------------------------------------------------------------- 처치 뒤 (4단계 피날레 전까지 임시: 일반 킬 연출)
const KILL_SHAKE_MUL := 1.5
const RADIO_DELAY := 1.0               ## 처치 → 잡음 무전 (실제 시간)
const RADIO_TEXT := "철견 처리 확인. ...공백, 너 방금 웃었어?"
const RADIO_TIME := 3.2
const EXIT_DELAY := 2.0                ## 처치 → 출구 문 열림

# ---------------------------------------------------------------- 포즈 (CheolgyeonBody.tscn 의 AnimationPlayer 애니메이션 이름)
## F9 포즈 뷰어 순서 = 숫자 키 1 ~ 0, Shift+1 ~ 6
const POSES := ["idle", "dash", "slide", "whip_windup", "whip_smash", "kick_ready", "kick", "jump", "air_fire", "land",
	"duel", "draw_fire", "aim_up", "stagger", "roar", "crouch", "block"]

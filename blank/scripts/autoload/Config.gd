extends Node
## 공백(BLANK) — 모든 조정 가능한 수치.
## 웹 프로토타입(parry/game.js)의 CONFIG 를 그대로 옮김. 이름 규칙:
##   - 프로토타입에서 대문자였던 이름(AIM_TIME 등)은 그대로
##   - camelCase 였던 이름은 GDScript 관례대로 snake_case (runSpeed → run_speed)
## 단위: 거리 px (내부 해상도 480×270 기준), 시간 초, 속도 px/s, 각도는 표기된 대로

# ---------------------------------------------------------------- 화면 / 방
var view := { "w": 480, "h": 270 }
var fps := 60                                  # 물리 틱 (project.godot 의 physics_ticks_per_second 와 같게)
var room := { "w": 960, "h": 270, "tile": 8 }  # 테스트 방 크기, 타일 한 칸 크기
var camera := { "lerp": 0.12 }                 # 프로토타입: 프레임당 보간 비율 → Camera2D 스무딩 속도 = lerp × fps

# 물리 레이어 (비트 값). 일방향 발판은 따로 둬서 사격·시야 판정이 통과하게 (프로토타입과 같게)
var layers := {
	"terrain": 1,                     # 벽·바닥·엄폐물 (사격·시야를 막음)
	"player": 2,
	"enemy": 4,
	"platform": 16,                   # 일방향 발판 (몸은 올라서지만 총알·시야는 통과)
}

# ---------------------------------------------------------------- 플레이어
var player := {
	"w": 8, "h": 16,                  # 충돌 박스
	"run_speed": 125.0,               # 최고 달리기 속도
	"ground_accel": 1500.0, "ground_decel": 1800.0,
	"air_accel": 950.0, "air_decel": 450.0,
	"turn_accel_mul": 1.6,            # 반대 방향으로 꺾을 때 가속 배수
	"gravity": 1000.0,                # 상승 중 중력
	"fall_gravity_mul": 1.35,         # 하강 중 중력 배수 (묵직한 낙하)
	"max_fall": 380.0,
	"jump_speed": 340.0,              # 점프 초속 → 최대 높이 ≈ 58px
	"jump_cut_mul": 0.42,             # Space 를 일찍 떼면 상승 속도에 곱함
	"coyote_time": 0.1,               # 발판을 벗어난 뒤에도 점프 가능한 시간
	"jump_buffer": 0.1,               # 착지 직전 누른 점프를 기억하는 시간
}

var slash := {
	"duration": 0.22,                 # 베기 모션 전체 길이
	"parry_window": 0.12,             # 베기 시작 후 근접 패링 판정 창
	"cooldown": 0.3,                  # 다음 베기까지 (베기 시작 기준)
	"radius": 26.0,                   # 칼이 닿는 거리 (플레이어 중심 기준)
	"arc_half": 1.15,                 # 부채꼴 반각 (라디안, ≈66°)
	"dash_speed": 330.0,              # 베는 방향 돌진 속도
	"dash_time": 0.085,               # 돌진 지속 (이동 입력/중력 무시)
	"dash_keep": 0.35,                # 돌진 종료 후 남기는 속도 비율
	"air_up_once": true,              # 공중에서 위로 돌진은 착지 전까지 1회만
	"hit_time": 0.15,                 # 베기 시작 후 적 몸통을 직접 벨 수 있는 시간
	"direct_kill": true,              # false 면 '패링으로만' 적을 죽일 수 있음
}

# ---------------------------------------------------------------- 구르기 (모든 스테이지 공통, 입력 "roll" = Shift — 옵션 메뉴에서 바꿀 수 있음)
var roll := {
	"ROLL_DISTANCE": 64.0,            # 구르는 거리 (px)
	"ROLL_TIME": 0.30,                # 구르는 시간
	"ROLL_IFRAME": 0.25,              # 시작부터 이 시간 동안 무적 (히트스캔 · 근접 · 충격파 · 보라색 공격 모두 통과)
	"ROLL_COOLDOWN": 0.40,            # 구르기가 끝난 뒤 다음 구르기까지
	"GHOST_EVERY": 0.04,              # 잔상 간격
	"DUST_EVERY": 0.05,               # 바닥 먼지 간격
	"ROLL_BUFFER": 0.1,
	"ROLL_GROUND_SNAP": 4.0,          # 바닥에서 이 높이 안이면 바닥으로 침 (베기 돌진으로 살짝 뜬 경우)               # 베기 돌진 중 · 착지 직전에 누른 구르기를 이 시간 동안 기억 (헛스윙 직후 구르기)
	"SPIN": 1.0,                      # 구르는 동안 회전 수
	"FALLBACK_PITCH": 1.3,            # roll.wav 가 없으면 dash_whoosh 를 이 피치로 (그것도 없으면 무음)
}

# ---------------------------------------------------------------- 적
var enemy := { "gravity": 1000.0, "max_fall": 380.0, "edge_stop": true }

var melee := {                        # 근접 적: 크고 각진 실루엣
	"w": 16, "h": 26,
	"speed": 62.0, "accel": 700.0,
	"aggro_range": 210.0, "aggro_height": 70.0,
	"attack_range": 20.0,             # 몸 사이 간격이 이 이하면 공격 시작
	"attack_height": 18.0,
	"telegraph": 0.4,                 # 공격 예고 (무기 빨간 점멸)
	"blink_rate": 0.05,
	"active": 0.13,                   # 공격 판정 지속
	"lunge": 170.0,                   # 공격 순간 앞으로 내딛는 속도
	"recover": 0.6,                   # 공격 후 경직
	"hitbox": Vector2(26, 28),        # 몸 앞쪽 공격 판정
	"unparryable_chance": 0.0,        # 패링 불가(보라) 공격 확률 — 구조만
}

var gunner := {                       # 총잡이: 가늘고 총이 튀어나온 실루엣, 히트스캔
	"w": 8, "h": 20,
	"speed": 48.0, "accel": 500.0,
	"aggro_range": 290.0, "aggro_height": 130.0,
	"keep_min": 85.0, "keep_max": 175.0,
	"first_delay": 0.5,               # 발견 후 첫 조준까지
	"AIM_TIME": 0.8,                  # 조준 시작 → 발사
	"AIM_LOCK_TIME": 0.15,            # 발사 이 시간 전부터 조준 고정
	"LASER_ALPHA_MIN": 0.4,
	"LOCK_BLINKS": 2,
	"LOCK_BLINK_TIME": 0.025,
	"cooldown": 1.35,                 # 발사 후 다음 조준까지
	"gun_length": 15.0,
	"unparryable_chance": 0.0,
}

# ---------------------------------------------------------------- 1장 적 (3단계: 새 적 + 변형)
## 공격 종류 규칙 (일반 적): 원히트 · 총탄과 근접 공격은 NORMAL (패링 → 반사 · 처치, 구르기로도 피함) · 보라 = EVADE.
## 일반 적은 OPPORTUNITY(2겹 원)를 쓰지 않음 — 2겹 원은 보스 전용 신호
var burst := {                        # 연사병 (EnemyGunner, burst_count = 2) — 철견 슬라이드 사격 연습
	"SHOT_GAP": 0.45,                 # 연사 안 탄 간격 (MIN_SHOT_GAP 은 다른 적과 사이에만)
	"MISS_ANGLE": 28.0,               # 첫 탄 패링: 반사탄이 쏜 적에서 이만큼 (°) 위로 비껴 벽에 맞음 (두 번째 탄 패링 = 처치)
	"FIRST_PARRY_HITSTOP": 4,         # 첫 탄 패링 히트스톱 (슬로우 시퀀스 없음 — 바로 두 번째 탄)
	"COOLDOWN": 1.8,                  # 두 번째 탄 뒤 다음 조준까지
}

var charger := {                      # 돌격병 (EnemyMelee, variant = charger) — 지연 내려치기 (NORMAL) ↔ 몸통 돌진 (EVADE) 번갈아
	"w": 20, "h": 30,
	"speed": 70.0, "accel": 800.0,
	"aggro_range": 240.0, "aggro_height": 70.0,
	"FIRST": "charge",                # 첫 공격 (방 씬 export first_attack 로 바꿀 수 있음)
	# 지연 내려치기: 무기를 치켜든 채 HOLD 초 멈칫 → 내려침. 빨간 점멸은 내려치기 BLINK_LEAD 초 전부터
	"SLAM_RANGE": 20.0,               # 몸 사이 간격이 이 이하면 내려치기 시작
	"SLAM_HOLD": 0.5,
	"SLAM_BLINK_LEAD": 0.3,           # 그 전 (멈칫 앞부분) 에 베면 무기로 막힘 → 헛스윙 (패링 기회 놓침)
	"SLAM_ACTIVE": 0.14, "SLAM_LUNGE": 150.0, "SLAM_RECOVER": 0.7,
	"SLAM_HITBOX": Vector2(30, 34),
	# 몸통 돌진: 몸 전체가 보라로 GLOW 초 빛남 → SPEED px/s 로 DIST px 직선 → 숨 고르기 WINDED 초 (무방비)
	"CHARGE_MIN": 30.0, "CHARGE_MAX": 200.0,   # 몸 사이 간격이 이 범위면 돌진
	"CHARGE_GLOW": 0.4, "CHARGE_SPEED": 300.0, "CHARGE_DIST": 150.0,
	"CHARGE_HITBOX": Vector2(22, 30),
	"WINDED": 0.6,
	"BLOCK_STUN": 0.15, "BLOCK_PUSH": 140.0,   # 막아냈을 때 플레이어 경직 · 뒤로 밀림 (돌진이 적을 지나쳐 버리지 않게)
}

var grenadier := {                    # 척탄병 — 거리 유지 · 4초마다 수류탄. 투척 모션 동안 무방비
	"w": 16, "h": 22,
	"speed": 46.0, "accel": 500.0,
	"aggro_range": 300.0, "aggro_height": 140.0,
	"keep_min": 120.0, "keep_max": 250.0,
	"first_delay": 1.0,               # 발견 후 첫 투척 모션까지
	"THROW_EVERY": 4.0,               # 투척 간격
	"THROW_WINDUP": 0.5,              # 투척 모션 (팔을 뒤로 → 던짐)
}

var grenade := {                      # 수류탄 (scenes/Grenade.tscn — 나중에 재사용)
	"FUSE": 1.2,                      # 던진 뒤 폭발까지
	"FLIGHT": 0.6,                    # 던질 때 플레이어 발밑에 닿을 때까지 (포물선)
	"GRAVITY": 900.0,
	"RADIUS": 50.0,                   # 폭발 반경 — 플레이어 즉사, 다른 적도 휘말려 처치
	"SIZE": 4.0,
	"BOUNCE": 0.3, "FRICTION": 900.0,
	"LAND_KEEP": 0.12,                # 착지할 때 남기는 가로 속도 비율 (착지 지점에서 거의 멈춤)
	"BLINK_SLOW": 0.25, "BLINK_FAST": 0.06,   # 빨간 불빛 깜빡임 간격 (터질수록 빨라짐)
	"BAT_SPEED": 360.0,               # 베어서 되치면 이 속도로 마우스 방향 (조준 스냅 적용)
	"BAT_LIFT": 0.12,                 # 바닥의 수류탄을 아래 · 수평으로 쳐도 이만큼 위로 (라디안). 되친 수류탄은 곧게 날아감
	"BAT_FUSE": 0.9,                  # 되친 뒤 이 시간 안에 아무 데도 안 닿으면 공중 폭발
	"BAT_HIT_PAD": 6.0,               # 되친 수류탄이 적 몸통에 이만큼 가까우면 그 자리에서 폭발
	"BAT_HITSTOP": 4,
	"SLASH_PAD": 6.0,                 # 칼 판정 여유 (수류탄이 작아서)
	"BLAST_TIME": 0.35,               # 폭발 원 · 섬광
	"SHAKE": 6.0,
}

var intro := {                        # 처음 만나는 적 소개 (GameState.seen_intros 에 기록, F11 초기화)
	"DELAY": 0.35,                    # 방에 들어온 뒤 (검은 전환이 걷힌 뒤) 소개 시작
	"LOCK": 0.3,                      # 입력 잠금
	"ZOOM": 1.2,                      # 카메라 살짝 줌인 (적 쪽으로)
	"TOWARD": 0.85,                   # 카메라 중심: 플레이어 → 적 이 비율 (멀리 있는 적도 화면 안에)
	"IN": 0.25, "HOLD": 0.7, "OUT": 0.3,   # 카메라 들어감 · 머묾 · 돌아옴 (실제 초)
	"NAME_TIME": 1.0,                 # 머리 위 이름
	"RADIO_TIME": 3.0,                # 무전 표시 시간
	"GAP": 0.15,                      # 한 방에 새 적이 둘이면 사이 간격
	"NAMES": { "burst": "연사병", "charger": "돌격병", "grenadier": "척탄병" },
	"RADIO": {                        # 방 씬에서 적마다 intro_radio 로 바꿀 수 있음 (비우면 이 기본값)
		"burst": "두 발씩 쏘는 놈이다. 조심하라고.",
		"charger": "막을 수 없는 공격을 하는 녀석이군. 피해라..",
		"grenadier": "수류탄은 칼로 쳐서 돌려줘. 저 녀석에겐 선물일거다.",
	},
}

# ---------------------------------------------------------------- 사격 · 패링
var shot := {                         # 히트스캔 사격 + 타이밍 패링
	"PARRY_EARLY": 0.14,              # 발사 이 시간 전부터 베기 시작이면 패링 (난이도 프리셋이 덮어씀)
	"PARRY_LATE": 0.08,               # 발사 후 이 시간까지 (그동안 피격 보류, 난이도 프리셋이 덮어씀)
	"WHIFF_COOLDOWN": 0.3,            # 헛스윙 시 베기 불가 시간
	"MIN_SHOT_GAP": 0.3,              # 여러 총잡이 발사 최소 간격
	"RANGE": 480.0,
	"TRACER_FRAMES": 3,
	"TRACER_WIDTH": 2.0,
	"REFLECT_TRACER_WIDTH": 3.0,
	"PLAYER_HIT_PAD": 1.0,
	"SLASH_CATCH_PAD": 14.0,          # 막 벤 칼(판정 창 PARRY_EARLY 안)은 몸 둘레 이만큼까지 탄을 받아냄 — 연속 패링 중 돌진으로 비껴도 받아침
	"DIRECTIONAL_PARRY_ANGLE": 80.0,  # (난이도 프리셋이 덮어씀) 방향 패링 탄 (pending 에 incoming 이 있으면): 그 방향 ± 이 각도로 베어야 성공
}

var approach := {                     # 발사 타이밍 원
	"APPROACH_TARGET_RADIUS": 6.0,
	"APPROACH_START_RADIUS": 40.0,    # radius = 6 + 34 × (남은 시간 / AIM_TIME), 선형
	"ALPHA_MIN": 0.3,
	"BAND_ALPHA": 0.22,
	"FLASH_FRAMES": 1,
	"SUCCESS_TIME": 0.15,
	"SCATTER_TIME": 0.25,             # 가짜 조준 취소 때 원이 흩어지는 시간
	"SUCCESS_SCALE": 4.0,
	"DIM_ALPHA": 0.5,
	"OFFSCREEN_SCALE": 0.5,
	"OFFSCREEN_MARGIN": 24.0,
}

# ---------------------------------------------------------------- 스미어 프레임 (산나비 식 돌진 왜곡 — SmearFX)
## 돌진이 가장 빠른 첫 몇 틱만: 몸을 진행 방향으로 늘이고 (옆은 납작) · 뒤로 뻗는 하늘색 가시 · 분홍/하늘 색 갈라짐 · (반격) 뜨거운 궤적.
## 히트스톱 중엔 틱을 세지 않아 그 일그러진 모습이 그대로 멈춰 보임. F2 패널 = 키로 끄고 켬
var smear := {
	"SLASH": { "STRETCH": 1.8, "SQUASH": 0.7, "TICKS": 2, "SPIKES": 5, "SPIKE_LEN": Vector2(10.0, 24.0), "SPREAD": 0.7,
		"CHROMA": 1.0, "BACK": 3.0, "TRAIL": false, "TRAIL_W": 0.0 },            # 일반 베기 돌진 (약하게)
	"COUNTER": { "STRETCH": 2.5, "SQUASH": 0.6, "TICKS": 3, "SPIKES": 7, "SPIKE_LEN": Vector2(14.0, 34.0), "SPREAD": 0.8,
		"CHROMA": 2.0, "BACK": 5.0, "TRAIL": true, "TRAIL_W": 6.0 },             # 반격 베기 자동 돌진 (강하게, 궤적)
}

# ---------------------------------------------------------------- 난이도 프리셋 (옵션 메뉴, 기본 NORMAL)
## 지금 프리셋은 Config.diff (set_difficulty 로 바뀜). 철견 수치 중 이 표에 있는 것은 CheolgyeonConfig 대신 여기서 읽음.
##  PARRY_EARLY · PARRY_LATE · DIRECTIONAL_PARRY_ANGLE → Config.shot 에 그대로 써 넣음 (모든 적 공통 — 판정 띠도 같이 바뀜)
##  TELEGRAPH_TIME      철견 공격 직전 웅크림 예고: ① 슬라이드 · ② 돌진 · ③ 점프 (⑤ 는 원 자체가 예고, ④ 는 정적)
##  SLIDE_SHOT_INTERVAL ① 탄 간격 · WHIP_INTERVAL ② 1타 → 2타 · QUICKDRAW_RING_TIME ④ 원 = 뽑아 쏘기까지
##  FAKE_TWITCH_CHANCE  ④ 가짜 움찔 확률 { 페이즈: 확률 } · SHOCKWAVE_SPEED ③ 충격파 속도
##  STAGGER_TIME 휘청 (연습 더미도) · COUNTER_LUNGE_RANGE 반격 베기 자동 돌진 거리
##  BOSS_HP 체력 칸 수 (= 페이즈 1 시작 체력) · PHASE_HP 페이즈 2 · 3 시작 체력 · PATTERN_GAP { 페이즈: 패턴 사이 공백 } · P3_CHAIN 페이즈 3 이어 붙이기
const DIFFICULTIES := ["easy", "normal", "hard"]
const DIFFICULTY_LABELS := { "easy": "EASY", "normal": "NORMAL", "hard": "HARD" }

var difficulty_presets := {
	"easy": {
		"PARRY_EARLY": 0.18, "PARRY_LATE": 0.10, "TELEGRAPH_TIME": 0.40,
		"SLIDE_SHOT_INTERVAL": 0.50, "WHIP_INTERVAL": 0.45, "QUICKDRAW_RING_TIME": 0.55,
		"FAKE_TWITCH_CHANCE": { 2: 0.15, 3: 0.25 }, "DIRECTIONAL_PARRY_ANGLE": 90.0, "SHOCKWAVE_SPEED": 180.0,
		"STAGGER_TIME": 1.3, "COUNTER_LUNGE_RANGE": 200.0,
		"BOSS_HP": 6, "PHASE_HP": { 2: 4, 3: 2 }, "PATTERN_GAP": { 1: 0.9, 2: 0.7, 3: 0.6 }, "P3_CHAIN": false,
	},
	"normal": {
		"PARRY_EARLY": 0.14, "PARRY_LATE": 0.08, "TELEGRAPH_TIME": 0.30,
		"SLIDE_SHOT_INTERVAL": 0.42, "WHIP_INTERVAL": 0.35, "QUICKDRAW_RING_TIME": 0.45,
		"FAKE_TWITCH_CHANCE": { 2: 0.25, 3: 0.40 }, "DIRECTIONAL_PARRY_ANGLE": 80.0, "SHOCKWAVE_SPEED": 220.0,
		"STAGGER_TIME": 1.0, "COUNTER_LUNGE_RANGE": 170.0,
		"BOSS_HP": 6, "PHASE_HP": { 2: 4, 3: 2 }, "PATTERN_GAP": { 1: 0.7, 2: 0.55, 3: 0.45 }, "P3_CHAIN": false,
	},
	"hard": {
		"PARRY_EARLY": 0.10, "PARRY_LATE": 0.05, "TELEGRAPH_TIME": 0.18,
		"SLIDE_SHOT_INTERVAL": 0.30, "WHIP_INTERVAL": 0.25, "QUICKDRAW_RING_TIME": 0.30,
		"FAKE_TWITCH_CHANCE": { 2: 0.50, 3: 0.60 }, "DIRECTIONAL_PARRY_ANGLE": 60.0, "SHOCKWAVE_SPEED": 300.0,
		"STAGGER_TIME": 0.7, "COUNTER_LUNGE_RANGE": 120.0,
		"BOSS_HP": 9, "PHASE_HP": { 2: 6, 3: 3 }, "PATTERN_GAP": { 1: 0.4, 2: 0.3, 3: 0.2 }, "P3_CHAIN": true,
	},
}
var difficulty := "normal"
var diff: Dictionary = difficulty_presets.normal


func _init() -> void:
	set_difficulty("normal")


## 난이도 바꾸기 (Settings 가 부름). 사격 판정 값은 Config.shot 에 써 넣어 모든 적에 바로 적용
func set_difficulty(name: String) -> void:
	difficulty = name if difficulty_presets.has(name) else "normal"
	diff = difficulty_presets[difficulty]
	shot.PARRY_EARLY = diff.PARRY_EARLY
	shot.PARRY_LATE = diff.PARRY_LATE
	shot.DIRECTIONAL_PARRY_ANGLE = diff.DIRECTIONAL_PARRY_ANGLE


# ---------------------------------------------------------------- 공격 종류 (모든 적 공통)
## NORMAL = 빨간 1겹 원 · 빨간 점멸 — 구르기로 피하거나 패링 (철견: 피해 · 휘청 없음)
## OPPORTUNITY = 빨간 2겹 원 + 0.15초 전 '칭' — 패링해야만 철견 휘청 (피해도 되지만 기회를 놓침)
## EVADE = 보라 — 패링 불가, 구르기 무적 · 점프로만 피함
const ATK_NORMAL := "normal"
const ATK_OPPORTUNITY := "opportunity"
const ATK_EVADE := "evade"

var attack := {
	"OPP_RING_GAP": 4.0,              # 2겹: 바깥 원이 안쪽 원보다 이만큼 큼 (px)
	"OPP_RING_WIDTH": 2.0,            # 바깥 원 두께 (안쪽은 1px)
	"OPP_RING_BRIGHT": 0.35,          # 바깥 원을 흰색 쪽으로 이만큼 밝게
	"OPP_ALPHA_MIN": 0.6,             # 바깥 원 최소 투명도 (안쪽 원 0.3 보다 진하게 — 멀리서도 보이게)
	"OPP_CHIME_LEAD": 0.15,           # 공격 이 시간 전 '칭' 하이라이트
	"OPP_CHIME_SOUND": "boss_armor",  # 전용 소리가 없어 boss_armor 를 높은 피치로
	"OPP_CHIME_PITCH": 1.8,
	"OPP_CHIME_VOLUME": 0.4,
	"OPP_GLINT_TIME": 0.15,           # 칭 순간 원 중심의 4갈래 반짝임
	"OPP_GLINT_SIZE": 11.0,
	"NORMAL_PARRY_HITSTOP": 4,        # 철견 NORMAL 패링: parry_chang + 히트스톱 4프레임 + 노란 불꽃 (피해 · 휘청 없음)
}

var dummy := {                        # 공격 종류 연습 더미 (rooms/test/room_attack_types.tscn): 세 종류를 번갈아 쏨
	"ORDER": ["normal", "opportunity", "evade"],
	"AIM_TIME": 0.8,
	"COOLDOWN": 1.2,                  # 발사 후 다음 조준까지
	"FIRST_DELAY": 0.8,
	"AGGRO_RANGE": 420.0,
}

var parry := { "melee_early": 0.1 }   # 근접 적 예고 마지막 이 시간 동안 베어도 패링 인정

var aim_assist := {
	"AIM_SNAP_ANGLE": 35.0,           # (°)
	"OWNER_PRIORITY_ANGLE": 50.0,     # (°)
	"AIM_SNAP_RANGE": 300.0,
	"MELEE_PARRY_RANGE_BONUS": 0.2,
}

var parry_seq := {                    # 사격 패링 성공 시퀀스 (실제 시간 기준)
	"LOCK_INPUT_DURING_SLOWMO": true,
	"DESATURATE": 0.4,
	"VIGNETTE": 0.6,
	"ZOOM": 0.06,
	"ZOOM_OUT_FRAMES": 16,
	"REFLECT_LINE_WIDTH": 1.0,
	"SLOWMO_IN": 0.15,
	"SLOWMO_HOLD": 0.45,
	"SLOWMO_SCALE": 0.1,
	"LOOP_FADE": 0.2,
	"RETURN_FALLBACK": 0.9,           # time_return.wav 를 못 읽었을 때만
}

# ---------------------------------------------------------------- 킬 연출 · 타격감
var kill := {                         # 60fps 프레임 기준
	"KILL_HITSTOP_FRAMES": 16,
	"FREEZE_OTHERS": true,
	"BEAM_FRAMES": 11, "BEAM_WIDTH": 2.0, "BEAM_GLOW": 6.0, "BEAM_MARGIN": 12.0,
	"DUST_COUNT": 12, "DUST_SPEED": 70.0,
	"TRAIL_RADIUS": 34.0, "TRAIL_ARC": 80.0, "TRAIL_SWEEP_FRAMES": 3, "TRAIL_PINK_LAG": 1.5, "TRAIL_MIN_FRAMES": 4,
	"BLOOD_MIN": 30, "BLOOD_MAX": 40, "BLOOD_CONE": 28.0,
	"BLOOD_SPEED_MIN": 60.0, "BLOOD_SPEED_MAX": 330.0,
	"BLOOD_STOP_SPEED": 0.12, "BLOOD_GRAVITY": 700.0, "BLOOD_LIFE": 1.6,
	"SHAKE_START": 8.0, "SHAKE_TAIL_FRAMES": 6, "SHAKE_CURVE": 2.5, "SHAKE_BIAS": 0.55,
}

var juice := {
	"HITSTOP_PARRY_FRAMES": 6,
	"ENEMY_FLASH_FRAMES": 2,
	"KILL_KNOCKBACK": 400.0, "KNOCKBACK_LIFT": 140.0, "KNOCKBACK_SPLIT": 70.0,
	"PIECE_SPIN": 16.0, "PIECE_BOUNCE": 0.45, "PIECE_MAX_BOUNCES": 2,
	"PIECE_MIN_BOUNCE": 90.0, "PIECE_FRICTION": 650.0, "PIECE_WALL_BOUNCE": 0.5,
	"SLASH_TRAIL_RADIUS": 32.0, "SLASH_TRAIL_ARC": 80.0, "SLASH_TRAIL_THICK": 0.5,
	"SLASH_TRAIL_HOLD": 3, "SLASH_TRAIL_FADE": 0.09,
	"SHAKE_PARRY": 10.0, "SHAKE_TIME": 0.15, "SHAKE_OVERSHOOT": 1.0,
	"RECOIL_SPEED": 150.0, "RECOIL_LIFT": 60.0,
}

var fx := {
	"flash_time": 1.0 / 60.0, "flash_alpha": 0.85,
	"ring_radius": 38.0, "ring_time": 0.3, "ring_width": 3.0,
	"piece_speed": 90.0, "piece_spin": 9.0,
	"death_hitstop": 0.06, "death_shake": 5.0,
}

var anim := {
	"lean_max": 0.2,                  # 달릴 때 몸 기울기 (라디안)
	"jump_stretch": 0.32,
	"land_squash": 0.38,
	"dash_stretch": 0.3,
	"spring_back": 0.22,              # 원래 모양으로 돌아오는 비율 (프레임당)
	"ghost_time": 0.16, "ghost_every_run": 4,
	"scarf_nodes": 7, "scarf_seg": 2.3,
	"scarf_drag": 0.86, "scarf_gravity": 9.0, "scarf_wave": 26.0, "scarf_trail": 22.0,
}

var debug := { "SLOW_SCALE": 0.1 }

# ---------------------------------------------------------------- 방 진행 (1장 버티컬 슬라이스)
var rooms := {
	"TRANSITION_TIME": 0.3,           # 출구 → 다음 방: 검게 전환 (반은 어두워지고 반은 밝아짐)
	"OPEN_MSG_TIME": 2.0,             # "출구가 열렸다" 표시 시간
}


# ---------------------------------------------------------------- 출구 문 (하운드 보안 셔터)
# 방의 하운드 경비원이 전부 쓰러지면 보안 잠금이 풀려 열림. 시간은 모두 실제 시간(초) — 효과음과 맞춤.
# 출구 표시는 하늘색(colors.ui)만. 빨강·노랑·보라는 쓰지 않음.
var door := {
	# 셔터문 (shutter): 문틀 24×40, 금속 테두리 2px, 셔터 가로줄 2px 간격
	"W": 24.0, "H": 40.0, "FRAME": 2.0, "SLAT_GAP": 2.0,
	"LAMP_W": 4.0, "LAMP_H": 2.0,                  # 문 위 가운데 상태등
	"DRUM_H": 3.0,                                 # 셔터가 말려 들어가는 위쪽 통
	"FRAME_COLOR": Color("#2a2f3c"), "FRAME_EDGE": Color("#454b5c"),   # 어두운 회색 금속
	"SLAT_COLOR": Color("#121a33"), "SLAT_LINE": Color("#2b3142"),     # 짙은 남색 + 회색
	"MARK_COLOR": Color("#4a5170"),                # 하운드 마크 (삼각형)
	"LAMP_OFF": Color("#3a3f4c"), "LAMP_DIM": Color("#5a6070"),       # 잠김: 회색 (깜빡일 때 조금 밝게)
	"SIGN_OFF": Color("#1c2130"),                  # 꺼진 네온관
	# 잠김
	"LOCK_BLINK_PERIOD": 2.0, "LOCK_BLINK_TIME": 0.12,
	# 열리는 중 (마지막 적의 킬 연출이 끝난 직후 시작)
	"DOOR_OPEN_TIME": 0.64,                        # 셔터가 다 올라가는 시간 (소리 속 두 번째 덜컹)
	"DOOR_STUTTER_TIME": 0.50,                     # 2프레임 멈칫 (소리 속 첫 덜컹)
	"STUTTER_FRAMES": 2,
	"SIGN_FLICKERS": [[0.04, 0.08], [0.15, 0.19], [0.27, 0.30]],   # 간판 지지직 (켜짐 구간)
	"SIGN_ON_AT": 0.38,                            # 이때부터 계속 켜짐
	"OPEN_SHAKE": 2.0, "SHAKE_TIME": 0.15,         # 완전히 열릴 때 화면 흔들림 (px)
	"DUST_COUNT": 14, "DUST_SPEED": 60.0,
	# 열림
	"SIGN_FLOW_SPEED": 3.0,                        # 간판 >>> 가 흐르는 속도 (칸/초)
	"GLOW_W": 40.0, "GLOW_H": 7.0, "GLOW_ALPHA": 0.22,   # 문 앞 바닥 빛 번짐 (반투명 타원)
	"RAIN_RATE": 7.0, "RAIN_SPEED": 260.0, "RAIN_LEN": 5.0, "RAIN_FALL": 46.0,   # 빛 속을 지나는 빗방울
	"SPARKLE_TIME": 0.12,                          # 빗방울이 빛에 닿아 반짝이는 시간
	# 철망 덮개 (vent): 벽·천장 — 열리면 덮개가 떨어져 나감, 점프해서 들어감
	"VENT_W": 20.0, "VENT_H": 14.0,
	# 맨홀 (manhole): 바닥 — 열리면 덮개가 옆으로 밀려남, 떨어지면 이동. 아래 지형은 자동으로 뚫림
	"MANHOLE_W": 16.0, "MANHOLE_COVER_W": 20.0, "MANHOLE_FALL": 6.0,
	# 보스방 문 (boss): 1.5배, 두꺼운 이중 셔터
	"BOSS_SCALE": 1.5, "BOSS_FRAME": 3.0,
	"BOSS_DOOR_UNLOCK": 0.35, "BOSS_UNLOCK_SHAKE": 3.0,    # 잠금 해제 "쿵"
	"BOSS_STEAM_START": 0.4, "BOSS_STEAM_END": 2.1,        # 문 틈새 증기 + 미세 진동
	"BOSS_RUMBLE": 1.0, "BOSS_STEAM_RATE": 26.0,
	"BOSS_DOOR_OPEN": 2.18, "BOSS_OPEN_TIME": 0.2,         # 이중 셔터가 위아래로 갈라짐
	"BOSS_OPEN_SHAKE": 6.0, "BOSS_SHAKE_TIME": 0.3,
	"BOSS_LAMP_SPIN": 7.0,                                  # 상태등 회전 (라디안/초)
	"RADIO_HOLD": 1.5,                                      # 다 열린 뒤 무전 글자가 남는 시간
}

# 옵션(흔들림 강도·발사 타이밍 원)과 F2 타격감 토글은 Settings 오토로드

# ---------------------------------------------------------------- UI (타이틀 · 장 카드 · 무전 · 메뉴) — 빨강 · 보라는 UI 에 쓰지 않음 (공격 신호 전용)
var ui_style := {
	"FONT": "res://fonts/Galmuri11.ttf",     # 한글 도트 폰트 — 없으면 시스템 글꼴 (안티앨리어싱 끔)
	"SIZE": 11, "SIZE_BIG": 14,              # 내부 해상도 기준
	"TEXT": Color("#D0D4E0"),                # 기본 글자
	"ACCENT": Color("#5AC8E6"),              # 강조 (UI 전용 하늘색)
	"PANEL": Color(Color("#0A0B12"), 0.85),  # 배경 판
	"DIM": 0.4,                              # 비활성 글자 투명도
	"SFX_MOVE": "ui_move", "SFX_SELECT": "ui_select", "SFX_BACK": "ui_back",   # 없으면 무음
	"SFX_VOLUME": 0.6,
	# 타이틀
	"TITLE_DIM": 0.35,                       # 무대 위 어둡게
	"TITLE_GLITCH_EVERY": Vector2(4.0, 7.0), # 제목 글리치 간격 (초)
	"TITLE_GLITCH_TIME": 0.1,
	"TITLE_RAIN_VOL": 0.3,
	"VERSION": "v0.1",
	# 장 시작 카드
	"TYPE_CHAR": 0.04,                       # 글자당
	"TYPE_LINE_GAP": 0.8,                    # 줄 사이
	"CARD_TIME": 2.0,                        # 장 제목
	"FADE": 0.5,
}

# ---------------------------------------------------------------- 연출 · UI
var logo := { "text": "시우 공방", "fade_in": 0.6, "hold": 0.8, "fade_out": 0.6 }  # 합계 2초
var scanline := { "alpha": 0.2 }
var hint_time := 7.0
var restart_fade := 0.18

var audio := {
	"dir": "res://sounds/",
	"SFX_GUN": 0.8, "SFX_PARRY": 1.0, "SFX_SLOWMO_IN": 0.8, "SFX_SLOWMO_LOOP": 0.5,
	"SFX_TIME_RETURN": 1.0, "SFX_KILL": 1.0,
	"SFX_DOOR": 0.7,                  # door_open.wav (셔터 · 철망 · 맨홀)
	"SFX_DOOR_BOSS": 0.9,             # door_boss.wav (보스방 문)
	"SFX_BOSS_INTRO": 1.0,            # boss_intro.wav (철견 이름 카드 · 포효)
	"SFX_BOSS_ARMOR": 0.8,            # boss_armor.wav (반사탄이 장갑에 튕김)
	# 철견 (보스 효과음 2차) — Audio.VOLUME_KEYS 가 소리 이름과 연결
	"SFX_GUN_COCK": 0.8,              # gun_cock.wav (슬라이드 사격 예고)
	"SFX_QUICKDRAW": 0.9,             # quickdraw.wav (속사 권총 뽑기)
	"SFX_WHIP": 0.9,                  # pistol_whip.wav (건카타 내려치기)
	"SFX_EXECUTE": 1.0,               # execute.wav (반격 베기 명중)
	"SFX_STAGGER": 0.8,               # stagger.wav (철견 휘청)
	"SFX_EXPLOSION": 1.0,             # explosion.wav (물탱크 폭발 · 수류탄)
	"SFX_GRENADE_PIN": 0.8,           # grenade_pin.wav (척탄병 투척)
	"SFX_FLASHBANG": 0.9,             # flashbang.wav (조명 파괴 · 정전)
	"SFX_THUNDER": 0.7,               # thunder.wav (번개)
	"SFX_RAIN": 0.35,                 # rain_loop.wav (보스방 빗소리, 반복)
	# 피날레
	"SFX_HEARTBEAT": 0.6,             # heartbeat.wav (정적 · 대치 구간 반복, 분당 약 55회)
	"SFX_DRIP": 0.9,                  # drip.wav (빗방울 착지 = 신호)
	"SFX_SHEATHE": 1.0,               # sheathe.wav (납도 "착")
	"SFX_BULLET_SPLIT": 0.9,          # bullet_split.wav (갈라진 총알 "팅")
	"SFX_DASH": 0.8, "SFX_SLIDE": 0.8, "SFX_JUMP": 0.8,   # dash_whoosh · slide · jump.wav (아직 없음 → 무음)
	"SFX_ROLL": 0.6,                  # roll.wav (플레이어 구르기, 없으면 dash_whoosh 피치 1.3 → 그것도 없으면 무음)
	"MUFFLE_CUTOFF": 650.0,           # 먹먹함 (World 버스 로우패스) 차단 주파수 Hz
	"GUN_PITCH": Vector2(0.95, 1.05),
	"KILL_PITCH": Vector2(0.92, 1.08),
}

# ---------------------------------------------------------------- 색
var colors := {
	"bg": Color("#05060d"),
	"sky_top": Color("#020309"), "sky_bottom": Color("#0d1330"),
	"far_city": Color("#0a1029"), "near_city": Color("#050812"), "window": Color("#141d3d"), "star": Color("#1f2a52"),
	"terrain": Color("#000000"), "terrain_edge": Color("#1b2547"), "terrain_line": Color("#0a0f22"),
	"player": Color("#ffffff"),
	"enemy_body": Color("#10121c"), "enemy_rim": Color("#4a5170"), "enemy_weapon": Color("#2c3350"),
	"blood": [Color("#d0102a"), Color("#9a0c20"), Color("#ff3a45")],
	"beam_core": Color("#ffffff"), "beam_edge": Color("#5fd8ff"),
	"trail_outer": Color("#5fd8ff"), "trail_mid": Color("#ff6fcf"), "trail_core": Color("#ffd23a"),
	"dust": [Color("#9a8f78"), Color("#6e6656"), Color("#b8ae96")],
	"attack": Color("#ff2b3d"),
	"unparryable": Color("#b14dff"),
	"parry": Color("#ffd23a"), "parry_hot": Color("#ff9a1f"),
	"ui": Color("#5fd8ff"),
}

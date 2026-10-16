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

# ---------------------------------------------------------------- 사격 · 패링
var shot := {                         # 히트스캔 사격 + 타이밍 패링
	"PARRY_EARLY": 0.10,              # 발사 이 시간 전부터 베기 시작이면 패링
	"PARRY_LATE": 0.05,               # 발사 후 이 시간까지 (그동안 피격 보류)
	"WHIFF_COOLDOWN": 0.3,            # 헛스윙 시 베기 불가 시간
	"MIN_SHOT_GAP": 0.3,              # 여러 총잡이 발사 최소 간격
	"RANGE": 480.0,
	"TRACER_FRAMES": 3,
	"TRACER_WIDTH": 2.0,
	"REFLECT_TRACER_WIDTH": 3.0,
	"PLAYER_HIT_PAD": 1.0,
}

var approach := {                     # 발사 타이밍 원
	"APPROACH_TARGET_RADIUS": 6.0,
	"APPROACH_START_RADIUS": 40.0,    # radius = 6 + 34 × (남은 시간 / AIM_TIME), 선형
	"ALPHA_MIN": 0.3,
	"BAND_ALPHA": 0.22,
	"FLASH_FRAMES": 1,
	"SUCCESS_TIME": 0.15,
	"SUCCESS_SCALE": 4.0,
	"DIM_ALPHA": 0.5,
	"OFFSCREEN_SCALE": 0.5,
	"OFFSCREEN_MARGIN": 24.0,
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

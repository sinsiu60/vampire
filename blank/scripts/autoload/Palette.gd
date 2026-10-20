extends Node
## 1장 배경 · 무대 팔레트 (오토로드 Palette). 배경 · 구조물 · 장식은 이 색만 씀.
## 신호 색 규칙: 빨강 #F02832 = 공격 신호 전용 · 보라 = 회피 공격 · 하늘색 #5AC8E6 = UI 전용
##   → 배경 · 구조물 · 장식에 빨강 · 보라 · 하늘색을 쓰지 않음 (장식 네온은 분홍 · 주황 계열만)

# ---- 하늘 (세로 그라데이션, 위 → 아래)
const SKY_TOP := Color("#080914")
const SKY_BOTTOM := Color("#221630")
# ---- 건물
const FAR_BUILDING := Color("#14182A")
const FAR_WINDOW := Color("#3C4260")
const NEAR_BUILDING := Color("#0D0F1C")
const NEAR_WINDOW := Color("#58465C")
# ---- 바닥
const FLOOR := Color("#161822")
const FLOOR_LINE := Color("#464C64")       ## 바닥 윗선 · 지형 윗면 1px 림
const FLOOR_JOINT := Color("#1A1C28")      ## 줄눈
# ---- 구조물 (난간 · 물탱크 · 조명갓)
const STRUCT_LIGHT := Color("#24283A")
const STRUCT_DARK := Color("#1E2232")
const STRUCT_EDGE := Color("#0A0B12")
const RIM := Color("#8294C8")              ## 림라이트 (인물 · 구조물 윗면)
# ---- 비
const RAIN := Color("#96AAD2")             ## 투명도 70 ~ 150 (/255)
const RAIN_ALPHA := Vector2(70.0, 150.0)
const SPLASH := Color("#A0B4D7")
# ---- 장식 네온 (신호 아님)
const NEON_PINK := Color("#FF5ABE")
const NEON_PINK_DARK := Color("#962870")
const DISTANT_NEON := [Color("#963C78"), Color("#A05A3C"), Color("#783C8C")]
# ---- 조명 빛 (원뿔 빛은 투명도 약 10%)
const LAMP_LIGHT := Color("#E6DCBE")
const LAMP_CONE_ALPHA := 0.10
# ---- 신호 색 (참고 — 배경에 쓰지 말 것)
const SIGNAL_ATTACK := Color("#F02832")
const SIGNAL_UI := Color("#5AC8E6")

# ---- 레이어 (뒤 → 앞). z 는 월드 절대값 기준 (Background.tscn)
##  1 Sky · 2 FarBuildings (시차 0.2) · 3 NearBuildings (0.5) · 4 DistantNeon — 배경 CanvasLayer -10
##  5 Structures (시차 1.0) z -3 · 6 Floor z -2 · 7 RainBack z -1 · 8 인물 · 적 z 0 · 9 RainFront z 9 · 10 Overlay (화면 효과)
const PARALLAX_FAR := 0.2
const PARALLAX_NEAR := 0.5
## 세로 시차 (화면보다 높은 맵에서 위로 올라간 만큼 먼 층이 내려가는 비율) — 가로 배율 → 세로 비율
const PARALLAX_V := { 0.2: 0.3, 0.5: 0.55 }
const Z_STRUCTURES := -3
const Z_FLOOR := -2
const Z_RAIN_BACK := -1
const Z_RAIN_FRONT := 9

# ---- 비 강도 프리셋 (Rain.tscn) — 개수는 화면 하나 기준 (뒤 75% · 앞 25%)
const RAIN_PRESETS := {
	"normal": { "count": 420, "alpha": 1.0, "speed": 1.0 },
	"heavy": { "count": 900, "alpha": 1.0, "speed": 1.15 },
	"dark": { "count": 700, "alpha": 1.0 / 3.0, "speed": 1.0 },
}
const RAIN_FRONT_SHARE := 0.25
const RAIN_FRONT_ALPHA := 0.55             ## 앞 비는 투명도 낮게 (인물을 가리지 않게)
const RAIN_LEN := Vector2(5.0, 11.0)
const RAIN_ANGLE := 20.0                   ## 오른쪽 아래로 기울기 (°, 세로 기준)
const RAIN_SPEED := Vector2(380.0, 480.0)  ## px/s
const SPLASH_PX := Vector2i(1, 3)          ## 바닥에 닿으면 물 튀김 1 ~ 3px
const SPLASH_LIFE := Vector2(0.10, 0.20)

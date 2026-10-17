extends Node2D
class_name AttackLegend
## 공격 종류 안내판 (연습 방): 실제 원 모양 그대로 세 개 + 설명. 1겹 · 2겹 · 보라를 나란히 비교

const ROWS := [
	["normal", "1겹 빨강 = 일반 — 구르기 또는 패링 (보스: 피해 없음)"],
	["opportunity", "2겹 빨강 = 기회 — 패링하면 휘청 → 베기로 반격"],
	["evade", "보라 = 회피 — 패링 불가, 구르기 · 점프"],
]


func _ready() -> void:
	z_index = 5


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	var aim := 0.8
	# 원이 천천히 줄어들었다 다시 커지게 (실제 모양 비교용)
	var ph := fmod(Time.get_ticks_msec() / 1000.0, 1.6) / 1.6
	var rem := lerpf(aim * 0.35, 0.0, ph)
	for i in ROWS.size():
		var kind: String = ROWS[i][0]
		var c := Vector2(0, i * 46.0)
		var info := { "remaining": rem, "aim_time": aim, "locked": rem <= Config.gunner.AIM_LOCK_TIME,
			"k": clampf((aim - rem) / (aim - Config.gunner.AIM_LOCK_TIME), 0.0, 1.0),
			"parryable": kind != Config.ATK_EVADE, "attack_type": kind }
		Effects.draw_approach(self, c, info)
		Fonts.text(self, ROWS[i][1], c + Vector2(30, 0), 8, Color(1, 1, 1, 0.85))

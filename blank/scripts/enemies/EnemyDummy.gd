extends EnemyGunner
class_name EnemyDummy
## 공격 종류 연습 더미 (rooms/test/room_attack_types.tscn): 제자리에서 NORMAL → OPPORTUNITY → EVADE 를 번갈아 쏨. 죽지 않음.
##  NORMAL (빨간 1겹)      — 패링하면 일반 패링 연출만 (철견처럼 피해 · 휘청 없음). 구르기로 피해도 됨
##  OPPORTUNITY (빨간 2겹) — 0.15초 전 '칭'. 패링하면 휘청 (Config.diff.STAGGER_TIME) → 그동안 베면 반격 명중
##  EVADE (보라)           — 패링 불가. 구르기 무적이나 점프로 피함
## 수치는 Config.dummy · Config.attack

var order_i := 0                 ## 다음에 쏠 종류 (Config.dummy.ORDER 의 번호)
var counters := 0                ## 반격 명중 수
var _msg := {}                   # 머리 위 짧은 글자 { text, color, t }


func _ready() -> void:
	var D: Dictionary = Config.dummy
	aim_time = D.AIM_TIME
	cooldown = D.COOLDOWN
	first_delay = D.FIRST_DELAY
	super._ready()
	cfg.speed = 0.0
	cfg.aggro_range = D.AGGRO_RANGE
	cfg.aggro_height = 200.0
	add_to_group("counter_targets")


func _pick_attack_type() -> String:
	var order: Array = Config.dummy.ORDER
	var a := String(order[order_i % order.size()])
	order_i += 1
	return a


func is_staggered() -> bool:
	return state == "stagger" and not dead


## 반격 베기 자동 돌진 대상 (Player._counter_lunge)
func can_counter() -> bool:
	return is_staggered()


## 기회 공격 패링됨 → 휘청
func stagger() -> void:
	set_state("stagger")
	velocity.x = 0.0
	Audio.sfx("stagger")
	say("휘청 — 베어라!", Config.colors.parry)


## 휘청 중 베기 명중
func on_counter_hit() -> void:
	counters += 1
	set_state("engage")
	cool = cfg.cooldown
	say("반격 명중 ×%d" % counters, Config.colors.player)


func say(text: String, color: Color) -> void:
	_msg = { "text": text, "color": color, "t": 0.0 }


func _physics_process(delta: float) -> void:
	if dead or TimeManager.frozen:
		return
	if not _msg.is_empty():
		_msg.t += delta
		if _msg.t > 1.2:
			_msg = {}
	if state == "stagger":
		t += delta
		walk(0, 0.0, cfg.accel, delta)
		if t >= Config.diff.STAGGER_TIME:
			set_state("engage")
			cool = cfg.cooldown
		apply_physics(delta)
		queue_redraw()
		return
	super._physics_process(delta)


func _draw_pose() -> void:
	super._draw_pose()
	if capturing():
		return
	# 휘청: 흰 테두리 깜빡임 (철견과 같은 신호)
	if is_staggered() and fmod(t, 0.12) < 0.07:
		var r := Rect2(-cfg.w / 2.0 - 2.0, -cfg.h - 5.0, cfg.w + 4.0, cfg.h + 5.0)
		draw_rect(r, Color.WHITE, false, 1.0)
	# 받침대 (연습용 표시)
	draw_rect(Rect2(-6, -1, 12, 1), Config.colors.enemy_rim)
	if not _msg.is_empty():
		var c: Color = _msg.color
		c.a = clampf(1.6 - _msg.t * 1.3, 0.0, 1.0)
		Fonts.text(self, _msg.text, Vector2(0, -36 - _msg.t * 6.0), 8, c, "center", false, true)

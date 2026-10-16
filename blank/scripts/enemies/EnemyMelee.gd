extends Enemy
class_name EnemyMelee
## 근접 적: 크고 각진 몸 + 거대한 식칼.
## idle → (발견) chase → (사거리) windup 0.4초 (무기 빨간 점멸, 방향 고정) → attack (내딛으며 베기) → recover → chase

var parryable := true            # 이번 공격이 패링 가능한가 (보라 = 불가, 구조만)


func _ready() -> void:
	_setup(Config.melee)


func _physics_process(delta: float) -> void:
	if dead or TimeManager.frozen:
		return
	var C := cfg
	var player: Player = get_tree().get_first_node_in_group("player")
	if player == null:
		return
	var d := player.center() - center()
	t += delta
	match state:
		"idle":
			walk(0, 0.0, C.accel, delta)
			if not player.dead and absf(d.x) < C.aggro_range and absf(d.y) < C.aggro_height:
				set_state("chase")
		"chase":
			if player.dead:
				set_state("idle")
			else:
				facing = 1 if d.x >= 0.0 else -1
				var gap: float = absf(d.x) - (C.w + Config.player.w) / 2.0
				if gap <= C.attack_range and absf(d.y) < C.attack_height and is_on_floor():
					set_state("windup")
					parryable = randf() >= C.unparryable_chance
				else:
					walk(facing, C.speed, C.accel, delta)
		"windup":    # 예고: 방향 고정 — 뒤로 넘어가면 헛친다
			walk(0, 0.0, C.accel * 2.0, delta)
			if t >= C.telegraph:
				set_state("attack")
				if can_step(facing):
					velocity.x = facing * C.lunge
		"attack":
			velocity.x = move_toward(velocity.x, 0.0, 900.0 * delta)
			if not can_step(int(signf(velocity.x))):
				velocity.x = 0.0
			if t >= C.active:
				set_state("recover")
		"recover":
			walk(0, 0.0, C.accel, delta)
			if t >= C.recover:
				set_state("idle" if player.dead else "chase")
	apply_physics(delta)
	queue_redraw()


## 지금 칼을 맞대면 패링으로 인정되는가 (공격 중 / 예고 마지막 순간)
func parry_vulnerable() -> bool:
	if not parryable or dead:
		return false
	return state == "attack" or (state == "windup" and t >= cfg.telegraph - Config.parry.melee_early)


func _front_box(extra_h: float) -> Rect2:
	var hb: Vector2 = cfg.hitbox
	var x: float = global_position.x + (cfg.w / 2.0 - 4.0 if facing > 0 else -cfg.w / 2.0 - hb.x + 4.0)
	return Rect2(Vector2(x, global_position.y - hb.y - extra_h), Vector2(hb.x, hb.y + extra_h))


## 공격 판정 (공격 중일 때만)
func attack_box() -> Rect2:
	return _front_box(0.0) if state == "attack" else Rect2()


## 예고 중/공격 중 무기가 차지하는 영역 (패링 판정용)
func threat_box() -> Rect2:
	return _front_box(6.0)


# 무기 각도 (오른쪽을 볼 때 기준, 0 = 정면, 음수 = 위쪽)
func _weapon_angle() -> float:
	var C := cfg
	match state:
		"windup":
			var k := minf(1.0, t / (C.telegraph * 0.35))
			return lerpf(-0.5, -2.4, 1.0 - (1.0 - k) * (1.0 - k)) + sin(t * 90.0) * 0.04
		"attack":
			return lerpf(-2.4, 1.1, minf(1.0, t / (C.active * 0.45)))
		"recover":
			return lerpf(1.1, -0.5, minf(1.0, t / C.recover))
	return -0.5 + sin(t * 3.0) * 0.05


func _weapon_hot() -> bool:
	if state == "attack":
		return true
	if state == "windup":
		return int(t / cfg.blink_rate) % 2 == 0 or t > cfg.telegraph - 0.08
	return false


func _draw() -> void:
	var col: Dictionary = Config.colors
	var wa := _weapon_angle()
	var atk: Color = col.attack if parryable else col.unparryable
	var base := Transform2D(0.0, Vector2(facing, 1), 0.0, Vector2.ZERO)
	draw_set_transform_matrix(base)
	var cr := 1.0 if state == "windup" else 0.0
	# 몸통 실루엣
	draw_rimmed([
		["rect", Rect2(-7, -8, 6, 8)], ["rect", Rect2(1, -8, 6, 8)],                       # 굵은 다리
		["poly", PackedVector2Array([Vector2(-10, -23 + cr), Vector2(10, -23 + cr), Vector2(9, -16),
			Vector2(6, -8), Vector2(-6, -8), Vector2(-9, -16)])],                             # 역삼각 상체
		["poly", PackedVector2Array([Vector2(-12, -25 + cr), Vector2(-5, -25 + cr), Vector2(-5, -20 + cr), Vector2(-11, -20 + cr)])],  # 각진 어깨 갑옷
		["poly", PackedVector2Array([Vector2(-3, -29 + cr), Vector2(4, -29 + cr), Vector2(5, -23 + cr), Vector2(-4, -23 + cr)])],      # 투구
	], col.enemy_body, col.enemy_rim)
	# 휘두른 궤적 (빨강 반투명 부채꼴)
	if state == "attack":
		var arc := PackedVector2Array()
		var steps := 12
		for i in steps + 1:
			var a := lerpf(-2.4, wa, float(i) / steps)
			arc.append(Vector2(7, -17) + Vector2(cos(a), sin(a)) * 24.0)
		for i in range(steps, -1, -1):
			var a := lerpf(-2.4, wa, float(i) / steps)
			arc.append(Vector2(7, -17) + Vector2(cos(a), sin(a)) * 10.0)
		var c := atk
		c.a = 0.55
		draw_colored_polygon(arc, c)
	# 무기 (어깨 축으로 회전)
	draw_set_transform_matrix(base * Transform2D(wa, Vector2(7, -17)))
	var blade := [
		["rect", Rect2(0, -1, 8, 2)],
		["poly", PackedVector2Array([Vector2(7, -3), Vector2(19, -5), Vector2(23, 0), Vector2(19, 4), Vector2(7, 4)])],
	]
	if _weapon_hot():
		draw_rimmed(blade, atk, Color(atk, 0.35))     # 발광 대신 같은 색 옅은 테두리
	else:
		draw_rimmed(blade, col.enemy_weapon, col.enemy_rim)
	draw_set_transform_matrix(Transform2D.IDENTITY)

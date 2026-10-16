extends Enemy
class_name EnemyGunner
## 총잡이: 가는 몸 + 긴 코트 + 앞으로 튀어나온 총. 히트스캔 사격.
## idle → (보이면) engage: 거리 유지 → aim AIM_TIME: 빨간 조준선이 플레이어 추적, 점점 굵고 밝게
##   → 발사 AIM_LOCK_TIME 전 조준 고정 (흰색 2번 깜빡 + 총구 빨간 빛) → 발사 (Main.fire_shot) → engage

var aim := PI                    ## 조준 각도 (전역, 라디안)
var cool := 0.0                  # 다음 조준까지
var next_parryable := true       ## 이번 사격이 패링 가능한가 (보라 = 불가, 구조만)
var last_fire_t := -INF          ## 마지막 발사 시각 (월드 시간)
var laser_end := Vector2.ZERO    ## 조준선 끝점 (벽까지, 전역)


func _ready() -> void:
	_setup(Config.gunner)
	add_to_group("gunners")
	aim = 0.0 if facing > 0 else PI


func pivot() -> Vector2:
	return global_position + Vector2(facing, -14)


func muzzle() -> Vector2:
	return pivot() + Vector2.from_angle(aim) * float(cfg.gun_length)


func lock_start() -> float:
	return cfg.AIM_TIME - cfg.AIM_LOCK_TIME


func is_aiming() -> bool:
	return state == "aim" and not dead


func is_locked() -> bool:
	return is_aiming() and t >= lock_start()


## 발사까지 남은 시간 (월드 시간) — 발사 타이밍 원 반지름 계산에 사용
func remaining() -> float:
	return cfg.AIM_TIME - t


## 예정된(또는 마지막) 발사 시각 — 여러 총잡이 발사 간격 조정용
func expected_fire_t() -> float:
	return TimeManager.world_time + remaining() if state == "aim" else last_fire_t


func _aim_at(player: Player) -> void:
	aim = (player.center() - pivot()).angle()
	facing = 1 if cos(aim) >= 0.0 else -1


func _physics_process(delta: float) -> void:
	if dead or TimeManager.frozen:
		return
	var C := cfg
	var game := get_tree().get_first_node_in_group("game")
	var player: Player = get_tree().get_first_node_in_group("player")
	if game == null or player == null:
		return
	var d := player.center() - center()
	# 벽에 가려 플레이어가 안 보이면 조준을 시작하지 않음
	var sees: bool = not player.dead and absf(d.x) < C.aggro_range and absf(d.y) < C.aggro_height \
		and game.line_of_sight(pivot(), player.center())
	if state != "aim":
		t += delta
	match state:
		"idle":
			walk(0, 0.0, C.accel, delta)
			if sees:
				set_state("engage")
				cool = C.first_delay
		"engage":
			if player.dead:
				set_state("idle")
			else:
				_aim_at(player)
				var dist := absf(d.x)
				var dir := 0
				if dist < C.keep_min:
					dir = -int(signf(d.x))
				elif dist > C.keep_max:
					dir = int(signf(d.x))
				walk(dir, C.speed, C.accel, delta)
				cool -= delta
				if cool <= 0.0 and sees:
					set_state("aim")
					next_parryable = randf() >= C.unparryable_chance
		"aim":
			walk(0, 0.0, C.accel * 2.0, delta)
			if player.dead:
				set_state("idle")
			else:
				var nt := t + delta
				# 다른 총잡이와 발사가 MIN_SHOT_GAP 안으로 겹치면(또는 패링 시퀀스 중이면) 조준 고정 직전에서 기다림
				if game.should_hold_aim(self, nt):
					nt = minf(nt, maxf(t, lock_start() - 1e-4))
				t = nt
				if t < lock_start():
					_aim_at(player)                       # 고정 전까지 추적
				laser_end = game.raycast_wall(muzzle(), aim, Config.shot.RANGE)
				if t >= C.AIM_TIME:
					game.fire_shot(self)
					last_fire_t = TimeManager.world_time
					cool = C.cooldown
					set_state("engage")
	apply_physics(delta)
	queue_redraw()


func _draw() -> void:
	var col: Dictionary = Config.colors
	var C := cfg
	var atk: Color = col.attack if next_parryable else col.unparryable
	# 조준선: 0.8 → 0.15초 전 1px → 2px, 투명도 40% → 100%. 고정 후 흰색 2번 깜빡
	if is_aiming():
		var k := clampf(t / lock_start(), 0.0, 1.0)
		var c := atk
		c.a = lerpf(C.LASER_ALPHA_MIN, 1.0, k)
		var width := 1.0 if k < 0.5 else 2.0
		if is_locked():
			var lt := t - lock_start()
			var period: float = C.LOCK_BLINK_TIME * 2.0
			if lt < period * C.LOCK_BLINKS and fmod(lt, period) < C.LOCK_BLINK_TIME:
				c = Color.WHITE
			c.a = 1.0
			width = 2.0
		draw_line(to_local(muzzle()), to_local(laser_end), c, width)
	# 몸 (오른쪽을 볼 때 기준으로 그리고 facing 으로 뒤집음)
	var base := Transform2D(0.0, Vector2(facing, 1), 0.0, Vector2.ZERO)
	draw_set_transform_matrix(base)
	draw_rimmed([
		["rect", Rect2(-3, -8, 2, 8)], ["rect", Rect2(1, -8, 2, 8)],
		["poly", PackedVector2Array([Vector2(-3, -16), Vector2(3, -16), Vector2(3, -6), Vector2(-5, -5)])],  # 뒤로 날리는 긴 코트
		["rect", Rect2(-2, -20, 4, 4)],      # 머리
		["rect", Rect2(-4, -20, 8, 1)],      # 모자 챙
		["rect", Rect2(-2, -23, 4, 3)],      # 모자
	], col.enemy_body, col.enemy_rim)
	# 팔 + 총 (조준 각도로 회전)
	var local_aim := aim if facing > 0 else PI - aim
	draw_set_transform_matrix(base * Transform2D(local_aim, Vector2(1, -14)))
	draw_rimmed([
		["rect", Rect2(0, -1, 5, 2)], ["rect", Rect2(4, -2, 8, 3)],
		["rect", Rect2(5, 1, 2, 2)], ["rect", Rect2(12, -1, 3, 1)],   # 손잡이, 총열
	], col.enemy_body, col.enemy_rim)
	# 조준 고정 = "지금 친다": 총구에 작은 빨간 빛이 맺힘
	if is_locked():
		var u := clampf((t - lock_start()) / C.AIM_LOCK_TIME, 0.0, 1.0)
		draw_circle(Vector2(15, 0), 1.0 + u * 1.5, atk)
	draw_set_transform_matrix(Transform2D.IDENTITY)

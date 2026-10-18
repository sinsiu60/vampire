extends Enemy
class_name EnemyGrenadier
## 척탄병: 둥글고 두꺼운 실루엣 · 허리에 수류탄 3개 · 가슴에 하운드 마크 (삼각형). 수치 Config.grenadier.
## idle → (발견) engage: 플레이어와 keep_min ~ keep_max 거리 유지 → THROW_EVERY 초마다 throw:
##   THROW_WINDUP 동안 팔을 뒤로 (grenade_pin.wav, 손에 든 수류탄 빨간 불빛) → 플레이어 발밑으로 포물선 투척 (scenes/Grenade.tscn)
##   투척 모션 중 근접하면 무방비 → 베면 처치

const GRENADE_SCENE := preload("res://scenes/Grenade.tscn")

@export_multiline var intro_radio := ""   ## 처음 만날 때 무전 (비우면 Config.intro.RADIO 기본값)
@export var keep_min := 0.0      ## 0 = 기본값 (방마다 거리 유지 범위를 바꿀 때)
@export var keep_max := 0.0      ## 크게 하면 제자리에서 던짐 (방 4: 앞에 모인 근접 적과 함께 서 있게)
@export var aggro_range := 0.0

var cool := 0.0
var throws := 0                  ## 던진 수 (테스트)
var belt := 3                    # 허리에 남은 수류탄 그림 (던지면 하나 줄고 다시 채워짐)


func _ready() -> void:
	var c: Dictionary = Config.grenadier.duplicate()
	if keep_min > 0.0: c.keep_min = keep_min
	if keep_max > 0.0: c.keep_max = keep_max
	if aggro_range > 0.0: c.aggro_range = aggro_range
	_setup(c)


func intro_key() -> String:
	return "grenadier"


func label() -> String:
	return "척탄병"


func is_throwing() -> bool:
	return state == "throw" and not dead


## 손 (던지는 지점, 전역)
func hand() -> Vector2:
	var k := clampf(t / float(cfg.THROW_WINDUP), 0.0, 1.0) if is_throwing() else 0.0
	return global_position + Vector2(facing * lerpf(4.0, -9.0, k), -22.0 - 4.0 * k)


func _physics_process(delta: float) -> void:
	if dead or TimeManager.frozen or Enemy.intro_hold:
		return
	var C := cfg
	var player: Player = get_tree().get_first_node_in_group("player")
	var game := get_tree().get_first_node_in_group("game")
	if player == null or game == null:
		return
	var d := player.center() - center()
	var sees: bool = not player.dead and absf(d.x) < C.aggro_range and absf(d.y) < C.aggro_height
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
				facing = 1 if d.x >= 0.0 else -1
				var dist := absf(d.x)
				var dir := 0
				if dist < C.keep_min:
					dir = -int(signf(d.x))
				elif dist > C.keep_max:
					dir = int(signf(d.x))
				walk(dir, C.speed, C.accel, delta)
				cool -= delta
				if cool <= 0.0 and sees and not game.seq_active:
					set_state("throw")
					Audio.sfx("grenade_pin")
		"throw":     # 투척 모션: 제자리 · 무방비
			walk(0, 0.0, C.accel * 2.0, delta)
			if not player.dead:
				facing = 1 if d.x >= 0.0 else -1
			if t >= C.THROW_WINDUP:
				_throw(game, player)
				cool = C.THROW_EVERY
				set_state("engage" if not player.dead else "idle")
	apply_physics(delta)
	queue_redraw()


func _throw(game: Node, player: Player) -> void:
	var g: Grenade = GRENADE_SCENE.instantiate()
	game.room.add_child(g)
	g.launch(global_position + Vector2(facing * 6.0, -24.0), player.global_position + Vector2(0, -2), self)
	throws += 1
	belt = maxi(0, belt - 1)


func _draw_pose() -> void:
	var col: Dictionary = Config.colors
	var base := Transform2D(0.0, Vector2(facing, 1), 0.0, Vector2.ZERO)
	set_xf(base)
	var k := clampf(t / float(cfg.THROW_WINDUP), 0.0, 1.0) if is_throwing() else 0.0
	var lean := roundf(-1.5 * k)
	# 둥글고 두꺼운 몸 (팔각형에 가까운 덩어리) + 짧은 다리 + 둥근 헬멧
	draw_rimmed([
		["rect", Rect2(-6, -6, 5, 6)], ["rect", Rect2(1, -6, 5, 6)],
		["poly", PackedVector2Array([Vector2(-5 + lean, -21), Vector2(5 + lean, -21), Vector2(8 + lean, -17), Vector2(8, -9),
			Vector2(5, -6), Vector2(-5, -6), Vector2(-8, -9), Vector2(-8 + lean, -17)])],
		["poly", PackedVector2Array([Vector2(-4 + lean, -26), Vector2(3 + lean, -26), Vector2(5 + lean, -23), Vector2(5 + lean, -21),
			Vector2(-5 + lean, -21), Vector2(-5 + lean, -23)])],
	], col.enemy_body, col.enemy_rim)
	if not capturing():
		# 하운드 마크 (가슴, 삼각형)
		var mc := Vector2(1 + lean, -16)
		var mk: Color = Config.door.MARK_COLOR
		draw_colored_polygon(PackedVector2Array([mc + Vector2(-3, -2), mc + Vector2(3, -2), mc + Vector2(0, 3)]), mk)
		draw_colored_polygon(PackedVector2Array([mc + Vector2(-3, -2), mc + Vector2(-2, -4), mc + Vector2(-1, -2)]), mk)
		draw_colored_polygon(PackedVector2Array([mc + Vector2(1, -2), mc + Vector2(2, -4), mc + Vector2(3, -2)]), mk)
	# 허리 수류탄 3개 (던지면 하나씩 비었다가 다음 투척 전 다시)
	var shown := 3 if not is_throwing() else maxi(belt, 2)
	var belt_shapes := []
	for i in 3:
		if i < shown:
			belt_shapes.append(["rect", Rect2(-6 + i * 4, -9, 3, 3)])
	if not belt_shapes.is_empty():
		draw_rimmed(belt_shapes, col.enemy_weapon, col.enemy_rim)
	# 던지는 팔: 몸 앞 → 뒤로 젖힘 (손에 든 수류탄은 빨간 불빛)
	var sh := Vector2(3 + lean, -19)
	var arm_a := lerpf(0.6, -2.6, k)
	set_xf(base * Transform2D(arm_a, sh))
	draw_rimmed([["rect", Rect2(0, -1.5, 7, 3)]], col.enemy_body, col.enemy_rim)
	if is_throwing():
		draw_rimmed([["rect", Rect2(6, -2, 4, 4)]], col.enemy_weapon, col.enemy_rim)
		if not capturing() and fmod(t, 0.16) < 0.08:
			draw_rect(Rect2(7, -1, 2, 2), col.attack)
	set_xf(Transform2D.IDENTITY)

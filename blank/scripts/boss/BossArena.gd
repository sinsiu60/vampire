extends Node2D
class_name BossArena
## 철견 보스방 무대 (room_06 의 "Arena"): 물탱크 · 네온 간판 · 조명 3개, 비 (폭우 = 2배), 정전 어둠 + 빛, 번개.
## 페이즈 전환 연출에서 Main 이 부름: burst_tank · drop_sign · break_lamp · set_storm · set_blackout.
## 체크포인트 재시작은 apply_phase(페이즈) 로 그 페이즈 시작 상태를 바로 만듦.
## 그리기 층 (z, 절대값): 무대 소품 -1 · 비 9 · 어둠 20 (조준선 · 원 · 보라 예고는 30 — 어둠 위)

const C := preload("res://scripts/boss/CheolgyeonConfig.gd")
const DARK_SHADER := preload("res://shaders/darkness.gdshader")

@export var tank_pos := Vector2(452, 104)          ## 물탱크 받침 아래 중앙 (배경, 부딪히지 않음)
@export var sign_hang := Vector2(190, 92)          ## 매달린 네온 간판 중앙
@export var sign_floor_x := 190.0                  ## 떨어져 박히는 x
@export var lamp_xs: PackedFloat32Array = PackedFloat32Array([96.0, 256.0, 416.0])
@export var lamp_y := 26.0                         ## 조명 갓 위치 (천장 전선에 매달림)

var floor_y := 240.0
var tank_burst := false
var sign_state := "hang"         ## hang | falling | down
var lamps := [true, true, true]
var storm := false
var blackout := false
var phase_hint := 1              ## 번개 간격 (페이즈 3 이면 자주)
var lightning_on := true         ## 피날레 결투 중엔 저절로 치지 않음
var spots: Array = []            ## 정전 속에서도 둘레가 보이는 노드 (피날레 결투: 철견 · 플레이어)

var _sign_t := 0.0
var _sign_body: StaticBody2D
var _rain: Node2D
var _dark: Node2D
var _drops: Array = []           # { x, y } (화면 비율 0~1)
var _lights: Array = []          # 정전 중 빛 { pos, r, t, life, k }
var _reveal := 0.0               # 번개로 어둠이 걷힌 정도 0~1
var _next_bolt := 0.0
var _bolt := {}                  # 번개 진행 { t, second, thunder }
var _shards: Array = []          # 탱크 · 조명 파편 { pos, vel, rot, vrot, size, color, t }


func _ready() -> void:
	z_index = -1
	z_as_relative = false
	process_mode = Node.PROCESS_MODE_PAUSABLE
	# 떨어진 간판 = 몸이 부딪히는 바닥 장애물 (발판 층 — 총알 · 시야 레이는 통과해 엄폐물이 되지 않음).
	# 도탄 사격의 반사판으로만 탄을 튕김. 떨어지기 전엔 꺼 둠
	_sign_body = StaticBody2D.new()
	_sign_body.collision_layer = Config.layers.platform
	_sign_body.collision_mask = 0
	var cs := CollisionShape2D.new()
	var rs := RectangleShape2D.new()
	rs.size = C.SIGN_SIZE
	cs.shape = rs
	_sign_body.add_child(cs)
	add_child(_sign_body)
	_sign_body.process_mode = Node.PROCESS_MODE_DISABLED
	_sign_body.visible = false
	# 비 · 어둠 층
	_rain = Node2D.new()
	_rain.z_index = 9
	_rain.z_as_relative = false
	_rain.draw.connect(_draw_rain)
	add_child(_rain)
	_dark = Node2D.new()
	_dark.z_index = 20
	_dark.z_as_relative = false
	var mat := ShaderMaterial.new()
	mat.shader = DARK_SHADER
	_dark.material = mat
	_dark.draw.connect(_draw_dark)
	add_child(_dark)
	for i in C.RAIN_COUNT * 2:
		_drops.append({ "x": randf(), "y": randf() })
	_schedule_bolt()
	_find_floor.call_deferred()


func _find_floor() -> void:
	var q := PhysicsRayQueryParameters2D.create(Vector2(sign_floor_x, 4.0), Vector2(sign_floor_x, 2000.0), Config.layers.terrain)
	var hit := get_world_2d().direct_space_state.intersect_ray(q)
	if not hit.is_empty():
		floor_y = hit.position.y
	if sign_state == "down":
		_place_sign()


func _main() -> Node:
	return get_tree().get_first_node_in_group("game")


# ---------------------------------------------------------------- 페이즈 상태
## 체크포인트: 그 페이즈 시작 상태로 바로 (연출 없이)
func apply_phase(p: int) -> void:
	phase_hint = p
	tank_burst = p >= 2
	storm = p >= 2
	if p >= 2:
		sign_state = "down"
		_place_sign()
	lamps = [p < 3, p < 3, p < 3]
	set_blackout(p >= 3)
	_schedule_bolt()


func set_storm(on: bool) -> void:
	storm = on


func set_blackout(on: bool) -> void:
	blackout = on
	_dark.queue_redraw()


func is_dark() -> bool:
	return blackout


## 물탱크 폭발: 파편 + 물보라 (소리 · 흔들림은 Main)
func burst_tank() -> void:
	tank_burst = true
	var c := tank_center()
	for i in 14:
		_shards.append({ "pos": c + Vector2(randf_range(-10, 10), randf_range(-8, 8)), "vel": Vector2(randf_range(-160, 160), randf_range(-260, -60)),
			"rot": randf() * TAU, "vrot": randf_range(-12, 12), "size": randf_range(2, 5), "color": Color("#2a3350"), "t": 0.0 })
	var main := _main()
	if main != null:
		for i in 40:
			var a := randf_range(PI * 1.1, PI * 1.9)
			var v := randf_range(80, 260)
			main.effects.spawn(c, Vector2(cos(a) * v, sin(a) * v), randf_range(0.5, 1.0), Color(0.55, 0.7, 0.95, 0.8), { "size": 2.0, "grav": 600.0 })


func tank_center() -> Vector2:
	return tank_pos + Vector2(0, -26)


## 네온 간판이 떨어짐 (실제 시간 0.35초) → 바닥에 박혀 장애물 + 도탄 반사판
func drop_sign() -> void:
	if sign_state != "hang":
		return
	sign_state = "falling"
	_sign_t = 0.0


func sign_down() -> bool:
	return sign_state == "down"


func _place_sign() -> void:
	sign_state = "down"
	_sign_body.position = Vector2(sign_floor_x, floor_y - C.SIGN_SIZE.y / 2.0)
	_sign_body.process_mode = Node.PROCESS_MODE_INHERIT
	(_sign_body.get_child(0) as CollisionShape2D).disabled = false


func lamp_pos(i: int) -> Vector2:
	return Vector2(lamp_xs[i], lamp_y)


## 조명 하나가 깨짐: 유리 파편 + 불꽃 (소리는 Main)
func break_lamp(i: int) -> void:
	if i < 0 or i >= lamps.size() or not lamps[i]:
		return
	lamps[i] = false
	var c := lamp_pos(i) + Vector2(0, 4)
	for k in 8:
		_shards.append({ "pos": c, "vel": Vector2(randf_range(-90, 90), randf_range(-120, 20)), "rot": randf() * TAU,
			"vrot": randf_range(-14, 14), "size": randf_range(1.5, 3), "color": Color("#9fb4d8"), "t": 0.0 })
	var main := _main()
	if main != null:
		main.effects.burst(c, 12, Config.colors.parry, 200.0, PI / 2.0, PI, 0.3, { "glow": true, "streak": true })


## 도탄 반사면 (세로): [{ x, y0, y1, side }] — side = 면이 바라보는 쪽 (-1 왼쪽 · 1 오른쪽)
func reflectors() -> Array:
	var out := []
	if sign_state == "down":
		var hx: float = C.SIGN_SIZE.x / 2.0
		var y0: float = floor_y - C.SIGN_SIZE.y
		out.append({ "x": sign_floor_x - hx, "y0": y0, "y1": floor_y, "side": -1, "name": "간판", "ray": false })
		out.append({ "x": sign_floor_x + hx, "y0": y0, "y1": floor_y, "side": 1, "name": "간판", "ray": false })
	return out


# ---------------------------------------------------------------- 빛 · 번개
## 정전 중 순간 빛 (총구 섬광 등)
func flash_light(pos: Vector2, r := C.MUZZLE_LIGHT_R, life := C.MUZZLE_LIGHT_TIME) -> void:
	_lights.append({ "pos": pos, "r": r, "t": 0.0, "life": life })
	if _lights.size() > 8:
		_lights.pop_front()


func _schedule_bolt() -> void:
	var r: Vector2 = C.LIGHTNING_P3 if phase_hint >= 3 else C.LIGHTNING_P12
	_next_bolt = randf_range(r.x, r.y)


## 번개: 화면 1프레임 하얗게 → 0.1초 뒤 약하게 한 번 더 → 0.5초 뒤 thunder.wav. 정전이면 그동안 주변이 보임
func lightning() -> void:
	_bolt = { "t": 0.0, "second": false, "thunder": false }
	_flash_screen(1.0)
	_reveal = 1.0


func _flash_screen(strength: float) -> void:
	var main := _main()
	if main != null and Settings.on("screen_flash"):
		main.screen_fx.flash(Color.WHITE, 0.85 * strength)


func _physics_process(delta: float) -> void:
	var rd := TimeManager.real_delta()
	# 번개 (실제 시간)
	if lightning_on:
		_next_bolt -= rd
	if _next_bolt <= 0.0:
		_schedule_bolt()
		lightning()
	if not _bolt.is_empty():
		_bolt.t += rd
		if not _bolt.second and _bolt.t >= C.LIGHTNING_SECOND:
			_bolt.second = true
			_flash_screen(0.45)
			_reveal = maxf(_reveal, 0.7)
		if not _bolt.thunder and _bolt.t >= C.LIGHTNING_THUNDER:
			_bolt.thunder = true
			Audio.sfx("thunder")
			_bolt = {}
	if _reveal > 0.0:
		_reveal = maxf(0.0, _reveal - rd / C.LIGHTNING_REVEAL)
	# 간판 떨어지기 (실제 시간)
	if sign_state == "falling":
		_sign_t += rd
		if _sign_t >= 0.35:
			_place_sign()
			var main := _main()
			if main != null:
				main.add_shake(4.0, 0.2, PI / 2.0)
				main.effects.burst(Vector2(sign_floor_x, floor_y), 14, Color("#545a72"), 140.0, -PI / 2.0, 1.4, 0.4, {})
				main.effects.burst(Vector2(sign_floor_x, floor_y - 20), 10, Config.colors.parry, 180.0, -PI / 2.0, PI, 0.25, { "glow": true, "streak": true })
			Audio.boss_armor(0.6)
	# 총구 빛 · 파편 (월드 시간)
	for l in _lights:
		l.t += rd
	_lights = _lights.filter(func(l): return l.t < l.life)
	for s in _shards:
		s.t += delta
		s.vel.y += 700.0 * delta
		s.pos += s.vel * delta
		s.rot += s.vrot * delta
		if s.pos.y > floor_y - 1.0:
			s.pos.y = floor_y - 1.0
			s.vel = Vector2(s.vel.x * 0.4, 0.0)
			s.vrot = 0.0
	# 비
	var n := C.RAIN_COUNT * (2 if storm else 1)
	var sp: float = C.RAIN_SPEED * (1.25 if storm else 1.0)
	for i in n:
		var d: Dictionary = _drops[i]
		d.y += sp * delta / Config.view.h
		d.x -= sp * 0.18 * delta / Config.view.w
		if d.y > 1.0:
			d.y -= 1.0
			d.x = randf()
		if d.x < 0.0:
			d.x += 1.0
	queue_redraw()
	_rain.queue_redraw()
	_dark.queue_redraw()


# ---------------------------------------------------------------- 그리기
func _view() -> Rect2:
	var main := _main()
	return main.view_rect() if main != null else Rect2(0, 0, Config.view.w, Config.view.h)


## 무대 소품 (배경 쪽)
func _draw() -> void:
	var rim := Color("#2c3655")
	# 조명 3개: 천장 전선 + 갓 + (켜져 있으면) 옅은 빛 원뿔
	for i in lamp_xs.size():
		var c := lamp_pos(i)
		draw_line(Vector2(c.x, -40), c + Vector2(0, -4), Color("#1a2036"), 1.0)
		draw_colored_polygon(PackedVector2Array([c + Vector2(-6, 0), c + Vector2(6, 0), c + Vector2(3, -5), c + Vector2(-3, -5)]), Color("#1c2238"))
		if lamps[i]:
			draw_colored_polygon(PackedVector2Array([c + Vector2(-5, 1), c + Vector2(5, 1), c + Vector2(48, floor_y - c.y), c + Vector2(-48, floor_y - c.y)]),
				Color(0.62, 0.7, 0.85, 0.05))
			draw_rect(Rect2(c + Vector2(-3, 0), Vector2(6, 2)), Color("#c9d6ee"))
		else:
			draw_rect(Rect2(c + Vector2(-3, 0), Vector2(6, 1)), Color("#30364c"))
	# 물탱크 (받침 + 원통)
	var tp := tank_pos
	for lx in [-9.0, 9.0]:
		draw_line(tp + Vector2(lx, 0), tp + Vector2(lx * 0.7, -16), Color("#141a2e"), 2.0)
	if not tank_burst:
		draw_rect(Rect2(tp + Vector2(-14, -40), Vector2(28, 24)), Color("#151c33"))
		draw_rect(Rect2(tp + Vector2(-14, -40), Vector2(28, 24)), rim, false, 1.0)
		draw_rect(Rect2(tp + Vector2(-15, -42), Vector2(30, 3)), Color("#1d2540"))
		for k in 3:
			draw_line(tp + Vector2(-14, -34 + k * 7), tp + Vector2(14, -34 + k * 7), Color("#1d2540"), 1.0)
	else:
		draw_colored_polygon(PackedVector2Array([tp + Vector2(-14, -16), tp + Vector2(14, -16), tp + Vector2(12, -24), tp + Vector2(4, -20), tp + Vector2(-3, -27), tp + Vector2(-13, -22)]), Color("#151c33"))
	# 네온 간판
	match sign_state:
		"hang":
			var c := sign_hang
			draw_line(c + Vector2(-10, -6), Vector2(c.x - 10, -40), Color("#1a2036"), 1.0)
			draw_line(c + Vector2(10, -6), Vector2(c.x + 10, -40), Color("#1a2036"), 1.0)
			_draw_neon(c, 0.0, true)
		"falling":
			var u := clampf(_sign_t / 0.35, 0.0, 1.0)
			var to := Vector2(sign_floor_x, floor_y - C.SIGN_SIZE.y / 2.0)
			_draw_neon(sign_hang.lerp(to, u * u), u * u * PI / 2.0, true)
		"down":
			_draw_neon(Vector2(sign_floor_x, floor_y - C.SIGN_SIZE.y / 2.0), PI / 2.0, false)
	# 파편
	for s in _shards:
		draw_set_transform(s.pos, s.rot, Vector2.ONE)
		draw_rect(Rect2(-s.size / 2.0, -s.size / 4.0, s.size, s.size / 2.0), s.color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 네온 간판 (가로 30 × 세로 10, 회전 rot). lit = 네온 켜짐 (떨어져 박히면 꺼짐)
func _draw_neon(c: Vector2, rot: float, lit: bool) -> void:
	draw_set_transform(c, rot, Vector2.ONE)
	var w: float = C.SIGN_SIZE.y
	var h: float = C.SIGN_SIZE.x
	draw_rect(Rect2(-w / 2.0, -h / 2.0, w, h), Color("#0f1424"))
	draw_rect(Rect2(-w / 2.0, -h / 2.0, w, h), Color("#2c3655"), false, 1.0)
	var neon := Color("#3fd6a8") if lit and fmod(Time.get_ticks_msec() / 1000.0, 2.3) > 0.12 else Color("#1f4a40")
	for k in 4:
		draw_rect(Rect2(-w / 2.0 + 4 + k * 6.5, -2, 4, 4), neon)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_rain() -> void:
	var v := _view()
	var n := C.RAIN_COUNT * (2 if storm else 1)
	var col: Color = C.RAIN_COLOR
	var len: float = C.RAIN_LEN * (1.4 if storm else 1.0)
	var dirv := Vector2(-0.18, 1.0).normalized()
	for i in n:
		var d: Dictionary = _drops[i]
		var p := v.position + Vector2(d.x * v.size.x, d.y * v.size.y)
		_rain.draw_line(p, p + dirv * len, col, 1.0)


func _draw_dark() -> void:
	if not blackout:
		return
	var mat := _dark.material as ShaderMaterial
	var arr := PackedVector4Array()
	for n in spots:
		if is_instance_valid(n) and arr.size() < 8:
			var c: Vector2 = n.center() if n.has_method("center") else n.global_position
			arr.append(Vector4(c.x, c.y, C.FINALE_SPOT_R, C.FINALE_SPOT))
	for l in _lights:
		if arr.size() >= 8:
			break
		var k: float = 1.0 - float(l.t) / float(l.life)
		arr.append(Vector4(l.pos.x, l.pos.y, l.r, k))
	while arr.size() < 8:
		arr.append(Vector4(0, 0, 1, 0))
	mat.set_shader_parameter("lights", arr)
	mat.set_shader_parameter("darkness", C.DARKNESS * (1.0 - _reveal))
	_dark.draw_rect(_view().grow(16.0), Color.WHITE)

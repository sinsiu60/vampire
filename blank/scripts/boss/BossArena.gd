extends Node2D
class_name BossArena
## 철견 보스방 무대 (room_06 의 "Arena"): 물탱크 · 네온 간판 · 조명 3개, 비 (폭우 = 2배), 정전 어둠 + 빛, 번개.
## 페이즈 전환 연출에서 철견이 부름: burst_tank (→ set_arena_phase(2)) · drop_sign · break_lamp (마지막 → set_arena_phase(3)) · set_storm.
## 체크포인트 재시작 · F6 (보스방) 은 set_arena_phase(페이즈) 로 그 페이즈의 무대 상태를 바로 만듦 (연출 없이).
## 그리기 층 (z, 절대값): 무대 소품 -1 · 비 (1장 공통 Rain — Background.tscn 의 RainBack -1 · RainFront 9) · 어둠 20
##   (조준선 · 원 · 보라 예고는 30 — 어둠 위). 비 강도: 평소 normal · 폭우 heavy · 정전 dark

const C := preload("res://scripts/boss/CheolgyeonConfig.gd")
const DARK_SHADER := preload("res://shaders/darkness.gdshader")

@export var sign_floor_x := 190.0                  ## 바닥 높이를 재는 x (떨어진 간판 자리)
## 무대 소품 위치는 CheolgyeonConfig 의 무대 그림 블록 (WIRE_* · LAMP_* · SIGN_RECT · TANK_RECT · RAIL_* · PUDDLES) — 색은 Palette
var sign_hang: Vector2 = C.SIGN_RECT.get_center()  ## 매달린 네온 간판 중앙
var lamp_xs: Array = C.LAMP_XS

var floor_y := 240.0
var tank_burst := false
var sign_state := "hang"         ## hang | falling | down
var lamps := [true, true, true]
var storm := false
var blackout := false
var phase_hint := 1              ## 번개 간격 (페이즈 3 이면 자주)
var lightning_on := true         ## 피날레 결투 중엔 저절로 치지 않음
var spots: Array = []            ## 정전 속에서도 둘레가 보이는 노드 (피날레 결투: 철견 · 플레이어)
var rain_mul := 1.0              ## 빗줄기 낙하 속도 배율 (피날레 빗방울 구간 0.1). 시간 정지면 저절로 멈춤
var arena_phase := 1             ## 무대 상태 1 ~ 3 (set_arena_phase)
var sign_sparks := 0             ## 간판 불꽃 터진 수 (테스트)

var _jets: Array = []            # 물줄기 { o (전역 구멍), vx, vy, ph }
var _glass: Array = []           # 바닥 유리 조각 [Vector2]
var _spark_t := 1.0

var _sign_t := 0.0
var _sign_body: StaticBody2D
var _dark: Node2D
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
	rs.size = C.SIGN_SIZE         # 기울어진 96×30 판 그대로 (_place_sign 이 몸 전체를 기울임)
	cs.shape = rs
	_sign_body.add_child(cs)
	add_child(_sign_body)
	_sign_body.process_mode = Node.PROCESS_MODE_DISABLED
	_sign_body.visible = false
	# 어둠 층
	_dark = Node2D.new()
	_dark.z_index = 20
	_dark.z_as_relative = false
	var mat := ShaderMaterial.new()
	mat.shader = DARK_SHADER
	_dark.material = mat
	_dark.draw.connect(_draw_dark)
	add_child(_dark)
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
	set_arena_phase(p)


## 무대 상태 (보이는 것 + 떨어진 간판 충돌). instant = 연출 없이 바로 (체크포인트 · F6).
##  연출 중: 페이즈 2 는 물탱크 폭발 순간 (간판은 그 뒤 drop_sign 으로 떨어짐), 페이즈 3 은 마지막 조명이 깨지는 순간
func set_arena_phase(n: int, instant := true) -> void:
	arena_phase = clampi(n, 1, 3)
	phase_hint = arena_phase
	tank_burst = arena_phase >= 2
	storm = arena_phase >= 2
	if tank_burst and _jets.is_empty():
		_make_jets()
	if not tank_burst:
		_jets = []
	if arena_phase == 1:
		sign_state = "hang"
		_sign_body.process_mode = Node.PROCESS_MODE_DISABLED
		(_sign_body.get_child(0) as CollisionShape2D).disabled = true
		lamps = [true, true, true]
		_glass = []
	elif instant and sign_state != "down":
		_place_sign()
	if arena_phase == 3:
		for i in lamps.size():
			if lamps[i] or _glass.is_empty():
				_drop_glass(i)
		lamps = [false, false, false]
	elif instant:
		lamps = [true, true, true]
		_glass = []
	set_blackout(arena_phase >= 3)
	self_modulate = Color(C.DARK_TINT, C.DARK_TINT, C.DARK_TINT * 1.1) if arena_phase >= 3 else Color.WHITE
	var main := _main()
	if main != null and main.background != null:
		main.background.dark_sky = [C.DARK_SKY_TOP, C.DARK_SKY_BOTTOM]
		main.background.dark_window_p = C.DARK_WINDOW_P
		main.background.dark_tint = C.DARK_TINT
		main.background.set_dark(arena_phase >= 3)
	_schedule_bolt()
	queue_redraw()


func set_storm(on: bool) -> void:
	storm = on


func set_blackout(on: bool) -> void:
	blackout = on
	_dark.queue_redraw()


func is_dark() -> bool:
	return blackout


## 물탱크 폭발: 파편 + 물보라 (소리 · 흔들림은 Main)
func burst_tank() -> void:
	set_arena_phase(2, false)       # 무대 상태 → 페이즈 2 (간판은 drop_sign 이 따로 떨어뜨림)
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
	return C.TANK_RECT.get_center()


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
	var xf := sign_down_xf()
	_sign_body.position = xf * (C.SIGN_SIZE / 2.0)
	_sign_body.rotation = xf.get_rotation()
	_sign_body.process_mode = Node.PROCESS_MODE_INHERIT
	(_sign_body.get_child(0) as CollisionShape2D).disabled = false


## 떨어진 간판: 왼쪽 위 모서리 기준 변환 (오른쪽이 SIGN_TILT° 낮게, 오른쪽 아래 모서리가 바닥 SIGN_SINK 아래)
func sign_down_xf() -> Transform2D:
	var th := deg_to_rad(C.SIGN_TILT)
	var w: float = C.SIGN_SIZE.x
	var h: float = C.SIGN_SIZE.y
	var top := floor_y + C.SIGN_SINK - w * sin(th) - h * cos(th)
	return Transform2D(th, Vector2(C.SIGN_DOWN_X, roundf(top)))


## 떨어진 간판 네 모서리 (전역): [왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래]
func sign_corners() -> Array:
	var xf := sign_down_xf()
	var w: float = C.SIGN_SIZE.x
	var h: float = C.SIGN_SIZE.y
	return [xf * Vector2(0, 0), xf * Vector2(w, 0), xf * Vector2(w, h), xf * Vector2(0, h)]


## 전선 높이 (x 에서)
static func wire_y(x: float) -> float:
	return lerpf(C.WIRE_A.y, C.WIRE_B.y, (x - C.WIRE_A.x) / (C.WIRE_B.x - C.WIRE_A.x))


## 조명 갓 윗변 가운데 (전선에서 LAMP_CORD 아래)
func _shade_top(i: int) -> Vector2:
	var x: float = lamp_xs[i]
	return Vector2(x, roundf(wire_y(x)) + C.LAMP_CORD)


## 전구 (조준 · 깨짐 · 철견 명암의 빛 방향 기준)
func lamp_pos(i: int) -> Vector2:
	return _shade_top(i) + Vector2(0, C.LAMP_SHADE.y)


## 깨진 조명 아래 바닥 유리 조각
func _drop_glass(i: int) -> void:
	var x: float = lamp_xs[i]
	for k in randi_range(C.GLASS_PIXELS.x, C.GLASS_PIXELS.y):
		_glass.append(Vector2(roundf(x + randf_range(-14.0, 14.0)), floor_y - 1.0 - float(randi() % 2)))


## 물탱크 총알구멍마다 오른쪽 아래로만 휘는 물줄기 2 ~ 3가닥
func _make_jets() -> void:
	_jets = []
	for hp in C.TANK_HOLES:
		var o: Vector2 = C.TANK_RECT.position + hp
		for k in randi_range(C.JET_STRANDS.x, C.JET_STRANDS.y):
			_jets.append({ "o": o, "vx": randf_range(C.JET_SPEED.x, C.JET_SPEED.y), "vy": randf_range(-14.0, 6.0), "ph": randf() })


## 조명 하나가 깨짐: 유리 파편 + 불꽃 (소리는 Main)
func break_lamp(i: int) -> void:
	if i < 0 or i >= lamps.size() or not lamps[i]:
		return
	lamps[i] = false
	_drop_glass(i)
	var c := lamp_pos(i) + Vector2(0, 4)
	for k in 8:
		_shards.append({ "pos": c, "vel": Vector2(randf_range(-90, 90), randf_range(-120, 20)), "rot": randf() * TAU,
			"vrot": randf_range(-14, 14), "size": randf_range(1.5, 3), "color": Color("#9fb4d8"), "t": 0.0 })
	var main := _main()
	if main != null:
		main.effects.burst(c, 12, Config.colors.parry, 200.0, PI / 2.0, PI, 0.3, { "glow": true, "streak": true })


## 도탄 반사면 (세로): [{ x, y0, y1, side }] — side = 면이 바라보는 쪽 (-1 왼쪽 · 1 오른쪽)
## 떨어진 간판의 왼쪽 · 오른쪽 끝면 (9° 기운 거의 세로인 면 — 가운데 x 로 근사, 바닥 아래는 뺌)
func reflectors() -> Array:
	var out := []
	if sign_state == "down":
		var k := sign_corners()
		var lx: float = (k[0].x + k[3].x) / 2.0
		var rx: float = (k[1].x + k[2].x) / 2.0
		out.append({ "x": lx, "y0": minf(k[0].y, k[3].y), "y1": minf(maxf(k[0].y, k[3].y), floor_y), "side": -1, "name": "간판", "ray": false })
		out.append({ "x": rx, "y0": minf(k[1].y, k[2].y), "y1": minf(maxf(k[1].y, k[2].y), floor_y), "side": 1, "name": "간판", "ray": false })
	return out


# ---------------------------------------------------------------- 빛 · 번개
## 정전 중 순간 빛 (총구 섬광 등)
func flash_light(pos: Vector2, r := C.MUZZLE_LIGHT_R, life := C.MUZZLE_LIGHT_TIME) -> void:
	_lights.append({ "pos": pos, "r": r, "t": 0.0, "life": life, "warm": true })
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
		if _sign_t >= C.SIGN_FALL:
			_place_sign()
			var main := _main()
			if main != null:
				var k := sign_corners()
				main.add_shake(4.0, 0.2, PI / 2.0)
				main.effects.burst(Vector2(k[2].x, floor_y), 14, Palette.STRUCT_LIGHT, 140.0, -PI / 2.0, 1.4, 0.4, {})
				main.effects.burst(Vector2((k[0].x + k[1].x) / 2.0, floor_y - 6.0), 10, Config.colors.parry, 180.0, -PI / 2.0, PI, 0.25, { "glow": true, "streak": true })
			Audio.boss_armor(0.6)
	# 떨어진 간판 오른쪽 끝: 가끔 노란 불꽃 (끊긴 전선)
	if sign_state == "down" and arena_phase == 2:
		_spark_t -= rd
		if _spark_t <= 0.0:
			_spark_t = randf_range(C.SIGN_SPARK_EVERY.x, C.SIGN_SPARK_EVERY.y)
			var main := _main()
			if main != null:
				var k := sign_corners()
				var at: Vector2 = k[1].lerp(k[2], 0.3)
				for n in randi_range(C.SIGN_SPARKS.x, C.SIGN_SPARKS.y):
					main.effects.spawn(at, Vector2(randf_range(10.0, 70.0), -randf_range(30.0, 110.0)), randf_range(0.15, 0.3),
						Config.colors.parry if n % 2 == 0 else Config.colors.parry_hot, { "glow": true, "grav": 400.0 })
				sign_sparks += 1
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
	# 비 (1장 공통 Rain): 정전 = dark · 폭우 = heavy · 평소 normal, 피날레 빗방울 구간은 느리게
	var main := _main()
	if main != null and main.background != null:
		main.background.set_rain("dark" if blackout else ("heavy" if storm else "normal"), rain_mul)
	queue_redraw()
	_dark.queue_redraw()


# ---------------------------------------------------------------- 그리기
func _view() -> Rect2:
	var main := _main()
	return main.view_rect() if main != null else Rect2(0, 0, Config.view.w, Config.view.h)


## 무대 소품 (배경 쪽, 사양 좌표 · Palette 색): 전선 · 조명 3개 + 원뿔 빛 · 네온 간판 · 물탱크 · 난간 · 물웅덩이
func _draw() -> void:
	var P := Palette
	# 전선 (1px)
	draw_line(C.WIRE_A, C.WIRE_B, P.STRUCT_LIGHT, -1.0)
	# 원뿔 빛 (켜진 조명): 전구 폭 → 바닥에서 LAMP_CONE_W, 투명도 약 10%
	for i in lamp_xs.size():
		if not lamps[i]:
			continue
		var b := lamp_pos(i)
		var hw: float = C.LAMP_BULB.x / 2.0
		var cw: float = C.LAMP_CONE_W / 2.0
		draw_colored_polygon(PackedVector2Array([b + Vector2(-hw, 1), b + Vector2(hw, 1), Vector2(b.x + cw, floor_y), Vector2(b.x - cw, floor_y)]),
			Color(P.LAMP_LIGHT, P.LAMP_CONE_ALPHA))
		draw_colored_polygon(PackedVector2Array([b + Vector2(-hw, 1), b + Vector2(hw, 1), Vector2(b.x + cw * 0.55, floor_y), Vector2(b.x - cw * 0.55, floor_y)]),
			Color(P.LAMP_LIGHT, P.LAMP_CONE_ALPHA * 0.6))
		# 바닥에 떨어진 빛 웅덩이
		draw_set_transform(Vector2(b.x, floor_y + 2), 0.0, Vector2(1.0, 0.18))
		draw_circle(Vector2.ZERO, cw * 0.8, Color(P.LAMP_LIGHT, P.LAMP_CONE_ALPHA * 0.8))
		draw_set_transform_matrix(Transform2D.IDENTITY)
	# 조명: 줄 · 갓 (9×3) · 전구 (7×1)
	for i in lamp_xs.size():
		var st := _shade_top(i)
		draw_line(Vector2(st.x, roundf(wire_y(st.x))), st, P.STRUCT_LIGHT, -1.0)
		var sw: float = C.LAMP_SHADE.x
		draw_rect(Rect2(st + Vector2(-floorf(sw / 2.0), 0), C.LAMP_SHADE), P.STRUCT_LIGHT)
		draw_rect(Rect2(st + Vector2(-floorf(sw / 2.0), 0), Vector2(sw, 1)), Color(P.RIM, 0.6))
		var bulb := Rect2(lamp_pos(i) + Vector2(-floorf(C.LAMP_BULB.x / 2.0), 0), C.LAMP_BULB)
		if lamps[i]:
			draw_rect(bulb.grow(1.0), Color(P.LAMP_LIGHT, 0.25))
			draw_rect(bulb, P.LAMP_LIGHT)
		else:
			draw_rect(bulb, P.STRUCT_EDGE)
	# 네온 간판: 걸려 있음 → (체인 끊어짐) 낙하 → 바닥에 기울어져 박힘. 끊어진 체인은 원래 자리에
	var r: Rect2 = C.SIGN_RECT
	match sign_state:
		"hang":
			for cx in C.SIGN_CHAINS:
				_draw_chain(Vector2(cx, roundf(wire_y(cx))), Vector2(cx, r.position.y))
			_draw_neon(r.get_center(), 0.0, true)
		"falling", "down":
			for cx in C.SIGN_CHAINS:
				var wy := roundf(wire_y(cx))
				_draw_chain(Vector2(cx, wy), Vector2(cx, wy + C.SIGN_CHAIN_LEFT))
			var down_c := sign_down_xf() * (C.SIGN_SIZE / 2.0)
			var th := deg_to_rad(C.SIGN_TILT)
			if sign_state == "falling":
				var u := clampf(_sign_t / C.SIGN_FALL, 0.0, 1.0)
				_draw_neon(sign_hang.lerp(down_c, u * u), th * u * u, true)
			else:
				if arena_phase == 2:
					_draw_sign_glow()
				_draw_neon(down_c, th, arena_phase < 3, arena_phase >= 3)
	_draw_tank()
	_draw_jets()
	for g in _glass:         # 깨진 조명 아래 유리 조각
		draw_rect(Rect2(g, Vector2.ONE), Color(Palette.SPLASH, 0.7))
	_draw_rails()
	_draw_puddles()
	# 파편
	for sh in _shards:
		draw_set_transform(sh.pos, sh.rot, Vector2.ONE)
		draw_rect(Rect2(-sh.size / 2.0, -sh.size / 4.0, sh.size, sh.size / 2.0), sh.color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 체인: 1px 고리 (2px 간격으로 밝고 어두운 점)
func _draw_chain(a: Vector2, b: Vector2) -> void:
	var y := a.y
	var i := 0
	while y < b.y:
		draw_rect(Rect2(Vector2(a.x - (i % 2), y), Vector2(1 + (i % 2), 2)), Palette.STRUCT_LIGHT if i % 2 == 0 else Palette.STRUCT_DARK)
		y += 2.0
		i += 1


## 네온 간판 (96×30, 짙은 판 + 분홍 네온 획 8개 + 주변 분홍 글로우). lit = 켜짐
func _draw_neon(c: Vector2, rot: float, lit: bool, dim := false) -> void:
	var r: Rect2 = C.SIGN_RECT
	var w := r.size.x
	var h := r.size.y
	var P := Palette
	draw_set_transform(c.round(), rot, Vector2.ONE)
	var on := lit and fmod(Time.get_ticks_msec() / 1000.0, 3.1) > 0.08
	if on:   # 글로우 (네온만 번짐)
		for g in [[10.0, 0.05], [6.0, 0.08], [3.0, 0.12]]:
			draw_rect(Rect2(-w / 2.0 - g[0], -h / 2.0 - g[0], w + g[0] * 2.0, h + g[0] * 2.0), Color(P.NEON_PINK, g[1]))
	draw_rect(Rect2(-w / 2.0, -h / 2.0, w, h), C.SIGN_PLATE)
	draw_rect(Rect2(-w / 2.0, -h / 2.0, w, h), P.STRUCT_EDGE, false, 1.0)
	draw_rect(Rect2(-w / 2.0 + 1, -h / 2.0 + 1, w - 2, 1), Color(P.RIM, 0.35))
	if dim:   # 페이즈 3: 어두운 자주로 희미하게
		draw_rect(Rect2(-w / 2.0 - 3, -h / 2.0 - 3, w + 6, h + 6), Color(P.NEON_PINK_DARK, 0.08))
	var col: Color = P.NEON_PINK if on else (Color(P.NEON_PINK_DARK, 0.75) if dim else P.NEON_PINK_DARK)
	var o := Vector2(-w / 2.0, -h / 2.0)
	for st in C.SIGN_STROKES:
		var a: Vector2 = o + st[0]
		var b: Vector2 = o + st[1]
		if on:
			draw_line(a + Vector2.ONE, b + Vector2.ONE, Color(col, 0.3), 5.0)      # 획 둘레 번짐
		if a.x == b.x or a.y == b.y:      # 가로 · 세로 획: 2px 사각형
			draw_rect(Rect2(Vector2(minf(a.x, b.x), minf(a.y, b.y)), (b - a).abs() + Vector2(2, 2)), col)
		else:                             # 사선 획
			draw_line(a + Vector2.ONE, b + Vector2.ONE, col, 2.0)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 떨어진 간판 아래 바닥 분홍 반사광 (사양 x 186 ~ 300 · 바닥 +2 ~ +30 → 바닥 아래 띠로 눌러 담음, 투명도 15%, 번짐)
func _draw_sign_glow() -> void:
	var g: Rect2 = C.SIGN_GLOW
	var y0 := _floor_band(floor_y - C.STAGE_Y + g.position.y)
	var y1 := _floor_band(floor_y - C.STAGE_Y + g.end.y)
	for k in 4:      # 번짐: 가운데가 진하고 바깥으로 옅게
		var gr := Rect2(g.position.x - k * 3.0, y0 - k, g.size.x + k * 6.0, y1 - y0 + k * 2.0)
		draw_rect(gr, Color(Palette.NEON_PINK, C.SIGN_GLOW_ALPHA * (0.45 if k == 0 else 0.2)))


## 물줄기: 총알구멍에서 오른쪽 아래로 휘는 1px 포물선 + 흘러내리는 물방울 + 바닥 물 튀김. 페이즈 3 은 1가닥만 약하게
func _draw_jets() -> void:
	if _jets.is_empty():
		return
	var n := 1 if arena_phase >= 3 else _jets.size()
	var al: float = C.JET_ALPHA_DARK if arena_phase >= 3 else C.JET_ALPHA
	var now := Time.get_ticks_msec() / 1000.0
	for i in n:
		var j: Dictionary = _jets[i]
		var o: Vector2 = j.o
		var vx: float = j.vx * (0.6 if arena_phase >= 3 else 1.0)
		var vy: float = j.vy
		var g: float = C.JET_GRAVITY
		# 바닥까지 걸리는 시간
		var dy := floor_y - o.y
		var T := (-vy + sqrt(vy * vy + 2.0 * g * dy)) / g
		var prev := o
		var steps := 14
		for k in range(1, steps + 1):
			var t := T * float(k) / steps
			var q := (o + Vector2(vx * t, vy * t + 0.5 * g * t * t)).round()
			draw_line(prev, q, Color(Palette.SPLASH, al * (1.0 - 0.4 * float(k) / steps)), -1.0)
			prev = q
		# 흘러내리는 물방울 2개
		for d in 2:
			var u := fmod(now * 1.6 + float(j.ph) + d * 0.5, 1.0)
			var t := T * u
			draw_rect(Rect2((o + Vector2(vx * t, vy * t + 0.5 * g * t * t)).round(), Vector2.ONE), Color(Palette.SPLASH, al + 0.25))
		# 바닥 물 튀김
		var land := Vector2(o.x + vx * T, floor_y)
		var sp := fmod(now * 5.0 + float(j.ph) * 3.0, 1.0)
		draw_rect(Rect2((land + Vector2(-1.0 - sp * 2.0, -1.0 - sp * 2.0)).round(), Vector2.ONE), Color(Palette.SPLASH, al * (1.0 - sp)))
		draw_rect(Rect2((land + Vector2(1.0 + sp * 2.0, -1.0 - sp * 1.5)).round(), Vector2.ONE), Color(Palette.SPLASH, al * (1.0 - sp)))


## 물탱크: 40×52 원통 (가로 줄무늬 10px · 왼쪽 림라이트 · 오른쪽 어두운 면) + 위 뚜껑 타원 + 다리 2개 (바닥까지)
func _draw_tank() -> void:
	var P := Palette
	var r: Rect2 = C.TANK_RECT
	for lx in [r.position.x + 6.0, r.end.x - 8.0]:
		draw_rect(Rect2(lx, r.end.y, 2, floor_y - r.end.y), P.STRUCT_DARK)
		draw_rect(Rect2(lx, r.end.y, 1, floor_y - r.end.y), Color(P.RIM, 0.25))
	draw_rect(Rect2(r.position.x + 4, r.end.y + 16, r.size.x - 8, 2), P.STRUCT_DARK)       # 다리 가로대
	draw_rect(r, P.STRUCT_LIGHT)
	draw_rect(Rect2(r.end.x - 12, r.position.y, 12, r.size.y), P.STRUCT_DARK)            # 오른쪽 그늘
	var y := r.position.y + C.TANK_STRIPE
	while y < r.end.y - 1:
		draw_rect(Rect2(r.position.x, y, r.size.x, 1), P.STRUCT_EDGE)
		y += C.TANK_STRIPE
	draw_rect(Rect2(r.position.x, r.position.y, 1, r.size.y), P.RIM)                      # 왼쪽 림라이트
	draw_rect(Rect2(r.position.x + 1, r.position.y, 1, r.size.y), Color(P.RIM, 0.35))
	draw_rect(r, P.STRUCT_EDGE, false, 1.0)
	# 위 뚜껑 (타원)
	draw_set_transform(Vector2(r.get_center().x, r.position.y), 0.0, Vector2(1.0, 0.22))
	draw_circle(Vector2.ZERO, r.size.x / 2.0 + 1.0, P.STRUCT_EDGE)
	draw_circle(Vector2.ZERO, r.size.x / 2.0, P.STRUCT_LIGHT)
	draw_arc(Vector2.ZERO, r.size.x / 2.0 - 1.0, PI, TAU, 24, Color(P.RIM, 0.6), 1.0)
	draw_set_transform_matrix(Transform2D.IDENTITY)
	if tank_burst:   # 총알구멍 3개 (찢긴 테두리 1px)
		for hp in C.TANK_HOLES:
			draw_rect(Rect2(r.position + hp - Vector2(1, 1), Vector2(3, 3)), Color(P.RIM, 0.3))
			draw_rect(Rect2(r.position + hp - Vector2(1, 1), Vector2(2, 2)), P.STRUCT_EDGE)


## 난간: 왼쪽 · 오른쪽, 높이 14px, 기둥 5px 간격, 윗면 림라이트
func _draw_rails() -> void:
	var P := Palette
	for rx in [C.RAIL_L, C.RAIL_R]:
		var top: float = floor_y - C.RAIL_H
		var x: float = rx.x
		while x <= rx.y:
			draw_rect(Rect2(x, top, 1, C.RAIL_H), P.STRUCT_DARK)
			x += C.RAIL_GAP
		draw_rect(Rect2(rx.x, top, rx.y - rx.x, 2), P.STRUCT_LIGHT)
		draw_rect(Rect2(rx.x, top, rx.y - rx.x, 1), P.RIM)
		draw_rect(Rect2(rx.x, top + 7, rx.y - rx.x, 1), P.STRUCT_DARK)


## 바닥 아래 띠 y (사양: 바닥 222 ~ 화면 270 의 48px → 이 방 바닥 ~ 화면 아래)
func _floor_band(y: float) -> float:
	var band := float(Config.view.h) - floor_y
	return floor_y + (y - (floor_y - C.STAGE_Y)) * band / (float(Config.view.h) - (floor_y - C.STAGE_Y))


## 물웅덩이 4개 (어두운 타원 + 가운데 분홍 반사선)
func _draw_puddles() -> void:
	var P := Palette
	for pr in C.PUDDLES:
		var y0 := roundf(_floor_band(pr.position.y))
		var h := maxf(2.0, roundf(_floor_band(pr.end.y) - y0))
		var c := Vector2(pr.position.x + pr.size.x / 2.0, y0 + h / 2.0)
		draw_set_transform(c, 0.0, Vector2(1.0, h / pr.size.x))
		draw_circle(Vector2.ZERO, pr.size.x / 2.0, C.PUDDLE_COLOR)
		draw_set_transform_matrix(Transform2D.IDENTITY)
		var lw := roundf(pr.size.x * 0.45)
		if arena_phase < 3:
			draw_rect(Rect2(roundf(c.x - lw / 2.0), roundf(c.y), lw, 1), Color(P.NEON_PINK, 0.55))


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
		arr.append(Vector4(l.pos.x, l.pos.y, l.r, k + (1.0 if l.get("warm", false) else 0.0)))   # 1 넘으면 따뜻한 빛
	while arr.size() < 8:
		arr.append(Vector4(0, 0, 1, 0))
	mat.set_shader_parameter("lights", arr)
	mat.set_shader_parameter("darkness", C.DARKNESS * (1.0 - _reveal))
	mat.set_shader_parameter("vignette", C.VIGNETTE * (1.0 - _reveal))
	mat.set_shader_parameter("warm", C.MUZZLE_WARM)
	_dark.draw_rect(_view().grow(16.0), Color.WHITE)

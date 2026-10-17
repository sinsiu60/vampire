@tool
extends Node2D
class_name Door
## 방의 입구/출구 — 하운드 보안 셔터. 방 안의 하운드 경비원이 전부 쓰러지면 보안 잠금이 풀려 열린다.
## 이미지 없이 _draw 로 그림. 수치는 모두 Config.door. 출구 표시는 하늘색(colors.ui)만 씀.
##
## 종류 (door_type, 같은 상태 규칙 · 모양만 다름) — 노드 위치 기준점:
##  shutter  셔터문 24×40 — 문 아래 가운데 (바닥 위)
##  vent     벽·천장 철망 덮개 — 덮개 가운데. 열리면 덮개가 떨어져 나감 → 점프해서 들어감
##  manhole  바닥 맨홀 — 바닥 윗면 가운데 (타일 8px 격자에 맞춰짐). 아래 지형은 자동으로 뚫림 → 떨어지면 이동
##  boss     보스방 문 — 셔터의 1.5배, 두꺼운 이중 셔터가 위아래로 갈라짐. door_boss.wav + 무전 한 줄
##
## 상태: 잠김(LOCKED, 충돌 있음) → 열리는 중(OPENING, open()) → 열림(OPEN, 충돌 없음)
## 시간표 (실제 시간, 효과음과 맞춤)
##  일반  0초 door_open.wav · 상태등 하늘색 · 간판 지지직 / 0.50초 2프레임 멈칫 / 0.64초 완전히 열림 + 먼지 + 흔들림 2px
##  보스  0초 door_boss.wav · 상태등 회전 / 0.35초 잠금 해제 쿵 + 흔들림 3px / 0.4~2.1초 증기 + 미세 진동 1px /
##        2.18초 이중 셔터가 0.2초 만에 갈라짐 + 흔들림 6px
## 문이 놓인 자리의 지형 타일은 실행할 때 지워짐 (벽 속에 문을 놓아도 통로가 생김).
## @tool — 에디터에서도 그려져서 방 씬에서 보며 옮길 수 있음.

enum { LOCKED, OPENING, OPEN }

@export_enum("entrance", "exit") var kind := "exit":
	set(v):
		kind = v
		queue_redraw()
@export_enum("shutter", "vent", "manhole", "boss") var door_type := "shutter":
	set(v):
		door_type = v
		queue_redraw()
## 보스방 문이 열리는 동안 화면 아래에 잡음 섞여 나오는 무전 한 줄
@export_multiline var radio_text := "철견이다. 쌍권총 조심해."

var state := LOCKED
var is_open: bool:               ## 잠금이 풀렸는가 (열리는 중 포함)
	get: return state != LOCKED
var t := 0.0                     ## open() 뒤 실제 시간 (초)
var open_t := -1.0               ## 완전히 열린 뒤 실제 시간 (초), 아니면 -1

var _life := 0.0                 # 생긴 뒤 실제 시간 — 잠김 깜빡임 · 간판 흐름
var _body: StaticBody2D
var _shape: CollisionShape2D
var _fired := {}                 # 시간표 이벤트를 한 번만
var _drops: Array = []           # 빛 속을 지나는 빗방울 { x, y }
var _sparkles: Array = []        # 바닥에 닿아 반짝 { x, t }
var _rain_acc := 0.0
var _cover := {}                 # 떨어져 나간 철망 덮개 { pos, vel, rot, vrot, rest_t }
var _sound: AudioStreamPlayer

static var _editor_cfg := {}


# ---------------------------------------------------------------- 수치
## Config.door (+ "_UI" 하늘색). 에디터에선 오토로드가 없어 Config.gd 를 직접 읽음
static func cfg() -> Dictionary:
	if not Engine.is_editor_hint():
		if not Config.door.has("_UI"):
			Config.door["_UI"] = Config.colors.ui
		return Config.door
	if _editor_cfg.is_empty():
		var c: Node = load("res://scripts/autoload/Config.gd").new()
		_editor_cfg = c.door.duplicate(true)
		_editor_cfg["_UI"] = c.colors.ui
		c.free()
	return _editor_cfg


## 문틀 크기 (셔터 · 보스) — 보스는 BOSS_SCALE 배
func _frame_size() -> Vector2:
	var D := cfg()
	var k: float = D.BOSS_SCALE if door_type == "boss" else 1.0
	return Vector2(D.W, D.H) * k


func _frame_px() -> float:
	var D := cfg()
	return D.BOSS_FRAME if door_type == "boss" else D.FRAME


## 통로(열린 뒤 들어가는 곳) — 로컬
func opening_rect() -> Rect2:
	var D := cfg()
	match door_type:
		"vent":
			return Rect2(-D.VENT_W / 2.0, -D.VENT_H / 2.0, D.VENT_W, D.VENT_H)
		"manhole":
			return Rect2(-D.MANHOLE_W / 2.0, 0.0, D.MANHOLE_W, 8.0)
		_:
			var s := _frame_size()
			var f := _frame_px()
			return Rect2(-s.x / 2.0 + f, -s.y + f, s.x - 2.0 * f, s.y - f)


## 잠긴 동안 막는 충돌 — 로컬
func _block_rect() -> Rect2:
	match door_type:
		"vent", "manhole":
			return opening_rect()
		_:
			var s := _frame_size()
			return Rect2(-s.x / 2.0, -s.y, s.x, s.y)


## 문 전체 (화면 밖 안내 · 테스트) — 전역
func rect() -> Rect2:
	var r := _block_rect()
	return Rect2(global_position + r.position, r.size)


# ---------------------------------------------------------------- 시작
func _ready() -> void:
	if Engine.is_editor_hint():
		return
	add_to_group("doors")
	var room := get_parent()
	var terrain: TileMapLayer = room.get_node_or_null("Terrain")
	var tile: float = Config.room.tile
	if door_type == "manhole":
		global_position.x = roundf(global_position.x / tile) * tile   # 구멍을 타일 격자에 맞춤
	if terrain != null:
		_carve(terrain, tile)
	# 잠긴 동안 지형처럼 막음 (플레이어 · 적 · 총알 · 시야)
	_body = StaticBody2D.new()
	_body.collision_layer = Config.layers.terrain
	_body.collision_mask = 0
	_shape = CollisionShape2D.new()
	var box := RectangleShape2D.new()
	var br := _block_rect()
	box.size = br.size
	_shape.shape = box
	_shape.position = br.get_center()
	_body.add_child(_shape)
	add_child(_body)


## 문이 놓인 자리의 지형 타일을 지움 (맨홀은 바닥 아래 끝까지 구멍)
func _carve(terrain: TileMapLayer, tile: float) -> void:
	var r := rect()
	if door_type == "manhole":
		var bottom: float = terrain.get_used_rect().end.y * tile
		r = Rect2(global_position.x - cfg().MANHOLE_W / 2.0, global_position.y, cfg().MANHOLE_W, bottom - global_position.y)
	elif door_type != "vent":
		var o := opening_rect()
		r = Rect2(global_position + o.position, o.size)
	var c0 := Vector2i(floori((r.position.x + 0.01) / tile), floori((r.position.y + 0.01) / tile))
	var c1 := Vector2i(floori((r.end.x - 0.01) / tile), floori((r.end.y - 0.01) / tile))
	for cy in range(c0.y, c1.y + 1):
		for cx in range(c0.x, c1.x + 1):
			terrain.erase_cell(Vector2i(cx, cy))


# ---------------------------------------------------------------- 열기
## 보안 잠금 해제 (출구만). Main 이 마지막 적의 킬 연출이 끝난 직후 부름
## boss_sound = 보스 처치 뒤 출구: 모양은 그대로, 소리만 door_boss.wav
func open(boss_sound := false) -> void:
	if state != LOCKED or kind != "exit":
		return
	state = OPENING
	t = 0.0
	_fired = {}
	_sound = Audio.door(door_type == "boss" or boss_sound)
	queue_redraw()


## 열린 문 안쪽에 플레이어가 들어갔는가 → 다음 방
func player_entered(p: Player) -> bool:
	if state != OPEN or kind != "exit":
		return false
	var o := opening_rect()
	var g := Rect2(global_position + o.position, o.size)
	match door_type:
		"vent":
			return g.intersects(p.body_rect())
		"manhole":
			return p.global_position.y > global_position.y + cfg().MANHOLE_FALL \
				and absf(p.center().x - global_position.x) < cfg().MANHOLE_W / 2.0 + 2.0
		_:
			return g.has_point(p.center())


## 보스방 문 무전: 열리는 동안 + 다 열린 뒤 RADIO_HOLD 초 → { text, t, alpha }, 아니면 빈 Dictionary
func radio_state() -> Dictionary:
	if door_type != "boss" or radio_text == "" or state == LOCKED:
		return {}
	var a := 1.0
	if state == OPEN:
		var hold: float = cfg().RADIO_HOLD
		if open_t > hold:
			return {}
		a = clampf((hold - open_t) / 0.4, 0.0, 1.0)
	return { "text": radio_text, "t": t, "alpha": a }


## 일반 문 진행도 0~1: DOOR_STUTTER_TIME 에 STUTTER_FRAMES 프레임 멈칫한 뒤 DOOR_OPEN_TIME 에 딱 끝나게
func progress() -> float:
	var D := cfg()
	if state == LOCKED:
		return 0.0
	if state == OPEN:
		return 1.0
	if door_type == "boss":
		return clampf((t - D.BOSS_DOOR_OPEN) / D.BOSS_OPEN_TIME, 0.0, 1.0)
	var T: float = D.DOOR_OPEN_TIME
	var st: float = D.DOOR_STUTTER_TIME
	var hold: float = float(D.STUTTER_FRAMES) / Config.fps
	var te: float
	if t < st:
		te = t
	elif t < st + hold:
		te = st
	else:
		te = st + (t - st - hold) * (T - st) / (T - st - hold)
	return clampf(te / T, 0.0, 1.0)


func _main() -> Node:
	return get_tree().get_first_node_in_group("game")


func _physics_process(_delta: float) -> void:
	if Engine.is_editor_hint():
		return
	var dt := 1.0 / Config.fps          # 실제 시간 (히트스톱·킬 스톱과 상관없이 소리와 맞춤)
	_life += dt
	if state == OPENING:
		t += dt
		if door_type == "boss":
			_boss_timeline(dt)
		else:
			_timeline()
	elif state == OPEN:
		open_t += dt
		_update_rain(dt)
	if not _cover.is_empty():
		_update_cover(dt)
	queue_redraw()


func _timeline() -> void:
	var D := cfg()
	if t >= D.DOOR_OPEN_TIME and not _fired.has("open"):
		_fired["open"] = true
		if door_type == "vent":
			_detach_cover()
		_finish(D.OPEN_SHAKE, D.SHAKE_TIME)


func _boss_timeline(dt: float) -> void:
	var D := cfg()
	var main := _main()
	var s := _frame_size()
	if t >= D.BOSS_DOOR_UNLOCK and not _fired.has("unlock"):
		_fired["unlock"] = true
		if main != null:
			main.add_shake(D.BOSS_UNLOCK_SHAKE, D.SHAKE_TIME, PI / 2.0)
		_dust(Vector2(0, -s.y / 2.0), 6, s.x * 0.8)
	# 문 틈새 증기 + 미세 진동
	if t >= D.BOSS_STEAM_START and t < D.BOSS_STEAM_END:
		if main != null:
			main.rumble(D.BOSS_RUMBLE)
		_rain_acc += D.BOSS_STEAM_RATE * dt
		while _rain_acc >= 1.0:
			_rain_acc -= 1.0
			_steam(s)
	if t >= D.BOSS_DOOR_OPEN and not _fired.has("split"):
		_fired["split"] = true
		if main != null:
			main.add_shake(D.BOSS_OPEN_SHAKE, D.BOSS_SHAKE_TIME, PI / 2.0)
		_dust(Vector2(0, -s.y / 2.0), 10, s.x)
	if t >= D.BOSS_DOOR_OPEN + D.BOSS_OPEN_TIME and not _fired.has("open"):
		_fired["open"] = true
		_rain_acc = 0.0
		_finish(0.0, 0.0)


## 완전히 열림: 충돌 제거 + 먼지 + 흔들림
func _finish(shake: float, shake_time: float) -> void:
	var D := cfg()
	state = OPEN
	open_t = 0.0
	if _shape != null:
		_shape.set_deferred("disabled", true)
	var main := _main()
	if main != null and shake > 0.0:
		main.add_shake(shake, shake_time, PI / 2.0)
	match door_type:
		"manhole":
			_dust(Vector2.ZERO, D.DUST_COUNT, D.MANHOLE_COVER_W)
		"vent":
			_dust(Vector2(0, D.VENT_H / 2.0), D.DUST_COUNT / 2, D.VENT_W)
		_:
			var s := _frame_size()
			_dust(Vector2.ZERO, D.DUST_COUNT, s.x)
			_dust(Vector2(0, -s.y + _frame_px() + 2.0), D.DUST_COUNT / 2, s.x * 0.7, true)


## 먼지: local 위치에서 width 폭으로 (falling = 위에서 떨어지는 먼지)
func _dust(local: Vector2, n: int, width: float, falling := false) -> void:
	var main := _main()
	if main == null:
		return
	var D := cfg()
	var C: Dictionary = Config.colors
	for i in n:
		var a := -PI / 2.0 + randf_range(-1.2, 1.2)
		var v: float = D.DUST_SPEED * randf_range(0.3, 1.0)
		var vel := Vector2(cos(a) * v, sin(a) * v)
		if falling:
			vel = Vector2(randf_range(-15, 15), randf_range(10, 40))
		main.effects.spawn(global_position + local + Vector2(randf_range(-width / 2.0, width / 2.0), -1.0), vel,
			randf_range(0.35, 0.7), C.dust[i % C.dust.size()],
			{ "size": 2.0 if randf() < 0.5 else 3.0, "grav": 200.0 if falling else 60.0 })


## 보스 문 틈새(가운데 이음매 양 끝)에서 증기
func _steam(s: Vector2) -> void:
	var main := _main()
	if main == null:
		return
	var side := 1.0 if randf() < 0.5 else -1.0
	var p := global_position + Vector2(side * (s.x / 2.0 - _frame_px()) * randf_range(0.2, 1.0), -s.y / 2.0)
	main.effects.spawn(p, Vector2(side * randf_range(15, 45), randf_range(-25, -5)), randf_range(0.4, 0.8),
		Color(0.78, 0.82, 0.88, 0.7), { "size": 2.0 if randf() < 0.6 else 3.0, "grav": -30.0 })


# ---------------------------------------------------------------- 철망 덮개가 떨어져 나감
func _detach_cover() -> void:
	_cover = { "pos": global_position, "vel": Vector2(randf_range(-40, -10), -30.0), "rot": 0.0,
		"vrot": randf_range(-7.0, -3.0), "rest_t": -1.0 }


func _update_cover(dt: float) -> void:
	var c := _cover
	if c.rest_t >= 0.0:
		c.rest_t += dt
		if c.rest_t > 1.2:
			_cover = {}
		return
	c.vel.y += Config.enemy.gravity * dt
	c.pos += c.vel * dt
	c.rot += c.vrot * dt
	var room := get_parent()
	if room.has_method("solid_at") and room.solid_at(c.pos + Vector2(0, cfg().VENT_H * 0.3)):
		c.rest_t = 0.0
		_dust(to_local(c.pos), 4, cfg().VENT_W * 0.6)


# ---------------------------------------------------------------- 빛 속 빗방울
func _update_rain(dt: float) -> void:
	if kind != "exit" or door_type == "vent":
		return
	var D := cfg()
	var gw: float = D.GLOW_W * (D.BOSS_SCALE if door_type == "boss" else 1.0)
	_rain_acc += D.RAIN_RATE * dt
	while _rain_acc >= 1.0:
		_rain_acc -= 1.0
		_drops.append({ "x": randf_range(-gw / 2.0, gw / 2.0), "y": -D.RAIN_FALL - randf() * 20.0 })
	var keep := []
	for d in _drops:
		d.y += D.RAIN_SPEED * dt
		if d.y >= 0.0:
			_sparkles.append({ "x": d.x, "t": 0.0 })
		else:
			keep.append(d)
	_drops = keep
	for s in _sparkles:
		s.t += dt
	_sparkles = _sparkles.filter(func(s): return s.t < D.SPARKLE_TIME)


# ---------------------------------------------------------------- 그리기
func _draw() -> void:
	match door_type:
		"vent": _draw_vent()
		"manhole": _draw_manhole()
		_: _draw_shutter()


func _ui() -> Color:
	return cfg()._UI


## 상태등 색: 잠김 = 회색 (출구는 2초마다 희미하게 깜빡), 열림 = 하늘색
func _lamp_color() -> Color:
	var D := cfg()
	if state != LOCKED:
		return _ui()
	if kind == "exit" and fmod(_life, D.LOCK_BLINK_PERIOD) < D.LOCK_BLINK_TIME:
		return D.LAMP_DIM
	return D.LAMP_OFF


func _draw_lamp(c: Vector2, k := 1.0) -> void:
	var D := cfg()
	var w: float = D.LAMP_W * k
	var h: float = D.LAMP_H * k
	var r := Rect2((c - Vector2(w, h) / 2.0).round(), Vector2(w, h).round())
	var col := _lamp_color()
	if door_type == "boss" and state != LOCKED:
		# 회전등: 하늘색으로 켜지며 밝은 점이 좌우로 돈다
		var on := clampf(t / D.BOSS_DOOR_UNLOCK, 0.0, 1.0) if state == OPENING else 1.0
		draw_rect(r.grow(1.0), Color(_ui(), 0.25 * on))
		draw_rect(r, D.LAMP_OFF.lerp(_ui(), on))
		var ph := sin(_life * D.BOSS_LAMP_SPIN)
		var x := r.position.x + (r.size.x - 2.0) * (ph * 0.5 + 0.5)
		draw_rect(Rect2(roundf(x), r.position.y, 2.0, r.size.y), Color(1, 1, 1, 0.8 * on))
		# 회전하는 빛살 (양옆으로 번쩍)
		var beam := absf(cos(_life * D.BOSS_LAMP_SPIN))
		draw_rect(Rect2(r.position.x - 6.0 * beam, r.position.y, r.size.x + 12.0 * beam, r.size.y), Color(_ui(), 0.18 * on))
		return
	if state != LOCKED:
		draw_rect(r.grow(1.0), Color(_ui(), 0.25))
	draw_rect(r, col)


## 간판 밝기 0~1 (꺼짐 0) — 열리는 중엔 지지직 깜빡인 뒤 켜짐
func _sign_level() -> float:
	var D := cfg()
	if state == LOCKED:
		return 0.0
	if state == OPEN or t >= D.SIGN_ON_AT:
		return 1.0
	for w in D.SIGN_FLICKERS:
		if t >= w[0] and t < w[1]:
			return randf_range(0.5, 1.0)
	return 0.0


## 네온 ">>>" (dir = 오른쪽 / 아래). 열림이면 밝은 마디가 진행 방향으로 흐름
func _draw_sign(c: Vector2, dir := Vector2.RIGHT, k := 1.0) -> void:
	var D := cfg()
	var lv := _sign_level()
	var step := 4.0 * k
	var n := Vector2(-dir.y, dir.x)
	for i in 3:
		var p := c + dir * (i - 1) * step
		var col: Color = D.SIGN_OFF
		if lv > 0.0:
			var a := lv
			if state == OPEN:
				var ph := fmod(_life * D.SIGN_FLOW_SPEED, 3.0)
				var d := fmod(i - ph + 3.0, 3.0)
				a = 0.45 + 0.55 * clampf(1.0 - d, 0.0, 1.0)
			col = Color(_ui(), a)
			draw_polyline(PackedVector2Array([p - dir * 1.5 * k + n * 2.5 * k, p + dir * 1.5 * k, p - dir * 1.5 * k - n * 2.5 * k]),
				Color(_ui(), a * 0.3), 3.0 * k)
		draw_polyline(PackedVector2Array([(p - dir * 1.5 * k + n * 2.5 * k).round(), (p + dir * 1.5 * k).round(),
			(p - dir * 1.5 * k - n * 2.5 * k).round()]), col, 1.0)


## 하운드 마크: 아래를 향한 삼각형 머리 + 귀 두 개
func _draw_mark(c: Vector2, k := 1.0) -> void:
	var col: Color = cfg().MARK_COLOR
	draw_colored_polygon(PackedVector2Array([c + Vector2(-3, -2) * k, c + Vector2(3, -2) * k, c + Vector2(0, 3) * k]), col)
	draw_colored_polygon(PackedVector2Array([c + Vector2(-3, -2) * k, c + Vector2(-2, -4) * k, c + Vector2(-1, -2) * k]), col)
	draw_colored_polygon(PackedVector2Array([c + Vector2(1, -2) * k, c + Vector2(2, -4) * k, c + Vector2(3, -2) * k]), col)


## 바닥 빛 번짐 (반투명 타원) + 빛 속 빗방울 · 반짝임
func _draw_glow(c: Vector2, w: float, h: float) -> void:
	if state != OPEN or kind != "exit":
		return
	var D := cfg()
	var a: float = D.GLOW_ALPHA * clampf(open_t / 0.25, 0.0, 1.0)
	for i in 3:
		var s := 1.0 - i * 0.3
		draw_set_transform(c, 0.0, Vector2(w / 2.0 * s, h / 2.0 * s))
		draw_circle(Vector2.ZERO, 1.0, Color(_ui(), a * (0.5 + i * 0.35)))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	for d in _drops:
		var lit := clampf(1.0 + d.y / D.RAIN_FALL, 0.0, 1.0)     # 바닥(빛)에 가까울수록 밝게
		draw_line(c + Vector2(d.x, d.y - D.RAIN_LEN), c + Vector2(d.x, d.y), Color(_ui(), 0.15 + 0.45 * lit), 1.0)
	for s in _sparkles:
		var k: float = 1.0 - s.t / D.SPARKLE_TIME
		var p := (c + Vector2(s.x, -1.0)).round()
		draw_rect(Rect2(p - Vector2(1, 0), Vector2(3, 1)), Color(1, 1, 1, 0.8 * k))
		draw_rect(Rect2(p - Vector2(0, 1), Vector2(1, 3)), Color(_ui(), 0.8 * k))


func _draw_shutter() -> void:
	var D := cfg()
	var boss := door_type == "boss"
	var k: float = D.BOSS_SCALE if boss else 1.0
	var s := _frame_size()
	var f := _frame_px()
	var o := opening_rect()
	_draw_glow(Vector2.ZERO, D.GLOW_W * k, D.GLOW_H * k)
	# 문틀 (어두운 회색 금속) + 안쪽 검은 통로
	draw_rect(Rect2(-s.x / 2.0, -s.y, s.x, s.y), D.FRAME_COLOR)
	draw_rect(Rect2(-s.x / 2.0, -s.y, s.x, 1.0), D.FRAME_EDGE)
	draw_rect(Rect2(-s.x / 2.0, -s.y, 1.0, s.y), D.FRAME_EDGE)
	draw_rect(o, Color.BLACK)
	var p := progress()
	var drum: float = D.DRUM_H * k
	if boss:
		# 이중 셔터: 위쪽은 위로, 아래쪽은 바닥 속으로 갈라짐
		var half := (o.size.y - drum) / 2.0
		var vis := half * (1.0 - p)
		var mid := o.position.y + drum + half
		if vis > 0.0:
			_slats(Rect2(o.position.x, mid - half, o.size.x, vis), true)
			_slats(Rect2(o.position.x, o.end.y - vis, o.size.x, vis), false)
			# 두꺼운 보강대
			draw_rect(Rect2(o.position.x, mid - half + vis - 2.0, o.size.x, 2.0), D.FRAME_EDGE)
			draw_rect(Rect2(o.position.x, o.end.y - vis, o.size.x, 2.0), D.FRAME_EDGE)
			if p <= 0.0:
				_draw_mark(Vector2(0, mid - 6.0 * k), k)
				# 잠금 빗장 (잠금 해제 "쿵" 전까지 이음매를 가로질러 걸려 있음)
				if state == LOCKED or t < D.BOSS_DOOR_UNLOCK:
					for bx in [-o.size.x * 0.3, o.size.x * 0.3]:
						draw_rect(Rect2(bx - 1.5, mid - 4.0, 3.0, 8.0), D.LAMP_DIM)
		draw_rect(Rect2(o.position.x, o.position.y, o.size.x, drum), D.FRAME_EDGE)
	else:
		# 셔터: 위쪽 통으로 말려 올라감
		var full := o.size.y - drum
		var vis := full * (1.0 - p)
		if vis > 0.0:
			var r := Rect2(o.position.x, o.position.y + drum, o.size.x, vis)
			_slats(r, true)
			var my := r.end.y - full / 2.0
			if my - 4.0 > o.position.y + drum:
				_draw_mark(Vector2(0, my), k)
			draw_rect(Rect2(r.position.x, r.end.y - 1.0, r.size.x, 1.0), D.FRAME_EDGE)   # 아래 손잡이 막대
		draw_rect(Rect2(o.position.x, o.position.y, o.size.x, drum), D.FRAME_EDGE)
	# 상태등 · 간판 (문 위 가운데)
	_draw_lamp(Vector2(0, -s.y - 2.0 * k), k)
	_draw_sign(Vector2(0, -s.y - 8.0 * k), Vector2.RIGHT, k)


## 셔터 판: 짙은 남색 바탕 + 2px 간격 회색 가로줄. from_bottom = 아래 끝 기준으로 줄을 맞춤 (말려 올라갈 때 줄이 같이 움직임)
func _slats(r: Rect2, from_bottom: bool) -> void:
	var D := cfg()
	draw_rect(r, D.SLAT_COLOR)
	var gap: float = D.SLAT_GAP
	var y := r.end.y - 1.0 if from_bottom else r.position.y
	while (from_bottom and y >= r.position.y) or (not from_bottom and y < r.end.y):
		draw_rect(Rect2(r.position.x, y, r.size.x, 1.0), D.SLAT_LINE)
		y += -gap if from_bottom else gap


func _draw_vent() -> void:
	var D := cfg()
	var o := opening_rect()
	# 안쪽 검은 통로 + 1px 틀
	draw_rect(o.grow(1.0), D.FRAME_COLOR)
	draw_rect(o, Color.BLACK)
	if state == OPEN:
		draw_rect(o.grow(2.0), Color(_ui(), 0.12 * clampf(open_t / 0.25, 0.0, 1.0)), false, 1.0)
	# 철망 덮개: 열리는 중엔 덜덜 떨리다 0.50초에 덜컹 처지고, 0.64초에 떨어져 나감
	if state != OPEN:
		var off := Vector2.ZERO
		if state == OPENING:
			if t < D.DOOR_STUTTER_TIME:
				off = Vector2(roundf(randf_range(-1, 1)) * (t / D.DOOR_STUTTER_TIME), 0)
			else:
				off = Vector2(0, 1)
		_grate(o, off, 0.0)
	if not _cover.is_empty():
		_grate(opening_rect(), to_local(_cover.pos), _cover.rot, 1.0 - clampf((_cover.rest_t - 0.8) / 0.4, 0.0, 1.0) if _cover.rest_t >= 0.0 else 1.0)
	_draw_lamp(Vector2(0, o.position.y - 3.0))
	_draw_sign(Vector2(0, o.position.y - 9.0))


func _grate(o: Rect2, off: Vector2, rot: float, alpha := 1.0) -> void:
	var D := cfg()
	draw_set_transform(off, rot, Vector2.ONE)
	var r := Rect2(o.position, o.size)
	draw_rect(r, Color(D.SLAT_COLOR, alpha))
	var x := r.position.x + 1.0
	while x < r.end.x:
		draw_rect(Rect2(x, r.position.y, 1.0, r.size.y), Color(D.SLAT_LINE, alpha))
		x += 3.0
	var y := r.position.y + 1.0
	while y < r.end.y:
		draw_rect(Rect2(r.position.x, y, r.size.x, 1.0), Color(D.SLAT_LINE, alpha))
		y += 3.0
	draw_rect(r, Color(D.FRAME_EDGE, alpha), false, 1.0)
	_draw_mark(r.get_center(), 0.8)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_manhole() -> void:
	var D := cfg()
	var hw: float = D.MANHOLE_W
	var cw: float = D.MANHOLE_COVER_W
	_draw_glow(Vector2.ZERO, D.GLOW_W, D.GLOW_H)
	# 구멍 (아래로 이어지는 검은 수직굴) + 양옆 테두리
	draw_rect(Rect2(-hw / 2.0, 0.0, hw, 40.0), Color.BLACK)
	draw_rect(Rect2(-hw / 2.0 - 2.0, -1.0, 2.0, 3.0), D.FRAME_COLOR)
	draw_rect(Rect2(hw / 2.0, -1.0, 2.0, 3.0), D.FRAME_COLOR)
	# 덮개: 열리는 중엔 옆으로 밀려남 (0.50초 멈칫, 0.64초 끝)
	var p := progress()
	var dx := (cw + 2.0) * p
	if state == OPENING and t < D.DOOR_STUTTER_TIME * 0.3:
		dx += roundf(randf_range(-1, 1)) * 0.5
	var cr := Rect2(-cw / 2.0 + dx, -2.0, cw, 3.0)
	draw_rect(cr, D.SLAT_COLOR)
	draw_rect(Rect2(cr.position.x, cr.position.y, cr.size.x, 1.0), D.FRAME_EDGE)
	var x := cr.position.x + 2.0
	while x < cr.end.x - 1.0:
		draw_rect(Rect2(x, cr.position.y + 1.0, 1.0, 2.0), D.SLAT_LINE)
		x += 3.0
	_draw_mark(Vector2(cr.get_center().x, -5.0), 0.6)
	# 상태등 기둥 (오른쪽) · 아래를 가리키는 간판
	draw_rect(Rect2(cw / 2.0 + 4.0, -6.0, 1.0, 6.0), D.FRAME_COLOR)
	_draw_lamp(Vector2(cw / 2.0 + 4.5, -7.0))
	_draw_sign(Vector2(0, -14.0), Vector2.DOWN)

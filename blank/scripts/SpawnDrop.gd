extends Node2D
class_name SpawnDrop
## 관문 적 소환 연출 (모든 적 공통). SpawnDrop.play(적, 착지 위치) — 적 1명마다 하나.
##  1) 표시 0.00 ~ 0.60  착지 지점 바닥에 납작한 붉은 타원 (커졌다가 깜빡임, 줄어들지 않음 — 패링 신호 아님)
##                       0.25 부터 화면 위 → 타원 붉은 세로 빛줄기 1px 점점 진해짐 · spawn_warn
##  2) 낙하 0.45 ~ 0.60  화면 위 밖에서 직선으로 아주 빠르게 · spawn_whoosh · 스미어 (세로 2.6 · 가로 0.6, 발 기준) + 위쪽 잔상 3개 + 한쪽 림라이트
##  3) 착지 0.60         spawn_land · 납작 2프레임 · 흔들림 · 흰 섬광 1프레임 · 타원이 퍼지며 사라짐 · 먼지 · 바닥 금 · 타원 위 플레이어는 옆으로 밀려남
##  4) 회복 ~1.00        납작 → 웅크림 → 원래 크기. 공격하지 않음 (무적 아님 — 베면 처치)
##  5) 1.00 ~            적 AI 작동 (started 신호)
## 크기 변화는 적 노드의 scale (발 = 노드 원점) — 도형 적이든 나중의 스프라이트 적이든 그대로.
## 잔상은 적의 capture_silhouette() 가 있으면 그 모양, 없으면 몸통 사각형. 시간은 월드 시간 (히트스톱 · 일시정지에 같이 멈춤).
## 수치는 Config.spawn_drop.

signal landed(enemy: Node2D)
signal started(enemy: Node2D)

static var active_marks := 0     ## 지금 떠 있는 (아직 착지 전) 붉은 타원 수 — 관문이 동시 최대를 지킴

var enemy: Node2D
var land := Vector2.ZERO         ## 착지 위치 (발, 전역)
var t := 0.0
var phase := "mark"              ## mark | fall | recover | done
var land_t := 0.0                ## 착지 시각 (= FALL_AT + FALL_TIME)

var _main: Node
var _shapes: Array = []          # 잔상 모양 (capture_silhouette)
var _size := Vector2(12, 24)     # 몸 크기 (잔상 · 림라이트 기본값)
var _fall_from := Vector2.ZERO
var _squash_left := 0
var _squash_start := 0.0
var _since_land := -1.0
var _cracks: Array = []
var _counted := false
var _top: Node2D                 # 적 위에 그리는 층 (림라이트)


## 적을 소환. enemy 가 아직 트리에 없으면 방의 Enemies 아래에 넣음
static func play(e: Node2D, land_pos: Vector2) -> SpawnDrop:
	var tree := Engine.get_main_loop() as SceneTree
	var main: Node = tree.get_first_node_in_group("game")
	var d := SpawnDrop.new()
	d.enemy = e
	d.land = land_pos
	d._main = main
	var room: Node = main.room if main != null else tree.current_scene
	var en: Node = room.get_node_or_null("Enemies")
	if en == null:
		en = room
	room.add_child(d)
	room.move_child(d, en.get_index())          # 적보다 먼저 그림 (타원 · 빛줄기 · 잔상이 적 아래)
	if e.get_parent() == null:
		en.add_child(e)
	d._begin()
	return d


func _begin() -> void:
	var S: Dictionary = Config.spawn_drop
	name = "SpawnDrop"
	land_t = float(S.FALL_AT) + float(S.FALL_TIME)
	_top = Node2D.new()
	_top.z_index = 2
	_top.draw.connect(_draw_top)
	add_child(_top)
	active_marks += 1
	_counted = true
	# 낙하 전에는 보이지도 · 움직이지도 · 적 수에 세지도 않음
	enemy.visible = false
	enemy.set_physics_process(false)
	if enemy.is_in_group("enemies"):
		enemy.remove_from_group("enemies")
	enemy.global_position = land + Vector2(0, -2000)
	enemy.set_meta("spawn_drop", true)
	var ec: Variant = enemy.get("cfg")
	if ec is Dictionary and (ec as Dictionary).has("w"):
		_size = Vector2(float(ec.w), float(ec.h))
	if enemy.has_method("capture_silhouette"):
		_shapes = enemy.capture_silhouette()
	var P: Vector2 = Config.audio.SPAWN_WARN_PITCH
	Audio.sfx_limited("spawn_warn", int(Config.audio.SPAWN_WARN_MAX), randf_range(P.x, P.y))


func _alive() -> bool:
	return enemy != null and is_instance_valid(enemy) and not bool(enemy.get("dead"))


func _physics_process(delta: float) -> void:
	var S: Dictionary = Config.spawn_drop
	t += delta
	match phase:
		"mark":
			if t >= float(S.FALL_AT):
				_start_fall()
		"fall":
			var u := clampf((t - float(S.FALL_AT)) / float(S.FALL_TIME), 0.0, 1.0)
			if _alive():
				enemy.global_position = _fall_from.lerp(land, u)
			if t >= land_t:
				_land()
		"recover":
			_since_land += delta
			_recover_scale()
			if t >= float(S.AI_AT):
				_start_ai()
		"done":
			_since_land += delta
	# 다 끝나면 (금 자국까지) 정리
	if phase == "done" and _since_land >= maxf(float(S.CRACK_TIME), float(S.RING_TIME)):
		queue_free()
	queue_redraw()
	_top.queue_redraw()


func _start_fall() -> void:
	var S: Dictionary = Config.spawn_drop
	phase = "fall"
	if not _alive():
		return
	var top := _cam_top()
	_fall_from = Vector2(land.x, minf(top - float(S.FALL_ABOVE), land.y - 40.0))
	enemy.global_position = _fall_from
	enemy.visible = true
	enemy.scale = Vector2(float(S.SMEAR_X), float(S.SMEAR_Y))
	if enemy.get("facing") != null and _main != null and _main.get("player") != null:
		enemy.set("facing", 1 if _main.player.global_position.x > land.x else -1)
	Audio.sfx("spawn_whoosh")


func _land() -> void:
	var S: Dictionary = Config.spawn_drop
	phase = "recover"
	_since_land = 0.0
	if _counted:
		active_marks = maxi(0, active_marks - 1)
		_counted = false
	Audio.sfx("spawn_land")
	if _alive():
		enemy.global_position = land
		if enemy.get("velocity") != null:
			enemy.set("velocity", Vector2.ZERO)
		enemy.scale = Vector2(float(S.LAND_SQUASH_X), float(S.LAND_SQUASH_Y))
		enemy.add_to_group("enemies")
	_squash_left = int(S.LAND_SQUASH_FRAMES)
	if _main != null:
		_main.add_shake(float(S.LAND_SHAKE), float(S.LAND_SHAKE_TIME), PI / 2.0)
		if Settings.on("screen_flash"):
			_main.screen_fx.flash(Color.WHITE, float(S.LAND_FLASH))
		_dust()
		_push_player()
	_make_cracks()
	landed.emit(enemy)


## 납작 (2프레임) → 웅크림 (CROUCH_IN) → 원래 크기 (RECOVER)
func _recover_scale() -> void:
	var S: Dictionary = Config.spawn_drop
	if not _alive():
		return
	if _squash_left > 0:
		_squash_left -= 1
		_squash_start = _since_land
		return
	var k := _since_land - _squash_start
	var squash := Vector2(float(S.LAND_SQUASH_X), float(S.LAND_SQUASH_Y))
	var crouch := Vector2(float(S.CROUCH_X), float(S.CROUCH_Y))
	if k < float(S.CROUCH_IN):
		enemy.scale = squash.lerp(crouch, k / float(S.CROUCH_IN))
	else:
		var u := clampf((k - float(S.CROUCH_IN)) / float(S.RECOVER), 0.0, 1.0)
		enemy.scale = crouch.lerp(Vector2.ONE, 1.0 - pow(1.0 - u, 2.0))


func _start_ai() -> void:
	phase = "done"
	if not _alive():
		return
	enemy.scale = Vector2.ONE
	enemy.set_physics_process(true)
	enemy.remove_meta("spawn_drop")
	started.emit(enemy)


## 화면 위쪽 끝 (월드 y)
func _cam_top() -> float:
	if _main != null and _main.has_method("view_rect"):
		return _main.view_rect().position.y
	return land.y - Config.view.h


func _dust() -> void:
	var S: Dictionary = Config.spawn_drop
	var C: Dictionary = Config.colors
	for side in [-1.0, 1.0]:
		for i in int(S.DUST):
			var v := Vector2(side * float(S.DUST_SPEED) * randf_range(0.5, 1.2), -randf_range(10.0, 45.0))
			_main.effects.spawn(land + Vector2(side * randf_range(2.0, 8.0), -1.0), v, randf_range(0.3, 0.6),
				C.dust[i % C.dust.size()], { "size": 2.0 if randf() < 0.6 else 3.0, "grav": 160.0 })


## 타원 위에 있던 플레이어를 옆으로 밀어냄 (피해 없음, 벽은 못 뚫음)
func _push_player() -> void:
	var S: Dictionary = Config.spawn_drop
	var p: Node2D = _main.get("player")
	if p == null or p.get("dead"):
		return
	var pr: Rect2 = p.body_rect()
	var mark := Rect2(land.x - float(S.MARK_W) / 2.0, land.y - 24.0, float(S.MARK_W), 26.0)
	if not pr.intersects(mark):
		return
	var dir := 1.0 if p.global_position.x >= land.x else -1.0
	var room: Node = _main.room
	if room != null and room.has_method("move_box"):
		var res: Dictionary = room.move_box(pr, Vector2(dir * float(S.PUSH), 0.0), 1.0)
		p.global_position.x += (res.rect as Rect2).position.x - pr.position.x
	else:
		p.global_position.x += dir * float(S.PUSH)


func _make_cracks() -> void:
	_cracks.clear()
	for side in [-1.0, 1.0]:
		var pts := PackedVector2Array([land + Vector2(side * 2.0, 0.5)])
		var x := 2.0
		for i in 3:
			x += randf_range(2.5, 4.5)
			pts.append(land + Vector2(side * x, 0.5 + float(i % 2)))
		_cracks.append(pts)


# ---------------------------------------------------------------- 그리기
static func _ellipse(c: Vector2, rx: float, ry: float, n := 24) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in n + 1:
		var a := TAU * i / n
		out.append(c + Vector2(cos(a) * rx, sin(a) * ry))
	return out


func _draw() -> void:
	var S: Dictionary = Config.spawn_drop
	var col: Color = S.MARK_COLOR
	var c := to_local(land) + Vector2(0, -1.0)
	var rx := float(S.MARK_W) / 2.0
	var ry := float(S.MARK_H) / 2.0
	if t < land_t:
		# 1) 표시: 커지고 → 깜빡임 (줄어들지 않음)
		var g := clampf(t / float(S.MARK_GROW), 0.0, 1.0)
		var on := t < float(S.MARK_GROW) or fmod(t * float(S.MARK_BLINK_HZ), 1.0) < 0.6
		if on and g > 0.0:
			var k := float(S.MARK_INNER_SCALE)
			draw_colored_polygon(_ellipse(c, rx * g * k, ry * g * k), Color(col, float(S.MARK_INNER_ALPHA)))
			draw_polyline(_ellipse(c, rx * g, ry * g), col, 1.0)
		# 빛줄기 (화면 위 → 타원)
		if t >= float(S.BEAM_AT):
			var a := float(S.BEAM_ALPHA) * clampf((t - float(S.BEAM_AT)) / (land_t - float(S.BEAM_AT)), 0.0, 1.0)
			var top := to_local(Vector2(land.x, _cam_top())).y
			draw_rect(Rect2(roundf(c.x), top, 1.0, c.y - top), Color(col, a))
	elif _since_land >= 0.0 and _since_land < float(S.RING_TIME):
		# 3) 착지: 타원이 바깥으로 RING_SCALE 배까지 퍼지며 사라짐
		var u := _since_land / float(S.RING_TIME)
		var sc := lerpf(1.0, float(S.RING_SCALE), 1.0 - pow(1.0 - u, 2.0))
		draw_polyline(_ellipse(c, rx * sc, ry * sc), Color(col, 1.0 - u), 1.0)
	# 바닥 금 자국
	if _since_land >= 0.0 and _since_land < float(S.CRACK_TIME):
		var a := clampf((float(S.CRACK_TIME) - _since_land) / 0.3, 0.0, 1.0)
		for pts in _cracks:
			var lp := PackedVector2Array()
			for q in pts:
				lp.append(to_local(q))
			draw_polyline(lp, Color(0.55, 0.6, 0.75, 0.55 * a), 1.0)
	# 2) 낙하 잔상 (위쪽 경로) — 착지 뒤 GHOST_FADE 동안 사라짐
	var gk := 0.0
	if phase == "fall":
		gk = 1.0
	elif _since_land >= 0.0 and _since_land < float(S.GHOST_FADE):
		gk = 1.0 - _since_land / float(S.GHOST_FADE)
	if gk > 0.0 and _alive():
		var pos := to_local(enemy.global_position if phase == "fall" else land)
		var sm := Vector2(float(S.SMEAR_X), float(S.SMEAR_Y))
		var alphas: Array = S.GHOST_ALPHAS
		for i in int(S.GHOSTS):
			var gp := pos + Vector2(0, -float(S.GHOST_GAP) * (i + 1))
			_draw_ghost(gp, sm, Color(S.GHOST_COLOR, float(alphas[mini(i, alphas.size() - 1)]) * gk))
	draw_set_transform_matrix(Transform2D.IDENTITY)


## 잔상 하나 (적 실루엣을 한 색으로, 발 = gp, 크기 sm)
func _draw_ghost(gp: Vector2, sm: Vector2, col: Color) -> void:
	if _shapes.is_empty():
		draw_set_transform_matrix(Transform2D.IDENTITY)
		draw_rect(Rect2(gp.x - _size.x * sm.x / 2.0, gp.y - _size.y * sm.y, _size.x * sm.x, _size.y * sm.y), col)
		return
	var base := Transform2D(0.0, sm, 0.0, gp)
	for part in _shapes:
		draw_set_transform_matrix(base * (part.xf as Transform2D))
		for s in part.shapes:
			if s[0] == "rect":
				draw_rect(s[1], col)
			else:
				draw_colored_polygon(s[1], col)
	draw_set_transform_matrix(Transform2D.IDENTITY)


## 적 위 층: 낙하 중 몸 한쪽 세로 림라이트 1px
func _draw_top() -> void:
	var S: Dictionary = Config.spawn_drop
	if phase != "fall" or not _alive():
		return
	var p := to_local(enemy.global_position)
	var w := _size.x * float(S.SMEAR_X)
	var h := _size.y * float(S.SMEAR_Y)
	var side := 1.0 if int(enemy.get("facing") if enemy.get("facing") != null else 1) < 0 else -1.0   # 빛은 등 쪽에서
	_top.draw_rect(Rect2(roundf(p.x + side * w / 2.0 - (1.0 if side > 0 else 0.0)), roundf(p.y - h), 1.0, roundf(h)), S.RIM_COLOR)


func _exit_tree() -> void:
	if _counted:
		active_marks = maxi(0, active_marks - 1)
		_counted = false
	# 연출 도중 사라지면 (방 재시작 등) 적 상태를 되돌려 둠
	if _alive() and phase != "done":
		enemy.scale = Vector2.ONE
		enemy.visible = true
		enemy.set_physics_process(true)
		if not enemy.is_in_group("enemies"):
			enemy.add_to_group("enemies")

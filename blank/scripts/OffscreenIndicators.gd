extends Control
## 화면 밖에서 조준 중인 총잡이: 화면 가장자리에 작은 화살표 + 같은 줄어드는 원(축소) — HUD 에 둔다.
## 보이지 않는 곳에서 쏴서 죽는 일 방지.
## 출구가 열렸는데 화면 밖이면: 화면 가장자리에 하늘색 작은 화살표로 방향 표시 (화면 안에 들어오면 사라짐).


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	_draw_exit_arrow()
	if not Settings.approach:
		return
	var A: Dictionary = Config.approach
	var W: float = Config.view.w
	var H: float = Config.view.h
	var M: float = A.OFFSCREEN_MARGIN
	var to_screen := get_viewport().get_canvas_transform()
	var next := Effects.next_shooter(get_tree())
	for g in get_tree().get_nodes_in_group("gunners"):
		if not g.is_aiming():
			continue
		var sp: Vector2 = to_screen * g.muzzle()
		if sp.x >= 2 and sp.x <= W - 2 and sp.y >= 2 and sp.y <= H - 2:
			continue
		var p := Vector2(clampf(sp.x, M, W - M), clampf(sp.y, M + 10, H - M))
		var dim: float = 1.0 if g == next else A.DIM_ALPHA
		Effects.draw_approach(self, p, g, A.OFFSCREEN_SCALE, dim)
		# 화살표: 원 바깥, 총잡이 쪽을 가리킴
		var ang := (sp - p).angle()
		var d: float = A.APPROACH_START_RADIUS * A.OFFSCREEN_SCALE + 4.0
		var tip := (p + Vector2.from_angle(ang) * d).round()
		var col: Color = Color.WHITE if g.is_locked() else Config.colors.attack
		col.a = dim
		var tri := PackedVector2Array([Vector2(4, 0), Vector2(-2, -3), Vector2(-2, 3)])
		for i in tri.size():
			tri[i] = tip + tri[i].rotated(ang)
		draw_colored_polygon(tri, col)


func _draw_exit_arrow() -> void:
	var main := get_tree().get_first_node_in_group("game")
	if main == null or main.room == null:
		return
	var d: Door = main.room.exit_door()
	if d == null or not d.is_open:
		return
	var W: float = Config.view.w
	var H: float = Config.view.h
	var to_screen := get_viewport().get_canvas_transform()
	var r: Rect2 = d.rect()
	var c: Vector2 = to_screen * r.get_center()
	var sr := Rect2(to_screen * r.position, r.size * to_screen.get_scale())
	if sr.intersects(Rect2(0, 0, W, H)):
		return
	var m := 10.0
	var p := Vector2(clampf(c.x, m, W - m), clampf(c.y, m + 10.0, H - m))
	var ang := (c - p).angle()
	var pulse := 0.65 + 0.35 * sin(Time.get_ticks_msec() / 1000.0 * 6.0)
	var ui: Color = Config.colors.ui
	var tri := PackedVector2Array([Vector2(5, 0), Vector2(-3, -4), Vector2(-3, 4)])
	for i in tri.size():
		tri[i] = p.round() + tri[i].rotated(ang)
	draw_colored_polygon(tri, Color(ui, pulse))

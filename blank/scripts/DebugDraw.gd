extends Node2D
class_name DebugDraw
## 월드 위 디버그 그림
##  F1: 반사 보정 — 스냅 범위 부채꼴(실선 = 일반 ±35°, 점선 = 쏜 적 우선 ±50°), 근접 패링 확대 판정 원,
##      쏜 적(가장 먼저 쏠 총잡이) 점선 상자, 지금 패링하면 선택될 대상 / 시퀀스 중 반사 대상 모서리 표시
##  F5: 조준선 옆 패링 판정 창 바 — 초록 = 판정 창, 빨강 = 발사 순간, 흰색 = 지금

var main: Node


func _ready() -> void:
	z_index = 12


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	if main == null:
		return
	if Debug.aim_debug:
		_draw_aim()
	if Debug.timing:
		_draw_timing()


func _draw_aim() -> void:
	var p: Player = main.player
	if p.dead:
		return
	var A: Dictionary = Config.aim_assist
	var ui: Color = Config.colors.ui
	var o := p.center()
	var aim := (get_global_mouse_position() - o).angle()
	# 지금 패링한다면: 가장 먼저 쏠 총잡이를 '쏜 적'으로 보고 미리 계산
	var shooter := Effects.next_shooter(get_tree())
	var preview: Enemy = main.pick_reflect_target(o, aim, shooter)
	var R: float = A.AIM_SNAP_RANGE
	var s := deg_to_rad(A.AIM_SNAP_ANGLE)
	var ow := deg_to_rad(A.OWNER_PRIORITY_ANGLE)
	var fan := _sector(o, R, aim - s, aim + s)
	draw_colored_polygon(fan, Color(ui, 0.08))
	fan.append(fan[0])
	draw_polyline(fan, Color(ui, 0.45), 1.0)
	var fan2 := _sector(o, R, aim - ow, aim + ow)
	fan2.append(fan2[0])
	for i in fan2.size() - 1:
		draw_dashed_line(fan2[i], fan2[i + 1], Color(ui, 0.45), 1.0, 3.0)
	# 근접 패링 확대 판정 (칼 반경 × (1 + 보너스))
	draw_arc(o, Config.slash.radius * (1.0 + A.MELEE_PARRY_RANGE_BONUS), 0.0, TAU, 48, Color(ui, 0.35), 1.0)
	# 쏜 적 표시
	if shooter != null and not shooter.dead:
		var r := shooter.body_rect().grow(3.5)
		var pts := [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y), r.position]
		for i in 4:
			draw_dashed_line(pts[i], pts[i + 1], Color(ui, 0.6), 1.0, 2.0)
	if preview != null:
		_mark(preview, 1.0)
	var seq: ParrySeq = main.seq
	if seq.active and is_instance_valid(seq.target) and not seq.target.dead:
		_mark(seq.target, 0.8)


static func _sector(o: Vector2, r: float, a0: float, a1: float) -> PackedVector2Array:
	var pts := PackedVector2Array([o])
	for i in 25:
		pts.append(o + Vector2.from_angle(lerpf(a0, a1, i / 24.0)) * r)
	return pts


## 대상 모서리 표시 (ㄱ 자 네 개)
func _mark(e: Enemy, a: float) -> void:
	var r := e.body_rect().grow(2.5)
	var k := 4.0
	var c := Color(Config.colors.ui, a)
	for q in [[r.position, 1, 1], [Vector2(r.end.x, r.position.y), -1, 1], [Vector2(r.position.x, r.end.y), 1, -1], [r.end, -1, -1]]:
		var p: Vector2 = q[0]
		draw_polyline(PackedVector2Array([p + Vector2(q[1] * k, 0), p, p + Vector2(0, q[2] * k)]), c, 1.0)


func _draw_timing() -> void:
	for g in get_tree().get_nodes_in_group("gunners"):
		if g.dead or not g.is_aiming():
			continue
		# 조준선 위, 총구에서 조금 떨어진 곳
		var d := 34.0
		var n := Vector2(-sin(g.aim), cos(g.aim))
		var side := -1.0 if n.y > 0.0 else 1.0
		_bar(g.muzzle() + Vector2.from_angle(g.aim) * d + n * 8.0 * side, g.t, g.cfg.AIM_TIME)
	for s in main.pending_shots:
		if is_instance_valid(s.shooter):
			var sh: Enemy = s.shooter
			var aim: float = sh.cfg.AIM_TIME
			_bar(Vector2(sh.center().x, sh.body_rect().position.y - 10.0), aim + (TimeManager.world_time - s.fire_t), aim)


func _bar(c: Vector2, cur: float, fire: float) -> void:
	var Sh: Dictionary = Config.shot
	var span: float = fire + Sh.PARRY_LATE + 0.05
	var w := 48.0
	var x0 := roundf(c.x - w / 2.0)
	var y0 := roundf(c.y)
	var X := func(t: float) -> float: return x0 + roundf(clampf(t / span, 0.0, 1.0) * w)
	draw_rect(Rect2(x0 - 1, y0 - 1, w + 2, 5), Color(0, 0, 0, 0.7))
	draw_rect(Rect2(x0, y0, w, 3), Color("#2a3350"))
	var g0: float = X.call(fire - Sh.PARRY_EARLY)
	var g1: float = X.call(fire + Sh.PARRY_LATE)
	draw_rect(Rect2(g0, y0, g1 - g0, 3), Color("#39e36b"))
	draw_rect(Rect2(X.call(fire), y0 - 1, 1, 5), Config.colors.attack)
	draw_rect(Rect2(X.call(cur), y0 - 2, 1, 7), Color.WHITE)

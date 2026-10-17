extends Node2D
class_name Effects
## 월드 연출 레이어 (적·플레이어 위에 그림).
## - 탄 궤적·총구 섬광: 실제 시간 프레임 수만큼 (히트스톱 중에도 보임)
## - 파티클(불꽃·피·흙먼지): 월드 시간 (히트스톱이면 멈춤). 킬 스톱 중엔 실제 시간으로 움직이고
##   피(slow_in_stop)만 BLOOD_STOP_SPEED 배로 천천히 퍼짐 → 해제 후 떨어져 지형에 닿으면 자국(Gore)
## - 빛줄기 (Slash Beam): 실제 시간 프레임. 머리가 지형 윗면을 지날 때 흙먼지
## - 발사 타이밍 원 (Approach Circle): 조준 중인 총잡이마다 총구에 그림 + 발사 번쩍 / 패링 성공 퍼짐
## - 충격파 링: 월드 시간 (패링 칼 끝)

var room: Room
var gore: Gore

var _tracers: Array = []         # { a, b, width, color, frames, f, muzzle }
var _sparks: Array = []          # { pos, vel, life, max, color, size, grav, glow, streak, stain, slow, drag }
var _beams: Array = []           # { o, d, len, f, dust: [{ t, pos, done }], born }
var _approach_fx: Array = []     # { kind: "flash" | "success" | "scatter", pos, f, r }
var _rings: Array = []           # { pos, radius, time, t, width, color }
var _top: Node2D                 # 발사 타이밍 원 층 (z 30 — 철견 정전 어둠(z 20) 위에서도 항상 보임)


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE   # 옵션 메뉴·F4 프레임 진행이면 멈춤 (히트스톱은 time_scale 이라 상관없음)
	z_index = 10
	_top = Node2D.new()
	_top.name = "Approach"
	_top.z_index = 30
	_top.z_as_relative = false
	_top.draw.connect(_draw_top)
	add_child(_top)


func add_tracer(a: Vector2, b: Vector2, width: float, color: Color, frames: int, muzzle := false) -> void:
	_tracers.append({ "a": a, "b": b, "width": width, "color": color, "frames": frames, "f": 0, "muzzle": muzzle })


## 파티클 하나. opts: size(1) grav(0) glow streak stain(지형에 닿으면 자국) slow(킬 스톱 중 천천히)
func spawn(pos: Vector2, vel: Vector2, life: float, color: Color, opts := {}) -> void:
	var stain: bool = opts.get("stain", false)
	_sparks.append({ "pos": pos, "vel": vel, "life": life, "max": life, "color": color,
		"size": opts.get("size", 1.0), "grav": opts.get("grav", 0.0), "glow": opts.get("glow", false),
		"streak": opts.get("streak", false), "stain": stain, "slow": opts.get("slow", false), "drag": not stain })


## pos 에서 angle ± spread 방향으로 n 개 (opts 는 spawn 과 같음)
func burst(pos: Vector2, n: int, color: Color, speed: float, angle := 0.0, spread := PI, life := 0.4, opts := {}) -> void:
	for i in n:
		var a := angle + randf_range(-1.0, 1.0) * spread
		var v := speed * randf_range(0.35, 1.0)
		spawn(pos, Vector2.from_angle(a) * v, randf_range(0.6, 1.0) * life, color, opts)


## 빛줄기: 타격 지점 hit 을 지나 angle 방향으로, 화면(view, 전역 사각형) + 여유 밖에서 밖으로.
## 머리는 빨리 나가고(ease-out) 꼬리는 늦게 따라오며(ease-in) BEAM_FRAMES 프레임에 사라짐
func beam(hit: Vector2, angle: float, view: Rect2) -> void:
	var K: Dictionary = Config.kill
	var d := Vector2.from_angle(angle)
	var r := view.grow(K.BEAM_MARGIN)
	var back := _exit_dist(hit, -d, r)
	var fwd := _exit_dist(hit, d, r)
	var o := hit - d * back
	var len := back + fwd
	var dust := []
	if room != null:
		for h in room.surface_hits(o, d, len):
			dust.append({ "t": h.t, "pos": h.pos, "done": false })
	_beams.append({ "o": o, "d": d, "len": len, "f": 0, "dust": dust, "born": Engine.get_physics_frames() })


static func _exit_dist(p: Vector2, d: Vector2, r: Rect2) -> float:
	var t := INF
	if d.x > 0.0: t = minf(t, (r.end.x - p.x) / d.x)
	elif d.x < 0.0: t = minf(t, (r.position.x - p.x) / d.x)
	if d.y > 0.0: t = minf(t, (r.end.y - p.y) / d.y)
	elif d.y < 0.0: t = minf(t, (r.position.y - p.y) / d.y)
	return maxf(0.0, t)


## 머리/꼬리 위치 (시작점에서의 거리)
static func beam_span(b: Dictionary) -> Vector2:
	var u: float = (b.f + 1.0) / (Config.kill.BEAM_FRAMES + 1.0)
	return Vector2(b.len * (1.0 - pow(1.0 - u, 3.0)), b.len * u * u * u)


## 첫 빛줄기의 프레임 (없으면 -1) — F3/F4 디버그 표시
func first_beam_frame() -> int:
	return _beams[0].f if not _beams.is_empty() else -1


func beam_count() -> int:
	return _beams.size()


func particle_count(color_list: Array) -> int:
	var n := 0
	for s in _sparks:
		if color_list.has(s.color):
			n += 1
	return n


## 처음에 확 퍼지고 감속하는 원 (3 → radius)
func ring(pos: Vector2, radius: float, time: float, width: float, color: Color) -> void:
	_rings.append({ "pos": pos, "radius": radius, "time": time, "t": 0.0, "width": width, "color": color })


func approach_flash(pos: Vector2) -> void:
	if Settings.approach:
		_approach_fx.append({ "kind": "flash", "pos": pos, "f": 0 })


## 가짜 조준 취소: 줄어들던 원(반지름 r)이 조각나 흩어짐
func approach_scatter(pos: Vector2, r: float, color: Color) -> void:
	if Settings.approach:
		_approach_fx.append({ "kind": "scatter", "pos": pos, "f": 0, "r": r, "color": color })


func approach_success(pos: Vector2) -> void:
	if Settings.approach:
		_approach_fx.append({ "kind": "success", "pos": pos, "f": 0 })


func _physics_process(delta: float) -> void:
	var A: Dictionary = Config.approach
	# 실제 시간 프레임
	for tr in _tracers:
		tr.f += 1
	_tracers = _tracers.filter(func(tr): return tr.f < tr.frames)
	for fx in _approach_fx:
		fx.f += 1
	var success_frames := roundi(A.SUCCESS_TIME * Config.fps)
	var scatter_frames := roundi(A.SCATTER_TIME * Config.fps)
	_approach_fx = _approach_fx.filter(func(fx): return fx.f < (A.FLASH_FRAMES if fx.kind == "flash" else (scatter_frames if fx.kind == "scatter" else success_frames)))
	_update_beams()
	# 월드 시간 (킬 스톱 중엔 실제 시간)
	if TimeManager.kill_stopped:
		_update_particles(TimeManager.real_delta(), true)
		_update_rings(TimeManager.real_delta())
	elif not TimeManager.frozen:
		_update_particles(delta, false)
		_update_rings(delta)
	queue_redraw()
	_top.queue_redraw()


## 다음에 발사할 총잡이 (가장 이른 발사 예정)
func _update_rings(dt: float) -> void:
	for r in _rings:
		r.t += dt
	_rings = _rings.filter(func(r): return r.t < r.time)


func _update_particles(dt: float, stopped: bool) -> void:
	var keep := []
	var bs: float = Config.kill.BLOOD_STOP_SPEED
	for s in _sparks:
		if stopped and s.slow:
			s.pos += s.vel * dt * bs
			keep.append(s)
			continue
		s.life -= dt
		if s.life <= 0.0:
			continue
		s.vel.y += s.grav * dt
		if s.drag:
			s.vel.x *= 0.96
			s.vel.y *= 0.98
		s.pos += s.vel * dt
		# 피: 바닥/벽/발판에 닿으면 자국으로 남기고 사라짐
		if s.stain and room != null and room.solid_at(s.pos):
			if gore != null:
				gore.add_stain(s.pos, s.vel, s.color)
			continue
		keep.append(s)
	_sparks = keep


func _update_beams() -> void:
	var K: Dictionary = Config.kill
	var C: Dictionary = Config.colors
	var now := Engine.get_physics_frames()
	for b in _beams:
		var head: float = beam_span(b).x
		for d in b.dust:
			if d.done or d.t > head:
				continue
			d.done = true
			# 흙먼지: 바닥에서 위로 뭉게뭉게, 빛줄기 진행 방향으로 살짝 끌려감
			for i in K.DUST_COUNT:
				var a := -PI / 2.0 + randf_range(-1.1, 1.1)
				var v: float = K.DUST_SPEED * randf_range(0.3, 1.0)
				spawn(d.pos + Vector2(randf_range(-3, 3), -1), Vector2(cos(a) * v + b.d.x * 40.0, sin(a) * v),
					randf_range(0.35, 0.7), C.dust[i % C.dust.size()], { "size": 2.0 if randf() < 0.5 else 3.0, "grav": 60.0 })
		# 생긴 틱에는 프레임을 넘기지 않음 → 첫 프레임(f=0)부터 BEAM_FRAMES 장이 모두 그려짐
		if now > b.born:
			b.f += 1
	_beams = _beams.filter(func(b): return b.f < K.BEAM_FRAMES)


## 지금 보여야 할 발사 타이밍 원 전부 — 총잡이는 조준 중일 때 하나, 철견은 연사의 탄마다 하나
## { pos(총구), remaining, aim_time, locked, k(고정까지 진행 0~1), parryable, fire_t, owner, aim, t }
static func approach_infos(tree: SceneTree) -> Array:
	var out := []
	for a in tree.get_nodes_in_group("aimers"):
		if not a.dead:
			out.append_array(a.approach_infos())
	return out


## 다음에 발사될 탄 (가장 이른 발사 예정) — 이 원만 100% 밝기
static func next_info(infos: Array) -> Dictionary:
	var best := {}
	for i in infos:
		if best.is_empty() or i.fire_t < best.fire_t:
			best = i
	return best


## 다음에 쏠 적 (F1 반사 보정 미리보기의 '쏜 적')
static func next_shooter(tree: SceneTree) -> Enemy:
	var n := next_info(approach_infos(tree))
	return n.owner if not n.is_empty() else null


## 남은 시간(초) → 줄어드는 원 반지름. 선형: 6 + (40 - 6) × (남은 시간 / AIM_TIME). aim = 그 총잡이의 조준 시간
static func approach_radius(remaining: float, aim := -1.0) -> float:
	var A: Dictionary = Config.approach
	if aim <= 0.0:
		aim = Config.gunner.AIM_TIME
	return A.APPROACH_TARGET_RADIUS + (A.APPROACH_START_RADIUS - A.APPROACH_TARGET_RADIUS) * clampf(remaining / aim, 0.0, 1.0)


## 원 한 세트 (목표 원 + 판정 창 띠 + 줄어드는 원). info = approach_infos 의 한 항목, s = 축소 배율, dim = 밝기 배율
static func draw_approach(ci: CanvasItem, c: Vector2, info: Dictionary, s := 1.0, dim := 1.0) -> void:
	var A: Dictionary = Config.approach
	var rt: float = A.APPROACH_TARGET_RADIUS * s
	var aim: float = info.aim_time
	var rb: float = approach_radius(Config.shot.PARRY_EARLY, aim) * s    # 띠 바깥 = PARRY_EARLY 초 전의 원 크기
	var r: float = approach_radius(info.remaining, aim) * s
	c = c.round()
	# 패링 판정 창 띠
	ci.draw_arc(c, (rt + rb) / 2.0, 0.0, TAU, 40, Color(1, 1, 1, A.BAND_ALPHA * dim), rb - rt)
	# 목표 원 (1px 흰 외곽선)
	ci.draw_arc(c, rt, 0.0, TAU, 32, Color(1, 1, 1, dim), 1.0)
	# 줄어드는 원: 고정 전 빨강 1px (투명도 30% → 100%), 고정부터 흰색 2px
	if info.locked:
		ci.draw_arc(c, r, 0.0, TAU, 40, Color(1, 1, 1, dim), 2.0)
	else:
		var k: float = info.k
		var col: Color = Config.colors.attack if info.parryable else Config.colors.unparryable
		col.a = lerpf(A.ALPHA_MIN, 1.0, k) * dim
		ci.draw_arc(c, r, 0.0, TAU, 48, col, 1.0)
	# 도탄: 원 위의 작은 화살표 = 탄이 날아오는 방향 (그쪽으로 베어야 패링)
	if info.has("arrow"):
		var a: float = info.arrow
		var d := Vector2.from_angle(a)
		var n := d.orthogonal()
		var tipp := c + d * (r + 1.0)
		var back := c + d * (r + 6.0)
		var ac: Color = Color(1, 1, 1, dim) if info.locked else Color(Config.colors.attack, dim)
		ci.draw_colored_polygon(PackedVector2Array([tipp, back + n * 3.5, back - n * 3.5]), ac)
		ci.draw_line(back, back + d * 4.0, ac, 1.0)


func is_offscreen(pos: Vector2) -> bool:
	var sp := get_viewport().get_canvas_transform() * pos
	var m := 2.0
	return sp.x < m or sp.x > Config.view.w - m or sp.y < m or sp.y > Config.view.h - m


func _draw() -> void:
	var A: Dictionary = Config.approach
	# 탄 궤적 + 총구 섬광
	for tr in _tracers:
		var c: Color = tr.color
		c.a = 1.0 - float(tr.f) / (tr.frames + 1) * 0.5
		draw_line(tr.a, tr.b, c, tr.width)
		if tr.muzzle and tr.f < 2:
			draw_circle(tr.a, 5.0 - tr.f * 2.0, Color(tr.color, 0.5))
			draw_circle(tr.a, 3.0 - tr.f, Color.WHITE)
	# 파티클
	for s in _sparks:
		var c: Color = s.color
		c.a = minf(1.0, s.life / s.max * 1.5)
		var sz: float = s.size
		if s.streak:
			# 속도 방향으로 늘어진 불꽃 선
			var tail: Vector2 = s.pos - s.vel * 0.035
			if s.glow:
				draw_line(s.pos, tail, Color(c, c.a * 0.3), sz + 2.0)
			draw_line(s.pos, tail, c, sz)
		else:
			var r := Rect2((s.pos - Vector2(sz, sz) / 2.0).round(), Vector2(sz, sz))
			if s.glow:
				draw_rect(r.grow(1.0), Color(c, c.a * 0.3))
			draw_rect(r, c)
	# 빛줄기: 하늘색 테두리 + 글로우, 흰 중심
	var K: Dictionary = Config.kill
	var CC: Dictionary = Config.colors
	for b in _beams:
		var sp := beam_span(b)
		if sp.x - sp.y < 0.5:
			continue
		var p0: Vector2 = b.o + b.d * sp.y
		var p1: Vector2 = b.o + b.d * sp.x
		draw_line(p0, p1, Color(CC.beam_edge, 0.18), K.BEAM_WIDTH + 2.0 + K.BEAM_GLOW)
		draw_line(p0, p1, CC.beam_edge, K.BEAM_WIDTH + 2.0)
		draw_line(p0, p1, CC.beam_core, K.BEAM_WIDTH)
	# 충격파 링
	for r in _rings:
		var u: float = r.t / r.time
		var e := 1.0 - pow(1.0 - u, 3.0)
		var rad: float = 3.0 + (r.radius - 3.0) * e
		var w: float = maxf(1.0, r.width * (1.0 - u))
		var c: Color = r.color
		c.a = 1.0 - u * u
		draw_arc(r.pos, rad, 0.0, TAU, 48, Color(c, c.a * 0.3), w + 3.0)   # 빛 번짐
		draw_arc(r.pos, rad, 0.0, TAU, 48, c, w)


## 발사 타이밍 원 층 (_top 에 그림)
func _draw_top() -> void:
	var A: Dictionary = Config.approach
	var ci := _top
	# 발사 타이밍 원: 화면 안의 조준 중인 총잡이 (다음 발사만 100%, 나머지 50%)
	# (철견 연사: 탄마다 원이 시간차를 두고 함께 줄어듦 — 늦은 탄부터 그려 다음 탄 원이 맨 위에)
	var infos := approach_infos(get_tree())
	var next := next_info(infos)
	infos.sort_custom(func(a, b): return a.fire_t > b.fire_t)
	for info in infos:
		if Settings.approach and not is_offscreen(info.pos):
			draw_approach(ci, info.pos, info, 1.0, 1.0 if info == next else A.DIM_ALPHA)
	# 발사 순간 흰 번쩍 / 패링 성공 노란 원 퍼짐
	var rt: float = A.APPROACH_TARGET_RADIUS
	for fx in _approach_fx:
		var c: Vector2 = fx.pos.round()
		if fx.kind == "flash":
			ci.draw_circle(c, rt, Color(1, 1, 1, 0.85))
			ci.draw_arc(c, rt, 0.0, TAU, 32, Color.WHITE, 2.0)
		elif fx.kind == "scatter":
			# 원이 8조각으로 깨져 바깥으로 흩어지며 사라짐
			var u: float = float(fx.f) / maxf(1.0, A.SCATTER_TIME * Config.fps)
			var col: Color = fx.color
			col.a = 1.0 - u
			var rr: float = fx.r + 10.0 * (1.0 - (1.0 - u) * (1.0 - u))
			for i in 8:
				var a0 := TAU * i / 8.0 + u * 0.6
				ci.draw_arc(c + Vector2.from_angle(a0 + 0.2) * 6.0 * u, rr, a0, a0 + 0.45, 6, col, 1.0)
		else:
			var u: float = float(fx.f) / maxf(1.0, A.SUCCESS_TIME * Config.fps)
			var col: Color = Config.colors.parry
			col.a = 1.0 - u
			var r: float = rt + (rt * A.SUCCESS_SCALE - rt) * (1.0 - (1.0 - u) * (1.0 - u))
			ci.draw_arc(c, r, 0.0, TAU, 40, col, maxf(1.0, 2.0 * (1.0 - u)))

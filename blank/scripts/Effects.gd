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
var _approach_fx: Array = []     # { kind: "flash" | "success", pos, f }
var _rings: Array = []           # { pos, radius, time, t, width, color }


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE   # 옵션 메뉴·F4 프레임 진행이면 멈춤 (히트스톱은 time_scale 이라 상관없음)
	z_index = 10


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
	_approach_fx = _approach_fx.filter(func(fx): return fx.f < (A.FLASH_FRAMES if fx.kind == "flash" else success_frames))
	_update_beams()
	# 월드 시간 (킬 스톱 중엔 실제 시간)
	if TimeManager.kill_stopped:
		_update_particles(TimeManager.real_delta(), true)
		_update_rings(TimeManager.real_delta())
	elif not TimeManager.frozen:
		_update_particles(delta, false)
		_update_rings(delta)
	queue_redraw()


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


static func next_shooter(tree: SceneTree) -> EnemyGunner:
	var best: EnemyGunner = null
	var bt := INF
	for g in tree.get_nodes_in_group("gunners"):
		if g.is_aiming() and g.expected_fire_t() < bt:
			bt = g.expected_fire_t()
			best = g
	return best


## 남은 시간(초) → 줄어드는 원 반지름. 선형: 6 + (40 - 6) × (남은 시간 / AIM_TIME)
static func approach_radius(remaining: float) -> float:
	var A: Dictionary = Config.approach
	var aim: float = Config.gunner.AIM_TIME
	return A.APPROACH_TARGET_RADIUS + (A.APPROACH_START_RADIUS - A.APPROACH_TARGET_RADIUS) * clampf(remaining / aim, 0.0, 1.0)


## 원 한 세트 (목표 원 + 판정 창 띠 + 줄어드는 원). s = 축소 배율, dim = 밝기 배율
static func draw_approach(ci: CanvasItem, c: Vector2, g: EnemyGunner, s := 1.0, dim := 1.0) -> void:
	var A: Dictionary = Config.approach
	var rt: float = A.APPROACH_TARGET_RADIUS * s
	var rb: float = approach_radius(Config.shot.PARRY_EARLY) * s    # 띠 바깥 = PARRY_EARLY 초 전의 원 크기
	var r: float = approach_radius(g.remaining()) * s
	c = c.round()
	# 패링 판정 창 띠
	ci.draw_arc(c, (rt + rb) / 2.0, 0.0, TAU, 40, Color(1, 1, 1, A.BAND_ALPHA * dim), rb - rt)
	# 목표 원 (1px 흰 외곽선)
	ci.draw_arc(c, rt, 0.0, TAU, 32, Color(1, 1, 1, dim), 1.0)
	# 줄어드는 원: 고정 전 빨강 1px (투명도 30% → 100%), 고정부터 흰색 2px
	if g.is_locked():
		ci.draw_arc(c, r, 0.0, TAU, 40, Color(1, 1, 1, dim), 2.0)
	else:
		var k := clampf(g.t / g.lock_start(), 0.0, 1.0)
		var col: Color = Config.colors.attack if g.next_parryable else Config.colors.unparryable
		col.a = lerpf(A.ALPHA_MIN, 1.0, k) * dim
		ci.draw_arc(c, r, 0.0, TAU, 48, col, 1.0)


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
	# 발사 타이밍 원: 화면 안의 조준 중인 총잡이 (다음 발사만 100%, 나머지 50%)
	var next := next_shooter(get_tree())
	for g in get_tree().get_nodes_in_group("gunners"):
		if Settings.approach and g.is_aiming() and not is_offscreen(g.muzzle()):
			draw_approach(self, g.muzzle(), g, 1.0, 1.0 if g == next else A.DIM_ALPHA)
	# 발사 순간 흰 번쩍 / 패링 성공 노란 원 퍼짐
	var rt: float = A.APPROACH_TARGET_RADIUS
	for fx in _approach_fx:
		var c: Vector2 = fx.pos.round()
		if fx.kind == "flash":
			draw_circle(c, rt, Color(1, 1, 1, 0.85))
			draw_arc(c, rt, 0.0, TAU, 32, Color.WHITE, 2.0)
		else:
			var u: float = float(fx.f) / maxf(1.0, A.SUCCESS_TIME * Config.fps)
			var col: Color = Config.colors.parry
			col.a = 1.0 - u
			var r: float = rt + (rt * A.SUCCESS_SCALE - rt) * (1.0 - (1.0 - u) * (1.0 - u))
			draw_arc(c, r, 0.0, TAU, 40, col, maxf(1.0, 2.0 * (1.0 - u)))

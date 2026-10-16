extends Node2D
class_name Effects
## 월드 연출 레이어 (적·플레이어 위에 그림).
## - 탄 궤적·총구 섬광: 실제 시간 프레임 수만큼 (히트스톱 중에도 보임)
## - 불꽃 파티클: 월드 시간 (히트스톱이면 멈춤)
## - 발사 타이밍 원 (Approach Circle): 조준 중인 총잡이마다 총구에 그림 + 발사 번쩍 / 패링 성공 퍼짐
## - 충격파 링: 월드 시간 (패링 칼 끝)
## (빛줄기·피·조각 등 킬 연출은 6단계에서 여기에 추가)

var _tracers: Array = []         # { a, b, width, color, frames, f, muzzle }
var _sparks: Array = []          # { pos, vel, life, max, color }
var _approach_fx: Array = []     # { kind: "flash" | "success", pos, f }
var _rings: Array = []           # { pos, radius, time, t, width, color }


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	z_index = 10


func add_tracer(a: Vector2, b: Vector2, width: float, color: Color, frames: int, muzzle := false) -> void:
	_tracers.append({ "a": a, "b": b, "width": width, "color": color, "frames": frames, "f": 0, "muzzle": muzzle })


## pos 에서 angle ± spread 방향으로 n 개의 작은 불꽃
func burst(pos: Vector2, n: int, color: Color, speed: float, angle := 0.0, spread := PI, life := 0.3) -> void:
	for i in n:
		var a := angle + randf_range(-1.0, 1.0) * spread
		var v := speed * randf_range(0.35, 1.0)
		var l := life * randf_range(0.6, 1.0)
		_sparks.append({ "pos": pos, "vel": Vector2.from_angle(a) * v, "life": l, "max": l, "color": color })


## 처음에 확 퍼지고 감속하는 원 (3 → radius)
func ring(pos: Vector2, radius: float, time: float, width: float, color: Color) -> void:
	_rings.append({ "pos": pos, "radius": radius, "time": time, "t": 0.0, "width": width, "color": color })


func approach_flash(pos: Vector2) -> void:
	_approach_fx.append({ "kind": "flash", "pos": pos, "f": 0 })


func approach_success(pos: Vector2) -> void:
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
	# 월드 시간
	if not TimeManager.frozen:
		for s in _sparks:
			s.life -= delta
			s.vel *= 0.96
			s.pos += s.vel * delta
		_sparks = _sparks.filter(func(s): return s.life > 0.0)
		for r in _rings:
			r.t += delta
		_rings = _rings.filter(func(r): return r.t < r.time)
	queue_redraw()


## 다음에 발사할 총잡이 (가장 이른 발사 예정)
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
	# 불꽃
	for s in _sparks:
		var c: Color = s.color
		c.a = minf(1.0, s.life / s.max * 1.5)
		draw_rect(Rect2(s.pos.round(), Vector2.ONE), c)
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
		if g.is_aiming() and not is_offscreen(g.muzzle()):
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

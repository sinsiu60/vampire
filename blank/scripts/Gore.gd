extends Node2D
class_name Gore
## 처치 흔적 레이어 — 방(Room) 안, 지형 바로 위 · 적/플레이어 아래에 그림.
##  - 파편 자국: 방 크기 이미지에 쌓임 (재시작하면 새 씬이라 지워짐)
##  - 3겹 킬 궤적: 바깥 하늘색 / 중간 분홍 잔상(늦게 따라옴) / 중심 노랑. 킬 스톱 동안 남았다가 해제 후 사라짐 (실제 시간 프레임)
##  - 두 조각: 실루엣을 베인 방향 직선으로 잘라 둘로. 처음 2프레임 흰 섬광(실제 시간), 날아가기·튕기기는 월드 시간
##  - 절단선 섬광 (월드 시간)
## 조각 모양은 적의 실루엣 다각형(Enemy.capture_silhouette)을 반평면과 교차해서 만듦 → 픽셀 스냅된 같은 모양 그대로.

var room: Room

var _stain_img: Image
var _stain_tex: ImageTexture
var _stain_dirty := false
var _trail := {}                 # { pos, angle, flip, f, released, born }
var _pieces: Array = []
var _slices: Array = []          # { pos, angle, t, time, color }


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE   # 옵션 메뉴·F4 프레임 진행이면 멈춤 (히트스톱은 time_scale 이라 상관없음)
	var sz: Vector2 = room.size_px() if room != null else Vector2(Config.room.w, Config.room.h)
	_stain_img = Image.create(int(sz.x), int(sz.y), false, Image.FORMAT_RGBA8)
	_stain_tex = ImageTexture.create_from_image(_stain_img)
	TimeManager.kill_stop_released.connect(release_trail)


# ---------------------------------------------------------------- 자국
## 지형 표면에 붙도록 진행 방향 반대로 1px 되돌린 곳에서 진행 방향으로 1~3px 번지게
func add_stain(p: Vector2, v: Vector2, color: Color) -> void:
	var u := v.normalized() if v.length() > 0.0 else Vector2.DOWN
	var b := (p - u).round()
	var n := 1 + randi() % 3
	for i in n:
		_px(b + (u * i * 0.8).round(), color)
	if randf() < 0.4:
		_px(b, color)
		_px(b + Vector2(1, 0), color)
	_stain_dirty = true


func _px(p: Vector2, c: Color) -> void:
	var x := int(p.x)
	var y := int(p.y)
	if x >= 0 and y >= 0 and x < _stain_img.get_width() and y < _stain_img.get_height():
		_stain_img.set_pixel(x, y, c)


func stain_count() -> int:
	var n := 0
	for y in _stain_img.get_height():
		for x in _stain_img.get_width():
			if _stain_img.get_pixel(x, y).a > 0.0:
				n += 1
	return n


# ---------------------------------------------------------------- 3겹 킬 궤적
func kill_trail(pos: Vector2, angle: float, flip: int) -> void:
	_trail = { "pos": pos, "angle": angle, "flip": flip, "f": 0, "released": false, "born": Engine.get_physics_frames() }


func release_trail() -> void:
	if not _trail.is_empty():
		_trail.released = true
		_trail.released_at = Engine.get_physics_frames()


func trail_state() -> Dictionary:
	return _trail


# ---------------------------------------------------------------- 두 조각
## parts = 실루엣 [{ xf, shapes, body, rim }] (origin 기준 로컬), center = 자르는 점(전역), angle = 베인 방향.
## knock = 공격 방향으로 강하게 날아감 (KILL_KNOCKBACK). 아니면 약하게 벌어짐 (플레이어 사망)
func split(parts: Array, origin: Vector2, center: Vector2, angle: float, slice_color: Color, power := 1.0, knock := false) -> void:
	knock = knock and Settings.on("knockback")
	var F: Dictionary = Config.fx
	var J: Dictionary = Config.juice
	var d := Vector2.from_angle(angle)
	var shift := origin - center             # 실루엣 좌표 → 조각 중심 기준
	for side in [1, -1]:
		var n: Vector2 = Vector2(-d.y, d.x) * side   # 절단선 법선 (이 조각이 벌어질 쪽)
		var v: Vector2
		var vrot: float
		var dir_sign := 1.0 if d.x >= 0.0 else -1.0
		if knock:
			var sp: float = J.KILL_KNOCKBACK * power * randf_range(0.85, 1.1)
			v = Vector2(d.x * sp + n.x * J.KNOCKBACK_SPLIT * randf_range(0.6, 1.2),
				d.y * sp * 0.6 + n.y * J.KNOCKBACK_SPLIT * randf_range(0.6, 1.2) - J.KNOCKBACK_LIFT)
			vrot = side * J.PIECE_SPIN * randf_range(0.6, 1.2) * dir_sign
		else:
			var sp: float = F.piece_speed * power * randf_range(0.7, 1.2)
			v = Vector2(n.x * sp * 0.6 + d.x * sp * randf_range(0.6, 1.1),
				n.y * sp * 0.6 + d.y * sp * randf_range(0.6, 1.1) - 70.0 * power)
			vrot = side * F.piece_spin * randf_range(0.5, 1.2) * dir_sign
		_pieces.append({
			"polys": _cut(parts, shift, d, n),
			"pos": center + n * 1.5, "vel": v, "rot": 0.0, "vrot": vrot,
			"bounces": 0, "rest": false,
			"flash": J.ENEMY_FLASH_FRAMES if Settings.on("enemy_flash") else 0, "born": Engine.get_physics_frames(),
		})
	_slices.append({ "pos": center, "angle": angle, "t": 0.0, "time": 0.14, "color": slice_color })


## 자르지 않은 한 조각을 던짐 (철견이 처치될 때 공중으로 날아가는 쌍권총 등) — parts 는 origin 기준 로컬
func toss(parts: Array, origin: Vector2, center: Vector2, vel: Vector2, vrot: float) -> void:
	_pieces.append({
		"polys": _cut(parts, origin - center, Vector2.RIGHT, Vector2.DOWN, true),
		"pos": center, "vel": vel, "rot": 0.0, "vrot": vrot, "bounces": 0, "rest": false,
		"flash": 0, "born": Engine.get_physics_frames(),
	})


## 실루엣을 법선 n 쪽 반평면으로 자름 → [{ pts, color, rim: bool }] (조각 중심 기준). whole = 자르지 않음
func _cut(parts: Array, shift: Vector2, d: Vector2, n: Vector2, whole := false) -> Array:
	const L := 40.0
	var half := PackedVector2Array([d * L, -d * L, -d * L + n * L, d * L + n * L])
	if whole:
		half = PackedVector2Array([Vector2(-200, -200), Vector2(200, -200), Vector2(200, 200), Vector2(-200, 200)])
	var out := []
	var offs := [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]
	for pass_rim in [true, false]:
		for part in parts:
			var col: Color = part.rim if pass_rim else part.body
			if col.a <= 0.0:
				continue
			for sh in part.shapes:
				var base := _shape_poly(sh)
				for off in (offs if pass_rim else [Vector2.ZERO]):
					var pts := PackedVector2Array()
					for q in base:
						pts.append(part.xf * (q + off) + shift)
					for clipped in Geometry2D.intersect_polygons(pts, half):
						out.append({ "pts": clipped, "color": col, "rim": pass_rim })
	return out


static func _shape_poly(sh: Array) -> PackedVector2Array:
	if sh[0] == "rect":
		var r: Rect2 = sh[1]
		return PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)])
	return sh[1]


func piece_count() -> int:
	return _pieces.size()


func pieces() -> Array:
	return _pieces


# ---------------------------------------------------------------- 갱신
func _physics_process(delta: float) -> void:
	var now := Engine.get_physics_frames()
	var K: Dictionary = Config.kill
	# 실제 시간 프레임 (생긴 틱에는 넘기지 않음 → 첫 프레임부터 다 그려짐)
	for p in _pieces:
		if p.flash > 0 and now > p.born:
			p.flash -= 1
	if not _trail.is_empty():
		if now > _trail.born:
			_trail.f += 1
		# 해제된 틱까지는 그대로 그리고, 그 뒤 최소 표시 프레임도 지났으면 제거
		if _trail.released and now > _trail.released_at and _trail.f >= K.TRAIL_MIN_FRAMES:
			_trail = {}
	# 월드 시간
	if not TimeManager.frozen:
		_update_pieces(delta)
		for sl in _slices:
			sl.t += delta
		_slices = _slices.filter(func(sl): return sl.t < sl.time)
	if _stain_dirty:
		_stain_tex.update(_stain_img)
		_stain_dirty = false
	queue_redraw()


func _update_pieces(dt: float) -> void:
	var J: Dictionary = Config.juice
	var E: Dictionary = Config.enemy
	const S := 6.0
	for p in _pieces:
		if p.rest:
			continue
		p.vel.y = minf(p.vel.y + E.gravity * dt, E.max_fall * 1.4)
		var vb: Vector2 = p.vel
		var r := room.move_box(Rect2(p.pos - Vector2(S, S) / 2.0, Vector2(S, S)), p.vel, dt)
		p.pos = r.rect.get_center()
		p.vel = r.vel
		if r.hit_wall != 0:
			p.vel.x = -vb.x * J.PIECE_WALL_BOUNCE
			p.vrot = -p.vrot * 0.6
		p.rot += p.vrot * dt
		if r.on_ground:
			if vb.y > J.PIECE_MIN_BOUNCE and p.bounces < J.PIECE_MAX_BOUNCES:
				p.vel.y = -vb.y * J.PIECE_BOUNCE      # 튕김
				p.bounces += 1
				p.vrot *= 0.6
			else:
				# 미끄러지다 멈춤
				p.vel.x = move_toward(p.vel.x, 0.0, J.PIECE_FRICTION * dt)
				p.vrot = move_toward(p.vrot, 0.0, 30.0 * dt)
				if p.vel.x == 0.0:
					p.rest = true


# ---------------------------------------------------------------- 그리기
func _draw() -> void:
	draw_texture(_stain_tex, Vector2.ZERO)
	_draw_trail()
	_draw_pieces()
	# 절단선 섬광
	for sl in _slices:
		var k: float = sl.t / sl.time
		var len := 22.0 * (1.0 - k * 0.5)
		var d := Vector2.from_angle(sl.angle) * len
		var c: Color = sl.color
		c.a = 1.0 - k
		var w := maxf(1.0, 2.0 * (1.0 - k))
		draw_line(sl.pos - d, sl.pos + d, Color(c, c.a * 0.3), w + 3.0)
		draw_line(sl.pos - d, sl.pos + d, c, w)


func _draw_trail() -> void:
	if _trail.is_empty():
		return
	var K: Dictionary = Config.kill
	var C: Dictionary = Config.colors
	var R: float = K.TRAIL_RADIUS
	var half := deg_to_rad(K.TRAIL_ARC)
	var flip: float = _trail.flip
	var a0: float = _trail.angle - half * flip
	var span := half * 2.0 * flip
	var f: float = _trail.f
	var u := clampf((f + 1.0) / K.TRAIL_SWEEP_FRAMES, 0.0, 1.0)
	var up := clampf((f + 1.0 - K.TRAIL_PINK_LAG) / K.TRAIL_SWEEP_FRAMES, 0.0, 1.0)
	var c: Vector2 = _trail.pos
	DrawUtil.crescent(self, c, R * 1.12, a0, span, 0.0, u, R * 0.62, Color(C.trail_outer, 0.9), 10.0)   # 바깥: 하늘색
	DrawUtil.crescent(self, c, R, a0, span, 0.0, up, R * 0.46, Color(C.trail_mid, 0.95), 6.0)           # 중간: 분홍 잔상
	DrawUtil.crescent(self, c, R * 0.97, a0, span, 0.0, u, R * 0.22, C.trail_core, 8.0)                 # 중심: 노랑


func _draw_pieces() -> void:
	var offs := [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]
	for p in _pieces:
		draw_set_transform(p.pos.round(), p.rot, Vector2.ONE)
		if p.flash > 0:
			# 피격 섬광: 완전 흰 실루엣 + 검은 1px 테두리 (흰 베기 궤적 위에서도 보이게)
			for off in offs:
				draw_set_transform(p.pos.round() + off, p.rot, Vector2.ONE)
				for q in p.polys:
					draw_colored_polygon(q.pts, Color.BLACK)
			draw_set_transform(p.pos.round(), p.rot, Vector2.ONE)
			for q in p.polys:
				draw_colored_polygon(q.pts, Color.WHITE)
		else:
			for q in p.polys:
				draw_colored_polygon(q.pts, q.color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

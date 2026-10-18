extends Node2D
class_name CheolgyeonBody
## 철견의 겉모습 (전투 로직과 분리 — 나중에 스프라이트로 바꿀 때 이 씬만 갈아 끼우면 됨).
## scenes/CheolgyeonBody.tscn: Group(CanvasGroup, 실루엣 테두리 셰이더) / Rig(뼈대) / 부위별 Polygon2D, Anim(포즈 키프레임).
## 로직이 쓰는 것은 아래 API 뿐: pose · snap · ghost · facing · muzzle · muzzle_angle · silhouette · set_flash · part.
##
## 키포즈 시스템 — 공격 포즈 전환:
##   예고 정지 (pose 로 예고 포즈를 잡고 기다림) → snap(다음 포즈): 1프레임에 바로 바뀜 +
##   이전 포즈 잔상 + 이전·다음 포즈를 잇는 스미어 덩어리 (SMEAR_FRAMES 틱) → 여운 정지 (그 포즈 그대로 기다림)
## 원점 = 발 중앙. 오른쪽을 보는 포즈로 만들었고 facing = -1 이면 Rig 를 좌우로 뒤집음.

const C := preload("res://scripts/boss/CheolgyeonConfig.gd")

var facing := 1:
	set(v):
		facing = 1 if v >= 0 else -1
		if _rig != null:
			_rig.scale.x = facing
var pose_name := ""

var _anim: AnimationPlayer
var _group: CanvasGroup
var _rig: Node2D
var _shapes: Array[Polygon2D] = []
var _muzzles: Array[Node2D] = []
var _arms: Array[Node2D] = []    # [ArmF, ArmB]
var _guns: Array[Node2D] = []    # [GunF, GunB]
var _gun_shapes: Array[Polygon2D] = []
var _aim := [NAN, NAN]           # 팔 조준 (전역 각도, NAN = 포즈 그대로)
var _ghosts: Array = []          # 잔상 { polys: [{ xf, pts }], t, life, alpha }
var _smears: Array = []          # 스미어 { polys: [PackedVector2Array (전역)], ticks }


func _ready() -> void:
	_anim = $Anim
	_group = $Group
	_rig = $Group/Rig
	_anim.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS   # 월드 시간 (히트스톱이면 멈춤)
	_collect(_rig)
	_muzzles = [_rig.find_child("MuzzleF", true, false), _rig.find_child("MuzzleB", true, false)]
	_arms = [_rig.find_child("ArmF", true, false), _rig.find_child("ArmB", true, false)]
	_guns = [_rig.find_child("GunF", true, false), _rig.find_child("GunB", true, false)]
	_gun_shapes = [_rig.find_child("GunFShape", true, false), _rig.find_child("GunBShape", true, false)]
	_anim.mixer_applied.connect(_apply_aim)
	facing = facing
	pose("idle")
	(_group.material as ShaderMaterial).set_shader_parameter("rim_color", Palette.RIM)


## 빛 받은 명암: 가장 가까운 켜진 조명 쪽을 향한 가장자리에 림라이트 띠 (정전이면 옅게 위쪽에서). 실제 프레임마다
func _process(_delta: float) -> void:
	var mat := _group.material as ShaderMaterial
	var dir := Vector2(0.0, -1.0)
	var strength := C.LIGHT_DARK_STRENGTH
	var b := get_parent()
	var arena = b.get("arena") if b != null else null
	if arena != null and is_instance_valid(arena) and not arena.blackout:
		var c := global_position + Vector2(0, -28)
		var best := INF
		for i in arena.lamps.size():
			if not arena.lamps[i]:
				continue
			var lp: Vector2 = arena.lamp_pos(i)
			var d := c.distance_to(lp)
			if d < best:
				best = d
				dir = (lp - c).normalized()
		if best < INF:
			strength = 1.0
	# 너무 옆으로 누우면 몸 옆면 전체가 하얘짐 → 위쪽 성분을 남김
	dir = Vector2(dir.x, minf(dir.y, -0.45)).normalized()
	mat.set_shader_parameter("light_dir", dir)
	mat.set_shader_parameter("light_strength", strength)


func _collect(n: Node) -> void:
	for c in n.get_children():
		if c is Polygon2D:
			_shapes.append(c)
		_collect(c)


func has_pose(name: String) -> bool:
	return _anim != null and _anim.has_animation(name)


## 포즈로 (blend 초 동안 부드럽게, 0 이면 즉시). 이동 · 대기처럼 공격이 아닌 전환
func pose(name: String, blend := 0.0) -> void:
	if not has_pose(name):
		return
	pose_name = name
	_anim.play(name, blend)
	if blend <= 0.0:
		_anim.advance(0.0)


## 키포즈 전환: 1프레임에 다음 포즈로 + 이전 포즈 잔상 + 스미어
func snap(name: String) -> void:
	if not has_pose(name):
		return
	var before := _polys()
	pose(name)
	var after := _polys()
	_ghosts.append({ "polys": before, "t": 0.0, "life": C.SNAP_GHOST_TIME, "alpha": C.SNAP_GHOST_ALPHA })
	var sm := []
	for i in mini(before.size(), after.size()):
		var a: PackedVector2Array = before[i].xf * before[i].pts
		var b: PackedVector2Array = after[i].xf * after[i].pts
		if _centroid(a).distance_to(_centroid(b)) < C.SMEAR_MIN_MOVE:
			continue
		sm.append(Geometry2D.convex_hull(a + b))
	if not sm.is_empty():
		_smears.append({ "polys": sm, "ticks": C.SMEAR_FRAMES })
	queue_redraw()


## 지금 포즈의 잔상 하나 (대시 등)
func ghost(alpha := C.GHOST_ALPHA, life := C.GHOST_TIME) -> void:
	_ghosts.append({ "polys": _polys(), "t": 0.0, "life": life, "alpha": alpha })


## 팔 i (0 앞 · 1 뒤) 가 권총으로 전역 각도 angle 을 겨누게 (포즈 위에 덮어씀). NAN = 포즈 그대로
func set_aim(i: int, angle: float) -> void:
	_aim[i] = angle
	_apply_aim()


func clear_aim() -> void:
	_aim = [NAN, NAN]


## 포즈가 적용될 때마다 조준을 덮어씀: 총(팔 끝 + 총 회전) 방향이 angle 이 되게 팔을 돌림
func _apply_aim() -> void:
	if _rig == null:
		return
	var inv := _rig.global_transform.affine_inverse()
	for i in 2:
		var a: float = _aim[i]
		if is_nan(a) or _arms[i] == null:
			continue
		var la := inv.basis_xform(Vector2.from_angle(a)).angle()           # Rig 기준 각도 (뒤집힌 것까지)
		var parent := _arms[i].get_parent() as Node2D
		var pr := (inv * parent.global_transform).get_rotation()
		_arms[i].rotation = la - pr - _guns[i].rotation


## 권총 보이기 / 숨기기 (오프닝: 패링에 튕겨나간 권총을 다시 집을 때까지)
func set_gun_visible(i: int, on: bool) -> void:
	if _gun_shapes.size() > i and _gun_shapes[i] != null:
		_gun_shapes[i].visible = on


## 권총 빨간 점멸 (공격 예고). on = false 면 원래 색
func set_gun_flash(i: int, on: bool) -> void:
	if i == 0:
		gun_flash = on
	if _gun_shapes.size() > i and _gun_shapes[i] != null:
		_gun_shapes[i].color = C.COL_GUN_FLASH if on else C.COL_GUN


## 앞다리 보라색 발광 (발차기 예고 — 패링 불가). on = false 면 원래 색
var leg_glow := false
var gun_flash := false

func set_leg_glow(on: bool, pulse := 1.0) -> void:
	leg_glow = on
	for n in ["ThighFShape", "LegFShape"]:
		var sh := part(n)
		if sh != null:
			sh.color = C.COL_LIMB_FRONT.lerp(C.COL_KICK, 0.75 * pulse) if on else C.COL_LIMB_FRONT


## 부위들의 전역 다각형 [{ xf, pts }] — 어둠 위 예고 층이 같은 모양을 다시 그릴 때
func part_polys(names: Array) -> Array:
	var out := []
	for n in names:
		var sh := part(n)
		if sh != null and sh.is_visible_in_tree():
			out.append({ "xf": sh.global_transform, "pts": sh.polygon })
	return out


## 흰 테두리 (휘청 깜빡임)
func set_flash(on: bool) -> void:
	(_group.material as ShaderMaterial).set_shader_parameter("flash", 1.0 if on else 0.0)


## 총구 (전역). i = 0 앞 권총 · 1 뒷 권총
func muzzle(i: int) -> Vector2:
	return _muzzles[i].global_position if _muzzles[i] != null else global_position


## 총구 방향 (전역 각도)
func muzzle_angle(i: int) -> float:
	return _muzzles[i].global_transform.x.angle() if _muzzles[i] != null else 0.0


## 처치 두 조각 · 파편용 실루엣 [{ xf, shapes, body, rim }] (origin 기준 로컬 — 보통 철견 노드의 전역 변환)
## exclude = 빼낼 부위 이름 (피날레: 모자 · 권총은 따로 날아감), only = 이 부위만
func silhouette(origin: Transform2D, exclude: Array = [], only: Array = []) -> Array:
	var inv := origin.affine_inverse()
	var out := []
	for s in _shapes:
		if s.name in exclude or (not only.is_empty() and not (s.name in only)):
			continue
		if s.is_visible_in_tree():
			out.append({ "xf": inv * s.global_transform, "shapes": [["poly", s.polygon]], "body": s.color, "rim": C.COL_RIM })
	return out


## 부위 이름 → Polygon2D (모자 날리기 등)
func part(name: String) -> Polygon2D:
	return _rig.find_child(name, true, false) as Polygon2D


func _polys() -> Array:
	var out := []
	for s in _shapes:
		if s.is_visible_in_tree():
			out.append({ "xf": s.global_transform, "pts": s.polygon })
	return out


static func _centroid(pts: PackedVector2Array) -> Vector2:
	var c := Vector2.ZERO
	for p in pts:
		c += p
	return c / maxf(1.0, pts.size())


func _physics_process(delta: float) -> void:
	if _ghosts.is_empty() and _smears.is_empty():
		return
	for g in _ghosts:
		g.t += delta
	_ghosts = _ghosts.filter(func(g): return g.t < g.life)
	if not TimeManager.frozen:
		for s in _smears:
			s.ticks -= 1
		_smears = _smears.filter(func(s): return s.ticks > 0)
	queue_redraw()


## 잔상 · 스미어 (몸 뒤에 — 이 노드의 그리기는 자식인 Group 보다 먼저)
func _draw() -> void:
	var inv := global_transform.affine_inverse()
	for s in _smears:
		draw_set_transform_matrix(inv)
		for pts in s.polys:
			if pts.size() >= 3:
				draw_colored_polygon(pts, Color(C.COL_GHOST, C.SMEAR_ALPHA))
	for g in _ghosts:
		var a: float = g.alpha * (1.0 - g.t / g.life)
		for p in g.polys:
			draw_set_transform_matrix(inv * p.xf)
			draw_colored_polygon(p.pts, Color(C.COL_GHOST, a))
	draw_set_transform_matrix(Transform2D.IDENTITY)

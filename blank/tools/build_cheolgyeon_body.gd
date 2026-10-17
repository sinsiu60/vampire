extends SceneTree
## scenes/CheolgyeonBody.tscn 을 처음 만드는 도구 (한 번만 돌리면 됨 — 그 뒤엔 에디터에서 씬을 직접 고쳐도 됨).
##   godot --headless --path . --script res://tools/build_cheolgyeon_body.gd
## 다시 돌리면 씬을 덮어씀 (에디터에서 고친 포즈가 사라짐).
##
## 뼈대 (오른쪽을 봄, 원점 = 발 중앙, 각도는 라디안 · 시계 방향 +):
##   Rig / Hip(허리, 위치 = 웅크림) ─ Coat(코트 자락, 다리 뒤) · ThighB─ShinB · ThighF─ShinF ·
##         Torso(역삼각형 몸통, + = 앞으로 숙임) ─ ArmB─GunB─MuzzleB · Head─Hat · ArmF─GunF─MuzzleF
##   다리 0 = 아래로 곧게 (+ = 발이 뒤로), 팔 0 = 몸통 기준 앞으로 수평 (π/2 = 아래로), 총 0 = 팔과 같은 방향

const C := preload("res://scripts/boss/CheolgyeonConfig.gd")
const OUT := "res://scenes/CheolgyeonBody.tscn"

## 포즈 키프레임 — 빠진 값은 idle 과 같음
const IDLE := {
	"hip": Vector2(0, -24), "hip_r": 0.0, "torso": 0.06, "head": -0.06, "coat": 0.08,
	"thigh_f": -0.1, "shin_f": 0.06, "thigh_b": 0.14, "shin_b": 0.04,
	"arm_f": 1.19, "gun_f": -0.6, "arm_b": 1.74, "gun_b": -0.7,
}
const POSES := {
	"idle": {},
	# 앞으로 크게 쏠림
	"dash": { "hip": Vector2(0, -21), "torso": 0.8, "head": -0.55, "coat": 0.75,
		"thigh_f": -0.9, "shin_f": 1.1, "thigh_b": 0.8, "shin_b": 0.3, "arm_f": -0.3, "gun_f": 0.0, "arm_b": 1.9, "gun_b": 0.2 },
	# 한쪽 무릎 꿇고 미끄러지며 앞팔 뻗음
	"slide": { "hip": Vector2(0, -9), "torso": -0.25, "head": 0.15, "coat": 0.95,
		"thigh_f": -1.3, "shin_f": -0.1, "thigh_b": 0.9, "shin_b": 0.67, "arm_f": 0.2, "gun_f": 0.0, "arm_b": 2.35, "gun_b": -0.4 },
	# 상체 뒤로 젖히고 권총을 머리 위 뒤쪽으로
	"whip_windup": { "hip": Vector2(0, -23), "torso": -0.5, "head": -0.1, "coat": -0.15,
		"thigh_f": -0.45, "shin_f": 0.35, "thigh_b": 0.3, "shin_b": 0.1, "arm_f": -1.6, "gun_f": -0.5, "arm_b": 1.5, "gun_b": -0.6 },
	# 크게 앞으로 숙이며 권총 무릎 아래까지
	"whip_smash": { "hip": Vector2(0, -19), "torso": 1.1, "head": -0.8, "coat": 0.9,
		"thigh_f": -0.85, "shin_f": 0.9, "thigh_b": 0.7, "shin_b": 0.15, "arm_f": 0.25, "gun_f": 0.3, "arm_b": 1.5, "gun_b": -0.3 },
	# 무릎 가슴까지
	"kick_ready": { "hip": Vector2(0, -25), "torso": -0.15, "head": 0.1, "coat": 0.2,
		"thigh_f": -2.2, "shin_f": 2.3, "thigh_b": 0.05, "shin_b": 0.05, "arm_f": 0.55, "gun_f": -0.2, "arm_b": 2.55, "gun_b": -0.4 },
	# 다리 수평으로 뻗고 상체 뒤로
	"kick": { "hip": Vector2(0, -25), "torso": -0.6, "head": 0.35, "coat": -0.4,
		"thigh_f": -1.6, "shin_f": 0.0, "thigh_b": 0.12, "shin_b": 0.05, "arm_f": -2.0, "gun_f": -0.3, "arm_b": 3.4, "gun_b": -0.3 },
	# 웅크린 공중
	"jump": { "hip": Vector2(0, -27), "torso": 0.35, "head": -0.2, "coat": 0.55,
		"thigh_f": -1.5, "shin_f": 2.1, "thigh_b": -0.7, "shin_b": 2.2, "arm_f": 0.55, "gun_f": -0.3, "arm_b": 1.85, "gun_b": -0.5 },
	# 공중에서 두 팔 아래 대각선
	"air_fire": { "hip": Vector2(0, -27), "torso": 0.15, "head": 0.25, "coat": 0.65,
		"thigh_f": -1.0, "shin_f": 1.5, "thigh_b": -0.2, "shin_b": 1.4, "arm_f": 0.6, "gun_f": 0.0, "arm_b": 0.75, "gun_b": 0.0 },
	# 깊게 웅크린 착지, 한 손 바닥
	"land": { "hip": Vector2(0, -10), "torso": 0.95, "head": -0.75, "coat": 0.7,
		"thigh_f": -1.75, "shin_f": 2.4, "thigh_b": 1.0, "shin_b": 0.57, "arm_f": 0.55, "gun_f": 0.9, "arm_b": 1.65, "gun_b": -0.4 },
	# 권총 허리에, 손 늘어뜨림
	"duel": { "torso": 0.0, "head": 0.12, "coat": 0.0,
		"thigh_f": -0.25, "shin_f": 0.08, "thigh_b": 0.25, "shin_b": 0.05, "arm_f": 1.5, "gun_f": -1.2, "arm_b": 1.62, "gun_b": -1.3 },
	# 앞팔 수평으로 뻗어 발사
	"draw_fire": { "torso": -0.08, "head": -0.05, "coat": -0.1,
		"thigh_f": -0.25, "shin_f": 0.08, "thigh_b": 0.25, "shin_b": 0.05, "arm_f": 0.08, "gun_f": 0.0, "arm_b": 1.83, "gun_b": -1.0 },
	# 앞팔 위 대각선
	"aim_up": { "torso": -0.2, "head": -0.35, "coat": -0.1,
		"thigh_f": -0.2, "thigh_b": 0.2, "arm_f": -0.6, "gun_f": 0.0, "arm_b": 1.8, "gun_b": -0.8 },
	# 상체 뒤로 젖혀짐
	"stagger": { "hip": Vector2(-2, -22), "torso": -0.75, "head": -0.55, "coat": -0.7,
		"thigh_f": -0.5, "shin_f": 0.45, "thigh_b": 0.4, "shin_b": 0.25, "arm_f": 3.15, "gun_f": 0.6, "arm_b": -1.45, "gun_b": 0.3 },
	# 앞으로 숙이며 양팔 아래로 벌림
	"roar": { "hip": Vector2(0, -21), "torso": 0.55, "head": -1.0, "coat": 0.5,
		"thigh_f": -0.4, "shin_f": 0.35, "thigh_b": 0.45, "shin_b": 0.1, "arm_f": 0.35, "gun_f": 0.3, "arm_b": 1.75, "gun_b": 0.3 },
	# (보조) 대시 · 점프 전 웅크림
	"crouch": { "hip": Vector2(0, -17), "torso": 0.45, "head": -0.35, "coat": 0.4,
		"thigh_f": -0.95, "shin_f": 1.5, "thigh_b": 0.35, "shin_b": 0.9, "arm_f": 0.5, "gun_f": -0.3, "arm_b": 1.55, "gun_b": -0.5 },
	# (보조) 권총으로 칼을 막음
	"block": { "hip": Vector2(0, -23), "torso": -0.15, "head": 0.05, "coat": -0.2,
		"thigh_f": -0.35, "shin_f": 0.3, "thigh_b": 0.35, "shin_b": 0.1, "arm_f": -1.05, "gun_f": -0.6, "arm_b": 1.85, "gun_b": -0.6 },
}

## 키 → 노드 경로 (AnimationPlayer 의 root = CheolgyeonBody) · 속성
const TRACKS := {
	"hip": ["Group/Rig/Hip", "position"], "hip_r": ["Group/Rig/Hip", "rotation"],
	"torso": ["Group/Rig/Hip/Torso", "rotation"], "head": ["Group/Rig/Hip/Torso/Head", "rotation"],
	"coat": ["Group/Rig/Hip/Coat", "rotation"],
	"thigh_f": ["Group/Rig/Hip/ThighF", "rotation"], "shin_f": ["Group/Rig/Hip/ThighF/ShinF", "rotation"],
	"thigh_b": ["Group/Rig/Hip/ThighB", "rotation"], "shin_b": ["Group/Rig/Hip/ThighB/ShinB", "rotation"],
	"arm_f": ["Group/Rig/Hip/Torso/ArmF", "rotation"], "gun_f": ["Group/Rig/Hip/Torso/ArmF/GunF", "rotation"],
	"arm_b": ["Group/Rig/Hip/Torso/ArmB", "rotation"], "gun_b": ["Group/Rig/Hip/Torso/ArmB/GunB", "rotation"],
}

var body_root: Node2D


func _init() -> void:
	body_root = Node2D.new()
	body_root.name = "CheolgyeonBody"
	body_root.set_script(load("res://scripts/boss/CheolgyeonBody.gd"))
	var group := CanvasGroup.new()
	group.name = "Group"
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/rim_outline.gdshader")
	mat.set_shader_parameter("rim_color", C.COL_RIM)
	mat.set_shader_parameter("flash_color", C.COL_RIM_FLASH)
	group.material = mat
	_add(body_root, group)
	var rig := _bone(group, "Rig", Vector2.ZERO)
	var hip := _bone(rig, "Hip", IDLE.hip)
	# 코트 자락: 허리에서 무릎 아래까지, 다리 뒤로 (+ 회전 = 자락이 뒤로 날림)
	var coat := _bone(hip, "Coat", Vector2(0, -2))
	_shape(coat, "CoatShape", [Vector2(-6, 0), Vector2(5, 0), Vector2(6, 9), Vector2(3, 19), Vector2(-3, 22), Vector2(-11, 19), Vector2(-9, 8)], C.COL_COAT)
	# 다리 (허벅지 12 + 정강이 12, 정강이 끝에 앞으로 발)
	for side in ["B", "F"]:
		var col: Color = C.COL_LIMB_BACK if side == "B" else C.COL_LIMB_FRONT
		var thigh := _bone(hip, "Thigh" + side, Vector2(-2.0 if side == "B" else 2.0, 0))
		_shape(thigh, "Thigh%sShape" % side, [Vector2(-2.8, -1), Vector2(2.8, -1), Vector2(2.3, 12), Vector2(-2.3, 12)], col)
		var shin := _bone(thigh, "Shin" + side, Vector2(0, 12))
		_shape(shin, "Leg%sShape" % side, [Vector2(-2.3, 0), Vector2(2.3, 0), Vector2(2.0, 9.5), Vector2(5.5, 10), Vector2(5.5, 12), Vector2(-2.6, 12)], col)
	# 몸통: 어깨 넓은 역삼각형 + 허리띠
	var torso := _bone(hip, "Torso", Vector2.ZERO)
	# 뒷팔 + 권총 (몸통보다 먼저 = 몸통 뒤에 그려짐)
	_arm(torso, "B", Vector2(-3, -18), C.COL_LIMB_BACK)
	_shape(torso, "TorsoShape", [Vector2(-4.5, 2), Vector2(4.5, 2), Vector2(5.5, -3), Vector2(11, -17), Vector2(12, -21),
		Vector2(4, -22.5), Vector2(-4, -22.5), Vector2(-12, -21), Vector2(-11, -17), Vector2(-5.5, -3)], C.COL_BODY)
	# 머리 + 페도라 (넓은 챙)
	var head := _bone(torso, "Head", Vector2(1, -22))
	_shape(head, "HeadShape", [Vector2(-3, -7), Vector2(3, -7), Vector2(4, -3), Vector2(2.5, 0), Vector2(-2, 0), Vector2(-3.5, -3)], C.COL_BODY)
	_shape(head, "Hat", [Vector2(-9, -7.5), Vector2(-4.5, -7.5), Vector2(-4, -12), Vector2(-1, -11), Vector2(1, -12.5),
		Vector2(4.5, -11.5), Vector2(5, -7.5), Vector2(10, -7.5), Vector2(11, -6), Vector2(-8, -5.5)], C.COL_HAT)
	# 앞팔 + 권총
	_arm(torso, "F", Vector2(3, -18), C.COL_LIMB_FRONT)
	# 포즈
	var ap := AnimationPlayer.new()
	ap.name = "Anim"
	_add(body_root, ap)
	var lib := AnimationLibrary.new()
	for pname in POSES:
		lib.add_animation(pname, _make_pose(POSES[pname]))
	ap.add_animation_library("", lib)
	ap.autoplay = "idle"
	_apply(POSES.idle)
	var ps := PackedScene.new()
	var err := ps.pack(body_root)
	if err != OK:
		push_error("pack 실패 %d" % err)
	err = ResourceSaver.save(ps, OUT)
	print("saved ", OUT, " err=", err, " poses=", POSES.size())
	quit()


func _add(parent: Node, n: Node) -> void:
	parent.add_child(n)
	n.owner = body_root


func _bone(parent: Node, name: String, pos: Vector2) -> Node2D:
	var b := Node2D.new()
	b.name = name
	b.position = pos
	_add(parent, b)
	return b


func _shape(bone: Node, name: String, pts: Array, col: Color) -> Polygon2D:
	var p := Polygon2D.new()
	p.name = name
	p.polygon = PackedVector2Array(pts)
	p.color = col
	_add(bone, p)
	return p


## 팔 (어깨에서 앞으로 13px, 소매 끝이 살짝 넓음) + 끝에 권총 (총구 Marker)
func _arm(torso: Node, side: String, shoulder: Vector2, col: Color) -> void:
	var arm := _bone(torso, "Arm" + side, shoulder)
	_shape(arm, "Arm%sShape" % side, [Vector2(-2, -2.4), Vector2(9, -2), Vector2(13, -1.6), Vector2(13, 1.6), Vector2(9, 2), Vector2(-2, 2.4)], col)
	var gun := _bone(arm, "Gun" + side, Vector2(12.5, 0))
	_shape(gun, "Gun%sShape" % side, [Vector2(-1, -2.2), Vector2(9, -2.2), Vector2(9, -0.2), Vector2(2.5, -0.2), Vector2(2.5, 3.2), Vector2(-1, 3.2)], C.COL_GUN)
	var m := Marker2D.new()
	m.name = "Muzzle" + side
	m.position = Vector2(9, -1.2)
	_add(gun, m)


func _value(p: Dictionary, k: String):
	return p.get(k, IDLE[k])


func _make_pose(p: Dictionary) -> Animation:
	var a := Animation.new()
	a.length = 0.1
	for k in TRACKS:
		var tr: Array = TRACKS[k]
		var i := a.add_track(Animation.TYPE_VALUE)
		a.track_set_path(i, NodePath("%s:%s" % [tr[0], tr[1]]))
		a.value_track_set_update_mode(i, Animation.UPDATE_CONTINUOUS)
		a.track_set_interpolation_type(i, Animation.INTERPOLATION_LINEAR)
		a.track_insert_key(i, 0.0, _value(p, k))
	return a


## 저장되는 기본 자세 = idle
func _apply(p: Dictionary) -> void:
	for k in TRACKS:
		var tr: Array = TRACKS[k]
		var n := body_root.get_node(tr[0])
		n.set(tr[1], _value(p, k))

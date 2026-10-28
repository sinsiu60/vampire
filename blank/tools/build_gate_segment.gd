extends Node
## 관문 구간 씬 (rooms/ch1/seg_gate_01.tscn) 을 처음 한 번 만드는 도구. 만든 뒤에는 에디터에서 그냥 고치면 됨.
## 실행: 이 스크립트를 붙인 빈 씬을 띄우면 (오토로드가 있어야 해서 -s 로는 안 됨) 씬을 저장하고 끝남.
##
## 모양 (타일 8px, 높이 34칸 = 다른 방과 같음, 바닥 윗면 y 240):
##  x 0 ~ 608 · 체크포인트 (PlayerSpawn) x 44 · 뒤 셔터 x 88 · 시작선 x 150 · 앞 셔터 x 520 · 보스방 문 x 576
##  가운데 일방향 발판 (x 264 ~ 328, y 192) — 총잡이가 위에 내려앉음
##  웨이브 3개 (적 10명): 근접 · 근접 · 총잡이 / 돌격병 · 연사병 · 근접 / 척탄병 · 근접 · 근접 · 총잡이 (발판 위)

const OUT := "res://rooms/ch1/seg_gate_01.tscn"
const W := 76                    # 칸
const FLOOR := 30                # 바닥 윗줄 (y 240)
const H := 34

const WAVES := [
	[["melee", 200], ["melee", 420], ["gunner", 470]],
	[["charger", 250], ["burst", 440], ["melee", 150]],
	[["grenadier", 470], ["melee", 180], ["melee", 360], ["gunner", 296, 180]],
]


func _ready() -> void:
	var root := Node2D.new()
	root.name = "seg_gate_01"
	root.set_script(load("res://scripts/Room.gd"))
	root.set("room_title", "관문 — 하운드 보안 셔터 잠금 전투 (웨이브 3)")
	root.set("paint_terrain", true)
	root.set("art_style", "alley")
	root.set("lamp_xs", PackedFloat32Array([60, 300, 560]))
	root.set("ambience", "rain_loop")
	root.set("ambience_volume", 0.2)

	var tm := TileMapLayer.new()
	tm.name = "Terrain"
	tm.tile_set = load("res://tiles/terrain.tres")
	for x in W:
		for y in range(FLOOR, H):
			tm.set_cell(Vector2i(x, y), 0, Vector2i(0, 0) if y == FLOOR and x > 0 and x < W - 1 else Vector2i(1, 0))
	for y in FLOOR:
		tm.set_cell(Vector2i(0, y), 0, Vector2i(1, 0))
		tm.set_cell(Vector2i(W - 1, y), 0, Vector2i(1, 0))
	for x in range(33, 41):
		tm.set_cell(Vector2i(x, 24), 0, Vector2i(2, 0))       # 일방향 발판
	_add(root, tm, root)

	var door_scene: PackedScene = load("res://scenes/Door.tscn")
	var ent: Node2D = door_scene.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	ent.name = "Entrance"
	ent.position = Vector2(20, 240)
	ent.set("kind", "entrance")
	_add(root, ent, root)

	var spawn := Marker2D.new()
	spawn.name = "PlayerSpawn"
	spawn.position = Vector2(44, 240)
	_add(root, spawn, root)

	var ex: Node2D = door_scene.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	ex.name = "Exit"
	ex.position = Vector2(576, 240)
	ex.set("door_type", "boss")
	_add(root, ex, root)

	var en := Node2D.new()
	en.name = "Enemies"
	_add(root, en, root)

	var gate := Node2D.new()
	gate.name = "Gate"
	gate.set_script(load("res://scripts/level/Gate.gd"))
	_add(root, gate, root)
	for d in [["Back", 88.0], ["Front", 520.0]]:
		var sh: Node2D = door_scene.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
		sh.name = d[0]
		sh.position = Vector2(d[1], 240)
		sh.set("start_open", true)
		sh.set("radio_key", "")
		_add(gate, sh, root)
	var trig := Marker2D.new()
	trig.name = "Trigger"
	trig.position = Vector2(150, 240)
	_add(gate, trig, root)
	var spawn_script := load("res://scripts/level/GateSpawn.gd")
	for wi in WAVES.size():
		var wave := Node2D.new()
		wave.name = "Wave%d" % (wi + 1)
		_add(gate, wave, root)
		for si in WAVES[wi].size():
			var s: Array = WAVES[wi][si]
			var m := Marker2D.new()
			m.set_script(spawn_script)
			m.name = "%s%d" % [String(s[0]).capitalize(), si + 1]
			m.set("kind", s[0])
			m.position = Vector2(float(s[1]), float(s[2]) if s.size() > 2 else 236.0)
			_add(wave, m, root)

	SegmentKit.finish_ch1(root, "seg_gate_01")   # 구간 정보 · Props · CameraBounds · TransitionZones
	var ps := PackedScene.new()
	var err := ps.pack(root)
	if err == OK:
		err = ResourceSaver.save(ps, OUT)
	print("build_gate_segment: ", OUT, " → ", error_string(err))
	root.free()
	get_tree().quit()


func _add(parent: Node, child: Node, root: Node) -> void:
	parent.add_child(child)
	child.owner = root

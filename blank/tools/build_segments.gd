extends Node
## 1장 이어진 맵 2단계 (그레이박스) 구간 씬들을 처음 한 번 만드는 도구 → rooms/ch1/seg_*.tscn. 만든 뒤에는 에디터에서 고침.
## 실행: 이 스크립트를 붙인 빈 씬을 띄움 (오토로드가 있어야 해서 -s 로는 안 됨). 이미 있는 파일은 덮어씀.
##
## 칸 = 8px. 거리 구간은 높이 34칸 (바닥 윗줄 30 = y 240), 옥상 · 비상계단 구간은 54칸 (거리 50 = y 400, 옥상 30 = y 240).
## 이어 붙일 때 Level 이 join_left / join_right 높이를 맞춤 (거리 → 비상계단 → 옥상 → 내려옴 → 거리).
## 점프: 최대 약 58px · 달려서 약 78px → 발판 간격은 세로 40px · 틈은 48px 이하. 틈에 떨어져도 발판으로 다시 올라옴.
##
## 데이터 (구간마다):
##  w · h · floor (바닥 윗줄, -1 = 바닥 없음) · fills [x0, y0, x1, y1] (칸, 끝 포함, 지형) · clears (지움) · plats [x0, x1, 줄] (일방향 발판)
##  enemies [종류, x px, y px, {속성}] · spawn [x, y] (체크포인트 · 없으면 null) · radios [키, x, y, w, h] · lamps · join_left/right · art · title
##  gate { x_back, x_front, trigger, waves [[[종류, x, y], ...], ...], radio_start, radio_clear } · exit [x, y] (보스방 문)

const DIR := "res://rooms/ch1/"
const ENEMY_SCENES := {
	"melee": "res://scenes/EnemyMelee.tscn", "charger": "res://scenes/EnemyMelee.tscn",
	"gunner": "res://scenes/EnemyGunner.tscn", "burst": "res://scenes/EnemyGunner.tscn",
	"grenadier": "res://scenes/EnemyGrenadier.tscn",
}

const SEGMENTS := {
	# ---- 골목 조합 A (방 4 와 5 사이): 턱 위 총잡이 · 발판 위 연사병 · 근접 둘 · 돌격병
	"seg_alley_a": {
		"title": "골목 조합 A — 턱 위 총잡이 · 발판 연사병 · 근접 · 돌격병",
		"w": 130, "h": 34, "floor": 30, "art": "alley",
		"fills": [[40, 26, 52, 29]],
		"plats": [[70, 80, 24]],
		"enemies": [["melee", 300, 240], ["gunner", 368, 208], ["burst", 600, 192], ["melee", 760, 240], ["charger", 920, 240]],
		"spawn": [44, 240], "lamps": [120, 420, 700, 960],
	},
	# ---- 쉬어가는 길 A (관문 1 뒤): 적 없음, 무전 — 이제 위로
	"seg_rest_a": {
		"title": "쉬어가는 길 A — 시장 끝, 무전",
		"w": 100, "h": 34, "floor": 30, "art": "alley",
		"fills": [[30, 28, 33, 29], [62, 28, 64, 29]],
		"radios": [["rest_market_end", 96, 200, 32, 48]],
		"spawn": [44, 240], "lamps": [100, 340, 600],
	},
	# ---- 비상계단 (거리 400 → 옥상 240): 건물 벽에 붙은 발판 3단, 발판 위 · 옥상 위 총잡이
	"seg_climb": {
		"title": "비상계단 — 거리에서 옥상으로 (발판 3단)",
		"w": 100, "h": 54, "floor": 50, "art": "alley", "join_left": 400, "join_right": 240,
		"fills": [[66, 30, 99, 53]],
		"plats": [[56, 64, 45], [46, 54, 40], [56, 64, 35]],
		"enemies": [["melee", 220, 400], ["gunner", 400, 320], ["gunner", 690, 240, { "first_delay": 0.8 }]],
		"spawn": [44, 400], "lamps": [150, 380],
	},
	# ---- 옥상 A: 건물 사이 틈 2개 (떨어지면 발판으로 다시), 물탱크 위 총잡이
	"seg_roof_a": {
		"title": "옥상 A — 틈 2개 · 물탱크 위 총잡이 · 척탄병 · 돌격병",
		"w": 140, "h": 54, "floor": 30, "art": "roof",
		"fills": [[20, 28, 23, 29], [110, 25, 118, 29]],
		"clears": [[44, 30, 49, 49], [92, 30, 97, 49]],
		"plats": [[44, 46, 45], [47, 49, 40], [44, 46, 35], [92, 94, 45], [95, 97, 40], [92, 94, 35]],
		"enemies": [["melee", 240, 240], ["grenadier", 520, 240], ["melee", 600, 240], ["charger", 820, 240],
			["gunner", 912, 200], ["burst", 1040, 240]],
		"radios": [["roof_top", 80, 200, 32, 48], ["roof_gap", 300, 200, 32, 48]],
		"spawn": [44, 240],
	},
	# ---- 옥상 B: 한 층 높은 옥상 · 그 위 광고판 발판 (연사병) · 틈 1개
	"seg_roof_b": {
		"title": "옥상 B — 높은 옥상 · 광고판 위 연사병 · 틈",
		"w": 140, "h": 54, "floor": 30, "art": "roof",
		"fills": [[50, 25, 90, 29]],
		"clears": [[104, 30, 109, 49]],
		"plats": [[66, 76, 20], [104, 106, 45], [107, 109, 40], [104, 106, 35]],
		"enemies": [["melee", 200, 240], ["grenadier", 480, 200], ["burst", 568, 160], ["gunner", 700, 200],
			["charger", 960, 240], ["melee", 1060, 240]],
		"spawn": [44, 240],
	},
	# ---- 내려가기 (옥상 240 → 거리 400): 발판 3단으로 내려감, 아래에서 기다리는 근접 둘
	"seg_descent": {
		"title": "내려가기 — 옥상에서 거리로 (발판 3단)",
		"w": 90, "h": 54, "floor": 50, "art": "roof", "join_left": 240, "join_right": 400,
		"fills": [[0, 30, 40, 53]],
		"plats": [[42, 48, 35], [50, 56, 40], [58, 64, 45]],
		"enemies": [["gunner", 424, 320], ["melee", 560, 400], ["melee", 650, 400]],
		"spawn": [44, 240],
	},
	# ---- 골목 조합 B: 발판 연사병 · 턱 위 총잡이 · 돌격병 · 척탄병 · 근접 둘
	"seg_alley_b": {
		"title": "골목 조합 B — 돌격병 · 발판 연사병 · 척탄병 · 턱 위 총잡이 · 근접 둘",
		"w": 130, "h": 34, "floor": 30, "art": "alley",
		"fills": [[104, 26, 110, 29]],
		"plats": [[40, 48, 24]],
		"enemies": [["charger", 260, 240], ["burst", 352, 192], ["grenadier", 560, 240], ["melee", 640, 240],
			["gunner", 856, 208], ["melee", 960, 240]],
		"spawn": [44, 240], "lamps": [100, 380, 640, 900],
	},
	# ---- 쉬어가는 길 B (마지막 관문 앞): 무전 — 저 탑이 철견 구역. 체크포인트 없음 (관문 앞이 체크포인트)
	"seg_rest_b": {
		"title": "쉬어가는 길 B — 철견 구역 앞, 무전",
		"w": 70, "h": 34, "floor": 30, "art": "alley",
		"radios": [["rest_tower", 80, 200, 32, 48]],
		"spawn": null, "lamps": [120, 400],
	},
	# ---- 관문 2 (마지막 시험): 발판 2개 · 웨이브 3 (13명) → 보스방 문
	"seg_gate_02": {
		"title": "관문 2 — 마지막 시험 (웨이브 3) → 보스방 문",
		"w": 80, "h": 34, "floor": 30, "art": "alley",
		"plats": [[30, 38, 24], [52, 60, 24]],
		"spawn": [44, 240], "lamps": [60, 320, 600],
		"exit": [600, 240],
		"gate": { "x_back": 88, "x_front": 560, "trigger": 150, "radio_start": "gate2_start", "radio_clear": "gate2_clear",
			"waves": [
				[["charger", 220, 236], ["melee", 330, 236], ["burst", 448, 180], ["melee", 520, 236]],
				[["melee", 200, 236], ["gunner", 272, 180], ["charger", 380, 236], ["grenadier", 480, 236]],
				[["melee", 180, 236], ["burst", 260, 180], ["charger", 300, 236], ["burst", 450, 180], ["grenadier", 500, 236]],
			] },
	},
}


func _ready() -> void:
	for nm in SEGMENTS:
		var err := _build(nm, SEGMENTS[nm])
		print("build_segments: ", nm, " → ", error_string(err))
	get_tree().quit()


func _build(nm: String, D: Dictionary) -> Error:
	var W: int = D.w
	var H: int = D.h
	var root := Node2D.new()
	root.name = nm
	root.set_script(load("res://scripts/Room.gd"))
	root.set("room_title", D.title)
	root.set("paint_terrain", true)
	root.set("art_style", D.get("art", "alley"))
	root.set("lamp_xs", PackedFloat32Array(D.get("lamps", [])))
	root.set("ambience", "rain_loop")
	root.set("ambience_volume", 0.2)
	root.set("join_left", float(D.get("join_left", 240)))
	root.set("join_right", float(D.get("join_right", 240)))

	# 지형: 칸 표 → 윗면 (위가 비었으면 (0,0)) · 속 (1,0) · 발판 (2,0)
	var solid := {}
	var fl: int = D.get("floor", 30)
	if fl >= 0:
		for x in W:
			for y in range(fl, H):
				solid[Vector2i(x, y)] = true
	for y in H:
		solid[Vector2i(0, y)] = true
		solid[Vector2i(W - 1, y)] = true
	for f in D.get("fills", []):
		for x in range(f[0], f[2] + 1):
			for y in range(f[1], f[3] + 1):
				solid[Vector2i(x, y)] = true
	for f in D.get("clears", []):
		for x in range(f[0], f[2] + 1):
			for y in range(f[1], f[3] + 1):
				solid.erase(Vector2i(x, y))
	var tm := TileMapLayer.new()
	tm.name = "Terrain"
	tm.tile_set = load("res://tiles/terrain.tres")
	for c in solid:
		var top: bool = not solid.has(c - Vector2i(0, 1)) and c.x > 0 and c.x < W - 1
		tm.set_cell(c, 0, Vector2i(0, 0) if top else Vector2i(1, 0))
	for pl in D.get("plats", []):
		for x in range(pl[0], pl[1] + 1):
			tm.set_cell(Vector2i(x, pl[2]), 0, Vector2i(2, 0))
	_add(root, tm, root)

	var door_scene: PackedScene = load("res://scenes/Door.tscn")
	var ent: Node2D = door_scene.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	ent.name = "Entrance"
	ent.position = Vector2(20, float(D.get("join_left", 240)))
	ent.set("kind", "entrance")
	_add(root, ent, root)
	if D.get("spawn") != null:
		var sp := Marker2D.new()
		sp.name = "PlayerSpawn"
		sp.position = Vector2(D.spawn[0], D.spawn[1])
		_add(root, sp, root)
	if D.has("exit"):
		var ex: Node2D = door_scene.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
		ex.name = "Exit"
		ex.position = Vector2(D.exit[0], D.exit[1])
		ex.set("door_type", "boss")
		_add(root, ex, root)

	var en := Node2D.new()
	en.name = "Enemies"
	_add(root, en, root)
	var counts := {}
	for e in D.get("enemies", []):
		var kind: String = e[0]
		var inst: Node2D = (load(ENEMY_SCENES[kind]) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
		counts[kind] = int(counts.get(kind, 0)) + 1
		inst.name = "%s%d" % [kind.capitalize(), counts[kind]]
		inst.position = Vector2(e[1], e[2])
		if kind == "charger":
			inst.set("variant", "charger")
		elif kind == "burst":
			inst.set("burst_count", 2)
		if e.size() > 3:
			for k in e[3]:
				inst.set(k, e[3][k])
		_add(en, inst, root)

	var rt_script := load("res://scripts/RadioTrigger.gd")
	for r in D.get("radios", []):
		var a := Area2D.new()
		a.set_script(rt_script)
		a.name = "Radio_%s" % r[0]
		a.position = Vector2(r[1], r[2])
		a.set("key", r[0])
		a.set("size", Vector2(r[3], r[4]))
		_add(root, a, root)

	if D.has("gate"):
		var G: Dictionary = D.gate
		var gate := Node2D.new()
		gate.name = "Gate"
		gate.set_script(load("res://scripts/level/Gate.gd"))
		gate.set("radio_start", G.get("radio_start", ""))
		gate.set("radio_clear", G.get("radio_clear", ""))
		_add(root, gate, root)
		for d in [["Back", G.x_back], ["Front", G.x_front]]:
			var sh: Node2D = door_scene.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
			sh.name = d[0]
			sh.position = Vector2(float(d[1]), 240)
			sh.set("start_open", true)
			sh.set("radio_key", "")
			_add(gate, sh, root)
		var trig := Marker2D.new()
		trig.name = "Trigger"
		trig.position = Vector2(float(G.trigger), 240)
		_add(gate, trig, root)
		var spawn_script := load("res://scripts/level/GateSpawn.gd")
		for wi in G.waves.size():
			var wave := Node2D.new()
			wave.name = "Wave%d" % (wi + 1)
			_add(gate, wave, root)
			for si in G.waves[wi].size():
				var s: Array = G.waves[wi][si]
				var m := Marker2D.new()
				m.set_script(spawn_script)
				m.name = "%s%d" % [String(s[0]).capitalize(), si + 1]
				m.set("kind", s[0])
				m.position = Vector2(float(s[1]), float(s[2]))
				_add(wave, m, root)

	var ps := PackedScene.new()
	var err := ps.pack(root)
	if err == OK:
		err = ResourceSaver.save(ps, DIR + nm + ".tscn")
	root.free()
	return err


func _add(parent: Node, child: Node, root: Node) -> void:
	parent.add_child(child)
	child.owner = root

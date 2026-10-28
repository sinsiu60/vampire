@tool
extends Node2D
class_name Gate
## 관문 (셔터 잠금 전투). 구간 씬에 놓고, 아래에:
##  Back · Front   Door (shutter, start_open) — 뒤 · 앞 셔터 (열린 채 시작)
##  Trigger        Marker2D — 플레이어가 이 x 를 지나면 시작
##  Wave1, Wave2 …  Node2D — 아래에 GateSpawn (적 종류 · 착지 지점) 을 놓음. 이름 순서대로 웨이브
##  CameraZone     CameraZone (kind gate) — 셔터 사이 카메라 영역 (줌 0.9 · 경계 고정). 관문 동안만 켜짐. 없으면 셔터 사이로 만듦
## 흐름: 시작 → 앞뒤 셔터가 위에서 0.2초 만에 닫힘 + shutter_close + 흔들림 4px + 무전 "gate_start"
##       → 웨이브마다 GateSpawn 을 SPAWN_GAP 간격으로 SpawnDrop (동시에 떠 있는 붉은 타원은 MAX_MARKS 개까지)
##       → 웨이브를 다 처치하면 WAVE_GAP 뒤 다음 웨이브 → 마지막 웨이브 처치 → 셔터 열림 (door_open) + 무전 "gate_clear"
## 관문 바로 앞에 체크포인트 — 죽으면 관문 시작부터 (방을 다시 만들어 셔터는 열린 채로).
## 수치는 Config.gate. F8 = 지금 관문 웨이브 즉시 시작.

signal started
signal cleared

## 무전 키 (비우면 Config.gate 의 gate_start · gate_clear)
@export var radio_start := ""
@export var radio_clear := ""

var state := "idle"              ## idle | closing | wave | between | done
var wave_i := -1                 ## 지금 웨이브 (0부터)
var spawned: Array = []          ## 이번 웨이브에 소환한 적
var _queue: Array = []           # 이번 웨이브에 남은 GateSpawn
var _timer := 0.0
var _lands: Array = []           # 이번 웨이브 착지 지점 (x)


func _ready() -> void:
	if Engine.is_editor_hint():
		return
	add_to_group("gates")
	if get_node_or_null("CameraZone") == null and back_door() != null and front_door() != null:
		var z := CameraZone.new()
		z.name = "CameraZone"
		z.kind = "gate"
		var a := minf(back_door().position.x, front_door().position.x) - 8.0
		var b := maxf(back_door().position.x, front_door().position.x) + 8.0
		z.rect = Rect2(a, -480.0, b - a, 480.0)
		add_child(z)


## 관문 카메라 영역 (CameraZone, kind gate)
func camera_zone() -> CameraZone:
	return get_node_or_null("CameraZone") as CameraZone


func waves() -> Array:
	var out: Array = []
	for c in get_children():
		if String(c.name).begins_with("Wave"):
			out.append(c)
	out.sort_custom(func(a, b): return String(a.name).naturalnocasecmp_to(String(b.name)) < 0)
	return out


func back_door() -> Door:
	return get_node_or_null("Back") as Door


func front_door() -> Door:
	return get_node_or_null("Front") as Door


func trigger_x() -> float:
	var tr := get_node_or_null("Trigger") as Node2D
	return tr.global_position.x if tr != null else global_position.x


## 셔터 사이 (착지 지점이 들어갈 수 있는 곳) — 전역 x 범위
func arena() -> Vector2:
	var a: float = back_door().global_position.x if back_door() != null else global_position.x
	var b: float = front_door().global_position.x if front_door() != null else global_position.x + Config.view.w
	return Vector2(minf(a, b) + 20.0, maxf(a, b) - 20.0)


## 앞뒤 셔터 가운데 x (관문 동안 카메라 중심)
func arena_center() -> float:
	var a := arena()
	return (a.x + a.y) / 2.0


## 아직 끝나지 않은 관문 (방 클리어 · 출구를 막음)
func busy() -> bool:
	return state != "done"


func active() -> bool:
	return state != "idle" and state != "done"


## 체크포인트가 관문 뒤에 있으면 이미 지난 관문 — 조용히 끝난 것으로
func skip() -> void:
	state = "done"


func _main() -> Node:
	return get_tree().get_first_node_in_group("game")


func _physics_process(delta: float) -> void:
	if Engine.is_editor_hint() or state == "done":
		return
	var main := _main()
	if main == null or main.player == null:
		return
	var p: Player = main.player
	if Enemy.intro_hold:
		return
	match state:
		"idle":
			var ar := arena()
			if not p.dead and p.global_position.x >= trigger_x() and p.global_position.x <= ar.y + 20.0:
				begin()
		"closing":
			_timer -= delta
			if _timer <= 0.0:
				_start_wave(wave_i + 1)
		"wave":
			if p.dead:
				return
			_timer -= delta
			if not _queue.is_empty() and _timer <= 0.0 and SpawnDrop.active_marks < int(Config.gate.MAX_MARKS):
				_spawn(_queue.pop_front())
				_timer = float(Config.gate.SPAWN_GAP)
			if _queue.is_empty() and _alive_count() == 0:
				state = "between"
				_timer = float(Config.gate.WAVE_GAP)
		"between":
			_timer -= delta
			if _timer <= 0.0:
				if wave_i + 1 < waves().size():
					_start_wave(wave_i + 1)
				else:
					_finish()


## 관문 시작: 앞뒤 셔터 닫힘 + 소리 · 흔들림 · 무전
func begin() -> void:
	if state != "idle":
		return
	var G: Dictionary = Config.gate
	state = "closing"
	wave_i = -1
	_timer = float(G.FIRST_WAVE_DELAY)
	for d in [back_door(), front_door()]:
		if d != null:
			d.close_fast(float(G.SHUTTER_CLOSE))
	Audio.sfx("shutter_close")
	var main := _main()
	if main != null:
		main.add_shake(float(G.CLOSE_SHAKE), float(G.CLOSE_SHAKE_TIME), PI / 2.0)
		main.radio(radio_start if radio_start != "" else String(G.RADIO_START))
	if camera_zone() != null:
		camera_zone().enabled = true                # 앞뒤 셔터가 한 화면에 보이게 (줌 0.9 · 경계 = 셔터 사이)
	PlaytestLogger.log_event("gate_start", { "gate": name, "waves": waves().size() })
	started.emit()


## F8: 지금 관문 웨이브 즉시 (시작 전이면 바로 시작, 웨이브 사이면 기다리지 않음)
func debug_start_wave() -> void:
	match state:
		"idle":
			begin()
			_timer = 0.0
		"closing", "between":
			_timer = 0.0


func _start_wave(i: int) -> void:
	var ws := waves()
	if i >= ws.size():
		_finish()
		return
	wave_i = i
	state = "wave"
	spawned.clear()
	_lands.clear()
	_queue.clear()
	for c in ws[i].get_children():
		if c is GateSpawn:
			_queue.append(c)
	_timer = 0.0
	PlaytestLogger.log_event("gate_wave", { "gate": name, "wave": i + 1, "enemies": _queue.size() })


func _alive_count() -> int:
	var n := 0
	for e in spawned:
		if is_instance_valid(e) and not e.dead:
			n += 1
	return n


func _spawn(gs: GateSpawn) -> void:
	var main := _main()
	var e := gs.make_enemy()
	e.set_meta("gate_spawned", true)       # 처음 만나는 적 소개 안 함 (관문 도중 카메라가 움직이지 않게)
	var land := landing_point(gs.global_position, main.player.global_position.x if main != null else -INF)
	_lands.append(land.x)
	spawned.append(e)
	SpawnDrop.play(e, land)


## 착지 지점: GateSpawn x 에서 시작해 (플레이어 최소 거리 · 다른 착지 지점 간격 · 셔터 사이) 를 만족하는 가장 가까운 곳, y = 그 아래 첫 바닥
func landing_point(from: Vector2, player_x: float) -> Vector2:
	var G: Dictionary = Config.gate
	var ar := arena()
	var best := Vector2(clampf(from.x, ar.x, ar.y), from.y)
	for k in 41:
		var off := (k + 1) / 2 * 8.0 * (1.0 if k % 2 == 1 else -1.0)
		var x := from.x + off
		if x < ar.x or x > ar.y:
			continue
		if absf(x - player_x) < float(G.MIN_PLAYER_DIST):
			continue
		var ok := true
		for lx in _lands:
			if absf(x - float(lx)) < float(G.MIN_SPAWN_DIST):
				ok = false
				break
		if ok:
			best.x = x
			break
	best.y = _ground_below(Vector2(best.x, from.y))
	return best


## p 아래 첫 바닥 (지형 · 일방향 발판 윗면) y — 없으면 p.y
func _ground_below(p: Vector2) -> float:
	var main := _main()
	if main == null:
		return p.y
	var room: Node = main.room
	var tile: float = Config.room.tile
	var cx := floori(p.x / tile)
	var cy := floori((p.y - 1.0) / tile)
	for y in range(cy, cy + 60):
		var c := Vector2i(cx, y)
		if room.cell_kind(c) != 0 and room.cell_kind(c - Vector2i(0, 1)) == 0:
			return y * tile
	return p.y


func _finish() -> void:
	state = "done"
	for d in [back_door(), front_door()]:
		if d != null:
			d.open()
	var main := _main()
	if main != null:
		main.radio(radio_clear if radio_clear != "" else String(Config.gate.RADIO_CLEAR))
	if camera_zone() != null:
		camera_zone().enabled = false
	PlaytestLogger.log_event("gate_clear", { "gate": name })
	cleared.emit()


func _draw() -> void:
	if not Engine.is_editor_hint():
		return
	var tr := get_node_or_null("Trigger") as Node2D
	if tr != null:
		draw_line(Vector2(tr.position.x, -120), Vector2(tr.position.x, 0), Color(1, 0.3, 0.3, 0.5), 1.0)

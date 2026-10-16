@tool
extends Node2D
class_name Door
## 방의 입구/출구 문. 노드 위치 = 문 아래 가운데 (바닥 위).
##  - 입구: 늘 닫혀 있음 (들어온 곳 표시)
##  - 출구: 방의 적을 모두 처치하면 open() — 문판이 올라가고 빛 기둥이 번쩍 + 효과음.
##          열린 출구에 플레이어 몸이 닿으면 Main 이 다음 방으로 넘어감
## 에디터(@tool)에서도 그려져서 방 씬에서 위치를 보며 옮길 수 있음.

@export_enum("entrance", "exit") var kind := "exit":
	set(v):
		kind = v
		queue_redraw()

var is_open := false
var _open_t := -1.0              # 열린 뒤 실제 시간 (초), 안 열렸으면 -1


func _ready() -> void:
	z_index = -1                 # 적·플레이어 뒤
	add_to_group("doors")


## 문 사각형 (전역)
func rect() -> Rect2:
	var R: Dictionary = _cfg()
	return Rect2(global_position - Vector2(R.DOOR_W / 2.0, R.DOOR_H), Vector2(R.DOOR_W, R.DOOR_H))


func open() -> void:
	if is_open or kind != "exit":
		return
	is_open = true
	_open_t = 0.0
	Audio.door()


## 플레이어 몸이 열린 출구에 닿았는가
func touches(body: Rect2) -> bool:
	return kind == "exit" and is_open and rect().intersects(body)


func _physics_process(_delta: float) -> void:
	if Engine.is_editor_hint():
		return
	if _open_t >= 0.0:
		_open_t += 1.0 / Config.fps     # 실제 시간 (히트스톱·킬 스톱 중에도 열림)
		queue_redraw()


static func _cfg() -> Dictionary:
	# 에디터에서는 오토로드가 없을 수 있어 같은 기본값
	if Engine.is_editor_hint():
		return { "DOOR_W": 14.0, "DOOR_H": 30.0, "DOOR_OPEN_TIME": 0.2, "DOOR_LIGHT_TIME": 0.4, "DOOR_LIGHT_H": 70.0 }
	return Config.rooms


func _draw() -> void:
	var R: Dictionary = _cfg()
	var w: float = R.DOOR_W
	var h: float = R.DOOR_H
	var frame := Color("#1b2547")
	var panel := Color("#10121c")
	var rim := Color("#4a5170")
	var ui := Color("#5fd8ff")
	var r := Rect2(-w / 2.0, -h, w, h)
	# 문틀 (2px) + 위 간판
	draw_rect(r.grow(2.0), frame)
	draw_rect(Rect2(-w / 2.0 - 3.0, -h - 4.0, w + 6.0, 2.0), rim)
	# 문 안쪽: 열리면 은은한 빛, 닫혀 있으면 어둡게
	var opened := 0.0
	if is_open:
		opened = clampf(_open_t / R.DOOR_OPEN_TIME, 0.0, 1.0)
		draw_rect(r, Color(ui, 0.18))
		for i in 3:                                   # 바닥에서 올라오는 줄무늬
			var y := -h + h * (i + 1) / 4.0
			draw_rect(Rect2(-w / 2.0 + 2.0, y, w - 4.0, 1.0), Color(ui, 0.25))
	else:
		draw_rect(r, Color.BLACK)
	# 문판: 열릴 때 위로 올라가며 사라짐 (ease-out)
	var lift := 1.0 - pow(1.0 - opened, 3.0)
	var ph := h * (1.0 - lift)
	if ph > 0.5:
		var pr := Rect2(-w / 2.0, -h, w, ph)
		draw_rect(pr, panel)
		draw_rect(pr, rim, false, 1.0)
		# 가운데 표시등: 입구 = 어두운 테두리색, 출구 = 잠김(어둡게) / 열리는 중(하늘색)
		var lamp := rim if kind == "entrance" or not is_open else ui
		draw_rect(Rect2(-1.5, -h + minf(ph, h) * 0.45, 3.0, 3.0), lamp)
	# 출구 표시 (문 위 작은 화살표)
	if kind == "exit":
		var c := ui if is_open else rim
		draw_colored_polygon(PackedVector2Array([Vector2(-2, -h - 9), Vector2(3, -h - 7), Vector2(-2, -h - 5)]), c)
	# 문이 열리는 순간 빛 기둥 (짧게 번쩍 → 사라짐)
	if is_open and _open_t < R.DOOR_LIGHT_TIME:
		var u: float = _open_t / R.DOOR_LIGHT_TIME
		var a := 1.0 - u
		var lh: float = R.DOOR_LIGHT_H * (0.6 + 0.4 * (1.0 - pow(1.0 - u, 3.0)))
		var lw := w * (1.0 + 0.6 * u)
		draw_rect(Rect2(-lw / 2.0 - 4.0, -lh, lw + 8.0, lh), Color(ui, 0.15 * a))
		draw_rect(Rect2(-lw / 2.0, -lh, lw, lh), Color(ui, 0.35 * a))
		draw_rect(Rect2(-w / 2.0 + 2.0, -lh, w - 4.0, lh), Color(1, 1, 1, 0.6 * a))

@tool
extends Node2D
class_name CameraZone
## 카메라 영역: 구간 씬 (또는 방) 에 놓음. 플레이어가 rect 안에 들어오면 카메라 줌 · 고정 여부 · 경계를 덮어씀,
## 나오면 Config.camera.CAM_ZONE_BLEND 초에 걸쳐 원래 규칙으로. (Area2D 대신 사각형 판정 — 에디터에서 하늘색 점선으로 보임)
##  kind = custom (값 그대로) | gate (관문: 줌 CAM_GATE_ZOOM · 경계 = rect — 관문이 시작할 때만 켜짐) | boss (보스방: 추적 끔 · 가운데 고정)
## 이어진 맵에서는 Level 이 구간 노드처럼 월드 위치로 옮겨 둠.

@export_enum("custom", "gate", "boss") var kind := "custom"
@export var rect := Rect2(0, 0, 480, 272):     ## 영역 = 덮어쓸 카메라 경계 (이 노드 좌표)
	set(v):
		rect = v
		queue_redraw()
@export var zoom := 1.0                         ## custom 일 때 줌 (gate 는 Config.camera.CAM_GATE_ZOOM)
@export var follow := true                      ## custom 일 때 플레이어 추적 (false = 가운데 고정. boss 는 항상 false)
@export var enabled := true                     ## 꺼져 있으면 안에 들어가도 무시 (gate 는 관문이 켜고 끔)


func _ready() -> void:
	if Engine.is_editor_hint():
		return
	add_to_group("camera_zones")
	if kind == "gate":
		enabled = false


## 월드 좌표 영역
func world_rect() -> Rect2:
	return Rect2(global_position + rect.position, rect.size)


func zone_zoom() -> float:
	match kind:
		"gate":
			return float(Config.camera.CAM_GATE_ZOOM)
		"boss":
			return 1.0
	return zoom


func zone_follow() -> bool:
	return follow if kind == "custom" else (kind != "boss")


func contains(p: Vector2) -> bool:
	return enabled and world_rect().has_point(p)


func _draw() -> void:
	if not Engine.is_editor_hint():
		return
	var c := Color(0.4, 0.85, 1.0, 0.8)
	var p := [rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)]
	for i in 4:
		draw_dashed_line(p[i], p[(i + 1) % 4], c, 1.0, 4.0)

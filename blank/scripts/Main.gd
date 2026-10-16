extends Node2D
## 메인: 방 + 플레이어 배치, 카메라 한계, R 즉시 재시작.
## (로고·적·연출은 다음 단계에서 추가)

@onready var room: Room = $Room
@onready var player: Player = $Player
@onready var camera: Camera2D = $Player/Camera


func _ready() -> void:
	player.global_position = room.spawn_position()
	var size := room.size_px()
	camera.limit_left = 0
	camera.limit_top = 0
	camera.limit_right = int(size.x)
	camera.limit_bottom = int(size.y)
	# 프로토타입: 프레임당 lerp 0.12 → 초당 스무딩 속도로 환산
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = Config.camera.lerp * Config.fps
	camera.reset_smoothing()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("restart"):
		# 방 처음부터 즉시 다시 (씬이 작아 로딩 없이 바로)
		get_tree().reload_current_scene()

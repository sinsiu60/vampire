extends Control
class_name Boot
## 시작 씬: 480×270 게임 화면(SubViewport)을 창 안에 정수 배율로 키워 가운데 놓고(남는 곳은 검정),
## 그 위에 창 해상도로 스캔라인을 그린다. 처음 한 번만 "시우 공방" 로고(2초) → 게임.
## R 재시작은 게임(Main)만 새로 만듦 (로고 없이, 로딩 없이 바로).
##
## 게임 화면을 SubViewport 로 둔 이유: 루트를 480×270 으로 렌더하면(stretch viewport) 확대된 화면의
## 한 픽셀 줄보다 얇은 스캔라인을 그릴 수 없음. SubViewport + 최근접 필터 + 정수 배율 = 같은 픽셀 모양.

const MAIN := preload("res://scenes/Main.tscn")

static var logo_done := false    ## 로고는 실행 후 처음 한 번만

@onready var screen: SubViewportContainer = $Screen
@onready var game: SubViewport = $Screen/Game
@onready var lines: ColorRect = $Scanlines/Lines

var main: Node = null
var scale_px := 1
var _veil: ColorRect             # 방 이동 검은 전환 (게임 화면 위 · 스캔라인 아래)
var _busy := false


func _ready() -> void:
	add_to_group("boot")
	# 일시정지(옵션 메뉴 · F4) 중에도 게임 화면으로 입력을 넘겨야 메뉴를 조작할 수 있음.
	# 월드 노드(방·플레이어·연출)는 각자 PAUSABLE 로 멈춤
	screen.process_mode = Node.PROCESS_MODE_ALWAYS
	get_tree().root.size_changed.connect(_layout)
	var m := ShaderMaterial.new()
	m.shader = preload("res://shaders/scanline.gdshader")
	m.set_shader_parameter("alpha", Config.scanline.alpha)
	lines.material = m
	var layer := CanvasLayer.new()
	layer.layer = 50
	add_child(layer)
	_veil = ColorRect.new()
	_veil.color = Color(0, 0, 0, 0)
	_veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_veil)
	_layout()
	if logo_done:
		_start_game()
	else:
		var logo := Logo.new()
		logo.finished.connect(func():
			logo.queue_free()
			_start_game())
		game.add_child(logo)


## 창 크기에 맞춰 정수 배율·가운데 정렬 (Aspect keep)
func _layout() -> void:
	var win := get_tree().root.size
	var W: int = Config.view.w
	var H: int = Config.view.h
	scale_px = maxi(1, mini(win.x / W, win.y / H))
	var sz := Vector2(W * scale_px, H * scale_px)
	screen.stretch_shrink = scale_px
	screen.size = sz
	screen.position = ((Vector2(win) - sz) / 2.0).floor()
	lines.position = screen.position
	lines.size = sz
	if _veil != null:
		_veil.position = screen.position
		_veil.size = sz
	var m := lines.material as ShaderMaterial
	m.set_shader_parameter("scale", float(scale_px))
	m.set_shader_parameter("size", sz)


func _start_game(entering := false) -> void:
	logo_done = true
	main = MAIN.instantiate()
	main.entering = entering
	game.add_child(main)


## 지금 방(GameState) 처음부터 — 사망 후 R, F6
func restart(entering := false) -> void:
	Audio.stop_all()
	if main != null:
		game.remove_child(main)
		main.queue_free()
	_start_game(entering)


## 출구 → 다음 방: TRANSITION_TIME 동안 검게 (반은 어두워지고, 방을 바꾼 뒤 반은 밝아짐). 실제 시간.
## 밝아지는 반은 새 방을 다 만든 다음 프레임부터 셈 (방 불러오는 시간이 전환을 잡아먹지 않게)
func next_room() -> void:
	if _busy:
		return
	_busy = true
	var half: float = Config.rooms.TRANSITION_TIME / 2.0
	var tw := create_tween()
	tw.set_ignore_time_scale(true)
	tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tw.tween_property(_veil, "color:a", 1.0, half)
	await tw.finished
	GameState.advance()
	restart(true)
	await get_tree().process_frame
	var tw2 := create_tween()
	tw2.set_ignore_time_scale(true)
	tw2.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tw2.tween_property(_veil, "color:a", 0.0, half)
	await tw2.finished
	_busy = false


func transition_alpha() -> float:
	return _veil.color.a

extends Control
class_name Boot
## 시작 씬: 480×270 게임 화면(SubViewport)을 창 안에 정수 배율로 키워 가운데 놓고(남는 곳은 검정),
## 그 위에 창 해상도로 스캔라인을 그린다. 처음 한 번만 "시우 공방" 로고 (2초, 아무 키나 건너뛰기) → 타이틀 → (새로 시작) 장 시작 카드 → 방 1.
## R 재시작은 게임(Main)만 새로 만듦 (로고 없이, 로딩 없이 바로).
##
## 게임 화면을 SubViewport 로 둔 이유: 루트를 480×270 으로 렌더하면(stretch viewport) 확대된 화면의
## 한 픽셀 줄보다 얇은 스캔라인을 그릴 수 없음. SubViewport + 최근접 필터 + 정수 배율 = 같은 픽셀 모양.

const MAIN := preload("res://scenes/Main.tscn")
const TITLE := preload("res://scenes/Title.tscn")
const INTRO := preload("res://scenes/ChapterIntro.tscn")
const CLEAR := preload("res://scenes/ChapterClear.tscn")

static var logo_done := false    ## 로고는 실행 후 처음 한 번만
static var skip_title := false   ## 테스트 · 디버그: 로고 뒤 타이틀 없이 바로 게임 (환경 변수 BLANK_SKIP_TITLE 도 같음)

var title: Node = null           ## 지금 타이틀 화면 (없으면 null)
var intro: Node = null           ## 지금 장 시작 카드
var clear_screen: Node = null    ## 지금 장 클리어 화면
var screen_name := ""            ## logo | title | intro | game | chapter_clear (테스트)

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
		screen_name = "logo"
		var logo := Logo.new()
		logo.finished.connect(func():
			logo.queue_free()
			_after_logo())
		game.add_child(logo)


func _after_logo() -> void:
	logo_done = true
	if skip_title or OS.get_environment("BLANK_SKIP_TITLE") != "":
		_start_game()
	else:
		show_title()


## 게임 화면 안의 지금 화면 (게임 · 타이틀 · 카드) 을 치움
func _clear() -> void:
	for n in [main, title, intro, clear_screen]:
		if n != null and is_instance_valid(n):
			game.remove_child(n)
			n.queue_free()
	main = null
	title = null
	intro = null
	clear_screen = null


func _fade(to: float, time: float) -> void:
	var tw := create_tween()
	tw.set_ignore_time_scale(true)
	tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tw.tween_property(_veil, "color:a", to, time)
	await tw.finished


## 타이틀 화면으로 (로고 뒤 · 일시정지 "타이틀로" · 장 클리어 뒤)
func show_title() -> void:
	get_tree().paused = false
	Audio.stop_all()
	TimeManager.reset()
	_clear()
	screen_name = "title"
	title = TITLE.instantiate()
	title.new_game.connect(_on_new_game)
	title.continue_game.connect(_on_continue)
	title.options.connect(_on_title_options)
	game.add_child(title)


## 새로 시작: 1장 처음부터 (클리어 · 체크포인트 · 본 적 소개 · 통계 지움) → 장 시작 카드
func _on_new_game() -> void:
	if _busy:
		return
	_busy = true
	await _fade(1.0, float(Config.ui_style.FADE))
	GameState.new_game()
	_clear()
	screen_name = "intro"
	intro = INTRO.instantiate()
	intro.chapter = GameState.chapter
	intro.finished.connect(_on_intro_done)
	game.add_child(intro)
	Audio.set_ambience("")
	await _fade(0.0, float(Config.ui_style.FADE))
	_busy = false


func _on_intro_done() -> void:
	if _busy:
		return
	_busy = true
	await _fade(1.0, float(Config.ui_style.FADE))
	_clear()
	_start_game(true)
	await get_tree().process_frame
	await _fade(0.0, float(Config.ui_style.FADE))
	_busy = false


## 이어하기: 마지막 저장 지점 (방 · 보스 페이즈) 처음부터. 장 클리어 기록이면 클리어 화면으로
func _on_continue() -> void:
	if _busy:
		return
	_busy = true
	await _fade(1.0, float(Config.ui_style.FADE))
	var to_clear := SaveManager.is_chapter_clear_save()
	SaveManager.apply_save()
	_clear()
	if to_clear:
		_open_clear_screen(true)
	else:
		_start_game(true)
	await get_tree().process_frame
	await _fade(0.0, float(Config.ui_style.FADE))
	_busy = false


## 마지막 방 출구 → 장 클리어: 클리어 기록 저장 → 페이드 → 클리어 화면 (타이핑 · 통계)
func show_chapter_clear() -> void:
	if _busy:
		return
	_busy = true
	GameState.chapter_cleared = GameState.chapter
	SaveManager.save_game("chapter_clear")
	await _fade(1.0, float(Config.ui_style.FADE))
	Audio.stop_all()
	Audio.set_ambience("")
	get_tree().paused = false
	_clear()
	_open_clear_screen(false)
	await get_tree().process_frame
	await _fade(0.0, float(Config.ui_style.FADE))
	_busy = false


func _open_clear_screen(from_save: bool) -> void:
	screen_name = "chapter_clear"
	clear_screen = CLEAR.instantiate()
	clear_screen.chapter = GameState.chapter_cleared if GameState.chapter_cleared > 0 else GameState.chapter
	clear_screen.from_save = from_save
	clear_screen.to_title.connect(_on_clear_to_title)
	game.add_child(clear_screen)
	Audio.set_ambience("")


func _on_clear_to_title() -> void:
	if _busy:
		return
	_busy = true
	await _fade(1.0, float(Config.ui_style.FADE))
	show_title()
	await get_tree().process_frame
	await _fade(0.0, float(Config.ui_style.FADE))
	_busy = false


## 옵션: 타이틀 위에 공용 옵션 화면 (Title 이 직접 엶)
func _on_title_options() -> void:
	pass


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
	screen_name = "game"
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
	SaveManager.save_game("room")            # 저장: 방 클리어 뒤 다음 방으로 넘어갈 때 (새 방 처음부터)
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

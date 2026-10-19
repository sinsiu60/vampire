extends Node2D
class_name Title
## 타이틀 화면 (scenes/Title.tscn). 배경 = 1장 보스 무대 페이즈 1 (room_06 에서 인물만 빼고, 비 normal) + 화면 전체를 살짝 어둡게.
## 가운데 위 "공백" (큰 흰 글씨) + "BLANK", 4 ~ 7초마다 0.1초 지지직 글리치. 메뉴: 새로 시작 / 이어하기 / 옵션 / 종료.
##  - 저장이 없으면 "이어하기" 흐리게 비활성 · 저장이 있는데 "새로 시작" → 확인창 "기존 기록이 지워집니다. 계속할까요?"
##  - 오른쪽 아래 "v0.1" · rain_loop 0.3 · 디버그: F1 = 저장 삭제 (타이틀에서만)
## Boot 가 신호를 받아 흐름을 이어감.

signal new_game
signal continue_game
signal options

const STAGE_ROOM := "res://rooms/ch1/room_06.tscn"
const BG := preload("res://scenes/Background.tscn")

var glitch_count := 0            ## 글리치 횟수 (테스트)
var options_menu: OptionsMenu

var _ui: Control
var _menu: MenuList
var _confirm: ConfirmBox
var _t := 0.0
var _next_glitch := 0.0
var _glitch := -1.0              # 글리치 남은 시간 (-1 = 아님)
var _toast := {}


func _ready() -> void:
	var S := UIKit.style()
	# 무대: 보스방 (철견 · 적은 빼고) + 공통 배경 · 비
	var bg: Node2D = BG.instantiate()
	add_child(bg)
	var room: Node2D = (load(STAGE_ROOM) as PackedScene).instantiate()
	var en := room.get_node_or_null("Enemies")
	if en != null:
		room.remove_child(en)
		en.free()
	room.name = "Room"
	add_child(room)
	move_child(room, 0)
	bg.build(room.size_px().x, 106, room.spawn_position().y, room)
	# 어둡게 · UI 층
	var dim_layer := CanvasLayer.new()
	dim_layer.layer = 3
	add_child(dim_layer)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, S.TITLE_DIM)
	dim.size = Vector2(Config.view.w, Config.view.h)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dim_layer.add_child(dim)
	var ui_layer := CanvasLayer.new()
	ui_layer.layer = 4
	add_child(ui_layer)
	_ui = Control.new()
	_ui.size = Vector2(Config.view.w, Config.view.h)
	_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ui.draw.connect(_draw_ui)
	ui_layer.add_child(_ui)
	_menu = MenuList.new()
	_menu.position = Vector2(Config.view.w / 2.0 - 70.0, 150)
	_menu.size = Vector2(140, 64)
	ui_layer.add_child(_menu)
	_menu.chosen.connect(_on_choose)
	_confirm = ConfirmBox.new()
	ui_layer.add_child(_confirm)
	_confirm.answered.connect(_on_confirm)
	options_menu = (load("res://scenes/Options.tscn") as PackedScene).instantiate()
	ui_layer.add_child(options_menu)
	options_menu.closed.connect(func(): _menu.active = true)
	refresh()
	_next_glitch = randf_range(S.TITLE_GLITCH_EVERY.x, S.TITLE_GLITCH_EVERY.y) * 0.5
	Audio.set_ambience("rain_loop", S.TITLE_RAIN_VOL)


## 메뉴 다시 (저장 유무에 따라 이어하기 활성)
func refresh() -> void:
	var items := [
		{ "id": "new", "label": "새로 시작", "enabled": true },
		{ "id": "continue", "label": "이어하기", "enabled": SaveManager.has_save() },
		{ "id": "options", "label": "옵션", "enabled": true },
	]
	if PlaytestLogger.active:            # 플레이테스트 빌드만: 기록 (csv · summary) 폴더를 OS 파일 탐색기로
		items.append({ "id": "logs", "label": "기록 폴더 열기", "enabled": true })
	items.append({ "id": "quit", "label": "종료", "enabled": true })
	_menu.set_items(items)
	_menu.size = Vector2(140, 16.0 * items.size())
	if SaveManager.has_save():
		_menu.index = 1


func menu() -> MenuList:
	return _menu


func _on_choose(id: String) -> void:
	match id:
		"new":
			if SaveManager.has_save():
				_menu.active = false
				_confirm.ask("기존 기록이 지워집니다. 계속할까요?")
			else:
				new_game.emit()
		"continue":
			continue_game.emit()
		"options":
			_menu.active = false
			options_menu.open()
			options.emit()
		"logs":
			var err := PlaytestLogger.open_folder()
			show_toast("기록 폴더를 열었습니다" if err == OK else "폴더를 열 수 없음: %s" % ProjectSettings.globalize_path(PlaytestLogger.DIR))
		"quit":
			PlaytestLogger.quit("title_menu")
			get_tree().quit()


func _on_confirm(yes: bool) -> void:
	_menu.active = true
	if yes:
		SaveManager.delete_save()
		new_game.emit()


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == KEY_F1 and Debug.debug_mode():
		SaveManager.delete_save()
		refresh()
		_toast = { "text": "저장 데이터 삭제", "t": 0.0 }
		get_viewport().set_input_as_handled()


func _process(delta: float) -> void:
	var S := UIKit.style()
	_t += delta
	if _glitch >= 0.0:
		_glitch -= delta
		if _glitch < 0.0:
			_next_glitch = randf_range(S.TITLE_GLITCH_EVERY.x, S.TITLE_GLITCH_EVERY.y)
	else:
		_next_glitch -= delta
		if _next_glitch <= 0.0:
			_glitch = S.TITLE_GLITCH_TIME
			glitch_count += 1
	if not _toast.is_empty():
		_toast.t += delta
		if _toast.t > 1.5:
			_toast = {}
	_ui.queue_redraw()


func show_toast(text: String) -> void:
	_toast = { "text": text, "t": 0.0 }


func is_glitching() -> bool:
	return _glitch >= 0.0


func _draw_ui() -> void:
	var S := UIKit.style()
	var W: float = Config.view.w
	var c := Vector2(W / 2.0, 34)       # 매달린 간판 (y 84 ~) 위
	var title := "공백"
	var size := 40
	if is_glitching():
		# 지지직: 글자가 옆으로 튀고, 강조색 · 흰 잔상이 어긋나고, 가로 띠가 글자를 끊음
		var j := Vector2(randi_range(-3, 3), randi_range(-1, 1))
		UIKit.text(_ui, title, c + Vector2(-2, 0) + j, size, Color(S.ACCENT, 0.7), "center", true)
		UIKit.text(_ui, title, c + Vector2(2, 0) - j, size, Color(1, 1, 1, 0.5), "center", true)
		UIKit.text(_ui, title, c + j, size, Color.WHITE, "center", true)
		var tw := UIKit.width(title, size, true)
		for k in 3:
			var y := roundf(c.y - size * 0.5 + randf() * size)
			_ui.draw_rect(Rect2(roundf(c.x - tw / 2.0 - 4 + randi_range(-6, 6)), y, roundf(tw + 8), randi_range(1, 2)), Color(0, 0, 0, 0.85))
		for k in 4:
			_ui.draw_rect(Rect2(roundf(c.x + randf_range(-tw / 2.0, tw / 2.0)), roundf(c.y + randf_range(-size * 0.4, size * 0.4)), randi_range(2, 6), 1),
				Color(S.ACCENT, 0.8) if k % 2 == 0 else Color.WHITE)
	else:
		UIKit.text(_ui, title, c, size, Color.WHITE, "center", true)
	UIKit.text(_ui, "BLANK", c + Vector2(0, 26), S.SIZE, Color(S.TEXT, 0.8), "center")
	UIKit.text(_ui, String(S.VERSION), Vector2(W - 8, Config.view.h - 10), S.SIZE, Color(S.TEXT, 0.5), "right")
	if not _toast.is_empty():
		UIKit.text(_ui, String(_toast.text), Vector2(W / 2.0, Config.view.h - 24), S.SIZE, Color(S.ACCENT, clampf(1.5 - float(_toast.t), 0.0, 1.0)), "center")
	if Debug.debug_mode():
		UIKit.text(_ui, SaveManager.summary(), Vector2(8, Config.view.h - 10), 9, Color(S.TEXT, 0.5))

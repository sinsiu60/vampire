extends Control
class_name PauseMenu
## 일시정지 (ESC, 게임 중 HUD 층): 게임 정지 (소리 · 연출 타이머도 — 피날레 · 컷신 중에도) · 화면 어둡게 + 흑백 50%.
## 메뉴: 계속하기 / 방 다시 시작 / 옵션 (공용 옵션 화면) / 타이틀로 ("현재 방 진행은 저장되지 않습니다." 확인). ESC = 계속하기

const GRAY := preload("res://shaders/pause_gray.gdshader")

var main: Node
var open := false

var _gray: ColorRect
var _menu: MenuList
var _confirm: ConfirmBox
var _options: OptionsMenu
var _panel_node: Control


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	process_mode = Node.PROCESS_MODE_ALWAYS
	# 화면 복사를 여기서 새로 (앞서 다른 셰이더가 복사한 화면을 쓰면 HUD 글자 · 무전이 안 어두워짐)
	var bb := BackBufferCopy.new()
	bb.copy_mode = BackBufferCopy.COPY_MODE_VIEWPORT
	add_child(bb)
	_gray = ColorRect.new()
	_gray.size = Vector2(Config.view.w, Config.view.h)
	_gray.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var m := ShaderMaterial.new()
	m.shader = GRAY
	_gray.material = m
	add_child(_gray)
	_panel_node = Control.new()
	var panel := _panel_node
	panel.size = Vector2(Config.view.w, Config.view.h)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.draw.connect(func():
		var r := _panel_rect()
		UIKit.panel(panel, r)
		UIKit.text(panel, "일시정지", Vector2(r.get_center().x, r.position.y + 13), UIKit.style().SIZE_BIG, UIKit.style().ACCENT, "center", true))
	add_child(panel)
	_menu = MenuList.new()
	var r := _panel_rect()
	_menu.position = Vector2(r.position.x, r.position.y + 28)
	_menu.size = Vector2(r.size.x, 64)
	add_child(_menu)
	_menu.chosen.connect(_on_choose)
	_menu.cancelled.connect(func(): set_open(false))
	_menu.set_items([
		{ "id": "resume", "label": "계속하기", "enabled": true },
		{ "id": "restart", "label": "방 다시 시작", "enabled": true },
		{ "id": "options", "label": "옵션", "enabled": true },
		{ "id": "title", "label": "타이틀로", "enabled": true },
	])
	_confirm = ConfirmBox.new()
	add_child(_confirm)
	_confirm.answered.connect(_on_confirm)
	_options = (load("res://scenes/Options.tscn") as PackedScene).instantiate()
	add_child(_options)
	_options.closed.connect(func():
		_menu.active = true
		_set_panel(true))
	_show(false)


func _panel_rect() -> Rect2:
	return Rect2(roundf(Config.view.w / 2.0 - 70), roundf(Config.view.h / 2.0 - 50), 140, 100)


func _show(v: bool) -> void:
	for c in get_children():
		if c != _confirm and c != _options:
			c.visible = v
	if not v:
		_confirm.visible = false
		_options.visible = false


## 열고 닫기 — 열면 게임 · 소리 · 연출 (실제 시간 타이머 포함) 이 멈춤
func set_open(v: bool) -> void:
	if v == open:
		return
	open = v
	Debug.menu_open = v
	get_tree().paused = v or Debug.step
	Audio.pause_all(v)
	_show(v)
	_menu.active = v
	if v:
		_menu.index = 0
		UIKit.sfx("select")
	else:
		Settings.save_settings()
		UIKit.sfx("back")
	queue_redraw()


func _input(event: InputEvent) -> void:
	if open or not event.is_action_pressed("menu") or event.is_echo():
		return
	var boot := get_tree().get_first_node_in_group("boot")
	if boot != null and (boot.transition_alpha() > 0.01 or boot.screen_name != "game"):
		return
	get_viewport().set_input_as_handled()
	set_open(true)


func _on_choose(id: String) -> void:
	match id:
		"resume":
			set_open(false)
		"restart":
			set_open(false)
			if main != null:
				main.restart()
		"options":
			_menu.active = false
			_set_panel(false)
			_options.open(main)
		"title":
			_menu.active = false
			_set_panel(false)
			_confirm.ask("현재 방 진행은 저장되지 않습니다.", "타이틀로", "취소")


## 확인창 · 옵션이 떠 있는 동안 일시정지 판은 숨김 (겹쳐 보이지 않게)
func _set_panel(v: bool) -> void:
	_panel_node.visible = v
	_menu.visible = v


func _on_confirm(yes: bool) -> void:
	_menu.active = true
	_set_panel(true)
	if not yes:
		return
	set_open(false)
	var boot := get_tree().get_first_node_in_group("boot")
	if boot != null:
		boot.show_title()
	else:
		get_tree().change_scene_to_file("res://scenes/Boot.tscn")

extends Control
class_name Menu
## ESC 옵션 메뉴: 게임 정지(소리도 일시정지), 흔들림만 미리보기로 재생.
##  ▶ 화면 흔들림 0 ~ 150% (5% 단위, ← → 10%, 마우스 클릭/드래그) — 바꾸면 그 강도로 흔들림 미리보기
##  ▶ 발사 타이밍 원 표시 켜기/끄기 (끄면 숙련자용 하드 모드)
##  ▶ 구르기 키 (Enter / 클릭 → 다음에 누른 키로 바뀜, ESC 취소)
## ↑ ↓ 항목 선택 · ESC 닫기 (닫을 때 저장)

var main: Node
var open := false
var row := 0                     # 0 = 화면 흔들림, 1 = 발사 타이밍 원, 2 = 구르기 키
var _drag := false
var _waiting_key := false        # 구르기 키 바꾸기: 다음 키 입력을 기다리는 중


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	process_mode = Node.PROCESS_MODE_ALWAYS


func slider_rect() -> Rect2:
	return Rect2(Config.view.w / 2.0 - 80, Config.view.h / 2.0 - 6, 160, 8)


func toggle_rect() -> Rect2:
	return Rect2(Config.view.w / 2.0 - 80, Config.view.h / 2.0 + 18, 160, 14)


func key_rect() -> Rect2:
	return Rect2(Config.view.w / 2.0 - 80, Config.view.h / 2.0 + 40, 160, 14)


func set_open(v: bool) -> void:
	open = v
	_drag = false
	_waiting_key = false
	Debug.menu_open = v
	get_tree().paused = v or Debug.step
	Audio.pause_all(v)
	if not v:
		Settings.save_settings()
	queue_redraw()


func _input(event: InputEvent) -> void:
	# 구르기 키 바꾸기: 다음에 누른 키 (ESC = 취소)
	if open and _waiting_key and event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode != KEY_ESCAPE:
			Settings.set_roll_key(event.physical_keycode)
		_waiting_key = false
		get_viewport().set_input_as_handled()
		queue_redraw()
		return
	if event.is_action_pressed("menu") and not event.is_echo():
		set_open(not open)
		get_viewport().set_input_as_handled()
		return
	if not open or not (event is InputEventKey) or not event.pressed or event.echo:
		return
	var before := Settings.shake
	match event.physical_keycode:
		KEY_UP, KEY_W: row = maxi(0, row - 1)
		KEY_DOWN, KEY_S: row = mini(2, row + 1)
		KEY_LEFT, KEY_A, KEY_RIGHT, KEY_D, KEY_SPACE, KEY_ENTER, KEY_KP_ENTER:
			var dir := -1 if event.physical_keycode in [KEY_LEFT, KEY_A] else 1
			if row == 0:
				if event.physical_keycode in [KEY_LEFT, KEY_A, KEY_RIGHT, KEY_D]:
					Settings.set_shake(Settings.shake + 0.1 * dir)
			elif row == 1:
				Settings.approach = not Settings.approach
			elif event.physical_keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE]:
				_waiting_key = true
	get_viewport().set_input_as_handled()
	_after_change(before)


func _physics_process(_delta: float) -> void:
	if not open:
		return
	var m := get_local_mouse_position()
	var before := Settings.shake
	if Input.is_action_just_pressed("slash"):
		var tg := toggle_rect()
		if tg.has_point(m):
			Settings.approach = not Settings.approach
			row = 1
		if key_rect().has_point(m):
			row = 2
			_waiting_key = true
		var sl := slider_rect()
		if sl.grow_individual(6, 8, 6, 8).has_point(m):
			_drag = true
			row = 0
	if not Input.is_action_pressed("slash"):
		_drag = false
	if _drag:
		var sl := slider_rect()
		Settings.set_shake((m.x - sl.position.x) / sl.size.x * 1.5)
	_after_change(before)
	queue_redraw()


## 값이 바뀌면 그 강도로 흔들림을 미리 보여줌 (드래그 중엔 놓을 때까지 기다림)
func _after_change(before: float) -> void:
	if Settings.shake != before and not _drag and main != null:
		main.start_kill_shake(randf() * TAU, 10)
	queue_redraw()


func _draw() -> void:
	if not open:
		return
	var W: float = Config.view.w
	var H: float = Config.view.h
	var ui: Color = Config.colors.ui
	var sl := slider_rect()
	var tg := toggle_rect()
	draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.75))
	Fonts.text(self, "옵션", Vector2(W / 2.0, H / 2.0 - 44), 16, ui, "center", false, true)
	var kr := key_rect()
	var arrow_y: float = [sl.position.y - 10, tg.position.y + 7, kr.position.y + 7][row]
	Fonts.text(self, "▶", Vector2(sl.position.x - 6, arrow_y), 11, ui, "right")
	Fonts.text(self, "화면 흔들림", Vector2(sl.position.x, sl.position.y - 10), 11, ui)
	Fonts.text(self, "%d%%" % roundi(Settings.shake * 100), Vector2(sl.end.x, sl.position.y - 10), 11, ui, "right")
	# 슬라이더 (0 ~ 150%, 100% 위치에 눈금)
	draw_rect(Rect2(sl.position + Vector2(0.5, 0.5), sl.size - Vector2.ONE), ui, false, 1.0)
	var fx := roundf(sl.position.x + sl.size.x * Settings.shake / 1.5)
	draw_rect(Rect2(sl.position.x + 1, sl.position.y + 1, maxf(0.0, fx - sl.position.x - 1), sl.size.y - 2), Color(ui, 0.5))
	var t100 := roundf(sl.position.x + sl.size.x / 1.5)
	draw_rect(Rect2(t100, sl.end.y + 1, 1, 3), ui)
	draw_rect(Rect2(fx - 2, sl.position.y - 2, 4, sl.size.y + 4), ui)
	Fonts.text(self, "0", Vector2(sl.position.x, sl.end.y + 10), 9, ui, "center")
	Fonts.text(self, "100", Vector2(t100, sl.end.y + 10), 9, ui, "center")
	Fonts.text(self, "150", Vector2(sl.end.x, sl.end.y + 10), 9, ui, "center")
	# 발사 타이밍 원 켜기/끄기
	Fonts.text(self, "발사 타이밍 원 표시", Vector2(tg.position.x, tg.position.y + 7), 11, ui)
	draw_rect(Rect2(tg.end.x - 9.5, tg.position.y + 2.5, 9, 9), ui, false, 1.0)
	if Settings.approach:
		draw_rect(Rect2(tg.end.x - 7, tg.position.y + 5, 4, 4), ui)
	Fonts.text(self, "켜짐" if Settings.approach else "꺼짐", Vector2(tg.end.x - 14, tg.position.y + 7), 11, ui, "right")
	if not Settings.approach:
		Fonts.text(self, "숙련자용 하드 모드", Vector2(tg.end.x, tg.position.y + 20), 9, Color(ui, 0.7), "right")
	# 구르기 키
	Fonts.text(self, "구르기 키", Vector2(kr.position.x, kr.position.y + 7), 11, ui)
	var kname := "키를 누르세요" if _waiting_key else Settings.roll_key_name()
	Fonts.text(self, kname, Vector2(kr.end.x, kr.position.y + 7), 11, ui if not _waiting_key else Config.colors.parry, "right")
	var help := "새 구르기 키를 누르세요 · ESC 취소" if _waiting_key else "↑ ↓ 항목 선택 · ← → 조절 · Enter 키 바꾸기 · 클릭/드래그 · ESC 닫기"
	Fonts.text(self, help, Vector2(W / 2.0, H / 2.0 + 72), 10, Color(ui, 0.8), "center")

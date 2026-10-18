extends Control
class_name OptionsMenu
## 옵션 화면 (scenes/Options.tscn — 타이틀 · 일시정지 공용). 바꾸면 바로 적용 + 저장 (Settings → user://settings.json).
##  소리: 전체 · 배경음 · 효과음 볼륨 0 ~ 100 (10 단위)
##  화면: 전체화면 · 화면 흔들림 강도 0 ~ 150% (10 단위, 바꾸면 그 세기로 미리보기)
##  게임: 난이도 EASY / NORMAL / HARD · 발사 타이밍 원 켜기 · 끄기
##  조작: 공격 · 구르기 · 점프 · 왼쪽 · 오른쪽 — 엔터 · 클릭 → 다음에 누른 키 (또는 마우스 버튼) 로. 다른 동작이 쓰는 입력이면 경고하고 그대로
## 키보드: ↑ ↓ 고르기 · ← → 값 바꾸기 · 엔터 (켜고 끄기 · 키 바꾸기 · 돌아가기) · ESC 돌아가기 (키 기다리는 중이면 취소)
## 마우스: 가리키면 고르기 · ◂ ▸ 클릭 = 값 바꾸기 · 줄 클릭 = 엔터와 같음

signal closed

const ROWS := [
	["head", "소리"], ["vol", "master", "전체 볼륨"], ["vol", "music", "배경음"], ["vol", "sfx", "효과음"],
	["head", "화면"], ["toggle", "fullscreen", "전체화면"], ["shake", "", "화면 흔들림"],
	["head", "게임"], ["diff", "", "난이도"], ["toggle", "approach", "발사 타이밍 원"],
	["head", "조작"], ["bind", "slash", ""], ["bind", "roll", ""], ["bind", "jump", ""], ["bind", "move_left", ""], ["bind", "move_right", ""],
	["back", "", "돌아가기"],
]
const LH := 13.0
const TOP := 26.0

var row := 1                     ## 지금 고른 줄 (ROWS 번호, 머리줄 제외)
var waiting := ""                ## 키 바꾸기: 기다리는 동작 (없으면 "")
var warn := {}                   ## 경고 { text, t }
var main: Node = null            ## 게임 중이면 Main (흔들림 미리보기)
var _hover := -1


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false


func open(game_main: Node = null) -> void:
	main = game_main
	visible = true
	row = 1
	waiting = ""
	warn = {}
	queue_redraw()


func close() -> void:
	Settings.save_settings()
	visible = false
	waiting = ""
	UIKit.sfx("back")
	closed.emit()


func is_open() -> bool:
	return visible


# ---------------------------------------------------------------- 배치
func _panel() -> Rect2:
	var h := TOP + LH * ROWS.size() + 10.0
	return Rect2(roundf(Config.view.w / 2.0 - 130), roundf((Config.view.h - h) / 2.0), 260, roundf(h))


func row_rect(i: int) -> Rect2:
	var p := _panel()
	return Rect2(p.position.x + 6, p.position.y + TOP + i * LH, p.size.x - 12, LH)


func _arrow_rects(i: int) -> Array:
	var r := row_rect(i)
	return [Rect2(r.position.x + 120, r.position.y, 14, LH), Rect2(r.end.x - 14, r.position.y, 14, LH)]


func _selectable(i: int) -> bool:
	return i >= 0 and i < ROWS.size() and ROWS[i][0] != "head"


func _move(d: int) -> void:
	var i := row
	for k in ROWS.size():
		i = (i + d + ROWS.size()) % ROWS.size()
		if _selectable(i):
			break
	if i != row:
		row = i
		UIKit.sfx("move")


# ---------------------------------------------------------------- 값
func value_text(i: int) -> String:
	var R: Array = ROWS[i]
	match R[0]:
		"vol":
			var v: float = { "master": Settings.vol_master, "music": Settings.vol_music, "sfx": Settings.vol_sfx }[R[1]]
			return "%d" % roundi(v * 100.0)
		"toggle":
			var on: bool = Settings.fullscreen if R[1] == "fullscreen" else Settings.approach
			return "켬" if on else "끔"
		"shake":
			return "%d%%" % roundi(Settings.shake * 100.0)
		"diff":
			return Settings.difficulty_label()
		"bind":
			return "키를 누르세요…" if waiting == R[1] else Settings.action_key_name(R[1])
	return ""


func row_label(i: int) -> String:
	var R: Array = ROWS[i]
	if R[0] == "bind":
		return String(Settings.BIND_LABELS.get(R[1], R[1]))
	return String(R[2]) if R.size() > 2 else String(R[1])


## 값 바꾸기 (← → · ◂ ▸)
func adjust(i: int, d: int) -> void:
	var R: Array = ROWS[i]
	var before := Settings.shake
	match R[0]:
		"vol":
			var v: float = { "master": Settings.vol_master, "music": Settings.vol_music, "sfx": Settings.vol_sfx }[R[1]]
			Settings.set_volume(R[1], v + 0.1 * d)
		"toggle":
			_toggle(R[1])
		"shake":
			Settings.set_shake(roundf((Settings.shake + 0.1 * d) * 10.0) / 10.0)
		"diff":
			Settings.cycle_difficulty(d)
		_:
			return
	UIKit.sfx("move")
	Settings.save_settings()
	if Settings.shake != before and main != null and is_instance_valid(main):
		main.start_kill_shake(randf() * TAU, 10)      # 그 세기로 미리보기
	queue_redraw()


func _toggle(what: String) -> void:
	if what == "fullscreen":
		Settings.set_fullscreen(not Settings.fullscreen)
	else:
		Settings.approach = not Settings.approach


## 엔터 · 줄 클릭
func activate(i: int) -> void:
	var R: Array = ROWS[i]
	match R[0]:
		"toggle":
			_toggle(R[1])
			UIKit.sfx("select")
			Settings.save_settings()
		"diff":
			var L: Array = Config.DIFFICULTIES
			Settings.set_difficulty(L[(L.find(Settings.difficulty) + 1) % L.size()])
			UIKit.sfx("select")
			Settings.save_settings()
		"bind":
			waiting = R[1]
			warn = {}
			UIKit.sfx("select")
		"back":
			close()
	queue_redraw()


## 키 기다리는 중: 누른 키 · 마우스 버튼으로 (ESC = 취소). 다른 동작이 쓰면 경고
func _capture(event: InputEvent) -> bool:
	var b := {}
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_ESCAPE:
			waiting = ""
			UIKit.sfx("back")
			return true
		b = { "type": "key", "code": int(event.physical_keycode) }
	elif event is InputEventMouseButton and event.pressed:
		b = { "type": "mouse", "code": int(event.button_index) }
	else:
		return false
	var owner := Settings.set_binding(waiting, b)
	if owner != "":
		warn = { "text": "이미 '%s'에 쓰는 입력입니다" % String(Settings.BIND_LABELS.get(owner, owner)), "t": 0.0 }
		UIKit.sfx("back")
	else:
		UIKit.sfx("select")
	waiting = ""
	return true


func _input(event: InputEvent) -> void:
	if not visible:
		return
	if waiting != "":
		if _capture(event):
			get_viewport().set_input_as_handled()
			queue_redraw()
		return
	if event is InputEventMouseMotion:
		var lp := get_local_mouse_position()
		var h := -1
		for i in ROWS.size():
			if _selectable(i) and row_rect(i).has_point(lp):
				h = i
		if h != _hover:
			_hover = h
			if h >= 0 and h != row:
				row = h
				UIKit.sfx("move")
			queue_redraw()
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var lp := get_local_mouse_position()
		for i in ROWS.size():
			if not _selectable(i) or not row_rect(i).has_point(lp):
				continue
			row = i
			var ar: Array = _arrow_rects(i)
			if ROWS[i][0] in ["vol", "shake", "diff", "toggle"] and ar[0].has_point(lp):
				adjust(i, -1)
			elif ROWS[i][0] in ["vol", "shake", "diff", "toggle"] and ar[1].has_point(lp):
				adjust(i, 1)
			else:
				activate(i)
			get_viewport().set_input_as_handled()
			return
		get_viewport().set_input_as_handled()
		return
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	if event.is_action_pressed("ui_up"):
		_move(-1)
	elif event.is_action_pressed("ui_down"):
		_move(1)
	elif event.is_action_pressed("ui_left"):
		adjust(row, -1)
	elif event.is_action_pressed("ui_right"):
		adjust(row, 1)
	elif event.is_action_pressed("ui_accept"):
		activate(row)
	elif event.is_action_pressed("ui_cancel") or event.is_action_pressed("menu"):
		close()
	else:
		return
	get_viewport().set_input_as_handled()
	queue_redraw()


func _process(delta: float) -> void:
	if not warn.is_empty():
		warn.t += delta
		if warn.t > 2.0:
			warn = {}
	if visible:
		queue_redraw()


func _draw() -> void:
	if not visible:
		return
	var S := UIKit.style()
	draw_rect(Rect2(0, 0, Config.view.w, Config.view.h), Color(0, 0, 0, 0.35))
	var p := _panel()
	UIKit.panel(self, p)
	UIKit.text(self, "옵션", Vector2(p.get_center().x, p.position.y + 12), S.SIZE_BIG, S.ACCENT, "center", true)
	for i in ROWS.size():
		var R: Array = ROWS[i]
		var r := row_rect(i)
		var cy := r.position.y + LH / 2.0
		if R[0] == "head":
			UIKit.text(self, String(R[1]), Vector2(r.position.x + 2, cy), 9, Color(S.ACCENT, 0.7))
			if R[1] == "조작" and not warn.is_empty():
				# 키 중복 경고: 조작 머리줄 오른쪽에 (판 안)
				var wa := clampf(2.0 - float(warn.t), 0.0, 1.0)
				UIKit.text(self, String(warn.text), Vector2(r.end.x - 6, cy), 9, Color(S.TEXT, wa), "right")
				continue
			draw_rect(Rect2(r.position.x + 24, roundf(cy), r.size.x - 24, 1), Color(S.ACCENT, 0.18))
			continue
		var sel := i == row
		var col: Color = S.ACCENT if sel else S.TEXT
		if sel:
			draw_rect(r, Color(S.ACCENT, 0.08))
		if R[0] == "back":
			UIKit.text(self, row_label(i), Vector2(r.get_center().x, cy), S.SIZE, col, "center")
			continue
		UIKit.text(self, row_label(i), Vector2(r.position.x + 10, cy), S.SIZE, col)
		var vt := value_text(i)
		if R[0] == "bind":
			UIKit.text(self, vt, Vector2(r.end.x - 6, cy), S.SIZE, S.ACCENT if waiting == R[1] else col, "right")
		else:
			var ar: Array = _arrow_rects(i)
			UIKit.text(self, "◂", ar[0].get_center(), S.SIZE, Color(col, 0.8), "center")
			UIKit.text(self, "▸", ar[1].get_center(), S.SIZE, Color(col, 0.8), "center")
			var vx: float = (ar[0].end.x + ar[1].position.x) / 2.0
			if R[0] in ["vol", "shake"]:
				# 막대 + 숫자
				var frac: float = float(vt.trim_suffix("%").to_int()) / (150.0 if R[0] == "shake" else 100.0)
				var bar := Rect2(ar[0].end.x + 4, cy - 2, 52, 4)
				draw_rect(bar, Color(S.TEXT, 0.15))
				draw_rect(Rect2(bar.position, Vector2(roundf(bar.size.x * frac), bar.size.y)), Color(col, 0.8))
				UIKit.text(self, vt, Vector2(ar[1].position.x - 4, cy), S.SIZE, col, "right")
			else:
				UIKit.text(self, vt, Vector2(vx, cy), S.SIZE, col, "center")

extends Control
class_name FeedbackScreen
## 플레이테스트 설문 (scenes/Feedback.tscn). 1장 클리어 화면 → 타이틀로, 또는 일시정지 → 타이틀로 나갈 때 (플레이테스트 빌드만).
##  1) 가장 재밌었던 순간  2) 가장 짜증났던 곳  3) 패링 타이밍  4) 한 줄 의견 (선택, 글 입력)
## 키보드: ↑ ↓ 질문 · ← → 보기 고르기 · 엔터 = 다음 / 제출 · ESC = 건너뛰기. 마우스: 보기 · 칸 · 버튼 클릭.
## 응답 → PlaytestLogger.add_feedback (csv 한 줄 + summary.txt 끝 [피드백])

signal finished(submitted: bool)

const QUESTIONS := [
	{ "key": "fun", "text": "1) 가장 재밌었던 순간은?", "options": ["패링", "반격 베기", "철견 피날레", "수류탄 되치기", "기타"] },
	{ "key": "annoy", "text": "2) 가장 짜증났던 곳은?",
		"options": ["방 1", "방 2", "방 3", "방 4", "방 5", "철견 1페이즈", "철견 2페이즈", "철견 3페이즈", "피날레", "없음"] },
	{ "key": "parry", "text": "3) 패링 타이밍이 어땠나?", "options": ["너무 빡빡", "적당", "너무 쉬움"] },
]
const ROW_COMMENT := 3
const ROW_BUTTONS := 4
const CHIP_H := 13.0
const LEFT := 24.0
const RIGHT := 456.0

var where := ""                  ## 어디서 열렸나 (chapter_clear | to_title) — 기록용
var answers := [-1, -1, -1]      ## 질문별 고른 보기 (-1 = 안 고름)
var row := 0                     ## 지금 줄 (0 ~ 2 질문 · 3 의견 · 4 버튼)
var cursor := [0, 0, 0]          ## 질문별 커서 (키보드)
var button := 0                  ## 0 = 제출 · 1 = 건너뛰기
var comment: LineEdit

var _chips: Array = []           # 질문별 [Rect2 …]
var _q_y: Array = []             # 질문 글 y
var _comment_y := 0.0
var _buttons: Array = []         # [제출 Rect2, 건너뛰기 Rect2]
var _done := false
var _warn_t := -1.0
var _warned := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_layout()
	var S := UIKit.style()
	comment = LineEdit.new()
	comment.placeholder_text = "(선택) 한 줄 의견 — 클릭하고 입력"
	comment.max_length = 120
	comment.position = Vector2(LEFT, _comment_y)
	comment.size = Vector2(RIGHT - LEFT, 16)
	comment.add_theme_font_override("font", UIKit.font())
	comment.add_theme_font_size_override("font_size", int(S.SIZE))
	comment.add_theme_color_override("font_color", S.TEXT)
	comment.add_theme_color_override("font_placeholder_color", Color(S.TEXT, 0.4))
	comment.add_theme_color_override("caret_color", S.ACCENT)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0, 0, 0, 0.5)
	sb.border_color = Color(S.ACCENT, 0.35)
	sb.set_border_width_all(1)
	sb.content_margin_left = 4
	sb.content_margin_right = 4
	var sbf := sb.duplicate() as StyleBoxFlat
	sbf.border_color = S.ACCENT
	comment.add_theme_stylebox_override("normal", sb)
	comment.add_theme_stylebox_override("focus", sbf)
	comment.focus_entered.connect(func():
		row = ROW_COMMENT
		queue_redraw())
	comment.text_submitted.connect(func(_t):
		comment.release_focus()
		row = ROW_BUTTONS
		button = 0
		queue_redraw())
	add_child(comment)


## 보기 칩 배치 (글 폭 + 여백, 넘치면 다음 줄)
func _layout() -> void:
	_chips.clear()
	_q_y.clear()
	var y := 40.0
	for q in QUESTIONS:
		_q_y.append(y)
		y += 12.0
		var rects := []
		var x := LEFT + 8.0
		for o in q.options:
			var w := UIKit.width(String(o), 11) + 12.0
			if x + w > RIGHT:
				x = LEFT + 8.0
				y += CHIP_H + 3.0
			rects.append(Rect2(roundf(x), roundf(y), roundf(w), CHIP_H))
			x += w + 4.0
		_chips.append(rects)
		y += CHIP_H + 12.0
	_q_y.append(y)                        # 4) 의견 글
	_comment_y = y + 12.0
	var by := _comment_y + 38.0
	_buttons = [Rect2(Config.view.w / 2.0 - 84, by, 76, 16), Rect2(Config.view.w / 2.0 + 8, by, 76, 16)]


func choose(q: int, i: int) -> void:
	answers[q] = i
	cursor[q] = i
	UIKit.sfx("select")
	queue_redraw()


func result() -> Dictionary:
	var d := { "where": where }
	for qi in QUESTIONS.size():
		var q: Dictionary = QUESTIONS[qi]
		d[q.key] = String(q.options[answers[qi]]) if answers[qi] >= 0 else ""
	d.comment = comment.text.strip_edges().replace("\n", " ") if comment != null else ""
	return d


## 제출: 고른 것만 (안 고른 질문은 빈칸 — 다 비었으면 건너뛰기와 같음)
func submit() -> void:
	if _done:
		return
	var r := result()
	if answers.all(func(a): return a < 0) and String(r.comment) == "":
		if _warned:                       # 아무것도 안 고르고 두 번 제출 → 건너뛰기
			skip()
			return
		_warned = true                    # 첫 번째는 안내만
		_warn_t = 0.0
		UIKit.sfx("back")
		queue_redraw()
		return
	_done = true
	PlaytestLogger.add_feedback(r)
	UIKit.sfx("select")
	finished.emit(true)



func skip() -> void:
	if _done:
		return
	_done = true
	PlaytestLogger.add_feedback({ "where": where, "skipped": true })
	UIKit.sfx("back")
	finished.emit(false)


func _input(event: InputEvent) -> void:
	if _done or not is_visible_in_tree():
		return
	# 의견 칸에 입력 중: ↑ ↓ · ESC 로만 빠져나옴 (나머지 키는 글자)
	if comment.has_focus():
		if event is InputEventKey and event.pressed and event.physical_keycode in [KEY_UP, KEY_DOWN, KEY_ESCAPE]:
			comment.release_focus()
			row = ROW_COMMENT - 1 if event.physical_keycode == KEY_UP else ROW_BUTTONS
			get_viewport().set_input_as_handled()
			queue_redraw()
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var lp := get_local_mouse_position()
		for qi in _chips.size():
			for i in _chips[qi].size():
				if (_chips[qi][i] as Rect2).has_point(lp):
					row = qi
					choose(qi, i)
					get_viewport().set_input_as_handled()
					return
		for b in 2:
			if (_buttons[b] as Rect2).has_point(lp):
				row = ROW_BUTTONS
				button = b
				get_viewport().set_input_as_handled()
				_press(b)
				return
		return
	if event is InputEventMouseMotion:
		var lp := get_local_mouse_position()
		for b in 2:
			if (_buttons[b] as Rect2).has_point(lp) and (row != ROW_BUTTONS or button != b):
				row = ROW_BUTTONS
				button = b
				queue_redraw()
		return
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	var handled := true
	if event.is_action_pressed("ui_up"):
		row = maxi(0, row - 1)
		UIKit.sfx("move")
	elif event.is_action_pressed("ui_down"):
		row = mini(ROW_BUTTONS, row + 1)
		UIKit.sfx("move")
	elif event.is_action_pressed("ui_left") or event.is_action_pressed("ui_right"):
		var d := -1 if event.is_action_pressed("ui_left") else 1
		if row < QUESTIONS.size():
			var n: int = QUESTIONS[row].options.size()
			cursor[row] = (cursor[row] + d + n) % n
			UIKit.sfx("move")
		elif row == ROW_BUTTONS:
			button = 1 - button
			UIKit.sfx("move")
	elif event.is_action_pressed("ui_accept"):
		if row < QUESTIONS.size():
			choose(row, cursor[row])
			row += 1
		elif row == ROW_COMMENT:
			comment.grab_focus()
		else:
			_press(button)
	elif event.is_action_pressed("ui_cancel"):
		skip()
	else:
		handled = false
	if handled:
		get_viewport().set_input_as_handled()
		queue_redraw()


func _press(b: int) -> void:
	if b == 0:
		submit()
	else:
		skip()


func _process(delta: float) -> void:
	if _warn_t >= 0.0:
		_warn_t += delta
		if _warn_t > 2.5:
			_warn_t = -1.0
	queue_redraw()


func _draw() -> void:
	var S := UIKit.style()
	var W: float = Config.view.w
	var H: float = Config.view.h
	draw_rect(Rect2(0, 0, W, H), Color.BLACK)
	UIKit.text(self, "짧은 설문", Vector2(W / 2.0, 11), S.SIZE_BIG, S.ACCENT, "center", true)
	UIKit.text(self, "플레이해 줘서 고마워요. 답은 기록 폴더에만 저장됩니다.", Vector2(W / 2.0, 27), 9, Color(S.TEXT, 0.55), "center")
	for qi in QUESTIONS.size():
		var q: Dictionary = QUESTIONS[qi]
		var on_row := row == qi
		UIKit.text(self, String(q.text), Vector2(LEFT, _q_y[qi] + 5), S.SIZE, S.ACCENT if on_row else S.TEXT)
		for i in _chips[qi].size():
			var r: Rect2 = _chips[qi][i]
			var picked: bool = answers[qi] == i
			var cur: bool = on_row and cursor[qi] == i
			draw_rect(r, Color(S.ACCENT, 0.85) if picked else Color(S.PANEL, 0.9))
			draw_rect(r, Color(S.ACCENT, 0.9 if cur else 0.3), false, 1.0)
			UIKit.text(self, String(q.options[i]), r.get_center(), 11, Color(0.04, 0.05, 0.08) if picked else (S.ACCENT if cur else S.TEXT), "center")
	UIKit.text(self, "4) 한 줄 의견 (선택)", Vector2(LEFT, _q_y[ROW_COMMENT] + 5), S.SIZE, S.ACCENT if row == ROW_COMMENT else S.TEXT)
	var labels := ["제출", "건너뛰기"]
	for b in 2:
		var r: Rect2 = _buttons[b]
		var sel := row == ROW_BUTTONS and button == b
		draw_rect(r, Color(S.ACCENT, 0.15 if sel else 0.05))
		draw_rect(r, Color(S.ACCENT, 0.9 if sel else 0.3), false, 1.0)
		UIKit.text(self, labels[b], r.get_center(), S.SIZE, S.ACCENT if sel else S.TEXT, "center")
	if _warn_t >= 0.0:
		UIKit.text(self, "아무것도 고르지 않았어요 — 한 번 더 제출하면 건너뜁니다", Vector2(W / 2.0, _buttons[0].end.y + 10), 9, Color(S.TEXT, 0.8), "center")
	UIKit.text(self, "↑↓ 질문 · ←→ 보기 · 엔터 고르기 · ESC 건너뛰기 · 마우스로도 됨", Vector2(W / 2.0, H - 8), 9, Color(S.TEXT, 0.4), "center")

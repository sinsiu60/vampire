extends Control
class_name ChapterClear
## 장 클리어 화면 (scenes/ChapterClear.tscn). 철견 처치 뒤 마지막 방 출구로 나가면 (또는 클리어 기록에서 이어하기).
##  1) 검은 화면에 한 줄씩 타이핑 (chapter_texts.json 의 clear: "첫번 째." / "사냥개는 아직 넷 남았다.") — 클릭 · 엔터로 줄 완성 · 다음 줄
##  2) 위로 올라가 흐려지고 "1장 클리어" + 통계 (플레이 시간 · 사망 횟수 · 패링 성공 · 반격 성공) 한 줄씩 CLEAR_STAT_GAP 초, 줄마다 ui_select
##  3) 메뉴: 타이틀로 / (흐리게 비활성) "2장 — 준비 중"
## 통계는 GameState.stats (이어하기면 저장된 값). 클릭 · 엔터로 통계를 바로 다 보이게 할 수 있음.

signal to_title

const STAT_ROWS := [["time", "플레이 시간"], ["deaths", "사망 횟수"], ["parries", "패링 성공"], ["counters", "반격 성공"]]

var chapter := 1
var from_save := false
var lines: Array = []
var line_i := 0
var shown := 0
var phase := "type"              ## type | gap | hold | stats | menu
var stats_shown := 0             ## 보인 통계 줄 수
var t := 0.0

var _acc := 0.0
var _up := 0.0                   # 타이핑 줄이 위로 올라간 정도 0 ~ 1
var _menu: MenuList


func _ready() -> void:
	size = Vector2(Config.view.w, Config.view.h)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	lines = TextData.chapter(chapter).get("clear", [])
	if lines.is_empty():
		phase = "hold"
	_menu = MenuList.new()
	_menu.position = Vector2(Config.view.w / 2.0 - 70.0, 212)
	_menu.size = Vector2(140, 32)
	_menu.line_h = 15.0
	add_child(_menu)
	_menu.set_items([
		{ "id": "title", "label": "타이틀로", "enabled": true },
		{ "id": "next", "label": "%d장 — 준비 중" % (chapter + 1), "enabled": false },
	])
	_menu.visible = false
	_menu.active = false
	_menu.chosen.connect(func(id):
		if id == "title":
			_menu.active = false
			to_title.emit())


func stat_text(key: String) -> String:
	var v: Variant = GameState.stats.get(key, 0)
	if key == "time":
		return SaveManager.format_time(float(v))
	return str(int(v))


func _input(event: InputEvent) -> void:
	if phase == "menu":
		return
	var press := false
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		press = true
	elif event.is_action_pressed("ui_accept") and not event.is_echo():
		press = true
	if not press:
		return
	get_viewport().set_input_as_handled()
	advance()


## 클릭 한 번: 치는 중 → 줄 완성 / 줄 사이 → 다음 줄 / 통계 나오는 중 → 전부
func advance() -> void:
	match phase:
		"type":
			shown = String(lines[line_i]).length()
			phase = "gap"
			_acc = 0.0
		"gap":
			_next_line()
		"hold":
			_start_stats()
		"stats":
			stats_shown = STAT_ROWS.size()
			UIKit.sfx("select")
			_open_menu()


func _next_line() -> void:
	line_i += 1
	shown = 0
	_acc = 0.0
	if line_i >= lines.size():
		line_i = lines.size() - 1
		shown = String(lines[line_i]).length()
		phase = "hold"
	else:
		phase = "type"


func _start_stats() -> void:
	phase = "stats"
	_acc = 0.0
	stats_shown = 0


func _open_menu() -> void:
	phase = "menu"
	_menu.visible = true
	_menu.active = true
	_menu.index = 0


func _process(delta: float) -> void:
	var S := UIKit.style()
	t += delta
	_acc += delta
	match phase:
		"type":
			var full: String = lines[line_i]
			while _acc >= float(S.TYPE_CHAR) and shown < full.length():
				_acc -= float(S.TYPE_CHAR)
				shown += 1
			if shown >= full.length():
				phase = "gap"
				_acc = 0.0
		"gap":
			if _acc >= float(S.TYPE_LINE_GAP):
				_next_line()
				_acc = 0.0
		"hold":
			if _acc >= float(S.CLEAR_HOLD):
				_start_stats()
		"stats":
			# 0번째 = "1장 클리어" 제목, 그 뒤 통계 줄 — 한 줄씩 CLEAR_STAT_GAP 초
			while _acc >= float(S.CLEAR_STAT_GAP) and stats_shown <= STAT_ROWS.size():
				_acc -= float(S.CLEAR_STAT_GAP)
				stats_shown += 1
				UIKit.sfx("select")
			if stats_shown > STAT_ROWS.size():
				_open_menu()
	if phase in ["stats", "menu"]:
		_up = minf(1.0, _up + delta / 0.4)
	queue_redraw()


func _draw() -> void:
	var S := UIKit.style()
	var W: float = Config.view.w
	var H: float = Config.view.h
	draw_rect(Rect2(0, 0, W, H), Color.BLACK)
	# 타이핑 줄: 가운데 → 통계가 나오면 위로 올라가며 흐려짐
	var lh := 18.0
	var e := _up * _up * (3.0 - 2.0 * _up)
	var y0 := lerpf(H / 2.0 - lh * (lines.size() - 1) / 2.0, 40.0, e)
	for i in mini(line_i + 1, lines.size()):
		var full: String = lines[i]
		var s := full if i < line_i or phase not in ["type", "gap"] else full.substr(0, shown)
		var col: Color = Color(S.TEXT, lerpf(1.0, 0.45, e))
		UIKit.text(self, s, Vector2(W / 2.0, y0 + i * lh), S.SIZE_BIG, col, "center")
		if i == line_i and phase in ["type", "gap"] and fmod(t, 0.6) < 0.35:
			var w := UIKit.width(full, S.SIZE_BIG)
			var cx := W / 2.0 - w / 2.0 + UIKit.width(s, S.SIZE_BIG) + 2.0
			draw_rect(Rect2(roundf(cx), roundf(y0 + i * lh - 6), 1, 12), Color(S.ACCENT, 0.8))
	if phase not in ["stats", "menu"]:
		return
	# "1장 클리어" + 통계
	if stats_shown >= 1:
		UIKit.text(self, "%d장 클리어" % chapter, Vector2(W / 2.0, 98), 22, S.ACCENT, "center", true)
		draw_rect(Rect2(roundf(W / 2.0 - 60), 114, 120, 1), Color(S.ACCENT, 0.4))
	var x0 := W / 2.0 - 80.0
	var x1 := W / 2.0 + 80.0
	for k in STAT_ROWS.size():
		if stats_shown < k + 2:
			break
		var y := 132.0 + k * 17.0
		UIKit.text(self, String(STAT_ROWS[k][1]), Vector2(x0, y), S.SIZE, S.TEXT)
		UIKit.text(self, stat_text(STAT_ROWS[k][0]), Vector2(x1, y), S.SIZE, S.ACCENT, "right")
		draw_rect(Rect2(roundf(x0), roundf(y + 8), x1 - x0, 1), Color(S.TEXT, 0.08))

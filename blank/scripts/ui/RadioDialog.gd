extends Control
class_name RadioDialog
## 잡음 무전 (HUD 층, 화면 왼쪽 아래 작은 판 — 가로 200 · 2줄). 문장은 res://data/radio_lines.json (키 → 줄 목록).
##  - 왼쪽 "잡음" 이름표 + 말하는 동안 흔들리는 작은 파형 아이콘
##  - 글자당 RADIO_CHAR 초 타이핑 · 가끔 한 글자가 RADIO_NOISE_TIME 초 깨졌다 돌아옴 · 여러 줄이면 한 줄씩 이어서
##  - 시작 radio_on · 끝 radio_off · 말하는 동안 글자 몇 개마다 radio_blip (작게) — 없으면 무음
##  - 게임을 멈추지 않음 (전투 중에도). 마지막 줄이 끝나고 RADIO_HOLD 초 뒤 사라짐. 여러 무전은 대기열로 차례로
## 실제 시간으로 흐르고, 일시정지 중엔 같이 멈춤 (PAUSABLE).

const NOISE := "░▒▓#%/\\=-"

var queue: Array = []            ## 대기 중 [{ key, lines }]
var current := {}                ## 지금 무전 { key, lines, line, shown, phase, t }
var history: Array = []          ## 지금까지 시작한 무전 키 (테스트)

var _acc := 0.0
var _noise := {}                 # 깨진 글자 { i, ch, t }
var _noise_next := 0.3
var _blip_n := 0
var _alpha := 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size = Vector2(Config.view.w, Config.view.h)


## 키로 무전 (radio_lines.json). 같은 무전이 지금 나오거나 대기 중이면 무시
func say_key(key: String) -> void:
	var lines := TextData.radio(key)
	if lines.is_empty():
		push_warning("RadioDialog: 무전 키 없음 %s" % key)
		return
	say_lines(lines, key)


func say_lines(lines: Array, key := "") -> void:
	if key != "":
		if current.get("key", "") == key:
			return
		for q in queue:
			if q.key == key:
				return
	queue.append({ "key": key, "lines": lines })
	if current.is_empty():
		_next()


func is_talking() -> bool:
	return not current.is_empty()


## 지금 보이는 무전 { key, text (지금 줄), lines, line, t, alpha } — 없으면 빈 Dictionary
func state() -> Dictionary:
	if current.is_empty():
		return {}
	return { "key": current.key, "text": String(current.lines[current.line]), "lines": current.lines, "line": current.line,
		"t": current.t, "alpha": _alpha, "phase": current.phase }


func _next() -> void:
	if queue.is_empty():
		current = {}
		return
	var q: Dictionary = queue.pop_front()
	current = { "key": q.key, "lines": q.lines, "line": 0, "shown": 0, "phase": "type", "t": 0.0, "hold": 0.0 }
	history.append(q.key)
	_acc = 0.0
	_blip_n = 0
	var S := UIKit.style()
	Audio.play("radio_on", float(S.RADIO_ON_VOL), 1.0, true)


func _process(delta: float) -> void:
	var S := UIKit.style()
	if current.is_empty():
		_alpha = maxf(0.0, _alpha - delta / 0.2)
		queue_redraw()
		return
	_alpha = minf(1.0, _alpha + delta / 0.12)
	current.t += delta
	var line: String = current.lines[current.line]
	match current.phase:
		"type":
			_acc += delta
			while _acc >= float(S.RADIO_CHAR) and current.shown < line.length():
				_acc -= float(S.RADIO_CHAR)
				current.shown += 1
				if line[current.shown - 1] != " ":
					_blip_n += 1
					if _blip_n % int(S.RADIO_BLIP_EVERY) == 0:
						Audio.play("radio_blip", float(S.RADIO_BLIP_VOL), randf_range(0.95, 1.08), true)
			if current.shown >= line.length():
				current.phase = "line_gap" if current.line < current.lines.size() - 1 else "hold"
				current.hold = 0.0
		"line_gap":
			current.hold += delta
			if current.hold >= float(S.RADIO_LINE_GAP):
				current.line += 1
				current.shown = 0
				current.phase = "type"
		"hold":
			current.hold += delta
			if current.hold >= float(S.RADIO_HOLD):
				Audio.play("radio_off", float(S.RADIO_OFF_VOL), 1.0, true)
				_next()
	# 가끔 한 글자가 깨졌다 돌아옴
	if not _noise.is_empty():
		_noise.t -= delta
		if _noise.t <= 0.0:
			_noise = {}
	else:
		_noise_next -= delta
		if _noise_next <= 0.0 and not current.is_empty() and int(current.shown) > 1:
			_noise_next = randf_range(S.RADIO_NOISE_EVERY.x, S.RADIO_NOISE_EVERY.y)
			_noise = { "line": current.line, "i": randi() % int(current.shown), "ch": NOISE[randi() % NOISE.length()], "t": float(S.RADIO_NOISE_TIME) }
	queue_redraw()


func _draw() -> void:
	if _alpha <= 0.01:
		return
	var S := UIKit.style()
	var r: Rect2 = S.RADIO_RECT
	var a := _alpha
	draw_rect(r, Color(S.PANEL, S.PANEL.a * a))
	draw_rect(r, Color(S.ACCENT, 0.35 * a), false, 1.0)
	# 왼쪽 칸: 이름표 + 그 아래 파형 (말하는 동안 흔들림)
	var name: String = S.RADIO_NAME
	var tag := Rect2(r.position + Vector2(4, 5), Vector2(34, 12))
	draw_rect(tag, Color(S.ACCENT, 0.18 * a))
	UIKit.text(self, name, tag.get_center(), 9, Color(S.ACCENT, a), "center")
	var talking: bool = not current.is_empty() and current.phase == "type"
	var wx := tag.position.x + 7.0
	var wy := r.position.y + 26.0
	for i in 5:
		var h := 1.0
		if talking:
			h = 1.0 + floorf(absf(sin(Time.get_ticks_msec() / 1000.0 * (9.0 + i * 2.3) + i)) * 5.0)
		draw_rect(Rect2(roundf(wx + i * 4.0), roundf(wy - h / 2.0), 2, h), Color(S.ACCENT, 0.8 * a))
	draw_rect(Rect2(r.position.x + 42, r.position.y + 4, 1, r.size.y - 8), Color(S.ACCENT, 0.2 * a))
	if current.is_empty():
		return
	# 오른쪽 칸 (2줄): 지금 줄이 한 줄에 들어가면 위에 지난 줄 (흐리게), 길면 두 줄로 나눠 침
	var tx := r.position.x + 47.0
	var tw := r.size.x - 51.0
	var rows_y := [r.position.y + 12.0, r.position.y + 25.0]
	var li: int = current.line
	var cur_rows := wrap_text(String(current.lines[li]), tw)
	var rows := []                                  # [[글, 투명도, 줄 번호, 앞 글자 수]]
	if cur_rows.size() == 1 and li > 0:
		var prev := wrap_text(String(current.lines[li - 1]), tw)
		rows.append([String(prev[prev.size() - 1]), 0.55, li - 1, -1])
	var used := 0
	for k in mini(cur_rows.size(), 2):
		rows.append([String(cur_rows[k]), 1.0, li, used])
		used += String(cur_rows[k]).length()
	for k in rows.size():
		var row: Array = rows[k]
		var s: String = row[0]
		if int(row[3]) >= 0:     # 지금 줄: 친 만큼만
			var vis := clampi(int(current.shown) - int(row[3]), 0, s.length())
			s = s.substr(0, vis)
			if not _noise.is_empty() and int(_noise.line) == li:
				var ni := int(_noise.i) - int(row[3])
				if ni >= 0 and ni < s.length() and s[ni] != " ":
					s = s.substr(0, ni) + String(_noise.ch) + s.substr(ni + 1)
		var y: float = rows_y[k] if rows.size() == 2 else r.position.y + r.size.y / 2.0
		UIKit.text(self, s, Vector2(tx, y), S.SIZE, Color(S.TEXT, float(row[1]) * a))


## 폭 w 안에 들어가게 줄을 나눔 (띄어쓰기 기준, 한 낱말이 너무 길면 글자 단위). 나뉜 줄의 글자 수 합 = 원래 글자 수
static func wrap_text(text: String, w: float) -> Array:
	var size: int = Config.ui_style.SIZE
	if UIKit.width(text, size) <= w:
		return [text]
	var out := []
	var line := ""
	for i in text.length():
		var ch := text[i]
		var test := line + ch
		if UIKit.width(test, size) > w and line != "":
			var cut := line.rfind(" ")
			if cut > 0 and ch != " ":
				out.append(line.substr(0, cut + 1))
				line = line.substr(cut + 1) + ch
			else:
				out.append(line)
				line = ch
		else:
			line = test
	if line != "":
		out.append(line)
	return out

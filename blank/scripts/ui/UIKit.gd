class_name UIKit
## 공통 UI 도우미 (타이틀 · 장 카드 · 메뉴 · 무전). 수치 · 색은 Config.ui_style.
##  - 글꼴: res://fonts/Galmuri11.ttf (한글 도트) — 없으면 시스템 글꼴. 둘 다 안티앨리어싱 끔 (딱딱한 픽셀)
##  - 색: 기본 #D0D4E0 · 강조 #5AC8E6 (UI 전용) · 판 #0A0B12 85%. 빨강 · 보라는 쓰지 않음
##  - 소리: ui_move · ui_select · ui_back (없으면 무음)

static var _fonts := {}


static func style() -> Dictionary:
	return Config.ui_style


static func font(bold := false) -> Font:
	var key := "b" if bold else "n"
	if _fonts.has(key):
		return _fonts[key]
	var path: String = style().FONT
	var f: Font = null
	if ResourceLoader.exists(path):
		var ff = load(path)
		if ff is FontFile:
			(ff as FontFile).antialiasing = TextServer.FONT_ANTIALIASING_NONE
			(ff as FontFile).hinting = TextServer.HINTING_NONE
			f = ff
	if f == null:
		var sf := SystemFont.new()
		sf.font_names = PackedStringArray(["sans-serif"])
		sf.font_weight = 700 if bold else 400
		sf.antialiasing = TextServer.FONT_ANTIALIASING_NONE
		sf.hinting = TextServer.HINTING_NONE
		f = sf
	_fonts[key] = f
	return f


static func has_pixel_font() -> bool:
	return ResourceLoader.exists(String(style().FONT))


static func width(s: String, size: int, bold := false) -> float:
	return font(bold).get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x


## 한 줄 (pos = 정렬 기준점, 세로 가운데)
static func text(ci: CanvasItem, s: String, pos: Vector2, size: int, color: Color, align := "left", bold := false) -> void:
	var f := font(bold)
	var w := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var x := pos.x
	if align == "center":
		x -= w / 2.0
	elif align == "right":
		x -= w
	var y := pos.y + (f.get_ascent(size) - f.get_descent(size)) / 2.0
	ci.draw_string(f, Vector2(roundf(x), roundf(y)), s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)


## 배경 판 (#0A0B12 85%) + 1px 테두리 (강조색 옅게)
static func panel(ci: CanvasItem, r: Rect2, edge := true) -> void:
	ci.draw_rect(r, style().PANEL)
	if edge:
		ci.draw_rect(r, Color(style().ACCENT, 0.35), false, 1.0)


static func sfx(kind: String) -> void:
	var S := style()
	var n: String = S.get("SFX_" + kind.to_upper(), "")
	if n != "":
		Audio.play(n, float(S.SFX_VOLUME), 1.0, true)

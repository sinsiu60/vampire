class_name Fonts
## HUD 글꼴 (시스템 글꼴, 한글 포함). 프로토타입의 sans-serif / monospace, 보통 / 굵게

static var _cache := {}


static func get_font(mono := false, bold := false) -> Font:
	var key := str(mono) + str(bold)
	if not _cache.has(key):
		var f := SystemFont.new()
		f.font_names = PackedStringArray(["monospace"] if mono else ["sans-serif"])
		f.font_weight = 700 if bold else 400
		_cache[key] = f
	return _cache[key]


## 가운데/왼쪽/오른쪽 정렬 + 세로 가운데(프로토타입 textBaseline middle) 로 한 줄
static func text(ci: CanvasItem, s: String, pos: Vector2, size: int, color: Color, align := "left", mono := false, bold := false) -> void:
	var f := get_font(mono, bold)
	var w := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var x := pos.x
	if align == "center":
		x -= w / 2.0
	elif align == "right":
		x -= w
	var asc := f.get_ascent(size)
	var desc := f.get_descent(size)
	var y := pos.y + (asc - desc) / 2.0
	ci.draw_string(f, Vector2(roundf(x), roundf(y)), s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)


static func width(s: String, size: int, mono := false, bold := false) -> float:
	return get_font(mono, bold).get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x

extends RefCounted
class_name AlleyDressing
## 1장 일반 방 (room_01 ~ 05) 무대: "비 내리는 시장 뒷골목" — 코드로 한 번 이미지로 그림 (Background 의 Structures · Floor 층).
## 색은 모두 Palette (장식 네온은 분홍 · 주황만, 빨강 · 보라 · 하늘색 없음).
##  Structures (월드, 시차 1.0): 골목 벽면 (#0D0F1C, 지붕선 높이 제각각 — 위로 먼 건물이 보임) · 위층 창문 몇 개 ·
##    셔터 내린 가게 · 에어컨 실외기 · 배관 · 가로지르는 전선 2가닥 · 작은 네온 간판 1 ~ 2개 · 조명 (방마다 위치 다름) + 원뿔 빛 10%
##  Floor (지형 위): 물웅덩이 (가운데 분홍 반사선) · 조명 아래 바닥 빛 웅덩이
## 같은 방은 늘 같은 모습 (시드 = 방 번호).

const NEON_ORANGE := Color("#D2783C")     ## 장식 주황 (신호 아님 — 패링 노랑 · 주황보다 어둡게)

var img: Image
var floor_img: Image
var lamps: Array = []                     ## 조명 { bulb (전역), kind } — 테스트 · 확인용
var signs := 0

var _rng := RandomNumberGenerator.new()
var _w := 0
var _h := 0
var _floor := 240
var _room: Node = null
var _wires: Array = []                    # [[y0, y1, sag]]


## room = Room (cell_kind · size_px), lamp_xs = 조명 x (방마다), seed = 방 번호
func build(room: Node, lamp_xs: PackedFloat32Array, seed: int, floor_y: float, floor_image: Image) -> Image:
	_room = room
	var size: Vector2 = room.size_px()
	_w = int(size.x)
	_h = int(size.y)
	_floor = int(floor_y)
	_rng.seed = 104723 * seed + 7
	img = Image.create(_w, _h, false, Image.FORMAT_RGBA8)
	floor_img = floor_image
	_facade()
	_make_wires()
	_draw_wires()
	_neon_signs()
	for i in lamp_xs.size():
		_lamp(lamp_xs[i], i)
	_puddles()
	return img


# ---------------------------------------------------------------- 그리기 도우미
func _fill(x: int, y: int, w: int, h: int, c: Color, on: Image = null) -> void:
	var im := img if on == null else on
	var r := Rect2i(x, y, w, h).intersection(Rect2i(0, 0, im.get_width(), im.get_height()))
	if r.size.x > 0 and r.size.y > 0:
		if c.a >= 0.999:
			im.fill_rect(r, c)
		else:
			for yy in range(r.position.y, r.end.y):
				for xx in range(r.position.x, r.end.x):
					im.set_pixel(xx, yy, im.get_pixel(xx, yy).blend(c))


func _px(x: int, y: int, c: Color, on: Image = null) -> void:
	_fill(x, y, 1, 1, c, on)


## 가로로 납작한 타원 (중심 cx, cy, 반지름 rx, ry) 을 덧칠
func _ellipse(cx: float, cy: float, rx: float, ry: float, c: Color, on: Image) -> void:
	for yy in range(int(cy - ry), int(cy + ry) + 1):
		var t := (float(yy) - cy) / maxf(ry, 0.5)
		if absf(t) > 1.0:
			continue
		var hw := rx * sqrt(1.0 - t * t)
		_fill(int(roundf(cx - hw)), yy, int(roundf(hw * 2.0)), 1, c, on)


# ---------------------------------------------------------------- 골목 벽면 · 가게 · 실외기 · 배관
func _facade() -> void:
	var P := Palette
	var x := 0
	while x < _w:
		var sw := _rng.randi_range(56, 112)
		var top := _rng.randi_range(62, 128)
		_fill(x, top, sw, _floor - top, P.NEAR_BUILDING)
		_fill(x, top, sw, 1, P.STRUCT_DARK)                        # 지붕선 + 윗면 림
		_fill(x, top, sw, 1, Color(P.RIM, 0.22))
		if _rng.randf() < 0.5:                                     # 옥상 난간 · 물받이
			_fill(x + 2, top - 3, sw - 4, 1, P.STRUCT_DARK)
			var px := x + 2
			while px < x + sw - 2:
				_fill(px, top - 3, 1, 3, P.STRUCT_DARK)
				px += 5
		_fill(x, top, 1, _floor - top, P.STRUCT_EDGE)              # 건물 사이 틈
		# 위층 창문 (3×4, 드물게 · 일부 창살)
		var wy := top + 6
		while wy < _floor - 64:
			var wx := x + 5
			while wx < x + sw - 6:
				if _rng.randf() < 0.1:
					_fill(wx, wy, 3, 4, P.NEAR_WINDOW)
					if _rng.randf() < 0.4:
						_fill(wx, wy + 2, 3, 1, P.NEAR_BUILDING)
				wx += 7
			wy += 10
		# 1층: 셔터 내린 가게 또는 실외기 벽
		if _rng.randf() < 0.65 and sw >= 46:
			_shop(x, sw)
		else:
			for k in _rng.randi_range(1, 2):
				_ac(x + _rng.randi_range(4, maxi(5, sw - 20)), _rng.randi_range(maxi(top + 14, _floor - 96), _floor - 34))
		for k in _rng.randi_range(0, 2):
			_pipe(x + _rng.randi_range(3, maxi(4, sw - 5)), top + _rng.randi_range(0, 18))
		x += sw


## 셔터 내린 가게: 간판 띠 + 셔터 가로줄 + 손잡이
func _shop(x: int, sw: int) -> void:
	var P := Palette
	var w := mini(sw - 10, _rng.randi_range(36, 64))
	var h := _rng.randi_range(30, 40)
	var sx := x + (sw - w) / 2
	var sy := _floor - h
	_fill(sx - 2, sy - 7, w + 4, h + 7, P.STRUCT_DARK)            # 문틀 + 간판 띠
	_fill(sx - 2, sy - 7, w + 4, 1, Color(P.RIM, 0.3))
	_fill(sx, sy - 5, w, 4, P.STRUCT_EDGE)                       # 꺼진 간판 판
	_fill(sx, sy, w, h, P.FLOOR_JOINT)                           # 셔터
	var yy := sy + 1
	while yy < _floor:
		_fill(sx, yy, w, 1, P.STRUCT_LIGHT)
		yy += 3
	_fill(sx, sy, w, 2, P.STRUCT_DARK)                           # 셔터 통
	_fill(sx + w / 2 - 3, _floor - 4, 6, 1, Color(P.RIM, 0.35))  # 손잡이


## 에어컨 실외기 14×10: 판 · 격자 · 팬 · 받침 (가끔 물 자국)
func _ac(x: int, y: int) -> void:
	var P := Palette
	_fill(x - 1, y - 1, 16, 12, P.STRUCT_EDGE)
	_fill(x, y, 14, 10, P.STRUCT_LIGHT)
	_fill(x, y, 14, 1, Color(P.RIM, 0.45))
	for gx in [2, 4, 6]:
		_fill(x + gx, y + 2, 1, 6, P.STRUCT_DARK)
	var c := Vector2(x + 10.5, y + 5.0)
	for a in 12:                                                 # 팬 (1px 원)
		var q := c + Vector2.from_angle(TAU * a / 12.0) * 3.0
		_px(int(q.x), int(q.y), P.STRUCT_DARK)
	_px(int(c.x), int(c.y), P.STRUCT_DARK)
	_fill(x + 1, y + 10, 1, 3, P.STRUCT_DARK)                    # 받침
	_fill(x + 12, y + 10, 1, 3, P.STRUCT_DARK)
	if _rng.randf() < 0.5:
		var dy := y + 13
		while dy < mini(y + 30, _floor):
			_px(x + 7, dy, Color(P.SPLASH, 0.18))
			dy += 2


## 세로 배관 (2px + 왼쪽 림 1px, 이음매)
func _pipe(x: int, y0: int) -> void:
	var P := Palette
	_fill(x, y0, 2, _floor - y0, P.STRUCT_DARK)
	_fill(x, y0, 1, _floor - y0, Color(P.RIM, 0.22))
	var y := y0 + _rng.randi_range(10, 24)
	while y < _floor - 4:
		_fill(x - 1, y, 4, 1, P.STRUCT_LIGHT)
		y += _rng.randi_range(22, 40)
	if _rng.randf() < 0.5:                                       # 위에서 꺾여 벽으로 들어감
		var dir := -1 if _rng.randf() < 0.5 else 1
		_fill(x + (2 if dir > 0 else -6), y0, 6, 2, P.STRUCT_DARK)


# ---------------------------------------------------------------- 전선 · 네온 간판
func _make_wires() -> void:
	_wires = []
	for k in 2:
		_wires.append([_rng.randi_range(28, 56), _rng.randi_range(28, 56), _rng.randf_range(5.0, 12.0)])


func wire_y(k: int, x: float) -> float:
	var wd: Array = _wires[k]
	var u := clampf(x / maxf(1.0, float(_w)), 0.0, 1.0)
	return lerpf(float(wd[0]), float(wd[1]), u) + float(wd[2]) * sin(u * PI * 3.0) * 0.5 + float(wd[2]) * sin(u * PI)


func _draw_wires() -> void:
	for k in _wires.size():
		var prev := int(roundf(wire_y(k, 0.0)))
		for x in _w:
			var y := int(roundf(wire_y(k, float(x))))
			for yy in range(mini(prev, y), maxi(prev, y) + 1):
				_px(x, yy, Palette.STRUCT_LIGHT)
			prev = y


## 작은 네온 간판 1 ~ 2개: 전선에 매달린 가로 간판 + 벽에 붙은 세로 간판 (분홍 · 주황 획)
func _neon_signs() -> void:
	var P := Palette
	var n := _rng.randi_range(1, 2)
	for i in n:
		var col: Color = P.NEON_PINK if (i + _rng.randi()) % 2 == 0 else NEON_ORANGE
		var horizontal := i == 0
		var w := _rng.randi_range(22, 30) if horizontal else 8
		var h := 9 if horizontal else _rng.randi_range(20, 26)
		var x := _rng.randi_range(70, maxi(71, _w - 70 - w))
		var y: int
		if horizontal:
			y = int(roundf(wire_y(0, x + w / 2.0))) + 6
			_fill(x + 3, y - 6, 1, 6, P.STRUCT_DARK)              # 매단 줄
			_fill(x + w - 4, y - 6, 1, 6, P.STRUCT_DARK)
		else:
			y = _rng.randi_range(118, 150)
			_fill(x - 2, y + 3, 2, 1, P.STRUCT_DARK)             # 벽 받침
		# 글로우 (네온만 번짐) → 판 → 획
		_fill(x - 4, y - 4, w + 8, h + 8, Color(col, 0.05))
		_fill(x - 2, y - 2, w + 4, h + 4, Color(col, 0.09))
		_fill(x, y, w, h, Color("#181422"))
		_fill(x, y, w, 1, Color(P.RIM, 0.25))
		if horizontal:
			var sx := x + 3
			while sx < x + w - 4:
				var kind := _rng.randi() % 3
				if kind == 0:
					_fill(sx, y + 2, 1, 5, col)
				elif kind == 1:
					_fill(sx, y + 2, 3, 1, col)
					_fill(sx + 1, y + 2, 1, 5, col)
				else:
					_fill(sx, y + 6, 3, 1, col)
					_fill(sx, y + 2, 1, 5, col)
				sx += 5
		else:
			var sy := y + 2
			while sy < y + h - 4:
				_fill(x + 2, sy, 4, 1, col)
				if _rng.randf() < 0.6:
					_fill(x + 3, sy + 1, 1, 2, col)
				sy += 5
		signs += 1


# ---------------------------------------------------------------- 조명 (전선에 매달림 / 벽 받침) + 원뿔 빛
func _lamp(x: float, i: int) -> void:
	var P := Palette
	var xi := int(roundf(x))
	var kind := "wire" if i % 2 == 0 else "wall"
	var shade_y: int
	if kind == "wire":
		var wy := int(roundf(wire_y(1, x)))
		_fill(xi, wy, 1, 7, P.STRUCT_LIGHT)                      # 줄
		shade_y = wy + 7
	else:
		shade_y = _floor - _rng.randi_range(78, 96)
		_fill(xi - 8, shade_y - 2, 9, 1, P.STRUCT_LIGHT)         # 벽에서 나온 팔
		_fill(xi - 8, shade_y - 4, 1, 4, P.STRUCT_DARK)
	_fill(xi - 4, shade_y, 9, 3, P.STRUCT_LIGHT)                 # 갓 9×3
	_fill(xi - 4, shade_y, 9, 1, Color(P.RIM, 0.6))
	var by := shade_y + 3
	_fill(xi - 4, by - 1, 9, 3, Color(P.LAMP_LIGHT, 0.2))
	_fill(xi - 3, by, 7, 1, P.LAMP_LIGHT)                        # 전구 7×1
	# 원뿔 빛: 전구 폭 → 바닥에서 폭 bw (안쪽 겹은 더 좁게)
	var bw := _rng.randi_range(78, 96)
	for layer in [[1.0, P.LAMP_CONE_ALPHA], [0.55, P.LAMP_CONE_ALPHA * 0.6]]:
		var k: float = layer[0]
		for yy in range(by + 1, _floor):
			var u := float(yy - by) / float(_floor - by)
			var hw := lerpf(3.5, bw * 0.5 * k, u)
			_fill(int(roundf(x - hw)), yy, int(roundf(hw * 2.0)), 1, Color(P.LAMP_LIGHT, float(layer[1])))
	# 바닥 빛 웅덩이
	_ellipse(x, _floor + 2.0, bw * 0.4, 2.5, Color(P.LAMP_LIGHT, P.LAMP_CONE_ALPHA * 0.8), floor_img)
	lamps.append({ "bulb": Vector2(x, by), "kind": kind })


# ---------------------------------------------------------------- 바닥: 물웅덩이 (가운데 분홍 반사선)
func _puddles() -> void:
	var P := Palette
	var n := maxi(3, _w / 180)
	for i in n:
		var w := _rng.randi_range(40, 80)
		var x := _rng.randi_range(40, maxi(41, _w - 40 - w))
		var top := _surface(x + w / 2)
		if top < 0 or _surface(x) != top or _surface(x + w) != top:
			continue                                              # 평평한 바닥에만
		var y := float(top) + _rng.randf_range(6.0, 18.0)
		var h := _rng.randf_range(2.0, 3.5)
		_ellipse(x + w / 2.0, y, w / 2.0, h, Color("#10111A"), floor_img)
		_fill(x + w / 4, int(roundf(y)), w / 2, 1, Color(P.NEON_PINK, 0.45), floor_img)


## 그 x 의 맨 아래 바닥 윗면 y (지형 칸, 위가 비어 있는 곳) — 없으면 -1
func _surface(x: int) -> int:
	var t: int = int(Config.room.tile)
	var cx := x / t
	for cy in range(_h / t - 1, 0, -1):
		if _room.cell_kind(Vector2i(cx, cy)) == 1 and _room.cell_kind(Vector2i(cx, cy - 1)) == 0:
			return cy * t
	return -1

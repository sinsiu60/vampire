extends RefCounted
class_name RoofDressing
## 1장 이어진 맵의 높은 곳 꾸밈 (3단계) — AlleyDressing 다음에 한 번 이미지로 그림. 이미지 파일 없이 코드로, 색은 모두 Palette.
##  floor 이미지 (지형 위 — 칠한 지형에 덧그림): 솟은 건물 덩어리 (옥상 · 비상계단 건물 · 틈 벽) 에 창문 (드물게 따뜻한 불빛)
##  struct 이미지 (지형 뒤 · 인물 뒤): 옥상 위 소품 — 난간 · 실외기 · 환풍구 · 안테나 (분홍 점) · 계단실 · 빨랫줄 ·
##     비상계단 발판 난간과 받침 · 옥상 광고판 (발판 위 판 + 기둥) · 거리의 낮은 노점 상자 위 천막
## 거리 바닥 (맵 맨 아래 - 32) 보다 56px 넘게 솟은 곳만 "건물" 로 봄 — 1장 방 구간 (거리) 은 그대로.
## 같은 맵은 늘 같은 모습 (시드).

const NEON_ORANGE := Color("#D2783C")

var img: Image                   ## 구조물 (지형 뒤)
var floor_img: Image             ## 지형 위
var props := 0                   ## 그린 소품 수 (테스트)
var windows := 0

var _room: Node
var _rng := RandomNumberGenerator.new()
var _cols := 0
var _street := 240
var _top: PackedInt32Array      # 칸 x → 가장 위 지형 윗면 y (px), 없으면 큰 값


func build(room: Node, struct_img: Image, floor_image: Image, seed: int) -> void:
	_room = room
	img = struct_img
	floor_img = floor_image
	_rng.seed = 92821 * seed + 13
	var size: Vector2 = room.size_px()
	var t := int(Config.room.tile)
	_cols = int(size.x) / t
	_street = int(size.y) - 32
	_top = PackedInt32Array()
	_top.resize(_cols)
	for cx in _cols:
		_top[cx] = 99999
		for cy in range(1, int(size.y) / t):
			if room.cell_kind(Vector2i(cx, cy)) == 1 and room.cell_kind(Vector2i(cx, cy - 1)) == 0:
				_top[cx] = cy * t
				break
	_windows()
	_roof_runs()
	_platforms()
	_stalls()


func _building(cx: int) -> bool:
	return cx >= 0 and cx < _cols and _top[cx] < _street - 56


func _span(x: float) -> Dictionary:
	return _room.span_at(x) if _room.has_method("span_at") else {}


# ---------------------------------------------------------------- 도우미 (투명도 있으면 덧칠)
func _fill(on: Image, x: int, y: int, w: int, h: int, c: Color) -> void:
	var r := Rect2i(x, y, w, h).intersection(Rect2i(0, 0, on.get_width(), on.get_height()))
	if r.size.x <= 0 or r.size.y <= 0:
		return
	if c.a >= 0.999:
		on.fill_rect(r, c)
		return
	for yy in range(r.position.y, r.end.y):
		for xx in range(r.position.x, r.end.x):
			on.set_pixel(xx, yy, on.get_pixel(xx, yy).blend(c))


func _solid_px(x: int, y: int) -> bool:
	var t := int(Config.room.tile)
	return _room.cell_kind(Vector2i(floori(float(x) / t), floori(float(y) / t))) == 1


# ---------------------------------------------------------------- 1) 건물 창문 (지형 위)
func _windows() -> void:
	var P := Palette
	var t := int(Config.room.tile)
	var h := floor_img.get_height()
	for cx in _cols:
		if not _building(cx):
			continue
		var x0 := cx * t
		for x in range(x0, x0 + t):
			if x % 7 != 2:
				continue
			var y := _top[cx] + 12
			while y < h - 14:
				# 창문 3×4 가 건물 안 (네 귀퉁이 모두 지형) 일 때만
				if _solid_px(x, y) and _solid_px(x + 2, y + 3) and _solid_px(x - 2, y) and _solid_px(x + 4, y + 3):
					var hsh := _hash(x, y)
					if hsh < 0.11:
						var lit := hsh < 0.012
						_fill(floor_img, x, y, 3, 4, Color(P.LAMP_LIGHT, 0.55) if lit else P.NEAR_WINDOW)
						if not lit and hsh < 0.05:
							_fill(floor_img, x, y + 2, 3, 1, P.FLOOR)            # 창살
						windows += 1
				y += 10


static func _hash(x: int, y: int) -> float:
	var n := (x * 374761393 + y * 668265263) & 0x7fffffff
	n = (n ^ (n >> 13)) * 1274126177 & 0x7fffffff
	return float(n % 10000) / 10000.0


# ---------------------------------------------------------------- 2) 옥상 위 소품
func _roof_runs() -> void:
	var t := int(Config.room.tile)
	var cx := 0
	while cx < _cols:
		if not _building(cx):
			cx += 1
			continue
		var c0 := cx
		var y := _top[cx]
		while cx < _cols and _building(cx) and _top[cx] == y:
			cx += 1
		_dress_roof(c0 * t, cx * t, y)


## 옥상 한 판 [x0, x1) 윗면 y
func _dress_roof(x0: int, x1: int, y: int) -> void:
	var P := Palette
	var L := x1 - x0
	var t := int(Config.room.tile)
	# 가장자리 (옆이 낮으면) 난간: 기둥 + 위 1px 레일 (끝에서 36px 까지)
	var left_edge := not _building(x0 / t - 1) or _top[x0 / t - 1] > y
	var right_edge := not _building(x1 / t) or _top[mini(x1 / t, _cols - 1)] > y
	for e in [[left_edge, x0, 1], [right_edge, x1 - 1, -1]]:
		if not e[0]:
			continue
		var ex: int = e[1]
		var dir: int = e[2]
		var run := mini(36, L / 2)
		_fill(img, mini(ex, ex + dir * run), y - 8, run, 1, P.STRUCT_LIGHT)
		_fill(img, mini(ex, ex + dir * run), y - 8, run, 1, Color(P.RIM, 0.25))
		var px := 0
		while px <= run:
			_fill(img, ex + dir * px, y - 8, 1, 8, P.STRUCT_DARK)
			px += 6
		_fill(img, ex - (1 if dir < 0 else 0), y - 3, 2, 3, P.STRUCT_EDGE)    # 끝 턱
	if L < 40:
		return
	# 소품을 겹치지 않게 차례로 놓음
	var x := x0 + 14
	var used_hut := false
	while x < x1 - 30:
		var k := _rng.randf()
		var w := 0
		if k < 0.26:
			w = _ac(x, y)
		elif k < 0.42:
			w = _vent(x, y)
		elif k < 0.54:
			w = _antenna(x, y)
		elif k < 0.64 and not used_hut and L > 220:
			w = _hut(x, y)
			used_hut = true
		elif k < 0.72 and x + 70 < x1 - 20:
			w = _laundry(x, y)
		else:
			w = 0
		props += 1 if w > 0 else 0
		x += maxi(w, 0) + _rng.randi_range(26, 70)


## 실외기 14×10 (받침 포함) — 폭 반환
func _ac(x: int, y: int) -> int:
	var P := Palette
	var top := y - 13
	_fill(img, x - 1, top - 1, 16, 12, P.STRUCT_EDGE)
	_fill(img, x, top, 14, 10, P.STRUCT_LIGHT)
	_fill(img, x, top, 14, 1, Color(P.RIM, 0.45))
	for gx in [2, 4, 6]:
		_fill(img, x + gx, top + 2, 1, 6, P.STRUCT_DARK)
	var c := Vector2(x + 10.5, top + 5.0)
	for a in 12:
		var q := c + Vector2.from_angle(TAU * a / 12.0) * 3.0
		_fill(img, int(q.x), int(q.y), 1, 1, P.STRUCT_DARK)
	_fill(img, x + 1, top + 10, 1, 3, P.STRUCT_DARK)
	_fill(img, x + 12, top + 10, 1, 3, P.STRUCT_DARK)
	return 16


## 환풍구: 굴뚝 기둥 + 갓
func _vent(x: int, y: int) -> int:
	var P := Palette
	var h := _rng.randi_range(8, 16)
	_fill(img, x + 1, y - h, 4, h, P.STRUCT_DARK)
	_fill(img, x + 1, y - h, 1, h, Color(P.RIM, 0.2))
	_fill(img, x - 1, y - h - 2, 8, 2, P.STRUCT_LIGHT)
	_fill(img, x - 1, y - h - 2, 8, 1, Color(P.RIM, 0.35))
	return 8


## 안테나: 1px 기둥 + 가로대 + 꼭대기 분홍 점
func _antenna(x: int, y: int) -> int:
	var P := Palette
	var h := _rng.randi_range(22, 40)
	_fill(img, x, y - h, 1, h, P.STRUCT_LIGHT)
	for k in _rng.randi_range(2, 3):
		var yy := y - h + 4 + k * 6
		var w := 9 - k * 2
		_fill(img, x - w / 2, yy, w, 1, P.STRUCT_LIGHT)
	_fill(img, x - 1, y - h - 1, 3, 2, Color(P.NEON_PINK_DARK, 0.9))
	_fill(img, x - 2, y - h - 2, 5, 4, Color(P.NEON_PINK, 0.08))
	_fill(img, x - 2, y - 2, 5, 2, P.STRUCT_EDGE)                       # 받침
	return 6


## 계단실: 상자 + 문 + 위 작은 등
func _hut(x: int, y: int) -> int:
	var P := Palette
	var w := 26
	var h := 20
	_fill(img, x, y - h, w, h, P.NEAR_BUILDING)
	_fill(img, x, y - h, w, 1, Color(P.RIM, 0.3))
	_fill(img, x - 1, y - h - 2, w + 2, 2, P.STRUCT_DARK)
	_fill(img, x + 9, y - 14, 8, 14, P.STRUCT_EDGE)                        # 문
	_fill(img, x + 9, y - 14, 8, 1, Color(P.RIM, 0.2))
	_fill(img, x + 11, y - 17, 4, 1, Color(P.LAMP_LIGHT, 0.7))            # 문 위 등
	_fill(img, x + 8, y - 17, 10, 6, Color(P.LAMP_LIGHT, 0.05))
	return w


## 빨랫줄: 기둥 둘 + 처진 줄 + 빨래 몇 장 (흐린 색)
func _laundry(x: int, y: int) -> int:
	var P := Palette
	var w := _rng.randi_range(44, 64)
	var h := 20
	_fill(img, x, y - h, 1, h, P.STRUCT_LIGHT)
	_fill(img, x + w, y - h, 1, h, P.STRUCT_LIGHT)
	var cloth := [P.STRUCT_LIGHT, P.NEAR_WINDOW, Color("#2A2438"), P.FAR_WINDOW]
	for i in w:
		var u := float(i) / w
		var yy := y - h + 1 + int(roundf(sin(u * PI) * 4.0))
		_fill(img, x + i, yy, 1, 1, P.STRUCT_DARK)
		if i > 3 and i < w - 6 and i % 9 == 4 and _rng.randf() < 0.75:
			var cw := _rng.randi_range(4, 7)
			_fill(img, x + i, yy + 1, cw, _rng.randi_range(5, 9), cloth[_rng.randi() % cloth.size()])
	return w


# ---------------------------------------------------------------- 3) 발판: 비상계단 난간 · 옥상 광고판
func _platforms() -> void:
	var t := int(Config.room.tile)
	var size: Vector2 = _room.size_px()
	for cy in range(1, int(size.y) / t):
		var cx := 0
		while cx < _cols:
			if _room.cell_kind(Vector2i(cx, cy)) != 2:
				cx += 1
				continue
			var c0 := cx
			while cx < _cols and _room.cell_kind(Vector2i(cx, cy)) == 2:
				cx += 1
			var x0 := c0 * t
			var x1 := cx * t
			var sp := _span(x0 + 1.0)
			var y := cy * t
			if sp.is_empty() or not (bool(sp.get("tall", false)) or String(sp.get("style", "")) == "roof"):
				continue                                   # 1장 방 (거리) 발판은 그대로
			if String(sp.get("style", "")) == "roof" and cx - c0 >= 8:
				_billboard(x0, x1, y)
			else:
				_fire_escape(x0, x1, y)
			props += 1


## 비상계단 발판: 위 1px 난간 + 기둥 · 아래 받침 (가까운 벽 쪽으로 사선)
func _fire_escape(x0: int, x1: int, y: int) -> void:
	var P := Palette
	_fill(img, x0, y - 9, x1 - x0, 1, P.STRUCT_LIGHT)
	_fill(img, x0, y - 9, x1 - x0, 1, Color(P.RIM, 0.3))
	var x := x0
	while x <= x1 - 1:
		_fill(img, x, y - 9, 1, 9, P.STRUCT_DARK)
		x += 4
	_fill(img, x1 - 1, y - 9, 1, 9, P.STRUCT_DARK)
	# 받침: 왼쪽 · 오른쪽 16px 안의 벽으로
	for dir in [-1, 1]:
		var wx := x0 - 1 if dir < 0 else x1
		for d in 16:
			if _solid_px(wx + dir * d, y + 2):
				var from := Vector2(x0 + 2 if dir < 0 else x1 - 3, y + 5)
				var to := Vector2(wx + dir * d, y + 14)
				for k in 12:
					var q := from.lerp(to, k / 11.0)
					_fill(img, int(q.x), int(q.y), 1, 1, P.STRUCT_DARK)
				break


## 옥상 광고판: 발판 (점검 통로) 위에 판 + 아래 기둥 둘 + 네온 획 (분홍 · 주황)
func _billboard(x0: int, x1: int, y: int) -> void:
	var P := Palette
	var col: Color = (P.NEON_PINK if _rng.randf() < 0.5 else NEON_ORANGE).lerp(Color("#181422"), 0.35)   # 거리 간판보다 차분하게
	var bx := x0 - 4
	var bw := x1 - x0 + 8
	var bh := 30
	var by := y - bh - 4
	_fill(img, bx - 4, by - 4, bw + 8, bh + 8, Color(col, 0.035))
	_fill(img, bx, by, bw, bh, Color("#181422"))
	_fill(img, bx, by, bw, 1, Color(P.RIM, 0.3))
	_fill(img, bx, by + bh - 1, bw, 1, P.STRUCT_EDGE)
	var sx := bx + 6
	while sx < bx + bw - 8:
		var kind := _rng.randi() % 3
		if kind == 0:
			_fill(img, sx, by + 9, 1, 12, col)
		elif kind == 1:
			_fill(img, sx, by + 9, 6, 1, col)
			_fill(img, sx + 3, by + 9, 1, 12, col)
		else:
			_fill(img, sx, by + 20, 6, 1, col)
			_fill(img, sx, by + 9, 1, 12, col)
		sx += 9
	_fill(img, bx + 2, by - 3, bw - 4, 1, P.STRUCT_DARK)               # 위 조명대
	# 기둥: 발판 아래 → 아래 지붕
	for px in [x0 + 6, x1 - 8]:
		var yy := y + 4
		while yy < y + 80 and not _solid_px(px, yy):
			_fill(img, px, yy, 2, 1, P.STRUCT_DARK)
			yy += 1
	# 발판 난간
	_fill(img, x0, y - 7, x1 - x0, 1, P.STRUCT_LIGHT)


# ---------------------------------------------------------------- 4) 거리의 낮은 상자 위 노점 천막 (2칸 이하 · 거리 구간)
func _stalls() -> void:
	var P := Palette
	var t := int(Config.room.tile)
	var cx := 0
	while cx < _cols:
		var y := _top[cx]
		var below := _street - y
		if below <= 0 or below > 16 or y >= 99999:
			cx += 1
			continue
		var c0 := cx
		while cx < _cols and _top[cx] == y:
			cx += 1
		var x0 := c0 * t
		var x1 := cx * t
		var sp := _span(x0 + 1.0)
		if sp.is_empty() or String(sp.get("style", "")) != "alley" or bool(sp.get("tall", false)):
			continue
		# 기둥 둘 + 기울어진 천막 (줄무늬)
		var top := y - 26
		_fill(img, x0, top, 1, 26, P.STRUCT_LIGHT)
		_fill(img, x1 - 1, top + 3, 1, 23, P.STRUCT_LIGHT)
		for i in range(-4, x1 - x0 + 4):
			var yy := top - 2 + int(roundf(float(i) / (x1 - x0) * 3.0))
			var c: Color = Color("#2A2438") if (i / 5) % 2 == 0 else P.NEON_PINK_DARK.darkened(0.45)
			_fill(img, x0 + i, yy, 1, 4, c)
		_fill(img, x0 - 4, top - 2, x1 - x0 + 8, 1, Color(P.RIM, 0.2))
		props += 1

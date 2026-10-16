extends Node2D
class_name Backdrop
## 배경 (월드 뒤 CanvasLayer): 하늘(고정) + 먼 도시(0.15) + 가까운 도시(0.45) 시차 스크롤.
## 프로토타입과 같은 시드(1337)·같은 난수 순서로 한 번만 이미지로 그려 둠 → 같은 도시 실루엣.
## 화면 왼쪽 끝 월드 x(흔들림 포함) × 배율 만큼 왼쪽으로 밀어 그림. 패링 시퀀스 줌도 같이 받음.

var layers: Array = []           # [{ tex, factor }]
var _seed := 0


func _ready() -> void:
	_build()


# ---- 프로토타입 seeded() = mulberry32 (32비트 정수 연산을 그대로 흉내)
const M32 := 0xFFFFFFFF


static func _imul(a: int, b: int) -> int:
	a &= M32
	b &= M32
	var lo := (a & 0xFFFF) * b
	var hi := (((a >> 16) & 0xFFFF) * b) & 0xFFFF
	return (lo + (hi << 16)) & M32


func _rng() -> float:
	_seed = (_seed + 0x6D2B79F5) & M32
	var t := _imul(_seed ^ (_seed >> 15), 1 | _seed)
	t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
	return float((t ^ (t >> 14)) & M32) / 4294967296.0


func _r(a: float, b: float) -> float:
	return a + _rng() * (b - a)


func _build() -> void:
	var C: Dictionary = Config.colors
	var W: int = Config.view.w
	var H: int = Config.view.h
	_seed = 1337
	# 0) 하늘: 위가 더 어두운 남색 그라디언트(0 → 85%) + 희미한 별
	var sky := Image.create(W, H, false, Image.FORMAT_RGBA8)
	for y in H:
		var u := clampf((y + 0.5) / H / 0.85, 0.0, 1.0)
		var c: Color = C.sky_top.lerp(C.sky_bottom, u)
		for x in W:
			sky.set_pixel(x, y, c)
	for i in 60:
		var sx := floori(_r(0, W))
		var sy := floori(_r(0, H * 0.55))
		sky.set_pixel(sx, sy, C.star)
	layers = [{ "tex": ImageTexture.create_from_image(sky), "factor": 0.0 }]
	# 1) 먼 도시 / 2) 가까운 도시 (창문 몇 개)
	layers.append(_city(0.15, C.far_city, 50, 150, 16, 40, false))
	layers.append(_city(0.45, C.near_city, 30, 110, 22, 56, true))


func _city(factor: float, color: Color, min_h: float, max_h: float, min_w: float, max_w: float, windows: bool) -> Dictionary:
	var W: int = Config.view.w
	var H: int = Config.view.h
	var cw := ceili(W + (Config.room.w - W) * factor) + 16
	var img := Image.create(cw, H, false, Image.FORMAT_RGBA8)
	var base := 240
	var x := -4
	while x < cw:
		var bw := floori(_r(min_w, max_w))
		var bh := floori(_r(min_h, max_h))
		_fill(img, x, base - bh, bw, bh + 40, color)
		if _rng() < 0.4:
			_fill(img, x + floori(bw * 0.25), base - bh - 4, floori(bw * 0.5), 4, color)     # 계단식 옥상
		if _rng() < 0.3:
			var ax := x + floori(_r(2, bw - 2))
			var ah := floori(_r(6, 16))
			_fill(img, ax, base - bh - ah, 1, 16, color)                                    # 안테나
		if windows:
			var wy := base - bh + 4
			while wy < base - 4:
				var wx := x + 3
				while wx < x + bw - 3:
					if _rng() < 0.1:
						_fill(img, wx, wy, 2, 1, Config.colors.window)
					wx += 4
				wy += 5
		x += bw + floori(_r(0, 6))
	return { "tex": ImageTexture.create_from_image(img), "factor": factor }


static func _fill(img: Image, x: int, y: int, w: int, h: int, c: Color) -> void:
	var r := Rect2i(x, y, w, h).intersection(Rect2i(0, 0, img.get_width(), img.get_height()))
	if r.size.x > 0 and r.size.y > 0:
		img.fill_rect(r, c)


func _process(_delta: float) -> void:
	# 패링 시퀀스 줌: 화면 가운데(카메라 중심)를 기준으로 같이 확대
	var main := get_tree().get_first_node_in_group("game")
	var z: float = main.zoom if main != null else 1.0
	var layer := get_parent() as CanvasLayer
	if layer != null:
		var c := Vector2(Config.view.w, Config.view.h) / 2.0
		layer.transform = Transform2D(0.0, Vector2(z, z), 0.0, c * (1.0 - z))
	queue_redraw()


func _draw() -> void:
	# 화면 왼쪽 끝의 월드 x (카메라 흔들림 포함)
	var cam_x := -get_viewport().get_canvas_transform().origin.x
	var main := get_tree().get_first_node_in_group("game")
	var z: float = main.zoom if main != null else 1.0
	if z > 1.0001:
		cam_x = -(get_viewport().get_canvas_transform().origin.x - Config.view.w / 2.0 * (1.0 - z)) / z
	for L in layers:
		draw_texture(L.tex, Vector2(-roundf(cam_x * L.factor), 0))

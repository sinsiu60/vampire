extends Node2D
class_name Background
## 1장 공통 배경 (scenes/Background.tscn) — 이미지 파일 없이 코드로 그림. 색은 모두 Palette.
## 레이어 (뒤 → 앞):
##  Far (CanvasLayer -10, 화면 고정 + 시차): 1 Sky 세로 그라데이션 · 2 FarBuildings (높이 90 ~ 170, 폭 26 ~ 58, 창문 2×3 18%, 시차 0.2)
##                                        · 4 DistantNeon (먼 건물에 붙은 10×3 네온, 글로우만 번짐) · 3 NearBuildings (높이 50 ~ 110, 창문 12%, 시차 0.5)
##  Structures (z -3, 시차 1.0 = 월드) · Floor (z -2) — 방마다 채움 (보스 무대 2단계 · 골목 4단계)
##  RainBack (z -1, 인물 뒤) · [인물 · 적 z 0] · RainFront (z 9, 인물 앞 25%) — Rain.tscn
##  Overlay (비네트 · 번개 · 흑백) 는 기존 화면 효과 층
## 픽셀 규칙: 정수 좌표, 안티앨리어싱 없음, Nearest. 번지는 것은 네온 · 조명 글로우뿐.
## 방마다 시드가 달라 건물 배치가 다름 (같은 방은 늘 같음).

var base_y := 240.0              ## 건물이 서 있는 높이 (화면 y) — 방 바닥
var layers: Array = []           # [{ tex, factor }]
var rain_back: Rain
var rain_front: Rain
var painted := false             ## 지형을 팔레트로 다시 칠했는가 (Room.paint_terrain)

var _room_w := 480.0
var _rng := RandomNumberGenerator.new()
var _parallax: Node2D


func _ready() -> void:
	_parallax = $Far/Parallax
	_parallax.draw.connect(_draw_parallax)
	rain_back = $RainBack
	rain_front = $RainFront
	if layers.is_empty():
		build(Config.room.w, 1)


## 방에 맞춰 다시 그림 (Main 이 방을 불러온 뒤). seed = 방마다 다르게, floor_y = 바닥 높이
func build(room_w: float, seed: int, floor_y := 240.0, room: Node = null) -> void:
	_room_w = room_w
	base_y = floor_y
	_rng.seed = 7919 * seed + 104729
	layers = [{ "tex": _sky(), "factor": 0.0 }]
	var far := _city(Palette.PARALLAX_FAR, Palette.FAR_BUILDING, Palette.FAR_WINDOW, Vector2(90, 170), Vector2(26, 58), 0.18, true)
	layers.append(far)
	layers.append(_city(Palette.PARALLAX_NEAR, Palette.NEAR_BUILDING, Palette.NEAR_WINDOW, Vector2(50, 110), Vector2(30, 64), 0.12, false))
	if room != null:
		rain_back.room = room
		rain_front.room = room
		if room.get("paint_terrain"):
			_paint_terrain(room)
	_parallax.queue_redraw()


## 비 강도 (normal | heavy | dark) · 낙하 속도 배율
func set_rain(preset: String, speed_mul := 1.0) -> void:
	for r in [rain_back, rain_front]:
		if r.preset != preset:
			r.preset = preset
		r.speed_mul = speed_mul


# ---------------------------------------------------------------- 그리기 (한 번 이미지로)
func _sky() -> ImageTexture:
	var W: int = Config.view.w
	var H: int = Config.view.h
	var img := Image.create(W, H, false, Image.FORMAT_RGBA8)
	for y in H:
		var u := clampf(float(y) / maxf(1.0, base_y), 0.0, 1.0)        # 바닥 높이에서 가장 밝은 아래 색
		img.fill_rect(Rect2i(0, y, W, 1), Palette.SKY_TOP.lerp(Palette.SKY_BOTTOM, u))
	return ImageTexture.create_from_image(img)


## 건물 실루엣 한 층. neon = 먼 네온 간판 소품을 붙임
func _city(factor: float, body: Color, win: Color, hr: Vector2, wr: Vector2, win_p: float, neon: bool) -> Dictionary:
	var W: int = Config.view.w
	var H: int = Config.view.h
	var cw := ceili(W + maxf(0.0, _room_w - W) * factor) + 16
	var img := Image.create(cw, H, false, Image.FORMAT_RGBA8)
	var base := int(base_y)
	var x := -4
	var neons := []
	while x < cw:
		var bw := _rng.randi_range(int(wr.x), int(wr.y))
		var bh := _rng.randi_range(int(hr.x), int(hr.y))
		var top := base - bh
		_fill(img, x, top, bw, H - top, body)
		if _rng.randf() < 0.35:
			_fill(img, x + bw / 4, top - 4, bw / 2, 4, body)              # 계단식 옥상
		if _rng.randf() < 0.3:
			_fill(img, x + _rng.randi_range(2, maxi(2, bw - 3)), top - _rng.randi_range(6, 14), 1, 16, body)   # 안테나
		# 창문 2×3 (격자 4×6 칸에서 무작위)
		var wy := top + 5
		while wy < base - 6:
			var wx := x + 3
			while wx < x + bw - 4:
				if _rng.randf() < win_p:
					_fill(img, wx, wy, 2, 3, win)
				wx += 4
			wy += 6
		if neon and _rng.randf() < 0.3 and bw > 16:
			neons.append(Vector2i(x + _rng.randi_range(3, bw - 13), top + _rng.randi_range(8, maxi(9, mini(40, bh - 12)))))
		x += bw + _rng.randi_range(0, 5)
	# 4) 먼 네온 (10×3) + 글로우 (네온만 번짐)
	for p in neons:
		var c: Color = Palette.DISTANT_NEON[_rng.randi() % Palette.DISTANT_NEON.size()]
		_blend(img, Rect2i(p.x - 3, p.y - 3, 16, 9), Color(c, 0.10))
		_blend(img, Rect2i(p.x - 1, p.y - 1, 12, 5), Color(c, 0.22))
		_fill(img, p.x, p.y, 10, 3, c)
	return { "tex": ImageTexture.create_from_image(img), "factor": factor }


static func _fill(img: Image, x: int, y: int, w: int, h: int, c: Color) -> void:
	var r := Rect2i(x, y, w, h).intersection(Rect2i(0, 0, img.get_width(), img.get_height()))
	if r.size.x > 0 and r.size.y > 0:
		img.fill_rect(r, c)


static func _blend(img: Image, r: Rect2i, c: Color) -> void:
	r = r.intersection(Rect2i(0, 0, img.get_width(), img.get_height()))
	for y in range(r.position.y, r.end.y):
		for x in range(r.position.x, r.end.x):
			img.set_pixel(x, y, img.get_pixel(x, y).blend(c))


# ---------------------------------------------------------------- 6 Floor: 지형을 팔레트로 다시 칠함 (한 번 이미지로)
## 지형 칸: 바닥색 #161822 + 윗면 1px 림 #464C64 + 24px 간격 사선 줄눈 #1A1C28 · 옆면 1px 어두운 테두리
## 일방향 발판: 윗면 림 + 3px 구조물 색 + 아래 1px 테두리. 원래 타일은 투명하게 (충돌은 그대로)
func _paint_terrain(room: Node) -> void:
	var terrain: TileMapLayer = room.terrain
	var t: int = int(Config.room.tile)
	var size: Vector2 = room.size_px()
	var img := Image.create(int(size.x), int(size.y), false, Image.FORMAT_RGBA8)
	var used := terrain.get_used_rect()
	for cy in range(used.position.y, used.end.y):
		for cx in range(used.position.x, used.end.x):
			var c := Vector2i(cx, cy)
			var k: int = room.cell_kind(c)
			if k == 0:
				continue
			var x0 := cx * t
			var y0 := cy * t
			if k == 2:
				_fill(img, x0, y0, t, 1, Palette.FLOOR_LINE)
				_fill(img, x0, y0 + 1, t, 3, Palette.STRUCT_LIGHT)
				_fill(img, x0, y0 + 4, t, 1, Palette.STRUCT_EDGE)
				continue
			_fill(img, x0, y0, t, t, Palette.FLOOR)
			for yy in t:            # 사선 줄눈 (24px 간격)
				for xx in t:
					if (x0 + xx + y0 + yy) % 24 == 0:
						img.set_pixel(x0 + xx, y0 + yy, Palette.FLOOR_JOINT)
			if room.cell_kind(c + Vector2i(-1, 0)) == 0:
				_fill(img, x0, y0, 1, t, Palette.STRUCT_DARK)
			if room.cell_kind(c + Vector2i(1, 0)) == 0:
				_fill(img, x0 + t - 1, y0, 1, t, Palette.STRUCT_DARK)
			if room.cell_kind(c + Vector2i(0, -1)) != 1:
				_fill(img, x0, y0, t, 1, Palette.FLOOR_LINE)
	var fl := $Floor as Node2D
	for ch in fl.get_children():
		ch.queue_free()
	var spr := Sprite2D.new()
	spr.centered = false
	spr.texture = ImageTexture.create_from_image(img)
	fl.add_child(spr)
	terrain.self_modulate = Color(1, 1, 1, 0)
	painted = true


# ---------------------------------------------------------------- 시차 (화면 왼쪽 끝 월드 x × 배율)
func _process(_delta: float) -> void:
	var main := get_tree().get_first_node_in_group("game")
	var z: float = main.zoom if main != null else 1.0
	var layer := $Far as CanvasLayer
	var c := Vector2(Config.view.w, Config.view.h) / 2.0
	layer.transform = Transform2D(0.0, Vector2(z, z), 0.0, c * (1.0 - z))     # 패링 · 연출 줌을 같이 받음
	_parallax.queue_redraw()


func _draw_parallax() -> void:
	var cam_x := -get_viewport().get_canvas_transform().origin.x
	var main := get_tree().get_first_node_in_group("game")
	var z: float = main.zoom if main != null else 1.0
	if z > 1.0001:
		cam_x = -(get_viewport().get_canvas_transform().origin.x - Config.view.w / 2.0 * (1.0 - z)) / z
	for L in layers:
		_parallax.draw_texture(L.tex, Vector2(-roundf(cam_x * float(L.factor)), 0))

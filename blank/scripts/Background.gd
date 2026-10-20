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
var dark := false                ## 어두운 무대 (철견 페이즈 3): 하늘 · 건물 · 바닥 훨씬 어둡게, 창문 3 ~ 4%
var dark_sky := [Color("#030308"), Color("#0A0810")]
var dark_window_p := 0.035
var dark_tint := 0.45
var _seed := 1
var alley := false               ## 시장 뒷골목 무대 (가까운 건물 층 대신 AlleyDressing 벽면)
var dressing: AlleyDressing = null
var roof: RoofDressing = null

var _room_w := 480.0
var _landmark := -1.0            # 철견의 탑 월드 x (Level.landmark_x) — 먼 건물 층에 세움
var tower := {}                  ## 탑 { ix (먼 층 이미지 x), top (화면 y) } — 꼭대기 분홍 경고등이 깜빡임
var _rng := RandomNumberGenerator.new()
var _parallax: Node2D


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE     # 일시정지면 비도 멈춤
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
	_seed = seed
	alley = room != null and String(room.get("art_style")) == "alley"
	_landmark = float(room.get("landmark_x")) if room != null and room.get("landmark_x") != null else -1.0
	_build_layers()
	if room != null:
		rain_back.room = room
		rain_front.room = room
		if room.get("paint_terrain"):
			_paint_terrain(room)
	_parallax.queue_redraw()


func _build_layers() -> void:
	_rng.seed = 7919 * _seed + 104729          # 같은 시드 = 같은 스카이라인 (어두워져도 건물 모양은 그대로)
	layers = [{ "tex": _sky(), "factor": 0.0 }]
	var t := dark_tint if dark else 1.0
	var far := _city(Palette.PARALLAX_FAR, _dim(Palette.FAR_BUILDING, t), _dim(Palette.FAR_WINDOW, t), Vector2(90, 170), Vector2(26, 58),
		dark_window_p if dark else 0.18, true)
	if _landmark >= 0.0:
		_tower(far.tex.get_image(), far)
	layers.append(far)
	if not alley:   # 골목 방은 가까운 건물 대신 월드의 골목 벽면 (AlleyDressing)
		layers.append(_city(Palette.PARALLAX_NEAR, _dim(Palette.NEAR_BUILDING, t), _dim(Palette.NEAR_WINDOW, t), Vector2(50, 110), Vector2(30, 64),
			dark_window_p if dark else 0.12, false))
	if _parallax != null:
		_parallax.queue_redraw()


## 철견의 탑: 먼 건물 층에 우뚝 선 높은 건물 (폭 40, 꼭대기 계단식 + 안테나). 카메라가 landmark_x 에 오면 화면 가운데쯤
func _tower(im: Image, layer: Dictionary) -> void:
	var P := Palette
	var f := float(layer.factor)
	var ix := int(roundf(Config.view.w / 2.0 + (_landmark - Config.view.w / 2.0) * f))
	var base := int(base_y)
	var w := 40
	var top := base - 196
	var body := P.FAR_BUILDING.lerp(P.NEAR_WINDOW, 0.12)
	if dark:
		body = _dim(body, dark_tint)
	_fill(im, ix - w / 2, top, w, Config.view.h - top, body)
	_fill(im, ix - w / 2 + 5, top - 10, w - 10, 10, body)                 # 계단식 꼭대기
	_fill(im, ix - w / 2 + 11, top - 18, w - 22, 8, body)
	_fill(im, ix, top - 34, 1, 16, body)                                   # 안테나
	_fill(im, ix - w / 2, top, 1, Config.view.h - top, Color(P.RIM, 0.12))   # 한쪽 림
	# 세로 불빛 줄 + 꼭대기 창문 띠
	for k in [-12, 0, 12]:
		var yy := top + 18
		while yy < base - 8:
			if _rng.randf() < 0.55:
				_fill(im, ix + k - 1, yy, 2, 4, P.FAR_WINDOW)
			yy += 7
	_fill(im, ix - w / 2 + 3, top + 6, w - 6, 2, Color(P.NEON_PINK_DARK, 0.7))
	tower = { "ix": ix, "top": top - 35 }
	layer.tex = ImageTexture.create_from_image(im)


static func _dim(c: Color, t: float) -> Color:
	return Color(c.r * t, c.g * t, c.b * t, c.a)


## 어두운 무대 켜고 끔 (철견 페이즈 3) — 하늘 · 건물을 다시 그리고 바닥도 어둡게
func set_dark(on: bool) -> void:
	if dark == on:
		return
	dark = on
	_build_layers()
	($Floor as Node2D).modulate = Color(dark_tint, dark_tint, dark_tint * 1.1) if dark else Color.WHITE


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
		var top: Color = dark_sky[0] if dark else Palette.SKY_TOP
		var bot: Color = dark_sky[1] if dark else Palette.SKY_BOTTOM
		img.fill_rect(Rect2i(0, y, W, 1), top.lerp(bot, u))
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
		if dark:
			c = _dim(c, dark_tint)
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
	# 5 Structures + 바닥 장식 (시장 뒷골목)
	var st := $Structures as Node2D
	for ch in st.get_children():
		ch.queue_free()
	if alley:
		dressing = AlleyDressing.new()
		var simg := dressing.build(room, room.lamp_xs, _seed, base_y, img)
		if room.has_method("dress_spans"):          # 이어진 맵: 옥상 · 비상계단 · 노점 꾸밈 (RoofDressing)
			roof = RoofDressing.new()
			roof.build(room, simg, img, _seed)
		var ss := Sprite2D.new()
		ss.centered = false
		ss.texture = ImageTexture.create_from_image(simg)
		st.add_child(ss)
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
	# 세로 시차: 화면보다 높은 맵에서 위로 올라가면 (옥상) 먼 건물이 아래로 내려감 — 높이감
	var dy := 0.0
	if main != null and main.get("camera") != null:
		var cam: Camera2D = main.camera
		if cam.limit_bottom - cam.limit_top > Config.view.h + 32:     # 화면보다 확실히 높은 맵만 (1장 방 · 보스방은 0)
			var ref: float = float(cam.limit_bottom) - Config.view.h / 2.0
			var cy: float = -get_viewport().get_canvas_transform().origin.y + Config.view.h / 2.0
			dy = maxf(0.0, ref - cy)
	for L in layers:
		var v := float(Palette.PARALLAX_V.get(float(L.factor), 0.0))
		_parallax.draw_texture(L.tex, Vector2(-roundf(cam_x * float(L.factor)), roundf(dy * v)))
	# 철견의 탑 꼭대기 경고등 (분홍, 천천히 깜빡)
	if not tower.is_empty():
		var tx := float(tower.ix) - roundf(cam_x * Palette.PARALLAX_FAR)
		var ty := float(tower.top) + roundf(dy * float(Palette.PARALLAX_V.get(Palette.PARALLAX_FAR, 0.0)))
		var a := 0.35 + 0.65 * maxf(0.0, sin(Time.get_ticks_msec() / 1000.0 * 2.2))
		_parallax.draw_rect(Rect2(tx - 3, ty - 2, 7, 5), Color(Palette.NEON_PINK, 0.12 * a))
		_parallax.draw_rect(Rect2(tx - 1, ty - 1, 3, 2), Color(Palette.NEON_PINK, a))

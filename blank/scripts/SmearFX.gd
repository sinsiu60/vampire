class_name SmearFX
## 스미어 프레임 (산나비 식 돌진 왜곡) 그리기 도우미 — 플레이어 베기 · 반격 돌진 · 피날레 일섬이 같이 씀.
##  · 몸 늘이기: 몸 중심을 축으로 진행 방향으로 stretch 배, 옆으로 squash 배 (조금 뒤로 밀어 뒤쪽으로 길게)
##  · 색 갈라짐: 분홍 · 하늘 사본을 진행 방향 옆으로 어긋나게 깔고 그 위에 흰 몸
##  · 가시: 몸 뒤로 방사형으로 뻗는 날카로운 하늘색 삼각형 (흰 심)
##  · 뜨거운 궤적: 출발점(꼬리, 가늘게) → 몸(머리, 두껍게) 빨강 → 주황 → 노랑 → 흰

const COL_SPIKE := Color("#5fd8ff")
const COL_CHROMA_A := Color("#ff6fcf")
const COL_CHROMA_B := Color("#5fd8ff")
const TRAIL := [[Color("#ff2b3d"), 1.0], [Color("#ff9a1f"), 0.72], [Color("#ffd23a"), 0.46], [Color.WHITE, 0.2]]   # 바깥 → 심


## 몸 중심 c 를 축으로 dir 방향 stretch 배 · 옆 squash 배, 그리고 뒤로 back px (같은 좌표계)
static func stretch_xf(c: Vector2, dir: Vector2, stretch: float, squash: float, back: float) -> Transform2D:
	var a := dir.angle()
	var t := Transform2D(0.0, c - dir * back) * Transform2D(a, Vector2.ZERO)
	t = t * Transform2D(0.0, Vector2(stretch, squash), 0.0, Vector2.ZERO) * Transform2D(-a, Vector2.ZERO) * Transform2D(0.0, -c)
	return t


## 몸 조각 [{ xf, shapes }] (base 좌표로 옮기는 변환) 을 늘인 모습 + 색 갈라짐으로
static func draw_body(ci: CanvasItem, parts: Array, base: Transform2D, sxf: Transform2D, dir: Vector2, chroma: float, alpha := 1.0) -> void:
	var n := dir.orthogonal()
	var layers := [[n * chroma, COL_CHROMA_A, 0.7], [-n * chroma, COL_CHROMA_B, 0.7], [Vector2.ZERO, Color.WHITE, 1.0]]
	for L in layers:
		var off: Vector2 = L[0]
		var col := Color(L[1], float(L[2]) * alpha)
		for part in parts:
			ci.draw_set_transform_matrix(base * Transform2D(0.0, off) * sxf * part.xf)
			for sh in part.shapes:
				if sh[0] == "rect":
					ci.draw_rect(sh[1], col)
				else:
					ci.draw_colored_polygon(sh[1], col)
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)


## 가시 만들기: 진행 반대쪽 ± spread 로 n 개 { a, len, w, off }
static func make_spikes(dir: Vector2, n: int, len_range: Vector2, spread: float) -> Array:
	var out := []
	var back := (-dir).angle()
	for i in n:
		out.append({ "a": back + randf_range(-1.0, 1.0) * spread, "len": randf_range(len_range.x, len_range.y),
			"w": randf_range(1.5, 3.0), "off": randf_range(2.0, 6.0) })
	return out


## 가시 그리기 (c 는 그릴 좌표계의 몸 중심). k = 사라지는 정도 0 → 1
static func draw_spikes(ci: CanvasItem, c: Vector2, spikes: Array, k: float) -> void:
	for s in spikes:
		var d := Vector2.from_angle(float(s.a))
		var n := d.orthogonal()
		var p0 := c + d * float(s.off)
		var tip := p0 + d * float(s.len) * (1.0 - 0.35 * k)
		var w: float = s.w
		ci.draw_colored_polygon(PackedVector2Array([p0 + n * w, tip, p0 - n * w]), Color(COL_SPIKE, 0.9 * (1.0 - k)))
		ci.draw_colored_polygon(PackedVector2Array([p0 + n * w * 0.35, p0 + d * float(s.len) * 0.55, p0 - n * w * 0.35]), Color(1, 1, 1, 0.9 * (1.0 - k)))


## 뜨거운 궤적: tail(가늘게) → head(두껍게), 겹마다 색. k = 사라지는 정도
static func draw_trail(ci: CanvasItem, tail: Vector2, head: Vector2, width: float, k: float) -> void:
	var v := head - tail
	if v.length() < 2.0 or width <= 0.0:
		return
	var d := v.normalized()
	var n := d.orthogonal()
	for L in TRAIL:
		var w: float = width * float(L[1]) * (1.0 - 0.5 * k)
		var col := Color(L[0], (1.0 - k) * (0.85 if L[0] != Color.WHITE else 1.0))
		var mid := tail.lerp(head, 0.7)
		ci.draw_colored_polygon(PackedVector2Array([tail, mid + n * w * 0.6, head + n * w * 0.5, head + d * w * 0.8, head - n * w * 0.5, mid - n * w * 0.6]), col)

class_name DrawUtil
## 여러 노드가 같이 쓰는 그리기 함수 (CanvasItem._draw 안에서 호출)


## 초승달/반달: center 중심, 반지름 r, a0 에서 span(라디안)만큼. u0~u1 구간만 그림 (휘두르는 중간 모습).
## 가운데가 thick_max 로 가장 두껍고 양끝이 가늘다. glow > 0 이면 바깥에 옅은 번짐을 한 겹 더.
static func crescent(ci: CanvasItem, center: Vector2, r: float, a0: float, span: float,
		u0: float, u1: float, thick_max: float, color: Color, glow := 0.0) -> void:
	if u1 - u0 < 0.01 or thick_max <= 0.0:
		return
	if glow > 0.0:
		var halo := color
		halo.a *= 0.25
		_crescent_poly(ci, center, r + glow * 0.4, a0, span, u0, u1, thick_max + glow * 0.8, halo)
	_crescent_poly(ci, center, r, a0, span, u0, u1, thick_max, color)


static func _crescent_poly(ci: CanvasItem, center: Vector2, r: float, a0: float, span: float,
		u0: float, u1: float, thick_max: float, color: Color) -> void:
	const N := 18
	var outer := PackedVector2Array()
	var inner := PackedVector2Array()
	for i in N + 1:
		var u := lerpf(u0, u1, float(i) / N)
		var a := a0 + span * u
		var th := pow(sin(PI * u), 0.8) * thick_max
		var d := Vector2(cos(a), sin(a))
		outer.append(center + d * r)
		inner.append(center + d * (r - th))
	inner.reverse()
	outer.append_array(inner)
	ci.draw_colored_polygon(outer, color)

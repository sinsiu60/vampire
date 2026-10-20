extends Node2D
class_name Rain
## 1장 공통 비 (scenes/Rain.tscn). 코드로 그리는 1px 빗줄기 — 길이 5 ~ 11px, 오른쪽 아래로 약 20°, 색 Palette.RAIN (투명도 70 ~ 150).
## 강도 프리셋 Palette.RAIN_PRESETS: normal 420 · heavy 900 · dark 700 (투명도 1/3) — 화면 하나 기준 개수.
## Background.tscn 에 RainBack (인물 뒤, 75%) · RainFront (front = true, 인물 앞, 25% · 투명도 낮게) 두 개.
## 빗방울은 월드 좌표로 떨어지고 화면 밖으로 나가면 반대편으로 돌아옴. 지형 · 발판 윗면에 닿으면 1 ~ 3px 물 튀김.
## 월드 시간으로 움직임 (히트스톱 · 피날레 정지면 멈춤). speed_mul = 피날레 빗방울 구간처럼 느리게.

@export var front := false
@export_enum("normal", "heavy", "dark") var preset := "normal":
	set(v):
		preset = v
		queue_redraw()

var speed_mul := 1.0             ## 낙하 속도 배율 (BossArena.rain_mul)
var room: Node = null            ## 물 튀김 판정 (Room.solid_at) — 없으면 튀김 없음
var splash_count := 0            ## 지금까지 튀긴 수 (테스트)

var _drops: Array = []           # { pos (전역), len, a, sp }
var _splashes: Array = []        # { pos, vel, t, life }
var _dir := Vector2.DOWN
var _view := Rect2()


func _ready() -> void:
	var a := deg_to_rad(Palette.RAIN_ANGLE)
	_dir = Vector2(sin(a), cos(a))
	var most := 0
	for k in Palette.RAIN_PRESETS:
		most = maxi(most, int(Palette.RAIN_PRESETS[k].count))
	_view = _view_rect()
	for i in ceili(most * _share()):
		var d := {}
		_respawn(d, true)
		_drops.append(d)


func _share() -> float:
	return Palette.RAIN_FRONT_SHARE if front else 1.0 - Palette.RAIN_FRONT_SHARE


## 지금 프리셋에서 그릴 빗방울 수
func count() -> int:
	return mini(_drops.size(), roundi(float(Palette.RAIN_PRESETS[preset].count) * _share()))


func _view_rect() -> Rect2:
	var vp := get_viewport()
	if vp == null:
		return Rect2(0, 0, Config.view.w, Config.view.h)
	return vp.get_canvas_transform().affine_inverse() * Rect2(Vector2.ZERO, Vector2(Config.view.w, Config.view.h))


## 새 빗방울: anywhere = 화면 어디든 (처음), 아니면 화면 위쪽 바깥에서
func _respawn(d: Dictionary, anywhere := false) -> void:
	var v := _view.grow(24.0)
	var x := randf_range(v.position.x - v.size.y * _dir.x / _dir.y, v.end.x)   # 기울어 들어오는 만큼 왼쪽에서도
	var y := randf_range(v.position.y, v.end.y) if anywhere else v.position.y - randf_range(0.0, 40.0)
	d.pos = Vector2(x, y)
	d.len = randf_range(Palette.RAIN_LEN.x, Palette.RAIN_LEN.y)
	d.a = randf_range(Palette.RAIN_ALPHA.x, Palette.RAIN_ALPHA.y) / 255.0
	d.sp = randf_range(Palette.RAIN_SPEED.x, Palette.RAIN_SPEED.y)


func _physics_process(delta: float) -> void:
	_view = _view_rect()
	if delta > 0.0:
		var P: Dictionary = Palette.RAIN_PRESETS[preset]
		var mul: float = float(P.speed) * speed_mul
		var v := _view.grow(32.0)
		for i in count():
			var d: Dictionary = _drops[i]
			d.pos += _dir * float(d.sp) * mul * delta
			var p: Vector2 = d.pos
			# 지형 · 발판 윗면에 닿음 → 물 튀김
			if room != null and p.y > _view.position.y and room.solid_at(p):
				_splash(Vector2(p.x, floorf(p.y / Config.room.tile) * Config.room.tile))
				_respawn(d)
				continue
			if p.y > v.end.y:
				_respawn(d)
			elif p.x > v.end.x + 16.0:
				d.pos.x -= v.size.x + 16.0
			elif p.x < v.position.x - 64.0:
				d.pos.x += v.size.x + 64.0
		var keep := 0                         # 끝난 물 튀김은 제자리에서 빼냄 (매 프레임 새 배열 안 만듦)
		for s in _splashes:
			s.t += delta
			if s.t >= s.life:
				continue
			s.pos += Vector2(s.vel) * delta
			s.vel.y += 420.0 * delta
			_splashes[keep] = s
			keep += 1
		_splashes.resize(keep)
	queue_redraw()


func _splash(at: Vector2) -> void:
	splash_count += 1
	if _splashes.size() > 240:
		return
	var n := randi_range(Palette.SPLASH_PX.x, Palette.SPLASH_PX.y)
	for i in n:
		_splashes.append({ "pos": at + Vector2(randf_range(-1.0, 1.0), -1.0),
			"vel": Vector2(randf_range(-30.0, 30.0), -randf_range(25.0, 70.0)), "t": 0.0,
			"life": randf_range(Palette.SPLASH_LIFE.x, Palette.SPLASH_LIFE.y) })


var _pts := PackedVector2Array()
var _cols := PackedColorArray()


func _draw() -> void:
	var P: Dictionary = Palette.RAIN_PRESETS[preset]
	var amul: float = float(P.alpha) * (Palette.RAIN_FRONT_ALPHA if front else 1.0)
	var n := count()
	if _pts.size() != n * 2:
		_pts.resize(n * 2)
		_cols.resize(n)
	for i in n:
		var d: Dictionary = _drops[i]
		_pts[i * 2] = (Vector2(d.pos) - _dir * float(d.len)).round()
		_pts[i * 2 + 1] = Vector2(d.pos).round()
		_cols[i] = Color(Palette.RAIN, float(d.a) * amul)
	if n > 0:                 # 빗줄기를 한 번에 (선마다 따로 그리면 폭우 900줄 = 900번 그리기)
		draw_multiline_colors(_pts, _cols, -1.0, false)   # 1px 선 (두께 -1 = 하드웨어 1px)
	for s in _splashes:
		var k: float = 1.0 - float(s.t) / float(s.life)
		draw_rect(Rect2(Vector2(s.pos).round(), Vector2.ONE), Color(Palette.SPLASH, 0.8 * k * amul))

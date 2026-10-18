extends CharacterBody2D
class_name Enemy
## 적 공통: 중력·지형 충돌, 발판 끝에서 멈추기, 몸통 사각형, 실루엣(림 라이트) 그리기 도우미.
## 노드 원점 = 발 중앙. cfg 는 하위 클래스가 Config.melee / Config.gunner 로 정함.

signal died(enemy: Enemy)

## 처음 만나는 적 소개 중 (Main 이 켜고 끔) — 카메라가 다른 곳을 보는 동안 적 · 수류탄은 멈춰 기다림
static var intro_hold := false

var cfg: Dictionary
var facing := -1                 # 처음엔 왼쪽(플레이어 시작 쪽)을 봄
var state := "idle"
var t := 0.0                     # 지금 상태에 들어온 뒤 경과 시간 (월드 시간)
var dead := false

var _name_tag := {}              # 머리 위 이름 { text, at (실제 시각), dur } — 처음 만나는 적 소개
var _blocked_slash := -INF       # 막아낸 베기 (Player.last_slash_t) — 한 번 베기에 한 번만 막음 연출

var _rec = null                  # 실루엣 기록 중이면 Array (capture_silhouette)
var _xf := Transform2D.IDENTITY  # 지금 그리기 변환 (기록용)


func _setup(c: Dictionary) -> void:
	cfg = c
	var shape := RectangleShape2D.new()
	shape.size = Vector2(c.w, c.h)
	$Collision.shape = shape
	$Collision.position = Vector2(0, -c.h / 2.0)
	collision_layer = Config.layers.enemy
	collision_mask = Config.layers.terrain | Config.layers.platform   # 플레이어와는 몸으로 부딪히지 않음
	floor_snap_length = 2.0
	add_to_group("enemies")


func set_state(s: String) -> void:
	state = s
	t = 0.0


## 몸통 사각형 (전역 좌표)
func body_rect() -> Rect2:
	return Rect2(global_position - Vector2(cfg.w / 2.0, cfg.h), Vector2(cfg.w, cfg.h))


func center() -> Vector2:
	return global_position + Vector2(0, -cfg.h / 2.0)


## 진행 방향 발밑에 지형이 있는가 (발판 끝에서 멈추기)
func can_step(dir: int) -> bool:
	if not Config.enemy.edge_stop or not is_on_floor() or dir == 0:
		return true
	var q := PhysicsPointQueryParameters2D.new()
	q.position = global_position + Vector2(dir * (cfg.w / 2.0 + 1.0), 2.0)
	q.collision_mask = Config.layers.terrain | Config.layers.platform
	return not get_world_2d().direct_space_state.intersect_point(q, 1).is_empty()


func walk(dir: int, speed: float, accel: float, delta: float) -> void:
	var target := dir * speed
	if dir != 0 and not can_step(dir):
		target = 0.0
	velocity.x = move_toward(velocity.x, target, accel * delta)


func apply_physics(delta: float) -> void:
	velocity.y = minf(velocity.y + Config.enemy.gravity * delta, Config.enemy.max_fall)
	move_and_slide()


## 사망 기록 · 소개에 쓰는 이름
func label() -> String:
	return "적"


## 처음 만나는 적 소개 키 (Config.intro.NAMES / RADIO) — "" = 소개 없음
func intro_key() -> String:
	return ""


## 소개 무전 키 (data/radio_lines.json) — 방 씬 export intro_radio_key 가 있으면 그것, 없으면 Config.intro.RADIO_KEYS
func intro_radio() -> String:
	var v = get("intro_radio_key")
	if v != null and String(v) != "":
		return String(v)
	return String(Config.intro.RADIO_KEYS.get(intro_key(), ""))


## 머리 위 이름 dur 초 (실제 시간)
func show_name(text: String, dur: float) -> void:
	_name_tag = { "text": text, "at": TimeManager.real_time, "dur": dur }
	queue_redraw()


## 지금 베면 무기로 막아내는가 (돌격병 멈칫 · 돌진) — 막히면 헛스윙 (처치 안 됨)
func guarding() -> bool:
	return false


## 이름표가 떠 있는 동안 매 프레임 다시 그림 (소개 중엔 적 AI · 물리가 멈춰 있어도)
func _process(_delta: float) -> void:
	if not _name_tag.is_empty():
		queue_redraw()


## 막아냄 (Main): 한 번 베기에 한 번만 true
func take_block(slash_t: float) -> bool:
	if slash_t == _blocked_slash:
		return false
	_blocked_slash = slash_t
	return true


## 공격 판정 사각형 (전역). 공격 중이 아니면 빈 Rect2
func attack_box() -> Rect2:
	return Rect2()


## 처치됨 (킬 연출은 Main._kill_enemy 가 이 적의 실루엣으로 만든 두 조각으로)
func die(_angle: float) -> void:
	if dead:
		return
	dead = true
	died.emit(self)
	queue_free()


# ---------------------------------------------------------------- 그리기 도우미
## 하위 클래스가 지금 자세를 그림. 조준선·공격 궤적처럼 실루엣이 아닌 것은 `if not capturing():` 안에서
func _draw_pose() -> void:
	pass


func _draw() -> void:
	_xf = Transform2D.IDENTITY
	_draw_pose()
	if not _name_tag.is_empty():
		var u: float = (TimeManager.real_time - float(_name_tag.at)) / float(_name_tag.dur)
		if u >= 1.0:
			_name_tag = {}
		else:
			draw_set_transform_matrix(Transform2D.IDENTITY)
			var a := clampf(minf(u / 0.1, (1.0 - u) / 0.2), 0.0, 1.0)
			Fonts.text(self, String(_name_tag.text), Vector2(0, -cfg.h - 10 - 3.0 * (1.0 - a)), 10, Color(Config.colors.ui, a), "center", false, true)


func capturing() -> bool:
	return _rec != null


## 그리기 변환 (draw_set_transform_matrix 대신 — 기록 중엔 저장만)
func set_xf(m: Transform2D) -> void:
	_xf = m
	if _rec == null:
		draw_set_transform_matrix(m)


## 지금 자세의 실루엣: [{ xf, shapes, body, rim }] (노드 로컬 좌표). 두 조각 만들 때 사용
func capture_silhouette() -> Array:
	_rec = []
	_xf = Transform2D.IDENTITY
	_draw_pose()
	var out: Array = _rec
	_rec = null
	return out


## 모양 목록 [[ "rect", Rect2 ] | [ "poly", PackedVector2Array ]] 을
## 림 색으로 상하좌우 1px 밀어 그린 뒤 본체 색으로 덮음 → 어두운 실루엣 + 1px 테두리
func draw_rimmed(shapes: Array, body: Color, rim: Color) -> void:
	if _rec != null:
		_rec.append({ "xf": _xf, "shapes": shapes, "body": body, "rim": rim })
		return
	for off in [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]:
		_draw_shapes(shapes, rim, off)
	_draw_shapes(shapes, body, Vector2.ZERO)


func _draw_shapes(shapes: Array, color: Color, off: Vector2) -> void:
	for s in shapes:
		if s[0] == "rect":
			draw_rect(Rect2(s[1].position + off, s[1].size), color)
		else:
			var pts: PackedVector2Array = s[1].duplicate()
			for i in pts.size():
				pts[i] += off
			draw_colored_polygon(pts, color)

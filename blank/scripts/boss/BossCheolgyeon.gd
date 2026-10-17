extends Enemy
class_name BossCheolgyeon
## 1장 보스 "철견" — 전투 로직 (겉모습은 Body = CheolgyeonBody, 수치는 CheolgyeonConfig).
## 걷지 않는다: 대시 · 슬라이드 · 점프로만 움직임. 패턴 사이 이동은 MOVE_MAX(0.4초) 안에 끝남.
##
## [1단계] 몸체 + 이동 + 반격 시스템
##  - 이동 데모 루프 (패턴은 2단계): 다가가는 대시 → 플레이어를 지나치는 슬라이드 → 발판으로 점프 → (내려오는 점프) → 물러나는 대시
##  - 휘청 (stagger): STAGGER_TIME 동안 흰 테두리 깜빡임 · stagger.wav — 이때 베면 반격 베기 (Main._counter_hit)
##  - 휘청이 아닐 때 베면 권총으로 막음 (Main._boss_block) · 반사탄에 맞으면 휘청
##  - F8 즉시 휘청 · F9 포즈 뷰어 (Debug)
## 노드 원점 = 발 중앙. 방의 "BossPerches" Marker2D = 점프로 올라갈 발판 자리.

const C := preload("res://scripts/boss/CheolgyeonConfig.gd")

var hp := C.HP
var viewer := false              ## F9 포즈 뷰어 — 로직 멈춤, 숫자 키로 포즈
var body: CheolgyeonBody

var _wait := 0.0                 # wait 상태에서 기다릴 시간
var _move := {}                  # 지금 이동 { dir, target_x, max_t } / 점프 { from, to, time }
var _demo_i := 0
var _ghost_t := 0.0
var _dust_t := 0.0
var _kb_v := 0.0                 # 넉백 처음 속도
var _last_block := -INF          # 같은 베기에 한 번만 막음
var _perches: Array = []
var _floor_y := 240.0


func _ready() -> void:
	_setup({ "w": C.W, "h": C.H })
	add_to_group("boss")
	body = $Body
	hp = C.HP
	var room := get_parent().get_parent()
	var pn := room.get_node_or_null("BossPerches")
	if pn != null:
		for m in pn.get_children():
			_perches.append(m.global_position)
	var cp: Dictionary = GameState.boss_checkpoint
	if cp.get("key", "") == GameState.room_key() and cp.get("dead", false):
		dead = true
		remove_from_group("enemies")
		remove_from_group("boss")
		queue_free()
		return
	set_state("intro")
	body.pose("idle")
	_find_floor.call_deferred()


## 방 바닥 높이 (일방향 발판 말고 진짜 바닥): 철견 x 에서 아래로 레이
func _find_floor() -> void:
	var q := PhysicsRayQueryParameters2D.create(Vector2(global_position.x, 4.0), Vector2(global_position.x, 2000.0), Config.layers.terrain)
	var hit := get_world_2d().direct_space_state.intersect_ray(q)
	if not hit.is_empty():
		_floor_y = hit.position.y


func _main() -> Node:
	return get_tree().get_first_node_in_group("game")


func _player() -> Player:
	return get_tree().get_first_node_in_group("player")


func center() -> Vector2:
	return global_position + Vector2(0, -C.H / 2.0)


## 몸통 판정: 웅크린 포즈면 낮게
func body_rect() -> Rect2:
	var h: float = C.H
	if state in ["slide", "land", "dash_prep", "jump_prep"]:
		h = C.H * 0.62
	return Rect2(global_position - Vector2(C.W / 2.0, h), Vector2(C.W, h))


## 두 조각 · 파편: 몸체 부위 실루엣
func capture_silhouette() -> Array:
	return body.silhouette(global_transform)


func can_counter() -> bool:
	return state == "stagger" and not dead and not viewer


func is_staggered() -> bool:
	return state == "stagger"


## 막을 때 칼이 부딪히는 자리 = 앞 권총
func block_point() -> Vector2:
	return body.muzzle(0)


## 포즈 이름 목록 (F9 포즈 뷰어 · HUD)
func pose_list() -> Array:
	return C.POSES


# ---------------------------------------------------------------- 외부에서 부름 (Main · Debug)
## 휘청: 반격 기회 STAGGER_TIME 초
func stagger() -> void:
	if dead:
		return
	_move = {}
	set_state("stagger")
	velocity.x *= 0.3
	_face_player()
	body.snap("stagger")
	Audio.sfx("stagger")


## 반격 베기 명중 → 체력 -1, 30px 넉백. 반환 = 남은 체력
func on_counter_hit(angle: float) -> int:
	hp -= 1
	body.set_flash(false)
	set_state("knockback")
	var dir := signf(cos(angle))
	if dir == 0.0:
		dir = -float(facing)
	_kb_v = dir * 2.0 * C.COUNTER_KNOCKBACK / C.KNOCKBACK_TIME   # 등감속으로 정확히 30px
	velocity.x = _kb_v
	return hp


## 휘청 아닐 때 베임 → 권총으로 막음 (같은 베기는 한 번만). 공중에선 자세를 바꾸지 않음
func on_blocked(p: Player) -> bool:
	if p.last_slash_t == _last_block:
		return false
	_last_block = p.last_slash_t
	if state == "jump":
		return true
	_move = {}
	set_state("block")
	velocity.x = 0.0
	_face_player()
	body.snap("block")
	return true


## F8: 즉시 휘청
func debug_stagger() -> void:
	if viewer:
		set_viewer(false)
	stagger()


## F9: 포즈 뷰어 켜기/끄기
func set_viewer(on: bool) -> void:
	viewer = on
	_move = {}
	body.set_flash(false)
	velocity = Vector2.ZERO
	if on:
		set_state("viewer")
		body.pose("idle")
	else:
		_go_wait(C.MOVE_GAP)


## 포즈 뷰어: 키포즈 전환으로 그 포즈 (예고 정지 → 1프레임 전환 → 여운 정지)
func viewer_pose(i: int) -> void:
	if viewer and i >= 0 and i < C.POSES.size():
		body.snap(C.POSES[i])


# ---------------------------------------------------------------- 갱신
func _physics_process(delta: float) -> void:
	if dead:
		return
	var p := _player()
	if p == null or TimeManager.frozen:
		return
	t += delta
	match state:
		"viewer":
			velocity.x = 0.0
		"intro":
			_face_player()
			velocity.x = 0.0
			if t >= C.FIRST_DELAY:
				_next_move()
		"wait":
			_face_player()
			velocity.x = move_toward(velocity.x, 0.0, 2400.0 * delta)
			if t >= _wait and not p.dead:
				_next_move()
		"dash_prep":
			velocity.x = 0.0
			if t >= C.DASH_PREP:
				set_state("dash")
				body.snap("dash")
				Audio.sfx("dash_whoosh")
				_ghost_t = 0.0
		"dash":
			velocity.x = _move.dir * C.DASH_SPEED
			_ghost_t -= delta
			if _ghost_t <= 0.0:
				_ghost_t = C.DASH_GHOST_EVERY
				body.ghost()
			if _arrived() or is_on_wall():
				set_state("dash_stop")
				body.pose("idle", C.BLEND_MOVE)
		"dash_stop":
			velocity.x = move_toward(velocity.x, 0.0, C.DASH_SPEED / C.DASH_STOP * delta)
			if t >= C.DASH_STOP:
				_go_wait(C.MOVE_GAP)
		"slide":
			velocity.x = _move.dir * C.SLIDE_SPEED
			_dust_t -= delta
			if _dust_t <= 0.0:
				_dust_t = C.SLIDE_DUST_EVERY
				_dust(global_position + Vector2(-_move.dir * 6.0, -1.0), 2, -_move.dir)
			if _arrived() or is_on_wall():
				body.pose("idle", C.BLEND_MOVE * 2.0)
				_go_wait(C.MOVE_GAP)
		"jump_prep":
			velocity.x = 0.0
			if t >= C.JUMP_PREP:
				set_state("jump")
				body.snap("jump")
				Audio.sfx("jump")
				_dust(global_position, 6, 0)
		"jump":
			var u := clampf(t / float(_move.time), 0.0, 1.0)
			var from: Vector2 = _move.from
			var to: Vector2 = _move.to
			var h: float = C.JUMP_ARC + maxf(0.0, from.y - to.y)
			global_position = from.lerp(to, u) + Vector2(0, -h * 4.0 * u * (1.0 - u))
			velocity = Vector2.ZERO
			if u >= 1.0:
				set_state("land")
				body.snap("land")
				_dust(global_position, 8, 0)
			return
		"land":
			velocity.x = 0.0
			if t >= C.LAND_TIME:
				body.pose("idle", C.BLEND_MOVE * 2.0)
				_go_wait(C.MOVE_GAP)
		"stagger":
			velocity.x = move_toward(velocity.x, 0.0, 900.0 * delta)
			body.set_flash(fmod(t, C.STAGGER_BLINK * 2.0) < C.STAGGER_BLINK)
			if t >= C.STAGGER_TIME:
				body.set_flash(false)
				body.pose("idle", 0.08)
				_go_wait(C.MOVE_GAP)        # 놓치면 그냥 다음 이동 (2단계부터는 다음 패턴)
		"knockback":
			velocity.x = move_toward(velocity.x, 0.0, absf(_kb_v) / C.KNOCKBACK_TIME * delta)
			if t >= C.KNOCKBACK_TIME:
				velocity.x = 0.0
				body.pose("idle", C.BLEND_MOVE)
				_next_move()                # 넉백이 끝나면 바로 다음 이동
		"block":
			velocity.x = 0.0
			if t >= C.BLOCK_TIME:
				body.pose("idle", C.BLEND_MOVE)
				_go_wait(0.1)
	apply_physics(delta)


func _face_player() -> void:
	var p := _player()
	if p == null:
		return
	var dx := p.center().x - center().x
	if absf(dx) > 2.0:
		facing = 1 if dx > 0.0 else -1
		body.facing = facing


func _set_facing(dir: int) -> void:
	facing = dir
	body.facing = dir


func _go_wait(sec: float) -> void:
	set_state("wait")
	_wait = sec


## 목표 x 를 지났거나 최대 시간
func _arrived() -> bool:
	return t >= float(_move.max_t) or (global_position.x - float(_move.target_x)) * float(_move.dir) >= 0.0


func _on_floor() -> bool:
	return global_position.y >= _floor_y - 3.0


func _clamp_x(x: float) -> float:
	var main := _main()
	var w: float = main.room.size_px().x if main != null else 512.0
	var t8: float = Config.room.tile
	return clampf(x, t8 + C.EDGE, w - t8 - C.EDGE)


# ---------------------------------------------------------------- 이동 (1단계 데모 루프)
func _next_move() -> void:
	var p := _player()
	if p == null:
		return
	if not _on_floor():
		# 발판 위: 플레이어 쪽 바닥으로 뛰어내림 (내 쪽에 머묾)
		var side := signf(global_position.x - p.global_position.x)
		if side == 0.0:
			side = 1.0
		_jump_to(Vector2(_clamp_x(p.global_position.x + side * 70.0), _floor_y))
		return
	var dir := 1 if p.global_position.x > global_position.x else -1
	var dist := absf(p.global_position.x - global_position.x)
	var back_room := absf(_clamp_x(global_position.x - dir * C.DEMO_BACK) - global_position.x)
	var step := _demo_i % 4
	_demo_i += 1
	match step:
		0:
			# 멀면 다가가는 대시, 가까우면 물러나는 대시 (뒤가 막혔으면 지나치는 슬라이드)
			if dist > C.DEMO_NEAR + 36.0:
				_dash_to(p.global_position.x - dir * C.DEMO_NEAR)
			elif back_room > 40.0:
				_dash_to(global_position.x - dir * C.DEMO_BACK)
			else:
				_slide_to(p.global_position.x + dir * C.DEMO_PASS)
		1:
			_slide_to(p.global_position.x + dir * C.DEMO_PASS)
		2:
			if not _jump_to_perch():
				_dash_to(p.global_position.x - dir * C.DEMO_NEAR)
		3:
			if back_room > 40.0:
				_dash_to(global_position.x - dir * C.DEMO_BACK)
			else:
				_dash_to(p.global_position.x + dir * C.DEMO_PASS)


func _dash_to(x: float) -> void:
	x = _clamp_x(x)
	var dir := 1 if x > global_position.x else -1
	_move = { "dir": dir, "target_x": x, "max_t": minf(C.MOVE_MAX - 1.0 / Config.fps, absf(x - global_position.x) / C.DASH_SPEED + 0.02) }
	_set_facing(dir)
	set_state("dash_prep")
	body.snap("crouch")
	_dust(global_position, 4, -dir)


func _slide_to(x: float) -> void:
	x = _clamp_x(x)
	var dir := 1 if x > global_position.x else -1
	_move = { "dir": dir, "target_x": x, "max_t": minf(C.MOVE_MAX - 1.0 / Config.fps, absf(x - global_position.x) / C.SLIDE_SPEED + 0.02) }
	_set_facing(dir)
	set_state("slide")
	body.snap("slide")
	Audio.sfx("slide")
	_dust_t = 0.0


func _jump_to(to: Vector2) -> void:
	_move = { "from": global_position, "to": to, "time": C.JUMP_TIME }
	_set_facing(1 if to.x > global_position.x else -1)
	set_state("jump_prep")
	body.snap("crouch")


## 지금 자리에서 먼 발판 하나로
func _jump_to_perch() -> bool:
	var options := []
	for q in _perches:
		if q.y < _floor_y - 3.0 and q.distance_to(global_position) > 40.0:
			options.append(q)
	if options.is_empty():
		return false
	_jump_to(options[randi() % options.size()])
	return true


## 발밑 먼지 (dir = 날아가는 쪽 · 0 = 양옆)
func _dust(at: Vector2, n: int, dir: int) -> void:
	var main := _main()
	if main == null:
		return
	for i in n:
		var a := PI if (dir < 0 or (dir == 0 and i % 2 == 0)) else 0.0
		a += randf_range(-0.5, 0.15) * (1.0 if a == 0.0 else -1.0)
		var v := randf_range(40.0, 110.0)
		main.effects.spawn(at + Vector2(randf_range(-4, 4), 0), Vector2(cos(a) * v, sin(a) * v - 25.0), randf_range(0.18, 0.32),
			C.COL_DUST[i % C.COL_DUST.size()], { "size": 2.0, "grav": 120.0 })

extends Enemy
class_name BossCheolgyeon
## 1장 보스 "철견" — 전투 로직 (겉모습은 Body = CheolgyeonBody, 수치는 CheolgyeonConfig).
## 걷지 않는다: 대시 · 슬라이드 · 점프로만 움직임. 예고는 짧고 선명하게 (포즈 · 섬광 · 소리).
##
## 핵심 고리: 콤보 마지막 공격을 패링 → 즉시 휘청 (STAGGER_TIME) → 그동안 베면 반격 베기 (Main._counter_hit) → 체력 -1
##  - 휘청이 아닐 때 베면 권총으로 막음 (Main._boss_block) — 패턴 중이면 패턴은 그대로 계속
##  - 반사탄에 맞으면 휘청
##
## [2단계] 패턴 3종 + 페이즈 1 루프 (순서 고정 ① → ② → ④, 사이 공백 0.4초 이내)
##  ① 슬라이드 사격  0.2초 웅크림 + gun_cock → 플레이어를 지나쳐 미끄러지며 3연발 (0.3초 간격). 1·2번째 = 일반 패링, 3번째 패링 = 휘청
##  ② 돌진 건카타    0.15초 웅크림 → 플레이어 앞 30px 까지 대시 → 3연타 (0.25초 · 0.5초 멈칫 지연 공격). 근접 패링, 3타 패링 = 튕겨나며 휘청
##  ④ 속사          duel 포즈 정적 0.4~0.8초 → 움찔 0.1초 → 0.3초 만에 뽑아 쏨 (원도 0.3초). 패링 = 반사탄이 철견에 → 휘청
## 디버그: F8 즉시 휘청 · F9 포즈 뷰어 · F10 패턴 강제 (① → ② → ④) · 디버그 모드에서 패턴 타이밍 ms (HUD)
## 노드 원점 = 발 중앙. 방의 "BossPerches" Marker2D = 점프로 올라갈 발판 자리.

const C := preload("res://scripts/boss/CheolgyeonConfig.gd")

var hp := C.HP
var viewer := false              ## F9 포즈 뷰어 — 로직 멈춤, 숫자 키로 포즈
var body: CheolgyeonBody
var pattern := 0                 ## 지금 패턴 번호 (0 = 패턴 사이)
var bullets: Array = []          ## 사격 { gun, fire_t, aim, target, aim_time, role(normal|stagger), fired, laser_end }
var forced := 0                  ## F10: 다음에 할 패턴
var dbg := {}                    ## 패턴 타이밍 (HUD 디버그) { name, first, max_gap, since_prev, gap_ms }

var _wait := 0.0
var _move := {}                  # 이동 { dir, target_x, max_t } / 점프 { from, to, time }
var _after_move := 0             # 자리 잡는 대시가 끝나면 시작할 패턴
var _order_i := 0
var _ghost_t := 0.0
var _dust_t := 0.0
var _kb_v := 0.0
var _last_block := -INF
var _perches: Array = []
var _floor_y := 240.0
var _whip := {}                  # { times: [T1, T2, T3], parried: [..], swung: [..], wound: [..] }
var _trail_t := -1.0             # 건카타 반달 궤적 남은 시간
var _duel := {}                  # { hold, twitched }
var _pattern_start := 0.0
var _pattern_end := -INF         # 지난 패턴이 끝난 월드 시각 (패턴 사이 공백 측정)
var _last_action := -INF         # 플레이어가 대응해야 했던 마지막 순간 (발사 · 내려치기)
var _debug_i := -1


func _ready() -> void:
	_setup({ "w": C.W, "h": C.H })
	add_to_group("boss")
	add_to_group("aimers")
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
		remove_from_group("aimers")
		queue_free()
		return
	set_state("intro")
	body.pose("idle")
	_find_floor.call_deferred()


## 방 바닥 높이 (일방향 발판 말고 진짜 바닥)
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
	if state in ["s_prep", "s_slide", "s_end", "land", "repo_prep", "jump_prep", "w_prep"]:
		h = C.H * 0.62
	return Rect2(global_position - Vector2(C.W / 2.0, h), Vector2(C.W, h))


func capture_silhouette() -> Array:
	return body.silhouette(global_transform)


func can_counter() -> bool:
	return state == "stagger" and not dead and not viewer


func is_staggered() -> bool:
	return state == "stagger"


func block_point() -> Vector2:
	return body.muzzle(0)


func pose_list() -> Array:
	return C.POSES


func pattern_name(n: int) -> String:
	return C.PATTERN_NAMES.get(n, "-")


# ---------------------------------------------------------------- 사격 (Main · Effects 가 읽음)
func lock_time(aim_time: float) -> float:
	return aim_time - C.AIM_LOCK


## 발사 타이밍 원: 아직 안 쏜 탄마다 (원은 그 탄의 aim_time 동안 줄어듦)
func approach_infos() -> Array:
	var out := []
	var wt := TimeManager.world_time
	for b in bullets:
		if b.fired:
			continue
		var at: float = b.aim_time
		var rem: float = b.fire_t - wt
		if rem > at:
			continue
		var tt: float = at - rem
		out.append({ "pos": body.muzzle(b.gun), "remaining": rem, "aim_time": at,
			"locked": tt >= lock_time(at), "k": clampf(tt / maxf(lock_time(at), 0.001), 0.0, 1.0), "parryable": true,
			"fire_t": b.fire_t, "owner": self, "aim": b.aim, "t": tt, "final": b.role == "stagger" })
	return out


func _bullet(gun: int, fire_t: float, aim_time: float, role: String) -> Dictionary:
	var p := _player()
	return { "gun": gun, "fire_t": fire_t, "aim": PI if facing < 0 else 0.0, "target": p.center() if p != null else center(),
		"aim_time": aim_time, "role": role, "fired": false, "laser_end": Vector2.ZERO }


func _next_bullet() -> Dictionary:
	for b in bullets:
		if not b.fired:
			return b
	return {}


## 조준: 고정 전까지 플레이어를 따라감 (고정되는 것은 '노린 지점' — 철견이 미끄러지며 움직여도
## 총구에서 그 지점을 향해 쏨). 총을 그쪽으로. 발사 시각이 되면 Main.fire_boss_shot
func _bullets_tick(main: Node, p: Player) -> void:
	var wt := TimeManager.world_time
	for b in bullets:
		if b.fired:
			continue
		if wt < b.fire_t - C.AIM_LOCK:
			b.target = p.center()
		b.aim = (b.target - body.muzzle(b.gun)).angle()
	var nb := _next_bullet()
	if not nb.is_empty() and state != "d_duel" and state != "d_twitch":
		body.set_aim(nb.gun, nb.aim)
	for b in bullets:
		if not b.fired:
			b.laser_end = main.raycast_wall(body.muzzle(b.gun), b.aim, Config.shot.RANGE)
	for b in bullets:
		if not b.fired and wt >= b.fire_t:
			b.fired = true
			if state == "d_twitch":
				state = "d_end"
				t = 0.0
				body.snap("draw_fire")
			body.set_aim(b.gun, b.aim)
			_action(wt)
			main.fire_boss_shot(self, b)


func _cancel_bullets(scatter := true) -> void:
	var main := _main()
	if scatter and main != null:
		for i in approach_infos():
			main.effects.approach_scatter(i.pos, Effects.approach_radius(i.remaining, i.aim_time), Config.colors.attack)
	bullets.clear()


# ---------------------------------------------------------------- 근접 (② 건카타)
## 내려치기 판정 (몸 앞)
func attack_box() -> Rect2:
	var i := _whip_active()
	if i >= 0 and not _whip.parried[i]:
		return _front_box(C.WHIP_BOX)
	return Rect2()


func _front_box(size: Vector2) -> Rect2:
	var x: float = global_position.x + (C.W / 2.0 - 6.0 if facing > 0 else -C.W / 2.0 - size.x + 6.0)
	return Rect2(Vector2(x, global_position.y - size.y), size)


## 근접 패링 판정 영역
func threat_box() -> Rect2:
	return _front_box(C.WHIP_BOX + Vector2(6, 6))


func _whip_active() -> int:
	if state != "w_combo" or _whip.is_empty():
		return -1
	for i in 3:
		var T: float = _whip.times[i]
		if t >= T and t < T + C.WHIP_ACTIVE:
			return i
	return -1


## 지금 칼을 맞대면 패링되는 타격 번호 (내려치기 직전 melee_early ~ 판정 끝), 없으면 -1
func whip_vulnerable() -> int:
	if state != "w_combo" or _whip.is_empty():
		return -1
	for i in 3:
		var T: float = _whip.times[i]
		if not _whip.parried[i] and t >= T - Config.parry.melee_early and t < T + C.WHIP_ACTIVE:
			return i
	return -1


## 난타 패링됨: 1·2타는 그대로 이어감, 3타는 크게 튕겨나며 휘청
func on_whip_parried(i: int) -> void:
	_whip.parried[i] = true
	body.set_gun_flash(0, false)
	if i == 2:
		if not _whip.swung[2]:
			_action(TimeManager.world_time)
		stagger()
		velocity.x = -facing * C.WHIP_PARRY_KNOCK


# ---------------------------------------------------------------- 외부에서 부름 (Main · Debug)
## 휘청: 반격 기회 STAGGER_TIME 초. 진행 중인 패턴은 끝남
func stagger() -> void:
	if dead:
		return
	_stop_pattern(true)
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
	_kb_v = dir * 2.0 * C.COUNTER_KNOCKBACK / C.KNOCKBACK_TIME   # 등감속으로 30px
	velocity.x = _kb_v
	return hp


## 휘청 아닐 때 베임 → 권총으로 막음 (같은 베기는 한 번만). 패턴 · 공중 중이면 자세는 그대로 (패턴 계속)
func on_blocked(p: Player) -> bool:
	if p.last_slash_t == _last_block:
		return false
	_last_block = p.last_slash_t
	if pattern != 0 or state in ["jump", "repo_dash", "repo_prep"]:
		return true
	_move = {}
	set_state("block")
	velocity.x = 0.0
	_face_player()
	body.snap("block")
	return true


func debug_stagger() -> void:
	if viewer:
		set_viewer(false)
	stagger()


func set_viewer(on: bool) -> void:
	viewer = on
	_stop_pattern(false)
	_move = {}
	body.set_flash(false)
	velocity = Vector2.ZERO
	if on:
		set_state("viewer")
		body.pose("idle")
	else:
		_go_wait(C.P1_GAP)


func viewer_pose(i: int) -> void:
	if viewer and i >= 0 and i < C.POSES.size():
		body.snap(C.POSES[i])


## F10: 패턴 ① → ② → ④ 차례로 바로 실행. 반환 = 패턴 번호
func debug_force_pattern() -> int:
	_debug_i = (_debug_i + 1) % C.P1_ORDER.size()
	var n: int = C.P1_ORDER[_debug_i]
	if viewer:
		set_viewer(false)
	_stop_pattern(true)
	_move = {}
	forced = n
	_next_pattern()
	return n


# ---------------------------------------------------------------- 갱신
func _physics_process(delta: float) -> void:
	if dead:
		return
	var p := _player()
	var main := _main()
	if p == null or main == null or TimeManager.frozen:
		queue_redraw()
		return
	t += delta
	if _trail_t > 0.0:
		_trail_t -= delta
	match state:
		"viewer":
			velocity.x = 0.0
		"intro":
			_face_player()
			velocity.x = 0.0
			if t >= C.FIRST_DELAY:
				_next_pattern()
		"wait":
			_face_player()
			velocity.x = move_toward(velocity.x, 0.0, 2400.0 * delta)
			if t >= _wait:
				_next_pattern()
		# ---- 자리 잡는 대시 (패턴 사이, 웅크림 포함 0.4초 이내) → 끝나면 바로 패턴
		"repo_prep":
			velocity.x = 0.0
			if t >= C.DASH_PREP:
				set_state("repo_dash")
				body.snap("dash")
				Audio.sfx("dash_whoosh")
				_ghost_t = 0.0
		"repo_dash":
			velocity.x = _move.dir * C.DASH_SPEED
			_dash_ghosts(delta)
			if _arrived() or is_on_wall():
				velocity.x *= 0.25
				_start_pattern(_after_move)
		# ---- 점프 (발판에서 내려오기)
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
			queue_redraw()
			return
		"land":
			velocity.x = 0.0
			if t >= C.LAND_TIME:
				body.pose("idle", C.BLEND_MOVE * 2.0)
				_next_pattern()
		# ---- 휘청 · 넉백 · 막기
		"stagger":
			velocity.x = move_toward(velocity.x, 0.0, 900.0 * delta)
			body.set_flash(fmod(t, C.STAGGER_BLINK * 2.0) < C.STAGGER_BLINK)
			if t >= C.STAGGER_TIME:
				body.set_flash(false)
				body.pose("idle", 0.08)
				_go_wait(C.P1_GAP)          # 놓치면 그냥 다음 패턴
		"knockback":
			velocity.x = move_toward(velocity.x, 0.0, absf(_kb_v) / C.KNOCKBACK_TIME * delta)
			if t >= C.KNOCKBACK_TIME:
				velocity.x = 0.0
				body.pose("idle", C.BLEND_MOVE)
				_next_pattern()             # 넉백이 끝나면 바로 다음
		"block":
			velocity.x = 0.0
			if t >= C.BLOCK_TIME:
				body.pose("idle", C.BLEND_MOVE)
				_go_wait(0.1)
		# ---- ① 슬라이드 사격
		"s_prep":
			_face_player()
			velocity.x = move_toward(velocity.x, 0.0, 2400.0 * delta)
			_bullets_tick(main, p)
			if t >= C.SLIDE_SHOT_PREP:
				set_state("s_slide")
				body.snap("slide")
				Audio.sfx("slide")
				_dust_t = 0.0
		"s_slide":
			_face_player()
			var moving := t < float(_move.max_t) and (global_position.x - float(_move.target_x)) * float(_move.dir) < 0.0 and not is_on_wall()
			if moving:
				velocity.x = _move.dir * C.SLIDE_SPEED
				_dust_t -= delta
				if _dust_t <= 0.0:
					_dust_t = C.SLIDE_DUST_EVERY
					_dust(global_position + Vector2(-_move.dir * 6.0, -1.0), 2, -_move.dir)
			else:
				velocity.x = move_toward(velocity.x, 0.0, 1400.0 * delta)
			_bullets_tick(main, p)
			if _next_bullet().is_empty():
				set_state("s_end")
		"s_end":
			velocity.x = move_toward(velocity.x, 0.0, 1400.0 * delta)
			if t >= C.SLIDE_SHOT_RECOVER:
				body.pose("idle", C.BLEND_MOVE * 2.0)
				_end_pattern()
		# ---- ② 돌진 건카타
		"w_prep":
			velocity.x = 0.0
			if t >= C.DASH_PREP:
				set_state("w_dash")
				body.snap("dash")
				Audio.sfx("dash_whoosh")
				_ghost_t = 0.0
		"w_dash":
			velocity.x = _move.dir * C.DASH_SPEED
			_dash_ghosts(delta)
			if _arrived() or is_on_wall():
				velocity.x = 0.0
				_start_whip_combo()
		"w_combo":
			_whip_tick(main, p, delta)
		# ---- ④ 속사
		"d_duel":
			_face_player()
			velocity.x = move_toward(velocity.x, 0.0, 2400.0 * delta)
			if t >= float(_duel.hold):
				# 진짜 움찔 → 0.3초 만에 뽑아 쏨 (원도 0.3초)
				set_state("d_twitch")
				body.snap("twitch")
				var fire_t := TimeManager.world_time + C.DUEL_TWITCH + C.DUEL_DRAW
				bullets = [_bullet(0, fire_t, C.DUEL_DRAW, "stagger")]
				Audio.play_synced("quickdraw", fire_t)
		"d_twitch":
			_face_player()
			_bullets_tick(main, p)
		"d_end":
			velocity.x = 0.0
			if t >= C.DUEL_RECOVER:
				body.pose("idle", C.BLEND_MOVE * 2.0)
				_end_pattern()
	apply_physics(delta)
	queue_redraw()


func _dash_ghosts(delta: float) -> void:
	_ghost_t -= delta
	if _ghost_t <= 0.0:
		_ghost_t = C.DASH_GHOST_EVERY
		body.ghost()


func _face_player() -> void:
	var p := _player()
	if p == null:
		return
	var dx := p.center().x - center().x
	if absf(dx) > 2.0:
		_set_facing(1 if dx > 0.0 else -1)


func _set_facing(dir: int) -> void:
	facing = dir
	body.facing = dir


func _go_wait(sec: float) -> void:
	set_state("wait")
	_wait = sec


func _arrived() -> bool:
	return t >= float(_move.max_t) or (global_position.x - float(_move.target_x)) * float(_move.dir) >= 0.0


func _on_floor() -> bool:
	return global_position.y >= _floor_y - 3.0


func _clamp_x(x: float) -> float:
	var main := _main()
	var w: float = main.room.size_px().x if main != null else 512.0
	var t8: float = Config.room.tile
	return clampf(x, t8 + C.EDGE, w - t8 - C.EDGE)


# ---------------------------------------------------------------- 패턴 고르기 · 시작 · 끝
## 다음 패턴 (페이즈 1: ① → ② → ④ 고정). 필요하면 먼저 자리 잡는 대시
func _next_pattern() -> void:
	var p := _player()
	if p == null or p.dead:
		_go_wait(0.5)
		return
	if not _on_floor():
		var side := signf(global_position.x - p.global_position.x)
		if side == 0.0:
			side = 1.0
		_jump_to(Vector2(_clamp_x(p.global_position.x + side * 90.0), _floor_y))
		return
	var n: int = forced
	if n == 0:
		n = C.P1_ORDER[_order_i % C.P1_ORDER.size()]
		_order_i += 1
	else:
		forced = 0
		_order_i = C.P1_ORDER.find(n) + 1
	var dist := absf(p.global_position.x - global_position.x)
	if n == 1 and dist < C.SLIDE_SHOT_MIN_DIST and _reposition(n, C.SLIDE_SHOT_MIN_DIST + 30.0):
		return
	if n == 4 and dist < C.DUEL_MIN_DIST and _reposition(n, C.DUEL_MIN_DIST + 30.0):
		return
	_start_pattern(n)


## 플레이어에게서 want 만큼 떨어지는 대시 (뒤가 막혔으면 플레이어 반대편으로). 웅크림 포함 0.4초 이내
func _reposition(n: int, want: float) -> bool:
	var p := _player()
	var dir := 1 if p.global_position.x > global_position.x else -1
	var tx := _clamp_x(p.global_position.x - dir * want)
	if absf(tx - p.global_position.x) < want * 0.7:
		tx = _clamp_x(p.global_position.x + dir * want)       # 뒤가 벽 → 지나쳐 반대편으로
	if absf(tx - global_position.x) < 8.0:
		return false
	var d := 1 if tx > global_position.x else -1
	_move = { "dir": d, "target_x": tx, "max_t": C.REPOSITION_MAX }
	_after_move = n
	_set_facing(d)
	set_state("repo_prep")
	body.snap("crouch")
	_dust(global_position, 4, -d)
	return true


func _start_pattern(n: int) -> void:
	var p := _player()
	pattern = n
	_pattern_start = TimeManager.world_time
	dbg = { "n": n, "name": pattern_name(n), "first": -1.0, "max_gap": 0.0, "since_prev": -1.0,
		"gap": (TimeManager.world_time - _pattern_end) if _pattern_end > -INF else -1.0 }
	var dir := 1 if p.global_position.x > global_position.x else -1
	match n:
		1:
			# ① 몸을 낮춤 + gun_cock (동시에) → 플레이어를 지나쳐 반대편까지 슬라이드하며 연발
			set_state("s_prep")
			_face_player()
			body.snap("crouch")
			Audio.sfx("gun_cock")
			var tx := _clamp_x(p.global_position.x + dir * C.SLIDE_SHOT_PASS)
			_move = { "dir": dir, "target_x": tx, "max_t": C.SLIDE_SHOT_MAX }
			var wt := TimeManager.world_time
			var slide_start: float = wt + C.SLIDE_SHOT_PREP
			bullets.clear()
			for i in C.SLIDE_SHOT_COUNT:
				var ft: float = slide_start + C.SLIDE_SHOT_FIRST + i * C.SLIDE_SHOT_GAP
				var at: float = minf(C.SLIDE_SHOT_AIM, ft - wt)
				bullets.append(_bullet(0, ft, at, "stagger" if i == C.SLIDE_SHOT_COUNT - 1 else "normal"))
		2:
			# ② 대시 웅크림 + 발밑 먼지 → 플레이어 앞 30px 까지 대시
			var tx := _clamp_x(p.global_position.x - dir * C.WHIP_STOP)
			if (tx - global_position.x) * dir < 0.0:
				tx = global_position.x                         # 이미 그보다 가까움
			_move = { "dir": dir, "target_x": tx, "max_t": C.WHIP_DASH_MAX }
			_set_facing(dir)
			set_state("w_prep")
			body.snap("crouch")
			_dust(global_position, 6, -dir)
		4:
			# ④ duel 포즈 정적
			set_state("d_duel")
			_face_player()
			body.clear_aim()
			body.snap("duel")
			_duel = { "hold": randf_range(C.DUEL_HOLD_MIN, C.DUEL_HOLD_MAX) }
		_:
			_go_wait(C.P1_GAP)


## 패턴 끝 → 공백 P1_GAP 뒤 다음. 다음 패턴 전에 자리 잡는 대시가 필요하면 그 대시가 공백 대신 (0.4초 이내)
func _end_pattern() -> void:
	_stop_pattern(false)
	if _reposition_needed(_peek_next()):
		_next_pattern()
	else:
		_go_wait(C.P1_GAP)


func _peek_next() -> int:
	return forced if forced != 0 else C.P1_ORDER[_order_i % C.P1_ORDER.size()]


func _reposition_needed(n: int) -> bool:
	var p := _player()
	if p == null:
		return false
	var dist := absf(p.global_position.x - global_position.x)
	return (n == 1 and dist < C.SLIDE_SHOT_MIN_DIST) or (n == 4 and dist < C.DUEL_MIN_DIST)


func _stop_pattern(scatter: bool) -> void:
	if pattern != 0:
		_pattern_end = TimeManager.world_time
	pattern = 0
	_cancel_bullets(scatter)
	_whip = {}
	_duel = {}
	body.clear_aim()
	body.set_gun_flash(0, false)


## 플레이어가 대응해야 하는 순간 (발사 · 내려치기) — 디버그 타이밍
func _action(at: float) -> void:
	if dbg.is_empty():
		return
	if dbg.first < 0.0:
		dbg.first = at - _pattern_start
		if _last_action > -INF:
			dbg.since_prev = at - _last_action
	else:
		dbg.max_gap = maxf(dbg.max_gap, at - _last_action)
	_last_action = at


# ---------------------------------------------------------------- ② 건카타 3연타
func _start_whip_combo() -> void:
	var T1: float = C.WHIP_WINDUP
	var T2: float = T1 + C.WHIP_GAP
	var T3: float = T2 + C.WHIP_REWIND + C.WHIP_DELAY
	_whip = { "times": [T1, T2, T3], "wind_at": [0.0, T1 + C.WHIP_REWIND, T2 + C.WHIP_REWIND],
		"parried": [false, false, false], "swung": [false, false, false], "wound": [false, false, false] }
	set_state("w_combo")


func _whip_tick(main: Node, p: Player, delta: float) -> void:
	velocity.x = move_toward(velocity.x, 0.0, 3000.0 * delta)
	var flash := false
	for i in 3:
		var T: float = _whip.times[i]
		# 예고: whip_windup (상체 젖히고 권총 머리 위 뒤로) + 그 순간 방향 고정 + 내려치는 순간에 맞춘 pistol_whip
		if not _whip.wound[i] and t >= _whip.wind_at[i]:
			_whip.wound[i] = true
			_face_player()
			body.snap("whip_windup")
			Audio.play_synced("pistol_whip", TimeManager.world_time + (T - t))
		if not _whip.parried[i] and t >= T - C.WHIP_FLASH and t < T:
			flash = true
		# 내려치기: whip_smash + 12px 돌진 + 회색 반달 + 먼지 + 흔들림
		if not _whip.swung[i] and t >= T:
			_whip.swung[i] = true
			body.snap("whip_smash")
			velocity.x = facing * C.WHIP_LUNGE / C.WHIP_LUNGE_TIME
			_trail_t = C.WHIP_TRAIL_TIME
			_dust(global_position + Vector2(facing * 18.0, 0), 6, 0)
			main.add_shake(C.WHIP_SHAKE, 0.15, PI / 2.0)
			_action(TimeManager.world_time)
	body.set_gun_flash(0, flash and fmod(t, 0.08) < 0.05)
	if t >= float(_whip.times[2]) + C.WHIP_ACTIVE + C.WHIP_RECOVER:
		body.pose("idle", C.BLEND_MOVE * 2.0)
		_end_pattern()


# ---------------------------------------------------------------- 이동 도우미
func _jump_to(to: Vector2) -> void:
	_move = { "from": global_position, "to": to, "time": C.JUMP_TIME }
	_set_facing(1 if to.x > global_position.x else -1)
	set_state("jump_prep")
	body.snap("crouch")


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


# ---------------------------------------------------------------- 그리기 (조준선 · 반달 궤적 — 몸은 Body)
func _draw_pose() -> void:
	if capturing():
		return
	var col: Color = Config.colors.attack
	var wt := TimeManager.world_time
	for b in bullets:
		if b.fired:
			continue
		var at: float = b.aim_time
		var rem: float = b.fire_t - wt
		if rem > at:
			continue
		var tt: float = at - rem
		var k := clampf(tt / maxf(lock_time(at), 0.001), 0.0, 1.0)
		var c := col
		c.a = lerpf(C.LASER_ALPHA_MIN, 1.0, k)
		var width := 1.0 if k < 0.5 else 2.0
		if tt >= lock_time(at):
			var lt := tt - lock_time(at)
			var period: float = C.LOCK_BLINK_TIME * 2.0
			if lt < period * C.LOCK_BLINKS and fmod(lt, period) < C.LOCK_BLINK_TIME:
				c = Color.WHITE
			c.a = 1.0
			width = 2.0
		draw_line(to_local(body.muzzle(b.gun)), to_local(b.laser_end), c, width)
	# 건카타 회색 반달 (위 → 아래로 내려침)
	if _trail_t > 0.0 and state == "w_combo":
		var u := 1.0 - _trail_t / C.WHIP_TRAIL_TIME
		var tc: Color = C.WHIP_TRAIL
		tc.a = 0.9 * (1.0 - u * u)
		var cx := Vector2(facing * 6.0, -24.0)
		var a0 := -PI / 2.0 - 0.4 if facing > 0 else -PI / 2.0 + 0.4
		DrawUtil.crescent(self, cx, 26.0, a0, 2.2 * facing, 0.0, 1.0, 6.0, tc, 2.0)

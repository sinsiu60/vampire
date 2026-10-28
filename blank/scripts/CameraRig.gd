extends Node
class_name CameraRig
## 카메라 (Main 의 Camera2D 를 직접 움직임 — Camera2D 의 따라가기 · 스무딩 · 한계는 끔). 수치는 Config.camera.
## 규칙을 합친 결과:
##  [A] 데드존 CAM_DEADZONE_W × H — 안에서는 그대로, 테두리를 밀면 그만큼만
##  [B] 룩어헤드 — 바라보는 방향으로 CAM_LOOKAHEAD 앞, 방향을 바꾸면 CAM_LOOKAHEAD_TIME 에 걸쳐 (끝이 부드러운 3차 곡선)
##  [C] 세로 — 공중에선 안 따라감, 착지하면 새 바닥으로 CAM_SNAP_Y_TIME 에 걸쳐. 화면 위 · 아래 CAM_Y_PANIC 안쪽이면 바로 따라감
##  [D] 감쇠 — 목표점으로 가로 CAM_SMOOTH_X · 세로 CAM_SMOOTH_Y 초 (지수)
##  [E] 경계 — 지금 구간의 CameraBounds 밖은 안 보임 (화면보다 좁으면 가운데 · 낮으면 아래에 맞춤)
##  [F] 최종 위치는 정수로 반올림. 흔들림은 Camera2D.offset (Main._update_shake) — 데드존 · 경계 계산과 따로
##  [G] 카메라 영역 (CameraZone) — 줌 · 고정 · 경계를 덮어씀, 들어가고 나올 때 CAM_ZONE_BLEND 초에 걸쳐
## 구간 전환 (TransitionZone, 이어진 맵): 경계 앞에서 카메라가 멈춰 있다가 플레이어 중심이 선을 넘는 순간
##  입력 잠금 · 세상 멈춤 → 플레이어는 CAM_TRANS_PLAYER_CARRY 만 더 가서 멈춤 → 카메라가 다음 구간으로 CAM_TRANS_TIME (ease-out cubic)
##  → 복귀 (CAM_TRANS_SETTLE 동안 데드존 없이 · CAM_TRANS_GRACE 동안 다음 구간 적은 조준 · 공격 시작 안 함)
## 연출 카메라 (Main.cam_override — 처음 만나는 적 소개 · 철견 피날레) 가 있으면 그쪽이 우선 (경계 안으로만 맞춤).

signal segment_entered(from_seg: int, to_seg: int)   ## 전환이 끝나 새 구간이 됨 (또는 순간이동 · 다시 시작으로 구간이 바뀜)

var main: Node
var cam: Camera2D
var center := Vector2.ZERO        ## 카메라 중심 (반올림 전, 월드)
var anchor := Vector2.ZERO        ## 데드존 기준점 (x = 데드존 가운데, y = 세로 목표)
var look := 0.0                   ## 지금 룩어헤드 (px)
var target := Vector2.ZERO        ## 이번 틱 목표점 (경계 안) — F10 표시
var seg := -1                     ## 카메라가 보는 구간 (Level.segment_info 번호, 이어진 맵 아니면 -1)
var bounds := Rect2()             ## 지금 경계 (영역 섞기까지 반영, 월드)
var zone_zoom := 1.0              ## 카메라 영역 줌 (섞기 반영)
var trans := {}                   ## 전환 중 { zone, from, to, dir, t, dur, from_c, to_c, carry_left, carry_v, paused }
var settle := 0.0                 ## 전환 뒤 데드존 없이 따라가는 남은 시간
var grace := 0.0                  ## 전환 뒤 다음 구간 적이 공격을 시작하지 않는 남은 시간 (Enemy.grace)
var transitions := 0              ## 지금까지 전환 수 (테스트)
var last_trans_time := 0.0        ## 마지막 전환이 실제로 걸린 시간 (테스트)

var _look_u := 1.0                # 룩어헤드 진행 (-1 ~ 1)
var _snap := {}                   # 세로 맞춤 { from, to, t }
var _zone: CameraZone = null      # 섞는 중인 영역 (나온 뒤에도 섞기가 끝날 때까지)
var _zone_w := 0.0                # 영역 섞기 비율 (0 = 원래 규칙, 1 = 영역)
var _last_p := Vector2.INF        # 지난 틱 플레이어 몸 중심 (순간이동 · 경계 넘기)


func setup(m: Node, c: Camera2D) -> void:
	main = m
	cam = c
	cam.position_smoothing_enabled = false
	cam.drag_horizontal_enabled = false
	cam.drag_vertical_enabled = false
	cam.limit_enabled = false
	cam.process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS
	reset()


## 지금 플레이어 자리로 바로 (방을 만든 뒤 · 순간이동 · 다시 시작)
func reset() -> void:
	var p: Player = main.player
	var L := _level()
	var old := seg
	seg = L.segment_index_at(p.global_position.x) if L != null else -1
	_look_u = float(p.facing)
	look = float(Config.camera.CAM_LOOKAHEAD) * _odd_ease(_look_u)
	_snap = {}
	_zone = _find_zone(p.global_position)
	_zone_w = 1.0 if _zone != null else 0.0
	_update_bounds(0.0)
	anchor = _focus()
	center = _clamp_center(anchor + Vector2(look, 0.0), _cur_zoom())
	target = center
	_last_p = p.center()
	_sync_walls()
	_apply()
	if L != null and old != seg and old >= 0:
		segment_entered.emit(old, seg)


func transitioning() -> bool:
	return not trans.is_empty()


## 플레이어를 따라갈 때의 화면 중심 (연출 카메라가 돌아올 곳)
func follow_center() -> Vector2:
	return center


## 매 틱 (Main._physics_process 끝 — 플레이어가 움직인 뒤). dt = 월드 시간 (히트스톱이면 0)
func tick(dt: float) -> void:
	var p: Player = main.player
	if p == null:
		return
	var rd := TimeManager.real_delta()
	settle = maxf(0.0, settle - rd)
	grace = maxf(0.0, grace - rd)
	if not trans.is_empty():
		_trans_tick(rd)
		_apply()
		return
	var pc := p.center()
	# 순간이동 (디버그 · 테스트 · 다시 시작): 카메라도 바로 그 자리로
	if _last_p != Vector2.INF and pc.distance_to(_last_p) > float(Config.camera.TELEPORT_SNAP):
		reset()
		return
	if _check_crossing(pc):
		_last_p = pc
		_apply()
		return
	_last_p = pc
	_follow(dt, rd)
	_apply()


# ---------------------------------------------------------------- 따라가기
func _follow(dt: float, rd: float) -> void:
	var C: Dictionary = Config.camera
	var p: Player = main.player
	# [G] 영역 섞기 (실제 시간)
	var z := _find_zone(p.global_position)
	if z != null and z != _zone and _zone_w <= 0.0:
		_zone = z
	if z != null and z == _zone:
		_zone_w = minf(1.0, _zone_w + rd / float(C.CAM_ZONE_BLEND))
	else:
		_zone_w = maxf(0.0, _zone_w - rd / float(C.CAM_ZONE_BLEND))
		if _zone_w <= 0.0:
			_zone = z
	_update_bounds(dt)
	var f := _focus()
	var zm := _cur_zoom()
	# [A] 데드존 (전환 직후엔 바로)
	if settle > 0.0:
		anchor.x = f.x
	else:
		var hw: float = float(C.CAM_DEADZONE_W) / 2.0
		anchor.x = clampf(anchor.x, f.x - hw, f.x + hw)
	# [C] 세로: 바닥에 있을 때만 새 높이로 (데드존 세로 반보다 크게 달라졌을 때)
	if settle > 0.0:
		anchor.y = f.y
		_snap = {}
	elif p.is_on_floor() and not p.dead:
		var goal: float = float(_snap.to) if not _snap.is_empty() else anchor.y
		if absf(f.y - goal) > float(C.CAM_DEADZONE_H) / 2.0:
			_snap = { "from": anchor.y, "to": f.y, "t": 0.0 }
	if not _snap.is_empty():
		_snap.t += dt
		var k := clampf(float(_snap.t) / float(C.CAM_SNAP_Y_TIME), 0.0, 1.0)
		anchor.y = lerpf(float(_snap.from), float(_snap.to), _smooth(k))
		if k >= 1.0:
			_snap = {}
	# [B] 룩어헤드
	var goal_u := float(p.facing)
	_look_u = move_toward(_look_u, goal_u, dt * 2.0 / float(C.CAM_LOOKAHEAD_TIME))
	look = float(C.CAM_LOOKAHEAD) * _odd_ease(_look_u)
	# 데드존이 경계 밖으로 멀리 나가지 않게 (돌아설 때 늦게 따라오지 않게)
	var lim := _center_range(zm)
	anchor.x = clampf(anchor.x, lim.position.x - float(C.CAM_LOOKAHEAD), lim.end.x + float(C.CAM_LOOKAHEAD))
	target = _clamp_center(Vector2(anchor.x + look, anchor.y), zm)
	# [G] 고정 영역: 영역 가운데로 (섞기 비율만큼)
	if _zone != null and not _zone.zone_follow() and _zone_w > 0.0:
		target = target.lerp(_clamp_center(_zone.world_rect().get_center(), zm), _smooth(_zone_w))
	# [D] 감쇠 (전환 직후엔 바로)
	if settle > 0.0:
		center = target
	else:
		center.x += (target.x - center.x) * (1.0 - exp(-dt / float(C.CAM_SMOOTH_X)))
		center.y += (target.y - center.y) * (1.0 - exp(-dt / float(C.CAM_SMOOTH_Y)))
	# [C] 긴 낙하 · 높이 점프: 화면 위 · 아래 끝 가까이 오면 바로
	var half := _half(zm)
	var pan: float = float(C.CAM_Y_PANIC)
	var feet := p.global_position.y
	var head := feet - float(Config.player.h)
	if feet > center.y + half.y - pan:
		center.y = feet - (half.y - pan)
		anchor.y = center.y
		_snap = {}
	elif head < center.y - half.y + pan:
		center.y = head + (half.y - pan)
		anchor.y = center.y
		_snap = {}
	center = _clamp_center(center, zm)


## 카메라 기준점 = 발 위 FOOT_OFFSET (화면보다 높은 구간은 TALL_FOOT_OFFSET)
func _focus() -> Vector2:
	var C: Dictionary = Config.camera
	var tall: bool = bounds.size.y > Config.view.h + 32.0
	return main.player.global_position - Vector2(0.0, float(C.TALL_FOOT_OFFSET) if tall else float(C.FOOT_OFFSET))


func _cur_zoom() -> float:
	return float(main.zoom) * zone_zoom


func _half(zm: float) -> Vector2:
	return Vector2(Config.view.w, Config.view.h) / 2.0 / maxf(0.01, zm)


## 경계 = 지금 구간 (이어진 맵) 또는 방 전체, 영역이 있으면 섞음
func _update_bounds(_dt: float) -> void:
	var base := _base_bounds(seg)
	zone_zoom = 1.0
	if _zone != null and _zone_w > 0.0:
		var w := _smooth(_zone_w)
		var zr := _zone.world_rect().intersection(_room_rect())
		if zr.size == Vector2.ZERO:
			zr = base
		bounds = Rect2(base.position.lerp(zr.position, w), base.size.lerp(zr.size, w))
		zone_zoom = lerpf(1.0, _zone.zone_zoom(), w)
	else:
		bounds = base


func _base_bounds(i: int) -> Rect2:
	var L := _level()
	if L != null and i >= 0 and i < L.segment_info.size():
		var b: Rect2 = L.segment_info[i].bounds
		var r := b.intersection(_room_rect())
		return r if r.size != Vector2.ZERO else b
	return _room_rect()


func _room_rect() -> Rect2:
	return Rect2(Vector2.ZERO, main.room.size_px())


## 화면 중심이 갈 수 있는 범위 (경계 bnd · 줌 zm). 화면보다 좁으면 가운데 · 낮으면 아래 끝에 맞춤 (위로 하늘이 더 보이게)
func _center_range(zm: float, bnd := Rect2()) -> Rect2:
	var b := bounds if bnd.size == Vector2.ZERO else bnd
	var h := _half(zm)
	var x0 := b.position.x + h.x
	var x1 := b.end.x - h.x
	if x0 > x1:
		x0 = b.get_center().x
		x1 = x0
	var y0 := b.position.y + h.y
	var y1 := b.end.y - h.y
	if y0 > y1:
		y0 = b.end.y - h.y
		y1 = y0
	return Rect2(x0, y0, x1 - x0, y1 - y0)


func _clamp_center(c: Vector2, zm: float, bnd := Rect2()) -> Vector2:
	var r := _center_range(zm, bnd)
	return Vector2(clampf(c.x, r.position.x, r.end.x), clampf(c.y, r.position.y, r.end.y))


## Camera2D 에 반영: 연출 카메라가 있으면 그쪽 (경계 안으로), 아니면 center. 정수로
func _apply() -> void:
	var ov: Dictionary = main.cam_override
	var c := center
	var zm := _cur_zoom()
	if not ov.is_empty():
		zm = float(ov.get("zoom", 1.0))
		c = _clamp_center(Vector2(ov.center), zm, _base_bounds(seg))
	cam.zoom = Vector2(zm, zm)
	cam.global_position = c.round()
	cam.force_update_scroll()


func _find_zone(p: Vector2) -> CameraZone:
	for z in main.get_tree().get_nodes_in_group("camera_zones"):
		if main.room.is_ancestor_of(z) and (z as CameraZone).contains(p):
			return z
	return null


func _level() -> Level:
	return main.room as Level


static func _smooth(x: float) -> float:
	x = clampf(x, 0.0, 1.0)
	return x * x * (3.0 - 2.0 * x)


## -1 ~ 1 → -1 ~ 1, 양 끝에서 기울기 0 (방향을 바꿀 때 시작 · 끝이 부드럽게)
static func _odd_ease(u: float) -> float:
	u = clampf(u, -1.0, 1.0)
	return u * (3.0 - u * u) / 2.0


static func _ease_out_cubic(x: float) -> float:
	x = clampf(x, 0.0, 1.0)
	return 1.0 - pow(1.0 - x, 3.0)


# ---------------------------------------------------------------- 구간 전환
## 플레이어 몸 중심이 이번 틱 TransitionZone 선을 넘었으면 전환 시작
func _check_crossing(pc: Vector2) -> bool:
	var L := _level()
	if L == null or _last_p == Vector2.INF or main.player.dead or not main.can_transition():
		return false
	for z in main.get_tree().get_nodes_in_group("transition_zones"):
		var tz := z as TransitionZone
		if not L.is_ancestor_of(tz) or tz.passed:
			continue
		if tz.crossed(_last_p, pc):
			var to := L.segment_index_by_id(tz.next_segment_id)
			if to < 0 or to == seg:
				tz.passed = true
				continue
			_begin(tz, to)
			return true
	return false


func _begin(tz: TransitionZone, to: int) -> void:
	var C: Dictionary = Config.camera
	var p: Player = main.player
	var dir := tz.dir_vector()
	var v := absf(p.velocity.dot(dir))
	tz.passed = true
	trans = { "zone": tz, "from": seg, "to": to, "dir": dir, "t": 0.0,
		"dur": float(C.CAM_TRANS_TIME_V if dir.y != 0.0 else C.CAM_TRANS_TIME) * (float(C.CAM_TRANS_DEBUG_SLOW) if Debug.trans_slow else 1.0),
		"carry_left": float(C.CAM_TRANS_PLAYER_CARRY), "carry_v": maxf(v, float(C.CAM_TRANS_CARRY_MIN_SPEED)),
		"from_c": center, "real": 0.0 }
	main.begin_segment_transition()
	# 다음 구간에서 플레이어가 멈춰 설 자리 기준으로 (데드존 · 룩어헤드 규칙 그대로) 카메라 도착점
	seg = to
	_zone = null
	_zone_w = 0.0
	_snap = {}
	_update_bounds(0.0)
	var land := p.global_position + dir * float(C.CAM_TRANS_PLAYER_CARRY)
	var tall: bool = bounds.size.y > Config.view.h + 32.0
	var f := land - Vector2(0.0, float(C.TALL_FOOT_OFFSET) if tall else float(C.FOOT_OFFSET))
	_look_u = float(p.facing)
	look = float(C.CAM_LOOKAHEAD) * _odd_ease(_look_u)
	anchor = f
	trans.to_c = _clamp_center(f + Vector2(look, 0.0), _cur_zoom())
	transitions += 1


func _trans_tick(rd: float) -> void:
	var p: Player = main.player
	trans.real += rd
	var slow := float(Config.camera.CAM_TRANS_DEBUG_SLOW) if Debug.trans_slow else 1.0
	# 플레이어: 속도 그대로 CARRY 만큼 더 가서 멈춤 (공중이면 그 높이에서 — 중력 없음)
	if float(trans.carry_left) > 0.0:
		var step := minf(float(trans.carry_left), float(trans.carry_v) * rd / slow)
		p.global_position += Vector2(trans.dir) * step
		trans.carry_left = float(trans.carry_left) - step
	trans.t += rd
	var k := clampf(float(trans.t) / float(trans.dur), 0.0, 1.0)
	center = Vector2(trans.from_c).lerp(Vector2(trans.to_c), _ease_out_cubic(k))
	target = trans.to_c
	if k >= 1.0 and float(trans.carry_left) <= 0.0:
		_end()


func _end() -> void:
	var from: int = trans.from
	last_trans_time = float(trans.real)
	center = trans.to_c
	(trans.zone as TransitionZone).set_wall(true)
	trans = {}
	settle = float(Config.camera.CAM_TRANS_SETTLE)
	grace = float(Config.camera.CAM_TRANS_GRACE)
	_last_p = main.player.center()
	main.end_segment_transition()
	segment_entered.emit(from, seg)


## 한쪽으로만 가는 경계의 벽: 플레이어 뒤에 있는 경계만 켬 (순간이동 · 다시 시작해도 맞게)
func _sync_walls() -> void:
	var L := _level()
	if L == null:
		return
	var pc: Vector2 = main.player.center()
	for z in main.get_tree().get_nodes_in_group("transition_zones"):
		var tz := z as TransitionZone
		if L.is_ancestor_of(tz):
			tz.passed = tz.behind(pc)
			tz.set_wall(tz.passed)

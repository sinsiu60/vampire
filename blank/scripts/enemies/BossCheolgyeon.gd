extends Enemy
class_name BossCheolgyeon
## 1장 보스 "철견" — 하운드 제1 사냥개 부대장, 쌍권총 난사형. 수치는 Config.boss.
##
## 핵심 구조: 자세 게이지. 패링할 때마다 오르고(미니 +10 · 풀 +30 · 수류탄 되치기 +40 · 난타 3타 +25),
## 3초 동안 패링이 없으면 초당 5씩 줄어듦. 100 → 그로기 (무릎 꿇고 2초, 머리 위 "처형") → 베면 처형 = 체력 -1.
## 체력은 처형으로만 줄어듦. 체력 1 의 마지막 처형은 막아내고 "아직이다!" → 결전 핑퐁.
##
## 패턴 (번호 = Config 의 P*_PATTERNS)
##  ① 리듬 연사    탄마다 원 · 중간 탄 미니 패링 · 마지막 탄 풀 패링 (페이즈 3: 총 번갈아 + 가짜 조준)
##  ② 권총 난타    80px 안이면 달려들어 손잡이로 3연타 (0.35 · 0.8초), 각 타격 0.3초 전 권총이 빨갛게 점멸 — 근접 패링
##  ③ 발차기       40px 안 → 0.4초 예고 (다리 보라색, 패링 불가) → 발차기 → 0.5초 빈틈
##  ④ 도탄 사격    벽에 1번 튕겨 오는 히트스캔. 꺾인 조준선 · 원은 플레이어 둘레 + 방향 화살표 — 방향 패링 (±60°)
##  ⑤ 수류탄       포물선, 1.2초 뒤 폭발 (반경 50). 베면 되치기 → 철견 근처 폭발이면 자세 +40 · 경직 1초
##  ⑥ 섬광탄       0.5초 뒤 화면이 2초 하얗게 — 원 · 조준선 없이 장전음 "철컥" 0.5초 뒤 박자에 3연발
##  ⑦ 핑퐁 결투    랠리마다 원이 줄어드는 시간만 짧아짐 (0.8 → 0.6 → 0.45 → 0.35), 4번째 명중 → 최종 처치
## 페이즈 1 ①②③ · 휴식 1.2 / 2 ①~⑤ · 1.0 · 연사 뒤 점프 / 3 ①~⑥ · 0.8 / 결전 ⑦. 같은 패턴 2번 연속 금지,
## 가까우면 ②③, 멀면 ①④⑤ 위주. 페이즈 시작 · 결전 시작 = 체크포인트 (GameState.boss_checkpoint)
## 등장 연출(이름 카드 · 대사)과 체력 칸 · 자세 게이지는 HUD 가 이 노드를 읽어 그림. 방의 "BossPerches" = 점프 자리.

const GUNS := 2
const PATTERN_NAMES := ["", "리듬 연사", "권총 난타", "발차기", "도탄 사격", "수류탄", "섬광탄", "핑퐁 결투"]

var hp := 3
var phase := 1                   ## 1 · 2 · 3, 결전 = 4
var posture := 0.0               ## 자세 게이지 0 ~ POSTURE_MAX
var invincible := false          ## F9 — 자세가 오르지 않고 처형도 통하지 않음 (패턴 관찰용)
var gun_aim := [PI, PI]
var bullets: Array = []          ## { gun, fire_t, aim, aim_time, final, fired, kind: burst|ricochet|flash|rally, rally, cocked, bounce, dir2 }
var cracks := 0
var fight := false
var pattern := 0                 ## 지금 패턴 (0 = 없음)
var last_pattern := 0
var forced := 0                  ## F10 로 강제한 패턴 (다음 휴식이 끝나면 바로)
var rally_i := -1                ## 핑퐁 랠리 번호 (0 ~ 3)

# 등장 연출 (실제 시간)
var intro_t := -1.0
var card_f := -1
var resume := false

var _fake := false
var _rest := 0.0
var _stun := 0.0
var _jump := {}
var _perches: Array = []
var _last_clang := -INF
var _last_parry_t := -INF        # 마지막 패링 (월드 시간) — 자세 게이지 감소 기준
var _laser_end := [Vector2.ZERO, Vector2.ZERO]
var _rico_end := Vector2.ZERO    # 도탄 조준선 두 번째 꺾인 줄 끝
var _rico_wall := 1              # 도탄에 쓸 면 (-1 왼쪽 벽 · 1 오른쪽 벽 · 2 천장)
var _debug_pat := 0              # F10 으로 마지막에 강제한 패턴
var _whip := {}                  # { times: [T1, T2, T3], parried: [..], hit: [..] }
var _throw := ""                 # 던질 것 (grenade · flash)
var _thrown := false
var _popped := false              # 섬광탄이 터졌는가 (터진 뒤 하얀 화면이 끝나야 패턴 끝)
var _say := {}                   # 대사 { text, t, dur } (월드 시간)


func _ready() -> void:
	var c: Dictionary = Config.boss.duplicate()
	_setup(c)
	add_to_group("aimers")
	add_to_group("boss")
	hp = int(c.BOSS_CHEOLGYEON_HP)
	var room := get_parent().get_parent()
	var pn := room.get_node_or_null("BossPerches")
	if pn != null:
		for m in pn.get_children():
			_perches.append(m.global_position)
	var cp: Dictionary = GameState.boss_checkpoint
	if cp.get("key", "") == GameState.room_key():
		if cp.get("dead", false):
			dead = true
			remove_from_group("enemies")
			remove_from_group("aimers")
			remove_from_group("boss")
			queue_free()
			return
		phase = int(cp.get("phase", 1))
		hp = maxi(1, int(c.BOSS_CHEOLGYEON_HP) - (phase - 1))
		cracks = mini(phase - 1, 3)
		resume = true
	set_state("intro")
	intro_t = 0.0


# ---------------------------------------------------------------- 조회 (Main · HUD · Effects)
func _main() -> Node:
	return get_tree().get_first_node_in_group("game")


func _player() -> Player:
	return get_tree().get_first_node_in_group("player")


func pivot(g: int) -> Vector2:
	var x := 7.0 if g == 0 else -5.0
	return global_position + Vector2(x * facing, -25.0 + _crouch())


func muzzle(g: int) -> Vector2:
	return pivot(g) + Vector2.from_angle(gun_aim[g]) * float(cfg.GUN_LENGTH)


func plate_pos() -> Vector2:
	return global_position + Vector2(1.0 * facing, -22.0 + _crouch())


func _crouch() -> float:
	match state:
		"groggy": return 7.0
		"rise", "stun": return 3.0
	return 0.0


func lock_time(aim_time: float) -> float:
	return aim_time - cfg.AIM_LOCK_TIME


func is_groggy() -> bool:
	return state == "groggy"


## 최종 처치 랠리(4번째)의 풀 패링인가 — 슬로우 유지 2배
func is_final_hit() -> bool:
	return phase == 4 and pattern == 7 and rally_i >= cfg.RALLY_AIM.size() - 1 and not invincible


## 섬광탄으로 화면이 하얀가 (원 · 조준선을 숨김)
func _whited() -> bool:
	var m := _main()
	return m != null and m.whiteout > 0.3


## 발사 타이밍 원 — 연사 탄마다. 도탄은 플레이어 몸 둘레 + 날아오는 방향 화살표. 섬광 중엔 없음
func approach_infos() -> Array:
	var out := []
	if _whited():
		return out
	var wt := TimeManager.world_time
	var p := _player()
	for b in bullets:
		if b.fired or b.kind == "flash":
			continue                              # 섬광 3연발은 원 없이 장전음 박자로만
		var at: float = b.aim_time
		var rem: float = b.fire_t - wt
		if rem > at:
			continue
		var tt: float = at - rem
		var info := { "pos": muzzle(b.gun), "remaining": rem, "aim_time": at,
			"locked": tt >= lock_time(at), "k": clampf(tt / lock_time(at), 0.0, 1.0), "parryable": true,
			"fire_t": b.fire_t, "owner": self, "aim": b.aim, "t": tt, "final": b.final }
		if b.kind == "ricochet" and p != null:
			info.pos = p.center()
			info.arrow = (b.bounce - p.center()).angle()
		out.append(info)
	return out


func _next_bullet(g: int) -> Dictionary:
	for b in bullets:
		if not b.fired and b.gun == g:
			return b
	return {}


func is_kicking() -> bool:
	return state == "kick_windup" or state == "kick"


## 공격 판정: 발차기 · 난타 타격 순간
func attack_box() -> Rect2:
	if state == "kick":
		return _front_box(cfg.KICK_BOX)
	if state == "whip":
		var i := _whip_active()
		if i >= 0 and not _whip.parried[i]:
			return _front_box(cfg.WHIP_BOX, 14.0)
	return Rect2()


func _front_box(size: Vector2, up := 0.0) -> Rect2:
	var x: float = global_position.x + (cfg.w / 2.0 - 4.0 if facing > 0 else -cfg.w / 2.0 - size.x + 4.0)
	return Rect2(Vector2(x, global_position.y - size.y - up), size)


## 난타: 지금 타격 중(판정)인 번호, 없으면 -1
func _whip_active() -> int:
	if _whip.is_empty():
		return -1
	for i in _whip.times.size():
		if t >= _whip.times[i] and t < _whip.times[i] + cfg.WHIP_ACTIVE:
			return i
	return -1


## 난타: 지금 칼을 맞대면 패링되는 타격 번호 (예고 마지막 순간 ~ 타격), 없으면 -1
func whip_vulnerable() -> int:
	if state != "whip" or _whip.is_empty():
		return -1
	for i in _whip.times.size():
		var T: float = _whip.times[i]
		if not _whip.parried[i] and t >= T - Config.parry.melee_early and t < T + cfg.WHIP_ACTIVE:
			return i
	return -1


## 난타 패링 판정 영역
func threat_box() -> Rect2:
	return _front_box(cfg.WHIP_BOX + Vector2(6, 8), 14.0)


## 등장 카드 { f, scale, alpha }
func card_state() -> Dictionary:
	if card_f < 0 or resume:
		return {}
	var B: Dictionary = cfg
	var scales: Array = B.CARD_SCALES
	var s: float = scales[card_f] if card_f < scales.size() else 1.0
	var held: float = (card_f - scales.size()) / float(Config.fps)
	var a := 1.0
	if held > B.CARD_HOLD:
		a = 1.0 - (held - B.CARD_HOLD) / B.CARD_FADE
	if a <= 0.0:
		return {}
	return { "f": card_f, "scale": s, "alpha": clampf(a, 0.0, 1.0) }


func _card_end() -> float:
	var B: Dictionary = cfg
	return B.CARD_DELAY + float(B.CARD_SCALES.size()) / Config.fps + B.CARD_HOLD + B.CARD_FADE


func _line_time() -> float:
	var B: Dictionary = cfg
	return String(B.LINE).length() / B.LINE_CPS + B.LINE_HOLD


## 철견 대사 { text, t, cps } — 등장 대사 또는 결전 "아직이다!"
func line_state() -> Dictionary:
	if not _say.is_empty():
		return { "text": _say.text, "t": _say.t, "cps": 30.0 }
	if resume or intro_t < 0.0 or fight:
		return {}
	var lt := intro_t - _card_end()
	if lt < 0.0 or lt > _line_time():
		return {}
	return { "text": cfg.LINE, "t": lt, "cps": cfg.LINE_CPS }


# ---------------------------------------------------------------- 갱신
func _physics_process(delta: float) -> void:
	if dead:
		return
	var main := _main()
	var player := _player()
	if main == null or player == null:
		return
	_intro_tick(main, player)
	if TimeManager.frozen:
		queue_redraw()
		return
	var B: Dictionary = cfg
	t += delta
	if not _say.is_empty():
		_say.t += delta
		if _say.t > _say.dur:
			_say = {}
	_decay_posture(delta)
	var turnable := state in ["intro", "rest", "burst", "ricochet", "kick_approach", "throw", "flash", "rally", "block"]
	if turnable:
		var dx := player.center().x - center().x
		if absf(dx) > 2.0:
			facing = 1 if dx > 0.0 else -1
	_track_guns(player, main)
	match state:
		"intro", "block":
			walk(0, 0.0, B.accel, delta)
			if state == "block" and t >= B.FINALE_LINE_TIME:
				_start_rally()
		"rest":
			walk(0, 0.0, B.accel, delta)
			if not _react_kick(player) and not player.dead and not main.seq_active and t >= _rest:
				_start_pattern(_choose_pattern(player))
		"burst", "ricochet", "rally":
			walk(0, 0.0, B.accel, delta)
			if state == "rally" or not _react_kick(player):
				_bullets_tick(main, player)
		"flash":
			walk(0, 0.0, B.accel, delta)
			_bullets_tick(main, player)
		"rush":
			# 달려듦: 닿을 거리까지 (최대 RUSH_MAX 초)
			var gap: float = absf(player.center().x - center().x) - (cfg.w + Config.player.w) / 2.0
			if gap <= B.WHIP_REACH or t >= B.RUSH_MAX or not can_step(facing):
				_start_whip_strikes()
			else:
				velocity.x = facing * B.RUSH_SPEED
		"whip":
			walk(0, 0.0, B.accel * 2.0, delta)
			_whip_tick(player)
		"kick_approach":
			var d := absf(player.center().x - center().x)
			if d <= B.KICK_RANGE * 0.8 or t >= B.KICK_APPROACH_MAX or not can_step(facing):
				set_state("kick_windup")
			else:
				walk(facing, B.KICK_APPROACH_SPEED, B.accel, delta)
		"kick_windup":
			walk(0, 0.0, B.accel * 2.0, delta)
			if t >= B.KICK_WINDUP:
				set_state("kick")
		"kick":
			if t >= B.KICK_ACTIVE:
				set_state("kick_recover")
		"kick_recover":
			walk(0, 0.0, B.accel, delta)
			if t >= B.KICK_RECOVER:
				_end_pattern(0.5)
		"throw":
			walk(0, 0.0, B.accel, delta)
			if not _thrown and t >= B.GRENADE_WINDUP:
				_thrown = true
				_do_throw(main, player)
			if t >= B.GRENADE_WINDUP + B.GRENADE_RECOVER:
				if _throw == "flash":
					set_state("flash")      # 섬광이 터지면 (on_flash_pop) 3연발 예약
				else:
					_end_pattern()
		"jump":
			var u := clampf(t / B.JUMP_TIME, 0.0, 1.0)
			var from: Vector2 = _jump.from
			var to: Vector2 = _jump.to
			var h: float = B.JUMP_HEIGHT + maxf(0.0, from.y - to.y)
			global_position = from.lerp(to, u) + Vector2(0, -h * 4.0 * u * (1.0 - u))
			velocity = Vector2.ZERO
			if u >= 1.0:
				_go_rest(B["P%d_REST" % mini(phase, 3)])
			queue_redraw()
			return
		"stun":
			walk(0, 0.0, B.accel * 0.5, delta)
			if t >= _stun:
				_end_pattern(0.4)
		"groggy":
			walk(0, 0.0, B.accel * 2.0, delta)
			if t >= B.BOSS_STAGGER_TIME:
				set_state("rise")
		"rise":
			walk(0, 0.0, B.accel, delta)
			if t >= B.GROGGY_RISE:
				posture = 0.0
				_go_rest(B["P%d_REST" % mini(phase, 3)])
		"roar":
			walk(0, 0.0, B.accel, delta)
			if t >= B.ROAR_TIME:
				_begin_phase(4 - hp)
	apply_physics(delta)
	queue_redraw()


## 등장 연출 (실제 시간)
func _intro_tick(main: Node, player: Player) -> void:
	if intro_t < 0.0:
		return
	var B: Dictionary = cfg
	var prev := intro_t
	intro_t += 1.0 / Config.fps
	if prev == 0.0:
		player.input_locked = true
	if prev < B.INTRO_LOCK and intro_t >= B.INTRO_LOCK and not main.seq_active:
		player.input_locked = false
	if resume:
		if intro_t >= B.RESUME_DELAY:
			intro_t = -1.0
			_begin_phase(phase)
		return
	if card_f >= 0:
		card_f += 1
	elif intro_t >= B.CARD_DELAY:
		card_f = 0
		Audio.boss_intro()
		main.add_shake(B.CARD_SHAKE, 0.25, PI / 2.0)
		if Settings.on("screen_flash"):
			main.screen_fx.flash()
	if intro_t >= _card_end() + _line_time():
		intro_t = -1.0
		_begin_phase(phase)


## 페이즈 시작 (= 체크포인트). 4 = 결전 (체력 1 처형을 막아냄 → 핑퐁)
func _begin_phase(p: int) -> void:
	phase = clampi(p, 1, 4)
	fight = true
	GameState.boss_checkpoint = { "key": GameState.room_key(), "phase": phase }
	_cancel_bullets()
	pattern = 0
	posture = 0.0
	if phase == 4:
		hp = 1
		set_state("block")
		say(cfg.FINALE_LINE, cfg.FINALE_LINE_TIME)
		return
	_go_rest(cfg.FIRST_DELAY)


func say(text: String, dur: float) -> void:
	_say = { "text": text, "t": 0.0, "dur": dur }


func _go_rest(time: float) -> void:
	set_state("rest")
	_rest = time
	pattern = 0


## 패턴 끝 → 휴식 (rest_mul = 휴식 배율)
func _end_pattern(rest_mul := 1.0) -> void:
	last_pattern = pattern if pattern != 0 else last_pattern
	if phase == 2 and pattern == 1 and cfg.P2_JUMP and _perches.size() > 1:
		pattern = 0
		_start_jump()
		return
	_go_rest(cfg["P%d_REST" % mini(phase, 3)] * rest_mul)


# ---------------------------------------------------------------- 패턴 선택
func _choose_pattern(player: Player) -> int:
	var B: Dictionary = cfg
	if forced > 0:
		var f := forced
		forced = 0
		return f
	var allowed: Array = B["P%d_PATTERNS" % mini(phase, 3)].duplicate()
	if allowed.size() > 1:
		allowed.erase(last_pattern)              # 같은 패턴 2번 연속 금지
	var dist := absf(player.center().x - center().x)
	var near: bool = dist <= B.NEAR_DIST
	var weights: Dictionary = B.NEAR_WEIGHTS if near else B.FAR_WEIGHTS
	var pool := []
	for n in allowed:
		var w: int = weights.get(n, 1)
		if (n == 2 or n == 3) and not near:
			w = 0                                 # 난타 · 발차기는 가까울 때만
		if n == 4 and _ricochet_surfaces(player).is_empty():
			w = 0                                 # 튕길 벽 · 천장이 없으면 도탄 안 함
		for i in w:
			pool.append(n)
	if pool.is_empty():
		pool = [1]
	return pool[randi() % pool.size()]


func _start_pattern(n: int) -> void:
	pattern = n
	match n:
		1: _start_burst()
		2: set_state("rush")
		3: set_state("kick_approach")
		4: _start_ricochet()
		5, 6:
			_throw = "grenade" if n == 5 else "flash"
			_thrown = false
			_popped = false
			set_state("throw")
		7: _start_rally()


## 가까이 붙으면 발차기 (직전 패턴이 발차기면 대신 난타)
func _react_kick(player: Player) -> bool:
	if player.dead or player.input_locked:
		return false
	var B: Dictionary = cfg
	var d := player.center() - center()
	if absf(d.x) > B.KICK_RANGE or absf(d.y) > B.KICK_HEIGHT:
		return false
	_cancel_bullets()
	facing = 1 if d.x >= 0.0 else -1
	if last_pattern == 3 and pattern != 3:
		pattern = 2
		_start_whip_strikes()
	else:
		pattern = 3
		set_state("kick_windup")
	return true


# ---------------------------------------------------------------- 총 · 탄
func _track_guns(player: Player, main: Node) -> void:
	var wt := TimeManager.world_time
	for g in GUNS:
		var b := _next_bullet(g)
		var target := (player.center() - pivot(g)).angle()
		if not b.is_empty() and b.kind == "ricochet":
			var path := _ricochet_path(player, g)
			if wt < b.fire_t - cfg.AIM_LOCK_TIME and not path.is_empty():
				b.aim = path.aim
				b.bounce = path.bounce
				b.dir2 = path.dir2
			gun_aim[g] = b.aim
			continue
		if b.is_empty() or wt < b.fire_t - cfg.AIM_LOCK_TIME:
			gun_aim[g] = target
			if not b.is_empty():
				b.aim = target
		else:
			gun_aim[g] = b.aim
	match state:
		"roar", "groggy", "rise", "intro", "stun":
			gun_aim = [PI / 2.0 + 0.3 * -facing, PI / 2.0 + 0.5 * -facing]   # 총을 늘어뜨림
		"whip":
			gun_aim = [_whip_arm_angle(), PI / 2.0 + 0.5 * -facing]
		"throw":
			gun_aim = [(-PI * 0.8 if facing > 0 else -PI * 0.2), PI / 2.0 + 0.5 * -facing]
	for g in GUNS:
		_laser_end[g] = main.raycast_wall(muzzle(g), gun_aim[g], Config.shot.RANGE)


func _new_bullet(gun: int, fire_t: float, aim_time: float, kind: String, final: bool) -> Dictionary:
	return { "gun": gun, "fire_t": fire_t, "aim": gun_aim[gun], "aim_time": aim_time, "final": final,
		"fired": false, "kind": kind, "rally": rally_i, "cocked": false, "bounce": Vector2.ZERO, "dir2": Vector2.ZERO }


## ① 리듬 연사
func _start_burst() -> void:
	var B: Dictionary = cfg
	var options: Array = B["P%d_BURSTS" % mini(phase, 3)]
	var gaps: Array = options[randi() % options.size()]
	var ft: float = TimeManager.world_time + B.AIM_TIME
	_cancel_bullets()
	for i in gaps.size() + 1:
		if i > 0:
			ft += float(gaps[i - 1])
		var gun := (i % 2) if (phase == 3 and B.P3_ALTERNATE) else 0
		bullets.append(_new_bullet(gun, ft, B.AIM_TIME, "burst", i == gaps.size()))
	_fake = phase == 3 and randf() < B.P3_FAKE_CHANCE
	set_state("burst")


## ④ 도탄: 튕길 면(옆 벽 · 천장) 하나를 골라 그 면에 튕겨 플레이어에게 가는 경로로 조준
func _start_ricochet() -> void:
	var p := _player()
	var options := _ricochet_surfaces(p)
	if options.is_empty():
		_start_burst()
		pattern = 1
		return
	_rico_wall = options[randi() % options.size()]
	_cancel_bullets()
	var b := _new_bullet(0, TimeManager.world_time + cfg.AIM_TIME, cfg.AIM_TIME, "ricochet", true)
	var path := _ricochet_path(p, 0)
	b.aim = path.aim
	b.bounce = path.bounce
	b.dir2 = path.dir2
	bullets.append(b)
	set_state("ricochet")


## 지금 도탄이 가능한 면들
func _ricochet_surfaces(p: Player) -> Array:
	var out := []
	for w in [-1, 1, 2]:
		if not _ricochet_path(p, 0, w).is_empty():
			out.append(w)
	return out


## 도탄 경로 { aim, bounce, dir2 } — 거울 반사 (면에 대해 플레이어를 뒤집은 점을 겨냥). 막히면 빈 Dictionary
## surface: -1 왼쪽 벽 · 1 오른쪽 벽 · 2 천장 (0 = 지금 고른 면). 면의 위치는 플레이어에서 그쪽으로 쏜 레이로 찾음
func _ricochet_path(p: Player, g: int, surface := 0) -> Dictionary:
	var main := _main()
	if main == null or p == null:
		return {}
	var wall := surface if surface != 0 else _rico_wall
	var pv := pivot(g)
	var target := p.center()
	var mirror: Vector2
	var dir: Vector2
	var bounce: Vector2
	if wall == 2:
		var mid := Vector2((pv.x + target.x) / 2.0, minf(pv.y, target.y))
		var cy: float = main.raycast_wall(mid, -PI / 2.0, 2000.0).y
		mirror = Vector2(target.x, 2.0 * cy - target.y)
		dir = (mirror - pv).normalized()
		if dir.y > -sin(deg_to_rad(cfg.RICOCHET_MIN_ANGLE)):
			return {}
		bounce = pv + dir * ((cy - pv.y) / dir.y)
	else:
		var wx: float = main.raycast_wall(target, PI if wall < 0 else 0.0, 2000.0).x
		mirror = Vector2(2.0 * wx - target.x, target.y)
		dir = (mirror - pv).normalized()
		if signf(dir.x) != float(wall) or absf(dir.x) < sin(deg_to_rad(cfg.RICOCHET_MIN_ANGLE)):
			return {}
		bounce = pv + dir * ((wx - pv.x) / dir.x)
		if bounce.y < 4.0 or bounce.y > p.global_position.y:
			return {}
	var dir2 := Vector2(dir.x, -dir.y) if wall == 2 else Vector2(-dir.x, dir.y)
	var m := pv + dir * float(cfg.GUN_LENGTH)
	# 첫 줄이 정말 그 면에 닿는가 (다른 지형에 먼저 막히지 않는가), 튕긴 줄이 플레이어까지 트였는가
	var hit: Vector2 = main.raycast_wall(m, dir.angle(), 2000.0)
	if hit.distance_to(bounce) > 3.0:
		return {}
	if not main.line_of_sight(bounce + dir2 * 0.5, target):
		return {}
	# 첫 줄이 플레이어 몸을 지나면 안 됨 (튕기기 전에 맞아 버림)
	if main.seg_rect_t(m, bounce, p.body_rect().grow(6.0)) >= 0.0:
		return {}
	return { "aim": dir.angle(), "bounce": bounce, "dir2": dir2 }


## 탄 발사 · 가짜 조준 · 섬광 장전음
func _bullets_tick(main: Node, player: Player) -> void:
	var B: Dictionary = cfg
	var wt := TimeManager.world_time
	if state == "burst" and _fake and not bullets.is_empty() and not bullets[0].fired:
		var rem: float = bullets[0].fire_t - wt
		if rem <= B.AIM_TIME * (1.0 - B.FAKE_CANCEL_AT):
			_cancel_bullets(true)
			_end_pattern()
			return
	for b in bullets:
		if b.kind == "flash" and not b.cocked and wt >= b.fire_t - B.COCK_LEAD:
			b.cocked = true
			Audio.sfx("gun_cock", "SFX_GUN_COCK", 1.0, true)     # 섬광 중에도 장전음만 선명하게
		if not b.fired and wt >= b.fire_t:
			b.fired = true
			gun_aim[b.gun] = b.aim
			if b.kind == "ricochet":
				main.fire_boss_ricochet(self, b)
			else:
				main.fire_boss_shot(self, b)
	var all_fired := true
	for b in bullets:
		all_fired = all_fired and b.fired
	if all_fired and state != "rally":
		bullets.clear()
		if state == "flash":
			# 섬광이 터지고 하얀 화면이 끝날 때까지 기다림 (안 터지면 3초 뒤 포기)
			if (_popped and main.whiteout <= 0.0) or (not _popped and t > 3.0):
				_end_pattern()
		else:
			_end_pattern()


## 연사 취소: 보이던 원은 흩어짐
func _cancel_bullets(scatter := true) -> void:
	var main := _main()
	if scatter and main != null:
		for i in approach_infos():
			main.effects.approach_scatter(i.pos, Effects.approach_radius(i.remaining, i.aim_time), Config.colors.attack)
	bullets.clear()


func _start_jump() -> void:
	var here := global_position
	var options := []
	for p in _perches:
		if p.distance_to(here) > 24.0:
			options.append(p)
	if options.is_empty():
		_go_rest(cfg.P2_REST)
		return
	_jump = { "from": here, "to": options[randi() % options.size()] }
	set_state("jump")


# ---------------------------------------------------------------- ② 권총 난타
func _start_whip_strikes() -> void:
	var B: Dictionary = cfg
	var T1: float = B.WHIP_TELEGRAPH
	var T2: float = T1 + B.WHIP_GAPS[0]
	var T3: float = T2 + B.WHIP_GAPS[1]
	_whip = { "times": [T1, T2, T3], "parried": [false, false, false], "swung": [false, false, false] }
	velocity.x = 0.0
	set_state("whip")


func _whip_tick(player: Player) -> void:
	var B: Dictionary = cfg
	for i in 3:
		var T: float = _whip.times[i]
		# 타격 예고가 시작될 때 방향 고정
		if t >= T - B.WHIP_TELEGRAPH and t < T - B.WHIP_TELEGRAPH + 1.0 / Config.fps * 1.5:
			var dx := player.center().x - center().x
			if absf(dx) > 2.0:
				facing = 1 if dx > 0.0 else -1
		if not _whip.swung[i] and t >= T:
			_whip.swung[i] = true
			if not _whip.parried[i]:
				Audio.sfx("pistol_whip")
	if t >= _whip.times[2] + B.WHIP_ACTIVE + B.WHIP_RECOVER:
		_whip = {}
		_end_pattern()


## 지금 권총이 빨갛게 점멸하는가 (각 타격 0.3초 전부터)
func _whip_telegraph() -> bool:
	if state != "whip" or _whip.is_empty():
		return false
	for i in 3:
		var T: float = _whip.times[i]
		if not _whip.parried[i] and t >= T - cfg.WHIP_TELEGRAPH and t < T + cfg.WHIP_ACTIVE:
			return true
	return false


## 팔 각도 (난타): 예고 = 뒤로 젖힘, 3타 전 긴 멈칫 = 크게 치켜듦, 타격 = 앞으로 내려침
func _whip_arm_angle() -> float:
	if _whip.is_empty():
		return 0.0
	var a := -0.3
	for i in 3:
		var T: float = _whip.times[i]
		if t >= T and t < T + cfg.WHIP_ACTIVE + 0.06:
			a = 0.7                                # 내려침
		elif t < T and t >= T - cfg.WHIP_TELEGRAPH:
			a = -2.4 if i == 2 else -1.4           # 치켜듦 (3타는 크게)
	if t >= _whip.times[1] + cfg.WHIP_ACTIVE + 0.06 and t < _whip.times[2] - cfg.WHIP_TELEGRAPH:
		a = -2.4
	return a if facing > 0 else PI - a


## 난타 패링됨. 3타면 크게 튕겨남 → 반환 = 그 타격 번호
func on_whip_parried(i: int) -> void:
	_whip.parried[i] = true
	if i == 2:
		_whip = {}
		velocity.x = -facing * float(cfg.WHIP_KNOCKBACK)
		_stun = cfg.WHIP_KNOCK_STUN
		set_state("stun")


# ---------------------------------------------------------------- ⑤ 수류탄 · ⑥ 섬광탄
func _do_throw(main: Node, player: Player) -> void:
	var B: Dictionary = cfg
	var from := pivot(0) + Vector2(facing * 4.0, -4.0)
	Audio.sfx("grenade_pin", "SFX_GRENADE_PIN")
	if _throw == "grenade":
		main.spawn_grenade("grenade", from, player.global_position + Vector2(0, -2), B.GRENADE_FLIGHT)
	else:
		var mid := (from + player.center()) / 2.0 + Vector2(0, -20)
		main.spawn_grenade("flash", from, mid, B.FLASH_POP)


## 섬광이 터짐: 3연발 예약 (장전음 0.5초 뒤 발사)
func on_flash_pop() -> void:
	if state != "flash" and state != "throw":
		return
	set_state("flash")
	_popped = true
	var B: Dictionary = cfg
	var wt := TimeManager.world_time
	_cancel_bullets(false)
	for i in B.FLASH_SHOTS.size():
		bullets.append(_new_bullet(0, wt + float(B.FLASH_SHOTS[i]), B.AIM_TIME, "flash", false))


## 되친 수류탄이 근처에서 폭발: 자세 +40 (Main 이 더함) + 경직 1초
func on_grenade_hit() -> void:
	_cancel_bullets()
	_stun = cfg.GRENADE_STUN
	if state != "groggy":
		set_state("stun")


# ---------------------------------------------------------------- ⑦ 핑퐁 결투
func _start_rally() -> void:
	pattern = 7
	rally_i = 0
	_cancel_bullets(false)
	set_state("rally")
	bullets.append(_new_bullet(0, TimeManager.world_time + float(cfg.RALLY_AIM[0]), float(cfg.RALLY_AIM[0]), "rally", false))


## 플레이어가 받아친 탄을 철견이 권총으로 되받아침 → 다음 랠리 (원이 더 빨리 줄어듦)
func rally_return() -> void:
	if dead or state != "rally":
		return
	rally_i += 1
	var at: float = cfg.RALLY_AIM[mini(rally_i, cfg.RALLY_AIM.size() - 1)]
	var final: bool = rally_i >= cfg.RALLY_AIM.size() - 1
	bullets.clear()
	var b := _new_bullet(0, TimeManager.world_time + at, at, "rally", final)
	b.rally = rally_i
	bullets.append(b)


# ---------------------------------------------------------------- 자세 · 그로기 · 처형
func add_posture(n: float) -> void:
	if invincible or dead:
		return
	_last_parry_t = TimeManager.world_time
	if state in ["groggy", "rise", "roar", "block", "intro"] or pattern == 7:
		return
	posture = minf(cfg.POSTURE_MAX, posture + n)
	if posture >= cfg.POSTURE_MAX:
		_start_groggy()


func _decay_posture(delta: float) -> void:
	if state in ["groggy", "rise"]:
		return
	if TimeManager.world_time - _last_parry_t > cfg.POSTURE_DECAY_DELAY:
		posture = maxf(0.0, posture - cfg.POSTURE_DECAY * delta)


func _start_groggy() -> void:
	_cancel_bullets()
	_whip = {}
	pattern = 0
	set_state("groggy")
	Audio.sfx("stagger", "SFX_STAGGER")


## 처형 (그로기 중 베임): "phase" = 체력 -1 → 포효 → 다음 페이즈 / "finale" = 체력 1 처형을 막아냄 → 결전 / "" = 안 됨
func execute() -> String:
	if state != "groggy":
		return ""
	if invincible:
		posture = 0.0
		set_state("rise")
		return "blocked"
	if hp <= 1:
		posture = 0.0
		_begin_phase(4)
		return "finale"
	hp -= 1
	cracks += 1
	posture = 0.0
	set_state("roar")
	Audio.boss_intro(cfg.ROAR_VOL)
	var main := _main()
	if main != null:
		main.add_shake(cfg.ROAR_SHAKE, 0.3, -PI / 2.0)
	return "phase"


## 반사탄 명중 (체력은 그대로): 자세 +30 + 잠깐 움찔
func on_reflect_hit() -> void:
	_cancel_bullets()
	add_posture(cfg.POSTURE_FULL)
	if state != "groggy":
		_stun = cfg.FULL_HIT_FLINCH
		set_state("stun")


## 직접 베기 (그로기 아님): 장갑에 막힘 — 같은 베기에 한 번만
func on_slashed(p: Player) -> bool:
	if p.last_slash_t == _last_clang:
		return false
	_last_clang = p.last_slash_t
	return true


# ---------------------------------------------------------------- 디버그
## F8: 페이즈 1 → 2 → 3 → 결전
func debug_next_phase() -> void:
	var p := phase % 4 + 1
	hp = maxi(1, int(cfg.BOSS_CHEOLGYEON_HP) - (p - 1))
	cracks = mini(p - 1, 3)
	intro_t = -1.0
	card_f = -1
	_cancel_bullets(false)
	_begin_phase(p)


## F10: 패턴 ① ~ ⑦ 차례로 강제 실행
func debug_force_pattern() -> int:
	_debug_pat = _debug_pat % 7 + 1
	forced = _debug_pat
	var f := forced
	if state in ["rest", "burst", "ricochet", "flash", "stun", "kick_recover", "whip", "rally"]:
		_cancel_bullets(false)
		_whip = {}
		forced = 0
		_start_pattern(f)
	return f


# ---------------------------------------------------------------- 그리기
func gun_parts(g: int) -> Array:
	var base := Transform2D(0.0, Vector2(facing, 1), 0.0, Vector2.ZERO)
	var a: float = gun_aim[g]
	var local_aim: float = a if facing > 0 else PI - a
	var pv := Vector2(7.0 if g == 0 else -5.0, -25.0)
	return [{ "xf": base * Transform2D(local_aim, pv), "shapes": _gun_shapes(), "body": Config.colors.enemy_weapon, "rim": Config.colors.enemy_rim }]


static func _gun_shapes() -> Array:
	return [["rect", Rect2(3, -1.5, 6, 3)], ["rect", Rect2(4, 1, 2, 3)], ["rect", Rect2(9, -1, 2, 2)]]


func _draw_pose() -> void:
	var col: Dictionary = Config.colors
	var B: Dictionary = cfg
	var base := Transform2D(0.0, Vector2(facing, 1), 0.0, Vector2.ZERO)
	if not capturing() and not _whited():
		_draw_lasers(col)
	var cr := _crouch()
	if state != "dead":
		_draw_arm(1, base, col)
	set_xf(base)
	# 다리: 발차기 예고 · 발차기 중 보라색 (패링 불가)
	var leg_body: Color = col.enemy_body
	var leg_rim: Color = col.enemy_rim
	if is_kicking() and not capturing():
		var pulse := 0.6 + 0.4 * sin(t * 40.0)
		leg_rim = col.unparryable
		leg_body = col.enemy_body.lerp(col.unparryable, 0.35 * pulse)
		draw_rect(Rect2(-8, -13, 16, 13).grow(1.5), Color(col.unparryable, 0.25 * pulse))
	var legs := []
	match state:
		"kick":
			legs = [["rect", Rect2(-7, -11, 5, 11)], ["poly", PackedVector2Array([Vector2(1, -12), Vector2(5, -12), Vector2(20, -7), Vector2(20, -3), Vector2(1, -6)])]]
		"kick_windup":
			legs = [["rect", Rect2(-7, -11, 5, 11)], ["poly", PackedVector2Array([Vector2(0, -12), Vector2(4, -12), Vector2(-4, -4), Vector2(-8, -5)])]]
		"jump":
			legs = [["rect", Rect2(-7, -12, 5, 8)], ["rect", Rect2(2, -12, 5, 6)]]
		"groggy":
			# 무릎 꿇음: 앞 무릎은 바닥, 뒤 다리는 접힘
			legs = [["rect", Rect2(-9, -5, 9, 5)], ["rect", Rect2(2, -9, 5, 9)]]
		_:
			legs = [["rect", Rect2(-7, -12, 5, 12)], ["rect", Rect2(2, -12, 5, 12)]]
	draw_rimmed(legs, leg_body, leg_rim)
	var head_up := -3.0 if state == "roar" else (2.0 if state == "groggy" else 0.0)
	var body_y := cr
	draw_rimmed([
		["poly", PackedVector2Array([Vector2(-13, -31 + body_y), Vector2(13, -31 + body_y), Vector2(11, -22 + body_y), Vector2(7, -12 + body_y * 0.6), Vector2(-7, -12 + body_y * 0.6), Vector2(-11, -22 + body_y)])],
		["poly", PackedVector2Array([Vector2(-15, -33 + body_y), Vector2(-6, -33 + body_y), Vector2(-6, -27 + body_y), Vector2(-14, -27 + body_y)])],
		["poly", PackedVector2Array([Vector2(6, -33 + body_y), Vector2(15, -33 + body_y), Vector2(14, -27 + body_y), Vector2(6, -27 + body_y)])],
		["poly", PackedVector2Array([Vector2(-4, -39 + body_y + head_up), Vector2(4, -39 + body_y + head_up), Vector2(6, -33 + body_y), Vector2(-4, -33 + body_y)])],
		["poly", PackedVector2Array([Vector2(4, -37 + body_y + head_up), Vector2(8, -35 + body_y + head_up), Vector2(5, -33 + body_y)])],
	], col.enemy_body, col.enemy_rim)
	var mk := Vector2(10.5, -30.0 + body_y)
	if not capturing():
		draw_colored_polygon(PackedVector2Array([mk + Vector2(-2, -1), mk + Vector2(2, -1), mk + Vector2(0, 2)]), col.enemy_rim)
	var pr := Rect2(-5, -26 + body_y, 11, 8)
	if not capturing():
		draw_rect(pr.grow(1.0), B.PLATE_RIM)
		draw_rect(pr, B.PLATE)
		_draw_cracks(pr)
	else:
		draw_rimmed([["rect", pr]], B.PLATE, B.PLATE_RIM)
	if state != "dead":
		_draw_arm(0, base, col)
	set_xf(Transform2D.IDENTITY)
	# 그로기: 머리 위 흰색 "처형" 깜빡임
	if state == "groggy" and not capturing() and fmod(t, 0.3) < 0.2:
		var hy := -48.0 + cr
		draw_rect(Rect2(-14, hy - 6, 28, 12), Color(0, 0, 0, 0.5))
		Fonts.text(self, "처형", Vector2(0, hy), 9, Color.WHITE, "center", false, true)


func _draw_lasers(col: Dictionary) -> void:
	var B: Dictionary = cfg
	var wt := TimeManager.world_time
	for g in GUNS:
		var b := _next_bullet(g)
		if b.is_empty() or b.kind == "flash":
			continue
		var at: float = b.aim_time
		var rem: float = b.fire_t - wt
		if rem > at:
			continue
		var tt: float = at - rem
		var k := clampf(tt / lock_time(at), 0.0, 1.0)
		var c: Color = col.attack
		c.a = lerpf(B.LASER_ALPHA_MIN, 1.0, k)
		var width := 1.0 if k < 0.5 else 2.0
		if tt >= lock_time(at):
			var lt := tt - lock_time(at)
			var period: float = B.LOCK_BLINK_TIME * 2.0
			if lt < period * B.LOCK_BLINKS and fmod(lt, period) < B.LOCK_BLINK_TIME:
				c = Color.WHITE
			c.a = 1.0
			width = 2.0
		if b.kind == "ricochet":
			# 꺾인 조준선: 총구 → 벽 (작은 빨간 점) → 플레이어 쪽
			var main := _main()
			var end2: Vector2 = main.raycast_wall(b.bounce + b.dir2 * 0.5, b.dir2.angle(), Config.shot.RANGE) if main != null else b.bounce
			draw_line(to_local(muzzle(g)), to_local(b.bounce), c, width)
			draw_line(to_local(b.bounce), to_local(end2), c, width)
			draw_rect(Rect2(to_local(b.bounce).round() - Vector2(1.5, 1.5), Vector2(3, 3)), col.attack)
		else:
			draw_line(to_local(muzzle(g)), to_local(_laser_end[g]), c, width)


func _draw_arm(g: int, base: Transform2D, col: Dictionary) -> void:
	var a: float = gun_aim[g]
	var local_aim: float = a if facing > 0 else PI - a
	if state == "roar":
		local_aim = -PI / 2.0 - (0.5 if g == 0 else 1.1)
	var pv := Vector2(7.0 if g == 0 else -5.0, -25.0 + _crouch())
	set_xf(base * Transform2D(local_aim, pv))
	draw_rimmed([["rect", Rect2(-1, -1.5, 5, 3)]], col.enemy_body, col.enemy_rim)
	# 난타 예고: 권총이 빨갛게 점멸 (빨강 = 패링 가능)
	if g == 0 and _whip_telegraph() and not capturing() and fmod(t, 0.1) < 0.06:
		draw_rimmed(_gun_shapes(), col.attack, Color(col.attack, 0.5))
	else:
		draw_rimmed(_gun_shapes(), col.enemy_weapon, col.enemy_rim)
	if (state == "burst" or state == "ricochet" or state == "rally") and not capturing() and not _whited():
		var b := _next_bullet(g)
		if not b.is_empty():
			var tt: float = b.aim_time - (b.fire_t - TimeManager.world_time)
			if tt >= lock_time(b.aim_time):
				var u := clampf((tt - lock_time(b.aim_time)) / cfg.AIM_LOCK_TIME, 0.0, 1.0)
				draw_circle(Vector2(11, 0), 1.0 + u * 1.5, col.attack)
	set_xf(base)


func _draw_cracks(pr: Rect2) -> void:
	var c: Color = cfg.CRACK
	var o := pr.position
	var lines := [
		[Vector2(5, 0), Vector2(4, 3), Vector2(6, 5), Vector2(5, 8)],
		[Vector2(4, 3), Vector2(1, 4), Vector2(0, 6)],
		[Vector2(6, 5), Vector2(9, 4), Vector2(11, 6)],
		[Vector2(1, 0), Vector2(2, 2)],
		[Vector2(9, 0), Vector2(8, 2), Vector2(10, 3)],
		[Vector2(0, 7), Vector2(3, 6)],
	]
	var n := mini(cracks * 2, lines.size())
	for i in n:
		var pts := PackedVector2Array()
		for q in lines[i]:
			pts.append(o + q)
		draw_polyline(pts, c, 1.0)

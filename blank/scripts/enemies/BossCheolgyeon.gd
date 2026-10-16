extends Enemy
class_name BossCheolgyeon
## 1장 보스 "철견" — 하운드 제1 사냥개 부대장, 쌍권총 난사형. 수치는 Config.boss.
## 핵심: 연사의 박자를 읽고 연속으로 받아치는 리듬 패링.
##  - 연사(버스트) = 정해진 간격으로 여러 발. 탄마다 기존 조준선 + 줄어드는 원 (총구 위치), 시간차를 두고 함께 줄어듦
##  - 중간 탄 = 미니 패링 (장갑판에 튕김, 피해 없음) / 마지막 탄 = 풀 패링 (슬로우 시퀀스 → 명중하면 체력 -1)
##  - 40px 안으로 다가오면 0.4초 예고(다리가 보라색 = 패링 불가) 뒤 발차기, 이어서 0.5초 빈틈
##  페이즈 1 (체력 3) 2연발 0.4초, 휴식 1.5 / 페이즈 2 (체력 2) 3연발 0.3 → 0.6, 연사 뒤 다른 발판으로 점프, 휴식 1.2 /
##  페이즈 3 (체력 1) 4연발 0.3 왼쪽·오른쪽 번갈아, 휴식 1.0, 3번에 1번꼴 가짜 조준
##  체력이 줄면: 경직 1.5초 → 포효 0.8초 (흔들림 4px + boss_intro.wav) → 다음 페이즈 (체크포인트)
## 등장 연출(이름 카드 · 대사)과 체력 칸은 HUD 가 이 노드의 상태를 읽어 그림. 시간은 월드 시간, 등장 연출만 실제 시간.
## 방 안의 "BossPerches" (Marker2D 들) = 점프해서 옮겨 다닐 자리.

const GUNS := 2

var hp := 3
var phase := 1
var invincible := false          ## F9 (패턴 관찰용) — 풀 패링이 명중해도 체력이 줄지 않음
var gun_aim := [PI, PI]          ## 총마다 조준 각도 (전역, 라디안)
var bullets: Array = []          ## 이번 연사 { gun, fire_t, aim, final, fired }
var cracks := 0                  ## 장갑판 금 (맞을 때마다 늘어남)
var fight := false               ## 전투 중 (등장 연출이 끝난 뒤)

# 등장 연출 (실제 시간)
var intro_t := -1.0              ## 들어온 뒤 실제 시간 (-1 = 연출 없음)
var card_f := -1                 ## 이름 카드가 박힌 뒤 실제 틱 (-1 = 아직)
var resume := false              ## 체크포인트 재시작 (카드 · 대사 없이 잠깐 뒤 전투)

var _fake := false               # 이번 연사가 가짜 조준인가
var _rest := 0.0                 # 지금 휴식 길이
var _jump := {}                  # { from, to }
var _perches: Array = []         # 점프 자리 (전역)
var _last_clang := -INF          # 직접 베기로 장갑을 친 베기 (같은 베기에 한 번만)
var _laser_end := [Vector2.ZERO, Vector2.ZERO]


func _ready() -> void:
	var c: Dictionary = Config.boss.duplicate()
	c.gun_length = c.GUN_LENGTH
	_setup(c)
	add_to_group("aimers")
	add_to_group("boss")
	hp = int(c.BOSS_CHEOLGYEON_HP)
	var room := get_parent().get_parent()
	var pn := room.get_node_or_null("BossPerches")
	if pn != null:
		for m in pn.get_children():
			_perches.append(m.global_position)
	# 체크포인트: 죽었다 R → 지금 페이즈 시작부터 (등장 카드 없이)
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
		hp = int(c.BOSS_CHEOLGYEON_HP) - (phase - 1)
		cracks = phase - 1
		resume = true
	set_state("intro")
	intro_t = 0.0


# ---------------------------------------------------------------- 상태 조회 (Main · HUD · Effects)
func pivot(g: int) -> Vector2:
	var x := 7.0 if g == 0 else -5.0
	return global_position + Vector2(x * facing, -25.0)


func muzzle(g: int) -> Vector2:
	return pivot(g) + Vector2.from_angle(gun_aim[g]) * float(cfg.GUN_LENGTH)


## 장갑판 가운데 (반사탄이 맞는 곳, 전역)
func plate_pos() -> Vector2:
	return global_position + Vector2(1.0 * facing, -22.0)


## 이번 풀 패링이 마지막 처치인가 (슬로우 유지 2배)
func is_final_hit() -> bool:
	return hp <= 1 and not invincible


func lock_time() -> float:
	return cfg.AIM_TIME - cfg.AIM_LOCK_TIME


## 연사 탄마다 발사 타이밍 원 (원이 보이기 시작한 탄만 = 발사까지 AIM_TIME 이하)
func approach_infos() -> Array:
	var out := []
	var wt := TimeManager.world_time
	for b in bullets:
		if b.fired:
			continue
		var rem: float = b.fire_t - wt
		if rem > cfg.AIM_TIME:
			continue
		var tt: float = cfg.AIM_TIME - rem
		out.append({ "pos": muzzle(b.gun), "remaining": rem, "aim_time": cfg.AIM_TIME,
			"locked": tt >= lock_time(), "k": clampf(tt / lock_time(), 0.0, 1.0), "parryable": true,
			"fire_t": b.fire_t, "owner": self, "aim": b.aim, "t": tt, "final": b.final })
	return out


## 다음에 쏠 탄 (총마다)
func _next_bullet(g: int) -> Dictionary:
	for b in bullets:
		if not b.fired and b.gun == g:
			return b
	return {}


func is_kicking() -> bool:
	return state == "kick_windup" or state == "kick"


## 발차기 판정 (발차기 순간에만)
func attack_box() -> Rect2:
	if state != "kick":
		return Rect2()
	var kb: Vector2 = cfg.KICK_BOX
	var x: float = global_position.x + (cfg.w / 2.0 - 4.0 if facing > 0 else -cfg.w / 2.0 - kb.x + 4.0)
	return Rect2(Vector2(x, global_position.y - kb.y), kb)


## 등장 카드 { f (박힌 뒤 실제 틱), scale, alpha } — 없으면 빈 Dictionary
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


## 철견 대사 { text, t } — 이름 카드가 사라진 뒤 대사가 끝날 때까지
func line_state() -> Dictionary:
	if resume or intro_t < 0.0 or fight:
		return {}
	var lt := intro_t - _card_end()
	if lt < 0.0 or lt > _line_time():
		return {}
	return { "text": cfg.LINE, "t": lt, "cps": cfg.LINE_CPS }


# ---------------------------------------------------------------- 갱신
func _main() -> Node:
	return get_tree().get_first_node_in_group("game")


func _physics_process(delta: float) -> void:
	if dead:
		return
	var main := _main()
	var player: Player = get_tree().get_first_node_in_group("player")
	if main == null or player == null:
		return
	_intro_tick(main, player)
	if TimeManager.frozen:
		return
	var B: Dictionary = cfg
	t += delta
	if not is_kicking() and state != "jump" and state != "dead":
		var dx := player.center().x - center().x
		if absf(dx) > 2.0:
			facing = 1 if dx > 0.0 else -1
	_track_guns(player)
	match state:
		"intro":
			walk(0, 0.0, B.accel, delta)
		"rest":
			walk(0, 0.0, B.accel, delta)
			if _kick_check(player):
				pass
			elif not player.dead and not main.seq_active and t >= _rest:
				_start_burst()
		"burst":
			walk(0, 0.0, B.accel, delta)
			if not _kick_check(player):
				_burst_tick(main, player)
		"jump":
			var u := clampf(t / B.JUMP_TIME, 0.0, 1.0)
			var from: Vector2 = _jump.from
			var to: Vector2 = _jump.to
			var h: float = B.JUMP_HEIGHT + maxf(0.0, from.y - to.y)
			global_position = from.lerp(to, u) + Vector2(0, -h * 4.0 * u * (1.0 - u))
			velocity = Vector2.ZERO
			if u >= 1.0:
				_go_rest(B["P%d_REST" % phase])
			queue_redraw()
			return
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
				_go_rest(B["P%d_REST" % phase] * 0.5)
		"stagger":
			walk(0, 0.0, B.accel, delta)
			if t >= B.STAGGER_TIME:
				set_state("roar")
				Audio.boss_intro(B.ROAR_VOL)
				main.add_shake(B.ROAR_SHAKE, 0.3, -PI / 2.0)
		"roar":
			walk(0, 0.0, B.accel, delta)
			if t >= B.ROAR_TIME:
				_begin_phase(4 - hp)
	apply_physics(delta)
	queue_redraw()


## 등장 연출 (실제 시간): 입력 0.5초 잠금 → 이름 카드 "쾅" → 대사 → 전투 / 체크포인트 재시작은 잠깐 뒤 전투
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
		# 이름 카드가 박히는 바로 그 프레임: boss_intro.wav (첫 프레임이 가장 큰 소리) + 흔들림 5px + 흰 섬광 1프레임
		card_f = 0
		Audio.boss_intro()
		main.add_shake(B.CARD_SHAKE, 0.25, PI / 2.0)
		if Settings.on("screen_flash"):
			main.screen_fx.flash()
	if intro_t >= _card_end() + _line_time():
		intro_t = -1.0
		_begin_phase(phase)


## 페이즈 시작 (= 체크포인트)
func _begin_phase(p: int) -> void:
	phase = clampi(p, 1, 3)
	fight = true
	GameState.boss_checkpoint = { "key": GameState.room_key(), "phase": phase }
	bullets.clear()
	_go_rest(cfg.FIRST_DELAY)


func _go_rest(time: float) -> void:
	set_state("rest")
	_rest = time


## 총 조준: 다음 탄의 고정 시각 전까지 플레이어를 따라감 (탄이 없으면 그냥 따라감)
func _track_guns(player: Player) -> void:
	var wt := TimeManager.world_time
	for g in GUNS:
		var b := _next_bullet(g)
		var target := (player.center() - pivot(g)).angle()
		if b.is_empty() or wt < b.fire_t - cfg.AIM_LOCK_TIME:
			gun_aim[g] = target
			if not b.is_empty():
				b.aim = target
		else:
			gun_aim[g] = b.aim
	if state == "roar" or state == "stagger" or state == "intro":
		gun_aim = [PI / 2.0 + 0.3 * -facing, PI / 2.0 + 0.5 * -facing]   # 총을 늘어뜨림


func _start_burst() -> void:
	var B: Dictionary = cfg
	var gaps: Array = B["P%d_GAPS" % phase]
	var t0: float = TimeManager.world_time + B.AIM_TIME
	bullets.clear()
	var ft := t0
	for i in gaps.size() + 1:
		if i > 0:
			ft += float(gaps[i - 1])
		var gun := (i % 2) if (phase == 3 and B.P3_ALTERNATE) else 0
		bullets.append({ "gun": gun, "fire_t": ft, "aim": gun_aim[gun], "final": i == gaps.size(), "fired": false })
	_fake = phase == 3 and randf() < B.P3_FAKE_CHANCE
	set_state("burst")


func _burst_tick(main: Node, player: Player) -> void:
	var B: Dictionary = cfg
	var wt := TimeManager.world_time
	for g in GUNS:
		_laser_end[g] = main.raycast_wall(muzzle(g), gun_aim[g], Config.shot.RANGE)
	# 가짜 조준: 첫 탄의 원이 절반쯤 줄었을 때 연사 전체 취소 (원이 흩어지고 조준선이 꺼짐)
	if _fake and not bullets.is_empty() and not bullets[0].fired:
		var rem: float = bullets[0].fire_t - wt
		if rem <= B.AIM_TIME * (1.0 - B.FAKE_CANCEL_AT):
			cancel_burst(main)
			_go_rest(B.P3_REST)
			return
	for b in bullets:
		if not b.fired and wt >= b.fire_t:
			b.fired = true
			gun_aim[b.gun] = b.aim
			main.fire_boss_shot(self, b.gun, b.aim, b.final)
	var all_fired := true
	for b in bullets:
		all_fired = all_fired and b.fired
	if all_fired:
		bullets.clear()
		if phase == 2 and B.P2_JUMP and _perches.size() > 1:
			_start_jump()
		else:
			_go_rest(B["P%d_REST" % phase])


## 연사 취소 (가짜 조준 · 발차기 · 경직): 보이던 원은 흩어지는 효과와 함께 사라짐
func cancel_burst(main: Node) -> void:
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


## 가까이 오면 발차기 (빈틈 · 경직 · 점프 중 제외)
func _kick_check(player: Player) -> bool:
	if player.dead or player.input_locked:
		return false
	var B: Dictionary = cfg
	var d := player.center() - center()
	if absf(d.x) > B.KICK_RANGE or absf(d.y) > B.KICK_HEIGHT:
		return false
	if not bullets.is_empty():
		cancel_burst(_main())
	facing = 1 if d.x >= 0.0 else -1
	set_state("kick_windup")
	return true


# ---------------------------------------------------------------- 맞음
## 풀 패링 명중 (처치가 아닐 때): 체력 -1, 금 +1, 경직 1.5초 → 포효 → 다음 페이즈
func take_hit() -> void:
	if invincible:
		return
	hp -= 1
	cracks += 1
	if not bullets.is_empty():
		cancel_burst(_main())
	set_state("stagger")


## 직접 베기: 장갑에 막힘 (같은 베기에 한 번만 '깡')
func on_slashed(p: Player) -> bool:
	if p.last_slash_t == _last_clang:
		return false
	_last_clang = p.last_slash_t
	return true


## F8: 페이즈 바로 바꾸기 (1 → 2 → 3)
func debug_next_phase() -> void:
	var p := phase % 3 + 1
	hp = int(cfg.BOSS_CHEOLGYEON_HP) - (p - 1)
	cracks = p - 1
	intro_t = -1.0
	card_f = -1
	if not bullets.is_empty():
		cancel_burst(_main())
	_begin_phase(p)


# ---------------------------------------------------------------- 그리기
## 총 한 자루 실루엣 (처치될 때 공중으로 날아감) — 노드 로컬
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
	# 조준선 (총마다, 다음 탄 기준): 고정 전 빨강 1→2px · 40%→100%, 고정 후 흰색 2번 깜빡
	if state == "burst" and not capturing():
		var wt := TimeManager.world_time
		for g in GUNS:
			var b := _next_bullet(g)
			if b.is_empty():
				continue
			var rem: float = b.fire_t - wt
			if rem > B.AIM_TIME:
				continue
			var tt: float = B.AIM_TIME - rem
			var k := clampf(tt / lock_time(), 0.0, 1.0)
			var c: Color = col.attack
			c.a = lerpf(B.LASER_ALPHA_MIN, 1.0, k)
			var width := 1.0 if k < 0.5 else 2.0
			if tt >= lock_time():
				var lt := tt - lock_time()
				var period: float = B.LOCK_BLINK_TIME * 2.0
				if lt < period * B.LOCK_BLINKS and fmod(lt, period) < B.LOCK_BLINK_TIME:
					c = Color.WHITE
				c.a = 1.0
				width = 2.0
			draw_line(to_local(muzzle(g)), to_local(_laser_end[g]), c, width)
	var crouch := 2.0 if state == "stagger" else 0.0
	var roar := state == "roar"
	# 뒤쪽 팔 + 총 (몸 뒤)
	if state != "dead":
		_draw_arm(1, base, col)
	set_xf(base)
	# 다리: 발차기 예고 · 발차기 중엔 보라색으로 빛남 (패링 불가)
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
		_:
			legs = [["rect", Rect2(-7, -12, 5, 12)], ["rect", Rect2(2, -12, 5, 12)]]
	draw_rimmed(legs, leg_body, leg_rim)
	# 몸통: 넓고 각진 어깨, 역삼각 상체 + 머리(사냥개 투구)
	var head_up := -3.0 if roar else 0.0
	draw_rimmed([
		["poly", PackedVector2Array([Vector2(-13, -31 + crouch), Vector2(13, -31 + crouch), Vector2(11, -22 + crouch), Vector2(7, -12), Vector2(-7, -12), Vector2(-11, -22 + crouch)])],
		["poly", PackedVector2Array([Vector2(-15, -33 + crouch), Vector2(-6, -33 + crouch), Vector2(-6, -27 + crouch), Vector2(-14, -27 + crouch)])],   # 뒤 어깨 갑옷
		["poly", PackedVector2Array([Vector2(6, -33 + crouch), Vector2(15, -33 + crouch), Vector2(14, -27 + crouch), Vector2(6, -27 + crouch)])],      # 앞 어깨 갑옷
		["poly", PackedVector2Array([Vector2(-4, -39 + crouch + head_up), Vector2(4, -39 + crouch + head_up), Vector2(6, -33 + crouch), Vector2(-4, -33 + crouch)])],   # 투구
		["poly", PackedVector2Array([Vector2(4, -37 + crouch + head_up), Vector2(8, -35 + crouch + head_up), Vector2(5, -33 + crouch)])],   # 주둥이 (사냥개)
	], col.enemy_body, col.enemy_rim)
	# 어깨의 하운드 마크 (삼각형)
	var mk := Vector2(10.5, -30.0 + crouch)
	draw_colored_polygon(PackedVector2Array([mk + Vector2(-2, -1), mk + Vector2(2, -1), mk + Vector2(0, 2)]), col.enemy_rim)
	# 가슴 장갑판 + 금 (맞을수록 늘어남)
	var pr := Rect2(-5, -26 + crouch, 11, 8)
	if not capturing():
		draw_rect(pr.grow(1.0), B.PLATE_RIM)
		draw_rect(pr, B.PLATE)
		_draw_cracks(pr)
	else:
		draw_rimmed([["rect", pr]], B.PLATE, B.PLATE_RIM)
	# 앞쪽 팔 + 총
	if state != "dead":
		_draw_arm(0, base, col)
	set_xf(Transform2D.IDENTITY)


func _draw_arm(g: int, base: Transform2D, col: Dictionary) -> void:
	var a: float = gun_aim[g]
	var local_aim: float = a if facing > 0 else PI - a
	if state == "roar":
		local_aim = -PI / 2.0 - (0.5 if g == 0 else 1.1)   # 두 팔을 벌려 들어 올림
	var pv := Vector2(7.0 if g == 0 else -5.0, -25.0 + (2.0 if state == "stagger" else 0.0))
	set_xf(base * Transform2D(local_aim, pv))
	draw_rimmed([["rect", Rect2(-1, -1.5, 5, 3)]], col.enemy_body, col.enemy_rim)   # 팔뚝
	draw_rimmed(_gun_shapes(), col.enemy_weapon, col.enemy_rim)
	# 조준 고정 = "지금 친다": 총구에 작은 빨간 빛
	if state == "burst" and not capturing():
		var b := _next_bullet(g)
		if not b.is_empty():
			var tt: float = cfg.AIM_TIME - (b.fire_t - TimeManager.world_time)
			if tt >= lock_time():
				var u := clampf((tt - lock_time()) / cfg.AIM_LOCK_TIME, 0.0, 1.0)
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
	]
	var n := mini(cracks * 2, lines.size())
	for i in n:
		var pts := PackedVector2Array()
		for q in lines[i]:
			pts.append(o + q)
		draw_polyline(pts, c, 1.0)

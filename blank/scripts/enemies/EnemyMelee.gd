extends Enemy
class_name EnemyMelee
## 근접 적: 크고 각진 몸 + 거대한 식칼.
## idle → (발견) chase → (사거리) windup 0.4초 (무기 빨간 점멸, 방향 고정) → attack (내딛으며 베기) → recover → chase
##
## 돌격병 (variant = "charger", 수치 Config.charger): 공격 2가지를 번갈아 (첫 공격 first_attack)
##  지연 내려치기 (NORMAL) — 무기를 치켜든 채 SLAM_HOLD 멈칫 → 내려침. 빨간 점멸은 내려치기 SLAM_BLINK_LEAD 전부터.
##     멈칫 동안 (패링 창 전) 베면 무기로 막혀 헛스윙 → 일찍 누르면 패링 기회를 놓침. 철견 건카타 3타(지연) 연습
##  몸통 돌진 (EVADE) — 몸 전체가 보라로 CHARGE_GLOW 빛남 → CHARGE_SPEED 로 CHARGE_DIST 직선. 패링 불가 · 베기도 막힘
##     → 구르기 무적으로 뚫고 지나가거나 점프. 끝나면 WINDED 숨 고르기 (무방비 → 베면 처치). 구르기 연습

@export_enum("melee", "charger") var variant := "melee"
@export_enum("default", "slam", "charge") var first_attack := "default"   ## 돌격병 첫 공격 (default = Config.charger.FIRST)
@export var aggro_range := 0.0   ## 0 = 기본값. 작게 하면 플레이어가 가까이 올 때까지 제자리 (방 4: 척탄병 앞에 모여 있음)
@export_multiline var intro_radio := ""   ## 처음 만날 때 무전 (비우면 Config.intro.RADIO 기본값) — 돌격병만

var attack_type := "normal"      ## 이번 공격 종류 (Config.ATK_*) — 보라 EVADE = 패링 불가
var parryable: bool:             # 이번 공격이 패링 가능한가
	get: return attack_type != Config.ATK_EVADE
var next_attack := "slam"        ## 돌격병 다음 공격: slam | charge
var charges := 0                 ## 돌진 횟수 (테스트)
var slams := 0
var _charge_from := 0.0          # 돌진 시작 x


func _ready() -> void:
	var c: Dictionary = (Config.charger if is_charger() else Config.melee).duplicate()
	if aggro_range > 0.0:
		c.aggro_range = aggro_range
	_setup(c)
	if is_charger():
		next_attack = first_attack if first_attack != "default" else String(Config.charger.FIRST)


func is_charger() -> bool:
	return variant == "charger"


func intro_key() -> String:
	return "charger" if is_charger() else ""


func label() -> String:
	return "돌격병" if is_charger() else "근접 적"


## 사망 기록용 공격 이름
func attack_label() -> String:
	if not is_charger():
		return "베기"
	return "몸통 돌진" if state == "charge" else "지연 내려치기"


func _physics_process(delta: float) -> void:
	if dead or TimeManager.frozen or Enemy.intro_hold:
		return
	var player: Player = get_tree().get_first_node_in_group("player")
	if player == null:
		return
	t += delta
	if is_charger():
		_charger_tick(player, delta)
	else:
		_melee_tick(player, delta)
	apply_physics(delta)
	queue_redraw()


func _melee_tick(player: Player, delta: float) -> void:
	var C := cfg
	var d := player.center() - center()
	match state:
		"idle":
			walk(0, 0.0, C.accel, delta)
			if not player.dead and absf(d.x) < C.aggro_range and absf(d.y) < C.aggro_height:
				set_state("chase")
		"chase":
			if player.dead:
				set_state("idle")
			else:
				facing = 1 if d.x >= 0.0 else -1
				var gap: float = absf(d.x) - (C.w + Config.player.w) / 2.0
				if gap <= C.attack_range and absf(d.y) < C.attack_height and is_on_floor():
					set_state("windup")
					attack_type = Config.ATK_EVADE if randf() < C.unparryable_chance else Config.ATK_NORMAL
				else:
					walk(facing, C.speed, C.accel, delta)
		"windup":    # 예고: 방향 고정 — 뒤로 넘어가면 헛친다
			walk(0, 0.0, C.accel * 2.0, delta)
			if t >= C.telegraph:
				set_state("attack")
				if can_step(facing):
					velocity.x = facing * C.lunge
		"attack":
			velocity.x = move_toward(velocity.x, 0.0, 900.0 * delta)
			if not can_step(int(signf(velocity.x))):
				velocity.x = 0.0
			if t >= C.active:
				set_state("recover")
		"recover":
			walk(0, 0.0, C.accel, delta)
			if t >= C.recover:
				set_state("idle" if player.dead else "chase")


# ---------------------------------------------------------------- 돌격병
func _charger_tick(player: Player, delta: float) -> void:
	var C := cfg
	var d := player.center() - center()
	var gap: float = absf(d.x) - (C.w + Config.player.w) / 2.0
	match state:
		"idle":
			walk(0, 0.0, C.accel, delta)
			if not player.dead and absf(d.x) < C.aggro_range and absf(d.y) < C.aggro_height:
				set_state("chase")
		"chase":
			if player.dead:
				set_state("idle")
				return
			facing = 1 if d.x >= 0.0 else -1
			var level := absf(d.y) < 24.0 and is_on_floor()
			if next_attack == "charge" and level and gap <= C.CHARGE_MAX:
				set_state("charge_glow")
				attack_type = Config.ATK_EVADE
				velocity.x = 0.0
			elif next_attack == "slam" and level and gap <= C.SLAM_RANGE:
				set_state("slam_hold")
				attack_type = Config.ATK_NORMAL
			else:
				walk(facing, C.speed, C.accel, delta)
		"slam_hold":     # 치켜든 채 멈칫 (방향 고정)
			walk(0, 0.0, C.accel * 2.0, delta)
			if t >= C.SLAM_HOLD:
				set_state("slam")
				slams += 1
				if can_step(facing):
					velocity.x = facing * C.SLAM_LUNGE
		"slam":
			velocity.x = move_toward(velocity.x, 0.0, 900.0 * delta)
			if not can_step(int(signf(velocity.x))):
				velocity.x = 0.0
			if t >= C.SLAM_ACTIVE:
				set_state("slam_recover")
		"slam_recover":
			walk(0, 0.0, C.accel, delta)
			if t >= C.SLAM_RECOVER:
				next_attack = "charge"
				set_state("idle" if player.dead else "chase")
		"charge_glow":   # 몸 전체 보라 — 방향은 빛나기 시작할 때 고정
			velocity.x = 0.0
			if t >= C.CHARGE_GLOW:
				set_state("charge")
				charges += 1
				_charge_from = global_position.x
		"charge":
			velocity.x = facing * C.CHARGE_SPEED
			var done: bool = absf(global_position.x - _charge_from) >= float(C.CHARGE_DIST)
			if not can_step(facing) or (t > 0.05 and is_on_wall()):
				done = true
			if done:
				velocity.x = 0.0
				set_state("winded")
		"winded":        # 숨 고르기: 무방비
			walk(0, 0.0, C.accel, delta)
			if t >= C.WINDED:
				next_attack = "slam"
				set_state("idle" if player.dead else "chase")


## 지금 칼을 맞대면 패링으로 인정되는가 (공격 중 / 예고 마지막 순간)
func parry_vulnerable() -> bool:
	if not parryable or dead:
		return false
	var early: float = Config.parry.melee_early
	if is_charger():
		return state == "slam" or (state == "slam_hold" and t >= cfg.SLAM_HOLD - early)
	return state == "attack" or (state == "windup" and t >= cfg.telegraph - early)


## 돌격병: 멈칫 (패링 창 전) · 보라 빛남 · 돌진 중엔 베어도 무기 · 몸으로 막아냄 → 헛스윙
func guarding() -> bool:
	if not is_charger() or dead:
		return false
	match state:
		"slam_hold": return t < cfg.SLAM_HOLD - Config.parry.melee_early
		"charge_glow", "charge": return true
	return false


func _front_box(extra_h: float) -> Rect2:
	var hb: Vector2 = cfg.SLAM_HITBOX if is_charger() else cfg.hitbox
	var x: float = global_position.x + (cfg.w / 2.0 - 4.0 if facing > 0 else -cfg.w / 2.0 - hb.x + 4.0)
	return Rect2(Vector2(x, global_position.y - hb.y - extra_h), Vector2(hb.x, hb.y + extra_h))


## 공격 판정 (공격 중일 때만)
func attack_box() -> Rect2:
	if is_charger():
		if state == "slam":
			return _front_box(0.0)
		if state == "charge":
			var hb: Vector2 = cfg.CHARGE_HITBOX
			var x: float = global_position.x + (-hb.x / 2.0 + facing * 4.0)
			return Rect2(Vector2(x, global_position.y - hb.y), hb)
		return Rect2()
	return _front_box(0.0) if state == "attack" else Rect2()


## 예고 중/공격 중 무기가 차지하는 영역 (패링 판정용)
func threat_box() -> Rect2:
	return _front_box(6.0)


# 무기 각도 (오른쪽을 볼 때 기준, 0 = 정면, 음수 = 위쪽)
func _weapon_angle() -> float:
	var C := cfg
	match state:
		"windup":
			var k := minf(1.0, t / (C.telegraph * 0.35))
			return lerpf(-0.5, -2.4, 1.0 - (1.0 - k) * (1.0 - k)) + sin(t * 90.0) * 0.04
		"attack":
			return lerpf(-2.4, 1.1, minf(1.0, t / (C.active * 0.45)))
		"recover":
			return lerpf(1.1, -0.5, minf(1.0, t / C.recover))
		"slam_hold":
			var k := minf(1.0, t / 0.12)
			return lerpf(-0.4, -2.7, 1.0 - (1.0 - k) * (1.0 - k)) + (sin(t * 90.0) * 0.03 if _weapon_hot() else 0.0)
		"slam":
			return lerpf(-2.7, 1.25, minf(1.0, t / (C.SLAM_ACTIVE * 0.45)))
		"slam_recover":
			return lerpf(1.25, -0.4, minf(1.0, t / C.SLAM_RECOVER))
		"charge_glow", "charge":
			return 0.35                               # 무기를 앞으로 낮게 들이밂
		"winded":
			return 0.9 + sin(t * 9.0) * 0.08          # 축 처짐
	return -0.4 + sin(t * 3.0) * 0.05


func _weapon_hot() -> bool:
	if state == "attack" or state == "slam":
		return true
	if state == "windup":
		return int(t / cfg.blink_rate) % 2 == 0 or t > cfg.telegraph - 0.08
	if state == "slam_hold":
		var lead: float = cfg.SLAM_HOLD - cfg.SLAM_BLINK_LEAD
		return t >= lead and (int((t - lead) / Config.melee.blink_rate) % 2 == 0 or t > cfg.SLAM_HOLD - 0.08)
	return false


func _draw_pose() -> void:
	if is_charger():
		_draw_charger()
		return
	var col: Dictionary = Config.colors
	var wa := _weapon_angle()
	var atk: Color = col.attack if parryable else col.unparryable
	var base := Transform2D(0.0, Vector2(facing, 1), 0.0, Vector2.ZERO)
	set_xf(base)
	var cr := 1.0 if state == "windup" else 0.0
	# 몸통 실루엣
	draw_rimmed([
		["rect", Rect2(-7, -8, 6, 8)], ["rect", Rect2(1, -8, 6, 8)],                       # 굵은 다리
		["poly", PackedVector2Array([Vector2(-10, -23 + cr), Vector2(10, -23 + cr), Vector2(9, -16),
			Vector2(6, -8), Vector2(-6, -8), Vector2(-9, -16)])],                             # 역삼각 상체
		["poly", PackedVector2Array([Vector2(-12, -25 + cr), Vector2(-5, -25 + cr), Vector2(-5, -20 + cr), Vector2(-11, -20 + cr)])],  # 각진 어깨 갑옷
		["poly", PackedVector2Array([Vector2(-3, -29 + cr), Vector2(4, -29 + cr), Vector2(5, -23 + cr), Vector2(-4, -23 + cr)])],      # 투구
	], col.enemy_body, col.enemy_rim)
	# 휘두른 궤적 (빨강 반투명 부채꼴)
	if state == "attack" and not capturing():
		_draw_swing(Vector2(7, -17), -2.4, wa, 24.0, 10.0, atk)
	# 무기 (어깨 축으로 회전)
	set_xf(base * Transform2D(wa, Vector2(7, -17)))
	var blade := [
		["rect", Rect2(0, -1, 8, 2)],
		["poly", PackedVector2Array([Vector2(7, -3), Vector2(19, -5), Vector2(23, 0), Vector2(19, 4), Vector2(7, 4)])],
	]
	if _weapon_hot():
		draw_rimmed(blade, atk, Color(atk, 0.35))     # 발광 대신 같은 색 옅은 테두리
	else:
		draw_rimmed(blade, col.enemy_weapon, col.enemy_rim)
	set_xf(Transform2D.IDENTITY)


func _draw_swing(pivot: Vector2, a0: float, a1: float, r_out: float, r_in: float, c: Color) -> void:
	var arc := PackedVector2Array()
	var steps := 12
	for i in steps + 1:
		var a := lerpf(a0, a1, float(i) / steps)
		arc.append(pivot + Vector2(cos(a), sin(a)) * r_out)
	for i in range(steps, -1, -1):
		var a := lerpf(a0, a1, float(i) / steps)
		arc.append(pivot + Vector2(cos(a), sin(a)) * r_in)
	draw_colored_polygon(arc, Color(c, 0.55))


## 돌격병: 근접 적보다 크고 앞으로 숙인 자세, 크고 긴 무기 (자루 + 넓은 날). 돌진 예고 · 돌진 중엔 몸 전체가 보라로 빛남
func _draw_charger() -> void:
	var col: Dictionary = Config.colors
	var C := cfg
	var wa := _weapon_angle()
	var purple: Color = col.unparryable
	var glow := 0.0
	if state == "charge_glow":
		glow = clampf(t / (C.CHARGE_GLOW * 0.5), 0.0, 1.0) * (0.75 + 0.25 * sin(t * 50.0))
	elif state == "charge":
		glow = 1.0
	var body: Color = col.enemy_body.lerp(purple, 0.55 * glow)
	var rim: Color = col.enemy_rim.lerp(purple, glow)
	var base := Transform2D(0.0, Vector2(facing, 1), 0.0, Vector2.ZERO)
	var hunch := 2.0 if state in ["charge_glow", "charge"] else (1.0 if state == "winded" else 0.0)
	var bob := roundf(sin(t * 9.0)) if state == "winded" else 0.0
	# 보라 빛 번짐 (몸 둘레)
	if glow > 0.0 and not capturing():
		set_xf(base)
		draw_rect(Rect2(-13, -33 + hunch, 26, 33 - hunch), Color(purple, 0.18 * glow))
		draw_rect(Rect2(-12, -32 + hunch, 24, 32 - hunch).grow(2.0), Color(purple, 0.08 * glow))
		if state == "charge":       # 뒤로 흐르는 속도선
			for i in 4:
				var y := -28.0 + i * 7.0 + hunch
				var ln := 10.0 + float((int(t * 60.0) + i * 3) % 7) * 2.0
				draw_rect(Rect2(-14 - ln, y, ln, 1), Color(purple, 0.5))
	set_xf(base)
	var sh := [
		["rect", Rect2(-8, -9, 7, 9)], ["rect", Rect2(2, -9, 7, 9)],                          # 굵은 다리 (벌림)
		["poly", PackedVector2Array([Vector2(-11, -26 + hunch + bob), Vector2(9, -28 + hunch * 2.0 + bob), Vector2(12, -18 + hunch + bob),
			Vector2(7, -9), Vector2(-7, -9), Vector2(-11, -17 + bob)])],                       # 앞으로 숙인 두꺼운 상체
		["poly", PackedVector2Array([Vector2(-13, -29 + hunch + bob), Vector2(-3, -30 + hunch + bob), Vector2(-3, -24 + hunch + bob), Vector2(-12, -23 + hunch + bob)])],  # 혹 같은 어깨 갑옷
		["poly", PackedVector2Array([Vector2(5, -32 + hunch * 2.0 + bob), Vector2(12, -31 + hunch * 2.0 + bob), Vector2(13, -25 + hunch * 2.0 + bob), Vector2(5, -25 + hunch * 2.0 + bob)])],   # 앞으로 내민 투구
	]
	draw_rimmed(sh, body, rim)
	var pivot := Vector2(8, -21 + hunch + bob)
	var atk: Color = col.attack
	if state == "slam" and not capturing():
		_draw_swing(pivot, -2.7, wa, 36.0, 14.0, atk)
	# 무기: 긴 자루 + 넓은 날 (근접 적보다 크고 길게)
	set_xf(base * Transform2D(wa, pivot))
	var blade := [
		["rect", Rect2(-3, -1, 18, 2)],
		["poly", PackedVector2Array([Vector2(14, -5), Vector2(28, -7), Vector2(33, -1), Vector2(30, 5), Vector2(14, 5)])],
	]
	if _weapon_hot():
		draw_rimmed(blade, atk, Color(atk, 0.35))
	elif glow > 0.0:
		draw_rimmed(blade, col.enemy_weapon.lerp(purple, 0.6 * glow), rim)
	else:
		draw_rimmed(blade, col.enemy_weapon, col.enemy_rim)
	set_xf(Transform2D.IDENTITY)

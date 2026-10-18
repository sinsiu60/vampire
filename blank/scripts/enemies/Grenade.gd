extends Node2D
class_name Grenade
## 수류탄 (scenes/Grenade.tscn — 척탄병이 던짐, 나중에 다른 적도 재사용). 수치 Config.grenade.
##  던짐: 포물선 (FLIGHT 초 만에 목표 발밑에 닿게), 빨간 불빛 깜빡임 (터질수록 빨라짐), 던진 뒤 FUSE 초에 폭발
##  착지: 그 자리에 보라색 폭발 범위 원 (EVADE — 패링 불가, 범위 밖으로 나가거나 구르기 무적으로 피함)
##  되치기: 날아오는 (또는 바닥의) 수류탄을 베면 마우스 방향으로 (조준 스냅 — 던진 적 우선) BAT_SPEED 로 날아감
##         → 적 몸통 가까이 · 벽 · 바닥에 닿거나 BAT_FUSE 초 뒤 폭발. 되친 수류탄은 플레이어를 해치지 않음
##  폭발: 반경 RADIUS — 플레이어 즉사 · 다른 적도 휘말려 처치 (Main.grenade_blast)

var thrower: Node = null         ## 던진 적 (죽었을 수 있음)
var vel := Vector2.ZERO
var state := "fly"               ## fly | ground | batted
var t := 0.0                     ## 던진 뒤 월드 시간
var bat_t := 0.0                 ## 되친 뒤 월드 시간
var landed_at := Vector2.ZERO    ## 착지 지점 (보라 원 중심)
var exploded := false

var _spin := 0.0


func _ready() -> void:
	add_to_group("grenades")
	z_index = 5


## 던짐: from → target (발밑) 에 FLIGHT 초 만에 닿는 포물선
func launch(from: Vector2, target: Vector2, by: Node) -> void:
	var G: Dictionary = Config.grenade
	global_position = from
	thrower = by
	var T: float = G.FLIGHT
	var d := target - from
	vel = Vector2(d.x / T, (d.y - 0.5 * float(G.GRAVITY) * T * T) / T)


## 되칠 수 있는가 (터지기 전, 아직 되치지 않은 것)
func can_bat() -> bool:
	return not exploded and state != "batted"


## 베어서 되치기: angle 방향으로 BAT_SPEED
func bat(angle: float) -> void:
	if state == "ground":
		global_position.y -= 3.0                 # 바닥에서 띄워 바로 바닥에 닿아 터지지 않게
		var lift: float = Config.grenade.BAT_LIFT
		if sin(angle) > -sin(lift):               # 아래 · 수평으로 쳐도 살짝 위로
			angle = -lift if cos(angle) >= 0.0 else PI + lift
	state = "batted"
	bat_t = 0.0
	vel = Vector2.from_angle(angle) * float(Config.grenade.BAT_SPEED)


func is_batted() -> bool:
	return state == "batted"


func rect() -> Rect2:
	var s: float = Config.grenade.SIZE
	return Rect2(global_position - Vector2(s, s) / 2.0, Vector2(s, s))


## 남은 시간 (터질 때까지, 월드 초) — 되친 뒤엔 BAT_FUSE 기준
func remaining() -> float:
	var G: Dictionary = Config.grenade
	return float(G.BAT_FUSE) - bat_t if is_batted() else float(G.FUSE) - t


func _physics_process(delta: float) -> void:
	queue_redraw()
	if exploded or TimeManager.frozen or Enemy.intro_hold:
		return
	var G: Dictionary = Config.grenade
	var game := get_tree().get_first_node_in_group("game")
	if game == null:
		return
	t += delta
	_spin += delta * (14.0 if state != "ground" else 0.0)
	var room: Room = game.room
	if is_batted():
		bat_t += delta                           # 되친 수류탄은 곧게 (중력 없음)
		var r: Dictionary = room.move_box(rect(), vel, delta)
		global_position = r.rect.get_center()
		var hit_enemy := false
		for e in game.enemies():
			if e is BossCheolgyeon:
				continue
			if e.body_rect().grow(G.BAT_HIT_PAD).has_point(global_position):
				hit_enemy = true
				break
		if hit_enemy or r.hit_wall != 0 or r.on_ground or Vector2(r.vel).y == 0.0 and vel.y < 0.0 or bat_t >= G.BAT_FUSE:
			_explode(game)
		else:
			vel = r.vel
		return
	vel.y = minf(vel.y + float(G.GRAVITY) * delta, 500.0)
	var r: Dictionary = room.move_box(rect(), vel, delta)
	global_position = r.rect.get_center()
	vel = r.vel
	if r.hit_wall != 0:
		vel.x = -vel.x * float(G.BOUNCE)
	if r.on_ground:
		if state == "fly":
			state = "ground"
			vel.x *= float(G.LAND_KEEP)              # 묵직하게 떨어져 거의 안 미끄러짐 (착지 지점 = 보라 원)
			landed_at = Vector2(global_position.x, r.rect.end.y)
		vel.x = move_toward(vel.x, 0.0, float(G.FRICTION) * delta)
		if state == "ground":
			landed_at = Vector2(global_position.x, r.rect.end.y)
	if t >= G.FUSE:
		_explode(game)


func _explode(game: Node) -> void:
	if exploded:
		return
	exploded = true
	game.grenade_blast(self)
	queue_free()


func _draw() -> void:
	var G: Dictionary = Config.grenade
	var col: Dictionary = Config.colors
	# 보라 폭발 범위 원 (착지 뒤): 터질수록 안이 차오름
	if state == "ground":
		var c := to_local(landed_at)
		var k := clampf(1.0 - remaining() / maxf(0.01, float(G.FUSE) * 0.6), 0.0, 1.0)
		var purple: Color = col.unparryable
		draw_set_transform(c, 0.0, Vector2(1.0, 0.45))
		draw_circle(Vector2.ZERO, float(G.RADIUS), Color(purple, 0.10 + 0.12 * k))
		draw_circle(Vector2.ZERO, float(G.RADIUS) * k, Color(purple, 0.16))
		draw_arc(Vector2.ZERO, float(G.RADIUS), 0.0, TAU, 48, Color(purple, 0.85), 1.5)
		draw_set_transform_matrix(Transform2D.IDENTITY)
		# 위로 솟는 반원 테두리 (높이 방향으로도 범위가 보이게)
		draw_arc(c, float(G.RADIUS), PI, TAU, 32, Color(purple, 0.35), 1.0)
	# 몸통 (어두운 둥근 덩어리 + 테두리) + 빨간 불빛
	var s: float = G.SIZE
	draw_set_transform(Vector2.ZERO, _spin, Vector2.ONE)
	draw_rect(Rect2(-s / 2.0 - 1.0, -s / 2.0, s + 2.0, s), col.enemy_rim)
	draw_rect(Rect2(-s / 2.0, -s / 2.0 - 1.0, s, s + 2.0), col.enemy_rim)
	draw_rect(Rect2(-s / 2.0, -s / 2.0, s, s), col.enemy_body)
	draw_rect(Rect2(-1, -s / 2.0 - 2.0, 2, 1), col.enemy_rim)      # 손잡이
	draw_set_transform_matrix(Transform2D.IDENTITY)
	var rem := remaining()
	var total: float = G.BAT_FUSE if is_batted() else G.FUSE
	var period := lerpf(float(G.BLINK_FAST), float(G.BLINK_SLOW), clampf(rem / total, 0.0, 1.0))
	var on := fmod(t, period * 2.0) < period
	var light: Color = col.parry if is_batted() else col.attack
	if on:
		draw_circle(Vector2.ZERO, 3.0, Color(light, 0.35))
		draw_rect(Rect2(-1, -1, 2, 2), light)
	# 되친 수류탄: 노란 꼬리
	if is_batted():
		draw_line(Vector2.ZERO, -vel.normalized() * 10.0, Color(col.parry, 0.6), 2.0)

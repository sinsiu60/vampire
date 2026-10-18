extends Enemy
class_name BossCheolgyeon
## 1장 보스 "철견" — 전투 로직 (겉모습은 Body = CheolgyeonBody, 수치는 CheolgyeonConfig, 무대는 방의 Arena = BossArena).
## 걷지 않는다: 대시 · 슬라이드 · 점프로만 움직임. 예고는 짧고 선명하게 (포즈 · 섬광 · 소리).
##
## 핵심 고리: 콤보 마지막 공격을 패링 → 즉시 휘청 (STAGGER_TIME) → 그동안 베면 반격 베기 (Main._counter_hit) → 체력 -1
##  - 휘청이 아닐 때 베면 권총으로 막음 (Main._boss_block) — 패턴 중이면 패턴은 그대로 계속
##  - 반사탄에 맞으면 휘청
##
## 패턴
##  ① 슬라이드 사격  웅크림 0.2초 + gun_cock → 플레이어를 지나쳐 미끄러지며 3연발 (페이즈 2부터 4연발). 모두 NORMAL — 휘청 없음, 굴러 파고들어 피함. 끝나면 플레이어 뒤에서 0.4초 정지
##  ② 돌진 건카타    대시 → 3연타 (0.25초 · 0.5초 멈칫 지연). 1·2타 NORMAL, 페이즈 2부터 2타 대신 보라 발차기 (EVADE). 3타 OPPORTUNITY 패링 = 휘청
##  ③ 점프 사격      (페이즈 2부터) 높이 뛰어 공중 2연발 → 착지 보라 충격파 (EVADE, 점프 · 구르기) → 0.7초 "빈틈" = 반격 기회
##  ④ 속사          duel 정적 → 움찔 0.1초 → 0.3초 만에 뽑아 쏨. 페이즈 2부터 가짜 움찔 (베면 헛스윙 → 즉시 사격 NORMAL, 구르기로 피함). 진짜 탄 OPPORTUNITY 패링 = 휘청
##  ⑤ 도탄 사격      (페이즈 2부터) aim_up + 금속 "팅" → 간판 · 벽에 1번 튕기는 2연발. 방향 패링 (±60°). 1번째 NORMAL · 2번째 OPPORTUNITY 패링 = 휘청
## 페이즈 1 (체력 9~7) ① → ② → ④ 고정 · 2 (6~4, 폭우) ①~⑤ 무작위 · 3 (3~1, 정전) 두 패턴을 휘청 없이 이어 붙임
## 체력 6 · 3 이 되는 반격 → 페이즈 전환 연출 (슬로우 · 레터박스 — 이 보스전에서 긴 연출은 여기만). 페이즈 시작 = 체크포인트
## 오프닝 (처음 들어올 때): 레터박스 · 정적 1.5초 → 이름 카드 + boss_intro → 대사 → 속사 한 판 → 패링하면 권총이 튕겨나가고
##  뒤로 대시해 다시 집음 → 페이즈 1. 재시작이면 카드 · 대사 없이 정적 0.5초
## 피날레 (체력 0): "빗방울 결투" — FinaleDuel 이 실제 시간으로 진행하는 실패 없는 연출 (클릭 = 방아쇠).
##  정적 → 대치 → 번개 → 가짜 움찔 → 모자 챙의 빗방울 → 착지 = 신호 → 일섬 → 멈춘 세계 → 납도 = 시간 재개 → 갈라진 총알 → 쓰러짐
## 디버그: F8 즉시 휘청 · F9 포즈 뷰어 · F10 패턴 강제 (①~⑤) · F11 페이즈 순환 1 → 2 → 3 → 피날레
##  (Shift+F11 = 다음 페이즈 전환 연출 / 페이즈 3 이면 피날레 시작)

const C := preload("res://scripts/boss/CheolgyeonConfig.gd")

var hp := 0
var max_hp := 0                  ## 체력 칸 수 (난이도 BOSS_HP — 방을 시작할 때 정함)
var _hp_table := {}              # 페이즈 시작 체력 { 1: BOSS_HP, 2, 3 } (방을 시작할 때 프리셋에서)
var _gap_until := -INF           # 자리 잡는 대시가 끝나도 이 시각까지는 기다림 (패턴 사이 공백을 지킴)
var phase := 1                   ## 1 · 2 · 3 (피날레도 무대는 3)
var stage := "fight"             ## opening | fight | finale
var viewer := false              ## F9 포즈 뷰어 — 로직 멈춤, 숫자 키로 포즈
var body: CheolgyeonBody
var arena: BossArena
var pattern := 0                 ## 지금 패턴 번호 (0 = 패턴 사이)
var bullets: Array = []          ## 사격 { gun, fire_t, aim, target, aim_time, role(normal|stagger|opening|finale), type(Config.ATK_*), kind(shot|ricochet), fired, laser_end, bounce, dir2 }
var waves: Array = []            ## 착지 충격파 { x, dir, dist }
var forced := 0                  ## F10: 다음에 할 패턴
var dbg := {}                    ## 패턴 타이밍 (HUD 디버그)

var _wait := 0.0
var _move := {}
var _after_move := 0
var _order_i := 0
var _last_pattern := 0
var _chain := 0                  # 페이즈 3: 1 = 이어 붙인 첫 패턴 (휘청 없음), 2 = 두 번째
var _chain_next := 0
var _queued := 0                 # 페이즈 2·3: 패턴이 끝날 때 미리 고른 다음 패턴 (자리 잡는 대시가 공백을 대신하도록)
var _ghost_t := 0.0
var _dust_t := 0.0
var _kb_v := 0.0
var _stagger_len := 0.7
var _transition_to := 0          # 반격 넉백 뒤 페이즈 전환
var _last_block := -INF
var _perches: Array = []
var _floor_y := 240.0
var _whip := {}
var _trail_t := -1.0
var _duel := {}
var _rico_ref := {}              # 지금 도탄에 쓰는 반사면
var _cine := {}                  # 페이즈 전환 연출 { to, t, done }
var _say := {}                   # 대사 { text, t, dur } (실제 시간)
var _pattern_start := 0.0
var _pattern_end := -INF
var _last_action := -INF
var _debug_i := -1
var _tele: Node2D                # 어둠 위 예고 층 (z 30): 조준선 · 보라 발광 · 충격파 · 권총 점멸
var _card_intro := false         # 이번 오프닝에 이름 카드 · 대사 (처음 들어올 때만)
var _card_f := -1                # 이름 카드 시작 뒤 틱 (-1 = 없음)
var _card_t := 0.0               # 이름 카드 시작 뒤 실제 시간
var _gun_prop := {}              # 오프닝: 튕겨나간 권총 { from, to, t, rot }
var _finale_pending := false
var dying := false               ## Main: 마지막 처치 직전 (실루엣에서 모자 · 권총을 빼고 따로 날림)


func _ready() -> void:
	_setup({ "w": C.W, "h": C.H })
	add_to_group("boss")
	add_to_group("aimers")
	add_to_group("counter_targets")
	body = $Body
	var room := get_parent().get_parent()
	arena = room.get_node_or_null("Arena") as BossArena
	var pn := room.get_node_or_null("BossPerches")
	if pn != null:
		for m in pn.get_children():
			_perches.append(m.global_position)
	var cp: Dictionary = GameState.boss_checkpoint
	var cp_phase := -1
	if cp.get("key", "") == GameState.room_key():
		if cp.get("dead", false):
			dead = true
			remove_from_group("enemies")
			remove_from_group("boss")
			remove_from_group("aimers")
			queue_free()
			return
		cp_phase = int(cp.get("phase", 1))
	# 체크포인트: 없음 = 처음 (오프닝 + 이름 카드) · 0 = 오프닝 결투 · 1 ~ 3 페이즈 · 4 = 피날레
	match cp_phase:
		-1, 0:
			stage = "opening"
			_card_intro = cp_phase == -1
			phase = 1
		4:
			stage = "finale"
			phase = 3
		_:
			phase = clampi(cp_phase, 1, 3)
	var D: Dictionary = Config.diff
	max_hp = int(D.BOSS_HP)
	_hp_table = { 1: max_hp, 2: int(D.PHASE_HP[2]), 3: int(D.PHASE_HP[3]) }
	hp = 0 if stage == "finale" else phase_hp(phase)
	_tele = Node2D.new()
	_tele.name = "Telegraph"
	_tele.z_index = 30
	_tele.z_as_relative = false
	_tele.draw.connect(_draw_telegraph)
	add_child(_tele)
	body.pose("idle")
	match stage:
		"opening":
			set_state("op_still")
			if cp_phase == -1:
				GameState.boss_checkpoint = { "key": GameState.room_key(), "phase": 0 }
		"finale":
			set_state("fin")
		_:
			set_state("intro")
	_find_floor.call_deferred()
	_apply_phase_state.call_deferred()
	_stage_begin.call_deferred()


## 오프닝 · 피날레 재시작: 처음부터 레터박스 · 입력 잠금
func _stage_begin() -> void:
	var main := _main()
	if main != null and stage != "fight":
		main.cine_begin()
	if stage == "finale":
		_begin_finale(true)


func _find_floor() -> void:
	var q := PhysicsRayQueryParameters2D.create(Vector2(global_position.x, 4.0), Vector2(global_position.x, 2000.0), Config.layers.terrain)
	var hit := get_world_2d().direct_space_state.intersect_ray(q)
	if not hit.is_empty():
		_floor_y = hit.position.y


## 지금 페이즈의 무대 · 배경음 (체크포인트 재시작 포함)
func _apply_phase_state() -> void:
	if arena != null:
		arena.apply_phase(phase)
	Audio.set_ambience("rain_loop", C.RAIN_VOL_STORM if phase >= 2 else C.RAIN_VOL)


func _main() -> Node:
	return get_tree().get_first_node_in_group("game")


func _player() -> Player:
	return get_tree().get_first_node_in_group("player")


func center() -> Vector2:
	return global_position + Vector2(0, -C.H / 2.0)


func body_rect() -> Rect2:
	var h: float = C.H
	if state in ["s_prep", "s_slide", "s_end", "land", "repo_prep", "jump_prep", "w_prep", "j_prep", "j_land"] or (state == "stagger" and body.pose_name == "land"):
		h = C.H * 0.62
	return Rect2(global_position - Vector2(C.W / 2.0, h), Vector2(C.W, h))


func capture_silhouette() -> Array:
	return body.silhouette(global_transform, ["Hat", "GunFShape", "GunBShape"] if dying else [])


func can_counter() -> bool:
	return state == "stagger" and not dead and not viewer and stage == "fight"


func in_finale() -> bool:
	return stage == "finale"


## 이름 카드 { scale, alpha } (HUD) — 빈 Dictionary = 안 보임
func card_state() -> Dictionary:
	if _card_f < 0:
		return {}
	var sc: Array = C.CARD_SCALES
	var s: float = sc[_card_f] if _card_f < sc.size() else 1.0
	var held: float = _card_t - float(sc.size()) / Config.fps
	var a := 1.0
	if held > C.CARD_HOLD:
		a = 1.0 - (held - C.CARD_HOLD) / C.CARD_FADE
	if a <= 0.0:
		return {}
	return { "scale": s, "alpha": clampf(a, 0.0, 1.0), "name": C.NAME, "title": C.TITLE }


func is_staggered() -> bool:
	return state == "stagger"


func in_cinematic() -> bool:
	return state == "cine"


func block_point() -> Vector2:
	return body.muzzle(0)


func pose_list() -> Array:
	return C.POSES


func pattern_name(n: int) -> String:
	return C.PATTERN_NAMES.get(n, "-")


## 대사 { text, t, cps } (HUD)
func line_state() -> Dictionary:
	if _say.is_empty():
		return {}
	return { "text": _say.text, "t": _say.t, "cps": C.LINE_CPS }


func say(text: String, dur := C.LINE_TIME) -> void:
	_say = { "text": text, "t": 0.0, "dur": dur }


## 이 패턴이 끝에 휘청을 주는가 (페이즈 3 이어 붙인 첫 패턴은 아님)
func _finisher() -> bool:
	return _chain != 1


# ---------------------------------------------------------------- 사격 (Main · Effects 가 읽음)
func lock_time(aim_time: float) -> float:
	return aim_time - C.AIM_LOCK


## 발사 타이밍 원: 아직 안 쏜 탄마다. 도탄은 플레이어 몸 둘레 + 날아오는 방향 화살표
func approach_infos() -> Array:
	var out := []
	var wt := TimeManager.world_time
	var p := _player()
	for b in bullets:
		if b.fired:
			continue
		var at: float = b.aim_time
		var rem: float = b.fire_t - wt
		if rem > at:
			continue
		var tt: float = at - rem
		var info := { "pos": body.muzzle(b.gun), "remaining": rem, "aim_time": at,
			"locked": tt >= lock_time(at), "k": clampf(tt / maxf(lock_time(at), 0.001), 0.0, 1.0), "parryable": true,
			"fire_t": b.fire_t, "owner": self, "aim": b.aim, "t": tt, "final": b.role == "stagger", "attack_type": b.type }
		if b.kind == "ricochet" and p != null:
			info.pos = p.center()
			info.arrow = (b.bounce - p.center()).angle()
		out.append(info)
	# 기회 공격 근접 타격 (② 3타): 내려칠 권총 둘레에 2겹 원 — 감기 시작 → 타격 순간까지 줄어듦
	if state == "w_combo" and not _whip.is_empty():
		for i in 3:
			if _whip.types[i] != Config.ATK_OPPORTUNITY or _whip.parried[i] or _whip.swung[i] or t < float(_whip.wind_at[i]):
				continue
			var at: float = float(_whip.times[i]) - float(_whip.wind_at[i])
			var rem: float = float(_whip.times[i]) - t
			var tt: float = at - rem
			out.append({ "pos": body.muzzle(0), "remaining": rem, "aim_time": at, "locked": tt >= lock_time(at),
				"k": clampf(tt / maxf(lock_time(at), 0.001), 0.0, 1.0), "parryable": true, "fire_t": wt + rem,
				"owner": self, "aim": 0.0 if facing > 0 else PI, "t": tt, "melee": true, "attack_type": Config.ATK_OPPORTUNITY })
	return out


## role → 공격 종류: normal = NORMAL (1겹), stagger · opening · finale = OPPORTUNITY (2겹, 패링해야 기회)
func _bullet(gun: int, fire_t: float, aim_time: float, role: String, kind := "shot") -> Dictionary:
	var p := _player()
	var r := role if _finisher() else "normal"
	return { "gun": gun, "fire_t": fire_t, "aim": PI if facing < 0 else 0.0, "target": p.center() if p != null else center(),
		"aim_time": aim_time, "role": r, "type": Config.ATK_NORMAL if r == "normal" else Config.ATK_OPPORTUNITY,
		"kind": kind, "fired": false,
		"laser_end": Vector2.ZERO, "bounce": Vector2.ZERO, "dir2": Vector2.RIGHT }


func _next_bullet() -> Dictionary:
	for b in bullets:
		if not b.fired:
			return b
	return {}


## 조준: 고정(발사 AIM_LOCK 전) 전까지 플레이어를 따라감 — 고정되는 것은 '노린 지점'. 발사 시각이 되면 Main 이 쏨
func _bullets_tick(main: Node, p: Player) -> void:
	var wt := TimeManager.world_time
	for b in bullets:
		if b.fired:
			continue
		if wt < b.fire_t - C.AIM_LOCK or b.get("track", false):
			b.target = p.center()
		if b.kind == "ricochet":
			var path := _rico_path(body.muzzle(b.gun), b.target, _rico_ref)
			if not path.is_empty():
				b.aim = path.aim
				b.bounce = path.bounce
				b.dir2 = path.dir2
		else:
			b.aim = (b.target - body.muzzle(b.gun)).angle()
	var nb := _next_bullet()
	if not nb.is_empty() and state != "d_duel" and state != "d_twitch":
		body.set_aim(nb.gun, nb.aim)
	for b in bullets:
		if b.fired:
			continue
		if b.kind == "ricochet":
			b.laser_end = main.raycast_wall(b.bounce + b.dir2 * 1.5, b.dir2.angle(), Config.shot.RANGE)
		else:
			b.laser_end = main.raycast_wall(body.muzzle(b.gun), b.aim, Config.shot.RANGE)
	for b in bullets:
		if not b.fired and wt >= b.fire_t:
			b.fired = true
			if state == "d_twitch":
				set_state("d_end")
				body.snap("draw_fire")
			# 쏘는 순간 자세(뽑기 등)로 총구가 옮겨졌으면 새 총구에서 노린 지점으로 다시 맞춤
			if b.kind != "ricochet":
				for k in 2:
					body.set_aim(b.gun, b.aim)
					b.aim = (b.target - body.muzzle(b.gun)).angle()
			body.set_aim(b.gun, b.aim)
			_action(wt)
			b.label = _shot_label(b)
			if b.kind == "ricochet":
				main.fire_boss_ricochet(self, b)
			else:
				main.fire_boss_shot(self, b)


## 사망 기록용 공격 이름 / 패턴 이름
func _shot_label(b: Dictionary) -> String:
	var i := bullets.find(b) + 1
	match pattern:
		1: return "슬라이드 탄 %d" % i
		3: return "공중 탄 %d" % i
		4: return "헛스윙 벌 사격" if b.get("track", false) else "속사"
		5: return "도탄 %d" % i
	return "탄"


func cause_pattern() -> String:
	if stage == "opening":
		return "오프닝"
	if stage == "finale":
		return "피날레"
	return pattern_name(pattern) if pattern != 0 else "패턴 사이"


## 근접 사망 원인: ② 건카타 몇 번째 타격인지 · 종류 · 타격 순간 (월드 시간)
func melee_cause() -> Dictionary:
	var i := _whip_active()
	if i < 0:
		return { "pattern": cause_pattern(), "attack": "근접", "type": Config.ATK_NORMAL, "impact_t": TimeManager.world_time }
	var kick: bool = _whip.kick and i == 1
	return { "pattern": pattern_name(2), "attack": "발차기" if kick else "%d타" % (i + 1), "type": String(_whip.types[i]),
		"impact_t": TimeManager.world_time - (t - float(_whip.times[i])) }


func _cancel_bullets(scatter := true) -> void:
	var main := _main()
	if scatter and main != null:
		for i in approach_infos():
			main.effects.approach_scatter(i.pos, Effects.approach_radius(i.remaining, i.aim_time), Config.colors.attack)
	bullets.clear()


# ---------------------------------------------------------------- ⑤ 도탄 경로 (세로 반사면에 거울 반사)
## 반사면 후보: 떨어진 간판 양면 (먼저) + 플레이어 높이에서 좌우로 처음 닿는 세로면 (벽 · 문)
func _reflectors() -> Array:
	var out: Array = arena.reflectors() if arena != null else []
	var main := _main()
	var p := _player()
	if main != null and p != null:
		for d in [-1, 1]:
			var hit: Vector2 = main.raycast_wall(p.center(), 0.0 if d > 0 else PI, 2000.0)
			out.append({ "x": hit.x, "y0": 0.0, "y1": _floor_y, "side": -d, "name": "벽" })
	return out


## 총구 m 에서 반사면 r 에 튕겨 target 으로 가는 경로 { aim, bounce, dir2 } — 안 되면 빈 Dictionary
func _rico_path(m: Vector2, target: Vector2, r: Dictionary) -> Dictionary:
	var main := _main()
	var p := _player()
	if r.is_empty() or main == null or p == null:
		return {}
	var wx: float = r.x
	var s: float = r.side
	if (m.x - wx) * s <= 2.0 or (target.x - wx) * s <= 2.0:
		return {}
	var mirror := Vector2(2.0 * wx - target.x, target.y)
	var dir := (mirror - m).normalized()
	if absf(dir.x) < sin(deg_to_rad(C.RS_MIN_ANGLE)):
		return {}
	var bounce := m + dir * ((wx - m.x) / dir.x)
	if bounce.y < float(r.y0) + 1.0 or bounce.y > float(r.y1) - 1.0:
		return {}
	var dir2 := Vector2(-dir.x, dir.y)
	# 첫 줄이 정말 그 면의 그 자리에 닿는가 (다른 지형에 먼저 막히거나 면이 거기 없으면 안 됨).
	# 간판은 레이에 안 걸리는 층이라 높이 범위 + 시야로 확인
	if r.get("ray", true):
		var hit: Vector2 = main.raycast_wall(m, dir.angle(), m.distance_to(bounce) + 4.0)
		if hit.distance_to(bounce) > 2.5:
			return {}
	elif not main.line_of_sight(m, bounce):
		return {}
	if not main.line_of_sight(bounce + dir2 * 1.5, target):
		return {}
	if main.seg_rect_t(m, bounce, p.body_rect().grow(6.0)) >= 0.0:
		return {}
	return { "aim": dir.angle(), "bounce": bounce, "dir2": dir2 }


## 지금 쓸 수 있는 반사면 하나 (간판 우선), 없으면 빈 Dictionary
func _pick_reflector() -> Dictionary:
	var p := _player()
	if p == null:
		return {}
	for r in _reflectors():
		if not _rico_path(body.muzzle(0), p.center(), r).is_empty():
			return r
	return {}


# ---------------------------------------------------------------- 근접 (② 건카타 · 발차기) · ③ 충격파
func attack_box() -> Rect2:
	var i := _whip_active()
	if i >= 0 and not _whip.parried[i]:
		if _whip.kick and i == 1:
			return Rect2(_front_box(C.KICK_BOX).position.x, global_position.y - C.KICK_BOX.y - 2.0, C.KICK_BOX.x, C.KICK_BOX.y)
		return _front_box(C.WHIP_BOX)
	return Rect2()


func _front_box(size: Vector2) -> Rect2:
	var x: float = global_position.x + (C.W / 2.0 - 6.0 if facing > 0 else -C.W / 2.0 - size.x + 6.0)
	return Rect2(Vector2(x, global_position.y - size.y), size)


func threat_box() -> Rect2:
	return _front_box(C.WHIP_BOX + Vector2(6, 6))


func _whip_active() -> int:
	if state != "w_combo" or _whip.is_empty():
		return -1
	for i in 3:
		var T: float = _whip.times[i]
		var act: float = C.KICK_ACTIVE if (_whip.kick and i == 1) else C.WHIP_ACTIVE
		if t >= T and t < T + act:
			return i
	return -1


## 지금 칼을 맞대면 패링되는 타격 번호, 없으면 -1 (발차기는 패링 불가)
func whip_vulnerable() -> int:
	if state != "w_combo" or _whip.is_empty():
		return -1
	for i in 3:
		if _whip.types[i] == Config.ATK_EVADE:
			continue
		var T: float = _whip.times[i]
		if not _whip.parried[i] and t >= T - Config.parry.melee_early and t < T + C.WHIP_ACTIVE:
			return i
	return -1


## 난타 패링됨: 1·2타는 그대로 이어감, 3타는 크게 튕겨나며 휘청 (이어 붙인 첫 패턴이면 휘청 없이 계속)
## 난타 i 번째 타격의 공격 종류 (Config.ATK_*)
func whip_type(i: int) -> String:
	return String(_whip.types[i]) if not _whip.is_empty() else Config.ATK_NORMAL


func on_whip_parried(i: int) -> void:
	_whip.parried[i] = true
	body.set_gun_flash(0, false)
	if i == 2:
		if not _whip.swung[2]:
			_action(TimeManager.world_time)
		if _whip.types[i] == Config.ATK_OPPORTUNITY:
			stagger()
			velocity.x = -facing * C.WHIP_PARRY_KNOCK
		else:
			velocity.x = -facing * C.WHIP_PARRY_KNOCK * 0.5


## 착지 충격파에 닿았는가 (바닥에서 JS_WAVE_H 높이 안 — 점프하면 넘음)
func wave_hits(r: Rect2) -> bool:
	for w in waves:
		var x: float = w.x
		if r.end.y > _floor_y - C.JS_WAVE_H and r.position.x - 3.0 < x and r.end.x + 3.0 > x:
			return true
	return false


# ---------------------------------------------------------------- 외부에서 부름 (Main · Debug)
## 휘청: 반격 기회 len 초 (③ 착지 경직은 land 포즈 · 소리 없이)
func stagger(sec := -1.0, pose := "stagger") -> void:
	if dead or state == "cine":
		return
	if sec < 0.0:
		sec = Config.diff.STAGGER_TIME
	_stop_pattern(true)
	_chain = 0
	_move = {}
	set_state("stagger")
	_stagger_len = sec
	velocity.x *= 0.3
	_face_player()
	body.snap(pose)
	if pose == "stagger":
		Audio.sfx("stagger")


## 오프닝 속사를 패링함: 권총이 손에서 튕겨나감 → 뒤로 대시해 다시 집음 → 페이즈 1
func on_opening_parried() -> void:
	_stop_pattern(false)
	set_state("op_gunfly")
	body.set_gun_visible(0, false)
	body.snap("block")
	var from := body.muzzle(0)
	var to := Vector2(_clamp_x(global_position.x - facing * C.GUN_FLY_DIST), _floor_y - 2.0)
	_gun_prop = { "from": from, "to": to, "t": 0.0, "rot": 0.0, "landed": false }


## 반격 베기 명중 → 체력 -1, 30px 넉백. 체력 6 · 3 이 되면 넉백 뒤 페이즈 전환, 0 이면 피날레. 반환 = 남은 체력
func on_counter_hit(angle: float) -> int:
	hp -= 1
	body.set_flash(false)
	set_state("knockback")
	var dir := signf(cos(angle))
	if dir == 0.0:
		dir = -float(facing)
	_kb_v = dir * 2.0 * C.COUNTER_KNOCKBACK / C.KNOCKBACK_TIME
	velocity.x = _kb_v
	if hp > 0 and phase < 3 and hp <= phase_hp(phase + 1):
		_transition_to = phase + 1
	if hp <= 0:
		hp = 0
		_finale_pending = true
	return hp


func on_blocked(p: Player) -> bool:
	if p.last_slash_t == _last_block:
		return false
	_last_block = p.last_slash_t
	if pattern != 0 or stage != "fight" or state in ["jump", "repo_dash", "repo_prep", "repo_wait", "cine", "knockback"]:
		return true
	_move = {}
	set_state("block")
	velocity.x = 0.0
	_face_player()
	body.snap("block")
	return true


## 디버그 키로 오프닝 · 피날레를 건너뜀 → 보통 전투로
func _debug_to_fight() -> void:
	if stage == "fight":
		return
	if stage == "finale":
		var m := _main()
		if m != null:
			m.finale_abort()
		body.rotation = 0.0
		body.pose("idle")
	stage = "fight"
	_card_f = -1
	_gun_prop = {}
	body.set_gun_visible(0, true)
	if arena != null:
		arena.spots = []
		arena.lightning_on = true
	if hp <= 0:
		hp = phase_hp(phase)
	var main := _main()
	if main != null:
		main.cine_end()


func debug_stagger() -> void:
	if state == "cine":
		return
	_debug_to_fight()
	if viewer:
		set_viewer(false)
	stagger()


func set_viewer(on: bool) -> void:
	if state == "cine":
		return
	viewer = on
	_stop_pattern(false)
	_chain = 0
	_move = {}
	body.set_flash(false)
	velocity = Vector2.ZERO
	if on:
		set_state("viewer")
		body.pose("idle")
	else:
		_go_wait(_gap())


func viewer_pose(i: int) -> void:
	if viewer and i >= 0 and i < C.POSES.size():
		body.snap(C.POSES[i])


## F10: 패턴 ① → ② → ③ → ④ → ⑤ 차례로 바로 실행 (페이즈 1 에서도). 반환 = 패턴 번호
func debug_force_pattern() -> int:
	if state == "cine":
		return 0
	_debug_to_fight()
	_debug_i = (_debug_i + 1) % 5
	var n: int = _debug_i + 1
	if viewer:
		set_viewer(false)
	_stop_pattern(true)
	_chain = 0
	_move = {}
	forced = n
	_next_pattern()
	return n


## F11: 페이즈 순환 1 → 2 → 3 → 피날레(4) → 1 (그 페이즈 시작 상태로 바로).
## cinematic = 다음 페이즈 전환 연출을 그대로 (페이즈 3 이면 피날레 시작)
func debug_next_phase(cinematic := false) -> int:
	if state == "cine":
		return phase
	if viewer:
		set_viewer(false)
	_stop_pattern(true)
	_chain = 0
	if stage == "finale":
		_debug_to_fight()
		phase = 1
		hp = phase_hp(1)
		_start_phase()
		return 1
	_debug_to_fight()
	if cinematic:
		if phase < 3:
			hp = phase_hp(phase + 1)
			_begin_transition(phase + 1)
			return phase + 1
		hp = 0
		_begin_finale()
		return 4
	if phase == 3:
		phase = 3
		hp = 0
		_apply_phase_state()
		_begin_finale(true)
		return 4
	phase = phase + 1
	hp = phase_hp(phase)
	_start_phase()
	return phase


# ---------------------------------------------------------------- 페이즈
func _gap() -> float:
	return float(Config.diff.PATTERN_GAP[clampi(phase, 1, 3)])


## 패턴 사이 공백 목표 (난이도 PATTERN_GAP — HUD 타이밍 표시)
func pattern_gap() -> float:
	return _gap()


## 페이즈 ph 시작 체력 (난이도 프리셋, 방을 시작할 때 정한 값)
func phase_hp(ph: int) -> int:
	return int(_hp_table.get(clampi(ph, 1, 3), max_hp))


## 페이즈 시작 = 체크포인트
func _start_phase() -> void:
	GameState.boss_checkpoint = { "key": GameState.room_key(), "phase": phase }
	_apply_phase_state()
	_order_i = 0
	_last_pattern = 0
	_queued = 0
	_pattern_end = -INF              # 연출 · 오프닝 시간은 공백으로 세지 않음
	_last_action = -INF
	_go_wait(_gap())


## 페이즈 전환 연출 시작 (실제 시간으로 진행 — _cine_tick)
func _begin_transition(to: int) -> void:
	_stop_pattern(false)
	_chain = 0
	_transition_to = 0
	_move = {}
	waves.clear()
	set_state("cine")
	velocity = Vector2.ZERO
	_cine = { "to": to, "t": 0.0, "done": {} }
	var main := _main()
	if main != null:
		main.cine_begin()
	Audio.play("slowmo_in", Config.audio.SFX_SLOWMO_IN)


func _cue(name: String, at: float) -> bool:
	if _cine.done.has(name) or _cine.t < at:
		return false
	_cine.done[name] = true
	return true


func _cine_tick(main: Node) -> void:
	_cine.t += TimeManager.real_delta()
	var tt: float = _cine.t
	var to: int = _cine.to
	var ret: float = C.TR2_RETURN_AT if to == 2 else C.TR3_RETURN_AT
	var end: float = C.TR2_END if to == 2 else C.TR3_END
	# 시간 속도: 1 → TR_SLOW (빠르게), time_return 부터 → 1 (ease-in)
	if tt < ret:
		var u := clampf(tt / C.TR_SLOW_IN, 0.0, 1.0)
		TimeManager.set_slow(lerpf(1.0, C.TR_SLOW, 1.0 - (1.0 - u) * (1.0 - u)))
	else:
		var u := clampf((tt - ret) / 0.45, 0.0, 1.0)
		TimeManager.set_slow(lerpf(C.TR_SLOW, 1.0, u * u))
	if _cue("loop", 0.35):
		_cine.loop = Audio.play("slowmo_loop", Config.audio.SFX_SLOWMO_LOOP)
	if _cue("roar", C.TR_ROAR_AT):
		_face_player()
		body.snap("roar")
		Audio.boss_intro(C.TR_ROAR_VOL)
		main.add_shake(4.0, 0.3, -PI / 2.0)
	if to == 2:
		if arena != null and _cue("aim", C.TR2_SHOOT_AT - 0.2):
			_aim_at(arena.tank_center())
		if arena != null and _cue("tank", C.TR2_SHOOT_AT):
			main.cine_shot(self, arena.tank_center())
			Audio.sfx("explosion")
			arena.burst_tank()
			main.add_shake(C.TR_TANK_SHAKE, 0.4, randf() * TAU)
		if _cue("rain", C.TR2_RAIN_AT):
			if arena != null:
				arena.set_storm(true)
			Audio.set_ambience("rain_loop", C.RAIN_VOL_STORM, 0.4)
		if arena != null and _cue("sign", C.TR2_SIGN_AT):
			arena.drop_sign()
			body.pose("idle", 0.1)
			body.clear_aim()
	else:
		var lt: Array = C.TR3_LIGHTS_AT
		for i in lt.size():
			if arena != null and _cue("aim%d" % i, float(lt[i]) - 0.18):
				_aim_at(arena.lamp_pos(i))
			if arena != null and _cue("lamp%d" % i, float(lt[i])):
				main.cine_shot(self, arena.lamp_pos(i))
				arena.break_lamp(i)
				if i == lt.size() - 1:
					# 마지막 조명: flashbang + 하얀 화면 0.2초 → 정전, "삐-" 동안 다른 소리 로우패스
					Audio.sfx("flashbang", "", 1.0, true)
					if Settings.on("screen_flash"):
						main.screen_fx.flash(Color.WHITE, 1.0, C.TR3_WHITE)
					arena.set_arena_phase(3, false)     # 무대 상태 → 페이즈 3 (어둠 · 조명 깨짐 · 어두운 하늘)
					Audio.set_muffled(true)
					_cine.unmuffle = tt + C.TR3_MUFFLE
		if _cine.has("unmuffle") and tt >= float(_cine.unmuffle):
			_cine.erase("unmuffle")
			Audio.set_muffled(false)
		if _cue("lower", float(lt[lt.size() - 1]) + 0.3):
			body.pose("idle", 0.1)
			body.clear_aim()
	if _cue("return", ret):
		Audio.play("time_return", Config.audio.SFX_TIME_RETURN)
		if _cine.has("loop"):
			Audio.fade_out(_cine.loop, Config.parry_seq.LOOP_FADE)
	if _cue("end", end):
		TimeManager.set_slow(1.0)
		if _cine.has("unmuffle"):
			Audio.set_muffled(false)
		main.cine_end()
		phase = to
		say(C.TR2_LINE if to == 2 else C.TR3_LINE)
		_cine = {}
		_start_phase()


## 연출: 앞 권총을 그 지점으로 (aim_up 포즈)
func _aim_at(pt: Vector2) -> void:
	_set_facing(1 if pt.x > global_position.x else -1)
	body.snap("aim_up")
	body.set_aim(0, (pt - body.muzzle(0)).angle())


# ---------------------------------------------------------------- 갱신
func _physics_process(delta: float) -> void:
	if dead:
		return
	var p := _player()
	var main := _main()
	if p == null or main == null:
		return
	p.roll_enabled = stage != "finale"      # 피날레 결투는 받아치기만 (구르기 불가)
	if not _say.is_empty():
		_say.t += TimeManager.real_delta()
		if _say.t > _say.dur:
			_say = {}
	if state == "cine":
		_cine_tick(main)
		_tele.queue_redraw()
		if not TimeManager.frozen and state == "cine":
			apply_physics(delta)
		return
	if TimeManager.frozen:
		_redraw()
		return
	t += delta
	if _trail_t > 0.0:
		_trail_t -= delta
	_waves_tick(delta)
	_gun_prop_tick(delta)
	if _card_f >= 0:
		_card_f += 1
		_card_t += TimeManager.real_delta()
	match state:
		"viewer":
			velocity.x = 0.0
		# ---- 오프닝
		"op_still":
			_face_player()
			velocity.x = 0.0
			if t >= (C.OPEN_STILL if _card_intro else C.OPEN_STILL_RESTART):
				if _card_intro:
					set_state("op_card")
					_card_f = 0
					_card_t = 0.0
					Audio.boss_intro()
					main.add_shake(C.CARD_SHAKE, 0.25, PI / 2.0)
					if Settings.on("screen_flash"):
						main.screen_fx.flash()
				else:
					_start_stage_duel()
		"op_card":
			_face_player()
			velocity.x = 0.0
			if _card_t >= C.OPEN_LINE_AT and _say.is_empty() and not _duel.has("said"):
				_duel["said"] = true
				say(C.OPEN_LINE, 2.4)
			if _card_t >= C.OPEN_DUEL_AT:
				_start_stage_duel()
		"op_gunfly":
			velocity.x = 0.0
			if _gun_prop.get("landed", false) and t >= 0.25:
				# 뒤로 대시해 다시 집음
				var tx: float = _gun_prop.to.x
				var d := 1 if tx > global_position.x else -1
				_move = { "dir": d, "target_x": tx, "max_t": C.MOVE_MAX }
				set_state("op_fetch")
				body.snap("dash")
				Audio.sfx("dash_whoosh")
				_ghost_t = 0.0
		"op_fetch":
			velocity.x = _move.dir * C.DASH_SPEED
			_dash_ghosts(delta)
			if _arrived() or is_on_wall():
				velocity.x = 0.0
				set_state("op_pick")
				body.snap("land")
		"op_pick":
			velocity.x = 0.0
			if t >= C.OPEN_PICKUP:
				_gun_prop = {}
				body.set_gun_visible(0, true)
				body.snap("idle")
				Audio.sfx("gun_cock")
				stage = "fight"
				main.cine_end()
				_start_phase()
		"op_dodged":
			_face_player()
			velocity.x = 0.0
			if t >= C.OPEN_DODGE_WAIT:
				stage = "fight"
				main.cine_end()
				_start_phase()
		# ---- 피날레: FinaleDuel 이 자세 · 위치를 움직임
		"fin":
			velocity.x = 0.0
		"intro":
			_face_player()
			velocity.x = 0.0
			if t >= C.OPEN_STILL_RESTART:     # 재시작: 정적 0.5초 뒤 그 페이즈
				_next_pattern()
		"wait":
			_face_player()
			velocity.x = move_toward(velocity.x, 0.0, 2400.0 * delta)
			if t >= _wait:
				_next_pattern()
		# ---- 자리 잡는 대시
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
				if TimeManager.world_time < _gap_until:
					set_state("repo_wait")
					_wait = _gap_until - TimeManager.world_time
				else:
					_start_pattern(_after_move)
		"repo_wait":
			_face_player()
			velocity.x = move_toward(velocity.x, 0.0, 2400.0 * delta)
			if t >= _wait:
				_gap_until = -INF
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
			if _arc(float(_move.time), C.JUMP_ARC):
				set_state("land")
				body.snap("land")
				_dust(global_position, 8, 0)
			_redraw()
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
			if t >= _stagger_len:
				body.set_flash(false)
				body.pose("idle", 0.08)
				_pattern_end = TimeManager.world_time     # 휘청(반격 기회)은 공백이 아님 — 놓친 순간부터 셈
				_after_pattern()
		"knockback":
			velocity.x = move_toward(velocity.x, 0.0, absf(_kb_v) / C.KNOCKBACK_TIME * delta)
			if t >= C.KNOCKBACK_TIME:
				velocity.x = 0.0
				if _finale_pending:
					_finale_pending = false
					_begin_finale()
				elif _transition_to > 0:
					_begin_transition(_transition_to)
				else:
					body.pose("idle", C.BLEND_MOVE)
					_next_pattern()
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
			if t >= Config.diff.TELEGRAPH_TIME:
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
			_face_player()
			velocity.x = move_toward(velocity.x, 0.0, 1400.0 * delta)
			if t >= C.SLIDE_SHOT_RECOVER:
				body.pose("idle", C.BLEND_MOVE * 2.0)
				_end_pattern(true)
		# ---- ② 돌진 건카타
		"w_prep":
			velocity.x = 0.0
			if t >= Config.diff.TELEGRAPH_TIME:
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
		# ---- ③ 점프 사격
		"j_prep":
			velocity.x = 0.0
			_face_player()
			if t >= Config.diff.TELEGRAPH_TIME:
				set_state("j_air")
				body.snap("jump")
				Audio.sfx("jump")
				_dust(global_position, 8, 0)
		"j_air":
			_face_player()
			if t >= 0.18 and body.pose_name == "jump":
				body.snap("air_fire")
			_bullets_tick(main, p)
			if _arc(C.JS_TIME, C.JS_HEIGHT):
				_land_shockwave(main)
			_redraw()
			return
		"j_land":
			velocity.x = 0.0
			if t >= C.LAND_TIME:
				body.pose("idle", C.BLEND_MOVE * 2.0)
				_end_pattern()
		# ---- ④ 속사
		"d_duel":
			_face_player()
			velocity.x = move_toward(velocity.x, 0.0, 2400.0 * delta)
			_duel_tick(p)
		"d_twitch":
			_face_player()
			_bullets_tick(main, p)
		"d_end":
			velocity.x = 0.0
			if stage == "opening":
				# 오프닝: 패링 안 하고 (구르기로) 피함 → "피하기만 할 거냐?" → 페이즈 1
				if t >= C.OPEN_DODGE_AT and not p.dead:
					set_state("op_dodged")
					body.snap("idle")
					say(C.OPEN_DODGE_LINE)
			elif t >= C.DUEL_RECOVER:
				body.pose("idle", C.BLEND_MOVE * 2.0)
				_end_pattern()
		# ---- ⑤ 도탄 사격
		"r_aim":
			_face_player()
			velocity.x = move_toward(velocity.x, 0.0, 2400.0 * delta)
			_bullets_tick(main, p)
			if _next_bullet().is_empty():
				set_state("r_end")
		"r_end":
			velocity.x = 0.0
			if t >= C.RS_RECOVER:
				body.pose("idle", C.BLEND_MOVE * 2.0)
				_end_pattern()
	apply_physics(delta)
	_redraw()


func _redraw() -> void:
	queue_redraw()
	_tele.queue_redraw()


## 포물선 이동 (_move.from → _move.to, time 초, 꼭대기 추가 높이 arc). 끝났으면 true
func _arc(time: float, arc: float) -> bool:
	var u := clampf(t / time, 0.0, 1.0)
	var from: Vector2 = _move.from
	var to: Vector2 = _move.to
	var h: float = arc + maxf(0.0, from.y - to.y)
	global_position = from.lerp(to, u) + Vector2(0, -h * 4.0 * u * (1.0 - u))
	velocity = Vector2.ZERO
	return u >= 1.0


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
## 다음 패턴 번호 (미리 알 수 있을 때만 — 페이즈 2·3 무작위는 0)
func _peek_next() -> int:
	if forced != 0:
		return forced
	if _chain == 1:
		return _chain_next
	if phase == 1:
		return C.P1_ORDER[_order_i % C.P1_ORDER.size()]
	return _queued


## 무작위 (같은 패턴 연속 금지, 도탄은 반사면이 있을 때만)
func _pick_random(exclude: Array) -> int:
	var pool := []
	for n in C.P2_PATTERNS:
		if n in exclude:
			continue
		if n == 5 and _pick_reflector().is_empty():
			continue
		pool.append(n)
	if pool.is_empty():
		pool = [1]
	return pool[randi() % pool.size()]


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
	var n := _peek_next()
	if forced != 0:
		forced = 0
		_chain = 0
	elif _chain == 1:
		_chain = 2
	elif phase == 1:
		_order_i += 1
	else:
		n = _queued if _queued != 0 else _pick_random([_last_pattern])
		_queued = 0
		if phase >= 3 and Config.diff.P3_CHAIN:
			_chain = 1
			_chain_next = _pick_random([n])
	if _reposition_needed(n) and _reposition(n):
		return
	_start_pattern(n)


func _reposition_needed(n: int) -> bool:
	var p := _player()
	if p == null:
		return false
	var dist := absf(p.global_position.x - global_position.x)
	return (n == 1 and dist < C.SLIDE_SHOT_MIN_DIST) or (n == 4 and dist < C.DUEL_MIN_DIST)


## 플레이어에게서 떨어지는 대시 (뒤가 막혔으면 반대편으로). 웅크림 포함 0.4초 이내
func _reposition(n: int) -> bool:
	var p := _player()
	var want: float = (C.SLIDE_SHOT_MIN_DIST if n == 1 else C.DUEL_MIN_DIST) + 30.0
	var dir := 1 if p.global_position.x > global_position.x else -1
	var tx := _clamp_x(p.global_position.x - dir * want)
	if absf(tx - p.global_position.x) < want * 0.7:
		tx = _clamp_x(p.global_position.x + dir * want)
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
	_last_pattern = n
	_pattern_start = TimeManager.world_time
	dbg = { "n": n, "name": pattern_name(n), "first": -1.0, "max_gap": 0.0, "since_prev": -1.0, "chain": _chain,
		"gap": (TimeManager.world_time - _pattern_end) if _pattern_end > -INF else -1.0 }
	if stage != "fight":
		dbg = {}                     # 오프닝 · 피날레 결투는 타이밍 표시에서 뺌
	var dir := 1 if p.global_position.x > global_position.x else -1
	var wt := TimeManager.world_time
	match n:
		1:
			set_state("s_prep")
			_face_player()
			body.snap("crouch")
			Audio.sfx("gun_cock")
			var tx := _clamp_x(p.global_position.x + dir * C.SLIDE_SHOT_PASS)
			_move = { "dir": dir, "target_x": tx, "max_t": C.SLIDE_SHOT_MAX }
			var slide_start: float = wt + Config.diff.TELEGRAPH_TIME
			var count: int = C.SLIDE_SHOT_COUNT if phase == 1 else C.P2_SLIDE_SHOTS
			bullets.clear()
			for i in count:
				var ft: float = slide_start + C.SLIDE_SHOT_FIRST + i * Config.diff.SLIDE_SHOT_INTERVAL
				bullets.append(_bullet(0, ft, minf(C.SLIDE_SHOT_AIM, ft - wt), "normal"))   # 모두 NORMAL — 휘청 없음, 굴러서 파고드는 패턴
		2:
			var tx := _clamp_x(p.global_position.x - dir * C.WHIP_STOP)
			if (tx - global_position.x) * dir < 0.0:
				tx = global_position.x
			_move = { "dir": dir, "target_x": tx, "max_t": C.WHIP_DASH_MAX }
			_set_facing(dir)
			set_state("w_prep")
			body.snap("crouch")
			_dust(global_position, 6, -dir)
		3:
			# ③ 웅크림 → 높이 뛰어 플레이어 근처(내 쪽)로, 공중 2연발
			var side := signf(global_position.x - p.global_position.x)
			if side == 0.0:
				side = 1.0
			var to := Vector2(_clamp_x(p.global_position.x + side * C.JS_LAND_OFFSET), _floor_y)
			_move = { "from": global_position, "to": to, "time": C.JS_TIME }
			set_state("j_prep")
			_face_player()
			body.snap("crouch")
			var air: float = wt + Config.diff.TELEGRAPH_TIME
			bullets.clear()
			for i in C.JS_SHOTS.size():
				var ft: float = air + float(C.JS_SHOTS[i])
				bullets.append(_bullet(0, ft, minf(C.JS_AIM, ft - wt), "normal"))
		4:
			set_state("d_duel")
			_face_player()
			body.clear_aim()
			body.snap("duel")
			var hold := randf_range(C.DUEL_HOLD_MIN, C.DUEL_HOLD_MAX)
			var fakes := 0
			var gap := 0.35
			var role := "stagger"
			if stage == "opening":
				hold = C.OPEN_DUEL_HOLD
				role = "opening"
			elif phase >= 2 and randf() < float(Config.diff.FAKE_TWITCH_CHANCE.get(phase, 0.0)):
				fakes = randi_range(1, C.FAKE_MAX)
			_duel = { "hold": hold + fakes * gap, "fakes": [], "fake_t": INF, "punished": false, "role": role }
			for k in fakes:
				_duel.fakes.append(hold * 0.45 + k * gap)
		5:
			# ⑤ aim_up + 금속 "팅" → 반사면에 1번 튕기는 2연발
			_rico_ref = _pick_reflector()
			if _rico_ref.is_empty():
				pattern = 0
				_start_pattern(1 if absf(p.global_position.x - global_position.x) >= C.SLIDE_SHOT_MIN_DIST else 2)
				return
			set_state("r_aim")
			_face_player()
			body.snap("aim_up")
			Audio.boss_armor(C.RS_TING_PITCH)
			bullets.clear()
			for i in 2:
				var ft: float = wt + C.RS_FIRST + i * C.RS_GAP
				bullets.append(_bullet(0, ft, minf(C.RS_AIM, ft - wt), "stagger" if i == 1 else "normal", "ricochet"))
		_:
			_go_wait(_gap())


## 패턴 끝 → 공백 뒤 다음. 페이즈 3 이어 붙인 첫 패턴이면 공백 없이 바로 두 번째
## no_gap = 패턴 끝 정지가 이미 공백 몫 (① 슬라이드 사격 뒤 0.4초) → 바로 다음 패턴
func _end_pattern(no_gap := false) -> void:
	_stop_pattern(false)
	if _chain == 1:
		_next_pattern()
		return
	_chain = 0
	_after_pattern(no_gap)


## 패턴 사이: 다음 패턴을 미리 정하고, 자리 잡는 대시가 필요하면 그 대시가 공백 대신 (0.4초 이내)
func _after_pattern(no_gap := false) -> void:
	if phase >= 2 and forced == 0 and _queued == 0:
		_queued = _pick_random([_last_pattern])
	var nx := _peek_next()
	_gap_until = -INF
	if no_gap:
		_next_pattern()
	elif nx != 0 and _reposition_needed(nx):
		_gap_until = TimeManager.world_time + _gap()     # 대시가 공백보다 짧으면 도착 뒤 남은 만큼 기다림
		_next_pattern()
	else:
		_go_wait(_gap())


func _stop_pattern(scatter: bool) -> void:
	if pattern != 0:
		_pattern_end = TimeManager.world_time
	pattern = 0
	_cancel_bullets(scatter)
	_whip = {}
	_duel = {}
	_rico_ref = {}
	body.clear_aim()
	body.set_gun_flash(0, false)
	body.set_leg_glow(false)


## 플레이어가 대응해야 하는 순간 (발사 · 내려치기 · 발차기 · 충격파) — 디버그 타이밍
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


# ---------------------------------------------------------------- ② 건카타 3연타 (페이즈 2부터 2타 대신 발차기)
func _start_whip_combo() -> void:
	var kick := phase >= 2 and randf() < C.KICK_CHANCE
	var T1: float = C.WHIP_WINDUP
	var T2: float = T1 + (C.WHIP_REWIND + C.KICK_READY if kick else Config.diff.WHIP_INTERVAL)
	var T3: float = T2 + C.WHIP_REWIND + C.WHIP_DELAY + (0.05 if kick else 0.0)
	_whip = { "times": [T1, T2, T3], "wind_at": [0.0, T1 + C.WHIP_REWIND, T2 + C.WHIP_REWIND + (0.05 if kick else 0.0)],
		"parried": [false, false, false], "swung": [false, false, false], "wound": [false, false, false], "kick": kick,
		# 1타 NORMAL · 2타 NORMAL (발차기면 EVADE) · 3타 = 휘청 주는 마무리면 OPPORTUNITY
		"types": [Config.ATK_NORMAL, Config.ATK_EVADE if kick else Config.ATK_NORMAL,
			Config.ATK_OPPORTUNITY if _finisher() else Config.ATK_NORMAL] }
	set_state("w_combo")


func _whip_tick(main: Node, p: Player, delta: float) -> void:
	velocity.x = move_toward(velocity.x, 0.0, 3000.0 * delta)
	var flash := false
	var glow := false
	for i in 3:
		var T: float = _whip.times[i]
		var is_kick: bool = _whip.kick and i == 1
		if not _whip.wound[i] and t >= _whip.wind_at[i]:
			_whip.wound[i] = true
			_face_player()
			if is_kick:
				body.snap("kick_ready")
			else:
				body.snap("whip_windup")
				Audio.play_synced("pistol_whip", TimeManager.world_time + (T - t))
		if is_kick and t >= _whip.wind_at[i] and t < T + C.KICK_ACTIVE:
			glow = true
		elif not is_kick and not _whip.parried[i] and t >= T - C.WHIP_FLASH and t < T:
			flash = true
		if not _whip.swung[i] and t >= T:
			_whip.swung[i] = true
			_action(TimeManager.world_time)
			if is_kick:
				body.snap("kick")
				velocity.x = facing * C.KICK_LUNGE / C.WHIP_LUNGE_TIME
				Audio.play("swing", 1.0, 0.7)
				_dust(global_position + Vector2(facing * 14.0, 0), 4, facing)
			else:
				body.snap("whip_smash")
				velocity.x = facing * C.WHIP_LUNGE / C.WHIP_LUNGE_TIME
				_trail_t = C.WHIP_TRAIL_TIME
				_dust(global_position + Vector2(facing * 18.0, 0), 6, 0)
				main.add_shake(C.WHIP_SHAKE, 0.15, PI / 2.0)
	body.set_gun_flash(0, flash and fmod(t, 0.08) < 0.05)
	body.set_leg_glow(glow, 0.7 + 0.3 * sin(t * 40.0))
	if t >= float(_whip.times[2]) + C.WHIP_ACTIVE + C.WHIP_RECOVER:
		body.pose("idle", C.BLEND_MOVE * 2.0)
		_end_pattern()


# ---------------------------------------------------------------- ③ 착지 충격파
func _land_shockwave(main: Node) -> void:
	body.snap("land")
	_dust(global_position, 12, 0)
	Audio.play("explosion", Config.audio.SFX_EXPLOSION * C.JS_LAND_VOL, C.JS_LAND_PITCH)
	main.add_shake(C.JS_LAND_SHAKE, 0.25, PI / 2.0)
	waves.append({ "x": global_position.x, "dir": -1, "dist": 0.0, "type": Config.ATK_EVADE })
	waves.append({ "x": global_position.x, "dir": 1, "dist": 0.0, "type": Config.ATK_EVADE })
	_action(TimeManager.world_time)
	bullets.clear()
	if _finisher():
		# 착지 후 0.7초 "빈틈" = 휘청과 같이 반격 가능 (land 포즈 그대로, 흰 테두리 깜빡임)
		_stop_pattern(false)
		stagger(C.JS_OPEN, "land")
	else:
		set_state("j_land")


func _waves_tick(delta: float) -> void:
	if waves.is_empty():
		return
	var main := _main()
	var w: float = main.room.size_px().x if main != null else 512.0
	for wv in waves:
		var dx: float = Config.diff.SHOCKWAVE_SPEED * delta
		wv.x += wv.dir * dx
		wv.dist += dx
	waves = waves.filter(func(wv): return wv.dist < C.JS_WAVE_RANGE and wv.x > 8.0 and wv.x < w - 8.0)


# ---------------------------------------------------------------- ④ 속사 (가짜 움찔)
func _duel_tick(p: Player) -> void:
	var fakes: Array = _duel.fakes
	for k in fakes.size():
		if t >= float(fakes[k]) and not _duel.has("f%d" % k):
			_duel["f%d" % k] = true
			body.snap("twitch")
			_duel.fake_t = TimeManager.world_time
			_duel.back_at = t + 0.15
	if _duel.has("back_at") and t >= float(_duel.back_at):
		_duel.erase("back_at")
		body.snap("duel")
	# 가짜 움찔에 베면 (헛스윙) → 즉시 사격
	if not _duel.punished and p.last_slash_t >= float(_duel.fake_t) and TimeManager.world_time - float(_duel.fake_t) <= C.FAKE_WINDOW:
		_duel.punished = true
		set_state("d_twitch")
		var ft := TimeManager.world_time + C.FAKE_PUNISH
		var pb := _bullet(0, ft, C.FAKE_PUNISH, "normal")
		pb.track = true            # 헛스윙 벌: 끝까지 따라감 (돌진해도 맞음)
		bullets = [pb]
		Audio.play_synced("quickdraw", ft)
		return
	if t >= float(_duel.hold):
		set_state("d_twitch")
		body.snap("twitch")
		var draw: float = Config.diff.QUICKDRAW_RING_TIME
		var fire_t := TimeManager.world_time + C.DUEL_TWITCH + draw
		bullets = [_bullet(0, fire_t, draw, String(_duel.get("role", "stagger")))]
		Audio.play_synced("quickdraw", fire_t)


# ---------------------------------------------------------------- 오프닝 · 피날레
## 오프닝 / 피날레 속사 한 판: 레터박스는 그대로, 입력만 풀어 줌
func _start_stage_duel() -> void:
	var main := _main()
	if main != null:
		main.cine_input(true)
	_card_f = -1 if _card_t > C.CARD_HOLD + C.CARD_FADE else _card_f
	_start_pattern(4)


## 피날레 시작 (마지막 반격 베기로 체력 0): rise = 비틀거리며 일어나는 연출부터 (아니면 바로 대사 · 결투 준비)
## restart = 재시작 · 디버그로 바로 피날레: 플레이어를 철견 가까이 (마지막 반격 직후와 같은 자리)에 두고 시작
func _begin_finale(restart := false) -> void:
	if restart:
		var pl := _player()
		if pl != null:
			var side := signf(pl.global_position.x - global_position.x)
			if side == 0.0:
				side = -float(facing)
			pl.global_position.x = _clamp_x(global_position.x + side * C.FIN_RESTART_GAP)
			pl.velocity = Vector2.ZERO
			var m := _main()
			if m != null:
				m.camera.reset_smoothing()
	_stop_pattern(false)
	_chain = 0
	_move = {}
	waves.clear()
	stage = "finale"
	hp = 0
	velocity = Vector2.ZERO
	GameState.boss_checkpoint = { "key": GameState.room_key(), "phase": 4 }
	set_state("fin")
	var main := _main()
	if main != null:
		main.start_finale(self)          # 빗방울 결투 (FinaleDuel 이 이 뒤를 모두 움직임)


## 플레이어를 봄 (FinaleDuel)
func face_player() -> void:
	_face_player()


## 오프닝: 튕겨나간 권총 (포물선, 빙글빙글)
func _gun_prop_tick(delta: float) -> void:
	if _gun_prop.is_empty() or _gun_prop.landed:
		return
	_gun_prop.t += delta
	_gun_prop.rot += 18.0 * delta
	if _gun_prop.t >= C.GUN_FLY_TIME:
		_gun_prop.landed = true
		_gun_prop.rot = 0.2
		Audio.boss_armor(0.7)
		_dust(_gun_prop.to, 4, 0)


func _gun_prop_pos() -> Vector2:
	var u := clampf(float(_gun_prop.t) / C.GUN_FLY_TIME, 0.0, 1.0)
	var from: Vector2 = _gun_prop.from
	var to: Vector2 = _gun_prop.to
	return from.lerp(to, u) + Vector2(0, -C.GUN_FLY_HEIGHT * 4.0 * u * (1.0 - u))


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


# ---------------------------------------------------------------- 그리기
## 건카타 회색 반달 (몸과 같은 층 — 예고가 아니라 결과)
func _draw_pose() -> void:
	if capturing():
		return
	if not _gun_prop.is_empty():
		var g := body.part("GunFShape")
		if g != null:
			draw_set_transform(to_local(_gun_prop_pos()), float(_gun_prop.rot), Vector2(facing, 1))
			for off in [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]:
				var pts := PackedVector2Array()
				for q in g.polygon:
					pts.append(q + off)
				draw_colored_polygon(pts, C.COL_RIM)
			draw_colored_polygon(g.polygon, C.COL_GUN)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if _trail_t > 0.0 and state == "w_combo":
		var u := 1.0 - _trail_t / C.WHIP_TRAIL_TIME
		var tc: Color = C.WHIP_TRAIL
		tc.a = 0.9 * (1.0 - u * u)
		var cx := Vector2(facing * 6.0, -24.0)
		var a0 := -PI / 2.0 - 0.4 if facing > 0 else -PI / 2.0 + 0.4
		DrawUtil.crescent(self, cx, 26.0, a0, 2.2 * facing, 0.0, 1.0, 6.0, tc, 2.0)


## 어둠 위 예고 층 (_tele 는 철견 자식 — to_local 로 맞춤)
## 빨간 조준선 (도탄은 꺾인 줄 + 꺾이는 점 빨간 점), 권총 빨간 점멸, 보라 다리 발광, 보라 충격파
func _draw_telegraph() -> void:
	var ci := _tele
	var col: Color = Config.colors.attack
	var wt := TimeManager.world_time
	# ③ 착지 빈틈: 머리 위 "빈틈" (흰 테두리 깜빡임과 함께 — 베면 반격 베기)
	if state == "stagger" and body.pose_name == "land" and stage == "fight":
		var lp := Vector2(0, -C.H * 0.62 - 9.0)
		Fonts.text(ci, C.JS_OPEN_LABEL, lp + Vector2(1, 1), 9, Color(0, 0, 0, 0.8), "center", false, true)
		Fonts.text(ci, C.JS_OPEN_LABEL, lp, 9, Color.WHITE, "center", false, true)
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
		var m := to_local(body.muzzle(b.gun))
		if b.kind == "ricochet":
			var bp := to_local(b.bounce)
			ci.draw_line(m, bp, c, width)
			ci.draw_line(bp, to_local(b.laser_end), c, width)
			ci.draw_rect(Rect2(bp.round() - Vector2(1.5, 1.5), Vector2(3, 3)), col)
		else:
			ci.draw_line(m, to_local(b.laser_end), c, width)
	# 권총 빨간 점멸 · 보라 다리 (몸 색을 바꾼 것과 같은 모양을 어둠 위에 한 번 더)
	var inv := global_transform.affine_inverse()
	if body.gun_flash:
		for q in body.part_polys(["GunFShape"]):
			ci.draw_set_transform_matrix(inv * q.xf)
			ci.draw_colored_polygon(q.pts, C.COL_GUN_FLASH)
	if body.leg_glow:
		var pulse := 0.6 + 0.4 * sin(t * 40.0)
		for q in body.part_polys(["ThighFShape", "LegFShape"]):
			ci.draw_set_transform_matrix(inv * q.xf)
			ci.draw_colored_polygon(q.pts, Color(C.COL_KICK, 0.85 * pulse))
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)
	# 착지 충격파: 좌우로 퍼지는 보라 띠
	for w in waves:
		var x := to_local(Vector2(w.x, _floor_y)).x
		var y := to_local(Vector2(0, _floor_y)).y
		var a: float = 1.0 - float(w.dist) / C.JS_WAVE_RANGE
		ci.draw_rect(Rect2(x - 3.0, y - C.JS_WAVE_H, 6.0, C.JS_WAVE_H), Color(C.COL_KICK, 0.9 * a))
		ci.draw_rect(Rect2(x - 3.0 - w.dir * 8.0, y - C.JS_WAVE_H * 0.6, 8.0, C.JS_WAVE_H * 0.6), Color(C.COL_KICK, 0.35 * a))

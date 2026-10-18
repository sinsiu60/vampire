// 철견 몸 명암 (CanvasGroup 머티리얼). 부위들을 한 장으로 합친 뒤, 테두리를 빛 방향에 따라 다르게 칠함:
//  - 빛(light_dir, 화면 좌표 — 몸 → 조명 방향) 을 향한 가장자리: 안쪽 1 · 2 · 3px 에 림라이트 띠 (바깥쪽일수록 밝게) → 빛을 받은 명암
//  - 빛 반대쪽 가장자리: 아주 옅은 1px 테두리만 (ambient) — 어두운 배경에서도 실루엣이 읽히게
//  - 바깥 테두리는 그리지 않음 (외곽선 대신 빛 받은 면). flash = 1 이면 바깥 1px 흰 테두리 (휘청 깜빡임)
shader_type canvas_item;
render_mode unshaded;

uniform vec4 rim_color : source_color = vec4(0.51, 0.58, 0.78, 1.0);
uniform vec4 flash_color : source_color = vec4(1.0);
uniform float flash = 0.0;
uniform float thickness = 1.0;
uniform vec2 light_dir = vec2(0.0, -1.0);   // 몸에서 조명 쪽 (정규화)
uniform float light_strength = 1.0;         // 0 = 조명 없음 (정전)
uniform float ambient = 0.28;               // 빛 반대쪽 가장자리 세기
uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_nearest;

float a_at(vec2 uv) {
	return textureLod(screen_texture, uv, 0.0).a;
}

void fragment() {
	vec2 px = SCREEN_PIXEL_SIZE * thickness;
	vec4 c = textureLod(screen_texture, SCREEN_UV, 0.0);
	vec4 o_rim = mix(rim_color, flash_color, flash);
	// 바깥 1px (휘청 깜빡임 때만)
	float o = max(max(a_at(SCREEN_UV + vec2(px.x, 0.0)), a_at(SCREEN_UV - vec2(px.x, 0.0))),
		max(a_at(SCREEN_UV + vec2(0.0, px.y)), a_at(SCREEN_UV - vec2(0.0, px.y))));
	float outer = clamp(o - c.a, 0.0, 1.0) * flash;
	vec3 col = c.rgb;
	if (c.a > 0.5) {
		// 빛 쪽으로 k px 떨어진 곳이 비었으면 → 빛 받은 가장자리에서 k px 안쪽
		vec2 L = normalize(light_dir) * px;
		float lit = 0.0;
		if (a_at(SCREEN_UV + L) < 0.5) {
			lit = 1.0;
		} else if (a_at(SCREEN_UV + L * 2.0) < 0.5) {
			lit = 0.45;
		} else if (a_at(SCREEN_UV + L * 3.0) < 0.5) {
			lit = 0.18;
		}
		// 그 밖의 가장자리 (빛 반대쪽 · 옆): 4방향 이웃 중 빈 곳이 있으면 옅은 1px
		float edge = 1.0 - min(min(a_at(SCREEN_UV + vec2(px.x, 0.0)), a_at(SCREEN_UV - vec2(px.x, 0.0))),
			min(a_at(SCREEN_UV + vec2(0.0, px.y)), a_at(SCREEN_UV - vec2(0.0, px.y))));
		float k = lit * light_strength;
		float amb = clamp(edge, 0.0, 1.0) * ambient * (1.0 - k);
		col = mix(col, rim_color.rgb, clamp(k, 0.0, 1.0));
		col = mix(col, rim_color.rgb, amb);
	}
	COLOR = vec4(mix(col, o_rim.rgb, outer), max(c.a, outer * o_rim.a));
}

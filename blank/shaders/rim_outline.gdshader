// 철견 몸 실루엣 테두리 (CanvasGroup 머티리얼). 부위들을 한 장으로 합친 뒤 바깥 1px 을 림 색으로.
// flash = 1 이면 테두리가 flash_color 로 (휘청 깜빡임).
shader_type canvas_item;
render_mode unshaded;

uniform vec4 rim_color : source_color = vec4(0.48, 0.65, 0.9, 1.0);
uniform vec4 flash_color : source_color = vec4(1.0);
uniform float flash = 0.0;
uniform float thickness = 1.0;
uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_nearest;

void fragment() {
	vec2 px = SCREEN_PIXEL_SIZE * thickness;
	vec4 c = textureLod(screen_texture, SCREEN_UV, 0.0);
	float o = textureLod(screen_texture, SCREEN_UV + vec2(px.x, 0.0), 0.0).a;
	o = max(o, textureLod(screen_texture, SCREEN_UV + vec2(-px.x, 0.0), 0.0).a);
	o = max(o, textureLod(screen_texture, SCREEN_UV + vec2(0.0, px.y), 0.0).a);
	o = max(o, textureLod(screen_texture, SCREEN_UV + vec2(0.0, -px.y), 0.0).a);
	vec4 rim = mix(rim_color, flash_color, flash);
	// 안쪽은 원래 색, 바깥 1px 만 테두리
	float edge = clamp(o - c.a, 0.0, 1.0);
	COLOR = vec4(mix(c.rgb, rim.rgb, edge), max(c.a, edge * rim.a));
}

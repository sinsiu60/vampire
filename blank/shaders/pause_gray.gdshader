// 일시정지: 아래 화면을 흑백 50% + 어둡게
shader_type canvas_item;
uniform sampler2D screen_tex : hint_screen_texture, filter_nearest;
uniform float desaturate = 0.5;
uniform float darken = 0.55;

void fragment() {
	vec3 c = textureLod(screen_tex, SCREEN_UV, 0.0).rgb;
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	COLOR = vec4(mix(c, vec3(l), desaturate) * darken, 1.0);
}

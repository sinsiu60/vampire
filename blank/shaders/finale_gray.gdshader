shader_type canvas_item;
// 피날레 흑백 후처리: 화면 전체 (월드 · 이펙트) 의 채도 · 대비 · 가장자리 비네트.
// 색을 유지할 것 (빗방울 · 총알 · 2겹 원 · 일섬 흰 선) 은 이 층 위 CanvasLayer 에 따로 그림 (FinaleDuel)

uniform sampler2D screen_tex : hint_screen_texture, filter_nearest;
uniform float saturation : hint_range(0.0, 1.0) = 1.0;   // 1 = 원래 색, 0 = 흑백
uniform float contrast : hint_range(1.0, 1.5) = 1.0;     // 1.0 ~ 1.3
uniform float pivot : hint_range(0.0, 1.0) = 0.12;       // 대비 기준 밝기 (어두운 화면)
uniform float vignette : hint_range(0.0, 1.0) = 0.0;     // 가장자리 어둡게

void fragment() {
	vec3 c = textureLod(screen_tex, SCREEN_UV, 0.0).rgb;
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	vec3 g = mix(vec3(l), c, saturation);
	g = (g - vec3(pivot)) * contrast + vec3(pivot);
	vec2 d = (SCREEN_UV - 0.5) * vec2(1.0, 0.78);
	float v = smoothstep(0.22, 0.62, length(d));
	g *= 1.0 - vignette * v;
	COLOR = vec4(clamp(g, 0.0, 1.0), 1.0);
}

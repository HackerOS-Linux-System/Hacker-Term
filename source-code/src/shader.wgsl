// ─── Vertex Shader ───────────────────────────────────────────────────────────

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) tex_coords: vec2<f32>,
    @location(2) fg_color: vec4<f32>,
    @location(3) bg_color: vec4<f32>,
    @location(4) glyph_type: u32, // 0 = text, 1 = cursor, 2 = selection
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) tex_coords: vec2<f32>,
    @location(1) fg_color: vec4<f32>,
    @location(2) bg_color: vec4<f32>,
    @location(3) glyph_type: u32,
};

struct Uniforms {
    screen_size: vec2<f32>,
    time: f32,
    scroll_offset: f32,
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(1) @binding(0)
var t_glyph: texture_2d<f32>;
@group(1) @binding(1)
var s_glyph: sampler;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    
    // Convert pixel coords to NDC
    let ndc = (in.position / uniforms.screen_size) * 2.0 - 1.0;
    out.clip_position = vec4<f32>(ndc.x, -ndc.y, 0.0, 1.0);
    out.tex_coords = in.tex_coords;
    out.fg_color = in.fg_color;
    out.bg_color = in.bg_color;
    out.glyph_type = in.glyph_type;
    
    return out;
}

// ─── Fragment Shader ─────────────────────────────────────────────────────────

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    if in.glyph_type == 1u {
        // Cursor — animated pulsing neon bar
        let pulse = sin(uniforms.time * 4.0) * 0.3 + 0.7;
        let cursor_color = vec4<f32>(0.0, 1.0, 0.85, pulse);
        return cursor_color;
    }
    
    if in.glyph_type == 2u {
        // Selection highlight
        return vec4<f32>(0.2, 0.5, 1.0, 0.35);
    }
    
    // Text glyph
    let alpha = textureSample(t_glyph, s_glyph, in.tex_coords).r;
    
    if alpha < 0.02 {
        // Background cell — semi-transparent
        return in.bg_color;
    }
    
    // Smooth font edge with slight glow
    let smooth_alpha = smoothstep(0.1, 0.9, alpha);
    return mix(in.bg_color, in.fg_color, smooth_alpha);
}

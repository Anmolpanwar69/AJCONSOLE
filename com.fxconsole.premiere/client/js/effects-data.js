/**
 * FX Console — Built-in Premiere Pro Effects & Transitions Database
 * ===================================================================
 * Ensures 100% immediate search availability for all standard video effects,
 * audio effects, video transitions, and audio transitions.
 */

var FX_DEFAULT_EFFECTS = [
    // ── Video Effects: Blur & Sharpen ─────────────────────────────────
    { name: "Gaussian Blur", matchName: "AE.ADBE Gaussian Blur 2", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Directional Blur", matchName: "AE.ADBE Motion Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Fast Blur", matchName: "AE.ADBE Fast Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Camera Blur", matchName: "AE.ADBE Camera Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Channel Blur", matchName: "AE.ADBE Channel Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Compound Blur", matchName: "AE.ADBE Compound Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Radial Blur", matchName: "AE.ADBE Radial Blur", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Sharpen", matchName: "AE.ADBE Sharpen", type: "videoEffect", category: "Blur & Sharpen" },
    { name: "Unsharp Mask", matchName: "AE.ADBE Unsharp Mask", type: "videoEffect", category: "Blur & Sharpen" },

    // ── Video Effects: Color Correction ───────────────────────────────
    { name: "Lumetri Color", matchName: "AE.ADBE Lumetri", type: "videoEffect", category: "Color Correction" },
    { name: "Brightness & Contrast", matchName: "AE.ADBE Brightness & Contrast 2", type: "videoEffect", category: "Color Correction" },
    { name: "Color Balance", matchName: "AE.ADBE Color Balance (HLS) 2", type: "videoEffect", category: "Color Correction" },
    { name: "Color Balance (RGB)", matchName: "AE.ADBE Color Balance 2", type: "videoEffect", category: "Color Correction" },
    { name: "Levels", matchName: "AE.ADBE ProLevels", type: "videoEffect", category: "Color Correction" },
    { name: "Tint", matchName: "AE.ADBE Tint", type: "videoEffect", category: "Color Correction" },
    { name: "Exposure", matchName: "AE.ADBE Exposure", type: "videoEffect", category: "Color Correction" },
    { name: "Video Limiter", matchName: "AE.ADBE Video Limiter", type: "videoEffect", category: "Color Correction" },
    { name: "ASC CDL", matchName: "AE.ADBE CDL", type: "videoEffect", category: "Color Correction" },

    // ── Video Effects: Distort & Transform ────────────────────────────
    { name: "Crop", matchName: "AE.ADBE Crop", type: "videoEffect", category: "Transform" },
    { name: "Transform", matchName: "AE.ADBE Geometry2", type: "videoEffect", category: "Distort" },
    { name: "Warp Stabilizer", matchName: "AE.ADBE SubspaceStabilizer", type: "videoEffect", category: "Distort" },
    { name: "Corner Pin", matchName: "AE.ADBE Corner Pin", type: "videoEffect", category: "Distort" },
    { name: "Lens Distortion", matchName: "AE.ADBE Lens Distortion", type: "videoEffect", category: "Distort" },
    { name: "Horizontal Flip", matchName: "AE.ADBE Horiz Flip", type: "videoEffect", category: "Transform" },
    { name: "Vertical Flip", matchName: "AE.ADBE Vert Flip", type: "videoEffect", category: "Transform" },
    { name: "Mirror", matchName: "AE.ADBE Mirror", type: "videoEffect", category: "Distort" },
    { name: "Spherize", matchName: "AE.ADBE Spherize", type: "videoEffect", category: "Distort" },
    { name: "Twirl", matchName: "AE.ADBE Twirl", type: "videoEffect", category: "Distort" },
    { name: "Wave Warp", matchName: "AE.ADBE Wave Warp", type: "videoEffect", category: "Distort" },
    { name: "Ripple", matchName: "AE.ADBE Ripple", type: "videoEffect", category: "Distort" },
    { name: "Turbulent Displace", matchName: "AE.ADBE Turbulent Displace", type: "videoEffect", category: "Distort" },
    { name: "Magnify", matchName: "AE.ADBE Magnify", type: "videoEffect", category: "Distort" },
    { name: "Offset", matchName: "AE.ADBE Offset", type: "videoEffect", category: "Distort" },

    // ── Video Effects: Keying ─────────────────────────────────────────
    { name: "Ultra Key", matchName: "AE.ADBE Ultra Key", type: "videoEffect", category: "Keying" },
    { name: "Color Key", matchName: "AE.ADBE Color Key", type: "videoEffect", category: "Keying" },
    { name: "Luma Key", matchName: "AE.ADBE Luma Key", type: "videoEffect", category: "Keying" },
    { name: "Track Matte Key", matchName: "AE.ADBE Track Matte Key", type: "videoEffect", category: "Keying" },
    { name: "Difference Matte", matchName: "AE.ADBE Difference Matte", type: "videoEffect", category: "Keying" },
    { name: "Alpha Adjust", matchName: "AE.ADBE Alpha Adjust", type: "videoEffect", category: "Keying" },

    // ── Video Effects: Perspective & Stylize ──────────────────────────
    { name: "Basic 3D", matchName: "AE.ADBE Basic 3D", type: "videoEffect", category: "Perspective" },
    { name: "Drop Shadow", matchName: "AE.ADBE Drop Shadow", type: "videoEffect", category: "Perspective" },
    { name: "Radial Shadow", matchName: "AE.ADBE Radial Shadow", type: "videoEffect", category: "Perspective" },
    { name: "Find Edges", matchName: "AE.ADBE Find Edges", type: "videoEffect", category: "Stylize" },
    { name: "Mosaic", matchName: "AE.ADBE Mosaic", type: "videoEffect", category: "Stylize" },
    { name: "Posterize", matchName: "AE.ADBE Posterize", type: "videoEffect", category: "Stylize" },
    { name: "Threshold", matchName: "AE.ADBE Threshold", type: "videoEffect", category: "Stylize" },
    { name: "Strobe Light", matchName: "AE.ADBE Strobe Light", type: "videoEffect", category: "Stylize" },
    { name: "Roughen Edges", matchName: "AE.ADBE Roughen Edges", type: "videoEffect", category: "Stylize" },
    { name: "Emboss", matchName: "AE.ADBE Emboss", type: "videoEffect", category: "Stylize" },

    // ── Video Effects: Generate & Noise ───────────────────────────────
    { name: "4-Color Gradient", matchName: "AE.ADBE 4ColorGradient", type: "videoEffect", category: "Generate" },
    { name: "Ramp", matchName: "AE.ADBE Ramp", type: "videoEffect", category: "Generate" },
    { name: "Grid", matchName: "AE.ADBE Grid", type: "videoEffect", category: "Generate" },
    { name: "Lens Flare", matchName: "AE.ADBE Lens Flare", type: "videoEffect", category: "Generate" },
    { name: "Lightning", matchName: "AE.ADBE Lightning", type: "videoEffect", category: "Generate" },
    { name: "Checkerboard", matchName: "AE.ADBE Checkerboard", type: "videoEffect", category: "Generate" },
    { name: "Circle", matchName: "AE.ADBE Circle", type: "videoEffect", category: "Generate" },
    { name: "Noise", matchName: "AE.ADBE Noise", type: "videoEffect", category: "Noise & Grain" },
    { name: "Noise Alpha", matchName: "AE.ADBE Noise Alpha", type: "videoEffect", category: "Noise & Grain" },
    { name: "Dust & Scratches", matchName: "AE.ADBE Dust & Scratches", type: "videoEffect", category: "Noise & Grain" },
    { name: "Median", matchName: "AE.ADBE Median", type: "videoEffect", category: "Noise & Grain" },

    // ── Video Effects: Time & Transition ──────────────────────────────
    { name: "Posterize Time", matchName: "AE.ADBE Posterize Time", type: "videoEffect", category: "Time" },
    { name: "Echo", matchName: "AE.ADBE Echo", type: "videoEffect", category: "Time" },
    { name: "Linear Wipe", matchName: "AE.ADBE Linear Wipe", type: "videoEffect", category: "Transition" },
    { name: "Radial Wipe", matchName: "AE.ADBE Radial Wipe", type: "videoEffect", category: "Transition" },
    { name: "Venetian Blinds", matchName: "AE.ADBE Venetian Blinds", type: "videoEffect", category: "Transition" },
    { name: "Gradient Wipe", matchName: "AE.ADBE Gradient Wipe", type: "videoEffect", category: "Transition" },

    // ── Audio Effects ─────────────────────────────────────────────────
    { name: "DeNoise", matchName: "DeNoise", type: "audioEffect", category: "Noise Reduction" },
    { name: "DeReverb", matchName: "DeReverb", type: "audioEffect", category: "Noise Reduction" },
    { name: "Parametric Equalizer", matchName: "Parametric EQ", type: "audioEffect", category: "Filter & EQ" },
    { name: "Hard Limiter", matchName: "Hard Limiter", type: "audioEffect", category: "Amplitude & Compression" },
    { name: "Multiband Compressor", matchName: "Multiband Compressor", type: "audioEffect", category: "Amplitude & Compression" },
    { name: "Dynamics", matchName: "Dynamics", type: "audioEffect", category: "Amplitude & Compression" },
    { name: "Single-band Compressor", matchName: "Single-band Compressor", type: "audioEffect", category: "Amplitude & Compression" },
    { name: "Tube-modeled Compressor", matchName: "Tube-modeled Compressor", type: "audioEffect", category: "Amplitude & Compression" },
    { name: "Graphic Equalizer (10 Bands)", matchName: "Graphic EQ (10 Bands)", type: "audioEffect", category: "Filter & EQ" },
    { name: "Graphic Equalizer (20 Bands)", matchName: "Graphic EQ (20 Bands)", type: "audioEffect", category: "Filter & EQ" },
    { name: "Graphic Equalizer (30 Bands)", matchName: "Graphic EQ (30 Bands)", type: "audioEffect", category: "Filter & EQ" },
    { name: "Bass", matchName: "Bass", type: "audioEffect", category: "Filter & EQ" },
    { name: "Treble", matchName: "Treble", type: "audioEffect", category: "Filter & EQ" },
    { name: "Highpass", matchName: "Highpass", type: "audioEffect", category: "Filter & EQ" },
    { name: "Lowpass", matchName: "Lowpass", type: "audioEffect", category: "Filter & EQ" },
    { name: "Studio Reverb", matchName: "Studio Reverb", type: "audioEffect", category: "Reverb" },
    { name: "Surround Reverb", matchName: "Surround Reverb", type: "audioEffect", category: "Reverb" },
    { name: "Convolution Reverb", matchName: "Convolution Reverb", type: "audioEffect", category: "Reverb" },
    { name: "Delay", matchName: "Delay", type: "audioEffect", category: "Delay & Echo" },
    { name: "Analog Delay", matchName: "Analog Delay", type: "audioEffect", category: "Delay & Echo" },
    { name: "Chorus/Flanger", matchName: "Chorus/Flanger", type: "audioEffect", category: "Modulation" },
    { name: "Phaser", matchName: "Phaser", type: "audioEffect", category: "Modulation" },
    { name: "Pitch Shifter", matchName: "Pitch Shifter", type: "audioEffect", category: "Time & Pitch" },
    { name: "Volume", matchName: "Volume", type: "audioEffect", category: "Amplitude & Compression" },
    { name: "Vocal Enhancer", matchName: "Vocal Enhancer", type: "audioEffect", category: "Special" },
    { name: "Distortion", matchName: "Distortion", type: "audioEffect", category: "Special" },

    // ── Video Transitions ─────────────────────────────────────────────
    { name: "Cross Dissolve", matchName: "Cross Dissolve", type: "videoTransition", category: "Dissolve" },
    { name: "Dip to Black", matchName: "Dip to Black", type: "videoTransition", category: "Dissolve" },
    { name: "Dip to White", matchName: "Dip to White", type: "videoTransition", category: "Dissolve" },
    { name: "Film Dissolve", matchName: "Film Dissolve", type: "videoTransition", category: "Dissolve" },
    { name: "Additive Dissolve", matchName: "Additive Dissolve", type: "videoTransition", category: "Dissolve" },
    { name: "Morph Cut", matchName: "Morph Cut", type: "videoTransition", category: "Dissolve" },
    { name: "Non-Additive Dissolve", matchName: "Non-Additive Dissolve", type: "videoTransition", category: "Dissolve" },
    { name: "Wipe", matchName: "Wipe", type: "videoTransition", category: "Wipe" },
    { name: "Radial Wipe", matchName: "Radial Wipe", type: "videoTransition", category: "Wipe" },
    { name: "Clock Wipe", matchName: "Clock Wipe", type: "videoTransition", category: "Wipe" },
    { name: "Barn Doors", matchName: "Barn Doors", type: "videoTransition", category: "Wipe" },
    { name: "Slide", matchName: "Slide", type: "videoTransition", category: "Slide" },
    { name: "Push", matchName: "Push", type: "videoTransition", category: "Slide" },
    { name: "Split", matchName: "Split", type: "videoTransition", category: "Slide" },
    { name: "Center Split", matchName: "Center Split", type: "videoTransition", category: "Slide" },
    { name: "Cross Zoom", matchName: "Cross Zoom", type: "videoTransition", category: "Zoom" },
    { name: "Page Peel", matchName: "Page Peel", type: "videoTransition", category: "Page Peel" },

    // ── Audio Transitions ─────────────────────────────────────────────
    { name: "Constant Power", matchName: "Constant Power", type: "audioTransition", category: "Crossfade" },
    { name: "Constant Gain", matchName: "Constant Gain", type: "audioTransition", category: "Crossfade" },
    { name: "Exponential Fade", matchName: "Exponential Fade", type: "audioTransition", category: "Crossfade" }
];

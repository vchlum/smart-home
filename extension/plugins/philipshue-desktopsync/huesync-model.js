'use strict';

/**
 * extension smart-home
 * JavaScript Philips Hue sync screen: colour model
 *
 * @author Dhiego
 * @copyright Copyright 2026, Dhiego.
 */

 /**
 * @license
 * The MIT License (MIT)
 *
 * Copyright (c) 2026 Dhiego
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/*
 * Colour model that reproduces the behaviour of Philips Hue Sync for PC (v1.13.0.77).
 *
 * The numbers below are the official app's own default settings (the config.json it writes on
 * first start: Core / AppMode.Video / CaptureOption "Video Default"). Interpretation choices
 * the settings do not settle are marked "ASSUMPTION".
 *
 * Plain JavaScript without gi:// imports.
 */

/* Video intensity presets (AppMode.Video.Presets; default = Moderate). Alphas are applied once
 * per analysed capture at the official PollingInterval of 61 ms (ASSUMPTION, see OFFICIAL);
 * the 60 Hz InterpolationFPS output glides between those analysed states. */
export const PRESETS = [
    { name: 'Subtle', alphaL: 0.005, alphaAB: 0.15, compareThreshold: 5 },
    { name: 'Moderate', alphaL: 0.025, alphaAB: 0.30, compareThreshold: 2 },
    { name: 'High', alphaL: 0.07, alphaAB: 0.50, compareThreshold: 1 },
    { name: 'Intense', alphaL: 0.5, alphaAB: 0.5, compareThreshold: 0 },
];

export const OFFICIAL = {
    interpolationFps: 60,           /* Core.InterpolationFPS */
    pollingIntervalMs: 61,          /* App.PollingInterval [61, 31, 16]: the alphas' time base
                                     * (ASSUMPTION: the slowest step, ~16 Hz, is the video one) */
    darknessThreshold: 25,          /* Core.DarknessThreshold (ASSUMPTION: CIELAB L*, 0..100) */
    darkAlphaLFloor: 0.005,         /* Core.DarkSmoothingAlphaLFloor */
    darkAlphaLCeiling: 0.01,        /* Core.DarkSmoothingAlphaLCeiling */
    darkAlphaABFloor: 0.01,         /* Core.DarkSmoothingAlphaABFloor */
    darkAlphaABCeiling: 0.03,       /* Core.DarkSmoothingAlphaABCeiling */
    desaturationFloor: 3,           /* Core.DesaturationFloor (ASSUMPTION: CIELAB chroma) */
    desaturationCeiling: 20,        /* Core.DesaturationCeiling */
    blackThreshold: 1,              /* Core.BlackThreshold (ASSUMPTION: L*) */
    trimeanMaxSamples: 5000,        /* Core.TrimeanMaxSamples[TrimeanSamplesDefault = 2] */
    blackBarColorThreshold: 9,      /* Core.BlackBarDetector.ColorThreshold (0..255) */
    blackBarHistorySize: 200,       /* Core.BlackBarDetector.HistorySize (frames) */
    blackBarScanFrom: 0.4,          /* Core.BlackBarDetector.Left/TopOffsetRatio */
    blackBarScanTo: 0.6,            /* Core.BlackBarDetector.Right/BottomOffsetRatio */
};

/*
 * CaptureOption "Video Default", ScreenCount 1: lamp position box (entertainment-area
 * coordinates, -1..1: x left->right, y away->towards the screen, z floor->ceiling)
 * -> screen rectangle (0..1). First match wins, as listed by the official app.
 */
export const AREAS_VIDEO = [
    { x: [0.33, 1.0], y: [0.1, -1.0], z: [1.0, -1.0], screen: [0.5, 1.0, 0.0, 1.0] },
    { x: [-0.33, 0.33], y: [0.1, -1.0], z: [1.0, -1.0], screen: [0.25, 0.75, 0.0, 1.0] },
    { x: [-1.0, -0.33], y: [0.1, -1.0], z: [1.0, -1.0], screen: [0.0, 0.5, 0.0, 1.0] },
    { x: [-0.33, 0.33], y: [1.0, 0.1], z: [0.33, -0.33], screen: [0.3, 0.7, 0.3, 0.7] },
    { x: [-0.33, 0.33], y: [1.0, 0.1], z: [-0.33, -1.0], screen: [0.2, 0.8, 0.8, 1.0] },
    { x: [0.33, 1.0], y: [1.0, 0.1], z: [-0.33, -1.0], screen: [0.7, 1.0, 0.67, 1.0] },
    { x: [0.33, 1.0], y: [1.0, 0.1], z: [0.33, -0.33], screen: [0.8, 1.0, 0.24, 0.76] },
    { x: [0.39, 1.0], y: [1.0, 0.1], z: [1.0, 0.33], screen: [0.7, 1.0, 0.0, 0.375] },
    { x: [0.13, 0.39], y: [1.0, 0.1], z: [1.0, 0.33], screen: [0.6, 0.9, 0.0, 0.2] },
    { x: [-0.13, 0.13], y: [1.0, 0.1], z: [1.0, 0.33], screen: [0.35, 0.65, 0.0, 0.2] },
    { x: [-0.39, -0.13], y: [1.0, 0.1], z: [1.0, 0.33], screen: [0.1, 0.4, 0.0, 0.2] },
    { x: [-1.0, -0.39], y: [1.0, 0.1], z: [1.0, 0.33], screen: [0.0, 0.3, 0.0, 0.375] },
    { x: [-1.0, -0.33], y: [1.0, 0.1], z: [0.33, -0.33], screen: [0.0, 0.2, 0.24, 0.76] },
    { x: [-1.0, -0.33], y: [1.0, 0.1], z: [-0.33, -1.0], screen: [0.0, 0.29, 0.67, 1.0] },
];

/*
 * Panel slider -> intensity, continuous. The official presets sit at the centres of the
 * extension's four icon steps (0.125 Subtle, 0.375 Moderate, 0.625 High, 0.875 Intense) and the
 * easing rates are interpolated between them on a log scale, so every bit of slider movement
 * changes the feel by a similar amount. Below Subtle (0.0 .. 0.125) colour gets up to 2x slower
 * than Subtle ("extra gradual", not in the official app); above Intense it stays Intense.
 */
const ANCHORS = [0.125, 0.375, 0.625, 0.875];
const sliderCache = { v: null, preset: null };

const rateOf = (alpha) => -Math.log(1 - alpha);   /* per-step rate; 1 - exp(-rate) = alpha */
const alphaOf = (rate) => 1 - Math.exp(-rate);

export function presetFromSlider(value) {
    let v = Number(value);
    if (!Number.isFinite(v)) {
        v = ANCHORS[1];
    }
    v = Math.min(1, Math.max(0, v));
    if (sliderCache.v === v) {
        return sliderCache.preset;
    }

    let preset;
    if (v <= ANCHORS[0]) {
        const p = PRESETS[0], extra = Math.pow(2, (v - ANCHORS[0]) / ANCHORS[0]);   /* 0.5 .. 1 */
        preset = { name: v === ANCHORS[0] ? 'Subtle' : 'Subtle+', alphaL: p.alphaL,
            alphaAB: alphaOf(rateOf(p.alphaAB) * extra), compareThreshold: p.compareThreshold };
    } else if (v >= ANCHORS[3]) {
        preset = Object.assign({}, PRESETS[3]);
    } else {
        const i = v < ANCHORS[1] ? 0 : v < ANCHORS[2] ? 1 : 2;
        const t = (v - ANCHORS[i]) / (ANCHORS[i + 1] - ANCHORS[i]);
        const a = PRESETS[i], b = PRESETS[i + 1];
        const logLerp = (x, y) => alphaOf(Math.exp(lerp(Math.log(rateOf(x)), Math.log(rateOf(y)), t)));
        preset = { name: t < 0.5 ? a.name : b.name, alphaL: logLerp(a.alphaL, b.alphaL),
            alphaAB: logLerp(a.alphaAB, b.alphaAB), compareThreshold: lerp(a.compareThreshold, b.compareThreshold, t) };
    }
    sliderCache.v = v;
    sliderCache.preset = preset;
    return preset;
}

/* ------------------------------- colour space ------------------------------- */

const XN = 0.95047, YN = 1.0, ZN = 1.08883;   /* D65 white */
const EPS = 216 / 24389, KAPPA = 24389 / 27;

function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c, round) {
    c = Math.min(1, Math.max(0, c));
    const v = (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
    return round ? Math.round(v) : v;
}

function fLab(t) {
    return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function fLabInv(f) {
    const f3 = f * f * f;
    return f3 > EPS ? f3 : (116 * f - 16) / KAPPA;
}

export function srgbToLab(rgb) {
    const r = srgbToLinear(rgb[0]), g = srgbToLinear(rgb[1]), b = srgbToLinear(rgb[2]);
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN;
    const y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / YN;
    const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / ZN;
    const fx = fLab(x), fy = fLab(y), fz = fLab(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** @param {Boolean} round false: keep fractions (for 16-bit output) */
export function labToSrgb(lab, round = true) {
    const fy = (lab[0] + 16) / 116;
    const fx = fy + lab[1] / 500;
    const fz = fy - lab[2] / 200;
    const x = fLabInv(fx) * XN, y = fLabInv(fy) * YN, z = fLabInv(fz) * ZN;
    return [
        linearToSrgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z, round),
        linearToSrgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z, round),
        linearToSrgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z, round),
    ];
}

export function deltaE(p, q) {
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/* ------------------------------ zones & trimean ------------------------------ */

function within(v, range) {
    const lo = Math.min(range[0], range[1]), hi = Math.max(range[0], range[1]);
    return v >= lo && v <= hi;
}

function boxDistance(p, area) {
    let d = 0;
    for (const [v, r] of [[p.x, area.x], [p.y, area.y], [p.z, area.z]]) {
        const lo = Math.min(r[0], r[1]), hi = Math.max(r[0], r[1]);
        d += v < lo ? (lo - v) ** 2 : v > hi ? (v - hi) ** 2 : 0;
    }
    return d;
}

/**
 * Screen rectangle [x0, x1, y0, y1] (0..1) a lamp at entertainment position {x, y, z} follows.
 * First matching box as in the official table; outside every box: the nearest one.
 */
export function screenRectForPosition(pos, areas = AREAS_VIDEO) {
    const p = { x: Number(pos.x) || 0, y: Number(pos.y) || 0, z: Number(pos.z) || 0 };
    for (const a of areas) {
        if (within(p.x, a.x) && within(p.y, a.y) && within(p.z, a.z)) {
            return a.screen;
        }
    }
    let best = areas[0], bestD = Infinity;
    for (const a of areas) {
        const d = boxDistance(p, a);
        if (d < bestD) {
            bestD = d;
            best = a;
        }
    }
    return best.screen;
}

/**
 * Trimean (Q1 + 2*median + Q3) / 4 of each RGB channel inside a rectangle of a pixel buffer.
 * Histogram based (O(n)); samples on a regular grid so at most maxSamples pixels are read.
 *
 * @param {Object} img {pixels, width, height, rowstride, nChannels}
 * @param {Array} rect [x0, x1, y0, y1] in pixels (x1/y1 exclusive)
 */
export function trimeanRGB(img, rect, maxSamples = OFFICIAL.trimeanMaxSamples) {
    const x0 = Math.max(0, Math.floor(rect[0])), x1 = Math.min(img.width, Math.ceil(rect[1]));
    const y0 = Math.max(0, Math.floor(rect[2])), y1 = Math.min(img.height, Math.ceil(rect[3]));
    const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
    if (w === 0 || h === 0) {
        return [0, 0, 0];
    }

    const step = Math.max(1, Math.ceil(Math.sqrt((w * h) / maxSamples)));
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    let n = 0;

    for (let y = y0; y < y1; y += step) {
        let i = y * img.rowstride + x0 * img.nChannels;
        const di = step * img.nChannels;
        for (let x = x0; x < x1; x += step, i += di) {
            hist[0][img.pixels[i]]++;
            hist[1][img.pixels[i + 1]]++;
            hist[2][img.pixels[i + 2]]++;
            n++;
        }
    }

    return hist.map((hc) => {
        const q = (frac) => {
            const target = frac * (n - 1);
            let acc = 0;
            for (let v = 0; v < 256; v++) {
                acc += hc[v];
                if (acc > target) {
                    return v;
                }
            }
            return 255;
        };
        return (q(0.25) + 2 * q(0.5) + q(0.75)) / 4;
    });
}

/* -------------------------------- black bars -------------------------------- */

/**
 * Letterbox / pillarbox detection with the official parameters: rows (columns) are tested only
 * in the middle 40..60 % band, a line is black when every sampled channel <= 9, and a bar size
 * is only trusted when it was present in every one of the last 200 frames (so content is never
 * cropped because of one dark frame; bars disappear immediately when the picture fills again).
 */
export class BlackBarDetector {
    constructor(historySize = OFFICIAL.blackBarHistorySize) {
        this._size = historySize;
        this._hist = [];
    }

    _isBlack(img, x0, x1, y0, y1) {
        const t = OFFICIAL.blackBarColorThreshold;
        for (let y = y0; y < y1; y++) {
            let i = y * img.rowstride + x0 * img.nChannels;
            for (let x = x0; x < x1; x++, i += img.nChannels) {
                if (img.pixels[i] > t || img.pixels[i + 1] > t || img.pixels[i + 2] > t) {
                    return false;
                }
            }
        }
        return true;
    }

    /** @return {Array} content rectangle [x0, x1, y0, y1] in pixels */
    update(img) {
        const W = img.width, H = img.height;
        const cx0 = Math.floor(W * OFFICIAL.blackBarScanFrom), cx1 = Math.ceil(W * OFFICIAL.blackBarScanTo);
        const cy0 = Math.floor(H * OFFICIAL.blackBarScanFrom), cy1 = Math.ceil(H * OFFICIAL.blackBarScanTo);
        let top = 0, bottom = 0, left = 0, right = 0;
        while (top < H / 2 - 1 && this._isBlack(img, cx0, cx1, top, top + 1)) top++;
        while (bottom < H / 2 - 1 && this._isBlack(img, cx0, cx1, H - 1 - bottom, H - bottom)) bottom++;
        while (left < W / 2 - 1 && this._isBlack(img, left, left + 1, cy0, cy1)) left++;
        while (right < W / 2 - 1 && this._isBlack(img, W - 1 - right, W - right, cy0, cy1)) right++;

        /* a fully black frame says nothing about bars */
        if (top >= H / 2 - 1 || left >= W / 2 - 1) {
            top = bottom = left = right = 0;
        }

        this._hist.push([top, bottom, left, right]);
        if (this._hist.length > this._size) {
            this._hist.shift();
        }

        const min = [Infinity, Infinity, Infinity, Infinity];
        for (const h of this._hist) {
            for (let k = 0; k < 4; k++) {
                min[k] = Math.min(min[k], h[k]);
            }
        }
        /* only crop once the history is full: a bar must be stable before it is trusted */
        if (this._hist.length < this._size) {
            return [0, W, 0, H];
        }
        return [min[2], W - min[3], min[0], H - min[1]];
    }

    reset() {
        this._hist = [];
    }
}

/**
 * Colours for every channel from one downscaled frame.
 * @param {Object} img pixel buffer
 * @param {Array} channels [{id, position: {x, y, z}}, ...]
 * @param {Array} content [x0, x1, y0, y1] usable picture (black bars removed)
 * @return {Array} [[channelId, [r, g, b]], ...]
 */
export function channelColors(img, channels, content) {
    const cw = content[1] - content[0], ch = content[3] - content[2];
    const perZone = Math.max(200, Math.floor(OFFICIAL.trimeanMaxSamples / Math.max(1, channels.length)));
    return channels.map((c) => {
        const r = screenRectForPosition(c.position);
        const rect = [content[0] + r[0] * cw, content[0] + r[1] * cw, content[2] + r[2] * ch, content[2] + r[3] * ch];
        return [c.id, trimeanRGB(img, rect, perZone)];
    });
}

/* ------------------------------- smoothing ------------------------------- */

function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Hue Sync style easing in CIELAB, in two stages:
 *
 *  1. analysis, once per capture (commit()): the smoothed colour moves towards the captured one
 *     by the preset alphas, scaled to the time since the previous capture with the official
 *     61 ms PollingInterval as the unit (so a slower or faster capture gives the same speed):
 *      - lightness (L) and colour (a, b) use different alphas,
 *      - in dark scenes (target L < 25) both slow down to the DarkSmoothing floor..ceiling,
 *      - a new capture is ignored while it is closer than ColorsCompareTreshold (dE),
 *      - nearly grey colours lose their tint (chroma 3..20), black below L 1;
 *  2. interpolation, every output frame (step(), InterpolationFPS 60): the lamp glides linearly
 *     from where it is to the newest analysed colour over one capture period, so it never jumps
 *     at capture time. Output is fractional sRGB (0..255 floats) for 16-bit streaming.
 */
export class LabSmoother {
    constructor(options = {}) {
        this._cfg = Object.assign({}, OFFICIAL, options);
        this._channels = new Map();
        this._preset = PRESETS[1];
        this._clock = 0;                                /* ms, advanced by step() */
        this._lastCommit = -1;
        this._segStart = 0;
        this._period = this._cfg.pollingIntervalMs;     /* measured capture period (smoothed) */
    }

    _shape(rgb) {
        const lab = srgbToLab(rgb);
        if (lab[0] < this._cfg.blackThreshold) {
            return [0, 0, 0];
        }
        const chroma = Math.hypot(lab[1], lab[2]);
        const f = Math.min(1, Math.max(0,
            (chroma - this._cfg.desaturationFloor) / (this._cfg.desaturationCeiling - this._cfg.desaturationFloor)));
        return [lab[0], lab[1] * f, lab[2] * f];
    }

    setTarget(channel, rgb) {
        const lab = this._shape(rgb);
        const state = this._channels.get(channel);
        if (!state) {
            /* first colour: start there instead of fading in from black */
            this._channels.set(channel, { target: lab, smoothed: lab.slice(), from: lab.slice(), to: lab.slice(), out: lab.slice() });
            return;
        }
        if (deltaE(lab, state.target) >= this._preset.compareThreshold) {
            state.target = lab;
        }
    }

    /** One analysis step: call after the targets of a capture have been set. */
    commit() {
        const c = this._cfg, p = this._preset;
        let dt = this._lastCommit < 0 ? c.pollingIntervalMs : this._clock - this._lastCommit;
        dt = Math.min(Math.max(dt, 0), 4 * c.pollingIntervalMs);     /* after a stall: no lurch */
        this._lastCommit = this._clock;
        if (dt > 0) {
            this._period += (Math.min(Math.max(dt, 16), 250) - this._period) * 0.25;
        }
        const n = dt / c.pollingIntervalMs;

        for (const s of this._channels.values()) {
            let aL = p.alphaL, aAB = p.alphaAB;
            if (s.target[0] < c.darknessThreshold) {
                const t = Math.max(0, s.target[0]) / c.darknessThreshold;
                aL = Math.min(aL, lerp(c.darkAlphaLFloor, c.darkAlphaLCeiling, t));
                aAB = Math.min(aAB, lerp(c.darkAlphaABFloor, c.darkAlphaABCeiling, t));
            }
            const eL = 1 - Math.pow(1 - aL, n);
            const eAB = 1 - Math.pow(1 - aAB, n);
            s.smoothed[0] += (s.target[0] - s.smoothed[0]) * eL;
            s.smoothed[1] += (s.target[1] - s.smoothed[1]) * eAB;
            s.smoothed[2] += (s.target[2] - s.smoothed[2]) * eAB;
            s.from = s.out.slice();
            s.to = s.smoothed.slice();
        }
        this._segStart = this._clock;
    }

    /**
     * @param {Number} dtMs time since the previous step
     * @param {Object} preset from presetFromSlider() / PRESETS
     * @return {Array} [[channel, r, g, b], ...] sRGB 0..255 (fractional)
     */
    step(dtMs, preset) {
        if (preset && typeof preset === 'object') {
            this._preset = preset;
        }
        this._clock += Math.max(0, dtMs);
        const u = Math.min(1, (this._clock - this._segStart) / this._period);
        const out = [];

        for (const [channel, s] of this._channels) {
            for (let k = 0; k < 3; k++) {
                s.out[k] = s.from[k] + (s.to[k] - s.from[k]) * u;
            }
            const rgb = labToSrgb(s.out, false);
            out.push([channel, rgb[0], rgb[1], rgb[2]]);
        }
        return out;
    }

    reset() {
        this._channels.clear();
        this._lastCommit = -1;
        this._period = this._cfg.pollingIntervalMs;
    }

    get size() {
        return this._channels.size;
    }
}

'use strict';

/**
 * utils smart-home
 * JavaScript Gnome extension for Smart Home extension.
 *
 * @author Václav Chlumský
 * @copyright Copyright 2025, Václav Chlumský.
 */

/**
 * @license
 * The MIT License (MIT)
 *
 * Copyright (c) 2025 Václav Chlumský
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

export const SETTINGS_SCHEMA = "org.gnome.shell.extensions.smart-home";
export const SETTINGS_FORCE_ENGLISH = "force-english";
export const SETTINGS_DEBUG = "debug";
export const SETTINGS_ICONPACK = "icon-pack";
export const SETTINGS_REMEMBER_OPENED_SUBMENU = "remember-opened-submenu";
export const SETTINGS_REDUCED_PADDING = "reduced-padding";
export const SETTINGS_MENU_SELECTED = "menu-selection";
export const SETTINGS_MENU_SELECTED_TYPE = "a{sa{ss}}";
export const SETTINGS_MISCELLANOUS_STORAGE = "miscellaneous-storage";
export const SETTINGS_MISCELLANOUS_STORAGE_TYPE = "a{sa{ss}}";

export const SETTINGS_PHILIPSHUEBRIDGE = "philipshue-bridge";
export const SETTINGS_PHILIPSHUEDESKTOPSYNC = "philipshue-desktopsync";
export const SETTINGS_PHILIPSHUESYNCBOX = "philipshue-syncbox";
export const SETTINGS_NANOLEAF = "nanoleaf";
export const SETTINGS_IKEADIRIGERA = "ikea-dirigera";
export const SETTINGS_HOMEASSISTANT = "home-assistant";
export const SETTINGS_SHELLY = "shelly";
export const SETTINGS_SMARTHOME_UNIVERSAL = "smart-home-universal";
export const SETTINGS_PLUGIN_TYPE = "a{sa{ss}}";

export const PLUGIN_LIST = [
    SETTINGS_SMARTHOME_UNIVERSAL, /* must be first */
    SETTINGS_PHILIPSHUEBRIDGE,
    SETTINGS_PHILIPSHUEDESKTOPSYNC,
    SETTINGS_PHILIPSHUESYNCBOX,
    SETTINGS_NANOLEAF,
    SETTINGS_IKEADIRIGERA,
    SETTINGS_HOMEASSISTANT,
    SETTINGS_SHELLY,
];

export const PLUGIN_ALL_IN_ONE = [
    SETTINGS_SMARTHOME_UNIVERSAL,
    SETTINGS_NANOLEAF,
    SETTINGS_SHELLY,
]

export const ALL_DEFAULT_HIDE_UNAVAILABLE = false;
export const HOMEASSISTANT_DEFAULT_TIMEOUT = 3;
export const PHILIPSHUEBRIDGE_DEFAULT_TIMEOUT = 2;
export const PHILIPSHUEBRIDGE_DEFAULT_ZONESFIRST = true;
export const PHILIPSHUEBRIDGE_DEFAULT_SHOWSCENES = true;
export const IKEADIRIGERA_DEFAULT_LIGHTLEVEL_OUTLETS = false;
export const PHILIPSHUESYNCBOX_DEFAULT_TIMEOUT = 5;
export const NANOLEAF_DEFAULT_TIMEOUT = 8;
export const IKEADIRIGERA_DEFAULT_TIMEOUT = 3;
export const SHELLY_DEFAULT_TIMEOUT = 5;

let _debug = false;

export function checkGettextEnglish(gettext, settings) {
    let forceEnglish = settings.get_boolean(SETTINGS_FORCE_ENGLISH);

    return forceEnglish ? (a) => { return a; } : gettext;
}

/**
 * Enable/disable debug logging
 *
 * @method setDebug
 * @param {Boolean} value
 */
export function setDebug(debug) {
    _debug = debug;
}

/**
 * Returns true if debug enabled
 *
 * @method getDebug
 * @return {Boolean}
 */
export function getDebug() {
    return _debug;
}

/**
 * Logs debug message
 *
 * @method logDebug
 * @param {String} meassage
 */
export function logDebug(msg) {
    if (_debug) {
        console.log(`Smart Home [debug]: ${msg}`)
    }
}

/**
 * Logs error message
 *
 * @method logError
 * @param {String} meassage
 */
export function logError(msg) {
    console.error(`Smart Home [error]: ${msg}`)
}

/**
 * Generate almost useless and amost unique number
 * 
 * @method getUuid
 * @private
 * @return {Number} randomly generated number
 */
export function getUuid() {

    /* items in this.refreshMenuObjects may occure more then ones,
     * this way it is possible - otherwise, the ID is useless
     */
    return Math.round((Math.random()*1000000));
}

export function removeFromArray(arr, remove) {
    return arr.filter(
        (value) => { return value != remove; }
    );
}

/**
 * Converts kelvin temperature to RGB
 * https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html
 * 
 * @method kelvinToRGB
 * @param {Number} kelvin in temperature
 * @return {Object} array with [R, G, B]
 */
export function kelvinToRGB(kelvin) {
    let tmpCalc = 0;
    let tmpKelvin = kelvin;
    let red = 0;
    let green = 0;
    let blue = 0;

    if (tmpKelvin < 1000) {
        tmpKelvin = 1000;
    }

    if (tmpKelvin > 40000) {
        tmpKelvin = 40000;
    }

    tmpKelvin = tmpKelvin / 100;

    if (tmpKelvin <= 66) {
        red = 255;
    } else {
        tmpCalc = tmpKelvin - 60;
        tmpCalc = 329.698727446 * Math.pow(tmpCalc, -0.1332047592);

        red = tmpCalc;
        if (red < 0) {red = 0;}
        if (red > 255) {red = 255;}
    }

    if (tmpKelvin <= 66) {
        tmpCalc = tmpKelvin;
        tmpCalc = 99.4708025861 * Math.log(tmpCalc) - 161.1195681661;

        green = tmpCalc;
        if (green < 0) {green = 0;}
        if (green > 255) {green = 255;}
    } else {
        tmpCalc = tmpKelvin - 60;
        tmpCalc = 288.1221695283 * Math.pow(tmpCalc, -0.0755148492);

        green = tmpCalc;
        if (green < 0) {green = 0;}
        if (green > 255) {green = 255;}
    }

    if (tmpKelvin >= 66) {
        blue = 255;
    } else if (tmpKelvin <=19) {
        blue = 0;
    } else {
        tmpCalc = tmpKelvin - 10;
        tmpCalc = 138.5177312231 * Math.log(tmpCalc) - 305.0447927307;

        blue = tmpCalc;
        if (blue < 0) {blue = 0;}
        if (blue > 255) {blue = 255;}
    }

    return [Math.round(red), Math.round(green), Math.round(blue)];
}

/**
 * Scale temperature value based on min/max boundaries
 * 
 * @method scaleTemp
 * @param {Number} value in kelvin to scale
 * @param {Number} min boundary temperature
 * @param {Number} max boundary temeprature
 * @return {Number} 
 */
function scaleTemp(value, min = 6500, max = 2200) {
    if (min < max) {  min = 6500; max = 2200; }

    return Math.round(
        Math.round(
            max + ((value - 2200)/(6500 - 2200) * (min - max))
        )
    );
}

/**
 * Converts RGB to the closest kelvin in table
 * 
 * @method RGBToKelvin
 * @param {Number} red
 * @param {Number} green
 * @param {Number} blue
 * @param {Number} minimal possible temperature
 * @param {Number} maximal possible temperature
 * @return {Number} kelvin in temperature
 */
export function RGBToKelvin(r, g, b, min = 6500, max = 2200) {
    let selectR = -1;
    let selectG = -1;
    let selectB = -1;
    let difference;

    /**
     * https://andi-siess.de/rgb-to-color-temperature/
     * RGB values are 2200-9200, relative temperature
     * is 2200-6500, which is suitable for the devices.
     */

    const whiteTemeratures = {
        2200: [255,147,44],
        2339: [255,154,57],
        2478: [255,161,70],
        2617: [255,167,84],
        2756: [255,174,97],
        2895: [255,181,110],
        3034: [255,188,123],
        3173: [255,194,136],
        3312: [255,201,150],
        3451: [255,208,163],
        3590: [255,215,176],
        3729: [255,221,189],
        3868: [255,228,202],
        4007: [255,235,215],
        4146: [255,242,227],
        4285: [255,248,242],
        4419: [255,255,255],
        4554: [252,253,255],
        4693: [249,251,255],
        4832: [246,249,255],
        4971: [243,247,255],
        5110: [240,245,255],
        5249: [237,243,255],
        5388: [234,241,255],
        5527: [232,239,255],
        5666: [229,236,255],
        5805: [226,234,255],
        5944: [223,232,255],
        6083: [220,230,255],
        6222: [217,228,255],
        6361: [214,226,255],
        6500: [211,224,255]
    }

    difference = 255;
    for (let i in whiteTemeratures) {
        let tmp = r - whiteTemeratures[i][0];
        if (tmp < 0) { tmp = tmp * -1; }

        if (tmp < difference) {
            difference = tmp;
            selectR = whiteTemeratures[i][0];
        }
    }

    difference = 255;
    for (let i in whiteTemeratures) {
        if (whiteTemeratures[i][0] !== selectR) {
            continue;
        }

        let tmp = g - whiteTemeratures[i][1];
        if (tmp < 0) { tmp = tmp * -1; }

        if (tmp < difference) {
            difference = tmp;
            selectG = whiteTemeratures[i][1];
        }
    }

    difference = 255;
    for (let i in whiteTemeratures) {
        if (whiteTemeratures[i][0] !== selectR) {
            continue;
        }

        if (whiteTemeratures[i][1] !== selectG) {
            continue;
        }

        let tmp = b - whiteTemeratures[i][2];
        if (tmp < 0) { tmp = tmp * -1; }

        if (tmp < difference) {
            difference = tmp;
            selectB = whiteTemeratures[i][2];
        }
    }

    for (let i in whiteTemeratures) {
        if (whiteTemeratures[i][0] !== selectR) {
            continue;
        }

        if (whiteTemeratures[i][1] !== selectG) {
            continue;
        }

        if (whiteTemeratures[i][2] !== selectB) {
            continue;
        }

        return scaleTemp(i, min, max);
    }

    return 0;
}

/**
 * https://stackoverflow.com/questions/8022885/rgb-to-hsv-color-in-javascript
 * 0 <= r, g, b <= 255
 * 0 <= h <= 360
 * 0 <= s, l <= 100
 */
export function rgbToHsv (r, g, b) {
    let rabs, gabs, babs, rr, gg, bb, h, s, v, diff, diffc, percentRoundFn;
    rabs = r / 255;
    gabs = g / 255;
    babs = b / 255;
    v = Math.max(rabs, gabs, babs),
    diff = v - Math.min(rabs, gabs, babs);
    diffc = c => (v - c) / 6 / diff + 1 / 2;
    percentRoundFn = num => Math.round(num * 100) / 100;
    if (diff == 0) {
        h = s = 0;
    } else {
        s = diff / v;
        rr = diffc(rabs);
        gg = diffc(gabs);
        bb = diffc(babs);

        if (rabs === v) {
            h = bb - gg;
        } else if (gabs === v) {
            h = (1 / 3) + rr - bb;
        } else if (babs === v) {
            h = (2 / 3) + gg - rr;
        }
        if (h < 0) {
            h += 1;
        }else if (h > 1) {
            h -= 1;
        }
    }
    return [
        Math.round(h * 360),
        Math.round(percentRoundFn(s * 100)),
        Math.round(percentRoundFn(v * 100))
    ]
}

/**
 * https://stackoverflow.com/questions/17242144/javascript-convert-hsb-hsv-color-to-rgb-accurately/54024653#54024653
 * 0 <= h <= 360
 * 0 <= s, l <= 100
 * 0 <= r, g, b <= 255
 */
export function hsvToRgb(h, s, v) {
    h = h / 360.0
    s = s / 100.0
    v = v / 100.0
    let r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255)
    ]
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from https://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
 *
 * @param   {number}  h       The hue
 * @param   {number}  s       The saturation
 * @param   {number}  l       The lightness
 * @return  {Array}           The RGB representation
 */
export function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hueToRgb(p, q, h + 1/3);
        g = hueToRgb(p, q, h);
        b = hueToRgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function hueToRgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
}

export function isExternalMonitorOn() {
    let monitorManager = global.backend.get_monitor_manager();
    let nMonitors = global.display.get_n_monitors();

    if (! monitorManager.has_builtin_panel) {
        return false;
    }

    if (monitorManager.get_is_builtin_display_on()) {
        if (nMonitors > 1) {
            return true;
        }
    } else {
        if (nMonitors > 0) {
            return true;
        }
    }

    return false;
}

async function blackColorTopBottom(screenshot, stream, texture, scale, cursor, x, y, w, h) {
    let color;
    let topBlack = 0;
    let bottomBlack = 0;
    let tmpY;

    const pixbuf = await screenshot.composite_to_stream(
        texture,
        x, y, w, h,
        scale,
        cursor.texture, cursor.x, cursor.y, cursor.scale,
        stream
    );

    const rowstride = pixbuf.get_rowstride();
    const n_channels = pixbuf.get_n_channels();
    const pixels = pixbuf.get_pixels();

    tmpY = 0;
    color = [0, 0, 0];
    while ((color[0] === 0 && color[1] === 0 && color[2] === 0) && (tmpY < Math.round(h / 2) - 1)) {
        const pixelIndex = (tmpY * rowstride) + 0;

        color[0] = pixels[pixelIndex];
        color[1] = pixels[pixelIndex + 1];
        color[2] = pixels[pixelIndex + 2];

        tmpY ++;
    }
    topBlack = tmpY - 1;

    tmpY = h - 1;
    color = [0, 0, 0];
    while ((color[0] === 0 && color[1] === 0 && color[2] === 0) && (tmpY > Math.round(h / 2) + 1)) {
        const pixelIndex = (tmpY * rowstride) + 0;

        color[0] = pixels[pixelIndex];
        color[1] = pixels[pixelIndex + 1];
        color[2] = pixels[pixelIndex + 2];

        tmpY --;
    }
    bottomBlack = h - tmpY - 1 - 1; // also -1 for starting at 0

    return [topBlack, bottomBlack];
}

export async function detectBlackBorders(screenshot, stream, texture, scale, cursor, x, y, w, h) {
    let wThird = Math.round(w/3);
    let hThird = Math.round(h/3);

    let res = [x, y, w, h];

    let verticalBorder = -1;

    for (let i = 1; i < 3; i++) {
        let [t, b] = await blackColorTopBottom(
            screenshot,
            stream,
            texture,
            scale,
            cursor,
            x + wThird * i,
            y,
            1,
            h
        );

        // if any color near bezel, use original values
        if (t < 3 || b < 3) {
            verticalBorder = 0;
            break;
        }

        // let's have 5 pixel tolerance
        if (verticalBorder === -1) {
            if (Math.abs(t - b) < 5) {
                verticalBorder = Math.round((t + b) / 2);
            } else {
                break;
            }
        } else if (Math.abs(verticalBorder - t) >= 5 || Math.abs(verticalBorder - b) >= 5) {
            verticalBorder = -2;
        }
    }

    let newHeight = h - verticalBorder * 2;
    // new height must be greater then 30% of the orignal height
    if (verticalBorder > -1 && newHeight > h * 0.3) {
        res[1] = y + verticalBorder;
        res[3] = newHeight;
    }

    return res;
}

export function getRectangleFromXY(x, y, percentWidth, persentHeight, fullWidth, fullHeight) {
    let x0, y0, width, height;

    width = Math.round(fullWidth * percentWidth);
    height = Math.round(fullHeight * persentHeight);

    if (x - width/2 < 0) {
        x0 = 0;
    } else if (x + width/2 > fullWidth) {
        x0 = fullWidth - width - 1;
    } else {
        x0 = Math.round(x - width/2);
    }

    if (y - height/2 < 0) {
        y0 = 0;
    } else if (y + height/2 > fullHeight) {
        y0 = fullHeight - height - 1;
    } else {
        y0 = Math.round(y - height/2);
    }

    return [x0, y0, width, height];

}

function getAvagarePixelRGB(pixels, rowstride, n_channels) {
    let count = 0;
    let color = [0, 0, 0];
    let width = rowstride/n_channels;
    let height = pixels.length/rowstride;


    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            const pixelIndex = (y * rowstride) + (x * n_channels);
            const red = pixels[pixelIndex];
            const green = pixels[pixelIndex + 1];
            const blue = pixels[pixelIndex + 2];

            color[0] += red;
            color[1] += green;
            color[2] += blue;

            count++;
        }
    }

    if (count > 0) {
        color[0] = Math.round(color[0] / count);
        color[1] = Math.round(color[1] / count);
        color[2] = Math.round(color[2] / count);
    }

    return color;
}

export async function getRectangleColorFromScreenshot(screenshot, stream, texture, scale, cursor, x, y, w, h, shiftX, shiftY) {
    const pixbuf = await screenshot.composite_to_stream(
        texture,
        shiftX + x, shiftY + y, w, h,
        scale,
        cursor.texture, cursor.x, cursor.y, cursor.scale,
        stream
    );

    const rowstride = pixbuf.get_rowstride();
    const n_channels = pixbuf.get_n_channels();
    const pixels = pixbuf.get_pixels();

    return getAvagarePixelRGB(pixels, rowstride, n_channels);
}

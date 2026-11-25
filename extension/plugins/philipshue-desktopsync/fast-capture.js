'use strict';

/**
 * extension smart-home
 * JavaScript Philips Hue sync screen: downscaled capture
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
 * Instead of painting the whole desktop at full resolution and PNG-encoding one readback per
 * lamp, paint ONE monitor straight into a small texture on the GPU with
 * Clutter.Stage.paint_to_content(rect, scale, ...) and read that back once.
 * Shell.Screenshot.composite_to_stream is promisified by GNOME Shell itself.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

const ShellVersion = parseFloat(Config.PACKAGE_VERSION);

/**
 * @param {Object} rect {x, y, width, height} of the monitor in stage (logical) coordinates
 * @param {Number} targetWidth width of the captured image in pixels (e.g. 160)
 * @param {Gio.MemoryOutputStream} stream reusable stream (composite_to_stream writes a PNG into it)
 * @return {Object} {pixels, width, height, rowstride, nChannels}
 */
export async function captureDownscaled(rect, targetWidth, stream) {
    const scale = Math.min(1, targetWidth / rect.width);
    const area = new Mtk.Rectangle({x: rect.x, y: rect.y, width: rect.width, height: rect.height});

    /* GNOME 50 added a color_state argument (null = the stage's own) */
    const content = ShellVersion >= 50
        ? global.stage.paint_to_content(area, scale, null, Clutter.PaintFlag.NO_CURSORS)
        : global.stage.paint_to_content(area, scale, Clutter.PaintFlag.NO_CURSORS);
    const texture = content.get_texture();

    stream.seek(0, GLib.SeekType.SET, null);
    stream.truncate(0, null);

    const pixbuf = await Shell.Screenshot.composite_to_stream(
        texture, 0, 0, -1, -1, 1, null, 0, 0, 1, stream);

    return {
        pixels: pixbuf.get_pixels(),
        width: pixbuf.get_width(),
        height: pixbuf.get_height(),
        rowstride: pixbuf.get_rowstride(),
        nChannels: pixbuf.get_n_channels(),
    };
}

'use strict';

/**
 * extension smart-home
 * JavaScript Philips Hue sync screen
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

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import * as Utils from '../../utils.js';
import * as Streamer from './streamer.js';

import Shell from 'gi://Shell';
import Gio from 'gi://Gio';

export const SyncSceen =  GObject.registerClass({
    GTypeName: "SmartHomeSyncScreenStreamer",
}, class SyncSceen extends Streamer.Streamer {
    _init(ip, userName, clientKey, id, channels) {
        super._init(ip, userName, clientKey);
        this.name = 'sync-screen';
        this._timers = [];
        this._id = id;
        this._channels = channels;
        this.streamingFunction = this.initSyncSceen;
        this.streamingFunctionStop = this.stopSyncScreen;
        this._initialized = false;
    }

    setParameters(brightness, intensity) {
        super.setParameters(brightness, intensity);

        if (this._gstreamer) {
            this._gstreamer.setInterval((this.intensity - 40) / 255);
        }
    }

    initSyncSceen() {
        if (!this._streaming) {
            return;
        }

        this._shooter = new Shell.Screenshot();

        let [realWidth, realHeight] = this.getRealWidthAndHeight();
        this._width = realWidth;
        this._height = realHeight;

        this.syncScreen();
    }

    _getPositionfromChannel(channel) {
        let relX = channel['position']['x'] * 2;
        let relY = channel['position']['z'] * -2;

        let percentWidth = 0.02;
        let percentHeight = 0.02;

        if (Math.abs(relX) > Math.abs(relY)) { percentHeight = 0.05; }
        if (Math.abs(relX) < Math.abs(relY)) { percentWidth = 0.05; }

        if (relX > 1) { relX = 1; }
        if (relX < -1) { relX = -1; }

        if (relY > 1) { relY = 1; }
        if (relY < -1) { relY = -1; }

        let widthMiddle = Math.round(this._width / 2);
        let heightMiddle = Math.round(this._height / 2);

        let x = Math.round(widthMiddle  + widthMiddle * relX);
        let y = Math.round(heightMiddle  + heightMiddle * relY);

        return [x - 1, y - 1, percentWidth, percentHeight];
    }

    _getSquareFromXY(x, y, percentWidth, persentHeight) {
        let x0, y0, width, height;

        width = Math.round(this._width * percentWidth);
        height = Math.round(this._height * persentHeight);

        if (x - width/2 < 0) {
            x0 = 0;
        } else if (x + width/2 > this._width) {
            x0 = this._width - width - 1;
        } else {
            x0 = Math.round(x - width/2);
        }

        if (y - height/2 < 0) {
            y0 = 0;
        } else if (y + height/2 > this._height) {
            y0 = this._height - height - 1;
        } else {
            y0 = Math.round(y - height/2);
        }

        return [x0, y0, width, height];

    }

    getAvagarePixelRGB(pixels, rowstride, n_channels) {
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

    async getPixelsRectangleColor(channel, stream, texture, scale, cursor, x, y, w, h) {
        const pixbuf = await Shell.Screenshot.composite_to_stream(
            texture,
            x, y, w, h,
            scale,
            cursor.texture, cursor.x, cursor.y, cursor.scale,
            stream
        );

        const rowstride = pixbuf.get_rowstride();
        const n_channels = pixbuf.get_n_channels();
        const pixels = pixbuf.get_pixels();

        return this.getAvagarePixelRGB(pixels, rowstride, n_channels);
    }

    getRealWidthAndHeight() {
        let width = 0, height = 0;
        let tmpWidth = 0, tmpHeight = 0;

        let display = global.display;
        let nMonitors = display.get_n_monitors();
        let monitors = [];

        for (let i = 0; i < nMonitors; i++) {
            monitors.push(i);
        }

        let i = 0;
        while (monitors.length > 0) {
            let index = monitors[i];
            let rect = global.display.get_monitor_geometry(index);
            let scale = display.get_monitor_scale(index);

            if (rect.x === tmpWidth) {
                width += Math.round(rect.width * scale);
                tmpWidth =+ rect.width;

                monitors = Utils.removeFromArray(monitors, index);
            }
                
                
            if (rect.y === tmpHeight) {
                height += Math.round(rect.height * scale);
                tmpHeight += rect.height;

                monitors = Utils.removeFromArray(monitors, index);
            }

            i++;

            if (i >= monitors.length) {
                i = 0;
            }
        }

        return [width, height];
    }

    async syncScreen() {
        if (!this._streaming) {
            return;
        }

        let msg = this.createLightMsgHeader();
        msg = msg.concat(this.string2Hex(this._id));

        const stream = Gio.MemoryOutputStream.new_resizable();

        const [content] = await this._shooter.screenshot_stage_to_content();
        const texture = content.get_texture();
        const cursor = {texture: null, x: 0, y: 0, scale: 1};

        for (let i in this._channels) {
            let c = this._channels[i]['channel_id'];
            
            let [reqX, reqY, percentWidth, percentHeight] = this._getPositionfromChannel(this._channels[i]);
            let [x, y, w, h] = this._getSquareFromXY(reqX, reqY, percentWidth, percentHeight); // result: 0, 0, -1, -1 for full screen

            const scale = 1;
            let color = await this.getPixelsRectangleColor(i, stream, texture, scale, cursor, x, y, w, h);

            msg = msg.concat(
                this.createLightMsg(c, color[0], color[1], color[2])
            );
        }

        stream.close(null);

        this.dtls.sendEncrypted(msg);

        let timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.intensity, () => {
            this.syncScreen();
            this._timers = Utils.removeFromArray(this._timers, timerId);
        });
        this._timers.push(timerId);
    }

    stopSyncScreen() {

    }
});

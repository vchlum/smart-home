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
import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import * as Utils from '../../utils.js';
import * as Streamer from './streamer.js';

export const SyncSceen =  GObject.registerClass({
    GTypeName: "SmartHomeSyncScreenStreamer",
}, class SyncSceen extends Streamer.Streamer {
    _init(ip, userName, clientKey, id, channels, displayIndex) {
        super._init(ip, userName, clientKey);
        this.name = 'sync-screen';
        this._timers = [];
        this._id = id;
        this._channels = channels;
        this.streamingFunction = this.initSyncSceen;
        this._displayIndex = displayIndex;
    }

    initSyncSceen() {
        if (!this._streaming) {
            return;
        }

        this._shooter = new Shell.Screenshot();

        [this._x, this._y, this._width, this._height] = Utils.getScreenGeometry(this._displayIndex);
        [this._origX, this._origY, this._origWidth, this._origHeight] = [this._x, this._y, this._width, this._height];

        this.syncScreen(0);
    }

    _getPositionFromChannel(channel) {
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

    async _blackColorTopBottom(stream, texture, scale, cursor, x, y, w, h) {
        let color;
        let topBlack = 0;
        let bottomBlack = 0;
        let tmpY;

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

    async _detectBlackBorders(stream, texture, scale, cursor, x, y, w, h) {
        let wThird = Math.round(w/3);
        let hThird = Math.round(h/3);

        let verticalBorder = -1;

        for (let i = 1; i < 3; i++) {
            let [t, b] = await this._blackColorTopBottom(
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

        let newHeight = this._origHeight - verticalBorder * 2;
        // new height must be greater then 30% of the orignal height
        if (verticalBorder > -1 && newHeight > this._origHeight * 0.3) {
            this._y = this._origY + verticalBorder;
            this._height = newHeight;
        }
    }

    async syncScreen(counter) {
        if (!this._streaming) {
            return;
        }

        let msg = this.createLightMsgHeader();
        msg = msg.concat(this.string2Hex(this._id));

        const stream = Gio.MemoryOutputStream.new_resizable();

        const [content] = await this._shooter.screenshot_stage_to_content();
        const texture = content.get_texture();
        const cursor = {texture: null, x: 0, y: 0, scale: 1};
        const scale = 1;

        counter ++;
        if (counter > 8) {
            counter = 0;
            await this._detectBlackBorders(
                stream,
                texture,
                scale,
                cursor,
                this._origX, this._origY, this._origWidth, this._origHeight
            );
        }

        for (let i in this._channels) {
            let c = this._channels[i]['channel_id'];
            
            let [reqX, reqY, percentWidth, percentHeight] = this._getPositionFromChannel(this._channels[i]);
            let [x, y, w, h] = Utils.getRectangleFromXY(
                reqX,
                reqY,
                percentWidth,
                percentHeight,
                this._width,
                this._height
            ); // result: 0, 0, -1, -1 for full screen

            let color = await Utils.getRectangleColorFromScreenshot(
                Shell.Screenshot,
                stream,
                texture,
                scale,
                cursor,
                x, y, w, h,
                this._x,
                this._y
            );

            msg = msg.concat(
                this.createLightMsg(
                    c,
                    Math.round(color[0] * this.brightness),
                    Math.round(color[1] * this.brightness),
                    Math.round(color[2] * this.brightness)
                )
            );
        }

        stream.close(null);

        this.dtls.sendEncrypted(msg);

        let timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.intensity, () => {
            this.syncScreen(counter);
            this._timers = Utils.removeFromArray(this._timers, timerId);
        });
        this._timers.push(timerId);
    }

    /**
     * Remove timers created by GLib.timeout_add
     * 
     * @method clearTimers
     */
    clearTimers() {
        for (let t of this._timers) {
            if (t) {
                GLib.Source.remove(t);
            }
        }

        this._timers = [];
    }
});

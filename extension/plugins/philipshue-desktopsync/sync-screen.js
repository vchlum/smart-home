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
            [this._x, this._y, this._width, this._height] = await Utils.detectBlackBorders(
                Shell.Screenshot,
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

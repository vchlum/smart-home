'use strict';

/**
 * extension smart-home
 * JavaScript Philips Hue track cursor
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
import * as Screenshot from '../../screenshot.js';

export const TrackCursor =  GObject.registerClass({
    GTypeName: "SmartHomeTrackCursorStreamer",
}, class TrackCursor extends Streamer.Streamer {
    _init(ip, userName, clientKey, id, channels) {
        super._init(ip, userName, clientKey);
        this.name = 'sync-cursor';
        this._id = id;
        this._channels = channels;
        this.screenshot = new Screenshot.Screenshot();
        this.streamingFunction = this.trackCursor;
    }

    async trackCursor() {
        if (!this._streaming) {
            return;
        }

        let [x, y] = global.get_pointer();
        let color = await this.screenshot.getColorPixel(x, y);

        let red = this.adjustColorElement(color.red);
        let green = this.adjustColorElement(color.green);
        let blue = this.adjustColorElement(color.blue);

        red = Math.round(red * (this.brightness));
        green = Math.round(green * (this.brightness));
        blue = Math.round(blue * (this.brightness));

        let msg = this.createLightMsgHeader();
        msg = msg.concat(this.string2Hex(this._id));

        for (let channel of this._channels) {
            let c = channel['channel_id'];
            msg = msg.concat(
                this.createLightMsg(c, red, green, blue)
            );
        }

        this.dtls.sendEncrypted(msg);

        let timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.intensity, () => {
            this.trackCursor();
            this._timers = Utils.removeFromArray(this._timers, timerId);
        });
        this._timers.push(timerId);
    }
});

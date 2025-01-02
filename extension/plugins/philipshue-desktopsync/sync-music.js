'use strict';

/**
 * extension smart-home
 * JavaScript Philips Hue sync music
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
import * as Utils from '../../utils.js';
import * as Streamer from './streamer.js';
import * as GStreamer from './gstreamer.js';

export const SyncMusic =  GObject.registerClass({
    GTypeName: "SmartHomeSyncMusicStreamer",
}, class SyncMusic extends Streamer.Streamer {
    _init(ip, userName, clientKey, id, channels) {
        super._init(ip, userName, clientKey);
        this.name = 'sync-music';
        this._id = id;
        this._channels = channels;
        this.streamingFunction = this.initSyncMusic;
        this.streamingFunctionStop = this.stopSyncMusic;
        this._initialized = false;
    }

    setParameters(brightness, intensity) {
        super.setParameters(brightness, intensity);

        if (this._gstreamer) {
            this._gstreamer.setInterval((this.intensity - 40) / 255);
        }
    }

    initSyncMusic() {
        if (this._gstreamer) {
            this._gstreamer.stop();
        }
        this._gstreamer = new GStreamer.GStreamer();

        this._rndCounter = 0;
        this._avarageFreq = 0;
        this._elementCoef = {
            'red' : 1.0,
            'green': 1.0,
            'blue' : 1.0
        };

        this._gstreamer.setBands(this._channels.length);
        this._gstreamer.setInterval((this.intensity - 40) / 255);
        this._gstreamer.setHandler(this.syncMusic.bind(this));
        this._gstreamer.start();
    }

    channelSort(a, b) {
        let sumA = a['position']['x'] + a['position']['y'] + a['position']['z'];
        let sumB = b['position']['x'] + b['position']['y'] + b['position']['z'];
        if (sumA < sumB) {
            return 1;
        } else if (sumA > sumB) {
            return -1;
        }
        return 0;
    }

    syncMusic(freqs) {
        let msg = this.createLightMsgHeader();
        msg = msg.concat(this.string2Hex(this._id));
        const Elements = ['red', 'green', 'blue'];

        let avg = 0;
        freqs.forEach(f => { avg += (f / 80) });
        avg = avg / freqs.length;
        this._avarageFreq += avg;

        this._rndCounter ++;
        if (this._rndCounter >= 10) {
            this._elementCoef = {
                'red' : 1.0,
                'green': 1.0,
                'blue' : 1.0
            };

            let rndElement = Elements[Math.floor(Math.random() * Elements.length)];
            this._elementCoef[rndElement] = 1 - this._avarageFreq / 10;

            this._rndCounter = 0;
            this._avarageFreq = 0;
        }

        //this._channels = this._channels.sort(this.channelSort);

        let counter = 0;
        for (let channel of this._channels) {
            let c = channel['channel_id'];

            let [red, green, blue] = this.freq2rgb(freqs[counter]);

            red = Math.round(red * this._elementCoef['red']);
            green = Math.round(green * this._elementCoef['green']);
            blue = Math.round(blue * this._elementCoef['blue']);

            red = this.adjustColorElement(red);
            green = this.adjustColorElement(green);
            blue = this.adjustColorElement(blue);

            red = Math.round(red * (this.brightness));
            green = Math.round(green * (this.brightness));
            blue = Math.round(blue * (this.brightness));

            msg = msg.concat(
                this.createLightMsg(c, red, green, blue)
            );
            counter ++;
        }

        this.dtls.sendEncrypted(msg);
    }

    stopSyncMusic() {
        if (this._gstreamer) {
            this._gstreamer.stop()
            this._gstreamer = null;
        }
    }

    /**
     * Converts freq to rgb color
     *
     * @method freq2rgb
     * @param {number} freq
     * @return {Object} [r,g,b] color
     */
    freq2rgb(freq) {
        let red = 0;
        let green = 0;
        let blue = 0;
        let freqCoef = 1 - freq / 80;

        if (freqCoef) {
            [red, green, blue] = Utils.hslToRgb(
                freqCoef,
                0.8, /* feels good coeficient:-) */
                0.5 /* brightness = 1 means color close to white */
            );
        }

        return [red, green, blue];
    }
});

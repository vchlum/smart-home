'use strict';

/**
 * extension smart-home
 * JavaScript streamer
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
import * as DTLSClient from './dtlsclient.js';

export const Streamer =  GObject.registerClass({
    GTypeName: "SmartHomeDTLSStreamer",
}, class Streamer extends GObject.Object {
    _init(ip, userName, clientKey) {
        super._init();

        this._streamingFunction = null;
        this.brightness = 1.0;
        this.intensity = 100;
        this.streamingId = null;

        this.dtls = new DTLSClient.DTLSClient({
            ip: ip,
            port: 2100,
            pskidentity:  userName,
            psk: clientKey
        });

        this._signalConnect = this.dtls.connect(
            'connected',
            () => {
                this._streaming = true;
                if (this.streamingFunction) {
                    this.streamingFunction();
                }
            }
        );

        this._signalDisconnect = this.dtls.connect(
            'disconnected',
            () => {
                this._streaming = false;
                if (this.streamingFunctionStop) {
                    this.streamingFunctionStop();
                }
            }
        );
    }

    connectStream() {
        this.dtls.connectBridge();
    }

    disconnectStream() {
        if (this.clearTimers) {
            this.clearTimers();
        }
        this.dtls.closeBridge();
    }

    setParameters(brightness, intensity) {
        this.brightness = brightness;
        if (this.brightness < 0.1) {
            this.brightness = 0.1;
        }
        this.intensity = (1 - intensity) * 500 + 100;
    }

    /**
     * For fixing colors like rgb(1,0,1)
     *
     * @method adjustColorElement
     * @param {Number} color element
     * @return {Number} color element
     */
    adjustColorElement(c) {
        if (c <= 5) {
            return 0;
        }

        if (c >= 249) {
            return 255;
        }

        return c;
    }

    /**
     * Convert string to array of bytes.
     *
     * @param {String} s string to convert
     * @return {Object} array of bytes
     */
    string2Hex(s) {
        let ret = [];

        for (let i = 0; i < s.length; i++) {
            ret.push(s.charCodeAt(i));
        }

        return ret;
    }

    /**
     * Creates header version2 of light used in dtls data
     * for controlling the lights
     * 
     * @method _createDTLSHeader
     * @param {String} "color" or "brightness" mode
     * @return {Object} header - needs concat light data
     */
    createLightMsgHeader(headerType = 'color') {
        let header = [];
        header = this.string2Hex("HueStream"); /* HueStream */
        header = header.concat([0x02, 0x00]); /* version 2.0 */
        header = header.concat([0x00]); /* sequence number - currently ignored by the bridge */
        header = header.concat([0x00, 0x00]); /* reserved */
        if (headerType === 'color') {
            header = header.concat([0x00]); /* color mode RGB */
        } else {
            header = header.concat([0x01]); /* brightness mode */
        }
        header = header.concat([0x00]); /* reserved */

        return header;
    }

    createLightMsg(channel, red, green, blue) {
        let msg = [];
        msg = msg.concat([channel]);
        msg = msg.concat(DTLSClient.uintToArray(red, 8));
        msg = msg.concat(DTLSClient.uintToArray(red, 8));
        msg = msg.concat(DTLSClient.uintToArray(green, 8));
        msg = msg.concat(DTLSClient.uintToArray(green, 8));
        msg = msg.concat(DTLSClient.uintToArray(blue, 8));
        msg = msg.concat(DTLSClient.uintToArray(blue, 8));
        return msg;
    }

    disconnectSignals() {
        this.dtls.disconnect(this._signalConnect);
        this.dtls.disconnect(this._signalDisconnect);
    }
});

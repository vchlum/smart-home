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
import * as SmoothSync from './smooth-sync.js';
import * as HueModel from './huesync-model.js';
import * as FastCapture from './fast-capture.js';
import * as ScreenGeometry from '../../screen-geometry.js';

/* Hue Sync for PC style screen sync (see smooth-sync.js and huesync-model.js):
 * capture one downscaled frame ~16x/s, colour per lamp = trimean of the official screen zone,
 * eased in CIELAB with the official intensity presets, streamed at ~60 Hz in 16-bit colour. */
const CAPTURE_WIDTH = 160;          /* downscaled capture width in pixels (DownsizeCapture) */
const CAPTURE_INTERVAL_MS = 61;     /* official PollingInterval (~16 Hz); 60 Hz output glides between */
const SEND_INTERVAL_MS = 17;        /* ~60 Hz, InterpolationFPS = 60 */
const FAST_CAPTURE_MAX_FAILURES = 3;

export const SyncSceen =  GObject.registerClass({
    GTypeName: "SmartHomeSyncScreenStreamer",
}, class SyncSceen extends Streamer.Streamer {
    _init(ip, userName, clientKey, id, channels, displayIndex) {
        super._init(ip, userName, clientKey);
        this.name = 'sync-screen';
        this._timers = [];
        this._engine = null;
        this._lastBorderCheck = 0;
        this._barDetector = new HueModel.BlackBarDetector();
        this._fastCaptureFailures = 0;
        this._useLegacyCapture = false;
        this._id = id;
        this._channels = channels;
        this.streamingFunction = this.initSyncSceen;
        this._displayIndex = displayIndex;
        this._screenGeometry = new ScreenGeometry.ScreenGeometry();
    }

    async initSyncSceen() {
        if (!this._streaming) {
            return;
        }

        this._shooter = new Shell.Screenshot();

        [this._x, this._y, this._width, this._height] = await this._screenGeometry.getScreenGeometry(this._displayIndex);
        [this._origX, this._origY, this._origWidth, this._origHeight] = [this._x, this._y, this._width, this._height];

        this._lastBorderCheck = 0;

        if (this._engine) {
            this._engine.stop();
        }

        this._barDetector.reset();
        this._fastCaptureFailures = 0;
        this._useLegacyCapture = false;
        this._lamps = [];
        for (let i in this._channels) {
            this._lamps.push({
                id: this._channels[i]['channel_id'],
                position: this._channels[i]['position'] || {x: 0, y: 0, z: 0},
            });
        }

        /* The panel slider ("Intensity") blends the official Hue Sync intensity presets; they sit
         * in the middle of the slider's icon steps (Subtle 0.125, Moderate 0.375, High 0.625,
         * Intense 0.875) and the far left is extra gradual. */
        this._engine = new SmoothSync.SmoothSyncEngine({
            now: () => GLib.get_monotonic_time() / 1000,
            timeoutAdd: (ms, cb) => GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                ms,
                () => cb() ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE
            ),
            timeoutRemove: (id) => GLib.Source.remove(id),
            capture: () => this._captureColors(),
            send: (frame) => this._sendFrame(frame),
            isActive: () => this._streaming,
            getPreset: () => HueModel.presetFromSlider(this.sliderValue),
            onError: (e) => Utils.logError(`Hue screen sync: ${e}`),
            smoother: new HueModel.LabSmoother(),
            config: {sendIntervalMs: SEND_INTERVAL_MS, captureIntervalMs: CAPTURE_INTERVAL_MS},
        });
        this._engine.start();
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

    /**
     * Colours for every lamp from one downscaled frame (official zones + trimean + black bars).
     * Falls back to the original per-lamp capture if the fast path keeps failing (e.g. a future
     * GNOME Shell changes Clutter.Stage.paint_to_content again).
     *
     * @method _captureColors
     * @return {Array} [[channel, [r, g, b]], ...]
     */
    async _captureColors() {
        if (!this._useLegacyCapture) {
            try {
                const img = await FastCapture.captureDownscaled(
                    {x: this._origX, y: this._origY, width: this._origWidth, height: this._origHeight},
                    CAPTURE_WIDTH,
                    this._fastStream ??= Gio.MemoryOutputStream.new_resizable()
                );
                this._fastCaptureFailures = 0;
                return HueModel.channelColors(img, this._lamps, this._barDetector.update(img));
            } catch (e) {
                this._fastCaptureFailures++;
                if (this._fastCaptureFailures < FAST_CAPTURE_MAX_FAILURES) {
                    throw e;
                }
                this._useLegacyCapture = true;
                Utils.logError(`Hue screen sync: fast capture unavailable (${e}), using the original method`);
            }
        }

        return this._captureColorsLegacy();
    }

    /**
     * Original method: grab the screen and average a small spot at every lamp position.
     *
     * @method _captureColorsLegacy
     * @return {Array} [[channel, [r, g, b]], ...]
     */
    async _captureColorsLegacy() {
        const stream = Gio.MemoryOutputStream.new_resizable();

        try {
            const [content] = await this._shooter.screenshot_stage_to_content();
            const texture = content.get_texture();
            const cursor = {texture: null, x: 0, y: 0, scale: 1};
            const scale = 1;

            /* re-detect black bars about once a second (was: every 9th frame) */
            const nowUs = GLib.get_monotonic_time();
            if (nowUs - this._lastBorderCheck > 1000000) {
                this._lastBorderCheck = nowUs;
                [this._x, this._y, this._width, this._height] = await Utils.detectBlackBorders(
                    Shell.Screenshot,
                    stream,
                    texture,
                    scale,
                    cursor,
                    this._origX, this._origY, this._origWidth, this._origHeight
                );
            }

            const colors = [];

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

                colors.push([c, color]);
            }

            return colors;
        } finally {
            stream.close(null);
        }
    }

    /**
     * Send one (already smoothed) frame to the bridge.
     *
     * @method _sendFrame
     * @param {Array} frame [[channel, r, g, b], ...]
     */
    _sendFrame(frame) {
        let msg = this.createLightMsgHeader();
        msg = msg.concat(this.string2Hex(this._id));

        /* full 16-bit colour (the stock message repeats one 8-bit value twice): at low
         * brightness 8 bits leave only a few dozen levels and fades visibly step */
        const k = this.brightness * 257;
        const u16 = (v) => Math.min(65535, Math.max(0, Math.round(v * k)));
        for (const [c, r, g, b] of frame) {
            const R = u16(r), G = u16(g), B = u16(b);
            msg.push(c, R >> 8, R & 0xFF, G >> 8, G & 0xFF, B >> 8, B & 0xFF);
        }

        this.dtls.sendEncrypted(msg);
    }

    destroy() {
        if (this._engine) {
            this._engine.stop();
            this._engine = null;
        }

        if (this._fastStream) {
            this._fastStream.close(null);
            this._fastStream = null;
        }

        if (this._screenGeometry) {
            this._screenGeometry.destroy();
            this._screenGeometry = null;
        }

        super.destroy();
    }

    /**
     * Remove timers created by GLib.timeout_add
     * 
     * @method clearTimers
     */
    clearTimers() {
        if (this._engine) {
            this._engine.stop();
        }

        for (let t of this._timers) {
            if (t) {
                GLib.Source.remove(t);
            }
        }

        this._timers = [];
    }
});

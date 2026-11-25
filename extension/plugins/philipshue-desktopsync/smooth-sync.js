'use strict';

/**
 * extension smart-home
 * JavaScript Philips Hue sync screen: capture and streaming loops
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
 * The original screen sync grabbed the screen, sent ONE colour and then waited 100..600 ms
 * ("Intensity"), so the lamps stepped between colours. This engine decouples the two jobs:
 *
 *   capture loop: reads the screen colours ~16 times a second (official Hue Sync polling rate)
 *   send loop:    streams to the bridge at ~60 Hz, the smoother gliding every lamp towards
 *                 the latest analysed colour
 *
 * Plain JavaScript without gi:// imports: timers and I/O are injected by sync-screen.js.
 */

export const DEFAULTS = {
    captureIntervalMs: 61,  /* target period of screen captures */
    minCaptureGapMs: 8,     /* always leave the shell this long between captures */
    sendIntervalMs: 17,     /* period of messages to the bridge (~60 Hz) */
    errorRetryMs: 250,      /* wait after a failed capture (screen locked, ...) */
    captureTimeoutMs: 2000, /* a capture that has not returned by now is considered hung */
    maxCaptureTimeoutMs: 30000, /* ... doubling for every consecutive hang, up to this */
    maxStepMs: 250,         /* clamp a single smoothing step after a stall */
};

/**
 * Runs the capture loop and the send loop.
 *
 * Everything environment specific is injected:
 *   now()               monotonic time in ms
 *   timeoutAdd(ms, cb)  like GLib.timeout_add: cb returns true to repeat; returns an id
 *   timeoutRemove(id)   like GLib.Source.remove
 *   capture()           async, resolves to [[channel, [r, g, b]], ...]
 *   send(frame)         receives [[channel, r, g, b], ...]
 *   isActive()          false once the DTLS stream is gone
 *   getPreset()         intensity preset passed to smoother.step()
 *   onError(e)          called on the first error of a failure streak
 */
export class SmoothSyncEngine {
    constructor(options) {
        this._o = options;
        this._cfg = Object.assign({}, DEFAULTS, options.config || {});
        /* setTarget(channel, rgb) / commit() / step(dtMs, preset) / reset(),
         * e.g. LabSmoother from huesync-model.js */
        this._smoother = options.smoother;
        this._live = new Set();
        this._running = false;
        this._generation = 0;
        this._errorStreak = 0;
        this._lastSend = 0;
        this._captureToken = 0;
        this._inFlightSince = -1;   /* -1: no capture in flight */
        this._hangStreak = 0;
        this.stats = { captured: 0, sent: 0, captureErrors: 0, sendErrors: 0, captureTimeouts: 0 };
    }

    start() {
        this.stop();
        this._running = true;
        this._generation++;
        this._errorStreak = 0;
        this._hangStreak = 0;
        this._inFlightSince = -1;
        this._lastSend = this._o.now();
        this._add(this._cfg.sendIntervalMs, () => this._sendTick());
        this._captureLoop(this._generation);
    }

    stop() {
        this._running = false;
        this._generation++;

        for (const id of this._live) {
            this._o.timeoutRemove(id);
        }
        this._live.clear();
        this._smoother.reset();
    }

    get running() {
        return this._running;
    }

    /**
     * Schedule a timer. The id is taken out of the live set while its callback
     * runs, because a source must not be removed from inside its own callback.
     */
    _add(ms, cb) {
        const id = this._o.timeoutAdd(ms, () => {
            this._live.delete(id);
            const again = cb() && this._running;
            if (again) {
                this._live.add(id);
            }
            return again;
        });
        this._live.add(id);

        return id;
    }

    _sendTick() {
        if (!this._running) {
            return false;
        }

        if (!this._o.isActive()) {
            this.stop();
            return false;
        }

        const t = this._o.now();
        const dt = Math.min(Math.max(t - this._lastSend, 0), this._cfg.maxStepMs);
        this._lastSend = t;

        /* Watchdog: if the screenshot call never returns (screen locked, display
         * asleep) start a new capture; the token makes the hung one stale. */
        if (this._inFlightSince >= 0) {
            const limit = Math.min(
                this._cfg.maxCaptureTimeoutMs,
                this._cfg.captureTimeoutMs * Math.pow(2, this._hangStreak)
            );
            if (t - this._inFlightSince > limit) {
                this._inFlightSince = -1;
                this._hangStreak++;
                this.stats.captureTimeouts++;
                this._captureLoop(this._generation);
            }
        }

        const frame = this._smoother.step(dt, this._o.getPreset());

        /* keep streaming the held colours even if captures fail, so the bridge
         * does not drop the entertainment stream; stay quiet until the first one */
        if (frame.length > 0) {
            try {
                this._o.send(frame);
                this.stats.sent++;
            } catch (e) {
                this.stats.sendErrors++;
                this._o.onError(e);
            }
        }

        return true;
    }

    async _captureLoop(generation) {
        if (!this._running || generation !== this._generation) {
            return;
        }

        if (!this._o.isActive()) {
            return;
        }

        const token = ++this._captureToken;
        const started = this._o.now();
        this._inFlightSince = started;
        let delay;

        try {
            const colors = await this._o.capture();

            if (!this._running || generation !== this._generation || token !== this._captureToken) {
                return;
            }

            this._inFlightSince = -1;
            this._hangStreak = 0;

            for (const [channel, rgb] of colors) {
                this._smoother.setTarget(channel, rgb);
            }
            this._smoother.commit();   /* one analysis step per capture */

            this.stats.captured++;
            this._errorStreak = 0;
            delay = Math.max(
                this._cfg.minCaptureGapMs,
                this._cfg.captureIntervalMs - (this._o.now() - started)
            );
        } catch (e) {
            if (!this._running || generation !== this._generation || token !== this._captureToken) {
                return;
            }

            this._inFlightSince = -1;
            this.stats.captureErrors++;
            this._errorStreak++;
            if (this._errorStreak === 1) {
                this._o.onError(e);
            }
            delay = this._cfg.errorRetryMs;
        }

        this._add(delay, () => {
            this._captureLoop(generation);
            return false;
        });
    }
}

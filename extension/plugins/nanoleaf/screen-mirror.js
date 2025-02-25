'use strict';

/**
 * extension smart-home
 * JavaScript Nanoleaf screen mirror.
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


export const ScreenMirror =  GObject.registerClass({
    GTypeName: "SmartHomeScreenMirror",
    Signals: {
        'event': {},
    }
}, class ScreenMirror extends GObject.Object {
    _init() {
        super._init();
        this._shooter = new Shell.Screenshot();
        this.subs = {};
    }

    precalculate(data) {
        let ret = {
            'panels': [],
            'panels-screen': [],
        };

        ret['geometry'] = Utils.getScreenGeometry(data['display']);

        let orientation = Math.PI * (data['panelLayout']['globalOrientation']['value']/180);
        let maxX = -9999999999;
        let minX = 9999999999;
        let maxY = -9999999999;
        let minY = 9999999999;
        for (let panel of data['panelLayout']['layout']['positionData']) {
            let x = panel['x'];
            let y = panel['y'];
            
            //rotate it clockwise by orientation:
            let rx = Math.round(x * Math.cos(orientation) + y * Math.sin(orientation));
            let ry = Math.round(- x * Math.sin(orientation) + y * Math.cos(orientation));
            ret['panels'].push(
                {
                    'panelId': panel['panelId'],
                    'x': rx,
                    'y': ry
                }
            );
            if (rx > maxX) { maxX = rx; }
            if (rx < minX) { minX = rx; }
            if (ry > maxY) { maxY = ry; }
            if (ry < minY) { minY = ry; }
        }
        ret['borders'] = {
            'maxX': maxX,
            'minX': minX,
            'maxY': maxY,
            'minY': minY,
            'width': maxX - minX,
            'height': maxY - minY,
        }

        for (let panel of ret['panels']) {
            let procX = (panel['x'] - ret['borders']['minX']) / ret['borders']['width'];
            let procY = 1 - (panel['y'] - ret['borders']['minY']) / ret['borders']['height'];

            ret['panels-screen'].push(
                {
                    'panelId': panel['panelId'],
                    'x': Math.round(procX * ret['geometry'][2]),
                    'y': Math.round(procY * ret['geometry'][3])
                }
            );
        }

        return ret;
    }

    subscribe(id, data) {
        if (Object.keys(this.subs).includes(id)) {
            delete(this.subs[id]);
        }

        this.subs[id] = this.precalculate(data);

        if (this._runningEvent === undefined) {
            this._runningEvent = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                if (this._runningEvent === undefined) {
                    return GLib.SOURCE_REMOVE;
                }
            
                this._invokeEvent();
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    unsubscribe(id) {
        delete(this.subs[id]);

        if (Object.keys(this.subs).length === 0) {
            if (this._runningEvent !== undefined) {
                GLib.Source.remove(this._runningEvent);
                this._runningEvent = undefined;
            }
        }
    }

    async _invokeEvent() {
        const stream = Gio.MemoryOutputStream.new_resizable();
        const [content] = await this._shooter.screenshot_stage_to_content();
        const texture = content.get_texture();
        const cursor = {texture: null, x: 0, y: 0, scale: 1};
        const scale = 1;

        for (let id in this.subs) {
            this.subs[id]['event-data'] = await this.getSubsColors(id, stream, texture, scale, cursor);
        }

        stream.close(null);

        this.emit('event');
    }

    async getSubsColors(id, stream, texture, scale, cursor) {
        let data = [];

        let geometry = this.subs[id]['geometry'];

        for (let panel of this.subs[id]['panels-screen']) {
            let [x, y, w, h] = Utils.getRectangleFromXY(
                panel['x'],
                panel['y'],
                0.02,
                0.02,
                geometry[2],
                geometry[3]
            );

            let color = await Utils.getRectangleColorFromScreenshot(
                Shell.Screenshot,
                stream,
                texture,
                scale,
                cursor,
                x, y, w, h,
                geometry[0],
                geometry[1]
            );

            data.push(
                {
                    "panelId": panel['panelId'],
                    "r": color[0],
                    "g": color[1],
                    "b": color[2],
                    "w": 255,
                    "transTime": 10
                }
            );
        }

        return data;
    }

});

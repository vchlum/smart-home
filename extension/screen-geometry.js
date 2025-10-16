'use strict';

/**
 * screen geometry detector
 * JavaScript screen geometry.
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

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import * as Utils from './utils.js';

const DisplayConfigInterface = 
`<node>
    <interface name="org.gnome.Mutter.DisplayConfig">
        <property name="ApplyMonitorsConfigAllowed" type="b" access="read" />
        <signal name="MonitorsChanged" />
        <method name="GetCurrentState">
            <arg name="serial" direction="out" type="u" />
            <arg name="monitors" direction="out" type="a((ssss)a(siiddada{sv})a{sv})" />
            <arg name="logical_monitors" direction="out" type="a(iiduba(ssss)a{sv})" />
            <arg name="properties" direction="out" type="a{sv}" />
        </method>
    </interface>
</node>`;


export const ScreenGeometry =  GObject.registerClass({
    GTypeName: "SmartHomeScreenGeometry",
    Signals: {
        'changed': {},
    }
}, class ScreenGeometry extends GObject.Object {

    _init() {
        super._init();
        this._monitors = {};
        this._displayIndex = null;
        this._signal = null;

        this._displayConfigProxy = Gio.DBusProxy.makeProxyWrapper(DisplayConfigInterface);
        this._proxy = new this._displayConfigProxy(
            Gio.DBus.session,
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            (proxy, error) => {
                if (error) {
                    Utils.logError(error);
                    this._proxy = null;
                    return;
                }
                this._signal = this._proxy.connectSignal('MonitorsChanged',
                    async () => {
                        await this.getScreenGeometry(this._displayIndex);
                        this.emit('changed');
                   }
                );
            }
        );
    }

    getMutterMonitors() {
        return new Promise((resolve, reject) => {
            if (!this._proxy) {
                reject('no proxy');
                return;
            }

            this._proxy.GetCurrentStateRemote((currentState, error) => {
                if (error) {
                    Utils.logError(error);
                    reject(error)
                    return;
                }
                
                const [, physicalMonitors, logicalMonitors, ] = currentState;

                for (const logicalMonitor of logicalMonitors) {
                    const [x, y, scale, transform, isPrimary, monitorsSpecs] = logicalMonitor;
                    for (const monitorSpecs of monitorsSpecs) {
                        const [connector, vendor, product, serial] = monitorSpecs;
                        this._monitors[connector] = {
                            'vendor': vendor,
                            'product': product,
                            'serial': serial,
                            'isCurrent': false
                        }
                    }
                }

                for (let physicalMonitor of physicalMonitors) {
                    const [[connector, , , ], modes, ] = physicalMonitor;
                    for (let mode of modes) {
                        const [, , , , , , opt_props] = mode;

                        if (opt_props['is-current']) {
                            if (!this._monitors[connector]) {
                                Utils.logError(`Monitor ${connector} not found in logical monitors!`);
                                continue;
                            }

                            this._monitors[connector]['isCurrent'] = true;
                            this._monitors[connector]['currentMode'] = {
                                'width': mode[1],
                                'height': mode[2],
                            }
                        }
                    }
                }

                resolve();
            });
        });
    }
    
    async getScreenGeometry(displayIndex = null) {
        let res = [0, 0, -1, -1];
        let maxScale = 0;
        let maxWidth = 0;
        let maxHeight = 0;
        this._displayIndex = displayIndex;
        let display = global.display;
        let nMonitors = display.get_n_monitors();
        let scales = {};

        await this.getMutterMonitors();
        Utils.logDebug(`Detected monitors in mutter: ${JSON.stringify(this._monitors)}`);

        for (let i = 0; i < nMonitors; i++) {
            let scale = display.get_monitor_scale(i);
            scales[i] = scale;
            if (scale > maxScale) {
                maxScale = scale;
            }
        }

        if (Object.keys(this._monitors).length !== nMonitors) {
            Utils.logError(`Detected monitors in mutter (${Object.keys(this._monitors).length}) does not match number of monitors in gnome-shell (${nMonitors})!`); 
        } else {
            for (let i = 0; i < nMonitors; i++) {
                let rect = global.display.get_monitor_geometry(i);
                let width = Math.floor(rect.width * scales[i]);
                let height = Math.floor(rect.height * scales[i]);

                if (width > this._monitors[Object.keys(this._monitors)[i]]['currentMode']['width'] ||
                    height > this._monitors[Object.keys(this._monitors)[i]]['currentMode']['height']) {
                    Utils.logDebug(`Fractional scaling disabled, using scale 1 for geometry detection!`);
                    maxScale = 1;
                }
            }
        }

        for (let i = 0; i < nMonitors; i++) {
            let rect = global.display.get_monitor_geometry(i);
            let x = Math.ceil(rect.x * maxScale);
            let y = Math.ceil(rect.y * maxScale);
            let width = Math.floor(rect.width * maxScale);
            let height = Math.floor(rect.height * maxScale);

            Utils.logDebug(`Monitor ${i} geometry is ${rect.x},${rect.y}+${rect.width}x${rect.height}, screen ${i} geometry is ${x},${y}+${width}x${height}`);

            if (maxWidth < x + width) {
                maxWidth = x + width;
            }

            if (maxHeight < y + height) {
                maxHeight = y + height;
            }

            if (displayIndex === i) {
                res = [x, y , width, height];
            }
        }

        if (displayIndex === undefined || displayIndex === null) {
            res = [0, 0 , maxWidth, maxHeight];
        }

        Utils.logDebug(`Selected screen geometry for index: ${displayIndex} is ${res[0]},${res[1]}+${res[2]}x${res[3]} max scale: ${maxScale})`);

        return res;

    }

    destroy() {
        if (this._signal && this._proxy) {
            this._proxy.disconnectSignal(this._signal);
            this._signal = null;
        }
        this._proxy = null;
        this._monitors = {};
    }
});

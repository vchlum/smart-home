'use strict';

/**
 * prefs smart-home
 * JavaScript Row for device, e.g. lights on login.
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

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';

/**
 * Row for device, e.g. lights on login.
 * 
 * @class SmartHomeDeviceLight
 * @constructor
 * @param {String} type
 * @param {String} id
 * @param {String} name
 * @param {Object} brightness
 * @param {Object} color
 * @return {Object}
 */
export const SmartHomeDeviceLight = GObject.registerClass({
    GTypeName: 'SmartHomeDeviceLight',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_device_light.ui',
    InternalChildren: [
        'brightnessAdjustment',
        'deviceBrightness',
        'deviceColor',
        'deviceSwitch',
    ],
    Signals: {
        'state-changed': {},
    }
}, class SmartHomeDeviceLight extends Adw.ActionRow {

    _init(type, id, name, brightness, color) {
        super._init();
        this.type = type;
        this.title = name;
        this.id = id;

        if (brightness === undefined) {
            this._deviceBrightness.visible = false;
        }
        if (color === undefined) {
            this._deviceColor.visible = false;
        }
    }

    setUI(state) {
        if (state === undefined) {
            return;
        }

        if (state['switch']) {
            this._deviceSwitch.active = state['switch'];
        } 

        if (state['brightness']) {
            this._brightnessAdjustment.value = state['brightness'];
        }

        if (state['color']) {
            let color = new Gdk.RGBA();
            color.red = state['color']['red'] / 255;
            color.green = state['color']['green'] / 255;
            color.blue = state['color']['blue'] / 255;
            color.alpha = 1.0;
            this._deviceColor.rgba = color;
        }
    }

    _deviceBrightnessChanged(object) {
        if (this._brightnessAdjustment.value === 0) {
            this._deviceSwitch.active = false;
        } else {
            this._deviceSwitch.active = true;
        }
        this._saveChange();
    }

    _deviceColorChanged(object) {
        this._deviceSwitch.active = true;
        this._saveChange();
    }

    _deviceSwitchChanged(object) {
        if (object.active && this._brightnessAdjustment.value === 0) {
            this._brightnessAdjustment.value = 50;
        }
        this._saveChange();
    }

    _saveChange() {
        this.state = {};
        if (this._deviceSwitch.active) {
            this.state = { "switch": true, "type": this.type };

            if (this._deviceBrightness.visible) {
                this.state['brightness'] = this._brightnessAdjustment.value;
            }

            if (this._deviceColor.visible) {
                this.state['color'] = {
                    'red': Math.round(this._deviceColor.rgba.red * 255),
                    'green': Math.round(this._deviceColor.rgba.green * 255),
                    'blue': Math.round(this._deviceColor.rgba.blue * 255)
                }
            }
        }

        this.emit('state-changed');
    }
});

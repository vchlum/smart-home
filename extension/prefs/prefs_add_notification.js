'use strict';

/**
 * prefs smart-home
 * JavaScript New notification add dialog.
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
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const SmartHomeAddNotification = GObject.registerClass({
    GTypeName: 'SmartHomeAddNotification',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_add_notification.ui',
    InternalChildren: [
        'lights',
        'reTitle',
        'reBody',
        'control',
        'brightness',
        'brightnessAdjustment',
        'color'
    ],
    Signals: {
        'added': {},
    }
}, class SmartHomeAddNotification extends Adw.Dialog {

    _init(lightList) {
        super._init();

        this._lights.model = lightList;
    }

    _selected(object) {
        if (this._lights.selected_item.brightness) {
            this._brightness.visible = true;
        } else {
            this._brightness.visible = false;
        }

        if (this._lights.selected_item.color) {
            this._color.visible = true;
        } else {
            this._color.visible = false;
        }

        if (this._brightness.visible || this._color.visible) {
            this._control.visible = true;
        } else {
            this._control.visible = false;
        }
    }

    _addnotification(object) {
        this.state = {
            'id': this._lights.selected_item.id,
            'name': this._lights.selected_item.name,
            "switch": true,
            "type": "light"
        };

        if (this._control.visible && this._brightness.visible && this._lights.selected_item.brightness) {
            this.state['brightness'] = this._brightnessAdjustment.value;
        }

        if (this._control.visible &&  this._color.visible && this._lights.selected_item.color) {
            this.state['color'] = {
                'red': Math.round(this._color.rgba.red * 255),
                'green': Math.round(this._color.rgba.green * 255),
                'blue': Math.round(this._color.rgba.blue * 255)
            }
        }

        this.state['reTitle'] = this._reTitle.text;
        this.state['reBody'] = this._reBody.text;

        this.emit('added');
    }
});


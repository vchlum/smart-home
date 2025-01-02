'use strict';

/**
 * prefs smart-home
 * JavaScript Row for device - like a plugin row.
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
import GLib from 'gi://GLib';

/**
 * Row for device - like a plugin row in the main prefs window.
 * 
 * @class SmartHomeDeviceRow
 * @constructor
 * @param {String} pluginName
 * @param {String} pluginID
 * @param {String} id
 * @param {Object} deviceSettings
 * @param {Object} addDialog
 * @param {Object} context
 */
export const SmartHomeDeviceRow = GObject.registerClass({
    GTypeName: 'SmartHomeDeviceRow',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_device_row.ui',
    InternalChildren: [
        "buttonTrash",
    ],
    Signals: {
        'trashMe': {},
    }
}, class SmartHomeDeviceRow extends Adw.ActionRow {
    static _classInit(klass) {
        super._classInit(klass);

        klass.install_action('add-device.run', null, (widget, actionName, parameter) => {
            widget._runAddDialog();
        });

        klass.install_action('delete-device.run', null, (widget, actionName, parameter) => {
            widget.emit('trashMe');
        });

        return klass;
    }

    _init(pluginName, pluginID, id, deviceSettings, addDialog, context) {
        super._init();
        this.pluginName = pluginName;
        this.ip = deviceSettings['ip'];
        this.title = deviceSettings['name'];
        this.subtitle = deviceSettings['ip'];
        this._addDialog = addDialog;
        this._contextDialog = context;

        if (addDialog) {
            this.action_name = 'add-device.run';
        } else {
            this.action_target = new GLib.Variant("s", pluginID);
            this.action_name = 'navigation.push';
        }
    }

    _runAddDialog() {
        this._addDialog.call(this._contextDialog, this.ip);
    }

});

'use strict';

/**
 * prefs smart-home
 * JavaScript New device add dialog.
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

/**
 * Dialog window with prompt for IP address of a new device.
 * 
 * @class SmartHomeAddDevice
 * @constructor
 * @param {String} title
 * @param {String} message
 * @param {String} default ip address
 * @return {Object}
 */
export const SmartHomeAddDevice = GObject.registerClass({
    GTypeName: 'SmartHomeAddDevice',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_add_device.ui',
    InternalChildren: [
        "addDevicePage",
        "ipAddress",

    ],
    Signals: {
        'ipAdded': {},
    }
}, class SmartHomeAddDevice extends Adw.Dialog {

    _init(title, message, ip) {
        super._init();
        this._addDevicePage.title = title;
        this._addDevicePage.description = message;
        this.ip = ip;
        if (this.ip) {
            this._ipAddress.text = this.ip;
        }
    }

    _addActivated(){
        const re = new RegExp('^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$');
        if (! re.test(this._ipAddress.text)) {
            let toast = Adw.Toast.new(_("Invalid IP address."));
            toast.set_timeout(3);
            this.get_root().add_toast(toast);
            return;
        }

        this.ip = this._ipAddress.text;
        this.emit('ipAdded');
    }

});


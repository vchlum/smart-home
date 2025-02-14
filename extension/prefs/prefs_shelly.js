'use strict';

/**
 * prefs smart-home
 * JavaScript Smart home prefs - Shelly
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
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import * as Utils from '../utils.js';

import * as ShellyApi from '../plugins/shelly/api.js';

/**
 * Preference page - Shelly
 * 
 * @class SmartHomeShelly
 * @constructor
 * @param {String} pluginID
 * @param {String} id
 * @param {Object} settings
 */
export const SmartHomeShelly = GObject.registerClass({
    GTypeName: 'SmartHomeShelly',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_shelly.ui',
    InternalChildren: [
        'statusPage',
        'nameEntry',
        'roomEntry',
        'username',
        'password',
        'spinConnectionTimeout',
    ],
}, class SmartHomeShelly extends Adw.NavigationPage {

    _init(pluginID, id, settings) {
        super._init();
        this._id = id;
        this._settings = settings;
        this.tag = pluginID;

        this._pluginSettings = this._settings.get_value(
            Utils.SETTINGS_SHELLY
        ).deep_unpack();

        this._settingsignal = this._settings.connect(
            'changed',
            () => {
                this._pluginSettings = this._settings.get_value(
                    Utils.SETTINGS_SHELLY
                ).deep_unpack();

                this.updateUI();
            }
        );

        let device = new ShellyApi.ShellyDevice({
            id: this._id,
            ip: this._pluginSettings[this._id]['ip'],
            username: this._pluginSettings[this._id]['username'],
            password: this._pluginSettings[this._id]['password'],
            gen: Number(this._pluginSettings[this._id]['gen']),
        });

        device.getStatus();

        this.updateUI();
    }

    updateUI() {
        if (!this._pluginSettings[this._id]) {
            return;
        }

        this._statusPage.title = this._pluginSettings[this._id]['name'];
        this._statusPage.description = this._pluginSettings[this._id]['ip'];

        let name = "unknown";
        if (this._pluginSettings[this._id]['name'] !== undefined) {
            name = this._pluginSettings[this._id]['name'];
        }
        this._nameEntry.text = name;

        let room = "unknown";
        if (this._pluginSettings[this._id]['group'] !== undefined) {
            room = this._pluginSettings[this._id]['group'];
        }
        this._roomEntry.text = room;

        if (this._pluginSettings[this._id]['username'] !== undefined) {
            this._username.text = this._pluginSettings[this._id]['username'];
        }

        if (this._pluginSettings[this._id]['password'] !== undefined) {
            this._password.text = this._pluginSettings[this._id]['password'];
        }

        let connectionTimeout = Utils.SHELLY_DEFAULT_TIMEOUT;
        if (this._pluginSettings[this._id]['connection-timeout'] !== undefined) {
            connectionTimeout = Number(this._pluginSettings[this._id]['connection-timeout']);
        }
        this._spinConnectionTimeout.value = connectionTimeout;
    }

    _writeDevicesSettings() {
        this._settings.set_value(
            Utils.SETTINGS_SHELLY,
            new GLib.Variant(
                Utils.SETTINGS_PLUGIN_TYPE,
                this._pluginSettings
            )
        );
    }

    _nameChanged(object) {
        if (object.text.length > 0) {
            this._pluginSettings[this._id]['name'] = object.text;
            this._writeDevicesSettings();
        } else {
            let toast = Adw.Toast.new(_("Empty value ignored."));
            toast.set_timeout(3);
            this.get_root().add_toast(toast);
        }
    }

    _roomChanged(object) {
        if (object.text.length > 0) {
            this._pluginSettings[this._id]['group'] = object.text;
            this._writeDevicesSettings();
        } else {
            let toast = Adw.Toast.new(_("Empty value ignored."));
            toast.set_timeout(3);
            this.get_root().add_toast(toast);
        }
    }

    _usernameChanged(object) {
        this._pluginSettings[this._id]['username'] = object.text;
        this._writeDevicesSettings();
    }

    _passwordChanged(object) {
        this._pluginSettings[this._id]['password'] = object.text;
        this._writeDevicesSettings();
    }

    _connectionTimeoutChanged(object) {
        this._pluginSettings[this._id]['connection-timeout'] = String(object.value);
        this._writeDevicesSettings();
    }

    clear() {

    }
});

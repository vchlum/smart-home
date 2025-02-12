'use strict';

/**
 * prefs smart-home
 * JavaScript Smart home prefs - Nanoleaf
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

import * as SmartHomeDeviceLight from './prefs_device_light.js';
import * as NanoleafApi from '../plugins/nanoleaf/api.js';

/**
 * Preference page - Nanoleaf
 * 
 * @class SmartHomeNanoleaf
 * @constructor
 * @param {String} pluginID
 * @param {String} id
 * @param {Object} settings
 */
export const SmartHomeNanoleaf = GObject.registerClass({
    GTypeName: 'SmartHomeNanoleaf',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_nanoleaf.ui',
    InternalChildren: [
        'statusPage',
        'nameEntry',
        'roomEntry',
        'devicesOnLogin',
        'spinConnectionTimeout',
    ],
}, class SmartHomeNanoleaf extends Adw.NavigationPage {

    _init(pluginID, id, settings) {
        super._init();
        this._id = id;
        this._settings = settings;
        this.tag = pluginID;
        this._onLoginSettings = {};

        this._pluginSettings = this._settings.get_value(
            Utils.SETTINGS_NANOLEAF
        ).deep_unpack();

        if (this._pluginSettings[this._id]['on-login']) {
            this._onLoginSettings = JSON.parse(this._pluginSettings[this._id]['on-login']);
        }

        this._settingsignal = this._settings.connect(
            'changed',
            () => {
                this._pluginSettings = this._settings.get_value(
                    Utils.SETTINGS_NANOLEAF
                ).deep_unpack();

                if (this._pluginSettings[this._id] && this._pluginSettings[this._id]['on-login']) {
                    this._onLoginSettings = JSON.parse(this._pluginSettings[this._id]['on-login']);
                }

                this.updateUI();
            }
        );

        let device = new NanoleafApi.NanoLightsDevice({
            id: this._id,
            ip: this._pluginSettings[this._id]['ip'],
            token: this._pluginSettings[this._id]['auth_token']

        });

        device.connect(
            'all-effects',
            this._createOnLoging.bind(this)
        );

        device.getDeviceAllEffects();

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

        let connectionTimeout = Utils.NANOLEAF_DEFAULT_TIMEOUT;
        if (this._pluginSettings[this._id]['connection-timeout'] !== undefined) {
            connectionTimeout = Number(this._pluginSettings[this._id]['connection-timeout']);
        }
        this._spinConnectionTimeout.value = connectionTimeout;
    }

    _writeDevicesSettings() {
        this._settings.set_value(
            Utils.SETTINGS_NANOLEAF,
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

    _connectionTimeoutChanged(object) {
        this._pluginSettings[this._id]['connection-timeout'] = String(object.value);
        this._writeDevicesSettings();
    }

    _onLoginDisableOthers(type, title) {
        this._doNotChange = true;

        for (let row of this._onLoginRows) {
            if (row.title !== title)
                row._deviceSwitch.active = false;
        }

        this._doNotChange = false;
    }

    _createOnLoging(object) {
        let effects = [];

        if (! object.allEffectsData['animations']) {
            return;
        }

        for (let e of object.allEffectsData['animations']) {
            effects.push(e['animName']);
        }

        this._onLoginRows = [];
        this._doNotChange = false;

        let device = new SmartHomeDeviceLight.SmartHomeDeviceLight(
            'light',
            this._id,
            this._pluginSettings[this._id]['name'],
            true,
            true
        );

        device.setUI(
            this._onLoginSettings[this._id]
        );

        device.connect(
            'state-changed',
            (object) => {
                if (this._doNotChange) {
                    return;
                }

                this._onLoginSettings = {};
                this._onLoginSettings[object.id] = object.state;

                this._onLoginDisableOthers('light', object.title);

                this._pluginSettings[this._id]['on-login'] = JSON.stringify(this._onLoginSettings);
                this._writeDevicesSettings();
            }
        );

        this._onLoginRows.push(device);

        this._devicesOnLogin.add_row(device);

        for (let effect of effects) {
            let deviceEffect =  new SmartHomeDeviceLight.SmartHomeDeviceLight(
                'scene',
                effect,
                effect,
                true,
                undefined
            );

            deviceEffect.setUI(
                this._onLoginSettings[effect]
            );

            deviceEffect.connect(
                'state-changed',
                (object) => {
                    if (this._doNotChange) {
                        return;
                    }

                    this._onLoginSettings = {};
                    this._onLoginSettings[object.title] = object.state;

                    this._onLoginDisableOthers('scene', object.title);

                    this._pluginSettings[this._id]['on-login'] = JSON.stringify(this._onLoginSettings);
                    this._writeDevicesSettings();
                }
            );

            this._devicesOnLogin.add_row(deviceEffect);
            this._onLoginRows.push(deviceEffect);
        }
    }

    clear() {

    }
});

'use strict';

/**
 * prefs smart-home
 * JavaScript Smart home prefs - Philips Hue sync lights with desktop.
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
import * as PhilipsHueBridgeApi from '../plugins/philipshue-bridge/api.js';


/**
 * Preference page - Philips Hue sync lights with desktop
 * 
 * @class SmartHomePhilipsHueDesktopSync
 * @constructor
 * @param {String} pluginID
 * @param {String} id
 * @param {Object} settings
 */
export const SmartHomePhilipsHueDesktopSync = GObject.registerClass({
    GTypeName: 'SmartHomePhilipsHueDesktopSync',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_philipshue-desktopsync.ui',
    InternalChildren: [
        'statusPage',
        'hideUnavailable',
        'comboIndicatorPosition',
        'devicesOnLogin',
        'comboSyncMode',
        'spinConnectionTimeout',
    ],
}, class SmartHomePhilipsHueDesktopSync extends Adw.NavigationPage {
    static _classInit(klass) {
        super._classInit(klass);

        return klass;
    }

    _init(pluginID, id, settings) {
        super._init();
        this._id = id;
        this._settings = settings;
        this.tag = pluginID;
        this._onLoginSettings = {};

        this._pluginSettings = this._settings.get_value(
            Utils.SETTINGS_PHILIPSHUEDESKTOPSYNC
        ).deep_unpack();

        if (this._pluginSettings[this._id]['on-login']) {
            this._onLoginSettings = JSON.parse(this._pluginSettings[this._id]['on-login']);
        }

        this._settingsignal = this._settings.connect(
            'changed',
            () => {
                this._pluginSettings = this._settings.get_value(
                    Utils.SETTINGS_PHILIPSHUEDESKTOPSYNC
                ).deep_unpack();

                if (this._pluginSettings[this._id]['on-login']) {
                    this._onLoginSettings = JSON.parse(this._pluginSettings[this._id]['on-login']);
                }

                this.updateUI();
            }
        );

        let bridge = new PhilipsHueBridgeApi.PhilipsHueBridge({
            ip: this._pluginSettings[this._id]['ip'],
            username: this._pluginSettings[this._id]['username'],
            clientkey: this._pluginSettings[this._id]['clientkey']
        });

        bridge.connect(
            'all-data',
            this._parseBridgeData.bind(this)
        );

        bridge.getAll();

        this.updateUI();
    }

    updateUI() {
        if (!this._pluginSettings[this._id]) {
            return;
        }

        this._statusPage.title = this._pluginSettings[this._id]['name'];
        this._statusPage.description = this._pluginSettings[this._id]['ip'];

        let hideUnavailable = Utils.ALL_DEFAULT_HIDE_UNAVAILABLE;
        if (this._pluginSettings[this._id]['hide-unavailable'] !== undefined) {
            hideUnavailable = this._pluginSettings[this._id]['hide-unavailable'] === 'true';
        }
        this._hideUnavailable.active = hideUnavailable;

        let indicatorPosition = 1;
        if (this._pluginSettings[this._id]['indicator-position'] !== undefined) {
            indicatorPosition = Number(this._pluginSettings[this._id]['indicator-position']);
        }
        this._comboIndicatorPosition.selected = indicatorPosition;

        let autoStartMode = 0;
        if (this._onLoginSettings['autostart-mode'] !== undefined) {
            switch(this._onLoginSettings['autostart-mode']) {
                case 'sync-music':
                    autoStartMode = 1;
                    break;
                case 'sync-cursor':
                    autoStartMode = 2;
                    break;
                default:
                    autoStartMode = 0;
                    break;
            }
        }
        this._comboSyncMode.selected = autoStartMode;

        let connectionTimeout = Utils.PHILIPSHUEBRIDGE_DEFAULT_TIMEOUT;
        if (this._pluginSettings[this._id]['connection-timeout'] !== undefined) {
            connectionTimeout = Number(this._pluginSettings[this._id]['connection-timeout']);
        }
        this._spinConnectionTimeout.value = connectionTimeout;
    }

    _writeDevicesSettings() {
        this._settings.set_value(
            Utils.SETTINGS_PHILIPSHUEDESKTOPSYNC,
            new GLib.Variant(
                Utils.SETTINGS_PLUGIN_TYPE,
                this._pluginSettings
            )
        ); 
    }

    _hideUnavailableSwitched(object) {
        this._pluginSettings[this._id]['hide-unavailable'] = String(object.active);
        this._writeDevicesSettings();
    }

    _indicatorPositionSelected(object) {
        this._pluginSettings[this._id]['indicator-position'] = String(object.selected);
        this._writeDevicesSettings();
    }

    _autoStartModeSelected(object) {
        switch (object.selected) {
            case 1:
                this._onLoginSettings['autostart-mode'] = 'sync-music';
                break;
            case 2:
                this._onLoginSettings['autostart-mode'] = 'sync-cursor';
                break;
            default:
                this._onLoginSettings = {};
                break;
        }
        this._pluginSettings[this._id]['on-login'] = JSON.stringify(this._onLoginSettings);
        this._writeDevicesSettings();
    }

    _connectionTimeoutChanged(object) {
        this._pluginSettings[this._id]['connection-timeout'] = String(object.value);
        this._writeDevicesSettings();
    }

    _parseBridgeData(bridge) {
        let areas = [];

        const sortFce = (a, b) => {
            if (a.title < b.title) {
                return -1;
            }

            if (a.title > b.title) {
                return 1;
            }

            return 0;
        }

        for (let data of bridge.data['data']) {
            if (data['type'] === 'entertainment_configuration') {
                areas.push(this._createAreaOnLogin(
                    'area',
                    data,
                ));
            }
        }

        areas.sort(sortFce);

        for (let area of areas) {
            this._devicesOnLogin.add_row(area);
        }

        this._rows = areas;
    }

    _createAreaOnLogin(type, data) {
        let device = new SmartHomeDeviceLight.SmartHomeDeviceLight(
            type,
            data['id'],
            `${data['metadata']['name']}`,
            undefined,
            undefined
        );

        device._deviceSwitch.visible = false;

        let radioButton = device.switchToCheckButton(this._firstRadioButton);
        if (! this._firstRadioButton) {
            this._firstRadioButton = radioButton;
        }

        if (data['id'] === this._onLoginSettings['id']) {
            radioButton.active = true;
        }

        radioButton.connect(
            'toggled',
            (object) => {
                if (! object.active) {
                    return;
                }

                this._onLoginSettings['id'] = data['id'];

                this._pluginSettings[this._id]['on-login'] = JSON.stringify(this._onLoginSettings);
                this._writeDevicesSettings();
            }
        );

        return device;
    }

    clear() {
        this._settings.disconnect(this._settingsignal);
    }
});

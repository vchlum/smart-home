'use strict';

/**
 * prefs smart-home
 * JavaScript Smart home prefs - Ikea Dirigera
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
import * as IkeaDirigeraApi from '../plugins/ikea-dirigera/api.js';


/**
 * Preference page - Ikea dirigera
 * 
 * @class SmartHomeIkeaDirigera
 * @constructor
 * @param {String} pluginID
 * @param {String} id
 * @param {Object} settings
 */
export const SmartHomeIkeaDirigera = GObject.registerClass({
    GTypeName: 'SmartHomeIkeaDirigera',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_ikea-dirigera.ui',
    InternalChildren: [
        'statusPage',
        'hideUnavailable',
        'comboIndicatorPosition',
        'offShutdown',
        'devicesOnLogin',
        'spinConnectionTimeout',
    ],
}, class SmartHomeIkeaDirigera extends Adw.NavigationPage {

    _init(pluginID, id, settings) {
        super._init();
        this._id = id;
        this._settings = settings;
        this.tag = pluginID;
        this._onLoginSettings = {};

        this._pluginSettings = this._settings.get_value(
            Utils.SETTINGS_IKEADIRIGERA
        ).deep_unpack();

        if (this._pluginSettings[this._id]['on-login']) {
            this._onLoginSettings = JSON.parse(this._pluginSettings[this._id]['on-login']);
        }

        this._settingsignal = this._settings.connect(
            'changed',
            () => {
                this._pluginSettings = this._settings.get_value(
                    Utils.SETTINGS_IKEADIRIGERA
                ).deep_unpack();

                if (this._pluginSettings[this._id] && this._pluginSettings[this._id]['on-login']) {
                    this._onLoginSettings = JSON.parse(this._pluginSettings[this._id]['on-login']);
                }

                this.updateUI();
            }
        );

        let bridge = new IkeaDirigeraApi.IkeaDirigeraBridge({
            ip: this._pluginSettings[this._id]['ip'],
            token: this._pluginSettings[this._id]['accessToken']
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

        let connectionTimeout = Utils.IKEADIRIGERA_DEFAULT_TIMEOUT;
        if (this._pluginSettings[this._id]['connection-timeout'] !== undefined) {
            connectionTimeout = Number(this._pluginSettings[this._id]['connection-timeout']);
        }
        this._spinConnectionTimeout.value = connectionTimeout;

        let offShutdown = false;
        if (this._pluginSettings[this._id]['off-shutdown'] !== undefined) {
            offShutdown = this._pluginSettings[this._id]['off-shutdown'] === 'true';
        }
        this._offShutdown.active = offShutdown;
    }

    _writeDevicesSettings() {
        this._settings.set_value(
            Utils.SETTINGS_IKEADIRIGERA,
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

    _connectionTimeoutChanged(object) {
        this._pluginSettings[this._id]['connection-timeout'] = String(object.value);
        this._writeDevicesSettings();
    }

    _offShutdownSwitched(object) {
        this._pluginSettings[this._id]['off-shutdown'] = String(object.active);
        this._writeDevicesSettings();
    }

    _parseBridgeData(bridge) {
        let lights = [];
        let data = bridge.data;

        const sortFce = (a, b) => {
            if (a.title < b.title) {
                return -1;
            }

            if (a.title > b.title) {
                return 1;
            }

            return 0;
        }

        for (let d of data) {
            if (d['type'] === 'light' || d['type'] === 'outlet') {
                let device = new SmartHomeDeviceLight.SmartHomeDeviceLight(
                    d['type'],
                    d['id'],
                    `${d['room']['name']} - ${d['attributes']['customName']}`,
                    undefined,
                    undefined
                );
        
                device.setUI(
                    this._onLoginSettings[d['id']]
                );
        
                device.connect(
                    'state-changed',
                    (object) => {
                        this._onLoginSettings[object.id] = object.state;
        
                        this._pluginSettings[this._id]['on-login'] = JSON.stringify(this._onLoginSettings);
                        this._writeDevicesSettings();
                    }
                );

                lights.push(device);
            }
        }

        lights.sort(sortFce);

        for (let light of lights) {
            this._devicesOnLogin.add_row(light);
        }
    }

    clear() {

    }
});

'use strict';

/**
 * prefs smart-home
 * JavaScript Smart home prefs - Philips Hue bridge
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
 * Preference page - Philips Hue bridge
 * 
 * @class SmartHomePhilipsHueBridge
 * @constructor
 * @param {String} pluginID
 * @param {String} id
 * @param {Object} settings
 */
export const SmartHomePhilipsHueBridge = GObject.registerClass({
    GTypeName: 'SmartHomePhilipsHueBridge',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_philipshue-bridge.ui',
    InternalChildren: [
        'statusPage',
        'switchZonesFirst',
        'switchShowScenes',
        'hideUnavailable',
        'comboIndicatorPosition',
        'activatableDesktopSync',
        'offShutdown',
        'devicesOnLogin',
        'spinConnectionTimeout',
    ],
}, class SmartHomePhilipsHueBridge extends Adw.NavigationPage {
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
            Utils.SETTINGS_PHILIPSHUEBRIDGE
        ).deep_unpack();

        if (this._pluginSettings[this._id]['on-login']) {
            this._onLoginSettings = JSON.parse(this._pluginSettings[this._id]['on-login']);
        }

        this._settingsignal = this._settings.connect(
            'changed',
            () => {
                this._pluginSettings = this._settings.get_value(
                    Utils.SETTINGS_PHILIPSHUEBRIDGE
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

        let zonesFirst = Utils.PHILIPSHUEBRIDGE_DEFAULT_ZONESFIRST;
        if (this._pluginSettings[this._id]['zones-first'] !== undefined) {
            zonesFirst = this._pluginSettings[this._id]['zones-first'] === 'true';
        }
        this._switchZonesFirst.active = zonesFirst;

        let showScenes = Utils.PHILIPSHUEBRIDGE_DEFAULT_SHOWSCENES;
        if (this._pluginSettings[this._id]['show-scenes'] !== undefined) {
            showScenes = this._pluginSettings[this._id]['show-scenes'] === 'true';
        }
        this._switchShowScenes.active = showScenes;

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

        let desktopSync = this._isDesktopSyncEnabled(this._id);
        this._activatableDesktopSync.activatable = ! desktopSync;
        if (desktopSync) {
            this._activatableDesktopSync.subtitle = _("Already enabled");
        } else {
            this._activatableDesktopSync.subtitle = "";
        }

        let connectionTimeout = Utils.PHILIPSHUEBRIDGE_DEFAULT_TIMEOUT;
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
            Utils.SETTINGS_PHILIPSHUEBRIDGE,
            new GLib.Variant(
                Utils.SETTINGS_PLUGIN_TYPE,
                this._pluginSettings
            )
        ); 
    }

    _isDesktopSyncEnabled(id) {
        let syncSettings = this._settings.get_value(
            Utils.SETTINGS_PHILIPSHUEDESKTOPSYNC
        ).deep_unpack();

        if (syncSettings[id] === undefined || Object.keys(syncSettings[id]) === 0) {
            return false;
        }

        return true;
    }

    _enableDesktopSyncSettings(id) {
        let syncSettings = this._settings.get_value(
            Utils.SETTINGS_PHILIPSHUEDESKTOPSYNC
        ).deep_unpack();

        syncSettings[id] = this._pluginSettings[this._id];

        this._settings.set_value(
            Utils.SETTINGS_PHILIPSHUEDESKTOPSYNC,
            new GLib.Variant(
                Utils.SETTINGS_PLUGIN_TYPE,
                syncSettings
            )
        );

        let toast = Adw.Toast.new(_("The synchronization setting is now available in the section Philips Hue/Desktop Sync."));
        toast.set_timeout(5);
        this.get_root().add_toast(toast);
    }

    _zonesFirstSwitched(object) {
        this._pluginSettings[this._id]['zones-first'] = String(object.active);
        this._writeDevicesSettings();
    }

    _showScenesSwitched(object) {
        this._pluginSettings[this._id]['show-scenes'] = String(object.active);
        this._writeDevicesSettings();
    }

    _hideUnavailableSwitched(object) {
        this._pluginSettings[this._id]['hide-unavailable'] = String(object.active);
        this._writeDevicesSettings();
    }

    _indicatorPositionSelected(object) {
        this._pluginSettings[this._id]['indicator-position'] = String(object.selected);
        this._writeDevicesSettings();
    }

    _desktopSyncActivated() {
        this._writeDevicesSettings();
        this._enableDesktopSyncSettings(this._id);
    }

    _connectionTimeoutChanged(object) {
        this._pluginSettings[this._id]['connection-timeout'] = String(object.value);
        this._writeDevicesSettings();
    }

    _parseBridgeData(bridge) {
        let lights = [];
        let scenes = [];

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
            if (data['type'] === 'light') {
                lights.push(this._createLightOnLogin(
                    'light',
                    data,
                    this._getRoomNameOfLight(bridge.data['data'], data['id'])
                ));
            }

            if (data['type'] === 'scene') {
                scenes.push(this._createLightOnLogin(
                    'scene',
                    data,
                    this._getGroupNameOfScene(bridge.data['data'], data['id'])
                ));
            }
        }

        lights.sort(sortFce);
        scenes.sort(sortFce);

        for (let light of lights) {
            this._devicesOnLogin.add_row(light);
        }

        for (let scene of scenes) {
            this._devicesOnLogin.add_row(scene);
        }
    }

    _getRoomNameOfLight(bridgeData, id) {
        let deviceId;
        for (let data of bridgeData) {
            if (data['type'] === 'device') {
                for (let service of data['services']) {
                    if (['light', 'scene'].includes(service['rtype']))
                    if (service['rid'] === id) {
                        deviceId = data['id'];
                        break;
                    }
                }
            }
        }

        for (let data of bridgeData) {
            if (data['type'] === 'room') {
                for (let service of data['children']) {
                    if (service['rid'] === deviceId) {
                        return data['metadata']['name'];
                    }
                }
            }
        }
    }

    _getGroupNameOfScene(bridgeData, id) {
        let groupId;
        for (let data of bridgeData) {
            if (data['type'] === 'scene' && data['id'] === id) {
                groupId = data['group']['rid'];
                break;
            }
        }

        for (let data of bridgeData) {
            if (data['type'] === 'room' || data['type'] === 'zone') {
                if (data['id'] === groupId) {
                    return data['metadata']['name'];
                }
            }
        }
    }

    _offShutdownSwitched(object) {
        this._pluginSettings[this._id]['off-shutdown'] = String(object.active);
        this._writeDevicesSettings();
    }

    _createLightOnLogin(type, data, roomName) {
        let device = new SmartHomeDeviceLight.SmartHomeDeviceLight(
            type,
            data['id'],
            `${roomName} - ${data['metadata']['name']}`,
            data['dimming'],
            data['color']
        );

        device.setUI(
            this._onLoginSettings[data['id']]
        );

        device.connect(
            'state-changed',
            (object) => {
                this._onLoginSettings[object.id] = object.state;

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

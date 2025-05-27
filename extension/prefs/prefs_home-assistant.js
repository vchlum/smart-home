'use strict';

/**
 * prefs smart-home
 * JavaScript Smart home prefs - Home Assistant
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

import * as PrefsUtils from './prefs_utils.js';
import * as SmartHomeDeviceLight from './prefs_device_light.js';
import * as HomeAssistantApi from '../plugins/home-assistant/api.js';
import * as SmartHomeAddNotification from './prefs_add_notification.js';

/**
 * Preference page - HomeAssistant
 * 
 * @class SmartHomeHomeAssistant
 * @constructor
 * @param {String} pluginID
 * @param {String} id
 * @param {Object} settings
 */
export const SmartHomeHomeAssistant = GObject.registerClass({
    GTypeName: 'SmartHomeHomeAssistant',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_home-assistant.ui',
    InternalChildren: [
        'statusPage',
        'hideUnavailable',
        'comboIndicatorPosition',
        'mergeUniversal',
        'offShutdown',
        'devicesOnLogin',
        'devicesNotification',
        'notifyNotebookMode',
        'spinConnectionTimeout',
    ],
}, class SmartHomeHomeAssistant extends Adw.NavigationPage {
    static _classInit(klass) {
        super._classInit(klass);

        klass.install_action('add-notification.run', null, (widget, actionName, parameter) => {
            PrefsUtils.addNotificationDialog(widget, this);
        });

        return klass;
    }

    _init(pluginID, id, settings) {
        super._init();
        this.pluginID = pluginID;
        this._id = id;
        this._settings = settings;
        this.tag = pluginID;
        this._onLoginSettings = {};
        this._notificationSettings = {};
        this._notificationDeviceList = [];

        this._pluginSettings = this._settings.get_value(
            Utils.SETTINGS_HOMEASSISTANT
        ).deep_unpack();

        if (this._pluginSettings[this._id]['on-login']) {
            this._onLoginSettings = JSON.parse(this._pluginSettings[this._id]['on-login']);
        }

        if (this._pluginSettings[this._id]['notification']) {
            this._notificationSettings = JSON.parse(this._pluginSettings[this._id]['notification']);
        }

        this._settingsignal = this._settings.connect(
            'changed',
            () => {
                this._pluginSettings = this._settings.get_value(
                    Utils.SETTINGS_HOMEASSISTANT
                ).deep_unpack();

                if (! this._pluginSettings[this.id]) {
                    return; //device is being removed
                }

                if (this._pluginSettings[this._id]['on-login']) {
                    this._onLoginSettings = JSON.parse(this._pluginSettings[this._id]['on-login']);
                }

                if (this._pluginSettings[this._id]['notification']) {
                    this._notificationSettings = JSON.parse(this._pluginSettings[this._id]['notification']);
                }

                this.updateUI();
            }
        );

        let bridge = new HomeAssistantApi.HomeAssistantBridge({
            ip: this._pluginSettings[this._id]['ip'],
            port: this._pluginSettings[this._id]['port'],
            token: this._pluginSettings[this._id]['accessToken']
        });

        bridge.connect(
            'states',
            this._parseBridgeData.bind(this)
        );

        bridge.getStates();

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

        let universalPluginSettings = this._settings.get_value(
            Utils.SETTINGS_SMARTHOME_UNIVERSAL
        ).deep_unpack();
        if (Object.keys(universalPluginSettings).includes(this.pluginID)) {
            this._mergeUniversal.active = true;
        }

        let notifyNotebookMode = false;
        if (this._pluginSettings[this._id]['notify-notebook-mode'] !== undefined) {
            notifyNotebookMode = this._pluginSettings[this._id]['notify-notebook-mode'] === 'true';
        }
        this._notifyNotebookMode.active = notifyNotebookMode;

        let connectionTimeout = Utils.HOMEASSISTANT_DEFAULT_TIMEOUT;
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
            Utils.SETTINGS_HOMEASSISTANT,
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

    _mergeUniversalSwitched(object) {
        let universalPluginSettings = this._settings.get_value(
            Utils.SETTINGS_SMARTHOME_UNIVERSAL
        ).deep_unpack();

        if (object.active) {
            universalPluginSettings[this.pluginID] = {};
        } else {
            delete(universalPluginSettings[this.pluginID]);
        }

        this._settings.set_value(
            Utils.SETTINGS_SMARTHOME_UNIVERSAL,
            new GLib.Variant(
                Utils.SETTINGS_PLUGIN_TYPE,
                universalPluginSettings
            )
        );
    }

    _connectionTimeoutChanged(object) {
        this._pluginSettings[this._id]['connection-timeout'] = String(object.value);
        this._writeDevicesSettings();
    }

    _offShutdownSwitched(object) {
        this._pluginSettings[this._id]['off-shutdown'] = String(object.active);
        this._writeDevicesSettings();
    }

    _notifyNotebookModeSwitched(object) {
        this._pluginSettings[this._id]['notify-notebook-mode'] = String(object.active);
        this._writeDevicesSettings();
    }

    _parseBridgeData(bridge) {
        let lights = [];
        let scenes = [];
        let notificationLights = [];

        const sortFce = (a, b) => {
            if (a.title < b.title) {
                return -1;
            }

            if (a.title > b.title) {
                return 1;
            }

            return 0;
        }

        for (let data of bridge.data) {
            if (data['entity_id'].startsWith('light.')) {
                lights.push(this._createLightOnLogin(
                    'light',
                    data
                ));
            }

            if (data['entity_id'].startsWith('scene.')) {
                scenes.push(this._createLightOnLogin(
                    'scene',
                    data
                ));
            }

            if (data['entity_id'].startsWith('light.')) {
                let tmp = [];
                let dimming = false;
                let color = false;

                for (let i of data['attributes']['supported_color_modes']) {
                    if (i !== 'color_temp') {
                        tmp.push(i);
                    }
                }

                if (! tmp.includes('onoff')) {
                    dimming = true;
                    if (tmp.length >= 1) {
                        color = true;
                    }
                }
                this._notificationDeviceList.push(
                    {
                        id: data['entity_id'],
                        title: data['attributes']['friendly_name'],
                        brightness: dimming,
                        color: color
                    }
                );

                for (let n of Object.keys(this._notificationSettings)) {
                    let id = n.split(PrefsUtils.notifSplitter)[0];
                    if (id === data['entity_id']) {
                        notificationLights.push(PrefsUtils.createNotificationLight(
                            this,
                            n,
                            id,
                            data['attributes']['friendly_name'],
                            dimming,
                            color
                        ));
                    }
                }
            }
        }

        lights.sort(sortFce);
        scenes.sort(sortFce);
        this._notificationDeviceList.sort(sortFce);

        for (let light of lights) {
            this._devicesOnLogin.add_row(light);
        }

        for (let scene of scenes) {
            this._devicesOnLogin.add_row(scene);
        }

        for (let light of notificationLights) {
            this._devicesNotification.add_row(light);
        }
    }

    _createLightOnLogin(type, data) {
        let dimming = undefined;
        let color = undefined;
        if (data['entity_id'].startsWith('light.')) {
            let tmp = [];
            for (let i of data['attributes']['supported_color_modes']) {
                if (i !== 'color_temp') {
                    tmp.push(i);
                }
            }
            if (! tmp.includes('onoff')) {
                dimming = true;
                if (tmp.length >= 1) {
                    color = true;
                }
            }
        }

        let device = new SmartHomeDeviceLight.SmartHomeDeviceLight(
            type,
            data['entity_id'],
            `${data['attributes']['friendly_name']}`,
            dimming !== undefined,
            color !== undefined
        );

        device.setUI(
            this._onLoginSettings[data['entity_id']]
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

    }
});

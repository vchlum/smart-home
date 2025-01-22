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
        'spinConnectionTimeout',
    ],
}, class SmartHomeHomeAssistant extends Adw.NavigationPage {

    _init(pluginID, id, settings) {
        super._init();
        this._id = id;
        this._settings = settings;
        this.tag = pluginID;

        this._pluginSettings = this._settings.get_value(
            Utils.SETTINGS_HOMEASSISTANT
        ).deep_unpack();

        this._settingsignal = this._settings.connect(
            'changed',
            () => {
                this._pluginSettings = this._settings.get_value(
                    Utils.SETTINGS_HOMEASSISTANT
                ).deep_unpack();

                this.updateUI();
            }
        );

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

        let connectionTimeout = Utils.HOMEASSISTANT_DEFAULT_TIMEOUT;
        if (this._pluginSettings[this._id]['connection-timeout'] !== undefined) {
            connectionTimeout = Number(this._pluginSettings[this._id]['connection-timeout']);
        }
        this._spinConnectionTimeout.value = connectionTimeout;
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

    _connectionTimeoutChanged(object) {
        this._pluginSettings[this._id]['connection-timeout'] = String(object.value);
        this._writeDevicesSettings();
    }

    clear() {

    }
});

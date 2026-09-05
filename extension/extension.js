'use strict';

/**
 * extension smart-home
 * JavaScript Gnome extension for miscellaneous smart devices like Philips Hue, Ikea Dirigera, Nanoleaf.
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

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as SmartHome from './smarthome.js';
import * as Utils from './utils.js';
import { ApiServer } from './api-server.js';

let runNotify = [];

export default class SmartHomeExtension extends Extension {

    addNotificationSmartHome(notification) {
        for (let notify of runNotify) {
            notify(notification.title, notification.body);
        }

        MessageTray.Source.prototype.origAddNotification.call(this, notification);
    }

    enable() {
        this._settings = this.getSettings();

        this._smarthome = new SmartHome.SmartHome(
            this.metadata,
            this.dir,
            this._settings,
            this.openPreferences.bind(this)
        );

        this._signalPluginReady = this._smarthome.connect(
            'plugin-ready',
            (object, pluginID) => {
                if (this._smarthome.instances[pluginID].runNotify !== undefined) {
                    runNotify.push(
                        this._smarthome.instances[pluginID].runNotify.bind(
                            this._smarthome.instances[pluginID]
                        )
                    );
                }

                if (this._smarthome.instances[pluginID].inUniversalMenu()) {
                    return;
                }

                Main.panel.addToStatusArea(
                    `smart-home_${this._smarthome.instances[pluginID].pluginName}_${this._smarthome.instances[pluginID].id}`,
                    this._smarthome.instances[pluginID]
                );
                this._smarthome.instances[pluginID].setPositionInPanel();
            }
        );

        this._smarthome.refreshPlugins();

        MessageTray.Source.prototype.origAddNotification = MessageTray.Source.prototype.addNotification;
        MessageTray.Source.prototype.addNotification = this.addNotificationSmartHome;

        this._apiServer = new ApiServer(this._smarthome);
        this._applyApiSettings();

        this._apiSettingsSignal = this._settings.connect(
            'changed',
            (settings, key) => {
                if ([
                    Utils.SETTINGS_API_ENABLED,
                    Utils.SETTINGS_API_PORT,
                    Utils.SETTINGS_API_TOKEN,
                    Utils.SETTINGS_API_BIND_ALL
                ].includes(key)) {
                    this._applyApiSettings();
                }
            }
        );
    }

    /**
     * Starts/stops/restarts the local HTTP API based on current settings.
     * Generates a token on first use if the API is enabled without one.
     *
     * @method _applyApiSettings
     * @private
     */
    _applyApiSettings() {
        let enabled = this._settings.get_boolean(Utils.SETTINGS_API_ENABLED);

        if (! enabled) {
            this._apiServer.stop();
            return;
        }

        let token = this._settings.get_string(Utils.SETTINGS_API_TOKEN);
        if (! token) {
            /* triggers 'changed' again, which will call this function once more */
            this._settings.set_string(Utils.SETTINGS_API_TOKEN, Utils.generateApiToken());
            return;
        }

        let port = this._settings.get_int(Utils.SETTINGS_API_PORT);
        let bindAll = this._settings.get_boolean(Utils.SETTINGS_API_BIND_ALL);

        this._apiServer.start(port, token, bindAll);
    }

    disable() {
        runNotify = [];

        MessageTray.Source.prototype.addNotification = MessageTray.Source.prototype.origAddNotification;
        delete(MessageTray.Source.prototype.origAddNotification);

        this._settings.disconnect(this._apiSettingsSignal);
        this._apiSettingsSignal = undefined;
        this._apiServer.stop();
        this._apiServer = null;

        this._smarthome.clear();
        this._smarthome.disconnect(this._signalPluginReady);
        this._signalPluginReady = undefined;

        for (let i in this._smarthome.instances) {
            this._smarthome.removePlugin(i);
        }

        this._smarthome = null;
        this._settings = null;
    }
}

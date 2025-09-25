'use strict';

/**
 * extension smart-home
 * JavaScript Philiops hue Deskto sync
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

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Utils from '../../utils.js';
import * as SmartHomePanelMenu from '../../smarthome-panelmenu.js';
import * as BridgeApi from '../philipshue-bridge/api.js';
import * as TrackCursor from './track-cursor.js';
import * as SyncMusic from './sync-music.js';
import * as SyncScreen from './sync-screen.js';

export const Plugin =  GObject.registerClass({
    GTypeName: "PhilipsHueDesktopSync",
}, class Plugin extends SmartHomePanelMenu.SmartHomePanelMenu {

    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        this.id = id;
        this._connectionTimeout = Utils.PHILIPSHUEBRIDGE_DEFAULT_TIMEOUT;
        this._notebookMode = false;
        this._bridgeSignals = [];
        super._init(id, pluginName, metadata, mainDir, settings, openPref);

        this._brightness = 0.5;
        this._intensity = 0.5;
        this._firstTime = true;
        this._displays = [];
        this.miscStorage = this.readSettingsMiscellaneous();
    }

    settingRead() {
        if (!this._pluginSettings[this.id]) {
            return; //device is being removed
        }

        if (this._pluginSettings[this.id]['connection-timeout'] !== undefined) {
            this._connectionTimeout = Number(this._pluginSettings[this.id]['connection-timeout']);

            if (this._bridge) {
                this._bridge.setConnectionTimeout(this._connectionTimeout);
            }
        }

        if (this._pluginSettings[this.id]['on-login']) {
            this._onLoginSettings = JSON.parse(this._pluginSettings[this.id]['on-login']);
        }

        if (this._pluginSettings[this.id]['notebook-mode'] !== undefined) {
            this._notebookMode = this._pluginSettings[this.id]['notebook-mode'] === 'true';
        }

        this.miscStorage = this.readSettingsMiscellaneous();
    }

    preparePlugin() {
        let signal;

        this._timers = [];
        this._ip = this._pluginSettings[this.id]['ip'];
        this._userName = this._pluginSettings[this.id]['username'];
        this._clientKey = this._pluginSettings[this.id]['clientkey'];
        this._bridgeName = this._pluginSettings[this.id]['name'];

        this._bridge = new BridgeApi.PhilipsHueBridge({
            ip: this._ip,
            username: this._userName,
            clientkey: this._clientKey
        });

        this._bridge.setConnectionTimeout(this._connectionTimeout);

        signal = this._bridge.connect(
            'entertainment-data',
            () => {
                this.data = {'config': {}, 'devices': {}, 'groups': {}};
                this._entertainments = {};

                this._entertainmentData = this._bridge.data['data'];
                this._createData();
                this._updateData(this._entertainmentData);
                this._preParseData(this._entertainmentData);

                for (let id in this._entertainments) {
                    let item = this.parseEntertainment(this._entertainments[id]);
                    if (item) {
                        this.data['devices'][id] = item;
                    }
                }

                this.dataReady();

                if (this._firstTime) {
                    this._runOnStart();
                    this._firstTime = false;
                }
            }
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'stream-disabled',
            () => {
                this.streamer.disconnectStream();
                this.streamer.disconnectSignals();
                this.streamer = null;

                if (this.restartFunction) {
                    this.restartFunction();
                }

                this._updateData(this._entertainmentData);
                this.dataReady();
            }
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'connection-problem',
            () => {
                if (this.streamer) {
                    this.streamer.disconnectStream();
                    this.streamer.disconnectSignals();
                    this.streamer = null;
                }

                this._updateData(this._entertainmentData);
                this.dataReady();

                this.connectionClosed();
            }
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'event-stream-data',
            this._handleEventStreamData.bind(this)
        );
        this._bridgeSignals.push(signal);

        Utils.logDebug(`Philips Hue desktop sync ${this.id} ready.`);
    }

    _createData() {
        this.data['groups']['syncdesktop-control'] = {
            'name': `${this._('Desktop Sync')} ${this._bridgeName}`,
            'section': 'static',
            'icon': "HueIcons/roomsMancave.svg",
            'capabilities': []
        };

        this.data['groups']['syncdesktop-mode'] = {
            'name': this._('Mode'),
            'section': 'static',
            'icon': "HueIcons/tabbarAutomation.svg",
            'capabilities': ['text', 'icon']
        };

        this.data['groups']['syncdesktop-entertainment-areas'] = {
            'name': this._('Entertainment areas'),
            'section': 'static',
            'icon': "HueIcons/otherWatchingMovie.svg",
            'capabilities': ['text']
        };

        this.data['devices']['sync-screen'] = {
            'type': 'device',
            'name': this._("Screen"),
            'section': 'static',
            'capabilities': ['switch'],
            'groups': ['syncdesktop-mode'],
            'switch': false,
            'icon': "HueIcons/otherWatchingMovie.svg"
        }

        this._displays = [];
        let n_monitors = global.display.get_n_monitors();
        if (n_monitors > 1) {
            for (let i = 0; i < n_monitors; i++) {
                let geometry = global.display.get_monitor_geometry(i);
                let scale = global.display.get_monitor_scale(i);

                let id = `sync-screen:${i}`;
                this._displays.push(id);
                let width = Math.round(geometry.width * scale);
                let height = Math.round(geometry.height * scale);

                this.data['devices'][id] = {
                    'type': 'device',
                    'name': `${this._("Display")} ${i}: ${width}x${height}`,
                    'section': 'static',
                    'capabilities': ['switch'],
                    'groups': ['syncdesktop-mode'],
                    'switch': false,
                    'icon': "HueIcons/otherWatchingMovie.svg"
                }
            }
        }

        this.data['devices']['sync-music'] = {
            'type': 'device',
            'name': this._("Music"),
            'section': 'static',
            'capabilities': ['switch'],
            'groups': ['syncdesktop-mode'],
            'switch': false,
            'icon': "HueIcons/otherMusic.svg"
        }

        this.data['devices']['sync-cursor'] = {
            'type': 'device',
            'name': this._("Track cursor"),
            'section': 'static',
            'capabilities': ['switch'],
            'groups': ['syncdesktop-mode'],
            'switch': false,
            'icon': "HueIcons/routinesLocation.svg"
        }

        this.data['devices']['brightness'] = {
            'type': 'device',
            'name': this._("Brightness"),
            'section': 'static',
            'capabilities': ['brightness', 'icon'],
            'groups': ['syncdesktop-control'],
            'brightness': this._brightness,
            'icon': "HueIcons/routinesDaytime.svg"
        }

        this.data['devices']['intensity'] = {
            'type': 'device',
            'name': this._("Intensity"),
            'section': 'static',
            'capabilities': ['position', 'icon'],
            'groups': ['syncdesktop-control'],
            'position': this._intensity,
            'icon': "HueSyncbox/intensity-high.svg"
        }
    }

    _updateData(data) {
        let id;
        this._someStreamAcive = false;
        this._activeStream = null;
        let activeEntertainmentName = this._("Entertainment areas");

        this._requestedAreaId = this.miscStorage['streamingID'];

        if (this.miscStorage['brightness'] !== undefined) {
            this._brightness = parseFloat(this.miscStorage['brightness']);
        }

        if (this.miscStorage['intensity'] !== undefined) {
            this._intensity = parseFloat(this.miscStorage['intensity']);
        }

        for (let d of data) {
            if (d['type'] === 'entertainment_configuration') {
                if (d['id'] === this._requestedAreaId) {
                    activeEntertainmentName = d['metadata']['name'];
                }

                if (d['status'] === 'active') {
                    this._someStreamAcive = true;
                    this._activeStream = d['id'];
                }
            }
        }

        this.data['devices']['brightness']['brightness'] = this._brightness;
        this.data['devices']['intensity']['position'] = this._intensity;

        this.data['groups']['syncdesktop-entertainment-areas']['name'] = activeEntertainmentName;
        this.data['groups']['syncdesktop-mode']['name'] = this._('Mode');
        this.data['groups']['syncdesktop-mode']['icon'] = "HueIcons/tabbarAutomation.svg";

        if (this.streamer) {
            switch(this.streamer['name']) {
                case 'sync-screen':
                    if (this._streamParameter !== undefined && this._streamParameter !== null) {
                        this.data['groups']['syncdesktop-mode']['name'] = `${this._('Display')}: ${this._streamParameter}`;
                    } else {
                        this.data['groups']['syncdesktop-mode']['name'] = this._('Screen');
                    }
                    this.data['groups']['syncdesktop-mode']['icon'] = "HueIcons/otherWatchingMovie.svg";
                    break;
                case 'sync-music':
                    this.data['groups']['syncdesktop-mode']['name'] = this._('Music');
                    this.data['groups']['syncdesktop-mode']['icon'] = "HueIcons/otherMusic.svg";
                    break;
                case 'sync-cursor':
                    this.data['groups']['syncdesktop-mode']['name'] = this._('Track cursor');
                    this.data['groups']['syncdesktop-mode']['icon'] = "HueIcons/routinesLocation.svg";
                    break;
            }
        }

        if (this._intensity >= 0.75) {
            this.data['devices']['intensity']['icon'] = "HueSyncbox/intensity-intense.svg";
        } else if (this._intensity >= 0.50) {
            this.data['devices']['intensity']['icon'] = "HueSyncbox/intensity-high.svg";
        } else if (this._intensity >= 0.25) {
            this.data['devices']['intensity']['icon'] = "HueSyncbox/intensity-moderate.svg";
        } else {
            this.data['devices']['intensity']['icon'] = "HueSyncbox/intensity-subtle.svg";
        }

        if (this._brightness >= 0.66) {
            this.data['devices']['brightness']['icon'] = "HueIcons/routinesDaytime.svg";
        } else if (this._brightness >= 0.33) {
            this.data['devices']['brightness']['icon'] = "HueIcons/presetsDimmerDimup.svg";
        } else {
            this.data['devices']['brightness']['icon'] = "HueIcons/presetsDimmerDimdown.svg";
        }
    
        this.data['devices']['sync-screen']['switch'] = false;
        this.data['devices']['sync-music']['switch']  = false;
        this.data['devices']['sync-cursor']['switch']  = false;

        for (let id of this._displays) {
            this.data['devices'][id]['switch'] = false;
        }

        if (this.streamer) {
            if (this._streamParameter !== undefined && this._streamParameter !== null) {
                id = `${this.streamer['name']}:${this._streamParameter}`;
            }   else {
                id = this.streamer['name'];
            }
            this.data['devices'][id]['switch'] = true;
        }
    }

    _handleEventStreamData() {
        for (let update of this._bridge.data) {
            if (update['data'] === undefined) {
                return;
            }

            for (let data of update['data']) {
                let activeStreamerData = data['active_streamer'];
                if (activeStreamerData && data['id'] === this._requestedAreaId) {
                    if (this.streamer) {
                        this.streamer.connectStream();
                        this._bridge.stopEventStreamRequest();
                    }
                }
            }
        }
    }

    _preParseData(data) {
        let id;

        for (let d of data) {
            if (d['type'] === 'entertainment_configuration') {
                id = d['id'];
                this._entertainments[id] = d;
            }
        }
    }

    parseEntertainment(data) {
        let out = {};

        out = {
            'type': 'device',
            'section': 'static',
            'name': data['metadata']['name'],
            'capabilities': ['activate'],
            'groups': ['syncdesktop-entertainment-areas'],
            'icon': "HueIcons/otherWatchingMovie.svg"
        };

        return out;
    }

    disconnectBridgeSignals() {
        while (this._bridgeSignals.length > 0) {
            let signal = this._bridgeSignals.pop();
            this._bridge.disconnect(signal);
        }
    }

    clearInstance() {
        Utils.logDebug(`Philips Hue desktop sync ${this.id} clearing.`);

        this.disconnectBridgeSignals();

        if (this._onStartTimer) {
            GLib.Source.remove(this._onStartTimer);
        };

        if (this.streamer) {
            this.streamer.disconnectStream();
            this.streamer.disconnectSignals();
            this.streamer = null;
            this._bridge.disableStream(this._currentAreaId, true);
        }

        this._bridge.clear();
        this._bridge = null;
    }

    requestData() {
        this._bridge.getEntertainment();
    }

    startStream() {
        if (! this._requestedAreaId) {
            Main.notify(
                "Smart Home",
                this._("Please select entertainment area first.")
            );
        }

        this._currentAreaId = this._requestedAreaId;

        switch (this._featureId) {
            case 'sync-screen':
                this.streamer = new SyncScreen.SyncSceen(
                    this._ip,
                    this._userName,
                    this._clientKey,
                    this._currentAreaId,
                    this._entertainments[this._currentAreaId]['channels'],
                    this._streamParameter
                );
                break;
            case 'sync-music':
                this.streamer = new SyncMusic.SyncMusic(
                    this._ip,
                    this._userName,
                    this._clientKey,
                    this._currentAreaId,
                    this._entertainments[this._currentAreaId]['channels'],
                    this._streamParameter
                );
                break;
            case 'sync-cursor':
                this.streamer = new TrackCursor.TrackCursor(
                    this._ip,
                    this._userName,
                    this._clientKey,
                    this._currentAreaId,
                    this._entertainments[this._currentAreaId]['channels'],
                    this._streamParameter
                );
                break;
            default:
                break;
        }

        if (this.streamer) {
            this._bridge.keepEventStreamRequest();
            this.restartFunction = null;
            this.streamer.setParameters(this._brightness, this._intensity);

            let timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                this._timers = Utils.removeFromArray(this._timers, timerId);
                this._bridge.enableStream(this._currentAreaId);
                return GLib.SOURCE_REMOVE;
            });
            this._timers.push(timerId);
        }
    }

    changeStream(id = null) {
        let current = this.streamer ? this.streamer['name'] : null;
        id = id ? id : current;

        this._featureId = id;

        if (! this._requestedAreaId) {
            Main.notify(
                "Smart Home",
                this._("Please select entertainment area first.")
            );

            return;
        }

        if (this.streamer) {
            if (id) {
                this.restartFunction = this.startStream;
            }
            this._bridge.disableStream(this._currentAreaId);
            this._currentAreaId = null;
        } else if (id) {
            this.startStream();
        }
    }

    switchSingle(id, value) {
        let param = id.split(':');
        this._streamParameter = null;
        if (param[1]) {
            id = param[0];
            this._streamParameter = Number(param[1]);
        }

        if (! value) {
            switch (id) {
                case 'sync-screen':
                case 'sync-music':
                case 'sync-cursor':
                    if (this._currentAreaId) {
                        this._bridge.disableStream(this._currentAreaId);
                        this._currentAreaId = null;
                    }
                    break;
                default:
                    break;
            }
        }

        if (!this.streamer && this._someStreamAcive) {
            Main.notify(
                "Smart Home",
                this._("Some other stream is active. Disable it first.")
            );

            this.requestData();
            return;
        }

        if (value) {
            this.changeStream(id);
        }
    }

    switchGroup = this.switchSingle;

    brightnessSingle(id, value) {
        this._brightness = value;
        this.miscStorage["brightness"] = String(this._brightness);
        this.writeSettingsMiscellaneous(this.miscStorage);
        if (this.streamer) {
            this.streamer.setParameters(this._brightness, this._intensity);
        }

        this._updateData(this._entertainmentData);
        this.dataReady();
    }

    brightnessGroup = this.brightnessSingle;

    positionSingle(id, value) {
        this._intensity = value;
        this.miscStorage["intensity"] = String(this._intensity);
        this.writeSettingsMiscellaneous(this.miscStorage);
        if (this.streamer) {
            this.streamer.setParameters(this._brightness, this._intensity);
        }

        this._updateData(this._entertainmentData);
        this.dataReady();
    }

    positionGroup = this.positionSingle;

    sceneSingle(id, ids) {
        this._requestedAreaId = id;
        this.miscStorage["streamingID"] = String(this._requestedAreaId);
        this.writeSettingsMiscellaneous(this.miscStorage);

        this.changeStream();

        this.requestData();
    }

    sceneGroup = this.sceneSingle;

    _runOnStart() {
        if (!this._onLoginSettings) {
            return;
        }

        if (this._notebookMode && (! Utils.isExternalMonitorOn())) {
            return;
        }

        this._requestedAreaId = this._onLoginSettings['id'];
        if (this._requestedAreaId &&
            this._onLoginSettings['autostart-mode']) {

            if (this._activeStream === String(this._requestedAreaId)) {
                this._bridge.disableStream(this._activeStream);
            }

            this._onStartTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                this._onStartTimer = null;

                this.miscStorage["streamingID"] = String(this._requestedAreaId);
                this.writeSettingsMiscellaneous(this.miscStorage);

                let param = this._onLoginSettings['autostart-mode'].split(':');
                this._streamParameter = null;
                if (param[1]) {
                    this._streamParameter = Number(param[1]);

                    if (! this._displays.includes(this._onLoginSettings['autostart-mode'])) {
                        this._streamParameter = null;
                    }
                }

                this.changeStream(
                    param[0]
                );
                this.requestData();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _runOnShutdown() {
        /* disable streaming */
        if (this._currentAreaId) {
            Utils.logDebug(`Shutting down ${this.id} ${this._currentAreaId}`);
            this._bridge.disableStream(this._currentAreaId, true);
            this._currentAreaId = null;
        }
    }

    onShutdown = this._runOnShutdown;

    /**
     * Remove timers created by GLib.timeout_add
     * 
     * @method clearTimers
     */
    clearTimers() {
        for (let t of this._timers) {
            if (t) {
                GLib.Source.remove(t);
            }
        }

        this._timers = [];
    }
});

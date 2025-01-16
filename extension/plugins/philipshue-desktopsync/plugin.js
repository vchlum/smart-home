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

export const Plugin =  GObject.registerClass({
    GTypeName: "PhilipsHueDesktopSync",
}, class Plugin extends SmartHomePanelMenu.SmartHomePanelMenu {

    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        this.id = id;
        this._connectionTimeout = Utils.PHILIPSHUEBRIDGE_DEFAULT_TIMEOUT;
        super._init(id, pluginName, metadata, mainDir, settings, openPref);

        this._brightness = 0.5;
        this._intensity = 0.5;
    }

    settingRead() {

        if (this._pluginSettings[this.id]['connection-timeout'] !== undefined) {
            this._connectionTimeout = Number(this._pluginSettings[this.id]['connection-timeout']);

            if (this._bridge) {
                this._bridge.setConnectionTimeout(this._connectionTimeout);
            }
        }
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
            }
        );
        this._appendSignal(signal, this._bridge);

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
        this._appendSignal(signal, this._bridge);

        signal = this._bridge.connect(
            'connection-problem',
            () => {
                this.streamer.disconnectStream();
                this.streamer.disconnectSignals();
                this.streamer = null;

                this._updateData(this._entertainmentData);
                this.dataReady();

                this.connectionClosed();
            }
        );
        this._appendSignal(signal, this._bridge);

        signal = this._bridge.connect(
            'event-stream-data',
            this._handleEventStreamData.bind(this)
        );
        this._appendSignal(signal, this._bridge);

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
/*
        this.data['devices']['sync-screen'] = {
            'type': 'device',
            'name': this._("Screen"),
            'section': 'static',
            'capabilities': ['switch'],
            'groups': ['syncdesktop-mode'],
            'switch': false,
            'icon': "HueIcons/otherWatchingMovie.svg"
        }
*/
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
        this._someStreamAcive = false;
        let activeEntertainmentName = this._("Entertainment areas");

        if (this._miscellanousStorage[this.pluginID] !== undefined) {
            this._requestedAreaId = this._miscellanousStorage[this.pluginID]['streamingID'];

            if (this._miscellanousStorage[this.pluginID]['brightness'] !== undefined) {
                this._brightness = parseFloat(this._miscellanousStorage[this.pluginID]['brightness']);
            }

            if (this._miscellanousStorage[this.pluginID]['intensity'] !== undefined) {
                this._intensity = parseFloat(this._miscellanousStorage[this.pluginID]['intensity']);
            }
        }

        for (let d of data) {
            if (d['type'] === 'entertainment_configuration') {
                if (d['id'] === this._requestedAreaId) {
                    activeEntertainmentName = d['metadata']['name'];
                }

                if (d['status'] === 'active') {
                    this._someStreamAcive = true;
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
                    this.data['groups']['syncdesktop-mode']['name'] = this._('Screen');
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
    
        //this.data['devices']['sync-screen']['switch'] = false;
        this.data['devices']['sync-music']['switch']  = false;
        this.data['devices']['sync-cursor']['switch']  = false;

        if (this.streamer) {
            this.data['devices'][this.streamer['name']]['switch'] = true;
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

    clearInstance() {
        Utils.logDebug(`Philips Hue desktop sync ${this.id} clearing.`);

        if (this.streamer) {
            this.streamer.disconnectStream();
            this.streamer.disconnectSignals();
            this.streamer = null;
            this._bridge.disableStream(this._currentAreaId);
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
                break;
            case 'sync-music':
                this.streamer = new SyncMusic.SyncMusic(
                    this._ip,
                    this._userName,
                    this._clientKey,
                    this._currentAreaId,
                    this._entertainments[this._currentAreaId]['channels']
                );
                break;
            case 'sync-cursor':
                this.streamer = new TrackCursor.TrackCursor(
                    this._ip,
                    this._userName,
                    this._clientKey,
                    this._currentAreaId,
                    this._entertainments[this._currentAreaId]['channels']
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
        if (this._miscellanousStorage[this.pluginID] === undefined) {
            this._miscellanousStorage[this.pluginID] = {}
        }
        this._miscellanousStorage[this.pluginID]["brightness"] = String(this._brightness);
        this.writeSettingsMiscellaneous();
        if (this.streamer) {
            this.streamer.setParameters(this._brightness, this._intensity);
        }

        this._updateData(this._entertainmentData);
        this.dataReady();
    }

    brightnessGroup = this.brightnessSingle;

    positionSingle(id, value) {
        this._intensity = value;
        if (this._miscellanousStorage[this.pluginID] === undefined) {
            this._miscellanousStorage[this.pluginID] = {}
        }
        this._miscellanousStorage[this.pluginID]["intensity"] = String(this._intensity);
        this.writeSettingsMiscellaneous();
        if (this.streamer) {
            this.streamer.setParameters(this._brightness, this._intensity);
        }

        this._updateData(this._entertainmentData);
        this.dataReady();
    }

    positionGroup = this.positionSingle;

    sceneSingle(id, ids) {
        this._requestedAreaId = id;
        if (this._miscellanousStorage[this.pluginID] === undefined) {
            this._miscellanousStorage[this.pluginID] = {}
        }
        this._miscellanousStorage[this.pluginID]["streamingID"] = String(this._requestedAreaId);
        this.writeSettingsMiscellaneous();

        this.changeStream();

        this.requestData();
    }

    sceneGroup = this.sceneSingle;

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

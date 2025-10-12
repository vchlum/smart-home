'use strict';

/**
 * extension smart-home
 * JavaScript Home Assistant.
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
import * as Utils from '../../utils.js';
import * as SmartHomePanelMenu from '../../smarthome-panelmenu.js';
import * as Api from './api.js';

export const Plugin =  GObject.registerClass({
    GTypeName: 'SmartHomeHomeAssistant',
}, class Plugin extends SmartHomePanelMenu.SmartHomePanelMenu {

    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        this.id = id;
        this._bridgeSignals = [];
        this._offShutdown = false;
        super._init(id, pluginName, metadata, mainDir, settings, openPref);
        this._connectionTimeout = Utils.HOMEASSISTANT_DEFAULT_TIMEOUT;
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

        if (this._pluginSettings[this.id]['off-shutdown'] !== undefined) {
            this._offShutdown = this._pluginSettings[this.id]['off-shutdown'] === 'true';
        }
    }

    preparePlugin() {
        let signal;

        this.data = {'devices': {}, 'groups': {}};

        this._bridge = new Api.HomeAssistantBridge({
            ip: this._pluginSettings[this.id]['ip'],
            port: this._pluginSettings[this.id]['port'],
            token: this._pluginSettings[this.id]['accessToken']
        });

        this._bridge.setConnectionTimeout(this._connectionTimeout);

        signal = this._bridge.connect(
            'states',
            () => {
                this._preparseStates(this._bridge.data);
                this._bridge.authWebSocket();
                this._bridge.getAreas();
                
                if (this._areas && this._states) {
                    this._parseData();
                    this.dataReady();
                }
            }
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'areas',
            () => {
                this._areas = this._bridge.data;

                if (this._areas && this._states) {
                    this._parseData();
                    this.dataReady();
                }
            }
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'ws-authenticated',
            this._handleWsData.bind(this)
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'ws-data',
            this._handleWsData.bind(this)
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'connection-problem',
            () => {
                this.connectionClosed();
            }
        );
        this._bridgeSignals.push(signal);

        this._runOnStart();

        Utils.logDebug(`Home Assistant ${this.id} ready.`);
    }

    disconnectBridgeSignals() {
        while (this._bridgeSignals.length > 0) {
            let signal = this._bridgeSignals.pop();
            this._bridge.disconnect(signal);
        }
    }

    clearInstance() {
        Utils.logDebug(`Home Assistant ${this.id} clearing.`);

        this.disconnectBridgeSignals();

        if (this._onStartTimer) {
            GLib.Source.remove(this._onStartTimer);
        };

        this._bridge.clear();
        this._bridge = null;
    }

    _preparseStates(data) {
        let id;
        this._states = {'lights': {},  'switches': {}, 'covers': {}, 'scenes': {}};

        for (let item of data) {
            id = item['entity_id'];

            if (id.startsWith('light')) {
                this._states['lights'][id] = item;
            }

            if (id.startsWith('switch')) {
                this._states['switches'][id] = item;
            }

            if (id.startsWith('cover')) {
                this._states['covers'][id] = item;
            }

            if (id.startsWith('scene')) {
                this._states['scenes'][id] = item;
            }
        }
    }

    _getDeviceGroups(id) {
        let groups = [];
        for (let groupId in this._areas) {
            if (this._areas[groupId]['entities'].includes(id)) {
                groups.push(groupId);
            }
        }
        if (groups.length === 0) {
            groups.push('_all_');
        }
        return groups;
    }

    _parseData() {
        this.data = {'config': {}, 'devices': {}, 'groups': {}};
        this.data['config'] = {
            '_all_': {'name': this._("All rooms")},
        };

        for (let id in this._areas) {
            this.data['groups'][id] = {
                'type': 'group',
                'section': 'common',
                'name': this._areas[id]['name'],
                'services': []
            };
        }

        if (this._states['lights']) {
            for (let id in this._states['lights']) {
                this.data['devices'][id] = this._parseLight(this._states['lights'][id]);
                this.data['devices'][id]['groups'] = this._getDeviceGroups(id);
            }
        }

        if (this._states['switches']) {
            for (let id in this._states['switches']) {
                this.data['devices'][id] = this._parseSwitch(this._states['switches'][id]);
                this.data['devices'][id]['groups'] = this._getDeviceGroups(id);
            }
        }

        if (this._states['covers']) {
            for (let id in this._states['covers']) {
                this.data['devices'][id] = this._parseCover(this._states['covers'][id]);
                this.data['devices'][id]['groups'] = this._getDeviceGroups(id);
            }
        }

        if (this._states['scenes']) {
            for (let id in this._states['scenes']) {
                this.data['devices'][id] = this._parseScene(this._states['scenes'][id]);
                this.data['devices'][id]['associated'] = this._getDeviceGroups(id);
            }
        }
    }

    _parseEvent(data) {
        let event = data['event']['data'];
        let id = event['entity_id'];

        if (! id) {
            return;
        }

        if (id.startsWith('light')) {
            if ((!this.data['devices']) || (!this.data['devices'][id])) {
                return;
            }

            this.data['devices'][id]['switch'] = event['new_state']['state'] === 'on' ? true: false;

            if (event['new_state']['attributes']['brightness']) {
                this.data['devices'][id]['brightness'] = event['new_state']['attributes']['brightness'] / 255;
            }

            let color = this._getColor(event['new_state']);

            if (color) {
                this.data['devices'][id]['color_mode'] = color.color_mode;

                switch (color.color_mode) {
                    case 'color':
                        this.data['devices'][id]['color'] = color;
                        break;
                    case 'temperature':
                        this.data['devices'][id]['color_temperature'] = color;
                        break;
                }
            }
        }

        if (id.startsWith('switch')) {
            if ((!this.data['devices']) || (!this.data['devices'][id])) {
                return;
            }

            this.data['devices'][id]['switch'] = event['new_state']['state'] === 'on' ? true: false;
        }

        if (id.startsWith('cover')) {
            if ((!this.data['devices']) || (!this.data['devices'][id])) {
                return;
            }

            this.data['devices'][id]['position'] = 1 - event['new_state']['attributes']['current_position'] / 100;
        }
    }

    _handleWsData() {
        let data = this._bridge.data;

        if (data['type'] === 'auth_ok') {
            return;
        }

        if (data['type'] === 'event') {
            this._parseEvent(data);
            if (this._areas && this._states) {
                this.dataReady();
            }
        }
    }

    _getColor(data) {
        let mode;

        if ((! data['attributes']['color_mode']) || (! data['attributes']['rgb_color'])) {
            return null;
        }

        if (data['attributes']['color_mode'] === 'color_temp') {
            mode = 'temperature';
        } else {
            mode = 'color';
        }

        return {
            'color_mode': mode,
            'red': data['attributes']['rgb_color'][0],
            'green': data['attributes']['rgb_color'][1],
            'blue': data['attributes']['rgb_color'][2]
        };
    }

    _parseLight(data) {
        let out = {};

        out['groups'] = [];
        out['type'] = 'device';
        out['name'] = data['attributes']['friendly_name'];
        out['section'] = 'common';
        out['capabilities'] = [];
        out['ha_type'] = 'light';

        out['capabilities'].push('switch');
        out['switch'] = data['state'] === 'on' ? true: false;

        if (data['attributes']['brightness'] !== undefined) {
            out['capabilities'].push('brightness');
            out['brightness'] = data['attributes']['brightness'] / 255;
        }

        if (data['attributes']['supported_color_modes'].includes('color_temp')) {
            out['capabilities'].push('color_temperature');
        }

        if (data['attributes']['color_temp_kelvin'] !== undefined) {
            out['ct_min'] = data['attributes']['min_color_temp_kelvin'];
            out['ct_max'] = data['attributes']['max_color_temp_kelvin'];
        }

        if (data['attributes']['supported_color_modes'].includes('xy') ||
            data['attributes']['supported_color_modes'].includes('hs') ||
            data['attributes']['supported_color_modes'].includes('rgb') ||
            data['attributes']['supported_color_modes'].includes('rgbw') ||
            data['attributes']['supported_color_modes'].includes('rgbww')) {
            out['capabilities'].push('color');
        }

        let color = this._getColor(data);

        if (color) {
            out['color_mode'] = color.color_mode;

            switch (color.color_mode) {
                case 'color':
                    out['color'] = color;
                    break;
                case 'temperature':
                    out['color_temperature'] = color;
                    break;
            }
        }

        return out;
    }

    _parseSwitch(data) {
        let out = {};

        out['groups'] = [];
        out['type'] = 'device';
        out['name'] = data['attributes']['friendly_name'];
        out['section'] = 'common';
        out['capabilities'] = [];
        out['ha_type'] = 'switch';

        out['capabilities'].push('switch');
        out['switch'] = data['state'] === 'on' ? true: false;

        return out;
    }

    _parseCover(data) {
        let out = {};

        out['type'] = 'device';
        out['name'] = data['attributes']['friendly_name'];
        out['section'] = 'common';
        out['icon'] = 'blinds.svg';
        out['capabilities'] = ['position', 'up/down'];
        out['ha_type'] = 'cover';

        out['position'] =  1 - data['attributes']['current_position'] / 100;

        return out;
    }

    _parseScene(data) {
        let out = {};

        out['type'] = 'scene';
        out['section'] = 'group';
        out['name'] = data['attributes']['friendly_name'];
        out['capabilities'] = ['activate'];
        out['associated'] = [];
        out['ha_type'] = 'scene';

        return out;
    }

    requestData() {
        this._bridge.getStates();
    }

    checkHATypeExists(ids, hatype) {
        for (let id of ids) {
            if (this.data['devices'][id]['ha_type'] === hatype) {
                return true;
            }
        }
        return false;
    }

    positionSingle(id, value) {
        this._bridge.setService(
            'cover',
            'set_cover_position',
            {
                'entity_id': id,
                'position': Math.round((1 - value)  * 100)
            }
        );
    }

    positionGroup(id, ids, value) {
        let data = {
            'position': Math.round((1 - value)  * 100)
        };

        id === '_all_' ? data['entity_id'] = 'all' : data['area_id'] = id;

        this._bridge.setService(
            'cover',
            'set_cover_position',
            data
        );
    }

    upSingle(id) {
        this._bridge.setService(
            'cover',
            'open_cover',
            { 'entity_id': id }
        );
    }

    upGroup(id, ids) {
        this._bridge.setService(
            'cover',
            'open_cover',
            id === '_all_' ? { 'entity_id': 'all' } : { 'area_id': id }
        );
    }

    downSingle(id) {
        this._bridge.setService(
            'cover',
            'close_cover',
            { 'entity_id': id }
        );
    }

    downGroup(id, ids) {
        this._bridge.setService(
            'cover',
            'close_cover',
            id === '_all_' ? { 'entity_id': 'all' } : { 'area_id': id }
        );
    }

    switchSingle(id, value) {
        let fce = value ? this._bridge.setServiceOn.bind(this._bridge) : this._bridge.setServiceOff.bind(this._bridge);
        fce(
            this.data['devices'][id]['ha_type'],
            { 'entity_id': id }
        );
    }

    switchGroup(id, ids, value) {
        let fce = value ? this._bridge.setServiceOn.bind(this._bridge) : this._bridge.setServiceOff.bind(this._bridge);

        if (this.checkHATypeExists(ids, 'light')) {
            fce(
                'light',
                id === '_all_' ? { 'entity_id': 'all' } : { 'area_id': id }
            );
        }

        if (this.checkHATypeExists(ids, 'switch')) {
            fce(
                'switch',
                id === '_all_' ? { 'entity_id': 'all' } : { 'area_id': id }
            );
        }
    }

    brightnessSingle(id, value) {
        this._bridge.setServiceOn(
            'light',
            {
                'entity_id': id,
                'brightness': value * 255
            }
        );
    }

    brightnessGroup(id, ids, value) {
        let fce = value ? this._bridge.setServiceOn.bind(this._bridge) : this._bridge.setServiceOff.bind(this._bridge);
        let data = {
            'brightness': value * 255
        };

        id === '_all_' ? data['entity_id'] = 'all' : data['area_id'] = id;

        fce('light', data );
    }

    colorSingle(id, value) {
        this._bridge.setServiceOn(
            'light',
            {
                'entity_id': id,
                'rgb_color': [value['r'], value['g'], value['b']]
            }
        );
    }

    colorGroup(id, ids, value) {
        let data = {
            'rgb_color': [value['r'], value['g'], value['b']]
        };

        id === '_all_' ? data['entity_id'] = 'all' : data['area_id'] = id;

        this._bridge.setServiceOn('light', data);
    }

    colorTemperatureSingle(id, value) {
        let temp = Utils.RGBToKelvin(
            value['r'],
            value['g'],
            value['b'],
            this.data['devices'][id]['ct_min'],
            this.data['devices'][id]['ct_max']
        );

        this._bridge.setServiceOn(
            'light',
            {
                'entity_id': id,
                'color_temp': Math.round(1000000 / temp) //convert to mireds
            }
        );
    }

    colorTemperatureGroup(id, ids, value) {
        let temp = Utils.RGBToKelvin(
            value['r'],
            value['g'],
            value['b']
        );

        let data = {
            'color_temp': Math.round(1000000 / temp) //convert to mireds
        };

        id === '_all_' ? data['entity_id'] = 'all' : data['area_id'] = id;

        this._bridge.setServiceOn('light', data);
    }

    sceneSingle(id, ids) {
        this._bridge.setService(
            'scene',
            'turn_on',
            { 'entity_id': id }
        );
    }

    sceneGroup = this.sceneSingle

    _runOnStartDevice(id, device) {
        return new Promise((resolve, reject) => {
            let data;
            let c;
            switch (device['type']) {
                case 'light':
                    data = {'entity_id': id};
                    if (device['brightness']) {
                        data['brightness'] = Math.round((device['brightness'] / 100) * 255);
                    }

                    c = device['color'];
                    if (c && (c['red'] > 0 || c['green'] > 0 || c['blue'] > 0)) {
                        data['rgb_color'] =  [
                            c['red'],
                            c['green'],
                            c['blue']
                        ];
                    }

                    this._bridge.setServiceOn(
                        'light',
                        data
                    );

                    break;

                case 'scene':
                    this.sceneSingle(id);
                    break;

                default:
                    resolve();
                    return;
            }
            this._onStartTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                resolve();
                this._onStartTimer = null;
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    async _runOnStart() {
        for (let id in this._onLoginSettings) {
            let device = this._onLoginSettings[id];
            if (device['switch']) {
                await this._runOnStartDevice(id, device);
            }
        }
    }

    _runOnShutdown() {
        if (! this._offShutdown) {
            return;
        }

        let data;
        for (let id in this._onLoginSettings) {
            let device = this._onLoginSettings[id];
            if (device['switch']) {
                switch (device['type']) {
                    case 'light':
                        data = {'entity_id': id};
                        this._bridge.setServiceOff('light', data, false, true);
                        break;
                    case 'scene':
                    default:
                        break;
                }
            }
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

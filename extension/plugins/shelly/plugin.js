'use strict';

/**
 * extension smart-home
 * JavaScript Shelly.
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
import * as Utils from '../../utils.js';
import * as SmartHomePanelMenu from '../../smarthome-panelmenu.js';
import * as Api from './api.js';

/**
 * Smart Home class for controlling Shelly devices.
 *
 * @class Plugin
 * @constructor
 * @return {Object} instance
 */
export const Plugin =  GObject.registerClass({
    GTypeName: 'SmartHomeShelly',
}, class Plugin extends SmartHomePanelMenu.SmartHomePanelMenu {

    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        this.id = id;
        this._devices = {};
        this._connectionTimeout = {};
        super._init(id, pluginName, metadata, mainDir, settings, openPref);
    }

    settingRead(needsRebuild) {
        this._connectionTimeout = {};
        for (let id in this._pluginSettings) {
            if (id === '_general_') {
                continue;
            }

            this._connectionTimeout[id] = Number(this._pluginSettings[id]['connection-timeout']);
            if (this._devices[id]) {
                this._devices[id].setConnectionTimeout(this._connectionTimeout[id]);
            }

            if (!this._pluginSettings[id]) {
                return; //device is being removed
            }
        }

        if (needsRebuild) {
            this.clearInstance();
            this.preparePlugin();
        }
    }

    preparePlugin() {
        this._devices = {};
        this._deviceInMenu = {};

        this._brightnessDuration = 1

        this._initialized = {};
        this._dataStatus = {};

        this.data = {'config': {}, 'devices': {}, 'groups': {}};
        this.data['config'] = {'_all_': {'name': this._("All rooms")}};

        this._updateDevices();

        Utils.logDebug(`Shelly ready.`);
    }

    clearInstance() {
        Utils.logDebug(`Shelly clearing.`);

        for (let id in this._devices) {
            this._devices[id].clear();
            this._devices[id] = null;
        }
    }

    _createShellyDevice(name) {
        let device = {
            'type': 'device',
            'name': name,
            'section': 'common',
            'capabilities': [],
            'groups': [],
            'shelly_type': []
        };

        return device;
    }

    _parseGen1Light(id, subId, data) {
        let name = this._pluginSettings[id]['name'];
        if (data['lights'].length > 1) {
            name = `${name} ${subId}`;
        }

        let device = this._createShellyDevice(name);
        device['shelly_type'].push('light');

        if (data['lights'][subId]['ison'] !== undefined) {
            device['capabilities'].push('switch');
            device['switch'] = data['lights'][subId]['ison'];
        }

        if (data['lights'][subId]['brightness'] !== undefined) {
            device['capabilities'].push('brightness');
            device['brightness'] = data['lights'][subId]['brightness'] / 100;
        }

        if (data['lights'][subId]['temp'] !== undefined) {
            device['capabilities'].push('color_temperature');
            device['color_mode'] = 'temperature';

            let color = Utils.kelvinToRGB(
                data['lights'][subId]['temp']
            );

            device['color_temperature']  = {
                'red': color[0],
                'green': color[1],
                'blue': color[2]
            }
        }

        if (data['lights'][subId]['mode'] === 'color') {
            device['color_mode'] = 'color';
        }

        if (data['lights'][subId]['red'] !== undefined &&
            data['lights'][subId]['green'] !== undefined &&
            data['lights'][subId]['blue'] !== undefined) {

            device['capabilities'].push('color');
            device['color']  = {
                'red': data['lights'][subId]['red'],
                'green': data['lights'][subId]['green'],
                'blue': data['lights'][subId]['blue']
            }
        }

        return device;
    }

    _parseGen1Relay(id, subId, data) {
        let name = this._pluginSettings[id]['name'];
        if (data['relays'].length > 1) {
            name = `${name} ${subId}`;
        }

        let device = this._createShellyDevice(name);
        device['shelly_type'].push('relay');

        if (data['relays'][subId]['ison'] !== undefined) {
            device['capabilities'].push('switch');
            device['switch'] = data['relays'][subId]['ison'];
        }

        return device;
    }

    _parseGen1Rollers(id, subId, data) {
        let name = this._pluginSettings[id]['name'];
        if (data['rollers'].length > 1) {
            name = `${name} ${subId}`;
        }

        let device = this._createShellyDevice(name);
        device['shelly_type'].push('roller');

        if (data['rollers'][subId]['current_pos'] !== undefined) {
            device['capabilities'] = ['position', 'up/down'];
            device['position'] = data['rollers'][subId]['current_pos'] / 100;
        }

        return device;
    }

    _parseGen1(id, data) {
        let devices = {};
        let keys = Object.keys(data);

        if (keys.includes('lights')) {
            for (let subId in data['lights']) {
                devices[subId] = this._parseGen1Light(id, subId, data);
            }
        }

        if (keys.includes('relays')) {
            for (let subId in data['relays']) {
                devices[subId] = this._parseGen1Relay(id, subId, data);
            }
        }

        if (keys.includes('rollers')) {
            for (let subId in data['rollers']) {
                devices[subId] = this._parseGen1Rollers(id, subId, data);
            }
        }

        return devices;
    }

    _parseGen23(id, data) {
        let devices = {};

        if (data['result'] === undefined) {
            return devices;
        }

        let keys = Object.keys(data['result']);

        let keyCounter = {};
        for (let key of keys) {
            let k = key.split(':')[0].toLowerCase();
            if (keyCounter[k]) {
                keyCounter[k]++;
            } else {
                keyCounter[k] = 1;
            }
        }

        for (let key of keys) {
            let k = key.split(':')[0].toLowerCase();

            if (key.toLowerCase().startsWith('switch:')) {
                let subId = Number(key.split(':')[1]);
                let d = data['result'][key];

                if (devices[subId] === undefined) {
                    devices[subId] = this._createShellyDevice(
                        keyCounter[k] > 1 ?
                        `${this._pluginSettings[id]['name']} ${subId}` :
                        this._pluginSettings[id]['name']
                    );
                }

                if (d['output'] !== undefined) {
                    devices[subId]['capabilities'].push('switch');
                    devices[subId]['switch'] = d['output'];
                }

                devices[subId]['shelly_type'].push('switch');
            }

            if (key.toLowerCase().startsWith('light:')) {
                let subId = Number(key.split(':')[1]);
                let d = data['result'][key];

                if (devices[subId] === undefined) {
                    devices[subId] = this._createShellyDevice(
                        keyCounter[k] > 1 ?
                        `${this._pluginSettings[id]['name']} ${subId}` :
                        this._pluginSettings[id]['name']
                    );
                }

                if (d['output'] !== undefined) {
                    devices[subId]['capabilities'].push('switch');
                    devices[subId]['switch'] = d['output'];
                }

                if (d['brightness'] !== undefined) {
                    devices[subId]['capabilities'].push('brightness');
                    devices[subId]['brightness'] = d['brightness'] / 100;
                }

                devices[subId]['shelly_type'].push('light');
            }

            if (key.toLowerCase().startsWith('rgb:')) {
                let subId = Number(key.split(':')[1]);
                let d = data['result'][key];

                if (devices[subId] === undefined) {
                    devices[subId] = this._createShellyDevice(
                        keyCounter[k] > 1 ?
                        `${this._pluginSettings[id]['name']} ${subId}` :
                        this._pluginSettings[id]['name']
                    );
                }

                if (d['output'] !== undefined) {
                    devices[subId]['capabilities'].push('switch');
                    devices[subId]['switch'] = d['output'];
                    if (d['output']) {
                        devices[subId]['color_mode'] = 'color';
                    }
                }

                if (d['rgb'] !== undefined) {
                    devices[subId]['capabilities'].push('color');
                    devices[subId]['color']  = {
                        'red': d['rgb'][0],
                        'green': d['rgb'][1],
                        'blue': d['rgb'][2]
                    }
                }

                devices[subId]['shelly_type'].push('rgb');
            }

            if (key.toLowerCase().startsWith('rgbw:')) {
                let subId = Number(key.split(':')[1]);
                let d = data['result'][key];

                if (devices[subId] === undefined) {
                    devices[subId] = this._createShellyDevice(
                        keyCounter[k] > 1 ?
                        `${this._pluginSettings[id]['name']} ${subId}` :
                        this._pluginSettings[id]['name']
                    );
                }

                if (d['output'] !== undefined) {
                    devices[subId]['capabilities'].push('switch');
                    devices[subId]['switch'] = d['output'];
                    if (d['output']) {
                        devices[subId]['color_mode'] = 'color';
                    }
                }

                if (d['rgb'] !== undefined) {
                    devices[subId]['capabilities'].push('color');
                    devices[subId]['capabilities'].push('color_temperature');
                    devices[subId]['color']  = {
                        'red': d['rgb'][0],
                        'green': d['rgb'][1],
                        'blue': d['rgb'][2]
                    }
                    devices[subId]['color_temperature'] = devices[subId]['color'];
                }

                devices[subId]['shelly_type'].push('rgbw');
            }

            if (key.toLowerCase().startsWith('cover:')) {
                let subId = Number(key.split(':')[1]);
                let d = data['result'][key];

                if (devices[subId] === undefined) {
                    devices[subId] = this._createShellyDevice(
                        keyCounter[k] > 1 ?
                        `${this._pluginSettings[id]['name']} ${subId}` :
                        this._pluginSettings[id]['name']
                    );
                }

                if (d['current_pos'] !== undefined) {
                    devices[subId]['capabilities'].push('position');
                    devices[subId]['capabilities'].push('up/down');
                    devices[subId]['position'] = d['current_pos'];
                }

                devices[subId]['shelly_type'].push('cover');
            }
        }

        return devices;
    }

    _parseData(id, data) {
        let group = this._pluginSettings[id]['group'];

        if (this.data['groups'][group] === undefined) {
            this.data['groups'][group] = {
                'type': 'group',
                'section': 'common',
                'name': group,
            }
        }

        let devices;
        if (this._devices[id].gen < 2) {
            devices = this._parseGen1(id, data);
        } else {
            devices = this._parseGen23(id, data);
        }


        for (let d in devices) {
            devices[d]['groups'].push(group);
            this.data['devices'][`${id}::${d}`] = devices[d];
        }


        return;
    }

    _checkDeviceDataObtained(id) {
        if (! this._dataStatus[id]) {
            return false;
        }

        return true;
    }

    _deviceDataObtained(id) {
        this._parseData(id, this._dataStatus[id])

        if (this._initialized[id]) {
            this.dataReady();
        } else {
            this._initialized[id] = true;
            this.rebuildMenuDo();
        }
    }

    _updateDevices() {
        let signal;

        for (let id in this._pluginSettings) {
            if (id === '_general_') {
                continue;
            }

            if (this._devices[id] === undefined) {
                this._initialized[id] = false;

                this._devices[id] = new Api.ShellyDevice({
                    id: id,
                    ip: this._pluginSettings[id]['ip'],
                    username: this._pluginSettings[id]['username'],
                    password: this._pluginSettings[id]['password'],
                    gen: Number(this._pluginSettings[id]['gen']),
                });

                if (this._connectionTimeout[id] !== undefined) {
                    this._devices[id].setConnectionTimeout(this._connectionTimeout[id]);
                }

                signal = this._devices[id].connect(
                    'status',
                    () => {
                        this._dataStatus[id] = this._devices[id].data;

                        if (! this._checkDeviceDataObtained(id))  {
                            return;
                        }
                        this._deviceDataObtained(id);
                    }
                );
                this._appendSignal(signal, this._devices[id]);

                signal = this._devices[id].connect(
                    'change-occurred',
                    () => {
                        this._devices[id].getStatus();
                    }
                );
                this._appendSignal(signal, this._devices[id]);

                signal = this._devices[id].connect(
                    'connection-problem',
                    () => {
                        let allDown = true;
                        this._initialized[id] = false;
                        for (let i in this._initialized) {
                            if (this._initialized[i]) {
                                allDown = false;
                            }
                        }

                        if (allDown) {
                            this.connectionClosed();
                        }
                    }
                );
                this._appendSignal(signal, this._devices[id]);
            }

            this._devices[id].getStatus();
        }
    }

    requestData() {
        this._updateDevices();
    }

    getOnDevices(ids) {
        let onDevices = [];
        for (let id of ids) {

            if (! this._initialized[id.split('::')[0]]) {
                continue;
            }

            if (this.data['devices'][id] &&
                this.data['devices'][id]['switch']) {

                onDevices.push(id);
            }
        }

        return onDevices;
    }

    switchSingle(id, value) {
        let data;
        let types = this.data['devices'][id]['shelly_type'];
        let mainId = id.split('::')[0];
        let subId = Number(id.split('::')[1]);

        if (this._devices[mainId].gen < 2) {
            if (types.includes('light')) {
                data = `light/${subId}?turn=${value ? "on" : "off"}`;
            }

            if (types.includes('relay')) {
                data = `relay/${subId}?turn=${value ? "on" : "off"}`;
            }
            this._devices[mainId].setState(data);
        } else {
            data = {
                "id": 1,
                "params": {
                    "id": subId,
                    "on": value
                 }
            };

            if (types.includes('switch')) {
                data['method'] = "Switch.Set";
            }

            if (types.includes('light')) {
                data["method"] = "Light.Set";
            }

            if (types.includes('rgb')) {
                data["method"] = "RGB.Set";
            }

            if (types.includes('rgbw')) {
                data["method"] = "RGBW.Set";
            }

            if (data['method']) {
                this._devices[mainId].setState(data);
            }
        }
    }

    switchGroup(id, ids, value) {
        for (let i of ids) {
            this.switchSingle(i, value);
        }
    }

    brightnessSingle(id, value) {
        let data = null;
        let brightness = Math.round(value * 100);
        let types = this.data['devices'][id]['shelly_type'];
        let mainId = id.split('::')[0];
        let subId = Number(id.split('::')[1]);

        if (this._devices[mainId].gen < 2) {
            if (types.includes('light')) {
                data = `light/${subId}?turn=on&brightness=${brightness}`;
            }

            if (types.includes('relay')) {
                data = `relay/${subId}?turn=on&brightness=${brightness}`;
            }

            if (data) {
                this._devices[mainId].setState(data);
            }
        } else {
            data = {
                "id": 1,
                "params": {
                    "id": subId,
                    "on": true,
                    "brightness": brightness
                 }
            };

            if (types.includes('switch')) {
                data['method'] = "Switch.Set";
            }

            if (types.includes('light')) {
                data["method"] = "Light.Set";
            }

            if (types.includes('rgb')) {
                data["method"] = "RGB.Set";
            }

            if (types.includes('rgbw')) {
                data["method"] = "RGBW.Set";
            }

            if (data['method']) {
                this._devices[mainId].setState(data);
            }
        }
    }

    brightnessGroup(id, ids, value) {
        let onDevices = this.getOnDevices(ids);

        for (let i of ids) {
            if (onDevices.length > 0 && (! onDevices.includes(i))) {
                continue;
            }

            this.brightnessSingle(i, value);
        }
    }

    colorSingle(id, value) {
        let data = null;
        let types = this.data['devices'][id]['shelly_type'];
        let mainId = id.split('::')[0];
        let subId = Number(id.split('::')[1]);

        if (this._devices[mainId].gen < 2) {
            if (types.includes('light')) {
                data = `light/${subId}?turn=on&red=${value['r']}&green=${value['g']}&blue=${value['b']}`;
            }

            if (data) {
                this._devices[mainId].setState(data);
            }
        } else {
            data = {
                "id": 1,
                "params": {
                    "id": subId,
                    "on": true,
                    "rgb": [value['r'], value['g'], value['b']]
                 }
            };

            if (types.includes('light')) {
                data["method"] = "Light.Set";
            }

            if (types.includes('rgb')) {
                data["method"] = "RGB.Set";
            }

            if (types.includes('rgbw')) {
                data["method"] = "RGBW.Set";
            }

            if (data['method']) {
                this._devices[mainId].setState(data);
            }
        }
    }

    colorGroup(id, ids, value) {
        let onDevices = this.getOnDevices(ids);

        for (let i of ids) {
            if (onDevices.length > 0 && (! onDevices.includes(i))) {
                continue;
            }

            this.colorSingle(i, value);
        }
    }

    colorTemperatureSingle(id, value) {

        let temp = Utils.RGBToKelvin(
            value['r'],
            value['g'],
            value['b'],
            6500,
            2700
        );

        let data = null;
        let types = this.data['devices'][id]['shelly_type'];
        let mainId = id.split('::')[0];
        let subId = Number(id.split('::')[1]);

        if (this._devices[mainId].gen < 2) {
            if (types.includes('light')) {
                data = `light/${subId}?turn=on&temp=${temp}`;
            }

            if (data) {
                this._devices[mainId].setState(data);
            }
        } else {
            data = {
                "id": 1,
                "params": {
                    "id": subId,
                    "on": true,
                    "rgb": [value['r'], value['g'], value['b']]
                 }
            };

            if (types.includes('light')) {
                data["method"] = "Light.Set";
            }

            if (types.includes('rgb')) {
                data["method"] = "RGB.Set";
            }

            if (types.includes('rgbw')) {
                data["method"] = "RGBW.Set";
            }

            if (data['method']) {
                this._devices[mainId].setState(data);
            }
        }
    }

    colorTemperatureGroup(id, ids, value) {
        let onDevices = this.getOnDevices(ids);

        for (let i of ids) {
            if (onDevices.length > 0 && (! onDevices.includes(i))) {
                continue;
            }

            this.colorTemperatureSingle(i, value);
        }
    }

    positionSingle(id, value) {
        let data = null;
        let types = this.data['devices'][id]['shelly_type'];
        let mainId = id.split('::')[0];
        let subId = Number(id.split('::')[1]);
        value = Math.round(value * 100);

        if (this._devices[mainId].gen < 2) {
            if (types.includes('roller')) {
                data = `roller/${subId}?go=to_pos&roller_pos=${value}`;
            }

            if (data) {
                this._devices[mainId].setState(data);
            }
        } else {
            data = {
                "id": 1,
                "params": {
                    "id": subId,
                    "pos": value
                 }
            };

            if (types.includes('cover')) {
                data["method"] = "Cover.GoToPosition";
            }

            if (data['method']) {
                this._devices[mainId].setState(data);
            }
        }
    }

    positionGroup(id, ids, value) {
        for (let i of ids) {
            this.positionSingle(i, value);
        }
    }

    upSingle(id) {
        let data = null;
        let types = this.data['devices'][id]['shelly_type'];
        let mainId = id.split('::')[0];
        let subId = Number(id.split('::')[1]);

        if (this._devices[mainId].gen < 2) {
            if (types.includes('roller')) {
                data = `roller/${subId}?go=open`;
            }

            if (data) {
                this._devices[mainId].setState(data);
            }
        } else {
            data = {
                "id": 1,
                "params": {
                    "id": subId
                 }
            };

            if (types.includes('cover')) {
                data["method"] = "Cover.Open";
            }

            if (data['method']) {
                this._devices[mainId].setState(data);
            }
        }
    }

    upGroup(id, ids) {
        for (let i of ids) {
            this.upGroup(i);
        }
    }

    downSingle(id) {
        let data = null;
        let types = this.data['devices'][id]['shelly_type'];
        let mainId = id.split('::')[0];
        let subId = Number(id.split('::')[1]);

        if (this._devices[mainId].gen < 2) {
            if (types.includes('roller')) {
                data = `roller/${subId}?go=close`;
            }

            if (data) {
                this._devices[mainId].setState(data);
            }
        } else {
            data = {
                "id": 1,
                "params": {
                    "id": subId
                 }
            };

            if (types.includes('cover')) {
                data["method"] = "Cover.Close";
            }

            if (data['method']) {
                this._devices[mainId].setState(data);
            }
        }
    }

    downGroup(id, ids) {
        for (let i of ids) {
            this.downSingle(i);
        }
    }
});

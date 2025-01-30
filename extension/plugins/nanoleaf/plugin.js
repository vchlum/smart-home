'use strict';

/**
 * extension smart-home
 * JavaScript Nanoleaf.
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
 * Nanoleaf class for controlling Nanoleaf devices.
 *
 * @class Plugin
 * @constructor
 * @return {Object} instance
 */
export const Plugin =  GObject.registerClass({
    GTypeName: 'SmartHomeNanoLights',
}, class Plugin extends SmartHomePanelMenu.SmartHomePanelMenu {

    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        this.id = id;
        this._devices = {};
        this._connectionTimeout = {};
        this._onLoginSettings = {};
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

            if (this._pluginSettings[id]['on-login']) {
                this._onLoginSettings[id] = JSON.parse(this._pluginSettings[id]['on-login']);
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
        this._dataState = {};
        this._dataEffects = {};
        this._dataDevice = {};
        this._currentEffect = {};

        this.data = {'config': {}, 'devices': {}, 'groups': {}};
        this.data['config'] = {'_all_': {'name': this._("All rooms")}};

        this._updateDevices();

        this._runOnStart();

        Utils.logDebug(`Nanoleaf ready.`);
    }

    clearInstance() {
        Utils.logDebug(`Nanoleaf clearing.`);

        for (let id in this._devices) {
            this._devices[id].clear();
            this._devices[id] = null;
        }
    }

    getEffectColor(name, data) {
        for (let effect of data['animations']) {
            if (effect['animName'] !== name) {
                continue;
            }

            let counter = 0;
            let [r, g, b] = [0, 0, 0];
            let rE, gE, bE;

            if (effect['palette']) {
                for (let color of effect['palette']) {
                    [rE, gE, bE] = Utils.hsvToRgb(
                        color['hue'],
                        color['saturation'],
                        100
                    );
                    if (rE > 0 || gE > 0 || bE > 0) {
                        r += rE;
                        g += gE;
                        b += bE;
                        counter ++;
                    }
                }
            }

            if (effect['hexPalette']) {
                for (let color of effect['hexPalette']) {
                    r += parseInt(color.slice(0, 2), 16);
                    g += parseInt(color.slice(2, 4), 16);
                    b += parseInt(color.slice(4, 6), 16);
                    counter ++;
                }
            }
            if (counter === 0) {
                return [null, null, null];   
            } else {
                return [
                    Math.round(r / counter),
                    Math.round(g / counter),
                    Math.round(b / counter)
                ];
            }
        }
        return [null, null, null];
    }

    getColor(id, data, dataEffects) {
        let mode, r, g, b;
        if (data['state']['on'] !== undefined && data['state']['on'] === false) {
            return null;
        }

        switch (data['state']['colorMode']) {
            case 'ct':
                [r, g, b] = Utils.kelvinToRGB(
                    data['state']['ct']['value']
                );
                mode = 'temperature';
                break;
            case 'hs':
                [r, g, b] = Utils.hsvToRgb(
                    data['state']['hue']['value'],
                    data['state']['sat']['value'],
                    100
                );
                mode = 'color';
                break;
            case 'effect':
                if ((! dataEffects) || (! this._currentEffect[id])) {
                    return null;
                }
                [r, g, b] = this.getEffectColor(
                    this._currentEffect[id],
                    dataEffects
                );
                mode = 'color';
                break;

        }

        if (r === null || g === null || b === null) {
            return null;
        }

        return {
            'color_mode': mode,
            'red': r,
            'green': g,
            'blue': b
        };
    }

    _parseData(id, data) {
        let device = {'groups': []};
        let group = this._pluginSettings[id]['group'];

        if (this.data['groups'][group] === undefined) {
            this.data['groups'][group] = {
                'type': 'group',
                'section': 'common',
                'name': group,
                'lights': [id]
            }
        } else {
            if (! this.data['groups'][group]['lights'].includes(id))
            this.data['groups'][group]['lights'].push(id);
        }

        device['groups'].push(group);

        device['type'] = 'device';
        if (this._pluginSettings[id]['name']) {
            device['name'] = this._pluginSettings[id]['name'];
        } else {
            device['name'] = data['name'];
        }
        device['section'] = 'common';
        device['capabilities'] = [];

        if (data['state']['on']) {
            device['capabilities'].push('switch');
            device['switch'] = data['state']['on']['value'];
        }

        if (data['state']['brightness']) {
            device['capabilities'].push('brightness');
            device['brightness'] = data['state']['brightness']['value'] / 100;
        }


        if (data['state']['hue']) {
            device['capabilities'].push('color');
        }

        if (data['state']['ct']) {
            device['capabilities'].push('color_temperature');
            device['ct_min'] = data['state']['ct']['min'];
            device['ct_max'] = data['state']['ct']['max'];
        }

        this.data['devices'][id] = device;

        if (data['effects'] !== undefined) {
            this._currentEffect[id] = data['effects']['select'];
            this._parseStateEffectsList(id, device, data);
        }

        if (this._dataEffects[id]['animations']) {
            this._parseEffectAnimations(id, device, this._dataEffects[id]['animations']);
        }
    }

    _parseStateEffectsList(id, device, data) {
        let effect = {};
        for (let name of data['effects']['effectsList']) {
            if (this.data['devices'][name] === undefined) {
                effect = {
                    'type': 'scene',
                    'section': 'device',
                    'name': name,
                    'capabilities': 'activate',
                    'associated' : [name]
                };
                this.data['devices'][name] = effect;
            } else {
                this.data['devices'][name]['associated'].push(id);
            }

            this.data['devices'][name]['associated'].push(
                this._pluginSettings[id]['group']
            );
            this.data['devices'][name]['associated'].push(
                '_all_'
            );
        }
    }

    _parseEffectAnimations(id, device, data) {
        let anim = {};
        for (let a of data) {
            let name = a['animName'];

            if (this.data['devices'][name] === undefined) {
                anim = {
                    'type': 'scene',
                    'section': 'device',
                    'name': name,
                    'capabilities': 'activate',
                    'associated' : [id]
                };
                this.data['devices'][name] = anim;
            } else {
                this.data['devices'][name]['associated'].push(id);
            }

            if (a['pluginType'] === 'rhythm') {
                this.data['devices'][name]['icon'] = 'HueIcons/otherMusic.svg'
            }

            this.data['devices'][name]['associated'].push(
                this._pluginSettings[id]['group']
            );
            this.data['devices'][name]['associated'].push(
                '_all_'
            );
        }
    }

    _updateColor(id) {
        let color = this.getColor(
            id,
            this._dataDevice[id],
            this._dataEffects[id]
        );

        if (color) {
            this.data['devices'][id]['color_mode'] = color.color_mode;
            switch (color.color_mode) {
                case 'color':
                    this.data['devices'][id]['color'] = color;
                    break;
                case 'temperature':
                    this.data['devices'][id]['color_temperature'] = color;
                    break;
                default:
                    break;
            }
            
        } else {
            this.data['devices'][id]['color'] = undefined;
        }
    }

    _checkDeviceDataObtained(id) {
        if (! this._dataDevice[id]) {
            return false;
        }

        if (! this._dataState[id]) {
            return false;
        }

        if (! this._dataEffects[id]) {
            return false;
        }

        if (! this._currentEffect[id]) {
            return false;
        }

        this._dataDevice[id]['state'] = this._dataState[id];

        return true;
    }

    _deviceDataObtained(id) {
        this._parseData(id, this._dataDevice[id])

        this._updateColor(id);
        if (this._initialized[id]) {
            this.dataReady();
        } else {
            this._initialized[id] = true;
            this.rebuildMenuDo();
        }
    }

    _handleEventState(id) {
        let color, hue, saturation;

        if (! this._initialized[id]) {
            return;
        }

        let data = this._devices[id].data;
        if ((! data) || (! data['events'])) {
            return;
        }

        if ((! this.data['devices']) || (! this.data['devices'][id])) {
            return;
        }

        for (let event of data['events']) {
            let e = Api.EventStateTypes[event['attr']];
            switch (e) {
                case 'on':
                    this.data['devices'][id]['switch'] = event['value'];
                    break;

                case 'brightness':
                    this.data['devices'][id]['brightness'] = event['value'] / 100;
                    break;

                case 'hue':
                    hue = event['value'];
                    if (saturation) {
                        color = Utils.hsvToRgb(
                            hue,
                            saturation,
                            100
                        );

                        this.data['devices'][id]['color']  = {
                            'red': color[0],
                            'green': color[1],
                            'blue': color[2]
                        }
                    }
                    break;

                case 'saturation':
                    saturation = event['value'];
                    if (hue !== undefined) {
                        color = Utils.hsvToRgb(
                            hue,
                            saturation,
                            100
                        );

                        this.data['devices'][id]['color']  = {
                            'red': color[0],
                            'green': color[1],
                            'blue': color[2]
                        }
                    }

                    break;

                case 'cct':
                    color = Utils.kelvinToRGB(
                        event['value']
                    );

                    this.data['devices'][id]['color_temperature']  = {
                        'red': color[0],
                        'green': color[1],
                        'blue': color[2]
                    }
                    break;

                case 'colorMode':
                    if (event['value'] === 'hs') {
                        this.data['devices'][id]['color_mode'] = 'color';
                    }
                    if (event['value'] === 'ct') {
                        this.data['devices'][id]['color_mode'] = 'temperature';
                    }
                    break;
            }
        }

        this.dataReady();
    }

    _handleEventEffects(id) {
        if (! this._initialized[id]) {
            return;
        }

        let data = this._devices[id].data;
        if ((! data) || (! data['events'])) {
            return;
        }

        if (this._dataEffects[id] === undefined) {
            return;
        }

        for (let event of data['events']) {
            let color = this.getEffectColor(
                event['value'],
                this._dataEffects[id]
            );

            this.data['devices'][id]['color']  = {
                'red': color[0],
                'green': color[1],
                'blue': color[2]
            }
        }

        this.dataReady();
    }

    _updateDevices() {
        let signal;

        for (let id in this._pluginSettings) {
            if (id === '_general_') {
                continue;
            }

            if (this._devices[id] === undefined) {
                this._initialized[id] = false;

                this._devices[id] = new Api.NanoLightsDevice({
                    id: id,
                    ip: this._pluginSettings[id]['ip'],
                    token: this._pluginSettings[id]['auth_token']
                });

                if (this._connectionTimeout[id] !== undefined) {
                    this._devices[id].setConnectionTimeout(this._connectionTimeout[id]);
                }

                signal = this._devices[id].connect(
                    'all-data',
                    () => {
                        this._dataDevice[id] = this._devices[id].data;

                        if (this._devices[id].data['effects'] && this._devices[id].data['effects']['select']) {
                            this._currentEffect[id] = this._devices[id].data['effects']['select'];
                        }

                        if (! this._checkDeviceDataObtained(id))  {
                            return;
                        }
                        this._deviceDataObtained(id);
                    }
                );
                this._appendSignal(signal, this._devices[id]);

                signal = this._devices[id].connect(
                    'state',
                    () => {
                        this._dataState[id] = this._devices[id].data;

                        if (! this._checkDeviceDataObtained(id))  {
                            return;
                        }

                        this._devices[id].keepEventStreamRequest();

                        this._deviceDataObtained(id);
                    }
                );
                this._appendSignal(signal, this._devices[id]);

                signal = this._devices[id].connect(
                    'all-effects',
                    () => {
                        this._dataEffects[id] = this._devices[id].data;

                        if (! this._checkDeviceDataObtained(id))  {
                            return;
                        }
                        this._deviceDataObtained(id);
                    }
                );
                this._appendSignal(signal, this._devices[id]);

                signal = this._devices[id].connect(
                    'current-effect',
                    () => {
                        this._currentEffect[id] = this._devices[id].data.replace(/"/g,'');

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
                        this._devices[id].keepEventStreamRequest();
                    }
                );
                this._appendSignal(signal, this._devices[id]);

                signal = this._devices[id].connect(
                    'event-state',
                    this._handleEventState.bind(this, id)
                );
                this._appendSignal(signal, this._devices[id]);

                signal = this._devices[id].connect(
                    'event-effects',
                    this._handleEventEffects.bind(this, id)
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

            this._devices[id].keepEventStreamRequest();
            this._devices[id].getDeviceInfo();
            this._devices[id].getDeviceState();
            this._devices[id].getDeviceAllEffects();
            this._devices[id].getDeviceCurrentEffect();
        }
    }

    requestData() {
        this._updateDevices();
    }

    getOnDevices(ids) {
        let onDevices = [];
        for (let id of ids) {
            if (! this._initialized[id]) {
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
        this._devices[id].setDeviceState(value);
    }

    switchGroup(id, ids, value) {
        for (let i of ids) {
            this._devices[i].setDeviceState(value);
        }
    }

    brightnessSingle(id, value) {
        this._devices[id].setDeviceBrightness(Math.round(value * 100));
    }

    brightnessGroup(id, ids, value) {
        let onDevices = this.getOnDevices(ids);

        for (let i of ids) {
            if (onDevices.length > 0 && (! onDevices.includes(i))) {
                continue;
            }

            this._devices[i].setDeviceBrightness(Math.round(value * 100));
        }
    }

    colorSingle(id, value) {
        let [h, s, l] = Utils.rgbToHsv(value['r'], value['g'], value['b']);
        this._devices[id].setDeviceColor(h, s);

    }

    colorGroup(id, ids, value) {
        let onDevices = this.getOnDevices(ids);
        let [h, s, l] = Utils.rgbToHsv(value['r'], value['g'], value['b']);

        for (let i of ids) {
            if (onDevices.length > 0 && (! onDevices.includes(i))) {
                continue;
            }

            this._devices[i].setDeviceColor(h, s);
        }
    }

    colorTemperatureSingle(id, value) {

        let temp = Utils.RGBToKelvin(
            value['r'],
            value['g'],
            value['b'],
            this.data['devices'][id]['ct_min'],
            this.data['devices'][id]['ct_max']
        );
        this._devices[id].setDeviceTemperature(temp);

    }

    colorTemperatureGroup(id, ids, value) {
        let onDevices = this.getOnDevices(ids);

        for (let i of ids) {
            if (onDevices.length > 0 && (! onDevices.includes(i))) {
                continue;
            }

            let temp = Utils.RGBToKelvin(
                value['r'],
                value['g'],
                value['b'],
                this.data['devices'][i]['ct_min'],
                this.data['devices'][i]['ct_max']
            );
            this._devices[i].setDeviceTemperature(temp);
        }
    }

    sceneSingle(id, ids) {
        for (let i of ids) {
            this._devices[i].setDeviceEffect(id);
        }
    }

    sceneGroup = this.sceneSingle

    _runOnStart() {
        let h, s, l;
        for (let id in this._onLoginSettings) {
            for (let light in this._onLoginSettings[id]) {
                let device = this._onLoginSettings[id][light];

                if (device['switch']) {
                    switch (device['type']) {
                        case 'light':
                            [h, s, l] = Utils.rgbToHsv(
                                device['color']['red'],
                                device['color']['green'],
                                device['color']['blue']
                            );
                            this._devices[id].setDeviceColor(h, s);
                            this._devices[id].setDeviceBrightness(Math.round(device['brightness']));
                            break;

                        case 'scene':
                            this._devices[id].setDeviceEffect(light);
                            this._devices[id].setDeviceBrightness(Math.round(device['brightness']));
                            break;

                        default:
                            break;
                    }
                }
            }
        }
    }
});

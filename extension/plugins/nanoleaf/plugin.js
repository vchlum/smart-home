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
import GLib from 'gi://GLib';
import * as Utils from '../../utils.js';
import * as Semaphore from '../../semaphore.js';
import * as SmartHomePanelMenu from '../../smarthome-panelmenu.js';
import * as ScreenMirror from './screen-mirror.js';
import * as Api from './api.js';

/**
 * Nanoleaf class for controlling Nanoleaf devices.
 *
 * @class Plugin
 * @constructor
 * @return {Object} instance
 */
export const Plugin =  GObject.registerClass({
    GTypeName: 'SmartHomeNanoleaf',
}, class Plugin extends SmartHomePanelMenu.SmartHomePanelMenu {

    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        this.id = id;
        this._devices = {};
        this._devicesSignals = {};
        this._connectionTimeout = {};
        this._onLoginSettings = {};
        this._firstTime = true;
        this._prepared = false;
        this._semaphore = new Semaphore.Semaphore(1);
        this._notebookMode = {};
        this._offShutdown = false;
        this._displays = [];
        this._mirroring = {};
        this._requestedBrightness = {};
        super._init(id, pluginName, metadata, mainDir, settings, openPref);

        this._screenMirror = new ScreenMirror.ScreenMirror();
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

            if (this._pluginSettings[id]['notebook-mode'] !== undefined) {
                this._notebookMode[id] = this._pluginSettings[id]['notebook-mode'] === 'true';
            }

            if (this._pluginSettings[id]['off-shutdown'] !== undefined) {
                this._offShutdown = this._pluginSettings[id]['off-shutdown'] === 'true';
            }
        }

        if (needsRebuild && this._prepared) {
            this.clearInstance(true);
            this.preparePlugin(true);
        }
    }

    preparePlugin(settingsRead = false) {
        this._devices = {};
        this._deviceInMenu = {};

        this._initialized = {};
        this._dataState = {};
        this._dataEffects = {};
        this._dataDevice = {};
        this._currentEffect = {};

        this.data = {'config': {}, 'devices': {}, 'groups': {}};
        this.data['config'] = {'_all_': {'name': this._("All rooms")}};

        this._semaphore.callFunction(this._updateDevices.bind(this));
        if (!settingsRead) {
            this._semaphore.callFunction(this._runOnStartDelay.bind(this));
        }

        this._prepared = true;
        Utils.logDebug(`Nanoleaf ready.`);
    }

    disconnectDeviceSignals(id) {
        while (this._devicesSignals[id].length > 0) {
            let signal = this._devicesSignals[id].pop();
            this._devices[id].disconnect(signal);
        }
    }

    clearInstance(settingsRead = false) {
        Utils.logDebug(`Nanoleaf clearing.`);

        if (this._onStartTimer) {
            GLib.Source.remove(this._onStartTimer);
        };

        if (!settingsRead) {
            this._semaphore.clear();
            this._semaphore = null;
        }

        for (let id in this._devices) {
            this.stopMirrorScreen(id, true);
            this.disconnectDeviceSignals(id);
            this._devices[id].clear();
            this._devices[id] = null;
        }

        if (!settingsRead) {
            this._screenMirror.clear();
            this._screenMirror = null;
        }
    }

    getEffectColor(name, data) {
        if (! data['animations']) {
            return [null, null, null];
        }

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

        if (data['panelLayout']) {
            this._createDisplays(id);
        }

        if (data['effects'] !== undefined) {
            this._currentEffect[id] = data['effects']['select'];
            this._parseStateEffectsList(id, device, data);
        }

        if (this._dataEffects[id]['animations']) {
            this._parseEffectAnimations(id, device, this._dataEffects[id]['animations']);
        }
    }

    _createDisplays(id) {
        this._displays = [];

        if (!this.data['devices'][`sync-screen`]) {
            this.data['devices'][`sync-screen`] = {
                'type': 'scene',
                'name': this._("Screen"),
                'section': 'device',
                'capabilities': ['activate'],
                'associated': ['_all_', id],
                'icon': "HueIcons/otherWatchingMovie.svg"
            }
        } else {
            if (this.data['devices'][`sync-screen`]['associated'].indexOf(id) === -1) {
                this.data['devices'][`sync-screen`]['associated'].push(id);
            }
        }
        if (this.data['devices'][`sync-screen`]['associated'].indexOf(this._pluginSettings[id]['group']) === -1) {
            this.data['devices'][`sync-screen`]['associated'].push(this._pluginSettings[id]['group']);
        }

        let n_monitors = global.display.get_n_monitors();
        if (n_monitors > 1) {
            for (let i = 0; i < n_monitors; i++) {
                let displayId = `sync-screen:${i}`;
                this._displays.push(displayId);

                if (! this.data['devices'][displayId]) {
                    let geometry = global.display.get_monitor_geometry(i);
                    let scale = global.display.get_monitor_scale(i);
                    let width = Math.round(geometry.width * scale);
                    let height = Math.round(geometry.height * scale);

                    this.data['devices'][displayId] = {
                        'type': 'scene',
                        'name': `${this._("Display")} ${i}: ${width}x${height}`,
                        'section': 'device',
                        'capabilities': ['activate'],
                        'associated': ['_all_', id],
                        'icon': "HueIcons/otherWatchingMovie.svg"
                    }
                } else {
                    if (this.data['devices'][displayId]['associated'].indexOf(id) === -1) {
                        this.data['devices'][displayId]['associated'].push(id);
                    }
                }
                if (this.data['devices'][displayId]['associated'].indexOf(this._pluginSettings[id]['group'])) {
                    this.data['devices'][displayId]['associated'].push(this._pluginSettings[id]['group']);
                }
            }
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
                    'associated' : [id]
                };
                this.data['devices'][name] = effect;
            } else {
                if (this.data['devices'][name]['associated'].indexOf(id) === -1) {
                    this.data['devices'][name]['associated'].push(id);
                }
            }

            if (this.data['devices'][name]['associated'].indexOf(this._pluginSettings[id]['group']) === -1) {
                this.data['devices'][name]['associated'].push(
                    this._pluginSettings[id]['group']
                );
            }

            if (this.data['devices'][name]['associated'].indexOf('_all_') === -1) {
                this.data['devices'][name]['associated'].push(
                    '_all_'
                );
            }
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
                if (this.data['devices'][name]['associated'].indexOf(id) === -1) {
                    this.data['devices'][name]['associated'].push(id);
                }
            }

            if (a['pluginType'] === 'rhythm') {
                this.data['devices'][name]['icon'] = 'HueIcons/otherMusic.svg'
            }

            if (this.data['devices'][name]['associated'].indexOf(this._pluginSettings[id]['group']) === -1) {
                this.data['devices'][name]['associated'].push(
                    this._pluginSettings[id]['group']
                );
            }

            if (this.data['devices'][name]['associated'].indexOf('_all_') === -1) {
                this.data['devices'][name]['associated'].push(
                    '_all_'
                );
            }
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

        let data = this._devices[id].eventStateData;
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

        let data = this._devices[id].eventEffectData;
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

    async _updateDevices() {
        let signal;

        for (let id in this._pluginSettings) {
            if (id === '_general_') {
                continue;
            }

            if (this._devices[id] === undefined || this._devices[id] === null) {
                this._initialized[id] = false;
                this._devicesSignals[id] = [];

                this._devices[id] = new Api.NanoleafDevice({
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
                        this._dataDevice[id] = this._devices[id].allData;

                        if (this._devices[id].allData['effects'] && this._devices[id].allData['effects']['select']) {
                            this._currentEffect[id] = this._devices[id].allData['effects']['select'];
                        }

                        if (! this._checkDeviceDataObtained(id))  {
                            return;
                        }
                        this._deviceDataObtained(id);
                    }
                );
                this._devicesSignals[id].push(signal);

                signal = this._devices[id].connect(
                    'state',
                    () => {
                        this._dataState[id] = this._devices[id].stateData;

                        if (! this._checkDeviceDataObtained(id))  {
                            return;
                        }

                        this._devices[id].keepEventStreamRequest();

                        this._deviceDataObtained(id);
                    }
                );
                this._devicesSignals[id].push(signal);

                signal = this._devices[id].connect(
                    'all-effects',
                    () => {
                        this._dataEffects[id] = this._devices[id].allEffectsData;

                        if (! this._checkDeviceDataObtained(id))  {
                            return;
                        }
                        this._deviceDataObtained(id);
                    }
                );
                this._devicesSignals[id].push(signal);

                signal = this._devices[id].connect(
                    'current-effect',
                    () => {
                        this._currentEffect[id] = this._devices[id].currentEffectData.replace(/"/g,'');

                        if (! this._checkDeviceDataObtained(id))  {
                            return;
                        }
                        this._deviceDataObtained(id);
                    }
                );
                this._devicesSignals[id].push(signal);

                signal = this._devices[id].connect(
                    'change-occurred',
                    () => {
                        this._devices[id].keepEventStreamRequest();
                        if (this._requestedBrightness[id]) {
                            this._devices[id].setDeviceBrightness(this._requestedBrightness[id]);
                            delete(this._requestedBrightness[id]);
                        }
                    }
                );
                this._devicesSignals[id].push(signal);

                signal = this._devices[id].connect(
                    'event-state',
                    this._handleEventState.bind(this, id)
                );
                this._devicesSignals[id].push(signal);

                signal = this._devices[id].connect(
                    'event-effects',
                    this._handleEventEffects.bind(this, id)
                );
                this._devicesSignals[id].push(signal);

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
                this._devicesSignals[id].push(signal);
            }

            this._devices[id].keepEventStreamRequest();
            this._devices[id].getDeviceInfo();
            this._devices[id].getDeviceState();
            this._devices[id].getDeviceAllEffects();
            this._devices[id].getDeviceCurrentEffect();
        }
    }

    requestData() {
        this._semaphore.callFunction(this._updateDevices.bind(this));
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

    sendMirrorMsg(id, data) {
        let msg = [];

        if (! data) {
            return;
        }

        msg = msg.concat([(data.length >> 8) & 0xFF]);
        msg = msg.concat([data.length & 0xFF]);

        for (let light of data) {
            msg = msg.concat([(light['panelId'] >> 8) & 0xFF]);
            msg = msg.concat([light['panelId'] & 0xFF]);

            msg = msg.concat([light['r'], light['g'], light['b'], light['w']]);

            msg = msg.concat([(light['transTime'] >> 8) & 0xFF]);
            msg = msg.concat([light['transTime'] & 0xFF]);
        }

        this._devices[id].sendUDPMsg(msg);
    }

    startMirrorScreen(id, display) {
        let signal;

        if (! this._mirroring[id]) {
            this._mirroring[id] = {
                'signals-device': [],
                'signals-mirror': [],
            };
        }

        this.stopMirrorScreen(id);

        signal = this._devices[id].connect(
            'ext-control',
            () => {
                this._devices[id].enableUDP();
            }
        );
        this._mirroring[id]['signals-device'].push(signal);

        signal = this._devices[id].connect(
            'udp-ready',
            async () => {
                this._mirroring[id]['panelLayout'] = this._devices[id].allData['panelLayout'];
                this._mirroring[id]['display'] = display;
                this._mirroring[id]['brightness'] = this.data['devices'][id]['brightness'];

                await this._screenMirror.subscribe(id, this._mirroring[id]);
                if (this._requestedBrightness[id]) {
                    this._devices[id].setDeviceBrightness(this._requestedBrightness[id]);
                    delete(this._requestedBrightness[id]);
                }
            }
        );
        this._mirroring[id]['signals-device'].push(signal);

        signal = this._devices[id].connect(
            'udp-stopped',
            () => {
                this.stopMirrorScreen(id);
            }
        );
        this._mirroring[id]['signals-device'].push(signal);

        signal = this._screenMirror.connect(
            'event',
            () => {
                if (! this._screenMirror.subs[id]) {
                    return;
                }
                this.sendMirrorMsg(id, this._screenMirror.subs[id]['event-data']);
            }
        );
        this._mirroring[id]['signals-mirror'].push(signal);

        this._devices[id].extControl(true);
    }

    stopMirrorScreen(id, clear = false) {
        if (! this._mirroring[id]) {
            return;
        }

        while (this._mirroring[id]['signals-device'].length > 0) {
            let signal = this._mirroring[id]['signals-device'].pop();
            this._devices[id].disconnect(signal);
        }

        while (this._mirroring[id]['signals-mirror'].length > 0) {
            let signal = this._mirroring[id]['signals-mirror'].pop();
            this._screenMirror.disconnect(signal);
        }

        this._screenMirror.unsubscribe(id);
        if (clear) {
            this._devices[id].setDeviceState(false, clear);
        }
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
        if (id.startsWith('sync-screen')) {
            for (let i of ids) {
                let display = id.split(":")[1];
                this.startMirrorScreen(
                    i,
                    display !== undefined ? Number(display) : undefined
                );
            }
            return;
        }

        for (let i of ids) {
            this._devices[i].setDeviceEffect(id);
        }
    }

    sceneGroup = this.sceneSingle

    _runOnStart() {
        let h, s, l;
        if (! this._firstTime) {
            return;
        }
        this._firstTime = false;
        for (let id in this._onLoginSettings) {
            if (this._notebookMode[id] && (! Utils.isExternalMonitorOn())) {
                continue;
            }

            for (let effectId in this._onLoginSettings[id]) {
                let device = this._onLoginSettings[id][effectId];

                if (device['switch']) {
                    switch (device['type']) {
                        case 'light':
                            if (device['color']['red'] > 0 || device['color']['green'] > 0 || device['color']['blue'] > 0) {
                                [h, s, l] = Utils.rgbToHsv(
                                    device['color']['red'],
                                    device['color']['green'],
                                    device['color']['blue']
                                );
                                this._devices[id].setDeviceColor(h, s);
                            }
                            this._devices[id].setDeviceBrightness(Math.round(device['brightness']));
                            break;

                        case 'scene':
                            this._requestedBrightness[id] = Math.round(device['brightness']);
                            this.sceneSingle(effectId, [id]);
                            break;

                        default:
                            break;
                    }
                }
            }
        }
    }

    async _runOnStartDelay() {
        this._onStartTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            this._onStartTimer = null;
            this._runOnStart();
            return GLib.SOURCE_REMOVE;
        });
    }

    _runOnShutdown() {
        /* disable screen miroring */
        for (let id in this._devices) {
            Utils.logDebug(`Shutting down ${id}`);
            this.stopMirrorScreen(id, true);
        }

        if (! this._offShutdown) {
            return;
        }

        /* disable on login lights */
        for (let id in this._onLoginSettings) {
            if (this._notebookMode[id] && (! Utils.isExternalMonitorOn())) {
                continue;
            }

            for (let effectId in this._onLoginSettings[id]) {
                let device = this._onLoginSettings[id][effectId];

                if (device['switch']) {
                    this._devices[id].setDeviceState(false, true);
                }
            }
        }
    }

    onShutdown = this._runOnShutdown;
});

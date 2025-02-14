'use strict';

/**
 * extension smart-home
 * JavaScript Ikea Dirigera.
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

const getDirigeraIconFile = {
	"rooms_arm_chair": "HueIcons/roomsPorch.svg",
    "rooms_bathtub": "HueIcons/roomsBathroom.svg",
    "rooms_bed": "HueIcons/roomsBedroom.svg",
    "rooms_bedside_table": "HueIcons/roomsBedroom.svg",
    "rooms_bike": "HueIcons/roomsNursery.svg",
    "rooms_book_case": "HueIcons/otherReading.svg",
    "rooms_box": "HueIcons/roomsStorage.svg",
    "rooms_bunk_bed": "HueIcons/roomsGuestroom.svg",
    "rooms_car": "HueIcons/roomsCarport.svg",
    "rooms_chair": "HueIcons/roomsPorch.svg",
    "rooms_clapper": "HueIcons/otherWatchingMovie.svg",
    "rooms_coat_hanger": "HueIcons/roomsHallway.svg",
    "rooms_coat_rack": "HueIcons/roomsHallway.svg",
    "rooms_cutlery": "HueIcons/roomsDining.svg",
    "rooms_desk": "HueIcons/archetypesDeskLamp.svg",
    "rooms_display": "HueIcons/otherWatchingMovie.svg",
    "rooms_dog": "HueIcons/roomsNursery.svg",
    "rooms_door": "HueIcons/roomsFrontdoor.svg",
    "rooms_drill": "HueIcons/roomsGarage.svg",
    "rooms_fence": "HueIcons/roomsBalcony.svg",
    "rooms_fireplace": "HueIcons/otherFire.svg",
    "rooms_fish": "HueIcons/roomsKidsbedroom.svg",
    "rooms_flower": "HueIcons/otherChristmasTree.svg",
    "rooms_game_pad": "HueIcons/roomsMancave.svg",
    "rooms_heart": "HueIcons/otherHeart.svg",
    "rooms_home": "HueIcons/tabbarHome.svg",
    "rooms_hot_drink": "HueIcons/otherFire.svg",
    "rooms_iron": "HueIcons/otherFire.svg",
    "rooms_kitchen": "HueIcons/roomsKitchen.svg",
    "rooms_ladle": "HueIcons/roomsDining.svg",
    "rooms_mobile": "HueIcons/routinesLeavingHome.svg",
    "rooms_motor_bike": "HueIcons/roomsNursery.svg",
    "rooms_mower": "HueIcons/lightdirectionDiffusedLight.svg",
    "rooms_office_chair": "HueIcons/roomsOffice.svg",
    "rooms_paper_towels": "HueIcons/exploreHuelabs.svg",
    "rooms_parasol": "HueIcons/roomsTerrace.svg",
    "rooms_play_area": "HueIcons/roomsKidsbedroom.svg",
    "rooms_pool_ladder": "HueIcons/roomsPool.svg",
    "rooms_pot_plant": "HueIcons/otherChristmasTree.svg",
    "rooms_pot_with_lid": "HueIcons/otherChristmasTree.svg",
    "rooms_pram": "HueIcons/roomsKidsbedroom.svg",
    "rooms_printer": "HueIcons/presetsReading.svg",
    "rooms_restroom_baby_care": "HueIcons/roomsKidsbedroom.svg",
    "rooms_sewing_machine": "HueIcons/roomsGarage.svg",
    "rooms_shower": "HueIcons/roomsBathroom.svg",
    "rooms_sideboard": "HueIcons/roomsCloset.svg",
    "rooms_sink": "HueIcons/roomsBathroom.svg",
    "rooms_sofa": "HueIcons/roomsLounge.svg",
    "rooms_stairway": "HueIcons/roomsStaircase.svg",
    "rooms_strainer": "HueIcons/roomsDining.svg",
    "rooms_t_shirt": "HueIcons/roomsHallway.svg",
    "rooms_teddy": "HueIcons/roomsKidsbedroom.svg",
    "rooms_toothbrush": "HueIcons/roomsBathroom.svg",
    "rooms_wardrobe": "HueIcons/roomsCloset.svg",
    "rooms_washing_machine": "HueIcons/roomsLaundryroom.svg",
    "rooms_weights": "HueIcons/roomsGym.svg",
    "rooms_wrench": "HueIcons/roomsGarage.svg"
}

export const Plugin =  GObject.registerClass({
    GTypeName: 'SmartHomeIkeaDirigera',
}, class Plugin extends SmartHomePanelMenu.SmartHomePanelMenu {

    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        this.id = id;
        this._bridgeSignals = [];
        super._init(id, pluginName, metadata, mainDir, settings, openPref);
        this._connectionTimeout = Utils.IKEADIRIGERA_DEFAULT_TIMEOUT;
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
    }

    preparePlugin() {
        let signal;

        this.data = {'devices': {}, 'groups': {}};

        this._bridge = new Api.IkeaDirigeraBridge({
            ip: this._pluginSettings[this.id]['ip'],
            token: this._pluginSettings[this.id]['accessToken']
        });

        this._bridge.setConnectionTimeout(this._connectionTimeout);

        signal = this._bridge.connect(
            'all-data',
            () => {
                this._bridge.keepEventStreamRequest();
                this._dateReceived();
            }
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'event-stream-data',
            this._handleEventData.bind(this)
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'connection-problem',
            () => {
                this.connectionClosed();
            }
        );
        this._bridgeSignals.push(signal);

        this._bridge.keepEventStreamRequest();
        this._runOnStart();

        Utils.logDebug(`Ikea Dirigera ${this.id} ready.`);
    }

    disconnectBridgeSignals() {
        while (this._bridgeSignals.length > 0) {
            let signal = this._bridgeSignals.pop();
            this._bridge.disconnect(signal);
        }
    }

    clearInstance() {
        Utils.logDebug(`Ikea Dirigera ${this.id} clearing.`);

        this.disconnectBridgeSignals();

        if (this._onStartTimer) {
            GLib.Source.remove(this._onStartTimer);
        };

        this._bridge.clear();
        this._bridge = null;
    }

    _dateReceived() {
        this.data = {'config': {}, 'devices': {}, 'groups': {}};
        this.data['config'] = {
            '_all_': {'name': this._("All rooms")},
            'control-only-on': true
        };
        this._groups = {};
        this._blinds = {};
        this._lights = {};

        this._preParseData(this._bridge.data);

        for (let id in this._groups) {
            let item = this.parseGroup(this._groups[id]);
            if (item) {
                this.data['groups'][id] = item;
            }
        }

        for (let id in this._blinds) {
            let item = this.parseBlinds(this._blinds[id]);
            if (item) {
                this.data['devices'][id] = item;
            }
        }

        for (let id in this._lights) {
            let item = this.parseLight(this._lights[id]);
            if (item) {
                this.data['devices'][id] = item;
            }
        }

        this.dataReady();
    }

    _handleEventData() {
        let id;
        let r, g, b;
        let data = this._bridge.data['data'];

        if (! this.data['devices'] || Object.keys(this.data['devices']).length === 0) {
            return;
        }

        if (data !== undefined && data['attributes']) {
            id = data['id'];

            switch (data['type']) {
                case 'light':
                case 'outlet':
                    if (data['attributes']['isOn'] !== undefined) {
                        this.data['devices'][id]['switch'] = data['attributes']['isOn'];
                    }

                    if (data['attributes']['lightLevel'] !== undefined) {
                        this.data['devices'][id]['brightness'] = data['attributes']['lightLevel'] / 100;
                    }

                    if (data['attributes']['colorMode'] !== undefined) {
                        this.data['devices'][id]['color_mode'] = data['attributes']['colorMode'];
                    }

                    if (data['attributes']['colorTemperature'] !== undefined) {
                        [r, g, b] = Utils.kelvinToRGB(
                            data['attributes']['colorTemperature']
                        );

                        if (r !== null && g != null && b != null) {
                            this.data['devices'][id]['color_temperature'] = {
                                'red': r,
                                'green': g,
                                'blue': b
                            };
                        }
                    }

                    if (data['attributes']['colorHue'] !== undefined) {
                        [r, g, b] = Utils.hsvToRgb(
                            data['attributes']['colorHue'],
                            Math.round(data['attributes']['colorSaturation'] * 100),
                            100
                        );

                        if (r !== null && g != null && b != null) {
                            this.data['devices'][id]['color'] = {
                                'red': r,
                                'green': g,
                                'blue': b
                            };
                        }
                    }
                    break;

                case 'blinds':
                    if (data['attributes']['blindsCurrentLevel'] !== undefined) {
                        this.data['devices'][id]['position'] = data['attributes']['blindsCurrentLevel'] / 100;
                    }
                    break;

                default:
                    break;
            }
        }

        this.dataReady();
    }

    _preParseData(data) {
        let id;
        for (let item of data) {
            id = item['id'];

            switch(item['type']) {
                case 'blinds':
                    this._blinds[id] = item;
                    if (item['room'] !== undefined) {
                        if (! Object.keys(this._blinds).includes(item['room']['id'])) {
                            this._groups[item['room']['id']] = item['room'];
                            this._groups[item['room']['id']]['blinds'] = [];
                        }
                        this._groups[item['room']['id']]['blinds'].push(id);
                    }
                    break;
                case 'light':
                case 'outlet':
                    this._lights[id] = item;
                    if (item['room'] !== undefined) {
                        if (! Object.keys(this._lights).includes(item['room']['id'])) {
                            this._groups[item['room']['id']] = item['room'];
                            this._groups[item['room']['id']]['lights'] = [];
                        }
                        this._groups[item['room']['id']]['lights'].push(id);
                    }
                    break;
                default:
                    break;
            }
        }

    }

    parseGroup (data) {
        let out = {};

        out['type'] = 'group';
        out['section'] = 'common';
        out['name'] = data['name'];
        out['icon'] = getDirigeraIconFile[data['icon']];
        out['services'] = [];

        return out;
    }

    parseBlinds (data) {
        let out = {};

        out['type'] = 'device';
        out['name'] = data['attributes']['customName'];
        out['section'] = 'common';
        out['icon'] = 'blinds.svg';
        out['capabilities'] = [];
        if (data['capabilities']) {
            if (data['capabilities']['canReceive'].includes('blindsCurrentLevel') &&
                data['capabilities']['canReceive'].includes('blindsTargetLevel')) {

                out['capabilities'] = ['position', 'up/down'];
                out['position'] = data['attributes']['blindsCurrentLevel'] / 100;
            }
        }
        out['groups'] = [];

        if (data['room']) {
            out['groups'].push(data['room']['id']);
        }

        return out;
    }

    parseLight(data) {
        let out = {};

        out['type'] = 'device';
        out['name'] = data['attributes']['customName'];
        out['section'] = 'common';
        if (data['deviceType'] === 'outlet') {
            out['icon'] = `HueIcons/devicesPlug.svg`
        }
        out['capabilities'] = [];
        if (data['capabilities']) {
            if (data['capabilities']['canReceive'].includes('isOn')) {
                out['capabilities'].push('switch');
                out['switch'] = data['attributes']['isOn'];
            }

            let lightLevel = true;
            if (data['capabilities']['canReceive'].includes('lightLevel') && data['deviceType'] === 'outlet') {
                lightLevel = Utils.IKEADIRIGERA_DEFAULT_LIGHTLEVEL_OUTLETS;
            }

            if (data['capabilities']['canReceive'].includes('lightLevel') && lightLevel) {
                out['capabilities'].push('brightness');
                out['brightness'] = data['attributes']['lightLevel'] / 100;
            }

            if (data['capabilities']['canReceive'].includes('colorTemperature')) {
                out['capabilities'].push('color_temperature');
                out['ct_min'] = data['attributes']['colorTemperatureMin'];
                out['ct_max'] = data['attributes']['colorTemperatureMax'];
            }

            if (data['capabilities']['canReceive'].includes('colorHue') &&
                data['capabilities']['canReceive'].includes('colorSaturation')) {

                out['capabilities'].push('color');
            }
        }

        if (data['attributes']['colorMode'] !== undefined) {
            let r, g, b = [null, null, null];
            switch (data['attributes']['colorMode']) {
                case 'color':
                    out['color_mode'] = 'color';

                    [r, g, b] = Utils.hsvToRgb(
                        data['attributes']['colorHue'],
                        Math.round(data['attributes']['colorSaturation'] * 100),
                        100
                    );

                    if (r !== null && g != null && b != null) {
                        out['color'] = {
                            'red': r,
                            'green': g,
                            'blue': b
                        };
                    }
                    break;
                case 'temperature':
                    out['color_mode'] = 'temperature';

                    [r, g, b] = Utils.kelvinToRGB(
                        data['attributes']['colorTemperature']
                    );

                    if (r !== null && g != null && b != null) {
                        out['color_temperature'] = {
                            'red': r,
                            'green': g,
                            'blue': b
                        };
                    }
                    break;

            }
        }

        out['groups'] = [];

        if (data['room']) {
            out['groups'].push(data['room']['id']);
        }

        return out;
    }

    requestData() {
        this._bridge.getAll();
    }

    processGroup(ids, data, capability) {
        if (ids.length === 0) {
            return;
        }

        let i = 0;
        let timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {

            while (! this.data['devices'][ids[i]]['capabilities'].includes(capability)) {
                if (++i >= ids.length) {
                    return GLib.SOURCE_REMOVE;
                }
            }

            if (['brightness', 'color', 'color_temperature'].includes(capability)) {
                if (this.data['devices'][ids[i]]['switch'] === false) {
                    if (++i >= ids.length) {
                        return GLib.SOURCE_REMOVE;
                    }
                }
            }

            this._bridge.setDevice(
                ids[i],
                data
            );

            i ++;
            if (i < ids.length) {
                return GLib.SOURCE_CONTINUE;
            } else {
                this._timers = Utils.removeFromArray(this._timers, timerId);
                return GLib.SOURCE_REMOVE;
            }
        });

        this._timers.push(timerId);
    }

    positionSingle(id, value) {
        this.blindsSingle(id, Math.round(value * 100));
    }

    positionGroup(id, ids, value) {
        this.blindsGroup(ids, Math.round(value * 100));
    }

    upSingle(id) {
        this.blindsSingle(id, 0);
    }

    upGroup(id, ids) {
        this.blindsGroup(ids, 0);
    }

    downSingle(id) {
        this.blindsSingle(id, 100);
    }

    downGroup(id, ids) {
        this.blindsGroup(ids, 100);
    }

    blindsSingle(id, value) {
        this._bridge.setDevice(
            id,
            [{"attributes": {"blindsTargetLevel": value}}]
        );
    }

    blindsGroup(ids, value) {
        this.processGroup(
            ids,
            [{"attributes": {"blindsTargetLevel": value}}],
            'position'
        );
    }

    switchSingle(id, value) {
        this._bridge.setDevice(
            id,
            [{"attributes": {"isOn": value}}]
        );
    }

    switchGroup(id, ids, value) {
        this.processGroup(
            ids,
            [{"attributes": {"isOn": value}}],
            'switch'
        );
    }

    brightnessSingle(id, value) {
        this._bridge.setDevice(
            id,
            [{"attributes": {"lightLevel": Math.round(value * 100)}}]
        );
    }

    brightnessGroup(id, ids, value) {
        this.processGroup(
            ids,
            [{"attributes": {"lightLevel": Math.round(value * 100)}}],
            'brightness'
        );
    }

    colorSingle(id, value) {
        let [h, s, l] = Utils.rgbToHsv(value['r'], value['g'], value['b']);

        this._bridge.setDevice(
            id,
            [{"attributes": { "colorHue": h, "colorSaturation": s / 100}}]
        );
    }

    colorGroup(id, ids, value) {
        let [h, s, l] = Utils.rgbToHsv(value['r'], value['g'], value['b']);
        this.processGroup(
            ids,
            [{"attributes": { "colorHue": h, "colorSaturation": s / 100}}],
            'color'
        );
    }

    colorTemperatureSingle(id, value) {
        let temp = Utils.RGBToKelvin(
            value['r'],
            value['g'],
            value['b'],
            this.data['devices'][id]['ct_min'],
            this.data['devices'][id]['ct_max']
        );

        this._bridge.setDevice(
            id,
            [{"attributes": { "colorTemperature": temp}}]
        );
    }

    colorTemperatureGroup(id, ids, value) {
        let temp = Utils.RGBToKelvin(value['r'], value['g'], value['b']);
        this.processGroup(
            ids,
            [{"attributes": { "colorTemperature": temp}}],
            'color_temperature'
        );
    }

    _runOnStartDevice(id, device) {
        return new Promise((resolve, reject) => {
            switch (device['type']) {
                case 'light':
                    this._bridge.setDevice(
                        id,
                        [{"attributes": {"isOn": true}}]
                    );
                    break;

                case 'outlet':
                    this._bridge.setDevice(
                        id,
                        [{"attributes": {"isOn": true}}]
                    );
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

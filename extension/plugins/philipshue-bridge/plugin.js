'use strict';

/**
 * extension smart-home
 * JavaScript Philips Hue bridge
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
import * as PhilipsHueUtils from './utils.js';

const getHueIconFile = {

    "unknown_archetype": "HueIcons/bulbsSultan.svg",
    "classic_bulb": "HueIcons/bulbsSultan.svg",
    "sultan_bulb": "HueIcons/bulbsSultan.svg",
    "flood_bulb": "HueIcons/bulbFlood.svg",
    "spot_bulb": "HueIcons/bulbsSpot.svg",
    "candle_bulb": "HueIcons/bulbCandle.svg",
    "luster_bulb": "HueIcons/bulbsSultan.svg",
    "pendant_round": "HueIcons/archetypesPendantRound.svg",
    "pendant_long": "HueIcons/archetypesPendantLong.svg",
    "ceiling_round": "HueIcons/archetypesCeilingRound.svg",
    "ceiling_square": "HueIcons/archetypesCeilingSquare.svg",
    "floor_shade": "HueIcons/archetypesFloorShade.svg",
    "floor_lantern": "HueIcons/archetypesFloorLantern.svg",
    "table_shade": "HueIcons/archetypesTableShade.svg",
    "recessed_ceiling": "HueIcons/archetypesRecessedCeiling.svg",
    "recessed_floor": "HueIcons/archetypesRecessedFloor.svg",
    "single_spot": "HueIcons/archetypesSingleSpot.svg",
    "double_spot": "HueIcons/archetypesDoubleSpot.svg",
    "table_wash": "HueIcons/archetypesTableWash.svg",
    "wall_lantern": "HueIcons/archetypesWallLantern.svg",
    "wall_shade": "HueIcons/archetypesWallShade.svg",
    "flexible_lamp": "HueIcons/bulbsSultan.svg",
    "ground_spot": "HueIcons/archetypesFloorSpot.svg",
    "wall_spot": "HueIcons/archetypesWallSpot.svg",
    "plug": "HueIcons/devicesPlug.svg",
    "hue_go": "HueIcons/heroesHuego.svg",
    "hue_lightstrip": "HueIcons/heroesLightstrip.svg",
    "hue_iris": "HueIcons/heroesIris.svg",
    "hue_bloom": "HueIcons/heroesBloom.svg",
    "bollard": "HueIcons/archetypesBollard.svg",
    "wall_washer": "HueIcons/heroesLightstrip.svg",
    "hue_play": "HueIcons/heroesHueplay.svg",
    "vintage_bulb": "HueIcons/bulbsSultan.svg",
    "vintage_candle_bulb": "HueIcons/bulbCandle.svg",
    "ellipse_bulb": "HueIcons/bulbsSultan.svg",
    "triangle_bulb": "HueIcons/bulbsSultan.svg",
    "small_globe_bulb": "HueIcons/bulbsSultan.svg",
    "large_globe_bulb": "HueIcons/bulbsSultan.svg",
    "edison_bulb": "HueIcons/bulbsSultan.svg",
    "christmas_tree": "HueIcons/otherChristmasTree.svg",
    "string_light": "HueIcons/heroesLightstrip.svg",
    "hue_centris": "HueIcons/bulbsSultan.svg",
    "hue_lightstrip_tv": "HueIcons/heroesLightstrip.svg",
    "hue_lightstrip_pc": "HueIcons/heroesLightstrip.svg",
    "hue_tube": "HueIcons/bulbsSultan.svg",
    "hue_signe": "HueIcons/bulbsSultan.svg",
    "pendant_spot": "HueIcons/bulbsSpot.svg",
    "ceiling_horizontal": "HueIcons/archetypesRecessedCeiling.svg",
    "ceiling_tube": "HueIcons/archetypesRecessedCeiling.svg",
    "up_and_down": "HueIcons/bulbsSultan.svg",
    "up_and_down_up": "HueIcons/bulbsSultan.svg",
    "up_and_down_down": "HueIcons/bulbsSultan.svg",
    "hue_floodlight_camera": "HueIcons/bulbsSultan.svg",

    "living_room": "HueIcons/roomsLiving.svg",
    "kitchen": "HueIcons/roomsKitchen.svg",
    "dining": "HueIcons/roomsDining.svg",
    "bedroom": "HueIcons/roomsBedroom.svg",
    "kids_bedroom": "HueIcons/roomsKidsbedroom.svg",
    "bathroom": "HueIcons/roomsBathroom.svg",
    "nursery": "HueIcons/roomsNursery.svg",
    "recreation": "HueIcons/roomsRecreation.svg",
    "office": "HueIcons/roomsOffice.svg",
    "gym": "HueIcons/roomsGym.svg",
    "hallway": "HueIcons/roomsHallway.svg",
    "toilet": "HueIcons/roomsToilet.svg",
    "front_door": "HueIcons/roomsFrontdoor.svg",
    "garage": "HueIcons/roomsGarage.svg",
    "terrace": "HueIcons/roomsTerrace.svg",
    "garden": "HueIcons/roomsOutdoor.svg",
    "driveway": "HueIcons/roomsDriveway.svg",
    "carport": "HueIcons/roomsCarport.svg",
    "home": "HueIcons/tabbarHome.svg",
    "downstairs": "HueIcons/zonesAreasGroundfloor.svg",
    "upstairs": "HueIcons/zonesAreasFirstfloor.svg",
    "top_floor": "HueIcons/zonesAreasSecondfloor.svg",
    "attic": "HueIcons/roomsAttic.svg",
    "guest_room": "HueIcons/roomsGuestroom.svg",
    "staircase": "HueIcons/roomsStaircase.svg",
    "lounge": "HueIcons/roomsLounge.svg",
    "man_cave": "HueIcons/roomsMancave.svg",
    "computer": "HueIcons/roomsComputer.svg",
    "studio": "HueIcons/roomsStudio.svg",
    "music": "HueIcons/otherMusic.svg",
    "tv": "HueIcons/otherWatchingMovie.svg",
    "reading": "HueIcons/otherReading.svg",
    "closet": "HueIcons/roomsCloset.svg",
    "storage": "HueIcons/roomsStorage.svg",
    "laundry_room": "HueIcons/roomsLaundryroom.svg",
    "balcony": "HueIcons/roomsBalcony.svg",
    "porch": "HueIcons/roomsPorch.svg",
    "barbecue": "HueIcons/roomsOutdoorSocialtime.svg",
    "pool": "HueIcons/roomsPool.svg",
    "other": "HueIcons/roomsOther.svg"
};

export const Plugin =  GObject.registerClass({
    GTypeName: "PhilipsHueBridge",
}, class Plugin extends SmartHomePanelMenu.SmartHomePanelMenu {

    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        this.id = id;
        this._zonesFirst = Utils.PHILIPSHUEBRIDGE_DEFAULT_ZONESFIRST;
        this._showScenes = Utils.PHILIPSHUEBRIDGE_DEFAULT_SHOWSCENES;
        this._connectionTimeout = Utils.PHILIPSHUEBRIDGE_DEFAULT_TIMEOUT;
        this._bridgeSignals = [];
        super._init(id, pluginName, metadata, mainDir, settings, openPref);
    }

    settingRead() {
        if (!this._pluginSettings[this.id]) {
            return; //device is being removed
        }

        if (this._pluginSettings[this.id]['zones-first'] !== undefined) {
            this._zonesFirst =  this._pluginSettings[this.id]['zones-first'] === 'true';
        }

        if (this._pluginSettings[this.id]['show-scenes'] !== undefined) {
            this._showScenes =  this._pluginSettings[this.id]['show-scenes'] === 'true';
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
        this._timers = [];

        this._bridge = new Api.PhilipsHueBridge({
            ip: this._pluginSettings[this.id]['ip'],
            username: this._pluginSettings[this.id]['username'],
            clientkey: this._pluginSettings[this.id]['clientkey']
        });

        this._bridge.setConnectionTimeout(this._connectionTimeout);

        signal = this._bridge.connect(
            'all-data',
            () => {
                this.data = {'config': {}, 'devices': {}, 'groups': {}};
                this.data['config'] = {'_all_': {'name': this._("All rooms and zones")}};
                this._devices = {};
                this._groups = {};
                this._groupsChildren = {};
                this._lights = {};
                this._scenes = {};
                this._effects = {}

                this.preParseData(this._bridge.data['data']);

                for (let id in this._groups) {
                    let item = this.parseGroup(this._groups[id]);
                    if (item) {
                        this.data['groups'][id] = item;
                    }
                }

                for (let id in this._lights) {
                    let item = this.parseLight(this._lights[id]);
                    if (item) {
                        this.data['devices'][id] = item;
                    }
                }

                if (this._showScenes) {
                    for (let id in this._scenes) {
                        let item = this.parseScene(this._scenes[id]);

                        if (item) {
                            this.data['devices'][id] = item;
                        }
                    }

                    for (let e in this._effects) {
                        let item = this.parseEffect(e, this._effects[e]);

                        if (item) {
                            this.data['devices'][e] = item;
                        }
                    }
                }

                this._bridge.keepEventStreamRequest();

                this.dataReady();
            }
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'change-occurred',
            () => {
                this._bridge.keepEventStreamRequest();
            }
        );
        this._bridgeSignals.push(signal);

        signal = this._bridge.connect(
            'event-stream-data',
            this._handleEventStreamData.bind(this)
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

        Utils.logDebug(`Philips Hue Bridge ${this.id} ready.`);
    }

    disconnectBridgeSignals() {
        while (this._bridgeSignals.length > 0) {
            let signal = this._bridgeSignals.pop();
            this._bridge.disconnect(signal);
        }
    }

    clearInstance() {
        Utils.logDebug(`Philips Hue Bridge ${this.id} clearing.`);

        this.disconnectBridgeSignals();

        if (this._onStartTimer) {
            GLib.Source.remove(this._onStartTimer);
        };

        this._bridge.clear();
        this._bridge = null;
    }

    _preparseGroup(type, data) {
        for (let d of data) {
            if (d['type'] === type) {
                this._groups[d['id']] = d;
                this._groupsChildren[d['id']] = [];
                for (let child of d['children']) {
                    this._groupsChildren[d['id']].push(child['rid']);
                }
            }
        }
    }

    preParseData(data) {
        if (this._zonesFirst) {
            this._preparseGroup('zone', data);
            this._preparseGroup('room', data);
        } else {
            this._preparseGroup('room', data);
            this._preparseGroup('zone', data);
        }

        for (let d of data) {
            if (d['type'] === 'bridge_home') {
                this._group_all_ = d;
                for (let s of d['services']) {
                    if (s['rtype'] === 'grouped_light') {
                        this._group_all_['grouped_light_id'] = s['rid'];
                    }
                }
            }
        }

        for (let d of data) {
            if (d['type'] === 'light' && d['effects'] !== undefined && d['effects']['effect_values'] !== undefined) {
                for (let i of d['effects']['effect_values']) {
                    if (i === 'no_effect') {
                        continue;
                    }
                    if (this._effects[i] === undefined) {
                        this._effects[i] = [];
                    }
                    this._effects[i].push(d['id']);

                    let owner = d['owner']['rid'];

                    for (let j in this._groupsChildren) {
                        if  ((this._groupsChildren[j].includes(d['id']) || this._groupsChildren[j].includes(owner)) && ! this._effects[i].includes(j)) {
                            this._effects[i].push(j);
                        }
                    }
                }
            }
        }

        for (let d of data) {
            switch (d['type']) {
                case 'device':
                    this._devices[d['id']] = d;
                    break;
                case 'light':
                    this._lights[d['id']] = d;
                    break;
                case 'scene':
                    this._scenes[d['id']] = d;
                    break;
                default:
                    break;
            }
        }
    }

    parseGroup(data) {
        let id  = data['id'];
        let out = {};

        if (data['type'] !== 'room' && data['type'] !== 'zone') {
            return null;
        }

        out['type'] = 'group';
        out['section'] = 'common';
        out['name'] = data['metadata']['name'];
        out['icon'] = getHueIconFile[data['metadata']['archetype']];
        out['services'] = [];
        out['lights'] = [];

        for (let service of data['services']) {
            if (service['rtype'] === 'grouped_light') {
                out['services'].push(service['rid']);
            }
        }

        for (let i of this._groupsChildren[id]) {
            if (this._lights[i] !== undefined) {
                out['lights'].push(i);
            }
            if (this._devices[i] !== undefined) {
                for (let service of this._devices[i]['services']) {
                    if (service['rtype'] === 'light') {
                        out['lights'].push(service['rid']);
                    }
                }

            }
        }

        return out;
    }

    parseLight(data) {
        let id  = data['id'];
        let out = {};
        let [r, g, b] = [null, null, null];

        if (data['type'] !== 'light') {
            return null;
        }

        out['type'] = 'device';
        out['name'] = data['metadata']['name'];
        out['icon'] = getHueIconFile[data['metadata']['archetype']];
        out['section'] = 'common';
        out['capabilities'] = [];
        out['groups'] = [];

        if (data['on'] !== undefined) {
            out['capabilities'].push('switch');
            out['switch'] = data['on']['on'];
        }

        if (data['dimming'] !== undefined) {
            out['capabilities'].push('brightness');
            out['brightness'] = data['dimming']['brightness'] / 100;
        }

        if (data['color'] !== undefined) {
            out['capabilities'].push('color');
            [r, g, b] = PhilipsHueUtils.XYBriToColor(
                data['color']['xy']['x'],
                data['color']['xy']['y'],
                255
            );
            out['color'] = {
                'red': r,
                'green': g,
                'blue': b
            };

            out['color_mode'] = 'color';
        }

        if (data['color_temperature'] !== undefined) {
            out['capabilities'].push('color_temperature');
            if (data['color_temperature']['mirek'] !== null) {
                let kelvin = PhilipsHueUtils.ctToKelvin(data['color_temperature']['mirek']);
                [r, g, b] = PhilipsHueUtils.kelvinToRGB(kelvin);
                out['color_temperature'] = {
                    'red': r,
                    'green': g,
                    'blue': b
                };
            }

            if (data['color_temperature']['mirek_valid']) {
                out['color_mode'] = 'temperature';
            }
        }

        let owner = data['owner']['rid'];

        for (let rid in this._groupsChildren) {
            if (this._groupsChildren[rid].includes(owner) || this._groupsChildren[rid].includes(id)) {
                out['groups'].push(rid);
            }
        }

        return out;
    }

    parseScene(data) {
        let out = {};

        if (data['type'] !== 'scene') {
            return null;
        }

        out['type'] = 'scene';
        out['section'] = 'group';
        out['name'] = data['metadata']['name'];
        out['capabilities'] = ['activate'];
        out['associated'] = [];
        out['associated'].push(data['group']['rid']);

        return out;
    }

    parseEffect(effect, data) {
        let out = {};

        out['type'] = 'scene';
        out['section'] = 'device';
        out['name'] = effect;
        out['capabilities'] = ['activate'];
        out['associated'] = data;

        return out;
    }

    requestData() {
        this._bridge.getAll();
    }

    switchSingle(id, value) {
        this._bridge.setLight(
            id,
            {"on": {"on": value}}
        );
    }

    switchGroup(id, ids, value) {
        let data = {"on": {"on": value}};
        ids = id === '_all_' ? [this._group_all_['grouped_light_id']] : this.data['groups'][id]['services'];

        for (let i of ids) {
            this._bridge.setGroup(
                i,
                data
            );
        }
    }

    brightnessSingle(id, value) {
        let data = {};
        if (value > 0) {
            data =  {
                "on": {"on": true},
                "dimming": {"brightness": value * 100},
            }
        } else {
            data = {"on": {"on": false}}
        }
        this._bridge.setLight(id, data);
    }

    brightnessGroup(id, ids, value) {
        let data = {};
        if (value > 0) {
            data =  {
                "on": {"on": true},
                "dimming": {"brightness": value * 100},
            }
        } else {
            data = {"on": {"on": false}}
        }

        ids = id === '_all_' ? [this._group_all_['grouped_light_id']] : this.data['groups'][id]['services'];

        for (let i of ids) {
            this._bridge.setGroup(
                i,
                data
            );
        }
    }

    colorSingle(id, value) {
        let data = {"on": {"on": true}};
        let xy = PhilipsHueUtils.colorToHueXY(value['r'], value['g'], value['b']);
        data["color"] = {"xy": {"x": xy[0], "y":xy[1]}};
        this._bridge.setLight(id, data);
    }

    colorGroup(id, ids, value) {
        let data = {"on": {"on": true}};
        let xy = PhilipsHueUtils.colorToHueXY(value['r'], value['g'], value['b']);
        data["color"] = {"xy": {"x": xy[0], "y":xy[1]}};

        ids = id === '_all_' ? [this._group_all_['grouped_light_id']] : this.data['groups'][id]['services'];

        for (let i of ids) {
            this._bridge.setGroup(
                i,
                data
            );
        }
    }

    colorTemperatureSingle(id, value) {
        let data = {"on": {"on": true}};
        let kelvin = PhilipsHueUtils.RGBToKelvin(value['r'], value['g'], value['b']);
        data["color_temperature"] = { "mirek": PhilipsHueUtils.kelvinToCt(kelvin)};
        this._bridge.setLight(id, data);
    }

    colorTemperatureGroup(id, ids, value) {
        let data = {"on": {"on": true}};
        let kelvin = PhilipsHueUtils.RGBToKelvin(value['r'], value['g'], value['b']);
        data["color_temperature"] = { "mirek": PhilipsHueUtils.kelvinToCt(kelvin)};

        ids = id === '_all_' ? [this._group_all_['grouped_light_id']] : this.data['groups'][id]['services'];

        for (let i of ids) {
            this._bridge.setGroup(
                i,
                data
            );
        }
    }

    _handleEventStreamData() {
        let r, g, b;

        if (! this.data) {
            return;
        }

        for (let data of this._bridge.data) {
            for (let event of data['data']) {
                let id = event['id'];

                if (event['type'] === 'light') {
                    if (Object.keys(event).includes('on')) {
                        this.data['devices'][id]['switch'] = event['on']['on'];
                    }

                    if (Object.keys(event).includes('dimming')) {
                        this.data['devices'][id]['brightness'] = event['dimming']['brightness'] / 100;
                    }

                    if (Object.keys(event).includes('color')) {
                        [r, g, b] = PhilipsHueUtils.XYBriToColor(
                            event['color']['xy']['x'],
                            event['color']['xy']['y'],
                            255
                        );

                        this.data['devices'][id]['color'] = {
                            'red': r,
                            'green': g,
                            'blue': b
                        };

                        this.data['devices'][id]['color_mode'] = 'color';
                    }

                    if (Object.keys(event).includes('color_temperature')) {
                        if (event['color_temperature']['mirek'] !== null) {
                            let kelvin = PhilipsHueUtils.ctToKelvin(event['color_temperature']['mirek']);
                            [r, g, b] = PhilipsHueUtils.kelvinToRGB(kelvin);
                            this.data['devices'][id]['color_temperature'] = {
                                'red': r,
                                'green': g,
                                'blue': b
                            };
                        }
                        if (event['color_temperature']['mirek_valid']) {
                            this.data['devices'][id]['color_mode'] = 'temperature';
                        }
                    }
                }
            }
        }

        this.dataReady();
    }

    sceneSingle(id, ids) {
        if (ids.length === 0) {
            return;
        }

        let i = 0;
        let timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            this._bridge.setLight(
                ids[i],
                {"on": {"on": true}, "effects": {"effect": id}},
                false
            );

            i ++;
            if (i < ids.length) {
                return GLib.SOURCE_CONTINUE;
            } else {
                this._bridge.getAll();
                this._timers = Utils.removeFromArray(this._timers, timerId);
                return GLib.SOURCE_REMOVE;
            }
        });

        this._timers.push(timerId);
    }

    sceneGroup(id, ids) {
        for (let e in this._effects)
            if (e === id) {
                if (ids.length === 0) {
                    return;
                }

                let i = 0;
                let timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                    if (this._effects[e].includes(ids[i])) {
                        this._bridge.setLight(
                            ids[i],
                            {"on": {"on": true}, "effects": {"effect": id}},
                            false
                        );
                    }

                    i ++;
                    if (i < ids.length) {
                        return GLib.SOURCE_CONTINUE;
                    } else {
                        this._bridge.getAll();
                        this._timers = Utils.removeFromArray(this._timers, timerId);
                        return GLib.SOURCE_REMOVE;
                    }
                });

                this._timers.push(timerId);

                return;
            }

        this._bridge.setScene(
            id,
            {'recall': {'action': 'active'}}
        ); 
    }

    _runOnStartDevice(id, device) {
        return new Promise((resolve, reject) => {
            let data;
            switch (device['type']) {
                case 'light':
                    data = {"on": {"on": true}};
                    if (device['brightness']) {
                        data["dimming"] = {"brightness": device['brightness']};
                    }
                    if (device['color']) {
                        let xy = PhilipsHueUtils.colorToHueXY(
                            device['color']['red'],
                            device['color']['green'],
                            device['color']['blue']
                        );
                        data["color"] = {"xy": {"x": xy[0], "y":xy[1]}};
                    }
                    this._bridge.setLight(id, data);
                    break;

                case 'scene':
                    this._bridge.setScene(
                        id,
                        {'recall': {'action': 'active'}}
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

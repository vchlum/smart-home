'use strict';

/**
 * extension smart-home
 * JavaScript Philips Hue Sync box
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

export const Plugin =  GObject.registerClass({
    GTypeName: 'PhilipsHueSyncbox',
}, class Plugin extends SmartHomePanelMenu.SmartHomePanelMenu {

    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        this.id = id;
        super._init(id, pluginName, metadata, mainDir, settings, openPref);
        this._connectionTimeout = Utils.PHILIPSHUESYNCBOX_DEFAULT_TIMEOUT;
    }

    settingRead() {
        if (!this._pluginSettings[this.id]) {
            return; //device is being removed
        }

        if (this._pluginSettings[this.id]['connection-timeout'] !== undefined) {
            this._connectionTimeout = Number(this._pluginSettings[this.id]['connection-timeout']);

            if (this._syncbox) {
                this._syncbox.setConnectionTimeout(this._connectionTimeout);
            }
        }
    }

    preparePlugin() {
        let signal;

        this.data = {'config': {}, 'devices': {}, 'groups': {}};
        this._syncbox = new Api.PhilipsHueSyncBox ({
            ip: this._pluginSettings[this.id]['ip'],
            token: this._pluginSettings[this.id]['accessToken'],
            cert: this.mainDir + "/crypto/hsb_cacert.pem"
        });

        this._syncbox.setConnectionTimeout(this._connectionTimeout);

        signal = this._syncbox.connect(
            'device-state',
            () => {
                this.data = {'config': {}, 'devices': {}, 'groups': {}};
                this._parseStateData(this._syncbox.data);
                this.dataReady();
            }
        );
        this._appendSignal(signal, this._syncbox);

        signal = this._syncbox.connect(
            'change-occurred',
            this.runOnlyOnceInTime.bind(
                this,
                500,
                this._syncbox.getDeviceState.bind(this._syncbox)
            )
        );
        this._appendSignal(signal, this._syncbox);

        signal = this._syncbox.connect(
            'connection-problem',
            () => {
                this.connectionClosed();
            }
        );
        this._appendSignal(signal, this._syncbox);

        Utils.logDebug(`Philips Hue sync box ${this.id} ready.`);
    }

    clearInstance() {
        Utils.logDebug(`Philips Hue sync box ${this.id} clearing.`);

        this._syncbox.clear();
        this._syncbox = null;
    }

    requestData() {
        this._syncbox.getDeviceState();
    }

    _parseStateData(data) {
        let active;
        let selected;
        let hueTarget = data['execution']['hueTarget'];

        let nameSuffix = data['execution']['mode'] === 'powersave' ? "" : this._("is on");
        nameSuffix = data['execution']['syncActive'] ? this._("is syncing") : nameSuffix;

        this.data['groups']['syncbox-control'] = {
            'name': `${data['device']['name']} ${nameSuffix}`,
            'icon': "syncbox.svg",
            'section': 'static',
            'capabilities': ['text']
        };

        this.data['groups']['syncbox-mode'] = {
            'name': this._("Mode"),
            'section': 'static',
            'capabilities': ['text', 'icon'],
            'icon': "HueIcons/tabbarAutomation.svg"
        };

        this.data['groups']['syncbox-intensity'] = {
            'name': this._("Intensity"),
            'section': 'static',
            'capabilities': ['text', 'icon'],
            'icon': "HueSyncbox/intensity-high.svg",
        };

        this.data['groups']['syncbox-input'] = {
            'name': this._("HDMI input"),
            'icon': "HueSyncbox/hdmi.svg",
            'section': 'static',
            'capabilities': ['text']
        };


        this.data['groups']['syncbox-entertainment-areas'] = {
            'name': this._("Entertainment areas"),
            'section': 'static',
            'icon': "HueIcons/otherWatchingMovie.svg",
            'capabilities': ['text']
        };

        if (hueTarget && data['hue']['groups'][hueTarget]) {
            this.data['groups']['syncbox-entertainment-areas']['name'] = data['hue']['groups'][hueTarget]['name'];
        }

        this.data['devices'] = {};
        if (data['execution'] !== undefined) {
            let brightness = data['execution']['brightness'] / 200;

            this.data['devices']['syncbox-power'] = {
                'type': 'device',
                'name': this._("Power"),
                'section': 'static',
                'capabilities': ['switch'],
                'groups': ['syncbox-control'],
                'switch': data['execution']['mode'] === 'powersave' ? false : true,
                'icon': "HueIcons/uicontrolsSwitchOn.svg"
            }

            this.data['devices']['syncbox-active'] = {
                'type': 'device',
                'name': this._("Synchronization"),
                'section': 'static',
                'capabilities': ['switch'],
                'groups': ['syncbox-control'],
                'switch': data['execution']['syncActive'],
                'icon': "HueIcons/bulbGroup.svg"
            }

            this.data['devices']['brightness'] = {
                'type': 'device',
                'name': this._("Brightness"),
                'section': 'static',
                'capabilities': ['brightness', 'icon'],
                'groups': ['syncbox-control'],
                'brightness': brightness,
                'icon': "HueIcons/routinesDaytime.svg"
            }

            if (brightness >= 0.66) {
                this.data['devices']['brightness']['icon'] = "HueIcons/routinesDaytime.svg";
            } else if (brightness >= 0.33) {
                this.data['devices']['brightness']['icon'] = "HueIcons/presetsDimmerDimup.svg";
            } else {
                this.data['devices']['brightness']['icon'] = "HueIcons/presetsDimmerDimdown.svg";
            }

            this.data['devices']['restart'] = {
                'type': 'device',
                'name': this._("Restart"),
                'section': 'static',
                'capabilities': ['activate'],
                'groups': ['syncbox-control'],
                'icon': "execute.svg"
            }
        }

        if (data['execution'] !== undefined) {
            const iconsMode = {
                'video': "HueIcons/otherWatchingMovie.svg",
                'game': "HueIcons/roomsMancave.svg",
                'music': "HueIcons/otherMusic.svg"
            };

            this.data['groups']['syncbox-mode']['name'] = this._("Mode");
            this.data['groups']['syncbox-mode']['icon'] = "HueIcons/tabbarAutomation.svg";

            for (let [mode, name] of [['video', "Movie"], ['game', "Game"], ['music', "Music"]]) {
                if (data['execution'][mode] !== undefined) {
                    selected = data['execution']['lastSyncMode'] === mode;
                    active = selected && data['execution']['syncActive'];

                    this.data['devices'][mode] = {
                        'type': 'device',
                        'name': this._(name),
                        'section': 'static',
                        'capabilities': ['switch'],
                        'groups': ['syncbox-mode'],
                        'switch': active,
                        'icon': iconsMode[mode]
                    }
                    if (active) {
                        this.data['groups']['syncbox-mode']['name'] = this._(name);
                        this.data['groups']['syncbox-mode']['icon'] = iconsMode[mode];
                    }
                }
            }
        }

        if (data['execution'] !== undefined) {
            const iconsIntensity = {
                'intense': "HueSyncbox/intensity-intense.svg",
                'high': "HueSyncbox/intensity-high.svg",
                'moderate': "HueSyncbox/intensity-moderate.svg",
                'subtle': "HueSyncbox/intensity-subtle.svg"
            };
            for (let [intensity, name] of [
                    ['intense', "Intense"],
                    ['high', "High"],
                    ['moderate', "Moderate"],
                    ['subtle', "Subtle"]
                ]) {
                let lastSyncMode = data['execution']['lastSyncMode'];
                selected = data['execution'][lastSyncMode]['intensity'] === intensity;
                active = selected && data['execution']['syncActive'];

                this.data['devices'][intensity] = {
                    'type': 'device',
                    'name': this._(name),
                    'section': 'static',
                    'capabilities': ['switch'],
                    'groups': ['syncbox-intensity'],
                    'switch': active,
                    'icon': iconsIntensity[intensity]
                };

                if (active) {
                    this.data['groups']['syncbox-intensity']['name'] = this._(name);
                }

                if (selected) {
                    this.data['groups']['syncbox-intensity']['icon'] = iconsIntensity[intensity];
                }
            }
        }

        if (data['hdmi'] !== undefined) {
            for (let input of ['input1', 'input2', 'input3', 'input4']) {
                let hdmiSource = data['execution']['hdmiSource'];
                active = input === hdmiSource && data['execution']['mode'] !== 'powersave';
                this.data['devices'][input] = {
                    'type': 'device',
                    'name': data['hdmi'][input]['name'],
                    'section': 'static',
                    'capabilities': ['switch'],
                    'groups': ['syncbox-input'],
                    'switch': active,
                    'icon': "HueSyncbox/hdmi.svg"
                };

                if (active) {
                    this.data['groups']['syncbox-input']['name'] = `${this._("Input")}: ${data['hdmi'][input]['name']}`;
                }
            }
        }

        if (data['hue'] !== undefined) {
            for (let group in data['hue']['groups']) {
                this.data['devices'][group] = {
                    'type': 'device',
                    'name': data['hue']['groups'][group]['name'],
                    'section': 'static',
                    'capabilities': ['activate'],
                    'groups': ['syncbox-entertainment-areas'],
                    'icon': "HueIcons/otherWatchingMovie.svg"
                };
            }
        }
    }

    switchSingle (id, value) {
        let data;

        switch (id) {
            case 'syncbox-power':
                if (value) {
                    data = {"mode": "passthrough"};
                } else {
                    data = {"mode": "powersave"};
                }
                this._syncbox.setExecution(data);
                break;

            case 'syncbox-active':
                data = {"syncActive": value};
                this._syncbox.setExecution(data);
                break;

            case 'video':
            case 'game':
            case 'music':
                if (value) {
                    data = {"syncActive": true, "mode": id};
                } else {
                    data = {"syncActive": false};
                }
                this._syncbox.setExecution(data);
                break;

            case 'intense':
            case 'high':
            case 'moderate':
            case 'subtle':
                if (value) {
                    data = {"syncActive": true, "intensity": id};
                } else {
                    data = {"syncActive": false};
                }
                this._syncbox.setExecution(data);
                break;

            case 'input1':
            case 'input2':
            case 'input3':
            case 'input4':
                if (value) {
                    data = {"mode": id};
                    this._syncbox.setHDMISource(id);

                    data = {"mode": "passthrough"};
                    this._syncbox.setExecution(data);
                } else {
                    data = {"mode": "powersave"};
                    this._syncbox.setExecution(data);
                }
                break;
        }
    }

    sceneSingle(id, ids) {
        switch (id) {
            case 'restart':
                this._syncbox.restartDevice();
                break;
            default:
                this._syncbox.setExecution({'hueTarget': id});
                break;
        }
    }

    sceneGroup = this.sceneSingle

    brightnessSingle (id, value) {
        if (id === 'brightness') {
            this._syncbox.setExecution(
                {"brightness": Math.round(value * 200)}
            );
        }
    }

    brightnessGroup(id, ids, value) {
        if (id === 'brightness') {
            this._syncbox.setExecution(
                {"brightness": Math.round(value * 200)}
            );
        }
    }

    executeSingle(id, ids) {
        if (id === 'restart') {
            this._syncbox.restartDevice();
        }
    }

    executeGroup = this.executeSingle
});

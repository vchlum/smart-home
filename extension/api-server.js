'use strict';

/**
 * extension smart-home
 * Local HTTP API allowing arbitrary local applications to control
 * lights (and other devices) handled by any of the loaded plugins,
 * including turning the Philips Hue Desktop (light) Sync on/off.
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

import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import * as Utils from './utils.js';

const API_PREFIX = ['api', 'v1'];

const SYNC_DEVICE_IDS = ['sync-screen', 'sync-music', 'sync-cursor'];

function clamp01(value) {
    value = Number(value);
    if (Number.isNaN(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

function clampByte(value) {
    value = Math.round(Number(value));
    if (Number.isNaN(value)) {
        return 0;
    }
    return Math.min(255, Math.max(0, value));
}

/**
 * Recomputes, for a plugin instance, which device ids belong to a given
 * group id. This mirrors the logic SmartHomePanelMenu._createGroups() uses
 * to build the menu, so group actions triggered over the API affect the
 * same devices the panel menu would.
 *
 * @method resolveGroupIds
 * @param {Object} instance plugin instance
 * @param {String} groupId
 * @return {Array} device ids
 */
function resolveGroupIds(instance, groupId) {
    let ids = [];

    if (! instance.data) {
        return ids;
    }

    /* Some plugins (e.g. ikea-dirigera) record a device's room membership
     * as the room's name rather than its id, while data.groups is keyed by
     * id. Accept either so group actions still find their devices. */
    let groupName = null;
    if (groupId !== '_all_' && instance.data['groups'][groupId]) {
        groupName = instance.data['groups'][groupId]['name'];
    }

    function isMember(device) {
        if (device['groups'].includes(groupId)) {
            return true;
        }
        if (! groupName) {
            return false;
        }
        let lowerName = groupName.toLowerCase();
        return device['groups'].some(
            (g) => typeof g === 'string' && g.toLowerCase() === lowerName
        );
    }

    for (let id in instance.data['devices']) {
        let device = instance.data['devices'][id];

        if (device['groups'] === undefined) {
            continue;
        }

        if (device['capabilities'] === undefined) {
            continue;
        }

        if (device['section'] !== 'common') {
            continue;
        }

        if (groupId === '_all_') {
            if (device['type'] === 'device') {
                ids.push(id);
            } else if (device['type'] === 'scene' && device['groups'].includes('_all_')) {
                ids.push(id);
            }
            continue;
        }

        if (device['type'] !== 'device' && device['type'] !== 'scene') {
            continue;
        }

        if (isMember(device)) {
            ids.push(id);
        }
    }

    return ids;
}

/* capability: the entry in device['capabilities'] required to allow the action */
const deviceActions = {
    'switch': {
        capability: 'switch',
        run: (instance, id, body) => instance.switchSingle(id, !!body['on'])
    },
    'brightness': {
        capability: 'brightness',
        run: (instance, id, body) => instance.brightnessSingle(id, clamp01(body['value']))
    },
    'color': {
        capability: 'color',
        run: (instance, id, body) => instance.colorSingle(id, {
            r: clampByte(body['r']), g: clampByte(body['g']), b: clampByte(body['b'])
        })
    },
    'color-temperature': {
        capability: 'color_temperature',
        run: (instance, id, body) => instance.colorTemperatureSingle(id, {
            r: clampByte(body['r']), g: clampByte(body['g']), b: clampByte(body['b'])
        })
    },
    'position': {
        capability: 'position',
        run: (instance, id, body) => instance.positionSingle(id, clamp01(body['value']))
    },
    'up': {
        capability: 'up/down',
        run: (instance, id) => instance.upSingle(id)
    },
    'down': {
        capability: 'up/down',
        run: (instance, id) => instance.downSingle(id)
    },
};

const groupActions = {
    'switch': {
        capability: 'switch',
        run: (instance, id, ids, body) => instance.switchGroup(id, ids, !!body['on'])
    },
    'brightness': {
        capability: 'brightness',
        run: (instance, id, ids, body) => instance.brightnessGroup(id, ids, clamp01(body['value']))
    },
    'color': {
        capability: 'color',
        run: (instance, id, ids, body) => instance.colorGroup(id, ids, {
            r: clampByte(body['r']), g: clampByte(body['g']), b: clampByte(body['b'])
        })
    },
    'color-temperature': {
        capability: 'color_temperature',
        run: (instance, id, ids, body) => instance.colorTemperatureGroup(id, ids, {
            r: clampByte(body['r']), g: clampByte(body['g']), b: clampByte(body['b'])
        })
    },
    'position': {
        capability: 'position',
        run: (instance, id, ids, body) => instance.positionGroup(id, ids, clamp01(body['value']))
    },
    'up': {
        capability: 'up/down',
        run: (instance, id, ids) => instance.upGroup(id, ids)
    },
    'down': {
        capability: 'up/down',
        run: (instance, id, ids) => instance.downGroup(id, ids)
    },
};

/**
 * ApiServer - a small local HTTP API on top of the plugin instances
 * managed by SmartHome, so any local application/plugin can list
 * devices and control them (switch, brightness, color, scenes, ...),
 * including enabling/disabling the Philips Hue Desktop Sync.
 *
 * @class ApiServer
 * @constructor
 * @return {Object} instance
 */
export class ApiServer {

    constructor(smarthome) {
        this._smarthome = smarthome;
        this._server = null;
        this._token = null;
    }

    /**
     * Starts (or restarts, if already running) the HTTP API server.
     *
     * @method start
     * @param {Number} port
     * @param {String} token
     * @param {Boolean} bindAll if true, listen on all interfaces instead of only localhost
     */
    start(port, token, bindAll) {
        this.stop();

        this._token = token;

        this._server = new Soup.Server();
        this._server.add_handler(null, this._handleRequest.bind(this));

        try {
            if (bindAll) {
                this._server.listen_all(port, 0);
            } else {
                this._server.listen_local(port, 0);
            }
            Utils.logDebug(`API server listening on port ${port} (${bindAll ? 'all interfaces' : 'localhost only'}).`);
        } catch (e) {
            Utils.logError(`API server failed to listen on port ${port}: ${e}`);
            this._server = null;
        }
    }

    /**
     * Stops the HTTP API server if running.
     *
     * @method stop
     */
    stop() {
        if (this._server) {
            this._server.disconnect();
            this._server = null;
        }
    }

    _sendJson(msg, statusCode, obj) {
        let body = new TextEncoder().encode(JSON.stringify(obj));
        msg.set_status(statusCode, null);
        /* set_response() also sets the Content-Type header from its first arg */
        msg.set_response('application/json', Soup.MemoryUse.COPY, body);
    }

    _sendError(msg, statusCode, message) {
        this._sendJson(msg, statusCode, {'error': message});
    }

    _readJsonBody(msg) {
        try {
            let bytes = msg.get_request_body().flatten().get_data();
            if (! bytes || bytes.length === 0) {
                return {};
            }
            let text = new TextDecoder().decode(bytes);
            if (! text) {
                return {};
            }
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    _checkAuth(msg) {
        if (! this._token) {
            return false;
        }

        let header = msg.get_request_headers().get_one('Authorization');
        if (header && header === `Bearer ${this._token}`) {
            return true;
        }

        header = msg.get_request_headers().get_one('X-Api-Key');
        if (header && header === this._token) {
            return true;
        }

        return false;
    }

    /**
     * The human readable name of a plugin instance, as configured by the
     * user (e.g. "Living room bridge"). Falls back to the plugin name for
     * plugins that only ever have a single instance (nanoleaf, shelly, ...).
     *
     * @method _instanceName
     * @private
     */
    _instanceName(instance) {
        if (instance._pluginSettings &&
            instance._pluginSettings[instance.id] &&
            instance._pluginSettings[instance.id]['name']) {

            return instance._pluginSettings[instance.id]['name'];
        }
        return instance.pluginName;
    }

    /**
     * Resolves a user-supplied key against a map of id -> object, first as
     * an exact id match, then (case-insensitively) by the name of the
     * object as returned by nameFn. Names are what users see and set on
     * their devices/plugins, and (unlike ids) stay the same across
     * restarts, so they are the recommended way to address things over
     * the API.
     *
     * @method _resolveByNameOrId
     * @private
     * @return {Object} {status: 'ok'|'ambiguous'|'none', id}
     */
    _resolveByNameOrId(map, key, nameFn) {
        if (map[key] !== undefined) {
            return {'status': 'ok', 'id': key};
        }

        let lower = key.toLowerCase();
        let matches = [];

        for (let id in map) {
            let name = nameFn(map[id]);
            if (name && name.toLowerCase() === lower) {
                matches.push(id);
            }
        }

        if (matches.length === 1) {
            return {'status': 'ok', 'id': matches[0]};
        }
        if (matches.length > 1) {
            return {'status': 'ambiguous'};
        }
        return {'status': 'none'};
    }

    /**
     * Resolves a plugin instance by its id or by its configured name.
     *
     * @method _resolvePlugin
     * @private
     * @return {Array} [status, pluginID, instance]
     */
    _resolvePlugin(key) {
        let result = this._resolveByNameOrId(
            this._smarthome.instances,
            key,
            (instance) => this._instanceName(instance)
        );

        if (result.status !== 'ok') {
            return [result.status, null, null];
        }

        return [result.status, result.id, this._smarthome.instances[result.id]];
    }

    /**
     * Resolves a device by its id or by its name within one plugin instance.
     *
     * @method _resolveDevice
     * @private
     * @return {Object} {status, id}
     */
    _resolveDevice(instance, key) {
        return this._resolveByNameOrId(
            instance.data['devices'],
            key,
            (device) => device['name']
        );
    }

    /**
     * Resolves a group by its id or by its name within one plugin instance.
     * '_all_' always resolves to itself.
     *
     * @method _resolveGroup
     * @private
     * @return {Object} {status, id}
     */
    _resolveGroup(instance, key) {
        if (key === '_all_') {
            return {'status': 'ok', 'id': '_all_'};
        }

        return this._resolveByNameOrId(
            instance.data['groups'],
            key,
            (group) => group['name']
        );
    }

    /**
     * Resolves which device ids a scene/effect 'activate' should be applied
     * to. A scene's 'associated' list mixes real device ids with the ids of
     * groups (and '_all_') it can also be triggered from, so it can't be
     * forwarded to sceneGroup() as-is - only real devices are kept.
     *
     * If body.target is given, scope the activation to that one device
     * instead (resolved by id or name, same as everywhere else).
     *
     * @method _resolveSceneTargets
     * @private
     * @return {Object} {status: 'ok', ids} or {status: 'ambiguous'|'none'}
     */
    _resolveSceneTargets(instance, sceneDevice, body) {
        if (body && body['target']) {
            let resolved = this._resolveDevice(instance, body['target']);
            if (resolved.status !== 'ok') {
                return {'status': resolved.status};
            }
            return {'status': 'ok', 'ids': [resolved.id]};
        }

        let associated = sceneDevice['associated'] || [];
        let ids = associated.filter((a) => {
            let candidate = instance.data['devices'][a];
            return candidate && candidate['type'] === 'device';
        });
        return {'status': 'ok', 'ids': ids};
    }

    _pluginSummary(pluginID, instance) {
        return {
            'pluginID': pluginID,
            'pluginName': instance.pluginName,
            'id': instance.id,
            'name': this._instanceName(instance)
        };
    }

    _listPlugins() {
        let out = [];
        for (let pluginID in this._smarthome.instances) {
            let instance = this._smarthome.instances[pluginID];
            if (! instance) {
                continue;
            }
            out.push(this._pluginSummary(pluginID, instance));
        }
        return out;
    }

    _listSync() {
        let out = [];

        for (let pluginID in this._smarthome.instances) {
            let instance = this._smarthome.instances[pluginID];
            if (! instance || instance.pluginName !== Utils.SETTINGS_PHILIPSHUEDESKTOPSYNC) {
                continue;
            }
            if (! instance.data) {
                continue;
            }

            let modes = {};
            let active = false;

            for (let id in instance.data['devices']) {
                if (id === 'sync-screen' || id === 'sync-music' || id === 'sync-cursor' ||
                    id.startsWith('sync-screen:')) {

                    let on = !!instance.data['devices'][id]['switch'];
                    modes[id] = on;
                    if (on) {
                        active = true;
                    }
                }
            }

            out.push(Object.assign(this._pluginSummary(pluginID, instance), {
                'active': active,
                'modes': modes
            }));
        }

        return out;
    }

    _setSync(instance, body) {
        let mode = body['mode'];

        if (! mode || mode === 'off') {
            for (let id in instance.data['devices']) {
                if (SYNC_DEVICE_IDS.includes(id) || id.startsWith('sync-screen:')) {
                    if (instance.data['devices'][id]['switch']) {
                        instance.switchSingle(id, false);
                    }
                }
            }
            return true;
        }

        if (! SYNC_DEVICE_IDS.includes(mode)) {
            return false;
        }

        let targetId = mode;
        if (mode === 'sync-screen' && Number.isInteger(body['display'])) {
            targetId = `sync-screen:${body['display']}`;
        }

        if (instance.data['devices'][targetId] === undefined) {
            return false;
        }

        instance.switchSingle(targetId, true);
        return true;
    }

    _handleRequest(server, msg, path, query) {
        Utils.logDebug(`API request: ${msg.get_method()} ${path}`);

        if (! this._checkAuth(msg)) {
            this._sendError(msg, 401, 'Missing or invalid API token.');
            return;
        }

        let parts = path.split('/').filter((p) => p.length > 0);

        if (parts.length < API_PREFIX.length ||
            API_PREFIX.some((p, i) => parts[i] !== p)) {
            this._sendError(msg, 404, 'Unknown endpoint.');
            return;
        }

        parts = parts.slice(API_PREFIX.length);
        let method = msg.get_method();

        try {
            this._route(msg, method, parts, query);
        } catch (e) {
            Utils.logError(`API request failed: ${e}:\n${e.stack}`);
            this._sendError(msg, 500, 'Internal error.');
        }
    }

    _route(msg, method, parts, query) {
        /* GET /plugins */
        if (parts.length === 1 && parts[0] === 'plugins' && method === 'GET') {
            this._sendJson(msg, 200, this._listPlugins());
            return;
        }

        /* GET /sync */
        if (parts.length === 1 && parts[0] === 'sync' && method === 'GET') {
            this._sendJson(msg, 200, this._listSync());
            return;
        }

        /* POST /sync/<pluginID> */
        if (parts.length === 2 && parts[0] === 'sync' && method === 'POST') {
            let [status, , instance] = this._resolvePlugin(parts[1]);
            if (status === 'ambiguous') {
                this._sendError(msg, 409, 'Multiple plugin instances match that name.');
                return;
            }
            if (status !== 'ok' || instance.pluginName !== Utils.SETTINGS_PHILIPSHUEDESKTOPSYNC) {
                this._sendError(msg, 404, 'Unknown desktop sync plugin instance.');
                return;
            }
            if (! instance.data) {
                this._sendError(msg, 503, 'Plugin instance data not ready yet.');
                return;
            }

            let body = this._readJsonBody(msg);
            if (body === null) {
                this._sendError(msg, 400, 'Invalid JSON body.');
                return;
            }

            if (! this._setSync(instance, body)) {
                this._sendError(msg, 400, 'Invalid sync mode.');
                return;
            }

            this._sendJson(msg, 200, {'ok': true});
            return;
        }

        /* GET /plugins/<pluginID> */
        if (parts.length === 2 && parts[0] === 'plugins' && method === 'GET') {
            let [status, pluginID, instance] = this._resolvePlugin(parts[1]);
            if (status === 'ambiguous') {
                this._sendError(msg, 409, 'Multiple plugin instances match that name.');
                return;
            }
            if (status !== 'ok') {
                this._sendError(msg, 404, 'Unknown plugin instance.');
                return;
            }

            this._sendJson(msg, 200, Object.assign(this._pluginSummary(pluginID, instance), {
                'data': instance.data ? instance.data : {'config': {}, 'devices': {}, 'groups': {}}
            }));
            return;
        }

        /* POST /plugins/<pluginID>/devices/<deviceID>/<action> */
        /* POST /plugins/<pluginID>/groups/<groupID>/<action> */
        if (parts.length === 5 && parts[0] === 'plugins' &&
            (parts[2] === 'devices' || parts[2] === 'groups') && method === 'POST') {

            let kind = parts[2];
            let targetKey = parts[3];
            let action = parts[4];

            let [pluginStatus, , instance] = this._resolvePlugin(parts[1]);
            if (pluginStatus === 'ambiguous') {
                this._sendError(msg, 409, 'Multiple plugin instances match that name.');
                return;
            }
            if (pluginStatus !== 'ok') {
                this._sendError(msg, 404, 'Unknown plugin instance.');
                return;
            }
            if (! instance.data) {
                this._sendError(msg, 503, 'Plugin instance data not ready yet.');
                return;
            }

            let body = this._readJsonBody(msg);
            if (body === null) {
                this._sendError(msg, 400, 'Invalid JSON body.');
                return;
            }

            if (kind === 'devices') {
                let resolved = this._resolveDevice(instance, targetKey);
                if (resolved.status === 'ambiguous') {
                    this._sendError(msg, 409, 'Multiple devices match that name. Use its id instead (see GET .../plugins/<pluginID>).');
                    return;
                }
                if (resolved.status !== 'ok') {
                    this._sendError(msg, 404, 'Unknown device.');
                    return;
                }

                let targetId = resolved.id;
                let device = instance.data['devices'][targetId];

                if (action === 'activate') {
                    if (! device['capabilities'] || ! device['capabilities'].includes('activate')) {
                        this._sendError(msg, 400, `Device does not support 'activate'.`);
                        return;
                    }

                    let sceneTargets = this._resolveSceneTargets(instance, device, body);
                    if (sceneTargets.status === 'ambiguous') {
                        this._sendError(msg, 409, 'Multiple devices match that target name.');
                        return;
                    }
                    if (sceneTargets.status !== 'ok') {
                        this._sendError(msg, 404, 'Unknown target device.');
                        return;
                    }

                    instance.sceneGroup(targetId, sceneTargets.ids);
                    this._sendJson(msg, 200, {'ok': true});
                    return;
                }

                let action_ = deviceActions[action];
                if (! action_) {
                    this._sendError(msg, 404, 'Unknown action.');
                    return;
                }

                if (! device['capabilities'] || ! device['capabilities'].includes(action_.capability)) {
                    this._sendError(msg, 400, `Device does not support '${action}'.`);
                    return;
                }

                action_.run(instance, targetId, body);
                this._sendJson(msg, 200, {'ok': true});
                return;
            }

            let resolved = this._resolveGroup(instance, targetKey);
            if (resolved.status === 'ambiguous') {
                this._sendError(msg, 409, 'Multiple groups match that name. Use its id instead (see GET .../plugins/<pluginID>).');
                return;
            }
            if (resolved.status !== 'ok') {
                this._sendError(msg, 404, 'Unknown group.');
                return;
            }

            let targetId = resolved.id;

            let action_ = groupActions[action];
            if (! action_) {
                this._sendError(msg, 404, 'Unknown action.');
                return;
            }

            let ids = resolveGroupIds(instance, targetId);
            if (ids.length === 0) {
                this._sendError(msg, 400, 'Group has no controllable devices.');
                return;
            }

            action_.run(instance, targetId, ids, body);
            this._sendJson(msg, 200, {'ok': true});
            return;
        }

        this._sendError(msg, 404, 'Unknown endpoint.');
    }
}

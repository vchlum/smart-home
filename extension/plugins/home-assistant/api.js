'use strict';

/**
 * extension smart-home
 * JavaScript - Home Assistant api.
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
import GObject from 'gi://GObject';
import * as Avahi from '../../avahi.js';
import * as Utils from '../../utils.js';

export const RequestType = {
    NO_RESPONSE_NEED: 0,
    CHANGE_OCCURRED: 1,
    CONFIG: 2,
    STATES: 3,
    AREAS: 4,
};

const Message = class Message extends Soup.Message {

    constructor(params) {

        super(params);

        this.requestType = RequestType.NO_RESPONSE_NEED;

        Object.assign(this, params);
    }
};

export const DiscoveryHomeAssistant = GObject.registerClass({
    GTypeName: 'SmartHomeDiscoveryHomeAssistant',
    Signals: {
        'discoverFinished': {},
    }
}, class DiscoveryHomeAssistant extends GObject.Object {

    _init(props={}) {
        super._init(props);
        this.discovered = [];
    }

    discover() {
        this._avahi = new Avahi.Avahi({ service: "_home-assistant._tcp"});
        this._avahi.connect(
            'finished',
            () => {
                this.discovered = this._avahi.discovered;
                this.emit('discoverFinished');
            }
        );
        this._avahi.connect(
            "error",
            () => {
                this.emit('discoverFinished');
            }
        );
        this._avahi.discover();
    }
})

export const HomeAssistantBridge =  GObject.registerClass({
    GTypeName: 'SmartHomeHomeAssistantBridgeApi',
    Properties: {
        'ip': GObject.ParamSpec.string('ip', 'ip', 'ip', GObject.ParamFlags.READWRITE, null),
        'port': GObject.ParamSpec.string('port', 'port', 'port', GObject.ParamFlags.READWRITE, null),
        'token': GObject.ParamSpec.string('token', 'token', 'token', GObject.ParamFlags.READWRITE, null),
    },
    Signals: {
        'change-occurred': {},
        'config': {},
        'states': {},
        'areas': {},
        'connection-problem': {},
        'ws-authenticated': {},
        'ws-data': {},
    }
}, class HomeAssistantBridge extends GObject.Object {

    _init(props={}) {
        super._init(props);

        this._connected = false;
        this._session = Soup.Session.new();
        this._session.timeout = Utils.HOMEASSISTANT_DEFAULT_TIMEOUT;
        this._signalsWs = [];
        this._timers = [];

        this.authWebSocket();
    }

    _adjustUrlAndWs() {
        this._url = `${this._ip}:${this._port ? this._port : 8123}/api`;
        this._ws = `${this._ip}:${this._port ? this._port : 8123}/api/websocket`;

        if (! this._ip.startsWith('http')) {
            this._url = `http://${this._url}`;
            this._ws = `ws://${this._ws}`;
        }

        if (this._ws.startsWith('http')) {
            this._ws = this._ws.replace(/(^http)/gi, 'ws');
        }
    }

    set ip(value) {
        this._ip = value; // value can contain http(s)
        this._adjustUrlAndWs();
    }

    get ip() {
        return this._ip;
    }

    set port(value) {
        this._port = value;
        this._adjustUrlAndWs();
    }

    get port() {
        return this._port;
    }

    set token(value) {
        this._accessToken = value;
    }

    get token() {
        return this._accessToken;
    }

    setConnectionTimeout(value) {
        this._session.timeout = value;
    }

    _POST(url, requestType, data) {

        return this._request("POST", url, requestType, data);
    }

    _PUT(url, requestType, data) {

        return this._request("PUT", url, requestType, data);
    }

    _PATCH(url, requestType, data) {
        return this._request("PATCH", url, requestType, data);
    }

    _GET(url, requestType) {

        return this._request("GET", url, requestType, null);
    }

    _parseResponse(method, url, requestType, data) {
        Utils.logDebug(`Home Assistant API: ${method} responded, url: ${url}`);

        try {
            this._connected = true;
            this.data = JSON.parse(data);
        } catch {
            Utils.logError(`Home Assistant API: ${method}, url: ${url}, failed to parse JSON.`);
            this.data = [];
            return;
        }

        switch (requestType) {

            case RequestType.CHANGE_OCCURRED:
                this.emit('change-occurred');
                break;

            case RequestType.CONFIG:
                this.emit('config');
                break;

            case RequestType.STATES:
                this.emit('states');
                break;

            case RequestType.AREAS:
                this.emit('areas');
                break;

            case RequestType.NO_RESPONSE_NEED:
                break;

            default:
                break;
        }
    }

    _request(method, url, requestType, data) {
        if (this._ip === null) {
            Utils.logError(`Home Assistant API is missing IP address.`);
            return;
        }

        Utils.logDebug(`Home Assistant API: ${method} request, url: ${url} data: ${JSON.stringify(data)}`);

        let msg = Message.new(method, url);

        msg.requestType = requestType;
        msg.request_headers.append("ssl", "False");
        if (this._accessToken !== "") {
            msg.request_headers.append("Authorization", `Bearer ${this._accessToken}`);
        }

        if (data !== null) {
            msg.set_request_body_from_bytes(
                "application/json",
                new GLib.Bytes(JSON.stringify(data))
            );
        }

        this._session.send_and_read_async(
            msg,
            Soup.MessagePriority.NORMAL,
            null,
            (session, res) => {
                switch (msg.get_status()) {
                    case Soup.Status.OK:
                        try {
                            const bytes = session.send_and_read_finish(res);
                            let decoder = new TextDecoder();
                            let response = decoder.decode(bytes.get_data());
                            this._parseResponse(method, url, requestType, response);
                        } catch {
                            this._connectionProblem(requestType);
                        }
                        break;

                    case Soup.Status.ACCEPTED:
                        if (requestType === RequestType.CHANGE_OCCURRED) {
                            this.emit('change-occurred');
                        }
                        break;

                    default:
                        this._connectionProblem(requestType);
                        break;
                }
            }
        );
    }

    authWebSocket() {
        if (this._wsSession) {
            return;
        }

        if (this._accessToken === undefined) {
            return;
        }

        this._wsSession = Soup.Session.new();
        let msg = new Soup.Message({
            method: 'GET',
            uri: GLib.Uri.parse(this._ws, GLib.UriFlags.NONE)
        });

        msg = Soup.Message.new("GET", this._ws),

        msg.request_headers.append("ssl", "False");

        this._wsSession.websocket_connect_async(
            msg,
            null,
            null,
            null,
            null,
            this._authWebSocketCallback.bind(this)
        );
    }

    _authWebSocketCallback(session, res) {
        let signal;
        try {
            this._wsConnection = session.websocket_connect_finish(res);
        } catch {
            this._wsSession = undefined;
            return;
        }

        if (!this._wsConnection) {
            return;
        }

        signal = this._wsConnection.connect(
            'closed',
            this._disconnectWs.bind(this)
        );
        this._signalsWs.push(signal);

        signal = this._wsConnection.connect(
            'error',
            this._disconnectWs.bind(this)
        );
        this._signalsWs.push(signal);

        signal = this._wsConnection.connect(
            'message',
            (connection, type, data) => {
                let decoder = new TextDecoder();
                let message = decoder.decode(data.toArray());

                try {
                    this._connected = true;
                    this.data = JSON.parse(message);
                    if (this.data['type'] === 'auth_ok') {
                        this.wsAuth = true;
                        this.emit('ws-authenticated');

                        this._subscribeEventStream();
                    } else {
                        if (this.wsAuth) {
                            this.emit('ws-data');
                        }
                    }
                } catch {
                    Utils.logDebug(`Home Assistant API event, failed to parse JSON.`);
                    this.data = [];
                    return;
                }
            }
        );
        this._signalsWs.push(signal);

        this.wssRequest(
            {
                "type": "auth",
                "access_token": `${this._accessToken}`
            }
        );
    }

    _disconnectWs() {
        if (this._wsConnection) {
            while (this._signalsWs.length > 0) {
                let signal = this._signalsWs.pop();
                this._wsConnection.disconnect(signal);
            }
            this._wsConnection = undefined;
        }

        if (this._wsSession) {
            this._wsSession = undefined;
        }
    }

    wssRequest(data) {
        if (this._wsConnection === undefined) {
            return;
        }

        this._wsConnection.send_text(
            JSON.stringify(data)
        );
    }

    _subscribeEventStream(){
        this.wssRequest(
            {
                "id": 18,
                "type": "subscribe_events",
                "event_type": "state_changed"
              }
        );
    }

    getConfig() {
        this._GET(`${this._url}/config`, RequestType.CONFIG);
    }

    getStates() {
        this._GET(`${this._url}/states`, RequestType.STATES);
    }

    getAreas() {
        let data = {
            "template": '{\
            {% for area in areas() %} \
                "{{area}}": {"name":"{{area_name(area)}}", "devices":[\
                {% for device in area_devices(area) %}\
                    "{{ "\\",\\"".join(device_entities(device)) }}" \
                    {{ "," if not loop.last }}\
                {% endfor %} ]}\
                {{ "," if not loop.last }}\
            {% endfor %} }'
        };
        this._POST(`${this._url}/template`, RequestType.AREAS, data);
    }

    setState(id, data, change = false) {
        this._POST(`${this._url}/states/${id}`, change ? RequestType.CHANGE_OCCURRED : RequestType.NO_RESPONSE_NEED, data)
    }

    setService(service, request, data, change = false) {
        this._POST(`${this._url}/services/${service}/${request}`, change ? RequestType.CHANGE_OCCURRED : RequestType.NO_RESPONSE_NEED, data)
    }

    setServiceOn(service, data, change = false) {
        this._POST(`${this._url}/services/${service}/turn_on`, change ? RequestType.CHANGE_OCCURRED : RequestType.NO_RESPONSE_NEED, data)
    }

    setServiceOff(service, data, change = false) {
        this._POST(`${this._url}/services/${service}/turn_off`, change ? RequestType.CHANGE_OCCURRED : RequestType.NO_RESPONSE_NEED, data)
    }

    _connectionProblem(requestType) {
        this.data = [];
        if (! this._connected) {
            return;
        }

        this._disconnectWs();

        this._connected = false;
        if (requestType !== RequestType.NO_RESPONSE_NEED) {
            this.emit('connection-problem');
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

    clear() {
        this.clearTimers();
    }
});

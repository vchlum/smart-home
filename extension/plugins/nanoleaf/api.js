'use strict';

/**
 * extension smart-home
 * JavaScript Nanoleaf API.
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

import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import * as Utils from '../../utils.js';
import * as Avahi from '../../avahi.js';

export const DiscoveryNanoleafs = GObject.registerClass({
    GTypeName: 'SmartHomeDiscoveryNanoleafs',
    Signals: {
        'discoverFinished': {},
    }
}, class DiscoveryNanoleafs extends GObject.Object {
    _init(props={}) {
        super._init(props);
        this.discoveredDevices = [];
    }

    discover() {
        this._avahi = new Avahi.Avahi({ service: '_nanoleafapi._tcp'});
        this._avahi.connect(
            'finished',
            () => {
                this.discoveredDevices = this._avahi.discovered;
                this.emit('discoverFinished');
            }
        );
        this._avahi.connect(
            'error',
            () => {
                this.emit('discoverFinished');
            }
        );
        this._avahi.discover();
    }
})

export const EventTypes = {
    0: 'unknown',
    1: 'state',
    2: 'layout',
    3: 'effects',
    4: 'touch'
}

export const EventStateTypes = {
    1: 'on',
    2: 'brightness',
    3: 'hue',
    4: 'saturation',
    5: 'cct',
    6: 'colorMode'
}

const RequestType = {
    NO_RESPONSE_NEED: 0,
    SELF_CHECK: 1,
    AUTHORIZATION: 2,
    CHANGE_OCCURRED: 3,
    ALL_DATA: 4,
    STATE: 5,
    ALL_EFFECTS: 6,
    CURRENT_EFFECT: 7,
    EVENT: 8,
    EVENT_STATE: 9,
    EVENT_EFFECTS: 10
};

const Message = class Message extends Soup.Message {

    constructor(params) {

        super(params);

        this.requestType = RequestType.NO_RESPONSE_NEED;

        Object.assign(this, params);
    }
};

export const NanoLightsDevice =  GObject.registerClass({
    GTypeName: 'SmartHomeNanoLightsApi',
    Properties: {
        "id": GObject.ParamSpec.string("id", "id", "id", GObject.ParamFlags.READWRITE, null),
        "ip": GObject.ParamSpec.string("ip", "ip", "ip", GObject.ParamFlags.READWRITE, null),
        "token": GObject.ParamSpec.string("token", "token", "token", GObject.ParamFlags.READWRITE, null),
        "port": GObject.ParamSpec.string("port", "port", "port", GObject.ParamFlags.READWRITE, null)
    },
    Signals: {
        'authorized': {},
        'self-check': {},
        'all-data': {},
        'state': {},
        'change-occurred': {},
        'all-effects': {},
        'current-effect': {},
        'event-state': {},
        'event-effects': {},
        'connection-problem': {},
    }
}, class NanoLightsDevice extends GObject.Object {
    _init(props={}) {
        this._baseUrl = "http://";
        this._defaultPort = "16021"

        super._init(props);

        this._timers = [];
        this._connected = false;

        this.name = "unknown name";

        this._session = Soup.Session.new();
        this._session.timeout = Utils.NANOLEAF_DEFAULT_TIMEOUT;

        this._enableEventStream();
    }

    set id(value) {
        this._id = value;
    }

    get id() {
        return this._id;
    }

    set ip(value) {
        this._ip = value;
        this._baseUrl = `http://${this._ip}:${this._defaultPort}/api/v1`;
    }

    get ip() {
        return this._ip;
    }

    set token(value) {
        this._authToken = value;
    }

    get token() {
        return this._authToken;
    }

    set port(value) {
        this._defaultPort = value;
        this._baseUrl = `http://${this._ip}:${this._defaultPort}/api/v1`;
    }

    get port() {
        return this._defaultPort;
    }

    setConnectionTimeout(value) {
        this._session.timeout = value;
    }

    update(data) {

        if (data['ip'] != undefined){
            this.ip = data['ip'];
        }

        if (data['hostname'] != undefined){
            this.name = data['hostname'];
        }

        if (data['name'] != undefined){
            this.name = data['name'];
        }

        if (data['auth_token'] != undefined){
            this._authToken = data['auth_token'];
        }

    }

    export() {
        let data = {};

        data[this._id] = {'ip': this._ip, 'port': this._defaultPort, 'name': this.name, 'auth_token': this._authToken};

        return data;
    }

    isConnected() {
        return this._connected;
    }

    isAuthenticated() {
        if (this._authToken !== "") {
            return true;
        }

        return false;
    }

    _parseResponse(method, url, requestType, data) {
        Utils.logDebug(`Device ${method} responded OK to url: ${url}`);

         try {
            this._connected = true;

            switch (requestType) {
                case RequestType.CURRENT_EFFECT:
                    this.data = data;
                    break;

                default:
                    this.data = JSON.parse(data);
                    break;
            }

        } catch {
            Utils.logError(`Device ${method} responded, failed to parse JSON`);
            this.data = [];
        }

        switch (requestType) {
            case RequestType.AUTHORIZATION:
                this.token = this.data['auth_token'];
                this.emit('authorized');
                break;

            case RequestType.SELF_CHECK:
                this.id =  this.data['serialNo'];
                this._connected = true;
                this.emit('self-check');
                break;

            case RequestType.CHANGE_OCCURRED:
                this.emit('change-occurred');
                break;

            case RequestType.ALL_DATA:
                this.emit('all-data');
                break;

            case RequestType.STATE:
                this.emit('state');
                break;

            case RequestType.ALL_EFFECTS:
                this.emit('all-effects');
                break;

            case RequestType.CURRENT_EFFECT:
                this.emit('current-effect');
                break;

            case RequestType.EVENT_STATE:
                this.emit('event-state');
                break;

            case RequestType.EVENT_EFFECTS:
                this.emit('event-effects');
                break;

            case RequestType.NO_RESPONSE_NEED:
                /* no signal emitted, request does not need response */
                break;

            default:
        }
    }

    _request(method, url, requestType, data, counter = 0) {
        Utils.logDebug(`Nanoleaf device ${method} request, url: ${url} data: ${JSON.stringify(data)}`);

        let msg = Message.new(method, url);

        msg.requestType = requestType;

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
                switch(msg.get_status()) {
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

                    case Soup.Status.NO_CONTENT:
                        this._connected = true;
                        if (RequestType.CHANGE_OCCURRED) {
                            this.emit('change-occurred');
                            break;
                        }
                        break;

                    case Soup.Status.NONE:
                        /* try again - beta fw of HSL causes this return code sometaimes */
                        if (counter < 3) {
                            this._request(method, url, requestType, data, ++counter);
                        }
                        break;

                    default:
                        this._connectionProblem(requestType);
                        break;
                }
            }
        );
    }

    async keepEventStreamRequest() {
        let runRequests = false;

        if (! this._eventStreamCancelleable) {
            this._eventStreamCancelleable = new Gio.Cancellable();
            runRequests = true;
        }

        if (this._eventStreamCancelleable.is_cancelled()) {
            this._eventStreamCancelleable.reset();
            runRequests = true;
        }

        if (! runRequests) {
            return;
        }

        while (true) {
            try {
                await this._requestEventStreamData();
            } catch {
                this.stopEventStreamRequest();
                break;
            }
        }
    }

    _enableEventStream(){
        if (this._authToken === undefined) {
            return;
        }

        if (this._sessionEventstream) {
            return;
        }

        this._eventStreamUrl = `${this._baseUrl}/${this._authToken}/events?id=1,3`

        this._sessionEventstream = Soup.Session.new();
        this._sessionEventstream.timeout = 0;

    }

    stopEventStreamRequest() {
        if (! this._sessionEventstream) {
            return;
        }

        if (! this._eventStreamCancelleable) {
            return;
        }

        Utils.logDebug(`Stopping event stream on: ${this._eventStreamUrl}`);

        this._eventStreamCancelleable.cancel();
        this._sessionEventstream.abort();

        this._eventStreamCancelleable = null;
    }

    _requestEventStreamData() {
        return new Promise((resolve, reject) => {
            let method = "GET";
            let requestType = RequestType.EVENT;

            Utils.logDebug(`Nanoleaf event stream: ${method} requested, url: ${this._eventStreamUrl}`);

            let msg = Message.new(method, this._eventStreamUrl);

            msg.requestHueType = requestType;
            msg.request_headers.append("Accept", "text/event-stream");

            this._eventBuffer = "";

            this._sessionEventstream.send_async(
                msg,
                Soup.MessagePriority.NORMAL,
                this._eventStreamCancelleable,
                async (session, res) => {
                    let statusCode;
                    let inputStream;

                    try {
                        inputStream = session.send_finish(res);
                    } catch {
                        reject(`Failed to get input stream.`);
                    }

                    try {
                        statusCode = msg.get_status();
                    } catch {
                        /* Soap does not know status code 429, try reread... */
                        resolve();
                        return;
                    }

                    switch (statusCode) {
                        case Soup.Status.OK:
                            while (true) {
                                try {
                                    await this._readEventStream(inputStream, requestType);
                                } catch {
                                    reject("Reading event stream ended.");
                                    break;
                                }
                            }
                            break;

                        default:
                        case Soup.Status.NONE:
                        case Soup.Status.CANCELLED:
                            reject(`Event stream ${this._eventStreamUrl} status code ${statusCode}`);
                            break;
                    }
                }
            );
        });
    }

    _readEventStream(inputStream, requestType) {
        return new Promise((resolve, reject) => {
            let eventType = 0;
            inputStream.read_bytes_async(
                1024,
                GLib.PRIORITY_DEFAULT,
                this._eventStreamCancelleable,
                (stream, res) => {
                    let bytes;
                    let decoder;
                    let response;
                    try {
                        bytes = stream.read_bytes_finish(res);
                    } catch {
                        reject("Stream reading not finished.");
                        return;
                    }
                    decoder = new TextDecoder();
                    response = decoder.decode(bytes.get_data());

                    this._eventBuffer += response;

                    let messages = this._eventBuffer.split('\n');

                    /* save incomplete message */
                    this._eventBuffer = messages.pop();

                    messages.forEach(message => {
                        /* split by first colon */
                        let msg = message.split(/:(.*)/s);
                        switch (msg[0].trim()) {
                            case 'data':
                                switch (EventTypes[eventType]) {
                                    case 'state':
                                        requestType = RequestType.EVENT_STATE;
                                        break;
                                    
                                    case 'effects':
                                        requestType = RequestType.EVENT_EFFECTS;
                                        break;

                                    default:
                                        requestType = RequestType.EVENT;
                                        break;
                                }
                                this._parseResponse('GET', this._eventStreamUrl, requestType, msg[1].trim());
                                break;

                            case 'id':
                                eventType = Number(msg[1].trim());
                                break;

                            default:
                                break;
                        }
                    });

                    resolve();
                }
            );
        });
    }

    /**
     * POST requst to url of a device.
     * 
     * @method _devicePOST
     * @private
     * @param {Boolean} url to be requested
     * @param {Object} input data
     * @return {Object} JSON with response
     */
    _POST(url, requestType, data = null) {

        this._request("POST", url, requestType, data);
    }

    /**
     * PUT requst to url of a device.
     * 
     * @method _devicePUT
     * @private
     * @param {Boolean} url to be requested
     * @param {Object} input data
     * @return {Object} JSON with response
     */
    _PUT(url, requestType, data) {

        this._request("PUT", url, requestType, data);
    }

    /**
     * GET requst to url of a device.
     * 
     * @method _deviceGET
     * @private
     * @param {Boolean} url to be requested
     * @return {Object} JSON with response
     */
    _GET(url, requestType) {

        this._request("GET", url, requestType, null);
    }

    /**
     * DEL requst to url of a device.
     * 
     * @method _deviceDEL
     * @private
     * @param {Boolean} url to be requested
     * @return {Object} JSON with response
     */
     _DELETE(url, requestType) {

        this._request("DELETE", url, requestType, null);
    }

    authorizate() {
        let url = `${this._baseUrl}/new`;

        this._POST(url, RequestType.AUTHORIZATION);
    }

    selfCheck() {
        let url = `${this._baseUrl}/${this._authToken}`;

        this._GET(url, RequestType.SELF_CHECK);
    }

    getDeviceInfo() {
        let url = `${this._baseUrl}/${this._authToken}`;

        this._GET(url, RequestType.ALL_DATA);
    }

    getDeviceState() {
        let url = `${this._baseUrl}/${this._authToken}/state`;

        this._GET(url, RequestType.STATE);
    }

    getDeviceAllEffects() {
        let url = `${this._baseUrl}/${this._authToken}/effects`;
        let data = { "write" : {"command" : "requestAll" }};

        this._PUT(url, RequestType.ALL_EFFECTS, data);
    }

    getDeviceCurrentEffect() {
        let url = `${this._baseUrl}/${this._authToken}/effects/select`;

        this._GET(url, RequestType.CURRENT_EFFECT);
    }

    setDeviceState(value) {
        let url = `${this._baseUrl}/${this._authToken}/state`;
        let data = {"on": { "value": value }};

        this._PUT(url, RequestType.CHANGE_OCCURRED, data)
    }

    setDeviceColor(hue, sat) {
        let url = `${this._baseUrl}/${this._authToken}/state`;
        let data = {"hue": { "value": hue }, "sat": { "value": sat }};

        this._PUT(url, RequestType.CHANGE_OCCURRED, data)
    }

    setDeviceHsv(hue, sat, bri) {
        let url = `${this._baseUrl}/${this._authToken}/state`;
        let data = {"hue": { "value": hue }, "sat": { "value": sat }, "brightness" : { "value": bri, "duration": 0} };

        this._PUT(url, RequestType.CHANGE_OCCURRED, data)
    }

    setDeviceTemperature(value) {
        let url = `${this._baseUrl}/${this._authToken}/state`;
        let data = {"ct": { "value": value }};

        this._PUT(url, RequestType.CHANGE_OCCURRED, data)
    }

    setDeviceBrightness(value, duration) {
        let url = `${this._baseUrl}/${this._authToken}/state`;
        let data = {"brightness" : { "value": value, "duration": duration }};

        this._PUT(url, RequestType.CHANGE_OCCURRED, data)
    }

    setDeviceEffect(effect) {
        let url = `${this._baseUrl}/${this._authToken}/effects`;
        let data = { "select": effect };

        this._PUT(url, RequestType.CHANGE_OCCURRED, data)
    }

    deleteDeviceToken() {
        let url = `${this._baseUrl}/${this._authToken}`;

        this._DELETE(url, RequestType.NO_RESPONSE_NEED);

        this._authToken = "";
        this._connected = false;
    }

    /**
     * Mark problem with connection and emit the situation.
     *
     * @method _connectionProblem
     * @private
     * @param {Object} request nano type
     */
     _connectionProblem(requestType) {
        this.data = [];
        if (! this._connected) {
            return;
        }
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
        this.stopEventStreamRequest();
        this.clearTimers();
    }
})
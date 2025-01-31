'use strict';

/**
 * extension smart-home
 * JavaScript SHELLY API.
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
import * as Utils from '../../utils.js';
import * as Avahi from '../../avahi.js';
import * as hashing from '../../crypto/hashing.js';

export const DiscoveryShelly = GObject.registerClass({
    GTypeName: 'SmartHomeDiscoveryShelly',
    Signals: {
        'discoverFinished': {},
    }
}, class DiscoveryShelly extends GObject.Object {
    _init(props={}) {
        super._init(props);
        this.discoveredDevices = [];
    }

    discover() {
        this._avahi = new Avahi.Avahi({ service: '_shelly._tcp'});
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

const RequestType = {
    SHELLY: 0,
    STATUS: 1,
    CHANGE_OCCURRED: 4,
    NO_RESPONSE_NEED: 5,
};

const Message = class Message extends Soup.Message {

    constructor(params) {

        super(params);

        this.requestType = RequestType.NO_RESPONSE_NEED;

        Object.assign(this, params);
    }
};

export const ShellyDevice =  GObject.registerClass({
    GTypeName: 'SmartHomeShellyApi',
    Properties: {
        "id": GObject.ParamSpec.string("id", "id", "id", GObject.ParamFlags.READWRITE, null),
        "ip": GObject.ParamSpec.string("ip", "ip", "ip", GObject.ParamFlags.READWRITE, null),
        "username": GObject.ParamSpec.string("username", "username", "username", GObject.ParamFlags.READWRITE, null),
        "password": GObject.ParamSpec.string("password", "password", "password", GObject.ParamFlags.READWRITE, null),
        "gen": GObject.ParamSpec.int("gen", "gen", "gen", GObject.ParamFlags.READWRITE, 0, 1000, 0),
    },
    Signals: {
        'shelly': {},
        'status': {},
        'change-occurred': {},
        'connection-problem': {},
    }
}, class ShellyDevice extends GObject.Object {
    _init(props={}) {
        this._baseUrl = "http://";
        this._gen = 0;
        this._username = "admin";
        this._password = "";

        super._init(props);

        this._timers = [];
        this._connected = false;

        this._session = Soup.Session.new();
        this._session.timeout = Utils.SHELLY_DEFAULT_TIMEOUT;
    }

    set id(value) {
        this._id = value;
    }

    get id() {
        return this._id;
    }

    set ip(value) {
        this._ip = value;
        this._baseUrl = `http://${this._ip}`;
    }

    get ip() {
        return this._ip;
    }

    set username(value) {
        this._username = value;
    }

    get username() {
        return this._username;
    }

    set password(value) {
        this._password = value;
    }

    get password() {
        return this._password;
    }

    set gen(value) {
        this._gen = value;
    }

    get gen() {
        return this._gen;
    }

    setConnectionTimeout(value) {
        this._session.timeout = value;
    }

    isConnected() {
        return this._connected;
    }

    _parseResponse(method, url, requestType, data) {
        Utils.logDebug(`Shelly device ${method} responded OK to url: ${url}`);

         try {
            this._connected = true;

            this.data = JSON.parse(data);

        } catch {
            Utils.logError(`Shelly device ${method} responded, failed to parse JSON`);
            this.data = [];
        }

        switch (requestType) {
            case RequestType.SHELLY:
                this.emit('shelly');
                break;

            case RequestType.STATUS:
                this.emit('status');
                break;

            case RequestType.CHANGE_OCCURRED:
                this.emit('change-occurred');
                break;

            case RequestType.NO_RESPONSE_NEED:
                /* no signal emitted, request does not need response */
                break;

            default:
        }
    }

    _request(method, url, requestType, data, hasAuth) {
        Utils.logDebug(`Shelly device ${method} request, url: ${url} data: ${JSON.stringify(data)}`);

        let msg = Message.new(method, url);

        msg.requestType = requestType;

        if (data !== null) {
            msg.set_request_body_from_bytes(
                "application/json",
                new GLib.Bytes(JSON.stringify(data))
            );
        }

        if (this._gen < 2) {
            let credentials = `${this._username}:${this._password}`;
            msg.request_headers.append(
                "Authorization",
                `Basic ${GLib.base64_encode(credentials)}`
            );
        } else {
            if (data && this._auth && method === 'POST') {
                data['auth'] = this._auth;
            }
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

                    case Soup.Status.UNAUTHORIZED:
                        if (! hasAuth && method === 'POST') {
                            this._auth = this._addAuthToPostData(data, msg.response_headers.get_one('www-authenticate'));
                            data['auth'] = this._auth;
                            this._request(method, url, requestType, data, true);
                        }
                        break;

                    default:
                        this._connectionProblem(requestType);
                        break;
                }
            }
        );
    }

    hashSHA256(input) {
        let tmp = [];
        let output = "";

        let encoder = new TextEncoder();
        const byteArray = encoder.encode(input);

        for (let i in byteArray) {
            tmp.push(byteArray[i]);
        }

        const hash = hashing.hashing.sha256.hash(tmp)

        for (let i in hash) {
            let hex = hash[i].toString(16);
            if (hex.length === 1) {
                hex = `0${hex}`
            }
            output = `${output}${hex}`;
        }

        return output;

    }

    _addAuthToPostData(data, header) {
        let tmp = [];
        let auth = {};

        let realm = /^.*realm="([^"]+)".*$/gm.exec(header);
        let nonce = /^.*nonce="([0-9]+)".*$/gm.exec(header);


        if (!realm[1]) {
            return data;
        }

        if (!nonce[1]) {
            return data;
        }

        realm = realm[1];
        nonce = Number(nonce[1]);

        let cnonce = Math.floor(Math.random() * 899999999)

        tmp = [this._username, realm, this._password];
        let ha1 = this.hashSHA256(tmp.join(":"));

        let ha2 = this.hashSHA256("dummy_method:dummy_uri");


        let response = [ha1, nonce, "1", cnonce, "auth", ha2];
        response = this.hashSHA256(response.join(":"));

        auth = {
                "realm": realm,
                "username": this._username,
                "nonce": nonce,
                "cnonce": cnonce,
                "response": response,
                "algorithm": "SHA-256"
        };

        return auth;
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

    getShelly() {
        let url = `${this._baseUrl}/shelly`;

        this._GET(url, RequestType.SHELLY);
    }

    getStatus() {
        if (this._gen < 2) {
            let url = `${this._baseUrl}/status`;
            this._GET(url, RequestType.STATUS);
        } else {
            let url = `${this._baseUrl}/rpc`;
            let data = {
                "id": 1,
                "method": "Shelly.GetStatus"
            };
            this._POST(url, RequestType.STATUS, data);
        }
    }

    setState(data) {
        if (this._gen < 2) {
            let url = `${this._baseUrl}/${data}`;
            this._GET(url, RequestType.CHANGE_OCCURRED);
        } else {
            let url = `${this._baseUrl}/rpc`;
            this._POST(url, RequestType.CHANGE_OCCURRED, data);
        }
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
        this.clearTimers();
    }
})

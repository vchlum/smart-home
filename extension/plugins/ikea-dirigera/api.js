'use strict';

/**
 * extension smart-home
 * JavaScript - Ikea Dirigera api.
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
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import * as Utils from '../../utils.js';
import * as Avahi from '../../avahi.js';

export const RequestType = {
    NO_RESPONSE_NEED: 0,
    CODE_CHALLENGE: 1,
    AUTHORIZE: 2,
    CHANGE_OCCURRED: 3,
    ALL_DATA: 4
};

const TlsDatabaseBridge = GObject.registerClass({
    Implements: [Gio.TlsFileDatabase],
    Properties: {
        'anchors': GObject.ParamSpec.override('anchors', Gio.TlsFileDatabase),
    },
}, class TlsDatabaseBridge extends Gio.TlsDatabase {

    vfunc_verify_chain(chain, purpose, identity, interaction, flags, cancellable) {
        return 0;
    }
});

const Message = class Message extends Soup.Message {

    constructor(params) {

        super(params);

        this.requestType = RequestType.NO_RESPONSE_NEED;

        Object.assign(this, params);
    }
};

export const DiscoveryIkeaDirigera = GObject.registerClass({
    GTypeName: 'SmartHomeDiscoveryIkeaDirigera',
    Signals: {
        'discoverFinished': {},
    }
}, class DiscoveryIkeaDirigera extends GObject.Object {

    _init(props={}) {
        super._init(props);
        this.discoveredBridges = [];
    }

    discover() {
        this._avahi = new Avahi.Avahi({ service: "_ihsp._tcp"});
        this._avahi.connect(
            'finished',
            () => {
                this.discoveredBridges = this._avahi.discovered;
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

export const IkeaDirigeraBridge =  GObject.registerClass({
    GTypeName: 'SmartHomeIkeaDirigeraBridgeApi',
    Properties: {
        'ip': GObject.ParamSpec.string('ip', 'ip', 'ip', GObject.ParamFlags.READWRITE, null),
        'token': GObject.ParamSpec.string('token', 'token', 'token', GObject.ParamFlags.READWRITE, null),
    },
    Signals: {
        'change-occurred': {},
        'code-challenge': {},
        'authorization-succeed': {},
        'authorization-failed': {},
        'all-data': {},
        'connection-problem': {},
        'event-stream-data': {},
    }
}, class IkeaDirigeraBridge extends GObject.Object {

    _init(props={}) {
        super._init(props);

        this._connected = false;
        this._session = Soup.Session.new();
        this._session.timeout = Utils.IKEADIRIGERA_DEFAULT_TIMEOUT;

        this._timers = [];

        let tlsDatabase =  new TlsDatabaseBridge();
        this._session.tls_database  = tlsDatabase;

        this.keepEventStreamRequest();
    }

    set ip(value) {
        this._ip = value;
        this._url = `https://${this._ip}:8443/v1`;
        this._urlEvents = `wss://${this._ip}:8443/v1`;
    }

    get ip() {
        return this._ip;
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
        Utils.logDebug(`Ikea Dirigera API: ${method} responded, url: ${url}`);

        try {
            this._connected = true;
            this.data = JSON.parse(data);
        } catch {
            Utils.logError(`Ikea Dirigera API: ${method}, url: ${url}, failed to parse JSON.`);
            this.data = [];
            return;
        }

        switch (requestType) {

            case RequestType.CHANGE_OCCURRED:
                this.emit('change-occurred');
                break;

            case RequestType.CODE_CHALLENGE:
                this.emit('code-challenge');
                break;

            case  RequestType.AUTHORIZE:
                this.stopAuthorization();
                this.token = this.data['access_token'];
                this.emit('authorization-succeed');

                Utils.logDebug("Ikea dirigera authorization succeeded.");
                break;

            case RequestType.ALL_DATA:
                this.emit('all-data');
                break;

            case RequestType.NO_RESPONSE_NEED:
                break;

            default:
                break;
        }
    }

    _request(method, url, requestType, data) {
        if (this._ip === null) {
            Utils.logError(`Ikea Dirigera API is missing IP address.`);
            return;
        }

        Utils.logDebug(`Ikea Dirigera API: ${method} request, url: ${url} data: ${JSON.stringify(data)}`);

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

    keepEventStreamRequest(){
        if (this._sessionEvents) {
            return;
        }

        if (this._accessToken === undefined) {
            return;
        }

        let tlsDatabase =  new TlsDatabaseBridge();

        this._sessionEvents = Soup.Session.new();
        this._sessionEvents.tls_database  = tlsDatabase;
        let msg = new Soup.Message({
            method: 'GET',
            uri: GLib.Uri.parse(this._urlEvents, GLib.UriFlags.NONE)
        });
        msg.request_headers.append("ssl", "False");
        msg.request_headers.append("Authorization", `Bearer ${this._accessToken}`);
        this._sessionEvents.websocket_connect_async(
            msg,
            'origin',
            [],
            1,
            null,
            this._enableEventStreamCallback.bind(this)
        );
    }

    _disableEventStream() {
        Utils.logDebug(`Ikea Dirigera disabling event stream, IP ${this._ip}.`);

        if (this._eventsPing) {
            GLib.Source.remove(this._eventsPing);
            this._eventsPing = undefined;
        }

       if (this._connection && this._connection.get_state() === Soup.WebsocketState.OPEN) {
            this._connection.close(Soup.WebsocketCloseCode.NO_STATUS, null);
       }

       this._connection = null;
       this._sessionEvents = undefined;
    }

    _enableEventStreamCallback(session, res) {
        try {
            this._connection = session.websocket_connect_finish(res);
        } catch {
            this._sessionEvents = undefined;
            return;
        }

        if (!this._connection) {
            this._disableEventStream();
        }

        this._connection.connect(
            'closed',
            this._disableEventStream.bind(this)
        );

        this._connection.connect(
            'error',
            this._disableEventStream.bind(this)
        );

        this._connection.connect(
            'message',
            (connection, type, data) => {
                let decoder = new TextDecoder();
                let message = decoder.decode(data.toArray());

                try {
                    this._connected = true;
                    this.data = JSON.parse(message);
                } catch {
                    Utils.logDebug(`Ikea Dirigera API event, failed to parse JSON.`);
                    this.data = [];
                    return;
                }

                this.emit('event-stream-data');
            }
        );

        this._eventsPing = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            if (! this._sessionEvents) {
                return GLib.SOURCE_REMOVE;
            }

            this._connection.send_text("ping");
            return GLib.SOURCE_CONTINUE;
        });
    }

    _getCharChallenge() {
        const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
        const randomIndex = Math.floor(Math.random() * CODE_ALPHABET.length);
        return CODE_ALPHABET[randomIndex];
    }

    hexStringToArray(hexString) {
        if (hexString.length % 2 !== 0) {
            throw new Error("Hex string must have an even length");
        }
        const hexArray = [];
        for (let i = 0; i < hexString.length; i += 2) {
            const hexValue = hexString.slice(i, i + 2);
            hexArray.push(parseInt(hexValue, 16));
        }
        return hexArray;
    }

    createCodeChallenge() {
        const CODE_LENGTH = 128;
        let codeVerifier = "";
        for (let i = 0; i < CODE_LENGTH; i++) {
            codeVerifier += this._getCharChallenge();
        }

        this._authorizeCounter = 0;

        this._codeVerifier = codeVerifier;

        const checksum = new GLib.Checksum(GLib.ChecksumType.SHA256);
        checksum.update(codeVerifier);
        const digest = checksum.get_string();
        const byteArray = this.hexStringToArray(digest);
        const codeChallene = GLib.base64_encode(byteArray) // make it URL-safe
            .replace(/\+/g, '-')  // Replace '+' with '-'
            .replace(/\//g, '_')  // Replace '/' with '_'
            .replace(/=+$/, '');  // Remove padding '='

        let data = `audience=homesmart.local&response_type=code&code_challenge=${codeChallene}&code_challenge_method=S256`;
        this._GET(`${this._url}/oauth/authorize?${data}`, RequestType.CODE_CHALLENGE);
    }

    stopAuthorization() {
        this._authorizeCounter = 999;
    }

    getAuthorized(code) {
        if (this.token) {
            return;
        }

        if (!this._codeVerifier) {
            Utils.logError("Ikea Dirigera authorization error. Call code challenge first.");
            return;
        }

        if (this._authorizeCounter > 15) {
            this.emit('authorization-failed');
            return;
        }

        this._authorizeCounter++;

        let hostname = GLib.get_host_name();
        hostname = hostname.split(".")[0];

        const data = {
            "code": code,
            "name": hostname,
            "grant_type": "authorization_code",
            "code_verifier": this._codeVerifier
        }

        this._POST(`${this._url}/oauth/token`, RequestType.AUTHORIZE, data);

        let timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this.getAuthorized(code);
            this._timers = Utils.removeFromArray(this._timers, timerId);
            return GLib.SOURCE_REMOVE;
        });
        this._timers.push(timerId);
    }

    getAll() {
        this._GET(`${this._url}/devices`, RequestType.ALL_DATA);
    }

    setDevice(id, data, change = false) {
        this._PATCH(`${this._url}/devices/${id}`, change ? RequestType.CHANGE_OCCURRED : RequestType.NO_RESPONSE_NEED, data)
    }

    _connectionProblem(requestType) {
        this.data = [];
        if (! this._connected) {
            return;
        }

        this._disableEventStream();

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

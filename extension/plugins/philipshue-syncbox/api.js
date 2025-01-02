'use strict';

/**
 * extension smart-home
 * JavaScript Philips Hue Sync Box API
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

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';
import GObject from 'gi://GObject';
import * as Utils from '../../utils.js';
import * as Avahi from '../../avahi.js';

const RequestType = {
    NO_RESPONSE_NEED: 0,
    REGISTRATION: 1,
    CHANGE_OCCURRED: 2,
    DEVICE_STATE: 3
};

const Message = class Message extends Soup.Message {

    constructor(params) {

        super(params);

        this.requestType = RequestType.NO_RESPONSE_NEED;

        Object.assign(this, params);
    }
};

const TlsDatabaseSyncBox = GObject.registerClass({
    Implements: [Gio.TlsFileDatabase],
    Properties: {
        'anchors': GObject.ParamSpec.override('anchors', Gio.TlsFileDatabase),
    },
}, class TlsDatabaseSyncBox extends Gio.TlsDatabase {

    vfunc_verify_chain(chain, purpose, identity, interaction, flags, cancellable) {
        return 0;
    }
});

/**
 * DiscoverySyncBox class for discovering device on local network.
 *
 * @class DiscoverySyncBox
 * @return {Object} instance
 */
export const DiscoveryPhilipsSyncBox = GObject.registerClass({
    GTypeName: 'SmartHomeDiscoveryPhilipsSyncBox',
    Signals: {
        'discoverFinished': {},
    }
}, class DiscoveryPhilipsSyncBox extends GObject.Object {

    _init(mainDir, props={}) {
        super._init(props);
        this.discoveredSyncBox = [];
        this._mainDir = mainDir;
    }

    /**
     * Run discover bridges procedures.
     *
     * @method discover
     */
    discover() {
        this.discoverSyncBoxAvahi();
    }

    /**
     * Add syncbox as discovered.
     * 
     * @method _insertDiscoveredSyncBox
     * @private
     * @param {Object} syncbox to be inserted
     */
    _insertDiscoveredSyncBox(syncBox) {
        if (syncBox['uniqueId'] === undefined)
            return;

        for (let i in this.discoveredSyncBox) {
            if (this.discoveredSyncBox[i]['ipAddress'] === syncBox['ipAddress']) {
                return;
            }
        }

        this.discoveredSyncBox.push(syncBox);
    }

    /**
     * Get info about syncbox on local network.
     * 
     * @method _getSyncBox
     * @private
     * @param {String} ip address
     * @return {Object} json with syncbox info or null
     */
    _getSyncBox(ip) {
        let syncBox = {};
        let session = Soup.Session.new();
        session.timeout = 3;

        /**
         * Philips Hue HDMI Sync Box API supports only HTTPS requests [1].
         * That is the reason I added the TLS certificate [2] to this extension
         * as Philips company recommends.
         * After initialization and pairing with the Philips Hue HDMI Sync Box,
         * the certificate is used as suggested by Philips company [1].
         * 
         * Note: You need a Philips Hue developer account to access the referenced links.
         * 
         * [1] https://developers.meethue.com/develop/hue-entertainment/hue-hdmi-sync-box-api/
         * [2] https://developers.meethue.com/wp-content/uploads/2020/01/hsb_cacert.pem_.txt
         */
        const HsbCert = this._mainDir.get_path() + "/crypto/hsb_cacert.pem"

        let tlsDatabase =  new TlsDatabaseSyncBox(
            { anchors: HsbCert }
        );
        session.tls_database  = tlsDatabase;
        session.ssl_strict = true;

        let msg = Soup.Message.new('GET', `https://${ip}/api/v1/device`);

        try {
            let bytes = session.send_and_read(msg, null);

            if (msg.status_code !== Soup.Status.OK) {
                return null;
            }

            let decoder = new TextDecoder();
            let data = decoder.decode(bytes.get_data());

            syncBox = JSON.parse(data);
        } catch(e) {
            Utils.logError(`Failed to discover info about syncbox ${ip}: ${e}`);
            return null;
        }

        return syncBox;
    }

    /**
     * Check all syncboxes on the local network using avahi discovery.
     * 
     * @method discoverBridgesAvahi
     */
    discoverSyncBoxAvahi() {
        this._avahi = new Avahi.Avahi({ service: "_huesync._tcp"});
        this._avahi.connect(
            'finished',
            () => {
                for (let ip in this._avahi.discovered) {
                    let syncBox = this._getSyncBox(ip);
                    if (syncBox !== null) {
                        Utils.logDebug(`Syncbox ${syncBox['name']} dicovered on ip ${syncBox['ipAddress']} via avahi.`);
                        this._insertDiscoveredSyncBox(syncBox);
                    }
                }
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

/**
 * PhueSyncBox API class for Philips Hue Sync Box
 *
 * @class PhueSyncBox
 * @constructor
 * @private
 * @param {String} ip address
 * @return {Object} instance
 */
export const PhilipsHueSyncBox =  GObject.registerClass({
    GTypeName: 'SmartHomePhilipsHueSyncBoxApi',
    Properties: {
        'ip': GObject.ParamSpec.string('ip', 'ip', 'ip', GObject.ParamFlags.READWRITE, null),
        'token': GObject.ParamSpec.string('token', 'token', 'token', GObject.ParamFlags.READWRITE, null),
        'registrationId': GObject.ParamSpec.string('registrationId', 'registrationId', 'registrationId', GObject.ParamFlags.READWRITE, null),
        'cert': GObject.ParamSpec.string('cert', 'cert', 'cert', GObject.ParamFlags.READWRITE, null)
    },
    Signals: {
        'registration-complete': {},
        'registration-failed': {},
        'change-occurred': {},
        'device-state': {},
        'connection-problem': {}
    }
}, class PhilipsHueSyncBox extends GObject.Object {

    _init(props={}) {

        this._session = Soup.Session.new();
        this._session.timeout = Utils.PHILIPSHUESYNCBOX_DEFAULT_TIMEOUT;

        super._init(props);

        this._timers = [];
        this._syncBoxError = [];

        this._appName = "hue-lights";
        this._instanceName = "";
        this._registrationID = "";
        this.id = "";
        this.name = "";
        this._registrationCounter = 0;

        this._baseUrl = `https://${this._ip}`;
        this._syncBoxUrl = `${this._baseUrl}/api/v1`;

        this._syncBoxConnected = false;
    }

    set ip(value) {
        this._ip = value;
        this._baseUrl = `https://${this._ip}`;
        this._syncBoxUrl = `${this._baseUrl}/api/v1`;
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

    set registrationId(value) {
        this._registrationID = value;
    }

    get registrationId() {
        return this._registrationID;
    }

    set cert(value) {
        /**
         * Philips Hue HDMI Sync Box API supports only HTTPS requests [1].
         * That is the reason I added the TLS certificate [2] to this extension
         * as Philips company recommends.
         * After initialization and pairing with the Philips Hue HDMI Sync Box,
         * the certificate is used as suggested by Philips company [1].
         * 
         * Note: You need a Philips Hue developer account to access the referenced links.
         * 
         * [1] https://developers.meethue.com/develop/hue-entertainment/hue-hdmi-sync-box-api/
         * [2] https://developers.meethue.com/wp-content/uploads/2020/01/hsb_cacert.pem_.txt
         */
        const HsbCert = value + "/crypto/hsb_cacert.pem"

        let tlsDatabase =  new TlsDatabaseSyncBox(
            { anchors: HsbCert }
        );
        this._session.tls_database  = tlsDatabase;
        this._session.ssl_strict = true;
    }

    get cert() {
        return null;
    }

    setConnectionTimeout(value) {
        this._session.timeout = value;
    }

    /**
     * Parse and emit result of syncbox response.
     *
     * @method _parseResponse
     * @private
     * @param {String} method to be used like POST, PUT, GET
     * @param {String} requested url
     * @param {Object} request hue type
     * @param {String} JSON response
     */
    _parseResponse(method, url, requestType, data) {
        Utils.logDebug(`HDMI sync box ${method} async-responded OK to url: ${url}`);

        if (data.length === 0) {
            if (requestType === RequestType.CHANGE_OCCURRED) {
                this.emit('change-occurred');
            }
            return;
        }

        try {
            this._syncBoxConnected = true;
            this.data = JSON.parse(data);
        } catch {
            Utils.logError(`HDMI sync box ${method} async-respond, failed to parse JSON`);
            this.data = [];
        }

        switch (requestType) {

            case RequestType.REGISTRATION:
                if (this.data['registrationId'] !== undefined) {
                    this.stopRegistration();
                    Utils.logDebug(`HDMI sync box ${this._ip} registration complete: ${JSON.stringify(this.data)}`);
                    this.registrationId = this.data['registrationId'];
                    this.token = this.data['accessToken'];
                    this.emit('registration-complete');
                }
                break;

            case RequestType.DEVICE_STATE:
                this.emit('device-state');
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
    /**
     * Process url request to the sync box with libsoup3.
     * 
     * @method _request
     * @private
     * @param {String} method to be used like POST, PUT, GET
     * @param {String} url to be requested
     * @param {Object} request hue type
     * @param {Object} JSON input data in case of supported method
     * @return {Object} JSON with response
     */
    _request(method, url, requestType, data) {
        if (this._ip === null) {
            Utils.logError(`Philips Hue Sync Box API is missing IP address.`);
            return;
        }

        Utils.logDebug(`Philips Hue Sync Box API ${method} request, url: ${url} data: ${JSON.stringify(data)}`);

        let msg = Message.new(method, url);

        msg.requestType = requestType;

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
                if (msg.get_status() === Soup.Status.OK) {
                    try {
                        const bytes = session.send_and_read_finish(res);
                        let decoder = new TextDecoder();
                        let response = decoder.decode(bytes.get_data());
                        this._parseResponse(method, url, requestType, response);
                    } catch {
                        this._connectionProblem(requestType);
                    }
                } else {
                    this._connectionProblem(requestType);
                }
            }
        );
    }

    /**
     * POST requst to url of a hue sync box.
     * 
     * @method _POST
     * @private
     * @param {Boolean} url to be requested
     * @param {Object} input data
     * @return {Object} JSON with response
     */
     _POST(url, requestHueType, data) {

        return this._request("POST", url, requestHueType, data);
    }

    /**
     * PUT requst to url of a syncBox.
     * 
     * @method _PUT
     * @private
     * @param {Boolean} url to be requested
     * @param {Object} input data
     * @return {Object} JSON with response
     */
    _PUT(url, requestHueType, data) {

        return this._request("PUT", url, requestHueType, data);
    }

    /**
     * GET requst to url of a syncBox.
     * 
     * @method _GET
     * @private
     * @param {Boolean} url to be requested
     * @return {Object} JSON with response
     */
    _GET(url, requestHueType) {

        return this._request("GET", url, requestHueType, null);
    }

    /**
     * DELETE requst to url of a syncBox.
     * 
     * @method _DELETE
     * @private
     * @param {Boolean} url to be requested
     * @return {Object} JSON with response
     */
     _DELETE(url, requestHueType) {

        return this._request("DELETE", url, requestHueType, null);
    }

    /**
     * Send request to get syncbox state.
     * 
     * @method getDeviceState
     */
    getDeviceState() {

        let url = this._syncBoxUrl;
        return this._GET(url, RequestType.DEVICE_STATE)
    }

    /**
     * Send execution request to syncbox.
     * 
     * @method setExecution
     * @param {Object} data in JSON
     * @param {Number} request type
     */
    setExecution(data, requestHueType = RequestType.CHANGE_OCCURRED) {

        let url = `${this._syncBoxUrl}/execution`;
        return this._PUT(url, requestHueType, data)
    }

    /**
     * Preparation for registration in new hdmi sync box.
     * 
     * @method createRegistration
     */
    async createRegistration() {

        const CMD_HOSTNAME = "hostname";
        let hostname = "";
        this._registrationCounter = 0;

        try {
            let output = GLib.spawn_command_line_sync(CMD_HOSTNAME);
            let decoder = new TextDecoder();
            hostname = decoder.decode(output[1]).trim();
        } catch(e) {
            hostname = "unknown-host";
            Utils.logError(`Failed to get hostanme: ${e}`);
        }

        /* device name can be up to 19 chars */
        if (hostname.length > 10) {
            hostname = hostname.slice(0, 10);
        }

        let data = {"appName": "smart-home", "instanceName": hostname};
        this._tryRegisterUser(data);

        while (this._registrationCounter < 15) {
            try {
                await this._tryRegisterUser(data);
            } catch {
                this.emit('registration-failed');
                break;
            }
        }

        if (this._registrationCounter >= 15) {
            this.emit('registration-failed');
        }
    }

    /**
     * Registration finished - no more attempts.
     * 
     * @method stopRegistration
     */
    stopRegistration() {

        this._registrationCounter = 999;
    }

    /**
     * Try register this app in hdmi sync box.
     * Try several times.
     * 
     * @method _tryRegister
     * @private
     * @param {Object} data with app name and instance name
     */
    _tryRegisterUser(data) {
        return new Promise((resolve, reject) => {
            if (this._registrationID.length > 0) {
                reject();
                return;
            }

            this._registrationCounter++;

            Utils.logDebug(`HDMI sync box ${this._ip} registration waits for pressing the button.`);

            let url = `${this._syncBoxUrl}/registrations`;
            this._POST(url, RequestType.REGISTRATION, data);

            let timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this._timers = Utils.removeFromArray(this._timers, timerId);
                resolve();
                return GLib.SOURCE_REMOVE;
            });
            this._timers.push(timerId);
        });
    }

    /**
     * Delete registaration from hdmi sync box.
     * TODO the DELETE request returns 405
     * 
     * @method stopRegistration
     * @param {Number} request type
     */
    deleteRegistration(requestHueType = RequestType.CHANGE_OCCURRED) {

        if (this._registrationID.length === 0) {
            return;
        }

        Utils.logDebug(`HDMI sync box ${this._ip} is being deleted and the registration canceled.`);

        let url = `${this._syncBoxUrl}/execution/${this._registrationID}`;
        return this._DELETE(url, requestHueType);
    }

    /**
     * Send request to change hdmi input.
     * 
     * @method setHDMISource
     * @param {String} one of following strings: input1, input2, input3, input4
     * @param {Number} request type
     */
    setHDMISource(input, requestHueType = RequestType.CHANGE_OCCURRED) {

        let url = `${this._syncBoxUrl}/execution`;
        return this._PUT(url, requestHueType, {"hdmiSource": input})
    }

    /**
     * Send restart syncbox request.
     * 
     * @method restartDevice
     */
    restartDevice() {
        let url = `${this._syncBoxUrl}/device`;
        return this._PUT(url, RequestType.NO_RESPONSE_NEED, {"action": "doSoftwareRestart"})
    }

    /**
     * True if the last reply of the bridge was OK.
     * 
     * @method isConnected
     * @return {Boolean} true if connected, false otherwise
     */
    isConnected() {

        return this._syncBoxConnected;
    }

    /**
     * Check if error occurred in last action.
     * 
     * @method checkError
     * @return {Boolean} true if error occurred else false
     */
    checkError() {

        if (this._syncBoxError.length > 0) {
            return true;
        }

        return false;
    }

    /**
     * Mark problem with connection and emit the situation.
     *
     * @method _connectionProblem
     * @private
     * @param {Object} request hue type
     */
    _connectionProblem(requestType) {
        this.data = [];
        if (! this._syncBoxConnected) {
            return;
        }
        this._syncBoxConnected = false;
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
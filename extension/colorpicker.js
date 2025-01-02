'use strict';

/**
 * JavaScript class for showing window with colors and picking the color
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
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Screenshot from './screenshot.js';
import * as Params from 'resource:///org/gnome/shell/misc/params.js';

/**
 * Button with color wheel or bar on the background.
 * 
 * @class ColorSelectorButton
 * @constructor
 * @return {Object} object
 */
const ColorSelectorButton = GObject.registerClass(
class ColorSelectorButton extends St.Bin {

    /**
     * ColorSelectorButton class initialization
     * 
     * @method _init
     * @param {String} file name of the background image
     * @param {Object} params  
     * @private
     */
    _init(fileName, params) {
        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        params = Params.parse(params, {
            styleClass: '',
            reactive: true,
            buttonWidth: 256,
            buttonHeight: 256,
        });

        super._init({
            style_class: params.styleClass,
            reactive: params.reactive,
            width: params.buttonWidth * themeContext.scaleFactor,
            height: params.buttonHeight * themeContext.scaleFactor,
        });

        this.child = null;
        this.style = `background-image: url("${fileName}");`;

        this.screenshot = new Screenshot.Screenshot();
    }

    /**
     * Provides color under mouse pointer
     * 
     * @method getColor
     * @return {Object} RGB color
     */
    async getColor() {
        let [x, y] = global.get_pointer();
        let color = await this.screenshot.getColorPixel(x, y);

        return color;
    }
});

/**
 * ColorPickerBox class. Creates BoxLayout with color wheel or color box.
 * 
 * @class ColorPickerBox
 * @constructor
 * @return {Object} object
 */
export const ColorPickerBox =  GObject.registerClass({
    GTypeName: "SmartHomeColorPickerBox",
    Signals: {
        'color-picked': {},
        'colortemp-picked': {},
        'brightness-picked': {},
    }
}, class ColorPickerBox extends GObject.Object {

    /**
     * ColorPickerBox class initialization
     * 
     * @method _init
     * @param {Object} path to extension directory
     * @param {Object} params  
     * @private
     */
    _init(mainDir, params) {
        params = Params.parse(params, {
            useColorWheel: true,
            useWhiteBox: true,
            showBrightness: false,
        });

        super._init();

        this._signals = {};
        this.slider = null;
        this.colorTemperature = 0;
        this.r = 0;
        this.g = 0;
        this.b = 0;
        this._useColorWheel = params.useColorWheel;
        this._useWhiteBox = params.useWhiteBox;
        this._showBrightness = params.showBrightness;
        this._mainDir = mainDir;
    }

    /**
     * Sets attributes of a object to center.
     * 
     * @method _centerObject
     * @private
     * @param {Object} object with attributes to set to center
     */
    _centerObject(object) {
        object.x_align = Clutter.ActorAlign.CENTER;
        object.x_expand = false;
        object.y_align = Clutter.ActorAlign.CENTER;
        object.y_expand = false;
    }

    /**
     * Create main box with content
     * 
     * @method createColorBox
     * @return {Object} main box as BoxLayout
     */
     createColorBox() {

        let signal;

        let mainbox = new St.BoxLayout({vertical: true});
        this._centerObject(mainbox);

        if (this._useColorWheel) {
            let colorWheel =  new ColorSelectorButton(this._mainDir + '/media/color-wheel.svg');
            signal = colorWheel.connect(
                "button-press-event",
                async () => {
                    let color = await colorWheel.getColor();
                    this.r = color.red;
                    this.g = color.green;
                    this.b = color.blue;
                    this.colorTemperature = 0;
                    this.emit("color-picked");
                }
            );
            this._signals[signal] = { "object": colorWheel };
            this._centerObject(colorWheel);
            mainbox.add_child(colorWheel);

            if (this._useWhiteBox) {
                mainbox.add_child(new PopupMenu.PopupSeparatorMenuItem());
            }
        }

        if (this._useWhiteBox) {
            let whiteBox =  new ColorSelectorButton(
                this._mainDir + '/media/temperature-bar.svg',
                {
                    buttonWidth: 256,
                    buttonHeight: 32
                }
            );
            signal = whiteBox.connect(
                "button-press-event",
                async () => {
                    let color = await whiteBox.getColor();

                    this.r = color.red;
                    this.g = color.green;
                    this.b = color.blue;

                    this.emit("colortemp-picked");
                }
            );
            this._signals[signal] = { "object": whiteBox };
            this._centerObject(whiteBox);
            mainbox.add_child(whiteBox);
        }

        if (this._showBrightness) {
            mainbox.add_child(new PopupMenu.PopupSeparatorMenuItem());

            /**
             * Brightness slider
             */
            this.slider = new Slider.Slider(0);
            signal = this.slider.connect("drag-end", this._brightnessEvent.bind(this));
            this._signals[signal] = { "object": this.slider };
            mainbox.add_child(this.slider);
        }

        return mainbox;
    }

    /**
     * Handler for picking brightness emrgbToHexStrits 'brightness-picked'
     *  
     * @method _brightnessEvent
     * @private
     */
    _brightnessEvent() {

        this.brightness = this.slider;

        this.emit("brightness-picked");
    }


    /**
     * Converts colour value to RGB
     * https://www.demmel.com/ilcd/help/16BitColorValues.htm
     * 
     * @method colorToRGB
     * @param {Number} color number
     * @return {Object} RGB array
     */
    color16btToRGB(hexValue) {

        let r = (hexValue & 0xF800) >> 11;
        let g = (hexValue & 0x07E0) >> 5;
        let b = hexValue & 0x001F;

        r = (r * 255) / 31;
        g = (g * 255) / 63;
        b = (b * 255) / 31;

        return [r, g, b];
    }

    /**
     * Converts RGB to hex string
     *  
     * @method rgbToHexStr
     * @param {Object} array on numbers: [r, g, b]
     * @return {String} RGB string
     */
    rgbToHexStr(rgb) {

        let r = rgb[0];
        let g = rgb[1];
        let b = rgb[2];

        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    /**
     * Disconect signals
     * 
     * @method disconnectSignals
     * @param {Boolean} disconnect all
     */
     disconnectSignals() {
        for (let id in this._signals) {
            try {
                this._signals[id]["object"].disconnect(id);
                delete(this._signals[id]);
            } catch {
                continue;
            }
        }
    }
})

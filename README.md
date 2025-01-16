# smart-home
![screenshot](https://github.com/vchlum/smart-home/blob/main/screenshot.png)

## Gnome Shell extension
smart-home is a Gnome Shell extension allowing to control multiple smart devices like Philips Hue bridge, Philips Hue syncbox, Ikea Dirigera, and Nanoleaf devices. The extension requires local network connection. 

## Troubleshooting
 1. If you are experiencing any trouble with the upgrade, try to log out and log in again.
 1. If your troubles persist, reset this extension by reseting key: "/org/gnome/shell/extensions/smart-home/" in gnome.
    * You can call: `dconf reset -f /org/gnome/shell/extensions/smart-home/` or use `dconf-editor`.
 1. Not vanishing your trouble, please file an issue on GitHub. If you can, please enable debug mode in the settings and attach the log file.
    * You can obtain the logfile like this: `journalctl -f /usr/bin/gnome-shell 2>&1 | grep "Smart Home" > smart-home.log`.

## Warning
This application makes use of fast changing light effects conditions alone, or in combination with certain content on the screen it may trigger previously undetected epileptic symptoms or seizures in persons who have no history of prior seizures or epilepsy.

## Supported Gnome Shell version
This extension supports Gnome Shell verison 46 and above.

## Installation from e.g.o
https://extensions.gnome.org/extension/7737/smart-home/

## Manual installation

 1. `git clone https://github.com/vchlum/smart-home.git`
 1. `cd smart-home`
 1. `make build`
 1. `make install`
 1. Log out & Log in
 1. `gnome-extensions enable smart-home@chlumskyvaclav.gmail.com`

## Install dependencies
  - These are only required to install from source
  - `make`
  - `gnome-shell` (`gnome-extensions` command)
  - `glib-compile-resources`
  - `libglib2.0-dev-bin`
  - `gettext`
  - These are recommended to run the extension
  - `avahi-tools` (`avahi-browse` command for discovering devices on local network)
  
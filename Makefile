SHELL = bash
UUID = smart-home@chlumskyvaclav.gmail.com

BUILD_DIR ?= build
PNG_FILES = $(wildcard ./docs/*.png)
RAW_PATH = "$(BUILD_DIR)/$(UUID).shell-extension.zip"
BUNDLE_PATH = "$(BUILD_DIR)/$(UUID).zip"

ifeq ($(strip $(DESTDIR)),)
	INSTALLTYPE = local
	INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions
else
	INSTALLTYPE = system
	SHARE_PREFIX = $(DESTDIR)/usr/share
	INSTALLBASE = $(SHARE_PREFIX)/gnome-shell/extensions
endif

.PHONY: build package check release install uninstall clean

build: clean
	@mkdir -p $(BUILD_DIR)
	$(MAKE) package
	@mv -v $(RAW_PATH) $(BUNDLE_PATH)
	mkdir -p $(BUILD_DIR)
	cp -R ./extension/schemas/ $(BUILD_DIR)
gresource:
	@cd "extension/resources"; \
	glib-compile-resources --target=../preferences.gresource preferences.gresource.xml
package: gresource
	@mkdir -p $(BUILD_DIR)
	@echo "Packing files..."
	@cd "extension"; \
	gnome-extensions pack --force \
	--extra-source=../LICENSE \
	--extra-source=../CHANGELOG.md \
	--extra-source=../README.md \
	--extra-source=prefs \
	--extra-source=media \
	--extra-source=plugins \
	--extra-source=crypto \
	--extra-source=semaphore.js \
	--extra-source=smarthome.js \
	--extra-source=smarthome-panelmenu.js \
	--extra-source=screenshot.js \
	--extra-source=screen-geometry.js \
	--extra-source=colorpicker.js \
	--extra-source=avahi.js \
	--extra-source=prefspage.js \
	--extra-source=utils.js \
	--extra-source=queue.js \
	--extra-source=preferences.gresource \
	-o ../$(BUILD_DIR)/
check:
	@if [[ ! -f $(BUNDLE_PATH) ]]; then \
	  echo -e "\nWARNING! Extension zip couldn't be found"; exit 1; \
	elif [[ "$$(stat -c %s $(BUNDLE_PATH))" -gt 4096000 ]]; then \
	  echo -e "\nWARNING! The extension is too big to be uploaded to the extensions website, keep it smaller than 4096 KB"; exit 1; \
	fi
install:
	@if [[ ! -f $(BUNDLE_PATH) ]]; then \
	  $(MAKE) build; \
	fi
	rm -rf $(INSTALLBASE)/$(UUID)
	mkdir -p $(INSTALLBASE)/$(UUID)
	unzip $(BUNDLE_PATH) -d $(INSTALLBASE)/$(UUID)
	glib-compile-schemas --targetdir=$(INSTALLBASE)/$(UUID)/schemas $(BUILD_DIR)/schemas
uninstall:
	rm -rf $(INSTALLBASE)/$(UUID)
clean:
	@rm -rfv $(BUILD_DIR)
	@rm -rfv "$(UUID).zip"
	@rm -rfv extension/ui/*.ui~ extension/ui/*.ui#

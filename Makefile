SHELL = bash
UUID = smart-home@chlumskyvaclav.gmail.com

BUILD_DIR ?= build
RAW_PATH = "$(BUILD_DIR)/$(UUID).shell-extension.zip"
BUNDLE_PATH = "$(BUILD_DIR)/$(UUID).zip"

LANGUAGES := $(shell find extension/po/ -type f -name '*.po' -exec sh -c 'basename "$1" | echo' _ {} \;)

FILES_PACKAGE = \
		../LICENSE \
		../CHANGELOG.md \
		../README.md \
		prefs \
		media \
		plugins \
		crypto \
		semaphore.js \
		smarthome.js \
		smarthome-panelmenu.js \
		screenshot.js \
		screen-geometry.js \
		colorpicker.js \
		avahi.js \
		prefs.js \
		utils.js \
		queue.js \
		preferences.gresource \
		$(NULL)

FILES_BUILD = \
		extension.js \
		metadata.json \
		$(NULL)

ifeq ($(strip $(DESTDIR)),)
	INSTALLTYPE = local
	INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions
else
	INSTALLTYPE = system
	SHARE_PREFIX = $(DESTDIR)/usr/share
	INSTALLBASE = $(SHARE_PREFIX)/gnome-shell/extensions
endif

.PHONY: build package check release install uninstall clean

build: clean gresource po schemas
	@mkdir -p $(BUILD_DIR)/$(UUID)
	@cd "extension"; \
	for f in $(FILES_PACKAGE) $(FILES_BUILD) ; do \
		cp -r $$f ../$(BUILD_DIR)/$(UUID)/; \
	done;
schemas:
	@mkdir -p $(BUILD_DIR)/$(UUID)/schemas
	@cp extension/schemas/*.xml $(BUILD_DIR)/$(UUID)/schemas/; \
	glib-compile-schemas $(BUILD_DIR)/$(UUID)/schemas/
po:
	@mkdir -p $(BUILD_DIR)/$(UUID)
	@cd "extension"; \
	for f in po/*.po; do \
		lang=$$(basename "$$f" .po); \
		mkdir -p  ../$(BUILD_DIR)/$(UUID)/locale/$${lang}/LC_MESSAGES/; \
		msgfmt -c po/$${lang}.po -o ../$(BUILD_DIR)/$(UUID)/locale/$${lang}/LC_MESSAGES/smart-home.mo; \
	done;
gresource:
	@cd "extension/resources"; \
	glib-compile-resources --target=../preferences.gresource preferences.gresource.xml
package: gresource
	@mkdir -p $(BUILD_DIR)
	@echo "Packing files..."
	@for f in $(FILES_PACKAGE) ; do \
		SOURCES="$$SOURCES --extra-source=$$f"; \
	done; \
	cd "extension"; \
	gnome-extensions pack --force \
	$$SOURCES \
	-o ../$(BUILD_DIR)/
	@mv -v $(RAW_PATH) $(BUNDLE_PATH)
check:
	@if [[ ! -f $(BUNDLE_PATH) ]]; then \
	  echo -e "\nWARNING! Extension zip couldn't be found"; exit 1; \
	elif [[ "$$(stat -c %s $(BUNDLE_PATH))" -gt 4096000 ]]; then \
	  echo -e "\nWARNING! The extension is too big to be uploaded to the extensions website, keep it smaller than 4096 KB"; exit 1; \
	fi
install:
	$(MAKE) build; \
	rm -rf $(INSTALLBASE)/$(UUID)
	mkdir -p $(INSTALLBASE)/$(UUID)
	cp -rv $(BUILD_DIR)/$(UUID)/* $(INSTALLBASE)/$(UUID)
uninstall:
	rm -rf $(INSTALLBASE)/$(UUID)
clean:
	@rm -rf $(BUILD_DIR)
	@rm -rfv "$(UUID).zip"

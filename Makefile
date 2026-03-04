.PHONY: build app zip install clean

build:
	swift build -c release

app:
	bash scripts/build.sh

zip:
	bash scripts/build.sh --zip

install: app
	rm -rf /Applications/ClaudeUsageBar.app
	cp -R ClaudeUsageBar.app /Applications/

clean:
	swift package clean
	rm -rf ClaudeUsageBar.app ClaudeUsageBar.zip

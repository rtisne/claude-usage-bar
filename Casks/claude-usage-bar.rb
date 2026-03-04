cask "claude-usage-bar" do
  version "1.0.0"
  sha256 "PLACEHOLDER"

  url "https://github.com/USER/claude-usage-bar/releases/download/v#{version}/ClaudeUsageBar.zip"
  name "Claude Usage Bar"
  desc "Menu bar app showing Claude API usage"
  homepage "https://github.com/USER/claude-usage-bar"

  depends_on macos: ">= :sonoma"

  app "ClaudeUsageBar.app"
end

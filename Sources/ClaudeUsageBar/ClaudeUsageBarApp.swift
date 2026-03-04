import SwiftUI

@main
struct ClaudeUsageBarApp: App {
    @StateObject private var service = UsageService()

    var body: some Scene {
        MenuBarExtra {
            PopoverView(service: service)
        } label: {
            Image(nsImage: service.isAuthenticated
                ? renderIcon(pct5h: service.pct5h, pct7d: service.pct7d)
                : renderUnauthenticatedIcon()
            )
                .task {
                    service.startPolling()
                }
        }
        .menuBarExtraStyle(.window)
    }
}

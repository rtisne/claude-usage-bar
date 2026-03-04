import SwiftUI
import Charts

struct UsageChartView: View {
    @ObservedObject var historyService: UsageHistoryService
    @State private var selectedRange: TimeRange = .day1

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("", selection: $selectedRange) {
                ForEach(TimeRange.allCases) { range in
                    Text(range.rawValue).tag(range)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            let points = historyService.downsampledPoints(for: selectedRange)

            if points.isEmpty {
                Text("No history data yet.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
            } else {
                Chart {
                    ForEach(points) { point in
                        LineMark(
                            x: .value("Time", point.timestamp),
                            y: .value("Usage", point.pct5h * 100)
                        )
                        .foregroundStyle(by: .value("Window", "5h"))
                        .interpolationMethod(.monotone)
                    }

                    ForEach(points) { point in
                        LineMark(
                            x: .value("Time", point.timestamp),
                            y: .value("Usage", point.pct7d * 100)
                        )
                        .foregroundStyle(by: .value("Window", "7d"))
                        .interpolationMethod(.monotone)
                    }

                }
                .chartXScale(domain: Date.now.addingTimeInterval(-selectedRange.interval)...Date.now)
                .chartYScale(domain: 0...100)
                .chartYAxis {
                    AxisMarks(values: [0, 25, 50, 75, 100]) { value in
                        AxisValueLabel {
                            if let v = value.as(Int.self) {
                                Text("\(v)%")
                                    .font(.caption2)
                            }
                        }
                        AxisGridLine()
                    }
                }
                .chartXAxis {
                    AxisMarks { value in
                        AxisValueLabel(format: xAxisFormat)
                            .font(.caption2)
                        AxisGridLine()
                    }
                }
                .chartForegroundStyleScale([
                    "5h": Color.blue,
                    "7d": Color.orange
                ])
                .chartLegend(.visible)
                .frame(height: 120)
            }
        }
    }

    private var xAxisFormat: Date.FormatStyle {
        switch selectedRange {
        case .hour1, .hour6:
            return .dateTime.hour().minute()
        case .day1:
            return .dateTime.hour()
        case .day7:
            return .dateTime.weekday(.abbreviated).hour()
        case .day30:
            return .dateTime.month(.abbreviated).day()
        }
    }
}

// Keep only the Grafana 13.3 picker selectors used by the standalone renderer. Importing
// `@grafana/e2e-selectors` bundles its complete dashboard and component selector registry.
export const selectors = {
  components: {
    TimePicker: {
      absoluteTimeRangeTitle: 'data-testid-absolute-time-range-narrow',
      applyTimeRange: 'data-testid TimePicker submit button',
      calendar: {
        closeButton: 'data-testid Close time range Calendar',
        label: 'data-testid Time Range calendar',
        openButton: 'data-testid Open time range calendar',
      },
      copyTimeRange: 'data-testid TimePicker copy button',
      fromField: 'data-testid Time Range from field',
      openButton: 'data-testid TimePicker Open Button',
      overlayContent: 'data-testid TimePicker Overlay Content',
      pasteTimeRange: 'data-testid TimePicker paste button',
      timeRangeOption: (from: string, to: string) => `data-testid TimePicker time range option ${from} to ${to}`,
      toField: 'data-testid Time Range to field',
    },
    TimeZonePicker: {
      changeTimeSettingsButton: 'data-testid Time zone picker Change time settings button',
      containerV2: 'data-testid Time zone picker select container',
    },
  },
};

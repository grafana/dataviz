import { type TimeRange } from '@grafana/data';
import { type TimeZone } from '@grafana/schema';
import { TimeRangePicker } from '@grafana/ui';
import { zoomOutTimeRange } from 'lib/grafana/time/zoomOut';
import React, { useLayoutEffect, useRef } from 'react';
import { type RefreshCause } from './refresh';
import {
  shiftTimeRange,
  type TimeRangeCause,
  toAbsoluteTimeRange,
  toRefreshRequest,
  toTimeRangeRequest,
} from './timeRangeRequest';

const noop = () => {};

interface Props {
  /** `data.range` of the viz spec. */
  value: TimeRange;
  timeZone: TimeZone;
  onRequest: (cause: RefreshCause) => void;
  onPick: (cause: TimeRangeCause) => void;
}

/**
 * The time picker (`refresh.3`). A pick, a move or a zoom out asks the App for new data with `onRefresh`. The time
 * zone comes from the viz spec, so a change of it in the picker does nothing.
 * https://github.com/grafana/grafana/blob/main/packages/grafana-ui/src/components/DateTimePickers/TimeRangePicker.tsx
 */
export const TimePicker = ({ value, timeZone, onRequest, onPick }: Props) => {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // The pinned UI picker has no prop for attributes on its Zoom out button.
    const button = container.current?.querySelector(
      '[data-testid="data-testid explore-toolbar-timepicker-zoom-out-button"]'
    );
    button?.setAttribute('data-viz-control', 'picker-zoom-out');
  }, []);
  const range = toAbsoluteTimeRange(value);
  return (
    <div ref={container} style={{ display: 'contents' }}>
      <TimeRangePicker
        value={value}
        timeZone={timeZone}
        onChange={(picked) => onPick(toRefreshRequest(picked))}
        onMoveBackward={() => onRequest(toTimeRangeRequest(shiftTimeRange(range, -1)))}
        onMoveForward={() => onRequest(toTimeRangeRequest(shiftTimeRange(range, 1)))}
        onZoom={() => onRequest(toTimeRangeRequest(zoomOutTimeRange(range)))}
        onChangeTimeZone={noop}
      />
    </div>
  );
};

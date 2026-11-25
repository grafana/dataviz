import { t } from '@grafana/i18n';
import { ToolbarButton } from '@grafana/ui';
import React from 'react';

interface Props {
  control?: 'reset-with-refresh' | 'reset-without-refresh';
  disabled?: boolean;
  onClick: () => void;
}

export const ResetTimeRangeButton = ({ disabled, onClick, control = 'reset-with-refresh' }: Props) => {
  const label = t('renderer.reset-time-range', 'Reset time range');
  return (
    <ToolbarButton
      data-viz-control={control}
      icon="compress-arrows"
      aria-label={label}
      tooltip={label}
      disabled={disabled}
      onClick={onClick}
    />
  );
};

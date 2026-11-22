'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import type { CampaignFeeInsight } from '../../resource-fee-insight-utils';
import {
  ResourceFeeInsightView,
  type FeeInsightViewState,
} from './ResourceFeeInsightView';

interface ResourceFeeInsightPanelProps {
  campaignId: string;
}

interface PanelState {
  dataState: FeeInsightViewState;
  data: CampaignFeeInsight | null;
  errorMessage?: string;
}

export function ResourceFeeInsightPanel({ campaignId }: ResourceFeeInsightPanelProps) {
  const [state, setState] = useState<PanelState>({
    dataState: 'loading',
    data: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setState({ dataState: 'loading', data: null });
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    api.campaigns
      .fees(campaignId, {
        top: 10,
        buckets: 12,
        trendPoints: 200,
        signal: controller.signal,
      })
      .then((data) => {
        if (!active) return;
        setState({ dataState: 'success', data });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setState({
          dataState: 'error',
          data: null,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Resource metrics are unavailable. Retry to refresh fee diagnostics.',
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [campaignId, reloadKey]);

  return (
    <ResourceFeeInsightView
      campaignId={campaignId}
      dataState={state.dataState}
      data={state.data}
      errorMessage={state.errorMessage}
      onRetry={retry}
    />
  );
}

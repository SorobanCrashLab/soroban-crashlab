'use client';

import CampaignMilestoneTimelineVisualizer from "../../features/misc/add-campaign-milestone-timeline-visualizer";
import { mockMilestoneEvents } from "../campaign-milestone-mock-data";

export default function CampaignMilestoneTimelinePage() {
  return (
    <div className="container mx-auto p-4">
      <CampaignMilestoneTimelineVisualizer events={mockMilestoneEvents} />
    </div>
  );
}

'use client';

import { useParams } from 'next/navigation';
import RuleEditor from '../../../features/automation/RuleEditor';

export default function WorkflowRulePage() {
  const params = useParams<{ ruleId: string }>();
  return <RuleEditor key={params.ruleId} ruleId={params.ruleId} />;
}

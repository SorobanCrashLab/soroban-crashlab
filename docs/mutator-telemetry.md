# Mutator yield telemetry

`WeightedScheduler` reports each registered mutator's application count,
successful decode count, contract-reach count, and novel-signature yield via
`report_stats`. Call `record_decode_success`, `record_contract_reached`, and
`record_novelty` with the selected mutator index as the harness observes those
outcomes.

Harnesses can opt into dead-mutator sampling with
`set_dead_mutator_policy(threshold, demotion_factor)`. A mutator with no novel
signatures after the threshold is reduced to a small nonzero share, so it can
still produce a later yield. Recording a novel signature restores its original
weight. The default scheduler leaves this policy disabled to preserve existing
selection behavior.

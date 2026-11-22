'use client';

import { useCallback, useMemo, useState } from 'react';
import { ContractSpec, InvocationScenario, InvocationStep, SAMPLE_CONTRACT } from '@/lib/invocations/schema';

export function useInvocationComposer() {
  const [specs, setSpecs] = useState<ContractSpec[]>([SAMPLE_CONTRACT]);
  const [name, setName] = useState('Untitled scenario');
  const [network, setNetwork] = useState(SAMPLE_CONTRACT.network);
  const [invoker, setInvoker] = useState('');
  const [budget, setBudget] = useState(10_000_000);
  const [steps, setSteps] = useState<InvocationStep[]>([]);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const setSpec = useCallback((spec: ContractSpec) => { setSpecs((current) => [...current.filter((item) => item.contractId !== spec.contractId), spec]); setNetwork(spec.network); setSteps([]); setScenarioError(null); }, []);
  const scenario = useMemo<InvocationScenario>(() => ({ version: 1, name, network, invoker, budget, steps }), [name, network, invoker, budget, steps]);
  const loadScenario = useCallback((value: InvocationScenario) => { setName(value.name); setNetwork(value.network); setInvoker(value.invoker); setBudget(value.budget); setSteps(value.steps); }, []);
  return { specs, spec: specs[specs.length - 1], setSpec, scenario, name, setName, network, setNetwork, invoker, setInvoker, budget, setBudget, steps, setSteps, scenarioError, setScenarioError, loadScenario };
}

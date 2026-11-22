import InvocationComposer from '@/features/invocation-composer/InvocationComposer';

export const metadata = { title: 'Contract Call Builder | Soroban CrashLab', description: 'Compose typed Soroban contract invocations and validate scenario payloads.' };

export default function ContractComposePage() {
  return <InvocationComposer />;
}

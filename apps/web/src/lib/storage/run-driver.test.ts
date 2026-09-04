import { runRunDriverContract } from './run-driver-contract';
import { InMemoryRunDriver } from './in-memory-run-driver';

runRunDriverContract('InMemoryRunDriver', () => ({ driver: new InMemoryRunDriver() }));
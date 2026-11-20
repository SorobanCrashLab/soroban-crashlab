/**
 * Yjs document schema for collaborative triage (#2192).
 *
 * Defines the structure of the shared triage document: tags (CRDT array),
 * notes (CRDT text), and issue links (CRDT map). All are mocked.
 */

import { MockYArray, MockYText, MockYMap, type MockYDoc } from './yjsProvider';

export interface TriageDocSchema {
  tags: MockYArray<string>;
  notes: MockYText;
  issueLinks: MockYMap<unknown>;
}

export function createTriageDoc(roomId: string): MockYDoc {
  const doc = new MockYDoc(roomId);
  return doc;
}

export function getTriageDocSchema(doc: MockYDoc): TriageDocSchema {
  return {
    tags: doc.getArray<string>('tags'),
    notes: doc.getText('notes'),
    issueLinks: doc.getMap<unknown>('issueLinks'),
  };
}

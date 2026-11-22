/** Persisted timeline annotations and threaded comments (#2205). */

export interface AnnotationReply {
  id: string;
  author: string;
  text: string;
  createdAt: number;
}

export interface Annotation {
  id: string;
  sessionId: string;
  author: string;
  frame: number;
  text: string;
  createdAt: number;
  replies: AnnotationReply[];
}

export class AnnotationStore {
  private readonly annotations = new Map<string, Annotation>();
  private sequence = 0;

  private nextId(): string {
    this.sequence += 1;
    return `ann-${this.sequence}`;
  }

  add(input: Omit<Annotation, 'id' | 'createdAt' | 'replies'>, now = Date.now()): Annotation {
    const annotation: Annotation = {
      ...input,
      id: this.nextId(),
      createdAt: now,
      replies: [],
    };
    this.annotations.set(annotation.id, annotation);
    return { ...annotation, replies: [...annotation.replies] };
  }

  reply(id: string, author: string, text: string, now = Date.now()): Annotation {
    const annotation = this.annotations.get(id);
    if (!annotation) throw new Error(`Unknown annotation: ${id}`);
    annotation.replies.push({ id: `${id}-r${annotation.replies.length + 1}`, author, text, createdAt: now });
    return { ...annotation, replies: [...annotation.replies] };
  }

  list(sessionId: string): Annotation[] {
    return [...this.annotations.values()]
      .filter((a) => a.sessionId === sessionId)
      .sort((a, b) => a.frame - b.frame || a.createdAt - b.createdAt)
      .map((a) => ({ ...a, replies: [...a.replies] }));
  }

  atFrame(sessionId: string, frame: number): Annotation[] {
    return this.list(sessionId).filter((a) => a.frame === frame);
  }
}

import * as assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  getArtifactById,
  deleteArtifactById,
  listArtifactMetadata,
} from './artifact-fs-adapter';

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'artifact-fs-test-'));
}

async function writeFile(dir: string, name: string, content = 'test'): Promise<void> {
  await fs.writeFile(path.join(dir, name), content);
}

async function withArtifactDir(dir: string, fn: () => Promise<void>): Promise<void> {
  const prev = process.env.CRASHLAB_ARTIFACT_DIR;
  process.env.CRASHLAB_ARTIFACT_DIR = dir;
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.CRASHLAB_ARTIFACT_DIR;
    else process.env.CRASHLAB_ARTIFACT_DIR = prev;
  }
}

async function main() {
  // Accept IDs containing consecutive dots (not as standalone "..")
  {
    const tmpdir = await makeTmpDir();
    await writeFile(tmpdir, 'run-v2..1');
    await writeFile(tmpdir, 'artifact..name');
    await writeFile(tmpdir, '..foo');
    await writeFile(tmpdir, 'bar..');

    await withArtifactDir(tmpdir, async () => {
      const r1 = await getArtifactById('run-v2..1');
      assert.ok(r1 !== null, 'should accept ID: run-v2..1');

      const r2 = await getArtifactById('artifact..name');
      assert.ok(r2 !== null, 'should accept ID: artifact..name');

      const r3 = await getArtifactById('..foo');
      assert.ok(r3 !== null, 'should accept ID: ..foo');

      const r4 = await getArtifactById('bar..');
      assert.ok(r4 !== null, 'should accept ID: bar..');
    });

    await fs.rm(tmpdir, { recursive: true });
    console.log('PASS: sanitizeId — accepts IDs with consecutive dots');
  }

  // Reject standalone ".." ID
  {
    const tmpdir = await makeTmpDir();

    await withArtifactDir(tmpdir, async () => {
      await assert.rejects(
        () => getArtifactById('..'),
        /Invalid artifact ID/,
        'should reject standalone ".."',
      );
    });

    await fs.rm(tmpdir, { recursive: true });
    console.log('PASS: sanitizeId — rejects standalone ".."');
  }

  // Reject IDs containing forward slash
  {
    const tmpdir = await makeTmpDir();

    await withArtifactDir(tmpdir, async () => {
      await assert.rejects(
        () => getArtifactById('../etc/passwd'),
        /Invalid artifact ID/,
        'should reject "../etc/passwd"',
      );
      await assert.rejects(
        () => getArtifactById('id/with/slash'),
        /Invalid artifact ID/,
        'should reject "id/with/slash"',
      );
    });

    await fs.rm(tmpdir, { recursive: true });
    console.log('PASS: sanitizeId — rejects forward slash');
  }

  // Reject IDs containing backslash
  {
    const tmpdir = await makeTmpDir();

    await withArtifactDir(tmpdir, async () => {
      await assert.rejects(
        () => getArtifactById('id\\with\\backslash'),
        /Invalid artifact ID/,
        'should reject backslash',
      );
    });

    await fs.rm(tmpdir, { recursive: true });
    console.log('PASS: sanitizeId — rejects backslash');
  }

  // deleteArtifactById also rejects invalid IDs
  {
    const tmpdir = await makeTmpDir();

    await withArtifactDir(tmpdir, async () => {
      await assert.rejects(
        () => deleteArtifactById('..'),
        /Invalid artifact ID/,
        'deleteArtifactById should reject ".."',
      );
    });

    await fs.rm(tmpdir, { recursive: true });
    console.log('PASS: deleteArtifactById — rejects standalone ".."');
  }

  // listArtifactMetadata works normally
  {
    const tmpdir = await makeTmpDir();
    await writeFile(tmpdir, 'artifact-a');
    await writeFile(tmpdir, 'artifact..b');

    await withArtifactDir(tmpdir, async () => {
      const list = await listArtifactMetadata();
      const ids = list.map((m) => m.id);
      assert.ok(ids.includes('artifact-a'), 'should list artifact-a');
      assert.ok(ids.includes('artifact..b'), 'should list artifact..b');
    });

    await fs.rm(tmpdir, { recursive: true });
    console.log('PASS: listArtifactMetadata — includes dotted names');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

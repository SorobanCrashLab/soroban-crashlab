'use client';

import { useCallback, useState } from 'react';
import RunMetadataEditor from '../../../components/RunMetadataEditor';
import type { FuzzingRun } from '../../types';
import type { RunMetadata } from '../../../components/RunMetadataEditor';

export default function RunMetadataEditorWrapper({ run }: { run: FuzzingRun }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentRun, setCurrentRun] = useState(run);

  const handleSave = useCallback((metadata: RunMetadata) => {
    setCurrentRun((prev) => ({
      ...prev,
      tags: metadata.tags,
    }));
  }, []);

  const toggleEdit = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  return (
    <RunMetadataEditor
      run={currentRun}
      onSave={handleSave}
      isEditing={isEditing}
      onToggleEdit={toggleEdit}
    />
  );
}

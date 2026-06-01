import { useMemo } from 'react';
import OutlinePanel from '@/features/outline/OutlinePanel';
import UploadSection from '@/features/upload/UploadSection';
import { useFileUpload } from '@/features/upload/useFileUpload';
import { useWorkspaceStore } from '@/features/workspace/store';

export default function WorkspacePage() {
  const files = useWorkspaceStore((s) => s.files);
  const removeFile = useWorkspaceStore((s) => s.removeFile);
  const removeByName = useWorkspaceStore((s) => s.removeByName);
  const upload = useFileUpload();

  const announcement = useMemo(
    () => files.filter((f) => f.category === 'announcement'),
    [files],
  );
  const company = useMemo(
    () => files.filter((f) => f.category === 'company'),
    [files],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,340px)_1fr]">
      <aside className="space-y-6">
        <UploadSection
          category="announcement"
          files={announcement}
          allFiles={files}
          onAdd={(fs) => upload('announcement', fs)}
          onRemove={removeFile}
          onReplaceByName={(names) => removeByName('announcement', names)}
        />
        <UploadSection
          category="company"
          files={company}
          allFiles={files}
          onAdd={(fs) => upload('company', fs)}
          onRemove={removeFile}
          onReplaceByName={(names) => removeByName('company', names)}
        />
      </aside>
      <OutlinePanel />
    </div>
  );
}

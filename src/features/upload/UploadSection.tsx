import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
} from '@/features/workspace/types';
import type { FileCategory, WorkspaceFile } from '@/features/workspace/types';
import FileDropzone from './FileDropzone';
import FileList from './FileList';
import { validateFiles } from './validation';

interface Props {
  category: FileCategory;
  files: WorkspaceFile[];
  allFiles: WorkspaceFile[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onReplaceByName: (names: string[]) => void;
}

export default function UploadSection({
  category,
  files,
  allFiles,
  onAdd,
  onRemove,
  onReplaceByName,
}: Props) {
  const handleSelect = (incoming: File[]) => {
    const existingTotal = allFiles.reduce((s, f) => s + f.size, 0);
    const { accepted, rejected } = validateFiles(incoming, existingTotal);

    const existingNames = new Set(files.map((f) => f.name));
    const conflicts = accepted.filter((f) => existingNames.has(f.name));

    if (conflicts.length > 0) {
      const replace = window.confirm(
        `다음 파일은 이미 등록되어 있습니다. 교체할까요?\n\n${conflicts
          .map((f) => `• ${f.name}`)
          .join('\n')}`,
      );
      if (replace) {
        onReplaceByName(conflicts.map((c) => c.name));
        onAdd(accepted);
      } else {
        const nonConflicts = accepted.filter(
          (f) => !existingNames.has(f.name),
        );
        if (nonConflicts.length > 0) onAdd(nonConflicts);
      }
    } else if (accepted.length > 0) {
      onAdd(accepted);
    }

    if (rejected.length > 0) {
      alert(rejected.map((r) => `[${r.fileName}] ${r.message}`).join('\n'));
    }
  };

  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-base font-semibold text-gray-900">
          {CATEGORY_LABELS[category]}
        </h2>
        <p className="text-xs text-gray-500">
          {CATEGORY_DESCRIPTIONS[category]}
        </p>
      </header>
      <FileDropzone onFilesSelected={handleSelect} />
      <FileList files={files} onRemove={onRemove} />
    </section>
  );
}

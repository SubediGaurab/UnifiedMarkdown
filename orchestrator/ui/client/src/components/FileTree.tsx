import { useState, useCallback, useMemo, useEffect } from 'react';
import type { DiscoveredFile } from '../api/client';
import { openPreview } from '../api/client';

interface TreeNode {
  name: string;
  path: string;
  absolutePath: string;
  isDirectory: boolean;
  file?: DiscoveredFile;
  children: TreeNode[];
}

interface FileTreeProps {
  files: DiscoveredFile[];
  selectedFiles: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onExclude?: (path: string, type: 'file' | 'directory') => void;
}

// Build tree from flat file list
function buildTree(files: DiscoveredFile[]): TreeNode {
  const root: TreeNode = {
    name: 'Root',
    path: '',
    absolutePath: '',
    isDirectory: true,
    children: [],
  };

  const nodeMap = new Map<string, TreeNode>();
  nodeMap.set('', root);

  // Sort files by path for consistent ordering
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const separator: '/' | '\\' = file.path.includes('\\') ? '\\' : '/';
    const isUncPath = file.path.startsWith('\\\\');
    const hasLeadingSlash = !isUncPath && file.path.startsWith('/');
    const rootPrefix = isUncPath ? '\\\\' : hasLeadingSlash ? '/' : '';
    const parts = file.path.split(/[/\\]/).filter(Boolean);
    let currentPath = '';
    let currentAbsolutePath = rootPrefix;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!currentAbsolutePath) {
        currentAbsolutePath = part;
      } else if (currentAbsolutePath === '/' || currentAbsolutePath === '\\\\') {
        currentAbsolutePath = `${currentAbsolutePath}${part}`;
      } else {
        currentAbsolutePath = `${currentAbsolutePath}${separator}${part}`;
      }

      if (!nodeMap.has(currentPath)) {
        const isFile = i === parts.length - 1;
        const node: TreeNode = {
          name: part,
          path: currentPath,
          absolutePath: currentAbsolutePath,
          isDirectory: !isFile,
          file: isFile ? file : undefined,
          children: [],
        };

        nodeMap.set(currentPath, node);
        const parent = nodeMap.get(parentPath);
        if (parent) {
          parent.children.push(node);
        }
      }
    }
  }

  return root;
}

// Get all file paths under a node
function getAllFilePaths(node: TreeNode): string[] {
  if (!node.isDirectory && node.file) {
    return [node.file.path];
  }
  return node.children.flatMap(getAllFilePaths);
}

// Get file icon based on extension
function getFileIcon(extension: string): { icon: string; className: string } {
  const ext = extension.toLowerCase();
  if (['pdf'].includes(ext)) {
    return { icon: '📄', className: 'pdf' };
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'svg'].includes(ext)) {
    return { icon: '🖼️', className: 'image' };
  }
  if (['docx', 'doc'].includes(ext)) {
    return { icon: '📝', className: 'doc' };
  }
  if (['pptx', 'ppt'].includes(ext)) {
    return { icon: '📊', className: 'doc' };
  }
  return { icon: '📄', className: '' };
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedFiles: Set<string>;
  expandedDirs: Set<string>;
  onToggleExpand: (path: string) => void;
  onToggleSelect: (node: TreeNode) => void;
  onExclude?: (path: string, type: 'file' | 'directory') => void;
}

function TreeItem({
  node,
  depth,
  selectedFiles,
  expandedDirs,
  onToggleExpand,
  onToggleSelect,
  onExclude,
}: TreeItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const isExpanded = expandedDirs.has(node.path);
  const copyTargetPath = node.isDirectory ? node.absolutePath : node.file?.path ?? node.absolutePath;
  const copyTitle = node.isDirectory ? 'Copy folder path' : 'Copy file path';

  // Calculate selection state for directories
  const selectionState = useMemo(() => {
    if (!node.isDirectory) {
      return selectedFiles.has(node.file?.path || '') ? 'checked' : 'unchecked';
    }

    const allPaths = getAllFilePaths(node);
    const selectedCount = allPaths.filter((p) => selectedFiles.has(p)).length;

    if (selectedCount === 0) return 'unchecked';
    if (selectedCount === allPaths.length) return 'checked';
    return 'indeterminate';
  }, [node, selectedFiles]);

  const handleCheckboxChange = () => {
    onToggleSelect(node);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(true);
  };

  const handleExclude = () => {
    setShowMenu(false);
    if (onExclude) {
      onExclude(node.path, node.isDirectory ? 'directory' : 'file');
    }
  };

  return (
    <div>
      <div
        className="tree-item"
        style={{ paddingLeft: `${depth * 20 + 8}px`, cursor: node.isDirectory ? 'pointer' : undefined }}
        onContextMenu={handleContextMenu}
        onClick={node.isDirectory ? () => onToggleExpand(node.path) : undefined}
      >
        {node.isDirectory ? (
          <span
            className="expand-icon"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.path); }}
          >
            {node.children.length > 0 ? (isExpanded ? '▼' : '▶') : ''}
          </span>
        ) : (
          <span className="expand-icon" />
        )}

        <input
          type="checkbox"
          className="checkbox"
          checked={selectionState === 'checked'}
          ref={(el) => {
            if (el) el.indeterminate = selectionState === 'indeterminate';
          }}
          onClick={(e) => e.stopPropagation()}
          onChange={handleCheckboxChange}
        />

        {node.isDirectory ? (
          <span className="file-icon folder">📁</span>
        ) : (
          <span className={`file-icon ${getFileIcon(node.file?.extension || '').className}`}>
            {getFileIcon(node.file?.extension || '').icon}
          </span>
        )}

        {copyTargetPath && (
          <button
            className="copy-path-btn"
            title={copied ? 'Copied!' : copyTitle}
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(copyTargetPath);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? '✓' : '📋'}
          </button>
        )}

        {node.isDirectory ? (
          <span
            className="file-name"
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
            onClick={(e) => {
              e.stopPropagation();
              openPreview(node.absolutePath).catch(console.error);
            }}
          >
            {node.name}
          </span>
        ) : (
          <span
            className="file-name"
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => {
              if (node.file) {
                openPreview(
                  node.file.path,
                  node.file.markdownPath,
                ).catch(console.error);
              }
            }}
          >
            {node.name}
          </span>
        )}

        {!node.isDirectory && node.file && (
          <span className={`file-status ${node.file.hasMarkdown ? 'converted' : 'pending'}`}>
            {node.file.hasMarkdown ? 'Converted' : 'Pending'}
          </span>
        )}

        {showMenu && (
          <>
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99,
              }}
              onClick={() => setShowMenu(false)}
            />
            <div
              style={{
                position: 'absolute',
                right: 0,
                background: 'white',
                border: '1px solid var(--gray-200)',
                borderRadius: 'var(--border-radius)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 100,
                minWidth: 150,
              }}
            >
              <button
                className="btn btn-sm"
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  borderRadius: 0,
                }}
                onClick={handleExclude}
              >
                🚫 Exclude {node.isDirectory ? 'Directory' : 'File'}
              </button>
            </div>
          </>
        )}
      </div>

      {node.isDirectory && isExpanded && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFiles={selectedFiles}
              expandedDirs={expandedDirs}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              onExclude={onExclude}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({
  files,
  selectedFiles,
  onSelectionChange,
  onExclude,
}: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  const displayedFiles = useMemo(
    () => (showPendingOnly ? files.filter((f) => !f.hasMarkdown) : files),
    [files, showPendingOnly],
  );

  const tree = useMemo(() => buildTree(displayedFiles), [displayedFiles]);

  // Auto-expand all directories when tree changes (e.g. after scan)
  useEffect(() => {
    const allDirs = new Set<string>();
    const collectDirs = (node: TreeNode) => {
      if (node.isDirectory) {
        allDirs.add(node.path);
        node.children.forEach(collectDirs);
      }
    };
    collectDirs(tree);
    setExpandedDirs(allDirs);
  }, [tree]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleToggleSelect = useCallback(
    (node: TreeNode) => {
      const allPaths = getAllFilePaths(node);
      const next = new Set(selectedFiles);

      // If all are selected, deselect all; otherwise select all
      const allSelected = allPaths.every((p) => selectedFiles.has(p));

      for (const path of allPaths) {
        if (allSelected) {
          next.delete(path);
        } else {
          next.add(path);
        }
      }

      onSelectionChange(next);
    },
    [selectedFiles, onSelectionChange]
  );

  const expandAll = useCallback(() => {
    const allDirs = new Set<string>();
    const collectDirs = (node: TreeNode) => {
      if (node.isDirectory) {
        allDirs.add(node.path);
        node.children.forEach(collectDirs);
      }
    };
    collectDirs(tree);
    setExpandedDirs(allDirs);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedDirs(new Set());
  }, []);

  const selectAll = useCallback(() => {
    const allPaths = new Set(files.map((f) => f.path));
    onSelectionChange(allPaths);
  }, [files, onSelectionChange]);

  const selectNone = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  const selectPending = useCallback(() => {
    const pendingPaths = new Set(files.filter((f) => !f.hasMarkdown).map((f) => f.path));
    onSelectionChange(pendingPaths);
  }, [files, onSelectionChange]);

  if (files.length === 0) {
    return (
      <div className="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
        </svg>
        <h3>No Files Found</h3>
        <p>Scan a directory to see convertible files here.</p>
      </div>
    );
  }

  return (
    <div className="file-tree">
      <div className="flex gap-2 mb-4">
        <button className="btn btn-sm btn-secondary" onClick={expandAll}>
          Expand All
        </button>
        <button className="btn btn-sm btn-secondary" onClick={collapseAll}>
          Collapse All
        </button>
        <span style={{ borderLeft: '1px solid var(--gray-300)', margin: '0 8px' }} />
        <button className="btn btn-sm btn-secondary" onClick={selectAll}>
          Select All
        </button>
        <button className="btn btn-sm btn-secondary" onClick={selectNone}>
          Select None
        </button>
        <button className="btn btn-sm btn-secondary" onClick={selectPending}>
          Select Pending
        </button>
        <span style={{ borderLeft: '1px solid var(--gray-300)', margin: '0 8px' }} />
        <button
          className={`btn btn-sm ${showPendingOnly ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowPendingOnly((prev) => !prev)}
        >
          {showPendingOnly ? 'Show All' : 'Show Pending Only'}
        </button>
      </div>

      <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--border-radius)', overflow: 'hidden' }}>
        {tree.children.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            selectedFiles={selectedFiles}
            expandedDirs={expandedDirs}
            onToggleExpand={handleToggleExpand}
            onToggleSelect={handleToggleSelect}
            onExclude={onExclude}
          />
        ))}
      </div>

      <div className="mt-2 text-sm text-muted">
        {selectedFiles.size} of {files.length} files selected
        {showPendingOnly && ` (showing ${displayedFiles.length} pending)`}
      </div>
    </div>
  );
}

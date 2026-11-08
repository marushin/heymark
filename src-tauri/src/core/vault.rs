use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

/// Folders that are never worth listing (and can be huge).
const SKIPPED_DIRS: [&str; 3] = [".git", "node_modules", "target"];
/// Hard recursion limit, so a pathological tree cannot overflow the stack.
const MAX_DEPTH: usize = 32;

fn is_supported_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            e.eq_ignore_ascii_case("md")
                || e.eq_ignore_ascii_case("txt")
                || e.eq_ignore_ascii_case("json")
        })
        .unwrap_or(false)
}

pub fn scan_vault(root: &Path) -> Vec<FileNode> {
    scan_dir(root, 0)
}

fn scan_dir(root: &Path, depth: usize) -> Vec<FileNode> {
    let mut nodes = Vec::new();

    if depth >= MAX_DEPTH {
        return nodes;
    }

    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            // `DirEntry::file_type` does not follow symlinks/junctions, so link cycles are
            // skipped instead of recursed into.
            let file_type = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue;
            }

            let path = entry.path();
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            if file_type.is_dir() {
                if SKIPPED_DIRS.contains(&name.as_str()) {
                    continue;
                }
                let children = scan_dir(&path, depth + 1);
                nodes.push(FileNode {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: true,
                    children: Some(children),
                });
            } else if is_supported_file(&path) {
                nodes.push(FileNode {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: false,
                    children: None,
                });
            }
        }
    }

    // Sort directories first, then files
    nodes.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    nodes
}

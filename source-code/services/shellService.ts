import { ShellState, FileSystemNode } from '../types';

// Initial File System
const initialFileSystem: Record<string, FileSystemNode> = {
    home: {
        name: 'home',
        type: 'directory',
        children: {
            user: {
                name: 'user',
                type: 'directory',
                children: {
                    'welcome.txt': {
                        name: 'welcome.txt',
                        type: 'file',
                        content: 'Welcome to HackerTerm Web!\nThis is a simulated shell environment built with React and TypeScript.\n\nTry commands like:\n- ls\n- cd [dir]\n- cat [file]\n- echo [text]\n- help\n'
                    },
                    projects: {
                        name: 'projects',
                        type: 'directory',
                        children: {
                            'secret_plans.txt': {
                                name: 'secret_plans.txt',
                                type: 'file',
                                content: '1. Build cool terminal\n2. ???\n3. Profit'
                            }
                        }
                    }
                }
            }
        }
    }
};

export const initialShellState: ShellState = {
    cwd: ['home', 'user'],
    history: [],
    fileSystem: initialFileSystem
};

export const resolvePath = (currentPath: string[], targetPath: string): string[] | null => {
    if (!targetPath) return currentPath;

    const parts = targetPath.split('/').filter(p => p.length > 0);
    let newPath = targetPath.startsWith('/') ? [] : [...currentPath];

    for (const part of parts) {
        if (part === '.') continue;
        if (part === '..') {
            if (newPath.length > 0) newPath.pop();
        } else {
            newPath.push(part);
        }
    }
    return newPath;
};

export const getNodeAt = (fs: Record<string, FileSystemNode>, path: string[]): FileSystemNode | null => {
    if (path.length === 0) return { name: 'root', type: 'directory', children: fs }; // Virtual root

    let current: FileSystemNode | undefined = fs[path[0]];

    for (let i = 1; i < path.length; i++) {
        if (!current || current.type !== 'directory' || !current.children) return null;
        current = current.children[path[i]];
    }

    return current || null;
};

// Returns output string and new state
export const executeCommand = (cmd: string, state: ShellState): { output: string, newState: ShellState } => {
    const args = cmd.trim().split(/\s+/);
    const command = args[0];
    const params = args.slice(1);
    const { cwd, fileSystem } = state;

    switch (command) {
        case 'help':
            return {
                output: '\r\nAvailable commands:\r\n  help     Show this help message\r\n  ls       List directory contents\r\n  cd       Change directory\r\n  cat      Read file contents\r\n  clear    Clear the terminal screen\r\n  echo     Print text\r\n  whoami   Display current user\r\n  date     Display current date\r\n',
                newState: state
            };

        case 'whoami':
            return { output: '\r\nroot\r\n', newState: state };

        case 'date':
            return { output: `\r\n${new Date().toString()}\r\n`, newState: state };

        case 'echo':
            return { output: `\r\n${params.join(' ')}\r\n`, newState: state };

        case 'pwd':
            return { output: `\r\n/${cwd.join('/')}\r\n`, newState: state };

        case 'ls': {
            const targetNode = getNodeAt(fileSystem, cwd);
            if (!targetNode || targetNode.type !== 'directory' || !targetNode.children) {
                return { output: '\r\nError: Current directory not found.\r\n', newState: state };
            }

            const items = Object.values(targetNode.children).map(node => {
                const color = node.type === 'directory' ? '\x1b[1;34m' : '\x1b[1;32m'; // Blue for dir, Green for file
                return `${color}${node.name}\x1b[0m`;
            });

            return { output: `\r\n${items.join('  ')}\r\n`, newState: state };
        }

        case 'cd': {
            if (params.length === 0) return { output: '', newState: state };
            const newPath = resolvePath(cwd, params[0]);
            if (!newPath) return { output: '\r\nInvalid path\r\n', newState: state };

            const target = getNodeAt(fileSystem, newPath);
            if (target && target.type === 'directory') {
                return { output: '', newState: { ...state, cwd: newPath } };
            } else {
                return { output: `\r\ncd: no such file or directory: ${params[0]}\r\n`, newState: state };
            }
        }

        case 'cat': {
            if (params.length === 0) return { output: '\r\nUsage: cat [file]\r\n', newState: state };
            // Simple resolution for current dir only for demo
            const currentNode = getNodeAt(fileSystem, cwd);
            if (!currentNode || !currentNode.children) return { output: '\r\nError\r\n', newState: state };

            const file = currentNode.children[params[0]];
            if (file && file.type === 'file') {
                return { output: `\r\n${file.content}\r\n`, newState: state };
            } else if (file && file.type === 'directory') {
                return { output: `\r\ncat: ${params[0]}: Is a directory\r\n`, newState: state };
            } else {
                return { output: `\r\ncat: ${params[0]}: No such file or directory\r\n`, newState: state };
            }
        }

        case '':
            return { output: '', newState: state };

        default:
            return { output: `\r\nCommand not found: ${command}\r\n`, newState: state };
    }
};

/**
 * Code Execution Service
 *
 * Talks to Cognify's own /api/execute endpoint, which owns validation,
 * rate limiting and the Piston connection. The browser never contacts
 * the Piston host directly.
 */
import { API_BASE, authHeaders, handleUnauthorized } from './apiService';

export interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    signal: string | null;
    language: string;
    version: string;
}

export interface LanguageConfig {
    id: string;
    label: string;
    pistonId: string;
    pistonVersion: string;
    extension: string;
    icon: string;
    iconPrefix?: string;
    defaultCode: string;
    supportsStdin: boolean;
    isWebLang?: boolean; // HTML/CSS/JS — rendered in iframe, not Piston
    runsInBrowser?: boolean; // True if language runs client-side (Pyodide, JS, etc.)
}

export const LANGUAGES: LanguageConfig[] = [
    {
        id: 'python',
        label: 'Python',
        pistonId: 'python',
        pistonVersion: '3.12.0',
        extension: '.py',
        icon: 'fa-python',
        iconPrefix: 'fab',
        defaultCode: '# Python 3.12.0\nname = input("Enter your name: ")\nprint(f"Hello, {name}! Welcome to Cognify.")\n\nfor i in range(1, 6):\n    print(f"  Step {i}: Learning...")\n\nprint("\\n✅ All steps complete!")',
        supportsStdin: true,
        runsInBrowser: false,
    },
    {
        id: 'javascript',
        label: 'JavaScript',
        pistonId: 'javascript',
        pistonVersion: '20.11.1',
        extension: '.js',
        icon: 'fa-js',
        iconPrefix: 'fab',
        defaultCode: '// JavaScript 20.11.1\nconst greet = (name) => {\n  return `Hello, ${name}! 🚀`;\n};\n\ngreet("Developer");\n\n// Array operations\nconst nums = [1, 2, 3, 4, 5];\nconst squares = nums.map(n => n ** 2);\nreturn squares;',
        supportsStdin: false,
        runsInBrowser: false,
    },
    {
        id: 'java',
        label: 'Java',
        pistonId: 'java',
        pistonVersion: '15.0.2',
        extension: '.java',
        icon: 'fa-java',
        iconPrefix: 'fab',
        defaultCode: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.print("Enter your name: ");\n        String name = sc.nextLine();\n        System.out.println("Hello, " + name + "! Welcome to Cognify.");\n\n        for (int i = 1; i <= 5; i++) {\n            System.out.println("  Step " + i + ": Learning Java...");\n        }\n    }\n}',
        supportsStdin: true,
        runsInBrowser: false,
    },
    {
        id: 'go',
        label: 'Go',
        pistonId: 'go',
        pistonVersion: '1.16.2',
        extension: '.go',
        icon: 'fa-code',
        iconPrefix: 'fas',
        defaultCode: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\tfmt.Print("Enter your name: ")\n\tname, _ := reader.ReadString(\'\\n\')\n\tfmt.Printf("Hello, %s! Welcome to Cognify.\\n", name)\n\n\tfor i := 1; i <= 5; i++ {\n\t\tfmt.Printf("  Step %d: Learning Go...\\n", i)\n\t}\n}',
        supportsStdin: true,
        runsInBrowser: false,
    },
    {
        id: 'rust',
        label: 'Rust',
        pistonId: 'rust',
        pistonVersion: '1.68.2',
        extension: '.rs',
        icon: 'fa-gear',
        iconPrefix: 'fas',
        defaultCode: 'use std::io;\n\nfn main() {\n    println!("Enter your name:");\n    let mut name = String::new();\n    io::stdin().read_line(&mut name).unwrap();\n    println!("Hello, {}! Welcome to Cognify.", name.trim());\n\n    let nums: Vec<i32> = (1..=5).collect();\n    let sum: i32 = nums.iter().sum();\n    println!("Sum of 1..5 = {}", sum);\n}',
        supportsStdin: true,
        runsInBrowser: false,
    },
    {
        id: 'c',
        label: 'C',
        pistonId: 'c',
        pistonVersion: '10.2.0',
        extension: '.c',
        icon: 'fa-c',
        iconPrefix: 'fas',
        defaultCode: '#include <stdio.h>\n\nint main() {\n    char name[50];\n    printf("Enter your name: ");\n    scanf("%s", name);\n    printf("Hello, %s! Welcome to Cognify.\\n", name);\n\n    for (int i = 1; i <= 5; i++) {\n        printf("  Counting: %d\\n", i);\n    }\n    return 0;\n}',
        supportsStdin: true,
        runsInBrowser: false,
    },
    {
        id: 'cpp',
        label: 'C++',
        pistonId: 'cpp',
        pistonVersion: '10.2.0',
        extension: '.cpp',
        icon: 'fa-code',
        iconPrefix: 'fas',
        defaultCode: '#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    string name;\n    cout << "Enter your name: ";\n    cin >> name;\n    cout << "Hello, " << name << "! 🚀" << endl;\n\n    vector<int> nums = {5, 3, 8, 1, 9, 2};\n    sort(nums.begin(), nums.end());\n    cout << "Sorted: ";\n    for (int n : nums) cout << n << " ";\n    cout << endl;\n    return 0;\n}',
        supportsStdin: true,
        runsInBrowser: false,
    },
    {
        id: 'html',
        label: 'HTML/CSS/JS',
        pistonId: '',
        pistonVersion: '',
        extension: '.html',
        icon: 'fa-html5',
        iconPrefix: 'fab',
        defaultCode: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <style>\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body {\n      font-family: \'Segoe UI\', sans-serif;\n      background: linear-gradient(135deg, #0f172a, #1e293b);\n      color: white;\n      min-height: 100vh;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n    }\n    .card {\n      background: rgba(255,255,255,0.05);\n      border: 1px solid rgba(255,255,255,0.1);\n      border-radius: 16px;\n      padding: 40px;\n      text-align: center;\n      backdrop-filter: blur(10px);\n    }\n    h1 { font-size: 2rem; margin-bottom: 8px; }\n    p { color: #94a3b8; }\n    .btn {\n      margin-top: 20px;\n      padding: 12px 24px;\n      background: #6366f1;\n      border: none;\n      border-radius: 8px;\n      color: white;\n      font-weight: bold;\n      cursor: pointer;\n      transition: transform 0.2s;\n    }\n    .btn:hover { transform: scale(1.05); }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h1>🚀 Hello, Cognify!</h1>\n    <p>Edit this code and see the live preview</p>\n    <button class="btn" onclick="alert(\'It works!\')">Click Me</button>\n  </div>\n</body>\n</html>',
        supportsStdin: false,
        isWebLang: true,
        runsInBrowser: true,
    },
];

export function getLanguageById(id: string): LanguageConfig | undefined {
    return LANGUAGES.find(l => l.id === id);
}

export function getFileName(lang: LanguageConfig): string {
    if (lang.id === 'java') return 'Main.java';
    return `main${lang.extension}`;
}

export async function executeCode(
    languageId: string,
    code: string,
    stdin: string = ''
): Promise<ExecutionResult> {
    const lang = getLanguageById(languageId);
    if (!lang) throw new Error(`Unsupported language: ${languageId}`);

    if (lang.isWebLang) {
        // HTML/CSS/JS is handled client-side via iframe — not executed via Piston
        return {
            stdout: '[Live Preview] HTML/CSS/JS is rendered in the preview tab.',
            stderr: '',
            exitCode: 0,
            signal: null,
            language: lang.label,
            version: 'Browser',
        };
    }

    // Everything else runs server-side, via Cognify's execution API.
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(`${API_BASE}/execute`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                language: lang.pistonId,
                version: lang.pistonVersion,
                files: [{ content: code }],
                stdin,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        handleUnauthorized(response);

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            // The API returns a human-readable message for validation
            // failures, unsupported languages and Piston outages alike.
            return {
                stdout: '',
                stderr: data?.error || `Execution failed (HTTP ${response.status}).`,
                exitCode: 1,
                signal: null,
                language: lang.label,
                version: lang.pistonVersion,
            };
        }

        return {
            stdout: data?.run?.stdout ?? '',
            stderr: data?.run?.stderr ?? '',
            // A killed process (timeout, memory limit) has no exit code.
            // Defaulting to 0 would badge it as "Success".
            exitCode: data?.run?.exitCode ?? (data?.status === 'completed' ? 0 : 1),
            signal: data?.run?.signal ?? null,
            language: lang.label,
            version: data?.version || lang.pistonVersion,
        };
    } catch (err: any) {
        if (err.name === 'AbortError') {
            return {
                stdout: '',
                stderr: 'Execution timed out. The service may be unavailable.',
                exitCode: 1,
                signal: null,
                language: lang.label,
                version: lang.pistonVersion,
            };
        }
        return {
            stdout: '',
            stderr: `Network error: unable to reach the execution service. ${err?.message ?? ''}`,
            exitCode: 1,
            signal: null,
            language: lang.label,
            version: lang.pistonVersion,
        };
    }
}

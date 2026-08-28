#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Strix Security Audit Runner (Native Mode)
Automated vulnerability scanner, secret detector, and security quality gate for Antigravity.
"""

import os
import sys
import re
import json
import argparse
import subprocess
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional

SEVERITY_CRITICAL = "CRITICAL"
SEVERITY_HIGH = "HIGH"
SEVERITY_MEDIUM = "MEDIUM"
SEVERITY_LOW = "LOW"

IGNORE_DIRS = {
    ".git", "node_modules", "dist", "build", ".next", ".nuxt",
    "coverage", ".venv", "venv", "__pycache__", ".idea", ".vscode",
    ".agents", ".strix", "agent_runs", "strix_runs"
}

SUPPORTED_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".json", ".yaml", ".yml", ".env", ".html", ".vue", ".svelte"
}

@dataclass
class Finding:
    file: str
    line: int
    severity: str
    category: str
    cwe: str
    description: str
    snippet: str
    remediation: str

PATTERNS = [
    # 1. Hardcoded Secrets
    {
        "id": "SEC-001",
        "regex": r"(?i)(?:api_key|apikey|secret_key|private_key|auth_token|bearer_token|password|passwd|db_password)\s*[:=]\s*['\"][A-Za-z0-9_\-\.\/+=]{8,}['\"]",
        "severity": SEVERITY_CRITICAL,
        "category": "Hardcoded Secret",
        "cwe": "CWE-798",
        "description": "Possible hardcoded secret, token or credential detected in source code.",
        "remediation": "Move credential to environment variables (.env / process.env)."
    },
    {
        "id": "SEC-002",
        "regex": r"['\"](?:sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[0-9a-zA-Z]{36}|eyJh[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})['\"]",
        "severity": SEVERITY_CRITICAL,
        "category": "API Key / Token Leak",
        "cwe": "CWE-798",
        "description": "Detected concrete format of OpenAI API key, AWS Access Key, GitHub Token or JWT.",
        "remediation": "Revoke exposed token and load via environment variables."
    },

    # 2. Dynamic Code Execution
    {
        "id": "INJ-001",
        "regex": r"(?:eval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['`]|setInterval\s*\(\s*['`])",
        "severity": SEVERITY_CRITICAL,
        "category": "Dynamic Code Execution",
        "cwe": "CWE-95",
        "description": "Unsafe dynamic code execution (eval, new Function, or string timeout).",
        "remediation": "Refactor to static dispatch, AST parser or typed functions."
    },

    # 3. Cross-Site Scripting (XSS) & Unsafe DOM
    {
        "id": "XSS-001",
        "regex": r"(?:dangerouslySetInnerHTML|\.innerHTML\s*=(?!\s*['\"][\w\s]*['\"])|\.outerHTML\s*=|\bdocument\.write\s*\()",
        "severity": SEVERITY_HIGH,
        "category": "Cross-Site Scripting (XSS)",
        "cwe": "CWE-79",
        "description": "Unsafe DOM manipulation that can lead to Client-Side XSS.",
        "remediation": "Use textContent, React JSX elements, or sanitize HTML with DOMPurify."
    },

    # 4. Formula Injection (Spreadsheet / CSV)
    {
        "id": "FORM-001",
        "regex": r"(?i)(?:cmd\.exe|powershell\.exe|\bexec\b|\bdde\b)\s*\|",
        "severity": SEVERITY_HIGH,
        "category": "Formula / Command Injection",
        "cwe": "CWE-1236",
        "description": "Suspected DDE or formula execution payload in cell data.",
        "remediation": "Sanitize cell content and escape leading '=', '+', '-', '@' characters."
    },

    # 5. Prototype Pollution
    {
        "id": "PROTO-001",
        "regex": r"(?:\.\s*__proto__|\['__proto__'\]|\[\"__proto__\"\]|\bconstructor\s*\.\s*prototype\b)\s*=",
        "severity": SEVERITY_HIGH,
        "category": "Prototype Pollution",
        "cwe": "CWE-1321",
        "description": "Direct modification of Object prototype properties.",
        "remediation": "Safeguard object property assignments against '__proto__' and 'constructor'."
    },

    # 6. Command / Shell Injection
    {
        "id": "CMD-001",
        "regex": r"(?:child_process\.(?:exec|execSync)\s*\(\s*`[^`]*\$\{|\bos\.(?:system|popen)\s*\(\s*f['\"])|\bsubprocess\.call\s*\([^,]+,\s*shell\s*=\s*True",
        "severity": SEVERITY_CRITICAL,
        "category": "Command Injection",
        "cwe": "CWE-78",
        "description": "Shell execution with unescaped string interpolation.",
        "remediation": "Pass arguments as an array / list with shell=False."
    },

    # 7. Insecure PostMessage
    {
        "id": "POST-001",
        "regex": r"\.postMessage\s*\([^,]+,\s*['\"]\*['\"]\s*\)",
        "severity": SEVERITY_MEDIUM,
        "category": "Insecure Communication",
        "cwe": "CWE-345",
        "description": "postMessage sent with wildcard targetOrigin ('*').",
        "remediation": "Specify the exact origin instead of '*' to prevent cross-origin data leaks."
    }
]

def get_git_changed_files(workspace_root: Path) -> List[Path]:
    try:
        res = subprocess.run(["git", "status", "--porcelain"], cwd=workspace_root, capture_output=True, text=True, check=True)
        files = set()
        for line in res.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(maxsplit=1)
            if len(parts) == 2:
                file_rel = parts[1]
                if " -> " in file_rel:
                    file_rel = file_rel.split(" -> ")[1]
                files.add(workspace_root / file_rel)
        
        if not files:
            res_diff = subprocess.run(["git", "diff", "--name-only", "HEAD~1", "HEAD"], cwd=workspace_root, capture_output=True, text=True)
            if res_diff.returncode == 0:
                for line in res_diff.stdout.splitlines():
                    line = line.strip()
                    if line:
                        files.add(workspace_root / line)

        return [f for f in files if f.is_file() and f.suffix in SUPPORTED_EXTENSIONS]
    except Exception:
        return get_all_workspace_files(workspace_root)

def get_all_workspace_files(workspace_root: Path) -> List[Path]:
    result = []
    for root, dirs, files in os.walk(workspace_root):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for file in files:
            p = Path(root) / file
            if p.suffix in SUPPORTED_EXTENSIONS:
                result.append(p)
    return result

def scan_file(file_path: Path, workspace_root: Path) -> List[Finding]:
    findings = []
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return findings

    lines = content.splitlines()
    rel_path = str(file_path.relative_to(workspace_root))

    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("#") or stripped.startswith("/*") or stripped.startswith("*"):
            continue

        for rule in PATTERNS:
            match = re.search(rule["regex"], line)
            if match:
                if "strix_audit.py" in rel_path:
                    continue
                snippet = line.strip()
                if len(snippet) > 120:
                    snippet = snippet[:117] + "..."
                findings.append(Finding(
                    file=rel_path,
                    line=idx,
                    severity=rule["severity"],
                    category=rule["category"],
                    cwe=rule["cwe"],
                    description=rule["description"],
                    snippet=snippet,
                    remediation=rule["remediation"]
                ))
    return findings

def main():
    parser = argparse.ArgumentParser(description="Strix Security Audit Runner (Native Mode)")
    parser.add_argument("--diff", action="store_true", help="Audit only modified / git changed files")
    parser.add_argument("--full", action="store_true", help="Audit all workspace files")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")
    parser.add_argument("--check-env", action="store_true", help="Check environment & Strix status")
    parser.add_argument("--workspace", default=".", help="Workspace root path")
    args = parser.parse_args()

    workspace_root = Path(args.workspace).resolve()

    if args.check_env:
        print("=== STRIX GUARDIAN ENVIRONMENT CHECK ===")
        print(f"Workspace Root: {workspace_root}")
        print(f"Python Version: {sys.version.split()[0]}")
        try:
            import strix
            print("Strix Agent Library: Available (v1.5.3)")
        except ImportError:
            print("Strix Agent Library: Not installed")
        print("Audit Mode: Native SAST & Security Rule Engine (No-Docker Mode)")
        print("Status: READY")
        sys.exit(0)

    if args.diff:
        files = get_git_changed_files(workspace_root)
        mode_str = "Diff Mode (Modified Files)"
    else:
        files = get_all_workspace_files(workspace_root)
        mode_str = "Full Workspace Scan"

    all_findings: List[Finding] = []
    for f in files:
        all_findings.extend(scan_file(f, workspace_root))

    if args.json:
        print(json.dumps([asdict(f) for f in all_findings], indent=2))
        sys.exit(1 if any(f.severity in (SEVERITY_CRITICAL, SEVERITY_HIGH) for f in all_findings) else 0)

    print("=" * 72)
    print(" STRIX SECURITY GUARDIAN - AUDIT REPORT")
    print(f" Mode: {mode_str} | Scanned Files: {len(files)}")
    print("=" * 72)

    critical_count = sum(1 for f in all_findings if f.severity == SEVERITY_CRITICAL)
    high_count = sum(1 for f in all_findings if f.severity == SEVERITY_HIGH)
    medium_count = sum(1 for f in all_findings if f.severity == SEVERITY_MEDIUM)
    low_count = sum(1 for f in all_findings if f.severity == SEVERITY_LOW)

    if not all_findings:
        print("\n[+] STATUS: PASSED (CLEAN)")
        print("[+] Nenhum problema ou vulnerabilidade detectada!")
        print("[+] O codigo esta aderente aos padroes de seguranca Strix.\n")
        print("=" * 72)
        sys.exit(0)

    print(f"\n[!] Encontradas {len(all_findings)} potenciais vulnerabilidades:")
    print(f"    - CRITICAL: {critical_count}")
    print(f"    - HIGH:     {high_count}")
    print(f"    - MEDIUM:   {medium_count}")
    print(f"    - LOW:      {low_count}\n")

    for idx, item in enumerate(all_findings, start=1):
        print(f"[{idx}] [{item.severity}] {item.category} ({item.cwe})")
        print(f"    Arquivo:     {item.file}:{item.line}")
        print(f"    Descricao:   {item.description}")
        print(f"    Trecho:      {item.snippet}")
        print(f"    Remediacao:  {item.remediation}\n")

    print("=" * 72)
    if critical_count > 0 or high_count > 0:
        print("[-] STATUS: FAILED (Vulnerabilidades Criticas/Altas detectadas)")
        print("[-] Corrija os itens apontados antes de prosseguir com a conclusao.")
        sys.exit(1)
    else:
        print("[~] STATUS: WARNINGS (Apenas alertas de severidade Media/Baixa)")
        sys.exit(0)

if __name__ == "__main__":
    main()

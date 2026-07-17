import type { CheckReport, CompatibilityReport, Violation } from './types.js';

export type ReportFormat = 'pretty' | 'json' | 'junit' | 'sarif';

function xml(value: unknown): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function checkPretty(report: CheckReport): string {
  const status = report.passed ? 'PASS' : 'FAIL';
  const lines = [
    `${status}  ${report.contract.name}`,
    `      ${report.summary.events} events · ${report.summary.tool_calls} tool calls · ${report.error_count} errors · ${report.warning_count} warnings`,
  ];
  for (const result of report.results) {
    const mark = result.passed ? '✓' : result.severity === 'error' ? '✗' : '!';
    lines.push(`${mark} ${result.rule_id} (${result.rule_kind})`);
    result.violations.forEach((item) => lines.push(`    ${item.event_seq === undefined ? '' : `seq ${item.event_seq}: `}${item.message}`));
  }
  return `${lines.join('\n')}\n`;
}

function comparePretty(report: CompatibilityReport): string {
  const lines = [
    `${report.compatible ? 'COMPATIBLE' : 'REGRESSION'}  ${report.contract.name}`,
    `      baseline ${report.baseline.error_count} errors / candidate ${report.candidate.error_count} errors`,
  ];
  if (report.regressions.length === 0) lines.push('✓ No configured behavior regression detected.');
  report.regressions.forEach((item) => lines.push(`${item.severity === 'error' ? '✗' : '!'} ${item.kind}: ${item.message}`));
  return `${lines.join('\n')}\n`;
}

function violationsToJUnit(name: string, violations: Violation[]): string {
  const failures = violations.filter((item) => item.severity === 'error');
  const tests = Math.max(1, violations.length);
  const cases = violations.length === 0
    ? `<testcase classname="agent-invariants" name="${xml(name)}"/>`
    : violations.map((item) => {
        const body = `${item.message}${item.evidence ? `\n${JSON.stringify(item.evidence)}` : ''}`;
        if (item.severity === 'warning') return `<testcase classname="agent-invariants" name="${xml(item.rule_id)}"><system-out>${xml(body)}</system-out></testcase>`;
        return `<testcase classname="agent-invariants" name="${xml(item.rule_id)}"><failure message="${xml(item.message)}">${xml(body)}</failure></testcase>`;
      }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="agent-invariants" tests="${tests}" failures="${failures.length}">${cases}</testsuite>\n`;
}

function checkToSarif(report: CheckReport, tracePath = 'trace.jsonl'): string {
  const rules = report.results.map((result) => ({
    id: result.rule_id,
    name: result.rule_kind,
    shortDescription: { text: `${result.rule_kind} invariant` },
    defaultConfiguration: { level: result.severity === 'error' ? 'error' : 'warning' },
  }));
  const results = report.violations.map((item) => ({
    ruleId: item.rule_id,
    level: item.severity,
    message: { text: item.message },
    ...(item.event_index === undefined ? {} : {
      locations: [{ physicalLocation: { artifactLocation: { uri: tracePath }, region: { startLine: item.event_index + 1 } } }],
    }),
    properties: item.evidence ?? {},
  }));
  return `${JSON.stringify({
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{ tool: { driver: { name: 'Agent Invariants', informationUri: 'https://github.com/christian140903-sudo/agent-invariants', rules } }, results }],
  }, null, 2)}\n`;
}

export function renderCheckReport(report: CheckReport, format: ReportFormat, tracePath?: string): string {
  switch (format) {
    case 'pretty': return checkPretty(report);
    case 'json': return `${JSON.stringify(report, null, 2)}\n`;
    case 'junit': return violationsToJUnit(report.contract.name, report.violations);
    case 'sarif': return checkToSarif(report, tracePath);
  }
}

export function renderCompatibilityReport(report: CompatibilityReport, format: ReportFormat): string {
  switch (format) {
    case 'pretty': return comparePretty(report);
    case 'json': return `${JSON.stringify(report, null, 2)}\n`;
    case 'junit': {
      const violations: Violation[] = report.regressions.map((item, index) => ({
        rule_id: `compatibility.${item.kind}.${index + 1}`,
        rule_kind: 'deny_event',
        severity: item.severity,
        message: item.message,
        evidence: item.evidence,
      }));
      return violationsToJUnit(`${report.contract.name} compatibility`, violations);
    }
    case 'sarif': {
      const fake: CheckReport = {
        schema: 'agent-invariants/check/v1', contract: report.contract, passed: report.compatible,
        error_count: report.regressions.filter((item) => item.severity === 'error').length,
        warning_count: report.regressions.filter((item) => item.severity === 'warning').length,
        summary: report.candidate.summary,
        results: report.regressions.map((item, index) => ({ rule_id: `compatibility.${item.kind}.${index + 1}`, rule_kind: 'deny_event', passed: false, severity: item.severity, checked: 1, violations: [] })),
        violations: report.regressions.map((item, index) => ({ rule_id: `compatibility.${item.kind}.${index + 1}`, rule_kind: 'deny_event', severity: item.severity, message: item.message, evidence: item.evidence })),
      };
      return checkToSarif(fake, 'candidate-trace.jsonl');
    }
  }
}

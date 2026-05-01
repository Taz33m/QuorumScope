import {
  AlertTriangle,
  CheckCircle2,
  Network,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Split,
  TestTube2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  analyzeScenario,
  runBenchmark,
  splitBrainStaleReadScenario,
  type AnalysisResult,
  type EventRecord,
  type NodeId,
  type OperationRecord,
  type ProtocolName,
} from "./core";

interface Point {
  x: number;
  y: number;
}

interface UiNodeState {
  id: NodeId;
  value: string;
  version: number;
}

const POSITIONS: Record<NodeId, Point> = {
  n1: { x: 160, y: 135 },
  n2: { x: 165, y: 290 },
  n3: { x: 405, y: 105 },
  n4: { x: 505, y: 210 },
  n5: { x: 390, y: 315 },
};

const DEFAULT_CLIENT_ANCHOR: Point = { x: 55, y: 215 };
const CLIENT_ANCHORS: Record<number, Point> = {
  0: DEFAULT_CLIENT_ANCHOR,
  1: { x: 585, y: 215 },
};

const protocolLabels: Record<ProtocolName, string> = {
  unsafe: "First-ack",
  quorum: "Quorum",
};

export function App() {
  const analyses = useMemo(
    () => ({
      unsafe: analyzeScenario(splitBrainStaleReadScenario, "unsafe"),
      quorum: analyzeScenario(splitBrainStaleReadScenario, "quorum"),
    }),
    [],
  );
  const benchmark = useMemo(() => runBenchmark(50, 4310), []);
  const [protocol, setProtocol] = useState<ProtocolName>("unsafe");
  const [eventIndex, setEventIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pendingJump, setPendingJump] = useState<{ protocol: ProtocolName; opId: string } | undefined>();
  const result = analyses[protocol];
  const maxIndex = Math.max(0, result.events.length - 1);
  const currentIndex = Math.min(eventIndex, maxIndex);
  const currentEvent = result.events[currentIndex] ?? result.events[0];

  useEffect(() => {
    setEventIndex(0);
    setPlaying(false);
  }, [protocol]);

  useEffect(() => {
    if (!pendingJump || pendingJump.protocol !== protocol) {
      return;
    }
    const targetIndex = analyses[protocol].events.findIndex(
      (event) => event.opId === pendingJump.opId && event.type === "operation-complete",
    );
    setEventIndex(Math.max(0, targetIndex));
    setPlaying(false);
    setPendingJump(undefined);
  }, [analyses, pendingJump, protocol]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = window.setInterval(() => {
      setEventIndex((index) => {
        if (index >= maxIndex) {
          window.clearInterval(timer);
          setPlaying(false);
          return maxIndex;
        }
        return index + 1;
      });
    }, 430);
    return () => window.clearInterval(timer);
  }, [maxIndex, playing]);

  const witness = result.verdict.witness?.type === "stale-read" ? result.verdict.witness : undefined;
  const unsafeWitness =
    analyses.unsafe.verdict.witness?.type === "stale-read" ? analyses.unsafe.verdict.witness : undefined;
  const nodeStates = nodesAt(result, currentIndex);
  const groups = groupsAt(result, currentIndex);
  const jumpTo = (nextProtocol: ProtocolName, opId: string) => {
    setPendingJump({ protocol: nextProtocol, opId });
    setProtocol(nextProtocol);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">
            <Network size={16} /> Deterministic distributed-systems fault lab
          </div>
          <h1>QuorumScope</h1>
          <p>
            Replay one partition schedule against two replicated-register protocols, then check whether
            every successful read has a legal sequential explanation.
          </p>
        </div>
        <div className="verdict-chip" data-state={result.verdict.ok ? "ok" : "bad"}>
          {result.verdict.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {result.verdict.ok ? "Linearizable" : "Violation found"}
        </div>
      </header>

      <section className="proof-strip" aria-label="Demo proof">
        <div>
          <span>First-ack failure</span>
          <strong>
            {unsafeWitness?.priorWrite.id ?? "op2"} writes {unsafeWitness?.expected ?? "v1"};{" "}
            {unsafeWitness?.read.id ?? "op3"} reads {unsafeWitness?.observed ?? "v0"}
          </strong>
        </div>
        <div>
          <span>Quorum contrast</span>
          <strong>same minority read returns unavailable instead of stale data</strong>
        </div>
        <div>
          <span>Checker</span>
          <strong>backtracks successful operations against a single-register spec</strong>
        </div>
      </section>

      <section className="control-band" aria-label="Replay controls">
        <div className="protocol-tabs" role="tablist" aria-label="Protocol">
          {(["unsafe", "quorum"] as const).map((name) => (
            <button
              key={name}
              className={name === protocol ? "active" : ""}
              onClick={() => setProtocol(name)}
              role="tab"
              aria-selected={name === protocol}
            >
              {name === "quorum" ? <ShieldCheck size={16} /> : <Split size={16} />}
              {protocolLabels[name]}
            </button>
          ))}
        </div>
        <div className="replay-controls">
          <button
            className="icon-button"
            onClick={() => setEventIndex(0)}
            aria-label="Reset trace"
            title="Reset trace"
          >
            <RotateCcw size={17} />
          </button>
          <button
            className="icon-button"
            onClick={() => setEventIndex((index) => Math.max(0, index - 1))}
            aria-label="Previous event"
            title="Previous event"
          >
            <SkipBack size={17} />
          </button>
          <button
            className="primary-button"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? "Pause replay" : "Play replay"}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
            {playing ? "Pause" : "Replay"}
          </button>
          <button
            className="icon-button"
            onClick={() => setEventIndex((index) => Math.min(maxIndex, index + 1))}
            aria-label="Next event"
            title="Next event"
          >
            <SkipForward size={17} />
          </button>
          <input
            aria-label="Trace position"
            className="trace-slider"
            type="range"
            min={0}
            max={maxIndex}
            value={currentIndex}
            onChange={(event) => setEventIndex(Number(event.target.value))}
          />
        </div>
        <div className="jump-controls">
          <button
            onClick={() => jumpTo("unsafe", unsafeWitness?.read.id ?? "op3")}
            className="secondary-button"
          >
            <AlertTriangle size={16} />
            Violation
          </button>
          <button onClick={() => jumpTo("quorum", "op3")} className="secondary-button">
            <ShieldCheck size={16} />
            Quorum
          </button>
        </div>
        <div className="time-readout">
          t={currentEvent?.time ?? 0}ms
          <span>{currentEvent?.type ?? "event"}</span>
        </div>
      </section>

      <section className="workbench">
        <div className="network-pane">
          <NetworkMap
            result={result}
            event={currentEvent}
            groups={groups}
            nodes={nodeStates}
          />
        </div>

        <aside className="evidence-pane">
          <VerdictPanel result={result} />
          <ProtocolComparison unsafe={analyses.unsafe} quorum={analyses.quorum} />
        </aside>
      </section>

      <section className="trace-grid">
        <OperationTimeline
          operations={result.operations}
          witnessReadId={witness?.read.id}
          witnessWriteId={witness?.priorWrite.id}
        />
        <EventTrace events={result.events} currentIndex={currentIndex} onSelect={setEventIndex} />
        <BenchmarkPanel rows={benchmark.rows} />
      </section>
    </main>
  );
}

function NetworkMap({
  result,
  event,
  groups,
  nodes,
}: {
  result: AnalysisResult;
  event?: EventRecord;
  groups: NodeId[][];
  nodes: UiNodeState[];
}) {
  const operation = event?.opId
    ? result.operations.find((candidate) => candidate.id === event.opId)
    : undefined;
  const clientAnchor = operation ? CLIENT_ANCHORS[operation.zone] ?? DEFAULT_CLIENT_ANCHOR : DEFAULT_CLIENT_ANCHOR;
  const eventTarget = event?.target && POSITIONS[event.target] ? POSITIONS[event.target] : undefined;
  const eventSource = event?.source && POSITIONS[event.source] ? POSITIONS[event.source] : undefined;
  const packetStart = eventSource ?? clientAnchor;
  const packetEnd = eventTarget ?? clientAnchor;

  return (
    <div>
      <div className="pane-heading">
        <h2>{result.scenario.name}</h2>
        <span>{result.protocol === "unsafe" ? "accepts after 1 ack" : "requires majority quorum"}</span>
      </div>
      <svg className="network-map" viewBox="0 0 640 420" role="img" aria-label="Replica network state">
        {groups.map((group, index) => {
          const box = groupBox(group);
          if (!box) {
            return null;
          }
          return (
            <rect
              key={`${group.join("-")}-${index}`}
              className={groups.length > 1 ? "partition-box split" : "partition-box"}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx="8"
            />
          );
        })}

        {groups.flatMap((group) =>
          group.flatMap((left, leftIndex) =>
            group.slice(leftIndex + 1).map((right) => (
              <line
                key={`${left}-${right}`}
                className="replica-link"
                x1={POSITIONS[left]?.x}
                y1={POSITIONS[left]?.y}
                x2={POSITIONS[right]?.x}
                y2={POSITIONS[right]?.y}
              />
            )),
          ),
        )}

        {[0, 1].map((zone) => {
          const anchor = CLIENT_ANCHORS[zone] ?? DEFAULT_CLIENT_ANCHOR;
          return (
            <g key={zone} className="client-anchor">
              <circle cx={anchor.x} cy={anchor.y} r="20" />
              <text x={anchor.x} y={anchor.y + 5} textAnchor="middle">
                c{zone}
              </text>
            </g>
          );
        })}

        {event && event.opId ? (
          <line
            className={`packet-line ${event.type}`}
            x1={packetStart.x}
            y1={packetStart.y}
            x2={packetEnd.x}
            y2={packetEnd.y}
          />
        ) : null}

        {nodes.map((node) => {
          const point = POSITIONS[node.id] ?? { x: 0, y: 0 };
          const hot = event?.target === node.id || event?.source === node.id;
          return (
            <g key={node.id} className={`replica-node ${node.value === "v1" ? "new-value" : ""} ${hot ? "hot" : ""}`}>
              <circle cx={point.x} cy={point.y} r="34" />
              <text className="node-id" x={point.x} y={point.y - 5} textAnchor="middle">
                {node.id}
              </text>
              <text className="node-value" x={point.x} y={point.y + 14} textAnchor="middle">
                {node.value}@{node.version}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="current-event">
        <strong>{event?.type ?? "event"}</strong>
        <span>{event?.note ?? "Trace ready"}</span>
      </div>
      <div className="legend" aria-label="Trace legend">
        <span><i className="legend-node old" /> v0 replica</span>
        <span><i className="legend-node new" /> v1 replica</span>
        <span><i className="legend-line request" /> request</span>
        <span><i className="legend-line commit" /> commit</span>
        <span><i className="legend-line ack" /> ack</span>
        <span><i className="legend-box" /> partition group</span>
      </div>
    </div>
  );
}

function VerdictPanel({ result }: { result: AnalysisResult }) {
  const witness = result.verdict.witness;
  return (
    <section className="verdict-panel" aria-label="Checker verdict">
      <div className="pane-heading">
        <h2>Checker Verdict</h2>
        <span>{result.verdict.checkedOperations} successful ops checked</span>
      </div>
      {result.verdict.ok ? (
        <div className="proof ok">
          <CheckCircle2 size={20} />
          <div>
            <strong>Legal sequential order exists.</strong>
            <p>{result.verdict.legalOrder.join(" -> ")}</p>
          </div>
        </div>
      ) : witness?.type === "stale-read" ? (
        <div className="proof bad">
          <AlertTriangle size={20} />
          <div>
            <strong>{witness.read.id} returned {witness.observed} after {witness.priorWrite.id} wrote {witness.expected}.</strong>
            <p>{witness.explanation}</p>
          </div>
        </div>
      ) : (
        <div className="proof bad">
          <AlertTriangle size={20} />
          <div>
            <strong>No legal order found.</strong>
            <p>{witness?.explanation}</p>
          </div>
        </div>
      )}

      {result.minimizedFailure ? (
        <div className="minimized">
          <span>Minimized counterexample</span>
          <strong>{result.minimizedFailure.scenario.steps.length} steps</strong>
          <p>Removed {result.minimizedFailure.removedSteps} irrelevant steps while preserving the violation.</p>
          <ol>
            {result.minimizedFailure.scenario.steps.map((step, index) => (
              <li key={`${step.type}-${index}`}>{describeStep(step)}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function ProtocolComparison({ unsafe, quorum }: { unsafe: AnalysisResult; quorum: AnalysisResult }) {
  const rows = [unsafe, quorum];
  return (
    <section className="comparison" aria-label="Protocol comparison">
      <div className="pane-heading">
        <h2>Same Schedule</h2>
        <span>different safety outcome</span>
      </div>
      {rows.map((row) => (
        <div className="comparison-row" key={row.protocol} data-state={row.verdict.ok ? "ok" : "bad"}>
          <span>{protocolLabels[row.protocol]}</span>
          <strong>{row.verdict.ok ? "safe history" : "stale read"}</strong>
          <em>{row.metrics.unavailableOperations} unavailable</em>
        </div>
      ))}
    </section>
  );
}

function OperationTimeline({
  operations,
  witnessReadId,
  witnessWriteId,
}: {
  operations: OperationRecord[];
  witnessReadId?: string;
  witnessWriteId?: string;
}) {
  return (
    <section className="timeline-panel">
      <div className="pane-heading">
        <h2>Operations</h2>
        <span>real-time history</span>
      </div>
      <div className="operation-list">
        {operations.map((operation) => (
          <div
            className={`operation-row ${operation.status} ${operation.id === witnessReadId ? "witness" : ""} ${
              operation.id === witnessWriteId ? "prior" : ""
            }`}
            key={operation.id}
          >
            <span className="op-id">{operation.id}</span>
            <span>{operation.kind === "write" ? `write ${operation.input}` : `read ${operation.output ?? "n/a"}`}</span>
            <span>t={operation.start}-{operation.end}</span>
            <strong>{operation.status}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function describeStep(step: AnalysisResult["scenario"]["steps"][number]): string {
  if (step.type === "partition") {
    return `partition ${step.groups.map((group) => `[${group.join(", ")}]`).join(" | ")}`;
  }
  if (step.type === "write") {
    return `${step.client} writes ${step.value} in zone ${step.zone}`;
  }
  if (step.type === "read") {
    return `${step.client} reads in zone ${step.zone}`;
  }
  if (step.type === "wait") {
    return `wait ${step.ms}ms`;
  }
  return "heal network";
}

function EventTrace({
  events,
  currentIndex,
  onSelect,
}: {
  events: EventRecord[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="event-panel">
      <div className="pane-heading">
        <h2>Trace</h2>
        <span>{events.length} events</span>
      </div>
      <div className="event-list">
        {events.map((event, index) => (
          <button
            className={index === currentIndex ? "event-row active" : "event-row"}
            key={event.id}
            onClick={() => onSelect(index)}
          >
            <span>{event.time}</span>
            <strong>{event.type}</strong>
            <em>{event.note}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function BenchmarkPanel({ rows }: { rows: ReturnType<typeof runBenchmark>["rows"] }) {
  return (
    <section className="benchmark-panel">
      <div className="pane-heading">
        <h2>Benchmark</h2>
        <span>
          <TestTube2 size={14} /> 50 seeded schedules
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Protocol</th>
            <th>Violations</th>
            <th>Unavailable</th>
            <th>Avg events</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.protocol}>
              <td>{protocolLabels[row.protocol]}</td>
              <td>{row.violations}</td>
              <td>{row.unavailableOperations}</td>
              <td>{row.averageEvents}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function nodesAt(result: AnalysisResult, eventIndex: number): UiNodeState[] {
  const states = new Map<NodeId, UiNodeState>(
    result.scenario.nodes.map((id) => [
      id,
      {
        id,
        value: result.scenario.initialValue,
        version: 0,
      },
    ]),
  );
  for (const event of result.events.slice(0, eventIndex + 1)) {
    if (event.type !== "commit" || !event.target || event.value === undefined || event.version === undefined) {
      continue;
    }
    states.set(event.target, {
      id: event.target,
      value: event.value,
      version: event.version,
    });
  }
  return result.scenario.nodes.map((id) => states.get(id) ?? { id, value: "?", version: -1 });
}

function groupsAt(result: AnalysisResult, eventIndex: number): NodeId[][] {
  let groups: NodeId[][] = [result.scenario.nodes];
  for (const event of result.events.slice(0, eventIndex + 1)) {
    if ((event.type === "partition" || event.type === "heal") && event.groups) {
      groups = event.groups;
    }
  }
  return groups;
}

function groupBox(group: readonly NodeId[]) {
  const points = group.map((id) => POSITIONS[id]).filter((point): point is Point => Boolean(point));
  if (points.length === 0) {
    return undefined;
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 68;
  const minY = Math.min(...ys) - 68;
  const maxX = Math.max(...xs) + 68;
  const maxY = Math.max(...ys) + 68;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

"use client";

import {
  Brain,
  Check,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  Pin,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { DragEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatCompletedAt, sortByCompletedAtDesc } from "@/lib/doneTasks";
import { applyNoteEnter, prefixFirstNoteLine } from "@/lib/noteList";
import { nextTaskFlagColor } from "@/lib/taskFlags";
import { usePlanner } from "@/components/PlannerProvider";
import type { Horizon, StoredPerson, StoredTask, TaskList } from "@/lib/plannerDocument";

type Task = StoredTask;
type Person = StoredPerson;

type Tab = TaskList | "discuss";

const horizons: Array<[Horizon, string]> = [
  ["overdue", "Overdue"],
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["this_week", "This week"],
  ["next_week", "Next week"],
  ["later", "Later"],
];

const tabs: Array<[Tab, string]> = [
  ["work", "Work"],
  ["personal", "Personal"],
  ["discuss", "To discuss"],
];

// The screen updates by itself after each change, so there is nothing to reload.
const noChange = async () => {};

export function Dashboard() {
  const planner = usePlanner();
  // The lists live in PlannerProvider and update instantly after every change.
  const { tasks, people, saving, saveError, clearSaveError } = planner;
  const [tab, setTab] = useState<Tab>("work");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      await planner.load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Couldn’t load the lists.");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [planner]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    function msUntilNextMidnight() {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 5, 0);
      return next.getTime() - now.getTime();
    }
    let midnightTimer = window.setTimeout(function tick() {
      void refresh({ silent: true });
      midnightTimer = window.setTimeout(tick, msUntilNextMidnight());
    }, msUntilNextMidnight());
    function onVisible() {
      if (document.visibilityState === "visible") void refresh({ silent: true });
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(midnightTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  async function reorderTaskList(
    ids: string[],
    change?: { movedId: string; horizon: Horizon },
  ) {
    try {
      await planner.reorderTasks(ids, change);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Couldn’t change the order.");
    }
  }

  async function patchTask(id: string, patch: Record<string, unknown>) {
    try {
      await planner.patchTask(id, patch as Partial<Task>);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Couldn’t update the task.");
    }
  }

  const listed = tab === "discuss" ? [] : tasks.filter((task) => task.list === tab);
  const active = listed.filter((task) => !["done", "archived"].includes(task.status));
  const focus = active.find((task) => task.status === "in_progress") ?? active[0];

  return (
    <main className="compactShell">
      <header className="topbar">
        <div className="compactBrand">
          <span className="brandMark"><Brain size={18} /></span>
          <strong>FocusFlow</strong>
        </div>
        {saving && <span className="saveStatus" style={{ marginLeft: "auto", marginRight: 8, fontSize: 12, opacity: 0.6 }}>Saving…</span>}
        <button type="button" className="signOut" onClick={planner.signOut}>Sign out</button>
      </header>
      <div className="appTabs" role="tablist" aria-label="Sections">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "discuss" && <QuickCapture key={tab} list={tab} onCreated={noChange} onError={setToast} />}

      {loading && tasks.length === 0 && people.length === 0 ? <div className="empty">Loading…</div> : (
        tab === "discuss" ? (
          <PeoplePanel people={people} onChanged={noChange} onError={setToast} />
        ) : (
          <div className="tabPage">
            {focus && (
              <div className="compactFocus">
                <span><Sparkles size={13} /> Now</span>
                <strong>{focus.title}</strong>
                <button onClick={() => patchTask(focus.id, { status: "done" })}><Check size={14} /> Done</button>
              </div>
            )}
            <CompactTaskList key={tab} tasks={listed} onPatch={patchTask} onReorder={reorderTaskList} />
          </div>
        )
      )}
      {(toast || saveError) && (
        <button className="toast" onClick={() => { setToast(""); clearSaveError(); }}>{toast || saveError}</button>
      )}
    </main>
  );
}

function QuickCapture({
  list,
  onCreated,
  onError,
}: {
  list: TaskList;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const planner = usePlanner();
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("today");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      await planner.createTask({ title, horizon, list });
    } catch (error) {
      return onError(error instanceof Error ? error.message : "Couldn’t create the task.");
    }
    setTitle("");
    setHorizon("today");
    await onCreated();
  }
  function onShortcut(event: KeyboardEvent<HTMLFormElement>) {
    if (event.altKey || event.shiftKey || event.repeat) return;
    if (!event.metaKey && !event.ctrlKey) return;
    const match = /^Digit([1-6])$/.exec(event.code);
    if (!match) return;
    event.preventDefault();
    setHorizon(horizons[Number(match[1]) - 1][0]);
  }
  return (
    <form className="quickCapture" onSubmit={submit} onKeyDown={onShortcut}>
      <Plus size={20} />
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Capture a task and clear your head…"
        aria-label="New task"
      />
      <select
        value={horizon}
        onChange={(event) => setHorizon(event.target.value as Horizon)}
        aria-label="Due date for the new task"
        title="Control+1 Overdue, Control+2 Today, Control+3 Tomorrow, Control+4 This week, Control+5 Next week, Control+6 Later"
      >
        {horizons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button type="submit" aria-label="Add task">Enter</button>
    </form>
  );
}

function CompactTaskList({
  tasks,
  onPatch,
  onReorder,
}: {
  tasks: Task[];
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onReorder: (ids: string[], change?: { movedId: string; horizon: Horizon }) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"active" | "done">("active");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const filtered = tasks.filter((task) =>
    filter === "done" ? task.status === "done" : !["done", "archived"].includes(task.status),
  );
  const visible = filter === "done" ? sortByCompletedAtDesc(filtered) : filtered;

  function moveTask(fromId: string, index: number) {
    const from = visible.findIndex((task) => task.id === fromId);
    if (from < 0 || index < 0 || index > visible.length || from === index || from + 1 === index) return;
    const source = visible[from];
    const targetHorizon = (index >= visible.length ? visible[visible.length - 1] : visible[index]).horizon;
    const next = [...visible];
    const [moved] = next.splice(from, 1);
    next.splice(index > from ? index - 1 : index, 0, { ...moved, horizon: targetHorizon });
    const groupIds = next.filter((task) => task.horizon === targetHorizon).map((task) => task.id);
    setDraggingId(null);
    setDropIndex(null);
    void onReorder(
      groupIds,
      targetHorizon === source.horizon ? undefined : { movedId: fromId, horizon: targetHorizon },
    );
  }

  const groups: Array<{ horizon: Horizon; entries: Array<{ task: Task; index: number }> }> = [];
  if (filter !== "done") {
    visible.forEach((task, index) => {
      const current = groups[groups.length - 1];
      if (current?.horizon === task.horizon) current.entries.push({ task, index });
      else groups.push({ horizon: task.horizon, entries: [{ task, index }] });
    });
  }

  function renderRow(task: Task, index: number) {
    return (
      <TaskRow
        key={task.id}
        task={task}
        dragging={draggingId === task.id}
        dropBefore={filter !== "done" && dropIndex === index}
        dropAfter={filter !== "done" && index === visible.length - 1 && dropIndex === visible.length}
        onPatch={onPatch}
        onToggleFlag={() => {
          void onPatch(task.id, {
            flagColor: task.flagColor
              ? null
              : nextTaskFlagColor(tasks.map((item) => item.flagColor)),
          });
        }}
        onDragStart={() => setDraggingId(task.id)}
        onDragEnd={() => {
          setDraggingId(null);
          setDropIndex(null);
        }}
        onDragOverIndex={(nextIndex) => setDropIndex(nextIndex)}
        onDrop={(nextIndex) => draggingId && moveTask(draggingId, nextIndex)}
        index={index}
      />
    );
  }

  return (
    <section className="compactSection">
      <div className="compactSectionHead">
        <h2>Tasks <small>{visible.length}</small></h2>
        <div className="segmented">
          <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Active</button>
          <button className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}>Done</button>
        </div>
      </div>
      <div
        className={`compactTaskList ${filter === "done" ? "doneList" : ""}`}
        onDragOver={(event) => event.preventDefault()}
      >
        {visible.length ? (
          filter === "done" ? visible.map((task, index) => renderRow(task, index)) : groups.map((group) => (
            <div className={`horizonGroup group-${group.horizon}`} key={group.horizon}>
              <div className="horizonLabel">{horizons.find(([value]) => value === group.horizon)?.[1]}</div>
              {group.entries.map(({ task, index }) => renderRow(task, index))}
            </div>
          ))
        ) : <div className="miniEmpty">No tasks</div>}
        {filter !== "done" && visible.length > 0 && (
          <div
            className={`dropTail ${dropIndex === visible.length ? "active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDropIndex(visible.length);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggingId) moveTask(draggingId, visible.length);
            }}
          />
        )}
      </div>
    </section>
  );
}

function PeoplePanel({
  people,
  onChanged,
  onError,
}: {
  people: Person[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const planner = usePlanner();
  const [name, setName] = useState("");
  const [expandedAll, setExpandedAll] = useState(false);

  async function addPerson(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await planner.createPerson(name);
    } catch (error) {
      return onError(error instanceof Error ? error.message : "Couldn’t add the person.");
    }
    setName("");
    await onChanged();
  }

  async function savePerson(id: string, patch: Record<string, string | boolean>) {
    try {
      await planner.patchPerson(id, patch as Partial<Pick<Person, "name" | "topics" | "pinned">>);
    } catch (error) {
      return onError(error instanceof Error ? error.message : "Couldn’t update the person.");
    }
    await onChanged();
  }

  return (
    <section className="compactSection peoplePanel discussPage">
      <div className="compactSectionHead">
        <h2><Users size={16} /> To discuss <small>{people.length}</small></h2>
        {people.length > 0 && (
          <button
            type="button"
            className="quietToggle"
            onClick={() => setExpandedAll((current) => !current)}
          >
            {expandedAll ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />}
            {expandedAll ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>
      <form className="addPerson" onSubmit={addPerson}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a person…" />
        <button className="iconButton" title="Add"><Plus size={15} /></button>
      </form>
      <PeopleList people={people} expandedAll={expandedAll} onSave={savePerson} onChanged={onChanged} onError={onError} />
    </section>
  );
}

function PeopleList({
  people,
  expandedAll,
  onSave,
  onChanged,
  onError,
}: {
  people: Person[];
  expandedAll: boolean;
  onSave: (id: string, patch: Record<string, string | boolean>) => Promise<void>;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const planner = usePlanner();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  async function movePerson(fromId: string, index: number) {
    const from = people.findIndex((person) => person.id === fromId);
    if (from < 0 || index < 0 || index > people.length || from === index || from + 1 === index) return;
    const source = people[from];
    const pinned = (index >= people.length ? people[people.length - 1] : people[index]).pinned;
    const next = [...people];
    const [moved] = next.splice(from, 1);
    next.splice(index > from ? index - 1 : index, 0, { ...moved, pinned });
    const groupIds = next.filter((person) => person.pinned === pinned).map((person) => person.id);
    setDraggingId(null);
    setDropIndex(null);
    try {
      await planner.reorderPeople(
        groupIds,
        pinned === source.pinned ? undefined : { movedId: fromId, pinned },
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn’t change the order.");
    }
    await onChanged();
  }

  return (
    <div className={`peopleList ${expandedAll ? "expanded" : ""}`}>
      {people.length ? people.map((person, index) => (
        <div key={person.id}>
          {(person.pinned ? index === 0 : index > 0 && people[index - 1].pinned) && (
            <div className="horizonLabel">{person.pinned ? "Pinned" : "Everyone else"}</div>
          )}
          <PersonEditor
            person={person}
            expanded={expandedAll}
            dragging={draggingId === person.id}
            dropBefore={dropIndex === index}
            onSave={(patch) => onSave(person.id, patch)}
            onDelete={async () => {
              try {
                await planner.deletePerson(person.id);
              } catch (error) {
                onError(error instanceof Error ? error.message : "Couldn’t delete the person.");
              }
              await onChanged();
            }}
            onDragStart={() => setDraggingId(person.id)}
            onDragEnd={() => {
              setDraggingId(null);
              setDropIndex(null);
            }}
            onDragOver={() => setDropIndex(index)}
            onDrop={() => draggingId && void movePerson(draggingId, index)}
          />
        </div>
      )) : <div className="miniEmpty">Add a colleague or someone close to you</div>}
    </div>
  );
}

function PersonEditor({
  person,
  expanded,
  dragging,
  dropBefore,
  onSave,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  person: Person;
  expanded: boolean;
  dragging: boolean;
  dropBefore: boolean;
  onSave: (patch: Record<string, string | boolean>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const [name, setName] = useState(person.name);
  const [topics, setTopics] = useState(person.topics);
  const topicsRef = useRef<HTMLTextAreaElement>(null);
  const cursorRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const element = topicsRef.current;
    if (!element) return;
    if (cursorRef.current != null) {
      element.setSelectionRange(cursorRef.current, cursorRef.current);
      cursorRef.current = null;
    }
    if (expanded) {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    } else {
      element.style.height = "";
    }
  }, [expanded, topics]);
  return (
    <article
      className={`personCard ${person.pinned ? "pinned" : ""} ${dragging ? "dragging" : ""} ${dropBefore ? "dropBefore" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div>
        <span
          className="dragHandle"
          draggable
          aria-label="Move person"
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", person.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical size={14} />
        </span>
        <input
          className="personName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => name.trim() && name !== person.name && void onSave({ name })}
        />
        <button
          className={`pinButton ${person.pinned ? "active" : ""}`}
          onClick={() => void onSave({ pinned: !person.pinned })}
          title={person.pinned ? "Unpin" : "Pin"}
          aria-label={person.pinned ? "Unpin" : "Pin"}
          aria-pressed={person.pinned}
        >
          <Pin size={14} />
        </button>
        <button className="deleteIcon" onClick={() => void onDelete()} title="Delete"><Trash2 size={13} /></button>
      </div>
      <textarea
        ref={topicsRef}
        className={expanded ? "expanded" : ""}
        value={topics}
        onChange={(event) => {
          const next = prefixFirstNoteLine(topics, event.target.value);
          if (next !== event.target.value) cursorRef.current = next.length;
          setTopics(next);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          const element = event.currentTarget;
          const start = element.selectionStart ?? topics.length;
          const end = element.selectionEnd ?? topics.length;
          const next = applyNoteEnter(topics, start, end);
          cursorRef.current = next.cursor;
          setTopics(next.value);
        }}
        onBlur={() => topics !== person.topics && void onSave({ topics })}
        placeholder="Topics, questions, promises…"
      />
    </article>
  );
}

function TaskEditor({
  task,
  onPatch,
}: {
  task: Task;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [savedTitle, setSavedTitle] = useState(task.title);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  if (savedTitle !== task.title) {
    setSavedTitle(task.title);
    if (title === savedTitle) setTitle(task.title);
  }

  useLayoutEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    element.style.height = "auto";
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
    const maxHeight = Math.ceil((Number.isFinite(lineHeight) ? lineHeight : 20) * 2);
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight + 2 ? "auto" : "hidden";
  }, [title]);

  return (
    <div className="taskBody">
      <div className="taskTitleRow">
        {task.flagColor && (
          <span className="taskFlag" style={{ color: task.flagColor }} aria-hidden="true">!</span>
        )}
        <textarea
          ref={titleRef}
          className="taskTitle"
          rows={1}
          value={title}
          aria-label="Task title"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          onBlur={() => title.trim() && title !== task.title && void onPatch(task.id, { title })}
        />
      </div>
    </div>
  );
}

function TaskRow({
  task,
  index,
  dragging,
  dropBefore,
  dropAfter,
  onPatch,
  onToggleFlag,
  onDragStart,
  onDragEnd,
  onDragOverIndex,
  onDrop,
}: {
  task: Task;
  index: number;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onToggleFlag: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverIndex: (index: number) => void;
  onDrop: (index: number) => void;
}) {
  const ignoreDrag = useRef(false);

  function startDrag(event: DragEvent) {
    if (ignoreDrag.current) {
      event.preventDefault();
      ignoreDrag.current = false;
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    onDragStart();
  }

  return (
    <article
      className={`taskRow ${task.status === "done" ? "done" : ""} ${dragging ? "dragging" : ""} ${dropBefore ? "dropBefore" : ""} ${dropAfter ? "dropAfter" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        onDragOverIndex(event.clientY > bounds.top + bounds.height / 2 ? index + 1 : index);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        onDrop(event.clientY > bounds.top + bounds.height / 2 ? index + 1 : index);
      }}
    >
      <span
        className="dragHandle"
        draggable={task.status !== "done"}
        aria-label={task.status === "done" ? "Double-click to flag" : "Move task. Double-click to flag"}
        title={task.status === "done" ? "Double-click to flag" : "Drag to reorder. Double-click to flag"}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          ignoreDrag.current = true;
          onToggleFlag();
        }}
        onDragStart={(event) => startDrag(event)}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={14} />
      </span>
      <TaskEditor task={task} onPatch={onPatch} />
      {task.status === "done" && task.completedAt && (
        <time className="completedAt" dateTime={task.completedAt}>
          {formatCompletedAt(task.completedAt)}
        </time>
      )}
      <select
        className={`horizon horizon-${task.horizon}`}
        value={task.horizon}
        onChange={(event) => onPatch(task.id, { horizon: event.target.value })}
        onDragStart={(event) => event.preventDefault()}
        aria-label="Due"
      >
        {horizons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button
        type="button"
        className={`completeButton ${task.status === "done" ? "isDone" : ""}`}
        title={task.status === "done" ? "Reopen" : "Mark done"}
        aria-label={task.status === "done" ? "Reopen task" : "Mark task done"}
        onClick={() => void onPatch(task.id, { status: task.status === "done" ? "planned" : "done" })}
        onDragStart={(event) => event.preventDefault()}
      >
        <Check size={13} />
      </button>
    </article>
  );
}


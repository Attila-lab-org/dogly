"use client";

// Store client-side di sessione per la demo: tiene le azioni fatte dall'admin
// (righe finte del registro attività, assegnazioni e stati delle segnalazioni,
// note interne) in memoria, così sono visibili nelle altre pagine finché
// la sessione del browser resta aperta. In V1 tutto questo sarà server-side.

import { useSyncExternalStore } from "react";
import type { InternalNote, ReportStatus } from "./types";

export interface SessionAuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  reason: string;
  result: "success" | "denied";
}

interface SessionState {
  audit: SessionAuditEntry[];
  reportStatus: Record<string, ReportStatus>;
  reportAssignee: Record<string, string>;
  reportNotes: Record<string, InternalNote[]>;
  userNotes: Record<string, InternalNote[]>;
}

let state: SessionState = {
  audit: [],
  reportStatus: {},
  reportAssignee: {},
  reportNotes: {},
  userNotes: {},
};

let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function now(): string {
  return new Date().toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function logAction(action: string, target: string, reason: string) {
  state = {
    ...state,
    audit: [
      {
        id: nextId("sess"),
        timestamp: now(),
        actor: "A-TU",
        role: "Tu (demo)",
        action,
        target,
        reason,
        result: "success",
      },
      ...state.audit,
    ],
  };
  emit();
}

export function setReportStatus(id: string, status: ReportStatus) {
  state = { ...state, reportStatus: { ...state.reportStatus, [id]: status } };
  emit();
}

export function setReportAssignee(id: string, assignee: string) {
  state = { ...state, reportAssignee: { ...state.reportAssignee, [id]: assignee } };
  emit();
}

export function addReportNote(id: string, text: string) {
  const note: InternalNote = { id: nextId("nota"), author: "Tu", date: now(), text };
  state = {
    ...state,
    reportNotes: { ...state.reportNotes, [id]: [note, ...(state.reportNotes[id] ?? [])] },
  };
  emit();
}

export function addUserNote(id: string, text: string) {
  const note: InternalNote = { id: nextId("nota"), author: "Tu", date: now(), text };
  state = {
    ...state,
    userNotes: { ...state.userNotes, [id]: [note, ...(state.userNotes[id] ?? [])] },
  };
  emit();
}

export function useSession(): SessionState {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  return state;
}

import { describe, expect, it, vi } from 'vitest';
import type { DashboardInputController, InputKey } from '../src/components/dashboard/types.js';
import { handleDashboardInput } from '../src/components/dashboard/useDashboardInput.js';
import type { Session } from '../src/types/index.js';

const now = new Date().toISOString();

function createSession(id: string): Session {
  return {
    session_id: id,
    cwd: '/tmp',
    initial_cwd: '/tmp',
    status: 'running',
    created_at: now,
    updated_at: now,
  };
}

function createController(
  overrides: Partial<DashboardInputController> = {}
): DashboardInputController {
  const displayOrder = [createSession('s1'), createSession('s2')];
  const projects = [{ id: 'p1', name: 'Project 1', created_at: now }];

  return {
    inputMode: 'normal',
    projects,
    displayOrder,
    selectedIndex: 0,
    selectedProjectIndex: 0,
    selectedAssignIndex: 0,
    setInputMode: vi.fn(),
    setProjectName: vi.fn(),
    setSelectedProjectId: vi.fn(),
    setSelectedAssignIndex: vi.fn(),
    setSelectedSessionKey: vi.fn(),
    focusSessionByIndex: vi.fn(),
    handleReorderProject: vi.fn(),
    handleReorderSession: vi.fn(),
    handleAssignProject: vi.fn(),
    handleDeleteProject: vi.fn(),
    handleNewSession: vi.fn(),
    handleQuickSelect: vi.fn(),
    clearSessions: vi.fn(),
    clearAll: vi.fn(),
    clearProjects: vi.fn(),
    removeSession: vi.fn(),
    exit: vi.fn(),
    ...overrides,
  };
}

function key(overrides: InputKey = {}): InputKey {
  return {
    escape: false,
    upArrow: false,
    downArrow: false,
    return: false,
    ...overrides,
  };
}

describe('handleDashboardInput', () => {
  it('exits on q in normal mode', () => {
    const controller = createController();

    handleDashboardInput('q', key(), controller);

    expect(controller.exit).toHaveBeenCalledTimes(1);
  });

  it('moves selection in manageProjects mode', () => {
    const controller = createController({
      inputMode: 'manageProjects',
      projects: [
        { id: 'p1', name: 'Project 1', created_at: now },
        { id: 'p2', name: 'Project 2', created_at: now },
      ],
      selectedProjectIndex: 0,
    });

    handleDashboardInput('', key({ downArrow: true }), controller);

    expect(controller.setSelectedProjectId).toHaveBeenCalledWith('p2');
  });

  it('confirms clear all in confirmation mode', () => {
    const controller = createController({ inputMode: 'confirmClearAll' });

    handleDashboardInput('y', key(), controller);

    expect(controller.clearAll).toHaveBeenCalledTimes(1);
    expect(controller.setSelectedSessionKey).toHaveBeenCalledWith(null);
    expect(controller.setInputMode).toHaveBeenCalledWith('normal');
  });

  it('assignProject enter selects none option', () => {
    const controller = createController({
      inputMode: 'assignProject',
      selectedAssignIndex: 1,
      projects: [{ id: 'p1', name: 'Project 1', created_at: now }],
    });

    handleDashboardInput('', key({ return: true }), controller);

    expect(controller.handleAssignProject).toHaveBeenCalledWith('0');
  });

  it('deleting the last session selects previous session', () => {
    const controller = createController({ selectedIndex: 1 });

    handleDashboardInput('d', key(), controller);

    expect(controller.removeSession).toHaveBeenCalledWith('s2');
    expect(controller.setSelectedSessionKey).toHaveBeenCalledWith('s1');
  });

  it('quick select forwards key to handler', () => {
    const controller = createController();

    handleDashboardInput('2', key(), controller);

    expect(controller.handleQuickSelect).toHaveBeenCalledWith('2');
  });
});

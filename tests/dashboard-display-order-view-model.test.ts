import { describe, expect, it } from 'vitest';
import { buildDisplayOrderRows } from '../src/components/dashboard/display-order-view-model.js';
import type { DisplayOrderItem, Project, Session } from '../src/types/index.js';

const now = new Date().toISOString();

function createSession(id: string, status: Session['status'] = 'running'): Session {
  return {
    session_id: id,
    cwd: '/tmp',
    initial_cwd: '/tmp',
    status,
    created_at: now,
    updated_at: now,
  };
}

function createProject(id: string, name: string): Project {
  return {
    id,
    name,
    created_at: now,
  };
}

describe('buildDisplayOrderRows', () => {
  it('omits ungrouped header when there are no named projects', () => {
    const storeDisplayOrder: DisplayOrderItem[] = [
      { type: 'project', id: '' },
      { type: 'session', key: 's1' },
    ];
    const sessionMap = new Map<string, Session>([['s1', createSession('s1')]]);

    const result = buildDisplayOrderRows({
      storeDisplayOrder,
      sessionMap,
      projects: [],
      viewportStart: 0,
      maxVisibleSessions: 1,
      selectedIndex: 0,
    });

    expect(result.headerCountInViewport).toBe(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ type: 'session', sessionIndex: 0, isSelected: true });
  });

  it('renders one project header for first visible session in viewport', () => {
    const storeDisplayOrder: DisplayOrderItem[] = [
      { type: 'project', id: 'p1' },
      { type: 'session', key: 's1' },
      { type: 'session', key: 's2' },
      { type: 'project', id: '' },
      { type: 'session', key: 's3' },
    ];
    const sessionMap = new Map<string, Session>([
      ['s1', createSession('s1')],
      ['s2', createSession('s2')],
      ['s3', createSession('s3')],
    ]);

    const result = buildDisplayOrderRows({
      storeDisplayOrder,
      sessionMap,
      projects: [createProject('p1', 'Project One')],
      viewportStart: 1,
      maxVisibleSessions: 1,
      selectedIndex: 1,
    });

    expect(result.headerCountInViewport).toBe(1);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      type: 'project-header',
      projectId: 'p1',
      projectName: 'Project One',
    });
    expect(result.rows[1]).toMatchObject({
      type: 'session',
      sessionIndex: 1,
      isSelected: true,
    });
  });

  it('preserves empty named project headers', () => {
    const storeDisplayOrder: DisplayOrderItem[] = [
      { type: 'project', id: 'p1' },
      { type: 'project', id: '' },
    ];

    const result = buildDisplayOrderRows({
      storeDisplayOrder,
      sessionMap: new Map(),
      projects: [createProject('p1', 'Empty Project')],
      viewportStart: 0,
      maxVisibleSessions: 1,
      selectedIndex: 0,
    });

    expect(result.headerCountInViewport).toBe(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      type: 'project-header',
      projectId: 'p1',
      projectName: 'Empty Project',
    });
  });
});

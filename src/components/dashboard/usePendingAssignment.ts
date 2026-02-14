import { useEffect, useRef, useState } from 'react';
import { PENDING_ASSIGNMENT_TIMEOUT_MS } from '../../constants.js';
import { assignSessionToProjectInOrder } from '../../store/file-store.js';
import type { Session } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import type { PendingAssignment } from './types.js';

export function usePendingAssignment(sessions: Session[]): {
  pendingAssignment: PendingAssignment | null;
  setPendingAssignment: (assignment: PendingAssignment | null) => void;
} {
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
  const pendingAssignmentRef = useRef<PendingAssignment | null>(null);

  useEffect(() => {
    pendingAssignmentRef.current = pendingAssignment;
  }, [pendingAssignment]);

  useEffect(() => {
    const pending = pendingAssignmentRef.current;
    if (!pending) return;

    logger.debug(
      `pendingAssignment check: tty=${pending.tty}, projectId=${pending.projectId}, sessions.length=${sessions.length}`
    );

    if (Date.now() - pending.createdAt > PENDING_ASSIGNMENT_TIMEOUT_MS) {
      logger.debug('pendingAssignment: timeout expired');
      setPendingAssignment(null);
      return;
    }

    const matchingSession = sessions.find((session) => session.tty === pending.tty);
    logger.debug(
      `pendingAssignment: matchingSession=${matchingSession ? matchingSession.session_id : 'not found'}`
    );

    if (matchingSession && pending.projectId) {
      const sessionKey = matchingSession.session_id;
      logger.debug(`pendingAssignment: assigning ${sessionKey} to project ${pending.projectId}`);
      assignSessionToProjectInOrder(sessionKey, pending.projectId);
      setPendingAssignment(null);
    }
  }, [sessions]);

  return { pendingAssignment, setPendingAssignment };
}

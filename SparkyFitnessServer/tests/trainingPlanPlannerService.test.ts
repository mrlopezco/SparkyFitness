import { describe, expect, it } from 'vitest';
import { conversationToPlannerNotes } from '../services/trainingPlanPlannerService.js';

describe('conversationToPlannerNotes', () => {
  it('includes mode and transcript for the planner', () => {
    const notes = conversationToPlannerNotes('adjust', [
      { role: 'user', content: 'Missed Tuesday intervals.' },
      { role: 'assistant', content: 'What dates should we rewrite?' },
    ]);
    expect(notes).toContain('[Planner mode: adjust]');
    expect(notes).toContain('Missed Tuesday intervals');
    expect(notes).toContain('What dates should we rewrite?');
  });

  it('truncates very long threads', () => {
    const long = 'x'.repeat(9000);
    const notes = conversationToPlannerNotes('generate', [
      { role: 'user', content: long },
    ]);
    expect(notes).toContain('earlier turns omitted');
    expect(notes.length).toBeLessThanOrEqual(7800);
  });
});

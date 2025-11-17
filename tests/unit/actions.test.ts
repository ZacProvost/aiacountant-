import { describe, expect, it } from 'vitest';
import { sanitizeActions } from '../../supabase/functions/_shared/actions.ts';

describe('sanitizeActions', () => {
  it('accepts supported actions and normalises confirmation message', () => {
    const actions = sanitizeActions([
      {
        action: 'create_job',
        data: { name: 'Contrat', revenue: 1200 },
        confirmationMessage: '  ok  ',
      },
      {
        action: 'attach_expense',
        data: { expenseId: 'exp-1', jobId: 'job-1' },
      },
    ]);

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      action: 'create_job',
      data: { name: 'Contrat', revenue: 1200 },
      confirmationMessage: 'ok',
    });
    expect(actions[1]).toMatchObject({
      action: 'attach_expense',
      data: { expenseId: 'exp-1', jobId: 'job-1' },
    });
  });

  it('throws for unsupported actions', () => {
    expect(() =>
      sanitizeActions([
        {
          action: 'unsupported',
        },
      ]),
    ).toThrowError(/non prise en charge/i);
  });
});






import { renderMessage } from './render-message';

describe('renderMessage', () => {
  it('substitui os campos do contato', () => {
    expect(
      renderMessage('Oi {{name}} {{phone}} {{externalId}}', {
        name: 'Ana',
        phone: '+5511999990001',
        externalId: null,
      }),
    ).toBe('Oi Ana +5511999990001 ');
  });
});

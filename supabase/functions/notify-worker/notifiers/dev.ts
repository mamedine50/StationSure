import type { MessageSortant, Notifier, ResultatEnvoi } from '../notifier.ts';

/** Mode test (défaut) : aucun envoi réel. Le message est marqué délivré ; la page /dev/messages lit la file. */
export class DevNotifier implements Notifier {
  readonly nom = 'dev';
  readonly journal: MessageSortant[] = [];

  constructor(
    private readonly log: (message: string, extra?: Record<string, unknown>) => void = () => {},
  ) {}

  envoyer(message: MessageSortant): Promise<ResultatEnvoi> {
    this.journal.push(message);
    this.log('message (mode test, non envoyé)', {
      id: message.id,
      to: message.to_phone,
      template: message.template,
    });
    return Promise.resolve({ ok: true, providerMessageId: `dev-${message.id}`, delivered: true });
  }
}
